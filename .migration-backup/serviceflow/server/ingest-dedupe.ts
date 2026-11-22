// النتيجة ماتتسجّلش مرتين (المالك ٢٠٢٦-١٠-٢٩، بعد رأى موديل تانى): سكربتات التمبر منكى بقت
// تكتب كل نتيجة فى طابور عندها **قبل** ما تبعتها، وتمسحها بس لما السيرفر يأكّد. فلو الرد ضاع
// فى الشبكة أو التاب اتقفل فى النص، النتيجة بتتبعت تانى — بنفس الرقم (?sf_eid=…).
// هنا: أول مرة الرقم ده يوصل بيعدّى للمسار عادى. ولو وصل تانى بعد ما اتسجّل ⇒ «اتسجّلت قبل كده»
// من غير ما المسار يشتغل. ولو لسه بيتسجّل (الأولى ماخلصتش) ⇒ ٤٢٥ (السكربت بيسيبها ويجرّب بعدين).
// ولو التسجيل الأول فشل (مش 2xx) الرقم بيتمسح، فالمحاولة الجاية بتشتغل من الأول.
import type { NextFunction, Request, Response } from "express";

type Query = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

const EID_RE = /^[a-z0-9]{6,40}$/i;
const STALE_MS = 10 * 60 * 1000;   // محاولة «لسه بتتسجّل» من أكتر من ١٠ دقايق = ماتت — التانية تاخد مكانها
const KEEP = "14 days";
const SWEEP_MS = 6 * 60 * 60 * 1000;

export function ingestDedupe(query: Query, now: () => number = Date.now) {
  let lastSweep = 0;
  // الرد بتاع «اتسجّلت قبل كده» بيطلع قبل المسار، فمفيش اللى يحط CORS — والسكربتات اللى بتبعت
  // من صفحة مواقع الشركة (fetch) لو ماشافتش الهيدر ده هتفتكرها فشلت وتعيدها للأبد.
  const reply = (res: Response, status: number, body: object) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-SF-Duplicate", "1");
    res.status(status).json(body);
  };
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST" || !req.path.startsWith("/api/")) return next();
    const eid = String((req.query as any)?.sf_eid || "").trim();
    if (!EID_RE.test(eid)) return next();
    try {
      const ins = await query(
        `INSERT INTO sf_ingest_events (event_id, path) VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
        [eid, req.path.slice(0, 200)],
      );
      if (!ins.rows.length) {
        const { rows } = await query(
          `SELECT status, extract(epoch FROM created_at) * 1000 AS at FROM sf_ingest_events WHERE event_id = $1`, [eid]);
        const row = rows[0];
        if (row && row.status === "done") return reply(res, 200, { ok: true, duplicate: true });
        const stale = row && now() - Number(row.at) > STALE_MS;
        if (row && !stale) return reply(res, 425, { ok: false, retry: true, message: "النتيجة دى لسه بتتسجّل — هتتبعت تانى" });
        // ماتت فى النص (أو اتمسحت بين السطرين) ⇒ المحاولة دى تاخد الرقم وتكمّل
        await query(
          `INSERT INTO sf_ingest_events (event_id, path) VALUES ($1, $2)
           ON CONFLICT (event_id) DO UPDATE SET status = 'processing', created_at = now()`,
          [eid, req.path.slice(0, 200)],
        );
      }
    } catch {
      // جدول الأرقام وقع؟ النتيجة أهم من منع التكرار — تعدّى للمسار عادى
      return next();
    }
    res.on("finish", () => {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      query(ok ? `UPDATE sf_ingest_events SET status = 'done' WHERE event_id = $1`
               : `DELETE FROM sf_ingest_events WHERE event_id = $1`, [eid]).catch(() => {});
    });
    if (now() - lastSweep > SWEEP_MS) {
      lastSweep = now();
      query(`DELETE FROM sf_ingest_events WHERE created_at < now() - interval '${KEEP}'`).catch(() => {});
    }
    next();
  };
}
