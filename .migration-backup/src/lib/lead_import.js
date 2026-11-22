'use strict';
/**
 * استيراد العملاء المحتملين من ملف بحث خارجي إلى `crm_leads`.
 *
 * ── ⚠️ أهم حاجة في الملف ده: «قابل للتواصل» مش «عميل محتمل» ────────────
 *
 * أول دفعة وصلت (١٠٠ نشاط في الإسكندرية) فيها:
 *   · **صفر رقم تليفون**
 *   · ٤ روابط واتساب
 *   · ١٣ رابط فيسبوك
 *
 * يعني **٨٣ من ١٠٠ مالهمش أي وسيلة تواصل خالص**. دول مش «عملاء محتملين
 * بدرجة ثقة متوسطة» — دول أسماء وعناوين. تسجيلهم بدرجة أولوية عادية
 * بيخلّي البايع يفتح القايمة، يلاقي مية اسم، ويكتشف بعد نص ساعة إن أغلبهم
 * مايتكلّمش.
 *
 * فالأولوية هنا **مشتقّة من إمكانية التواصل الأول**، وتقدير الثقة اللي
 * جاي من البحث بييجي بعده:
 *
 *     واتساب  → high    (تقدر تكلّمه دلوقتي)
 *     فيسبوك  → normal  (تقدر توصله، بخطوة زيادة)
 *     ولا حاجة → low    (بحث خام — محتاج شغل قبل ما يتكلّم)
 *
 * `low` مش معناها «وحش». معناها **لسه مش جاهز للاتصال**، وده الصدق اللي
 * بيخلّي القايمة تنفع للشغل.
 *
 * ── والتكرار ────────────────────────────────────────────────────────────
 *
 * الاستيراد بيتشغّل أكتر من مرة (دفعة تانية، تصحيح، إعادة تشغيل). المفتاح
 * هو `source_url` — رابط سجل النشاط — لأنه الحاجة الوحيدة الموجودة في كل
 * صف. التكرار على التليفون مكانش هيشتغل: مافيش تليفونات أصلاً.
 *
 * ── الوحدة دي صافية ────────────────────────────────────────────────────
 *
 * مفيش قاعدة بيانات هنا: قراءة وتحويل وتحقّق بس، عشان الحارس يشغّلها على
 * الملف الحقيقي من غير سيرفر.
 */

/**
 * القطاع اللي في ملف البحث → نوع الصفحة عندنا.
 *
 * ⚠️ **عيادة الأسنان بتتحوّل لـ`clinic`** مش نوع لوحده — الأسنان تخصّص
 * جوّه نظام العيادة، وده مكتوب في `llms.txt` وفي `check-page-types`.
 * لو اتسجّلت `dental` هنا، القايمة هتقول لينا إن عندنا نظام تلتاشر.
 */
const SEGMENT_RULES = [
  /* ⚠️ **الترتيب مقصود: المحدّد قبل العام.**
   *
   * «تجهيزات فنادق ومطاعم» نشاط **مورّد**، مش مطعم. لو قاعدة المطاعم
   * جت الأول كان هيتسجّل تحت نظام الطلبات، والبايع كان هيكلّم مورّد
   * معدّات ويعرض عليه منيو إلكتروني. فقاعدة التوريد لازم تسبقها. */
  [/تجهيزات|توريد|مورد|جملة/, 'shop'],
  [/صيدلي/, 'pharmacy'],
  [/أسنان|اسنان/, 'clinic'],
  [/عيادة|طبيب|مركز طبي/, 'clinic'],
  // «مطاعم» بالجمع كمان — «سلسلة مطاعم» كانت بتفوت من غير `مطاعم`.
  [/مطعم|مطاعم|كافيه|مخبز|برجر|بيتزا|مشوي|حلوي|أطعمة|اطعمة|وجبات|مأكولات/, 'orders'],
  [/جيم|لياقة/, 'gym'],
  [/تغذية/, 'nutrition'],
  [/موبيليا|أثاث|اثاث/, 'furniture'],
  [/ورشة|سيارات/, 'workshop'],
  [/قاعة|أفراح|افراح/, 'hall'],
  [/حضانة|روضة/, 'nursery'],
];

/** النوع من وصف القطاع — و`null` لو مش واضح (أحسن من تخمين). */
function categoryOf(segment) {
  const s = String(segment || '');
  for (const [re, type] of SEGMENT_RULES) if (re.test(s)) return type;
  return null;
}

/**
 * رقم من رابط واتساب: `https://wa.me/201001716566` → `+201001716566`.
 *
 * بيرجّع `null` لأي حاجة تانية. **ممنوع تخمين رقم** — رقم مخترع بيحرق
 * البايع مع حد غلط، ودي قاعدة مكتوبة في `docs/MANUS_LEADS_PROMPT.md`.
 */
function phoneFromWhatsApp(url) {
  const m = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d{7,15})/.exec(String(url || ''));
  if (!m) return null;
  const bare = m[1].replace(/\D/g, '');
  if (bare.length < 7 || bare.length > 15) return null;
  return '+' + bare;
}

/** أولوية مشتقّة من إمكانية التواصل — مش من تقدير الثقة لوحده. */
function priorityOf(row) {
  if (phoneFromWhatsApp(row.whatsapp_url)) return 'high';
  if (String(row.facebook_url || '').trim()) return 'normal';
  return 'low';
}

const trim = (v, max) => {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/**
 * صف من الملف → صف `crm_leads`.
 *
 * بيرجّع `{ ok: true, lead }` أو `{ ok: false, reason }`.
 */
function leadFrom(row, batch) {
  const name = trim(row.name, 160);
  const link = trim(row.source_url, 400);
  if (!name) return { ok: false, reason: 'بلا اسم' };
  if (!link) return { ok: false, reason: 'بلا رابط مصدر — مافيش مفتاح تكرار' };

  const phone = phoneFromWhatsApp(row.whatsapp_url);
  const category = categoryOf(row.segment);
  const priority = priorityOf(row);

  /* الملاحظات: كل اللي البايع محتاجه في سطر واحد قبل ما يكلّم.
   * بنكتب **مفيش وسيلة تواصل** صراحةً — دي أهم معلومة في الصف. */
  const bits = [];
  if (row.segment) bits.push(`القطاع: ${trim(row.segment, 80)}`);
  if (row.city) bits.push(`المدينة: ${trim(row.city, 60)}`);
  if (row.address) bits.push(`العنوان: ${trim(row.address, 200)}`);
  if (row.facebook_url) bits.push(`فيسبوك: ${trim(row.facebook_url, 200)}`);
  if (row.instagram_url) bits.push(`إنستجرام: ${trim(row.instagram_url, 200)}`);
  if (!phone && !row.facebook_url) bits.push('⚠️ مفيش وسيلة تواصل — محتاج بحث قبل الاتصال');
  if (row.confidence) bits.push(`ثقة البحث: ${trim(row.confidence, 20)}`);
  if (row.notes) bits.push(trim(row.notes, 300));

  return {
    ok: true,
    lead: {
      name,
      phone,
      email: null,
      business_name: name,
      category,
      link,
      source: `research:${batch}`,
      status: 'new',
      priority,
      notes: bits.join(' · ').slice(0, 1200),
    },
  };
}

/** الملف كله → صفوف جاهزة + إحصاء. */
function importRows(rows, batch) {
  const leads = [];
  const skipped = [];
  const seen = new Set();
  for (const row of rows) {
    const r = leadFrom(row, batch);
    if (!r.ok) { skipped.push({ row, reason: r.reason }); continue; }
    if (seen.has(r.lead.link)) { skipped.push({ row, reason: 'مكرّر في نفس الملف' }); continue; }
    seen.add(r.lead.link);
    leads.push(r.lead);
  }
  const by = (k) => leads.reduce((a, l) => { a[l[k] || '—'] = (a[l[k] || '—'] || 0) + 1; return a; }, {});
  return {
    leads,
    skipped,
    stats: {
      total: rows.length,
      imported: leads.length,
      withPhone: leads.filter((l) => l.phone).length,
      contactable: leads.filter((l) => l.priority !== 'low').length,
      byPriority: by('priority'),
      byCategory: by('category'),
    },
  };
}

module.exports = { importRows, leadFrom, categoryOf, phoneFromWhatsApp, priorityOf };
