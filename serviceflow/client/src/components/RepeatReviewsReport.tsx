import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileSpreadsheet, Printer, ClipboardCheck } from "lucide-react";
import { printTablePDF } from "@/lib/print-pdf";
import { RepeatReviewDialog, REPEAT_STEP_LABELS } from "@/components/RepeatReviewDialog";

// «ردود التكرار» — تقرير السوبر أدمن (قرار المالك ٢٠٢٦-١٠-٠٤): كل رد على خط مكرر (رد للخط
// فى الشهر) بالبيان والفحص والإفادات والتقييم والمقصّر، وبيتطبع PDF.
const KIND_AR: Record<string, string> = { tech: "فنى", maintenance: "فنى صيانة", splice: "لحام" };
const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 7);
const day = (v: any) => (v ? String(v).slice(0, 10) : "");
const at = (v: any) => (v ? new Date(v).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "");

const COLUMNS = ["#", "رقم التليفون", "الشهر", "الحالة", "السنترال", "الكابينة", "البكس", "بيان الخط",
  "الفحص", "إفادة العميل", "إفادة الفنى", "سبب العطل", "يوجد مقصّر", "المقصّر", "رد بواسطة", "تاريخ الإكمال"];

export function RepeatReviewsReport() {
  const [from, setFrom] = useState(thisMonth);
  const [to, setTo] = useState(thisMonth);
  const [doneOnly, setDoneOnly] = useState(true);
  const [open, setOpen] = useState<{ phone: string; month: string } | null>(null);

  const q = useQuery<{ data: any[] }>({
    queryKey: ["/api/repeat-reviews/report", from, to],
    queryFn: async () => {
      const r = await fetch(`/api/repeat-reviews/report?from=${from}&to=${to}`, { credentials: "include" });
      if (!r.ok) throw new Error("تعذّر التحميل");
      return r.json();
    },
    refetchOnMount: "always",
  });
  const rows = useMemo(() => (q.data?.data ?? []).filter((r) => !doneOnly || r.status === "done"), [q.data, doneOnly]);

  const toCells = (r: any, i: number) => [
    i + 1, r.phone_short, r.month,
    r.status === "done" ? "مكتمل" : `جارى — ${REPEAT_STEP_LABELS[r.step] ?? ""}`,
    r.line_central ?? "", r.line_cabin ?? "", r.line_box ?? "",
    r.line_status === "corrected" ? "اتصحّح" : r.line_status === "confirmed" ? "اتأكد" : "",
    r.inspection_id ? `${day(r.inspection_date)}${r.inspection_by ? " — " + r.inspection_by : ""} — بنود محتاجة شغل: ${r.inspection_bad_items ?? 0}` : "",
    r.customer_statement ?? "", r.tech_statement ?? "", r.cause ?? "",
    r.has_fault === true ? "نعم" : r.has_fault === false ? "لا" : "",
    r.has_fault ? `${r.at_fault_name ?? ""}${r.at_fault_kind ? ` (${KIND_AR[r.at_fault_kind] ?? r.at_fault_kind})` : ""}` : "",
    r.completed_by || r.updated_by || "",
    at(r.completed_at),
  ];

  const handleExportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows.map(toCells)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ردود التكرار");
    XLSX.writeFile(wb, `repeat-reviews-${from}-${to}.xlsx`);
  };
  const handleExportPDF = () => {
    printTablePDF({ title: `ردود التكرار — ${from} إلى ${to}${doneOnly ? " (المكتملة)" : ""}`, columns: COLUMNS, rows: rows.map(toCells), rowsPerPage: 6 });
  };

  const total = rows.length;
  const faults = rows.filter((r) => r.has_fault).length;

  return (
    <Card className="p-4 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-purple-700" /> ردود التكرار</h2>
          <p className="text-xs text-muted-foreground">رد واحد لكل خط مكرر فى الشهر: بيان الخط ← فحص البكس ← إفادة العميل والفنى ← سبب العطل والمقصّر.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExportExcel} variant="outline" size="sm" className="gap-1 text-green-700 border-green-200" disabled={!rows.length}><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="gap-1 text-red-700 border-red-200" disabled={!rows.length} data-testid="button-repeat-reviews-pdf"><Printer className="w-4 h-4" /> PDF</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div><label className="text-xs text-muted-foreground block mb-1">من شهر</label>
          <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="text-sm w-40" dir="ltr" /></div>
        <div><label className="text-xs text-muted-foreground block mb-1">إلى شهر</label>
          <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="text-sm w-40" dir="ltr" /></div>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={doneOnly} onChange={(e) => setDoneOnly(e.target.checked)} /> المكتملة بس</label>
        <span className="text-sm text-muted-foreground">إجمالى: <b>{total}</b> رد — يوجد مقصّر: <b>{faults}</b></span>
      </div>

      <div className="rounded-md border max-h-[60vh] overflow-auto">
        <Table className="text-xs">
          <TableHeader><TableRow>{COLUMNS.map((c) => <TableHead key={c} className="text-right whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={COLUMNS.length} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={COLUMNS.length} className="text-center h-24 text-muted-foreground">لا توجد ردود فى الفترة دى</TableCell></TableRow>
            ) : rows.map((r, i) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-purple-50" onClick={() => setOpen({ phone: r.phone_short, month: r.month })}>
                {toCells(r, i).map((c, j) => <TableCell key={j} className={j >= 9 && j <= 11 ? "min-w-[180px] whitespace-pre-wrap" : "whitespace-nowrap"}>{c || "—"}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {open && (
        <RepeatReviewDialog phone={open.phone} month={open.month} open
          onOpenChange={(v) => { if (!v) setOpen(null); }} onChanged={() => { void q.refetch(); }} />
      )}
    </Card>
  );
}
