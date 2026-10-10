/* ============================================================
 * 小脚丫旅行记 · 旅行相册 / 行程详情 / 编辑 / 地图选点
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var Data = BF.Data;
  var Auth = BF.Auth;
  var UI = BF.UI;

  var STOP_KINDS = [
    { value: 'landmark', label: '标志建筑 / 大门', icon: '🏛️' },
    { value: 'scenery', label: '风景', icon: '🏞️' },
    { value: 'portrait', label: '合影留念', icon: '👨‍👩‍👧' },
    { value: 'food', label: '吃吃喝喝', icon: '🍜' },
    { value: 'transport', label: '在路上', icon: '🚄' }
  ];
  BF.STOP_KINDS = STOP_KINDS;

  function kindOf(v) {
    for (var i = 0; i < STOP_KINDS.length; i++) if (STOP_KINDS[i].value === v) return STOP_KINDS[i];
    return STOP_KINDS[0];
  }

  /* ============================================================
   * 一、行程列表
   * ============================================================ */

  BF.Views.trips = {
    title: '旅行相册',
    subtitle: function () {
      return Data.trips.length + ' 段旅程 · ' + Data.stats().photoCount + ' 张照片';
    },

    actions: function () {
      return Auth.canEdit()
        ? [
            U.el('button', {
              class: 'btn btn--primary btn--sm',
              text: U.adaptive('＋ 新建旅程', '＋ 新建'),
              onclick: function () {
                BF.TripEditor.create();
              }
            })
          ]
        : [];
    },

    render: function (host) {
      if (!Data.trips.length) {
        host.appendChild(
          UI.empty({
            icon: '🧳',
            title: '相册还是空的',
            text: '把手机里的旅行照片导进来，小脚丫的路线就会自动长出来。',
            actions: Auth.canEdit()
              ? [
                  U.el('button', { class: 'btn btn--primary', text: '新建第一段旅程', onclick: function () { BF.TripEditor.create(); } }),
                  U.el('button', { class: 'btn btn--ghost', text: '载入示例数据', onclick: function () { BF.Demo.seed().then(BF.App.refresh); } })
                ]
              : []
          })
        );
        return;
      }

      var state = { year: 'all', keyword: '' };
      var bar = U.el('div', { class: 'flex-between wrap gap-10 mb-16' });
      var gridHost = U.el('div');

      var years = ['all'].concat(
        Data.trips
          .map(function (t) {
            return String(t.startDate || '').slice(0, 4);
          })
          .filter(Boolean)
          .filter(function (y, i, arr) {
            return arr.indexOf(y) === i;
          })
          .sort()
          .reverse()
      );

      var chips = U.el('div', { class: 'flex gap-6 wrap' });
      years.forEach(function (y) {
        var chip = U.el('button', {
          class: 'chip' + (y === 'all' ? ' chip--primary' : ''),
          style: { cursor: 'pointer', border: 'none', padding: '5px 13px', fontSize: '12.5px' },
          text: y === 'all' ? '全部年份' : y + ' 年',
          onclick: function () {
            state.year = y;
            U.$$('.chip', chips).forEach(function (c) {
              c.classList.remove('chip--primary');
            });
            chip.classList.add('chip--primary');
            paint();
          }
        });
        chips.appendChild(chip);
      });

      var search = U.input({
        placeholder: '搜索地名或标题…',
        style: { maxWidth: '220px' },
        oninput: function () {
          state.keyword = search.value.trim();
          paint();
        }
      });

      U.render(bar, [chips, U.el('div', { class: 'flex gap-10' }, [search])]);

      function filtered() {
        return Data.trips.filter(function (t) {
          if (state.year !== 'all' && String(t.startDate || '').indexOf(state.year) !== 0) return false;
          if (!state.keyword) return true;
          var hay = [t.title, t.summary].concat((t.stops || []).map(function (s) {
            return s.name + ' ' + s.city + ' ' + s.province;
          })).join(' ').toLowerCase();
          return hay.indexOf(state.keyword.toLowerCase()) >= 0;
        });
      }

      function paint() {
        var list = filtered();
        if (!list.length) {
          U.render(gridHost, UI.empty({ icon: '🔍', title: '没有找到相关的旅行', text: '换个关键词试试。' }));
          return;
        }
        U.render(gridHost, U.el('div', { class: 'grid grid--trips' }, list.map(function (t) {
          return UI.tripCard(t);
        })));
      }

      paint();
      host.appendChild(bar);
      host.appendChild(gridHost);

      // 真实道路里程要联网算，算完再刷一次，卡片上的公里数才是准的
      if (Data.home()) {
        Data.roadStats().then(function () {
          if (gridHost.isConnected) paint();
        });
      }
    }
  };

  /* ============================================================
   * 二、行程详情
   * ============================================================ */

  BF.Views.trip = {
    title: function (ctx) {
      var trip = Data.getTrip(ctx.parts[1]);
      return trip ? trip.title : '旅行详情';
    },
    subtitle: function (ctx) {
      var trip = Data.getTrip(ctx.parts[1]);
      return trip ? U.fmtRange(trip.startDate, trip.endDate) : '';
    },

    actions: function (ctx) {
      var trip = Data.getTrip(ctx.parts[1]);
      if (!trip) return [];
      var acts = [
        U.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: U.adaptive('← 返回相册', '← 返回'),
          title: '返回相册',
          onclick: function () {
            BF.App.go('#/trips');
          }
        })
      ];
      if (Auth.canEdit()) {
        acts.push(
          U.el('button', {
            class: 'btn btn--ghost btn--sm',
            text: U.adaptive('编辑信息', '✎'),
            title: '编辑旅行信息',
            onclick: function () {
              BF.TripEditor.edit(trip);
            }
          })
        );
        acts.push(
          U.el('button', {
            class: 'btn btn--primary btn--sm',
            text: U.adaptive('＋ 添加站点', '＋'),
            title: '添加站点',
            onclick: function () {
              BF.StopEditor.open(trip, null);
            }
          })
        );
      }
      return acts;
    },

    render: function (host, ctx) {
      var trip = Data.getTrip(ctx.parts[1]);
      if (!trip) {
        host.appendChild(UI.empty({ icon: '🧭', title: '没有找到这段旅程', text: '它可能已经被删除了。', actions: [U.el('button', { class: 'btn btn--primary', text: '返回相册', onclick: function () { BF.App.go('#/trips'); } })] }));
        return;
      }

      var mapCtrl = null;
      var child = trip.childIds && trip.childIds.length ? Auth.findMember(trip.childIds[0]) : Auth.primaryChild();
      var cover = Data.tripCoverPhoto(trip);

      /* ---------- 封面头图 ---------- */
      var hero = U.el('section', { class: 'trip-hero' });
      var img = U.el('img', { alt: trip.title });
      if (cover) {
        img.addEventListener('load', function () {
          img.classList.add('is-ready');
        });
        hero.appendChild(img);
        Data.fillImage(img, cover, 'main');
      }
      hero.appendChild(
        U.el('div', { class: 'trip-hero__shade' }, [
          U.el('div', { class: 'trip-hero__date', text: U.fmtRange(trip.startDate, trip.endDate) + (child && child.birthDate ? '　·　宝宝 ' + (U.ageAt(child.birthDate, trip.startDate) || '—') : '') }),
          U.el('h1', { class: 'trip-hero__title', text: trip.title }),
          trip.summary ? U.el('p', { class: 'trip-hero__desc', text: trip.summary }) : null
        ])
      );
      host.appendChild(hero);

      /* ---------- 数据条 ---------- */
      var stats = Data.stats();

      // 里程先用直线估算顶上，真实道路算出来再替换
      var distChipHost = U.el('span');
      function paintDistance(km, isRoad) {
        U.render(
          distChipHost,
          km > 1
            ? [
                U.el('span', {
                  class: 'chip chip--gold',
                  title: isRoad ? '从家出发沿实际道路行驶的里程' : '两点之间的直线距离估算',
                  text: '🛣️ ' + BF.Geo.fmtDistance(km) + (isRoad ? '（实际道路）' : '')
                })
              ]
            : []
        );
      }
      var preKnown = BF.Router.cached(Data.tripRoutePoints(trip));
      paintDistance(Data.tripKm(trip), !!(preKnown && BF.Router.isRoad(preKnown)));

      host.appendChild(
        U.el('div', { class: 'flex gap-10 wrap mt-16' }, [
          U.el('span', { class: 'chip chip--primary', text: '🧭 ' + Data.tripStopCount(trip) + ' 个站点' }),
          U.el('span', { class: 'chip chip--sky', text: '📸 ' + Data.tripPhotoCount(trip) + ' 张照片' }),
          distChipHost,
          (trip.tags || []).map(function (t) {
            return U.el('span', { class: 'chip', text: '# ' + t });
          }),
          U.el('span', { class: 'grow' }),
          Auth.canEdit()
            ? U.el('button', {
                class: 'btn btn--sm btn--danger-ghost',
                text: '删除这段旅程',
                onclick: function () {
                  UI.confirmDeleteTrip(trip).then(function (ok) {
                    if (!ok) return;
                    Data.deleteTrip(trip.id).then(function () {
                      U.toast('已删除');
                      BF.App.go('#/trips');
                    });
                  });
                }
              })
            : null,
          U.el('button', {
            class: 'btn btn--sm btn--soft',
            text: '💞 重温这段旅程',
            onclick: function () {
              BF.Revisit.startFor(trip);
            }
          })
        ].filter(Boolean))
      );

      /* ---------- 主体两栏 ---------- */
      var split = U.el('div', { class: 'split mt-24' });
      var left = U.el('div');
      var right = U.el('div', { class: 'split__side' });

      var mapWrap = U.el('div', { class: 'map-wrap' }, U.el('div', { class: 'map-canvas', style: { height: '300px' } }));
      right.appendChild(U.el('div', { class: 'card' }, [U.el('div', { class: 'card__body' }, [mapWrap, U.el('div', { class: 'small muted mt-12', text: '点击地图上的标记可以看照片；拖动可以查看整条路线。' })])]));

      right.appendChild(
        U.el('div', { class: 'card mt-16' }, [
          U.el('div', { class: 'card__body' }, [
            U.el('div', { class: 'display strong mb-16', text: '同行的人' }),
            U.el('div', { class: 'flex gap-10 wrap' }, (trip.childIds || []).map(function (id) {
              return UI.memberTag(Auth.findMember(id));
            }).concat(
              (trip.startDate ? [U.el('span', { class: 'chip', text: '记录于 ' + U.fmtDate(trip.createdAt ? U.toISODate(new Date(trip.createdAt)) : trip.startDate, true) })] : [])
            ))
          ])
        ])
      );

      /* ---------- 站点时间轴 ---------- */
      function paintStops() {
        U.render(left, []);
        var stops = trip.stops || [];
        if (!stops.length) {
          left.appendChild(
            UI.empty({
              icon: '📍',
              title: '还没有添加站点',
              text: '添加去过的景点，把照片放进去，路线就出来了。',
              actions: Auth.canEdit()
                ? [U.el('button', { class: 'btn btn--primary', text: '＋ 添加第一个站点', onclick: function () { BF.StopEditor.open(trip, null); } })]
                : []
            })
          );
          return;
        }

        var wrap = U.el('div', { class: 'stops' });
        stops.forEach(function (stop, i) {
          wrap.appendChild(renderStopCard(trip, stop, i, trip.stops, paintStops));
        });

        left.appendChild(UI.sectionHead('沿途足迹', stops.length + ' 站'));
        left.appendChild(wrap);
        if (Auth.canEdit()) {
          left.appendChild(
            U.el('button', {
              class: 'btn btn--ghost btn--block mt-8',
              text: '＋ 继续添加站点',
              onclick: function () {
                BF.StopEditor.open(trip, null);
              }
            })
          );
        }
      }

      paintStops();
      split.appendChild(left);
      split.appendChild(right);
      host.appendChild(split);

      /* ---------- 地图 ---------- */
      setTimeout(function () {
        if (!mapWrap.isConnected) return; // 视图已经切换走了
        var located = (trip.stops || []).filter(function (s) {
          return BF.Geo.valid(s.lat, s.lng);
        });
        if (!located.length) {
          mapWrap.appendChild(U.el('div', { class: 'small muted center', style: { padding: '20px' }, text: '还没有带位置的站点，添加站点时在地图上标一个点试试。' }));
          return;
        }
        mapCtrl = BF.createMap(U.$('.map-canvas', mapWrap), { onPick: null });
        var pts = [];

        // 设了家庭地址就先画一个「家」，路线从它出发
        var home = Data.home();
        if (home && BF.Geo.distanceKm(home.lat, home.lng, located[0].lat, located[0].lng) > 1) {
          mapCtrl.addPin({
            lat: home.lat,
            lng: home.lng,
            label: '家',
            color: '#5f9380',
            size: 30,
            title: '家庭地址'
          });
        }

        trip.stops.forEach(function (s, i) {
          if (!BF.Geo.valid(s.lat, s.lng)) return;
          pts.push([s.lat, s.lng]);
          var photo = (s.photos || [])[0];
          var html = '<div class="pop">';
          if (photo) html += '<div class="pop__img"></div>';
          html += '<div class="pop__body"><div class="pop__title">' + U.escapeHtml(s.name || '未命名站点') + '</div><div class="pop__meta">' + U.escapeHtml((s.city || '') + ' ' + (s.arriveDate ? U.fmtDate(s.arriveDate) : '')) + '</div>' + (s.note ? '<div class="pop__note">' + U.escapeHtml(s.note) + '</div>' : '') + '</div></div>';
          mapCtrl.addPin({
            lat: s.lat,
            lng: s.lng,
            label: String(i + 1),
            color: BF.palette(0),
            html: html,
            onClick: function () {
              setTimeout(function () {
                var host2 = U.$('.leaflet-popup .pop__img');
                if (host2 && photo) {
                  var im = U.el('img', { alt: '' });
                  host2.appendChild(im);
                  Data.fillImage(im, photo, 'thumb');
                }
              }, 40);
            }
          });
        });
        // 先按直线画出来，同时去要真实道路；拿到后原地替换并更新里程
        var routePts = Data.tripRoutePoints(trip);
        if (routePts.length > 1) {
          var known = BF.Router.cached(routePts);
          var handle = mapCtrl.drawRoute(known && known.geometry ? known.geometry : routePts, {
            color: BF.palette(0),
            weight: 3,
            opacity: known ? 0.88 : 0.45,
            dashed: !known
          });
          if (known) {
            // 已经算过了，直接用
            if (BF.Router.isRoad(known)) paintDistance(known.distanceKm, true);
            mapCtrl.fit(known.geometry, [40, 40]);
          } else {
            mapCtrl.fit(routePts, [40, 40]);
            BF.Router.route(routePts).then(function (res) {
              if (!handle || !mapCtrl) return;
              if (res.geometry && res.geometry.length > 1) {
                handle.setPoints(res.geometry);
                if (BF.Router.isRoad(res)) handle.solid();
                mapCtrl.fit(res.geometry, [40, 40]);
              }
              if (BF.Router.isRoad(res) && distChipHost.isConnected) {
                paintDistance(res.distanceKm, true);
              }
            });
          }
        } else if (pts.length) {
          mapCtrl.fit(pts, [40, 40]);
        }
        mapCtrl.invalidate();
      }, 80);

      return {
        cleanup: function () {
          if (mapCtrl) mapCtrl.destroy();
        }
      };
    }
  };

  /* ============================================================
   * 站点卡片
   * ============================================================ */

  function renderStopCard(trip, stop, index, allStops, repaint) {
    var kind = kindOf(stop.kind);
    var photos = stop.photos || [];
    var card = U.el('div', { class: 'stop' });
    card.appendChild(U.el('div', { class: 'stop__dot' }));

    var actions = [];
    if (Auth.canEdit()) {
      if (index > 0) {
        actions.push(
          U.el('button', {
            class: 'icon-btn',
            title: '上移',
            text: '↑',
            onclick: function () {
              var arr = trip.stops;
              arr.splice(index - 1, 0, arr.splice(index, 1)[0]);
              Data.saveTrip(trip).then(repaint);
            }
          })
        );
      }
      if (index < allStops.length - 1) {
        actions.push(
          U.el('button', {
            class: 'icon-btn',
            title: '下移',
            text: '↓',
            onclick: function () {
              var arr = trip.stops;
              arr.splice(index + 1, 0, arr.splice(index, 1)[0]);
              Data.saveTrip(trip).then(repaint);
            }
          })
        );
      }
      actions.push(U.el('button', { class: 'icon-btn', title: '编辑站点', text: '✎', onclick: function () { BF.StopEditor.open(trip, stop); } }));
      actions.push(
        U.el('button', {
          class: 'icon-btn',
          title: '删除站点',
          text: '🗑',
          onclick: function () {
            U.confirm('删除「' + (stop.name || '这个站点') + '」？其中的照片也会一起删除。', { danger: true, okLabel: '删除' }).then(function (ok) {
              if (!ok) return;
              var job = Promise.resolve();
              photos.forEach(function (p) {
                job = job.then(function () {
                  return BF.DB.delBlob(p.blobId);
                }).then(function () {
                  return BF.DB.delBlob(p.thumbId);
                });
              });
              job.then(function () {
                trip.stops = trip.stops.filter(function (s) {
                  return s.id !== stop.id;
                });
                if (photos.some(function (p) {
                  return p.id === trip.coverPhotoId;
                })) trip.coverPhotoId = '';
                return Data.saveTrip(trip);
              }).then(function () {
                U.toast('站点已删除');
                repaint();
              });
            });
          }
        })
      );
    }

    var body = U.el('div', { class: 'stop__card' }, [
      U.el('div', { class: 'stop__head' }, [
        U.el('div', { class: 'grow' }, [
          U.el('div', { class: 'stop__step', text: '第 ' + (index + 1) + ' 站' }),
          U.el('div', { class: 'stop__name' }, [
            kind.icon + ' ' + (stop.name || '未命名站点'),
            stop.city ? U.el('span', { class: 'chip chip--sky', text: stop.city }) : null,
            BF.Geo.valid(stop.lat, stop.lng) ? U.el('span', { class: 'chip', text: '已定位' }) : null
          ]),
          U.el('div', { class: 'stop__place' }, [
            stop.arriveDate ? U.fmtDate(stop.arriveDate) : '未记录日期',
            stop.leaveDate && stop.leaveDate !== stop.arriveDate ? ' 至 ' + U.fmtDate(stop.leaveDate) : '',
            stop.lat ? '　·　' + BF.Geo.fmtCoords(stop.lat, stop.lng) : ''
          ].join(''))
        ]),
        actions.length ? U.el('div', { class: 'stop__actions' }, actions) : null
      ])
    ]);

    if (stop.note) body.appendChild(U.el('div', { class: 'stop__note', text: stop.note }));

    body.appendChild(
      UI.photoGrid(photos, {
        uploadLabel: '添加照片',
        onOpen: function (photo) {
          UI.openLightbox(photos, photos.indexOf(photo), {
            tripId: trip.id,
            onChanged: repaint
          });
        },
        onUpload: function () {
          UI.pickImages(function (files) {
            UI.uploadPhotos(trip.id, stop.id, files, { onDone: repaint });
          });
        }
      })
    );

    card.appendChild(body);
    return card;
  }

  /* ============================================================
   * 三、行程编辑器
   * ============================================================ */

  var TripEditor = (BF.TripEditor = {});

  TripEditor.form = function (trip, onSave) {
    var isNew = !Data.getTrip(trip.id);

    var titleInput = U.input({ value: trip.title, placeholder: '例如：第一次看海 · 青岛三日' });
    var startInput = U.input({ type: 'date', value: trip.startDate });
    var endInput = U.input({ type: 'date', value: trip.endDate || trip.startDate });
    var summaryInput = U.textarea({ value: trip.summary, placeholder: '这次旅行有什么想记住的？' });
    var tagsInput = U.input({ value: (trip.tags || []).join(' '), placeholder: '用空格分隔，例如：海边 第一次 全家' });

    var childBoxes = Auth.children().map(function (c) {
      var box = U.el('input', { type: 'checkbox', checked: (trip.childIds || []).indexOf(c.id) >= 0 });
      return { member: c, box: box };
    });

    var content = U.el('div', {}, [
      U.field('旅行标题', titleInput),
      U.el('div', { class: 'row' }, [U.field('出发日期', startInput), U.field('返程日期', endInput)]),
      U.field('这次旅行的小记', summaryInput, '可以写天气、心情、宝宝说过的话…'),
      U.field('标签', tagsInput),
      childBoxes.length
        ? U.field(
            '这次是谁的旅行',
            U.el('div', { class: 'flex gap-14 wrap', style: { paddingTop: '4px' } }, childBoxes.map(function (item) {
              return U.el('label', { class: 'flex-center gap-6', style: { cursor: 'pointer' } }, [item.box, U.el('span', { text: item.member.name })]);
            }))
          )
        : null,
      U.el('div', { class: 'small muted mt-8', text: '小提示：保存后，记得为这段旅程添加站点并上传照片。' })
    ]);

    U.modal({
      title: isNew ? '记录一段新旅程' : '编辑旅行信息',
      content: content,
      actions: [
        { label: '取消', value: false },
        {
          label: isNew ? '创建并开始添加站点' : '保存',
          value: true,
          primary: true,
          onClick: function () {
            if (!titleInput.value.trim()) {
              U.toast('给这段旅程起个名字吧', 'error');
              return false;
            }
          }
        }
      ]
    }).then(function (ok) {
      if (!ok) return;
      trip.title = titleInput.value.trim();
      trip.startDate = startInput.value || U.todayISO();
      trip.endDate = endInput.value || trip.startDate;
      trip.summary = summaryInput.value.trim();
      trip.tags = tagsInput.value.split(/[\s,，]+/).filter(Boolean);
      trip.childIds = childBoxes.filter(function (i) {
        return i.box.checked;
      }).map(function (i) {
        return i.member.id;
      });
      Data.saveTrip(trip).then(function () {
        U.toast(isNew ? '旅程已创建' : '已保存', 'success');
        if (onSave) onSave(trip);
        if (isNew) BF.StopEditor.open(trip, null);
      });
    });
  };

  TripEditor.create = function () {
    if (!Auth.requireEdit()) return;
    var trip = Data.newTrip({ childIds: Auth.primaryChild() ? [Auth.primaryChild().id] : [] });
    TripEditor.form(trip, function (t) {
      BF.App.go('#/trip/' + t.id);
    });
  };

  TripEditor.edit = function (trip) {
    if (!Auth.requireEdit()) return;
    TripEditor.form(trip, function () {
      BF.App.refresh();
    });
  };

  /* ============================================================
   * 四、站点编辑器
   * ============================================================ */

  var StopEditor = (BF.StopEditor = {});

  StopEditor.open = function (trip, stop) {
    if (!Auth.requireEdit()) return;
    var isNew = !stop;
    var draft = stop
      ? JSON.parse(JSON.stringify({ id: stop.id, name: stop.name, city: stop.city, province: stop.province, lat: stop.lat, lng: stop.lng, arriveDate: stop.arriveDate, leaveDate: stop.leaveDate, kind: stop.kind, note: stop.note }))
      : Data.newStop({ arriveDate: trip.startDate || U.todayISO(), leaveDate: trip.endDate || trip.startDate || U.todayISO() });

    var nameInput = U.input({ value: draft.name, placeholder: '例如：栈桥／故宫午门／海洋馆' });
    var cityInput = U.input({ value: draft.city, placeholder: '城市，例如：青岛' });
    var provinceInput = U.input({ value: draft.province, placeholder: '省 / 国家（可留空）' });
    var arriveInput = U.input({ type: 'date', value: draft.arriveDate });
    var leaveInput = U.input({ type: 'date', value: draft.leaveDate });
    var noteInput = U.textarea({ value: draft.note, placeholder: '在这里发生了什么有趣的事？' });

    var kindSelect = U.select(
      STOP_KINDS.map(function (k) {
        return { label: k.icon + ' ' + k.label, value: k.value, selected: draft.kind === k.value };
      })
    );
    kindSelect.addEventListener('change', function () {
      draft.kind = kindSelect.value;
    });

    var locationText = U.el('div', { class: 'small muted' });
    function paintLocation() {
      locationText.textContent = BF.Geo.valid(draft.lat, draft.lng)
        ? '✅ 已定位：' + BF.Geo.fmtCoords(draft.lat, draft.lng)
        : '还没有定位：搜索景点名最快，也可以在地图上点一下。';
      locationText.style.color = BF.Geo.valid(draft.lat, draft.lng) ? 'var(--accent)' : '';
    }
    paintLocation();

    var pickBtn = U.el('button', {
      class: 'btn btn--ghost btn--sm',
      text: '🗺️ 搜索景点 / 地图选点',
      type: 'button',
      onclick: function () {
        var kw = (nameInput.value || '').trim() || (cityInput.value || '').trim();
        BF.LocationPicker.open(
          draft.lat,
          draft.lng,
          function (lat, lng, meta) {
            draft.lat = lat;
            draft.lng = lng;
            // 从搜索结果带回地名，自动补全还空着的输入框
            if (meta) {
              if (meta.name && !nameInput.value.trim()) nameInput.value = meta.name;
              if (meta.city && !cityInput.value.trim()) cityInput.value = meta.city;
              if (meta.prov && !provinceInput.value.trim()) provinceInput.value = meta.prov;
            }
            paintLocation();
          },
          { keyword: kw }
        );
      }
    });

    var photoLocBtn = U.el('button', {
      class: 'btn btn--ghost btn--sm',
      text: '📷 用照片里的位置',
      type: 'button',
      onclick: function () {
        BF.UI.pickPhotoLocation()
          .then(function (loc) {
            draft.lat = loc.lat;
            draft.lng = loc.lng;
            if (!arriveInput.value && loc.takenAt) arriveInput.value = loc.takenAt.slice(0, 10);
            if (loc.camera && !noteInput.value) noteInput.placeholder = '这张照片由 ' + loc.camera + ' 拍摄…';
            paintLocation();
            U.toast('已从照片读取位置' + (loc.takenAt ? '与拍摄日期' : ''), 'success');
          })
          .catch(function (err) {
            U.toast(err.message || '这张照片里没有位置信息', 'error');
          });
      }
    });

    var clearBtn = U.el('button', {
      class: 'btn btn--ghost btn--sm',
      text: '清除位置',
      type: 'button',
      onclick: function () {
        draft.lat = null;
        draft.lng = null;
        paintLocation();
      }
    });

    var content = U.el('div', {}, [
      U.field('站点名称', nameInput),
      U.el('div', { class: 'row' }, [U.field('城市', cityInput), U.field('省份 / 国家', provinceInput)]),
      U.field('类型', kindSelect),
      U.el('div', { class: 'row' }, [U.field('到达日期', arriveInput), U.field('离开日期', leaveInput)]),
      U.field(
        '位置坐标',
        U.el('div', {}, [
          U.el('div', { class: 'flex gap-10 flex-center wrap mb-16' }, [pickBtn, photoLocBtn, clearBtn]),
          locationText
        ]),
        '有了位置，这段旅程才会在地图上连成一条线'
      ),
      U.field('这一站的记忆', noteInput)
    ]);

    U.modal({
      title: isNew ? '添加一个站点' : '编辑站点',
      content: content,
      actions: [
        { label: '取消', value: false },
        {
          label: isNew ? '添加' : '保存',
          value: true,
          primary: true,
          onClick: function () {
            if (!nameInput.value.trim() && !cityInput.value.trim()) {
              U.toast('至少填一个地名吧', 'error');
              return false;
            }
          }
        }
      ]
    }).then(function (ok) {
      if (!ok) return;
      var payload = {
        name: nameInput.value.trim() || cityInput.value.trim(),
        city: cityInput.value.trim(),
        province: provinceInput.value.trim(),
        lat: draft.lat,
        lng: draft.lng,
        arriveDate: arriveInput.value,
        leaveDate: leaveInput.value,
        kind: draft.kind,
        note: noteInput.value.trim()
      };
      if (isNew) {
        var created = Data.newStop(payload);
        trip.stops = trip.stops || [];
        trip.stops.push(created);
        Data.saveTrip(trip).then(function () {
          U.toast('站点已添加，可以上传照片了', 'success');
          BF.App.refresh();
        });
      } else {
        Object.assign(stop, payload);
        Data.saveTrip(trip).then(function () {
          U.toast('已保存', 'success');
          BF.App.refresh();
        });
      }
    });
  };

  /* ============================================================
   * 五、地图选点
   * ============================================================ */

  var LocationPicker = (BF.LocationPicker = {});

  var SOURCE_LABEL = { amap: '高德', photon: '在线', nominatim: '在线' };

  LocationPicker.open = function (lat, lng, onPick, opts) {
    opts = opts || {};
    var picked = { lat: lat, lng: lng, name: '', city: '', prov: '' };
    var ctrl = null;
    var marker = null;
    var searchToken = 0;

    /* ---------------- 界面骨架 ---------------- */

    var searchInput = U.input({ placeholder: '搜索景点或城市，例如：青岛栈桥 / 西湖 / 三亚' });
    var searchBtn = U.el('button', { class: 'btn btn--soft btn--sm', type: 'button', text: '搜索' });
    var resultsHost = U.el('div', { class: 'picker-results' });
    var sourceNote = U.el('div', {});
    var mapHost = U.el('div', {
      class: 'map-canvas',
      style: { height: '340px', borderRadius: '12px', overflow: 'hidden' }
    });
    mapHost.appendChild(U.el('div', { class: 'map-crosshair' }));

    var coordText = U.el('div', { class: 'picker-coord' });
    var photoBtn = U.el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '📷 用照片里的位置' });
    var centerBtn = U.el('button', {
      class: 'btn btn--ghost btn--sm',
      type: 'button',
      text: '🎯 放在地图中心',
      title: '把地图拖到目标位置，再点这里即可放下标记',
      onclick: function () {
        if (!ctrl || !ctrl.map) {
          U.toast('当前是简易视图，无法使用此功能', 'error');
          return;
        }
        var c = ctrl.map.getCenter();
        var w = ctrl.fromDisplay(c.lat, c.lng);
        picked.name = '';
        picked.city = '';
        picked.prov = '';
        choose(w[0], w[1], null, true);
      }
    });

    var content = U.el('div', {}, [
      U.el('div', { class: 'flex gap-10 mb-16' }, [searchInput, searchBtn]),
      resultsHost,
      sourceNote,
      mapHost,
      U.el('div', { class: 'flex-between gap-10 wrap mt-12' }, [
        coordText,
        U.el('div', { class: 'flex gap-6 wrap' }, [centerBtn, photoBtn])
      ])
    ]);

    function paintCoord() {
      var has = BF.Geo.valid(picked.lat, picked.lng);
      coordText.textContent = has
        ? '📍 ' + BF.Geo.fmtCoords(picked.lat, picked.lng) + '（可拖动标记微调）'
        : '还没有选择位置';
      coordText.style.color = has ? 'var(--ink-2)' : 'var(--ink-3)';
    }
    paintCoord();

    /* ---------------- 结果渲染 ---------------- */

    function renderGroup(title, items) {
      var group = U.el('div', {});
      group.appendChild(U.el('div', { class: 'picker-group', text: title }));
      items.forEach(function (item) {
        var metaBits = [];
        if (item.city && item.city !== item.name) metaBits.push(item.city);
        if (item.prov && metaBits.indexOf(item.prov) < 0 && item.prov !== item.city) metaBits.push(item.prov);
        group.appendChild(
          U.el(
            'button',
            {
              class: 'picker-item',
              type: 'button',
              onclick: function () {
                choose(item.lat, item.lng, item);
              }
            },
            [
              U.el('span', { class: 'picker-item__icon', text: item.type === 'city' ? '🏙️' : '📍' }),
              U.el('div', { class: 'grow' }, [
                U.el('div', { class: 'picker-item__name', text: item.name }),
                metaBits.length ? U.el('div', { class: 'picker-item__meta', text: metaBits.join(' · ') }) : null
              ]),
              item.source && item.source !== 'local'
                ? U.el('span', { class: 'picker-item__src', text: SOURCE_LABEL[item.source] || '在线' })
                : null
            ]
          )
        );
      });
      return group;
    }

    /** 计算搜索参考点：优先用地图当前中心，其次用家庭常住城市 */
    function currentBias() {
      if (ctrl && ctrl.map && ctrl.map.getZoom() >= 9) {
        var c = ctrl.map.getCenter();
        var w = ctrl.fromDisplay(c.lat, c.lng);
        if (BF.Geo.valid(w[0], w[1])) return { lat: w[0], lng: w[1] };
      }
      var fam = BF.Auth.family;
      if (fam && fam.homeCity) {
        var hit = BF.Places.localSearch(fam.homeCity, 1)[0];
        if (hit) return { lat: hit.lat, lng: hit.lng };
      }
      return null;
    }

    /** 内置库没收录时的指引：等在线结果 / 手动找 / 用照片 */
    function renderNoResult(kw, searching) {
      var hasKey = BF.Places.hasKey();
      var box = U.el('div', { class: 'picker-empty' }, [
        U.el('div', { class: 'picker-empty__title', text: '没有找到「' + kw + '」' })
      ]);

      if (searching) {
        box.appendChild(
          U.el('div', { class: 'picker-searching' }, [
            U.el('span', { class: 'picker-searching__dot' }),
            U.el('span', { text: '内置地点库没有收录，正在向在线地图查询…' })
          ])
        );
        box.appendChild(
          U.el('div', {
            class: 'picker-empty__hint',
            text: hasKey ? '通常 1~3 秒出结果。' : '免费数据源较慢，一般 5~15 秒；配了高德 Key 就能秒出结果。'
          })
        );
      } else {
        box.appendChild(
          U.el('div', {
            class: 'picker-empty__desc',
            text: '内置地点库和在线地图都没有找到这个名字。可以换个关键词，或试试下面几种办法。'
          })
        );
      }

      if (!hasKey) {
        box.appendChild(
          U.el('button', {
            class: 'btn btn--primary btn--sm btn--block',
            type: 'button',
            text: '① 配置高德 Key（免费，搜索更快更准）',
            onclick: function () {
              openKeyPanel();
            }
          })
        );
      }

      box.appendChild(
        U.el('button', {
          class: 'btn btn--ghost btn--sm btn--block mt-8',
          type: 'button',
          text: '② 在地图上手动找这个位置',
          onclick: function () {
            searchToken++;
            U.render(resultsHost, []);
            U.render(sourceNote, []);
            sourceNote.appendChild(
              U.el('div', {
                class: 'picker-hint',
                text: '先搜它所在的城市（例如「杭州」或「苏州」）把地图挪过去，再拖动地图对准目标，最后点右下角「🎯 放在地图中心」。'
              })
            );
            searchInput.value = '';
            searchInput.placeholder = '搜它所在的城市，例如：苏州';
            searchInput.focus();
          }
        })
      );

      box.appendChild(
        U.el('div', {
          class: 'picker-empty__hint',
          text: '③ 如果手机相册里有在那个地方拍的照片，点「📷 用照片里的位置」可以直接读取。'
        })
      );

      return box;
    }

    /** 内联的 Key 配置面板，不用跳出当前流程 */
    function openKeyPanel() {
      searchToken++;
      var input = U.input({ value: BF.Places.getAmapKey(), placeholder: '粘贴高德 Key' });
      var msg = U.el('div', { class: 'picker-note' });

      resultsHost.classList.add('picker-results--tall');
      U.render(resultsHost, []);
      U.render(sourceNote, []);
      resultsHost.appendChild(
        U.el('div', { class: 'picker-keypanel' }, [
          U.el('div', { class: 'picker-empty__title', text: '启用在线地点搜索' }),
          U.el('div', {
            class: 'picker-empty__desc',
            text: '用高德地图开放平台的「Web服务」Key，个人开发者免费申请，每天额度足够一家人用。'
          }),
          U.el('ol', { class: 'picker-steps' }, [
            U.el('li', {}, [
              '打开 ',
              U.el('a', {
                href: 'https://lbs.amap.com/dev/key/app',
                target: '_blank',
                rel: 'noopener',
                text: 'lbs.amap.com/dev/key/app'
              }),
              ' 并登录（需注册高德账号）'
            ]),
            U.el('li', { text: '「应用管理 → 我的应用 → 创建新应用」，然后在应用里「添加 Key」' }),
            U.el('li', { text: '服务平台务必选「Web服务」（不是 Web端/JS API）' }),
            U.el('li', { text: '把生成的 Key 复制过来，粘在下面' })
          ]),
          U.field('高德 Key', input),
          msg,
          U.el('div', { class: 'flex gap-10 mt-8' }, [
            U.el('button', {
              class: 'btn btn--primary btn--sm grow',
              type: 'button',
              text: '保存并重新搜索',
              onclick: function () {
                var v = input.value.trim();
                if (!v) {
                  msg.textContent = '请先粘贴 Key';
                  msg.style.color = 'var(--danger)';
                  return;
                }
                msg.style.color = '';
                msg.textContent = '正在保存…';
                BF.Places.saveKey(v).then(function () {
                  msg.textContent = '已保存，正在重新搜索…';
                  doSearch();
                });
              }
            }),
            U.el('button', {
              class: 'btn btn--ghost btn--sm',
              type: 'button',
              text: '取消',
              onclick: function () {
                doSearch();
              }
            })
          ])
        ])
      );
      setTimeout(function () {
        input.focus();
      }, 40);
    }

    function paintResults(local, online, partial, res) {
      resultsHost.classList.remove('picker-results--tall');
      U.render(resultsHost, []);
      var total = 0;
      if (local && local.length) {
        resultsHost.appendChild(renderGroup('内置地点库', local));
        total += local.length;
      }
      if (online && online.length) {
        resultsHost.appendChild(renderGroup('在线搜索', online));
        total += online.length;
      }
      if (!total) {
        // 不等在线搜索超时，立刻把「还能怎么办」摆出来
        resultsHost.appendChild(renderNoResult(searchInput.value.trim(), partial));
      }

      U.render(sourceNote, []);

      if (total && res && !res.hasKey) {
        var fromOnline = res.online && res.online.length > 0;
        sourceNote.appendChild(
          U.el('div', {
            class: 'picker-note',
            text: fromOnline
              ? '在线结果来自免费地图数据，覆盖可能不全。配置高德 Key 后可以搜得更全、更快。'
              : '结果来自内置地点库。配置高德 Key 后，地方景区、小店这类地点也能搜到。'
          })
        );
      }

      if (!total && res && res.errors && res.errors.length) {
        // 只提示「用户能采取行动」的错误；境外服务连不上的技术细节就不糊到脸上了
        var detail = res.errors
          .filter(function (e) {
            return e.reason === 'amap-error' || e.reason === 'server-error';
          })
          .map(function (e) {
            return e.message;
          });
        if (detail.length) {
          sourceNote.appendChild(U.el('div', { class: 'picker-hint', text: '在线搜索：' + detail.join('；') }));
        }
      }
    }

    /* ---------------- 搜索 ---------------- */

    function doSearch() {
      var kw = searchInput.value.trim();
      if (!kw) {
        U.render(resultsHost, []);
        return;
      }
      var token = ++searchToken;

      // 先同步给出内置库结果，用户不用等
      var local = BF.Places.localSearch(kw, 8);
      paintResults(local, [], true);

      BF.Places.search(kw, { bias: currentBias() }).then(function (res) {
        if (token !== searchToken) return;
        paintResults(res.local, res.online, false, res);
      });
    }

    var debounced = U.debounce(function () {
      doSearch();
    }, 420);

    searchInput.addEventListener('input', function () {
      debounced();
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        doSearch();
      }
    });
    searchBtn.addEventListener('click', doSearch);

    /* ---------------- 选点 ---------------- */

    function choose(la, ln, item, keepView) {
      picked.lat = la;
      picked.lng = ln;
      if (item) {
        picked.name = item.name || '';
        picked.city = item.city || '';
        picked.prov = item.prov || '';
      }
      paintCoord();
      if (ctrl && ctrl.map) {
        if (!keepView) {
          var d = ctrl.toDisplay(la, ln);
          ctrl.map.setView([d[0], d[1]], item && item.type === 'spot' ? 15 : 12);
        }
        placeMarker(la, ln);
      }
    }

    function placeMarker(la, ln) {
      paintCoord();
      if (!ctrl || !ctrl.map) {
        // 简易示意视图：无法拖动，但仍把选中的点标出来
        if (ctrl) {
          ctrl.clear();
          ctrl.addPin({ lat: la, lng: ln, color: '#d9663f', label: '★' });
          ctrl.fit([[la, ln]], [60, 60]);
        }
        coordText.textContent = '📍 ' + BF.Geo.fmtCoords(la, ln);
        return;
      }
      var d = ctrl.toDisplay(la, ln);
      if (marker) {
        marker.setLatLng([d[0], d[1]]);
        return;
      }
      marker = global.L.marker([d[0], d[1]], { draggable: true }).addTo(ctrl.map);
      marker.on('dragend', function () {
        var p = marker.getLatLng();
        var w = ctrl.fromDisplay(p.lat, p.lng);
        picked.lat = w[0];
        picked.lng = w[1];
        paintCoord();
      });
    }

    photoBtn.addEventListener('click', function () {
      BF.UI.pickPhotoLocation()
        .then(function (loc) {
          choose(loc.lat, loc.lng, null);
          U.toast('已读取照片里的位置' + (loc.takenAt ? '（拍摄于 ' + loc.takenAt + '）' : ''), 'success');
        })
        .catch(function (err) {
          U.toast(err.message || '这张照片里没有位置信息', 'error');
        });
    });

    /* ---------------- 打开弹窗 ---------------- */

    U.modal({
      title: opts.title || '在地图上标记这个地点',
      size: 'lg',
      content: content,
      actions: [
        { label: '取消', value: false },
        {
          label: '使用这个位置',
          value: true,
          primary: true,
          onClick: function () {
            if (!BF.Geo.valid(picked.lat, picked.lng)) {
              U.toast('还没有选点：搜索一个景点，或直接在地图上点一下', 'error');
              return false;
            }
          }
        }
      ],
      onMount: function () {
        setTimeout(function () {
          ctrl = BF.createMap(mapHost, {
            onPick: function (la, ln) {
              picked.name = '';
              picked.city = '';
              picked.prov = '';
              choose(la, ln, null);
            }
          });

          if (BF.Geo.valid(lat, lng)) {
            placeMarker(lat, lng);
            ctrl.fit([[lat, lng]], [70, 70]);
          } else {
            var kw = (opts.keyword || '').trim();
            var home = BF.Auth.family && BF.Auth.family.homeCity;
            if (kw.length > 1) {
              searchInput.value = kw;
              doSearch();
            } else if (home) {
              var hit = BF.Places.localSearch(home, 1)[0];
              if (hit) {
                ctrl.fit([[hit.lat, hit.lng]], [70, 70]);
              }
            }
          }
          ctrl.invalidate();
        }, 60);
      }
    }).then(function (ok) {
      if (ctrl) ctrl.destroy();
      if (!ok) return;
      onPick(picked.lat, picked.lng, { name: picked.name, city: picked.city, prov: picked.prov });
      if (BF.Geo.valid(picked.lat, picked.lng)) U.toast('位置已更新', 'success');
    });
  };

})(window);
