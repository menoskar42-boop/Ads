#!/usr/bin/env node
/**
 * An agenda that only existed in the transcript.
 *
 * Meeting points arrive the way people think of them: «ضيف بند مراجعة
 * الميزانية», then twenty minutes later «وكمان موضوع الإجازات». Held in the
 * conversation, they get re-read every turn — re-ordered, occasionally lost —
 * and printing the agenda at the end asks a model to remember a list nobody
 * ever wrote down.
 *
 * Now the points are rows, and the path from «ضيف بند» to the list has no model
 * in it at all. Three rules the meeting depends on:
 *
 *   · **the same point cannot be on the list twice** — that is what makes
 *     people stop trusting a list, and it is enforced by a unique index rather
 *     than by a check in code that two taps can race past;
 *   · **positions are 1..n with no gaps** — an agenda with a 4 and no 3 reads
 *     as something lost;
 *   · **«دي عندي خلاص» is an answer** — a tap that silently does nothing is
 *     indistinguishable from one that failed.
 *
 *   node scripts/check-agenda.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = require('../sokro/agenda');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── Reading the sentence, without a model ─────────────────────────────── */
{
  check('«ضيف بند: كذا» بتتقرا', A.parseAdd('ضيف بند: مراجعة الميزانية') === 'مراجعة الميزانية');
  check('و«اضف نقطة كذا»', A.parseAdd('اضف نقطة الإجازات') === 'الإجازات');
  check('و«موضوع جديد: كذا»', A.parseAdd('موضوع جديد: التسعير') === 'التسعير');
  check('وبالإنجليزي', A.parseAdd('add item: hiring') === 'hiring');
  check('وجملة عادية مش بند', A.parseAdd('عايز أحجز قطار') === null);
  check('والشيل كمان', A.parseDrop('شيل بند الإجازات') === 'الإجازات');
  check('والشرطة في أول البند بتتشال', A.parseAdd('ضيف بند: - التسعير') === 'التسعير');
}

/* ── The list ──────────────────────────────────────────────────────────── */
{
  let r = A.add([], 'مراجعة الميزانية');
  check('البند الأول بيتضاف', r.added && r.items.length === 1 && r.items[0].position === 1);
  r = A.add(r.items, 'الإجازات');
  check('والتاني وراه', r.items.length === 2 && r.items[1].position === 2);

  const dup = A.add(r.items, 'مراجعه الميزانيه');
  check('ونفس البند بإملاء مختلف مابيتكررش', dup.added === false && dup.why === 'duplicate');
  check('والسبب بيرجع عشان يتقال', dup.why === 'duplicate');
  check('والفاضي مش بند', A.add(r.items, '  ').why === 'empty');
  // Different words in a different order are a different point — merging them
  // would lose one, which is worse than listing two.
  check('وبند تاني بترتيب كلمات مختلف مش مكرر', A.add(r.items, 'الميزانية والتسعير').added === true);

  const gone = A.drop(r.items, 'مراجعة الميزانية');
  check('والشيل بيرقّم من أول', gone.items.length === 1 && gone.items[0].position === 1);

  const moved = A.move(r.items, 2, 1);
  check('والترتيب بيتغيّر من غير فجوات',
    moved.map((i) => i.position).join(',') === '1,2' && moved[0].text === 'الإجازات');
  check('والحركة لمكان مش موجود مابتكسرش', A.move(r.items, 1, 9).length === 2);
}

/* ── The way it reads out ──────────────────────────────────────────────── */
{
  // Real points: a single character is refused as a typo, not stored.
  const items = A.add(A.add([], 'الميزانية').items, 'الإجازات').items;
  const txt = A.render({ title: 'اجتماع الاتنين', when_at: '2026-09-05T10:00:00Z' }, items);
  check('العرض فيه العنوان والميعاد', /اجتماع الاتنين/.test(txt) && /2026-09-05 10:00/.test(txt));
  check('والبنود مرقّمة', /1\. الميزانية/.test(txt) && /2\. الإجازات/.test(txt), txt.replace(/\n/g, ' | '));
  check('والفاضية بتقول إنها فاضية', /لسه فاضية/.test(A.render({ title: 'x' }, [])));
  const done = A.render({ title: 'x' }, [{ text: 'الميزانية', position: 1, done: true }]);
  check('واللي خلص عليه علامة', /الميزانية ✓/.test(done));
  check('وحرف واحد مش بند', A.add([], 'أ').added === false);
}

/* ── Where it lives ────────────────────────────────────────────────────── */
{
  const schema = code('sokro/schema.js');
  check('فيه جدول أجندات وبنود',
    /CREATE TABLE IF NOT EXISTS sokro_agendas/.test(schema) && /CREATE TABLE IF NOT EXISTS sokro_agenda_items/.test(schema));
  // The rule that two taps cannot race past.
  check('والتكرار ممنوع بفهرس فريد مش بفحص في الكود',
    /CREATE UNIQUE INDEX IF NOT EXISTS sokro_agenda_item_once[\s\S]{0,120}\(agenda_id, item_key\)/.test(schema));

  const st = code('sokro/agenda/store.js');
  check('والإضافة بتعتمد على الفهرس', /ON CONFLICT \(agenda_id, item_key\) DO NOTHING/.test(st));
  check('والإضافة متقيّدة بصاحب الأجندة في نفس الجملة',
    /WHERE EXISTS \(SELECT 1 FROM sokro_agendas WHERE id=\$1 AND user_id=\$2\)/.test(st));
  check('وكل قراية وكتابة متقيّدة بالمستخدم',
    (st.match(/user_id=\$\d/g) || []).length >= 6);
  check('وإعادة الترقيم في جملة واحدة', /ROW_NUMBER\(\) OVER \(ORDER BY position, id\)/.test(st));

  const router = code('sokro/router.js');
  check('وفيه راوتات للأجندة', /router\.get\('\/api\/agenda'/.test(router) && /router\.post\('\/api\/agenda\/:id/.test(router));
  check('والمكرر بيرجع برسالة مش بصمت', /البند ده موجود في الأجندة خلاص/.test(router));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني بند ممكن يتكرر أو يضيع من الأجندة.`
  : '\nالبنود صفوف مرقّمة: مفيش تكرار، مفيش فجوة، واللي موجود بيتقال.');
process.exit(fail ? 1 : 0);
