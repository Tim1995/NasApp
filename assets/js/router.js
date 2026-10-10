/* ============================================================
 * 小脚丫旅行记 · 路径规划
 *
 * 负责向服务端要「真实驾车路线」：沿着道路走的那条线，以及实际里程。
 * 服务端拿不到结果时（断网、本机模式），会退化成两点直线，
 * 保证界面永远有东西可画。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var Router = (BF.Router = {});

  var TTL = 6 * 60 * 60 * 1000; // 六小时内同一个起终点不重复请求
  var cache = {}; // key -> { at, data }
  var inflight = {}; // key -> Promise
  var emptyCache = {}; // 明确不可用的，短期不再重试

  function keyOf(points) {
    return points
      .map(function (p) {
        return p[0].toFixed(4) + ',' + p[1].toFixed(4);
      })
      .join(';');
  }

  /** 直线距离（公里）—— 兜底用 */
  Router.straightKm = function (points) {
    var total = 0;
    for (var i = 1; i < points.length; i++) {
      total += BF.Geo.distanceKm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    }
    return total;
  };

  /* ------------------------------------------------------------
   * 没有服务端时（双击 index.html 直接打开），浏览器直连 OSRM。
   * 实测该服务允许跨域，所以纯静态也能算出真实道路里程。
   * ------------------------------------------------------------ */

  var OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving/';
  var GEOMETRY_LIMIT = 260;

  /** 点太多就等距抽稀，画线够用即可 */
  function thin(list, limit) {
    if (!list || list.length <= limit) return list || [];
    var step = Math.ceil(list.length / limit);
    var out = [];
    for (var i = 0; i < list.length; i += step) out.push(list[i]);
    var last = list[list.length - 1];
    var tail = out[out.length - 1];
    if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
    return out;
  }

  function fetchDirectOsrm(points) {
    var coords = points
      .map(function (p) {
        return p[1].toFixed(6) + ',' + p[0].toFixed(6);
      })
      .join(';');

    return fetch(OSRM_BASE + coords + '?overview=full&geometries=geojson&steps=false', {
      cache: 'no-store'
    })
      .then(function (r) {
        if (!r.ok) throw new Error('路径服务 HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) {
          throw new Error('没有找到可行路线');
        }
        var route = data.routes[0];
        return {
          ok: true,
          source: 'osrm',
          distance: route.distance,
          duration: route.duration,
          legs: (route.legs || []).map(function (l) {
            return { distance: l.distance, duration: l.duration };
          }),
          geometry: thin(
            (route.geometry && route.geometry.coordinates ? route.geometry.coordinates : []).map(function (c) {
              return [c[1], c[0]];
            }),
            GEOMETRY_LIMIT
          )
        };
      });
  }

  function fetchViaServer(points) {
    var joined = points
      .map(function (p) {
        return p[0].toFixed(6) + ',' + p[1].toFixed(6);
      })
      .join(';');

    return fetch('/api/route?points=' + encodeURIComponent(joined), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function straightResult(points, reason) {
    return {
      ok: false,
      source: 'straight',
      reason: reason || 'straight',
      distanceKm: Router.straightKm(points),
      durationMin: 0,
      geometry: points.slice(),
      legs: []
    };
  }

  /** 取已经算好的结果（同步），用于避免闪烁 */
  Router.cached = function (points) {
    if (!points || points.length < 2) return null;
    var hit = cache[keyOf(points)];
    if (!hit) return null;
    if (Date.now() - hit.at > TTL) return null;
    return hit.data;
  };

  /**
   * 规划一条真实驾车路线
   * @param points Array<[lat, lng]> 至少两个点
   * @returns Promise<{ok, source, distanceKm, durationMin, geometry:[[lat,lng]], legs:number[]}>
   */
  Router.route = function (points) {
    if (!points || points.length < 2) {
      return Promise.resolve(straightResult(points || [], 'too-few'));
    }

    var key = keyOf(points);

    var hit = cache[key];
    if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
    if (inflight[key]) return inflight[key];

    // 刚失败过的，短时间内不再重复请求
    if (emptyCache[key] && Date.now() - emptyCache[key] < 60000) {
      return Promise.resolve(straightResult(points, 'recent-failure'));
    }

    // 有服务端就走代理（可用高德、带缓存）；纯静态打开时浏览器直连 OSRM
    var request = BF.DB.mode === 'server' ? fetchViaServer(points) : fetchDirectOsrm(points);

    var promise = request
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.message) || '路径规划失败');
        var data = {
          ok: true,
          source: res.source,
          distanceKm: (res.distance || 0) / 1000,
          durationMin: Math.round((res.duration || 0) / 60),
          geometry: res.geometry && res.geometry.length > 1 ? res.geometry : points,
          legs: (res.legs || []).map(function (l) {
            return (l.distance || 0) / 1000;
          })
        };
        cache[key] = { at: Date.now(), data: data };
        delete emptyCache[key];
        return data;
      })
      .catch(function () {
        emptyCache[key] = Date.now();
        var data = straightResult(points, 'unreachable');
        cache[key] = { at: Date.now(), data: data };
        return data;
      })
      .then(function (data) {
        delete inflight[key];
        return data;
      });

    inflight[key] = promise;
    return promise;
  };

  /** 批量（用于多个行程各算一次），带一点节流避免并发太多 */
  Router.routeSequential = function (list) {
    var out = [];
    var chain = Promise.resolve();
    list.forEach(function (points) {
      chain = chain.then(function () {
        return Router.route(points).then(function (res) {
          out.push(res);
          return res;
        });
      });
    });
    return chain.then(function () {
      return out;
    });
  };

  Router.clearCache = function () {
    cache = {};
    inflight = {};
    emptyCache = {};
  };

  /** 是不是真的算出了道路里程（而不是直线兜底） */
  Router.isRoad = function (result) {
    return !!(result && result.ok && result.source !== 'straight');
  };

})(window);
