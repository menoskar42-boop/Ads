import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageJump } from "@/components/ui/page-jump";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { RefreshButton } from "@/components/RefreshButton";
import { LineStatusButton } from "@/components/LineStatusButton";
import { printTablePDF } from "@/lib/print-pdf";

interface Row {
  phone: string;
  accountNo: string | null;
  central: string | null;
  cabin: string | null;
  box: string | null;
  numberOfFaults: number | null;
  faults: string[];
  distances: string;
  minMeters: number | null;
  xeltDate: string | null;
  pulledAt: string;
  pulledBy: string | null;
}

interface FilterOptions {
  centrals: string[];
  cabins: Record<string, string[]>;
  boxes: Record<string, string[]>;
}

interface ReportResponse {
  data: Row[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const monthStart = () => `${today().slice(0, 7)}-01`;
const fmtDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    dateStyle: "short",
    timeStyle: "short",
  });
};

export function XeltDistanceReport() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [central, setCentral] = useState("");
  const [cabin, setCabin] = useState("");
  const [box, setBox] = useState("");
  const [maxMeters, setMaxMeters] = useState("");
  const [page, setPage] = useState(1);

  const { data: filterOptions } = useQuery({
    queryKey: ["/api/phone-lines/filter-options"],
    queryFn: async () => {
      const response = await fetch("/api/phone-lines/filter-options", { credentials: "include" });
      if (!response.ok) throw new Error("تعذّر تحميل الفلاتر");
      return response.json() as Promise<FilterOptions>;
    },
  });

  const buildParams = (forExport = false) => {
    const params = new URLSearchParams(
      forExport ? { all: "1" } : { page: String(page), pageSize: String(PAGE_SIZE) },
    );
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (central) params.set("central", central);
    if (cabin) params.set("cabin", cabin);
    if (box) params.set("box", box);
    if (maxMeters) params.set("maxMeters", maxMeters);
    return params;
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/reports/xelt-distances", dateFrom, dateTo, central, cabin, box, maxMeters, page],
    queryFn: async () => {
      const response = await fetch(`/api/reports/xelt-distances?${buildParams()}`, { credentials: "include" });
      if (!response.ok) throw new Error("تعذّر تحميل تقارير XELT");
      return response.json() as Promise<ReportResponse>;
    },
    refetchOnMount: "always",
  });

  const cabins = central && filterOptions ? filterOptions.cabins[central] ?? [] : [];
  const boxes = central && cabin && filterOptions
    ? filterOptions.boxes[`${central}||${cabin}`] ?? []
    : [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const fetchAllRows = async () => {
    const response = await fetch(`/api/reports/xelt-distances?${buildParams(true)}`, { credentials: "include" });
    if (!response.ok) throw new Error("تعذّر تحميل كل صفوف التقرير");
    const result = await response.json() as ReportResponse;
    return result.data;
  };

  const handleExportExcel = async () => {
    const rows = await fetchAllRows();
    const sheetRows = rows.map((row, index) => ({
      "#": index + 1,
      "رقم التليفون": row.phone,
      "رقم الأكونت": row.accountNo ?? "",
      "السنترال": row.central ?? "",
      "الكابينة": row.cabin ?? "",
      "البكس": row.box ?? "",
      "عدد الأعطال": row.numberOfFaults ?? "",
      "نوع العطل": row.faults.join(" · "),
      "المسافات": row.distances,
      "أقصر مسافة (متر)": row.minMeters ?? "",
      "تاريخ XELT": row.xeltDate ?? "",
      "تاريخ سحب التقرير": fmtDate(row.pulledAt),
      "سحب بواسطة": row.pulledBy ?? "",
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetRows), "تقارير XELT");
    XLSX.writeFile(workbook, "xelt-distance-report.xlsx");
  };

  const handleExportPDF = async () => {
    const rows = await fetchAllRows();
    printTablePDF({
      title: `تقارير XELT — ${dateFrom || "كل الفترات"} إلى ${dateTo || "الآن"}`,
      columns: [
        "#", "التليفون", "الأكونت", "السنترال", "الكابينة", "البكس", "عدد الأعطال",
        "نوع العطل", "المسافات", "أقصر مسافة", "تاريخ XELT", "تاريخ السحب", "سحب بواسطة",
      ],
      rows: rows.map((row, index) => [
        index + 1, row.phone, row.accountNo, row.central, row.cabin, row.box,
        row.numberOfFaults, row.faults.join(" · "), row.distances, row.minMeters,
        row.xeltDate, fmtDate(row.pulledAt), row.pulledBy,
      ]),
    });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="overflow-hidden border-0 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="text-base font-semibold">تقارير XELT</h3>
            {data && <p className="mt-0.5 text-xs text-muted-foreground">{data.total.toLocaleString("ar-EG")} خط</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">من</span>
              <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="h-9 w-36 text-sm" />
              <span className="text-xs text-muted-foreground">إلى</span>
              <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="h-9 w-36 text-sm" />
            </div>
            <SearchableCombobox
              options={filterOptions?.centrals ?? []}
              value={central}
              onChange={(value) => { setCentral(value); setCabin(""); setBox(""); setPage(1); }}
              placeholder="كل السنترالات"
              searchPlaceholder="ابحث في السنترالات..."
              className="w-full text-sm sm:w-44"
            />
            <SearchableCombobox
              options={cabins}
              value={cabin}
              onChange={(value) => { setCabin(value); setBox(""); setPage(1); }}
              placeholder="كل الكباين"
              searchPlaceholder="ابحث في الكباين..."
              disabled={!central}
              className="w-full text-sm sm:w-40"
            />
            <SearchableCombobox
              options={boxes}
              value={box}
              onChange={(value) => { setBox(value); setPage(1); }}
              placeholder="كل البكسيات"
              searchPlaceholder="ابحث في البكسيات..."
              disabled={!cabin}
              className="w-full text-sm sm:w-36"
            />
            <Input
              type="number"
              min="0"
              value={maxMeters}
              onChange={(event) => { setMaxMeters(event.target.value); setPage(1); }}
              placeholder="أقصى مسافة (متر)"
              aria-label="أقصى مسافة بالمتر"
              className="h-9 w-36 text-sm"
            />
            <RefreshButton />
            <Button variant="outline" size="sm" onClick={() => void handleExportExcel()} className="border-green-200 text-green-700">
              تصدير Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleExportPDF()} className="border-red-200 text-red-700">
              تصدير PDF
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-700">تعذّر تحميل التقرير. جرّب تحديث الصفحة.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm" dir="rtl">
                <thead className="bg-muted/50">
                  <tr>
                    {["التليفون", "الأكونت", "السنترال", "الكابينة", "البكس", "عدد الأعطال", "نوع العطل", "المسافة", "أقصر مسافة", "تاريخ XELT", "تاريخ السحب", "سحب بواسطة", "حالة الخط"].map((heading) => (
                      <th key={heading} className="whitespace-nowrap px-3 py-2 text-right font-bold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map((row, index) => (
                    <tr key={`${row.accountNo || row.phone}-${index}`} className="border-t hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{row.phone || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono" dir="ltr">{row.accountNo || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.central || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.cabin || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.box || "-"}</td>
                      <td className="px-3 py-2">{row.numberOfFaults ?? "-"}</td>
                      <td className="min-w-40 px-3 py-2">{row.faults.join(" · ") || "-"}</td>
                      <td className="min-w-44 px-3 py-2">{row.distances || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.minMeters == null ? "-" : `${row.minMeters} متر`}</td>
                      <td className="whitespace-nowrap px-3 py-2" dir="ltr">{row.xeltDate || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(row.pulledAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.pulledBy || "-"}</td>
                      <td className="px-3 py-2"><LineStatusButton account={row.accountNo} phone={row.phone} compact /></td>
                    </tr>
                  ))}
                  {!data?.data.length && (
                    <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">لا توجد خطوط لها مسافة عطل في النطاق المحدد</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t p-4">
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                  <ChevronRight className="ml-1 h-4 w-4" /> السابق
                </Button>
                <PageJump page={page} totalPages={totalPages} onJump={setPage} />
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
                  التالي <ChevronLeft className="mr-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
