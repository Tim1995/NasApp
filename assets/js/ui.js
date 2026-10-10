/* ============================================================
 * 小脚丫旅行记 · 共享界面组件
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var DB = BF.DB;
  var Data = BF.Data;

  var UI = (BF.UI = {});

  /* ------------------------- 头像 ------------------------- */

  var avatarUrlCache = {};

  UI.avatar = function (member, opts) {
    opts = opts || {};
    var role = (member && member.role) || 'guest';
    var cls = 'avatar avatar--' + role + (opts.size ? ' avatar--' + opts.size : '');
    var node = U.el('div', { class: cls, title: (member && member.name) || '' });
    var name = (member && member.name) || '?';
    node.textContent = name.slice(0, 1);

    if (member && member.avatarId) {
      var url = avatarUrlCache[member.avatarId];
      if (url) {
        U.render(node, U.el('img', { src: url, alt: name }));
      } else {
        BF.Data.imageUrlById(member.avatarId, 'avatar').then(function (u) {
          if (!u) return;
          avatarUrlCache[member.avatarId] = u;
          U.render(node, U.el('img', { src: u, alt: name }));
        });
      }
    }
    return node;
  };

  UI.memberTag = function (member) {
    if (!member) return U.el('span', { class: 'chip', text: '未知成员' });
    return U.el('span', { class: 'chip chip--' + (member.role === 'child' ? 'accent' : 'primary') }, [
      UI.avatar(member, { size: 'xs' }),
      member.name
    ]);
  };

  /** 设置成员头像 */
  UI.setAvatar = function (member, file) {
    return BF.Geo.processImage(file, { mainSide: 320, thumbSide: 96 }).then(function (img) {
      var id = member.avatarId || U.uid('ava');
      member.avatarId = id;
      if (avatarUrlCache[id]) {
        URL.revokeObjectURL(avatarUrlCache[id]);
        delete avatarUrlCache[id];
      }
      return DB.putBlob(id, img.main);
    });
  };

  /* ------------------------- 常用块 ------------------------- */

  UI.statCard = function (icon, value, unit, label) {
    return U.el('div', { class: 'stat' }, [
      U.el('div', { class: 'stat__icon', text: icon }),
      U.el('div', { class: 'stat__value' }, [String(value), unit ? U.el('small', { text: unit }) : null]),
      U.el('div', { class: 'stat__label', text: label })
    ]);
  };

  UI.empty = function (opts) {
    return U.el('div', { class: 'empty' }, [
      U.el('div', { class: 'empty__icon', text: opts.icon || '🌱' }),
      U.el('div', { class: 'empty__title', text: opts.title || '这里还是空的' }),
      opts.text ? U.el('p', { class: 'empty__text', text: opts.text }) : null,
      opts.actions && opts.actions.length ? U.el('div', { class: 'empty__actions' }, opts.actions) : null
    ]);
  };

  UI.sectionHead = function (title, hint, actions) {
    return U.el('div', { class: 'section__head' }, [
      U.el('h2', { class: 'section__title', text: title }),
      hint ? U.el('span', { class: 'section__hint', text: hint }) : null,
      actions ? U.el('div', { class: 'section__actions' }, actions) : null
    ]);
  };

  /* ------------------------- 行程卡片 ------------------------- */

  UI.routeText = function (trip) {
    var names = (trip.stops || [])
      .map(function (s) {
        return s.city || s.name;
      })
      .filter(Boolean);
    if (!names.length) return '还没有添加站点';
    var uniq = [];
    names.forEach(function (n) {
      if (uniq[uniq.length - 1] !== n) uniq.push(n);
    });
    if (uniq.length > 4) {
      return uniq.slice(0, 3).join(' → ') + ' → 等 ' + uniq.length + ' 地';
    }
    return uniq.join(' → ');
  };

  UI.tripCard = function (trip, opts) {
    opts = opts || {};
    var cover = Data.tripCoverPhoto(trip);
    var coverBox = U.el('div', { class: 'trip-card__cover' }, [
      U.el('div', { class: 'trip-card__cover-ph', text: '🧳' })
    ]);
    var img = U.el('img', { alt: trip.title });
    img.addEventListener('load', function () {
      img.classList.add('is-ready');
    });
    if (cover) {
      coverBox.appendChild(img);
      Data.fillImage(img, cover, 'thumb');
    }

    var child = null;
    if (trip.childIds && trip.childIds.length) {
      child = BF.Auth.findMember(trip.childIds[0]);
    }
    if (!child) child = BF.Auth.primaryChild();

    var years = U.parseDate(trip.startDate);
    var badgeYear = years ? years.getFullYear() + '年' : '';

    var card = U.el('article', { class: 'trip-card', onclick: function () { BF.App.go('#/trip/' + trip.id); } }, [
      coverBox,
      U.el('div', { class: 'trip-card__ribbon', text: badgeYear }),
      U.el('div', { class: 'trip-card__body' }, [
        U.el('div', { class: 'trip-card__title', text: trip.title || '未命名的旅行' }),
        U.el('div', { class: 'trip-card__meta' }, [
          U.el('span', { text: U.fmtRange(trip.startDate, trip.endDate) }),
          child && child.birthDate
            ? U.el('span', { text: '宝宝 ' + (U.ageAt(child.birthDate, trip.startDate) || '—') })
            : null
        ]),
        U.el('div', { class: 'trip-card__route' }, [U.el('span', { text: '📍 ' + UI.routeText(trip) })]),
        U.el('div', { class: 'trip-card__foot' }, [
          U.el('span', { class: 'chip', text: Data.tripStopCount(trip) + ' 站' }),
          U.el('span', { class: 'chip chip--sky', text: Data.tripPhotoCount(trip) + ' 张照片' }),
          Data.tripKm(trip) > 1
            ? U.el('span', { class: 'chip chip--gold', text: BF.Geo.fmtDistance(Data.tripKm(trip)) })
            : null
        ])
      ])
    ]);
    return card;
  };

  /* ------------------------- 照片 ------------------------- */

  /**
   * createPhotoTile(photo, opts)
   * opts: { onOpen, onDelete, tag }
   */
  UI.photoTile = function (photo, opts) {
    opts = opts || {};
    var btn = U.el('button', {
      class: 'photo',
      type: 'button',
      title: photo.caption || '',
      onclick: function (e) {
        e.stopPropagation();
        if (opts.onOpen) opts.onOpen(photo, e);
      }
    });
    var img = U.el('img', { alt: photo.caption || '旅行照片', loading: 'lazy' });
    img.addEventListener('load', function () {
      img.classList.add('is-ready');
    });
    btn.appendChild(img);
    Data.fillImage(img, photo, 'thumb');

    if (opts.tag) btn.appendChild(U.el('span', { class: 'photo__tag', text: opts.tag }));
    var footBits = [];
    if (photo.takenAt) footBits.push(U.fmtDate(photo.takenAt.slice(0, 10), true));
    if (photo.caption) footBits.push(photo.caption);
    if (footBits.length) {
      btn.appendChild(U.el('div', { class: 'photo__foot' }, footBits.join(' · ')));
    }
    if (photo.lat && photo.lng) {
      btn.appendChild(
        U.el('span', {
          class: 'photo__tag',
          style: { left: 'auto', right: '8px' },
          text: 'GPS'
        })
      );
    }
    return btn;
  };

  /**
   * photoGrid(photos, { onOpen, onUpload, uploadLabel, empty })
   */
  UI.photoGrid = function (photos, opts) {
    opts = opts || {};
    var grid = U.el('div', { class: 'photo-grid' });
    (photos || []).forEach(function (p) {
      grid.appendChild(UI.photoTile(p, { onOpen: opts.onOpen }));
    });
    if (opts.onUpload && BF.Auth.canEdit()) {
      grid.appendChild(
        U.el(
          'button',
          { class: 'upload-tile', type: 'button', onclick: opts.onUpload },
          [U.el('b', { text: '+' }), U.el('span', { text: opts.uploadLabel || '添加照片' })]
        )
      );
    }
    return grid;
  };

  /* ------------------------- 灯箱 ------------------------- */

  /**
   * openLightbox(photos, startIndex, opts)
   * opts: { tripId, onChanged, showMeta }
   */
  UI.openLightbox = function (photos, startIndex, opts) {
    opts = opts || {};
    photos = (photos || []).filter(Boolean);
    if (!photos.length) return;
    var index = Math.max(0, Math.min(startIndex || 0, photos.length - 1));

    var box = U.el('div', { class: 'lightbox' });
    var bar = U.el('div', { class: 'lightbox__bar' });
    var stage = U.el('div', { class: 'lightbox__stage' });
    var foot = U.el('div', { class: 'lightbox__foot' });
    var capEl = U.el('div', { class: 'lightbox__cap' });

    var img = U.el('img', { alt: '' });
    stage.appendChild(img);

    var prevBtn = U.el('button', { class: 'lightbox__nav lightbox__nav--prev', text: '‹', onclick: function () { move(-1); } });
    var nextBtn = U.el('button', { class: 'lightbox__nav lightbox__nav--next', text: '›', onclick: function () { move(1); } });

    U.render(bar, [
      U.el('span', { text: '照片浏览' }),
      U.el('span', { class: 'grow' }),
      U.el('button', { class: 'icon-btn', style: { color: 'inherit' }, text: '✕', title: '关闭', onclick: close })
    ]);

    function paint() {
      var photo = photos[index];
      U.render(img.parentNode, img);
      img.removeAttribute('src');
      Data.photoUrl(photo, 'main').then(function (url) {
        if (url) img.src = url;
      });

      U.render(bar, [
        U.el('span', { text: index + 1 + ' / ' + photos.length }),
        U.el('span', { class: 'grow' }),
        U.el('button', { class: 'icon-btn', style: { color: 'inherit' }, text: '✕', title: '关闭', onclick: close })
      ]);

      U.render(foot, []);
      capEl.textContent = photo.caption || '';

      var metaBits = [];
      if (photo.takenAt) metaBits.push('🕒 ' + photo.takenAt);
      if (photo.lat && photo.lng) metaBits.push('📍 ' + BF.Geo.fmtCoords(photo.lat, photo.lng));
      foot.appendChild(U.el('span', { class: 'lightbox__cap', text: metaBits.join('   ') }));

      var actions = [];
      if (BF.Auth.canEdit() && opts.tripId) {
        actions.push(
          U.el('button', {
            class: 'btn btn--sm btn--ghost',
            text: '编辑说明',
            onclick: function () {
              U.prompt('为这张照片写一句话', photo.caption, { placeholder: '例如：第一次看到大海，宝宝笑得好开心' }).then(function (v) {
                if (v === null) return;
                Data.updatePhoto(opts.tripId, photo.id, { caption: v }).then(function () {
                  U.toast('已保存说明', 'success');
                  paint();
                  if (opts.onChanged) opts.onChanged();
                });
              });
            }
          })
        );
        actions.push(
          U.el('button', {
            class: 'btn btn--sm btn--ghost',
            text: '设为封面',
            onclick: function () {
              var trip = Data.getTrip(opts.tripId);
              if (!trip) return;
              trip.coverPhotoId = photo.id;
              Data.saveTrip(trip).then(function () {
                U.toast('已设为封面', 'success');
                if (opts.onChanged) opts.onChanged();
              });
            }
          })
        );
        actions.push(
          U.el('button', {
            class: 'btn btn--sm btn--danger-ghost',
            text: '删除',
            onclick: function () {
              U.confirm('删除这张照片？删除后无法恢复。', { danger: true, okLabel: '删除' }).then(function (ok) {
                if (!ok) return;
                var wasIndex = index;
                Data.deletePhoto(opts.tripId, photo.id).then(function () {
                  U.toast('照片已删除');
                  photos.splice(wasIndex, 1);
                  if (!photos.length) return close();
                  index = Math.min(index, photos.length - 1);
                  paint();
                  if (opts.onChanged) opts.onChanged();
                });
              });
            }
          })
        );
      }
      if (BF.Auth.canComment() && opts.tripId) {
        actions.unshift(
          U.el('button', {
            class: 'btn btn--sm btn--soft',
            text: '💬 写下回忆',
            onclick: function () {
              U.prompt('写下此刻的想法', '', { placeholder: '多年以后再来读读这段话…' }).then(function (v) {
                if (v === null) return;
                var extra = photo.caption ? photo.caption + '\n' + v : v;
                Data.updatePhoto(opts.tripId, photo.id, { caption: extra }).then(function () {
                  U.toast('已记录', 'success');
                  paint();
                  if (opts.onChanged) opts.onChanged();
                });
              });
            }
          })
        );
      }
      U.render(foot, actions);
      foot.appendChild(capEl);
    }

    function move(delta) {
      index = (index + delta + photos.length) % photos.length;
      paint();
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    }

    function close() {
      document.removeEventListener('keydown', onKey);
      box.style.opacity = '0';
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      }, 200);
    }

    box.appendChild(bar);
    box.appendChild(prevBtn);
    box.appendChild(nextBtn);
    box.appendChild(stage);
    box.appendChild(foot);
    box.style.transition = 'opacity .2s ease';
    document.body.appendChild(box);
    document.addEventListener('keydown', onKey);
    paint();

    // 触屏滑动
    var startX = 0;
    box.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
    }, { passive: true });
    box.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 60) move(dx > 0 ? -1 : 1);
    });
  };

  /* ------------------------- 文件选择辅助 ------------------------- */

  /**
   * pickImages(callback, { multiple })
   */
  UI.pickImages = function (callback, opts) {
    opts = opts || {};
    var input = U.el('input', {
      type: 'file',
      accept: 'image/*',
      multiple: opts.multiple !== false,
      style: { display: 'none' }
    });
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (input.parentNode) input.parentNode.removeChild(input);
      if (files.length) callback(files);
    });
    document.body.appendChild(input);
    input.click();
  };

  /**
   * 让用户挑一张照片，读出其中的 GPS 位置与拍摄时间
   * @returns Promise<{lat, lng, takenAt, camera, name}>
   */
  UI.pickPhotoLocation = function () {
    return new Promise(function (resolve, reject) {
      UI.pickImages(function (files) {
        var file = files[0];
        if (!file) {
          reject(new Error('没有选择照片'));
          return;
        }
        if (/heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '')) {
          reject(new Error('iPhone 的 HEIC 格式暂时读不出位置，可以先在相册里转成 JPG'));
          return;
        }
        BF.Geo.readExifFromFile(file).then(function (exif) {
          if (!BF.Geo.valid(exif.lat, exif.lng)) {
            reject(new Error('这张照片里没有位置信息（拍摄时可能关闭了定位）'));
            return;
          }
          resolve({
            lat: exif.lat,
            lng: exif.lng,
            takenAt: exif.takenAt || '',
            camera: exif.camera || '',
            name: file.name || ''
          });
        }).catch(function () {
          reject(new Error('读取照片信息失败'));
        });
      }, { multiple: false });
    });
  };

  /* ------------------------- 照片上传（带进度） ------------------------- */

  /**
   * uploadPhotos(tripId, stopId, files, { onDone })
   */
  UI.uploadPhotos = function (tripId, stopId, files, opts) {
    opts = opts || {};
    var bar = U.el('i', { style: { width: '0%' } });
    var text = U.el('p', { class: 'modal__text', text: '正在处理照片…（会按需读取拍摄时间与拍摄地点）' });
    var closeFn = null;
    U.modal({
      title: '正在导入 ' + files.length + ' 张照片',
      size: 'sm',
      sticky: true,
      content: U.el('div', {}, [text, U.el('div', { class: 'progress-line' }, bar)]),
      actions: [],
      onMount: function (body, close) {
        closeFn = close;
      }
    });

    return Data.addPhotos(tripId, stopId, files, {
      onProgress: function (done, total) {
        bar.style.width = Math.round((done / total) * 100) + '%';
        text.textContent = '已处理 ' + done + ' / ' + total + ' 张…';
      }
    }).then(function (res) {
      if (closeFn) closeFn('done');
      U.toast('成功导入 ' + res.length + ' 张照片', 'success');
      if (opts.onDone) opts.onDone(res);
      return res;
    }).catch(function (err) {
      if (closeFn) closeFn('error');
      U.toast('导入失败：' + (err.message || err), 'error');
      throw err;
    });
  };

  /* ------------------------- 行程删除 ------------------------- */

  UI.confirmDeleteTrip = function (trip) {
    return U.confirm('确定删除《' + trip.title + '》吗？该行程下的所有照片也会一并删除，且无法恢复。', {
      title: '删除旅行记录',
      danger: true,
      okLabel: '删除'
    });
  };

})(window);
