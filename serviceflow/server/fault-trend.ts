// «اتجاه الأعطال» — الاستعلام (الحساب نفسه فى shared/fault-trend.ts). نفس مصدر تقرير «عدد الأعطال فى الألف»:
// شيت التفاصيل + تفاصيل المتبقى (بدون تكرار برقم الشكوى)، مربوطين ببيان التليفونات برقم التليفون المعيارى.
import type { Express } from "express";
import type { Pool } from "pg";
import { ROLES } from "@shared/schema";
import { monthKeys, monthFraction } from "@shared/fault-trend";
import { phoneNormSql as sp } from "./phone-norm";

interface Deps {
  pool: Pool;
  requireAuth: (req: any, res: any, next: any) => void;
}

const CENTRALS = ["الغنايم", "الغنايم-العزايزة", "الغنايم-دير الجنادله", "الغنايم-نجع العمدة"];
const GROUPS = {
  box: ["pl.central", "pl.cabin_number", "pl.box_number"],
  cabinet: ["pl.central", "pl.cabin_number"],
  tech: ["COALESCE(tn.tech_name, 'غير معروف')"],
} as const;
type Group = keyof typeof GROUPS;

export function registerFaultTrend(app: Express, d: Deps) {
  const { pool, requireAuth } = d;

  // GET /api/reports/fault-trend?months=6&group=box|cabinet|tech&central=
  // ⇒ { months: ["2026-06", …, "2026-11"], fraction, rows: [{ central, cabinet, box, tech, lines, counts[] }] }
  app.get("/api/reports/fault-trend", requireAuth, async (req: any, res) => {
    const role = req.user?.role;
    if (role === ROLES.SALES || role === ROLES.SALES_ADMIN) return res.status(403).json({ message: "غير مسموح" });
    try {
      const months = Math.min(12, Math.max(3, parseInt(String(req.query.months ?? "6"), 10) || 6));
      const group: Group = (["box", "cabinet", "tech"] as const).includes(req.query.group) ? req.query.group : "box";
      const central = String(req.query.central ?? "").trim();
      const now = new Date(Date.now() + 2 * 3600_000); // تاريخ القاهرة تقريباً (الشهر واليوم)
      const keys = monthKeys(now, months);
      const from = `${keys[0]}-01`;

      const params: any[] = [CENTRALS];
      const conds = [`pl.central = ANY($1::text[])`];
      if (group === "box") conds.push(`COALESCE(pl.box_number, '') <> ''`);
      if (group !== "tech") conds.push(`COALESCE(pl.cabin_number, '') <> ''`);
      if (central) { params.push(central); conds.push(`pl.central = $${params.length}`); }
      const cols = GROUPS[group];
      const sel = cols.map((c, i) => `${c} AS k${i}`).join(", ");
      const by = cols.join(", ");
      const joins = `LEFT JOIN cabinet_technicians ct ON ct.central_name = pl.central AND ct.cabin_number = pl.cabin_number
                     LEFT JOIN technician_names tn ON tn.worker_code = ct.worker_code`;
      // الفنى: لكل بكس/كابينة أسماء الفنيين (ممكن أكتر من واحد على نفس الكابينة)
      const techSel = group === "tech" ? "" : `, COALESCE(string_agg(DISTINCT tn.tech_name, ' , '), 'غير معروف') AS tech`;

      const linesQ = pool.query(
        `SELECT ${sel}, COUNT(DISTINCT pl.tel_no)::int AS lines${techSel}
           FROM phone_lines pl ${joins}
          WHERE ${conds.join(" AND ")}
          GROUP BY ${by}`,
        params,
      );
      const fParams = [...params, from];
      const faultsQ = pool.query(
        `WITH fu AS (
           SELECT phone_number, complain_no, complain_time FROM complaint_details WHERE complain_time >= $${fParams.length}::date
           UNION
           SELECT phone_number, complain_no, complain_time FROM remaining_complaints WHERE complain_time >= $${fParams.length}::date
         )
         SELECT ${sel}, to_char(date_trunc('month', fu.complain_time), 'YYYY-MM') AS m, COUNT(DISTINCT fu.complain_no)::int AS n
           FROM phone_lines pl
           JOIN fu ON ${sp("fu.phone_number")} = pl.tel_no
           ${joins}
          WHERE ${conds.join(" AND ")}
          GROUP BY ${by}, m`,
        fParams,
      );
      const [lines, faults] = await Promise.all([linesQ, faultsQ]);

      const keyOf = (r: any) => cols.map((_, i) => String(r[`k${i}`] ?? "")).join("\u0001");
      const idx = new Map(keys.map((k, i) => [k, i]));
      const rows = new Map<string, any>();
      for (const r of lines.rows) {
        rows.set(keyOf(r), {
          central: group === "tech" ? null : r.k0,
          cabinet: group === "tech" ? null : r.k1,
          box: group === "box" ? r.k2 : null,
          tech: group === "tech" ? r.k0 : r.tech,
          lines: r.lines,
          counts: keys.map(() => 0),
        });
      }
      for (const f of faults.rows) {
        const row = rows.get(keyOf(f));
        const i = idx.get(f.m);
        if (row && i !== undefined) row.counts[i] += f.n;
      }
      res.json({ months: keys, fraction: monthFraction(now), group, rows: [...rows.values()].filter((r) => r.counts.some((c: number) => c > 0)) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
