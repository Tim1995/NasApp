/* ============================================================
 * 小脚丫旅行记 · 地图组件
 * 基于本地 Leaflet。默认使用高德瓦片（国内速度好），
 * 内部统一以 WGS-84 存储坐标，显示时自动转换为 GCJ-02，
 * 反向选点则从 GCJ-02 还原为 WGS-84。
 * 若 Leaflet 未能加载（完全离线），自动退化为内置的示意地图。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var Geo = BF.Geo;
  var U = BF.U;

  var TILES = {
    amap: {
      label: '高德地图',
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      subdomains: '1234',
      maxZoom: 18,
      gcj: true
    },
    amapSat: {
      label: '卫星影像',
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      subdomains: '1234',
      maxZoom: 18,
      gcj: true
    },
    osm: {
      label: '开放街图',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      gcj: false
    }
  };

  BF.TILES = TILES;

  /* 一组适合路线区分的颜色 */
  var PALETTE = ['#d9663f', '#5f9380', '#4f86b8', '#d9a343', '#9b6bb0', '#c9503f', '#3f9a9a', '#b07a41'];
  BF.palette = function (i) {
    return PALETTE[i % PALETTE.length];
  };

  BF.hasLeaflet = function () {
    return typeof global.L !== 'undefined' && global.L && global.L.map;
  };

  /* ============================================================
   * 控制器
   * ============================================================ */

  function MapController(container, opts) {
    this.container = container;
    this.opts = opts || {};
    this.provider = this.opts.provider || (navigator.onLine === false ? 'osm' : 'amap');
    this.markers = [];
    this.layers = [];
    this.pendingPins = [];
    this.pendingRoutes = [];
    this.destroyed = false;
    this.fallback = !BF.hasLeaflet();
    this.init();
  }

  MapController.prototype.crsIsGcj = function () {
    var t = TILES[this.provider];
    return !!(t && t.gcj);
  };

  /** WGS84 -> 展示坐标 [lat, lng] */
  MapController.prototype.toDisplay = function (lat, lng) {
    if (!this.crsIsGcj()) return [lat, lng];
    var p = Geo.wgs84ToGcj02(lng, lat);
    return [p[1], p[0]];
  };

  /** 展示坐标 -> WGS84 [lat, lng] */
  MapController.prototype.fromDisplay = function (lat, lng) {
    if (!this.crsIsGcj()) return [lat, lng];
    var p = Geo.gcj02ToWgs84(lng, lat);
    return [p[1], p[0]];
  };

  MapController.prototype.init = function () {
    var self = this;
    if (this.fallback) {
      this.container.innerHTML = '';
      this.container.classList.add('map-canvas--fallback');
      this.svgHost = U.el('div', { class: 'map-fallback' });
      this.container.appendChild(this.svgHost);
      this.container.appendChild(
        U.el('div', {
          class: 'map-badge',
          style: { position: 'absolute', left: '14px', bottom: '14px', zIndex: 500 },
          text: '简易示意视图（未连接到地图服务）'
        })
      );
      return;
    }

    var L = global.L;
    this.map = L.map(this.container, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      worldCopyJump: true
    }).setView([35.86, 104.19], 4);

    // 缩放按钮放在右下角，避免遮挡左上角的筛选按钮
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.tileLayer = this.buildTileLayer();
    this.tileLayer.addTo(this.map);

    if (this.opts.attribution !== false) {
      this.map.attributionControl = L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(this.map);
    }

    this.map.on('click', function (e) {
      if (typeof self.opts.onPick === 'function') {
        var w = self.fromDisplay(e.latlng.lat, e.latlng.lng);
        self.opts.onPick(w[0], w[1]);
      }
    });
  };

  MapController.prototype.buildTileLayer = function () {
    var L = global.L;
    var t = TILES[this.provider] || TILES.amap;
    return L.tileLayer(t.url, {
      subdomains: t.subdomains || 'abc',
      maxZoom: t.maxZoom,
      detectRetina: false,
      crossOrigin: true
    });
  };

  MapController.prototype.setProvider = function (name) {
    if (!TILES[name] || name === this.provider) return;
    this.provider = name;
    if (this.fallback) return;
    if (this.tileLayer) this.map.removeLayer(this.tileLayer);
    this.tileLayer = this.buildTileLayer();
    this.tileLayer.addTo(this.map);
    this.redraw();
  };

  MapController.prototype.clear = function () {
    // 重绘前先把正在播放的动画停掉，避免图层残留
    if (this._playback) {
      try {
        this._playback.stop();
      } catch (e) {}
      this._playback = null;
    }
    this.pendingPins = [];
    this.pendingRoutes = [];
    if (this.fallback) {
      if (this.svgHost) this.svgHost.innerHTML = '';
      return;
    }
    var self = this;
    this.layers.forEach(function (l) {
      try {
        self.map.removeLayer(l);
      } catch (e) {}
    });
    this.layers = [];
  };

  MapController.prototype.redraw = function () {
    var pins = this.pendingPins.slice();
    var routes = this.pendingRoutes.slice();
    this.clear();
    routes.forEach(function (r) {
      this.drawRoute(r.points, r.options);
    }, this);
    pins.forEach(function (p) {
      this.addPin(p);
    }, this);
  };

  /* ------------------------- 标记 ------------------------- */

  /**
   * addPin({ lat, lng, color, label, title, html, size, pulse, onClick })
   */
  MapController.prototype.addPin = function (cfg) {
    this.pendingPins.push(cfg);
    var d = this.toDisplay(cfg.lat, cfg.lng);
    var lat = d[0];
    var lng = d[1];

    if (this.fallback) {
      return this;
    }

    var L = global.L;
    var color = cfg.color || '#d9663f';
    var size = cfg.size || 26;
    var label = cfg.label === undefined ? '' : String(cfg.label);
    var icon = L.divIcon({
      className: 'maplib-pin',
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size + 4],
      html:
        '<div class="pin' +
        (cfg.pulse ? ' pin--pulse' : '') +
        '" style="background:' +
        color +
        ';color:' +
        color +
        ';width:' +
        size +
        'px;height:' +
        size +
        'px"><span>' +
        U.escapeHtml(label) +
        '</span></div>'
    });
    var marker = L.marker([lat, lng], { icon: icon, title: cfg.title || '' });
    if (cfg.html) marker.bindPopup(cfg.html, { closeButton: true, maxWidth: 260 });
    if (typeof cfg.onClick === 'function') {
      marker.on('click', function () {
        cfg.onClick(cfg);
      });
    }
    marker.addTo(this.map);
    this.layers.push(marker);
    return this;
  };

  /* ------------------------- 路线 ------------------------- */

  /**
   * drawRoute([[lat,lng],...], { color, dashed, weight, animate })
   * 坐标为 WGS-84
   */
  MapController.prototype.drawRoute = function (points, options) {
    options = options || {};
    this.pendingRoutes.push({ points: points, options: options });
    if (this.fallback || !points || points.length < 2) return null;
    var L = global.L;
    var self = this;

    function toDisplay(list) {
      return list.map(function (p) {
        var d = self.toDisplay(p[0], p[1]);
        return [d[0], d[1]];
      });
    }

    var line = L.polyline(toDisplay(points), {
      color: options.color || '#d9663f',
      weight: options.weight || 3,
      opacity: options.opacity === undefined ? 0.88 : options.opacity,
      dashArray: options.dashed ? '7 8' : null,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);
    this.layers.push(line);

    if (options.animate) this.animateLine(line);

    // 返回句柄，方便拿到真实道路后原地替换几何，而不是整张图重画
    return {
      layer: line,
      setPoints: function (list) {
        if (!list || list.length < 2) return;
        line.setLatLngs(toDisplay(list));
      },
      solid: function () {
        if (line.setStyle) line.setStyle({ dashArray: null, opacity: 0.88 });
      },
      remove: function () {
        try {
          self.map.removeLayer(line);
        } catch (e) {}
      }
    };
  };

  MapController.prototype.animateLine = function (line) {
    var el = line.getElement ? line.getElement() : null;
    if (!el) return;
    var len = el.getTotalLength ? el.getTotalLength() : 0;
    if (!len) return;
    el.style.strokeDasharray = len + ' ' + len;
    el.style.strokeDashoffset = len;
    el.style.transition = 'stroke-dashoffset 2.4s cubic-bezier(.3,.7,.35,1)';
    requestAnimationFrame(function () {
      el.style.strokeDashoffset = 0;
    });
    setTimeout(function () {
      el.style.strokeDasharray = '';
      el.style.strokeDashoffset = '';
    }, 2600);
  };

  /* ------------------------- 视野 ------------------------- */

  MapController.prototype.fit = function (points, padding) {
    if (this.fallback) {
      this.renderFallback();
      return this;
    }
    var L = global.L;
    var self = this;
    var pts = (points || []).filter(function (p) {
      return Geo.valid(p[0], p[1]);
    });
    if (!pts.length) return this;
    if (pts.length === 1) {
      var d = self.toDisplay(pts[0][0], pts[0][1]);
      this.map.setView([d[0], d[1]], this.opts.singleZoom || 13);
      return this;
    }
    var bounds = L.latLngBounds(
      pts.map(function (p) {
        var d = self.toDisplay(p[0], p[1]);
        return [d[0], d[1]];
      })
    );
    this.map.fitBounds(bounds, { padding: padding || [60, 60], maxZoom: this.opts.maxFitZoom || 13 });
    return this;
  };

  MapController.prototype.locate = function () {
    var self = this;
    if (this.fallback || !navigator.geolocation) return Promise.reject(new Error('无法定位'));
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          var d = self.toDisplay(lat, lng);
          self.map.setView([d[0], d[1]], 14);
          resolve({ lat: lat, lng: lng });
        },
        function () {
          reject(new Error('定位失败，请检查浏览器定位权限'));
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  };

  /* ------------------------- 轨迹回放 ------------------------- */

  /**
   * 沿路线播放小脚丫动画
   * points: [[lat,lng],...]（WGS84）
   * opts: {
   *   color, segDuration（每段毫秒）, guide（是否先画完整路径虚线）,
   *   trail（是否画出走过的轨迹）, onProgress, onStop
   * }
   * 用时间做基准而不是每帧固定步长，这样不同刷新率的设备速度一致、也看得清。
   */
  MapController.prototype.playRoute = function (points, opts) {
    opts = opts || {};
    var self = this;
    if (this.fallback || !points || points.length < 2) return { stop: function () {} };

    var L = global.L;
    var color = opts.color || '#d9663f';
    var display = points.map(function (p) {
      var d = self.toDisplay(p[0], p[1]);
      return [d[0], d[1]];
    });

    var owned = []; // 本次播放创建的所有图层

    // ① 完整路径：淡色虚线，先让用户看清要走哪儿
    if (opts.guide !== false) {
      var guide = L.polyline(display, {
        color: color,
        weight: 3,
        opacity: 0.5,
        dashArray: '2 8',
        lineCap: 'round'
      }).addTo(this.map);
      owned.push(guide);
    }

    // ② 已走过的轨迹：实线，随小脚丫一起长出来
    var trailLine = null;
    if (opts.trail !== false) {
      trailLine = L.polyline([display[0]], {
        color: color,
        weight: 4,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);
      owned.push(trailLine);
    }

    // ③ 小脚丫
    var icon = L.divIcon({
      className: 'maplib-pin',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      html: '<div style="font-size:26px;line-height:34px;text-align:center">👣</div>'
    });
    var runner = L.marker(display[0], { icon: icon, zIndexOffset: 1000 }).addTo(this.map);
    owned.push(runner);

    owned.forEach(function (l) {
      self.layers.push(l);
    });

    // 段时长：可以直接给每段毫秒数，也可以给「整条路线的总时长」，
    // 后者按几何点均分，方便用公里数反推该走多快。
    var segCount = Math.max(1, display.length - 1);
    var segDuration = opts.totalDuration
      ? Math.max(30, opts.totalDuration / segCount)
      : opts.segDuration || 1300;
    var travelled = [display[0]];
    var lastTrailAt = 0;
    var startTime = null;
    var raf = null;
    var stopped = false;

    function cleanup(delay) {
      setTimeout(function () {
        if (!self.map || self.destroyed) return;
        owned.forEach(function (l) {
          try {
            self.map.removeLayer(l);
          } catch (e) {}
        });
      }, delay);
    }

    function frame(now) {
      if (stopped) return;
      if (startTime === null) startTime = now;

      var total = (now - startTime) / segDuration; // 浮点段位置，1.0 = 走过一整段
      var segIndex = Math.floor(total);
      var t = total - segIndex;

      if (segIndex >= display.length - 1) {
        // 到终点了
        runner.setLatLng(display[display.length - 1]);
        if (trailLine) {
          travelled.push(display[display.length - 1]);
          trailLine.setLatLngs(travelled);
        }
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        cleanup(4200); // 停留一会儿让人看清完整轨迹
        if (typeof opts.onStop === 'function') opts.onStop();
        return;
      }

      var a = display[segIndex];
      var b = display[segIndex + 1];
      var lat = a[0] + (b[0] - a[0]) * t;
      var lng = a[1] + (b[1] - a[1]) * t;
      runner.setLatLng([lat, lng]);

      if (trailLine && now - lastTrailAt > 55) {
        lastTrailAt = now;
        travelled.push([lat, lng]);
        trailLine.setLatLngs(travelled);
      }

      if (typeof opts.onProgress === 'function') opts.onProgress(segIndex, display.length - 1, t);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    var handle = {
      stop: function () {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        if (!self.map) return;
        owned.forEach(function (l) {
          try {
            self.map.removeLayer(l);
          } catch (e) {}
        });
      }
    };
    this._playback = handle;
    return handle;
  };

  /* ------------------------- 离线示意视图 ------------------------- */

  MapController.prototype.renderFallback = function () {
    if (!this.fallback) return;
    var host = this.svgHost;
    var pins = this.pendingPins.filter(function (p) {
      return Geo.valid(p.lat, p.lng);
    });
    var routes = this.pendingRoutes;
    var W = 1000;
    var H = 620;

    if (!pins.length) {
      U.render(host, U.el('div', { class: 'flex-center', style: { height: '100%', justifyContent: 'center', color: 'var(--ink-3)' } }, '还没有带位置的照片'));
      return;
    }

    var lats = pins.map(function (p) {
      return p.lat;
    });
    var lngs = pins.map(function (p) {
      return p.lng;
    });
    var minLat = Math.min.apply(null, lats);
    var maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs);
    var maxLng = Math.max.apply(null, lngs);
    if (maxLat - minLat < 0.02) {
      minLat -= 0.01;
      maxLat += 0.01;
    }
    if (maxLng - minLng < 0.02) {
      minLng -= 0.01;
      maxLng += 0.01;
    }

    function project(lat, lng) {
      var x = ((lng - minLng) / (maxLng - minLng)) * (W - 140) + 70;
      var y = H - (((lat - minLat) / (maxLat - minLat)) * (H - 140) + 70);
      return [x, y];
    }

    var padding = 60;
    var parts = [];
    parts.push(
      '<defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0v60" fill="none" stroke="#dfe8df" stroke-width="1"/></pattern></defs>'
    );
    parts.push('<rect width="' + W + '" height="' + H + '" fill="url(#grid)"/>');

    routes.forEach(function (r) {
      var d = (r.points || [])
        .filter(function (p) {
          return Geo.valid(p[0], p[1]);
        })
        .map(function (p, i) {
          var xy = project(p[0], p[1]);
          return (i === 0 ? 'M' : 'L') + xy[0].toFixed(1) + ' ' + xy[1].toFixed(1);
        })
        .join(' ');
      if (d) {
        parts.push(
          '<path d="' + d + '" fill="none" stroke="' + (r.options.color || '#d9663f') + '" stroke-width="3" stroke-linecap="round" opacity="0.85" stroke-dasharray="8 7"/>'
        );
      }
    });

    pins.forEach(function (p) {
      var xy = project(p.lat, p.lng);
      var color = p.color || '#d9663f';
      parts.push('<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="11" fill="' + color + '" opacity="0.18"/>');
      parts.push('<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="5.5" fill="' + color + '" stroke="#fff" stroke-width="2"/>');
      if (p.label !== undefined && p.label !== '') {
        parts.push(
          '<text x="' + xy[0] + '" y="' + (xy[1] - 15) + '" text-anchor="middle" font-size="14" fill="#6d6459" font-family="system-ui">' +
            U.escapeHtml(String(p.label)) +
            '</text>'
        );
      }
    });

    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + parts.join('') + '</svg>';
  };

  MapController.prototype.destroy = function () {
    this.destroyed = true;
    try {
      if (this.map) this.map.remove();
    } catch (e) {}
    this.map = null;
    this.layers = [];
  };

  MapController.prototype.invalidate = function () {
    if (this.map) setTimeout(this.map.invalidateSize.bind(this.map), 60);
  };

  /* ------------------------- 工厂 ------------------------- */

  BF.createMap = function (container, opts) {
    return new MapController(container, opts);
  };

})(window);
