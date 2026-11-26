/* HuntMap — util.js */
(function () {
  'use strict';
  const H = window.Hunt = window.Hunt || {};
  const U = H.Util = {};

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  U.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  };

  U.on = function (target, ev, fn, opts) {
    if (!target) return function () {};
    target.addEventListener(ev, fn, opts);
    return function () { target.removeEventListener(ev, fn, opts); };
  };

  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  };
  U.round = function (v, digits) {
    const p = Math.pow(10, digits || 0);
    return Math.round(v * p) / p;
  };
  U.debounce = function (fn, wait) {
    let t = 0;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  };
  U.throttle = function (fn, wait) {
    let last = 0, timer = 0;
    return function () {
      const args = arguments, self = this, now = Date.now();
      const run = function () { last = now; fn.apply(self, args); };
      if (now - last >= wait) run();
      else {
        clearTimeout(timer);
        timer = setTimeout(run, wait - (now - last));
      }
    };
  };
  U.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.parseNum = function (v, dflt) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : dflt;
  };

  /* ------------------------------ formatting ------------------------------ */
  let units = 'imperial';
  U.setUnits = function (u) { units = u === 'metric' ? 'metric' : 'imperial'; };
  U.units = () => units;
  U.isMetric = () => units === 'metric';

  const M_PER_FT = 0.3048, M_PER_MI = 1609.344;

  U.fmtDist = function (meters) {
    if (meters == null || !isFinite(meters)) return '--';
    if (units === 'metric') {
      if (meters < 1000) return Math.round(meters) + ' m';
      return (meters / 1000).toFixed(meters < 10000 ? 2 : 1) + ' km';
    }
    const ft = meters / M_PER_FT;
    if (ft < 1000) return Math.round(ft / 5) * 5 + ' ft';
    return (meters / M_PER_MI).toFixed(meters < 16093 ? 2 : 1) + ' mi';
  };
  U.fmtDistShort = function (meters) {
    if (meters == null || !isFinite(meters)) return '--';
    if (units === 'metric') return meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(2) + ' km';
    const ft = meters / M_PER_FT;
    return ft < 1000 ? Math.round(ft) + ' ft' : (meters / M_PER_MI).toFixed(2) + ' mi';
  };
  U.fmtElev = function (meters) {
    if (meters == null || !isFinite(meters)) return '--';
    return units === 'metric' ? Math.round(meters) + ' m'
      : Math.round(meters / M_PER_FT).toLocaleString() + ' ft';
  };
  U.fmtSpeed = function (mps) {
    if (mps == null || !isFinite(mps)) return '--';
    if (units === 'metric') return (mps * 3.6).toFixed(1) + ' km/h';
    return (mps * 2.236936).toFixed(1) + ' mph';
  };
  U.fmtArea = function (sqM) {
    if (!isFinite(sqM)) return '--';
    if (units === 'metric') return sqM >= 1e6 ? (sqM / 1e6).toFixed(2) + ' km²' : Math.round(sqM) + ' m²';
    const acres = sqM / 4046.8564224;
    return acres >= 640 ? (acres / 640).toFixed(2) + ' sq mi' : acres.toFixed(acres < 10 ? 2 : 1) + ' acres';
  };
  U.fmtDuration = function (ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  };
  U.fmtClock = function (seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return (h > 0 ? h + ':' + String(m).padStart(2, '0') : m + ':') + String(ss).padStart(2, '0');
  };
  U.fmtTime = function (d) {
    if (!d) return '--';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '--';
    try {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
    }
  };
  U.fmtDate = function (d) {
    const date = d instanceof Date ? d : new Date(d);
    try {
      return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    } catch (e) { return date.toDateString(); }
  };
  U.fmtDateTime = (d) => U.fmtDate(d) + ' ' + U.fmtTime(d);
  U.fmtAge = function (ms) {
    if (!isFinite(ms) || ms < 0) return '--';
    const s = Math.floor(ms / 1000);
    if (s < 5) return 'just now';
    if (s < 90) return s + ' s ago';
    const m = Math.floor(s / 60);
    if (m < 90) return m + ' min ago';
    return Math.floor(m / 60) + ' h ago';
  };
  /* ------------------------------ toasts ------------------------------ */
  U.toast = function (msg, kind, ms) {
    const host = U.$('#toasts');
    if (!host) return;
    while (host.children.length >= 3) host.firstChild.remove();
    const el = U.el('div', { class: 'toast ' + (kind || ''), text: msg });
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, ms || (kind === 'err' ? 3800 : 2400));
  };

  /* ------------------------------ modal ------------------------------ */
  let modalCleanup = null;
  U.modal = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const wrap = U.$('#modalWrap'), titleEl = U.$('#modalTitle'), body = U.$('#modalBody');
      const okBtn = U.$('#modalOk'), cancelBtn = U.$('#modalCancel');
      if (!wrap) { resolve({ ok: false, body: null }); return; }
      if (modalCleanup) modalCleanup(false);

      titleEl.textContent = opts.title || '';
      body.innerHTML = opts.html || '';
      okBtn.textContent = opts.okText || 'OK';
      cancelBtn.textContent = opts.cancelText || 'Cancel';
      cancelBtn.hidden = !!opts.hideCancel;
      wrap.hidden = false;

      function close(ok) {
        wrap.hidden = true;
        okBtn.onclick = cancelBtn.onclick = wrap.onclick = null;
        document.removeEventListener('keydown', onKey);
        modalCleanup = null;
        resolve({ ok: ok, body: body });
      }
      modalCleanup = close;

      function tryOk() {
        if (typeof opts.validate === 'function') {
          const err = opts.validate(body);
          if (err) { U.toast(err, 'err'); return; }
        }
        let value;
        if (typeof opts.onOk === 'function') value = opts.onOk(body);
        close(true);
        if (value && typeof value.then === 'function') value.catch(function (e) { console.error(e); });
      }
      function onKey(ev) {
        if (ev.key === 'Escape') close(false);
        if (ev.key === 'Enter' && opts.enterOk !== false && ev.target.tagName !== 'TEXTAREA') tryOk();
      }
      okBtn.onclick = tryOk;
      cancelBtn.onclick = function () { close(false); };
      wrap.onclick = function (ev) { if (ev.target === wrap) close(false); };
      document.addEventListener('keydown', onKey);
      setTimeout(function () {
        const first = body.querySelector('input, select, textarea');
        if (first && opts.focus !== false) { try { first.focus(); first.select && first.select(); } catch (e) {} }
      }, 60);
    });
  };

  U.confirm = function (title, html, okText) {
    return U.modal({ title: title, html: '<p>' + (html || '') + '</p>', okText: okText || 'OK' })
      .then(function (r) { return !!r.ok; });
  };

  U.prompt = function (title, o) {
    o = o || {};
    const html = '<label class="field"><span>' + (o.label || 'Value') + '</span>' +
      '<input type="' + (o.type || 'text') + '" id="__promptInput" value="' + U.escapeHtml(o.value || '') +
      '" placeholder="' + U.escapeHtml(o.placeholder || '') + '" ' +
      (o.step ? 'step="' + o.step + '" ' : '') + '></label>' +
      (o.hint ? '<p class="small">' + o.hint + '</p>' : '');
    return U.modal({
      title: title, html: html, okText: o.okText || 'OK',
      validate: function (bodyEl) {
        const input = bodyEl.querySelector('#__promptInput');
        if (!input) return null;
        if (o.required !== false && !input.value.trim()) return 'Please enter a value.';
        if (o.validate) return o.validate(input.value.trim());
        return null;
      }
    }).then(function (r) {
      if (!r.ok) return null;
      const input = r.body.querySelector('#__promptInput');
      return input ? input.value.trim() : null;
    });
  };
  /* ------------------------------ files / clipboard ------------------------------ */
  U.download = function (filename, content, mime) {
    try {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = U.el('a', { href: url, download: filename, style: 'display:none' });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) {
      console.error(e);
      U.toast('Download failed on this browser', 'err');
      return false;
    }
  };

  U.readFileText = function (file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(fr.error || new Error('Could not read file')); };
      fr.readAsText(file);
    });
  };
  U.readFileBuffer = function (file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('Could not read file')); };
      fr.readAsArrayBuffer(file);
    });
  };

  U.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  };
  function legacyCopy(text) {
    try {
      const ta = U.el('textarea', { style: 'position:fixed;left:-9999px;top:0;opacity:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }

  U.vibrate = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  U.cssVar = function (name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback || '';
  };

  U.isSecure = function () {
    return window.isSecureContext || location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  };
})();


