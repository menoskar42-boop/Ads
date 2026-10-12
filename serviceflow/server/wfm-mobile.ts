// «جلب الموبايل من WFM» (المالك ٢٠٢٦-١٠-١١) — تنضيف الرقم اللى السكربت قراه من نافذة
// «customer Mobile No». بيرجّع موبايل مصرى بصيغة 01xxxxxxxxx، أو رقم تانى معقول (أرضى مثلاً)
// زى ما هو أرقام بس، أو null لو فاضى/مش رقم (شَرطة، «N/A»، أصفار).
export function cleanWfmMobile(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, "");
  if (!d || /^0+$/.test(d)) return null;
  if (d.startsWith("0020")) d = d.slice(4);
  else if (d.startsWith("20") && d.length === 12) d = d.slice(2);
  if (/^1[0125]\d{8}$/.test(d)) d = "0" + d;
  if (d.length < 7 || d.length > 15) return null;
  return d;
}
