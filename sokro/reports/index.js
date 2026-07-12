'use strict';

// ── Reports ──────────────────────────────────────────────────────────────────
// Turns a normalized payload ({ title, text, rows }) into a downloadable file.
// Excel uses the app's existing `xlsx` dependency (no new deps). Each builder
// returns { buffer, mime, ext }. PDF can be added later behind the same shape.
function toMarkdown(p) {
  const title = p.title ? '# ' + p.title + '\n\n' : '';
  let body = p.text || '';
  if (p.rows && p.rows.length) {
    body += '\n\n## المصادر\n' + p.rows.map((r, i) => `${i + 1}. ${r.title || ''}${r.url ? (' — ' + r.url) : ''}`).join('\n');
  }
  return { buffer: Buffer.from(title + body, 'utf8'), mime: 'text/markdown; charset=utf-8', ext: 'md' };
}

function toJSON(p) {
  return { buffer: Buffer.from(JSON.stringify(p, null, 2), 'utf8'), mime: 'application/json; charset=utf-8', ext: 'json' };
}

function toCSV(p) {
  const rows = p.rows || [];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  let out;
  if (rows.length) {
    const keys = Object.keys(rows[0]);
    out = keys.map(esc).join(',') + '\n' + rows.map((r) => keys.map((k) => esc(r[k])).join(',')).join('\n');
  } else {
    out = esc(p.text || '');
  }
  // Prepend a BOM so Excel opens Arabic UTF-8 correctly.
  return { buffer: Buffer.from('﻿' + out, 'utf8'), mime: 'text/csv; charset=utf-8', ext: 'csv' };
}

function toExcel(p) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  if (p.rows && p.rows.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(p.rows), 'Data');
  }
  if (p.text) {
    const lines = p.text.split('\n').map((l) => [l]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lines.length ? lines : [['']]), 'Report');
  }
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1');
  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Render the report as a clean RTL Arabic HTML document (used for PDF).
function renderHTML(p) {
  const rows = (p.rows || []).map((r, i) => `<li>${esc(r.title || '')}${r.url ? ` — <span class="u">${esc(r.url)}</span>` : ''}</li>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
<style>*{font-family:'Cairo',sans-serif}body{margin:0;padding:8px;color:#111;line-height:1.9}
h1{font-size:22px;margin:0 0 12px;border-bottom:2px solid #5b6cff;padding-bottom:8px}
.text{white-space:pre-wrap;font-size:13px}h2{font-size:15px;margin:18px 0 6px}
ul{margin:6px 0;padding-inline-start:20px}li{font-size:12px;margin-bottom:4px}.u{color:#2555c0}
.foot{margin-top:24px;color:#888;font-size:10px;border-top:1px solid #ddd;padding-top:6px}</style></head>
<body><h1>${esc(p.title || 'تقرير')}</h1><div class="text">${esc(p.text || '')}</div>
${rows ? `<h2>المصادر</h2><ul>${rows}</ul>` : ''}
<div class="foot">تقرير من Sokro — sokro.oscardevs.com</div></body></html>`;
}

// PDF via the browser layer (correct Arabic shaping). Throws a clear message if
// the engine isn't installed, so the caller can offer Markdown/Excel instead.
async function toPDF(p) {
  const browser = require('../browser');
  if (!browser.available()) throw new Error('PDF يحتاج محرّك المتصفح (Playwright) — استخدم Markdown أو Excel');
  const html = renderHTML(p);
  const buffer = await browser.withPage(async (page) => {
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => { await page.setContent(html, { waitUntil: 'domcontentloaded' }); });
    return page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' } });
  });
  return { buffer, mime: 'application/pdf', ext: 'pdf' };
}

function build(format, payload) {
  switch (String(format || 'md').toLowerCase()) {
    case 'xlsx': case 'excel': return toExcel(payload);
    case 'csv': return toCSV(payload);
    case 'json': return toJSON(payload);
    default: return toMarkdown(payload);
  }
}

module.exports = { build, toMarkdown, toCSV, toJSON, toExcel, toPDF, renderHTML };
