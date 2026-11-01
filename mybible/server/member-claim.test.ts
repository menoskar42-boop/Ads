// «أنا عضو 372» (المالك ٢٠٢٦-١١-٠١): القواعد الخالصة — شكل الرسالة بالظبط، ومين يقدر ياخد أنهى عضوية.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMemberClaim, decideMemberClaim, isSystemName, checkAdminProfile, SYSTEM_SENDER } from "./guest-identity";

test("the message must be exactly «أنا عضو N» or «انا عضو N» — not one extra character", () => {
  assert.equal(parseMemberClaim("أنا عضو 372"), 372);
  assert.equal(parseMemberClaim("انا عضو 372"), 372);
  assert.equal(parseMemberClaim("  انا عضو 372 \n"), 372, "مسافات الأول والآخر بس");
  assert.equal(parseMemberClaim("انا عضو ٣٧٢"), 372, "أرقام كيبورد الموبايل العربى");
  // المسافات براحتها (المالك: «ممكن تتكتب انا عضو372»)
  for (const ok of ["انا عضو372", "اناعضو 372", "اناعضو372", "انا  عضو   372", "أنا\u00A0عضو 372", "انا عضو\u200F372"]) {
    assert.equal(parseMemberClaim(ok), 372, ok);
  }
  // بس مفيش ولا حرف زيادة
  for (const bad of ["أنا عضو 372.", "انا العضو 372", "انا عضو 372 يا جماعة", "أنا عضو رقم 372", "انا عضو 372 3",
    "إنا عضو 372", "انا عضو", "انا عضو 0", "انا عضو 37a", "انا عضو 372 🙏", "@النظام انا عضو 372", "انا عضوه 372", "وانا عضو 372"]) {
    assert.equal(parseMemberClaim(bad), null, bad);
  }
});

const t = (d: string) => new Date(`2026-${d}T10:00:00Z`);
const members = [
  { id: 1, userName: "عضو 372", phone: null, isAdmin: false, joinedAt: t("09-01") },
  { id: 2, userName: "عضو 1001", phone: null, isAdmin: false, joinedAt: t("10-30") },
  { id: 3, userName: "مينا سمير", phone: "01000000000", isAdmin: false, joinedAt: t("08-01") },
  { id: 4, userName: "عضو 50", phone: "01111111111", isAdmin: false, joinedAt: t("08-02") },
  { id: 5, userName: "عضو 7", phone: null, isAdmin: true, joinedAt: t("07-01") },
  { id: 6, userName: "عضو 2000", phone: null, isAdmin: false, joinedAt: t("11-01") },
];
const by = (id: number) => members.find((m) => m.id === id)!;

test("a new unregistered member takes an older unregistered «عضو N» — nothing with a phone or admin", () => {
  const ok = decideMemberClaim(members, by(2), 372);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.target.id, 1);
  const reason = (sender: number, n: number) => { const d = decideMemberClaim(members, by(sender), n); return d.ok ? "ok" : d.reason; };
  assert.equal(reason(2, 50), "registered-target", "عضو برقم موبايل ⇒ يرجع باسمه ورقمه");
  assert.equal(reason(2, 7), "registered-target", "الأدمن مايتاخدش");
  assert.equal(reason(2, 999), "no-target");
  assert.equal(reason(2, 1001), "self");
  assert.equal(reason(2, 2000), "newer-target", "العضوية القديمة لازم تكون أقدم");
  assert.equal(reason(3, 372), "not-guest-sender", "المتسجّل مايستخدمش الطريقة دى");
  assert.equal(reason(5, 372), "not-guest-sender", "ولا الأدمن");
});

test("«النظام» is reserved — no member can be named it", () => {
  assert.equal(isSystemName(SYSTEM_SENDER), true);
  assert.equal(isSystemName(" النظام "), true);
  assert.equal(isSystemName("نظام"), false);
  assert.equal(checkAdminProfile([], 1, "النظام", "01234567890").ok, false);
});
