/**
 * دمج كابينة فى كابينة تانية + «أسماء بديلة» عشان ماتترجعش تتعمل (المالك ٢٠٢٦-١٠-٢٠).
 *
 * «العزايزة عبارة عن كابينة واحدة ظاهرين ٤ علشان تغيير الاسم فى قسم الطلبات»: الطلبات بتكتب
 * الكابينة بأسماء مختلفة (sheltr · AMZAT · العزايزه · العزيزه)، وتكامل «بوكس مليان» بيعمل كابينة
 * جديدة لكل اسم. «كباين مكرّرة» بيلقط «2/1» و«2-1» بس — الأسماء المختلفة محتاجة الأدمن يختار.
 *
 * الدمج: كل بوكس بيروح للكابينة المختارة؛ لو فيه بوكس بنفس الرقم هناك الفحوصات والصور
 * بتتنقل له والمكرّر يتمسح (نفس قاعدة «كباين مكرّرة»). كله فى معاملة واحدة — مفيش بيانات بتضيع.
 * والاسم القديم بيتسجّل اسم بديل للكابينة دى فى `cabinet_aliases`، فالطلب الجاى بنفس الاسم
 * بيروح لها بدل ما يعمل كابينة جديدة.
 */
const toAsciiDigits = (s) => String(s ?? '')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** مفتاح الاسم البديل: «العزايزة» = «العزايزه» · «AMZAT» = «amzat» · «2/1» = «2-1» */
const aliasKey = (s) => toAsciiDigits(s)
  .replace(/[\\/_‐‑‒–—―]/g, '-')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ى/g, 'ي')
  .replace(/[ً-ْـ​-‏﻿]/g, '')
  .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

const boxKey = (s) => {
  const d = toAsciiDigits(s).replace(/[^0-9]/g, '');
  return d ? String(parseInt(d, 10)) : '';
};
const isPlainNum = (s) => /^[0-9٠-٩]+$/.test(String(s ?? '').trim());
// «14» و«14 مناول» بوكسين مختلفين — نفس قاعدة boxes.js/integration.js
const findTwin = (list, b) =>
  list.find((k) => String(k.number).trim() === String(b.number).trim())
  || list.find((k) => isPlainNum(k.number) && isPlainNum(b.number) && boxKey(k.number) === boxKey(b.number));

const ALIAS_DDL = `CREATE TABLE IF NOT EXISTS cabinet_aliases (
  id SERIAL PRIMARY KEY,
  exchange_id INTEGER NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  alias_key TEXT NOT NULL,
  alias_name TEXT,
  cabinet_id INTEGER NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (exchange_id, alias_key)
)`;

/** الكابينة اللى الاسم ده اسم بديل لها (أو null). */
async function cabinetByAlias(db, exchangeId, name) {
  const key = aliasKey(name);
  if (!key) return null;
  try {
    return await db.get(
      `SELECT c.id FROM cabinet_aliases a JOIN cabinets c ON c.id = a.cabinet_id
        WHERE a.exchange_id = ? AND a.alias_key = ?`, [exchangeId, key]);
  } catch { return null; } // الجدول لسه ماتعملش (أول تشغيل)
}

/** يدمج sourceId فى targetId (نفس السنترال). بيرجّع الأعداد. */
async function mergeCabinetInto(db, sourceId, targetId) {
  if (Number(sourceId) === Number(targetId)) throw new Error('اختار كابينة تانية');
  return db.transaction(async (q) => {
    const { rows: [src] } = await q('SELECT id, exchange_id, number FROM cabinets WHERE id = ? FOR UPDATE', [sourceId]);
    const { rows: [dst] } = await q('SELECT id, exchange_id, number FROM cabinets WHERE id = ? FOR UPDATE', [targetId]);
    if (!src || !dst) throw new Error('الكابينة مش موجودة');
    if (Number(src.exchange_id) !== Number(dst.exchange_id)) throw new Error('الكابينتين لازم يبقوا فى نفس السنترال');

    const { rows: keepBoxes } = await q('SELECT id, number FROM boxes WHERE cabinet_id = ?', [dst.id]);
    const { rows: srcBoxes } = await q('SELECT id, number FROM boxes WHERE cabinet_id = ?', [src.id]);
    let moved = 0, merged = 0;
    for (const b of srcBoxes) {
      const twin = findTwin(keepBoxes, b);
      if (twin) {
        await q('UPDATE inspections SET box_id = ? WHERE box_id = ?', [twin.id, b.id]);
        await q('UPDATE photos SET box_id = ? WHERE box_id = ?', [twin.id, b.id]);
        await q('DELETE FROM boxes WHERE id = ?', [b.id]);
        merged++;
      } else {
        await q('UPDATE boxes SET cabinet_id = ? WHERE id = ?', [dst.id, b.id]);
        keepBoxes.push({ id: b.id, number: b.number });
        moved++;
      }
    }
    // الأسماء البديلة القديمة للمدموجة + اسمها هى ⇒ للكابينة اللى فاضلة
    await q('UPDATE cabinet_aliases SET cabinet_id = ? WHERE cabinet_id = ?', [dst.id, src.id]);
    await q(`INSERT INTO cabinet_aliases (exchange_id, alias_key, alias_name, cabinet_id) VALUES (?, ?, ?, ?)
             ON CONFLICT (exchange_id, alias_key) DO UPDATE SET cabinet_id = EXCLUDED.cabinet_id`,
            [src.exchange_id, aliasKey(src.number), src.number, dst.id]);
    await q('DELETE FROM cabinets WHERE id = ?', [src.id]);
    return { moved, merged, from: src.number, to: dst.number };
  });
}

module.exports = { aliasKey, findTwin, ALIAS_DDL, cabinetByAlias, mergeCabinetInto };
