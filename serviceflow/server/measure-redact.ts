/**
 * السرعات والاسكور لكل خط — للسوبر أدمن بس (المالك ٢٠٢٦-١٠-١٩).
 *
 * «مش عاوز أى مستخدم يشوف أعمدة السرعة أو الاسكور فى أى جدول غير السوبر أدمن. باقى المستخدمين
 * ممكن يشوفوا السرعات فى تقرير بحث برقم التليفون بس، وممكن يشوفوا متوسطات القياس لكل كابينة
 * أو بكس — لكن لا يشوفوا التفصيلى اللى بيوضّح قياس كل رقم تليفون».
 *
 * الحماية هنا على السيرفر (مش إخفاء أعمدة فى الشاشة بس): أى رد JSON لمستخدم مش سوبر أدمن
 * بيتشال منه كل حقل سرعة/اسكور خاص بخط — والمتوسطات (avg… · sum… · box… · cabinet…) بتفضل.
 * المستثنى: مسارات «بحث برقم التليفون» (رقم واحد بيتبحث عنه).
 */

/** مسارات «بحث برقم التليفون» — السرعات بتظهر فيها لكل المستخدمين. */
export const MEASURE_OPEN_PATHS: RegExp[] = [
  /^\/api\/phone-lines\/lookup(\/|$|\?)/,
  /^\/api\/line-accounts\//,
  /^\/api\/manual-faults\/for-line(\/|$|\?)/,
  /^\/api\/proxy\/box-ground-ticket(\/|$|\?)/,
];

/** حقل متوسط/تجميعة (مسموح): avgScore · boxAvgScore · sum_score · cabinetAvgSpeed … */
const AGGREGATE = /^(avg|average|mean|sum|agg|box|cabinet|cab|total|count|median)/;
/** حقل سرعة/اسكور خاص بخط (ممنوع): score · current_speed · maxSpeed · lineMaxSpeed · lastMeasScore … */
const MEASURE = /(score|speed|attainable|actualrate|ratekbps|سرعه|سرعة|اسكور|سكور)/;
/** فلاتر/إعدادات مش قياس (scoreFrom فى الطلب، needsSpeed علم، …) — بتفضل. */
const NOT_A_VALUE = /^(needs|isneeds|ishigh|islow|has|exclude|lowscoremode|scorefrom|scoreto|scorelt|scoregt|speedlt|speedgt|minscore)/;

/** المفتاح ده سرعة/اسكور لخط؟ (بعد شيل المسافات والشرط) */
export function isLineMeasureKey(key: string): boolean {
  const k = String(key).toLowerCase().replace(/[\s_\-().]/g, "");
  if (!MEASURE.test(k)) return false;
  if (AGGREGATE.test(k) || NOT_A_VALUE.test(k) || k.endsWith("count")) return false;
  return true;
}

/** نسخة من الرد من غير حقول سرعة/اسكور الخطوط (بيمشى جوّه الـarrays والـobjects، ومنها raw_data). */
export function redactMeasures<T>(value: T, depth = 0): T {
  if (depth > 12 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactMeasures(v, depth + 1)) as unknown as T;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isLineMeasureKey(k)) continue;
    out[k] = redactMeasures(v, depth + 1);
  }
  return out as T;
}

/** Express middleware: بيلف res.json لكل طلب /api من مستخدم مسجّل مش سوبر أدمن. */
export function measureRedactor(superAdminRole: string) {
  return (req: any, res: any, next: any) => {
    const url: string = req.originalUrl || req.url || "";
    if (!url.startsWith("/api/")) return next();
    const user = typeof req.isAuthenticated === "function" && req.isAuthenticated() ? req.user : null;
    if (!user || user.role === superAdminRole) return next();
    if (MEASURE_OPEN_PATHS.some((re) => re.test(url))) return next();
    const json = res.json.bind(res);
    res.json = (body: unknown) => json(redactMeasures(body));
    next();
  };
}
