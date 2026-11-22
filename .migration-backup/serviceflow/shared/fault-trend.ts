// «اتجاه الأعطال» — تحليل أعطال الشبكة من بيانات Service Flow (خطة ٢٠٢٦-١١-١٦ البند ١٢: إحصاء الأول، ML بعدين).
// لكل بكس/كابينة/فنى: عدد الأعطال شهر بشهر (آخر N شهور، والشهر الحالى لسه ماخلصش)، وبعدين:
//  • الاتجاه: متوسط آخر ٣ شهور كاملة قصاد متوسط الـ٣ اللى قبلهم — «بيزيد» لو زاد ٢٥٪ أو أكتر وبعطل واحد على الأقل
//    فى الشهر، و«بيقل» بنفس الشرط بالعكس، وغير كده «ثابت». أقل من ٤ شهور كاملة ⇒ «مش كفاية».
//  • متكرر: فيه أعطال فى ثلثين الشهور الكاملة على الأقل (مثلاً ٤ من ٦) — العطل مش صدفة.
//  • فى الألف: متوسط الأعطال فى الشهر الكامل ÷ الخطوط الشغّالة × ١٠٠٠.
//  • المتوقع للشهر الحالى: اللى حصل لحد النهارده ÷ نسبة الأيام اللى عدّت من الشهر.

export type TrendDir = "up" | "down" | "flat" | "na";

export interface TrendResult {
  full: number[];          // الشهور الكاملة
  current: number;         // الشهر الحالى لحد النهارده
  total: number;           // كل الشهور (الكاملة + الحالى)
  activeMonths: number;    // شهور كاملة فيها عطل واحد على الأقل
  chronic: boolean;
  avgMonth: number;        // متوسط الشهر الكامل
  per1000: number | null;  // متوسط الشهر الكامل فى الألف
  recent: number | null;   // متوسط آخر ٣ شهور كاملة
  before: number | null;   // متوسط الـ٣ اللى قبلهم
  trend: TrendDir;
  projected: number;       // المتوقع للشهر الحالى كله
}

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** مفاتيح الشهور YYYY-MM من (now - n + 1) لحد شهر now */
export function monthKeys(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** نسبة اللى عدّى من الشهر (اليوم الحالى محسوب) */
export function monthFraction(now: Date): number {
  const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.min(1, Math.max(1 / days, now.getUTCDate() / days));
}

/** counts = عدد الأعطال لكل شهر بالترتيب، وآخر عنصر = الشهر الحالى (لسه ماخلصش) */
export function analyzeTrend(counts: number[], lines: number, fraction = 1): TrendResult {
  const full = counts.slice(0, -1);
  const current = counts.length ? counts[counts.length - 1] : 0;
  const total = counts.reduce((s, x) => s + x, 0);
  const activeMonths = full.filter((c) => c > 0).length;
  const chronic = full.length >= 3 && activeMonths >= Math.ceil((full.length * 2) / 3);
  const avgMonth = avg(full);
  const per1000 = lines > 0 && full.length ? r1((avgMonth / lines) * 1000) : null;
  let trend: TrendDir = "na";
  let recent: number | null = null;
  let before: number | null = null;
  if (full.length >= 4) {
    const k = Math.min(3, Math.floor(full.length / 2));
    recent = r1(avg(full.slice(-k)));
    before = r1(avg(full.slice(-2 * k, -k)));
    const a = avg(full.slice(-k)), b = avg(full.slice(-2 * k, -k));
    if (a - b >= 1 && a >= b * 1.25) trend = "up";
    else if (b - a >= 1 && a <= b * 0.75) trend = "down";
    else trend = "flat";
  }
  const projected = r1(current / (fraction > 0 ? fraction : 1));
  return { full, current, total, activeMonths, chronic, avgMonth: r1(avgMonth), per1000, recent, before, trend, projected };
}

export const TREND_AR: Record<TrendDir, string> = { up: "بيزيد", down: "بيقل", flat: "ثابت", na: "مش كفاية" };
