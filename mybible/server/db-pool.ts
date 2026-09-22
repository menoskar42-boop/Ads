import pg from "pg";

const configuredMax = Number.parseInt(
  process.env.MYBIBLE_PG_POOL_MAX || "4",
  10,
);
const max = Number.isFinite(configuredMax) && configuredMax > 0
  ? configuredMax
  : 5;

/* MyBible shares one Supabase project and one session-pooler account with the
 * parent Ads process. One process-wide pool keeps their combined connection
 * ceiling below Supabase's limit; parallel requests wait here instead of
 * failing with EMAXCONNSESSION.
 *
 * ⚠️ السقف الافتراضي هنا **٤** عمداً. صفحة المجموعة قد تطلق أكثر من
 * نداء في نفس اللحظة، لكن الطلبات تنتظر داخل هذا الـPool بدل أن تفتح
 * اتصالات تتجاوز سقف Session Pooler المشترك مع Ads وService Flow.
 * إعداد الإنتاج يستطيع تغييره صراحة عبر MYBIBLE_PG_POOL_MAX. */
/* ⚠️ `idleTimeoutMillis` كانت ٣٠ ثانية، وده غالي جداً بعد النقل لسوبابيز.
 *
 * القياس من `/api/health` على الموقع الحي: `pingMs` **١٠٥** لما يكون فيه
 * اتصال مفتوح، و**٨٠٦** لما الحوض يضطر يفتح اتصال جديد. الفرق ده هو
 * مصافحة TLS + المصادقة على مسافة قارة.
 *
 * وبـ٣٠ ثانية، أي هدوء نص دقيقة بيقفل الاتصالات — فأول زائر بعد الهدوء
 * بيدفع ٨٠٠ مللي، وده بالظبط إحساس «الموقع بطيء أول ما أفتحه». عشر
 * دقايق بتخلّي الاتصال عايش خلال يوم عادي، و`keepAlive` بيمنع أي
 * وسيط في النص من قفل السوكيت في الهدوء. */
export const dbPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10 * 60_000,
  keepAlive: true,
});

dbPool.on("error", (error) => {
  console.error("[pg] shared idle client error (recovered):", error.message);
});
