// خرايط الكوابل — المرحلة ٢ (المالك ٢٠٢٦-١١-١٦): «كل كابل إيه البكسيات اللى عليه وإيه الوصل اللحام اللى عليه»،
// و«مكان العطل» من قياس بكس (من البكس أو من الكابينة) على مسار البكس فى الخريطة.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/cfm/components/ui/card";
import { Input } from "@/cfm/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/cfm/components/ui/table";
import type { CableMapData } from "@shared/cfm-maps/types";
import { cableRoutes, locateFault, describeFault, nodeLabel, cabinetKey } from "@shared/cfm-maps/types";

export function CableRoutesPanel({ data }: { data: CableMapData }) {
  const routes = useMemo(() => cableRoutes(data), [data]);
  if (!routes.length) return <p className="text-sm text-muted-foreground">مفيش كابلات طالعة من الكابينة فى التفريغ.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">كل كابل طالع من الكابينة، والوصلات والبكسيات اللى عليه بالترتيب، ومسافة كل واحد من الكابينة.</p>
      {routes.map((r, i) => (
        <Card key={i}><CardContent className="pt-4 space-y-2">
          <div className="font-bold text-sm">
            كابل {i + 1}: الكابينة ← {nodeLabel(r.first.to)} · {r.first.lengthM ?? "?"} م · {r.first.pairs ?? "?"} زوج · قطر {r.first.gaugeMm ?? "?"}
            <span className="text-muted-foreground font-normal"> — أبعد نقطة {r.lengthM} م · {r.joints.length} وصلة · {r.boxes.length} بكس</span>
          </div>
          {r.joints.length > 0 && (
            <div className="text-xs"><b>الوصلات:</b> {r.joints.map((j) => `${nodeLabel(j.node)} (${j.dist} م)`).join(" · ")}</div>
          )}
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader><TableRow>
                <TableHead className="text-right">البكس</TableHead><TableHead className="text-right">طالع من</TableHead>
                <TableHead className="text-right">المسافة من الكابينة</TableHead><TableHead className="text-right">البلوك</TableHead>
                <TableHead className="text-right">فرعات الخرج</TableHead><TableHead className="text-right">المكان</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {r.boxes.map((b) => (
                  <TableRow key={b.node}>
                    <TableCell className="font-bold">{b.node.slice(1)}</TableCell><TableCell>{nodeLabel(b.joint)}</TableCell>
                    <TableCell className="tabular-nums">{b.dist} م</TableCell><TableCell>{b.block || "-"}</TableCell>
                    <TableCell>{b.pairs || "-"}</TableCell><TableCell>{b.nameAr || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

export function FaultLocatorPanel({ data }: { data: CableMapData }) {
  const [box, setBox] = useState("");
  const [dist, setDist] = useState("");
  const [dir, setDir] = useState<"box" | "cabinet">("box");
  const f = useMemo(() => (box && dist !== "" ? locateFault(data, box, Number(dist), dir) : null), [data, box, dist, dir]);
  return (
    <Card><CardContent className="pt-4 space-y-3">
      <p className="text-xs text-muted-foreground">اكتب البكس اللى اتقاس منه والمسافة اللى طلعت فى القياس، والسيستم يحدّد مكان العطل على مسار البكس فى الخريطة.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">البكس
          <select className="block border rounded h-9 px-2 text-sm bg-white" value={box} onChange={(e) => setBox(e.target.value)}>
            <option value="">— اختار —</option>
            {[...data.boxes].sort((a, b) => Number(a.box) - Number(b.box)).map((b) => <option key={b.box} value={b.box}>بكس {b.box}</option>)}
          </select>
        </label>
        <label className="text-xs">المسافة (متر)
          <Input type="number" min={0} step="0.1" className="w-28" value={dist} onChange={(e) => setDist(e.target.value)} />
        </label>
        <label className="text-xs">القياس
          <select className="block border rounded h-9 px-2 text-sm bg-white" value={dir} onChange={(e) => setDir(e.target.value as any)}>
            <option value="box">من البكس</option><option value="cabinet">من الكابينة</option>
          </select>
        </label>
      </div>
      {box && dist !== "" && !f && <p className="text-sm text-red-700">البكس ده مالوش مسار كامل فى الخريطة (طول ناقص فى التفريغ).</p>}
      {f && (
        <div className="rounded bg-amber-50 p-3 space-y-1 text-sm">
          {describeFault(f).map((t, i) => <p key={i} className={i === 0 ? "text-muted-foreground text-xs" : "font-semibold"}>{t}</p>)}
          <p className="text-xs text-muted-foreground">المسار: {f.path.map((s) => `${nodeLabel(s.node)} (${s.dist} م)`).join(" ← ")}</p>
        </div>
      )}
    </CardContent></Card>
  );
}

// ── فى التكت: جنب كل قياس، مكان العطل التقديرى لو الكابينة ليها خريطة ─────────────────────────────
let mapsCache: Promise<{ id: number; cabinet: string }[]> | null = null;
const mapDataCache = new Map<number, Promise<CableMapData | null>>();
const loadMaps = (): Promise<{ id: number; cabinet: string }[]> => (mapsCache ||= fetch("/api/cfm/maps", { credentials: "include" })
  .then((r) => (r.ok ? r.json() : { items: [] })).then((j) => j.items || []).catch(() => { mapsCache = null; return []; }));
const loadMapData = (id: number) => {
  if (!mapDataCache.has(id)) {
    mapDataCache.set(id, fetch(`/api/cfm/maps/${id}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => (j ? j.data as CableMapData : null)).catch(() => null));
  }
  return mapDataCache.get(id)!;
};

export function MeasurementMapHint({ cabinet, box, distance, direction }: {
  cabinet: string; box: string; distance: number | null | undefined; direction: string | null | undefined;
}) {
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (distance == null || !box || !cabinet) return;
    (async () => {
      const key = cabinetKey(cabinet);
      const m = (await loadMaps()).find((x: { id: number; cabinet: string }) => cabinetKey(x.cabinet) === key);
      if (!m) return;
      const data = await loadMapData(m.id);
      if (!data || !alive) return;
      const boxNo = String(box).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").replace(/^0+/, "");
      const f = locateFault(data, boxNo, Number(distance), direction === "cable" ? "box" : "cabinet");
      setLines(f ? describeFault(f) : [`البكس ${boxNo} مالوش مسار كامل فى خريطة الكابينة ${m.cabinet}.`]);
    })();
    return () => { alive = false; };
  }, [cabinet, box, distance, direction]);
  if (!lines) return null;
  return (
    <div className="rounded bg-amber-50 border border-amber-200 p-2 mb-2 text-xs space-y-0.5" data-testid="measurement-map-hint">
      <div className="font-bold">📍 مكان العطل التقديرى من الخريطة</div>
      {lines.slice(1).map((t, i) => <p key={i}>{t}</p>)}
    </div>
  );
}
