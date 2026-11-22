'use strict';

// ── The agenda that gets built one sentence at a time ────────────────────────
//
// Meeting points arrive the way people actually think of them: «ضيف بند مراجعة
// الميزانية»، then twenty minutes later «وكمان موضوع الإجازات». Holding them in
// the conversation means they are re-read (and re-ordered, and occasionally
// lost) every turn, and printing the agenda at the end asks a model to remember
// a list nobody ever wrote down.
//
// So the points are rows, in order, and adding one is a small deterministic
// operation — no model in the path between «ضيف بند» and the list.
const ADD = [
  /^\s*(?:ضيف|اضف|أضف|زوّد|زود)\s+(?:بند|نقطة|موضوع)\s*[:：-]?\s*(.+)$/i,
  /^\s*(?:بند|نقطة|موضوع)\s+جديد\s*[:：-]?\s*(.+)$/i,
  /^\s*add\s+(?:item|point|topic)\s*[:-]?\s*(.+)$/i,
];
const DROP = [
  /^\s*(?:شيل|احذف|امسح)\s+(?:بند|نقطة|موضوع)\s*[:：-]?\s*(.+)$/i,
  /^\s*remove\s+(?:item|point)\s*[:-]?\s*(.+)$/i,
];

/** «ضيف بند: كذا» → the text of the point, or null. Never guesses. */
function parseAdd(text) {
  for (const re of ADD) { const m = String(text || '').match(re); if (m) return clean(m[1]); }
  return null;
}
function parseDrop(text) {
  for (const re of DROP) { const m = String(text || '').match(re); if (m) return clean(m[1]); }
  return null;
}

function clean(s) {
  return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').replace(/^[-–—•*]\s*/, '').slice(0, 200);
}

// Same point, typed twice: «الميزانية» and «الميزانيه » are one item, and an
// agenda that lists both is the reason people stop trusting it.
function key(text) {
  return clean(text).toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();
}

/**
 * Add a point to a list of points.
 *
 * Returns { items, added, why } — a duplicate is refused with a reason rather
 * than appended, because "I already have that one" is useful and a silent
 * no-op is not.
 */
function add(items, text) {
  const value = clean(text);
  const list = Array.isArray(items) ? items.slice() : [];
  if (!value || value.length < 2) return { items: list, added: false, why: 'empty' };
  if (list.some((i) => key(i.text) === key(value))) return { items: list, added: false, why: 'duplicate' };
  list.push({ text: value, position: list.length + 1, done: false });
  return { items: renumber(list), added: true, why: null };
}

function drop(items, text) {
  const k = key(text);
  const list = (Array.isArray(items) ? items : []).filter((i) => key(i.text) !== k);
  return { items: renumber(list), removed: list.length !== (items || []).length };
}

/** Positions are 1..n with no gaps — a list with an item 4 and no item 3 reads
 *  as something lost. */
function renumber(items) {
  return (items || []).map((i, idx) => Object.assign({}, i, { position: idx + 1 }));
}

function move(items, from, to) {
  const list = (items || []).slice();
  const i = list.findIndex((x) => x.position === from);
  if (i < 0 || to < 1 || to > list.length) return renumber(list);
  const [row] = list.splice(i, 1);
  list.splice(to - 1, 0, row);
  return renumber(list);
}

/** The agenda as a person would read it out. */
function render(agenda, items) {
  const head = [(agenda && agenda.title) || 'الأجندة'];
  if (agenda && agenda.when_at) head.push(String(agenda.when_at).slice(0, 16).replace('T', ' '));
  const body = renumber(items).map((i) => `${i.position}. ${i.text}${i.done ? ' ✓' : ''}`);
  return head.join(' — ') + (body.length ? '\n' + body.join('\n') : '\n(لسه فاضية)');
}

module.exports = { parseAdd, parseDrop, add, drop, move, renumber, render, key, clean };
