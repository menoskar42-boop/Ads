/**
 * هل القاعدة اللي إحنا متوصّلين بيها هي بتاعة Service Flow فعلاً؟
 *
 * الغلط اللي الملف ده اتعمل عشانه، وحصل فعلاً وقت النقل:
 * `SERVICEFLOW_DATABASE_URL` اتظبّط على قاعدة **الكتاب المقدس** بدل قاعدة
 * Service Flow. والنتيجة في اللوج:
 *
 *   error: foreign key constraint "orders_sales_id_fkey" cannot be implemented
 *   detail: Key columns "sales_id" and "id" are of incompatible types
 *   code: 42804
 *
 * لأن `users.id` عند الكتاب المقدس **UUID** وعند Service Flow **integer**.
 *
 * ⚠️ واللي أنقذنا هو الصدفة. بوستجرس رفض لإن الأنواع مختلفة — ولو كانت
 * اتفقت، `ensureSchema` كانت هتنشئ جداول Service Flow **جوّه قاعدة
 * الكتاب المقدس** وتكتب في جدول `users` بتاع الـ٧٠٠ عضو. التحقّق ده
 * بيشيل الاعتماد على الصدفة دي.
 *
 * الفكرة: كل تطبيق عنده جداول بصمة مالهاش وجود عند غيره. لو لقينا بصمة
 * تطبيق تاني في القاعدة، يبقى إحنا في المكان الغلط — **مابنقومش**.
 */
import type { Pool } from "pg";

/** جداول بتقول «دي مش قاعدة Service Flow». */
const FOREIGN_SIGNATURES: { table: string; app: string }[] = [
  { table: "bible_verses", app: "الكتاب المقدس (mybible)" },
  { table: "reading_groups", app: "الكتاب المقدس (mybible)" },
  { table: "companies", app: "أوسكار ديفز" },
  { table: "banner_ads", app: "أوسكار ديفز" },
];

/** جدول بيقول «دي قاعدة Service Flow» — للتأكيد الإيجابي. */
const OWN_SIGNATURE = "work_orders";

export interface DbIdentityResult {
  ok: boolean;
  /** اسم التطبيق التاني اللي بصمته لقيناها، لو فيه. */
  foreignApp: string | null;
  /** هل لقينا بصمة Service Flow نفسها؟ (قاعدة فاضية جديدة = false، وده مسموح) */
  hasOwn: boolean;
  /** نوع `users.id` الفعلي في القاعدة، أو null لو الجدول مش موجود. */
  usersIdType: string | null;
  message: string;
}

/** الأنواع اللي `serial` بتتحوّل ليها — ده اللي Service Flow بيتوقّعه. */
const INTEGER_TYPES = new Set(['integer', 'bigint', 'smallint']);

export async function checkDbIdentity(pool: Pool): Promise<DbIdentityResult> {
  const names = [...FOREIGN_SIGNATURES.map((s) => s.table), OWN_SIGNATURE];
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = ANY (current_schemas(false))
        AND table_name = ANY ($1::text[])`,
    [names],
  );
  const present = new Set(rows.map((r) => r.table_name));

  const foreign = FOREIGN_SIGNATURES.find((s) => present.has(s.table));
  const hasOwn = present.has(OWN_SIGNATURE);

  /* نوع `users.id` — بصمة أقوى من أسماء الجداول.
   * Service Flow بيعرّفه `serial` (integer). لو لقيناه uuid أو text، فالقاعدة
   * دي بتاعة تطبيق تاني مهما كانت أسماء جداولها. */
  const idTypeRes = await pool.query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = ANY (current_schemas(false))
        AND table_name = 'users' AND column_name = 'id'
      LIMIT 1`,
  );
  const usersIdType = idTypeRes.rows[0]?.data_type ?? null;

  if (foreign) {
    return {
      ok: false,
      foreignApp: foreign.app,
      hasOwn,
      usersIdType,
      message:
        `SERVICEFLOW_DATABASE_URL بيوجّه على قاعدة **${foreign.app}** مش قاعدة ` +
        `Service Flow (لقينا جدول «${foreign.table}» جوّاها). ` +
        `مش هنقوم — تشغيل Service Flow هنا معناه إنشاء جداوله جوّه قاعدة تطبيق ` +
        `تاني والكتابة في بياناته. هات رابط قاعدة Service Flow من تبويب Database ` +
        `في مشروعها على ريبليت.`,
    };
  }

  if (usersIdType && !INTEGER_TYPES.has(usersIdType)) {
    return {
      ok: false,
      foreignApp: null,
      hasOwn,
      usersIdType,
      message:
        `جدول \`users\` في القاعدة دي عموده \`id\` نوعه **${usersIdType}**، ` +
        `وService Flow بيعرّفه \`serial\` (integer). القاعدة دي مش بتاعته — ` +
        `ولو كمّلنا، إنشاء \`orders\` هيفشل على القيد ` +
        `(foreign key "orders_sales_id_fkey" … incompatible types). ` +
        `راجع SERVICEFLOW_DATABASE_URL.`,
    };
  }

  return {
    ok: true,
    foreignApp: null,
    hasOwn,
    usersIdType,
    message: hasOwn
      ? `القاعدة بتاعة Service Flow — اتأكدنا (users.id = ${usersIdType ?? 'الجدول لسه مش موجود'}).`
      : `قاعدة فاضية (مفيش جداول Service Flow ولا بصمة تطبيق تاني، users.id = ${usersIdType ?? 'مش موجود'}) — هنكمّل وننشئ الجداول.`,
  };
}
