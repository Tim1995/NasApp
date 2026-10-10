/* ============================================================
 * 小脚丫旅行记 · 重温模式
 * 带着父母重走当年的路，把「当年」和「今天」放在一起。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var Data = BF.Data;
  var Auth = BF.Auth;
  var UI = BF.UI;

  /* ============================================================
   * 对比滑块
   * ============================================================ */

  function renderCompare(oldPhoto, newPhoto, labels) {
    labels = labels || {};
    var box = U.el('div', { class: 'compare' });

    // 底层放「今天」的照片，上层裁切出左半边显示「当年」，形成左右对照
    var newImg = U.el('img', { alt: '今天的照片' });
    var oldImg = U.el('img', { alt: '当年的照片' });
    var after = U.el('div', { class: 'compare__after' }, oldImg);
    var handle = U.el('div', { class: 'compare__handle', style: { left: '50%' } });

    Data.fillImage(newImg, newPhoto, 'main');
    Data.fillImage(oldImg, oldPhoto, 'main');

    box.appendChild(newImg);
    box.appendChild(after);
    box.appendChild(handle);
    box.appendChild(U.el('span', { class: 'compare__label compare__label--l', text: labels.left || '当年' }));
    box.appendChild(U.el('span', { class: 'compare__label compare__label--r', text: labels.right || '今天' }));

    var dragging = false;
    function setPct(pct) {
      pct = Math.max(2, Math.min(98, pct));
      after.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
      handle.style.left = pct + '%';
    }

    function onMove(clientX) {
      var rect = box.getBoundingClientRect();
      setPct(((clientX - rect.left) / rect.width) * 100);
    }

    box.addEventListener('pointerdown', function (e) {
      dragging = true;
      box.setPointerCapture && box.setPointerCapture(e.pointerId);
      onMove(e.clientX);
    });
    box.addEventListener('pointermove', function (e) {
      if (dragging) onMove(e.clientX);
    });
    box.addEventListener('pointerup', function () {
      dragging = false;
    });
    box.addEventListener('pointercancel', function () {
      dragging = false;
    });

    return box;
  }
  BF.renderCompare = renderCompare;

  /* ============================================================
   * 纪念卡生成（Canvas 合成，可直接分享）
   * ============================================================ */

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCover(ctx, img, x, y, w, h, r) {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    var scale = Math.max(w / img.width, h / img.height);
    var dw = img.width * scale;
    var dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function makeCard(trip, stop, item, revisit) {
    var W = 1080;
    var H = 1440;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var jobs = [
      Data.photoUrl(oldPhotoOf(item), 'main'),
      Data.photoUrl(item.newPhoto, 'main')
    ];

    return Promise.all(jobs.map(function (p) {
      return p.then(function (url) {
        return url ? loadImage(url).catch(function () { return null; }) : null;
      });
    })).then(function (imgs) {
      // 背景
      var grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#fdf8f3');
      grad.addColorStop(1, '#f4ece3');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#d9663f';
      ctx.fillRect(0, 0, W, 10);

      // 标题
      ctx.fillStyle = '#2f2a25';
      ctx.font = '600 46px "Songti SC", "Microsoft YaHei", serif';
      ctx.textAlign = 'center';
      ctx.fillText(trip.title || '一段旅程', W / 2, 96);

      ctx.font = '26px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#a2988c';
      ctx.fillText('重 温 · ' + (stop.name || '') + '　' + U.fmtDate(revisit.date), W / 2, 140);

      // 两张照片
      var pad = 66;
      var imgW = W - pad * 2;
      var imgH = 470;
      var y1 = 196;
      var y2 = y1 + imgH + 74;

      if (imgs[0]) drawCover(ctx, imgs[0], pad, y1, imgW, imgH, 26);
      else {
        ctx.fillStyle = '#eadfd3';
        roundRect(ctx, pad, y1, imgW, imgH, 26);
        ctx.fill();
      }
      if (imgs[1]) drawCover(ctx, imgs[1], pad, y2, imgW, imgH, 26);
      else {
        ctx.fillStyle = '#eadfd3';
        roundRect(ctx, pad, y2, imgW, imgH, 26);
        ctx.fill();
      }

      // 标签
      function label(text, x, y) {
        ctx.font = '600 26px system-ui, "Microsoft YaHei", sans-serif';
        var w = ctx.measureText(text).width + 40;
        ctx.fillStyle = 'rgba(30,24,20,.62)';
        roundRect(ctx, x, y, w, 46, 23);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 20, y + 33);
      }
      var op = oldPhotoOf(item);
      label('当 年 · ' + (op && op.takenAt ? U.fmtDate(op.takenAt.slice(0, 10)) : U.fmtDate(trip.startDate)), pad + 18, y1 + 18);
      label('今 天 · ' + U.fmtDate(revisit.date), pad + 18, y2 + 18);

      // 文案
      var noteY = y2 + imgH + 52;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6d6459';
      ctx.font = '28px system-ui, "Microsoft YaHei", sans-serif';
      var line = revisit.note || stop.note || '同一条路，隔了许多年，又被我们走了一遍。';
      var chars = Math.floor((W - pad * 2) / 28);
      var lines = [];
      for (var i = 0; i < line.length; i += chars) lines.push(line.slice(i, i + chars));
      lines.slice(0, 2).forEach(function (t, i) {
        ctx.fillText(t, W / 2, noteY + i * 42);
      });

      // 页脚
      ctx.fillStyle = '#a2988c';
      ctx.font = '24px system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText('👣 小脚丫旅行记 · ' + (Auth.family ? Auth.family.name : ''), W / 2, H - 56);

      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          resolve(blob);
        }, 'image/png');
      });
    });
  }

  function oldPhotoOf(item, trip) {
    if (item.oldPhoto) return item.oldPhoto;
    var t = trip || Data.getTrip(item.tripId);
    return t ? Data.findPhoto(t, item.oldPhotoId) : null;
  }

  /* ============================================================
   * 重温流程
   * ============================================================ */

  var Revisit = (BF.Revisit = {});

  Revisit.chooseTrip = function () {
    var candidates = Data.trips.filter(function (t) {
      return Data.tripPhotoCount(t) > 0;
    });
    if (!candidates.length) {
      U.toast('还没有带照片的旅行记录', 'error');
      return;
    }
    var list = U.el('div', {});
    var sorted = candidates.slice().sort(function (a, b) {
      return String(a.startDate || '').localeCompare(String(b.startDate || ''));
    });
    var selected = sorted[0].id;

    sorted.forEach(function (t) {
      var cover = Data.tripCoverPhoto(t);
      var thumb = U.el('div', { class: 'line-item__thumb' });
      if (cover) {
        var im = U.el('img', { alt: '' });
        thumb.appendChild(im);
        Data.fillImage(im, cover, 'thumb');
      }
      var row = U.el('div', {
        class: 'line-item',
        style: { marginBottom: '8px', borderColor: t.id === selected ? 'var(--primary)' : '' },
        onclick: function () {
          selected = t.id;
          U.$$('.line-item', list).forEach(function (n) {
            n.style.borderColor = '';
          });
          row.style.borderColor = 'var(--primary)';
        }
      }, [
        thumb,
        U.el('div', { class: 'line-item__body' }, [
          U.el('div', { class: 'line-item__title', text: t.title }),
          U.el('div', { class: 'line-item__meta', text: U.fmtRange(t.startDate, t.endDate) + ' · ' + Data.tripStopCount(t) + ' 站 · ' + Data.tripPhotoCount(t) + ' 张照片' })
        ])
      ]);
      list.appendChild(row);
    });

    return U.modal({
      title: '重温哪一段旅程？',
      content: U.el('div', {}, [
        U.el('p', { class: 'modal__text mb-16', text: '选一段想重新走一遍的旅程。稍后可以为每一站上传「今天」拍下的照片。' }),
        list
      ]),
      actions: [
        { label: '取消', value: null },
        { label: '开始重温', value: 'go', primary: true, onClick: function () {} }
      ]
    }).then(function (v) {
      if (!v) return;
      return Revisit.startFor(Data.getTrip(selected));
    });
  };

  Revisit.startFor = function (trip) {
    if (!trip) return;
    if (!Auth.canComment()) {
      U.toast('访客只能浏览，无法创建重温记录', 'error');
      return;
    }
    var rv = Data.newRevisit(trip);
    var items = (trip.stops || []).map(function (stop) {
      var photos = stop.photos || [];
      var old = photos.length ? photos[0] : null;
      return { stopId: stop.id, stopName: stop.name, oldPhotoId: old ? old.id : '', newPhoto: null, note: '' };
    }).filter(function (i) {
      return i.oldPhotoId;
    });

    if (!items.length) {
      U.toast('这段旅程还没有照片，先上传照片再来重温吧', 'error');
      return;
    }

    var list = U.el('div', {});

    function paint() {
      U.render(list, []);
      items.forEach(function (item, i) {
        var stop = Data.getStop(trip, item.stopId);
        var oldPhoto = Data.findPhoto(trip, item.oldPhotoId);
        var oldThumb = U.el('div', { class: 'line-item__thumb' });
        if (oldPhoto) {
          var im = U.el('img', { alt: '' });
          oldThumb.appendChild(im);
          Data.fillImage(im, oldPhoto, 'thumb');
        }
        var newThumb = U.el('div', {
          class: 'line-item__thumb',
          style: { display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '20px' },
          title: '上传今天的照片',
          text: item.newPhoto ? '' : '+'
        });
        if (item.newPhoto) {
          var im2 = U.el('img', { alt: '' });
          newThumb.appendChild(im2);
          Data.fillImage(im2, item.newPhoto, 'thumb');
        }

        newThumb.addEventListener('click', function () {
          UI.pickImages(function (files) {
            var file = files[0];
            BF.Geo.readExifFromFile(file).then(function (exif) {
              return BF.Geo.processImage(file).then(function (img) {
                var np = {
                  id: U.uid('rph'),
                  blobId: U.uid('blob'),
                  thumbId: U.uid('thumb'),
                  takenAt: exif.takenAt || '',
                  lat: exif.lat,
                  lng: exif.lng,
                  width: img.width,
                  height: img.height,
                  name: file.name
                };
                return BF.DB.putBlob(np.blobId, img.main).then(function () {
                  return BF.DB.putBlob(np.thumbId, img.thumb);
                }).then(function () {
                  if (item.newPhoto) {
                    BF.DB.delBlob(item.newPhoto.blobId);
                    BF.DB.delBlob(item.newPhoto.thumbId);
                  }
                  item.newPhoto = np;
                  paint();
                });
              });
            }).catch(function (err) {
              U.toast('照片处理失败：' + (err.message || err), 'error');
            });
          }, { multiple: false });
        });

        list.appendChild(
          U.el('div', { class: 'line-item', style: { marginBottom: '8px', cursor: 'default' } }, [
            U.el('div', { class: 'line-item__body' }, [
              U.el('div', { class: 'line-item__title', text: '第 ' + (i + 1) + ' 站 · ' + (item.stopName || '未命名站点') }),
              U.el('div', { class: 'line-item__meta', text: item.newPhoto ? '今天的照片已添加' : '点右侧方块上传今天的照片' })
            ]),
            oldThumb,
            U.el('span', { class: 'muted', text: '→' }),
            newThumb
          ])
        );
      });
    }
    paint();

    var noteInput = U.textarea({ placeholder: '这次重温，你想说点什么？（可留空）' });
    var dateInput = U.input({ type: 'date', value: rv.date });

    return U.modal({
      title: '重温《' + trip.title + '》',
      size: 'lg',
      content: U.el('div', {}, [
        U.el('p', { class: 'modal__text mb-16', text: '左边是当年的照片，右边放今天在同一个地方拍的照片。' }),
        list,
        U.el('div', { class: 'row mt-16' }, [U.field('重温日期', dateInput)]),
        U.field('想说的话', noteInput)
      ]),
      actions: [
        { label: '取消', value: null },
        { label: '保存这次重温', value: 'save', primary: true }
      ]
    }).then(function (v) {
      if (!v) {
        // 取消时清理已上传的新照片
        items.forEach(function (item) {
          if (item.newPhoto) {
            BF.DB.delBlob(item.newPhoto.blobId);
            BF.DB.delBlob(item.newPhoto.thumbId);
          }
        });
        return;
      }
      rv.date = dateInput.value || U.todayISO();
      rv.note = noteInput.value.trim();
      rv.items = items.filter(function (i) {
        return i.newPhoto;
      }).map(function (i) {
        return { stopId: i.stopId, oldPhotoId: i.oldPhotoId, newPhoto: i.newPhoto, note: i.note };
      });
      if (!rv.items.length) {
        U.toast('至少为某一站添加今天的照片吧', 'error');
        return;
      }
      Data.saveRevisit(rv).then(function () {
        U.toast('这次重温已经收进纪念册了', 'success');
        BF.App.go('#/rv/' + rv.id);
      });
    });
  };

  /* ============================================================
   * 重温列表
   * ============================================================ */

  BF.Views.revisit = {
    title: '重温',
    subtitle: '同一条路，隔了许多年，又被我们走了一遍',

    actions: function () {
      if (!Auth.canComment()) return [];
      return [
        U.el('button', {
          class: 'btn btn--primary btn--sm',
          text: U.adaptive('＋ 开始一次重温', '＋ 重温'),
          onclick: function () {
            Revisit.chooseTrip();
          }
        })
      ];
    },

    render: function (host) {
      if (!Data.revisits.length) {
        host.appendChild(
          UI.empty({
            icon: '💞',
            title: '还没有重温记录',
            text:
              '当父母老了、当宝宝长大了，可以照着当年的路线再走一遍，在同一个位置拍一张今天的照片。' +
              '两张照片放在一起，就是时间的样子。',
            actions: Auth.canComment()
              ? [U.el('button', { class: 'btn btn--primary', text: '选择一段旅程开始重温', onclick: function () { Revisit.chooseTrip(); } })]
              : []
          })
        );
        // 顺便展示可重温的旅程
        var candidates = Data.trips.filter(function (t) {
          return Data.tripPhotoCount(t) > 0;
        });
        if (candidates.length) {
          host.appendChild(
            U.el('section', { class: 'section mt-24' }, [
              UI.sectionHead('可以重温的旅程'),
              U.el('div', { class: 'grid grid--trips' }, candidates.map(function (t) {
                return UI.tripCard(t);
              }))
            ])
          );
        }
        return;
      }

      var grid = U.el('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } });
      Data.revisits.forEach(function (rv) {
        var trip = Data.getTrip(rv.tripId);
        var item = rv.items[0];
        var box = U.el('div', { class: 'trip-card', onclick: function () { BF.App.go('#/rv/' + rv.id); } });

        if (item && item.newPhoto) {
          var thumbHost = U.el('div', { class: 'trip-card__cover' });
          var im = U.el('img', { alt: '' });
          im.addEventListener('load', function () {
            im.classList.add('is-ready');
          });
          thumbHost.appendChild(im);
          Data.fillImage(im, item.newPhoto, 'thumb');
          box.appendChild(thumbHost);
        }

        box.appendChild(
          U.el('div', { class: 'trip-card__body' }, [
            U.el('div', { class: 'trip-card__title', text: rv.title || '重温一段旅程' }),
            U.el('div', { class: 'trip-card__meta' }, [
              U.el('span', { text: U.fmtDate(rv.date) }),
              U.el('span', { text: rv.items.length + ' 个地点' })
            ]),
            rv.note ? U.el('div', { class: 'small muted', style: { marginTop: '4px' }, text: rv.note }) : null,
            U.el('div', { class: 'trip-card__foot' }, [
              U.el('span', { class: 'chip chip--primary', text: '原旅程：' + (trip ? trip.title : '已删除') })
            ])
          ])
        );
        grid.appendChild(box);
      });

      host.appendChild(U.el('section', { class: 'section' }, [UI.sectionHead('重温记录', Data.revisits.length + ' 次'), grid]));
    }
  };

  /* ============================================================
   * 重温详情
   * ============================================================ */

  BF.Views.rv = {
    title: function (ctx) {
      var rv = Data.getRevisit(ctx.parts[1]);
      return rv ? rv.title : '重温';
    },
    subtitle: function (ctx) {
      var rv = Data.getRevisit(ctx.parts[1]);
      return rv ? U.fmtDate(rv.date) : '';
    },

    actions: function (ctx) {
      var rv = Data.getRevisit(ctx.parts[1]);
      if (!rv) return [];
      return [
        U.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: '← 返回',
          title: '返回',
          onclick: function () {
            BF.App.go('#/revisit');
          }
        }),
        Auth.canComment()
          ? U.el('button', {
              class: 'btn btn--ghost btn--sm',
              text: U.adaptive('删除', '🗑'),
              onclick: function () {
                U.confirm('删除这次重温记录？', { danger: true, okLabel: '删除' }).then(function (ok) {
                  if (!ok) return;
                  var job = Promise.resolve();
                  (rv.items || []).forEach(function (it) {
                    if (it.newPhoto) {
                      job = job.then(function () { return BF.DB.delBlob(it.newPhoto.blobId); }).then(function () { return BF.DB.delBlob(it.newPhoto.thumbId); });
                    }
                  });
                  job.then(function () {
                    return Data.deleteRevisit(rv.id);
                  }).then(function () {
                    U.toast('已删除');
                    BF.App.go('#/revisit');
                  });
                });
              }
            })
          : null
      ].filter(Boolean);
    },

    render: function (host, ctx) {
      var rv = Data.getRevisit(ctx.parts[1]);
      if (!rv) {
        host.appendChild(UI.empty({ icon: '💞', title: '没有找到这次重温', actions: [U.el('button', { class: 'btn btn--primary', text: '返回', onclick: function () { BF.App.go('#/revisit'); } })] }));
        return;
      }
      var trip = Data.getTrip(rv.tripId);

      host.appendChild(
        U.el('section', { class: 'hero' }, U.el('div', { class: 'hero__inner' }, [
          U.el('div', { class: 'grow' }, [
            U.el('div', { class: 'hero__greeting', text: U.fmtDate(rv.date) }),
            U.el('div', { class: 'hero__title', text: rv.title || '重温一段旅程' }),
            U.el('div', {
              class: 'hero__desc',
              text: (trip ? '原旅程：《' + trip.title + '》（' + U.fmtRange(trip.startDate, trip.endDate) + '）' : '原旅程已被删除') + '　·　共 ' + rv.items.length + ' 个地点'
            }),
            rv.note ? U.el('div', { class: 'hero__desc', text: rv.note }) : null,
            U.el('div', { class: 'hero__actions' }, [
              trip ? U.el('button', { class: 'btn btn--ghost btn--sm', text: '查看原旅程', onclick: function () { BF.App.go('#/trip/' + trip.id); } }) : null
            ].filter(Boolean))
          ])
        ]))
      );

      (rv.items || []).forEach(function (item, i) {
        var stop = trip ? Data.getStop(trip, item.stopId) : null;
        var oldPhoto = trip ? Data.findPhoto(trip, item.oldPhotoId) : null;
        var card = U.el('section', { class: 'section mt-24' });
        card.appendChild(
          UI.sectionHead('第 ' + (i + 1) + ' 站 · ' + ((stop && stop.name) || '未命名站点'), oldPhoto && oldPhoto.takenAt ? '当年拍摄于 ' + oldPhoto.takenAt : '', [
            U.el('button', {
              class: 'btn btn--ghost btn--sm',
              text: '🎴 生成纪念卡',
              onclick: function () {
                U.toast('正在合成纪念卡…');
                makeCard(trip || { title: '一段旅程', startDate: rv.date }, stop || {}, { oldPhoto: oldPhoto, oldPhotoId: item.oldPhotoId, newPhoto: item.newPhoto }, rv).then(function (blob) {
                  if (!blob) return U.toast('合成失败', 'error');
                  U.downloadBlob(blob, '重温纪念卡-' + ((stop && stop.name) || '旅行') + '.png');
                  U.toast('纪念卡已保存到下载目录', 'success');
                }).catch(function (err) {
                  U.toast('合成失败：' + (err.message || err), 'error');
                });
              }
            })
          ])
        );

        if (oldPhoto && item.newPhoto) {
          card.appendChild(renderCompare(oldPhoto, item.newPhoto, { left: '当年 · ' + (oldPhoto.takenAt ? U.fmtDate(oldPhoto.takenAt.slice(0, 10), true) : ''), right: '今天 · ' + U.fmtDate(rv.date, true) }));
        } else if (item.newPhoto) {
          card.appendChild(UI.photoTile(item.newPhoto, { tag: '今天' }));
        }

        if (item.note) card.appendChild(U.el('div', { class: 'stop__note mt-16', text: item.note }));
        host.appendChild(card);
      });

      if (Auth.canComment()) {
        host.appendChild(
          U.el('div', { class: 'paper mt-24 flex-between wrap gap-14' }, [
            U.el('div', { class: 'grow' }, [
              U.el('div', { class: 'display strong', text: '再写两句吧' }),
              U.el('div', { class: 'small muted mt-8', text: '把此刻的心情留下来，以后每次翻到都会想起今天的天气。' })
            ]),
            U.el('button', {
              class: 'btn btn--soft',
              text: '写下这次重温的心情',
              onclick: function () {
                U.prompt('想说的话', rv.note, { placeholder: '例如：爸爸走得慢了些，但笑得很开心。' }).then(function (txt) {
                  if (txt === null) return;
                  rv.note = txt;
                  Data.saveRevisit(rv).then(function () {
                    U.toast('已保存', 'success');
                    BF.App.refresh();
                  });
                });
              }
            })
          ])
        );
      }
    }
  };

})(window);
