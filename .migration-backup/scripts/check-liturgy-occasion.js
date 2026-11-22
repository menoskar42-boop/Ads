#!/usr/bin/env node
/**
 * مناسبة اليوم في شاشة القداس لازم تكون صح — كل يوم في السنة.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: شرط صوم الرسل كان
 * `if (diff >= 50) { if (!(cm === 11 && cd >= 5)) return 'apostles-fast'; }`
 * — يعني أي يوم بعد العنصرة بـ٥٠ يوم أو أكتر، والاستثناء الوحيد أبيب من
 * ٥. النتيجة إن **من العنصرة لآخر السنة الميلادية** الشاشة كانت بتقول
 * «صوم الرسل»: في عيد الصليب، وفي صوم العذراء، وفي عيدها، وطول شهر
 * كيهك كله. والشمامسة بياخدوا مردات وألحان المناسبة الغلط في القداس.
 *
 * وتلات أغلاط تانية على نفس الشاشة:
 *   · الجلسة كانت بترجع `seasonalLitany: 'weather'` كقيمة افتراضية،
 *     والواجهة بتعمل `?? detect()` — فالاكتشاف عمره ما اشتغل والشاشة
 *     كانت بتقول «هيتينية الأهوية» طول السنة.
 *   · أول ما الاكتشاف يكتب مناسبة في الجلسة، تاني يوم بتتحسب «اختيار
 *     المشغّل» وتفضل معروضة بعد ما المناسبة تعدّي.
 *
 * الفحص بيمشي على **سنة قبطية كاملة** (٣٦٦ يوم) وبينفّذ `detectOccasion`
 * الحقيقية، ويقارن بجدول المناسبات المعروف. وبيتأكد كمان إن الجلسة
 * مابترجعش قيمة جاهزة بتمنع الاكتشاف، وإن اختيار امبارح مابيسربش لليوم.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYBIBLE = path.join(ROOT, 'mybible');
const OCCASION = path.join(MYBIBLE, 'client/src/lib/liturgy-occasion.ts');
const DAY = path.join(MYBIBLE, 'client/src/lib/liturgy-session-day.ts');
const ROUTES = path.join(MYBIBLE, 'server/routes.ts');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(OCCASION)) {
  console.log('⏭️  mybible مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}

function esbuildBin() {
  for (const p of [
    path.join(ROOT, 'node_modules/.bin/esbuild'),
    path.join(MYBIBLE, 'node_modules/.bin/esbuild'),
    '/tmp/tsx-tool/node_modules/.bin/esbuild',
  ]) if (fs.existsSync(p)) return p;
  return null;
}
const bin = esbuildBin();
if (!bin) {
  console.error('⚠️  esbuild مش متسطّب — الفحص ده مش قادر يقيس سلوك الدالة.');
  console.error('    ثبّته (npm i -D esbuild) وشغّل تاني. مش هعدّيه أخضر.');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'occasion-'));
const bundle = path.join(tmp, 'occ.mjs');
execFileSync(bin, [OCCASION, '--bundle', '--format=esm', `--outfile=${bundle}`, '--log-level=error']);

/* ── حالات معروفة، متأكَّدة من التقويم القبطي ─────────────────────────────
 * الفصح القبطي ٢٠٢٦ = ١٢ أبريل، فالعنصرة = ٣١ مايو. */
const CASES = [
  ['2026-04-12', 'resurrection',   'عيد القيامة'],
  ['2026-04-18', 'resurrection',   'سبت الفرح (آخر أسبوع الفرح)'],
  ['2026-04-19', 'pentecostal',    'أول الخماسين'],
  ['2026-05-21', 'ascension',      'عيد الصعود'],
  ['2026-05-31', 'pentecost',      'عيد العنصرة'],
  ['2026-06-01', 'apostles-fast',  'أول يوم في صوم الرسل'],
  ['2026-06-20', 'apostles-fast',  'وسط صوم الرسل'],
  ['2026-07-11', 'apostles-fast',  'آخر يوم في الصوم (٤ أبيب)'],
  ['2026-07-12', 'apostles-feast', 'عيد الرسل (٥ أبيب)'],
  ['2026-07-20', 'ordinary',       'بعد عيد الرسل — مش صوم'],
  ['2026-08-10', 'virgin-fast',    'صوم العذراء'],
  ['2026-08-22', 'virgin-feast',   'صعود جسد العذراء (١٦ مسرى)'],
  ['2026-09-18', 'ordinary',       'توت — يوم عادي (ده اللي المالك شافه غلط)'],
  ['2026-09-27', 'cross',          'عيد الصليب (١٧ توت)'],
  ['2026-10-25', 'ordinary',       'بابة — يوم عادي'],
  ['2026-12-20', 'kiahk',          'شهر كيهك'],
  ['2027-01-07', 'nativity',       'عيد الميلاد (٢٩ كيهك)'],
  ['2027-01-19', 'epiphany',       'عيد الغطاس (١١ طوبة)'],
  ['2027-02-15', 'presentation',   'دخول الهيكل (٨ أمشير)'],
];

const probe = path.join(tmp, 'probe.mjs');
fs.writeFileSync(probe, `
const o = await import(${JSON.stringify('file://' + bundle)});
const cases = ${JSON.stringify(CASES)};
const out = { cases: [], fastRun: [], labels: Object.keys(o.OCCASION_LABELS).length };
for (const [iso, want, label] of cases) {
  const got = o.detectOccasion(new Date(iso + 'T12:00:00'));
  out.cases.push({ iso, want, got, label });
}
// امشِ على سنة كاملة وسجّل كل يوم رجع فيه «صوم الرسل»
const start = new Date('2026-01-01T12:00:00');
for (let i = 0; i < 366; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  if (o.detectOccasion(d) === 'apostles-fast') out.fastRun.push(d.toISOString().slice(0, 10));
}
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`, 'utf8');

let res;
try {
  const raw = execFileSync(process.execPath, ['--no-warnings', probe], { maxBuffer: 1 << 24 }).toString('utf8');
  res = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
} catch (e) {
  console.error('⚠️  مش قادر أشغّل detectOccasion: ' + String(e.stderr || e.message).split('\n')[0]);
  process.exit(1);
}

for (const c of res.cases) {
  if (c.got !== c.want) {
    fail(`${c.iso} (${c.label}) رجع «${c.got}» والمفروض «${c.want}»`);
  }
}

/* ── صوم الرسل لازم يكون **فترة واحدة متصلة** طولها معقول ─────────────── */
{
  const days = res.fastRun;
  if (!days.length) {
    fail('مفيش ولا يوم في ٢٠٢٦ رجع «صوم الرسل» — الصوم اختفى خالص.');
  } else {
    // أطول صوم رسل ممكن ~٤٩ يوم (لما الفصح يبقى بدري)، وأقصر ~١٥
    if (days.length > 60) {
      fail(`«صوم الرسل» طلع ${days.length} يوم في السنة — ده مستحيل. `
        + `أول يوم ${days[0]} وآخر يوم ${days[days.length - 1]}. `
        + 'الشرط بيبلع مناسبات تانية (الصليب · صوم العذراء · كيهك).');
    }
    // متصلة: مفيش فجوة
    for (let i = 1; i < days.length; i++) {
      const gap = (new Date(days[i]) - new Date(days[i - 1])) / 86400000;
      if (gap !== 1) {
        fail(`«صوم الرسل» متقطّع: فجوة بين ${days[i - 1]} و${days[i]} — الصوم فترة واحدة متصلة.`);
        break;
      }
    }
  }
}

/* ── الجلسة مابترجعش قيمة جاهزة بتمنع الاكتشاف ───────────────────────── */
{
  const routes = fs.readFileSync(ROUTES, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const def = /function makeDefaultSession[\s\S]*?\n  \}/.exec(routes);
  if (!def) {
    fail('مالقيتش `makeDefaultSession` في routes.ts — الفحص مش قادر يقيس.');
  } else {
    for (const [field, label] of [['seasonalLitany', 'هيتينية الموسم'], ['occasion', 'مناسبة اليوم']]) {
      const m = new RegExp(`${field}:\\s*([^,}]+)`).exec(def[0]);
      if (!m) { fail(`\`${field}\` مش موجود في الجلسة الافتراضية.`); continue; }
      if (m[1].trim() !== 'null') {
        fail(`الجلسة الافتراضية بترجّع \`${field}: ${m[1].trim()}\` — قيمة جاهزة `
          + `شكلها اختيار، فالواجهة بتحترمها ومابتكتشفش ${label} من التاريخ أبداً. `
          + 'خلّيها `null`.');
      }
    }
  }
}

/* ── اختيار امبارح مايسربش لليوم ──────────────────────────────────────── */
if (!fs.existsSync(DAY)) {
  fail('`liturgy-session-day.ts` مش موجود — من غيره مناسبة امبارح بتفضل معروضة النهارده.');
} else {
  const p2 = path.join(tmp, 'day.mjs');
  execFileSync(bin, [DAY, '--bundle', '--format=esm', `--outfile=${p2}`, '--log-level=error']);
  const probe2 = path.join(tmp, 'probe2.mjs');
  fs.writeFileSync(probe2, `
const m = await import(${JSON.stringify('file://' + p2)});
const now = new Date('2026-09-18T12:00:00Z');
process.stdout.write('@@JSON@@' + JSON.stringify({
  today:     m.choiceForToday('cross', now.getTime(), now),
  yesterday: m.choiceForToday('cross', new Date('2026-09-17T12:00:00Z').getTime(), now),
  noStamp:   m.choiceForToday('cross', undefined, now),
  none:      m.choiceForToday(null, now.getTime(), now),
}));
`, 'utf8');
  const raw2 = execFileSync(process.execPath, ['--no-warnings', probe2], { maxBuffer: 1 << 20 }).toString('utf8');
  const d = JSON.parse(raw2.slice(raw2.indexOf('@@JSON@@') + 8));
  if (d.today !== 'cross') fail('اختيار المشغّل النهارده اتلغى — المشغّل مش قادر يثبّت مناسبة.');
  if (d.yesterday !== null) fail('اختيار امبارح لسه معروض النهارده — المناسبة بتفضل بعد ما تعدّي.');
  if (d.noStamp !== null) fail('جلسة من غير تاريخ اتحسبت اختيار النهارده.');
  if (d.none !== null) fail('`null` رجع حاجة.');

  // والصفحتين بيستخدموه فعلاً
  for (const page of ['LiturgyControl.tsx', 'LiturgyDisplay.tsx']) {
    const src = fs.readFileSync(path.join(MYBIBLE, 'client/src/pages', page), 'utf8');
    if (!/choiceForToday\s*\(/.test(src)) {
      fail(`\`${page}\` مابيستخدمش \`choiceForToday\` — الحماية موجودة ومحدّش بيناديها.`);
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (process.exitCode) process.exit(1);
console.log(`✅ مناسبة القداس مضبوطة: ${res.cases.length} حالة معروفة · `
  + `صوم الرسل ${res.fastRun.length} يوم متصلين (${res.fastRun[0]} → ${res.fastRun[res.fastRun.length - 1]})`);
