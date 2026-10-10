/* ============================================================
 * 小脚丫旅行记 · 业务数据层
 * 行程 / 站点 / 照片 / 重温记录 的增删改查与统计
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var DB = BF.DB;
  var Geo = BF.Geo;

  var Data = (BF.Data = {});

  Data.trips = [];
  Data.revisits = [];
  Data.loaded = false;

  /* ------------------------- 照片 URL 缓存 ------------------------- */

  var urlCache = new Map(); // "blobId|kind" -> objectURL
  var MAX_CACHE = 400;

  function cachedUrl(blobId, kind) {
    var key = blobId + '|' + kind;
    if (!urlCache.has(key)) return null;
    var v = urlCache.get(key);
    urlCache.delete(key);
    urlCache.set(key, v); // 提到最新，实现简易 LRU
    return v;
  }

  function storeUrl(blobId, kind, url) {
    urlCache.set(blobId + '|' + kind, url);
    while (urlCache.size > MAX_CACHE) {
      var oldest = urlCache.keys().next().value;
      var oldUrl = urlCache.get(oldest);
      urlCache.delete(oldest);
      try {
        URL.revokeObjectURL(oldUrl);
      } catch (e) {}
    }
  }

  /**
   * 获取照片的可显示地址：kind = 'thumb' | 'main'
   * 服务端模式下直接给出 /api/photos/xxx 的地址，交给浏览器缓存；
   * 本机模式下才需要把二进制读出来做成 objectURL。
   */
  Data.photoUrl = function (photo, kind) {
    if (!photo) return Promise.resolve('');
    kind = kind || 'thumb';
    var blobId = kind === 'thumb' ? photo.thumbId : photo.blobId;
    return Data.imageUrlById(blobId, kind);
  };

  /** 通过 blob id 拿到可显示地址（照片、头像通用） */
  Data.imageUrlById = function (blobId, kind) {
    if (!blobId) return Promise.resolve('');
    kind = kind || 'auto';
    if (DB.mode === 'server') return Promise.resolve(DB.remotePhotoUrl(blobId));
    var hit = cachedUrl(blobId, kind);
    if (hit) return Promise.resolve(hit);
    return DB.getBlob(blobId).then(function (blob) {
      if (!blob) return '';
      var url = URL.createObjectURL(blob);
      storeUrl(blobId, kind, url);
      return url;
    });
  };

  /** 把照片填充进一个 <img>，自动使用缩略图 */
  Data.fillImage = function (imgEl, photo, kind) {
    var token = (imgEl.dataset.loadToken = U.uid('t'));
    return Data.photoUrl(photo, kind).then(function (url) {
      if (imgEl.dataset.loadToken !== token) return;
      if (!url) {
        imgEl.classList.add('is-missing');
        imgEl.classList.add('is-ready');
        return;
      }
      imgEl.src = url;
      // 部分浏览器对 lazy 图片会延迟 load 事件，这里兜底保证图片一定会淡入
      if (imgEl.complete && imgEl.naturalWidth) {
        imgEl.classList.add('is-ready');
        return;
      }
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if ((imgEl.complete && imgEl.naturalWidth) || tries > 24) {
          clearInterval(timer);
          imgEl.classList.add('is-ready');
        }
      }, 120);
    });
  };

  Data.releaseUrlCache = function () {
    urlCache.forEach(function (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    });
    urlCache.clear();
  };

  /* ------------------------- 载入 ------------------------- */

  Data.load = function () {
    return Promise.all([DB.all(DB.STORES.trips), DB.all(DB.STORES.revisits)]).then(function (res) {
      Data.trips = (res[0] || []).sort(Data.byStartDesc);
      Data.revisits = (res[1] || []).sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
      Data.loaded = true;
      return Data;
    });
  };

  Data.byStartDesc = function (a, b) {
    return String(b.startDate || '').localeCompare(String(a.startDate || ''));
  };

  /* ------------------------- 行程 ------------------------- */

  Data.newTrip = function (patch) {
    return Object.assign(
      {
        id: U.uid('trip'),
        title: '',
        childIds: [],
        startDate: U.todayISO(),
        endDate: U.todayISO(),
        summary: '',
        tags: [],
        coverPhotoId: '',
        stops: [],
        createdBy: BF.Auth.current ? BF.Auth.current.id : '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      patch || {}
    );
  };

  Data.newStop = function (patch) {
    return Object.assign(
      {
        id: U.uid('stop'),
        name: '',
        city: '',
        province: '',
        lat: null,
        lng: null,
        arriveDate: '',
        leaveDate: '',
        kind: 'landmark',
        note: '',
        photos: []
      },
      patch || {}
    );
  };

  Data.getTrip = function (id) {
    for (var i = 0; i < Data.trips.length; i++) if (Data.trips[i].id === id) return Data.trips[i];
    return null;
  };

  Data.getStop = function (trip, stopId) {
    if (!trip || !trip.stops) return null;
    for (var i = 0; i < trip.stops.length; i++) if (trip.stops[i].id === stopId) return trip.stops[i];
    return null;
  };

  Data.saveTrip = function (trip) {
    trip.updatedAt = Date.now();
    return DB.put(DB.STORES.trips, trip).then(function () {
      var idx = -1;
      for (var i = 0; i < Data.trips.length; i++) if (Data.trips[i].id === trip.id) idx = i;
      if (idx >= 0) Data.trips[idx] = trip;
      else Data.trips.push(trip);
      Data.trips.sort(Data.byStartDesc);
      // 站点变了，之前算的路线里程不再准确
      Data.clearRoadCache();
      return trip;
    });
  };

  /** 删除行程，并清理其照片 */
  Data.deleteTrip = function (tripId) {
    var trip = Data.getTrip(tripId);
    if (!trip) return Promise.resolve();
    var chain = Promise.resolve();
    Data.eachPhoto(trip, function (photo) {
      chain = chain.then(function () {
        return DB.delBlob(photo.blobId);
      }).then(function () {
        return DB.delBlob(photo.thumbId);
      });
    });
    return chain
      .then(function () {
        return DB.del(DB.STORES.trips, tripId);
      })
      .then(function () {
        Data.trips = Data.trips.filter(function (t) {
          return t.id !== tripId;
        });
        Data.clearRoadCache();
      });
  };

  /** 遍历一张行程里的所有照片 */
  Data.eachPhoto = function (trip, fn) {
    (trip.stops || []).forEach(function (stop) {
      (stop.photos || []).forEach(function (photo) {
        fn(photo, stop);
      });
    });
  };

  Data.tripCoverPhoto = function (trip) {
    if (!trip) return null;
    var found = null;
    if (trip.coverPhotoId) {
      Data.eachPhoto(trip, function (p) {
        if (p.id === trip.coverPhotoId) found = p;
      });
      if (found) return found;
    }
    (trip.stops || []).forEach(function (stop) {
      if (!found && stop.photos && stop.photos.length) found = stop.photos[0];
    });
    return found;
  };

  Data.tripPhotoCount = function (trip) {
    var n = 0;
    Data.eachPhoto(trip, function () {
      n++;
    });
    return n;
  };

  Data.tripStopCount = function (trip) {
    return (trip.stops || []).length;
  };

  /* ------------------------- 家庭地址 ------------------------- */

  /**
   * 家庭地址（带坐标）。
   * 新版存在 family.home = {name, lat, lng, city, province}，
   * 旧数据只有 family.homeCity（城市名字符串），这里自动兜底换算。
   */
  Data.home = function () {
    var fam = BF.Auth.family;
    if (!fam) return null;
    if (fam.home && Geo.valid(fam.home.lat, fam.home.lng)) {
      return {
        name: fam.home.name || '家',
        lat: fam.home.lat,
        lng: fam.home.lng,
        city: fam.home.city || '',
        province: fam.home.province || ''
      };
    }
    if (fam.homeCity && BF.Places) {
      var hit = BF.Places.localSearch(fam.homeCity, 1)[0];
      if (hit) {
        return { name: fam.homeCity, lat: hit.lat, lng: hit.lng, city: hit.city || '', province: hit.prov || '' };
      }
    }
    return null;
  };

  /**
   * 一段行程的完整行驶路径：家 → 各站点。
   * 有了家庭地址，路线才是「从家出发」的；家和第一站太近就不重复插点。
   */
  Data.tripRoutePoints = function (trip) {
    var pts = [];
    if (!trip) return pts;
    var located = (trip.stops || []).filter(function (s) {
      return Geo.valid(s.lat, s.lng);
    });
    if (!located.length) return pts;

    var home = Data.home();
    if (home && Geo.distanceKm(home.lat, home.lng, located[0].lat, located[0].lng) > 1) {
      pts.push([home.lat, home.lng]);
    }
    located.forEach(function (s) {
      pts.push([s.lat, s.lng]);
    });
    return pts;
  };

  /** 所有能算出路线的行程（至少两个点） */
  Data.routableTrips = function () {
    return Data.trips.filter(function (t) {
      return Data.tripRoutePoints(t).length >= 2;
    });
  };

  /* ------------------------- 里程 ------------------------- */

  /**
   * 精确里程：从家出发，按「实际驾车道路」逐段计算。
   * 结果会缓存，行程或家庭地址变化时用 Data.clearRoadCache() 清掉。
   * @returns Promise<{distanceKm, hasRoad, roadTrips, straightTrips, source}>
   */
  Data.roadStats = function (force) {
    if (Data._roadCache && !force) return Promise.resolve(Data._roadCache);

    var trips = Data.routableTrips();
    var acc = { distanceKm: 0, roadTrips: 0, straightTrips: 0, source: '', perTrip: {} };

    var chain = Promise.resolve();
    trips.forEach(function (trip) {
      chain = chain.then(function () {
        var pts = Data.tripRoutePoints(trip);
        return BF.Router.route(pts).then(function (res) {
          acc.distanceKm += res.distanceKm;
          acc.perTrip[trip.id] = res.distanceKm;
          if (BF.Router.isRoad(res)) {
            acc.roadTrips++;
            acc.source = res.source;
          } else {
            acc.straightTrips++;
          }
        });
      });
    });

    return chain.then(function () {
      acc.hasRoad = acc.roadTrips > 0;
      Data._roadCache = acc;
      return acc;
    });
  };

  Data.clearRoadCache = function () {
    Data._roadCache = null;
    if (BF.Router) BF.Router.clearCache();
  };

  /**
   * 一段行程的里程（公里），界面统一用这个：
   * 已经算出真实道路就用它，还没算完先拿直线估算顶着（算完会刷新）。
   */
  Data.tripKm = function (trip) {
    if (!trip) return 0;
    if (Data._roadCache && Data._roadCache.perTrip && Data._roadCache.perTrip[trip.id] != null) {
      return Data._roadCache.perTrip[trip.id];
    }
    var known = BF.Router.cached(Data.tripRoutePoints(trip));
    if (known && BF.Router.isRoad(known)) return known.distanceKm;
    return Data.tripDistance(trip);
  };

  /** 行程总里程（公里）—— 直线估算，用于立刻显示 */
  Data.tripDistance = function (trip) {
    var total = 0;
    var prev = null;
    (trip.stops || []).forEach(function (s) {
      if (!Geo.valid(s.lat, s.lng)) return;
      if (prev) total += Geo.distanceKm(prev.lat, prev.lng, s.lat, s.lng);
      prev = s;
    });
    return total;
  };

  /** 有坐标的站点，按行程日期排序（供地图使用） */
  Data.allLocatedStops = function () {
    var out = [];
    Data.trips.forEach(function (trip) {
      (trip.stops || []).forEach(function (stop, index) {
        if (Geo.valid(stop.lat, stop.lng)) {
          out.push({ trip: trip, stop: stop, index: index });
        }
      });
    });
    return out;
  };

  /**
   * 全部有坐标的站点，**按时间先后**排成一条完整足迹。
   * 排序依据：行程出发日期 → 行程内站点顺序。
   * 这样跨行程也能连成「先去了哪儿、后去了哪儿」的一条线。
   * @returns Array<{trip, stop, index(全局序号，从0开始), inTripIndex}>
   */
  Data.chronologicalStops = function () {
    var trips = Data.trips.slice().sort(function (a, b) {
      var d = String(a.startDate || '9999').localeCompare(String(b.startDate || '9999'));
      if (d !== 0) return d;
      // 同一天出发的，按创建时间
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    var out = [];
    trips.forEach(function (trip) {
      (trip.stops || []).forEach(function (stop, inTripIndex) {
        if (!Geo.valid(stop.lat, stop.lng)) return;
        out.push({
          trip: trip,
          stop: stop,
          inTripIndex: inTripIndex,
          index: out.length
        });
      });
    });
    return out;
  };

  /* ------------------------- 照片 ------------------------- */

  /**
   * 向某个站点添加照片（自动压缩、读取 EXIF）
   * @param tripId 行程 id
   * @param stopId 站点 id
   * @param files FileList / File[]
   * @param opts { onProgress(done,total,file) }
   * @returns Promise<Array<{photo, exif}>>
   */
  Data.addPhotos = function (tripId, stopId, files, opts) {
    opts = opts || {};
    var trip = Data.getTrip(tripId);
    var stop = Data.getStop(trip, stopId);
    if (!trip || !stop) return Promise.reject(new Error('未找到对应的旅行或站点'));
    var list = Array.prototype.slice.call(files || []);
    var results = [];
    var chain = Promise.resolve();

    list.forEach(function (file, i) {
      chain = chain.then(function () {
        if (!/^image\//.test(file.type)) return null;
        return Geo.readExifFromFile(file).then(function (exif) {
          return Geo.processImage(file).then(function (img) {
            var photo = {
              id: U.uid('ph'),
              blobId: U.uid('blob'),
              thumbId: U.uid('thumb'),
              name: file.name || '',
              takenAt: exif.takenAt || '',
              lat: Geo.valid(exif.lat, exif.lng) ? exif.lat : null,
              lng: Geo.valid(exif.lat, exif.lng) ? exif.lng : null,
              caption: '',
              kind: 'scenery',
              width: img.width,
              height: img.height,
              size: (img.main && img.main.size) || 0,
              addedAt: Date.now(),
              addedBy: BF.Auth.current ? BF.Auth.current.id : ''
            };
            return DB.putBlob(photo.blobId, img.main)
              .then(function () {
                return DB.putBlob(photo.thumbId, img.thumb);
              })
              .then(function () {
                stop.photos = stop.photos || [];
                stop.photos.push(photo);
                results.push({ photo: photo, exif: exif });
              });
          });
        });
      }).then(function () {
        if (typeof opts.onProgress === 'function') opts.onProgress(i + 1, list.length, file);
      });
    });

    return chain.then(function () {
      if (results.length && !trip.coverPhotoId) trip.coverPhotoId = results[0].photo.id;
      return Data.saveTrip(trip).then(function () {
        return results;
      });
    });
  };

  /** 删除单张照片 */
  Data.deletePhoto = function (tripId, photoId) {
    var trip = Data.getTrip(tripId);
    if (!trip) return Promise.resolve();
    var target = null;
    Data.eachPhoto(trip, function (p, stop) {
      if (p.id === photoId) {
        target = { photo: p, stop: stop };
      }
    });
    if (!target) return Promise.resolve();
    target.stop.photos = target.stop.photos.filter(function (p) {
      return p.id !== photoId;
    });
    if (trip.coverPhotoId === photoId) trip.coverPhotoId = '';
    var chain = Promise.resolve();
    if (target.photo.blobId) chain = chain.then(function () { return DB.delBlob(target.photo.blobId); });
    if (target.photo.thumbId) chain = chain.then(function () { return DB.delBlob(target.photo.thumbId); });
    return chain.then(function () {
      return Data.saveTrip(trip);
    });
  };

  /** 更新照片说明 */
  Data.updatePhoto = function (tripId, photoId, patch) {
    var trip = Data.getTrip(tripId);
    if (!trip) return Promise.resolve();
    Data.eachPhoto(trip, function (p) {
      if (p.id === photoId) Object.assign(p, patch);
    });
    return Data.saveTrip(trip);
  };

  /* ------------------------- 重温记录 ------------------------- */

  Data.newRevisit = function (trip, patch) {
    return Object.assign(
      {
        id: U.uid('rv'),
        tripId: trip ? trip.id : '',
        title: trip ? '重温 · ' + trip.title : '重温一次旅行',
        date: U.todayISO(),
        byMemberId: BF.Auth.current ? BF.Auth.current.id : '',
        note: '',
        items: [], // { stopId, oldPhotoId, newPhotoId, caption }
        createdAt: Date.now()
      },
      patch || {}
    );
  };

  Data.getRevisit = function (id) {
    for (var i = 0; i < Data.revisits.length; i++) if (Data.revisits[i].id === id) return Data.revisits[i];
    return null;
  };

  Data.saveRevisit = function (rv) {
    return DB.put(DB.STORES.revisits, rv).then(function () {
      var idx = -1;
      for (var i = 0; i < Data.revisits.length; i++) if (Data.revisits[i].id === rv.id) idx = i;
      if (idx >= 0) Data.revisits[idx] = rv;
      else Data.revisits.unshift(rv);
      return rv;
    });
  };

  Data.deleteRevisit = function (id) {
    return DB.del(DB.STORES.revisits, id).then(function () {
      Data.revisits = Data.revisits.filter(function (r) {
        return r.id !== id;
      });
    });
  };

  /** 在行程里按 id 找照片 */
  Data.findPhoto = function (trip, photoId) {
    var found = null;
    Data.eachPhoto(trip, function (p) {
      if (p.id === photoId) found = p;
    });
    return found;
  };

  /* ------------------------- 统计 ------------------------- */

  Data.stats = function () {
    var cities = new Set();
    var provinces = new Set();
    var photoCount = 0;
    var km = 0;
    var dates = [];
    var years = new Set();

    Data.trips.forEach(function (trip) {
      Data.eachPhoto(trip, function () {
        photoCount++;
      });
      km += Data.tripDistance(trip);
      if (trip.startDate) {
        dates.push(trip.startDate);
        years.add(String(trip.startDate).slice(0, 4));
      }
      if (trip.endDate) dates.push(trip.endDate);
      (trip.stops || []).forEach(function (s) {
        if (s.city) cities.add(s.city.trim());
        if (s.province) provinces.add(s.province.trim());
      });
    });

    dates.sort();
    return {
      tripCount: Data.trips.length,
      revisitCount: Data.revisits.length,
      cityCount: cities.size,
      provinceCount: provinces.size,
      photoCount: photoCount,
      distanceKm: km,
      firstDate: dates[0] || '',
      lastDate: dates[dates.length - 1] || '',
      yearCount: years.size,
      years: Array.from(years).sort()
    };
  };

  /** 按年份分组行程 */
  Data.groupByYear = function () {
    var map = {};
    Data.trips.forEach(function (trip) {
      var y = String(trip.startDate || '').slice(0, 4) || '未记录';
      (map[y] = map[y] || []).push(trip);
    });
    return Object.keys(map)
      .sort(function (a, b) {
        return b.localeCompare(a);
      })
      .map(function (y) {
        return { year: y, trips: map[y] };
      });
  };

})(window);
