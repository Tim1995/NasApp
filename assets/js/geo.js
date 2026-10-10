/* ============================================================
 * 小脚丫旅行记 · 地理计算 / 照片 EXIF 解析 / 图片处理
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var G = (BF.Geo = {});

  var PI = Math.PI;
  var A = 6378245.0; // 克拉索夫斯基椭球长半轴
  var EE = 0.00669342162296594323; // 偏心率平方

  function outOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
    ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
    return ret;
  }

  function transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
    ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
    return ret;
  }

  /** WGS-84（GPS 原始） -> GCJ-02（高德/腾讯地图使用） */
  G.wgs84ToGcj02 = function (lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = (lat / 180.0) * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
    dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
    return [lng + dLng, lat + dLat];
  };

  /** GCJ-02 -> WGS-84（迭代逼近，误差 < 1 米） */
  G.gcj02ToWgs84 = function (lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    var wLng = lng;
    var wLat = lat;
    for (var i = 0; i < 5; i++) {
      var t = G.wgs84ToGcj02(wLng, wLat);
      wLng += lng - t[0];
      wLat += lat - t[1];
    }
    return [wLng, wLat];
  };

  /** 两点球面距离（公里） */
  G.distanceKm = function (lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = ((lat2 - lat1) * PI) / 180;
    var dLng = ((lng2 - lng1) * PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * PI) / 180) * Math.cos((lat2 * PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /** 把数字格式化成友好的距离描述 */
  G.fmtDistance = function (km) {
    if (km < 1) return Math.round(km * 1000) + ' 米';
    if (km < 1000) return km.toFixed(km < 10 ? 1 : 0) + ' 公里';
    return Math.round(km).toLocaleString('zh-CN') + ' 公里';
  };

  /** 校验经纬度 */
  G.valid = function (lat, lng) {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      isFinite(lat) &&
      isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0)
    );
  };

  /** 经纬度文本 */
  G.fmtCoords = function (lat, lng) {
    if (!G.valid(lat, lng)) return '';
    return Math.abs(lat).toFixed(4) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(lng).toFixed(4) + '°' + (lng >= 0 ? 'E' : 'W');
  };

  /* ============================================================
   * EXIF 解析（只取我们需要的：拍摄时间 + GPS + 方向）
   * 纯手工解析 JPEG APP1 段，避免引入外部依赖
   * ============================================================ */

  function readRational(view, offset, little, signed) {
    if (little) {
      var n = view.getUint32(offset, true);
      var d = view.getUint32(offset + 4, true);
      return d === 0 ? 0 : n / d;
    }
    var n2 = view.getUint32(offset, false);
    var d2 = view.getUint32(offset + 4, false);
    return d2 === 0 ? 0 : n2 / d2;
  }

  function readValue(view, entryOffset, little, type, count, valueOffsetPos) {
    // 类型：1=Byte 2=Ascii 3=Short 4=Long 5=Rational 7=Undefined 9=SLong 10=SRational
    var sizeMap = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    var unit = sizeMap[type] || 1;
    var total = unit * count;
    var base = total > 4 ? view.getUint32(valueOffsetPos, little) : entryOffset + 8;

    if (type === 2) {
      var str = '';
      for (var i = 0; i < count; i++) {
        var code = view.getUint8(base + i);
        if (code === 0) break;
        str += String.fromCharCode(code);
      }
      return str;
    }
    if (type === 3) {
      var arr = [];
      for (var j = 0; j < count; j++) arr.push(view.getUint16(base + j * 2, little));
      return count === 1 ? arr[0] : arr;
    }
    if (type === 4 || type === 9) {
      var arr2 = [];
      for (var k = 0; k < count; k++) {
        arr2.push(type === 4 ? view.getUint32(base + k * 4, little) : view.getInt32(base + k * 4, little));
      }
      return count === 1 ? arr2[0] : arr2;
    }
    if (type === 5 || type === 10) {
      var arr3 = [];
      for (var m = 0; m < count; m++) arr3.push(readRational(view, base + m * 8, little, type === 10));
      return count === 1 ? arr3[0] : arr3;
    }
    return null;
  }

  function parseIFD(view, dirOffset, little, wanted, result) {
    var count = view.getUint16(dirOffset, little);
    var offset = dirOffset + 2;
    for (var i = 0; i < count; i++) {
      var entry = offset + i * 12;
      var tag = view.getUint16(entry, little);
      var type = view.getUint16(entry + 2, little);
      var cnt = view.getUint32(entry + 4, little);
      if (wanted[tag] !== undefined) {
        var v = readValue(view, entry, little, type, cnt, entry + 8);
        if (v !== null) result[wanted[tag]] = v;
      }
    }
    return { count: count, nextOffset: view.getUint32(dirOffset + 2 + count * 12, little) };
  }

  /**
   * 解析 JPEG 的 EXIF
   * @returns {{takenAt:string|null, lat:number|null, lng:number|null, orientation:number, camera:string|null}}
   */
  G.parseExif = function (arrayBuffer) {
    var out = { takenAt: null, lat: null, lng: null, orientation: 1, camera: null, hasGps: false };
    try {
      var view = new DataView(arrayBuffer);
      if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return out; // 不是 JPEG

      var len = view.byteLength;
      var pos = 2;
      var app1 = -1;
      while (pos < len - 4) {
        if (view.getUint8(pos) !== 0xff) {
          pos++;
          continue;
        }
        var marker = view.getUint8(pos + 1);
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          pos += 2;
          continue;
        }
        if (marker === 0xda || marker === 0xd9) break; // 扫描数据开始，后面没有 EXIF
        var segLen = view.getUint16(pos + 2, false);
        if (marker === 0xe1) {
          // 检查 "Exif\0\0"
          if (
            view.getUint32(pos + 4, false) === 0x45786966 &&
            view.getUint16(pos + 8, false) === 0x0000
          ) {
            app1 = pos + 10;
            break;
          }
        }
        pos += 2 + segLen;
      }
      if (app1 < 0) return out;

      var byteOrder = view.getUint16(app1, false);
      var little;
      if (byteOrder === 0x4949) little = true;
      else if (byteOrder === 0x4d4d) little = false;
      else return out;

      var ifd0 = view.getUint32(app1 + 4, little) + app1;
      var tags0 = { 0x0112: 'orientation', 0x0132: 'dateTime', 0x010f: 'make', 0x0110: 'model' };
      var first = parseIFD(view, ifd0, little, tags0, out);

      var exifPtr = view.getUint32(ifd0 + 2 + 0 * 12 + 8, little); // 占位，下面用精确遍历
      // 精确遍历 IFD0 找到 Exif / GPS 子目录指针
      var cnt0 = view.getUint16(ifd0, little);
      var exifOffset = 0;
      var gpsOffset = 0;
      for (var i = 0; i < cnt0; i++) {
        var e = ifd0 + 2 + i * 12;
        var t = view.getUint16(e, little);
        if (t === 0x8769) exifOffset = view.getUint32(e + 8, little);
        else if (t === 0x8825) gpsOffset = view.getUint32(e + 8, little);
      }

      if (exifOffset) {
        var exifTags = { 0x9003: 'dateTimeOriginal', 0x9004: 'dateTimeDigitized', 0x9291: 'subSec' };
        var sub = {};
        parseIFD(view, app1 + exifOffset, little, exifTags, sub);
        out.takenAt = sub.dateTimeOriginal || sub.dateTimeDigitized || null;
      }
      if (!out.takenAt && out.dateTime) out.takenAt = out.dateTime;

      if (gpsOffset) {
        var gpsTags = {
          0x0001: 'latRef',
          0x0002: 'latArr',
          0x0003: 'lngRef',
          0x0004: 'lngArr'
        };
        var gps = {};
        parseIFD(view, app1 + gpsOffset, little, gpsTags, gps);
        if (gps.latArr && gps.lngArr && gps.latArr.length === 3 && gps.lngArr.length === 3) {
          var lat = gps.latArr[0] + gps.latArr[1] / 60 + gps.latArr[2] / 3600;
          var lng = gps.lngArr[0] + gps.lngArr[1] / 60 + gps.lngArr[2] / 3600;
          if (gps.latRef === 'S') lat = -lat;
          if (gps.lngRef === 'W') lng = -lng;
          if (G.valid(lat, lng)) {
            out.lat = lat;
            out.lng = lng;
            out.hasGps = true;
          }
        }
      }

      if (out.dateTime) {
        var m = String(out.dateTime).match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
        if (m) out.takenAt = m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
        else if (/^\d{4}[-:]\d{2}[-:]\d{2}/.test(String(out.dateTime))) {
          out.takenAt = String(out.dateTime).replace(/:/g, '-').slice(0, 16).replace(' ', ' ');
        }
      }
      if (out.takenAt) out.takenAt = out.takenAt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      if (out.camera) {
        out.camera = [out.make, out.model].filter(Boolean).join(' ').trim() || null;
      }
      return out;
    } catch (err) {
      return out;
    }
  };

  /** 从 File 中读取 EXIF */
  G.readExifFromFile = function (file) {
    return new Promise(function (resolve) {
      // 只读前 256KB 足以覆盖 EXIF
      var head = file.slice(0, Math.min(file.size, 256 * 1024));
      var reader = new FileReader();
      reader.onload = function () {
        resolve(G.parseExif(reader.result));
      };
      reader.onerror = function () {
        resolve({ takenAt: null, lat: null, lng: null, orientation: 1, camera: null, hasGps: false });
      };
      reader.readAsArrayBuffer(head);
    });
  };

  /* ============================================================
   * 图片处理：压缩 + 生成缩略图（全部在浏览器本地完成）
   * ============================================================ */

  function loadBitmap(file) {
    if (global.createImageBitmap) {
      return global
        .createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () {
          return global.createImageBitmap(file);
        })
        .catch(function () {
          return loadViaImg(file);
        });
    }
    return loadViaImg(file);
  }

  function loadViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片读取失败'));
      };
      img.src = url;
    });
  }

  function drawTo(bitmap, maxSide, quality) {
    var w = bitmap.width || bitmap.naturalWidth;
    var h = bitmap.height || bitmap.naturalHeight;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, tw, th);
    return new Promise(function (resolve) {
      canvas.toBlob(
        function (blob) {
          resolve({ blob: blob, width: tw, height: th });
        },
        'image/jpeg',
        quality || 0.86
      );
    });
  }

  /**
   * 处理上传的照片：生成主图与缩略图
   * @returns {Promise<{main:Blob, thumb:Blob, width:number, height:number}>}
   */
  G.processImage = function (file, opts) {
    opts = opts || {};
    var mainSide = opts.mainSide || 2000;
    var thumbSide = opts.thumbSide || 480;
    return loadBitmap(file).then(function (bitmap) {
      return drawTo(bitmap, mainSide, 0.86).then(function (main) {
        return drawTo(bitmap, thumbSide, 0.72).then(function (thumb) {
          if (bitmap.close) bitmap.close();
          return { main: main.blob, thumb: thumb.blob, width: main.width, height: main.height };
        });
      });
    });
  };

  /** 读取文件为 dataURL（用于头像等小图） */
  G.readDataURL = function (blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

})(window);
