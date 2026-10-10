/* ============================================================
 * 小脚丫旅行记 · 首页（足迹总览）
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var Data = BF.Data;
  var Auth = BF.Auth;
  var UI = BF.UI;

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return '夜深了';
    if (h < 11) return '早安';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  /* ============================================================
   * 本机模式提示
   * 双击 index.html 打开时数据存在浏览器里，很多人不知道，
   * 换台设备发现"数据没了"就来问。这里温和地说一句，可以关掉。
   * ============================================================ */

  var TIP_KEY = 'hideLocalTip';

  function localModeTip() {
    var box = U.el('div', { class: 'local-tip' });
    box.appendChild(U.el('span', { class: 'local-tip__icon', text: '💾' }));
    box.appendChild(
      U.el('div', { class: 'grow' }, [
        U.el('div', { class: 'local-tip__title', text: '记录保存在这台设备的浏览器里' }),
        U.el('div', {
          class: 'local-tip__text',
          text: '换浏览器、换电脑、清理缓存都会丢。想让手机和平板也看到同一份？'
        })
      ])
    );
    box.appendChild(
      U.el('button', {
        class: 'btn btn--soft btn--sm',
        text: '怎么做',
        onclick: function () {
          showLocalModeHelp();
        }
      })
    );
    box.appendChild(
      U.el('button', {
        class: 'local-tip__close',
        title: '不再提示',
        text: '×',
        onclick: function () {
          BF.DB.kvSet(TIP_KEY, 1);
          if (box.parentNode) box.parentNode.removeChild(box);
        }
      })
    );
    return box;
  }

  function modeCard(icon, title, items, current) {
    return U.el('div', { class: 'mode-card' + (current ? ' is-current' : '') }, [
      U.el('div', { class: 'mode-card__head' }, [
        U.el('span', { class: 'mode-card__icon', text: icon }),
        U.el('span', { class: 'mode-card__title', text: title }),
        current ? U.el('span', { class: 'mode-card__badge', text: '当前' }) : null
      ]),
      U.el(
        'ul',
        { class: 'mode-card__list' },
        items.map(function (t) {
          return U.el('li', { text: t });
        })
      )
    ]);
  }

  function showLocalModeHelp() {
    var content = U.el('div', { class: 'mode-help' }, [
      U.el('p', {
        class: 'mode-help__lead',
        text: '两种用法功能完全一样 —— 地图、真实道路里程、重温对比、备份都能用。区别只有一个：数据存在哪。'
      }),
      modeCard(
        '💻',
        '浏览器模式',
        ['不用装任何东西', '数据存在这台设备的浏览器里', '换浏览器、换电脑、清理缓存会丢', '手机和平板看不到这份记录'],
        true
      ),
      modeCard('🏠', '本地服务模式', [
        '数据存在项目文件夹的 data/ 里，就是一份普通文件，好备份、好拷贝',
        '手机、平板连同一个 WiFi，打开同一个网址就能看同一份记录',
        '需要 Node.js —— 重新运行 start.bat，会问你要不要自动下载一份（约 34 MB，不装进系统）'
      ]),
      U.el('div', { class: 'mode-help__how' }, [
        U.el('div', { class: 'mode-help__how-title', text: '怎么切换？' }),
        U.el('div', {
          class: 'mode-help__how-text',
          text: '关掉这个页面 → 重新双击 start.bat → 提问那里选 Y。装好之后再打开，程序会主动问你「要不要把浏览器里已有的数据搬过去」，点一下就行，不会丢。'
        })
      ])
    ]);

    U.modal({
      title: '数据存在哪里？',
      size: 'md',
      content: content,
      actions: [{ label: '知道了', value: true, primary: true }]
    });
  }

  BF.Views.home = {
    title: '首页',
    subtitle: function () {
      return Auth.family ? Auth.family.name : '';
    },

    actions: function () {
      var btns = [];
      if (Auth.canEdit()) {
        btns.push(
          U.el('button', {
            class: 'btn btn--primary btn--sm',
            text: U.adaptive('＋ 记录一段新旅程', '＋ 新旅程'),
            onclick: function () {
              BF.TripEditor.create();
            }
          })
        );
      }
      return btns;
    },

    render: function (host) {
      var stats = Data.stats();
      var child = Auth.primaryChild();
      var me = Auth.current;
      var cachedRoad = Data._roadCache;
      var km = cachedRoad && cachedRoad.hasRoad ? cachedRoad.distanceKm : stats.distanceKm;

      function heroDescText(distanceKm, isRoad) {
        if (stats.tripCount === 0) {
          return '还没有开始记录。上传第一张旅行照片，小脚丫的足迹就会出现在地图上。';
        }
        return (
          '已经走过 ' +
          stats.cityCount +
          ' 座城市，留下 ' +
          stats.photoCount +
          ' 张照片，累计 ' +
          BF.Geo.fmtDistance(distanceKm) +
          (isRoad ? ' 的自驾里程。' : ' 的旅程。')
        );
      }

      /* ---------- 顶部问候 ---------- */
      var heroDesc = U.el('div', {
        class: 'hero__desc',
        text: heroDescText(km, !!(cachedRoad && cachedRoad.hasRoad))
      });

      var heroBits = [];
      heroBits.push(U.el('div', { class: 'grow' }, [
        U.el('div', { class: 'hero__greeting', text: greeting() + '，' + ((me && me.name) || '朋友') }),
        U.el('div', {
          class: 'hero__title',
          text: child ? '这里是 ' + child.name + ' 的小小旅行地图' : '这里是小脚丫的旅行地图'
        }),
        heroDesc,
        U.el('div', { class: 'hero__actions' }, heroActions())
      ]));

      if (child && child.birthDate) {
        var days = U.daysBetween(child.birthDate, U.todayISO());
        heroBits.push(
          U.el('div', { class: 'daycount' }, [
            U.el('b', { text: String(days) }),
            U.el('span', { text: '来到世界的第几天' })
          ])
        );
      }

      host.appendChild(U.el('section', { class: 'hero' }, U.el('div', { class: 'hero__inner' }, heroBits)));

      /* ---------- 本机模式提示（只在没有服务端时出现，可关闭） ---------- */
      if (BF.DB.mode !== 'server') {
        var tipHost = U.el('div', { class: 'section' });
        host.appendChild(tipHost);
        BF.DB.kvGet(TIP_KEY, 0).then(function (hidden) {
          if (hidden || !tipHost.isConnected) return;
          tipHost.appendChild(localModeTip());
        });
      }

      /* ---------- 统计 ---------- */
      var statsGrid = U.el('div', { class: 'grid grid--stats' });

      function paintStats(distanceKm, isRoad) {
        U.render(
          statsGrid,
          [
            UI.statCard('🧳', stats.tripCount, ' 次', '旅行次数'),
            UI.statCard('🏙️', stats.cityCount, ' 座', '去过的城市'),
            UI.statCard('📸', stats.photoCount, ' 张', '旅行照片'),
            UI.statCard(
              '🛣️',
              distanceKm >= 1 ? Math.round(distanceKm).toLocaleString('zh-CN') : 0,
              ' km',
              isRoad ? '自驾里程 · 实际道路' : '累计里程'
            ),
            stats.firstDate ? UI.statCard('🌱', U.fmtDate(stats.firstDate, true), '', '第一次出发') : null,
            stats.yearCount ? UI.statCard('⏳', stats.yearCount, ' 年', '有记录的年份') : null
          ].filter(Boolean)
        );
      }

      paintStats(km, !!(cachedRoad && cachedRoad.hasRoad));

      host.appendChild(
        U.el('section', { class: 'section' }, [UI.sectionHead('成长数据'), statsGrid])
      );

      // 真实道路里程要联网算，稍后回来补上；没有家庭地址或算不出来就保持直线估算
      if (stats.tripCount > 0 && Data.home()) {
        Data.roadStats().then(function (road) {
          if (!road.hasRoad || !statsGrid.isConnected) return;
          paintStats(road.distanceKm, true);
          if (heroDesc.isConnected) heroDesc.textContent = heroDescText(road.distanceKm, true);
          if (recentGrid && recentGrid.isConnected) paintRecent();
          BF.App.refreshSubtitle();
        });
      }

      /* ---------- 第一段旅程引导 ---------- */
      if (!Data.trips.length) {
        host.appendChild(
          U.el('section', { class: 'section' }, [
            UI.empty({
              icon: '🧳',
              title: '还没有任何旅行记录',
              text: Auth.canEdit()
                ? '从最近的一次出游开始吧：新建一段旅程 → 添加去过的景点 → 上传照片（能自动读取拍摄地点）。'
                : '等爸爸妈妈记录完第一段旅程，这里就会热闹起来。',
              actions: Auth.canEdit()
                ? [
                    U.el('button', { class: 'btn btn--primary', text: '创建第一段旅程', onclick: function () { BF.TripEditor.create(); } }),
                    U.el('button', { class: 'btn btn--ghost', text: '载入示例数据看看', onclick: function () { loadDemo(); } })
                  ]
                : []
            })
          ])
        );
        return;
      }

      /* ---------- 最近旅程 ---------- */
      var recentGrid = U.el('div', { class: 'grid grid--trips' });
      function paintRecent() {
        U.render(
          recentGrid,
          Data.trips.slice(0, 3).map(function (t) {
            return UI.tripCard(t);
          })
        );
      }
      paintRecent();

      host.appendChild(
        U.el('section', { class: 'section' }, [
          UI.sectionHead('最近的旅程', '共 ' + Data.trips.length + ' 段', [
            U.el('button', { class: 'btn btn--ghost btn--sm', text: '查看全部', onclick: function () { BF.App.go('#/trips'); } })
          ]),
          recentGrid
        ])
      );

      /* ---------- 重温提示 ---------- */
      var oldTrip = oldestTrip();
      if (oldTrip) {
        var years = new Date().getFullYear() - Number(String(oldTrip.startDate).slice(0, 4));
        host.appendChild(
          U.el('section', { class: 'section' }, [
            U.el('div', { class: 'paper flex-between wrap gap-14' }, [
              U.el('div', { class: 'grow' }, [
                U.el('div', { class: 'display strong', style: { fontSize: '16px' }, text: '💞 一段值得重温的旅程' }),
                U.el('div', {
                  class: 'small muted mt-8',
                  text:
                    '《' + oldTrip.title + '》' + (years > 0 ? '已经过去 ' + years + ' 年了' : '') + '。' +
                    '带上爸爸妈妈，去同一个地方拍一张今天的照片吧。'
                })
              ]),
              U.el('button', {
                class: 'btn btn--soft',
                text: '开始重温',
                onclick: function () {
                  BF.App.go('#/revisit');
                }
              })
            ])
          ])
        );
      }

      /* ---------- 宝宝档案 ---------- */
      if (child) {
        host.appendChild(
          U.el('section', { class: 'section' }, [
            UI.sectionHead('小主角'),
            U.el('div', { class: 'paper flex-center wrap gap-14' }, [
              UI.avatar(child, { size: 'xl' }),
              U.el('div', { class: 'grow' }, [
                U.el('div', { class: 'display', style: { fontSize: '19px', fontWeight: '600' }, text: child.name }),
                U.el('div', { class: 'small muted mt-8' }, [
                  child.birthDate ? '出生于 ' + U.fmtDate(child.birthDate) + '　·　现在 ' + U.ageAt(child.birthDate, U.todayISO()) : '还没有填写出生日期'
                ]),
                U.el('div', { class: 'flex gap-6 wrap mt-12' }, [
                  stats.firstDate ? U.el('span', { class: 'chip chip--accent', text: '第一次旅行 ' + (U.ageAt(child.birthDate, stats.firstDate) || '—') }) : null,
                  stats.lastDate ? U.el('span', { class: 'chip chip--gold', text: '最近一次 ' + (U.ageAt(child.birthDate, stats.lastDate) || '—') }) : null
                ].filter(Boolean))
              ])
            ])
          ])
        );
      }
    }
  };

  function heroActions() {
    var acts = [];
    acts.push(U.el('button', { class: 'btn btn--ghost btn--sm', text: '🗺️ 打开足迹地图', onclick: function () { BF.App.go('#/map'); } }));
    acts.push(U.el('button', { class: 'btn btn--ghost btn--sm', text: '🕰️ 看看时光轴', onclick: function () { BF.App.go('#/timeline'); } }));
    if (Data.revisits.length) {
      acts.push(U.el('button', { class: 'btn btn--ghost btn--sm', text: '💞 重温记录 ' + Data.revisits.length, onclick: function () { BF.App.go('#/revisit'); } }));
    }
    return acts;
  }

  function oldestTrip() {
    if (!Data.trips.length) return null;
    var sorted = Data.trips.slice().sort(function (a, b) {
      return String(a.startDate || '').localeCompare(String(b.startDate || ''));
    });
    var first = sorted[0];
    if (!first.startDate) return null;
    var currentYear = new Date().getFullYear();
    return Number(String(first.startDate).slice(0, 4)) < currentYear ? first : sorted.length > 1 ? first : null;
  }

  function loadDemo() {
    BF.Demo.seed().then(function () {
      U.toast('示例数据已载入', 'success');
      BF.App.refresh();
    });
  }

})(window);
