// «جلب الموبايل من WFM» (المالك ٢٠٢٦-١٠-١١) — تنضيف الرقم اللى السكربت قراه من نافذة
// «customer Mobile No». بيرجّع الرقم أرقام بس، أو null لو فاضى/مش رقم (شَرطة، «N/A»، أصفار).
// المالك ٢٠٢٦-١٠-١٢: **الرقم لازم يبدأ بصفر على الشمال** — غير كده مش رقم موبايل (WFM بيكتب
// «1900000000» لما مفيش رقم). «0020…» بس بيتحوّل لـ«0…».
export function cleanWfmMobile(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  if (!d || /^0+$/.test(d)) return null;
  if (d.startsWith("0020")) d = "0" + d.slice(4);
  if (!d.startsWith("0")) return null;
  if (d.length < 7 || d.length > 15) return null;
  return d;
}
