#!/usr/bin/env node
/**
 * Five ways the gym's own numbers were wrong about its own members.
 *
 * **The dashboard counted subscriptions, not people.** The cards say "members".
 * They counted rows in `gym_memberships`, so a member who had renewed three
 * times was three — a gym of forty read as a hundred and twenty. And the same
 * person appeared in "active" AND in "expired" at once, because last year's row
 * is still sitting beside this year's. The more loyal the member, the more they
 * inflated it.
 *
 * **A membership code identified more than one member.** Check-in looked it up
 * with `LIMIT 1` against a column nothing kept unique, so it logged one
 * person's attendance against another and read the wrong subscription's expiry
 * to decide whether to let them in.
 *
 * **Attendance had no daily limit.** A member who stepped out for a phone call
 * and came back was two visits. Attendance is what decides whether a class is
 * worth running and whether a member is drifting away.
 *
 * **Freezing ate the days.** It flipped a status; the end date kept running. A
 * member who paid for thirty days and froze for ten came back to twenty.
 *
 * **Renewing while frozen threw the rest away** — the "stack onto remaining
 * days" query only looked at `status='active'`.
 *
 *   node scripts/check-gym-members.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const admin = code('src/routes/gym_admin.js');
const tenant = code('src/routes/tenant.js');
const schema = code('src/gym/schema.js');

/* ── The dashboard counts people ───────────────────────────────────────── */
{
  const q = (admin.match(/WITH latest AS \([\s\S]*?month_revenue/) || [''])[0];
  check('الأرقام بتتحسب من صف واحد لكل عضو', /DISTINCT ON \(member_id\)/.test(q));
  check('وأحدث اشتراك هو اللي بيحدّد حالته', /ORDER BY member_id, end_date DESC, id DESC/.test(q));
  check('والملغي مابيمثّلش العضو', /WHERE company_id=\$1 AND status <> 'cancelled'/.test(q));
  check('ومفيش عدّ على جدول الاشتراكات مباشرةً',
    !/COUNT\(\*\) FILTER \(WHERE status='active' AND end_date >= CURRENT_DATE\)\s*AS active/.test(admin));
  check('والمجمّد بيتعدّ وبيتعرض مش بيختفي من الشاشة',
    /FROM latest WHERE status='frozen'\) AS frozen/.test(q)
    && /stats\.frozen/.test(fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/dashboard.ejs'), 'utf8')));
  check('والإيراد لسه بيتحسب بالاشتراكات (ده فلوس مش ناس)',
    /SUM\(price\),0\) FROM gym_memberships[\s\S]{0,220}date_trunc\('month', CURRENT_DATE\)/.test(q));
}

/* ── One code, one member ──────────────────────────────────────────────── */
{
  check('فيه فهرس فريد لكود العضوية',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_member_code[\s\S]{0,180}\(company_id, lower\(btrim\(code\)\)\)/.test(schema));
  check('والكود الفاضي لسه مسموح (مش كل جيم بيصدر أكواد)',
    /WHERE code IS NOT NULL AND btrim\(code\) <> ''/.test(schema));
  /* Two different PEOPLE are behind duplicate codes. Merging them would make
     the problem permanent, so the later row simply loses its code. */
  check('والتكرار القديم بيتفضّى مش بيتدمج ولا بيتمسح',
    /UPDATE gym_members m SET code = NULL/.test(schema) && !/DELETE FROM gym_members/.test(schema));
  const fn = (tenant.match(/async function findGymMember[\s\S]*?\n\}/) || [''])[0];
  check('والبحث بالكود مابياخدش أول صف', !/AND code=\$2 LIMIT 1/.test(fn));
  /* A phone CANNOT be unique — a father and his son share one, and that is not
     a data error. So an ambiguous phone must refuse, not pick. */
  check('والموبايل المشترك بيرجع «مش واضح» بدل ما يخمّن',
    /return \{ ambiguous: true \}/.test(fn) && /LIMIT 2/.test(fn));
  check('وشاشة الحضور بتقول للعضو يدخل بالكود',
    /found\.ambiguous/.test(tenant) && /مسجّل لأكتر من عضو/.test(tenant));
}

/* ── One check-in a day ────────────────────────────────────────────────── */
{
  check('فيه عمود يوم مخزّن (لأن التحويل لتاريخ محلي مش IMMUTABLE)',
    /ALTER TABLE gym_attendance ADD COLUMN IF NOT EXISTS day DATE/.test(schema));
  check('وفهرس فريد لحضور واحد في اليوم',
    /idx_gym_one_checkin_per_day[\s\S]{0,160}\(company_id, member_id, day\)/.test(schema));
  check('والتسجيل بيكتب اليوم بتوقيت القاهرة',
    /VALUES \(\$1,\$2,\(now\(\) AT TIME ZONE 'Africa\/Cairo'\)::date\)/.test(tenant));
  check('والتكرار مش خطأ — بيقول للعضو إنه مسجّل خلاص',
    /ON CONFLICT \(company_id, member_id, day\) DO NOTHING RETURNING id/.test(tenant)
    && /متسجّل خلاص/.test(tenant));
  /* These rows carry no human decision — unlike a duplicate booking, which
     somebody actually made. Deleting them is what makes the number true. */
  check('والحضور المكرر القديم بيتشال (مفيهوش قرار بني آدم يتحفظ)',
    /DELETE FROM gym_attendance a/.test(schema));
}

/* ── The freeze gives the days back ────────────────────────────────────── */
{
  const fz = (admin.match(/router\.post\('\/members\/:id\/freeze'[\s\S]*?\n\}\);/) || [''])[0];
  check('التجميد بيسجّل يوم بدايته', /frozen_at = CASE WHEN status='frozen' THEN NULL ELSE CURRENT_DATE END/.test(fz));
  check('وفكّ التجميد بيزوّد الأيام اللي وقفت',
    /end_date \+ \(CURRENT_DATE - COALESCE\(frozen_at, CURRENT_DATE\)\)/.test(fz));
  check('والتلاتة في جملة واحدة (حالة اتحرّكت من غير تاريخها = الباج نفسه)',
    /SET status    = CASE[\s\S]{0,400}frozen_at = CASE/.test(fz));
  check('وبيتطبّق على اشتراك واحد مش على كل اشتراكات العضو',
    /WHERE id = \(\s*SELECT id FROM gym_memberships/.test(fz));
  check('والاشتراك اللي خلص وهو مجمّد لسه ينفع يتفكّ',
    /\(status='frozen' OR end_date >= CURRENT_DATE\)/.test(fz));
  check('وعمود التجميد موجود في المخطط',
    /ALTER TABLE gym_memberships ADD COLUMN IF NOT EXISTS frozen_at DATE/.test(schema));
}

/* ── Renewal keeps what is left ────────────────────────────────────────── */
{
  const sub = (admin.match(/router\.post\('\/members\/:id\/subscribe'[\s\S]*?\n\}\);/) || [''])[0];
  check('التجديد بيبني على تاريخ الانتهاء الحالي',
    /SELECT MAX\(end_date\) AS e FROM gym_memberships/.test(sub));
  check('والمجمّد أيامه بتتحسب في التجديد كمان',
    /status IN \('active','frozen'\) AND end_date >= CURRENT_DATE/.test(sub));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني أرقام الجيم عن أعضاءه مش مظبوطة.`
  : '\nالعدّ بالناس، والكود لعضو واحد، والحضور مرة في اليوم، والتجميد بيرجّع أيامه.');
process.exit(fail ? 1 : 0);
