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
  defaultDeck, normalizeDeck, deckValue, DECK_KEY, IMG_PREFIX, DEFAULT_EXCHANGES,
  type Deck, type DeckExchange, type DeckAuto, type ExchangeAuto,
} from "../shared/presentation-deck";
export { defaultDeck, normalizeDeck, deckValue, DECK_KEY, IMG_PREFIX, DEFAULT_EXCHANGES };
export type { Deck, DeckExchange, DeckAuto, ExchangeAuto };

type Q = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

// اسم السنترال للمقارنة: «الغنايم - دير الجنادلة» = «الغنايم-دير الجنادله»
const NORM = (col: string) => `regexp_replace(translate(lower(COALESCE(${col}, '')), 'ةىأإآ', 'هيااا'), '\\s+', '', 'g')`;
const normJs = (s: string) => s.toLowerCase().replace(/[ة]/g, "ه").replace(/[ى]/g, "ي").replace(/[أإآ]/g, "ا").replace(/\s+/g, "");

const EMPTY: ExchangeAuto = { lines: 0, copperCabinets: 0, msanCabinets: 0, boxes: 0, capacity: 0, msanVoice: 0, msanData: 0, accounts: 0, dataUsed: 0, weData: 0 };

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
  // «عدد عملاء البيانات WE هما عدد الخطوط التى لها اكونت و لها بورت حالى»
  await run("عملاء بيانات WE", `SELECT ${NORM("pl.central")} AS k, COUNT(DISTINCT la.full_phone) AS n FROM line_accounts la
                       JOIN phone_lines pl ON pl.full_phone = la.full_phone
                       WHERE ${NORM("pl.central")} = ANY($1::text[]) AND NULLIF(btrim(la.account_no), '') IS NOT NULL
                         AND EXISTS (SELECT 1 FROM phone_ports pp WHERE pp.phone_number = la.full_phone) GROUP BY 1`, "weData");

  const total: ExchangeAuto = { ...EMPTY };
  for (const v of Object.values(exchanges)) for (const k of Object.keys(total) as (keyof ExchangeAuto)[]) total[k] += v[k];

  let faultsByYear: DeckAuto["faultsByYear"] = [];
  try {
    const { rows } = await db.query(`
      WITH c AS (
        SELECT regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') AS phone, complain_time, close_time
          FROM complaint_details
         WHERE complain_time IS NOT NULL AND ${NORM("central_name")} = ANY($1::text[])),
      l AS (SELECT *, LAG(complain_time) OVER (PARTITION BY phone ORDER BY complain_time) AS prev FROM c)
      SELECT to_char(complain_time, 'YYYY') AS year, COUNT(*) AS complaints,
             ROUND(100.0 * COUNT(*) FILTER (WHERE prev IS NOT NULL AND complain_time - prev <= interval '30 days') / NULLIF(COUNT(*), 0), 1) AS repeat_pct,
             ROUND(100.0 * COUNT(*) FILTER (WHERE close_time IS NOT NULL AND close_time - complain_time <= interval '48 hours')
                   / NULLIF(COUNT(*) FILTER (WHERE close_time IS NOT NULL), 0), 1) AS in48_pct
        FROM l WHERE to_char(complain_time, 'YYYY') >= $2 GROUP BY 1 ORDER BY 1`, [keys, deck.faults.fromYear || "2000"]);
    faultsByYear = rows.map((r: any) => ({
      year: String(r.year), complaints: Number(r.complaints) || 0,
      repeatPct: r.repeat_pct == null ? null : Number(r.repeat_pct), in48Pct: r.in48_pct == null ? null : Number(r.in48_pct),
    }));
  } catch (e: any) { errors.push(`الأعطال: ${e?.message || e}`); }

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

  return { exchanges, total, faultsByYear, maintenance, decentLife, errors, computedAt: new Date().toISOString() };
}

