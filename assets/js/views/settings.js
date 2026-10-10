/* ============================================================
 * 小脚丫旅行记 · 设置（家庭 / 成员 / 备份 / 关于）
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var DB = BF.DB;
  var Auth = BF.Auth;
  var Data = BF.Data;
  var UI = BF.UI;

  BF.Views.settings = {
    title: '设置',
    subtitle: '家庭信息 · 成员账号 · 数据备份',

    render: function (host) {
      var fam = Auth.family || {};

      /* ---------------- 家庭信息 ---------------- */
      var famName = U.input({ value: fam.name || '', placeholder: '例如：小满的家' });
      var motto = U.input({ value: fam.motto || '', placeholder: '一句给未来的话' });

      // 家庭地址：带坐标，用来算「从家出发的实际驾车里程」
      var home = Data.home();
      var homeDraft = home ? { name: home.name, lat: home.lat, lng: home.lng, city: home.city, province: home.province } : null;
      var homeText = U.el('div', { class: 'small muted' });

      function paintHome() {
        if (homeDraft && BF.Geo.valid(homeDraft.lat, homeDraft.lng)) {
          homeText.textContent =
            '📍 ' + (homeDraft.name || '家') + ' · ' + BF.Geo.fmtCoords(homeDraft.lat, homeDraft.lng);
          homeText.style.color = 'var(--accent)';
        } else {
          homeText.textContent = '还没有设置。设好之后，里程会按「从家出发的真实驾车路线」计算。';
          homeText.style.color = '';
        }
      }
      paintHome();

      var pickHomeBtn = U.el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '📍 在地图上设置家庭地址',
        onclick: function () {
          if (!Auth.requireEdit()) return;
          BF.LocationPicker.open(
            homeDraft ? homeDraft.lat : null,
            homeDraft ? homeDraft.lng : null,
            function (lat, lng, meta) {
              homeDraft = {
                name: (meta && meta.name) || (homeDraft && homeDraft.name) || '家',
                lat: lat,
                lng: lng,
                city: (meta && meta.city) || '',
                province: (meta && meta.prov) || ''
              };
              paintHome();
              U.toast('已选择，别忘了点下面的「保存」', 'success');
            },
            { keyword: (fam.homeCity || '').trim(), title: '设置家庭地址' }
          );
        }
      });

      var clearHomeBtn = U.el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '清除',
        onclick: function () {
          if (!Auth.requireEdit()) return;
          homeDraft = null;
          paintHome();
        }
      });

      host.appendChild(
        U.el('section', { class: 'section' }, [
          UI.sectionHead('家庭信息'),
          U.el('div', { class: 'paper' }, [
            U.field('家庭名称', famName),
            U.field(
              '家庭地址',
              U.el('div', {}, [
                U.el('div', { class: 'flex gap-10 wrap mb-16' }, [pickHomeBtn, clearHomeBtn]),
                homeText
              ]),
              '里程会按「从家出发、沿实际道路行驶」计算，而不是两点之间的直线'
            ),
            U.field('家庭寄语', motto, '会显示在纪念册里'),
            U.el('button', {
              class: 'btn btn--primary',
              text: '保存',
              onclick: function () {
                if (!Auth.requireEdit()) return;
                fam.name = famName.value.trim() || fam.name;
                fam.motto = motto.value.trim();
                if (homeDraft && BF.Geo.valid(homeDraft.lat, homeDraft.lng)) {
                  fam.home = homeDraft;
                  fam.homeCity = homeDraft.city || fam.homeCity || '';
                } else {
                  delete fam.home;
                  fam.homeCity = '';
                }
                Auth.saveFamily().then(function () {
                  Data.clearRoadCache();
                  U.toast('已保存', 'success');
                  BF.App.paintUserCard();
                  BF.App.render();
                });
              }
            })
          ])
        ])
      );

      /* ---------------- 成员 ---------------- */
      var memberList = U.el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } });
      Auth.members().forEach(function (m) {
        var card = U.el('div', { class: 'paper', style: { padding: '18px' } }, [
          U.el('div', { class: 'flex gap-14 flex-center' }, [
            UI.avatar(m, { size: 'lg' }),
            U.el('div', { class: 'grow' }, [
              U.el('div', { class: 'display strong', style: { fontSize: '17px' }, text: m.name }),
              U.el('div', { class: 'small muted', text: Auth.roleLabel(m.role) + (m.birthDate ? ' · ' + U.ageAt(m.birthDate, U.todayISO()) : '') + (m.username ? ' · @' + m.username : ' · 无账号') })
            ])
          ]),
          U.el('div', { class: 'flex gap-6 wrap mt-16' }, [
            Auth.canEdit()
              ? U.el('button', { class: 'btn btn--sm btn--ghost', text: '编辑', onclick: function () { memberForm(m); } })
              : null,
            Auth.canEdit()
              ? U.el('button', {
                  class: 'btn btn--sm btn--ghost',
                  text: m.hash ? '改密码' : '设置密码',
                  onclick: function () {
                    U.prompt(m.hash ? '设置新密码（留空表示取消密码）' : '为「' + m.name + '」设置登录密码', '', { required: false, placeholder: '留空则不需要密码' }).then(function (pwd) {
                      if (pwd === null) return;
                      Auth.setPassword(m, pwd).then(function () {
                        return Auth.saveFamily();
                      }).then(function () {
                        U.toast(pwd ? '密码已更新' : '已取消密码', 'success');
                        BF.App.render();
                      });
                    });
                  }
                })
              : null,
            BF.Auth.current && BF.Auth.current.id !== m.id && Auth.canEdit()
              ? U.el('button', {
                  class: 'btn btn--sm btn--danger-ghost',
                  text: '移除',
                  onclick: function () {
                    U.confirm('移除成员「' + m.name + '」？Ta 将无法再登录查看。', { danger: true, okLabel: '移除' }).then(function (ok) {
                      if (!ok) return;
                      Auth.family.members = Auth.members().filter(function (x) {
                        return x.id !== m.id;
                      });
                      Auth.saveFamily().then(function () {
                        U.toast('已移除');
                        BF.App.render();
                      });
                    });
                  }
                })
              : null
          ])
        ]);
        memberList.appendChild(card);
      });

      if (Auth.canEdit()) {
        memberList.appendChild(
          U.el('div', {
            class: 'upload-tile',
            style: { aspectRatio: 'auto', minHeight: '120px' },
            onclick: function () {
              memberForm(null);
            }
          }, [U.el('b', { text: '+' }), U.el('span', { text: '添加成员账号' })])
        );
      }

      host.appendChild(
        U.el('section', { class: 'section' }, [
          UI.sectionHead('家庭成员', '宝宝长大以后，切到自己的名字就能看见小时候的足迹'),
          memberList
        ])
      );

      /* ---------------- 访问方式 ---------------- */
      if (Auth.canEdit()) {
        var protectedOn = !Auth.isOpenMode();
        host.appendChild(
          U.el('section', { class: 'section' }, [
            UI.sectionHead('访问方式'),
            U.el('div', { class: 'paper' }, [
              U.el('div', { class: 'flex-between wrap gap-14' }, [
                U.el('div', { class: 'grow' }, [
                  U.el('div', {
                    class: 'display strong',
                    text: protectedOn ? '🔒 已开启登录保护' : '🏠 免登录（家庭内网推荐）'
                  }),
                  U.el('div', {
                    class: 'small muted mt-8',
                    text: protectedOn
                      ? '打开网站需要先选择成员（设了密码的还要输密码）。'
                      : '任何人打开这个网址就能直接使用，不需要账号密码。'
                  })
                ]),
                U.el('button', {
                  class: 'btn ' + (protectedOn ? 'btn--ghost' : 'btn--primary'),
                  text: protectedOn ? '关闭登录保护' : '开启登录保护',
                  onclick: function () {
                    toggleAuthMode(protectedOn);
                  }
                })
              ]),
              U.el('div', {
                class: 'picker-hint mt-16',
                text:
                  '💡 只要把网址暴露出家庭以外的网络（内网穿透、公网映射、分享给外地亲友），就建议开启登录保护 —— ' +
                  '否则任何拿到网址的人都能查看和修改全家的照片。'
              })
            ])
          ])
        );
      }

      function toggleAuthMode(currentlyProtected) {
        if (currentlyProtected) {
          U.confirm('关闭后，打开网站就不需要任何密码了。确认这台服务只在家庭内网使用吗？', {
            title: '关闭登录保护',
            okLabel: '确认关闭'
          }).then(function (ok) {
            if (!ok) return;
            Auth.setAuthMode('open').then(function () {
              U.toast('已关闭登录保护，打开网站直接进入', 'success');
              Data.releaseUrlCache();
              BF.App.go('#/');
              BF.App.boot();
            });
          });
          return;
        }

        var noAccount = Auth.members().filter(function (m) {
          return !m.username;
        });
        var msg = noAccount.length
          ? noAccount
              .map(function (m) {
                return m.name;
              })
              .join('、') + ' 还没有登录账号，开启后仍然可以点名字直接进入，但建议先给他们补一个账号密码。'
          : '开启后，打开网站需要先选择成员；设了密码的成员要输入密码。';

        U.confirm(msg, { title: '开启登录保护', okLabel: '开启' }).then(function (ok) {
          if (!ok) return;
          Auth.setAuthMode('protected')
            .then(function () {
              return Auth.logout();
            })
            .then(function () {
              U.toast('已开启登录保护', 'success');
              Data.releaseUrlCache();
              BF.App.go('#/');
              BF.App.boot();
            });
        });
      }

      /* ---------------- 备份 ---------------- */
      var usageText = U.el('div', { class: 'small muted' });
      DB.estimate().then(function (e) {
        usageText.textContent =
          '当前已用存储：' + U.formatBytes(e.usage) + (e.quota ? '（浏览器可用上限约 ' + U.formatBytes(e.quota) + '）' : '') +
          '　·　' + Data.trips.length + ' 段旅程 / ' + Data.stats().photoCount + ' 张照片';
      });

      /* 当前存储位置一目了然 */
      var isServer = DB.mode === 'server';
      var modeCard = U.el('div', { class: 'storage-card' + (isServer ? ' is-server' : '') }, [
        U.el('div', { class: 'storage-card__icon', text: isServer ? '🌐' : '💻' }),
        U.el('div', { class: 'grow' }, [
          U.el('div', { class: 'storage-card__title', text: isServer ? '数据存在服务器上' : '数据只存在这台设备上' }),
          U.el('div', {
            class: 'storage-card__desc',
            text: isServer
              ? '手机、平板、电脑打开同一个网址，看到的都是同一份记录。服务器会一直替你们保存。'
              : '换一台设备就看不到了，清理浏览器数据还会丢失。建议用 node server.js 启动，把数据放到服务器上。'
          }),
          U.el('div', {
            class: 'storage-card__path',
            text: isServer && DB.serverInfo && DB.serverInfo.dataDir
              ? '📁 ' + DB.serverInfo.dataDir
              : '启用方法见 README「部署到 NAS / 服务器」一节'
          })
        ])
      ]);

      var backupCard = U.el('div', { class: 'paper' }, [
        modeCard,
        U.el('div', { class: 'display strong mb-16', text: '把纪念册打包保存' }),
        U.el('p', { class: 'small muted mb-16', text: '导出一个 .zip 文件，里面包含全部旅行数据与原始照片。建议定期备份到电脑或网盘，换手机、换电脑时导入即可完整恢复。' }),
        usageText,
        U.el('div', { class: 'flex gap-10 wrap mt-16' }, [
          U.el('button', {
            class: 'btn btn--primary',
            text: '⬇ 导出备份',
            onclick: function () {
              exportBackup(this);
            }
          }),
          U.el('button', {
            class: 'btn btn--ghost',
            text: '⬆ 导入备份',
            onclick: function () {
              importBackup();
            }
          }),
          isServer
            ? U.el('button', {
                class: 'btn btn--ghost',
                text: '☁ 把本机数据传到服务器',
                onclick: function () {
                  DB.localHasData().then(function (has) {
                    if (!has) {
                      U.toast('这台设备上没有找到本机数据', 'error');
                      return;
                    }
                    U.confirm(
                      '把保存在这台设备浏览器里的旧数据上传到服务器吗？如果服务器上已经有内容，同名行程会被覆盖。',
                      { title: '上传本机数据', okLabel: '开始上传' }
                    ).then(function (ok) {
                      if (!ok) return;
                      BF.App.runMigration()
                        .then(function () {
                          global.location.reload();
                        })
                        .catch(function () {});
                    });
                  });
                }
              })
            : null
        ].filter(Boolean))
      ]);

      /* ---------------- 地图搜索 ---------------- */
      var keyInput = U.input({ value: BF.Places.getAmapKey(), placeholder: '粘贴你的高德「Web服务」Key（可留空）' });
      var keyState = U.el('div', { class: 'small muted mt-8' });

      function paintKeyState() {
        var st = BF.Places.onlineStatus();
        if (st.hasKey) {
          keyState.textContent =
            '✅ 已启用高德搜索' +
            (st.serverHasKey ? '（Key 保存在服务器上，家里所有设备共用）' : '（Key 保存在这台设备上）') +
            '，地方景区、小店、民宿都能搜到，响应也快。';
          keyState.style.color = 'var(--accent)';
        } else {
          keyState.textContent =
            '当前没有配置 Key：搜索会先查内置地点库（' +
            BF.Places.count +
            ' 条，瞬时返回），查不到时自动转向在线地图——覆盖够用，但免费数据源较慢，通常要 5~15 秒。' +
            '配上 Key 之后，随便搜什么都是一秒出结果。';
          keyState.style.color = '';
        }
      }
      paintKeyState();

      host.appendChild(
        U.el('section', { class: 'section' }, [
          UI.sectionHead('地图搜索'),
          U.el('div', { class: 'paper' }, [
            U.el('div', { class: 'display strong mb-16', text: '让「搜索景点」更好用' }),
            U.el('p', {
              class: 'small muted mb-16',
              text:
                '添加站点时可以直接搜索地点名定位。内置地点库收录了全国主要城市与数百个热门景点，完全离线可用，' +
                '但它装不下全国几十万个地方景区、民宿和小店。填一个高德 Key 之后，什么都能搜到。'
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
              U.el('li', { text: '服务平台务必选「Web服务」（不是 Web端 / JS API），提交后会得到一串 Key' })
            ]),
            U.field(
              '高德 Web 服务 Key',
              keyInput,
              DB.mode === 'server'
                ? '保存在服务器上，家里所有设备共用，只需配置一次'
                : '保存在这台设备上'
            ),
            keyState,
            U.el('div', { class: 'flex gap-10 wrap mt-16' }, [
              U.el('button', {
                class: 'btn btn--primary btn--sm',
                text: '保存',
                onclick: function () {
                  var v = keyInput.value.trim();
                  BF.Places.saveKey(v).then(function () {
                    paintKeyState();
                    U.toast(v ? 'Key 已保存' : '已清除 Key，回到内置地点库', 'success');
                  });
                }
              }),
              U.el('button', {
                class: 'btn btn--ghost btn--sm',
                text: '测试在线搜索',
                onclick: function () {
                  var self = this;
                  self.disabled = true;
                  self.textContent = '搜索中…';
                  U.toast(BF.Places.hasKey() ? '正在搜索…' : '使用免费数据源，可能要等十几秒…');
                  BF.Places.search('苏州').then(function (res) {
                    self.disabled = false;
                    self.textContent = '测试在线搜索';
                    if (!res.merged.length) {
                      var firstErr = res.errors.filter(function (x) {
                        return x.reason !== 'no-key';
                      })[0];
                      U.toast(firstErr ? firstErr.message : '没有搜到结果，请确认 Key 是否正确', 'error');
                      return;
                    }
                    U.toast('搜索正常：找到「' + res.merged[0].name + '」等 ' + res.merged.length + ' 条结果', 'success');
                  });
                }
              })
            ])
          ])
        ])
      );

      host.appendChild(U.el('section', { class: 'section' }, [UI.sectionHead('数据与备份'), backupCard]));

      /* ---------------- 显示偏好 ---------------- */
      var immersiveOn = BF.App.isImmersive();
      host.appendChild(
        U.el('section', { class: 'section' }, [
          UI.sectionHead('显示'),
          U.el('div', { class: 'paper flex-between wrap gap-14' }, [
            U.el('div', { class: 'grow' }, [
              U.el('div', { class: 'display strong', text: '回忆模式' }),
              U.el('div', {
                class: 'small muted mt-8',
                text: '深色界面，适合晚上安静地翻看旧时光。手机上默认收在这里，避免顶栏太挤。'
              })
            ]),
            U.el('button', {
              class: 'btn ' + (immersiveOn ? 'btn--primary' : 'btn--ghost'),
              text: immersiveOn ? '已开启 · 点此关闭' : '开启回忆模式',
              onclick: function () {
                BF.App.setImmersive(!BF.App.isImmersive());
              }
            })
          ])
        ])
      );

      /* ---------------- 危险操作 ---------------- */
      if (Auth.canEdit()) {
        host.appendChild(
          U.el('section', { class: 'section' }, [
            UI.sectionHead('危险操作'),
            U.el('div', { class: 'paper' }, [
              U.el('p', {
                class: 'small muted mb-16',
                text: isServer
                  ? '会删除服务器上的全部家庭信息、旅行记录与照片，且无法恢复。所有设备都会清空。如果只是想重新开始，建议先导出备份。'
                  : '会删除本机上的全部家庭信息、旅行记录与照片，且无法恢复。如果只是想重新开始，建议先导出备份。'
              }),
              U.el('button', {
                class: 'btn btn--danger',
                text: isServer ? '清空服务器上的全部数据' : '清空全部数据',
                onclick: function () {
                  U.confirm(
                    isServer ? '真的要清空服务器上的全部数据吗？所有设备都会一起清空，且不可恢复。' : '真的要清空全部数据吗？此操作不可恢复。',
                    { title: '清空全部数据', danger: true, okLabel: '我确定，清空' }
                  ).then(function (ok) {
                    if (!ok) return;
                    DB.resetAll().then(function () {
                      Data.releaseUrlCache();
                      U.toast('已清空，正在重新开始…');
                      setTimeout(function () {
                        global.location.reload();
                      }, 700);
                    }).catch(function (err) {
                      U.toast('清空失败：' + (err.message || err), 'error');
                    });
                  });
                }
              })
            ])
          ])
        );
      }

      /* ---------------- 关于 ---------------- */
      host.appendChild(
        U.el('section', { class: 'section' }, [
          UI.sectionHead('关于'),
          U.el('div', { class: 'paper' }, [
            U.el('div', { class: 'display strong mb-16', text: '👣 小脚丫旅行记' }),
            U.el('p', { class: 'small muted', text: '一本会走路的旅行纪念册。为家里的小宝宝记录每一次远行，等他长大以后，用自己的账号登录，就能看见自己走过的地方。' }),
            U.el('p', {
              class: 'small muted mt-8',
              text:
                DB.mode === 'server'
                  ? '数据保存在你自己的服务器上，不经过任何第三方。只要这个服务器还在，记录就一直都在。'
                  : '所有数据都保存在你自己的设备里，不会上传到任何服务器。'
            }),
            U.el('div', { class: 'flex gap-6 wrap mt-16' }, [
              U.el('span', { class: 'chip chip--accent', text: '支持手机浏览器' }),
              U.el('span', { class: 'chip chip--accent', text: '可添加到主屏幕' }),
              U.el('span', { class: 'chip chip--sky', text: '内置 ' + BF.Places.count + ' 个地点可离线搜索' }),
              U.el('span', { class: 'chip chip--gold', text: '后期可扩展为小程序' })
            ])
          ])
        ])
      );

      /* ---------------- 成员编辑弹窗 ---------------- */
      function memberForm(member) {
        var isNew = !member;
        var m = member || { name: '', role: 'child', relation: '宝宝', birthDate: '', username: '' };
        var nameInput = U.input({ value: m.name, placeholder: '称呼，例如：小满 / 妈妈' });
        var roleSelect = U.select([
          { label: '宝宝（浏览为主，可写下回忆）', value: 'child', selected: m.role === 'child' },
          { label: '家长（可以添加和修改记录）', value: 'parent', selected: m.role === 'parent' },
          { label: '访客（只看，不能修改）', value: 'guest', selected: m.role === 'guest' }
        ]);
        var birthInput = U.input({ type: 'date', value: m.birthDate || '' });
        var unameInput = U.input({ value: m.username || '', placeholder: '登录账号，例如 xiaoman' });
        var pwdInput = U.input({ type: 'password', placeholder: '登录密码（可留空）' });

        U.modal({
          title: isNew ? '添加成员' : '编辑成员',
          content: U.el('div', {}, [
            U.field('称呼', nameInput),
            U.field('身份', roleSelect),
            U.field('出生日期', birthInput, '宝宝会用来计算每次旅行时的年龄'),
            U.el('div', { class: 'row' }, [U.field('登录账号', unameInput), U.field('登录密码', pwdInput)])
          ]),
          actions: [
            { label: '取消', value: false },
            { label: '保存', value: true, primary: true }
          ]
        }).then(function (ok) {
          if (!ok) return;
          if (!nameInput.value.trim()) return U.toast('请填写称呼', 'error');

          var apply = function (target) {
            target.name = nameInput.value.trim();
            target.role = roleSelect.value;
            target.relation = roleSelect.value === 'child' ? '宝宝' : roleSelect.value === 'parent' ? '家长' : '访客';
            target.birthDate = birthInput.value;
            target.username = unameInput.value.trim().toLowerCase();
            if (pwdInput.value) return Auth.setPassword(target, pwdInput.value);
            return Promise.resolve();
          };

          if (isNew) {
            var created = Auth.makeMember({ name: nameInput.value.trim(), role: roleSelect.value, birthDate: birthInput.value, username: unameInput.value.trim() });
            created.relation = roleSelect.value === 'child' ? '宝宝' : roleSelect.value === 'parent' ? '家长' : '访客';
            apply(created).then(function () {
              Auth.family.members.push(created);
              return Auth.saveFamily();
            }).then(function () {
              U.toast('成员已添加', 'success');
              BF.App.render();
            });
          } else {
            apply(member).then(function () {
              return Auth.saveFamily();
            }).then(function () {
              U.toast('已保存', 'success');
              BF.App.render();
            });
          }
        });
      }

      /* ---------------- 导出 / 导入 ---------------- */
      function exportBackup(btn) {
        btn.disabled = true;
        btn.textContent = '正在打包…';
        U.toast('开始打包，照片多的话需要一点时间…');

        BF.Backup.exportAndDownload()
          .then(function (blob) {
            U.toast('备份文件已生成：' + U.formatBytes(blob.size), 'success');
          })
          .catch(function (err) {
            U.toast('导出失败：' + (err.message || err), 'error');
          })
          .then(function () {
            btn.disabled = false;
            btn.textContent = '⬇ 导出备份';
          });
      }

      function importBackup() {
        BF.Backup.pickAndRestore({
          onDone: function (meta) {
            U.toast('导入完成，正在重新载入…', 'success');
            setTimeout(function () {
              global.location.reload();
            }, 800);
          }
        });
      }
    }
  };

})(window);
