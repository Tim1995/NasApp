/* ============================================================
 * 小脚丫旅行记 · 本地服务器
 *
 *   1) 把当前目录作为静态网站提供出来
 *   2) 提供一套 REST API，把数据真正存到服务器磁盘上
 *      - data/db.json        家庭 / 行程 / 重温记录
 *      - data/photos/*.jpg   照片原图与缩略图
 *
 * 用法： node server.js [端口]
 *        node server.js 5178 --data=D:\babyfootprint
 * ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5178);

/* 数据目录：默认放在项目下的 data/，可用 --data= 指定到别处 */
const dataArg = process.argv.find((a) => a.startsWith('--data='));
const DATA_DIR = dataArg ? path.resolve(dataArg.slice(7)) : path.join(ROOT, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const APP_NAME = '小脚丫旅行记';
const MAX_JSON_BODY = 32 * 1024 * 1024; // 32MB，足够放下几百段行程
const MAX_PHOTO_BODY = 24 * 1024 * 1024; // 单张照片上限 24MB

/* ============================================================
 * 服务器配置（高德 Key 等）
 * 放在服务器上而不是每台设备上：配置一次，全家设备都能用
 * ============================================================ */

let config = null;

function loadConfig() {
  if (config) return config;
  config = { amapKey: '' };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
    }
  } catch (e) {
    console.error('  ⚠ 配置文件读取失败：' + e.message);
    config = { amapKey: '' };
  }
  config.amapKey = (config.amapKey || '').trim();
  return config;
}

function saveConfig() {
  try {
    ensureDirs();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('  ⚠ 配置保存失败：' + e.message);
  }
}

/* ============================================================
 * 坐标转换：高德返回 GCJ-02，我们统一存 WGS-84
 * ============================================================ */

const PI = Math.PI;
const A_AXIS = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3;
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3;
  return ret;
}

function transformLng(x, y) {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3;
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3;
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3;
  return ret;
}

function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const radLat = (lat / 180) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A_AXIS * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180) / ((A_AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

function gcj02ToWgs84(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  let wLng = lng;
  let wLat = lat;
  for (let i = 0; i < 5; i++) {
    const t = wgs84ToGcj02(wLng, wLat);
    wLng += lng - t[0];
    wLat += lat - t[1];
  }
  return [wLng, wLat];
}

/* ============================================================
 * 数据持久化
 * ============================================================ */

function ensureDirs() {
  [DATA_DIR, PHOTO_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function emptyDb() {
  return { version: 1, app: APP_NAME, family: null, trips: [], revisits: [], updatedAt: Date.now() };
}

let db = null;

function loadDb() {
  if (db) return db;
  ensureDirs();
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db = Object.assign(emptyDb(), parsed);
      if (!Array.isArray(db.trips)) db.trips = [];
      if (!Array.isArray(db.revisits)) db.revisits = [];
    } else {
      db = emptyDb();
      saveDb();
    }
  } catch (err) {
    console.error('  ⚠ 数据文件读取失败：' + err.message);
    const broken = DB_FILE + '.broken-' + Date.now();
    try {
      fs.renameSync(DB_FILE, broken);
      console.error('    已把损坏的文件改名为 ' + path.basename(broken) + '，并新建空数据。');
    } catch (e) {}
    db = emptyDb();
    saveDb();
  }
  return db;
}

/* 串行写入 + 先写临时文件再改名，避免断电/并发写坏数据 */
let writeChain = Promise.resolve();
let writePending = false;

function saveDb() {
  writePending = true;
  const snapshot = JSON.stringify(db, null, 2);
  writeChain = writeChain.then(
    () =>
      new Promise((resolve) => {
        ensureDirs();
        const tmp = DB_FILE + '.tmp';
        fs.writeFile(tmp, snapshot, (err) => {
          if (err) {
            console.error('  ⚠ 数据写入失败：' + err.message);
            writePending = false;
            return resolve();
          }
          fs.rename(tmp, DB_FILE, (err2) => {
            if (err2) console.error('  ⚠ 数据保存失败：' + err2.message);
            writePending = false;
            resolve();
          });
        });
      })
  );
  return writeChain;
}

/* ============================================================
 * 工具
 * ============================================================ */

function sendJSON(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readJSON(req, limit) {
  return readBody(req, limit).then((buf) => JSON.parse(buf.toString('utf8') || 'null'));
}

function safePhotoId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

function photoPath(id) {
  return path.join(PHOTO_DIR, id + '.jpg');
}

/* ============================================================
 * 在线地点搜索（服务端代理）
 *
 * Photon 是国内可达的免费地理服务，对地方景区覆盖很好
 * （地方景区、小镇、湖泊都能搜到），
 * 缺点是响应偏慢（6~15 秒），所以超时给得很宽，并做结果缓存。
 * ============================================================ */

const PHOTON_TIMEOUT = 26000;
const AMAP_TIMEOUT = 9000;

/* 类型重要度：把「某某区(city)」排在「某某站(station)」前面，
   并把「某某大道」这类道路直接过滤掉（权重 ≤12 会被丢弃） */
const TYPE_WEIGHT = {
  city: 100, municipality: 100, county: 96, district: 95, town: 90, state: 60,
  village: 72, hamlet: 58, suburb: 62, quarter: 48, neighbourhood: 48, locality: 52,
  theme_park: 96, attraction: 96, water_park: 92, zoo: 90, aquarium: 90, museum: 86,
  viewpoint: 82, nature_reserve: 82, lake: 80, park: 78, garden: 78, beach: 76,
  peak: 70, resort: 70, farmyard: 62, camp_site: 60, hotel: 55, wetland: 55,
  administrative: 45, wood: 42, forest: 42, river: 46, canal: 46, water: 46, stream: 40,
  residential: 26, commercial: 22, house: 8, aerodrome: 32, station: 28, halt: 24,
  bus_stop: 16, stop: 12,
  /* 道路类：一律不要 */
  motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 0, unclassified: 0,
  residential_road: 0, living_street: 0, pedestrian: 0, service: 0, track: 0,
  path: 0, footway: 0, cycleway: 0, steps: 0, road: 0, street: 0,
  motorway_junction: 6, yes: 0, no: 0
};

function weightOf(osmValue) {
  const w = TYPE_WEIGHT[osmValue];
  return w === undefined ? 40 : w;
}

/** 去重 + 过滤掉马路之类没意义的结果 + 按重要度排序 */
function rankPlaces(list) {
  const seen = {};
  return list
    .filter((p) => p && p.name && isFinite(p.lat) && isFinite(p.lng))
    .map((p) => Object.assign(p, { _w: weightOf(p.osmValue) }))
    .filter((p) => p._w > 12)
    .filter((p) => {
      const k = Math.round(p.lat * 400) + ':' + Math.round(p.lng * 400);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    })
    .sort((a, b) => b._w - a._w);
}

function friendlyAmapInfo(info) {
  switch (info) {
    case 'INVALID_USER_KEY':
      return 'Key 无效，请检查是否复制完整（类型必须是「Web服务」）';
    case 'DAILY_QUERY_OVER_LIMIT':
      return '今天的高德调用额度已经用完，明天会自动恢复';
    case 'USER_KEY_PLATFORM_ERROR':
      return 'Key 类型不对，请创建「Web服务」类型的 Key';
    case 'SERVICE_NOT_AVAILABLE':
      return '这个 Key 没有开通「搜索服务」，请到高德控制台勾选';
    default:
      return '高德返回：' + (info || '未知错误');
  }
}

async function searchAmapUpstream(kw) {
  const key = loadConfig().amapKey;
  if (!key) throw Object.assign(new Error('没有配置高德 Key'), { reason: 'no-key' });

  const url =
    'https://restapi.amap.com/v3/place/text?key=' +
    encodeURIComponent(key) +
    '&keywords=' +
    encodeURIComponent(kw) +
    '&offset=15&page=1&extensions=base';

  let data;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'xiaojiaoya/1.0' },
      signal: AbortSignal.timeout(AMAP_TIMEOUT)
    });
    data = await res.json();
  } catch (err) {
    throw Object.assign(new Error('无法连接高德服务'), { reason: 'network' });
  }

  if (!data || data.status !== '1') {
    throw Object.assign(new Error(friendlyAmapInfo(data && data.info)), { reason: 'amap-error' });
  }

  return (data.pois || [])
    .filter((p) => p.location && String(p.location).indexOf(',') > 0)
    .map((p) => {
      const parts = String(p.location).split(',');
      const w = gcj02ToWgs84(parseFloat(parts[0]), parseFloat(parts[1]));
      return {
        name: p.name,
        lat: w[1],
        lng: w[0],
        city: p.cityname && p.cityname !== '[]' ? p.cityname : '',
        prov: p.pname && p.pname !== '[]' ? p.pname : '',
        address: typeof p.address === 'string' ? p.address : '',
        osmValue: '',
        type: 'spot',
        source: 'amap'
      };
    })
    .filter((p) => isFinite(p.lat) && isFinite(p.lng));
}

async function searchPhotonUpstream(kw, bias) {
  let url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(kw) + '&limit=15';
  // 传一个参考点，让附近的结果排在前面（例如搜「茅山」时优先本地那个）
  if (bias) url += '&lat=' + bias.lat + '&lon=' + bias.lon;

  let data;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'xiaojiaoya/1.0 (family travel album)', Accept: 'application/json' },
      signal: AbortSignal.timeout(PHOTON_TIMEOUT)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (err) {
    throw Object.assign(new Error('在线地点服务暂时不可用'), { reason: 'unreachable' });
  }

  return (data.features || [])
    .map((f) => {
      const p = f.properties || {};
      const c = f.geometry && f.geometry.coordinates;
      if (!c) return null;
      const name = p.name || p.street || p.city || '';
      if (!name) return null;
      return {
        name: name,
        lat: c[1],
        lng: c[0],
        city: p.city || p.district || p.county || '',
        prov: p.state || '',
        address: p.street || '',
        osmValue: p.osm_value || p.type || '',
        type: 'spot',
        source: 'photon'
      };
    })
    .filter(Boolean);
}

/* ------------------------- 搜索结果缓存 ------------------------- */

const searchCache = new Map();
const SEARCH_CACHE_TTL = 60 * 60 * 1000;
const SEARCH_CACHE_MAX = 400;

function searchCacheGet(key) {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SEARCH_CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  return hit.data;
}

function searchCacheSet(key, data) {
  searchCache.set(key, { at: Date.now(), data: data });
  while (searchCache.size > SEARCH_CACHE_MAX) {
    searchCache.delete(searchCache.keys().next().value);
  }
}

/* ============================================================
 * 真实道路路径规划
 *
 * 优先用 OSRM（开源、免费、无需 Key，国内可达），
 * 如果用户配了高德 Key，就改用高德（国内路网数据更准）。
 * 返回的是车辆实际行驶的路线几何与距离，而不是两点之间的直线。
 * ============================================================ */

const OSRM_TIMEOUT = 15000;
const AMAP_ROUTE_TIMEOUT = 9000;
const ROUTE_MAX_POINTS = 25; // 超过这个点数就拒绝，避免把服务打爆
const ROUTE_GEOMETRY_LIMIT = 260; // 返回的几何点上限，画线够用即可

const routeCache = new Map();
const ROUTE_CACHE_TTL = 12 * 60 * 60 * 1000;
const ROUTE_CACHE_MAX = 600;

function routeCacheGet(key) {
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ROUTE_CACHE_TTL) {
    routeCache.delete(key);
    return null;
  }
  return hit.data;
}

function routeCacheSet(key, data) {
  routeCache.set(key, { at: Date.now(), data: data });
  while (routeCache.size > ROUTE_CACHE_MAX) {
    routeCache.delete(routeCache.keys().next().value);
  }
}

/** 点太多时按等距抽稀，保留首尾 */
function thinPath(coords, limit) {
  if (!coords || coords.length <= limit) return coords || [];
  const step = Math.ceil(coords.length / limit);
  const out = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const last = coords[coords.length - 1];
  const tail = out[out.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
  return out;
}

/** OSRM：一次请求可以带上全部途经点，直接拿到整条路线 */
async function fetchOsrmRoute(points) {
  const coordStr = points
    .map(function (p) {
      return p[1].toFixed(6) + ',' + p[0].toFixed(6);
    })
    .join(';');

  const url =
    'https://router.project-osrm.org/route/v1/driving/' +
    coordStr +
    '?overview=full&geometries=geojson&steps=false';

  const res = await fetch(url, {
    headers: { 'User-Agent': 'xiaojiaoya/1.0 (family travel album)' },
    signal: AbortSignal.timeout(OSRM_TIMEOUT)
  });
  if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) {
    throw new Error('OSRM 没有找到可行路线');
  }

  const route = data.routes[0];
  // geojson 是 [lng, lat]，统一转成 [lat, lng]
  const geom = thinPath(
    (route.geometry && route.geometry.coordinates ? route.geometry.coordinates : []).map(function (c) {
      return [c[1], c[0]];
    }),
    ROUTE_GEOMETRY_LIMIT
  );

  return {
    source: 'osrm',
    distance: route.distance,
    duration: route.duration,
    legs: (route.legs || []).map(function (l) {
      return { distance: l.distance, duration: l.duration };
    }),
    geometry: geom
  };
}

/** 高德驾车路径：逐段请求（v3 一次只支持起终点） */
async function fetchAmapRoute(points) {
  const key = loadConfig().amapKey;
  if (!key) throw Object.assign(new Error('没有配置高德 Key'), { reason: 'no-key' });

  let total = 0;
  let duration = 0;
  const legs = [];
  const geometry = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const url =
      'https://restapi.amap.com/v3/direction/driving?key=' +
      encodeURIComponent(key) +
      '&origin=' +
      (function () {
        var g = wgs84ToGcj02(a[1], a[0]);
        return g[0].toFixed(6) + ',' + g[1].toFixed(6);
      })() +
      '&destination=' +
      (function () {
        var g = wgs84ToGcj02(b[1], b[0]);
        return g[0].toFixed(6) + ',' + g[1].toFixed(6);
      })() +
      '&extensions=base&strategy=0';

    const res = await fetch(url, {
      headers: { 'User-Agent': 'xiaojiaoya/1.0' },
      signal: AbortSignal.timeout(AMAP_ROUTE_TIMEOUT)
    });
    const data = await res.json();
    if (!data || data.status !== '1' || !data.route || !data.route.paths || !data.route.paths[0]) {
      throw new Error(friendlyAmapInfo(data && data.info));
    }

    const path = data.route.paths[0];
    const dist = parseFloat(path.distance) || 0;
    const dur = parseFloat(path.duration) || 0;
    total += dist;
    duration += dur;
    legs.push({ distance: dist, duration: dur });

    (path.steps || []).forEach(function (step) {
      if (!step.polyline) return;
      step.polyline.split(';').forEach(function (pair) {
        const parts = pair.split(',');
        if (parts.length < 2) return;
        const w = gcj02ToWgs84(parseFloat(parts[0]), parseFloat(parts[1]));
        if (isFinite(w[0]) && isFinite(w[1])) geometry.push([w[1], w[0]]);
      });
    });
  }

  return {
    source: 'amap',
    distance: total,
    duration: duration,
    legs: legs,
    geometry: thinPath(geometry, ROUTE_GEOMETRY_LIMIT)
  };
}

/* ============================================================
 * API
 * ============================================================ */

async function handleApi(req, res, urlPath) {
  const method = req.method || 'GET';
  const store = loadDb();

  /* ---- 探活：前端用它判断是否启用服务端存储 ---- */
  if (urlPath === '/api/health') {
    return sendJSON(res, 200, {
      app: APP_NAME,
      version: 1,
      mode: 'server',
      dataDir: DATA_DIR,
      hasFamily: !!(store.family && store.family.members && store.family.members.length),
      hasAmapKey: !!loadConfig().amapKey,
      counts: { trips: store.trips.length, revisits: store.revisits.length }
    });
  }

  /* ---- 服务器配置：高德 Key（配置一次，所有设备通用） ---- */
  if (urlPath === '/api/config') {
    if (method === 'GET') {
      const c = loadConfig();
      return sendJSON(res, 200, {
        hasAmapKey: !!c.amapKey,
        amapKeyTail: c.amapKey ? c.amapKey.slice(-4) : ''
      });
    }
    if (method === 'PUT') {
      const body = await readJSON(req, 64 * 1024);
      const c = loadConfig();
      c.amapKey = ((body && body.amapKey) || '').trim();
      saveConfig();
      return sendJSON(res, 200, { ok: true, hasAmapKey: !!c.amapKey });
    }
    return sendJSON(res, 405, { error: '方法不支持' });
  }

  /* ---- 真实道路路径规划 ---- */
  if (urlPath === '/api/route') {
    let pts = [];
    try {
      const u = new URL(req.url, 'http://localhost');
      const raw = (u.searchParams.get('points') || '').trim();
      pts = raw
        .split(';')
        .map(function (pair) {
          const parts = pair.split(',');
          if (parts.length !== 2) return null;
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!isFinite(lat) || !isFinite(lng)) return null;
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
          return [lat, lng];
        })
        .filter(Boolean);
    } catch (e) {}

    if (pts.length < 2) {
      return sendJSON(res, 400, { ok: false, reason: 'too-few', message: '至少要两个点才能规划路线' });
    }
    if (pts.length > ROUTE_MAX_POINTS) {
      return sendJSON(res, 400, { ok: false, reason: 'too-many', message: '一次最多规划 ' + ROUTE_MAX_POINTS + ' 个点' });
    }

    const cacheKey = pts
      .map(function (p) {
        return p[0].toFixed(4) + ',' + p[1].toFixed(4);
      })
      .join(';');
    const cached = routeCacheGet(cacheKey);
    if (cached) return sendJSON(res, 200, Object.assign({ cached: true }, cached));

    const hasKey = !!loadConfig().amapKey;
    const attempts = hasKey ? [fetchAmapRoute, fetchOsrmRoute] : [fetchOsrmRoute];
    let lastErr = null;

    for (let i = 0; i < attempts.length; i++) {
      try {
        const result = await attempts[i](pts);
        const payload = {
          ok: true,
          source: result.source,
          distance: result.distance,
          duration: result.duration,
          legs: result.legs,
          geometry: result.geometry,
          points: pts
        };
        routeCacheSet(cacheKey, payload);
        return sendJSON(res, 200, payload);
      } catch (err) {
        lastErr = err;
      }
    }

    return sendJSON(res, 200, {
      ok: false,
      reason: 'unreachable',
      message: '路径规划服务暂时不可用：' + ((lastErr && lastErr.message) || '未知原因')
    });
  }

  /* ---- 地点搜索代理 ----
   * 同时并发问「高德」和「Photon」，谁有结果就用谁的，合并后按类型重要度排序。
   * 走服务端的好处：不受浏览器跨域限制、Key 不暴露、可以缓存。
   */
  if (urlPath === '/api/search' && method === 'GET') {
    let q = '';
    let bias = null;
    try {
      const u = new URL(req.url, 'http://localhost');
      q = (u.searchParams.get('q') || '').trim();
      const lat = parseFloat(u.searchParams.get('lat'));
      const lng = parseFloat(u.searchParams.get('lng'));
      if (isFinite(lat) && isFinite(lng)) bias = { lat: lat, lon: lng };
    } catch (e) {}
    if (!q) return sendJSON(res, 400, { ok: false, reason: 'empty', message: '请输入要搜索的地点' });

    const cacheKey = q + '|' + (bias ? bias.lat.toFixed(2) + ',' + bias.lon.toFixed(2) : '');
    const cached = searchCacheGet(cacheKey);
    if (cached) return sendJSON(res, 200, Object.assign({ cached: true }, cached));

    const key = loadConfig().amapKey;
    const errors = [];
    const jobs = [];

    if (key) {
      jobs.push(
        searchAmapUpstream(q)
          .then((list) => list)
          .catch((err) => {
            errors.push({ source: 'amap', message: err.message, reason: err.reason || 'amap-error' });
            return [];
          })
      );
    }

    jobs.push(
      searchPhotonUpstream(q, bias)
        .then((list) => list)
        .catch((err) => {
          errors.push({ source: 'photon', message: err.message, reason: 'unreachable' });
          return [];
        })
    );

    const lists = await Promise.all(jobs);
    const merged = rankPlaces([].concat.apply([], lists));

    const payload = {
      ok: true,
      results: merged.slice(0, 20),
      errors: errors,
      onlineReady: !!(key || merged.length),
      hasKey: !!key
    };
    // 只有真正拿到结果才缓存，避免把失败缓存住
    if (merged.length) searchCacheSet(cacheKey, payload);
    return sendJSON(res, 200, payload);
  }

  /* ---- 一次性拉取全部结构化数据 ---- */
  if (urlPath === '/api/state' && method === 'GET') {
    return sendJSON(res, 200, {
      family: store.family,
      trips: store.trips,
      revisits: store.revisits,
      updatedAt: store.updatedAt
    });
  }

  /* ---- 家庭 ---- */
  if (urlPath === '/api/family') {
    if (method === 'GET') return sendJSON(res, 200, store.family);
    if (method === 'PUT') {
      const family = await readJSON(req, MAX_JSON_BODY);
      if (!family || !Array.isArray(family.members)) {
        return sendJSON(res, 400, { error: '家庭数据结构不正确' });
      }
      store.family = family;
      store.updatedAt = Date.now();
      await saveDb();
      return sendJSON(res, 200, { ok: true, updatedAt: store.updatedAt });
    }
    return sendJSON(res, 405, { error: '方法不支持' });
  }

  /* ---- 行程 ---- */
  if (urlPath === '/api/trips') {
    if (method === 'GET') return sendJSON(res, 200, store.trips);
    if (method === 'POST' || method === 'PUT') {
      const trip = await readJSON(req, MAX_JSON_BODY);
      if (!trip || !trip.id) return sendJSON(res, 400, { error: '行程缺少 id' });
      const i = store.trips.findIndex((t) => t.id === trip.id);
      if (i >= 0) store.trips[i] = trip;
      else store.trips.push(trip);
      store.updatedAt = Date.now();
      await saveDb();
      return sendJSON(res, 200, { ok: true, total: store.trips.length });
    }
    if (method === 'DELETE') {
      store.trips = [];
      store.updatedAt = Date.now();
      await saveDb();
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 405, { error: '方法不支持' });
  }

  let m = urlPath.match(/^\/api\/trips\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const i = store.trips.findIndex((t) => t.id === id);
    if (method === 'GET') {
      return i >= 0 ? sendJSON(res, 200, store.trips[i]) : sendJSON(res, 404, { error: '没有这段行程' });
    }
    if (method === 'DELETE') {
      if (i >= 0) {
        store.trips.splice(i, 1);
        store.updatedAt = Date.now();
        await saveDb();
      }
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 405, { error: '方法不支持' });
  }

  /* ---- 重温记录 ---- */
  if (urlPath === '/api/revisits') {
    if (method === 'GET') return sendJSON(res, 200, store.revisits);
    if (method === 'POST' || method === 'PUT') {
      const rv = await readJSON(req, MAX_JSON_BODY);
      if (!rv || !rv.id) return sendJSON(res, 400, { error: '记录缺少 id' });
      const i = store.revisits.findIndex((r) => r.id === rv.id);
      if (i >= 0) store.revisits[i] = rv;
      else store.revisits.push(rv);
      store.updatedAt = Date.now();
      await saveDb();
      return sendJSON(res, 200, { ok: true, total: store.revisits.length });
    }
    if (method === 'DELETE') {
      store.revisits = [];
      store.updatedAt = Date.now();
      await saveDb();
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 405, { error: '方法不支持' });
  }

  m = urlPath.match(/^\/api\/revisits\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const i = store.revisits.findIndex((r) => r.id === id);
    if (method === 'GET') {
      return i >= 0 ? sendJSON(res, 200, store.revisits[i]) : sendJSON(res, 404, { error: '没有这条记录' });
    }
    if (method === 'DELETE') {
      if (i >= 0) {
        store.revisits.splice(i, 1);
        store.updatedAt = Date.now();
        await saveDb();
      }
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 405, { error: '方法不支持' });
  }

  /* ---- 清空全部照片 ---- */
  if (urlPath === '/api/photos' && method === 'DELETE') {
    ensureDirs();
    let removed = 0;
    try {
      fs.readdirSync(PHOTO_DIR).forEach((f) => {
        if (f.endsWith('.jpg')) {
          fs.unlink(path.join(PHOTO_DIR, f), () => {});
          removed++;
        }
      });
    } catch (e) {}
    return sendJSON(res, 200, { ok: true, removed: removed });
  }

  /* ---- 照片列表 ---- */
  if (urlPath === '/api/photos' && method === 'GET') {
    ensureDirs();
    const list = fs
      .readdirSync(PHOTO_DIR)
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => {
        let size = 0;
        try {
          size = fs.statSync(path.join(PHOTO_DIR, f)).size;
        } catch (e) {}
        return { id: f.replace(/\.jpg$/, ''), size: size };
      });
    return sendJSON(res, 200, list);
  }

  /* ---- 单张照片 ---- */
  m = urlPath.match(/^\/api\/photos\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!safePhotoId(id)) return sendJSON(res, 400, { error: '照片 id 不合法' });
    const file = photoPath(id);

    if (method === 'GET') {
      fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404');
        }
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': stat.size,
          // 照片内容不会变，允许浏览器长期缓存
          'Cache-Control': 'public, max-age=31536000, immutable'
        });
        fs.createReadStream(file).pipe(res);
      });
      return;
    }

    if (method === 'PUT' || method === 'POST') {
      const buf = await readBody(req, MAX_PHOTO_BODY);
      if (!buf.length) return sendJSON(res, 400, { error: '没有收到内容' });
      ensureDirs();
      const tmp = file + '.tmp-' + process.pid;
      await new Promise((resolve) => fs.writeFile(tmp, buf, resolve));
      await new Promise((resolve) =>
        fs.rename(tmp, file, (err) => {
          if (err) console.error('  ⚠ 照片保存失败：' + err.message);
          resolve();
        })
      );
      return sendJSON(res, 200, { ok: true, size: buf.length });
    }

    if (method === 'DELETE') {
      fs.unlink(file, () => {});
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 405, { error: '方法不支持' });
  }

  /* ---- 清空 ---- */
  if (urlPath === '/api/reset' && method === 'POST') {
    db = emptyDb();
    await saveDb();
    try {
      fs.readdirSync(PHOTO_DIR).forEach((f) => {
        if (f.endsWith('.jpg')) fs.unlink(path.join(PHOTO_DIR, f), () => {});
      });
    } catch (e) {}
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: '接口不存在：' + urlPath });
}

/* ============================================================
 * 静态文件
 * ============================================================ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function safeJoin(root, target) {
  const p = path.normalize(path.join(root, target));
  return p.startsWith(root + path.sep) || p === root ? p : null;
}

function serveStatic(req, res, urlPath) {
  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 找不到文件：' + urlPath);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': stat.size
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ============================================================
 * 服务器
 * ============================================================ */

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    urlPath = '/';
  }
  if (urlPath === '/') urlPath = '/index.html';

  // 数据目录绝对不允许被当作静态资源访问
  if (urlPath === '/data' || urlPath.startsWith('/data/') || urlPath.includes('/../')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 数据目录不对外提供');
  }

  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    handleApi(req, res, urlPath).catch((err) => {
      console.error('  ⚠ 接口出错：' + (err && err.message));
      if (!res.headersSent) sendJSON(res, 500, { error: (err && err.message) || '服务器内部错误' });
    });
    return;
  }

  // server.js / start.bat 等部署文件不必暴露，但保留也无妨
  serveStatic(req, res, urlPath);
});

function localIPs() {
  const list = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((info) => {
      if (info.family === 'IPv4' && !info.internal) list.push(info.address);
    });
  });
  return list;
}

server.listen(PORT, () => {
  loadDb();
  let photoCount = 0;
  try {
    photoCount = fs.readdirSync(PHOTO_DIR).filter((f) => f.endsWith('.jpg')).length;
  } catch (e) {}

  console.log('');
  console.log('  👣  小脚丫旅行记 · 服务端存储已启用');
  console.log('  --------------------------------------------------');
  console.log('  本机访问：   http://localhost:' + PORT);
  localIPs().forEach((ip) => {
    console.log('  局域网访问： http://' + ip + ':' + PORT + '   （手机 / 平板用这个）');
  });
  console.log('  --------------------------------------------------');
  console.log('  数据目录：   ' + DATA_DIR);
  console.log('  已有数据：   ' + (db.family ? '1 个家庭' : '还没有家庭') + ' / ' + db.trips.length + ' 段行程 / ' + photoCount + ' 张照片');
  console.log('  --------------------------------------------------');
  console.log('  任何设备打开上面的地址，看到的都是同一份数据。');
  console.log('  按 Ctrl + C 停止服务');
  console.log('');
});
