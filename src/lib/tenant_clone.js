'use strict';

// ── نسخ مستأجر كامل (البند ١٠٨ — سانّدبوكس الديمو) ──────────────────────────
//
// المالك اختار الطريقة (أ): كل زائر ياخد **نسخته هو** من الشركة التجريبية،
// يعدّل فيها براحته، وتتمسح بعد مدة.
//
// ── ليه الملف ده تخطيط مش تنفيذ ─────────────────────────────────────────
//
// النسخ بيلمس **٢٠٣ جدول** فيهم `company_id`. الكود اللي بيكتب في ٢٠٣ جدول
// ومحدش شغّله ولا مرة أخطر من إنه ماينكتبش أصلاً: غلطة واحدة في إعادة ربط
// المفاتيح معناها صف بيتكتب في مستأجر **حقيقي**.
//
// فالجزء الخطر هنا **دالة صافية**: بتاخد وصف المخطط وبتطلّع خطة النسخ
// (الترتيب · الأعمدة · إعادة الربط · تصادم الـUNIQUE). الحارس
// (`scripts/check-tenant-clone.js`) بيشغّلها على مخطط حقيقي الشكل وبيتأكّد من
// الخصائص الخطرة قبل ما أي حاجة تلمس قاعدة بيانات.
//
// ── الأربع قواعد اللي الخطة قايمة عليهم ─────────────────────────────────
//
// ١) **كل صف متنسوخ بياخد `company_id` الجديد.** مش المصدر. دي القاعدة اللي
//    لو اتكسرت، الزائر بيكتب في بيانات تاجر حقيقي.
//
// ٢) **المفتاح الأجنبي اللي مالوش مقابل في الخريطة بيترفض السطر كله** — مش
//    بيتساب على قيمته القديمة. القيمة القديمة بتشاور على صف المصدر، يعني
//    النسخة هتبقى متعلّقة في المستأجر الأصلي.
//
// ٣) **الترتيب من المخطط مش من ليستة مكتوبة بالإيد.** الأب قبل الابن،
//    والدايرة **بتترفض** — مش بتتخمّن.
//
// ٤) **الجدول اللي مالوش `company_id` مابيتنسخش خالص.** مافيش استثناءات
//    «صغيرة»: جدول مشترك بين المستأجرين لو اتنسخ، الزائر بيكتب في حاجة
//    مشتركة.
'use strict';

/** أعمدة مالهاش معنى في النسخة — بتتولّد من جديد. */
const SKIP_COLUMNS = new Set(['created_at', 'updated_at']);

/**
 * ترتيب الجداول: الأب قبل الابن.
 *
 * @returns { order, cycle } — `cycle` مليانة معناها **مافيش خطة**، لأن
 *   دايرة مفاتيح مش حاجة تتخمّن فيها بداية.
 */
function orderTables(schema) {
  const names = Object.keys(schema || {});
  const deps = new Map();
  for (const n of names) {
    const t = schema[n] || {};
    // بنعتمد بس على المفاتيح اللي بتشاور على جدول جوّه النسخة.
    const on = new Set((t.fks || [])
      .map((f) => f.refTable)
      .filter((r) => r !== n && names.includes(r)));
    deps.set(n, on);
  }
  const order = [];
  const done = new Set();
  let moved = true;
  while (moved) {
    moved = false;
    for (const n of names) {
      if (done.has(n)) continue;
      const on = deps.get(n);
      if ([...on].every((d) => done.has(d))) { order.push(n); done.add(n); moved = true; }
    }
  }
  const cycle = names.filter((n) => !done.has(n));
  return { order, cycle };
}

/**
 * القيمة الجديدة لعمود فريد.
 * الإيميلات والأسماء المختصرة بتتصادم لأن الـUNIQUE على مستوى الجدول كله،
 * فبنحقن علامة النسخة **جوّه** القيمة بشكل ثابت يتعرف ويتمسح.
 */
function uniqueValue(value, token, kind) {
  const t = String(token || '').slice(0, 12);
  const v = String(value == null ? '' : value);
  if (!v) return v;
  if (kind === 'email' && v.includes('@')) {
    const [user, host] = v.split('@');
    return `${user}+demo${t}@${host}`;
  }
  return `${v}-d${t}`;
}

/** نوع العمود الفريد، عشان الإيميل يفضل إيميل. */
function uniqueKind(column) {
  const c = String(column || '').toLowerCase();
  if (c.includes('email')) return 'email';
  return 'text';
}

/**
 * خطة نسخ جدول واحد.
 *
 * @returns null لو الجدول مايتنسخش (مافيش `company_id`), أو
 *   { table, columns, remap, uniques, sql }
 *
 * `remap` = الأعمدة اللي لازم تتبدّل من خريطة الـids.
 */
function planTable(schema, name, opts) {
  const t = (schema || {})[name];
  if (!t || !t.hasCompanyId) return null;
  const o = opts || {};
  const pk = t.pk || 'id';

  // الأعمدة المتنسوخة: كل حاجة ما عدا المفتاح الأساسي (بيتولّد) والأوقات.
  const columns = (t.columns || [])
    .map((c) => (typeof c === 'string' ? c : c.name))
    .filter((c) => c !== pk && !SKIP_COLUMNS.has(c));

  const remap = (t.fks || [])
    .filter((f) => f.column !== 'company_id')
    .filter((f) => columns.includes(f.column))
    .filter((f) => (schema[f.refTable] || {}).hasCompanyId)   // بره النسخة = مايتلمسش
    .map((f) => ({ column: f.column, from: f.refTable }));

  const uniques = (t.uniques || [])
    .flat()
    .filter((c) => columns.includes(c) && c !== 'company_id')
    .map((c) => ({ column: c, kind: uniqueKind(c) }));

  return {
    table: name,
    pk,
    columns,
    remap,
    uniques,
    // `company_id` بيتحطّ من برّه دايماً — مش بيتنسخ من الصف.
    companyColumn: 'company_id',
    sql: `SELECT ${[pk, ...columns].join(', ')} FROM ${name} WHERE company_id = $1`
      + (o.limit ? ` LIMIT ${Number(o.limit)}` : ''),
  };
}

/**
 * الخطة الكاملة.
 * @returns { order, steps, skipped, cycle }
 */
function planFrom(schema, opts) {
  const { order, cycle } = orderTables(schema);
  const steps = [];
  const skipped = [];
  for (const name of order) {
    const step = planTable(schema, name, opts);
    if (step) steps.push(step); else skipped.push(name);
  }
  return { order, steps, skipped, cycle };
}

/**
 * صف جاهز للكتابة — أو **رفض بسببه**.
 *
 * @param row     الصف من المصدر
 * @param step    خطة الجدول
 * @param maps    { table: Map(oldId → newId) }
 * @param newCompanyId الشركة الجديدة
 * @param token   علامة النسخة (للقيم الفريدة)
 *
 * @returns { ok: true, values } أو { ok: false, why, column }
 */
function rowFor(row, step, maps, newCompanyId, token) {
  const values = {};
  for (const c of step.columns) values[c] = row[c];

  // ١) الشركة الجديدة — دايماً من برّه، مهما كان في الصف.
  values[step.companyColumn] = newCompanyId;

  // ٢) المفاتيح الأجنبية: اللي مالوش مقابل بيرفض السطر كله.
  for (const r of step.remap) {
    const old = row[r.column];
    if (old == null) continue;                     // فاضي يفضل فاضي
    const map = maps && maps[r.from];
    const next = map && map.get(old);
    if (next == null) return { ok: false, why: 'unmapped_fk', column: r.column, refTable: r.from };
    values[r.column] = next;
  }

  // ٣) القيم الفريدة بتاخد علامة النسخة.
  for (const u of step.uniques) {
    if (values[u.column] == null) continue;
    values[u.column] = uniqueValue(values[u.column], token, u.kind);
  }

  return { ok: true, values };
}

module.exports = { orderTables, planTable, planFrom, rowFor, uniqueValue, uniqueKind, SKIP_COLUMNS };
