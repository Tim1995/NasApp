/* ============================================================
 * 小脚丫旅行记 · 基础工具库
 * 纯原生 JS，无构建、无依赖。所有模块挂在 window.BF 命名空间下。
 * ============================================================ */
(function (global) {
  'use strict';

  var BF = (global.BF = global.BF || {});
  var U = (BF.U = {});

  /* ----------------------------- DOM ----------------------------- */

  /**
   * 创建元素
   * el('div', { class: 'card', onclick: fn }, ['文字', childNode])
   */
  U.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    U.append(node, children);
    return node;
  };

  U.append = function (parent, children) {
    if (children === null || children === undefined || children === false) return parent;
    if (Array.isArray(children)) {
      children.forEach(function (c) {
        U.append(parent, c);
      });
      return parent;
    }
    parent.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
    return parent;
  };

  U.$ = function (sel, root) {
    return (root || document).querySelector(sel);
  };

  U.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /** 清空容器并批量插入内容 */
  U.render = function (host, children) {
    host.innerHTML = '';
    U.append(host, children);
    return host;
  };

  U.escapeHtml = function (str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ----------------------------- 日期 ----------------------------- */

  U.todayISO = function () {
    var d = new Date();
    return U.toISODate(d);
  };

  U.toISODate = function (d) {
    var p = function (n) {
      return String(n).padStart(2, '0');
    };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  U.parseDate = function (iso) {
    if (!iso) return null;
    var m = String(iso).match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  /** '2024-05-01' -> '2024年5月1日' */
  U.fmtDate = function (iso, short) {
    var d = U.parseDate(iso);
    if (!d) return iso || '未知时间';
    if (short) return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };

  U.fmtRange = function (start, end) {
    if (!start && !end) return '未记录时间';
    if (!end || start === end) return U.fmtDate(start);
    var a = U.parseDate(start);
    var b = U.parseDate(end);
    if (!a) return U.fmtDate(end);
    if (!b) return U.fmtDate(start);
    if (a.getFullYear() === b.getFullYear()) {
      if (a.getMonth() === b.getMonth()) {
        return a.getFullYear() + '年' + (a.getMonth() + 1) + '月' + a.getDate() + '—' + b.getDate() + '日';
      }
      return a.getFullYear() + '年' + (a.getMonth() + 1) + '月' + a.getDate() + '日—' + (b.getMonth() + 1) + '月' + b.getDate() + '日';
    }
    return U.fmtDate(start) + '—' + U.fmtDate(end);
  };

  /** 计算某日期的年龄描述：'2岁3个月' / '8个月' / '12天' */
  U.ageAt = function (birthISO, atISO) {
    var b = U.parseDate(birthISO);
    var n = U.parseDate(atISO) || new Date();
    if (!b) return '';
    var months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
    if (n.getDate() < b.getDate()) months -= 1;
    if (months < 0) {
      var days0 = Math.round((n - b) / 86400000);
      return days0 >= 0 ? days0 + '天' : '';
    }
    if (months < 1) {
      var days = Math.max(0, Math.round((n - b) / 86400000));
      return days + '天';
    }
    var y = Math.floor(months / 12);
    var m = months % 12;
    if (y === 0) return m + '个月';
    return m === 0 ? y + '岁' : y + '岁' + m + '个月';
  };

  U.daysBetween = function (a, b) {
    var d1 = U.parseDate(a);
    var d2 = U.parseDate(b);
    if (!d1 || !d2) return 0;
    return Math.round((d2 - d1) / 86400000) + 1;
  };

  U.relTime = function (ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
    return U.toISODate(new Date(ts));
  };

  /* ----------------------------- 杂项 ----------------------------- */

  U.uid = function (prefix) {
    var rand = Math.random().toString(36).slice(2, 10);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rand;
  };

  U.formatBytes = function (bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    i = Math.min(i, units.length - 1);
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  };

  /** 计数单位的中文表达：12 -> 12个 */
  U.plural = function (n, unit) {
    return n + (unit || '');
  };

  U.randomSalt = function () {
    var arr = new Uint8Array(12);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(arr);
    else for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(arr, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  };

  /** 口令散列：优先 crypto.subtle，降级为内置散列（家庭本地场景足够） */
  U.hash = function (text, salt) {
    var payload = String(salt || '') + '::' + String(text);
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      var buf = new global.TextEncoder().encode(payload);
      return global.crypto.subtle.digest('SHA-256', buf).then(function (out) {
        return Array.prototype.map.call(new Uint8Array(out), function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      });
    }
    return Promise.resolve(U._fallbackHash(payload));
  };

  U._fallbackHash = function (str) {
    var h1 = 0x811c9dc5;
    var h2 = 0x1000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  };

  U.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait || 200);
    };
  };

  U.sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  };

  U.downloadBlob = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  };

  /** 随机挑选数组元素 */
  U.pick = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };

  /** 是否窄屏（手机） */
  U.isNarrow = function () {
    return global.innerWidth <= 620;
  };

  /** 按屏幕宽度选择文案 */
  U.adaptive = function (wide, narrow) {
    return U.isNarrow() ? narrow : wide;
  };

  /** 排序：按日期倒序 */
  U.byDateDesc = function (key) {
    return function (a, b) {
      return String(b[key] || '').localeCompare(String(a[key] || ''));
    };
  };

  /* ----------------------------- 轻量界面反馈 ----------------------------- */

  U.toast = function (message, type) {
    var host = U.$('#toast-host');
    if (!host) {
      host = U.el('div', { id: 'toast-host', class: 'toast-host' });
      document.body.appendChild(host);
    }
    var node = U.el('div', { class: 'toast toast--' + (type || 'info'), text: message });
    host.appendChild(node);
    requestAnimationFrame(function () {
      node.classList.add('is-in');
    });
    setTimeout(function () {
      node.classList.remove('is-in');
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 300);
    }, type === 'error' ? 4200 : 2600);
    return node;
  };

  /**
   * 通用弹窗
   * opts: { title, content(Node|string), actions:[{label,value,variant,primary}], size, onMount(bodyEl, close) }
   * 返回 Promise，resolve 为点击按钮的 value（关闭/取消为 null）
   */
  U.modal = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var finished = false;
      var overlay = U.el('div', { class: 'modal-overlay' });
      var box = U.el('div', { class: 'modal' + (opts.size ? ' modal--' + opts.size : '') });

      function close(value) {
        if (finished) return;
        finished = true;
        overlay.classList.remove('is-in');
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 220);
        document.removeEventListener('keydown', onKey);
        resolve(value === undefined ? null : value);
      }

      function onKey(e) {
        if (e.key === 'Escape') close(null);
      }

      var head = U.el('div', { class: 'modal__head' }, [
        U.el('h3', { class: 'modal__title', text: opts.title || '' }),
        U.el('button', { class: 'icon-btn', title: '关闭', onclick: function () { close(null); } }, '✕')
      ]);

      var body = U.el('div', { class: 'modal__body' });
      if (typeof opts.content === 'string') body.innerHTML = opts.content;
      else U.append(body, opts.content);

      box.appendChild(head);
      box.appendChild(body);

      var actions = opts.actions === undefined
        ? [{ label: '知道了', value: 'ok', primary: true }]
        : opts.actions;

      if (actions && actions.length) {
        var foot = U.el('div', { class: 'modal__foot' });
        actions.forEach(function (a) {
          foot.appendChild(
            U.el('button', {
              class: 'btn ' + (a.primary ? 'btn--primary' : a.variant === 'danger' ? 'btn--danger' : 'btn--ghost'),
              text: a.label,
              onclick: function () {
                if (typeof a.onClick === 'function') {
                  if (a.onClick(body, close) === false) return;
                }
                close(a.value === undefined ? a.label : a.value);
              }
            })
          );
        });
        box.appendChild(foot);
      }

      overlay.appendChild(box);
      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay && !opts.sticky) close(null);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      requestAnimationFrame(function () {
        overlay.classList.add('is-in');
        var focusTarget = U.$('input,textarea,select,button.btn--primary', box);
        if (focusTarget) focusTarget.focus();
      });
      if (typeof opts.onMount === 'function') opts.onMount(body, close);
      overlay._close = close;
    });
  };

  /** 确认对话框 */
  U.confirm = function (message, opts) {
    opts = opts || {};
    return U.modal({
      title: opts.title || '请确认',
      size: 'sm',
      content: U.el('p', { class: 'modal__text', text: message }),
      actions: [
        { label: opts.cancelLabel || '取消', value: false },
        { label: opts.okLabel || '确定', value: true, primary: true, danger: opts.danger }
      ]
    }).then(function (v) {
      return v === true;
    });
  };

  /** 单行输入的快捷弹窗 */
  U.prompt = function (title, defaultValue, opts) {
    opts = opts || {};
    var input = U.el('input', {
      class: 'input',
      value: defaultValue || '',
      placeholder: opts.placeholder || ''
    });
    return U.modal({
      title: title,
      size: 'sm',
      content: input,
      actions: [
        { label: '取消', value: false },
        {
          label: '保存',
          value: true,
          primary: true,
          onClick: function () {
            if (!input.value.trim() && opts.required !== false) {
              U.toast('内容不能为空', 'error');
              return false;
            }
          }
        }
      ]
    }).then(function (v) {
      return v ? input.value.trim() : null;
    });
  };

  /* ----------------------------- 表单辅助 ----------------------------- */

  U.field = function (label, control, hint) {
    return U.el('label', { class: 'field' }, [
      U.el('span', { class: 'field__label', text: label }),
      control,
      hint ? U.el('span', { class: 'field__hint', text: hint }) : null
    ]);
  };

  U.input = function (attrs) {
    attrs = attrs || {};
    attrs.class = 'input' + (attrs.class ? ' ' + attrs.class : '');
    return U.el('input', attrs);
  };

  U.textarea = function (attrs) {
    attrs = attrs || {};
    attrs.class = 'input input--area' + (attrs.class ? ' ' + attrs.class : '');
    return U.el('textarea', attrs);
  };

  U.select = function (options, attrs) {
    attrs = attrs || {};
    attrs.class = 'input' + (attrs.class ? ' ' + attrs.class : '');
    var node = U.el('select', attrs);
    (options || []).forEach(function (o) {
      node.appendChild(U.el('option', { value: o.value, text: o.label, selected: o.selected }));
    });
    return node;
  };

  /* ----------------------------- 图片助手 ----------------------------- */

  /** 把 Blob 转成可显示的 objectURL，并登记到回收站（页面切换时统一释放） */
  var urlRegistry = (U._urls = new Set());

  U.objectUrl = function (blob) {
    if (!blob) return '';
    var url = URL.createObjectURL(blob);
    urlRegistry.add(url);
    return url;
  };

  U.revokeAllUrls = function () {
    urlRegistry.forEach(function (u) {
      URL.revokeObjectURL(u);
    });
    urlRegistry.clear();
  };

})(window);
