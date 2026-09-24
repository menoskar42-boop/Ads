import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, FileSpreadsheet, FileText, Gauge } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";
import { closeReason } from "@/lib/close-codes";
import PoStatusCell from "./PoStatusCell";

interface Row {
  id: number;
  fullPhone: string | null;
  phoneShort: string | null;
  accountNo: string | null;
  central: string | null;
  cabinNumber: string | null;
  boxNumber: string | null;
  msanCode: string | null;
  techName: string | null;
  closeCode: string | null;
  flaggedAt: string | null;
  flaggedBy: string | null;
  regularizedAt: string | null;
  regularizedBy: string | null;
  currentSpeed: string | null;
  maxSpeed: string | null;
  score: number;
  poStatus: string | null;
  measuredAt: string | null;
}

const fmt = (iso: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}/${p(date.getUTCMonth() + 1)}/${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}`;
};

export function ManualRegularizedHighScoreReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/manual-faults/regularized-high-score", { credentials: "include" });
      if (!response.ok) throw new Error("تعذّر تحميل التقرير");
      const payload = await response.json() as { data?: Row[] };
      setRows(payload.data ?? []);
    } catch (e: any) {
      setError(e?.message || "تعذّر تحميل التقرير");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // القياس يُحفظ بعد انتهاء مهمة التنفيذ؛ حدّث التقرير تلقائياً إذا كان مفتوحاً.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const columns = [
    "تاريخ الانتظام", "رقم التليفون", "رقم الأكونت", "السرعة الحالية", "أقصى سرعة",
    "الاسكور", "حالة PO", "تاريخ القياس", "السنترال", "الكابينة", "البكس",
    "سبب الإغلاق", "فنى الانتظام", "تاريخ العطل", "سجّل العطل",
  ];
  const dash = (value: string | number | null | undefined) =>
    value == null || value === "" ? "-" : String(value);
  const toRow = (row: Row) => [
    fmt(row.regularizedAt), row.fullPhone || row.phoneShort || "-", dash(row.accountNo),
    dash(row.currentSpeed), dash(row.maxSpeed), row.score, dash(row.poStatus),
    fmt(row.measuredAt), dash(row.central), dash(row.cabinNumber), dash(row.boxNumber),
    closeReason(row.closeCode) || dash(row.closeCode), dash(row.regularizedBy),
    fmt(row.flaggedAt), dash(row.flaggedBy),
  ];

  const handleExportExcel = () => {
    const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows.map(toRow)]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "اسكور عالي");
    XLSX.writeFile(workbook, "manual-regularized-high-score.xlsx");
  };
  const handleExportPDF = () => printTablePDF({
    title: "أعطال منتظمة خارج الشاشة - اسكور عالي",
    columns,
    rows: rows.map(toRow),
  });

  return (
    <Card className="p-4 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Gauge className="w-5 h-5 text-amber-600" /> أعطال منتظمة خارج الشاشة - اسكور عالي
          </h2>
          <p className="text-xs text-muted-foreground">
            يعرض أول قياس DZS مسجّل بعد الانتظام فقط إذا كان الاسكور أعلى من 25.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void load()} size="sm" className="gap-1" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            تحديث
          </Button>
          <Button onClick={handleExportExcel} variant="outline" size="sm" className="gap-1 text-green-700 border-green-200" disabled={!rows.length}>
            <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
          </Button>
          <Button onClick={handleExportPDF} variant="outline" size="sm" className="gap-1 text-red-700 border-red-200" disabled={!rows.length}>
            <FileText className="w-4 h-4" /> تصدير PDF
          </Button>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        إجمالى: <strong>{rows.length}</strong> عطل منتظم باسكور أعلى من 25
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="rounded-md border max-h-[65vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => <TableHead key={column} className="text-right whitespace-nowrap">{column}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="text-center h-24"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center h-24 text-muted-foreground">
                  لا توجد أعطال منتظمة خارج الشاشة بقياس بعد الانتظام اسكوره أعلى من 25
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">{fmt(row.regularizedAt)}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{row.fullPhone || row.phoneShort || "-"}</TableCell>
                <TableCell className="whitespace-nowrap">{row.accountNo || "-"}</TableCell>
                <TableCell>{row.currentSpeed || "-"}</TableCell>
                <TableCell>{row.maxSpeed || "-"}</TableCell>
                <TableCell className="font-semibold text-amber-700">{row.score}</TableCell>
                <TableCell><PoStatusCell value={row.poStatus} /></TableCell>
                <TableCell className="whitespace-nowrap">{fmt(row.measuredAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{row.central || "-"}</TableCell>
                <TableCell>{row.cabinNumber || "-"}</TableCell>
                <TableCell>{row.boxNumber || "-"}</TableCell>
                <TableCell className="whitespace-nowrap">{closeReason(row.closeCode) || row.closeCode || "-"}</TableCell>
                <TableCell className="whitespace-nowrap">{row.regularizedBy || "-"}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt(row.flaggedAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{row.flaggedBy || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}