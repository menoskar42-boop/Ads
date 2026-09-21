import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageJump } from "@/components/ui/page-jump";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { RefreshButton } from "@/components/RefreshButton";
import { LineDetailsDialog } from "@/components/LineDetailsDialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

type Row = {
  id: number | null;
  fullPhone: string;
  telNo: string;
  accountNo: string;
  accountSource: string | null;
  central: string | null;
  cabinNumber: string | null;
  boxNumber: string | null;
  iduNo: string | null;
  oduNo: string | null;
  dpTerminal: string | null;
  port: string | null;
  len: string | null;
  complaintCount: number;
  earliestComplaint: string | null;
  latestComplaint: string | null;
};

type FilterOptions = {
  centrals: string[];
  cabins: Record<string, string[]>;
  boxes: Record<string, string[]>;
};

const PAGE_SIZE = 50;

const dateParts = (date: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
};

const defaultDates = () => {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  return { from: dateParts(from), to: dateParts(to) };
};

const fmtDate = (value: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`;
};

export function AccountComplaintsReport() {
  const dates = defaultDates();
  const [dateFrom, setDateFrom] = useState(dates.from);
  const [dateTo, setDateTo] = useState(dates.to);
  const [central, setCentral] = useState("");
  const [cabin, setCabin] = useState("");
  const [box, setBox] = useState("");
  const [accountQ, setAccountQ] = useState("");
  const [search, setSearch] = useState("");
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
    if (central) p.set("central", central);
    if (cabin) p.set("cabin", cabin);
    if (box) p.set("box", box);
    if (accountQ.trim()) p.set("accountQ", accountQ.trim());
    if (search.trim()) p.set("search", search.trim());
    return p;
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      "/api/phone-lines/account-complaints",
      dateFrom, dateTo, central, cabin, box, accountQ, search, page,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/phone-lines/account-complaints?${buildParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json() as Promise<{ data: Row[]; total: number; page: number; pageSize: number }>;
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
      "عدد الشكاوى": r.complaintCount,
      "أقدم شكوى": fmtDate(r.earliestComplaint),
      "أحدث شكوى": fmtDate(r.latestComplaint),
      "السنترال": r.central ?? "",
      "الكابينة": r.cabinNumber ?? "",
      "البكس": r.boxNumber ?? "",
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

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="overflow-hidden shadow-sm border-0 bg-white">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base">خطوط لها أكونت — إحصاء الشكاوى</h3>
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
            <RefreshButton />
            <Button variant="outline" size="sm" onClick={exportReport} className="text-green-700 border-green-200">تصدير Excel</Button>
          </div>
        </div>

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
                    <TableHead className="font-bold whitespace-nowrap">عدد الشكاوى</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">أقدم شكوى</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">أحدث شكوى</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">رقم الأكونت</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">السنترال</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">الكابينة</TableHead>
                    <TableHead className="font-bold whitespace-nowrap">البكس</TableHead>
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
                      <TableCell className="whitespace-nowrap" dir="ltr">{fmtDate(r.earliestComplaint)}</TableCell>
                      <TableCell className="whitespace-nowrap" dir="ltr">{fmtDate(r.latestComplaint)}</TableCell>
                      <TableCell className="font-mono" dir="ltr">{r.accountNo || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.central || "-"}</TableCell>
                      <TableCell>{r.cabinNumber || "-"}</TableCell>
                      <TableCell>{r.boxNumber || "-"}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{r.telNo || "-"}</TableCell>
                      <TableCell>{r.iduNo || "-"}</TableCell>
                      <TableCell>{r.oduNo || "-"}</TableCell>
                      <TableCell>{r.dpTerminal || "-"}</TableCell>
                      <TableCell>{r.port || "-"}</TableCell>
                      <TableCell>{r.len || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!data?.data.length && (
                    <TableRow><TableCell colSpan={15} className="text-center text-muted-foreground py-10">لا توجد نتائج في النطاق المحدد</TableCell></TableRow>
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