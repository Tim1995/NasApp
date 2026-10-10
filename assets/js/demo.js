/* ============================================================
 * 小脚丫旅行记 · 示例数据
 * 用 Canvas 生成几张「照片」，让第一次打开的人立刻看到完整效果。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var DB = BF.DB;
  var Auth = BF.Auth;
  var Data = BF.Data;

  var Demo = (BF.Demo = {});

  /* ------------------------- 生成一张插图照片 ------------------------- */

  function paintScene(ctx, w, h, seed) {
    var palettes = [
      ['#f7d9b8', '#e9a37b', '#c96f4e'], // 暖橘 · 日落
      ['#cfe6f5', '#8bb8d6', '#4f86b8'], // 蓝 · 海边
      ['#dff0e2', '#9ecfae', '#5f9380'], // 绿 · 山野
      ['#f6e6c8', '#e3c47f', '#c39a45'], // 金 · 古城
      ['#e8dcf3', '#b79dd4', '#8465a8'] // 紫 · 夜色
    ];
    var p = palettes[seed % palettes.length];

    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p[0]);
    g.addColorStop(0.55, p[1]);
    g.addColorStop(1, p[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 太阳 / 月亮
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.26, h * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // 远山
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.68);
    ctx.quadraticCurveTo(w * 0.22, h * 0.42, w * 0.44, h * 0.66);
    ctx.quadraticCurveTo(w * 0.62, h * 0.46, w * 0.82, h * 0.68);
    ctx.quadraticCurveTo(w * 0.94, h * 0.58, w, h * 0.64);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 近景
    ctx.fillStyle = 'rgba(60,45,35,.20)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.82);
    ctx.quadraticCurveTo(w * 0.3, h * 0.7, w * 0.55, h * 0.84);
    ctx.quadraticCurveTo(w * 0.8, h * 0.94, w, h * 0.8);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }

  function makePhoto(title, subtitle, dateText, seed) {
    var W = 1400;
    var H = 1050;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    paintScene(ctx, W, H, seed);

    // 文字底衬
    var g2 = ctx.createLinearGradient(0, H * 0.62, 0, H);
    g2.addColorStop(0, 'rgba(30,22,18,0)');
    g2.addColorStop(1, 'rgba(30,22,18,.62)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, H * 0.62, W, H * 0.38);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 62px "Songti SC", "Microsoft YaHei", serif';
    ctx.fillText(title, 64, H - 108);
    ctx.font = '34px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillText(subtitle, 64, H - 56);

    ctx.font = '30px system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.textAlign = 'right';
    ctx.fillText(dateText, W - 64, H - 60);
    ctx.textAlign = 'left';

    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        resolve(blob);
      }, 'image/jpeg', 0.88);
    });
  }

  function makeThumb(blob) {
    return BF.Geo.loadBitmapForDemo
      ? BF.Geo.loadBitmapForDemo(blob)
      : new Promise(function (resolve) {
          var url = URL.createObjectURL(blob);
          var img = new Image();
          img.onload = function () {
            var s = Math.min(1, 480 / Math.max(img.width, img.height));
            var c = document.createElement('canvas');
            c.width = Math.round(img.width * s);
            c.height = Math.round(img.height * s);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            c.toBlob(function (b) {
              resolve(b);
            }, 'image/jpeg', 0.72);
          };
          img.src = url;
        });
  }

  /* ------------------------- 示例行程 ------------------------- */

  var SAMPLE = [
    {
      title: '第一次看见大海 · 三亚',
      startDate: '2019-07-14',
      endDate: '2019-07-19',
      summary: '宝宝第一次踩到海水，被浪花吓了一下，然后笑了很久。',
      tags: ['海边', '第一次'],
      stops: [
        { name: '亚龙湾海滩', city: '三亚', province: '海南', lat: 18.2235, lng: 109.6395, kind: 'scenery', note: '海水很浅，宝宝蹲下来捡了很久的贝壳。', photos: ['海浪与贝壳', '沙滩上的小脚丫'] },
        { name: '天涯海角景区大门', city: '三亚', province: '海南', lat: 18.2997, lng: 109.3519, kind: 'landmark', note: '在大门口合了影，宝宝全程要抱。', photos: ['天涯海角 · 到此一游'] },
        { name: '南山文化旅游区', city: '三亚', province: '海南', lat: 18.2793, lng: 109.1552, kind: 'landmark', note: '看了很久的海上观音。', photos: ['远远望着观音像'] }
      ]
    },
    {
      title: '西湖边的春天 · 杭州',
      startDate: '2021-04-03',
      endDate: '2021-04-05',
      summary: '断桥边上的柳树刚发芽，宝宝自己走了整整一圈。',
      tags: ['春天', '第一次自己走'],
      stops: [
        { name: '断桥残雪', city: '杭州', province: '浙江', lat: 30.2573, lng: 120.1443, kind: 'landmark', note: '桥上的风很大，帽子被吹跑了。', photos: ['断桥上的一家人'] },
        { name: '雷峰塔', city: '杭州', province: '浙江', lat: 30.2315, lng: 120.1467, kind: 'landmark', note: '登塔时宝宝数台阶数到 30 就不数了。', photos: ['塔下合影'] },
        { name: '灵隐寺飞来峰', city: '杭州', province: '浙江', lat: 30.2408, lng: 120.1009, kind: 'scenery', note: '在溪边玩了很久的水。', photos: ['溪边玩水'] }
      ]
    },
    {
      title: '去看长城 · 北京',
      startDate: '2023-10-01',
      endDate: '2023-10-05',
      summary: '第一次坐高铁，第一次爬长城，宝宝说自己「超厉害」。',
      tags: ['祖国', '第一次坐高铁'],
      stops: [
        { name: '天安门广场', city: '北京', province: '北京', lat: 39.9055, lng: 116.3976, kind: 'landmark', note: '早上四点就起床来看升旗。', photos: ['天安门前的合影'] },
        { name: '颐和园十七孔桥', city: '北京', province: '北京', lat: 39.9928, lng: 116.2755, kind: 'landmark', note: '在桥上喂了很久的鱼。', photos: ['十七孔桥'] },
        { name: '八达岭长城', city: '北京', province: '北京', lat: 40.3565, lng: 116.0177, kind: 'landmark', note: '爬到北八楼，宝宝是自己走上去的。', photos: ['长城上的小英雄'] }
      ]
    }
  ];

  Demo.seed = function () {
    if (Auth.hasFamily()) return Promise.resolve();

    return Auth.createFamily({
      familyName: '小满的家',
      homeCity: '杭州',
      child: { name: '小满', birthDate: '2018-03-21' },
      parents: [{ name: '妈妈', relation: '妈妈', username: 'mama', password: '123456' }]
    }).then(function (kid) {
      var chain = Promise.resolve();
      SAMPLE.forEach(function (template, ti) {
        chain = chain.then(function () {
          var trip = Data.newTrip({
            title: template.title,
            startDate: template.startDate,
            endDate: template.endDate,
            summary: template.summary,
            tags: template.tags,
            childIds: [kid.id]
          });
          var inner = Promise.resolve();
          var seed = ti;
          template.stops.forEach(function (st) {
            inner = inner.then(function () {
              var stop = Data.newStop({
                name: st.name,
                city: st.city,
                province: st.province,
                lat: st.lat,
                lng: st.lng,
                kind: st.kind,
                note: st.note,
                arriveDate: trip.startDate,
                leaveDate: trip.endDate
              });
              trip.stops.push(stop);
              var pchain = Promise.resolve();
              st.photos.forEach(function (caption, pi) {
                pchain = pchain.then(function () {
                  seed++;
                  return makePhoto(st.name, caption, U.fmtDate(trip.startDate), seed).then(function (blob) {
                    return makeThumb(blob).then(function (thumb) {
                      var photo = {
                        id: U.uid('ph'),
                        blobId: U.uid('blob'),
                        thumbId: U.uid('thumb'),
                        name: caption + '.jpg',
                        takenAt: trip.startDate + ' 10:' + (10 + pi * 7) + ':00',
                        lat: st.lat,
                        lng: st.lng,
                        caption: caption,
                        kind: st.kind === 'landmark' ? 'portrait' : 'scenery',
                        width: 1400,
                        height: 1050,
                        addedAt: Date.now()
                      };
                      return DB.putBlob(photo.blobId, blob).then(function () {
                        return DB.putBlob(photo.thumbId, thumb);
                      }).then(function () {
                        stop.photos.push(photo);
                        if (!trip.coverPhotoId) trip.coverPhotoId = photo.id;
                      });
                    });
                  });
                });
              });
              return pchain;
            });
          });
          return inner.then(function () {
            return Data.saveTrip(trip);
          });
        });
      });
      return chain;
    });
  };

})(window);
