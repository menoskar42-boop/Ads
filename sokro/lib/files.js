'use strict';

// Turn an uploaded file into something the model can read:
//   { text, images:[dataUrl] }
// - text files → their text
// - images → a data URL for vision
// - .docx → text pulled out of word/document.xml
// - .zip → recurse over entries (text joined, images collected, .docx read)
// PDFs/other binaries aren't parsed (returned empty → caller shows a clear note).
const { unzipEntries } = require('./zip');

const TEXT_EXT = /\.(txt|csv|md|markdown|json|log|html?|xml|yml|yaml|js|ts|css|ini|conf|tsv|srt|vtt)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

function ext(name) { const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim(); }

function docxText(buf) {
  try {
    const entries = unzipEntries(buf);
    const doc = entries.find((e) => e.name === 'word/document.xml');
    return doc ? stripTags(doc.data.toString('utf8')).slice(0, 60000) : '';
  } catch (_) { return ''; }
}

function extract(name, buf, depth = 0) {
  const out = { text: '', images: [] };
  const e = ext(name);
  if (IMG_EXT.test(name)) {
    out.images.push('data:' + (IMG_MIME[e] || 'image/png') + ';base64,' + buf.toString('base64'));
    return out;
  }
  if (e === 'docx') { out.text = docxText(buf); return out; }
  if (TEXT_EXT.test(name)) { out.text = buf.toString('utf8').slice(0, 60000); return out; }
  if (e === 'zip' && depth < 1) {
    let entries = [];
    try { entries = unzipEntries(buf); } catch (_) { return out; }
    const parts = [];
    for (const en of entries) {
      const sub = extract(en.name, en.data, depth + 1);
      if (sub.text) parts.push('### ' + en.name + '\n' + sub.text);
      for (const im of sub.images) { if (out.images.length < 6) out.images.push(im); }
      if (parts.join('\n').length > 60000) break;
    }
    out.text = parts.join('\n\n').slice(0, 60000);
    return out;
  }
  return out; // unsupported (pdf/binary)
}

module.exports = { extract };
