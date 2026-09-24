import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileSpreadsheet, Printer, ChevronDown } from "lucide-react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";

// طول الخط (Loop Length) قصاد السرعة الحالية / أقصى سرعة / الاسكور.
// كل نقطة = خط، من **آخر قياس فيه Loop Length** (بييجى من «قياس بدون Real» بس)،
// والسرعات والاسكور من نفس القياس (server: /api/reports/loop-length-scatter).
// مع كل رسمة خط اتجاه (أقل مربعات) ومعامل الارتباط r — عشان «العلاقة» تبقى رقم
// مش إحساس بالعين.

interface Point {
  fullPhone: string; central: string; cabinNumber: string; boxNumber: string;
  loopRaw: string; loopM: number;
  currentSpeed: number | null; maxSpeed: number | null; score: number | null;
  measuredAt: string | null;
}
interface Resp { points: Point[]; totalLines: number; withLoop: number; special: number; unreadable: number }

type Metric = "currentSpeed" | "maxSpeed" | "score";
const METRICS: { key: Metric; title: string; unit: string; color: string }[] = [
  { key: "currentSpeed", title: "طول الخط قصاد السرعة الحالية", unit: "kbps", color: "#2563eb" },
  { key: "maxSpeed", title: "طول الخط قصاد أقصى سرعة", unit: "kbps", color: "#059669" },
  { key: "score", title: "طول الخط قصاد الاسكور", unit: "", color: "#d97706" },
];

/** أقل مربعات + معامل ارتباط بيرسون. null لو أقل من ٣ نقط أو كل الأطوال واحدة. */
export function fitLine(xy: { x: number; y: number }[]) {
  const n = xy.length;
  if (n < 3) return null;
  const mx = xy.reduce((a, p) => a + p.x, 0) / n;
  const my = xy.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of xy) { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my); }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  return { slope, intercept: my - slope * mx, r, n };
}

/** وصف الارتباط بالعربى — نفس الحدود المعتادة (|r| ٠٫٣ / ٠٫٥ / ٠٫٧). */
export function strengthOf(r: number): string {
  const a = Math.abs(r);
  const dir = r < 0 ? "عكسى" : "طردى";
  if (a >= 0.7) return `ارتباط ${dir} قوى`;
  if (a >= 0.5) return `ارتباط ${dir} متوسط`;
  if (a >= 0.3) return `ارتباط ${dir} ضعيف`;
  return "مفيش ارتباط واضح";
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function BoxesPicker({ options, value, onChange, disabled }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  const set = new Set(value);
  const label = !value.length ? "كل البكسيات" : value.length <= 3 ? `بكس ${value.join("، ")}` : `${value.length} بكس`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="w-full sm:w-44 justify-between text-sm font-normal">
          <span className="truncate">{label}</span><ChevronDown className="w-4 h-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 max-h-72 overflow-auto" align="start">
        <button type="button" className="text-xs text-blue-700 mb-2" onClick={() => onChange([])}>كل البكسيات</button>
        {options.map((b) => (
          <label key={b} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
            <Checkbox checked={set.has(b)} onCheckedChange={(c) => {
              const next = new Set(set); c ? next.add(b) : next.delete(b); onChange(options.filter((o) => next.has(o)));
            }} />
            بكس {b}
          </label>
        ))}
        {!options.length && <p className="text-xs text-muted-foreground">اختار الكابينة الأول</p>}
      </PopoverContent>
    </Popover>
  );
}

export function LoopLengthScatterReport() {
  const [central, setCentral] = useState("");
  const [cabin, setCabin] = useState("");
  const [boxes, setBoxes] = useState<string[]>([]);
  const chartsRef = useRef<HTMLDivElement>(null);

  const { data: filterOptions } = useQuery({
    queryKey: ["/api/phone-lines/filter-options"],
    queryFn: async () => {
      const res = await fetch("/api/phone-lines/filter-options", { credentials: "include" });
      return res.json() as Promise<{ centrals: string[]; cabins: Record<string, string[]>; boxes: Record<string, string[]> }>;
    },
  });
  const cabinOptions = central && filterOptions ? (filterOptions.cabins[central] ?? []) : [];
  const boxOptions = central && cabin && filterOptions ? (filterOptions.boxes[`${central}||${cabin}`] ?? []) : [];

  // السنترال إلزامى: من غيره الاستعلام بيلف على كل خطوط كل السنترالات.
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/reports/loop-length-scatter", central, cabin, boxes.join(",")],
    enabled: !!central,
    queryFn: async () => {
      const p = new URLSearchParams({ central });
      if (cabin) p.set("cabin", cabin);
      if (boxes.length) p.set("boxes", boxes.join(","));
      const res = await fetch(`/api/reports/loop-length-scatter?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "تعذّر تحميل التقرير");
      return res.json() as Promise<Resp>;
    },
  });

  const series = useMemo(() => {
    const pts = data?.points ?? [];
    return METRICS.map((m) => {
      const xy = pts.filter((p) => p[m.key] != null).map((p) => ({ x: p.loopM, y: p[m.key] as number, p }));
      const fit = fitLine(xy);
      const xs = xy.map((d) => d.x);
      const x1 = xs.length ? Math.min(...xs) : 0, x2 = xs.length ? Math.max(...xs) : 0;
      return { ...m, xy, fit, seg: fit ? [{ x: x1, y: fit.intercept + fit.slope * x1 }, { x: x2, y: fit.intercept + fit.slope * x2 }] : null };
    });
  }, [data]);

  const scopeTitle = [central, cabin && `كابينة ${cabin}`, boxes.length ? `بكس ${boxes.join("، ")}` : ""].filter(Boolean).join(" — ");
  const summaryRows = series.map((s) => [
    s.title, s.xy.length,
    s.fit ? s.fit.r.toFixed(2) : "-",
    s.fit ? strengthOf(s.fit.r) : "نقط قليلة",
    s.fit ? `${s.fit.slope * 100 >= 0 ? "+" : ""}${(s.fit.slope * 100).toFixed(s.key === "score" ? 2 : 0)}${s.unit ? " " + s.unit : ""}` : "-",
  ]);

  const handleExportExcel = () => {
    const pts = data?.points ?? [];
    const wb = XLSX.utils.book_new();
    const rows = pts.map((p, i) => ({
      "#": i + 1, "التليفون": p.fullPhone, "السنترال": p.central, "الكابينة": p.cabinNumber, "البكس": p.boxNumber,
      "Loop Length (كما قُرئ)": p.loopRaw, "طول الخط (متر)": p.loopM,
      "السرعة الحالية (kbps)": p.currentSpeed ?? "", "أقصى سرعة (kbps)": p.maxSpeed ?? "", "الاسكور": p.score ?? "",
      "تاريخ القياس": p.measuredAt ? String(p.measuredAt).replace("T", " ").slice(0, 16) : "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "النقط");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["الرسمة", "عدد النقط", "r", "الوصف", "التغيّر لكل ١٠٠ متر"], ...summaryRows,
    ]), "الارتباط");
    XLSX.writeFile(wb, `طول-الخط-والسرعة-${central || "الكل"}.xlsx`);
  };

  const handleExportPDF = () => {
    // الرسومات نفسها (SVG من recharts) فوق جدول الملخص — الجدول لوحده مابيقولش العلاقة.
    const svgs = [...(chartsRef.current?.querySelectorAll("[data-chart]") ?? [])].map((el) => {
      const svg = el.querySelector("svg.recharts-surface");
      const title = el.getAttribute("data-chart") || "";
      return svg ? `<div style="margin:6px 0 14px"><h3 style="font-size:13px;margin:0 0 4px">${title}</h3><div dir="ltr">${svg.outerHTML}</div></div>` : "";
    }).join("");
    printTablePDF({
      title: `طول الخط والسرعة والاسكور — ${scopeTitle || "كل السنترالات"}`,
      columns: ["الرسمة", "عدد النقط", "r", "الوصف", "التغيّر لكل ١٠٠ متر"],
      rows: summaryRows,
      introHtml: svgs,
    });
  };

  return (
    <Card>
      <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-base">طول الخط والسرعة والاسكور</h3>
        <div className="flex flex-wrap items-center gap-2">
          <SearchableCombobox options={filterOptions?.centrals ?? []} value={central}
            onChange={(v) => { setCentral(v); setCabin(""); setBoxes([]); }}
            placeholder="اختار السنترال" searchPlaceholder="ابحث في السنترالات..." className="w-full sm:w-44 text-sm" />
          <SearchableCombobox options={cabinOptions} value={cabin}
            onChange={(v) => { setCabin(v); setBoxes([]); }}
            placeholder="كل الكباين" searchPlaceholder="ابحث في الكباين..." disabled={!central} className="w-full sm:w-40 text-sm" />
          <BoxesPicker options={boxOptions} value={boxes} onChange={setBoxes} disabled={!cabin} />
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!data?.points.length} className="gap-1 text-emerald-700 border-emerald-200">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!data?.points.length} className="gap-1 text-red-700 border-red-200">
            <Printer className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {!central && <p className="p-6 text-sm text-muted-foreground text-center">اختار السنترال الأول (والكابينة والبكسيات لو حابب تضيّق).</p>}
      {central && isLoading && <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}
      {error && <p className="p-6 text-sm text-red-700 text-center">{(error as Error).message}</p>}

      {data && (
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-slate-100">خطوط فى الفلتر: <b>{data.totalLines}</b></span>
            <span className="px-2 py-1 rounded bg-blue-50 text-blue-800">ليها Loop Length: <b>{data.withLoop}</b></span>
            <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-800">اترسمت: <b>{data.points.length}</b></span>
            {data.special > 0 && <span className="px-2 py-1 rounded bg-amber-50 text-amber-800" title="الاسكور > 100 حالة خاصة (داتا ناقصة، بلوك…) مش قراية">اسكور &gt; 100 (اتشالت): <b>{data.special}</b></span>}
            {data.unreadable > 0 && <span className="px-2 py-1 rounded bg-slate-100" title="N/A أو نص مش مفهوم">Loop مش مقروء: <b>{data.unreadable}</b></span>}
          </div>
          {data.withLoop === 0 && (
            <p className="text-sm text-muted-foreground">مفيش خطوط فى الفلتر ده ليها Loop Length لسه — القيمة دى بتيجى من «قياس بدون Real» بس.</p>
          )}

          <div ref={chartsRef} className="grid gap-4 lg:grid-cols-3">
            {series.map((s) => (
              <div key={s.key} data-chart={s.title} className="border rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <h4 className="text-sm font-semibold">{s.title}</h4>
                  <span className="text-xs text-muted-foreground">{s.xy.length} نقطة</span>
                </div>
                <p className="text-xs mb-2" style={{ color: s.color }}>
                  {s.fit ? <>r = <b>{s.fit.r.toFixed(2)}</b> — {strengthOf(s.fit.r)} · كل ١٠٠ متر: {s.fit.slope * 100 >= 0 ? "+" : ""}{(s.fit.slope * 100).toFixed(s.key === "score" ? 2 : 0)}{s.unit ? ` ${s.unit}` : ""}</> : "نقط قليلة لحساب الارتباط (محتاج ٣ على الأقل)"}
                </p>
                <div dir="ltr" style={{ width: "100%", height: 280 }}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" dataKey="x" name="طول الخط" unit=" m" tick={{ fontSize: 11 }}
                        label={{ value: "Loop Length (m)", position: "insideBottom", offset: -14, fontSize: 11 }} />
                      <YAxis type="number" dataKey="y" name={s.title} tick={{ fontSize: 11 }} width={52}
                        tickFormatter={(v) => (s.key === "score" ? String(v) : fmt(v))} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                        const d: any = payload?.[0]?.payload; if (!d?.p) return null;
                        return (
                          <div dir="rtl" className="bg-white border rounded px-2 py-1 text-xs shadow">
                            <div className="font-semibold">{d.p.fullPhone}</div>
                            <div>كابينة {d.p.cabinNumber} · بكس {d.p.boxNumber}</div>
                            <div>طول الخط: {fmt(d.x)} م ({d.p.loopRaw})</div>
                            <div>{s.key === "score" ? "الاسكور" : s.key === "maxSpeed" ? "أقصى سرعة" : "السرعة الحالية"}: {s.key === "score" ? d.y : `${fmt(d.y)} kbps`}</div>
                          </div>
                        );
                      }} />
                      <Scatter data={s.xy} fill={s.color} fillOpacity={0.7} isAnimationActive={false} />
                      {s.seg && <ReferenceLine segment={s.seg} stroke="#dc2626" strokeDasharray="6 4" strokeWidth={2} ifOverflow="extendDomain" />}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            كل نقطة = خط، من آخر «قياس بدون Real» ليه (هو اللى فيه Loop Length)، والسرعات والاسكور من نفس القياس.
            الخط الأحمر المتقطّع = الاتجاه العام. r قريب من −١ = كل ما الخط يطول القيمة بتقل بانتظام.
          </p>
        </div>
      )}
    </Card>
  );
}
