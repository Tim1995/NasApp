/* ============================================================
 * 小脚丫旅行记 · 数据仓库（双后端）
 *
 *   ① server 模式：如果页面是由 server.js 提供的，数据存在服务器磁盘上，
 *      任何设备打开同一个地址看到的都是同一份数据；
 *   ② local  模式：如果只是把网页文件丢在静态托管上，数据存在本机浏览器里。
 *
 * 启动时自动探测，界面上层完全不需要关心用的是哪一种。
 *
 * 无论哪种模式，下面这些「设备本地」的东西永远存在浏览器里：
 *   - 登录状态（session）：这台设备是谁在用
 *   - 显示偏好（immersive）、地图搜索 Key
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;

  var DB = (BF.DB = {});

  var DB_NAME = 'babyfootprint';
  var DB_VERSION = 1;

  var STORES = {
    kv: 'kv',
    trips: 'trips',
    revisits: 'revisits',
    blobs: 'blobs'
  };
  DB.STORES = STORES;

  /* 这些内容跟随服务器；其余留在本机 */
  var SYNCED_STORES = [STORES.trips, STORES.revisits, STORES.blobs];
  var SYNCED_KV_KEYS = ['family'];

  DB.mode = 'local'; // 'local' | 'server'
  DB.serverInfo = null;
  DB.localAvailable = true;
  DB.ready = false;

  var _db = null;
  var _mem = null;

  /* ============================================================
   * 一、本机后端（IndexedDB）
   * ============================================================ */

  function initMemory() {
    DB.localAvailable = false;
    _mem = {};
    Object.keys(STORES).forEach(function (name) {
      _mem[name] = new Map();
    });
    console.warn('[小脚丫] 本机 IndexedDB 不可用，已切换为临时内存模式。');
  }

  function openLocal() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve) {
      if (!global.indexedDB) {
        initMemory();
        return resolve(null);
      }
      var req;
      try {
        req = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        initMemory();
        return resolve(null);
      }
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORES.kv)) d.createObjectStore(STORES.kv);
        if (!d.objectStoreNames.contains(STORES.trips)) d.createObjectStore(STORES.trips, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.revisits)) d.createObjectStore(STORES.revisits, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.blobs)) d.createObjectStore(STORES.blobs);
      };
      req.onsuccess = function () {
        _db = req.result;
        _db.onversionchange = function () {
          _db.close();
          _db = null;
          DB.ready = false;
        };
        resolve(_db);
      };
      req.onerror = function () {
        initMemory();
        resolve(null);
      };
      req.onblocked = function () {
        initMemory();
        resolve(null);
      };
    });
  }

  function tx(storeName, mode, executor) {
    return openLocal().then(function () {
      if (!DB.localAvailable) return executor(null, true);
      return new Promise(function (resolve, reject) {
        var transaction = _db.transaction(storeName, mode);
        var store = transaction.objectStore(storeName);
        var out;
        try {
          out = executor(store, false);
        } catch (err) {
          reject(err);
          return;
        }
        transaction.oncomplete = function () {
          resolve(out && out.__req ? out.__req.result : out);
        };
        transaction.onerror = function () {
          reject(transaction.error);
        };
        transaction.onabort = function () {
          reject(transaction.error || new Error('事务被中止'));
        };
      });
    });
  }

  function req(request) {
    return { __req: request };
  }

  function localGet(storeName, key) {
    return tx(storeName, 'readonly', function (store, memory) {
      if (memory) return _mem[storeName].get(key);
      return req(store.get(key));
    });
  }

  function localPut(storeName, value, key) {
    return tx(storeName, 'readwrite', function (store, memory) {
      if (memory) {
        _mem[storeName].set(key === undefined ? value.id : key, value);
        return value;
      }
      return key === undefined ? store.put(value) : store.put(value, key);
    }).then(function () {
      return value;
    });
  }

  function localDel(storeName, key) {
    return tx(storeName, 'readwrite', function (store, memory) {
      if (memory) {
        _mem[storeName].delete(key);
        return true;
      }
      return req(store.delete(key));
    });
  }

  function localAll(storeName) {
    return tx(storeName, 'readonly', function (store, memory) {
      if (memory) return Array.from(_mem[storeName].values());
      return req(store.getAll());
    }).then(function (v) {
      return v || [];
    });
  }

  function localAllEntries(storeName) {
    return tx(storeName, 'readonly', function (store, memory) {
      if (memory) {
        return Array.from(_mem[storeName].entries()).map(function (e) {
          return { key: e[0], value: e[1] };
        });
      }
      return new Promise(function (resolve, reject) {
        var out = [];
        var cursor = store.openCursor();
        cursor.onsuccess = function (e) {
          var c = e.target.result;
          if (c) {
            out.push({ key: c.key, value: c.value });
            c.continue();
          } else {
            resolve(out);
          }
        };
        cursor.onerror = function () {
          reject(cursor.error);
        };
      });
    });
  }

  function localClear(storeName) {
    return tx(storeName, 'readwrite', function (store, memory) {
      if (memory) {
        _mem[storeName].clear();
        return true;
      }
      return req(store.clear());
    });
  }

  /* ============================================================
   * 二、服务端后端（REST API）
   * ============================================================ */

  var remote = { state: null, loaded: false };

  function api(path) {
    return path;
  }

  var warnedOffline = false;

  /** 统一的请求封装：失败时给出一次明确提示 */
  function remoteFetch(path, options) {
    return fetch(path, options).then(
      function (res) {
        if (!res.ok) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (body) {
              throw new Error(body.error || '服务器返回 ' + res.status);
            });
        }
        warnedOffline = false;
        return res;
      },
      function () {
        if (!warnedOffline) {
          warnedOffline = true;
          U.toast('与服务器的连接中断了，请检查服务器是否还在运行', 'error');
        }
        throw new Error('无法连接到服务器');
      }
    );
  }

  function remoteJSON(path, options) {
    return remoteFetch(path, options).then(function (r) {
      return r.json();
    });
  }

  function remoteSend(path, method, data) {
    return remoteJSON(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  /** 探测是否跑在 server.js 提供的地址上 */
  DB.detect = function () {
    if (!global.fetch) return Promise.resolve('local');
    // 双击 index.html 打开（file: 协议）时没有服务端，别去发无谓的请求，
    // 否则控制台会留下一条 CORS 报错，让人以为程序坏了。
    if (global.location && location.protocol === 'file:') return Promise.resolve('local');
    return fetch(api('/api/health'), { cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (info) {
        if (info && info.app === '小脚丫旅行记') {
          DB.mode = 'server';
          DB.serverInfo = info;
        }
        return DB.mode;
      })
      .catch(function () {
        return DB.mode;
      });
  };

  DB.loadRemoteState = function () {
    return remoteJSON(api('/api/state')).then(function (state) {
      remote.state = {
        family: state.family || null,
        trips: state.trips || [],
        revisits: state.revisits || []
      };
      remote.loaded = true;
      return remote.state;
    });
  };

  DB.remoteLoaded = function () {
    return remote.loaded;
  };

  /** 服务器上是否已经有数据（用于「要不要把本机数据传上去」的判断） */
  DB.remoteIsEmpty = function () {
    if (!remote.state) return true;
    return !remote.state.family && !remote.state.trips.length && !remote.state.revisits.length;
  };

  /** 照片在服务器上的直链，浏览器可自行缓存 */
  DB.remotePhotoUrl = function (id) {
    if (!id) return '';
    return '/api/photos/' + encodeURIComponent(id);
  };

  /* ============================================================
   * 三、统一接口
   * ============================================================ */

  function isRemoteTarget(storeName, key) {
    if (DB.mode !== 'server') return false;
    if (SYNCED_STORES.indexOf(storeName) >= 0) return true;
    if (storeName === STORES.kv && SYNCED_KV_KEYS.indexOf(key) >= 0) return true;
    return false;
  }

  /* ------------------------- 键值配置 ------------------------- */
  /* 注意：只有 family 会跟随服务器，session / 偏好 / Key 都留在本机 */

  DB.kvGet = function (key, fallback) {
    return DB.get(STORES.kv, key).then(function (v) {
      return v === undefined || v === null ? (fallback === undefined ? null : fallback) : v;
    });
  };

  DB.kvSet = function (key, value) {
    return DB.put(STORES.kv, value, key);
  };

  DB.kvDel = function (key) {
    return DB.del(STORES.kv, key);
  };

  DB.init = function () {
    return openLocal()
      .then(function () {
        return DB.detect();
      })
      .then(function () {
        if (DB.mode === 'server') return DB.loadRemoteState();
      })
      .then(function () {
        DB.ready = true;
        return DB.mode;
      })
      .catch(function (err) {
        console.warn('[小脚丫] 初始化异常，降级为本机存储', err);
        DB.mode = 'local';
        DB.ready = true;
        return DB.mode;
      });
  };

  /* 兼容旧调用 */
  DB.open = function () {
    if (DB.ready) return Promise.resolve(_db);
    return openLocal();
  };

  DB.get = function (storeName, key) {
    if (isRemoteTarget(storeName, key)) {
      if (storeName === STORES.kv) {
        return remote.loaded
          ? Promise.resolve(remote.state.family)
          : DB.loadRemoteState().then(function () {
              return remote.state.family;
            });
      }
      if (storeName === STORES.trips) return DB.getTripRemote(key);
      if (storeName === STORES.revisits) return DB.getRevisitRemote(key);
      if (storeName === STORES.blobs) return DB.getBlob(key);
    }
    return localGet(storeName, key);
  };

  DB.put = function (storeName, value, key) {
    if (isRemoteTarget(storeName, key)) {
      if (storeName === STORES.kv) return DB.saveFamilyRemote(value);
      if (storeName === STORES.trips) return DB.saveTripRemote(value);
      if (storeName === STORES.revisits) return DB.saveRevisitRemote(value);
      if (storeName === STORES.blobs) return DB.putBlob(key === undefined ? value.id : key, value);
    }
    return localPut(storeName, value, key);
  };

  DB.del = function (storeName, key) {
    if (isRemoteTarget(storeName, key)) {
      if (storeName === STORES.kv) return DB.saveFamilyRemote(null);
      if (storeName === STORES.trips) return DB.deleteTripRemote(key);
      if (storeName === STORES.revisits) return DB.deleteRevisitRemote(key);
      if (storeName === STORES.blobs) return DB.delBlob(key);
    }
    return localDel(storeName, key);
  };

  DB.all = function (storeName) {
    if (DB.mode === 'server') {
      if (storeName === STORES.trips) {
        return ensureRemote().then(function () {
          return remote.state.trips.slice();
        });
      }
      if (storeName === STORES.revisits) {
        return ensureRemote().then(function () {
          return remote.state.revisits.slice();
        });
      }
      if (storeName === STORES.blobs) return DB.listRemotePhotos();
    }
    return localAll(storeName);
  };

  DB.allEntries = function (storeName) {
    if (DB.mode === 'server' && storeName === STORES.blobs) {
      return DB.listRemotePhotos().then(function (list) {
        return list.map(function (item) {
          return { key: item.id, value: null };
        });
      });
    }
    return localAllEntries(storeName);
  };

  DB.clear = function (storeName) {
    if (DB.mode === 'server') {
      if (storeName === STORES.trips) {
        return remoteJSON(api('/api/trips'), { method: 'DELETE' }).then(function () {
          if (remote.state) remote.state.trips = [];
        });
      }
      if (storeName === STORES.revisits) {
        return remoteJSON(api('/api/revisits'), { method: 'DELETE' }).then(function () {
          if (remote.state) remote.state.revisits = [];
        });
      }
      if (storeName === STORES.blobs) {
        return remoteJSON(api('/api/photos'), { method: 'DELETE' });
      }
    }
    return localClear(storeName);
  };

  function ensureRemote() {
    if (remote.loaded) return Promise.resolve(remote.state);
    return DB.loadRemoteState();
  }

  /* ------------------------- 服务端：家庭 ------------------------- */

  DB.saveFamilyRemote = function (family) {
    return remoteSend(api('/api/family'), 'PUT', family).then(function () {
      if (!remote.state) remote.state = { family: null, trips: [], revisits: [] };
      remote.state.family = family;
      return family;
    });
  };

  /* ------------------------- 服务端：行程 ------------------------- */

  DB.saveTripRemote = function (trip) {
    return remoteSend(api('/api/trips'), 'POST', trip).then(function () {
      if (!remote.state) remote.state = { family: null, trips: [], revisits: [] };
      var i = -1;
      for (var k = 0; k < remote.state.trips.length; k++) {
        if (remote.state.trips[k].id === trip.id) i = k;
      }
      if (i >= 0) remote.state.trips[i] = trip;
      else remote.state.trips.push(trip);
      return trip;
    });
  };

  DB.getTripRemote = function (id) {
    return ensureRemote().then(function () {
      for (var i = 0; i < remote.state.trips.length; i++) {
        if (remote.state.trips[i].id === id) return remote.state.trips[i];
      }
      return null;
    });
  };

  DB.deleteTripRemote = function (id) {
    return remoteJSON(api('/api/trips/' + encodeURIComponent(id)), { method: 'DELETE' }).then(function () {
      if (remote.state) {
        remote.state.trips = remote.state.trips.filter(function (t) {
          return t.id !== id;
        });
      }
    });
  };

  /* ------------------------- 服务端：重温 ------------------------- */

  DB.saveRevisitRemote = function (rv) {
    return remoteSend(api('/api/revisits'), 'POST', rv).then(function () {
      if (!remote.state) remote.state = { family: null, trips: [], revisits: [] };
      var i = -1;
      for (var k = 0; k < remote.state.revisits.length; k++) {
        if (remote.state.revisits[k].id === rv.id) i = k;
      }
      if (i >= 0) remote.state.revisits[i] = rv;
      else remote.state.revisits.push(rv);
      return rv;
    });
  };

  DB.getRevisitRemote = function (id) {
    return ensureRemote().then(function () {
      for (var i = 0; i < remote.state.revisits.length; i++) {
        if (remote.state.revisits[i].id === id) return remote.state.revisits[i];
      }
      return null;
    });
  };

  DB.deleteRevisitRemote = function (id) {
    return remoteJSON(api('/api/revisits/' + encodeURIComponent(id)), { method: 'DELETE' }).then(function () {
      if (remote.state) {
        remote.state.revisits = remote.state.revisits.filter(function (r) {
          return r.id !== id;
        });
      }
    });
  };

  /* ------------------------- 照片 ------------------------- */

  DB.putBlob = function (id, blob) {
    if (DB.mode === 'server') {
      return remoteFetch(api('/api/photos/' + encodeURIComponent(id)), {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob
      }).then(function () {
        return blob;
      });
    }
    return localPut(STORES.blobs, blob, id);
  };

  DB.getBlob = function (id) {
    if (!id) return Promise.resolve(null);
    if (DB.mode === 'server') {
      return remoteFetch(api('/api/photos/' + encodeURIComponent(id)))
        .then(function (r) {
          return r.blob();
        })
        .catch(function () {
          return null;
        });
    }
    return localGet(STORES.blobs, id);
  };

  DB.delBlob = function (id) {
    if (!id) return Promise.resolve();
    if (DB.mode === 'server') {
      return remoteFetch(api('/api/photos/' + encodeURIComponent(id)), { method: 'DELETE' }).catch(function () {});
    }
    return localDel(STORES.blobs, id);
  };

  DB.listRemotePhotos = function () {
    return remoteJSON(api('/api/photos')).catch(function () {
      return [];
    });
  };

  /* ------------------------- 维护 ------------------------- */

  DB.estimate = function () {
    if (DB.mode === 'server') {
      return DB.listRemotePhotos().then(function (list) {
        var total = list.reduce(function (s, item) {
          return s + (item.size || 0);
        }, 0);
        return { usage: total, quota: 0, server: true };
      });
    }
    if (global.navigator && navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) {
        return { usage: e.usage || 0, quota: e.quota || 0 };
      });
    }
    return localAll(STORES.blobs).then(function (list) {
      var total = list.reduce(function (sum, b) {
        return sum + (b && b.size ? b.size : 0);
      }, 0);
      return { usage: total, quota: 0 };
    });
  };

  DB.requestPersistence = function () {
    if (DB.mode === 'server') return Promise.resolve(true);
    if (global.navigator && navigator.storage && navigator.storage.persist) {
      return navigator.storage.persisted
        ? navigator.storage.persisted().then(function (already) {
            return already ? true : navigator.storage.persist();
          })
        : navigator.storage.persist();
    }
    return Promise.resolve(false);
  };

  /** 彻底清空：服务端模式连服务器上的数据一起清 */
  DB.resetAll = function () {
    var chain = DB.mode === 'server'
      ? remoteJSON(api('/api/reset'), { method: 'POST' }).then(function () {
          remote.state = { family: null, trips: [], revisits: [] };
        })
      : Promise.resolve();
    return chain
      .then(function () {
        return Promise.all([
          localClear(STORES.trips),
          localClear(STORES.revisits),
          localClear(STORES.blobs),
          localClear(STORES.kv)
        ]);
      })
      .then(function () {
        return DB.mode === 'server' ? Promise.all([DB.clear(STORES.trips), DB.clear(STORES.revisits), DB.clear(STORES.blobs)]) : null;
      });
  };

  /* ============================================================
   * 四、本机数据 → 服务器（迁移）
   * ============================================================ */

  /** 本机是否有值得上传的数据 */
  DB.localHasData = function () {
    return Promise.all([localGet(STORES.kv, 'family'), localAll(STORES.trips), localAll(STORES.revisits)]).then(function (res) {
      return !!(res[0] || res[1].length || res[2].length);
    });
  };

  /**
   * 把本机 IndexedDB 里的全部数据搬到服务器
   * @param onProgress(done, total, label)
   */
  DB.migrateLocalToServer = function (onProgress) {
    if (DB.mode !== 'server') return Promise.reject(new Error('当前不是服务器模式'));

    return Promise.all([localGet(STORES.kv, 'family'), localAll(STORES.trips), localAll(STORES.revisits), localAllEntries(STORES.blobs)]).then(
      function (res) {
        var family = res[0];
        var trips = res[1];
        var revisits = res[2];
        var blobs = res[3] || [];
        var total = blobs.length + 1;
        var done = 0;

        var photos = [];
        var chain = Promise.resolve();
        blobs.forEach(function (item) {
          chain = chain.then(function () {
            return DB.putBlob(item.key, item.value).then(function () {
              done++;
              photos.push(item.key);
              if (onProgress) onProgress(done, total, '照片 ' + done + '/' + blobs.length);
            });
          });
        });

        return chain
          .then(function () {
            if (family) return DB.saveFamilyRemote(family);
          })
          .then(function () {
            var c = Promise.resolve();
            trips.forEach(function (t) {
              c = c.then(function () {
                return DB.saveTripRemote(t);
              });
            });
            return c;
          })
          .then(function () {
            var c = Promise.resolve();
            revisits.forEach(function (r) {
              c = c.then(function () {
                return DB.saveRevisitRemote(r);
              });
            });
            return c;
          })
          .then(function () {
            if (onProgress) onProgress(total, total, '完成');
            return { family: !!family, trips: trips.length, revisits: revisits.length, photos: photos.length };
          });
      }
    );
  };

})(window);
