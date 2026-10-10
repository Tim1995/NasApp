/* ============================================================
 * 小脚丫旅行记 · 时光轴
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var Data = BF.Data;
  var Auth = BF.Auth;
  var UI = BF.UI;

  BF.Views.timeline = {
    title: '时光轴',
    subtitle: '一年一年，慢慢长大',

    actions: function () {
      return [
        U.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: U.adaptive('💞 重温模式', '💞'),
          title: '重温模式',
          onclick: function () {
            BF.App.go('#/revisit');
          }
        })
      ];
    },

    render: function (host) {
      var child = Auth.primaryChild();
      var groups = Data.groupByYear();

      if (!groups.length) {
        host.appendChild(
          UI.empty({
            icon: '🕰️',
            title: '时光轴还是空的',
            text: '每记录一段旅程，这里就会多出一个年份。',
            actions: Auth.canEdit()
              ? [U.el('button', { class: 'btn btn--primary', text: '记录一段旅程', onclick: function () { BF.TripEditor.create(); } })]
              : []
          })
        );
        return;
      }

      var total = 0;
      var wrap = U.el('div', { class: 'timeline' });

      groups.forEach(function (group) {
        var body = U.el('div', { class: 'year-block__body' });

        group.trips.forEach(function (trip) {
          total++;
          var cover = Data.tripCoverPhoto(trip);
          var thumb = U.el('div', { class: 'line-item__thumb' });
          if (cover) {
            var img = U.el('img', { alt: '' });
            img.addEventListener('load', function () {
              img.classList.add('is-ready');
            });
            thumb.appendChild(img);
            Data.fillImage(img, cover, 'thumb');
          } else {
            thumb.appendChild(U.el('div', { class: 'center', style: { paddingTop: '18px', opacity: '0.4' }, text: '🧳' }));
          }

          var ageText = child && child.birthDate ? '宝宝 ' + (U.ageAt(child.birthDate, trip.startDate) || '—') + '　' : '';

          body.appendChild(
            U.el('div', { class: 'line-item', onclick: function () { BF.App.go('#/trip/' + trip.id); } }, [
              thumb,
              U.el('div', { class: 'line-item__body' }, [
                U.el('div', { class: 'line-item__title', text: trip.title || '未命名的旅行' }),
                U.el('div', { class: 'line-item__meta', text: ageText + U.fmtRange(trip.startDate, trip.endDate) }),
                U.el('div', { class: 'line-item__meta', text: '📍 ' + UI.routeText(trip) + '　·　' + Data.tripPhotoCount(trip) + ' 张照片' })
              ]),
              U.el('span', { class: 'muted', text: '›' })
            ])
          );
        });

        wrap.appendChild(
          U.el('div', { class: 'year-block' }, [
            U.el('div', { class: 'year-block__label' }, [
              U.el('div', { class: 'year-block__year', text: group.year }),
              U.el('div', { class: 'year-block__count', text: group.trips.length + ' 段旅程' })
            ]),
            body
          ])
        );
      });

      host.appendChild(
        U.el('section', { class: 'section' }, [
          UI.sectionHead('一路走来', '共 ' + total + ' 段旅程 · ' + groups.length + ' 个年头'),
          wrap
        ])
      );
    }
  };

})(window);
