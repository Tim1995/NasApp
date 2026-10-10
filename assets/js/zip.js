/* ============================================================
 * 小脚丫旅行记 · 极简 ZIP 读写（store 模式，不压缩）
 * 用于把照片与数据打包成一个 .zip 备份文件，无需任何第三方库。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var Zip = (BF.Zip = {});

  /* ------------------------- CRC32 ------------------------- */

  var crcTable = null;
  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    var table = getCrcTable();
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /* ------------------------- 打包 ------------------------- */

  function dosDateTime(d) {
    var time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
    var date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
    return { time: time, date: date };
  }

  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }

  /**
   * 打包为 ZIP Blob
   * @param {Array<{name:string, blob:Blob|Uint8Array}>} entries
   * @returns {Promise<Blob>}
   */
  Zip.create = function (entries) {
    var dt = dosDateTime(new Date());
    var parts = [];
    var central = [];
    var offset = 0;

    var chain = Promise.resolve();
    entries.forEach(function (entry) {
      chain = chain.then(function () {
        return toUint8(entry.blob !== undefined ? entry.blob : entry.data);
      }).then(function (bytes) {
        var nameBytes = strToBytes(entry.name);
        var crc = crc32(bytes);
        var size = bytes.length;

        var local = new Uint8Array(30 + nameBytes.length);
        var lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0x0800, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, dt.time, true);
        lv.setUint16(12, dt.date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);

        parts.push(local, bytes);

        var cd = new Uint8Array(46 + nameBytes.length);
        var cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, dt.time, true);
        cv.setUint16(14, dt.date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        cd.set(nameBytes, 46);
        central.push(cd);

        offset += local.length + size;
      });
    });

    return chain.then(function () {
      var cdSize = central.reduce(function (s, c) {
        return s + c.length;
      }, 0);
      var eocd = new Uint8Array(22);
      var ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true);
      ev.setUint16(6, 0, true);
      ev.setUint16(8, central.length, true);
      ev.setUint16(10, central.length, true);
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, offset, true);
      ev.setUint16(20, 0, true);

      return new Blob(parts.concat(central).concat([eocd]), { type: 'application/zip' });
    });
  };

  function toUint8(blob) {
    if (blob instanceof Uint8Array) return Promise.resolve(blob);
    if (blob instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(blob));
    return blob.arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  /* ------------------------- 解包 ------------------------- */

  /**
   * 读取 ZIP，返回 [{ name, bytes }]
   * @returns {Promise<Array<{name:string, bytes:Uint8Array}>>}
   */
  Zip.read = function (blob) {
    return blob.arrayBuffer().then(function (buf) {
      var view = new DataView(buf);
      var bytes = new Uint8Array(buf);

      // 从尾部寻找 EOCD
      var eocd = -1;
      for (var i = buf.byteLength - 22; i >= 0 && i > buf.byteLength - 66000; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
          eocd = i;
          break;
        }
      }
      if (eocd < 0) throw new Error('不是有效的 zip 备份文件');

      var count = view.getUint16(eocd + 10, true);
      var cdOffset = view.getUint32(eocd + 16, true);
      var out = [];
      var p = cdOffset;

      for (var n = 0; n < count; n++) {
        if (view.getUint32(p, true) !== 0x02014b50) break;
        var method = view.getUint16(p + 10, true);
        var compSize = view.getUint32(p + 20, true);
        var nameLen = view.getUint16(p + 28, true);
        var extraLen = view.getUint16(p + 30, true);
        var commentLen = view.getUint16(p + 32, true);
        var localOffset = view.getUint32(p + 42, true);
        var name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));

        // 本地头
        var lNameLen = view.getUint16(localOffset + 26, true);
        var lExtraLen = view.getUint16(localOffset + 28, true);
        var dataStart = localOffset + 30 + lNameLen + lExtraLen;
        var data = bytes.subarray(dataStart, dataStart + compSize);

        if (method === 0) {
          out.push({ name: name, bytes: data });
        } else if (global.DecompressionStream) {
          out.push({ name: name, bytes: data, deflated: true });
        }

        p += 46 + nameLen + extraLen + commentLen;
      }
      return out;
    });
  };

  /** 解压（仅用于兼容压缩过的 zip） */
  Zip.inflate = function (bytes) {
    if (!global.DecompressionStream) return Promise.reject(new Error('当前浏览器不支持解压该文件'));
    var ds = new global.DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  };

})(window);
