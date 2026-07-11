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

function build(format, payload) {
  switch (String(format || 'md').toLowerCase()) {
    case 'xlsx': case 'excel': return toExcel(payload);
    case 'csv': return toCSV(payload);
    case 'json': return toJSON(payload);
    default: return toMarkdown(payload);
  }
}

module.exports = { build, toMarkdown, toCSV, toJSON, toExcel };
