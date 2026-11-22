import assert from "node:assert/strict";
import test from "node:test";
import { buildFollowupSms, formatComplaintTime, normalizeEgMobile, shortTechName, smsHref } from "../shared/sms-message";

// رسالة SMS المتابعة (قرار المالك ٢٠٢٦-٠٩-٣٠) — النص معتمد من المالك بالحرف.
const WITH_COMPLAINT = [
  "سنترال الغنايم",
  "عميلنا العزيز، تم تسجيل بلاغ عن خط التليفون 882821905 يوم الثلاثاء 29/09/2026 الساعة 10:30 ص.",
  "نود الاطمئنان على حالة الخط الآن.",
  "في حالة وجود أي مشكلة يرجى التواصل مع السنترال على 01552406406 (مكالمة أو واتساب)، أو مع الفني المختص حسن عبد الفتاح على 01012345678.",
  "شكراً لحضرتك.",
].join("\n");

test("النص المعتمد بالحرف — بلاغ + فنى له محمول", () => {
  // lastComplaintAt من «بحث برقم التليفون» = وقت حائط القاهرة متسجّل كـUTC
  assert.equal(buildFollowupSms({
    phone: "882821905", lastComplaintAt: "2026-09-29T10:30:00.000Z",
    techName: "حسن عبد الفتاح يعقوب", techMobile: "1012345678",
  }), WITH_COMPLAINT);
});

test("اسم الفنى ثنائى بس، وأحادى لو مالوش تانى — والمركّب اسم واحد", () => {
  assert.equal(shortTechName("حسن عبد الفتاح يعقوب"), "حسن عبد الفتاح");
  assert.equal(shortTechName("سامى"), "سامى");
  assert.equal(shortTechName("محمد أحمد على"), "محمد أحمد");
  assert.equal(shortTechName("عبد الله محمد حسن"), "عبد الله محمد");
  assert.equal(shortTechName("أحمد أبو بكر سالم"), "أحمد أبو بكر");
  assert.equal(shortTechName("محمد نور الدين حسن"), "محمد نور الدين");
  assert.equal(shortTechName("  على   محمود  "), "على محمود");
  assert.match(buildFollowupSms({ phone: "1", techName: "سامى", techMobile: "01012345678" }), /الفني المختص سامى على 01012345678/);
});

test("خط مالوش بلاغ: من غير جملة البلاغ (اختيار المالك «ب»)", () => {
  const m = buildFollowupSms({ phone: "882821905", lastComplaintAt: null, techName: "حسن", techMobile: "01012345678" });
  assert.equal(m.split("\n")[1], "عميلنا العزيز، نود الاطمئنان على حالة خط التليفون 882821905.");
  assert.doesNotMatch(m, /بلاغ|نود الاطمئنان على حالة الخط الآن/);
  assert.match(m, /أو مع الفني المختص حسن على 01012345678\.\n/);
});

test("فنى مالوش محمول: جملة الفنى بتتشال ويفضل رقم السنترال", () => {
  const m = buildFollowupSms({ phone: "882821905", lastComplaintAt: "2026-09-29T15:05:00Z", techName: "حسن", techMobile: null });
  assert.match(m, /على 01552406406 \(مكالمة أو واتساب\)\.\n/);
  assert.doesNotMatch(m, /الفني المختص/);
});

test("الوقت ١٢ ساعة ص/م، واليوم بالعربى", () => {
  assert.deepEqual(formatComplaintTime("2026-09-29T15:05:00Z"), { day: "الثلاثاء", date: "29/09/2026", time: "3:05 م" });
  assert.equal(formatComplaintTime("2026-09-30T00:10:00Z")?.time, "12:10 ص");
  assert.equal(formatComplaintTime("2026-09-30T12:00:00Z")?.time, "12:00 م");
  assert.equal(formatComplaintTime("غلط"), null);
  // لحظة حقيقية (timestamptz) → توقيت القاهرة
  assert.equal(formatComplaintTime("2026-09-29T07:30:00Z", false)?.time, "10:30 ص");
});

test("رقم المحمول: صيغ مختلفة → 01xxxxxxxxx، والأرضى لأ", () => {
  assert.equal(normalizeEgMobile("+201012345678"), "01012345678");
  assert.equal(normalizeEgMobile("00201112223334"), "01112223334");
  assert.equal(normalizeEgMobile("1148562894"), "01148562894");
  assert.equal(normalizeEgMobile("٠١٥٥٢٤٠٦٤٠٦"), "01552406406");
  assert.equal(normalizeEgMobile("0882821905"), null);
  assert.equal(normalizeEgMobile("01*******94"), null);
  assert.equal(normalizeEgMobile(""), null);
});

test("رابط تطبيق الرسايل: أندرويد ? وآيفون &", () => {
  assert.equal(smsHref("01012345678", "أ ب", false), "sms:01012345678?body=%D8%A3%20%D8%A8");
  assert.equal(smsHref("01012345678", "x", true), "sms:01012345678&body=x");
});
