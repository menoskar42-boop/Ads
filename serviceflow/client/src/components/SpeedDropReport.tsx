// «انخفاض السرعة بعد الانتظام» — تاب القياسات (المالك ٢٠٢٦-١٠-١٢): خطوط الأعطال المنتظمة فى الفترة
// (الافتراضى الشهر الحالى) اللى سرعتها الحالية («بدون Real» الأخير) أقل بأكتر من ١٠٪ من أول قياس
// «بدون Real» بعد تاريخ الشكوى. السيرفر: /api/reports/regularized-speed-drop.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Loader2, Printer, TrendingDown } from "lucide-react";
import { printTablePDF } from "@/lib/print-pdf";

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

const COLS = ["#", "رقم التليفون", "السنترال", "الكابينة", "الفنى", "رقم الأكونت", "رقم الشكوى", "تاريخ الشكوى",
  "أول قياس بعد الشكوى", "السرعة وقتها (kbps)", "آخر قياس", "السرعة الحالية (kbps)", "الانخفاض %", "الاسكور الحالى"];

export function SpeedDropReport() {
  const [from, setFrom] = useState(() => today().slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [minDrop, setMinDrop] = useState("10");
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
  const rows = q.data?.data ?? [];
  const cells = (r: DropRow, i: number) => [
    i + 1, r.phone, r.central ?? "", r.cabinet ?? "", r.techName ?? "", r.accountNo ?? "", r.complainNo ?? "", day(r.complainTime),
    dt(r.firstAt), kb(r.firstKbps), dt(r.lastAt), kb(r.lastKbps), `${r.dropPct}%`, r.lastScore ?? "",
  ];
  const title = `انخفاض السرعة بعد الانتظام (أكتر من ${minDrop || 10}%) — ${from} إلى ${to}`;
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
        <div className="flex gap-2">
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
        <span className="text-sm text-muted-foreground pb-2">
          {q.isFetching && <Loader2 className="w-4 h-4 animate-spin inline ml-1" />}
          إجمالى: <b className="text-foreground">{rows.length}</b> خط
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
                  <TableCell key={j} dir={j === 1 || j === 5 ? "ltr" : undefined}
                    className={`whitespace-nowrap tabular-nums ${j === 12 ? (r.dropPct >= 30 ? "font-bold text-red-700 bg-red-50" : "font-bold text-orange-700") : ""}`}>{c}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
