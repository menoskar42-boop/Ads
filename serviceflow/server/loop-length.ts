// «Estimated Loop Length» زى ما سكربت DZS بيقراه من شاشة DSL — نص حر:
// «1402 meters» · «1,402 m» · «1.4 km» · «4.6 kft» · «N/A» · فاضى.
// التقرير محتاج رقم بالمتر عشان يرسم، فده التحويل الوحيد — ولو النص مش مفهوم
// بيرجع null (النقطة مابتترسمش) بدل ما نخمّن رقم.

/** أقصى طول خط معقول (٢٠ كم). أى حاجة أكبر غلطة قراية مش خط. */
export const MAX_LOOP_M = 20000;

/** A blank DZS result is not an instruction to erase the previously known loop length. */
export function preserveLoopLength(incoming: unknown, previous: unknown): string | null {
  const clean = (value: unknown) =>
    String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  return clean(incoming) ?? clean(previous);
}

export function loopMeters(raw: unknown): number | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (!s || /^n\/?a$/.test(s) || s === "-") return null;
  const m = s.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
  if (!Number.isFinite(n)) return null;
  const rest = s.slice((m.index ?? 0) + m[0].length);
  let meters = n;
  if (/^\s*kft\b/.test(rest)) meters = n * 304.8;           // kilo-feet (شائع فى DSL)
  else if (/^\s*(ft|feet|foot)\b/.test(rest)) meters = n * 0.3048;
  else if (/^\s*(km|كم|كيلو)/.test(rest)) meters = n * 1000;
  // غير كده (m / meters / متر / من غير وحدة) = متر
  if (!(meters > 0) || meters > MAX_LOOP_M) return null;
  return Math.round(meters);
}

/**
 * السرعة من case_138 (نص) لـ kbps رقم. نفس قاعدة autoPoStopAccounts: الرقم اللى
 * فيه «.» بيبقى Mbps فبيتضرب × 1024. N/A أو فاضى → null.
 */
export function speedKbps(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s || /n\/?a/i.test(s)) return null;
  if (s.includes(".")) {
    const n = Number(s.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1024) : null;
  }
  const n = Number(s.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
