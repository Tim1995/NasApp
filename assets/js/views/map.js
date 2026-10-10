/* ============================================================
 * 小脚丫旅行记 · 足迹地图（全部行程）
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var Data = BF.Data;
  var Auth = BF.Auth;
  var UI = BF.UI;

  BF.Views.map = {
    title: '足迹地图',
    subtitle: function () {
      var s = Data.stats();
      if (!s.cityCount) return '还没有带位置的照片';
      var road = Data._roadCache;
      var km = road && road.hasRoad ? road.distanceKm : s.distanceKm;
      return s.cityCount + ' 座城市 · ' + BF.Geo.fmtDistance(km) + (road && road.hasRoad ? ' 实际道路' : '');
    },

    actions: function () {
      return [
        U.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: U.adaptive('▶ 播放路线', '▶'),
          title: '播放路线',
          onclick: function () {
            if (BF.App._mapPlay) BF.App._mapPlay();
          }
        }),
        U.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: U.adaptive('📍 我的位置', '📍'),
          title: '我的位置',
          onclick: function () {
            if (BF.App._mapLocate) BF.App._mapLocate();
          }
        })
      ];
    },

    render: function (host) {
      var located = Data.allLocatedStops();
      var mapHost = U.el('div', { class: 'map-canvas map-canvas--tall' });

      if (!located.length) {
        host.appendChild(
          UI.empty({
            icon: '🗺️',
            title: '地图上还没有脚印',
            text: '在站点里点「在地图上选点」，或者上传带 GPS 信息的旅行照片，这里就会亮起来。',
            actions: [
              U.el('button', { class: 'btn btn--ghost', text: '前往旅行相册', onclick: function () { BF.App.go('#/trips'); } })
            ]
          })
        );
        return;
      }

      var hidden = {};
      var ctrl = null;
      var runner = null;

      var overlay = U.el('div', { class: 'map-overlay' });
      var panel = U.el('div', { class: 'map-panel' });
      var wrap = U.el('div', { class: 'map-wrap' }, [mapHost, overlay, panel]);

      /* ---------- 顶部按钮 ---------- */
      var yearState = 'all';
      function paintOverlay() {
        U.render(overlay, []);
        var years = ['all'].concat(Data.stats().years.slice().reverse());
        years.forEach(function (y) {
          overlay.appendChild(
            U.el('button', {
              class: 'map-badge' + (yearState === y ? ' is-on' : ''),
              style: yearState === y ? { background: 'var(--primary)', color: '#fff', borderColor: 'transparent' } : {},
              text: y === 'all' ? '全部年份' : y + ' 年',
              onclick: function () {
                yearState = y;
                paintOverlay();
                paintMap();
              }
            })
          );
        });
        overlay.appendChild(
          U.el('button', {
            class: 'map-badge',
            text: '🛰 切换图层',
            onclick: function () {
              if (!ctrl || ctrl.fallback) return U.toast('当前是简易视图，无法切换图层');
              var order = ['amap', 'amapSat', 'osm'];
              var idx = order.indexOf(ctrl.provider);
              var next = order[(idx + 1) % order.length];
              ctrl.setProvider(next);
              U.toast('已切换到 ' + BF.TILES[next].label);
            }
          })
        );
      }

      /* ---------- 图例 ---------- */
      function paintPanel() {
        U.render(panel, []);
        panel.appendChild(U.el('div', { class: 'map-panel__title', text: '旅程图例' }));

        Data.trips.forEach(function (trip, i) {
          var pts = (trip.stops || []).filter(function (s) {
            return BF.Geo.valid(s.lat, s.lng);
          });
          if (!pts.length) return;
          var row = U.el('div', { class: 'map-legend', title: '点击查看这条路线', onclick: function () {
            if (hidden[trip.id]) {
              hidden[trip.id] = false;
            }
            focusTrip(trip);
          } });
          row.appendChild(U.el('span', { class: 'map-legend__dot', style: { background: BF.palette(i) } }));
          row.appendChild(U.el('span', { class: 'map-legend__name', text: trip.title }));
          row.appendChild(U.el('span', { class: 'map-legend__num', text: pts.length + '站' }));
          row.appendChild(
            U.el('button', {
              class: 'icon-btn',
              style: { width: '24px', height: '24px', fontSize: '12px' },
              title: hidden[trip.id] ? '显示' : '隐藏',
              text: hidden[trip.id] ? '◌' : '●',
              onclick: function (e) {
                e.stopPropagation();
                hidden[trip.id] = !hidden[trip.id];
                paintPanel();
                paintMap();
              }
            })
          );
          panel.appendChild(row);
        });

        var hasHome = !!Data.home();
        panel.appendChild(
          U.el('div', { class: 'map-legend-hint' }, [
            U.el('span', { class: 'map-legend-solid' }),
            U.el('span', { text: hasHome ? '彩色实线 = 从家出发的实际驾车路线' : '彩色线 = 一段旅程内的路线' })
          ])
        );
        panel.appendChild(
          U.el('div', { class: 'map-legend-hint' }, [
            U.el('span', { class: 'map-legend-dash' }),
            U.el('span', {
              text: hasHome ? '浅色虚线 = 正在计算真实路线' : '灰色虚线 = 两段旅程之间的先后顺序'
            })
          ])
        );
        panel.appendChild(
          U.el('div', {
            class: 'small muted mt-12',
            text: hasHome
              ? '🏠 是家庭地址，所有路线都从它出发；站点编号按时间先后排。'
              : '站点编号按时间先后排。到「设置 → 家庭地址」设好家在哪，里程就能按真实驾车路线算。'
          })
        );
      }

      /* ---------- 绘制 ---------- */

      var home = Data.home();
      var routeHandles = {}; // tripId -> { handle, points }
      var roadPending = {};

      function tripVisible(trip) {
        if (hidden[trip.id]) return false;
        if (yearState !== 'all' && String(trip.startDate || '').slice(0, 4) !== yearState) return false;
        return true;
      }

      /** 当前应该纳入视野的所有坐标（含已算出的真实道路） */
      function collectFitPoints() {
        var out = [];
        if (home) out.push([home.lat, home.lng]);
        Data.trips.forEach(function (trip) {
          if (!tripVisible(trip)) return;
          (trip.stops || []).forEach(function (s) {
            if (BF.Geo.valid(s.lat, s.lng)) out.push([s.lat, s.lng]);
          });
          var pts = Data.tripRoutePoints(trip);
          if (pts.length < 2) return;
          var known = BF.Router.cached(pts);
          out = out.concat(known && known.geometry && known.geometry.length > 1 ? known.geometry : pts);
        });
        return out;
      }

      // 真实道路会比直线凸出去不少，算完要重新框一下视野；
      // 多个行程陆续算完时合并成一次，避免地图来回跳。
      var refitLater = U.debounce(function () {
        if (!ctrl) return;
        var pts = collectFitPoints();
        if (pts.length) ctrl.fit(pts, [50, 50]);
      }, 420);

      /** 异步取真实道路，回来后就地替换那一条线 */
      function fetchRoad(tripId) {
        var item = routeHandles[tripId];
        if (!item || roadPending[tripId]) return;
        roadPending[tripId] = true;

        BF.Router.route(item.points)
          .then(function (res) {
            delete roadPending[tripId];
            var cur = routeHandles[tripId];
            if (!cur || !cur.handle || !ctrl) return;
            if (!res || !res.geometry || res.geometry.length < 2) return;
            cur.handle.setPoints(res.geometry);
            if (BF.Router.isRoad(res)) cur.handle.solid();
            refitLater();
            BF.App.refreshSubtitle();
          })
          .catch(function () {
            delete roadPending[tripId];
          });
      }

      function paintMap() {
        if (!ctrl) return;
        if (runner) {
          runner.stop();
          runner = null;
        }
        ctrl.clear();
        routeHandles = {};
        roadPending = {};
        home = Data.home();

        // 站点编号按「时间顺序」全局排（第 1 个去的、第 2 个去的…），
        // 而不是每个行程内部各自从 1 开始，否则多个行程时会重号。
        var orderMap = {};
        Data.chronologicalStops().forEach(function (item) {
          orderMap[item.stop.id] = item.index + 1;
        });

        // 家庭地址：所有旅程的起点
        if (home) {
          ctrl.addPin({
            lat: home.lat,
            lng: home.lng,
            label: '家',
            color: '#5f9380',
            size: 30,
            title: '家庭地址',
            html:
              '<div class="pop"><div class="pop__body"><div class="pop__title">🏠 ' +
              U.escapeHtml(home.name || '家') +
              '</div><div class="pop__meta">' +
              U.escapeHtml([home.city, home.province].filter(Boolean).join(' ')) +
              '</div></div></div>'
          });
        }

        Data.trips.forEach(function (trip, i) {
          if (!tripVisible(trip)) return;
          var color = BF.palette(i);

          (trip.stops || []).forEach(function (stop, si) {
            if (!BF.Geo.valid(stop.lat, stop.lng)) return;
            var photo = (stop.photos || [])[0];
            var html =
              '<div class="pop">' +
              (photo ? '<div class="pop__img"></div>' : '') +
              '<div class="pop__body"><div class="pop__title">' +
              U.escapeHtml(stop.name || '未命名站点') +
              '</div><div class="pop__meta">' +
              U.escapeHtml((stop.city || '') + (stop.arriveDate ? ' · ' + U.fmtDate(stop.arriveDate) : '')) +
              '</div><div class="pop__meta" style="margin-top:4px">' +
              U.escapeHtml(trip.title) +
              '</div>' +
              (stop.note ? '<div class="pop__note">' + U.escapeHtml(stop.note) + '</div>' : '') +
              '</div></div>';
            ctrl.addPin({
              lat: stop.lat,
              lng: stop.lng,
              label: String(orderMap[stop.id] || si + 1),
              color: color,
              title: stop.name,
              html: html,
              onClick: function () {
                setTimeout(function () {
                  var host2 = U.$('.leaflet-popup .pop__img');
                  if (host2 && photo && !host2.firstChild) {
                    var im = U.el('img', { alt: '' });
                    host2.appendChild(im);
                    Data.fillImage(im, photo, 'thumb');
                  }
                }, 40);
              }
            });
          });

          // 这一段旅程的行驶路线：有家庭地址就是「家 → 各站点」
          var routePts = Data.tripRoutePoints(trip);
          if (routePts.length < 2) return;

          var known = BF.Router.cached(routePts);
          var geom = known && known.geometry && known.geometry.length > 1 ? known.geometry : routePts;
          var handle = ctrl.drawRoute(geom, {
            color: color,
            weight: 3,
            opacity: known ? 0.88 : 0.45,
            dashed: !known // 还没算出真实路线时先用虚线，表示这是占位
          });
          if (!handle) return;
          routeHandles[trip.id] = { handle: handle, points: routePts };
          if (!known) fetchRoad(trip.id);
        });

        // 没设家庭地址时，用灰虚线补上「两段旅程之间」的先后顺序
        if (!home) {
          var chrono = Data.chronologicalStops().filter(function (item) {
            return tripVisible(item.trip);
          });
          for (var ci = 1; ci < chrono.length; ci++) {
            var prevStop = chrono[ci - 1];
            var curStop = chrono[ci];
            if (prevStop.trip.id === curStop.trip.id) continue;
            ctrl.drawRoute(
              [
                [prevStop.stop.lat, prevStop.stop.lng],
                [curStop.stop.lat, curStop.stop.lng]
              ],
              { color: '#9c8a78', weight: 2, dashed: true, opacity: 0.9 }
            );
          }
        }

        var fitPts = collectFitPoints();
        if (fitPts.length) ctrl.fit(fitPts, [50, 50]);
      }

      /**
       * 按真实里程决定播多久：大约每公里 45 毫秒，
       * 单段控制在 3.2 ~ 12 秒，短途看得清、长途不至于等到花儿都谢了。
       */
      function durationForKm(km) {
        if (!km || km < 0.5) return 3200;
        return Math.min(12000, Math.max(3200, km * 45));
      }

      function focusTrip(trip) {
        if (!ctrl) return;
        paintMap();

        var pts = Data.tripRoutePoints(trip);
        if (pts.length < 2) {
          // 只有一个点，就单纯聚焦过去
          var solo = (trip.stops || []).filter(function (s) {
            return BF.Geo.valid(s.lat, s.lng);
          });
          if (solo.length) ctrl.fit([[solo[0].lat, solo[0].lng]], [70, 70]);
          return;
        }
        if (runner) runner.stop();

        BF.Router.route(pts).then(function (res) {
          if (!ctrl) return;
          ctrl.fit(res.geometry, [60, 60]);
          runner = ctrl.playRoute(res.geometry, {
            color: BF.palette(Data.trips.indexOf(trip)),
            totalDuration: durationForKm(res.distanceKm),
            guide: true,
            trail: true,
            onStop: function () {
              runner = null;
            }
          });
        });
      }

      function playAll() {
        if (!ctrl) return;
        paintMap();

        // 一趟一趟地走：每段旅程都是一条「从家出发」的完整路线
        var segments = Data.trips
          .filter(tripVisible)
          .map(function (trip) {
            return { trip: trip, points: Data.tripRoutePoints(trip) };
          })
          .filter(function (seg) {
            return seg.points.length >= 2;
          });

        if (!segments.length) {
          U.toast(
            Data.home()
              ? '这段区间里还没有能连成路线的站点'
              : '至少要有两个位置点才能回放。到「设置 → 家庭地址」设好家在哪，每段旅程就能从家出发。'
          );
          return;
        }
        if (runner) runner.stop();

        var idx = 0;
        function playNext() {
          var seg = segments[idx++];
          if (!seg) {
            runner = null;
            U.toast('回放结束', 'success');
            return;
          }
          BF.Router.route(seg.points).then(function (res) {
            if (!ctrl) return;
            runner = ctrl.playRoute(res.geometry, {
              color: BF.palette(Data.trips.indexOf(seg.trip)),
              totalDuration: durationForKm(res.distanceKm),
              guide: true,
              trail: true,
              onStop: playNext
            });
          });
        }

        U.toast('正在回放 ' + segments.length + ' 段旅程…');
        playNext();
      }

      host.appendChild(wrap);

      BF.App._mapPlay = playAll;
      BF.App._mapLocate = function () {
        if (!ctrl) return;
        ctrl.locate().catch(function (err) {
          U.toast(err.message || '定位失败', 'error');
        });
      };

      paintOverlay();
      paintPanel();

      setTimeout(function () {
        if (!mapHost.isConnected) return;
        ctrl = BF.createMap(mapHost, { onPick: null });
        paintMap();
        ctrl.invalidate();
      }, 80);

      return {
        cleanup: function () {
          BF.App._mapPlay = null;
          BF.App._mapLocate = null;
          if (runner) runner.stop();
          if (ctrl) ctrl.destroy();
        }
      };
    }
  };

})(window);
