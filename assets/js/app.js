/* ============================================================
 * 小脚丫旅行记 · 应用外壳与路由
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var DB = BF.DB;
  var Auth = BF.Auth;
  var Data = BF.Data;

  var App = (BF.App = {});
  BF.Views = BF.Views || {};

  App.ctx = { hash: '#/', view: 'home', parts: [] };
  App.currentView = null;
  App.root = null;
  App.mapInstance = null;

  var NAV = [
    { hash: '#/', view: 'home', icon: '🏠', label: '首页' },
    { hash: '#/map', view: 'map', icon: '🗺️', label: '足迹地图' },
    { hash: '#/trips', view: 'trips', icon: '🧳', label: '旅行相册' },
    { hash: '#/timeline', view: 'timeline', icon: '🕰️', label: '时光轴' },
    { hash: '#/revisit', view: 'revisit', icon: '💞', label: '重温' },
    { hash: '#/settings', view: 'settings', icon: '⚙️', label: '设置' }
  ];
  App.NAV = NAV;

  /* ------------------------- 路由解析 ------------------------- */

  App.parseHash = function () {
    var hash = global.location.hash || '#/';
    if (hash === '#' || hash === '') hash = '#/';
    var parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    var view = parts[0] || 'home';
    // 别名
    if (view === 'trip') view = 'trip';
    if (view === 'rv') view = 'rv';
    return { hash: hash, view: view, parts: parts };
  };

  App.go = function (hash, replace) {
    if (replace) {
      global.history.replaceState(null, '', hash);
      App.render();
    } else if (global.location.hash === hash) {
      App.render();
    } else {
      global.location.hash = hash;
    }
  };

  /* ------------------------- 启动 ------------------------- */

  App.boot = function () {
    App.root = U.$('#root');
    return DB.init()
      .then(function () {
        App.hideBoot();
      })
      .then(function () {
        return DB.requestPersistence();
      })
      .then(function () {
        return BF.Places.loadKey();
      })
      .then(function () {
        return App.maybeOfferMigration();
      })
      .then(function () {
        return Auth.load();
      })
      .then(function () {
        // 免登录模式：直接落到「默认使用者」，不再拦一道登录页
        if (Auth.hasFamily() && Auth.isOpenMode()) return Auth.autoLogin();
        return Auth.restoreSession();
      })
      .then(function () {
        App.hideBoot();
        if (!Auth.hasFamily()) {
          // 没有家庭数据时，先给出「创建 / 登录(导入备份) / 看示例」三条路
          return BF.AuthUI.render(App.root, 'welcome').then(function () {
            return App.afterAuth();
          });
        }
        if (!Auth.current) {
          return BF.AuthUI.render(App.root, 'login').then(function () {
            return App.afterAuth();
          });
        }
        return App.afterAuth();
      })
      .catch(function (err) {
        console.error(err);
        U.toast('启动出错：' + (err.message || err), 'error');
      });
  };

  /**
   * 如果跑在 server.js 提供的地址上，而服务器还是空的、本机却有旧数据，
   * 就主动问一句要不要把数据搬上去。
   */
  App.maybeOfferMigration = function () {
    if (DB.mode !== 'server') return Promise.resolve(false);
    return DB.localHasData()
      .then(function (hasLocal) {
        if (!hasLocal || !DB.remoteIsEmpty()) return false;
        return U.confirm(
          '这台设备上保存着之前的旅行数据，但服务器上还是空的。要把这些数据上传到服务器吗？' +
            '上传之后，手机、平板打开同一个地址就能看到同一份记录。',
          { title: '把本机数据搬到服务器', okLabel: '上传到服务器', cancelLabel: '以后再说' }
        ).then(function (ok) {
          if (!ok) return false;
          return App.runMigration().then(function () {
            global.location.reload();
          });
        });
      })
      .catch(function (err) {
        console.warn('迁移检查失败', err);
        return false;
      });
  };

  /** 把本机数据上传到服务器（带进度） */
  App.runMigration = function () {
    var text = U.el('p', { class: 'modal__text', text: '正在读取本机数据…' });
    var bar = U.el('i', { style: { width: '0%' } });
    var closeFn = null;

    U.modal({
      title: '正在把数据传到服务器',
      size: 'sm',
      sticky: true,
      content: U.el('div', {}, [text, U.el('div', { class: 'progress-line' }, bar)]),
      actions: [],
      onMount: function (body, close) {
        closeFn = close;
      }
    });

    return DB.migrateLocalToServer(function (done, total, label) {
      bar.style.width = Math.round((done / Math.max(1, total)) * 100) + '%';
      text.textContent = label || '正在上传…';
    })
      .then(function (res) {
        if (closeFn) closeFn('done');
        U.toast('已上传 ' + res.trips + ' 段行程 / ' + res.photos + ' 张照片', 'success');
        return res;
      })
      .catch(function (err) {
        if (closeFn) closeFn('error');
        U.toast('上传失败：' + (err.message || err), 'error');
        throw err;
      });
  };

  App.hideBoot = function () {
    var boot = U.$('#boot');
    if (!boot) return;
    boot.classList.add('is-out');
    setTimeout(function () {
      if (boot.parentNode) boot.parentNode.removeChild(boot);
    }, 420);
  };

  App.afterAuth = function () {
    return Data.load().then(function () {
      App.mountShell();
      App.applyTheme();
      App.render();
      App.hideBoot();
    });
  };

  /* ------------------------- 主题 ------------------------- */

  App.isImmersive = function () {
    return !!App._immersive;
  };

  App.setImmersive = function (on) {
    App._immersive = !!on;
    document.body.classList.toggle('immersive', App._immersive);
    DB.kvSet('immersive', App._immersive);
    App.render();
  };

  App.applyTheme = function () {
    return DB.kvGet('immersive', false).then(function (v) {
      App._immersive = !!v;
      document.body.classList.toggle('immersive', App._immersive);
      var meta = U.$('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', App._immersive ? '#17130f' : '#fdf8f3');
    });
  };

  /* ------------------------- 外壳 ------------------------- */

  App.mountShell = function () {
    var navEl = U.el('nav', { class: 'nav' });
    NAV.forEach(function (item) {
      navEl.appendChild(
        U.el('button', {
          class: 'nav__item',
          dataset: { view: item.view, hash: item.hash },
          onclick: function () {
            App.go(item.hash);
          }
        }, [U.el('i', { text: item.icon }), U.el('span', { text: item.label })])
      );
    });

    var brand = function (mobile) {
      return U.el('div', { class: 'brand' + (mobile ? ' brand--mobile' : '') }, [
        U.el('div', { class: 'brand__mark', text: '👣' }),
        U.el('div', { class: 'brand__text' }, [
          U.el('b', { text: '小脚丫旅行记' }),
          U.el('span', { text: 'OUR LITTLE JOURNEY' })
        ])
      ]);
    };

    var userCard = U.el('div', { class: 'sidebar__card' });

    var sidebar = U.el('aside', { class: 'sidebar' }, [
      brand(false),
      navEl,
      U.el('div', { class: 'sidebar__spacer' }),
      userCard,
      U.el('div', {
        class: 'sidebar__tip',
        text:
          DB.mode === 'server'
            ? '🌐 数据保存在你自己的服务器上，手机和电脑打开同一个网址就能看到同一份记录。'
            : '💻 所有照片与轨迹都保存在这台设备的浏览器里，不会上传到任何服务器。'
      })
    ]);

    var topbar = U.el('header', { class: 'topbar' }, [
      brand(true),
      U.el('div', { class: 'grow' }, [
        U.el('div', { class: 'topbar__title' }),
        U.el('div', { class: 'topbar__sub' })
      ]),
      U.el('div', { class: 'topbar__actions' })
    ]);

    var view = U.el('div', { class: 'view', id: 'view' });

    var shell = U.el('div', { class: 'shell' }, [sidebar, U.el('div', { class: 'main' }, [topbar, view])]);

    App.root.innerHTML = '';
    App.root.appendChild(shell);
    App.el = { navEl: navEl, userCard: userCard, topbar: topbar, view: view };

    global.addEventListener('scroll', function () {
      topbar.classList.toggle('is-stuck', global.scrollY > 6);
    }, { passive: true });

    App.paintUserCard();
  };

  /**
   * 异步数据（比如真实道路里程）回来之后，把顶部副标题刷新一下，
   * 不用整个重绘页面。
   */
  App.refreshSubtitle = function () {
    if (!App.el || !App._ctx) return;
    var viewDef = BF.Views[App._ctx.view];
    if (!viewDef || typeof viewDef.subtitle !== 'function') return;
    var el = U.$('.topbar__sub', App.el.topbar);
    if (el) el.textContent = viewDef.subtitle(App._ctx) || '';
  };

  App.paintUserCard = function () {
    if (!App.el) return;
    var me = Auth.current;
    if (!me) return;
    var openMode = Auth.isOpenMode();

    var actionBtn = openMode
      ? U.el('button', {
          class: 'icon-btn',
          title: '切换使用者（照片和行程会记在这个名字下）',
          text: '⇄',
          onclick: function () {
            App.openMemberSwitcher();
          }
        })
      : U.el('button', {
          class: 'icon-btn',
          title: '退出登录',
          text: '⎋',
          onclick: function () {
            U.confirm('要退出吗？（数据仍会保留在服务器上）', { title: '退出登录', okLabel: '退出' }).then(function (ok) {
              if (!ok) return;
              Auth.logout().then(function () {
                Data.releaseUrlCache();
                App.go('#/');
                App.boot();
              });
            });
          }
        });

    U.render(App.el.userCard, [
      U.el('div', { class: 'userbox' }, [
        BF.UI.avatar(me, { size: 'sm' }),
        U.el('div', { class: 'userbox__body' }, [
          U.el('div', { class: 'userbox__name', text: me.name }),
          U.el('div', {
            class: 'userbox__role',
            text:
              Auth.roleLabel(me.role) +
              (me.birthDate ? ' · ' + U.ageAt(me.birthDate, U.todayISO()) : '')
          })
        ]),
        actionBtn
      ]),
      openMode
        ? U.el('div', { class: 'userbox__hint', text: '免登录模式 · 家庭成员打开即可使用' })
        : null
    ].filter(Boolean));
  };

  /** 免登录模式下的「现在是谁在用」切换 */
  App.openMemberSwitcher = function () {
    var closeFn = null;
    var list = U.el('div', { class: 'auth__members' });

    Auth.members().forEach(function (m) {
      var isCurrent = Auth.current && Auth.current.id === m.id;
      list.appendChild(
        U.el(
          'button',
          {
            class: 'member-pick' + (isCurrent ? ' is-current' : ''),
            onclick: function () {
              if (isCurrent) {
                if (closeFn) closeFn('ok');
                return;
              }
              Auth.switchTo(m.id).then(function () {
                if (closeFn) closeFn('ok');
                U.toast('已切换为「' + m.name + '」', 'success');
                App.paintUserCard();
                App.render();
              });
            }
          },
          [
            BF.UI.avatar(m, { size: 'md' }),
            U.el('div', { class: 'member-pick__body' }, [
              U.el('div', { class: 'member-pick__name' }, [
                m.name,
                U.el('span', {
                  class: 'chip chip--' + (m.role === 'child' ? 'accent' : 'primary'),
                  text: Auth.roleLabel(m.role)
                })
              ]),
              U.el('div', {
                class: 'member-pick__desc',
                text: isCurrent ? '当前使用者' : m.birthDate ? U.ageAt(m.birthDate, U.todayISO()) : '点一下切换'
              })
            ]),
            isCurrent ? U.el('span', { class: 'member-pick__go', text: '✓' }) : null
          ].filter(Boolean)
        )
      );
    });

    U.modal({
      title: '现在是谁在用？',
      size: 'sm',
      content: U.el('div', {}, [
        U.el('p', {
          class: 'modal__text mb-16',
          text: '不需要密码 —— 这只是用来记录新加的行程和照片是谁保存的，切换后界面权限也会跟着变。'
        }),
        list
      ]),
      actions: [{ label: '关闭', value: 'ok' }],
      onMount: function (body, close) {
        closeFn = close;
      }
    });
  };

  /* ------------------------- 渲染 ------------------------- */

  App.render = function () {
    var ctx = App.parseHash();
    App.ctx = ctx;

    if (!App.el) return;

    // 卸载上一个视图
    if (App.currentView && typeof App.currentView.cleanup === 'function') {
      try {
        App.currentView.cleanup();
      } catch (e) {
        console.warn(e);
      }
    }
    App.currentView = null;

    App._ctx = ctx;

    var viewDef = BF.Views[ctx.view];
    if (!viewDef) {
      var known = NAV.some(function (n) {
        return n.view === ctx.view;
      });
      if (!known && !BF.Views[ctx.view]) {
        U.toast('页面不存在，已回到首页', 'error');
        App.go('#/');
        return;
      }
      viewDef = BF.Views.home;
      ctx.view = 'home';
    }

    // 导航高亮
    var navKey = ctx.view === 'trip' ? 'trips' : ctx.view === 'rv' ? 'revisit' : ctx.view;
    U.$$('.nav__item', App.el.navEl).forEach(function (n) {
      n.classList.toggle('is-active', n.dataset.view === navKey);
    });

    // 标题
    var title = typeof viewDef.title === 'function' ? viewDef.title(ctx) : viewDef.title;
    var subtitle = typeof viewDef.subtitle === 'function' ? viewDef.subtitle(ctx) : viewDef.subtitle;
    U.$('.topbar__title', App.el.topbar).textContent = title || '';
    U.$('.topbar__sub', App.el.topbar).textContent = subtitle || '';

    var actionsHost = U.$('.topbar__actions', App.el.topbar);
    actionsHost.innerHTML = '';
    if (typeof viewDef.actions === 'function') {
      var acts = viewDef.actions(ctx) || [];
      acts.forEach(function (a) {
        if (a) actionsHost.appendChild(a);
      });
    }
    actionsHost.appendChild(App.themeToggle());

    // 内容
    U.revokeAllUrls();
    App.el.view.innerHTML = '';
    global.scrollTo({ top: 0, behavior: 'auto' });
    App.currentView = viewDef.render(App.el.view, ctx) || {};
  };

  App.themeToggle = function () {
    return U.el('button', {
      class: 'btn btn--sm btn--ghost theme-toggle',
      title: '切换回忆模式（深色，适合安静地翻看旧时光）',
      text: App.isImmersive() ? U.adaptive('☀️ 日常', '☀️') : U.adaptive('🌙 回忆', '🌙'),
      onclick: function () {
        App.setImmersive(!App.isImmersive());
      }
    });
  };

  /** 重绘当前页面 */
  App.refresh = function () {
    App.render();
  };

  /** 便捷：新建/编辑行程后回到行程页 */
  App.afterTripChange = function (tripId) {
    App.go(tripId ? '#/trip/' + tripId : '#/trips');
  };

  /* ------------------------- 事件绑定 ------------------------- */

  function bind() {
    global.addEventListener('hashchange', function () {
      App.render();
    });
    global.addEventListener('beforeunload', function () {
      Data.releaseUrlCache();
    });
  }

  function start() {
    bind();
    App.boot();
  }

  App.start = start;

})(window);
