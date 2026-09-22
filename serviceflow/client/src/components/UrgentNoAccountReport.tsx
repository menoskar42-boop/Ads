import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, IdCard, Loader2, RefreshCw, Save, SaveAll } from "lucide-react";
import { PageJump } from "@/components/ui/page-jump";
import { openCustomer360 } from "@/lib/customer360";
import { printTablePDF } from "@/lib/print-pdf";
import { useMobileLookup, phoneLookupKey, MobileValue } from "@/lib/mobile-lookup";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@shared/schema";
import * as XLSX from "xlsx";

type SourceKey = "lines" | "regularized" | "ground";

type SourceRows = {
  source: SourceKey;
  rows: Record<string, any>[];
};

type UrgentRow = {
  fullPhone: string;
  telNo: string;
  central: string;
  cabinNumber: string;
  boxNumber: string;
  iduNo: string;
  oduNo: string;
  dpTerminal: string;
  ticketNumber: string;
  faultType: string;
  sources: SourceKey[];
};

const PAGE_SIZE = 50;
const SOURCE_LABEL: Record<SourceKey, string> = {
  lines: "خطوط بدون أكونت",
  regularized: "عطل منتظم",
  ground: "عطل أرضي مفتوح",
};

const previousYearStart = () => {
  const d = new Date();
  return `${d.getFullYear() - 1}-01-01`;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const firstValue = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

/**
 * The same phone can be returned by more than one urgent source. Keep one row
 * and retain all source labels so the report is useful without duplicate work.
 */
export function mergeUrgentNoAccountRows(groups: SourceRows[]): UrgentRow[] {
  const byPhone = new Map<string, UrgentRow>();

  for (const group of groups) {
    for (const raw of group.rows) {
      const fullPhone = firstValue(raw.fullPhone);
      if (!fullPhone) continue;
      const existing = byPhone.get(fullPhone);
      if (!existing) {
        byPhone.set(fullPhone, {
          fullPhone,
          telNo: firstValue(raw.telNo),
          central: firstValue(raw.central),
          cabinNumber: firstValue(raw.cabinNumber),
          boxNumber: firstValue(raw.boxNumber),
          iduNo: firstValue(raw.iduNo),
          oduNo: firstValue(raw.oduNo),
          dpTerminal: firstValue(raw.dpTerminal),
          ticketNumber: firstValue(raw.ticketNumber),
          faultType: firstValue(raw.faultType),
          sources: [group.source],
        });
        continue;
      }

      existing.telNo = firstValue(existing.telNo, raw.telNo);
      existing.central = firstValue(existing.central, raw.central);
      existing.cabinNumber = firstValue(existing.cabinNumber, raw.cabinNumber);
      existing.boxNumber = firstValue(existing.boxNumber, raw.boxNumber);
      existing.iduNo = firstValue(existing.iduNo, raw.iduNo);
      existing.oduNo = firstValue(existing.oduNo, raw.oduNo);
      existing.dpTerminal = firstValue(existing.dpTerminal, raw.dpTerminal);
      existing.ticketNumber = firstValue(existing.ticketNumber, raw.ticketNumber);
      existing.faultType = firstValue(existing.faultType, raw.faultType);
      if (!existing.sources.includes(group.source)) existing.sources.push(group.source);
    }
  }

  return [...byPhone.values()].sort((a, b) =>
    `${a.central}|${a.cabinNumber}|${a.boxNumber}|${a.fullPhone}`.localeCompare(
      `${b.central}|${b.cabinNumber}|${b.boxNumber}|${b.fullPhone}`,
      "ar",
      { numeric: true },
    ),
  );
}

async function getJson(url: string) {
  const response = await fetch(url, { credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "تعذّر تحميل تقرير الأرقام العاجلة");
  return body;
}

export function UrgentNoAccountReport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role !== ROLES.SALES;
  const [dateFrom, setDateFrom] = useState(previousYearStart());
  const [dateTo, setDateTo] = useState(today());
  const [central, setCentral] = useState("");
  const [cabin, setCabin] = useState("");
  const [box, setBox] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const query = useQuery({
    queryKey: ["/api/urgent-no-account", dateFrom, dateTo],
    queryFn: async () => {
      const regularizedParams = new URLSearchParams({
        page: "1",
        limit: "20000",
        dateFrom,
        dateTo,
      });
      const [withoutAccount, regularized, ground] = await Promise.all([
        getJson("/api/phone-lines/without-account?page=1&limit=20000"),
        getJson(`/api/reports/regularized-no-account?${regularizedParams}`),
        getJson("/api/proxy/cfm-open-ticket-lines"),
      ]);

      return mergeUrgentNoAccountRows([
        { source: "lines", rows: withoutAccount.data ?? [] },
        { source: "regularized", rows: regularized.data ?? [] },
        {
          source: "ground",
          rows: (ground.lines ?? []).filter((row: Record<string, any>) => !row.accountNo),
        },
      ]);
    },
    refetchOnMount: "always",
  });

  const rows = query.data ?? [];
  const filterOptions = useMemo(() => {
    const centrals = [...new Set(rows.map((row) => row.central).filter(Boolean))].sort();
    const cabins: Record<string, string[]> = {};
    const boxes: Record<string, string[]> = {};
    for (const row of rows) {
      if (!row.central || !row.cabinNumber) continue;
      cabins[row.central] ??= [];
      if (!cabins[row.central].includes(row.cabinNumber)) cabins[row.central].push(row.cabinNumber);
      const key = `${row.central}||${row.cabinNumber}`;
      boxes[key] ??= [];
      if (row.boxNumber && !boxes[key].includes(row.boxNumber)) boxes[key].push(row.boxNumber);
    }
    Object.values(cabins).forEach((values) => values.sort((a, b) => Number(a) - Number(b)));
    Object.values(boxes).forEach((values) => values.sort((a, b) => Number(a) - Number(b)));
    return { centrals, cabins, boxes };
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((row) =>
      (!central || row.central === central) &&
      (!cabin || row.cabinNumber === cabin) &&
      (!box || row.boxNumber === box),
    ),
    [rows, central, cabin, box],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const mobileLookup = useMobileLookup(visibleRows.map((row) => row.telNo || row.fullPhone));
  const draftCount = Object.values(drafts).filter((value) => value.trim()).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/urgent-no-account"] });
    queryClient.invalidateQueries({ queryKey: ["/api/phone-lines/without-account"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/regularized-no-account"] });
  };

  const handleSave = async (fullPhone: string) => {
    const accountNo = (drafts[fullPhone] ?? "").trim();
    if (!accountNo) return;
    setSaveState((state) => ({ ...state, [fullPhone]: "saving" }));
    try {
      const response = await fetch(`/api/line-accounts/${encodeURIComponent(fullPhone)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "تعذّر حفظ رقم الأكونت");
      setDrafts((state) => {
        const next = { ...state };
        delete next[fullPhone];
        return next;
      });
      setSaveState((state) => ({ ...state, [fullPhone]: "saved" }));
      invalidate();
    } catch (error: any) {
      setSaveState((state) => ({ ...state, [fullPhone]: "error" }));
      alert(error?.message || "تعذّر حفظ رقم الأكونت");
    }
  };

  const handleSaveAll = async () => {
    const entries = Object.entries(drafts)
      .map(([fullPhone, accountNo]) => ({ fullPhone, accountNo: accountNo.trim() }))
      .filter((entry) => entry.accountNo);
    if (!entries.length) {
      alert("لا توجد أرقام أكونت مكتوبة للحفظ");
      return;
    }
    setBulkSaving(true);
    try {
      const response = await fetch("/api/line-accounts/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "تعذّر الحفظ");
      setDrafts({});
      setSaveState({});
      invalidate();
      const duplicates = Array.isArray(body.duplicates) ? body.duplicates : [];
      const message = [`تم حفظ ${body.saved ?? entries.length} رقم أكونت`];
      if (duplicates.length) {
        message.push(`تم تجاهل ${duplicates.length} رقم بسبب تكرار رقم الأكونت`);
      }
      alert(message.join("\n"));
    } catch (error: any) {
      alert(error?.message || "تعذّر الحفظ — حاول مرة أخرى");
    } finally {
      setBulkSaving(false);
    }
  };

  const handleExportExcel = () => {
    const exportRows = filtered.map((row, index) => ({
      "#": index + 1,
      "رقم التليفون الكامل": row.fullPhone,
      "رقم التليفون": row.telNo,
      "مصدر العجلة": row.sources.map((source) => SOURCE_LABEL[source]).join(" + "),
      "التذكرة": row.ticketNumber,
      "نوع العطل": row.faultType,
      "السنترال": row.central,
      "الكابينة": row.cabinNumber,
      "البكس": row.boxNumber,
      "IDU": row.iduNo,
      "ODU": row.oduNo,
      "DP Terminal": row.dpTerminal,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), "أرقام بدون اكونت عاجل");
    XLSX.writeFile(workbook, "urgent-no-account-report.xlsx");
  };

  const handleExportPDF = () => {
    printTablePDF({
      title: "أرقام بدون اكونت عاجل",
      columns: ["#", "التليفون الكامل", "التليفون", "المصدر", "التذكرة", "نوع العطل", "السنترال", "الكابينة", "البكس"],
      rows: filtered.map((row, index) => [
        index + 1,
        row.fullPhone,
        row.telNo,
        row.sources.map((source) => SOURCE_LABEL[source]).join(" + "),
        row.ticketNumber,
        row.faultType,
        row.central,
        row.cabinNumber,
        row.boxNumber,
      ]),
    });
  };

  const cabins = central ? (filterOptions.cabins[central] ?? []) : [];
  const boxes = central && cabin ? (filterOptions.boxes[`${central}||${cabin}`] ?? []) : [];

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="overflow-hidden shadow-sm border-0 bg-white">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-base">أرقام بدون اكونت عاجل</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {query.isFetching ? "جاري تحديث المصادر..." : `${filtered.length.toLocaleString("ar-EG")} رقم فريد من التبويبات الثلاثة`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">من</span>
              <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="h-9 w-36 text-sm" />
              <span className="text-xs text-muted-foreground">إلى</span>
              <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="h-9 w-36 text-sm" />
            </div>
            <SearchableCombobox
              options={filterOptions.centrals}
              value={central}
              onChange={(value) => { setCentral(value); setCabin(""); setBox(""); setPage(1); }}
              placeholder="كل السنترالات"
              searchPlaceholder="ابحث في السنترالات..."
              className="w-full sm:w-44 text-sm"
            />
            <SearchableCombobox
              options={cabins}
              value={cabin}
              onChange={(value) => { setCabin(value); setBox(""); setPage(1); }}
              placeholder="كل الكباين"
              searchPlaceholder="ابحث في الكباين..."
              disabled={!central}
              className="w-full sm:w-40 text-sm"
            />
            <SearchableCombobox
              options={boxes}
              value={box}
              onChange={(value) => { setBox(value); setPage(1); }}
              placeholder="كل البكسيات"
              searchPlaceholder="ابحث في البكسيات..."
              disabled={!cabin}
              className="w-full sm:w-36 text-sm"
            />
            {user?.role === ROLES.SUPER_ADMIN && (
              <Button variant="outline" size="sm" onClick={() => openCustomer360(filtered.map((row) => row.fullPhone))} disabled={!filtered.length} className="gap-1 text-purple-700 border-purple-200">
                <IdCard className="w-4 h-4" /> جلب الأكونت من Customer360
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={handleSaveAll} disabled={!draftCount || bulkSaving} className="gap-1 text-blue-700 border-blue-200">
                {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <SaveAll className="w-4 h-4" />}
                حفظ الكل{draftCount ? ` (${draftCount})` : ""}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!filtered.length} className="gap-1 text-green-700 border-green-200">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length} className="gap-1 text-red-700 border-red-200">
              <FileText className="w-4 h-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} className="gap-1">
              <RefreshCw className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث
            </Button>
          </div>
        </div>

        {query.isError ? (
          <div className="p-8 text-center text-sm text-red-600">{(query.error as Error).message}</div>
        ) : query.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-right text-sm" dir="rtl">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold whitespace-nowrap">#</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">رقم التليفون الكامل</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">رقم التليفون</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">المصدر</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">التذكرة</TableHead>
                  {canEdit && <TableHead className="font-bold whitespace-nowrap">تسجيل أكونت</TableHead>}
                  <TableHead className="font-bold whitespace-nowrap">السنترال</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">الكابينة</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">البكس</TableHead>
                  <TableHead className="font-bold whitespace-nowrap">رقم الموبايل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!visibleRows.length ? (
                  <TableRow><TableCell colSpan={canEdit ? 10 : 9} className="text-center py-12 text-muted-foreground">لا توجد أرقام بدون اكونت عاجلة</TableCell></TableRow>
                ) : visibleRows.map((row, index) => (
                  <TableRow key={row.fullPhone} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell className="font-mono font-semibold text-blue-700 whitespace-nowrap">{row.fullPhone}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{row.telNo || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-48">
                        {row.sources.map((source) => <span key={source} className="text-[11px] rounded bg-amber-50 text-amber-800 px-1.5 py-0.5">{SOURCE_LABEL[source]}</span>)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-amber-700">{row.ticketNumber || "-"}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-1" dir="ltr">
                          <Input
                            value={drafts[row.fullPhone] ?? ""}
                            onChange={(event) => {
                              setDrafts((state) => ({ ...state, [row.fullPhone]: event.target.value }));
                              setSaveState((state) => { const next = { ...state }; delete next[row.fullPhone]; return next; });
                            }}
                            onKeyDown={(event) => event.key === "Enter" && handleSave(row.fullPhone)}
                            placeholder="أكونت"
                            className="h-7 w-24 text-xs"
                            dir="ltr"
                          />
                          <button type="button" onClick={() => handleSave(row.fullPhone)} disabled={!drafts[row.fullPhone]?.trim() || saveState[row.fullPhone] === "saving"} title="حفظ" className="text-green-600 hover:text-green-800 disabled:opacity-40">
                            {saveState[row.fullPhone] === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap">{row.central || "-"}</TableCell>
                    <TableCell>{row.cabinNumber || "-"}</TableCell>
                    <TableCell>{row.boxNumber || "-"}</TableCell>
                    <TableCell><MobileValue mobile={mobileLookup[phoneLookupKey(row.telNo || row.fullPhone)]} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-center gap-3 p-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}><ChevronRight className="w-4 h-4" /> السابق</Button>
            <PageJump page={currentPage} totalPages={totalPages} onJump={setPage} />
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages}>التالي <ChevronLeft className="w-4 h-4" /></Button>
          </div>
        )}
      </Card>
    </div>
  );
}