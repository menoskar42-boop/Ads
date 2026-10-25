// خانة «انخفاض السرعة خلال أسبوع قبل الشكوى» فى الأعطال الحالية وخارج الشاشة (المالك ٢٠٢٦-١٠-٢٥) —
// نفس النص فى الجدول والإكسيل والـPDF. الحسبة فى server/speed-drop.ts (weekDropOf).
export const WEEK_DROP_TITLE = "انخفاض السرعة خلال أسبوع قبل الشكوى";
export type WeekDrop = { weekDrop?: "yes" | "no" | "none" | null; weekDropPct?: number | null };
export function weekDropLabel(r: WeekDrop): string {
  if (r.weekDrop === "yes") return `نعم ↓${r.weekDropPct}%`;
  if (r.weekDrop === "no") return "لا";
  return "لا — مفيش قياس";
}
