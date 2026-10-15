// «انخفاض السرعة بعد الانتظام» — تاب القياسات (المالك ٢٠٢٦-١٠-١٢): خطوط الأعطال المنتظمة فى الفترة
// (الافتراضى الشهر الحالى) اللى سرعتها الحالية («بدون Real» الأخير) أقل بأكتر من ١٠٪ من أول قياس
// «بدون Real» بعد تاريخ الشكوى. السيرفر: /api/reports/regularized-speed-drop.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Gauge, History, Info, Loader2, Printer, Radar, TrendingDown } from "lucide-react";
import { useMobileLookup, phoneLookupKey, MobileValue } from "@/lib/mobile-lookup";
import { LineDetailsDialog } from "@/components/LineDetailsDialog";
import { printTablePDF } from "@/lib/print-pdf";
import { useSpeedToolsVisible, useIsSuperAdmin } from "@/lib/use-speed-tools";
import { useSpeedToolSource } from "@/hooks/use-speed-tool-source";
import { openProfileOptimization } from "@/lib/profile-optimization";
import { dispatchSpeedTool, noRealUrl } from "@/lib/exec-queue";

const DZS_URL = "https://10.42.187.101:8080/expresse/";
const buildDZSUrl = (accounts: string[]) => `${DZS_URL}#sf_accounts=${encodeURIComponent(accounts.join(","))}`;

interface DropRow {
  phone: string; complainNo: string | null; complainTime: string | null; central: string | null; cabinet: string | null;
  techName: string | null; accountNo: string | null;
  firstSpeed: string | null; firstAt: string | null; firstScore: number | null;
  lastSpeed: string | null; lastAt: string | null; lastScore: number | null;
  firstKbps: number | null; lastKbps: number | null; dropPct: number;
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const day = (v: string | null) => (v ? String(v).slice(0, 10) : "");
const dt = (v: string | null) => (v ? String(v).slice(0, 16).replace("T", " ") : "");
const kb = (n: number | null) => (n == null ? "" : n.toLocaleString("en-US"));

const COLS = ["#", "رقم التليفون", "رقم الموبايل", "السنترال", "الكابينة", "الفنى", "رقم الأكونت", "رقم الشكوى", "تاريخ الشكوى",
  "أول قياس بعد الشكوى", "السرعة وقتها (kbps)", "آخر قياس", "السرعة الحالية (kbps)", "الانخفاض %", "الاسكور الحالى"];

export function SpeedDropReport() {
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [minDrop, setMinDrop] = useState("10");
  // فلتر الفنى (المالك ٢٠٢٦-١٠-١٥) — والأزرار والإكسيل والـPDF بيشتغلوا على المفلتر بس
  const [tech, setTech] = useState("all");
  // أزرار القياس ورفع السرعة والإيقاف (المالك ٢٠٢٦-١٠-١٢) — نفس باقى تقارير القياسات
  const showSpeedTools = useSpeedToolsVisible();
  const isSuper = useIsSuperAdmin();
  useSpeedToolSource("انخفاض السرعة بعد الانتظام");
  // رقم الموبايل + زرار التفاصيل جنب رقم التليفون (المالك ٢٠٢٦-١٠-١٢) — زى «الأعطال الحالية»
  const qc = useQueryClient();
  const [detailPhone, setDetailPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [mobileInput, setMobileInput] = useState("");
  const [savingMobile, setSavingMobile] = useState(false);
  const saveMobile = async (phone: string) => {
    setSavingMobile(true);
    try {
      const r = await fetch("/api/line-mobiles", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullPhone: phone, mobile: mobileInput.trim() }),
      });
      if (!r.ok) throw new Error();
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["/api/phone-lines/mobile-lookup"] });
    } catch { alert("تعذّر حفظ رقم الموبايل"); } finally { setSavingMobile(false); }
  };
  const q = useQuery<{ data: DropRow[] }>({
    queryKey: ["/api/reports/regularized-speed-drop", from, to, minDrop],
    queryFn: async () => {
      const p = new URLSearchParams({ dateFrom: from, dateTo: to, minDrop: minDrop || "10" });
      const r = await fetch(`/api/reports/regularized-speed-drop?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "تعذّر التحميل");
      return r.json();
    },
    refetchOnMount: "always",
  });
  const allRows = q.data?.data ?? [];
  const techNames = Array.from(new Set(allRows.map((r) => (r.techName ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar"));
  const NO_TECH = "__none__";
  const hasNoTech = allRows.some((r) => !(r.techName ?? "").trim());
  const rows = tech === "all" ? allRows
    : tech === NO_TECH ? allRows.filter((r) => !(r.techName ?? "").trim())
    : allRows.filter((r) => (r.techName ?? "").trim() === tech);
  const mobileLookup = useMobileLookup(rows.map((r) => r.phone));
  const mobileOf = (r: DropRow) => mobileLookup[phoneLookupKey(r.phone)] ?? "";
  const cells = (r: DropRow, i: number) => [
    i + 1, r.phone, mobileOf(r), r.central ?? "", r.cabinet ?? "", r.techName ?? "", r.accountNo ?? "", r.complainNo ?? "", day(r.complainTime),
    dt(r.firstAt), kb(r.firstKbps), dt(r.lastAt), kb(r.lastKbps), `${r.dropPct}%`, r.lastScore ?? "",
  ];
  const accountsOf = () => {
    const seen = new Set<string>();
    return rows.map((r) => String(r.accountNo ?? "").trim()).filter((a) => a && !seen.has(a) && seen.add(a));
  };
  const handleMeasure = async (noReal = false) => {
    const accounts = accountsOf();
    if (!accounts.length) { alert("لا توجد أرقام أكونت فى الخطوط المعروضة"); return; }
    const w = window.open("about:blank", "dzs_measure");
    if (await dispatchSpeedTool("measure", accounts, isSuper, { noReal })) { try { w?.close(); } catch {} return; }
    if (w) w.location.href = noRealUrl(buildDZSUrl(accounts), noReal);
  };
  const handleRaisePO = async (kind: "raise" | "stop") => {
    const accounts = accountsOf();
    if (!accounts.length) { alert("لا توجد أرقام أكونت فى الخطوط المعروضة"); return; }
    if (await dispatchSpeedTool(kind === "stop" ? "stop" : "raise", accounts, isSuper)) return;
    const afterStop = kind === "raise"
      ? window.confirm("رفع السرعة والإيقاف؟\n\nموافق = رفع السرعة لكل الأرقام ثم إيقاف الـ Nightly الناتج لكلهم\nإلغاء = رفع السرعة فقط")
      : false;
    openProfileOptimization(accounts, kind === "stop" ? { stopOnly: true } : { afterStop });
  };
  const measureOne = async (acc: string) => {
    if (await dispatchSpeedTool("measure", [acc], isSuper)) return;
    window.open(buildDZSUrl([acc]), "dzs_measure");
  };

  const techLabel = tech === "all" ? "" : ` — الفنى: ${tech === NO_TECH ? "بدون فنى" : tech}`;
  const title = `انخفاض السرعة بعد الانتظام (أكتر من ${minDrop || 10}%) — ${from} إلى ${to}${techLabel}`;
  const excel = () => {
    const ws = XLSX.utils.aoa_to_sheet([COLS, ...rows.map(cells)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "انخفاض السرعة");
    XLSX.writeFile(wb, `speed-drop-${from}-${to}.xlsx`);
  };
  const pdf = () => printTablePDF({ title, columns: COLS, rows: rows.map(cells), rowsPerPage: 14 });

  return (
    <Card className="p-4 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><TrendingDown className="w-5 h-5 text-red-600" /> انخفاض السرعة بعد الانتظام</h2>
          <p className="text-xs text-muted-foreground">
            خطوط الأعطال المنتظمة فى الفترة اللى سرعتها الحالية (آخر قياس بدون Real) أقل من أول قياس بدون Real بعد تاريخ الشكوى.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showSpeedTools && (<>
            <Button variant="outline" size="sm" onClick={() => handleMeasure()} disabled={!rows.length} className="text-blue-700 border-blue-200 gap-1" data-testid="button-speed-drop-measure">
              <Radar className="w-4 h-4" /> قياس DZS
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleMeasure(true)} disabled={!rows.length} className="text-amber-700 border-amber-300 gap-1"
              title="قياس من غير real-time: أحدث تاريخ من History Check فى ClearView + Estimated Loop Length">
              <History className="w-4 h-4" /> قياس بدون Real
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleRaisePO("raise")} disabled={!rows.length} className="text-emerald-700 border-emerald-200 gap-1"
              title="رفع السرعة (Profile Optimization) للخطوط المعروضة">
              <Gauge className="w-4 h-4" /> رفع سرعة
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleRaisePO("stop")} disabled={!rows.length} className="text-orange-700 border-orange-200 gap-1"
              title="إيقاف الـ Nightly PO فقط للخطوط المعروضة">
              <Gauge className="w-4 h-4" /> إيقاف PO
            </Button>
          </>)}
          <Button variant="outline" size="sm" onClick={excel} disabled={!rows.length} className="gap-1 text-green-700 border-green-200"><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={pdf} disabled={!rows.length} className="gap-1 text-red-700 border-red-200" data-testid="button-speed-drop-pdf"><Printer className="w-4 h-4" /> PDF</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="text-xs text-muted-foreground block mb-1" htmlFor="sd-from">شكاوى من</label>
          <Input id="sd-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-sm w-40" dir="ltr" /></div>
        <div><label className="text-xs text-muted-foreground block mb-1" htmlFor="sd-to">إلى</label>
          <Input id="sd-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-sm w-40" dir="ltr" /></div>
        <div><label className="text-xs text-muted-foreground block mb-1" htmlFor="sd-min">الانخفاض أكتر من %</label>
          <Input id="sd-min" inputMode="numeric" value={minDrop} onChange={(e) => setMinDrop(e.target.value.replace(/[^\d]/g, ""))} className="text-sm w-24" dir="ltr" /></div>
        <div><label className="text-xs text-muted-foreground block mb-1" htmlFor="sd-tech">الفنى</label>
          <select id="sd-tech" value={tech} onChange={(e) => setTech(e.target.value)} data-testid="select-speed-drop-tech"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm w-44">
            <option value="all">كل الفنيين</option>
            {techNames.map((n) => <option key={n} value={n}>{n} ({allRows.filter((r) => (r.techName ?? "").trim() === n).length})</option>)}
            {hasNoTech && <option value={NO_TECH}>بدون فنى</option>}
            {tech !== "all" && tech !== NO_TECH && !techNames.includes(tech) && <option value={tech}>{tech}</option>}
          </select></div>
        <span className="text-sm text-muted-foreground pb-2">
          {q.isFetching && <Loader2 className="w-4 h-4 animate-spin inline ml-1" />}
          إجمالى: <b className="text-foreground">{rows.length}</b> خط{tech !== "all" && <> من {allRows.length}</>}
        </span>
      </div>
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="rounded-md border overflow-auto max-h-[65vh]">
        <Table className="text-xs">
          <TableHeader><TableRow>{COLS.map((c) => <TableHead key={c} className="text-right whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={COLS.length} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
            ) : !rows.length ? (
              <TableRow><TableCell colSpan={COLS.length} className="text-center h-24 text-muted-foreground">مفيش خطوط سرعتها نزلت بالنسبة دى فى الفترة</TableCell></TableRow>
            ) : rows.map((r, i) => (
              <TableRow key={r.phone}>
                {cells(r, i).map((c, j) => (
                  <TableCell key={j} dir={j === 1 || j === 6 ? "ltr" : undefined}
                    className={`whitespace-nowrap tabular-nums ${j === 13 ? (r.dropPct >= 30 ? "font-bold text-red-700 bg-red-50" : "font-bold text-orange-700") : ""}`}>
                    {j === 1 ? (
                      <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-blue-700">
                        {c}
                        <button type="button" onClick={() => setDetailPhone(r.phone)} title="تفاصيل الخط والاتصال"
                          aria-label={`تفاصيل الخط والاتصال ${r.phone}`} className="text-purple-600 hover:text-purple-800">
                          <Info className="w-4 h-4" />
                        </button>
                      </span>
                    ) : j === 2 ? (
                      isSuper && editing === r.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Input value={mobileInput} onChange={(e) => setMobileInput(e.target.value)} placeholder="رقم الموبايل"
                            className="h-7 w-32 px-2 text-xs" dir="ltr" inputMode="tel" />
                          <button type="button" onClick={() => saveMobile(r.phone)} disabled={savingMobile}
                            className="text-[11px] text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1 disabled:opacity-50">
                            {savingMobile ? "..." : "حفظ"}
                          </button>
                          <button type="button" onClick={() => setEditing(null)} disabled={savingMobile} className="text-[11px] text-gray-500 px-1">إلغاء</button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <MobileValue mobile={mobileOf(r) || null} phone={r.phone} />
                          {isSuper && (
                            <button type="button" onClick={() => { setMobileInput(mobileOf(r)); setEditing(r.phone); }}
                              className="text-[11px] text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50">
                              {mobileOf(r) ? "تعديل" : "＋ إضافة"}
                            </button>
                          )}
                        </span>
                      )
                    ) : j === 6 && r.accountNo && showSpeedTools ? (
                      <span className="inline-flex items-center gap-1">
                        {c}
                        <button type="button" onClick={() => measureOne(String(r.accountNo).trim())}
                          title="قياس هذا الرقم" aria-label={`قياس ${r.accountNo}`} className="text-blue-600 hover:text-blue-800">
                          <Radar className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ) : c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {detailPhone && <LineDetailsDialog phone={detailPhone} onClose={() => setDetailPhone(null)} />}
    </Card>
  );
}
