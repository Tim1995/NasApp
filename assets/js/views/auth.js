/* ============================================================
 * 小脚丫旅行记 · 首次引导 与 登录
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var Auth = BF.Auth;
  var UI = (BF.UI = BF.UI || {});

  var AuthUI = (BF.AuthUI = {});

  function brandBlock() {
    return U.el('div', { class: 'auth__brand' }, [
      U.el('div', { class: 'brand__mark', text: '👣' }),
      U.el('div', { class: 'brand__text' }, [
        U.el('b', { text: '小脚丫旅行记' }),
        U.el('span', { text: 'OUR LITTLE JOURNEY' })
      ])
    ]);
  }

  function aside() {
    return U.el('div', { class: 'auth__aside' }, [
      brandBlock(),
      U.el('div', { class: 'auth__hero' }, [
        U.el('h1', {}, [
          '把宝宝的每一次远行，',
          U.el('br'),
          '都收进一本会走路的',
          U.el('em', { text: '纪念册' })
        ]),
        U.el('p', {
          text:
            '上传旅途中宝宝与景点的合影，自动生成一辈子的旅行轨迹。二十年后，他打开手机，就能看见自己两岁时站在海边的小小身影。'
        }),
        U.el('div', { class: 'auth__points' }, [
          point('🗺️', '足迹地图', '每张照片都会落在真实的地图上，连成一条只属于他的路线。'),
          point('📸', '照片即坐标', '自动读取照片里的拍摄时间与地点，几乎不用手动填写。'),
          point('💞', '重温模式', '多年后带着父母重走当年的路，新旧照片并排放在一起。')
        ])
      ]),
      U.el('div', {
        class: 'auth__foot',
        text:
          BF.DB.mode === 'server'
            ? '🌐 数据保存在你自己的服务器上 · 任何设备打开这个网址，看到的都是同一份记录'
            : '💻 数据保存在这台设备的浏览器中 · 可随时导出备份'
      })
    ]);
  }

  function point(icon, title, desc) {
    return U.el('div', { class: 'auth__point' }, [
      U.el('span', { text: icon }),
      U.el('span', {}, [U.el('b', { text: title + '　' }), desc])
    ]);
  }

  function layout(panel) {
    return U.el('div', { class: 'auth' }, [aside(), U.el('div', { class: 'auth__panel' }, U.el('div', { class: 'auth__form' }, panel))]);
  }

  /* ============================================================
   * 登录页
   * ============================================================ */

  AuthUI.renderLogin = function (root) {
    return new Promise(function (resolve) {
      var members = Auth.members();
      var memberList = U.el('div', { class: 'auth__members' });

      members.forEach(function (m) {
        var needsPassword = !!m.hash;
        var desc = Auth.roleLabel(m.role);
        if (m.role === 'child' && m.birthDate) desc += ' · ' + U.ageAt(m.birthDate, U.todayISO());
        if (needsPassword) desc += ' · 需要密码';
        memberList.appendChild(
          U.el('button', {
            class: 'member-pick',
            onclick: function () {
              if (!needsPassword) {
                Auth.quickLogin(m.id).then(resolve);
              } else {
                askPassword(m, resolve);
              }
            }
          }, [
            UI.avatar(m, { size: 'md' }),
            U.el('div', { class: 'member-pick__body' }, [
              U.el('div', { class: 'member-pick__name' }, [m.name, U.el('span', { class: 'chip chip--' + (m.role === 'child' ? 'accent' : 'primary'), text: Auth.roleLabel(m.role) })]),
              U.el('div', { class: 'member-pick__desc', text: desc })
            ]),
            U.el('span', { class: 'member-pick__go', text: needsPassword ? '🔒' : '→' })
          ])
        );
      });

      var usernameInput = U.input({ placeholder: '账号，例如 mama', autocomplete: 'username' });
      var passwordInput = U.input({ type: 'password', placeholder: '密码', autocomplete: 'current-password' });
      var errorText = U.el('p', { class: 'field__hint', style: { color: 'var(--danger)' } });

      function submit() {
        errorText.textContent = '';
        Auth.login(usernameInput.value, passwordInput.value)
          .then(resolve)
          .catch(function (err) {
            errorText.textContent = err.message || '登录失败';
          });
      }

      passwordInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submit();
      });

      var serverMode = BF.DB.mode === 'server';
      var hasMembers = members.length > 0;

      var emptyNote = hasMembers
        ? null
        : U.el('div', { class: 'picker-hint mt-16' }, [
            serverMode
              ? '服务器上还没有家庭数据。可能是本机之前的记录还没上传，或者数据目录是空的。'
              : '这台设备上还没有家庭数据。'
          ]);

      var panel = [
        U.el('div', { class: 'auth__title', text: hasMembers ? '欢迎回来' : '登录' }),
        U.el('div', {
          class: 'auth__sub',
          text: Auth.family ? Auth.family.name : serverMode ? '数据保存在服务器上' : '数据保存在这台设备上'
        }),
        emptyNote,
        hasMembers ? memberList : null,
        hasMembers ? U.el('div', { class: 'auth__divider', text: '或使用账号密码登录' }) : null,
        U.field('账号', usernameInput),
        U.field('密码', passwordInput),
        errorText,
        U.el('button', { class: 'btn btn--primary btn--block mt-8', text: '登录', onclick: submit }),
        U.el('div', { class: 'auth__foot-note mt-16' }, [
          U.el('button', {
            class: 'link-btn',
            text: serverMode ? '从备份文件恢复数据（会覆盖服务器上的内容）→' : '换一台设备？导入其他家庭的备份文件 →',
            onclick: function () {
              BF.Backup.pickAndRestore({
                skipConfirm: true,
                onDone: function () {
                  U.toast('导入完成，正在重新载入…', 'success');
                  setTimeout(function () {
                    global.location.reload();
                  }, 700);
                }
              }).catch(function () {});
            }
          })
        ]),
        hasMembers
          ? null
          : U.el('div', { class: 'auth__foot-note' }, [
              U.el('button', {
                class: 'link-btn',
                text: '← 返回，去创建我们家的纪念册',
                onclick: function () {
                  AuthUI.renderWelcome(root).then(resolve);
                }
              })
            ])
      ].filter(Boolean);

      U.render(root, layout(panel));
    });
  };

  function askPassword(member, resolve) {
    var input = U.input({ type: 'password', placeholder: '请输入密码' });
    U.modal({
      title: '你好，' + member.name,
      size: 'sm',
      content: U.el('div', {}, [U.el('p', { class: 'modal__text', text: '这个账号设置了密码，请输入后继续。' }), input]),
      actions: [
        { label: '取消', value: false },
        {
          label: '进入',
          value: true,
          primary: true,
          onClick: function (body, close) {
            Auth.checkPassword(member, input.value).then(function (ok) {
              if (!ok) {
                U.toast('密码不对，再试试', 'error');
                return;
              }
              close('ok');
              Auth.quickLogin(member.id).then(resolve);
            });
            return false;
          }
        }
      ]
    });
  }

  /* ============================================================
   * 首次引导（创建家庭）
   * ============================================================ */

  AuthUI.renderOnboarding = function (root) {
    return new Promise(function (resolve) {
      var draft = {
        familyName: '',
        homeCity: '',
        child: { name: '', birthDate: '', avatarId: '' },
        parents: [{ name: '', relation: '爸爸', username: '', password: '' }]
      };
      var step = 0;
      var stage = U.el('div');

      function head() {
        return U.el('div', {}, [
          U.el('div', {
            class: 'auth__title',
            text: step === 0 ? '先认识一下你们' : step === 1 ? '介绍一下小主角' : '最后，认识一下家里的大人'
          }),
          U.el('div', {
            class: 'auth__sub',
            text:
              step === 0
                ? '这些信息只保存在你自己的服务器上，随时可以修改。'
                : step === 1
                ? '宝宝的生日会用来计算每次旅行时的年龄。'
                : '写个称呼就够了。登录账号是可选的高级选项，内网自用可以直接跳过。'
          }),
          U.el('div', { class: 'flex gap-6 mt-16 mb-16' }, [dot(0), dot(1), dot(2)])
        ]);
      }

      function dot(i) {
        return U.el('span', {
          style: {
            width: i === step ? '22px' : '7px',
            height: '7px',
            borderRadius: '99px',
            background: i <= step ? 'var(--primary)' : 'var(--line-2)',
            transition: 'all .3s'
          }
        });
      }

      function stepOne() {
        var famName = U.input({ value: draft.familyName, placeholder: '例如：小满的家' });
        var city = U.input({ value: draft.homeCity, placeholder: '例如：杭州' });
        famName.addEventListener('input', function () {
          draft.familyName = famName.value;
        });
        city.addEventListener('input', function () {
          draft.homeCity = city.value;
        });
        return [
          U.field('给这个家取个名字', famName),
          U.field('常住城市', city, '用于把家常住地也标在地图上（可留空）'),
          U.el('div', { class: 'flex gap-10 mt-16' }, [
            U.el('button', {
              class: 'btn btn--ghost',
              text: '← 返回',
              onclick: function () {
                AuthUI.renderWelcome(root).then(resolve);
              }
            }),
            U.el('button', { class: 'btn btn--primary grow', text: '下一步', onclick: function () { next(); } })
          ]),
          demoButton()
        ];
      }

      function demoButton() {
        return U.el('div', { class: 'mt-16 center' }, [
          U.el('button', {
            class: 'btn btn--ghost btn--sm',
            text: '✨ 先看看示例数据长什么样',
            onclick: function () {
              BF.Demo.seed().then(function () {
                U.toast('已载入示例家庭，随便逛逛吧', 'success');
                Auth.load().then(function () {
                  Auth.quickLogin(Auth.members().filter(function (m) {
                    return m.role === 'parent';
                  })[0].id).then(resolve);
                });
              });
            }
          })
        ]);
      }

      function stepTwo() {
        var nameInput = U.input({ value: draft.child.name, placeholder: '宝宝的小名或大名' });
        var birthInput = U.input({ type: 'date', value: draft.child.birthDate });
        nameInput.addEventListener('input', function () {
          draft.child.name = nameInput.value;
        });
        birthInput.addEventListener('input', function () {
          draft.child.birthDate = birthInput.value;
        });

        var avatarBtn = U.el('button', { class: 'avatar avatar--xl', type: 'button', title: '上传宝宝照片' });
        avatarBtn.textContent = '📷';
        avatarBtn.addEventListener('click', function () {
          UI.pickImages(function (files) {
            UI.setAvatar(draft.child, files[0]).then(function () {
              return BF.DB.getBlob(draft.child.avatarId);
            }).then(function (blob) {
              if (!blob) return;
              avatarBtn.innerHTML = '';
              avatarBtn.appendChild(U.el('img', { src: URL.createObjectURL(blob) }));
              U.toast('头像已选好', 'success');
            });
          }, { multiple: false });
        });

        return [
          U.el('div', { class: 'flex gap-14 flex-center mb-16' }, [avatarBtn, U.el('div', { class: 'small muted', text: '点左边的圆上传宝宝的照片（可跳过）' })]),
          U.field('宝宝的称呼', nameInput),
          U.field('出生日期', birthInput, '只会用来计算旅行时的年龄，不会外传'),
          U.el('div', { class: 'flex gap-10 mt-16' }, [
            U.el('button', { class: 'btn btn--ghost', text: '上一步', onclick: function () { next(-1); } }),
            U.el('button', {
              class: 'btn btn--primary grow',
              text: '下一步',
              onclick: function () {
                if (!draft.child.name.trim()) return U.toast('先给宝宝起个称呼吧', 'error');
                next();
              }
            })
          ])
        ];
      }

      function stepThree() {
        var wrap = U.el('div');

        function paint() {
          wrap.innerHTML = '';
          draft.parents.forEach(function (p, i) {
            var nameInput = U.input({ value: p.name, placeholder: '称呼，例如：妈妈' });
            nameInput.addEventListener('input', function () {
              p.name = nameInput.value;
            });
            p._nameEl = nameInput;

            var relation = U.select(
              ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '其他'].map(function (r) {
                return { label: r, value: r, selected: p.relation === r };
              }),
              {}
            );
            relation.addEventListener('change', function () {
              p.relation = relation.value;
            });

            var uname = U.input({ value: p.username, placeholder: '英文或拼音，例如 mama' });
            uname.addEventListener('input', function () {
              p.username = uname.value;
            });

            var pwd = U.input({ type: 'password', value: p.password, placeholder: '设置一个密码（可留空）' });
            pwd.addEventListener('input', function () {
              p.password = pwd.value;
            });

            wrap.appendChild(
              U.el('div', { class: 'paper mb-16', style: { padding: '16px' } }, [
                U.el('div', { class: 'flex-between mb-16' }, [
                  U.el('b', { text: '家长 ' + (i + 1) }),
                  draft.parents.length > 1
                    ? U.el('button', {
                        class: 'btn btn--sm btn--danger-ghost',
                        text: '移除',
                        onclick: function () {
                          draft.parents.splice(i, 1);
                          paint();
                        }
                      })
                    : null
                ]),
                U.el('div', { class: 'row' }, [U.field('称呼', nameInput), U.field('关系', relation)]),
                U.el('div', {
                  class: 'field-note',
                  text: '下面两项可选 —— 只在家庭内网使用的话，留空即可，以后随时能补'
                }),
                U.field('登录账号（可选）', uname),
                U.field('登录密码（可选）', pwd, '留空 = 不需要密码；想让外地的亲戚也能访问时，再来设置')
              ])
            );
          });
          if (draft.parents.length < 3) {
            wrap.appendChild(
              U.el('button', {
                class: 'btn btn--ghost btn--block',
                text: '+ 再添加一位家长',
                onclick: function () {
                  draft.parents.push({ name: '', relation: '妈妈', username: '', password: '' });
                  paint();
                }
              })
            );
          }
        }
        paint();

        return [
          wrap,
          U.el('div', { class: 'flex gap-10 mt-16' }, [
            U.el('button', { class: 'btn btn--ghost', text: '上一步', onclick: function () { next(-1); } }),
            U.el('button', { class: 'btn btn--primary grow', text: '创建我的纪念册', onclick: submit })
          ])
        ];
      }

      function submit() {
        var parents = draft.parents.filter(function (p) {
          return (p.name || '').trim();
        });
        if (!parents.length) return U.toast('至少添加一位家长吧', 'error');
        // 登录账号是可选的；只有在填了的情况下才检查重复
        var dup = {};
        for (var i = 0; i < parents.length; i++) {
          var un = (parents[i].username || '').trim().toLowerCase();
          if (!un) continue;
          if (dup[un]) return U.toast('账号「' + un + '」重复了，换一个吧', 'error');
          dup[un] = true;
        }

        Auth.createFamily({
          familyName: draft.familyName.trim() || draft.child.name.trim() + '的家',
          homeCity: draft.homeCity.trim(),
          child: draft.child,
          parents: parents
        }).then(function (kid) {
          var first = Auth.members().filter(function (m) {
            return m.role === 'parent';
          })[0];
          return Auth.quickLogin(first.id);
        }).then(function () {
          U.toast('纪念册创建好了，开始记录第一段旅程吧', 'success');
          resolve();
        }).catch(function (err) {
          U.toast('创建失败：' + (err.message || err), 'error');
        });
      }

      function next(delta) {
        if (delta === undefined) step = Math.min(2, step + 1);
        else step = Math.max(0, step + delta);
        paintStage();
      }

      function paintStage() {
        U.render(stage, [head()].concat(step === 1 ? stepTwo() : []).concat(step === 2 ? stepThree() : []).concat(step === 0 ? stepOne() : []));
        var inputs = U.$$('input', stage);
        if (inputs.length && step === 0) inputs[0].focus();
      }

      paintStage();
      U.render(root, layout([stage]));
    });
  };

  /* ============================================================
   * 欢迎页：第一次打开时，先让用户选择「从哪开始」
   * ============================================================ */

  function choice(icon, title, desc, badge, onPick) {
    var node = U.el(
      'button',
      {
        class: 'welcome-choice',
        type: 'button',
        onclick: function () {
          if (node.disabled) return;
          node.disabled = true;
          node.classList.add('is-busy');
          onPick();
        }
      },
      [
        U.el('span', { class: 'welcome-choice__icon', text: icon }),
        U.el('div', { class: 'grow' }, [
          U.el('div', { class: 'welcome-choice__title' }, [title, badge ? U.el('span', { class: 'chip chip--accent', text: badge }) : null]),
          U.el('div', { class: 'welcome-choice__desc', text: desc })
        ]),
        U.el('span', { class: 'welcome-choice__go', text: '›' })
      ]
    );
    return node;
  }

  AuthUI.renderWelcome = function (root) {
    return new Promise(function (resolve) {
      var choices = U.el('div', { class: 'welcome-choices' });

      choices.appendChild(
        choice('👶', '创建我们家的纪念册', '第一次使用，从零开始记录宝宝的每一次远行', '', function () {
          AuthUI.renderOnboarding(root).then(resolve);
        })
      );

      var serverMode = BF.DB.mode === 'server';

      choices.appendChild(
        choice(
          '🔑',
          serverMode ? '登录已有账号' : '我已经有账号',
          serverMode
            ? '用爸爸妈妈的账号密码直接登录。数据存在服务器上，任何设备打开这个地址都能看到'
            : '在这台设备上导入之前的备份文件，然后用原来的账号登录',
          '',
          function () {
            if (serverMode) {
              AuthUI.renderLogin(root).then(resolve);
              return;
            }
            BF.Backup.pickAndRestore({
              skipConfirm: true,
              onDone: function () {
                U.toast('导入完成，正在重新载入…', 'success');
                setTimeout(function () {
                  global.location.reload();
                }, 700);
              }
            }).catch(function () {
              // 导入失败或取消，恢复可点击
              U.$$('.welcome-choice', choices).forEach(function (n) {
                n.disabled = false;
                n.classList.remove('is-busy');
              });
            });
          }
        )
      );

      choices.appendChild(
        choice('✨', '先看看示例数据', '用一段完整的示例旅行体验所有功能，之后可以随时清空', '推荐', function () {
          BF.Demo.seed()
            .then(function () {
              return Auth.load();
            })
            .then(function () {
              var parent = Auth.members().filter(function (m) {
                return m.role === 'parent';
              })[0];
              return Auth.quickLogin(parent.id);
            })
            .then(function () {
              U.toast('示例家庭已就绪', 'success');
              resolve();
            })
            .catch(function (err) {
              U.toast('载入示例失败：' + (err.message || err), 'error');
              U.$$('.welcome-choice', choices).forEach(function (n) {
                n.disabled = false;
                n.classList.remove('is-busy');
              });
            });
        })
      );

      var panel = [
        U.el('div', { class: 'auth__title', text: '欢迎来到小脚丫旅行记' }),
        U.el('div', { class: 'auth__sub', text: '先选择一种开始的方式' }),
        choices,
        U.el('div', { class: 'auth__foot-note', text: '所有照片与旅行记录都保存在你自己的设备里，不会上传到任何服务器。' })
      ];

      U.render(root, layout(panel));
    });
  };

  AuthUI.render = function (root, mode) {
    if (mode === 'onboarding') return AuthUI.renderOnboarding(root);
    if (mode === 'welcome') return AuthUI.renderWelcome(root);
    return AuthUI.renderLogin(root);
  };

})(window);
