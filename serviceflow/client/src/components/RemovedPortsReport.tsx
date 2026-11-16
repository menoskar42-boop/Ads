import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshButton } from "@/components/RefreshButton";
import { Loader2, Search, X, FileSpreadsheet, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";
import { useMobileLookup, phoneLookupKey, MobileValue } from "@/lib/mobile-lookup";

// «جدول الخطوط المرفوعة»: أرقام كان لها بورت واختفت من شيت البورتات الجديد.
// بتتنقل هنا ببياناتها الأخيرة بدل ما تتمسح، ولو رجعت فى شيت بعدين بتتشال من هنا
// تلقائياً — فالتقرير ده معناه «المرفوعة حالياً».
interface Row {
  phoneNumber: string;
  areaCode: string | null;
  msanCode: string | null;
  frame: string | null;
  shelf: string | null;
  slot: string | null;
  portNumber: string | null;
  portType: string | null;
  voiceStatus: string | null;
  dataStatus: string | null;
  operator: string | null;
  onu: string | null;
  lastUploadedAt: string | null;
  removedAt: string | null;
  removedSource: string | null;
  // أعمدة «بيان أرقام التليفونات» (المالك ٢٠٢٦-١١-١٢)
  telNo: string | null;
  central: string | null;
  cabinNumber: string | null;
  boxNumber: string | null;
  subName: string | null;
  subAdd: string | null;
  accountNo: string | null;
  iduNo: string | null;
  oduNo: string | null;
  primaryBlockNo: string | null;
  cabinetIn: string | null;
  secBlockNo: string | null;
  cabinetOut: string | null;
  dpTerminal: string | null;
  linePort: string | null;
  len: string | null;
  fiberBlock: string | null;
  fiberOut: string | null;
  techName: string | null;
}

const fmtDt = (d: string | null) => {
  if (!d) return "-";
  const t = new Date(d);
  if (isNaN(t.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};
const srcLabel = (s: string | null) =>
  s === "portal" ? "رفع تلقائى (البورتال)" : s === "sheet" ? "رفع الشيت يدوى" : "-";

// نفس أعمدة «بيان أرقام التليفونات» (المالك ٢٠٢٦-١١-١٢)، وبعدها بيانات الرفع اللى كانت موجودة
const LINE_COLS: [string, (r: Row) => any][] = [
  ["رقم الأكونت", (r) => r.accountNo],
  ["السنترال", (r) => r.central],
  ["اسم العميل", (r) => r.subName],
  ["العنوان", (r) => r.subAdd],
  ["رقم الكابينه", (r) => r.cabinNumber],
  ["رقم البكس", (r) => r.boxNumber],
  ["رقم التليفون (قصير)", (r) => r.telNo],
];
const TECH_COLS: [string, (r: Row) => any][] = [
  ["IDU", (r) => r.iduNo],
  ["ODU", (r) => r.oduNo],
  ["Primary Block", (r) => r.primaryBlockNo],
  ["Cabinet In", (r) => r.cabinetIn],
  ["Sec Block", (r) => r.secBlockNo],
  ["Cabinet Out", (r) => r.cabinetOut],
  ["DP Terminal", (r) => r.dpTerminal],
  ["Port (البيانات الفنية)", (r) => r.linePort],
  ["LEN", (r) => r.len],
  ["Fiber Block", (r) => r.fiberBlock],
  ["Fiber Out", (r) => r.fiberOut],
  ["الفنى", (r) => r.techName],
];
const COLS: [string, (r: Row) => any][] = [
  ["رقم التليفون", (r) => r.phoneNumber],
  ["كود المسان", (r) => r.msanCode],
  ["الفريم", (r) => r.frame],
  ["Shelf", (r) => r.shelf],
  ["Slot", (r) => r.slot],
  ["البورت", (r) => r.portNumber],
  ["نوع البورت", (r) => r.portType],
  ["Voice", (r) => r.voiceStatus],
  ["Data", (r) => r.dataStatus],
  ["المشغّل", (r) => r.operator],
  ["آخر ظهور فى الشيت", (r) => fmtDt(r.lastUploadedAt)],
  ["اترفع فى", (r) => fmtDt(r.removedAt)],
  ["مصدر الرفع", (r) => srcLabel(r.removedSource)],
];

export function RemovedPortsReport() {
  const [q, setQ] = useState("");
  // صفحات ٢٠٠ صف (المالك ٢٠٢٦-١١-١٢: «كل ما بدخل عليه بيهنج» — كان بيرسم لحد ٢٠ ألف صف مرة واحدة)، والبحث
  // بيتبعت بعد ما تبطّل كتابة بنص ثانية. التصدير بيجيب الكل من السيرفر.
  const [qDeb, setQDeb] = useState("");
  const [page, setPage] = useState(1);
  const PAGE = 200;
  useEffect(() => { const t = setTimeout(() => { setQDeb(q); setPage(1); }, 500); return () => clearTimeout(t); }, [q]);
  // نفس فلاتر «بيان أرقام التليفونات»: السنترال/الكابينة/البكس/من رقم لرقم (بتتطبّق بزرار «تطبيق»)
  const EMPTY_F = { central: "", cabin: "", box: "", phoneFrom: "", phoneTo: "" };
  const [fDraft, setFDraft] = useState(EMPTY_F);
  const [f, setF] = useState(EMPTY_F);
  const fQs = Object.entries(f).filter(([, v]) => v.trim()).map(([k, v]) => `&${k}=${encodeURIComponent(v.trim())}`).join("");
  const fetchRows = async (all: boolean) => {
    const res = await fetch(`/api/phone-ports/removed?q=${encodeURIComponent(qDeb)}${fQs}${all ? "&all=1" : `&page=${page}&pageSize=${PAGE}`}`, { credentials: "include" });
    if (!res.ok) throw new Error("تعذّر التحميل");
    return res.json() as Promise<{ data: Row[]; total: number }>;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["/api/phone-ports/removed", qDeb, fQs, page],
    queryFn: () => fetchRows(false),
    refetchOnMount: "always",
  });

  const rows = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const mobileLookup = useMobileLookup(rows.map((r) => r.phoneNumber));
  const columns = [
    ["رقم التليفون", (r: Row) => r.phoneNumber],
    ...LINE_COLS,
    ["رقم الموبايل", (r: Row) => mobileLookup[phoneLookupKey(r.phoneNumber)] || ""],
    ...TECH_COLS,
    ...COLS.slice(1),
  ] as [string, (r: Row) => any][];

  const handleExportExcel = async () => {
    const allRows = (await fetchRows(true)).data;
    const ws = XLSX.utils.json_to_sheet(
      allRows.map((r) => Object.fromEntries(columns.map(([h, f]) => [h, f(r) ?? ""]))),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الخطوط المرفوعة");
    XLSX.writeFile(wb, "الخطوط-المرفوعة.xlsx");
  };

  const handleExportPDF = async () => {
    const allRows = (await fetchRows(true)).data;
    printTablePDF({
      title: "جدول الخطوط المرفوعة (اتشال بورتها من الشيت)",
      columns: columns.map(([h]) => h),
      rows: allRows.map((r) => columns.map(([, f]) => f(r) ?? "-")),
    });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base">جدول الخطوط المرفوعة</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              أرقام كان لها بورت واختفت من شيت البورتات الجديد — اتأرشفت هنا ببياناتها الأخيرة بدل ما تتمسح.
              لو الرقم رجع فى شيت بعدين بيتشال من هنا تلقائياً.
              {data && <span className="text-purple-600"> {" "}({data.total.toLocaleString("ar-EG")} رقم)</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث برقم التليفون / المسان / المشغّل…"
                className="h-9 w-64 pr-8 text-sm"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} title="مسح البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {([["central", "السنترال", "w-28"], ["cabin", "الكابينة", "w-20"], ["box", "البكس", "w-20"],
               ["phoneFrom", "من رقم", "w-28"], ["phoneTo", "إلى رقم", "w-28"]] as const).map(([k, ph, w]) => (
              <Input key={k} value={fDraft[k]} placeholder={ph} className={`h-9 ${w} text-sm`}
                onChange={(e) => setFDraft((d) => ({ ...d, [k]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { setF(fDraft); setPage(1); } }} />
            ))}
            <Button size="sm" variant="outline" onClick={() => { setF(fDraft); setPage(1); }}>تطبيق</Button>
            {Object.values(f).some((v) => v.trim()) && (
              <Button size="sm" variant="ghost" onClick={() => { setFDraft(EMPTY_F); setF(EMPTY_F); setPage(1); }}>مسح الفلاتر</Button>
            )}
            <RefreshButton />
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1 text-green-700 border-green-200">
              <FileSpreadsheet className="w-4 h-4" /> تصدير Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1 text-red-700 border-red-200">
              <Printer className="w-4 h-4" /> تصدير PDF
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-auto">
        {isLoading ? (
          <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">مفيش خطوط مرفوعة</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>{columns.map(([h]) => <TableHead key={h} className="text-right whitespace-nowrap">{h}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.phoneNumber}>
                  {columns.map(([h, f]) => (
                    <TableCell key={h} className="whitespace-nowrap text-sm">
                      {h === "رقم الموبايل"
                        ? <MobileValue mobile={f(r)} phone={r.phoneNumber} />
                        : f(r) ?? "-"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 p-3 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
            <span>صفحة {page.toLocaleString("ar-EG")} من {pages.toLocaleString("ar-EG")}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>التالى</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
