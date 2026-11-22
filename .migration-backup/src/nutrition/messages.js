// رسائل آمنة بين المريض والعيادة.
//
// المريض دلوقتي بيبعت سؤاله على واتساب رقم العيادة — «التحليل ده يعني إيه؟»
// مع صورة التحليل. ده معناه إن ورقة تحاليل باسم واحد بتتخزّن على تليفون
// شخصي وسيرفر شركة تانية، وإن السؤال بيضيع في نفس الشاشة اللي فيها كلام
// العيلة. الرسايل هنا جوّه النظام، جنب ملف المريض نفسه.
//
// ── الأربعة اللي الملف ده قايم عليهم ─────────────────────────────────────
//
// ١) **دي مش شات.** المريض اللي بيكتب الساعة ٢ بالليل ويشوف فقاعة رسالة
//    بيفترض إن حد بيقرا. فالصفحة بتقول **صراحةً** إن دي مش للطوارئ وإن الرد
//    بيجي في ساعات العيادة — الجملة دي جزء من الميزة، مش تحذير قانوني
//    مركون في الفوتر.
//
// ٢) **«اتبعت» غير «اتقرت».** حالة الرسالة بتتحسب من `read_at` اللي بيتكتب
//    لما الطرف التاني يفتح الخيط فعلاً. علامة «اتقرت» بتظهر على مجرد وصول
//    الصف كدب صغير بس نتيجته إن المريض يستنى رد على حاجة محدش شافها.
//
// ٣) **المريض بيقرا خيطه هو بس.** مافيش رقم مريض في أي رابط — بييجي من
//    الجلسة. والكتابة نفسها بتتأكد إن المريض بتاع العيادة دي في نفس الجملة.
//
// ٤) **الميزة اختيارية ومقفولة افتراضياً.** استقبال أسئلة طبية التزام: عيادة
//    ما تعرفش إن فيه صندوق وارد هتسيب مرضى مستنيين رد. فالأخصائي بيفتحها
//    بنفسه، ولما تكون مقفولة الصفحة مابتوعدش بحاجة أصلاً.
'use strict';

const MAX_LEN = 1000;
const SIDES = ['patient', 'practice'];

/** نص الرسالة، أو null لو فاضي. الفاضي مابيتبعتش — مابيتخزّنش فاضي. */
function clean(body) {
  const s = String(body == null ? '' : body).replace(/\r\n/g, '\n').trim();
  return s ? s.slice(0, MAX_LEN) : null;
}

/**
 * الخيط من ناحية طرف واحد.
 *
 * @param rows   صفوف الرسائل (الأقدم الأول)
 * @param viewer 'patient' | 'practice'
 *
 * كل رسالة بتترجع بحالتها من ناحية الباعت:
 *   'read' — الطرف التاني فتح الخيط بعد ما وصلت
 *   'sent' — وصلت ولسه محدش شافها
 * ورسالة الطرف التاني حالتها null — مالهاش معنى إنك تقول لنفسك «قريتها».
 */
function threadFor(rows, viewer) {
  const side = SIDES.includes(viewer) ? viewer : 'patient';
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.id,
    body: r.body,
    at: r.created_at,
    mine: r.sender === side,
    sender: r.sender,
    author: r.author_name || null,
    state: r.sender === side ? (r.read_at ? 'read' : 'sent') : null,
  }));
}

/** رسايل الطرف التاني اللي لسه ما اتقرتش — للعدّاد. */
function unreadFor(rows, viewer) {
  const side = SIDES.includes(viewer) ? viewer : 'patient';
  return (Array.isArray(rows) ? rows : []).filter((r) => r.sender !== side && !r.read_at).length;
}

/**
 * آخر رسالة من المريض مستنية رد بقالها كام ساعة، أو null لو مافيش.
 * بتتحسب من الصفوف — مش عمود بيتحدّث ويسيب خيوط قديمة «مستنية» للأبد.
 */
function waitingHours(rows, now) {
  const list = (Array.isArray(rows) ? rows : []).slice();
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].sender === 'practice') return null;   // آخر كلام رد من العيادة
    if (list[i].sender === 'patient') {
      const t = new Date(list[i].created_at).getTime();
      if (!Number.isFinite(t)) return null;
      const ref = (now ? new Date(now) : new Date()).getTime();
      return Math.max(0, Math.floor((ref - t) / 3600000));
    }
  }
  return null;
}

/** الميزة اتفتحت ولا لأ. مقفولة افتراضياً — والقراءة اللي تفشل مش «مفتوحة». */
function enabledFrom(row) {
  return !!(row && row.messages_enabled === true);
}

/**
 * كتابة رسالة. شرط «المريض ده بتاع العيادة دي» **جوّه** الجملة، فرقم مريض
 * من عيادة تانية مابيكتبش صف أصلاً — مش بيتفحص في السطر اللي قبلها.
 */
function insertMessage({ companyId, patientId, sender, body, authorName }) {
  return {
    text: `
      INSERT INTO nutrition_messages
        (company_id, patient_id, sender, body, author_name)
      SELECT $1::int, p.id, $3, $4, $5
        FROM nutrition_patients p
       WHERE p.id = $2 AND p.company_id = $1 AND p.is_active
      RETURNING id, created_at`,
    values: [companyId, patientId, SIDES.includes(sender) ? sender : 'patient', body, authorName || null],
  };
}

/**
 * تعليم رسايل الطرف التاني «اتقرت» — لما الخيط يتفتح فعلاً.
 * `read_at IS NULL` عشان الوقت يفضل وقت أول قراية، مش آخر فتحة للصفحة.
 */
function markRead({ companyId, patientId, viewer }) {
  const side = SIDES.includes(viewer) ? viewer : 'patient';
  return {
    text: `
      UPDATE nutrition_messages SET read_at = now()
       WHERE company_id = $1 AND patient_id = $2 AND sender <> $3 AND read_at IS NULL`,
    values: [companyId, patientId, side],
  };
}

module.exports = { MAX_LEN, SIDES, clean, threadFor, unreadFor, waitingHours, enabledFrom, insertMessage, markRead };
