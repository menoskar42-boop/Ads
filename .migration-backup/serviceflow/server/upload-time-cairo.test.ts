// المالك ٢٠٢٦-١١-٠١: «آخر تحديث ظاهر ٩:٣٧ والمفروض ٨:٣٧ لأن التوقيت رجع ساعة» — الشارة بتوقيت القاهرة
// مهما كانت ساعة الجهاز (مصر رجعت لـUTC+2 يوم ٣٠ أكتوبر ٢٠٢٦).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtUploadTime } from "../client/src/lib/cairo-time";

test("upload badge shows Cairo wall time after DST ended (UTC+2), not the device clock", () => {
  // 06:37Z يوم ١ نوفمبر = 08:37 فى القاهرة (التوقيت الشتوى)
  assert.equal(fmtUploadTime("2026-11-01T06:37:00Z", new Date("2026-11-01T06:50:00Z")), "اليوم 08:37");
  // قبل رجوع الساعة (الصيفى UTC+3): 06:37Z = 09:37
  assert.equal(fmtUploadTime("2026-10-20T06:37:00Z", new Date("2026-10-20T07:00:00Z")), "اليوم 09:37");
  // يوم تانى بتوقيت القاهرة (23:30Z يوم ٣١ = 01:30 يوم ١ نوفمبر)
  assert.equal(fmtUploadTime("2026-10-31T23:30:00Z", new Date("2026-11-02T08:00:00Z")), "01/11 01:30");
  assert.equal(fmtUploadTime(null), "لم يُرفع");
});
