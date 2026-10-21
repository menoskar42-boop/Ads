/**
 * «العرض التقديمى» (المالك ٢٠٢٦-١٠-٢٠): نفس شكل عرض منطقة أسيوط (الريفرنس) بس لإدارة سنترالات
 * الغنايم — للاجتماع مع رئيس القطاعات الجنوبية. اللى Service Flow عارفه بيتجاب لوحده (خطوط، كباين،
 * بكسيات، MSAN، عملاء الصوت والداتا على MSAN، الأكونتات، الأعطال سنة بسنة، صيانة البكسيات)،
 * واللى مش عنده خانات بيكتبها المالك. الأقسام الاختيارية (حياة كريمة · الإنجازات · رؤية التطوير …)
 * ليها مفتاح تشغيل.
 *
 * التخزين: app_settings (مفتاح واحد للبيانات + مفتاح لكل صورة) — من غير جداول جديدة.
 * الأرقام التلقائية قراية بس، وكل رقم ممكن يتكتب فوقه (overrides) لو المالك عنده رقم أدق.
 */
import {
  defaultDeck, normalizeDeck, deckValue, faultsStartMonth, DECK_KEY, IMG_PREFIX, DEFAULT_EXCHANGES,
  type Deck, type DeckExchange, type DeckAuto, type ExchangeAuto,
} from "../shared/presentation-deck";
export { defaultDeck, normalizeDeck, deckValue, DECK_KEY, IMG_PREFIX, DEFAULT_EXCHANGES };
export type { Deck, DeckExchange, DeckAuto, ExchangeAuto };

import { phoneNormSql } from "./phone-norm";

type Q = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

// اسم السنترال للمقارنة: «الغنايم - دير الجنادلة» = «الغنايم-دير الجنادله»
const NORM = (col: string) => `regexp_replace(translate(lower(COALESCE(${col}, '')), 'ةىأإآ', 'هيااا'), '\\s+', '', 'g')`;
const normJs = (s: string) => s.toLowerCase().replace(/[ة]/g, "ه").replace(/[ى]/g, "ي").replace(/[أإآ]/g, "ا").replace(/\s+/g, "");

const EMPTY: ExchangeAuto = { lines: 0, copperCabinets: 0, msanCabinets: 0, boxes: 0, capacity: 0, msanVoice: 0, msanData: 0, accounts: 0, dataUsed: 0, voiceUsed: 0, weData: 0 };

/** الأرقام التلقائية لكل سنترال من Service Flow — قراية بس. */
export async function autoDeck(db: Q, deck: Deck): Promise<DeckAuto> {
  const errors: string[] = [];
  const exchanges: Record<string, ExchangeAuto> = {};
  const keys = deck.exchanges.map((e) => normJs(e.match || e.name));
  const codeOf = new Map(deck.exchanges.map((e, i) => [keys[i], e.code || e.name]));
  for (const e of deck.exchanges) exchanges[e.code || e.name] = { ...EMPTY };
  const add = (rows: any[], field: keyof ExchangeAuto) => {
    for (const r of rows) {
      const code = codeOf.get(String(r.k));
      if (code) exchanges[code][field] = Number(r.n) || 0;
    }
  };
  const run = async (label: string, sql: string, field: keyof ExchangeAuto) => {
    try { add((await db.query(sql, [keys])).rows, field); } catch (e: any) { errors.push(`${label}: ${e?.message || e}`); }
  };
  await run("الخطوط", `SELECT ${NORM("central")} AS k, COUNT(DISTINCT tel_no) AS n FROM phone_lines
                       WHERE ${NORM("central")} = ANY($1::text[]) GROUP BY 1`, "lines");
  await run("الكباين النحاس", `SELECT ${NORM("central")} AS k, COUNT(DISTINCT btrim(cabin_number)) AS n FROM phone_lines
                       WHERE ${NORM("central")} = ANY($1::text[]) AND NULLIF(btrim(cabin_number), '') IS NOT NULL GROUP BY 1`, "copperCabinets");
  await run("البكسيات", `SELECT ${NORM("central")} AS k, COUNT(DISTINCT (btrim(cabin_number), btrim(box_number))) AS n FROM phone_lines
                       WHERE ${NORM("central")} = ANY($1::text[]) AND NULLIF(btrim(box_number), '') IS NOT NULL GROUP BY 1`, "boxes");
  await run("كباين MSAN", `SELECT ${NORM("central_name")} AS k, COUNT(DISTINCT btrim(cabin_code)) AS n FROM cabinet_technicians
                       WHERE ${NORM("central_name")} = ANY($1::text[]) AND NULLIF(btrim(cabin_code), '') IS NOT NULL GROUP BY 1`, "msanCabinets");
  await run("السعة", `SELECT ${NORM("central_name")} AS k, COALESCE(SUM(secondary_capacity), 0) AS n FROM cabinet_capacity
                       WHERE ${NORM("central_name")} = ANY($1::text[]) GROUP BY 1`, "capacity");
  // عملاء الصوت/الداتا على MSAN: ملف FTTH/MSAN بكود الوحدة ← الكابينة ← السنترال
  const msanSql = (col: string) => `SELECT k, SUM(n) AS n FROM (
      SELECT DISTINCT ON (f.id) ${NORM("ct.central_name")} AS k, COALESCE(f.${col}, 0) AS n
        FROM ftth_subscribers f JOIN cabinet_technicians ct ON btrim(ct.cabin_code) = btrim(f.msan_gpon_code)
       WHERE ${NORM("ct.central_name")} = ANY($1::text[])) x GROUP BY 1`;
  await run("عملاء الصوت MSAN", msanSql("fv_subs"), "msanVoice");
  await run("عملاء الداتا MSAN", msanSql("fbb_subs"), "msanData");
  await run("الأكونتات", `SELECT ${NORM("pl.central")} AS k, COUNT(DISTINCT la.full_phone) AS n FROM line_accounts la
                       JOIN phone_lines pl ON pl.full_phone = la.full_phone
                       WHERE ${NORM("pl.central")} = ANY($1::text[]) AND NULLIF(btrim(la.account_no), '') IS NOT NULL GROUP BY 1`, "accounts");
  // المالك ٢٠٢٦-١٠-٢٠: «عدد عملاء البيانات هم اللى خانة الداتا فى بيانات البروفيجيونال used مش free»
  await run("عملاء البيانات", `SELECT ${NORM("pl.central")} AS k, COUNT(DISTINCT pp.phone_number) AS n FROM phone_ports pp
                       JOIN phone_lines pl ON pl.full_phone = pp.phone_number
                       WHERE ${NORM("pl.central")} = ANY($1::text[]) AND lower(btrim(COALESCE(pp.data_status, ''))) LIKE 'used%' GROUP BY 1`, "dataUsed");
  await run("الشغال صوت", `SELECT ${NORM("pl.central")} AS k, COUNT(DISTINCT pp.phone_number) AS n FROM phone_ports pp
                       JOIN phone_lines pl ON pl.full_phone = pp.phone_number
                       WHERE ${NORM("pl.central")} = ANY($1::text[]) AND lower(btrim(COALESCE(pp.voice_status, ''))) LIKE 'used%' GROUP BY 1`, "voiceUsed");
  // «عدد عملاء البيانات WE هما عدد الخطوط التى لها اكونت و لها بورت حالى»
  await run("عملاء بيانات WE", `SELECT ${NORM("pl.central")} AS k, COUNT(DISTINCT la.full_phone) AS n FROM line_accounts la
                       JOIN phone_lines pl ON pl.full_phone = la.full_phone
                       WHERE ${NORM("pl.central")} = ANY($1::text[]) AND NULLIF(btrim(la.account_no), '') IS NOT NULL
                         AND EXISTS (SELECT 1 FROM phone_ports pp WHERE pp.phone_number = la.full_phone) GROUP BY 1`, "weData");

  const total: ExchangeAuto = { ...EMPTY };
  for (const v of Object.values(exchanges)) for (const k of Object.keys(total) as (keyof ExchangeAuto)[]) total[k] += v[k];

  // الأعطال (المالك ٢٠٢٦-١٠-٢٠: «مؤشرات أداء الأعطال مطلوب عن عام 2026») — بنفس تعريفات تقاريرنا:
  //   · السنترال فى exchange_name (central_name دايماً فاضى فى complaint_details)
  //   · التكرار زى «إحصائيات التكرار»: الأعطال المغلقة، (عدد الأعطال − عدد الأرقام) ÷ عدد الأرقام
  //   · الإزالة خلال ٤٨ ساعة زى «إحصائيات الإزالة»: كل الأعطال، والساعات من عمود الشيت (sheetHoursSql)
  //   · التاريخ: complain_time AT TIME ZONE 'UTC' (زى التقارير)
  let faultsByYear: DeckAuto["faultsByYear"] = [];
  let faultsByMonth: DeckAuto["faultsByMonth"] = [];
  try {
    const main = keys[0] || "";
    const sql = (fmt: string) => `
      WITH c AS (
        SELECT ${phoneNormSql("cd.phone_number")} AS phone, cd.close_time,
               to_char(cd.complain_time AT TIME ZONE 'UTC', '${fmt}') AS p,
               COALESCE(cd.time_till_now, CASE
                 WHEN cd.close_time IS NULL THEN EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'Africa/Cairo') - cd.complain_time)) / 3600.0
                 ELSE EXTRACT(EPOCH FROM (cd.close_time - cd.complain_time)) / 3600.0 END) AS hours
          FROM complaint_details cd
         WHERE cd.complain_time IS NOT NULL
           AND to_char(cd.complain_time AT TIME ZONE 'UTC', 'YYYY-MM') >= $2
           AND (${NORM("cd.exchange_name")} = ANY($1::text[]) OR ${NORM("cd.central_name")} = ANY($1::text[])
                OR ($3 <> '' AND ${NORM("cd.exchange_name")} LIKE '%' || $3 || '%')))
      SELECT p, COUNT(*) AS complaints, COUNT(*) FILTER (WHERE close_time IS NOT NULL) AS closed,
             COUNT(DISTINCT phone) FILTER (WHERE close_time IS NOT NULL) AS phones,
             COUNT(*) FILTER (WHERE hours <= 24) AS in24
        FROM c GROUP BY 1 ORDER BY 1`;
    // المالك ٢٠٢٦-١٠-٢٠: الـ١٢ شهر اللى فاتوا + الشهر الحالى (من أوله لحد النهارده)، كل شهر محسوب لوحده
    const params = [keys, faultsStartMonth(new Date()), main];
    const conv = (r: any) => {
      const n = Number(r.complaints) || 0, closed = Number(r.closed) || 0, phones = Number(r.phones) || 0;
      return {
        complaints: n,
        repeatPct: phones > 0 ? Math.round((1000 * (closed - phones)) / phones) / 10 : null,
        in24Pct: n > 0 ? Math.round((1000 * (Number(r.in24) || 0)) / n) / 10 : null,
      };
    };
    faultsByMonth = (await db.query(sql("YYYY-MM"), params)).rows.map((r: any) => ({ month: String(r.p), ...conv(r), msanFaults: null }));
  } catch (e: any) { errors.push(`الأعطال: ${e?.message || e}`); }

  // «عدد الأعطال فى الألف» شهر بشهر — نفس تقرير «عدد الأعطال فى الألف» (server/cabinet-reassign.ts):
  // الأعطال = 430D + المتبقى بكود MSAN بتاع كباين الإدارة (كل بلاغ مرة واحدة على أول يوم ظهر فيه)،
  // والشغال الحالى = مجموع fbb_subs من ملف مشتركى FTTH/ADSL لنفس الأكواد. الملف ده لقطة واحدة (آخر رفع،
  // مفيش أرشيف بتاريخ) — فشغال كل شهر بيكتبه المالك فى صفحة البيانات، والفاضى = الحالى.
  let faultsWorking: number | null = null;
  try {
    const { rows: cr } = await db.query(`SELECT DISTINCT cabin_code AS c FROM cabinet_technicians
      WHERE ${NORM("central_name")} = ANY($1::text[]) AND COALESCE(cabin_code, '') <> ''`, [keys]);
    const codes = cr.map((r: any) => String(r.c));
    if (codes.length) {
      const { rows: wr } = await db.query(`SELECT COALESCE(SUM(fbb_subs), 0)::int AS n FROM ftth_subscribers WHERE msan_gpon_code = ANY($1::text[])`, [codes]);
      faultsWorking = Number(wr[0]?.n) || 0;
      const { rows: fr } = await db.query(`
        SELECT to_char(d, 'YYYY-MM') AS m, COUNT(*)::int AS n FROM (
          SELECT complain_no, MIN(d) AS d FROM (
            SELECT cd.complain_no, (cd.complain_time AT TIME ZONE 'UTC')::date AS d FROM complaint_details cd
             WHERE cd.msan_id = ANY($1::text[]) AND to_char(cd.complain_time AT TIME ZONE 'UTC', 'YYYY-MM') >= $2
            UNION ALL
            SELECT rc.complain_no, (rc.complain_time AT TIME ZONE 'UTC')::date FROM remaining_complaints rc
             WHERE rc.msan_id = ANY($1::text[]) AND to_char(rc.complain_time AT TIME ZONE 'UTC', 'YYYY-MM') >= $2
          ) u GROUP BY complain_no
        ) x GROUP BY 1 ORDER BY 1`, [codes, faultsStartMonth(new Date())]);
      const byMonth = new Map<string, any>(faultsByMonth!.map((m) => [m.month, m]));
      for (const r of fr) {
        const n = Number(r.n) || 0;
        // الأعطال فى الألف نفسها بتتحسب فى shared (monthPerThousand) على شغال كل شهر — مش هنا
        const m = byMonth.get(String(r.m));
        if (m) m.msanFaults = n;
        else byMonth.set(String(r.m), { month: String(r.m), complaints: 0, repeatPct: null, in24Pct: null, msanFaults: n });
      }
      faultsByMonth = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    }
  } catch (e: any) { errors.push(`الأعطال فى الألف: ${e?.message || e}`); }

  // صيانة البكسيات من برنامج الصيانة (نفس القاعدة — سكيما maintenance). لو منفصلة الأرقام بتتكتب بالإيد.
  let maintenance: DeckAuto["maintenance"] = null;
  try {
    const done = await db.query(`
      SELECT to_char(MAX(s.done_at) AT TIME ZONE 'Africa/Cairo', 'YYYY') AS year, mt.id
        FROM maintenance.maintenance_tasks mt
        JOIN maintenance.inspections i ON i.id = mt.inspection_id
        JOIN maintenance.maintenance_item_status s ON s.task_id = mt.id AND s.is_done = 1
       WHERE mt.technician_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM maintenance.inspection_items y WHERE y.inspection_id = i.id
                           AND y.value IN ('bad','yes') AND y.item_key NOT IN ('electricity_conflict','air_conflict','overlap','data_review')
                           AND NOT EXISTS (SELECT 1 FROM maintenance.maintenance_item_status z
                                            WHERE z.task_id = mt.id AND z.item_key = y.item_key AND z.is_done = 1))
       GROUP BY mt.id`);
    const byYear = new Map<string, number>();
    for (const r of done.rows) byYear.set(String(r.year), (byYear.get(String(r.year)) || 0) + 1);
    const tot = await db.query(`SELECT COUNT(*) AS n FROM maintenance.boxes`);
    maintenance = {
      boxesTotal: Number(tot.rows[0]?.n) || 0,
      boxesDone: done.rows.length,
      byYear: [...byYear.entries()].sort().map(([year, n]) => ({ year, done: n })),
    };
  } catch (e: any) { errors.push(`الصيانة: ${e?.message || e}`); }

  let decentLife: DeckAuto["decentLife"] = [];
  try {
    const { rows } = await db.query(`
      SELECT COALESCE(NULLIF(btrim(haya_karima), ''), '—') AS value, COUNT(DISTINCT btrim(cabin_number)) AS cabinets,
             COUNT(DISTINCT NULLIF(btrim(village_code), '')) AS villages
        FROM cabinet_technicians WHERE ${NORM("central_name")} = ANY($1::text[]) GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [keys]);
    decentLife = rows.map((r: any) => ({ value: String(r.value), cabinets: Number(r.cabinets) || 0, villages: Number(r.villages) || 0 }));
  } catch (e: any) { errors.push(`حياة كريمة: ${e?.message || e}`); }

  return { exchanges, total, faultsByYear, faultsByMonth, faultsWorking, maintenance, decentLife, errors, computedAt: new Date().toISOString() };
}

