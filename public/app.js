(function () {
'use strict';
var EX = window.Exporters, ST = EX.STATUS;

/* ------------------------------------------------------------ helpers */
function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el, k) {
  if (k == null || k === false) return;
  if (Array.isArray(k)) { k.forEach(function (x) { add(el, x); }); return; }
  el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
}
function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function ago(ts) {
  var s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}
function stamp(ts) { return new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
var toastTimer;
function toast(msg) {
  var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
}
function twoStep(btn, label, run) {
  var armed = false, orig = btn.textContent, t;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!armed) { armed = true; btn.textContent = label; btn.classList.add('danger'); t = setTimeout(function () { armed = false; btn.textContent = orig; btn.classList.remove('danger'); }, 3000); }
    else { clearTimeout(t); armed = false; btn.textContent = orig; btn.classList.remove('danger'); run(); }
  });
  return btn;
}
var label = EX.label;

/* ------------------------------------------------------------ rich text */
function normColor(v) {
  if (!v) return null; v = String(v).trim().toLowerCase();
  var m = /^#([0-9a-f]{6})$/.exec(v); if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f]{3})$/.exec(v); if (m) return m[1].split('').map(function (x) { return x + x; }).join('').toUpperCase();
  m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v);
  if (m) return [m[1], m[2], m[3]].map(function (n) { return Math.min(255, +n).toString(16).padStart(2, '0'); }).join('').toUpperCase();
  return null;
}
/* DOM -> blocks [{t:'p'|'ul'|'ol', items:[runs]}]; keeps only bold, italic, underline, colour, highlight, lists. */
function parseRich(root) {
  var blocks = [], cur = null, inLi = false;
  function newP() { cur = []; blocks.push({ t: 'p', items: [cur] }); }
  function kids(n, st) { Array.prototype.slice.call(n.childNodes).forEach(function (c) { walk(c, st); }); }
  function walk(n, st) {
    if (n.nodeType === 3) {
      var tx = n.nodeValue.replace(/ /g, ' ').replace(/[\r\n]+/g, ' ');
      if (!tx) return; if (!cur) newP(); cur.push(Object.assign({ text: tx }, st)); return;
    }
    if (n.nodeType !== 1) return;
    var tag = n.tagName.toLowerCase();
    if (tag === 'br') { if (inLi) return; if (!cur) newP(); cur = null; return; }
    if (tag === 'script' || tag === 'style') return;
    if (tag === 'ul' || tag === 'ol') {
      cur = null; var lb = { t: tag, items: [] }; blocks.push(lb);
      Array.prototype.slice.call(n.childNodes).forEach(function (li) {
        if (li.nodeType === 1 && li.tagName.toLowerCase() === 'li') { var item = []; lb.items.push(item); cur = item; inLi = true; kids(li, st); inLi = false; cur = null; }
      });
      cur = null; return;
    }
    if (tag === 'div' || tag === 'p' || tag === 'li') { if (!inLi) cur = null; kids(n, st); if (!inLi) cur = null; return; }
    var s = Object.assign({}, st);
    if (tag === 'b' || tag === 'strong') s.b = true;
    if (tag === 'i' || tag === 'em') s.i = true;
    if (tag === 'u') s.u = true;
    if (tag === 'font' && n.getAttribute('color')) { var fc = normColor(n.getAttribute('color')); if (fc) s.c = fc; }
    var sty = n.style;
    if (sty) {
      var fw = sty.fontWeight; if (fw === 'bold' || fw === 'bolder' || +fw >= 600) s.b = true;
      if (sty.fontStyle === 'italic') s.i = true;
      if (/underline/.test(sty.textDecorationLine || sty.textDecoration || '')) s.u = true;
      var c1 = normColor(sty.color); if (c1) s.c = c1;
      var c2 = normColor(sty.backgroundColor); if (c2) s.bg = c2;
    }
    kids(n, s);
  }
  kids(root, {});
  blocks.forEach(function (b) { b.items = b.items.map(function (rs) { return rs.filter(function (r) { return r.text; }); }); });
  while (blocks.length && blocks[blocks.length - 1].t === 'p' && !blocks[blocks.length - 1].items[0].length) blocks.pop();
  return blocks;
}
function escH(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
function runsHtml(rs) {
  return rs.map(function (r) {
    var s = escH(r.text), st = [];
    if (r.c) st.push('color:#' + r.c); if (r.bg) st.push('background-color:#' + r.bg);
    if (st.length) s = '<span style="' + st.join(';') + '">' + s + '</span>';
    if (r.u) s = '<u>' + s + '</u>'; if (r.i) s = '<i>' + s + '</i>'; if (r.b) s = '<b>' + s + '</b>';
    return s;
  }).join('');
}
function blocksToHtml(blocks) {
  return blocks.map(function (b) {
    if (b.t === 'p') { var x = runsHtml(b.items[0]); return '<div>' + (x || '<br>') + '</div>'; }
    return '<' + b.t + '>' + b.items.map(function (it) { return '<li>' + runsHtml(it) + '</li>'; }).join('') + '</' + b.t + '>';
  }).join('');
}
function bodyOf(html) { return new DOMParser().parseFromString('<body>' + (html || ''), 'text/html').body; }
function sanitize(html) { return blocksToHtml(parseRich(bodyOf(html))); }
function richBlocks(html) { return parseRich(bodyOf(html)); }
function richPlain(html) { return EX.plain(richBlocks(html)); }

var currentRich = null, tools = {};
function richField(getHtml, setHtml, o) {
  o = o || {};
  var el = h('div', { class: 'rich ' + (o.cls || ''), contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': o.aria || '', 'data-ph': o.ph || '' });
  el.innerHTML = sanitize(getHtml());
  el.addEventListener('input', function () {
    if (!el.textContent && !el.querySelector('li')) el.innerHTML = '';
    setHtml(el.innerHTML); if (o.onInput) o.onInput();
  });
  el.addEventListener('paste', function (e) {
    var cd = e.clipboardData; if (!cd) return;
    var t = cd.getData('text/plain');
    var img = Array.prototype.some.call(cd.items || [], function (i) { return i.type.indexOf('image/') === 0; });
    if (img && !t) return;                      /* image paste is handled by the page */
    e.preventDefault(); e.stopPropagation();
    document.execCommand('insertText', false, t);
  });
  el.addEventListener('focus', function () { currentRich = el; syncTools(); });
  el.addEventListener('blur', function () { if (currentRich === el) { currentRich = null; syncTools(); } });
  return el;
}
var SWATCHES = [['#c62828', 'Red'], ['#e65100', 'Orange'], ['#2e7d32', 'Green'], ['#1565c0', 'Blue'], ['#6a1b9a', 'Purple'], ['#000000', 'Black']];
function cmd(name, val, css) {
  if (!currentRich) return;
  document.execCommand('styleWithCSS', false, !!css);
  document.execCommand(name, false, val);
  currentRich.dispatchEvent(new Event('input', { bubbles: true }));
  syncTools();
}
function toolbar() {
  tools = {};
  function btn(txt, title, fn, key, extra) {
    var b = h('button', { class: 'tb', type: 'button', title: title, 'aria-label': title, style: extra || '', onmousedown: function (e) { e.preventDefault(); }, onclick: fn }, txt);
    tools[key || title] = b; return b;
  }
  var sw = SWATCHES.map(function (s) {
    var b = h('button', { class: 'tb sw', type: 'button', title: 'Text colour: ' + s[1], 'aria-label': 'Text colour ' + s[1], style: 'background:' + s[0], onmousedown: function (e) { e.preventDefault(); }, onclick: function () { cmd('foreColor', s[0], true); } });
    tools['c' + s[0]] = b; return b;
  });
  var bar = h('div', { class: 'tools' }, h('div', { class: 'wrap' },
    btn('B', 'Bold (Ctrl+B)', function () { cmd('bold'); }, 'bold', 'font-weight:800'),
    btn('I', 'Italic (Ctrl+I)', function () { cmd('italic'); }, 'italic', 'font-style:italic'),
    btn('U', 'Underline (Ctrl+U)', function () { cmd('underline'); }, 'underline', 'text-decoration:underline'),
    h('span', { class: 'sep' }),
    btn('• Bullets', 'Bulleted list', function () { cmd('insertUnorderedList'); }, 'insertUnorderedList'),
    btn('1. Numbers', 'Numbered list', function () { cmd('insertOrderedList'); }, 'insertOrderedList'),
    h('span', { class: 'sep' }), sw,
    btn('Highlight', 'Highlight', function () { cmd('hiliteColor', '#fff176', true); }, 'hilite', 'background:#fff17655'),
    btn('Clear', 'Clear formatting', function () { cmd('removeFormat'); }, 'removeFormat'),
    h('span', { class: 'hint', text: 'Formatting applies to the text field you are typing in' })));
  syncTools();
  return bar;
}
function syncTools() {
  var on = !!currentRich;
  Object.keys(tools).forEach(function (k) { tools[k].disabled = !on; });
  ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].forEach(function (c) {
    var b = tools[c]; if (!b) return; var s = false;
    try { s = on && document.queryCommandState(c); } catch (e) { /* ignore */ }
    b.classList.toggle('on', !!s);
  });
}
document.addEventListener('selectionchange', syncTools);

/* ------------------------------------------------------------ server storage */
function okJson(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
/* With the Node server running, data goes to its data folder. Without it (GitHub Pages, a plain file, any static host)
   the same calls fall back to this browser's IndexedDB, so no server is needed. */
var useLocal = false;
var IDB = (function () {
  var p;
  function db() {
    return p || (p = new Promise(function (res, rej) {
      var r = indexedDB.open('qa-report-desk', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('docs'); r.result.createObjectStore('shots'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    }));
  }
  function run(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), q = fn(t.objectStore(store));
        t.oncomplete = function () { res(q && q.result); }; t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  return {
    all: function (s) { return run(s, 'readonly', function (o) { return o.getAll(); }); },
    get: function (s, id) { return run(s, 'readonly', function (o) { return o.get(id); }); },
    put: function (s, id, v) { return run(s, 'readwrite', function (o) { o.put(v, id); }); },
    del: function (s, id) { return run(s, 'readwrite', function (o) { o.delete(id); }); }
  };
})();
function probeServer() {
  return fetch('/api/docs').then(function (r) {
    if (!r.ok || (r.headers.get('content-type') || '').indexOf('json') < 0) return true;
    return r.json().then(function () { return false; });
  }).catch(function () { return true; });
}
var Store = {
  list: function () { return useLocal ? IDB.all('docs') : fetch('/api/docs').then(okJson); },
  put: function (id, d) { return useLocal ? IDB.put('docs', id, d) : fetch('/api/docs/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).then(okJson); },
  del: function (id) { return useLocal ? IDB.del('docs', id) : fetch('/api/docs/' + id, { method: 'DELETE' }).then(okJson); }
};
var Shots = {
  cache: new Map(),
  get: function (id) {
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    var self = this;
    if (useLocal) return IDB.get('shots', id).then(function (u) { if (u) self.cache.set(id, u); return u || null; }).catch(function () { return null; });
    return fetch('/api/shots/' + id).then(function (r) { return r.ok ? r.text() : null; }).then(function (u) { if (u) self.cache.set(id, u); return u; }).catch(function () { return null; });
  },
  add: function (p) {
    var id = uid(), self = this;
    if (useLocal) return IDB.put('shots', id, p.url).then(function () { self.cache.set(id, p.url); return id; });
    return fetch('/api/shots/' + id, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: p.url }).then(okJson).then(function () { self.cache.set(id, p.url); return id; });
  },
  put: function (id, url) {
    var self = this;
    if (useLocal) return IDB.put('shots', id, url).then(function () { self.cache.set(id, url); });
    return fetch('/api/shots/' + id, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: url }).then(okJson).then(function () { self.cache.set(id, url); });
  },
  drop: function (id) { this.cache.delete(id); return useLocal ? IDB.del('shots', id).catch(function () {}) : fetch('/api/shots/' + id, { method: 'DELETE' }).catch(function () {}); }
};

/* ------------------------------------------------------------ images */
var webpOk = (function () { try { return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; } })();
function viaImg(src) { return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('decode')); }; im.src = src; }); }
function loadBitmap(file) {
  if (window.createImageBitmap) return createImageBitmap(file).catch(function () { return viaImg(URL.createObjectURL(file)); });
  return viaImg(URL.createObjectURL(file));
}
async function processImage(file) {
  var bmp = await loadBitmap(file), W = bmp.width, H = bmp.height;
  var sc = Math.min(1, 2000 / Math.max(W, H)), cw = Math.max(1, Math.round(W * sc)), ch = Math.max(1, Math.round(H * sc));
  var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch); cx.drawImage(bmp, 0, 0, cw, ch);
  var url = cv.toDataURL(webpOk ? 'image/webp' : 'image/jpeg', 0.9);
  if (bmp.close) try { bmp.close(); } catch (e) { /* ignore */ }
  return { url: url, w: cw, h: ch, kb: Math.round(url.length * 0.75 / 1024) };
}
async function frameShot(s, ratio) {
  var u = await Shots.get(s.shotId); if (!u) return null;
  var im = await viaImg(u), W = 1400, H;
  if (ratio === 'natural') { var s0 = Math.min(1, W / im.width); W = Math.round(im.width * s0); H = Math.round(im.height * s0); }
  else { var p = ratio.split('/').map(Number); H = Math.round(W * p[1] / p[0]); }
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H);
  var sc = Math.min(W / im.width, H / im.height), dw = Math.round(im.width * sc), dh = Math.round(im.height * sc);
  cx.drawImage(im, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
  return { b64: cv.toDataURL('image/jpeg', 0.92).split(',')[1], w: W, h: H };
}

/* ------------------------------------------------------------ model */
var RATIOS = [['16/9', '16:9'], ['2/1', '2:1'], ['16/10', '16:10'], ['4/3', '4:3'], ['natural', 'Natural height']];
var STATUSES = [['pass', 'Pass'], ['fail', 'Fail'], ['blocked', 'Blocked'], ['none', 'Not run']];
function newCase(o) { return Object.assign({ id: uid(), title: '', data: '', notes: '', status: 'none', hasParams: false, params: [], shots: [] }, o || {}); }
var SEVERITY = ['Critical', 'Major', 'Minor', 'Trivial'];
var PRIORITY = ['Highest', 'High', 'Medium', 'Low'];
var BUGSTATUS = ['Open', 'In Progress', 'Fixed', 'Ready for Retest', 'Verified', 'Closed', 'Reopened', 'Won\'t Fix'];
function newBug() { return { id: '', module: '', env: '', build: '', severity: 'Major', priority: 'Medium', status: 'Open', reporter: '', date: today(), assignee: '', pre: '', steps: '', expected: '', actual: '', notes: '' }; }
function newBugCase(o) { return newCase(Object.assign({ bug: newBug(), sum: '' }, o || {})); }
function newDoc(type) {
  var now = Date.now();
  if (type === 'bug') return { kind: 'doc', type: 'bug', id: uid(), title: '', ratio: '16/9', cases: [newBugCase()], createdAt: now, updatedAt: now };
  return { kind: 'doc', id: uid(), title: 'Test Evidence Document', ticket: '', meta: { tester: '', date: today(), env: '' }, ratio: '16/9', cases: [newCase()], createdAt: now, updatedAt: now };
}
function fixDoc(d) {
  d.type = d.type === 'bug' ? 'bug' : 'evidence';
  if (d.type === 'bug') {
    d.title = d.title || ''; d.ratio = d.ratio || '16/9';
    d.cases = (d.cases && d.cases.length) ? d.cases : [newBugCase()];
    if (d.bug) { d.cases[0].bug = d.bug; d.cases[0].sum = d.title; d.title = ''; delete d.bug; }   /* old one-bug documents */
    d.cases.forEach(function (c) { c.shots = c.shots || []; c.bug = Object.assign(newBug(), c.bug || {}); c.sum = c.sum || ''; });
    return d;
  }
  d.meta = d.meta || { tester: '', date: '', env: '' }; d.ratio = d.ratio || '16/9';
  d.cases = (d.cases && d.cases.length) ? d.cases : [newCase()];
  d.cases.forEach(function (c) {
    c.params = c.params || []; c.shots = c.shots || []; c.hasParams = !!c.hasParams;
    c.title = c.title || ''; c.data = c.data || ''; c.notes = c.notes || ''; c.status = ST[c.status] ? c.status : 'none';
  });
  return d;
}
function countShots(d) { var n = 0; (d.cases || []).forEach(function (c) { n += (c.shots || []).length; }); return n; }

/* ------------------------------------------------------------ state */
var docs = [], cur = null, activeCase = null, views = {}, main, casesBox, countEl, panelEl, saveEl, sumBox, panelOpen = false, exportBusy = false, persisted = false;
var app = document.getElementById('app');
var saveTimer = null, saving = false, again = false, sumRaf = 0;

function setSave(kind, msg) {
  if (!saveEl) return;
  saveEl.className = 'save' + (kind === 'err' ? ' err' : '');
  saveEl.textContent = kind === 'dirty' ? 'Unsaved changes' : kind === 'saving' ? 'Saving…' : kind === 'saved' ? 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (msg || 'Could not save');
}
function markDirty() { if (!cur) return; cur.updatedAt = Date.now(); setSave('dirty'); clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 700); }
async function doSave() {
  if (!cur) return;
  if (saving) { again = true; return; }
  saving = true; setSave('saving');
  try {
    var snap = clone(cur); await Store.put(snap.id, snap); persisted = true;
    var i = docs.findIndex(function (d) { return d.id === snap.id; }); if (i < 0) docs.push(snap); else docs[i] = snap;
    if (!again) setSave('saved');
    renderPanel();
  } catch (e) { setSave('err', 'Could not save. Check that the browser allows site storage.'); again = false; clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 4000); }
  saving = false;
  if (again) { again = false; doSave(); }
}
async function flush() {
  clearTimeout(saveTimer);
  if (cur && saveEl && /Unsaved|Saving|Could not/.test(saveEl.textContent)) { while (saving) await new Promise(function (r) { setTimeout(r, 60); }); again = false; await doSave(); }
}
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && cur) { clearTimeout(saveTimer); doSave(); } });
window.addEventListener('pagehide', function () { if (cur) { clearTimeout(saveTimer); doSave(); } });

/* ------------------------------------------------------------ render */
/* ---------- collapsible cards (view state only, not saved) ---------- */
var collapsed = {};
function previewText(c) {
  if (cur.type === 'bug') { var b = c.bug; return (b.id ? b.id + ': ' : '') + (c.sum.trim() || '(no summary yet)') + '  ·  ' + b.severity + '  ·  ' + b.status; }
  return EX.firstLine(richBlocks(c.title), 140) || '(no description yet)';
}
function setCollapsed(c, on, elArg) {
  collapsed[c.id] = !!on;
  var el = elArg || document.getElementById('case-' + c.id); if (!el) return;
  el.classList.toggle('collapsed', !!on);
  var chev = el.querySelector('.chev'), prev = el.querySelector('.cprev');
  if (chev) { chev.textContent = on ? '▸' : '▾'; chev.title = on ? 'Expand' : 'Collapse'; chev.setAttribute('aria-expanded', String(!on)); chev.setAttribute('aria-label', (on ? 'Expand ' : 'Collapse ') + lab(c)); }
  if (prev && on) prev.textContent = previewText(c);
}
function collapseCtl(c) {
  var chev = h('button', { class: 'btn sm ghost chev', type: 'button', onclick: function (e) { e.stopPropagation(); setCollapsed(c, !collapsed[c.id]); } });
  var prev = h('div', { class: 'cprev', role: 'button', tabindex: '0', title: 'Click to expand', onclick: function () { setCollapsed(c, false); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed(c, false); } } });
  return { chev: chev, prev: prev };
}
var sumCollapsed = false;
function sumHead() {
  sumBox.classList.toggle('sumcollapsed', sumCollapsed);
  function paint(b) { b.textContent = sumCollapsed ? '▸' : '▾'; b.title = sumCollapsed ? 'Expand summary' : 'Collapse summary'; b.setAttribute('aria-expanded', String(!sumCollapsed)); }
  var chev = h('button', { class: 'btn sm ghost chev', type: 'button', 'aria-label': 'Toggle summary', onclick: function () { sumCollapsed = !sumCollapsed; sumBox.classList.toggle('sumcollapsed', sumCollapsed); paint(chev); } });
  paint(chev);
  return h('div', { class: 'sumhead' }, chev, h('h2', { text: 'Summary' }), h('span', { class: 'grow' }), collapseAllBtns());
}
function collapseAllBtns() {
  function all(on) { cur.cases.forEach(function (c) { setCollapsed(c, on); }); }
  return [h('button', { class: 'btn sm ghost', type: 'button', title: 'Collapse every card', onclick: function () { all(true); } }, 'Collapse all'), h('button', { class: 'btn sm ghost', type: 'button', title: 'Expand every card', onclick: function () { all(false); } }, 'Expand all')];
}
function openDoc(d) { cur = fixDoc(clone(d)); activeCase = null; views = {}; collapsed = {}; sumCollapsed = false; panelOpen = false; persisted = docs.some(function (x) { return x.id === d.id; }); render(); }
var shell, sideOpen = (function () { try { if (window.matchMedia && matchMedia('(max-width: 899px)').matches) return false; return localStorage.getItem('qrdSide') !== '0'; } catch (e) { return true; } })();
function isNarrow() { return !!(window.matchMedia && matchMedia('(max-width: 899px)').matches); }
function setSide(on) {
  sideOpen = !!on; if (shell) shell.classList.toggle('side-open', sideOpen);
  if (!isNarrow()) { try { localStorage.setItem('qrdSide', sideOpen ? '1' : '0'); } catch (e) { /* ignore */ } }
}
function render() {
  var keep = saveEl && saveEl.textContent;
  app.replaceChildren();
  saveEl = h('span', { class: 'save', 'aria-live': 'polite' }, keep && !/^Unsaved|^Saving/.test(keep) ? keep : 'Saved');
  var top = h('div', { class: 'top' }, h('div', { class: 'wrap' },
    h('button', { class: 'btn ghost menubtn', type: 'button', title: 'Show or hide the documents menu', 'aria-label': 'Documents menu', onclick: function () { setSide(!sideOpen); } }, '\u2630'),
    h('div', { class: 'brand' }, h('i'), 'QA Report Desk'),
    h('span', { class: 'grow' }), saveEl, exportMenu()));
  main = h('main', { class: 'wrap' });
  var content = h('div', { class: 'content' }, top, toolbar(), main);
  shell = h('div', { class: 'shell' + (sideOpen ? ' side-open' : '') }, sideEl(), h('div', { class: 'scrim', onclick: function () { setSide(false); } }), content);
  app.append(shell);
  renderMain(); renderPanel();
}
function sideEl() {
  panelEl = h('div', { class: 'dlist' });
  function newBtn(type, title, desc) {
    return h('button', { class: 'newbtn', type: 'button', 'data-new': type, onclick: function () { newDocument(type); } }, h('b', { text: '+ ' + title }), h('small', { text: desc }));
  }
  var pick = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', multiple: true, class: 'hide-file', 'aria-label': 'Choose backup files to import' });
  pick.addEventListener('change', function () { var fs = Array.prototype.slice.call(pick.files); pick.value = ''; if (fs.length) importFiles(fs); });
  return h('aside', { class: 'side', 'aria-label': 'Documents' },
    h('div', { class: 'side-head' }, h('div', { class: 'brand' }, h('i'), 'QA Report Desk'),
      h('button', { class: 'btn sm ghost x', type: 'button', title: 'Close menu', 'aria-label': 'Close menu', onclick: function () { setSide(false); } }, '\u2715')),
    h('div', { class: 'side-new' }, h('div', { class: 'side-lbl', text: 'Create new' }),
      newBtn('evidence', 'Test evidence', 'Test cases, Pass/Fail summary, screenshots'),
      newBtn('bug', 'Bug report', 'Steps, expected vs actual, evidence')),
    h('div', { class: 'side-lbl', text: 'My documents' }),
    panelEl,
    h('div', { class: 'side-foot' },
      h('button', { class: 'btn sm', type: 'button', title: 'Download every document and screenshot as one file', onclick: exportAllDocs }, 'Export all'),
      h('button', { class: 'btn sm', type: 'button', title: 'Choose one or more documents and download them as one file', onclick: pickExport }, 'Export selected'),
      h('button', { class: 'btn sm', type: 'button', title: 'Load a file made with Export. If it holds several documents you choose which to import.', onclick: function () { pick.click(); } }, 'Import'),
      pick));
}
function lab(c) { return cur.type === 'bug' ? 'Bug ' + String(cur.cases.indexOf(c) + 1).padStart(2, '0') : label(cur.cases.indexOf(c)); }
function renderBug() {
  var d = cur;
  var title = h('input', { class: 'in h-title', id: 'doc-title', value: d.title, 'aria-label': 'Report title', placeholder: 'Report title, e.g. Login module – UAT build 1.0.0', oninput: function (e) { d.title = e.target.value; markDirty(); } });
  var ratio = h('select', { class: 'sel', id: 'doc-ratio', 'aria-label': 'Screenshot frame', onchange: function (e) { d.ratio = e.target.value; applyRatio(); markDirty(); } }, RATIOS.map(function (r) { return h('option', { value: r[0], text: r[1] }); }));
  ratio.value = d.ratio;
  if (!d.cases.some(function (c) { return c.id === activeCase; })) activeCase = d.cases[0].id;
  countEl = h('span', { class: 'count' });
  sumBox = h('section', { class: 'summary', id: 'summary', 'aria-label': 'Summary' });
  casesBox = h('div');
  main.append(h('div', { class: 'sheet bugsheet' }, h('div', { class: 'lbl', text: 'Bug report' }), title,
    sumBox,
    h('div', { class: 'bartools' }, countEl, h('label', { class: 'lbl', for: 'doc-ratio', text: 'Screenshot frame' }), ratio),
    casesBox,
    h('button', { class: 'btn addcase', onclick: function () { var c = newBugCase(); cur.cases.push(c); activeCase = c.id; renderCases(); refreshSummary(); markDirty(); focusCase(c.id); } }, '+ Add bug')));
  applyRatio(); renderCases(); refreshSummary();
}
function sevBadge(k) { var v = EX.SEV[k]; return h('span', { class: 'badge none', style: v ? 'background:#' + v.fill + ';color:#' + v.ink : '', text: k || '–' }); }
function drawBugSummary() {
  if (!sumBox || !cur) return;
  var L = cur.cases, open = 0, by = {};
  L.forEach(function (c) { var b = c.bug; by[b.severity] = (by[b.severity] || 0) + 1; if (['Closed', 'Verified', "Won't Fix"].indexOf(b.status) < 0) open++; });
  var s = countShots(cur);
  countEl.textContent = L.length + ' bug' + (L.length === 1 ? '' : 's') + ' · ' + s + ' screenshot' + (s === 1 ? '' : 's');
  var pills = [h('span', { class: 'pill overall blocked', text: open + ' open' }), h('span', { class: 'pill none', text: L.length + ' total' })];
  SEVERITY.forEach(function (k) { if (by[k]) { var v = EX.SEV[k]; pills.push(h('span', { class: 'pill', style: 'background:#' + v.fill + ';color:#' + v.ink, text: by[k] + ' ' + k })); } });
  sumBox.replaceChildren(
    sumHead(),
    h('div', { class: 'sumtop' }, pills),
    h('div', { class: 'srows' }, L.map(function (c, i) {
      var b = c.bug;
      return h('button', { class: 'srow', type: 'button', title: 'Jump to ' + lab(c), style: 'grid-template-columns:42px minmax(0,1fr) auto auto', onclick: function () { jumpTo(c.id); } },
        h('span', { class: 'no2', text: String(i + 1).padStart(2, '0') }),
        h('span', { class: 'tx', text: (b.id ? b.id + ': ' : '') + (c.sum.trim() || '(no summary yet)') }),
        sevBadge(b.severity), h('span', { class: 'badge none', text: b.status }));
    })));
}
function bugEl(c) {
  var b = c.bug, el = h('article', { class: 'case' + (activeCase === c.id ? ' active' : ''), id: 'case-' + c.id });
  var v = views[c.id] = { el: el };
  function setActive() {
    if (activeCase === c.id) return;
    var old = activeCase && document.getElementById('case-' + activeCase); if (old) old.classList.remove('active');
    activeCase = c.id; el.classList.add('active');
  }
  el.addEventListener('focusin', setActive); el.addEventListener('pointerenter', setActive); el.addEventListener('click', setActive);
  var idx = cur.cases.indexOf(c), n = cur.cases.length, uidp = 'b-' + c.id + '-';
  function tf(k, l, ph, type) {
    return h('div', { class: 'fld' }, h('label', { class: 'lbl', for: uidp + k, text: l }),
      h('input', { class: 'in', id: uidp + k, type: type || 'text', value: b[k] || '', placeholder: ph || '', oninput: function (e) { b[k] = e.target.value; if (k === 'id') refreshSummary(); markDirty(); } }));
  }
  function paint(sel) { var x = EX.SEV[sel.value]; sel.style.background = x ? '#' + x.fill : ''; sel.style.color = x ? '#' + x.ink : ''; sel.style.fontWeight = x ? '700' : ''; }
  function sf(k, l, opts) {
    var sel = h('select', { class: 'in', id: uidp + k, onchange: function (e) { b[k] = e.target.value; if (k === 'severity') paint(sel); refreshSummary(); markDirty(); } }, opts.map(function (o) { return h('option', { value: o, text: o }); }));
    sel.value = b[k]; if (k === 'severity') paint(sel);
    return h('div', { class: 'fld' }, h('label', { class: 'lbl', for: uidp + k, text: l }), sel);
  }
  function rf(k, l, ph) {
    return h('div', { class: 'field' }, h('span', { class: 'lbl', text: l }), richField(function () { return b[k]; }, function (x) { b[k] = x; markDirty(); }, { ph: ph, aria: l + ' (' + lab(c) + ')' }));
  }
  var sum = h('input', { class: 'in bsum', 'aria-label': lab(c) + ' summary', value: c.sum, placeholder: 'Bug summary: one line saying what is wrong', oninput: function (e) { c.sum = e.target.value; refreshSummary(); markDirty(); } });
  var act = h('div', { class: 'cact' },
    h('button', { class: 'btn sm ghost', title: 'Back to summary', onclick: function () { document.getElementById('summary').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, '↑ Summary'),
    h('button', { class: 'btn sm ghost', title: 'Move up', 'aria-label': 'Move bug up', disabled: idx === 0, onclick: function () { moveCase(c, -1); } }, '↑'),
    h('button', { class: 'btn sm ghost', title: 'Move down', 'aria-label': 'Move bug down', disabled: idx === n - 1, onclick: function () { moveCase(c, 1); } }, '↓'),
    h('button', { class: 'btn sm ghost', title: 'Add a new bug right below this one', onclick: function () { insertAfter(c); } }, '+ Add below'),
    h('button', { class: 'btn sm ghost', title: 'Copy this bug without screenshots', onclick: function () { copyCase(c); } }, 'Copy'),
    twoStep(h('button', { class: 'btn sm ghost', disabled: n === 1 }, 'Delete'), 'Delete it?', function () { removeCase(c); }));
  var cc = collapseCtl(c);
  v.params = null; v.shots = h('div', { class: 'shots' });
  el.append(
    h('div', { class: 'chead' }, cc.chev, h('span', { class: 'no' }, lab(c)), h('span', { class: 'grow' }), act),
    cc.prev,
    sum,
    h('div', { class: 'meta' }, tf('id', 'Bug ID', 'e.g. PROJ-101'), tf('module', 'Module / Feature', 'e.g. Login'), tf('env', 'Environment', 'e.g. UAT'), tf('build', 'Build / Version', 'e.g. 1.0.0'),
      sf('severity', 'Severity', SEVERITY), sf('priority', 'Priority', PRIORITY), sf('status', 'Status', BUGSTATUS),
      tf('reporter', 'Reported by', 'Name'), tf('date', 'Date', '', 'date'), tf('assignee', 'Assigned to', 'Name')),
    h('div', { class: 'bugfields' }, rf('pre', 'Preconditions', 'User, data and state needed before step 1'), rf('steps', 'Steps to reproduce', 'Use the numbered-list button: 1. Log in as…  2. Open…'),
      rf('expected', 'Expected result', 'What should happen'), rf('actual', 'Actual result', 'What happens instead, with any error message'), rf('notes', 'Notes / workaround', 'Optional')),
    v.shots);
  renderShots(c);
  setCollapsed(c, collapsed[c.id], el);
  return el;
}
function renderMain() {
  main.replaceChildren();
  var d = cur;
  if (d.type === 'bug') { renderBug(); return; }
  var title = h('input', { class: 'in h-title', id: 'doc-title', value: d.title, 'aria-label': 'Document title', placeholder: 'Test Evidence Document', oninput: function (e) { d.title = e.target.value; markDirty(); } });
  var ticket = h('input', { class: 'in h-ticket', id: 'doc-ticket', value: d.ticket, 'aria-label': 'Ticket or story', placeholder: 'Ticket / story ID and name, e.g. PROJ-123: User login', oninput: function (e) { d.ticket = e.target.value; markDirty(); } });
  function mf(k, l, ph, type) {
    return h('div', { class: 'fld' }, h('label', { class: 'lbl', for: 'm-' + k, text: l }),
      h('input', { class: 'in', id: 'm-' + k, type: type || 'text', value: d.meta[k] || '', placeholder: ph || '', oninput: function (e) { d.meta[k] = e.target.value; markDirty(); } }));
  }
  var ratio = h('select', { class: 'sel', id: 'doc-ratio', 'aria-label': 'Screenshot frame', onchange: function (e) { d.ratio = e.target.value; applyRatio(); markDirty(); } }, RATIOS.map(function (r) { return h('option', { value: r[0], text: r[1] }); }));
  ratio.value = d.ratio;
  countEl = h('span', { class: 'count' });
  sumBox = h('section', { class: 'summary', id: 'summary', 'aria-label': 'Summary' });
  casesBox = h('div');
  main.append(h('div', { class: 'sheet' }, title, ticket,
    h('div', { class: 'meta' }, mf('tester', 'Tested by', 'Name'), mf('date', 'Date', '', 'date'), mf('env', 'Environment / build', 'e.g. UAT · 1.0.0')),
    sumBox,
    h('div', { class: 'bartools' }, countEl, h('label', { class: 'lbl', for: 'doc-ratio', text: 'Screenshot frame' }), ratio),
    casesBox,
    h('button', { class: 'btn addcase', onclick: function () { var c = newCase(); cur.cases.push(c); activeCase = c.id; renderCases(); refreshSummary(); markDirty(); focusCase(c.id); } }, '+ Add test case')));
  applyRatio(); renderCases(); refreshSummary();
}
function focusCase(id) { var e = document.querySelector('#case-' + id + ' .bsum, #case-' + id + ' .rich'); if (e) { e.focus(); e.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
function applyRatio() { main.style.setProperty('--ratio', cur.ratio === 'natural' ? '16/9' : cur.ratio); main.classList.toggle('natural', cur.ratio === 'natural'); }
function renderCases() { casesBox.replaceChildren(); views = {}; cur.cases.forEach(function (c) { casesBox.append(cur.type === 'bug' ? bugEl(c) : caseEl(c)); }); }

/* ---------- summary (live) ---------- */
function summaryModel() {
  return EX.tally(cur.cases.map(function (c) { return { status: c.status }; }));
}
function refreshSummary() {
  if (sumRaf) return;
  sumRaf = requestAnimationFrame(function () { sumRaf = 0; drawSummary(); });
}
function drawSummary() {
  if (cur && cur.type === 'bug') { drawBugSummary(); return; }
  if (!sumBox || !cur) return;
  var T = summaryModel(), n = T.total || 1;
  var overall = T.result === 'PASS' ? 'pass' : T.result === 'FAIL' ? 'fail' : 'blocked';
  var s = cur.cases.reduce(function (a, c) { return a + c.shots.length; }, 0);
  countEl.textContent = T.total + ' test case' + (T.total === 1 ? '' : 's') + ' · ' + s + ' screenshot' + (s === 1 ? '' : 's');
  sumBox.replaceChildren(
    sumHead(),
    h('div', { class: 'sumtop' },
      h('span', { class: 'pill overall ' + overall, text: 'Overall: ' + T.rate + '% passed' }),
      h('span', { class: 'pill pass', text: T.pass + ' passed' }),
      h('span', { class: 'pill fail', text: T.fail + ' failed' }),
      h('span', { class: 'pill blocked', text: T.blocked + ' blocked' }),
      h('span', { class: 'pill none', text: T.none + ' not run' })),
    h('div', { class: 'bar', 'aria-hidden': 'true' },
      h('i', { class: 'p', style: 'width:' + (T.pass / n * 100) + '%' }), h('i', { class: 'f', style: 'width:' + (T.fail / n * 100) + '%' }), h('i', { class: 'b', style: 'width:' + (T.blocked / n * 100) + '%' })),
    h('div', { class: 'srows' }, cur.cases.map(function (c, i) {
      var t = EX.firstLine(richBlocks(c.title), 120);
      return h('button', { class: 'srow', type: 'button', title: 'Jump to ' + label(i), onclick: function () { jumpTo(c.id); } },
        h('span', { class: 'no2', text: String(i + 1).padStart(2, '0') }),
        h('span', { class: 'tx', text: t || '(no description yet)' }),
        h('span', { class: 'badge ' + c.status, text: ST[c.status].label }));
    })));
}
function jumpTo(id) {
  var e = document.getElementById('case-' + id); if (!e) return;
  var cc = cur.cases.filter(function (x) { return x.id === id; })[0]; if (cc && collapsed[id]) setCollapsed(cc, false);
  e.scrollIntoView({ behavior: 'smooth', block: 'start' });
  e.classList.add('flash'); setTimeout(function () { e.classList.remove('flash'); }, 1300);
}

/* ---------- one test case ---------- */
function caseEl(c) {
  var el = h('article', { class: 'case s-' + c.status + (activeCase === c.id ? ' active' : ''), id: 'case-' + c.id });
  var v = views[c.id] = { el: el };
  function setActive() {
    if (activeCase === c.id) return;
    var old = activeCase && document.getElementById('case-' + activeCase); if (old) old.classList.remove('active');
    activeCase = c.id; el.classList.add('active');
  }
  el.addEventListener('focusin', setActive); el.addEventListener('pointerenter', setActive); el.addEventListener('click', setActive);
  var idx = cur.cases.indexOf(c), n = cur.cases.length;

  var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Result of ' + label(idx) }, STATUSES.map(function (s) {
    return h('button', { type: 'button', class: s[0] + (c.status === s[0] ? ' on' : ''), 'aria-pressed': String(c.status === s[0]), onclick: function () {
      c.status = s[0]; el.className = 'case s-' + c.status + (activeCase === c.id ? ' active' : '') + (collapsed[c.id] ? ' collapsed' : '');
      Array.prototype.forEach.call(seg.children, function (b, k) { var on = STATUSES[k][0] === c.status; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      refreshSummary(); markDirty();
    } }, s[1]);
  }));
  var act = h('div', { class: 'cact' },
    h('button', { class: 'btn sm ghost', title: 'Back to summary', onclick: function () { document.getElementById('summary').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, '↑ Summary'),
    h('button', { class: 'btn sm ghost', title: 'Move up', 'aria-label': 'Move test case up', disabled: idx === 0, onclick: function () { moveCase(c, -1); } }, '↑'),
    h('button', { class: 'btn sm ghost', title: 'Move down', 'aria-label': 'Move test case down', disabled: idx === n - 1, onclick: function () { moveCase(c, 1); } }, '↓'),
    h('button', { class: 'btn sm ghost', title: 'Add a new test case right below this one', onclick: function () { insertAfter(c); } }, '+ Add below'),
    h('button', { class: 'btn sm ghost', title: 'Copy this test case without screenshots', onclick: function () { copyCase(c); } }, 'Copy'),
    twoStep(h('button', { class: 'btn sm ghost', disabled: n === 1 }, 'Delete'), 'Delete it?', function () { removeCase(c); }));
  var cc = collapseCtl(c);
  var head = h('div', { class: 'chead' }, cc.chev, h('span', { class: 'no' }, label(idx)), seg, act);

  var desc = richField(function () { return c.title; }, function (x) { c.title = x; }, { cls: 'title', ph: 'Verify whether… (what this test case checks)', aria: label(idx) + ' description', onInput: refreshSummary });
  var data = richField(function () { return c.data; }, function (x) { c.data = x; }, { ph: 'Inputs or accounts used for this test, e.g. user: admin, amount: 500', aria: 'Test data' });
  var notes = richField(function () { return c.notes; }, function (x) { c.notes = x; }, { ph: 'Actual result, bug id, observations…', aria: 'Remarks' });
  function fld(l, ctrl) { return h('div', { class: 'field' }, h('span', { class: 'lbl', text: l }), ctrl); }
  v.params = h('div'); v.shots = h('div', { class: 'shots' });
  el.append(head, cc.prev, fld('Description', desc), fld('Test data', data), v.params, fld('Remarks / actual result', notes), v.shots);
  renderParams(c); renderShots(c);
  setCollapsed(c, collapsed[c.id], el);
  return el;
}
function moveCase(c, d) {
  var i = cur.cases.indexOf(c), j = i + d; if (j < 0 || j >= cur.cases.length) return;
  cur.cases.splice(i, 1); cur.cases.splice(j, 0, c); renderCases(); refreshSummary(); markDirty();
  var e = document.getElementById('case-' + c.id); if (e) e.scrollIntoView({ block: 'nearest' });
}
function insertAfter(c) {
  var k = cur.type === 'bug' ? newBugCase() : newCase();
  cur.cases.splice(cur.cases.indexOf(c) + 1, 0, k); activeCase = k.id;
  renderCases(); refreshSummary(); markDirty(); focusCase(k.id);
}
function copyCase(c) {
  var k = cur.type === 'bug' ? newBugCase({ sum: c.sum, bug: Object.assign(clone(c.bug), { id: '', status: 'Open' }) }) : newCase({ title: c.title, data: c.data, notes: '', hasParams: c.hasParams, params: clone(c.params) });
  cur.cases.splice(cur.cases.indexOf(c) + 1, 0, k); activeCase = k.id; renderCases(); refreshSummary(); markDirty(); focusCase(k.id);
}
function removeCase(c) {
  c.shots.forEach(function (s) { Shots.drop(s.shotId); });
  cur.cases.splice(cur.cases.indexOf(c), 1); if (activeCase === c.id) activeCase = null;
  renderCases(); refreshSummary(); markDirty();
}

/* ---------- parameter table ---------- */
function renderParams(c) {
  var box = views[c.id].params; box.replaceChildren();
  if (!c.hasParams) { box.append(h('button', { class: 'btn sm', onclick: function () { c.hasParams = true; if (!c.params.length) c.params.push({ k: '', v: '' }); renderParams(c); markDirty(); var f = box.querySelector('input'); if (f) f.focus(); } }, '+ Input values table')); return; }
  var wrap = h('div', { class: 'params' }, h('div', { class: 'prow' }, h('span', { class: 'lbl', text: 'Field' }), h('span', { class: 'lbl', text: 'Value' }), h('span')));
  c.params.forEach(function (p, i) {
    function pasteRows(e) {
      var t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      if (!/[\t\n]/.test(t)) return;
      var rows = t.replace(/\r/g, '').split('\n').filter(function (x) { return x.trim(); }).map(function (line) { var a = line.split('\t'); return { k: (a[0] || '').trim(), v: a.slice(1).join(' ').trim() }; });
      if (!rows.length) return;
      e.preventDefault();
      c.params.splice.apply(c.params, [i, (!p.k && !p.v) ? 1 : 0].concat(rows));
      renderParams(c); markDirty();
    }
    var k = h('input', { class: 'in', value: p.k, placeholder: 'Field name, e.g. Start date', 'aria-label': 'Field', oninput: function (e) { p.k = e.target.value; markDirty(); } });
    var val = h('input', { class: 'in', value: p.v, placeholder: 'Value, e.g. 01-01-2025', 'aria-label': 'Value', oninput: function (e) { p.v = e.target.value; markDirty(); } });
    k.addEventListener('paste', pasteRows); val.addEventListener('paste', pasteRows);
    wrap.append(h('div', { class: 'prow' }, k, val, h('button', { class: 'x', title: 'Delete row', 'aria-label': 'Delete row', onclick: function () { c.params.splice(i, 1); if (!c.params.length) c.params.push({ k: '', v: '' }); renderParams(c); markDirty(); } }, '✕')));
  });
  wrap.append(h('div', { class: 'pacts' },
    h('button', { class: 'btn sm', onclick: function () { c.params.push({ k: '', v: '' }); renderParams(c); markDirty(); var ins = box.querySelectorAll('.prow:last-of-type input'); if (ins[0]) ins[0].focus(); } }, '+ Row'),
    twoStep(h('button', { class: 'btn sm ghost' }, 'Remove table'), 'Remove table?', function () { c.hasParams = false; c.params = []; renderParams(c); markDirty(); }),
    h('span', { class: 'lbl', style: 'align-self:center', text: 'Tip: paste rows copied from Excel or Word' })));
  box.append(wrap);
}

/* ---------- screenshots ---------- */
var IMG_ICON = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/></svg>';
function renderShots(c, focusIdx) {
  var box = views[c.id].shots; box.replaceChildren();
  c.shots.forEach(function (s, i) { box.append(shotEl(c, s, i)); });
  box.append(zoneEl(c));
  if (focusIdx != null) { var cap = box.querySelectorAll('.cap')[focusIdx]; if (cap) cap.focus(); }
}
function shotEl(c, s, i) {
  var file = h('input', { type: 'file', accept: 'image/*', class: 'hide-file', 'aria-label': 'Choose a replacement image' });
  file.addEventListener('change', function () { var f = file.files[0]; file.value = ''; if (f) replaceShot(c, s, f); });
  var cap = h('input', { class: 'in cap', value: s.caption || '', placeholder: 'Caption, e.g. Login screen', 'aria-label': 'Screenshot caption', oninput: function (e) { s.caption = e.target.value; markDirty(); } });
  var last = c.shots.length - 1;
  var row = h('div', { class: 'caprow' }, cap,
    h('button', { class: 'btn sm ghost', title: 'Move up', 'aria-label': 'Move screenshot up', disabled: i === 0, onclick: function () { moveShot(c, i, -1); } }, '↑'),
    h('button', { class: 'btn sm ghost', title: 'Move down', 'aria-label': 'Move screenshot down', disabled: i === last, onclick: function () { moveShot(c, i, 1); } }, '↓'),
    h('button', { class: 'btn sm ghost', onclick: function () { file.click(); } }, 'Replace'),
    twoStep(h('button', { class: 'btn sm ghost' }, 'Remove'), 'Remove?', function () { c.shots.splice(i, 1); Shots.drop(s.shotId); renderShots(c); refreshSummary(); markDirty(); }));
  var img = h('img', { alt: (s.caption || lab(c)) + ' screenshot' });
  var fr = h('div', { class: 'frame filled', tabindex: '0', role: 'button', 'aria-label': 'Enlarge screenshot', onclick: function () { openLightbox(s); }, onkeydown: function (e) { if (e.key === 'Enter') openLightbox(s); } },
    img, h('div', { class: 'meta2', text: s.w + '×' + s.h + ' · ' + s.kb + ' KB · captured ' + stamp(s.at) }));
  Shots.get(s.shotId).then(function (u) { if (u) img.src = u; else fr.append(h('div', { class: 'ph' }, h('b', { text: 'Image missing' }), h('small', { text: 'Remove it and paste again' }))); });
  return h('figure', { class: 'shot' }, row, fr, file);
}
function zoneEl(c) {
  var file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hide-file', 'aria-label': 'Choose screenshots' });
  file.addEventListener('change', function () { var fs = Array.prototype.slice.call(file.files); file.value = ''; if (fs.length) addFiles(c, fs); });
  var icon = document.createElement('span'); icon.innerHTML = IMG_ICON;
  var ph = h('div', { class: 'ph' }, icon.firstChild, h('b', { text: c.shots.length ? 'Add another screenshot' : 'Paste a screenshot' }), h('small', { text: cur.type === 'bug' ? 'Ctrl+V to paste, or drop files' : 'Ctrl+V while this test case is highlighted, or drop files' }),
    h('button', { class: 'btn sm', type: 'button', onclick: function (e) { e.stopPropagation(); file.click(); } }, 'Browse'));
  var z = h('div', { class: 'frame zone', tabindex: '0', role: 'group', 'aria-label': 'Add screenshot to ' + lab(c) }, ph, file);
  z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', function () { z.classList.remove('over'); });
  z.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); z.classList.remove('over'); addFiles(c, Array.prototype.filter.call(e.dataTransfer.files || [], function (f) { return f.type.indexOf('image/') === 0; })); });
  z.addEventListener('keydown', function (e) { if (e.target === z && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); file.click(); } });
  return z;
}
function moveShot(c, i, d) { var j = i + d; if (j < 0 || j >= c.shots.length) return; var t = c.shots[i]; c.shots[i] = c.shots[j]; c.shots[j] = t; renderShots(c); markDirty(); }
async function addFiles(c, files) {
  files = files.filter(function (f) { return f && f.type.indexOf('image/') === 0; });
  if (!files.length) { toast('That is not an image.'); return; }
  var firstNew = c.shots.length, added = 0;
  for (var i = 0; i < files.length; i++) {
    try { var p = await processImage(files[i]), id = await Shots.add(p); c.shots.push({ shotId: id, caption: '', w: p.w, h: p.h, kb: p.kb, at: Date.now() }); added++; }
    catch (e) { toast('Could not store that image.'); }
  }
  if (!added) return;
  renderShots(c, added === 1 ? firstNew : null); refreshSummary(); markDirty();
}
async function replaceShot(c, s, file) {
  try { var p = await processImage(file), id = await Shots.add(p), old = s.shotId; s.shotId = id; s.w = p.w; s.h = p.h; s.kb = p.kb; s.at = Date.now(); Shots.drop(old); renderShots(c); markDirty(); }
  catch (e) { toast('Could not store that image.'); }
}
document.addEventListener('paste', function (e) {
  if (!cur) return;
  var items = Array.prototype.slice.call((e.clipboardData && e.clipboardData.items) || []);
  var imgs = items.filter(function (i) { return i.type.indexOf('image/') === 0; });
  if (!imgs.length || items.some(function (i) { return i.type === 'text/plain'; })) return;
  e.preventDefault();
  var c = cur.cases.filter(function (x) { return x.id === activeCase; })[0] || cur.cases[0];
  if (collapsed[c.id]) setCollapsed(c, false);
  if (c.id !== activeCase) { activeCase = c.id; var el = document.getElementById('case-' + c.id); if (el) el.classList.add('active'); }
  addFiles(c, imgs.map(function (i) { return i.getAsFile(); }).filter(Boolean));
});
window.addEventListener('dragover', function (e) { e.preventDefault(); });
window.addEventListener('drop', function (e) { e.preventDefault(); });

/* ---------- lightbox ---------- */
function closeLightbox() { var lb = document.getElementById('lightbox'); lb.hidden = true; lb.replaceChildren(); }
async function openLightbox(s) {
  var lb = document.getElementById('lightbox'), img = h('img', { alt: s.caption || 'Screenshot' });
  lb.replaceChildren(h('div', { class: 'lb' }, h('span', { text: (s.caption ? s.caption + ' · ' : '') + s.w + '×' + s.h }), h('button', { class: 'btn sm', onclick: closeLightbox }, 'Close')), img);
  lb.hidden = false; var u = await Shots.get(s.shotId); if (u) img.src = u;
}
document.getElementById('lightbox').addEventListener('click', function (e) { if (e.target.tagName !== 'BUTTON') closeLightbox(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });

/* ------------------------------------------------------------ documents panel */
function listDocs() {
  var rows = docs.filter(function (d) { return !cur || d.id !== cur.id; });
  if (cur && persisted) rows.push(cur);
  return rows.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
}
function docResult(d) { return EX.tally((d.cases || []).map(function (c) { return { status: c.status }; })); }
function renderPanel() {
  if (!panelEl) return;
  panelEl.replaceChildren();
  var rows = listDocs();
  if (!rows.length) panelEl.append(h('div', { class: 'none', text: 'No saved documents yet. Whatever you type saves automatically.' }));
  rows.forEach(function (d) {
    var n = (d.cases || []).length, isBug = d.type === 'bug', title = docTitleOf(d), sub;
    if (isBug) sub = n + ' bug' + (n === 1 ? '' : 's') + ' \u00b7 edited ' + ago(d.updatedAt);
    else sub = n + ' test case' + (n === 1 ? '' : 's') + ' \u00b7 ' + docResult(d).rate + '% passed \u00b7 edited ' + ago(d.updatedAt);
    panelEl.append(h('div', { class: 'drow' + (cur && d.id === cur.id ? ' cur' : ''), tabindex: '0', title: title, onclick: function () { switchTo(d); }, onkeydown: function (e) { if (e.key === 'Enter') switchTo(d); } },
      h('div', { class: 't' }, h('span', { class: 'kind ' + (isBug ? 'bug' : 'tc'), text: isBug ? 'BUG' : 'TC' }), title),
      h('div', { class: 's', text: sub }),
      h('div', { class: 'acts' },
        h('button', { class: 'btn sm ghost', onclick: function (e) { e.stopPropagation(); duplicateDoc(d); } }, 'Duplicate'),
        h('button', { class: 'btn sm ghost', title: 'Download just this document, with its screenshots', onclick: function (e) { e.stopPropagation(); exportOneDoc(d); } }, 'Export'),
        twoStep(h('button', { class: 'btn sm ghost' }, 'Delete'), 'Delete for good?', function () { deleteDoc(d); }))));
  });
}
/* ---------- backup / import ---------- */
function shotIdsOf(d) { var ids = []; (d.cases || []).forEach(function (c) { (c.shots || []).forEach(function (s) { if (s.shotId) ids.push(s.shotId); }); }); return ids; }
function safeName(x) { return String(x || '').trim().replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 60); }
function docTitleOf(d) {
  if (d.type === 'bug') return d.title || ((d.cases[0].bug.id ? d.cases[0].bug.id + ' ' : '') + (d.cases[0].sum || 'Untitled bug'));
  return d.ticket || d.title || 'Untitled';
}
/* Export: one or many documents (with their screenshots) as a single .json file that Import can read back. */
async function exportDocs(list, fileBase) {
  try {
    await flush();
    var out = [], shots = {};
    for (var i = 0; i < list.length; i++) {
      var d = clone(list[i]), ids = shotIdsOf(d);
      for (var j = 0; j < ids.length; j++) { var u = await Shots.get(ids[j]); if (u) shots[ids[j]] = u; }
      out.push(d);
    }
    if (!out.length) { toast('Nothing to export yet.'); return; }
    var name = fileBase + '.backup.json';
    download(new Blob([JSON.stringify({ app: 'qa-report-desk', version: 1, exportedAt: new Date().toISOString(), docs: out, shots: shots })], { type: 'application/json' }), name);
    toast('Exported ' + out.length + ' document' + (out.length === 1 ? '' : 's') + ': ' + name);
  } catch (e) { toast('Export failed: ' + (e && e.message || 'unknown error')); }
}
function exportAllDocs() { return exportDocs(listDocs(), 'qa-report-desk-all-' + new Date().toISOString().slice(0, 10)); }
function exportOneDoc(d) { return exportDocs([d], safeName(docTitleOf(d)) || 'document'); }

function shotIdsOf(d) { var ids = []; (d.cases || []).forEach(function (c) { (c.shots || []).forEach(function (s) { if (s.shotId) ids.push(s.shotId); }); }); return ids; }
function validId(x) { return typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x); }
async function readImport(files) {
  var inDocs = [], inShots = {}, bad = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i], text;
    try { text = await f.text(); } catch (e) { bad++; continue; }
    if (/\.txt$/i.test(f.name)) {                                   /* screenshot file from the old data/shots folder */
      var sid = f.name.replace(/\.txt$/i, '');
      if (validId(sid) && /^data:image\//.test(text.trim())) inShots[sid] = text.trim(); else bad++;
      continue;
    }
    try {
      var j = JSON.parse(text);
      if (j && Array.isArray(j.docs)) { j.docs.forEach(function (d) { inDocs.push(d); }); Object.keys(j.shots || {}).forEach(function (k) { inShots[k] = j.shots[k]; }); }
      else if (j && j.kind === 'doc') inDocs.push(j);
      else bad++;
    } catch (e) { bad++; }
  }
  inDocs = inDocs.filter(function (d) { return d && d.kind === 'doc' && validId(d.id); }).map(fixDoc);
  return { docs: inDocs, shots: inShots, bad: bad };
}
function haveLocal(id) { return docs.filter(function (x) { return x.id === id; })[0] || (cur && cur.id === id && persisted ? cur : null); }
function importState(d) {                                           /* 'new' | 'upd' (replaces an older copy) | 'same' (you already have it, same or newer) */
  var have = haveLocal(d.id);
  return !have ? 'new' : ((have.updatedAt || 0) >= (d.updatedAt || 0) ? 'same' : 'upd');
}
async function importFiles(files) {
  var r = await readImport(files);
  if (!r.docs.length) { toast('No documents found in that file.' + (r.bad ? ' Choose a file made with Export.' : '')); return; }
  await flush();
  var fresh = r.docs.filter(function (d) { return importState(d) !== 'same'; });
  if (!fresh.length) { toast(r.docs.length === 1 ? 'You already have this document (same or newer).' : 'Everything in that file is already here (same or newer).'); return; }
  if (r.docs.length === 1) { commitImport(r.docs, r.shots, r.bad); return; }
  pickImport(r);
}
/* One tick-list used by both Import (pick from a file) and Export (pick from your documents).
   o = { docs, title, sub, verb, off(d)->bool, tag(d)->[text,cls]|null, initial(d)->bool, onGo(selectedDocs) } */
function pickDocs(o) {
  var chosen = {}, rows = [], list = h('div', { class: 'mlist' });
  o.docs.forEach(function (d) { chosen[d.id] = !o.off(d) && o.initial(d); });
  var count = h('span', { class: 'mcount' }), go = h('button', { class: 'btn primary', type: 'button' });
  function close() { if (box.parentNode) box.parentNode.removeChild(box); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function selected() { return o.docs.filter(function (d) { return chosen[d.id]; }); }
  function refresh() {
    var n = selected().length;
    count.textContent = n + ' of ' + o.docs.length + ' selected'; go.textContent = o.verb + ' selected (' + n + ')'; go.disabled = !n;
    rows.forEach(function (x) { x.cb.checked = !!chosen[x.id]; });
  }
  o.docs.forEach(function (d) {
    var off = o.off(d), n = (d.cases || []).length, isBug = d.type === 'bug', tag = o.tag(d);
    var cb = h('input', { type: 'checkbox', disabled: off, 'aria-label': o.verb + ' ' + docTitleOf(d), onchange: function () { chosen[d.id] = cb.checked; refresh(); } });
    rows.push({ id: d.id, cb: cb });
    list.append(h('label', { class: 'mrow' + (off ? ' off' : '') }, cb,
      h('div', { style: 'min-width:0' },
        h('div', { class: 'mt' }, h('span', { class: 'kind ' + (isBug ? 'bug' : 'tc'), text: isBug ? 'BUG' : 'TC' }), docTitleOf(d)),
        h('div', { class: 'ms' }, (isBug ? n + ' bug' : n + ' test case') + (n === 1 ? '' : 's') + ' \u00b7 ' + shotIdsOf(d).length + ' screenshot' + (shotIdsOf(d).length === 1 ? '' : 's') + (tag ? ' \u00b7 ' : ''), tag ? h('span', { class: 'tag ' + tag[1], text: tag[0] }) : null))));
  });
  function setAll(on) { o.docs.forEach(function (d) { chosen[d.id] = on && !o.off(d); }); refresh(); }
  go.addEventListener('click', function () { var sel = selected(); close(); o.onGo(sel); });
  var box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, onclick: function (e) { if (e.target === box) close(); } },
    h('div', { class: 'mbox' },
      h('div', { class: 'mhead' }, h('h2', { text: o.title }), h('p', { class: 'msub', text: o.sub }),
        h('div', { class: 'mtools' }, h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { setAll(true); } }, 'Select all'), h('button', { class: 'btn sm ghost', type: 'button', onclick: function () { setAll(false); } }, 'Select none'), count)),
      list,
      h('div', { class: 'mfoot' }, h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), go)));
  document.body.append(box); document.addEventListener('keydown', onKey); refresh(); go.focus();
}
function pickImport(r) {
  pickDocs({
    docs: r.docs, title: 'Choose what to import', sub: 'This file has ' + r.docs.length + ' documents. Tick the ones you want.', verb: 'Import',
    off: function (d) { return importState(d) === 'same'; }, initial: function () { return true; },
    tag: function (d) { var st = importState(d); return st === 'new' ? ['New', 'new'] : st === 'upd' ? ['Replaces your older copy', 'upd'] : ['You already have this', 'same']; },
    onGo: function (sel) { commitImport(sel, r.shots, r.bad); }
  });
}
async function pickExport() {
  await flush();
  var list = listDocs();
  if (!list.length) { toast('Nothing to export yet.'); return; }
  pickDocs({
    docs: list, title: 'Choose what to export', sub: 'Tick the documents to put in one file. You can open that file in any browser with Import.', verb: 'Export',
    off: function () { return false; }, initial: function () { return false; }, tag: function () { return null; },
    onGo: function (sel) { exportDocs(sel, sel.length === 1 ? (safeName(docTitleOf(sel[0])) || 'document') : 'qa-report-desk-' + sel.length + '-documents-' + new Date().toISOString().slice(0, 10)); }
  });
}
async function commitImport(list, inShots, bad) {
  await flush();
  var added = 0, updated = 0, skipped = 0, newest = null;
  for (var k = 0; k < list.length; k++) {
    var d = list[k], st = importState(d);
    if (st === 'same') { skipped++; continue; }
    try {
      var ids = shotIdsOf(d);
      for (var m = 0; m < ids.length; m++) { var u = inShots[ids[m]]; if (validId(ids[m]) && typeof u === 'string' && /^data:image\//.test(u)) await Shots.put(ids[m], u); }
      await Store.put(d.id, d);
      if (st === 'upd') updated++; else added++;
      if (!newest || (d.updatedAt || 0) > (newest.updatedAt || 0)) newest = d;
    } catch (e) { bad++; }
  }
  try { docs = (await Store.list()).filter(function (x) { return x && x.kind === 'doc'; }).map(fixDoc); } catch (e) { /* keep list */ }
  if (newest) openDoc(newest);
  renderPanel();
  toast('Imported ' + added + ' new' + (updated ? ', ' + updated + ' updated' : '') + (skipped ? ', ' + skipped + ' skipped' : '') + (bad ? ', ' + bad + ' file(s) had problems' : '') + '.');
}
async function switchTo(d) { if (cur && d.id === cur.id) { if (isNarrow()) setSide(false); return; } await flush(); if (isNarrow()) sideOpen = false; openDoc(d); }
async function newDocument(type) { await flush(); if (isNarrow()) sideOpen = false; openDoc(newDoc(type)); var t = document.getElementById('doc-title'); if (t) { t.focus(); t.select(); } }
async function duplicateDoc(d) {
  var c = fixDoc(clone(d)), now = Date.now();
  c.id = uid(); c.createdAt = now; c.updatedAt = now; c.title = (d.title || (d.type === 'bug' ? 'Bug' : 'Test Evidence Document')) + ' (copy)';
  c.cases.forEach(function (k) { k.id = uid(); k.shots = []; k.status = 'none'; if (k.bug) k.bug.status = 'Open'; });
  try { await Store.put(c.id, c); docs.push(c); toast('Duplicated without screenshots, results reset'); renderPanel(); } catch (e) { toast('Could not duplicate'); }
}
async function deleteDoc(d) {
  var wasCur = cur && d.id === cur.id;
  docs = docs.filter(function (x) { return x.id !== d.id; });
  if (wasCur) { clearTimeout(saveTimer); cur = null; }
  try {
    var ids = []; (d.cases || []).forEach(function (c) { (c.shots || []).forEach(function (s) { ids.push(s.shotId); }); });
    await Promise.all(ids.map(function (i) { return Shots.drop(i); }));
    await Store.del(d.id);
  } catch (e) { toast('Delete did not finish. Try again.'); }
  if (wasCur) { var next = listDocs()[0]; openDoc(next || newDoc('evidence')); panelOpen = true; renderPanel(); } else renderPanel();
}

/* ------------------------------------------------------------ export */
function exportMenu() {
  var open = false, pop = h('div', { class: 'pop', hidden: true });
  var btn = h('button', { class: 'btn primary sm', id: 'export-btn', 'aria-haspopup': 'true', onclick: function (e) { e.stopPropagation(); if (exportBusy) return; open = !open; pop.hidden = !open; } }, 'Export ▾');
  [['docx', 'Word', '.docx, ready to attach or print'], ['xlsx', 'Excel', '.xlsx, for trackers and summaries'], ['html', 'Web page', '.html, opens in any browser']].forEach(function (o) {
    pop.append(h('button', { 'data-fmt': o[0], onclick: function () { open = false; pop.hidden = true; exportAs(o[0], btn); } }, o[1], h('small', { text: o[2] })));
  });
  document.addEventListener('click', function () { open = false; pop.hidden = true; });
  return h('div', { class: 'menu' }, btn, pop);
}
function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('lib')); }; document.head.appendChild(s); }); }
async function need(kind) {
  if (kind === 'docx' && !window.docx) await loadScript('vendor/docx.js');
  if (kind === 'xlsx' && !window.ExcelJS) await loadScript('vendor/exceljs.js');
}
function fileBase() {
  if (cur.type === 'bug') return ((cur.title || cur.cases[0].bug.id || '').trim().replace(/[^\w.-]+/g, '_').slice(0, 40) || 'Bug') + '-Bug_Report';
  var id = (cur.ticket || '').trim().split(/[\s:]/)[0].replace(/[^\w.-]+/g, '_').slice(0, 40);
  return (id ? id + '-' : '') + 'Test_Evidence';
}
function download(blob, name) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}
async function buildModel(btn) {
  if (cur.type === 'bug') {
    var bugs = [], totalB = countShots(cur), n = 0;
    for (var bi = 0; bi < cur.cases.length; bi++) {
      var bc = cur.cases[bi], b = bc.bug, out = [];
      for (var k = 0; k < bc.shots.length; k++) {
        if (btn) btn.textContent = 'Screenshot ' + (++n) + ' of ' + totalB + '\u2026';
        var f2 = await frameShot(bc.shots[k], cur.ratio); if (f2) out.push({ caption: bc.shots[k].caption, b64: f2.b64, w: f2.w, h: f2.h });
      }
      bugs.push({ title: bc.sum, bug: Object.assign({}, b, { pre: richBlocks(b.pre), steps: richBlocks(b.steps), expected: richBlocks(b.expected), actual: richBlocks(b.actual), notes: richBlocks(b.notes) }), shots: out });
    }
    return { type: 'bug', title: cur.title, bugs: bugs };
  }
  var model = { title: cur.title, ticket: cur.ticket, meta: cur.meta, cases: [] }, total = countShots(cur), done = 0;
  for (var i = 0; i < cur.cases.length; i++) {
    var c = cur.cases[i], shots = [];
    for (var j = 0; j < c.shots.length; j++) {
      if (btn) btn.textContent = 'Screenshot ' + (++done) + ' of ' + total + '…';
      var fr = await frameShot(c.shots[j], cur.ratio);
      if (fr) shots.push({ caption: c.shots[j].caption, b64: fr.b64, w: fr.w, h: fr.h });
    }
    model.cases.push({ title: richBlocks(c.title), data: richBlocks(c.data), notes: richBlocks(c.notes), status: c.status, params: c.hasParams ? c.params.map(function (p) { return [p.k, p.v]; }) : [], shots: shots });
  }
  return model;
}
async function exportAs(kind, btn) {
  exportBusy = true; btn.disabled = true; var orig = btn.textContent;
  try {
    await flush();
    var model = await buildModel(btn), blob;
    btn.textContent = 'Building file…';
    if (kind === 'html') blob = new Blob([EX.buildHtml(model)], { type: 'text/html' });
    else if (kind === 'docx') { await need('docx'); blob = await window.docx.Packer.toBlob(EX.buildDocx(window.docx, model)); }
    else { await need('xlsx'); var buf = await EX.buildXlsx(window.ExcelJS, model).xlsx.writeBuffer(); blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); }
    var name = fileBase() + '.' + kind; download(blob, name); toast('Exported ' + name);
  } catch (e) { toast(e && e.message === 'lib' ? 'Could not load the exporter. Run npm install on the server.' : 'Export failed: ' + (e && e.message || 'unknown error')); console.error(e); }
  btn.textContent = orig; btn.disabled = false; exportBusy = false;
}
window.__qa = { importFiles: importFiles, exportAllDocs: exportAllDocs, pickExport: pickExport, exportOneDoc: exportOneDoc, IDB: IDB, isLocal: function () { return useLocal; }, need: need, buildModel: buildModel, parseRich: parseRich, sanitize: sanitize };

/* ------------------------------------------------------------ boot */
(async function () {
  useLocal = await probeServer();
  if (useLocal) { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ } }
  try { docs = (await Store.list()).filter(function (d) { return d && d.kind === 'doc'; }).map(fixDoc); }
  catch (e) {
    app.append(h('div', { class: 'wrap' }, h('div', { class: 'sheet' }, h('h2', { text: 'Cannot reach the QA Report Desk server' }), h('p', { text: useLocal ? 'This browser blocks local storage (private window?). Open the page in a normal window.' : 'Start it with  npm start  and reload this page.' }))));
    return;
  }
  if (useLocal && !docs.length) toast('Your documents are saved in this browser only. Use Export to keep or share a copy.');
  var latest = docs.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; })[0];
  openDoc(latest || newDoc('evidence'));
})();
})();
