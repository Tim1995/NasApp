/* ============================================================
 * 小脚丫旅行记 · 备份与还原
 * 把全部数据（家庭、行程、重温记录、照片原图）打包成一个 zip，
 * 或者从 zip 完整还原。欢迎页与设置页共用。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = BF.U;
  var DB = BF.DB;

  var Backup = (BF.Backup = {});

  Backup.FILE_PREFIX = '小脚丫旅行记-备份-';

  /* ------------------------- 导出 ------------------------- */

  /** 取出全部照片二进制，服务端模式下去服务器拉 */
  function collectPhotos(onProgress) {
    if (BF.DB.mode === 'server') {
      return BF.DB.listRemotePhotos().then(function (list) {
        var out = [];
        var chain = Promise.resolve();
        list.forEach(function (item, i) {
          chain = chain.then(function () {
            return fetch('/api/photos/' + encodeURIComponent(item.id))
              .then(function (r) {
                return r.ok ? r.blob() : null;
              })
              .then(function (blob) {
                if (blob) out.push({ key: item.id, value: blob });
                if (onProgress) onProgress(i + 1, list.length);
              })
              .catch(function () {
                if (onProgress) onProgress(i + 1, list.length);
              });
          });
        });
        return chain.then(function () {
          return out;
        });
      });
    }
    return DB.allEntries(DB.STORES.blobs);
  }

  Backup.export = function (onProgress) {
    return collectPhotos(onProgress).then(function (blobs) {
      var meta = {
        app: '小脚丫旅行记',
        version: 1,
        storage: BF.DB.mode,
        exportedAt: new Date().toISOString(),
        family: BF.Auth.family || null,
        trips: BF.Data.trips || [],
        revisits: BF.Data.revisits || []
      };
      var entries = [
        {
          name: 'data.json',
          blob: new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' })
        }
      ];
      blobs.forEach(function (item) {
        if (!item.value) return;
        entries.push({ name: 'photos/' + encodeURIComponent(item.key) + '.jpg', blob: item.value });
      });
      return BF.Zip.create(entries);
    });
  };

  Backup.defaultFileName = function () {
    return Backup.FILE_PREFIX + U.todayISO() + '.zip';
  };

  /** 导出并直接触发下载 */
  Backup.exportAndDownload = function () {
    return Backup.export().then(function (blob) {
      U.downloadBlob(blob, Backup.defaultFileName());
      return blob;
    });
  };

  /* ------------------------- 导入 ------------------------- */

  /**
   * 从 zip 文件还原全部数据
   * @returns Promise<{family, trips, revisits}>
   */
  Backup.restore = function (file) {
    return BF.Zip.read(file).then(function (files) {
      var metaEntry = null;
      var photoEntries = [];
      files.forEach(function (f) {
        if (f.name === 'data.json') metaEntry = f;
        else if (f.name.indexOf('photos/') === 0) photoEntries.push(f);
      });
      if (!metaEntry) throw new Error('这个文件里没有找到 data.json，可能不是本应用的备份');

      var meta;
      try {
        meta = JSON.parse(new TextDecoder().decode(metaEntry.bytes));
      } catch (e) {
        throw new Error('备份文件已损坏，无法读取');
      }
      if (!meta || meta.app !== '小脚丫旅行记') {
        throw new Error('这不是「小脚丫旅行记」的备份文件');
      }
      if (!meta.family || !meta.family.members || !meta.family.members.length) {
        throw new Error('备份里没有家庭信息');
      }

      return Promise.all([
        DB.clear(DB.STORES.trips),
        DB.clear(DB.STORES.revisits),
        DB.clear(DB.STORES.blobs)
      ])
        .then(function () {
          var chain = Promise.resolve();
          photoEntries.forEach(function (entry) {
            chain = chain.then(function () {
              var id = decodeURIComponent(entry.name.slice('photos/'.length).replace(/\.jpg$/, ''));
              if (!id) return;
              return DB.putBlob(id, new Blob([entry.bytes], { type: 'image/jpeg' }));
            });
          });
          return chain;
        })
        .then(function () {
          return DB.kvSet('family', meta.family);
        })
        .then(function () {
          var c = Promise.resolve();
          (meta.trips || []).forEach(function (t) {
            c = c.then(function () {
              return DB.put(DB.STORES.trips, t);
            });
          });
          return c;
        })
        .then(function () {
          var c = Promise.resolve();
          (meta.revisits || []).forEach(function (r) {
            c = c.then(function () {
              return DB.put(DB.STORES.revisits, r);
            });
          });
          return c;
        })
        .then(function () {
          return meta;
        });
    });
  };

  /* ------------------------- 选文件 ------------------------- */

  /** 打开文件选择器 */
  Backup.pickFile = function () {
    return new Promise(function (resolve) {
      var input = U.el('input', {
        type: 'file',
        accept: '.zip,application/zip,application/x-zip-compressed',
        style: { display: 'none' }
      });
      var done = false;
      input.addEventListener('change', function () {
        done = true;
        var file = input.files && input.files[0];
        if (input.parentNode) input.parentNode.removeChild(input);
        resolve(file || null);
      });
      // 用户取消时不会触发 change，用窗口焦点回归做兜底清理
      global.addEventListener(
        'focus',
        function onFocus() {
          global.removeEventListener('focus', onFocus);
          setTimeout(function () {
            if (!done && input.parentNode) input.parentNode.removeChild(input);
          }, 800);
        },
        { once: true }
      );
      document.body.appendChild(input);
      input.click();
    });
  };

  /**
   * 选文件 → 确认 → 还原 → 重新载入页面
   * @param opts { onDone(meta), confirmText }
   */
  Backup.pickAndRestore = function (opts) {
    opts = opts || {};
    return Backup.pickFile().then(function (file) {
      if (!file) return null;
      return U.confirm(
        opts.confirmText || '导入会覆盖当前设备上已有的旅行数据，确定继续吗？',
        opts.skipConfirm ? { title: '导入备份' } : { title: '导入备份', danger: true, okLabel: '覆盖导入' }
      ).then(function (ok) {
        if (!ok) return null;
        var closeFn = null;
        U.modal({
          title: '正在读取备份…',
          size: 'sm',
          sticky: true,
          content: U.el('p', { class: 'modal__text', text: '正在还原照片与旅行记录，请稍候…' }),
          actions: [],
          onMount: function (body, close) {
            closeFn = close;
          }
        });
        return Backup.restore(file)
          .then(function (meta) {
            if (closeFn) closeFn('done');
            if (typeof opts.onDone === 'function') {
              return opts.onDone(meta);
            }
            U.toast('导入完成，正在重新载入…', 'success');
            setTimeout(function () {
              global.location.reload();
            }, 700);
            return meta;
          })
          .catch(function (err) {
            if (closeFn) closeFn('error');
            U.toast('导入失败：' + (err.message || err), 'error');
            throw err;
          });
      });
    });
  };

})(window);
