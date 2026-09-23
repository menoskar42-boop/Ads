import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageJump } from "@/components/ui/page-jump";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { RefreshButton } from "@/components/RefreshButton";
import { LineDetailsDialog } from "@/components/LineDetailsDialog";
import { formatContactTime } from "@/components/CustomerContactActions";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Row = {
  id: number | null;
  fullPhone: string;
  telNo: string;
  accountNo: string;
  accountSource: string | null;
  central: string | null;
  cabinNumber: string | null;
  boxNumber: string | null;
  lineCurrentSpeed: string | number | null;
  lineMaxSpeed: string | number | null;
  lastMeasScore: string | number | null;
  iduNo: string | null;
  oduNo: string | null;
  dpTerminal: string | null;
  port: string | null;
  len: string | null;
  complaintCount: number;
  totalComplaintCount: number;
  earliestComplaint: string | null;
  latestComplaint: string | null;
  lastContactAt: string | null;
  lastContactOutcome: "answered" | "no_answer" | null;
};

type FilterOptions = {
  centrals: string[];
  cabins: Record<string, string[]>;
  boxes: Record<string, string[]>;
};

const PAGE_SIZE = 50;

const cairoToday = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const oneYearBefore = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const previous = new Date(Date.UTC(year - 1, month - 1, day));
  // Clamp February 29 to February 28 in a non-leap year.
  if (previous.getUTCMonth() + 1 !== month) {
    return `${year - 1}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year - 1, month, 0)).getUTCDate()).padStart(2, "0")}`;
  }
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
};

const defaultDates = (mode: "period" | "period-total") => {
  const to = cairoToday();
  const from = mode === "period-total"
    ? `${to.slice(0, 8)}01`
    : oneYearBefore(to);
  return { from, to };
};

const initialDates = defaultDates("period");

const reportTitle = (mode: "period" | "period-total") =>
  mode === "period-total" ? "تقرير الشكاوى خلال فترة" : "تقرير الشكاوى خلال عام";

const fmtDate = (value: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`;
};

export function AccountComplaintsReport() {
  const [reportMode, setReportMode] = useState<"period" | "period-total">("period");
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [central, setCentral] = useState("");
  const [cabin, setCabin] = useState("");
  const [box, setBox] = useState("");
  const [accountQ, setAccountQ] = useState("");
  const [search, setSearch] = useState("");
  const [complaintsGt, setComplaintsGt] = useState("");
  const [page, setPage] = useState(1);
  const [historyPhone, setHistoryPhone] = useState<string | null>(null);

  const { data: filterOptions } = useQuery({
    queryKey: ["/api/phone-lines/filter-options"],
    queryFn: async () => {
      const res = await fetch("/api/phone-lines/filter-options", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch filter options");
      return res.json() as Promise<FilterOptions>;
    },
  });

  const buildParams = (exportAll = false) => {
    const p = new URLSearchParams({
      dateFrom, dateTo,
      page: exportAll ? "1" : String(page),
      limit: exportAll ? "20000" : String(PAGE_SIZE),
    });
    if (reportMode === "period-total") p.set("sortBy", "stored");
    if (central) p.set("central", central);
    if (cabin) p.set("cabin", cabin);
    if (box) p.set("box", box);
    if (accountQ.trim()) p.set("accountQ", accountQ.trim());
    if (search.trim()) p.set("search", search.trim());
    if (complaintsGt.trim()) p.set("complaintsGt", complaintsGt.trim());
    return p;
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      "/api/phone-lines/account-complaints",
       dateFrom, dateTo, central, cabin, box, accountQ, search, complaintsGt, reportMode, page,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/phone-lines/account-complaints?${buildParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
       return res.json() as Promise<{
         data: Row[];
         total: number;
         complaintTotal: number;
          storedComplaintTotal: number;
         page: number;
         pageSize: number;
       }>;
    },
    refetchOnMount: "always",
  });

  const cabins = central ? (filterOptions?.cabins[central] ?? []) : [];
  const boxes = central && cabin ? (filterOptions?.boxes[`${central}||${cabin}`] ?? []) : [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const exportReport = async () => {
    const res = await fetch(`/api/phone-lines/account-complaints?${buildParams(true)}`, { credentials: "include" });
    if (!res.ok) return;
    const json = await res.json() as { data: Row[] };
    const rows = json.data.map((r) => ({
      "رقم التليفون الكامل": r.fullPhone,
      "رقم الأكونت": r.accountNo,
      ...(reportMode === "period-total"
        ? {
            "عدد الشكاوى خلال الفترة": r.complaintCount,
            "إجمالي الشكاوى المخزنة": r.totalComplaintCount,
          }
        : { "عدد الشكاوى": r.complaintCount }),
      "أقدم شكوى": fmtDate(r.earliestComplaint),
      "أحدث شكوى": fmtDate(r.latestComplaint),
      "وقت آخر اتصال": formatContactTime(r.lastContactAt),
      "نتيجة آخر اتصال": r.lastContactOutcome === "answered"
        ? "تم الرد"
        : r.lastContactOutcome === "no_answer" ? "لم يرد" : "",
      "السنترال": r.central ?? "",
      "الكابينة": r.cabinNumber ?? "",
      "البكس": r.boxNumber ?? "",
      "السرعة الحالية": r.lineCurrentSpeed ?? "",
      "أقصى سرعة": r.lineMaxSpeed ?? "",
      "الاسكور": r.lastMeasScore ?? "",
      "رقم التليفون": r.telNo,
      "IDU": r.iduNo ?? "",
      "ODU": r.oduNo ?? "",
      "DP Terminal": r.dpTerminal ?? "",
      "Port": r.port ?? "",
      "LEN": r.len ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "شكاوى لها أكونت");
    XLSX.writeFile(wb, "account-complaints-report.xlsx");
  };

  const resetPage = () => setPage(1);

  const switchReportMode = (value: string) => {
    const nextMode = value as "period" | "period-total";
    const nextDates = defaultDates(nextMode);
    setReportMode(nextMode);
    setDateFrom(nextDates.from);
    setDateTo(nextDates.to);
    setPage(1);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Tabs
        value={reportMode}
        onValueChange={switchReportMode}
        className="w-full"
      >
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="period">تقرير الشكاوى خلال عام</TabsTrigger>
          <TabsTrigger value="period-total">تقرير الشكاوى خلال فترة</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="overflow-hidden shadow-sm border-0 bg-white">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base">
              {reportTitle(reportMode)}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              من شيتَي 430D: التفاصيل وتفاصيل المتبقي
              {data && <> — {data.total.toLocaleString("ar-EG")} رقم</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">من</span>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); resetPage(); }} className="h-9 w-36 text-sm" />
              <span className="text-xs text-muted-foreground">إلى</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); resetPage(); }} className="h-9 w-36 text-sm" />
            </div>
            <SearchableCombobox
              options={filterOptions?.centrals ?? []} value={central}
              onChange={(v) => { setCentral(v); setCabin(""); setBox(""); resetPage(); }}
              placeholder="كل السنترالات" searchPlaceholder="ابحث في السنترالات..." className="w-full sm:w-44 text-sm"
            />
            <SearchableCombobox
              options={cabins} value={cabin}
              onChange={(v) => { setCabin(v); setBox(""); resetPage(); }}
              placeholder="كل الكباين" searchPlaceholder="ابحث في الكباين..."
              disabled={!central} className="w-full sm:w-40 text-sm"
            />
            <SearchableCombobox
              options={boxes} value={box}
              onChange={(v) => { setBox(v); resetPage(); }}
              placeholder="كل البكسيات" searchPlaceholder="ابحث في البكسيات..."
              disabled={!cabin} className="w-full sm:w-36 text-sm"
            />
            <Input value={accountQ} onChange={(e) => { setAccountQ(e.target.value); resetPage(); }} placeholder="بحث برقم الأكونت" className="w-full sm:w-40 h-9 text-sm" dir="ltr" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} placeholder="بحث بالرقم/الموقع" className="w-full sm:w-40 h-9 text-sm" dir="rtl" />
             <Input
               type="number"
               min="0"
               step="1"
               value={complaintsGt}
               onChange={(e) => { setComplaintsGt(e.target.value); resetPage(); }}
               placeholder="الشكاوى أكثر من"
               title="إظهار الخطوط التي لديها شكاوى أكثر من الرقم"
               className="w-full sm:w-36 h-9 text-sm"
               dir="ltr"
             />
            <RefreshButton />
            <Button variant="outline" size="sm" onClick={exportReport} className="text-green-700 border-green-200">تصدير Excel</Button>
          </div>
        </div>
         {data && (
           <div className="px-4 py-3 border-b bg-slate-50/70 flex flex-wrap items-center gap-3 text-sm">
             <span className="rounded-md border bg-white px-3 py-1.5">
               إجمالي الخطوط: <strong className="text-blue-700">{data.total.toLocaleString("ar-EG")}</strong>
             </span>
             <span className="rounded-md border bg-white px-3 py-1.5">
               إجمالي الشكاوى: <strong className="text-red-700">{data.complaintTotal.toLocaleString("ar-EG")}</strong>
             </span>
              {reportMode === "period-total" && (
                <span className="rounded-md border bg-white px-3 py-1.5">
                  إجمالي الشكاوى المخزنة: <strong className="text-purple-700">{data.storedComplaintTotal.toLocaleString("ar-EG")}</strong>
                </span>
              )}
           </div>
         )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="text-right text-sm" dir="rtl">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold whitespace-nowrap">#</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">رقم التليفون</TableHead>
                    {reportMode === "period-total" ? (
                      <>
                        <TableHead className="font-bold whitespace-nowrap">شكاوى الفترة</TableHead>
                        <TableHead className="font-bold whitespace-nowrap">إجمالي الشكاوى المخزنة</TableHead>
                      </>
                    ) : (
                      <TableHead className="font-bold whitespace-nowrap">عدد الشكاوى</TableHead>
                    )}
                    <TableHead className="font-bold whitespace-nowrap">أقدم شكوى</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">أحدث شكوى</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">وقت آخر اتصال</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">رقم الأكونت</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">السنترال</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">الكابينة</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">البكس</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">السرعة الحالية</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">أقصى سرعة</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">الاسكور</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">التليفون المختصر</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">IDU</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">ODU</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">DP Terminal</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">Port</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">LEN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.map((r, i) => (
                    <TableRow key={r.fullPhone || r.id || i} className="hover:bg-muted/30">
                      <TableCell>{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                      <TableCell className="font-mono font-semibold text-blue-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1" dir="ltr">
                          {r.fullPhone || "-"}
                          <button type="button" onClick={() => setHistoryPhone(r.fullPhone)} title="تاريخ الأعطال" className="text-indigo-600 hover:text-indigo-800">
                            <History className="w-4 h-4" />
                          </button>
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-red-700">{r.complaintCount.toLocaleString("ar-EG")}</TableCell>
                      {reportMode === "period-total" && (
                        <TableCell className="font-bold text-purple-700">{r.totalComplaintCount.toLocaleString("ar-EG")}</TableCell>
                      )}
                      <TableCell className="whitespace-nowrap" dir="ltr">{fmtDate(r.earliestComplaint)}</TableCell>
                      <TableCell className="whitespace-nowrap" dir="ltr">{fmtDate(r.latestComplaint)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.lastContactAt ? (
                          <span className="inline-flex flex-col">
                            <span dir="ltr">{formatContactTime(r.lastContactAt)}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {r.lastContactOutcome === "answered" ? "تم الرد" : "لم يرد"}
                            </span>
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="font-mono" dir="ltr">{r.accountNo || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.central || "-"}</TableCell>
                      <TableCell>{r.cabinNumber || "-"}</TableCell>
                      <TableCell>{r.boxNumber || "-"}</TableCell>
                      <TableCell className="font-mono">{r.lineCurrentSpeed ?? "-"}</TableCell>
                      <TableCell className="font-mono">{r.lineMaxSpeed ?? "-"}</TableCell>
                      <TableCell className="font-mono">{r.lastMeasScore ?? "-"}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{r.telNo || "-"}</TableCell>
                      <TableCell>{r.iduNo || "-"}</TableCell>
                      <TableCell>{r.oduNo || "-"}</TableCell>
                      <TableCell>{r.dpTerminal || "-"}</TableCell>
                      <TableCell>{r.port || "-"}</TableCell>
                      <TableCell>{r.len || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!data?.data.length && (
                    <TableRow><TableCell colSpan={reportMode === "period-total" ? 20 : 19} className="text-center text-muted-foreground py-10">لا توجد نتائج في النطاق المحدد</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="p-4 border-t flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronRight className="w-4 h-4 ml-1" /> السابق
                </Button>
                <PageJump page={page} totalPages={totalPages} onJump={setPage} />
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  التالي <ChevronLeft className="w-4 h-4 mr-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      {historyPhone && <LineDetailsDialog phone={historyPhone} onClose={() => setHistoryPhone(null)} />}
    </div>
  );
}