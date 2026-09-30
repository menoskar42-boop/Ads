// رسالة SMS متابعة للعميل (قرار المالك ٢٠٢٦-٠٩-٣٠) — نص معتمد من المالك بالحرف.
// السوبر أدمن بيضغط زرار «SMS» جنب رقم محمول العميل (على الموبايل بس)، فتطبيق الرسايل
// بيفتح والرقم والرسالة جاهزين، وهو اللى بيدوس إرسال. مفيش إرسال أوتوماتيك.
// مصدر واحد للسيرفر والشاشة — أى تعديل فى النص هنا بس.

export const CENTRAL_SMS_CONTACT = "01552406406";

// رقم محمول مصرى → 01xxxxxxxxx (١١ رقم). بيقبل +20 / 0020 / 20 / من غير الصفر.
// غير كده → null (الزرار مايظهرش على رقم مش محمول).
export function normalizeEgMobile(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("0020")) d = d.slice(4);
  else if (d.startsWith("20") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("1")) d = "0" + d;
  return /^01[0125]\d{8}$/.test(d) ? d : null;
}

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

// وقت البلاغ: «الثلاثاء 29/09/2026» و«10:30 ص» (١٢ ساعة — طلب المالك).
// ⚠️ lastComplaintAt من «بحث برقم التليفون» جاى **وقت حائط القاهرة متسجّل كـUTC** (نفس اللى
// الشاشة بتعرضه بـgetUTC* تحت «تاريخ آخر شكوى») — فالافتراضى wallClockUtc=true عشان الرسالة
// تطلع بنفس الساعة اللى المالك شايفها. لحظة حقيقية (timestamptz) → wallClockUtc=false.
export function formatComplaintTime(at: string | Date | null | undefined, wallClockUtc = true): { day: string; date: string; time: string } | null {
  if (!at) return null;
  const t = new Date(at);
  if (isNaN(t.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: wallClockUtc ? "UTC" : "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(t).map((p) => [p.type, p.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const h24 = Number(parts.hour) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    day: WEEKDAYS[wd] ?? "",
    date: `${parts.day}/${parts.month}/${parts.year}`,
    time: `${h12}:${parts.minute} ${h24 < 12 ? "ص" : "م"}`,
  };
}

// اسم الفنى فى الرسالة ثنائى بس (طلب المالك): «حسن عبد الفتاح محمد» → «حسن عبد الفتاح»،
// و«سامى» → «سامى». الاسم المركّب بيتحسب اسم واحد: عبد/أبو + اللى بعده («عبد الفتاح»)،
// و… + الدين/الله («نور الدين»، «فتح الله») — عشان مايطلعش «حسن عبد».
export function shortTechName(full: string | null | undefined): string {
  const w = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let i = 0;
  while (i < w.length && parts.length < 2) {
    let p = w[i++];
    if (/^(عبد|ابو|أبو)$/.test(p) && i < w.length) p += " " + w[i++];
    if (i < w.length && /^(الدين|الله)$/.test(w[i])) p += " " + w[i++];
    parts.push(p);
  }
  return parts.join(" ");
}

export interface FollowupSmsInput {
  phone: string;                         // رقم التليفون الأرضى زى ما بيظهر (مثلاً 882821905)
  lastComplaintAt?: string | Date | null; // آخر بلاغ على الخط — فاضى = الرسالة من غير جملة البلاغ
  techName?: string | null;              // الفنى المختص (فنى الخط)
  techMobile?: string | null;            // محموله — فاضى = جملة الفنى بتتشال
}

export function buildFollowupSms(i: FollowupSmsInput): string {
  const when = formatComplaintTime(i.lastComplaintAt);
  const techMobile = normalizeEgMobile(i.techMobile);
  const techName = shortTechName(i.techName);
  const lines = ["سنترال الغنايم"];
  if (when) {
    lines.push(`عميلنا العزيز، تم تسجيل بلاغ عن خط التليفون ${i.phone} يوم ${when.day} ${when.date} الساعة ${when.time}.`);
    lines.push("نود الاطمئنان على حالة الخط الآن.");
  } else {
    lines.push(`عميلنا العزيز، نود الاطمئنان على حالة خط التليفون ${i.phone}.`);
  }
  const tech = techMobile ? `، أو مع الفني المختص${techName ? " " + techName : ""} على ${techMobile}` : "";
  lines.push(`في حالة وجود أي مشكلة يرجى التواصل مع السنترال على ${CENTRAL_SMS_CONTACT} (مكالمة أو واتساب)${tech}.`);
  lines.push("شكراً لحضرتك.");
  return lines.join("\n");
}

// رابط تطبيق الرسايل. آيفون بيفصل الـbody بـ«&»، وأندرويد بـ«?».
export function smsHref(mobile: string, body: string, ios: boolean): string {
  return `sms:${mobile}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}
