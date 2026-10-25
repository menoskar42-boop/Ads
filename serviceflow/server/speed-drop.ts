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

// ───── «انخفاض السرعة خلال أسبوع» قبل الشكوى (المالك ٢٠٢٦-١٠-٢٥) — للأعطال الحالية وخارج الشاشة ─────
// نفس حسبة التقرير بس فى لحظة الشكوى بدل دلوقتى: السرعة وقت الشكوى = آخر قياس «بدون Real» فى الأسبوع اللى
// قبلها، قصاد سرعة الخط من أسبوع (آخر قياس قبل الأسبوع لحد أسبوع كمان، وإلا أول قياس جوّه الأسبوع).
export const WEEK_DROP_MIN = 10;
const AT = "COALESCE(c.measured_at, c.uploaded_at)";
/** joins بتتحط بعد FROM — `fp` = التليفون الكامل (88+)، `at` = وقت الشكوى timestamptz */
export const weekDropJoinSql = (fp: string, at: string) => `
  LEFT JOIN LATERAL (
    SELECT c.id, c.current_speed, c.score, ${AT} AS at
      FROM case_138 c
     WHERE c.full_phone = ${fp} AND c.measure_mode = 'noreal'
       AND ${AT} <= ${at} AND ${AT} > ${at} - interval '7 days'
     ORDER BY ${AT} DESC, c.id DESC LIMIT 1
  ) wdl ON true
  LEFT JOIN LATERAL (
    SELECT c.current_speed, ${AT} AS at
      FROM case_138 c
     WHERE wdl.id IS NOT NULL AND c.full_phone = ${fp} AND c.measure_mode = 'noreal' AND c.id <> wdl.id
       AND ${AT} >= ${at} - interval '14 days' AND ${AT} < wdl.at
     ORDER BY (${AT} <= ${at} - interval '7 days') DESC,
              CASE WHEN ${AT} <= ${at} - interval '7 days' THEN ${AT} END DESC NULLS LAST, ${AT}, c.id
     LIMIT 1
  ) wdb ON true`;
export const WEEK_DROP_COLS = `wdb.current_speed AS "wdFirstSpeed", wdl.current_speed AS "wdLastSpeed", wdl.score AS "wdLastScore",
  (wdb.at AT TIME ZONE 'Africa/Cairo') AS "wdFirstAt", (wdl.at AT TIME ZONE 'Africa/Cairo') AS "wdLastAt"`;
/** yes = نزلت أكتر من ١٠٪ · no = اتقاس ومانزلش · none = مفيش قياسين فى الأسبوعين قبل الشكوى */
export function weekDropOf(r: { wdFirstSpeed?: unknown; wdLastSpeed?: unknown; wdLastScore?: unknown; wdFirstAt?: unknown; wdLastAt?: unknown }) {
  const { firstKbps, lastKbps, dropPct } = speedDropOf({ firstSpeed: r.wdFirstSpeed, lastSpeed: r.wdLastSpeed, lastScore: r.wdLastScore });
  const weekDrop = r.wdFirstAt == null || r.wdLastAt == null || dropPct == null ? "none"
    : dropPct > WEEK_DROP_MIN ? "yes" : "no";
  return { weekDrop, weekDropPct: dropPct, weekDropFromKbps: firstKbps, weekDropToKbps: lastKbps };
}
