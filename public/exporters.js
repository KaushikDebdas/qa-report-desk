/* Export builders. Pure functions: model in, document out.
   Rich text is a list of blocks:  { t:'p'|'ul'|'ol', items:[ runs ] }   (p has exactly one item)
   A run is { text, b, i, u, c:'RRGGBB', bg:'RRGGBB' }.
   model = { title, ticket, meta:{tester,date,env},
             cases:[{ title:blocks, data:blocks, notes:blocks, status:'pass'|'fail'|'blocked'|'none',
                      params:[[k,v]], shots:[{ caption, b64, w, h }] }] }          */
(function (root) {
  'use strict';
  var DASH = '–';
  var ST = {
    pass:    { label: 'Passed',  fill: 'C6EFCE', ink: '006100' },
    fail:    { label: 'Failed',  fill: 'FFC7CE', ink: '9C0006' },
    blocked: { label: 'Blocked', fill: 'FFEB9C', ink: '7F4F00' },
    none:    { label: 'Not run', fill: 'E7E7E7', ink: '555555' }
  };
  function st(k) { return ST[k] || ST.none; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function label(i) { return 'Test Case ' + DASH + ' ' + pad(i + 1); }
  function metaLine(m) {
    var p = [];
    if (m && m.tester) p.push('Tested by: ' + m.tester);
    if (m && m.date) p.push('Date: ' + m.date);
    if (m && m.env) p.push('Environment: ' + m.env);
    return p.join('   |   ');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var s = atob(b64), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function params(c) { return (c.params || []).filter(function (r) { return r[0] || r[1]; }); }
  function runText(rs) { return (rs || []).map(function (r) { return r.text; }).join(''); }
  function plain(blocks) {
    return (blocks || []).map(function (b) { return b.items.map(runText).join('\n'); }).join('\n').trim();
  }
  function firstLine(blocks, max) {
    var t = plain(blocks).split('\n')[0] || '';
    return t.length > (max || 110) ? t.slice(0, (max || 110) - 1) + '…' : t;
  }
  function hasText(blocks) { return plain(blocks).length > 0; }
  function tally(cases) {
    var t = { total: cases.length, pass: 0, fail: 0, blocked: 0, none: 0 };
    cases.forEach(function (c) { t[ST[c.status] ? c.status : 'none']++; });
    t.rate = t.total ? Math.round(t.pass / t.total * 100) : 0;
    t.result = t.fail ? 'FAIL' : (t.total && t.pass === t.total ? 'PASS' : 'INCOMPLETE');
    return t;
  }
  function pc(n, t) { return t ? ' (' + Math.round(n / t.total * 100) + '%)' : ''; }
  function summaryLine(t) {
    return 'Total: ' + t.total + '   Passed: ' + t.pass + pc(t.pass, t) + '   Failed: ' + t.fail + pc(t.fail, t) + '   Blocked: ' + t.blocked + pc(t.blocked, t) + '   Not run: ' + t.none + pc(t.none, t);
  }
  var SEV = {
    Critical: { fill: 'FFC7CE', ink: '9C0006' }, Major: { fill: 'FFE0B2', ink: '7F3F00' },
    Minor: { fill: 'FFF3C4', ink: '7F6000' }, Trivial: { fill: 'E7E7E7', ink: '555555' }
  };
  function sev(k) { return SEV[k] || null; }
  function bugFields(b) {
    return [['Module / Feature', b.module], ['Environment', b.env], ['Build / Version', b.build], ['Severity', b.severity, true],
      ['Priority', b.priority], ['Status', b.status], ['Reported by', b.reporter], ['Date', b.date], ['Assigned to', b.assignee]]
      .filter(function (f) { return f[1] || f[2]; });
  }
  function bugSections(b) {
    return [['Preconditions', b.pre], ['Steps to Reproduce', b.steps], ['Expected Result', b.expected], ['Actual Result', b.actual], ['Notes / Workaround', b.notes]]
      .filter(function (x) { return hasText(x[1]); });
  }
  function bugTitle(it) { var b = it.bug || {}; return (b.id ? b.id + ': ' : '') + (it.title || 'Untitled bug'); }
  function docTitle(model) { var l = model.bugs || []; return model.title || (l.length === 1 ? bugTitle(l[0]) : 'Bug Report'); }
  function bugTally(l) {
    var t = { total: l.length, sev: {}, open: 0 };
    l.forEach(function (it) { var b = it.bug || {}; t.sev[b.severity] = (t.sev[b.severity] || 0) + 1; if (b.status !== 'Closed' && b.status !== 'Verified' && b.status !== 'Won\'t Fix') t.open++; });
    return t;
  }
  function bugCountLine(l) {
    var t = bugTally(l), p = ['Total: ' + t.total, 'Open: ' + t.open];
    ['Critical', 'Major', 'Minor', 'Trivial'].forEach(function (k) { if (t.sev[k]) p.push(k + ': ' + t.sev[k]); });
    return p.join('   ');
  }
  var RESULT = { PASS: ST.pass, FAIL: ST.fail, INCOMPLETE: ST.blocked };

  /* ------------------------------------------------------------ DOCX */
  function buildDocx(D, model) {
    var P = D.Paragraph, R = D.TextRun;
    var PAGE_W = 12240, MARGIN = 1440, CONTENT = PAGE_W - 2 * MARGIN;    /* 6.5 in */
    var IMG_W = 624;                                                       /* 16.5 cm at 96 dpi */
    var listN = 1, T = model.type === 'bug' ? null : tally(model.cases), kids = [];
    var LINK = '0563C1';

    function runs(rs, base) {
      return (rs || []).map(function (r) {
        var o = { text: r.text };
        if (r.b) o.bold = true; if (r.i) o.italics = true; if (r.u) o.underline = {};
        if (r.c) o.color = r.c;
        if (r.bg) o.shading = { type: D.ShadingType.CLEAR, fill: r.bg, color: 'auto' };
        return new R(Object.assign(o, base || {}));
      });
    }
    function blockParas(blocks, opts) {
      opts = opts || {};
      var out = [];
      (blocks || []).forEach(function (b) {
        if (b.t === 'p') out.push(new P({ spacing: { after: 60 }, keepNext: !!opts.keepNext, children: runs(b.items[0], opts.base) }));
        else {
          var inst = listN++;
          b.items.forEach(function (it) {
            out.push(new P({ numbering: { reference: b.t === 'ul' ? 'bul' : 'num', level: 0, instance: inst }, spacing: { after: 40 }, children: runs(it, opts.base) }));
          });
        }
      });
      return out;
    }
    var border = { style: D.BorderStyle.SINGLE, size: 4, color: '9AA5B1' };
    var borders = { top: border, bottom: border, left: border, right: border };
    function cell(children, w, fill) {
      return new D.TableCell({
        width: { size: w, type: D.WidthType.DXA }, borders: borders,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: fill ? { type: D.ShadingType.CLEAR, fill: fill, color: 'auto' } : undefined,
        children: children
      });
    }
    function txt(text, o) { return new P({ children: [new R(Object.assign({ text: text || '' }, o || {}))] }); }
    var bmN = 100;                       /* docx's own Bookmark gives every bookmark id 1, so build start/end with unique ids */
    function bookmark(name, children) {
      var id = bmN++;
      return [new D.BookmarkStart(name, id)].concat(children, [new D.BookmarkEnd(id)]);
    }
    function link(anchor, text) {
      return new D.InternalHyperlink({ anchor: anchor, children: [new R({ text: text, color: LINK, underline: {} })] });
    }

    function addShots(list) {
      (list || []).forEach(function (sh) {
        if (sh.caption) kids.push(new P({ spacing: { before: 120, after: 60 }, keepNext: true, children: [new R({ text: sh.caption })] }));
        var hgt = Math.max(1, Math.round(IMG_W * sh.h / sh.w));
        kids.push(new P({ spacing: { after: 160 }, children: [new D.ImageRun({ data: bytes(sh.b64), type: 'jpg', transformation: { width: IMG_W, height: hgt } })] }));
      });
    }
    function bugSummaryDocx(L) {
      var cw = [600, 1500, 4160, 1500, 1600];
      var head = new D.TableRow({ tableHeader: true, children: ['#', 'Bug ID', 'Summary', 'Severity', 'Status'].map(function (t, k) { return cell([txt(t, { bold: true })], cw[k], 'E7ECF1'); }) });
      var rows = L.map(function (it, i) {
        var b = it.bug || {}, sv = sev(b.severity);
        return new D.TableRow({ cantSplit: true, children: [
          cell([txt(String(i + 1))], cw[0]), cell([txt(b.id || '')], cw[1]),
          cell([new P({ children: [link('bug' + (i + 1), it.title || 'Untitled bug')] })], cw[2]),
          cell([txt(b.severity || '', sv ? { bold: true, color: sv.ink } : {})], cw[3], sv ? sv.fill : undefined), cell([txt(b.status || '')], cw[4])] });
      });
      kids.push(new P({ spacing: { before: 120, after: 120 }, children: [new R({ text: bugCountLine(L), color: '555555' })] }));
      kids.push(new D.Table({ width: { size: CONTENT, type: D.WidthType.DXA }, columnWidths: cw, rows: [head].concat(rows) }));
    }
    function bugBody(it, num, many) {
      var b = it.bug || {};
      if (many) {
        kids.push(new P({ pageBreakBefore: true, spacing: { after: 40 }, children: bookmark('bug' + num, [new R({ text: 'BUG ' + pad(num), bold: true, color: '777777', size: 20 })]).concat([new R({ text: '     ' }), link('summary', '↑ Back to summary')]) }));
      } else kids.push(new P({ spacing: { after: 40 }, children: [new R({ text: 'BUG REPORT', bold: true, color: '777777', size: 20 })] }));
      kids.push(new P({ spacing: { after: 160 }, children: [new R({ text: bugTitle(it), bold: true, size: 32 })] }));
      var fl = bugFields(b), cwb = [1750, 2930, 1750, 2930], rowsB = [];
      for (var i = 0; i < fl.length; i += 2) {
        var cells = [];
        [fl[i], fl[i + 1]].forEach(function (f, k) {
          if (!f) { cells.push(cell([txt('')], cwb[k * 2]), cell([txt('')], cwb[k * 2 + 1])); return; }
          var sv = f[2] ? sev(f[1]) : null;
          cells.push(cell([txt(f[0], { bold: true })], cwb[k * 2], 'E7ECF1'));
          cells.push(cell([txt(f[1] || '', sv ? { bold: true, color: sv.ink } : {})], cwb[k * 2 + 1], sv ? sv.fill : undefined));
        });
        rowsB.push(new D.TableRow({ cantSplit: true, children: cells }));
      }
      if (rowsB.length) kids.push(new D.Table({ width: { size: CONTENT, type: D.WidthType.DXA }, columnWidths: cwb, rows: rowsB }));
      bugSections(b).forEach(function (sec) {
        kids.push(new P({ spacing: { before: 280, after: 80 }, keepNext: true, children: [new R({ text: sec[0], bold: true, size: 26 })] }));
        blockParas(sec[1]).forEach(function (p) { kids.push(p); });
      });
      if ((it.shots || []).length) {
        kids.push(new P({ spacing: { before: 280, after: 80 }, keepNext: true, children: [new R({ text: 'Evidence', bold: true, size: 26 })] }));
        addShots(it.shots);
      }
    }
    if (model.type === 'bug') {
      var BL = model.bugs || [], many = BL.length > 1;
      if (many) {
        kids.push(new P({ spacing: { after: 40 }, children: bookmark('summary', [new R({ text: 'BUG REPORT', bold: true, color: '777777', size: 20 })]) }));
        kids.push(new P({ spacing: { after: 120 }, children: [new R({ text: docTitle(model), bold: true, size: 32 })] }));
        bugSummaryDocx(BL);
      }
      BL.forEach(function (it, i) { bugBody(it, i + 1, many); });
    } else {
    /* title block */
    kids.push(new P({ spacing: { after: 120 }, children: [new R({ text: model.title || 'Test Evidence Document', bold: true, size: 32 })] }));
    if (model.ticket) kids.push(new P({ spacing: { after: 120 }, children: [new R({ text: model.ticket, bold: true, size: 24 })] }));
    var ml = metaLine(model.meta);
    if (ml) kids.push(new P({ spacing: { after: 200 }, children: [new R({ text: ml, color: '555555' })] }));

    /* summary */
    kids.push(new P({ spacing: { before: 120, after: 80 }, keepNext: true, children: bookmark('summary', [new R({ text: 'Summary', bold: true, size: 26 })]) }));
    var rs = RESULT[T.result];
    kids.push(new P({ spacing: { after: 80 }, keepNext: true, children: [
      new R({ text: 'Overall: ' }),
      new R({ text: ' ' + T.rate + '% passed ', bold: true, color: rs.ink, shading: { type: D.ShadingType.CLEAR, fill: rs.fill, color: 'auto' } }),
      new R({ text: '      ' + summaryLine(T), color: '555555' })
    ] }));
    var cw = [700, 6560, 2100];
    var sumRows = [new D.TableRow({ tableHeader: true, cantSplit: true, children: [
      cell([txt('#', { bold: true })], cw[0], 'E7ECF1'), cell([txt('Test case (click to jump)', { bold: true })], cw[1], 'E7ECF1'), cell([txt('Status', { bold: true })], cw[2], 'E7ECF1')
    ] })];
    model.cases.forEach(function (c, i) {
      var s = st(c.status), t = firstLine(c.title);
      sumRows.push(new D.TableRow({ cantSplit: true, children: [
        cell([txt(String(i + 1))], cw[0]),
        cell([new P({ children: [link('tc' + (i + 1), label(i) + (t ? ': ' + t : ''))] })], cw[1]),
        cell([txt(s.label, { bold: true, color: s.ink })], cw[2], s.fill)
      ] }));
    });
    kids.push(new D.Table({ width: { size: CONTENT, type: D.WidthType.DXA }, columnWidths: cw, rows: sumRows }));

    /* cases */
    model.cases.forEach(function (c, i) {
      var s = st(c.status), tb = c.title || [];
      var headRuns = [new R({ text: label(i) + ': ', bold: true })];
      var rest = tb;
      if (tb.length && tb[0].t === 'p') { headRuns = headRuns.concat(runs(tb[0].items[0])); rest = tb.slice(1); }
      kids.push(new P({ spacing: { before: 360, after: 80 }, keepNext: true, children: bookmark('tc' + (i + 1), headRuns) }));
      blockParas(rest, { keepNext: true }).forEach(function (p) { kids.push(p); });
      kids.push(new P({ spacing: { after: 100 }, keepNext: true, children: [
        new R({ text: 'Status: ' }),
        new R({ text: ' ' + s.label.toUpperCase() + ' ', bold: true, color: s.ink, shading: { type: D.ShadingType.CLEAR, fill: s.fill, color: 'auto' } }),
        new R({ text: '      ' }),
        link('summary', '↑ Back to summary')
      ] }));
      if (hasText(c.data)) {
        var dp = blockParas(c.data, { keepNext: true });
        if (dp.length && c.data[0].t === 'p') {
          dp[0] = new P({ spacing: { after: 60 }, keepNext: true, children: [new R({ text: 'Test data: ' })].concat(runs(c.data[0].items[0])) });
        } else kids.push(new P({ keepNext: true, children: [new R({ text: 'Test data:' })] }));
        dp.forEach(function (p) { kids.push(p); });
      }
      var pr = params(c);
      if (pr.length) {
        var w1 = Math.round(CONTENT * 0.4), w2 = CONTENT - w1;
        var rows = [new D.TableRow({ tableHeader: true, cantSplit: true, children: [cell([txt('Field', { bold: true })], w1, 'E7ECF1'), cell([txt('Value', { bold: true })], w2, 'E7ECF1')] })];
        pr.forEach(function (r) { rows.push(new D.TableRow({ cantSplit: true, children: [cell([txt(r[0])], w1), cell([txt(r[1])], w2)] })); });
        kids.push(new D.Table({ width: { size: CONTENT, type: D.WidthType.DXA }, columnWidths: [w1, w2], rows: rows }));
        kids.push(new P({ spacing: { after: 120 }, children: [] }));
      }
      if (hasText(c.notes)) {
        kids.push(new P({ spacing: { before: 80, after: 40 }, keepNext: true, children: [new R({ text: 'Remarks:', bold: true })] }));
        blockParas(c.notes).forEach(function (p) { kids.push(p); });
      }
      (c.shots || []).forEach(function (sh) {
        if (sh.caption) kids.push(new P({ spacing: { before: 120, after: 60 }, keepNext: true, children: [new R({ text: sh.caption })] }));
        var hgt = Math.max(1, Math.round(IMG_W * sh.h / sh.w));
        kids.push(new P({ spacing: { after: 160 }, children: [new D.ImageRun({ data: bytes(sh.b64), type: 'jpg', transformation: { width: IMG_W, height: hgt } })] }));
      });
    });

    }
    function lvl(fmt, text) {
      return [{ level: 0, format: fmt, text: text, alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }];
    }
    return new D.Document({
      creator: 'QA Report Desk', title: model.type === 'bug' ? docTitle(model) : (model.title || 'Test Evidence Document'),
      styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
      numbering: { config: [
        { reference: 'bul', levels: lvl(D.LevelFormat.BULLET, '•') },
        { reference: 'num', levels: lvl(D.LevelFormat.DECIMAL, '%1.') }
      ] },
      sections: [{
        properties: { page: { size: { width: PAGE_W, height: 15840 }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
        children: kids
      }]
    });
  }

  /* ------------------------------------------------------------ XLSX */
  function buildBugXlsx(X, model) {
    var wb = new X.Workbook(); wb.creator = 'QA Report Desk';
    var BL = model.bugs || [], many = BL.length > 1;
    var IMG_W = 620, ROW_PX = 20;
    var thin = { style: 'thin', color: { argb: 'FF9AA5B1' } }, box = { top: thin, left: thin, bottom: thin, right: thin };
    var F = function (o) { return Object.assign({ name: 'Calibri', size: 11 }, o || {}); };
    function fill(hex) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } }; }
    function rich(blocks) {
      var parts = [];
      (blocks || []).forEach(function (bl) {
        var lines = bl.t === 'p' ? [bl.items[0] || []] : bl.items;
        lines.forEach(function (rs, li) {
          if (parts.length) parts.push({ text: '\n' });
          var pre = bl.t === 'ul' ? '\u2022 ' : bl.t === 'ol' ? (li + 1) + '. ' : '';
          if (pre) parts.push({ text: pre });
          rs.forEach(function (x) { parts.push({ text: x.text, font: F({ bold: !!x.b, italic: !!x.i, underline: !!x.u, color: x.c ? { argb: 'FF' + x.c } : undefined }) }); });
        });
      });
      return parts.length ? { richText: parts } : '';
    }
    var ws, r;
    function put(row, col, val, o) {
      var c = ws.getCell(row, col); c.value = val; c.alignment = { vertical: 'top', wrapText: true }; o = o || {};
      if (o.bold || o.size || o.color) c.font = F({ bold: !!o.bold, size: o.size, color: o.color ? { argb: 'FF' + o.color } : undefined });
      if (o.fill) c.fill = fill(o.fill); if (o.box) c.border = box; return c;
    }
    function sheetName(i) { return 'Bug ' + pad(i + 1); }
    if (many) {
      ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
      ws.columns = [{ width: 6 }, { width: 18 }, { width: 70 }, { width: 14 }, { width: 18 }];
      put(1, 1, 'BUG REPORT', { bold: true, color: '777777' }); ws.mergeCells(1, 1, 1, 5);
      put(2, 1, docTitle(model), { bold: true, size: 16 }); ws.mergeCells(2, 1, 2, 5);
      put(3, 1, bugCountLine(BL), { color: '555555' }); ws.mergeCells(3, 1, 3, 5);
      ['#', 'Bug ID', 'Summary', 'Severity', 'Status'].forEach(function (t, k) { put(5, k + 1, t, { bold: true, fill: 'E7ECF1', box: true }); });
      BL.forEach(function (it, i) {
        var b = it.bug || {}, sv = sev(b.severity), row = 6 + i;
        put(row, 1, i + 1, { box: true }); put(row, 2, b.id || '', { box: true });
        put(row, 3, { text: it.title || 'Untitled bug', hyperlink: '#\'' + sheetName(i) + '\'!A1' }, { box: true, color: '0563C1' });
        put(row, 4, b.severity || '', sv ? { bold: true, color: sv.ink, fill: sv.fill, box: true } : { box: true }); put(row, 5, b.status || '', { box: true });
      });
    }
    BL.forEach(function (it, i) {
      var b = it.bug || {};
      ws = wb.addWorksheet(many ? sheetName(i) : 'Bug Report', { views: [{ showGridLines: false }] });
      ws.columns = [{ width: 22 }, { width: 92 }];
      ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      r = 1;
      put(r, 1, many ? 'BUG ' + pad(i + 1) : 'BUG REPORT', { bold: true, color: '777777' });
      if (many) put(r, 2, { text: '↑ Back to summary', hyperlink: '#\'Summary\'!A1' }, { color: '0563C1' }); else ws.mergeCells(r, 1, r, 2);
      r++;
      put(r, 1, bugTitle(it), { bold: true, size: 16 }); ws.mergeCells(r, 1, r, 2); r += 2;
      bugFields(b).forEach(function (f) {
        var sv = f[2] ? sev(f[1]) : null;
        put(r, 1, f[0], { bold: true, fill: 'E7ECF1', box: true });
        put(r, 2, f[1] || '', sv ? { bold: true, color: sv.ink, fill: sv.fill, box: true } : { box: true }); r++;
      });
      bugSections(b).forEach(function (sec) { put(r, 1, sec[0], { bold: true, fill: 'E7ECF1', box: true }); put(r, 2, rich(sec[1]), { box: true }); r++; });
      r++;
      (it.shots || []).forEach(function (sh, k) {
        put(r, 1, 'Screenshot ' + (k + 1), { bold: true }); if (sh.caption) put(r, 2, sh.caption); r++;
        var hgt = Math.max(20, Math.round(IMG_W * sh.h / sh.w));
        ws.addImage(wb.addImage({ base64: sh.b64, extension: 'jpeg' }), { tl: { col: 1, row: r - 1 }, ext: { width: IMG_W, height: hgt } });
        r += Math.ceil(hgt / ROW_PX) + 1;
      });
    });
    return wb;
  }
  function buildXlsx(X, model) {
    if (model.type === 'bug') return buildBugXlsx(X, model);
    var wb = new X.Workbook();
    wb.creator = 'QA Report Desk';
    var sm = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });     /* first tab */
    var ws = wb.addWorksheet('Evidence', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 20 }, { width: 92 }, { width: 18 }];
    ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    var IMG_W = 620, ROW_PX = 20, r = 1, T = tally(model.cases), rowOf = [];
    var head = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF1' } };
    var thin = { style: 'thin', color: { argb: 'FF9AA5B1' } };
    var box = { top: thin, left: thin, bottom: thin, right: thin };
    var F = function (o) { return Object.assign({ name: 'Calibri', size: 11 }, o || {}); };
    function fillOf(hex) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } }; }
    function put(sheet, row, col, val, o) {
      var c = sheet.getCell(row, col); c.value = val;
      c.alignment = { vertical: 'top', wrapText: true };
      o = o || {};
      if (o.bold || o.size || o.color) c.font = F({ bold: !!o.bold, size: o.size, color: o.color ? { argb: 'FF' + o.color } : undefined });
      if (o.fill) c.fill = o.fill === true ? head : fillOf(o.fill);
      if (o.box) c.border = box;
      return c;
    }
    function setLink(c, target, text) {
      c.value = { formula: 'HYPERLINK("' + target.replace(/"/g, '""') + '","' + String(text).replace(/"/g, '""') + '")', result: text };
      c.font = F({ color: { argb: 'FF0563C1' }, underline: true });
    }
    function rich(blocks) {
      var parts = [];
      (blocks || []).forEach(function (b) {
        var lines = b.t === 'p' ? [b.items[0] || []] : b.items;
        lines.forEach(function (rs, li) {
          if (parts.length) parts.push({ text: '\n' });
          var pre = b.t === 'ul' ? '• ' : b.t === 'ol' ? (li + 1) + '. ' : '';
          if (pre) parts.push({ text: pre });
          rs.forEach(function (x) {
            parts.push({ text: x.text, font: F({ bold: !!x.b, italic: !!x.i, underline: !!x.u, color: x.c ? { argb: 'FF' + x.c } : undefined }) });
          });
        });
      });
      return parts.length ? { richText: parts } : '';
    }

    /* Evidence sheet */
    put(ws, r, 1, model.title || 'Test Evidence Document', { bold: true, size: 16 }); ws.mergeCells(r, 1, r, 3); r++;
    if (model.ticket) { put(ws, r, 1, model.ticket, { bold: true, size: 12 }); ws.mergeCells(r, 1, r, 3); r++; }
    var ml = metaLine(model.meta);
    if (ml) { put(ws, r, 1, ml); ws.mergeCells(r, 1, r, 3); r++; }
    r++;
    model.cases.forEach(function (c, i) {
      var s = st(c.status);
      rowOf[i] = r;
      put(ws, r, 1, label(i), { bold: true, fill: true, box: true });
      put(ws, r, 2, rich(c.title), { fill: true, box: true });
      put(ws, r, 3, '', { fill: true, box: true });
      r++;
      put(ws, r, 1, 'Status', { bold: true, box: true });
      put(ws, r, 2, s.label, { bold: true, color: s.ink, fill: s.fill, box: true });
      setLink(put(ws, r, 3, '', { box: true }), "#'Summary'!A1", '↑ Summary');
      r++;
      if (hasText(c.data)) { put(ws, r, 1, 'Test data', { bold: true, box: true }); put(ws, r, 2, rich(c.data), { box: true }); r++; }
      var pr = params(c);
      if (pr.length) {
        put(ws, r, 1, 'Field', { bold: true, fill: true, box: true }); put(ws, r, 2, 'Value', { bold: true, fill: true, box: true }); r++;
        pr.forEach(function (p) { put(ws, r, 1, p[0], { box: true }); put(ws, r, 2, p[1], { box: true }); r++; });
      }
      if (hasText(c.notes)) { put(ws, r, 1, 'Remarks', { bold: true, box: true }); put(ws, r, 2, rich(c.notes), { box: true }); r++; }
      (c.shots || []).forEach(function (sh, k) {
        put(ws, r, 1, 'Screenshot ' + (k + 1)); if (sh.caption) put(ws, r, 2, sh.caption); r++;
        var hgt = Math.max(20, Math.round(IMG_W * sh.h / sh.w));
        var id = wb.addImage({ base64: sh.b64, extension: 'jpeg' });
        ws.addImage(id, { tl: { col: 1, row: r - 1 }, ext: { width: IMG_W, height: hgt } });
        r += Math.ceil(hgt / ROW_PX) + 1;
      });
      r++;
    });

    /* Summary sheet */
    sm.columns = [{ width: 14 }, { width: 78 }, { width: 14 }, { width: 46 }];
    var q = 1;
    put(sm, q, 1, model.title || 'Test Evidence Document', { bold: true, size: 16 }); sm.mergeCells(q, 1, q, 4); q++;
    if (model.ticket) { put(sm, q, 1, model.ticket, { bold: true, size: 12 }); sm.mergeCells(q, 1, q, 4); q++; }
    if (ml) { put(sm, q, 1, ml); sm.mergeCells(q, 1, q, 4); q++; }
    q++;
    var res = RESULT[T.result];
    [['Overall pass rate', T.total ? T.pass / T.total : 0, res], ['Total', T.total], ['Passed', T.pass, ST.pass], ['Failed', T.fail, ST.fail], ['Blocked', T.blocked, ST.blocked], ['Not run', T.none, ST.none]].forEach(function (x) {
      put(sm, q, 1, x[0], { bold: true, box: true });
      put(sm, q, 2, x[1], x[2] ? { bold: true, color: x[2].ink, fill: x[2].fill, box: true } : { bold: true, box: true });
      sm.getCell(q, 2).alignment = { horizontal: 'left', vertical: 'top' };
      if (x[0] === 'Overall pass rate') sm.getCell(q, 2).numFmt = '0%';
      q++;
    });
    q++;
    var hr = q;
    ['#', 'Test case (click to jump)', 'Status', 'Remarks'].forEach(function (t, k) { put(sm, hr, k + 1, t, { bold: true, fill: true, box: true }); });
    q++;
    model.cases.forEach(function (c, i) {
      var s = st(c.status), t = firstLine(c.title, 160);
      put(sm, q, 1, i + 1, { box: true }); sm.getCell(q, 1).alignment = { horizontal: 'left', vertical: 'top' };
      var lc = put(sm, q, 2, '', { box: true });
      setLink(lc, "#'Evidence'!A" + rowOf[i], label(i) + (t ? ': ' + t : ''));
      lc.alignment = { vertical: 'top', wrapText: true };
      put(sm, q, 3, s.label, { bold: true, color: s.ink, fill: s.fill, box: true });
      put(sm, q, 4, plain(c.notes), { box: true });
      q++;
    });
    sm.views = [{ showGridLines: false }];
    sm.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return wb;
  }

  /* ------------------------------------------------------------ HTML */
  function runHtml(r) {
    var s = esc(r.text).replace(/\n/g, '<br>');
    var st2 = [];
    if (r.c) st2.push('color:#' + r.c);
    if (r.bg) st2.push('background:#' + r.bg);
    if (st2.length) s = '<span style="' + st2.join(';') + '">' + s + '</span>';
    if (r.u) s = '<u>' + s + '</u>'; if (r.i) s = '<em>' + s + '</em>'; if (r.b) s = '<strong>' + s + '</strong>';
    return s;
  }
  function rsHtml(rs) { return (rs || []).map(runHtml).join(''); }
  function blocksHtml(blocks) {
    return (blocks || []).map(function (b) {
      if (b.t === 'p') { var h = rsHtml(b.items[0]); return h ? '<p>' + h + '</p>' : ''; }
      return '<' + b.t + '>' + b.items.map(function (it) { return '<li>' + rsHtml(it) + '</li>'; }).join('') + '</' + b.t + '>';
    }).join('');
  }
  function badge(s) { return '<span class="badge" style="background:#' + s.fill + ';color:#' + s.ink + '">' + esc(s.label) + '</span>'; }

  function buildBugHtml(model) {
    var BL = model.bugs || [], many = BL.length > 1, o = [];
    o.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(docTitle(model)) + '</title>');
    o.push('<style>body{font:15px/1.5 Calibri,"Segoe UI",Arial,sans-serif;color:#14212c;max-width:17.4cm;margin:28px auto;padding:0 16px}.k{color:#777;font-weight:700;font-size:12px;letter-spacing:.06em;margin:0}h1{font-size:22px;margin:2px 0 14px}h2{font-size:17px;margin:22px 0 6px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #9aa5b1;padding:4px 8px;text-align:left;vertical-align:top}th{background:#e7ecf1;width:17%;font-weight:700}p{margin:0 0 6px}ul,ol{margin:0 0 8px;padding-left:26px}.cap{margin:10px 0 4px}figure{margin:0 0 14px}img{display:block;width:100%;height:auto;border:1px solid #d2dae2}a{color:#0563c1}.bug{margin-top:36px;padding-top:8px;border-top:2px solid #9aa5b1;scroll-margin-top:12px}.back{margin-left:12px;font-size:12px;font-weight:400;letter-spacing:0}.sum{margin-top:8px}@media print{.bug{break-before:page;border-top:0}.back{display:none}}</style></head><body>');
    function sevStyle(k) { var sv = sev(k); return sv ? ' style="background:#' + sv.fill + ';color:#' + sv.ink + ';font-weight:700"' : ''; }
    if (many) {
      o.push('<p class="k" id="summary">BUG REPORT</p><h1>' + esc(docTitle(model)) + '</h1><p>' + esc(bugCountLine(BL)) + '</p>');
      o.push('<table class="sum"><thead><tr><th style="width:5%">#</th><th style="width:16%">Bug ID</th><th>Summary</th><th style="width:12%">Severity</th><th style="width:14%">Status</th></tr></thead><tbody>');
      BL.forEach(function (it, i) {
        var b = it.bug || {};
        o.push('<tr><td>' + (i + 1) + '</td><td>' + esc(b.id || '') + '</td><td><a href="#bug' + (i + 1) + '">' + esc(it.title || 'Untitled bug') + '</a></td><td' + sevStyle(b.severity) + '>' + esc(b.severity || '') + '</td><td>' + esc(b.status || '') + '</td></tr>');
      });
      o.push('</tbody></table>');
    }
    BL.forEach(function (it, n) {
      var b = it.bug || {};
      o.push(many ? '<section class="bug" id="bug' + (n + 1) + '"><p class="k">BUG ' + pad(n + 1) + ' <a class="back" href="#summary">↑ Back to summary</a></p><h1>' + esc(bugTitle(it)) + '</h1>'
        : '<p class="k">BUG REPORT</p><h1>' + esc(bugTitle(it)) + '</h1>');
      var fl = bugFields(b);
      if (fl.length) {
        o.push('<table>');
        for (var i = 0; i < fl.length; i += 2) {
          o.push('<tr>' + [fl[i], fl[i + 1]].map(function (f) {
            if (!f) return '<th></th><td></td>';
            return '<th>' + esc(f[0]) + '</th><td' + (f[2] ? sevStyle(f[1]) : '') + '>' + esc(f[1] || '') + '</td>';
          }).join('') + '</tr>');
        }
        o.push('</table>');
      }
      bugSections(b).forEach(function (sec) { o.push('<h2>' + esc(sec[0]) + '</h2>' + blocksHtml(sec[1])); });
      if ((it.shots || []).length) o.push('<h2>Evidence</h2>');
      (it.shots || []).forEach(function (sh) {
        o.push('<figure>' + (sh.caption ? '<p class="cap">' + esc(sh.caption) + '</p>' : '') + '<img alt="' + esc(sh.caption || 'Bug screenshot') + '" width="' + sh.w + '" height="' + sh.h + '" src="data:image/jpeg;base64,' + sh.b64 + '"></figure>');
      });
      if (many) o.push('</section>');
    });
    o.push('</body></html>');
    return o.join('');
  }
  function buildHtml(model) {
    if (model.type === 'bug') return buildBugHtml(model);
    var o = [], T = tally(model.cases), res = RESULT[T.result];
    o.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(model.title || 'Test Evidence Document') + '</title>');
    o.push('<style>html{scroll-behavior:smooth}body{font:15px/1.5 Calibri,"Segoe UI",Arial,sans-serif;color:#14212c;max-width:17.4cm;margin:28px auto;padding:0 16px}h1{font-size:22px;margin:0 0 6px}h2{font-size:17px;margin:22px 0 6px}.tk{font-size:16px;font-weight:700;margin:0 0 6px}.meta{color:#555;margin:0 0 14px}.badge{display:inline-block;border-radius:4px;padding:1px 9px;font-weight:700;font-size:13px}.counts{color:#555;margin:6px 0 10px}table{border-collapse:collapse;width:100%;margin:6px 0 10px}th,td{border:1px solid #9aa5b1;padding:4px 8px;text-align:left;vertical-align:top}th{background:#e7ecf1}td.n{width:42px}td.s{width:96px;white-space:nowrap}a{color:#0563c1}.case{margin:30px 0 0;padding-top:4px;scroll-margin-top:12px}.case h3{font-size:16px;margin:0 0 4px}.case h3 span.t{font-weight:400}.stat{margin:4px 0 8px}.back{margin-left:12px;font-size:13px}p{margin:0 0 6px}ul,ol{margin:0 0 8px;padding-left:26px}.data{margin:0 0 8px}.cap{margin:10px 0 4px}figure{margin:0 0 14px}img{display:block;width:100%;height:auto;border:1px solid #d2dae2}@media print{body{margin:0}.back{display:none}}</style></head><body>');
    o.push('<h1>' + esc(model.title || 'Test Evidence Document') + '</h1>');
    if (model.ticket) o.push('<p class="tk">' + esc(model.ticket) + '</p>');
    var ml = metaLine(model.meta); if (ml) o.push('<p class="meta">' + esc(ml) + '</p>');
    o.push('<h2 id="summary">Summary</h2><p>Overall: ' + badge({ label: T.rate + '% passed', fill: res.fill, ink: res.ink }) + '</p><p class="counts">' + esc(summaryLine(T)) + '</p>');
    o.push('<table><thead><tr><th>#</th><th>Test case</th><th>Status</th></tr></thead><tbody>');
    model.cases.forEach(function (c, i) {
      var t = firstLine(c.title);
      o.push('<tr><td class="n">' + (i + 1) + '</td><td><a href="#tc' + (i + 1) + '">' + esc(label(i) + (t ? ': ' + t : '')) + '</a></td><td class="s" style="background:#' + st(c.status).fill + '">' + badge(st(c.status)) + '</td></tr>');
    });
    o.push('</tbody></table>');
    model.cases.forEach(function (c, i) {
      var tb = c.title || [], first = '', rest = tb;
      if (tb.length && tb[0].t === 'p') { first = rsHtml(tb[0].items[0]); rest = tb.slice(1); }
      o.push('<section class="case" id="tc' + (i + 1) + '"><h3>' + esc(label(i)) + ': <span class="t">' + first + '</span></h3>' + blocksHtml(rest));
      o.push('<p class="stat">Status: ' + badge(st(c.status)) + '<a class="back" href="#summary">↑ Back to summary</a></p>');
      if (hasText(c.data)) o.push('<div class="data"><strong>Test data:</strong> ' + blocksHtml(c.data) + '</div>');
      var pr = params(c);
      if (pr.length) o.push('<table><thead><tr><th style="width:40%">Field</th><th>Value</th></tr></thead><tbody>' + pr.map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</tbody></table>');
      if (hasText(c.notes)) o.push('<p><strong>Remarks:</strong></p>' + blocksHtml(c.notes));
      (c.shots || []).forEach(function (sh) {
        o.push('<figure>' + (sh.caption ? '<p class="cap">' + esc(sh.caption) + '</p>' : '') + '<img alt="' + esc(sh.caption || label(i) + ' screenshot') + '" width="' + sh.w + '" height="' + sh.h + '" src="data:image/jpeg;base64,' + sh.b64 + '"></figure>');
      });
      o.push('</section>');
    });
    o.push('</body></html>');
    return o.join('');
  }

  var api = { buildDocx: buildDocx, buildXlsx: buildXlsx, buildHtml: buildHtml, tally: tally, STATUS: ST, SEV: SEV, plain: plain, firstLine: firstLine, label: label };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Exporters = api;
})(typeof window !== 'undefined' ? window : globalThis);
