#!/usr/bin/env node
/**
 * Somebody is standing at the desk.
 *
 * Whoever is on reception has one question — "can this person come in?" — and
 * about two seconds to answer it with a queue building behind them. The members
 * screen answers it eventually: search, open a file, read a table, work out
 * whether a date is in the past. At eight in the morning nobody does that, so
 * they wave people through and the gym stops knowing who is inside.
 *
 * The desk screen answers it in one box and one colour. What this check holds:
 *
 *   · **one input, no mode.** A QR scanner types the membership code and
 *     presses Enter, so a scan and a typed code are the same thing by design.
 *     A phone, a code and a name all go in the same box.
 *   · **the verdict is loud and honest.** "Expired" must be unmissable across a
 *     counter; "ends in three days" must be visible without being alarming —
 *     that conversation at the desk is worth more than a reminder next week.
 *   · **the button obeys the membership, not the render.** A page left open
 *     while a subscription lapsed must not let somebody in.
 *   · **and there is an undo.** A mis-scan at a busy desk is normal. If fixing
 *     it needs the reports screen, people learn to ignore the software — but
 *     the undo is for the tap that just happened, not for editing history.
 *
 *   node scripts/check-gym-desk.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const D = require('../src/gym/desk');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const NOW = new Date('2026-09-05T10:00:00Z');

/* ── One box ───────────────────────────────────────────────────────────── */
{
  check('الرقم بيتعرف كموبايل', D.classify('01001234567').kind === 'phone');
  check('وبالأرقام العربية', D.classify('٠١٠٠١٢٣٤٥٦٧').value === '01001234567');
  check('والمسافات في الرقم مابتفرقش', D.classify('0100 123 4567').value === '01001234567');
  // A scanner types the code and hits Enter: same box, same handling.
  check('والكود (اللي الماسح بيكتبه) بيتعرف كود', D.classify('GYM-1042').kind === 'code');
  check('والاسم بيتعرف اسم', D.classify('أحمد محمد').kind === 'name');
  check('والفاضي مش بحث', D.classify('  ').kind === 'empty');
}

/* ── The verdict ───────────────────────────────────────────────────────── */
{
  const st = (m) => D.statusOf(m, NOW);
  check('الشغّال شغّال', st({ end_date: '2026-12-01', status: 'active' }).state === 'active');
  check('وبيقول باقي كام يوم', st({ end_date: '2026-12-01', status: 'active' }).daysLeft === 87);
  check('واللي قرّب يخلص ليه حالة لوحده', st({ end_date: '2026-09-08', status: 'active' }).state === 'expiring');
  check('واللي خلص خلص', st({ end_date: '2026-08-01', status: 'active' }).state === 'expired');
  check('والمتجمّد متجمّد', st({ end_date: '2026-12-01', frozen_at: '2026-09-01' }).state === 'frozen');
  check('ومفيش اشتراك حالة برضه', st(null).state === 'none');
  // The desk can always override in person; what it must not do is guess wrong
  // in a way that looks certain.
  check('واللي مش مفهوم بيتقال إنه مش مفهوم', st({ end_date: 'كذا' }).state === 'unknown');
  check('والخلص مايدخلش', D.mayEnter(st({ end_date: '2026-08-01', status: 'active' })) === false);
  check('والمتجمّد مايدخلش', D.mayEnter(st({ end_date: '2026-12-01', frozen_at: 'x' })) === false);
  check('واللي قرّب يخلص بيدخل عادي', D.mayEnter(st({ end_date: '2026-09-08', status: 'active' })) === true);
  check('واللي مش مفهوم بيدخل (مانوقفوش حد على شك)', D.mayEnter(st({ end_date: 'كذا' })) === true);
  check('والألوان: خلص = وقف، قرّب = تنبيه، شغّال = تمام',
    D.alertFor(st({ end_date: '2026-08-01' })).tone === 'stop'
    && D.alertFor(st({ end_date: '2026-09-08', status: 'active' })).tone === 'warn'
    && D.alertFor(st({ end_date: '2026-12-01', status: 'active' })).tone === 'ok');
}

/* ── The undo window ───────────────────────────────────────────────────── */
{
  check('التراجع متاح بعد التسجيل على طول',
    D.canUndo({ checked_in_at: new Date(NOW.getTime() - 60000) }, NOW) === true);
  check('ومش متاح بعد الوقت', D.canUndo({ checked_in_at: new Date(NOW.getTime() - 3600000) }, NOW) === false);
  check('ومن غير صف مفيش تراجع', D.canUndo(null, NOW) === false);
}

/* ── The screen ────────────────────────────────────────────────────────── */
{
  const tpl = fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/desk.ejs'), 'utf8');
  const row = (latest, today) => {
    const status = D.statusOf(latest, NOW);
    return { member: { id: 1, name: 'أحمد', phone: '01001234567', code: 'G1', latest }, status,
      alert: D.alertFor(status), mayEnter: D.mayEnter(status), today: today || null, canUndo: D.canUndo(today, NOW) };
  };
  const render = (data) => ejs.render(tpl, Object.assign(
    { company: { company_name: 'جيم', id: 1 }, tab: 'desk', done: null, err: null, UNDO_MINUTES: D.UNDO_MINUTES, q: '', rows: [] }, data),
  { filename: path.join(ROOT, 'src/views/gym_admin/desk.ejs') });

  const active = render({ q: 'أحمد', rows: [row({ end_date: '2026-12-01', status: 'active', plan_name: 'شهري' })] });
  check('الشاشة بتتعرض', /الاستقبال/.test(active));
  check('والحكم بيتكتب بالبنط العريض', /الاشتراك شغّال/.test(active));
  // Three, not four: every extra button is a decision at a counter with
  // somebody waiting, and the fourth is the one pressed by mistake.
  const actions = (html) => {
    // Only the card's action row — the search button and the layout's own links
    // are not decisions the desk makes about THIS member.
    const i = html.indexOf('<div class="flex flex-wrap gap-2">');
    if (i < 0) return 0;
    const block = html.slice(i, html.indexOf('</div>\n  </div>', i) + 1);
    return (block.match(/<(?:button|a)\b/g) || []).length;
  };
  check('وتلات أزرار بس على الكارت', actions(active) === 3, actions(active) + ' زرار');
  check('وحتى لما يكون داخل النهارده', actions(render({ q: 'أحمد', rows: [row({ end_date: '2026-12-01', status: 'active' }, { id: 9, checked_in_at: new Date(NOW.getTime() - 60000) })] })) === 3);

  const expired = render({ q: 'أحمد', rows: [row({ end_date: '2026-08-01', status: 'active' })] });
  check('واللي خلص بيبان بالأحمر', /bg-red-600/.test(expired) && /الاشتراك خلص/.test(expired));
  check('وزرار الدخول بيبقى مقفول', /disabled/.test(expired));

  const soon = render({ q: 'أحمد', rows: [row({ end_date: '2026-09-08', status: 'active' })] });
  check('واللي قرّب يخلص بيقول باقي كام يوم', /بيخلص خلال 3 يوم/.test(soon));

  const inToday = render({ q: 'أحمد', rows: [row({ end_date: '2026-12-01', status: 'active' }, { id: 9, checked_in_at: new Date(NOW.getTime() - 60000) })] });
  check('واللي داخل النهارده بيبان', /داخل النهارده/.test(inToday));
  check('وبيظهرله زرار تراجع', /تراجع/.test(inToday) && /desk\/undo/.test(inToday));
  check('ومابيتسجّلش تاني', !/desk\/checkin/.test(inToday));

  check('والبحث بيركّز لوحده (عشان الماسح يشتغل من غير ما حد يلمس)', /autofocus/.test(tpl));
  check('ومفيش نتيجة = جملة مفيدة مش صفحة فاضية', /مالقيناش حد/.test(render({ q: 'x', rows: [] })));
}

/* ── The route decides, not the page ───────────────────────────────────── */
{
  const g = code('src/routes/gym_admin.js');
  check('فيه راوت للاستقبال', /router\.get\('\/desk'/.test(g));
  check('والتسجيل بيسأل الاشتراك من الأول',
    /if \(!DESK\.mayEnter\(DESK\.statusOf\(m, new Date\(\)\)\)\) return res\.redirect\(back \+ '&err=expired'\)/.test(g));
  check('والتسجيل مرة واحدة في اليوم بقرار من الفهرس',
    /ON CONFLICT \(company_id, member_id, day\) DO NOTHING RETURNING id/.test(g));
  check('والعضو لازم يبقى بتاع الجيم ده',
    /WHERE EXISTS \(SELECT 1 FROM gym_members WHERE id=\$2 AND company_id=\$1\)/.test(g));
  check('والتراجع متقيّد بالوقت وبالجيم',
    /DELETE FROM gym_attendance[\s\S]{0,200}WHERE id=\$1 AND company_id=\$2[\s\S]{0,140}now\(\) - \(\$3 \|\| ' minutes'\)::interval/.test(g));
  check('والرسايل أكواد معروفة مش كلام الرابط',
    /\['in', 'already', 'undone'\]\.includes\(req\.query\.done\)/.test(g) && /\['expired', 'gone', 'late'\]\.includes\(req\.query\.err\)/.test(g));
  check('والشاشة في القايمة الجانبية',
    /\['desk','الاستقبال','\/gym\/desk'/.test(fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/_layout_top.ejs'), 'utf8')));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني الاستقبال ممكن يدخّل حد مشتركه خلص، أو مايعرفش يتراجع عن غلطة.`
  : '\nخانة واحدة، حكم بلون واضح، تلات أزرار، وتراجع للغلطة اللي لسه حاصلة.');
process.exit(fail ? 1 : 0);
