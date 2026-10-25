// تقريرين «انخفاض السرعة» (بعد الانتظام · خلال أسبوع): نسبة نزول السرعة الحالية عن سرعة المقارنة.
// المالك ٢٠٢٦-١٠-٢٥: اسكور ١٠١ معناه إن السرعة بقت صفر ⇒ الحالية = ٠ والخط بيدخل بانخفاض ١٠٠٪
// (من غيرها السرعة بتتقرا «مش معروفة» والخط كان بيقع من التقريرين).
import { speedKbps } from "./loop-length";

export const SPEED_ZERO_SCORE = 101;

export function speedDropOf(r: { firstSpeed: unknown; lastSpeed: unknown; lastScore: unknown }) {
  const first = speedKbps(r.firstSpeed);
  const last = r.lastScore != null && Number(r.lastScore) === SPEED_ZERO_SCORE ? 0 : speedKbps(r.lastSpeed);
  // سرعة المقارنة لازم تكون معروفة وأكبر من صفر — من صفر مفيش «انخفاض»
  const dropPct = first && last != null ? Math.round(((first - last) / first) * 1000) / 10 : null;
  return { firstKbps: first, lastKbps: last, dropPct };
}
