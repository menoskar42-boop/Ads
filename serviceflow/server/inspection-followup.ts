import type { Express } from "express";
import type { Pool } from "pg";
import { REJECTION_REASONS, ROLES } from "@shared/schema";
import { boxAverageFromAggregates, isBoxBrokenReason } from "@shared/om-box-score";
import { boxKey, expandBoxes } from "@shared/cab-norm";

type Section = "maintenance" | "om" | "installations";

interface Deps {
  pool: Pool;
  requireAuth: (req: any, res: any, next: any) => void;
  workOrdersForMonth: (month: string) => Promise<any[]>;
}

let boxScoreCache: { pool: Pool; at: number; map: Map<string, { sum: number; measured: number }> } | null = null;

async function loadBoxScoreAggregates(pool: Pool) {
  if (boxScoreCache?.pool === pool && Date.now() - boxScoreCache.at < 60_000) return boxScoreCache.map;
  const { rows } = await pool.query(`
    SELECT t.central, t.cabin_number, t.box_number,
           COUNT(*) FILTER (WHERE t.score IS NOT NULL AND t.score BETWEEN 0 AND 100)::int AS measured,
           COALESCE(SUM(t.score) FILTER (WHERE t.score IS NOT NULL AND t.score BETWEEN 0 AND 100), 0)::numeric AS sum_score
      FROM (
        SELECT pl.central, pl.cabin_number, pl.box_number, pl.full_phone,
               (SELECT c.score FROM case_138 c WHERE c.full_phone = pl.full_phone ORDER BY c.id DESC LIMIT 1) AS score
          FROM line_accounts la
          JOIN phone_lines pl ON pl.full_phone = la.full_phone
      ) t
     GROUP BY t.central, t.cabin_number, t.box_number
  `);
  const map = new Map<string, { sum: number; measured: number }>();
  for (const row of rows) {
    map.set(boxKey(row.central, row.cabin_number, row.box_number), {
      sum: Number(row.sum_score) || 0,
      measured: Number(row.measured) || 0,
    });
  }
  boxScoreCache = { pool, at: Date.now(), map };
  return map;
}

const validMonth = (v: unknown): v is string =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? ""));

const cairoMonth = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
};

export function registerInspectionFollowup(app: Express, d: Deps) {
  const canView = (role: string) => [
    ROLES.TECH, ROLES.EXTERNAL, ROLES.ADMIN, ROLES.SUPER_ADMIN,
  ].includes(role as any);
  const canEdit = (role: string) => [
    ROLES.EXTERNAL, ROLES.ADMIN, ROLES.SUPER_ADMIN,
  ].includes(role as any);

  const loadSourceRows = async (section: Section, month: string) => {
    const start = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;

    if (section === "installations") {
      const rows = await d.workOrdersForMonth(month);
      return rows.map((row) => ({
        ...row,
        technicianName: row.techName || "غير معروف",
        sourceKey: `${row.centralName || ""}|${row.workOrderId || ""}`,
      })).filter((row) => row.sourceKey);
    }

    if (section === "om") {
      const { rows } = await d.pool.query(
        `SELECT fo.id, fo.service_order_id AS "serviceOrderId",
                fo.customer_order_id AS "customerOrderId", fo.serial_number AS "serialNumber",
                fo.service_number AS "serviceNumber", fo.customer_name AS "customerName",
                fo.product, fo.service_name AS "serviceName",
                fo.order_status AS "orderStatus", fo.order_create_time AS "orderCreateTime",
                fo.exchange_name AS "exchangeName", fo.service_type AS "serviceType",
                fo.msan_code AS "msanCode", fo.area_code AS "areaCode",
                fo.current_activity AS "currentActivity", fo.error_name AS "errorName",
                fo.governorate, fo.line_type AS "lineType", fo.fcc_exchange AS "fccExchange",
                COALESCE(omm.mobile, wfm.mobile, fo.customer_mobile) AS "customerMobile",
                omm.mobile AS "manualMobile",
                COALESCE(fo.install_address, wfm.address, '') AS address,
                COALESCE(tn.tech_name, mto.tech_name, 'غير معروف') AS "technicianName",
                COALESCE(orp.status, 'pending') AS "respStatus",
                orp.is_feasible AS "respIsFeasible",
                orp.rejection_reason AS "respRejectionReason",
                orp.central_name AS "respCentralName", orp.cabin_number AS "respCabinNumber",
                orp.box_number AS "respBoxNumber", orp.nearest_box_distance AS "respNearestBoxDistance",
                orp.additional_notes AS "respAdditionalNotes",
                orp.tech_name AS "respTechName",
                orp.responded_at AS "respRespondedAt",
                orp.external_name AS "respExternalName",
                orp.is_feasible_external AS "respIsFeasibleExternal",
                orp.external_rejection_reason AS "respExternalRejectionReason",
                orp.external_central_name AS "respExternalCentralName",
                orp.external_cabin_number AS "respExternalCabinNumber",
                orp.external_box_number AS "respExternalBoxNumber",
                orp.external_nearest_box_distance AS "respExternalNearestBoxDistance",
                orp.external_additional_notes AS "respExternalAdditionalNotes",
                orp.external_response_at AS "respExternalResponseAt"
           FROM ftth_orders_current fo
           LEFT JOIN om_responses orp ON orp.serial_number = fo.serial_number
           LEFT JOIN om_manual_mobiles omm ON omm.serial_number = fo.serial_number
           LEFT JOIN LATERAL (
             SELECT mobile, address FROM maintenance_orders
              WHERE reference_no=fo.service_order_id
                AND work_order_type ILIKE 'fvmanualsurvey'
              LIMIT 1
           ) wfm ON TRUE
           LEFT JOIN LATERAL (
             SELECT tn.tech_name FROM cabinet_technicians ct
             JOIN technician_names tn ON tn.worker_code = ct.worker_code
             WHERE ct.cabin_code = fo.msan_code ORDER BY ct.id DESC LIMIT 1
           ) tn ON TRUE
           LEFT JOIN LATERAL (
             SELECT tech_name FROM msan_tech_overrides WHERE cabin_code = fo.msan_code LIMIT 1
           ) mto ON TRUE
          WHERE COALESCE(btrim(fo.serial_number), '') <> ''
            AND fo.fcc_exchange IN ('GHNAT','AMZAT','DRGAT','NGOAT')
            AND fo.service_name = 'FV Survey'
          ORDER BY fo.order_create_time DESC NULLS LAST
          LIMIT 10000`,
      );
      return rows.map((row: any) => ({ ...row, sourceKey: String(row.serialNumber) }));
    }

    const { rows } = await d.pool.query(
      `SELECT mt.id AS "taskId", i.id AS "inspectionId", b.id AS "boxId",
              e.name AS "exchangeName", c.number AS "cabinetNumber", b.number AS "boxNumber",
              u.full_name AS "technicianName", u.worker_code AS "workerCode",
               phone.phone_number AS "phoneNumber",
              i.date AS "inspectionDate", work.work_date AS "workDate",
              COALESCE(checklist.items, '[]'::jsonb) AS checklist
         FROM maintenance.maintenance_tasks mt
         JOIN maintenance.inspections i ON i.id = mt.inspection_id
         JOIN maintenance.boxes b ON b.id = i.box_id
         JOIN maintenance.cabinets c ON c.id = b.cabinet_id
         JOIN maintenance.exchanges e ON e.id = c.exchange_id
         JOIN maintenance.users u ON u.id = mt.technician_id
          LEFT JOIN LATERAL (
            SELECT pl.tel_no AS phone_number
              FROM public.phone_lines pl
             WHERE btrim(pl.box_number) = btrim(b.number)
               AND lower(regexp_replace(btrim(pl.cabin_number), '[[:space:]]*-[[:space:]]*', '-', 'g')) =
                   lower(regexp_replace(btrim(c.number), '[[:space:]]*-[[:space:]]*', '-', 'g'))
               AND (lower(btrim(pl.central)) = lower(btrim(e.name))
                    OR lower(split_part(pl.central, '-', 1)) = lower(split_part(e.name, '-', 1)))
             ORDER BY pl.id
             LIMIT 1
          ) phone ON TRUE
         JOIN LATERAL (
           SELECT MAX(mis.done_at) AS work_date
             FROM maintenance.maintenance_item_status mis
             JOIN maintenance.inspection_items ii
               ON ii.inspection_id = i.id AND ii.item_key = mis.item_key
            WHERE mis.task_id = mt.id AND mis.is_done = 1
              AND ii.value IN ('bad','yes')
              AND ii.item_key NOT IN ('electricity_conflict','air_conflict','overlap','data_review')
          ) work ON (work.work_date AT TIME ZONE 'Africa/Cairo')::date >= $1::date
                 AND (work.work_date AT TIME ZONE 'Africa/Cairo')::date < $2::date
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'itemKey', ii.item_key, 'value', ii.value, 'notes', ii.notes,
             'isDone', COALESCE(mis.is_done, 0) = 1, 'doneAt', mis.done_at
           ) ORDER BY ii.id) AS items
             FROM maintenance.inspection_items ii
             LEFT JOIN maintenance.maintenance_item_status mis
               ON mis.task_id = mt.id AND mis.item_key = ii.item_key
            WHERE ii.inspection_id = i.id AND ii.value IN ('bad','yes')
              AND ii.item_key NOT IN ('electricity_conflict','air_conflict','overlap','data_review')
         ) checklist ON TRUE
        WHERE mt.technician_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM maintenance.inspection_items ii
            JOIN maintenance.maintenance_item_status mis
              ON mis.task_id = mt.id AND mis.item_key = ii.item_key AND mis.is_done = 1
            WHERE ii.inspection_id = i.id AND ii.value IN ('bad','yes')
              AND ii.item_key NOT IN ('electricity_conflict','air_conflict','overlap','data_review')
          )
          AND NOT EXISTS (
            SELECT 1 FROM maintenance.inspection_items ii
            WHERE ii.inspection_id = i.id AND ii.value IN ('bad','yes')
              AND ii.item_key NOT IN ('electricity_conflict','air_conflict','overlap','data_review')
              AND NOT EXISTS (
                SELECT 1 FROM maintenance.maintenance_item_status mis
                WHERE mis.task_id = mt.id AND mis.item_key = ii.item_key AND mis.is_done = 1
              )
          )
        ORDER BY work.work_date DESC, e.name, c.number, b.number`,
      [start, nextMonth],
    );
    return rows.map((row: any) => ({ ...row, sourceKey: String(row.taskId) }));
  };

  async function ensureSectionSamples(section: Section, month: string, rows: any[], ratio: number) {
    const client = await d.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`inspection-followup:${month}:${section}`]);
      const initialized = await client.query(
        `SELECT sampling_version FROM inspection_followup_sections WHERE report_month=$1 AND section=$2`,
        [month, section],
      );
      // تحديث نسخة العينة يضيف العناصر الناقصة ويحافظ على السجلات السابقة.
      const samplingVersion = section === "maintenance" ? 2 : section === "installations" ? 4 : 2;
      if (section === "om" || !initialized.rowCount || Number(initialized.rows[0]?.sampling_version || 1) < samplingVersion) {
        const sampledAlready = await client.query(
          `SELECT i.source_key AS "sourceKey", i.technician_name AS "technicianName",
                  i.is_manual AS "isManual", i.source_data AS "sourceData",
                  r.responded_at AS "respondedAt", r.external_response_at AS "externalResponseAt"
             FROM inspection_followup_items i
             LEFT JOIN om_responses r ON r.serial_number=i.source_key
            WHERE i.report_month=$1 AND i.section=$2 AND i.is_manual=false`,
          [month, section],
        );
        const existingByTech = new Map<string, Set<string>>();
        const existingKeys = new Set<string>();
        const currentKeys = new Set(rows.map((row) => String(row.sourceKey)));
        for (const item of sampledAlready.rows) {
          const techName = String(item.technicianName || "غير معروف");
          const keys = existingByTech.get(techName) ?? new Set<string>();
          const sourceKey = String(item.sourceKey);
          keys.add(sourceKey);
          existingKeys.add(sourceKey);
          existingByTech.set(techName, keys);
          if (section === "om") {
            const freed = !currentKeys.has(sourceKey);
            const checked = Boolean(item.respondedAt && item.externalResponseAt);
            const previousData = item.sourceData && typeof item.sourceData === "object" ? item.sourceData : {};
            const hadFreedMarker = Boolean((previousData as any).sampleFreed);
            const hadRemovedMarker = Boolean((previousData as any).sampleRemoved);
            if (freed && !checked && !hadRemovedMarker) {
              await client.query(
                `UPDATE inspection_followup_items
                    SET source_data=(source_data - 'sampleFreed') || '{"sampleRemoved":true}'::jsonb
                  WHERE report_month=$1 AND section='om' AND source_key=$2 AND is_manual=false`,
                [month, sourceKey],
              );
            } else if (freed && checked && !hadFreedMarker) {
              await client.query(
                `UPDATE inspection_followup_items
                    SET source_data=(source_data - 'sampleRemoved') || '{"sampleFreed":true}'::jsonb
                  WHERE report_month=$1 AND section='om' AND source_key=$2 AND is_manual=false`,
                [month, sourceKey],
              );
            } else if (!freed && (hadFreedMarker || hadRemovedMarker)) {
              await client.query(
                `UPDATE inspection_followup_items
                    SET source_data=source_data - 'sampleFreed' - 'sampleRemoved'
                  WHERE report_month=$1 AND section='om' AND source_key=$2 AND is_manual=false`,
                [month, sourceKey],
              );
            }
          }
        }
        const grouped = new Map<string, any[]>();
        for (const row of rows) {
          const techName = String(row.technicianName || row.techName || "غير معروف").trim() || "غير معروف";
          const groupKey = section === "maintenance" ? "__all_maintenance__" : techName;
          const group = grouped.get(groupKey) ?? [];
          group.push({ ...row, technicianName: techName });
          grouped.set(groupKey, group);
        }
        const sample: any[] = [];
        for (const [groupKey, group] of grouped) {
          const technicianKeys = section === "installations" || section === "maintenance"
            ? existingKeys
            : existingByTech.get(groupKey) ?? new Set<string>();
          const currentKeys = new Set(group.map((row) => String(row.sourceKey)));
          const existingCount = [...technicianKeys].filter((key) => currentKeys.has(key)).length;
          const target = Math.min(group.length, Math.max(1, Math.ceil(group.length * ratio)));
          const needed = Math.max(0, target - existingCount);
          if (!needed) continue;
          const candidates = group.filter((row) => !technicianKeys.has(String(row.sourceKey)));
          for (let i = candidates.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
          }
          if (section === "om") {
            candidates.sort((a, b) => Number(Boolean(b.respRespondedAt)) - Number(Boolean(a.respRespondedAt)));
          }
          sample.push(...candidates.slice(0, needed));
        }
        if (section === "om") {
          const sampledCurrentCount = [...existingKeys].filter((key) => currentKeys.has(key)).length;
          const targetTotal = Math.min(rows.length, Math.max(1, Math.ceil(rows.length * ratio)));
          const missing = Math.max(0, targetTotal - sampledCurrentCount - sample.length);
          if (missing) {
            const alreadyPicked = new Set(sample.map((row) => String(row.sourceKey)));
            const fallbackCandidates = rows.filter((row) =>
              !existingKeys.has(String(row.sourceKey)) && !alreadyPicked.has(String(row.sourceKey)));
            for (let i = fallbackCandidates.length - 1; i > 0; i -= 1) {
              const j = Math.floor(Math.random() * (i + 1));
              [fallbackCandidates[i], fallbackCandidates[j]] = [fallbackCandidates[j], fallbackCandidates[i]];
            }
            sample.push(...fallbackCandidates.slice(0, missing));
          }
        }
        if (section === "installations") {
          for (const row of rows) {
            if (!existingKeys.has(String(row.sourceKey))) continue;
            await client.query(
              `UPDATE inspection_followup_items
                  SET technician_name=$4, source_data=$5::jsonb
                WHERE report_month=$1 AND section=$2 AND source_key=$3 AND is_manual=false`,
              [month, section, row.sourceKey, row.technicianName || row.techName || "غير معروف", JSON.stringify(row)],
            );
          }
        }
        for (const row of sample) {
          await client.query(
            `INSERT INTO inspection_followup_items
              (report_month, section, source_key, technician_name, source_data)
             VALUES ($1,$2,$3,$4,$5::jsonb)
             ON CONFLICT (report_month, section, source_key) DO NOTHING`,
            [month, section, row.sourceKey, row.technicianName || row.techName || "غير معروف", JSON.stringify(row)],
          );
        }
        if (section === "om") {
          const assignedKeys = [...new Set(sample.map((row) => String(row.sourceKey)))];
          if (assignedKeys.length) {
            await client.query(
              `INSERT INTO om_responses (serial_number,status,updated_at)
               SELECT serial,'needs_external',now() FROM unnest($1::text[]) AS x(serial)
               ON CONFLICT (serial_number) DO UPDATE
                 SET status='needs_external', updated_at=now()
               WHERE om_responses.status IN ('pending','feasible','not_feasible')
                 AND om_responses.external_response_at IS NULL`,
              [assignedKeys],
            );
          }
        }
        await client.query(
          `INSERT INTO inspection_followup_sections (report_month,section,sampling_version)
           VALUES ($1,$2,$3)
           ON CONFLICT (report_month,section)
           DO UPDATE SET sampling_version=EXCLUDED.sampling_version, initialized_at=now()`,
          [month, section, samplingVersion],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  app.get("/api/inspection-followup", d.requireAuth, async (req: any, res: any) => {
    const role = String(req.user?.role || "");
    if (!canView(role)) return res.status(403).json({ message: "غير مسموح" });
    const section = String(req.query.section || "") as Section;
    if (!["maintenance", "om", "installations"].includes(section)) {
      return res.status(400).json({ message: "القسم غير صالح" });
    }
    const month = String(req.query.month || cairoMonth(new Date()));
    if (!validMonth(month)) return res.status(400).json({ message: "الشهر غير صالح" });
    try {
      const sourceRows = section === "installations" || section === "maintenance" || section === "om"
        ? await loadSourceRows(section, month)
        : null;
      const ratio = section === "maintenance" ? 0.5 : section === "om" ? 0.5 : 0.1;
      const targetVersion = section === "maintenance" ? 2 : section === "installations" ? 4 : 2;
      const cached = await d.pool.query(
        `SELECT sampling_version FROM inspection_followup_sections WHERE report_month=$1 AND section=$2`,
        [month, section],
      );
      if (section === "om" || !cached.rowCount || Number(cached.rows[0]?.sampling_version || 1) < targetVersion) {
        const rows = sourceRows ?? await loadSourceRows(section, month);
        await ensureSectionSamples(section, month, rows, section === "om" ? 0.5 : ratio);
      }
      const { rows: selected } = await d.pool.query(
        `SELECT id, report_month AS "reportMonth", section, source_key AS "sourceKey",
                technician_name AS "technicianName", source_data AS "sourceData",
                is_manual AS "isManual", wire_distance_match AS "wireDistanceMatch",
                customer_wire_match AS "customerWireMatch", review_notes AS "reviewNotes",
                reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
           FROM inspection_followup_items
           WHERE report_month=$1 AND section=$2
             AND (section <> 'om' OR source_data->>'sampleRemoved' IS DISTINCT FROM 'true')
          ORDER BY technician_name, id`,
        [month, section],
      );
      let liveRows = selected;
      if ((section === "installations" || section === "maintenance") && sourceRows) {
        const currentKeys = new Set(sourceRows.map((row: any) => String(row.sourceKey)));
        liveRows = selected.filter((item: any) => item.isManual || currentKeys.has(String(item.sourceKey)));
        if (section === "installations") {
          liveRows = liveRows.map((item: any) => ({ ...item, isComplete: Boolean(item.reviewedAt) }));
        }
      }
      if (section === "om" && selected.length) {
        const serials = selected.map((item: any) => String(item.sourceKey));
        const { rows: responses } = await d.pool.query(
          `SELECT serial_number AS serial, status AS "respStatus",
                  is_feasible AS "respIsFeasible", rejection_reason AS "respRejectionReason",
                  tech_name AS "respTechName", responded_at AS "respRespondedAt",
                  external_name AS "respExternalName",
                  is_feasible_external AS "respIsFeasibleExternal",
                  external_rejection_reason AS "respExternalRejectionReason",
                  external_central_name AS "respExternalCentralName",
                  external_cabin_number AS "respExternalCabinNumber",
                  external_box_number AS "respExternalBoxNumber",
                  external_nearest_box_distance AS "respExternalNearestBoxDistance",
                  external_additional_notes AS "respExternalAdditionalNotes",
                   external_response_at AS "respExternalResponseAt",
                   bx.c AS "boxWorkingCount"
              FROM om_responses orp
              LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS c
                  FROM phone_lines pl
                 WHERE COALESCE(btrim(orp.box_number), '') <> ''
                   AND btrim(pl.box_number) = btrim(orp.box_number)
                   AND (COALESCE(btrim(orp.cabin_number), '') = '' OR btrim(pl.cabin_number) = btrim(orp.cabin_number))
                   AND (COALESCE(btrim(orp.central_name), '') = '' OR btrim(pl.central) = btrim(orp.central_name))
                   AND EXISTS (
                     SELECT 1 FROM phone_ports pf
                      WHERE pf.phone_number = pl.full_phone
                        AND COALESCE(btrim(pf.frame::text), '') <> ''
                   )
              ) bx ON TRUE
             WHERE orp.serial_number=ANY($1::text[])`,
          [serials],
        );
        let scoreAgg: Map<string, { sum: number; measured: number }> | null = null;
        try {
          scoreAgg = await loadBoxScoreAggregates(d.pool);
        } catch (error) {
          console.warn("[inspection-followup] box score enrichment unavailable:", error);
        }
        for (const response of responses as any[]) {
          const techBroken = response.respRejectionReason === REJECTION_REASONS.BOX_BROKEN;
          const externalBroken = response.respExternalRejectionReason === REJECTION_REASONS.BOX_BROKEN;
          response.boxAvgScore = null;
          response.boxMeasuredCount = 0;
          if (!isBoxBrokenReason(response.respRejectionReason, response.respExternalRejectionReason, REJECTION_REASONS.BOX_BROKEN)) continue;
          const central = externalBroken && !techBroken ? response.respExternalCentralName : response.respCentralName;
          const cabin = externalBroken && !techBroken ? response.respExternalCabinNumber : response.respCabinNumber;
          const box = externalBroken && !techBroken ? response.respExternalBoxNumber : response.respBoxNumber;
          const score = boxAverageFromAggregates(expandBoxes(box).map((boxNumber) => scoreAgg?.get(boxKey(central, cabin, boxNumber))));
          response.boxAvgScore = score.avgScore;
          response.boxMeasuredCount = score.measuredCount;
        }
        const responseMap = new Map(responses.map((r: any) => [String(r.serial), r]));
        liveRows = selected.map((item: any) => {
          const response = responseMap.get(String(item.sourceKey));
          const sourceData = response ? { ...item.sourceData, ...response } : item.sourceData;
          return {
            ...item,
            sourceData,
            isComplete: Boolean(sourceData?.respRespondedAt && sourceData?.respExternalResponseAt),
          };
        });
      } else if (section === "maintenance" && liveRows.length) {
        const taskIds = liveRows.map((item: any) => Number(item.sourceData?.taskId)).filter(Number.isInteger);
        const { rows: tasks } = await d.pool.query(
          `SELECT mt.id, mt.status,
                  COALESCE(checklist.items, '[]'::jsonb) AS checklist
             FROM maintenance.maintenance_tasks mt
             LEFT JOIN LATERAL (
               SELECT jsonb_agg(jsonb_build_object(
                 'itemKey', ii.item_key, 'value', ii.value, 'notes', ii.notes,
                 'isDone', COALESCE(mis.is_done, 0) = 1, 'doneAt', mis.done_at
               ) ORDER BY ii.id) AS items
                 FROM maintenance.inspection_items ii
                 LEFT JOIN maintenance.maintenance_item_status mis
                   ON mis.task_id = mt.id AND mis.item_key = ii.item_key
                WHERE ii.inspection_id = mt.inspection_id
                  AND ii.value IN ('bad','yes')
                  AND ii.item_key NOT IN ('electricity_conflict','air_conflict','overlap','data_review')
             ) checklist ON TRUE
            WHERE mt.id=ANY($1::int[])`,
          [taskIds],
        );
        const taskMap = new Map(tasks.map((task: any) => [Number(task.id), task]));
        liveRows = liveRows.map((item: any) => ({
          ...item,
          sourceData: {
            ...item.sourceData,
            checklist: taskMap.get(Number(item.sourceData?.taskId))?.checklist || item.sourceData?.checklist || [],
          },
          isComplete: taskMap.get(Number(item.sourceData?.taskId))?.status === "completed",
        }));
      } else if (section !== "installations") {
        liveRows = selected.map((item: any) => ({ ...item, isComplete: Boolean(item.reviewedAt) }));
      }
      let visible = liveRows;
      if (role === ROLES.TECH) {
        const workerCode = String(req.user?.workerCode || "").trim();
        if (!workerCode) visible = [];
        else {
          const { rows: names } = await d.pool.query(
            `SELECT tech_name FROM technician_names WHERE worker_code=$1 ORDER BY id DESC LIMIT 1`,
            [workerCode],
          );
          const myName = String(names[0]?.tech_name || "").trim();
          visible = liveRows.filter((item: any) =>
            String(item.technicianName || "").trim() === myName);
        }
        visible = visible.map((item: any) => {
          const source = item.sourceData || {};
          let result: Record<string, unknown> = {};
          if (section === "om") {
            result = {
              respStatus: source.respStatus,
              respRejectionReason: source.respRejectionReason,
              respRespondedAt: source.respRespondedAt,
              respTechName: source.respTechName,
              respExternalName: source.respExternalName,
              respExternalRejectionReason: source.respExternalRejectionReason,
              respExternalCentralName: source.respExternalCentralName,
              respExternalCabinNumber: source.respExternalCabinNumber,
              respExternalBoxNumber: source.respExternalBoxNumber,
              respExternalNearestBoxDistance: source.respExternalNearestBoxDistance,
              respExternalAdditionalNotes: source.respExternalAdditionalNotes,
              respExternalResponseAt: source.respExternalResponseAt,
            };
          } else if (section === "maintenance") {
            result = { checklist: source.checklist };
          }
          return { ...item, sourceKey: "", sourceData: result, technicianName: "" };
        });
      }
      const answered = liveRows.filter((item: any) => item.isComplete).length;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        month, section, total: liveRows.length, answered,
        completionPercent: liveRows.length ? Math.round(answered * 100 / liveRows.length) : 0,
        rows: visible,
        readOnly: role === ROLES.TECH,
      });
    } catch (error: any) {
      console.error("[inspection-followup] load failed:", error);
      res.status(500).json({ message: "فشل تحميل عينة المتابعة" });
    }
  });

  app.post("/api/inspection-followup/items/:id/response", d.requireAuth, async (req: any, res: any) => {
    const role = String(req.user?.role || "");
    if (!canEdit(role)) return res.status(403).json({ message: "غير مسموح" });
    const id = Number(req.params.id);
    const distance = String(req.body?.wireDistanceMatch || "");
    const customerWire = String(req.body?.customerWireMatch || "");
    const note = String(req.body?.reviewNotes || "").trim().slice(0, 2000);
    if (!Number.isInteger(id) || id <= 0 ||
        !["matches", "does_not_match", "unknown"].includes(distance) ||
        !["matches", "does_not_match", "unknown"].includes(customerWire)) {
      return res.status(400).json({ message: "بيانات المراجعة غير مكتملة" });
    }
    try {
      const { rows } = await d.pool.query(
        `UPDATE inspection_followup_items
            SET wire_distance_match=$2, customer_wire_match=$3, review_notes=$4,
                reviewed_by=$5, reviewed_at=now()
          WHERE id=$1 AND section='installations'
          RETURNING id, wire_distance_match AS "wireDistanceMatch",
                    customer_wire_match AS "customerWireMatch", review_notes AS "reviewNotes",
                    reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"`,
        [id, distance, customerWire, note || null, String(req.user?.fullName || req.user?.username || "")],
      );
      if (!rows.length) return res.status(404).json({ message: "بند المتابعة غير موجود" });
      res.json({ ok: true, item: rows[0] });
    } catch (error: any) {
      res.status(500).json({ message: "تعذر حفظ نتيجة المراجعة" });
    }
  });

  app.post("/api/inspection-followup/om-extra", d.requireAuth, async (req: any, res: any) => {
    if (String(req.user?.role || "") !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ message: "هذه الإضافة للسوبر أدمن فقط" });
    }
    const serial = String(req.body?.serialNumber || "").trim();
    const month = String(req.body?.month || cairoMonth(new Date()));
    if (!serial || !validMonth(month)) return res.status(400).json({ message: "المسلسل أو الشهر غير صالح" });
    try {
      const { rows } = await d.pool.query(
        `SELECT fo.id, fo.service_order_id AS "serviceOrderId",
                fo.customer_order_id AS "customerOrderId", fo.serial_number AS "serialNumber",
                fo.service_number AS "serviceNumber", fo.customer_name AS "customerName",
                fo.product, fo.service_name AS "serviceName",
                fo.order_status AS "orderStatus", fo.order_create_time AS "orderCreateTime",
                fo.exchange_name AS "exchangeName", fo.service_type AS "serviceType",
                fo.msan_code AS "msanCode", fo.area_code AS "areaCode",
                fo.current_activity AS "currentActivity", fo.error_name AS "errorName",
                fo.governorate, fo.line_type AS "lineType", fo.fcc_exchange AS "fccExchange",
                COALESCE(omm.mobile, wfm.mobile, fo.customer_mobile) AS "customerMobile",
                omm.mobile AS "manualMobile",
                COALESCE(fo.install_address, wfm.address, '') AS address,
                COALESCE(tn.tech_name, mto.tech_name, 'غير معروف') AS "technicianName",
                COALESCE(orp.status, 'pending') AS "respStatus",
                orp.rejection_reason AS "respRejectionReason",
                orp.central_name AS "respCentralName", orp.cabin_number AS "respCabinNumber",
                orp.box_number AS "respBoxNumber", orp.nearest_box_distance AS "respNearestBoxDistance",
                orp.tech_name AS "respTechName",
                orp.responded_at AS "respRespondedAt",
                orp.external_name AS "respExternalName",
                orp.is_feasible_external AS "respIsFeasibleExternal",
                orp.external_rejection_reason AS "respExternalRejectionReason",
                orp.external_central_name AS "respExternalCentralName",
                orp.external_cabin_number AS "respExternalCabinNumber",
                orp.external_box_number AS "respExternalBoxNumber",
                orp.external_nearest_box_distance AS "respExternalNearestBoxDistance",
                orp.external_additional_notes AS "respExternalAdditionalNotes",
                orp.external_response_at AS "respExternalResponseAt"
           FROM ftth_orders_current fo
           LEFT JOIN om_responses orp ON orp.serial_number=fo.serial_number
           LEFT JOIN om_manual_mobiles omm ON omm.serial_number=fo.serial_number
           LEFT JOIN LATERAL (
             SELECT mobile, address FROM maintenance_orders
              WHERE reference_no=fo.service_order_id
                AND work_order_type ILIKE 'fvmanualsurvey'
              LIMIT 1
           ) wfm ON TRUE
           LEFT JOIN LATERAL (
             SELECT tn.tech_name FROM cabinet_technicians ct
             JOIN technician_names tn ON tn.worker_code=ct.worker_code
             WHERE ct.cabin_code=fo.msan_code ORDER BY ct.id DESC LIMIT 1
           ) tn ON TRUE
           LEFT JOIN LATERAL (
             SELECT tech_name FROM msan_tech_overrides WHERE cabin_code=fo.msan_code LIMIT 1
           ) mto ON TRUE
           WHERE btrim(fo.serial_number)=$1
             AND fo.fcc_exchange IN ('GHNAT','AMZAT','DRGAT','NGOAT')
             AND fo.service_name = 'FV Survey'
           LIMIT 1`,
        [serial],
      );
      if (!rows.length) return res.status(404).json({ message: "المتعذر غير موجود في التقرير الحالي" });
      const row = rows[0];
      const result = await d.pool.query(
        `INSERT INTO inspection_followup_items
          (report_month, section, source_key, technician_name, source_data, is_manual, created_by)
         VALUES ($1,'om',$2,$3,$4::jsonb,true,$5)
         ON CONFLICT (report_month,section,source_key) DO UPDATE
           SET is_manual=true, created_by=EXCLUDED.created_by
         RETURNING id`,
        [month, serial, row.technicianName || "غير معروف", JSON.stringify({ ...row, sourceKey: serial }),
         String(req.user?.fullName || req.user?.username || "")],
      );
      res.json({ ok: true, id: result.rows[0]?.id });
    } catch (error: any) {
      res.status(500).json({ message: "تعذرت إضافة المتعذر" });
    }
  });
}
