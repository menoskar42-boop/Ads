#!/usr/bin/env node
/**
 * An id from the form, written next to a company_id from the session.
 *
 * `check-tenant-isolation.js` asserts this for the clinic, table by table.
 * That was right for the tables the reviews named and useless for the six that
 * turned up afterwards in the gym, the nursery, the showroom, the instalments
 * and three more clinic routes — because a check that lists what it knows
 * about only ever finds what somebody already found.
 *
 * So this one does not list tables. It reads every `INSERT` in the admin
 * routers, pairs each column with its placeholder, and follows the placeholder
 * into the parameter array. When a column ending in `_id` is filled from
 * `req.body` / `req.params` and is NOT scoped inside the statement, that is
 * the bug — whatever the table is called and whoever writes it next.
 *
 * Scoped means one of two things, both inside the writing statement:
 *
 *   · `${ref('table', '$2', '$1')}` — a foreign id becomes NULL. Right for a
 *     link that is optional anyway (the member on a POS sale).
 *   · `WHERE EXISTS (SELECT 1 FROM table WHERE id=$2 AND company_id=$1)` — the
 *     row is not written at all. Right when the record hangs off that id: an
 *     invoice or an instalment plan names a person and asks them for money.
 *
 * A `SELECT` first and an `INSERT` after is neither. It reads correctly and
 * still races.
 *
 * A third form is accepted for URL ids only: `ownerGuard` mounted on the path
 * prefix, which is what tenant_scope.js recommends for exactly this shape —
 * one mount covers every route beneath it, including ones written later.
 *
 * The limit, stated rather than hidden: this reads text, not a parsed program.
 * It follows one hop through a local variable and takes the nearest preceding
 * declaration, which is right in these routers and would not be in code that
 * shadows names inside blocks. It is a net cast over a known shape, not a
 * proof.
 *
 *   node scripts/check-foreign-ids.js
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

/* Ids the server derives itself — a row it just inserted, the session's own
   user, a lookup already scoped by company_id in its own query. These are not
   request input and there is nothing to narrow. */
const NOT_FROM_THE_REQUEST = /^(company_id|id)$/;

/* Which columns are foreign keys, and to what, read from the schema files
   rather than guessed from the name.
 *
 * This decides two things that a name list got wrong:
 *
 *  · `national_id`, `tax_id`, `phone_number_id` end in `_id` and reference
 *    nothing — they are numbers a merchant types.
 *  · `pharmacy_inventory.medicine_id` points at `medicines`, which is a SHARED
 *    catalogue with no company_id at all. Narrowing it to a tenant would be
 *    wrong, not safer. `product_categories`, by contrast, does have one.
 *
 * So the rule is: a column needs scoping exactly when the table it references
 * is itself company-scoped. */
function readSchema() {
  const refs = new Map();          // "table.col" → referenced table
  const scopedTables = new Set();  // tables that have a company_id column
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules') continue;
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (f.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  files.push(path.join(ROOT, 'server.js'));
  for (const file of files) {
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
    for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\);/g)) {
      const table = m[1], body = m[2];
      if (/\bcompany_id\b/.test(body)) scopedTables.add(table);
      for (const c of body.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+[A-Z][^,\n]*REFERENCES\s+([a-z_][a-z0-9_]*)\s*\(/gm)) {
        refs.set(table + '.' + c[1], c[2]);
      }
    }
  }
  return { refs, scopedTables };
}
const SCHEMA = readSchema();

/* Helpers that narrow an id to the tenant themselves, so their output is not
   raw request input by the time it reaches the statement. `idToStamp` only
   returns a branch that appears in this company's own branch list. */
const SCOPING_HELPERS = /idToStamp\(/;

/** Split "a, b(c, d), [e, f]" on top-level commas only. */
function topLevelSplit(text) {
  const out = [];
  let depth = 0, cur = '', str = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (str) {
      cur += c;
      if (c === '\\') { cur += text[++i] || ''; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { str = c; cur += c; continue; }
    if ('([{'.includes(c)) depth += 1;
    if (')]}'.includes(c)) depth -= 1;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Every INSERT statement in a file, with its column list, value list and args. */
function statementsIn(src) {
  const out = [];
  const re = /INSERT INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*(VALUES|SELECT)/gi;
  for (const m of src.matchAll(re)) {
    const tail = src.slice(m.index);
    const endTick = tail.indexOf('`');
    if (endTick < 0) continue;
    const sql = tail.slice(0, endTick);
    // Values: the parenthesised list after VALUES, or the SELECT list.
    let values;
    if (m[3].toUpperCase() === 'VALUES') {
      const after = sql.slice(sql.toUpperCase().indexOf('VALUES') + 6);
      const open = after.indexOf('(');
      let depth = 0, end = -1;
      for (let i = open; i < after.length; i += 1) {
        if (after[i] === '(') depth += 1;
        if (after[i] === ')') { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      values = end > open ? after.slice(open + 1, end) : '';
    } else {
      const after = sql.slice(sql.toUpperCase().indexOf('SELECT') + 6);
      values = after.split(/\n|\bWHERE\b|\bFROM\b/i)[0];
    }
    // The JS parameter array: the next `[ … ]` after the closing backtick.
    const rest = tail.slice(endTick + 1);
    const openArr = rest.indexOf('[');
    let args = [];
    if (openArr > -1 && openArr < 40) {
      let depth = 0, end = -1;
      for (let i = openArr; i < rest.length; i += 1) {
        if ('(['.includes(rest[i])) depth += 1;
        if (')]'.includes(rest[i])) { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      if (end > openArr) args = topLevelSplit(rest.slice(openArr + 1, end));
    }
    out.push({
      table: m[1],
      cols: m[2].split(',').map((c) => c.trim().toLowerCase()).filter(Boolean),
      vals: topLevelSplit(values),
      args,
      sql,
      index: m.index,
      at: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The sweep ─────────────────────────────────────────────────────────── */
const ROUTERS = fs.readdirSync(path.join(ROOT, 'src/routes'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => 'src/routes/' + f);

const naked = [];
let scoped = 0;
for (const rel of ROUTERS) {
  let src;
  try { src = code(rel); } catch (e) { continue; }
  for (const st of statementsIn(src)) {
    if (st.cols.length !== st.vals.length) continue;   // multi-row or odd shape
    if (!st.cols.includes('company_id')) continue;     // not a tenant table
    for (let i = 0; i < st.cols.length; i += 1) {
      const col = st.cols[i];
      if (!col.endsWith('_id') || NOT_FROM_THE_REQUEST.test(col)) continue;
      const target = SCHEMA.refs.get(st.table + '.' + col);
      // Not a foreign key, or a key into a catalogue everybody shares.
      if (!target || !SCHEMA.scopedTables.has(target)) continue;
      const v = st.vals[i];
      if (/\$\{ref\(/.test(v)) { scoped += 1; continue; }        // narrowed to NULL
      const ph = /^\$(\d+)/.exec(v.trim());
      if (!ph) continue;                                        // a literal or an expression
      let arg = st.args[Number(ph[1]) - 1] || '';
      if (SCOPING_HELPERS.test(arg)) continue;
      /* Follow one hop through a local: `venueId` hid `int(b.venue_id)` from an
         earlier version of this sweep, and two of the holes it missed were
         exactly that shape. The NEAREST PRECEDING declaration, not the first in
         the file — several routers reuse the name `id`, and matching the wrong
         one made this report routes that were fine. */
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(arg)) {
        const before = src.slice(0, st.index);
        const declRe = new RegExp('\\b(?:const|let|var)\\s+' + arg + '\\s*=\\s*([^;\n]+)', 'g');
        let last = null, d;
        while ((d = declRe.exec(before)) !== null) last = d[1];
        if (last) arg = last;
      }
      const fromRequest = /\breq\.body\b|\breq\.params\b|\breq\.query\b|(^|[^a-zA-Z_.])b\./.test(arg);
      if (!fromRequest) continue;                               // server-derived id

      /* A URL id can be covered by ownerGuard on the path prefix — the form the
         project's own tenant_scope docs recommend, because one mount covers
         every route under it including ones written later. If the id came from
         `req.params.X` and this router mounts a guard on a path carrying `:X`,
         it is checked before the handler runs. */
      const fromParam = /\breq\.params\.([A-Za-z_$][A-Za-z0-9_$]*)/.exec(arg);
      if (fromParam && new RegExp("router\\.use\\('[^']*:" + fromParam[1] + "[^']*',\\s*ownerGuard\\(").test(src)) {
        scoped += 1; continue;
      }
      // The whole-row form: the statement refuses instead of nulling.
      if (new RegExp('EXISTS \\(SELECT 1 FROM [a-z_]+ WHERE id=\\$' + ph[1] + ' AND company_id=').test(st.sql)) {
        scoped += 1; continue;
      }

      /* `INSERT … SELECT … FROM <table> WHERE id=$N AND company_id=$M`.
       *
       * ده أقوى من `ref()` مش أضعف: التقييد جوّه نفس الجملة، ولو الصف مش
       * بتاع الشركة الجملة **مابتكتبش ولا صف** بدل ما تكتب عمود NULL.
       * ومفيد بالذات لما العمود بيقبل NULL — `ref()` ساعتها بتسيب صف
       * يتيم (مطالبة ضمان بلا شغل مثلاً) بدل ما ترفضه.
       *
       * الشرط مضبوط على **نفس** رقم المتغيّر بتاع العمود ده، فجملة
       * بتقيّد معرّف تاني ماتعديش بالغلط. */
      if (new RegExp(
        '\\bSELECT\\b[\\s\\S]{0,400}?\\bFROM\\s+[a-z_]+\\s+WHERE\\s+id=\\$' + ph[1]
        + '\\s+AND\\s+company_id=\\$\\d+', 'i').test(st.sql)) {
        scoped += 1; continue;
      }

      /* The transactional-lock form, which the workshop reservation route uses:
       *
       *   const job = (await client.query(
       *     'SELECT id FROM workshop_jobs WHERE id=$1 AND company_id=$2 FOR UPDATE',
       *     [jobId, cid])).rows[0];
       *   ...
       *   if (!job || ...) { await client.query('ROLLBACK'); return ...; }
       *   await client.query(`INSERT INTO workshop_part_reservations ... `, [cid, partId, jobId, qty]);
       *
       * This is STRONGER than the three forms above — it holds a row lock for
       * the length of the transaction, so the row cannot be moved to another
       * company between the check and the write. Reporting it as naked failed
       * correct work, and a guard that cries on correct code teaches the next
       * reader that red means nothing.
       *
       * Two conditions, both required, so this stays narrow: the SELECT must
       * lock THIS id against company_id, and the handler must actually refuse
       * on the result. A lock nobody reads is not a check. */
      const before2 = src.slice(0, st.index);
      const argName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(v).trim()) ? null : null;
      const localName = (() => {
        const raw = (st.args[Number(ph[1]) - 1] || '').trim();
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw) ? raw : null;
      })();
      if (localName) {
        const lockRe = new RegExp(
          'WHERE id=\\$\\d+ AND company_id=\\$\\d+[^\'\`"]*FOR UPDATE[\'\`"]\\s*,\\s*\\[\\s*'
          + localName + '\\s*,',
        );
        /* الرفض لازم يبقى **بين** القفل والكتابة — مش أي رفض في الملف.
         * أول نسخة كانت بتدوّر في `before2` كله، فكانت بتلاقي
         * `if (!x) … ROLLBACK` بتاع راوت تاني بعيد وتعدّي. جرّبتها بشيل
         * الرفض من الراوت ده بالظبط — والحارس فضل أخضر. */
        const lockAt = (() => {
          let idx = -1, m2;
          const g = new RegExp(lockRe.source, 'g');
          while ((m2 = g.exec(before2)) !== null) idx = m2.index;
          return idx;
        })();
        const between = lockAt >= 0 ? before2.slice(lockAt) : '';
        const refuseRe = /if\s*\(\s*!\w+[\s\S]{0,300}?ROLLBACK/;
        if (lockAt >= 0 && refuseRe.test(between)) { scoped += 1; continue; }
      }
      naked.push(`${rel}:${st.at} ${st.table}.${col} ← ${arg.slice(0, 40)}`);
    }
  }
}

/* ── كنسة تانية: شكل `INSERT … SELECT` ────────────────────────────────
 *
 * الكنسة اللي فوق بتمشي على القيم اللي شكلها `$N`. لكن في
 * `INSERT … SELECT $2, id, vehicle_id, … FROM workshop_jobs WHERE id=$1
 * AND company_id=$2` القيمة اللي بتتكتب في `original_job_id` هي **عمود**
 * (`id`) مش متغيّر — فالكنسة الأولى مابتشوفهاش خالص.
 *
 * والشكل ده آمن **بشرط واحد**: إن الـ`WHERE` فيه `company_id`. من غيره
 * الجملة بتسحب صف حد تاني وتكتبه عندنا — ومفيش حاجة في الكنسة الأولى
 * كانت هتقول. الثغرة دي ظهرت لما حوّلنا مطالبة الضمان للشكل ده: شيلنا
 * `AND company_id` والفحص فضل أخضر.
 *
 * فالقاعدة هنا: أي `INSERT … SELECT … FROM <جدول مستأجرين> WHERE id=$N`
 * لازم يبقى معاه `company_id=`. */
const nakedSelects = [];
for (const rel of ROUTERS) {
  let src;
  try { src = code(rel); } catch (e) { continue; }
  for (const st of statementsIn(src)) {
    if (!/\bSELECT\b/i.test(st.sql)) continue;
    const from = /\bFROM\s+([a-z_]+)\s+WHERE\s+([\s\S]{0,200})/i.exec(st.sql);
    if (!from) continue;
    const [, sourceTable, whereClause] = from;
    if (!SCHEMA.scopedTables.has(sourceTable)) continue;   // كتالوج مشترك
    if (!/\bid=\$\d+/.test(whereClause)) continue;         // مش بيختار بمعرّف من الطلب
    if (/company_id\s*=/.test(whereClause)) continue;      // متقيّد ✅
    nakedSelects.push(`${rel}:${st.at} ${st.table} ← SELECT FROM ${sourceTable} من غير company_id`);
  }
}

check('و`INSERT … SELECT` بيقيّد مصدره بالشركة كمان',
  nakedSelects.length === 0, nakedSelects.join('\n     ') || 'ولا واحد');

check('مفيش INSERT بيكتب معرّف جاي من الطلب من غير ما يقيّده',
  naked.length === 0, naked.join('\n     ') || 'ولا واحد');
check('والتقييد مستخدم فعلاً (مش الكنس لقى صفر لأنه مابيشوفش حاجة)',
  scoped >= 10, scoped + ' معرّف متقيّد');

/* ── The six the reports named, by name ────────────────────────────────── */
const NAMED = [
  ['الجيم: بيعة POS على عضو', 'src/routes/gym_admin.js', /INSERT INTO gym_sales[\s\S]{0,400}\$\{ref\('gym_members'/],
  ['الحضانة: ولي أمر ومجموعة الطفل', 'src/routes/nursery_admin.js',
    /INSERT INTO nursery_children[\s\S]{0,600}\$\{ref\('nursery_guardians'[\s\S]{0,80}\$\{ref\('nursery_groups'/],
  ['موبيليا: عميل الفاتورة', 'src/routes/furniture_sales.js', /INSERT INTO furniture_sales[\s\S]{0,400}\$\{ref\('furniture_customers'/],
  ['قسّطلي: عميل الخطة', 'src/routes/installments_admin.js',
    /INSERT INTO inst_plans[\s\S]{0,500}EXISTS \(SELECT 1 FROM inst_customers WHERE id=\$2 AND company_id=\$1\)/],
  ['العيادة: مكالمة على مريض', 'src/routes/clinic_admin.js', /INSERT INTO clinic_calls[\s\S]{0,300}\$\{ref\('clinic_patients'/],
  ['العيادة: زيارة منزلية', 'src/routes/clinic_admin.js', /INSERT INTO clinic_home_visits[\s\S]{0,500}\$\{ref\('clinic_patients'/],
  ['العيادة: أمر معمل', 'src/routes/clinic_admin.js', /INSERT INTO clinic_lab_orders[\s\S]{0,500}\$\{ref\('clinic_patients'/],
];
for (const [label, rel, re] of NAMED) check(label, re.test(code(rel)));

/* A plan is not an optional link: a foreign customer must stop the write, and
   the shop has to be told, or the button just does nothing twice. */
{
  const inst = code('src/routes/installments_admin.js');
  check('وخطة بعميل مش بتاع المحل مابتتكتبش أصلاً', /if \(!plan\) return fail\('customer'\)/.test(inst));
  check('والرسالة من قاموس السيرفر مش من الرابط',
    /PLAN_ERRORS\[String\(req\.query\.error/.test(inst) && !/decodeURIComponent\(req\.query\.error\)/.test(inst));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني بيانات عميل عند تاجر ممكن تظهر أو تتكتب عند تاجر تاني.`
  : '\nكل معرّف جاي من الطلب متقيّد بالشركة في نفس الجملة اللي بتكتبه.');
process.exit(fail ? 1 : 0);
