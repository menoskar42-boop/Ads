'use strict';

// ── دفتر جهات الاتصال ────────────────────────────────────────────────────────
//
// الوحدة دي هي اللي بتخلّي «اتصل بمراتي» جملة قابلة للتنفيذ. من غيرها
// `/api/calls` بياخد رقم خام وبس.
//
// ⚠️ **الأرقام هنا بيانات طرف تالت.** مراتك ما اختارتش تدّي رقمها لسوكرو —
// إنت اللي دخّلته. فبتتخزّن مشفّرة (نفس vault بتاع كلمات السر)، ومابترجعش
// خام في أي رد API. اللي بيرجع هو `phone_hint` (آخر ٤ أرقام) — يكفي إن
// المستخدم يميّز بين رقمين، ومايكفيش حد تاني يتصل بيه.
//
// والقاعدة التانية: **البحث بيرجّع تلات حالات مش اتنين.** مكالمة للشخص
// الغلط برسالة شخصية مالهاش رجعة، فـ«غامض» حالة أولى بالدرجة مش خطأ.
const crypto = require('crypto');
const { Pool } = require('pg');
const vault = require('../secrets/vault');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/* تطبيع الاسم العربي.
 *
 * العربي بيتكتب بأكتر من شكل لنفس الاسم: «أحمد/احمد/آحمد»، «سارة/ساره»،
 * والتشكيل بيتحط أو ماينحطش. بحث حرفي بيقول «مش موجود» على حد موجود —
 * والنتيجة إن المساعد يقول «ماعرفتش ألاقيه» وهو قدامه.
 *
 * والتطبيع **مش** بيشيل الفروق الحقيقية: «أحمد» و«محمد» بيفضلوا مختلفين. */
const DIACRITICS = /[ً-ْـ]/g;      // تشكيل + تطويل
function normalize(name) {
  return String(name || '')
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* الرقم بيتخزّن بصيغة واحدة عشان المقارنة تشتغل.
 *
 * نفس الرقم بيتكتب `01552406406` و`+201552406406` و`0155 240 6406`.
 * من غير توحيد، قيد «مفيش تكرار» مابيمنعش حاجة والاستيراد المكرّر بيعمل
 * نسخ. مافيش تخمين لكود الدولة: الرقم اللي بيبدأ بصفر بيتساب زي ما هو،
 * وتحويله لدولي قرار المستخدم مش قرارنا. */
function normalizePhone(raw) {
  const s = String(raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  const plus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return (plus ? '+' : '') + digits;
}

const hintOf = (phone) => String(phone).slice(-4);

/* بصمة الرقم للمقارنة من غير فك التشفير.
 *
 * التشفير بـIV عشوائي، فنفس الرقم بيدّي `phone_enc` مختلف كل مرة —
 * يعني `UNIQUE` على العمود المشفّر مابيمنعش تكرار. الفهرس معمول على
 * (اسم + آخر ٤ أرقام)، والدالة دي بتخلّي الطبقة اللي فوق تقارن قبل
 * ما تكتب بدل ما تستنى خطأ من القاعدة. */
function sameNumber(a, b) { return normalizePhone(a) === normalizePhone(b); }

async function add(userId, { name, phone, relation = null, source = 'manual' }) {
  if (!vault.configured()) throw new Error('vault key not configured (set SOKRO_SECRET_KEY)');
  const display = String(name || '').trim().slice(0, 80);
  const p = normalizePhone(phone);
  if (!display) return { ok: false, error: 'الاسم مطلوب' };
  if (!p) return { ok: false, error: 'رقم غير صالح' };
  const search = normalize(display);
  try {
    const row = (await pool.query(
      `INSERT INTO sokro_contacts (user_id, display_name, search_name, relation, phone_enc, phone_hint, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, display_name, relation, phone_hint, source, created_at`,
      [userId, display, search, relation ? String(relation).slice(0, 40) : null, vault.encrypt(p), hintOf(p), source]
    )).rows[0];
    return { ok: true, contact: row };
  } catch (e) {
    // ٢٣٥٠٥ = تكرار. الاستيراد بيتعاد كتير، والتكرار **مش خطأ** — هو
    // «الصف ده موجود خلاص». حالة تالتة مستقلة عشان تقرير الاستيراد
    // يقدر يقول «٣ جداد و٧ موجودين» بدل «١٠ نجحوا» أو «٧ فشلوا».
    if (e.code === '23505') return { ok: false, duplicate: true, error: 'موجود بالفعل' };
    throw e;
  }
}

async function list(userId) {
  return (await pool.query(
    `SELECT id, display_name, relation, phone_hint, source, created_at
       FROM sokro_contacts WHERE user_id = $1 ORDER BY display_name`,
    [userId]
  )).rows;
}

async function remove(userId, id) {
  const r = await pool.query('DELETE FROM sokro_contacts WHERE id = $1 AND user_id = $2', [id, Number(userId)]);
  return r.rowCount > 0;
}

/* الرقم الصريح — الوحيدة اللي بتفك التشفير، وبتتندَه وقت الاتصال بس. */
async function phoneOf(userId, id) {
  const row = (await pool.query(
    'SELECT phone_enc FROM sokro_contacts WHERE id = $1 AND user_id = $2', [id, Number(userId)]
  )).rows[0];
  return row ? vault.decrypt(row.phone_enc) : null;
}

/* ── البحث: تلات حالات، مش اتنين ────────────────────────────────────────────
 *
 * `found` · `none` · **`ambiguous`**.
 *
 * الحالة التالتة هي سبب وجود الملف ده كله. لو البحث رجّع «أقرب نتيجة»
 * وسكرو اتصل بيها، فـ«اتصل بأحمد» وإنت عندك أحمد أخوك وأحمد العميل
 * معناها إن رسالة شخصية ممكن توصل للعميل. ودي غلطة **مالهاش رجعة** —
 * مش زي بحث ويب بيرجع نتيجة غلط وتعيد.
 *
 * فالبحث **مابيرجّعش أول واحد أبداً** لما يكون فيه أكتر من مرشّح، حتى لو
 * واحد فيهم أقرب. الترتيب بيبقى: مطابقة كاملة، وبعدين «بيبدأ بـ»، وبعدين
 * «بيحتوي». وأول مستوى فيه نتايج بيحكم — لو فيه أكتر من واحدة في نفس
 * المستوى، دي `ambiguous` وبيرجع المرشّحين عشان المساعد يسأل.
 *
 * ⚠️ والمرشّحين بيرجعوا بـ`phone_hint` (آخر ٤ أرقام) مش بالرقم. المستخدم
 * محتاج يميّز بين اتنين، مش محتاج يشوف الرقم — والفرق ده هو اللي بيمنع
 * إن سؤال توضيحي عادي يبقى تسريب بيانات طرف تالت. */
async function find(userId, name) {
  const q = normalize(name);
  if (!q) return { status: 'none', query: name };
  const rows = (await pool.query(
    `SELECT id, display_name, relation, phone_hint
       FROM sokro_contacts WHERE user_id = $1 AND search_name LIKE $2`,
    [userId, '%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%']
  )).rows;
  if (!rows.length) return { status: 'none', query: name };

  // الاسم المطبّع مش راجع من الاستعلام، فبيتحسب هنا — مصدر واحد للتطبيع.
  const tier = (r) => {
    const n = normalize(r.display_name);
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    // كلمة كاملة جوّه الاسم: «أحمد» في «أحمد سمير» أقرب من «محمدي».
    if (n.split(' ').includes(q)) return 2;
    return 3;
  };
  const best = Math.min(...rows.map(tier));
  const hits = rows.filter((r) => tier(r) === best);
  if (hits.length === 1) return { status: 'found', contact: hits[0] };
  return { status: 'ambiguous', query: name, candidates: hits };
}

module.exports = { normalize, normalizePhone, hintOf, sameNumber, add, list, remove, phoneOf, find };
