// «سلك الصيانة» فى قسم المخزن (المالك ٢٠٢٦-١٠-١٢):
//   • إدخالات السلك — القايمة اللى كانت تحت «إدخال كمية سلك الصيانة» فى استكمال البيانات
//     (بحث، حذف، منح صلاحية تعديل، Excel/PDF). الإدخال نفسه لسه من استكمال البيانات.
//   • إفادة صرف سلك الصيانة — نفس الورقة اللى بتتملى بالإيد: رقم التليفون · التاريخ · اسم الصنف ·
//     الكمية بالمتر · اسم الفنى (اللى سجّل السلك) · توقيع الفنى (فاضى للتوقيع) · ملاحظات (المحمول).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { ROLES } from "@shared/schema";
import { printTablePDF } from "@/lib/print-pdf";
import { FileSpreadsheet, KeyRound, Loader2, Lock, Printer, Search, Trash2 } from "lucide-react";

export interface CableEntry {
  id: number;
  phoneLocal: string;
  phoneFull: string;
  workOrderType: string;
  cableQuantity: string;
  createdById: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  /** تاريخ الشغل اللى السلك اتسجّل بيه (للصيانة: اللى اتكتب فى الشاشة) — YYYY-MM-DD */
  workDate?: string | null;
  printedAt: string | null;
  editUnlockedAt: string | null;
  locked: boolean;
  canUnlock: boolean;
  mobile?: string | null;
}

const errMsg = (e: Error) => {
  let msg = e.message || "حدث خطأ";
  const m = msg.match(/^\d+:\s*(.*)$/s);
  if (m) msg = m[1];
  try { const j = JSON.parse(msg); if (j?.message) msg = j.message; } catch { /* نص عادى */ }
  return msg;
};

function useCableEntries(search: string) {
  return useQuery<CableEntry[]>({
    queryKey: ["/api/cable-entries", search],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search.trim()) p.set("q", search.trim());
      const res = await fetch(`/api/cable-entries?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل التحميل");
      return res.json();
    },
  });
}

/** قايمة إدخالات السلك — بحث + حذف + منح صلاحية تعديل + Excel/PDF. */
export function CableEntriesList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.SUPER_ADMIN;
  const isSuper = user?.role === ROLES.SUPER_ADMIN;
  // سلك الصيانة: الإلغاء للسوبر أدمن بس (حتى لو اتطبع) — المالك ٢٠٢٦-١٠-١٣
  const canDelete = (en: CableEntry) => (en.workOrderType === "صيانة" ? isSuper : isAdmin || user?.id === en.createdById);
  const deleteLocked = (en: CableEntry) => en.workOrderType !== "صيانة" && en.locked;
  const [search, setSearch] = useState("");
  const { data: entries = [], isFetching } = useCableEntries(search);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/cable-entries/${id}`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cable-entries"] });
      qc.invalidateQueries({ queryKey: ["/api/work-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/local-store"] });
    },
    onError: (e: Error) => toast({ title: "التعديل مقفل", description: errMsg(e), variant: "destructive", duration: 6000 }),
  });
  // الأدمن يمنح صلاحية تعديل لإدخال مطبوع (خلال 3 أيام من الطباعة)
  const unlockMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/cable-entries/${id}/unlock`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cable-entries"] });
      toast({ title: "تم منح صلاحية التعديل", duration: 3000 });
    },
    onError: (e: Error) => toast({ title: "تعذّر منح الصلاحية", description: errMsg(e), variant: "destructive", duration: 6000 }),
  });

  const handleExportExcel = () => {
    const rows = entries.map((en, i) => ({
      "#": i + 1,
      "رقم التليفون": en.phoneFull,
      "نوع امر الشغل": en.workOrderType,
      "كمية السلك (متر)": en.cableQuantity,
      "التاريخ": entryDay(en),
      "بواسطة": en.createdByName,
      "آخر تحديث": format(new Date(en.updatedAt), "yyyy/MM/dd HH:mm"),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كمية السلك");
    XLSX.writeFile(wb, `cable-entries-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };
  const handleExportPDF = () => {
    printTablePDF({
      title: "إدخالات السلك — كمية السلك",
      columns: ["#", "رقم التليفون", "نوع امر الشغل", "كمية السلك (متر)", "التاريخ", "بواسطة", "آخر تحديث"],
      rows: entries.map((en, i) => [
        i + 1, en.phoneFull, en.workOrderType, en.cableQuantity, entryDay(en), en.createdByName,
        format(new Date(en.updatedAt), "yyyy/MM/dd HH:mm"),
      ]),
    });
  };

  return (
    <Card className="overflow-hidden shadow-sm border-0 bg-white">
      <div className="p-3 border-b flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          <span>إجمالي: <strong className="text-foreground">{entries.length}</strong> إدخال</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={entries.length === 0} className="text-green-700 border-green-200 gap-1">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={entries.length === 0} className="text-red-700 border-red-200 gap-1">
            <Printer className="w-4 h-4" /> PDF
          </Button>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم التليفون" className="text-sm pr-8" dir="rtl" />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="text-right text-sm" dir="rtl">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-right font-bold w-10">#</TableHead>
              <TableHead className="text-right font-bold">رقم التليفون</TableHead>
              <TableHead className="text-right font-bold">نوع امر الشغل</TableHead>
              <TableHead className="text-right font-bold">كمية السلك (متر)</TableHead>
              <TableHead className="text-right font-bold">التاريخ</TableHead>
              <TableHead className="text-right font-bold">بواسطة</TableHead>
              <TableHead className="text-right font-bold">آخر تحديث</TableHead>
              <TableHead className="text-right font-bold w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-14 text-muted-foreground">
                  {isFetching ? "جاري التحميل..." : "لا توجد إدخالات بعد"}
                </TableCell>
              </TableRow>
            ) : entries.map((en, idx) => (
              <TableRow key={en.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell dir="ltr" className="text-left font-mono">{en.phoneFull}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${en.workOrderType === "نقل" ? "bg-blue-50 text-blue-700" : en.workOrderType === "صيانة" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                    {en.workOrderType}
                  </span>
                </TableCell>
                <TableCell className="text-center font-semibold">{en.cableQuantity}</TableCell>
                <TableCell dir="ltr" className="text-right text-xs whitespace-nowrap">{entryDay(en)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{en.createdByName}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(en.updatedAt), "yyyy/MM/dd HH:mm")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {en.locked && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-700" title="مقفل بعد طباعة التقرير">
                        <Lock className="w-3.5 h-3.5" /> مقفل
                      </span>
                    )}
                    {en.locked && isAdmin && en.canUnlock && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => unlockMutation.mutate(en.id)} disabled={unlockMutation.isPending} title="منح صلاحية التعديل">
                        <KeyRound className="w-4 h-4" />
                      </Button>
                    )}
                    {canDelete(en) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
                        onClick={() => { if (en.workOrderType !== "صيانة" || confirm(`إلغاء سلك الصيانة ${en.cableQuantity} م للرقم ${en.phoneFull}؟`)) deleteMutation.mutate(en.id); }}
                        disabled={deleteMutation.isPending || deleteLocked(en)}
                        title={deleteLocked(en) ? "مقفل بعد الطباعة" : "حذف"}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

const cairoDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
/** تاريخ الإدخال: تاريخ الشغل اللى اتكتب (المالك ٢٠٢٦-١٠-١٣)، ولو مش موجود يوم التسجيل */
const entryDay = (e: CableEntry) => e.workDate || cairoDay(e.createdAt);
const todayCairo = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
export const MAINT_SHEET_TITLE = "إفادة بصرف سلك للصيانة الهوائية بإدارة سنترال الغنايم";
export const MAINT_SHEET_COLS = ["رقم التليفون", "التاريخ", "اسم الصنف", "الكمية بالمتر", "اسم الفنى", "توقيع الفنى", "ملاحظات"];
const ITEM_NAME = "سلك واحد جوز";

/** إفادة صرف سلك الصيانة — زى الورقة بالظبط، وتوقيع الفنى فاضى. */
export function MaintCableSheet() {
  // السوبر أدمن بس (المالك ٢٠٢٦-١٠-١٣): يلغى سلك صيانة منزّله الفنى أو يعدّل تاريخه — الكمية لأ
  const { user } = useAuth();
  const isSuper = user?.role === ROLES.SUPER_ADMIN;
  const { toast } = useToast();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/cable-entries"] });
    qc.invalidateQueries({ queryKey: ["/api/local-store"] });
  };
  const cancelMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/cable-entries/${id}`)).json(),
    onSuccess: () => { refresh(); toast({ title: "اتلغى", duration: 2500 }); },
    onError: (e: Error) => toast({ title: "ماتلغاش", description: errMsg(e), variant: "destructive", duration: 6000 }),
  });
  const dateMutation = useMutation({
    mutationFn: async ({ id, date }: { id: number; date: string }) =>
      (await apiRequest("PATCH", `/api/cable-entries/${id}/date`, { date })).json(),
    onSuccess: (d: any) => { refresh(); toast({ title: "اتعدّل التاريخ", description: d?.date, duration: 2500 }); },
    onError: (e: Error) => { refresh(); toast({ title: "التاريخ ماتعدّلش", description: errMsg(e), variant: "destructive", duration: 6000 }); },
  });
  const [from, setFrom] = useState(() => todayCairo().slice(0, 8) + "01");
  const [to, setTo] = useState(todayCairo);
  const { data: entries = [], isFetching } = useCableEntries("");
  const rows = useMemo(() => entries
    .filter((e) => e.workOrderType === "صيانة")
    .filter((e) => { const d = entryDay(e); return (!from || d >= from) && (!to || d <= to); })
    .sort((a, b) => entryDay(a).localeCompare(entryDay(b)) || a.createdAt.localeCompare(b.createdAt)), [entries, from, to]);
  const cells = (e: CableEntry) => [
    e.phoneLocal || e.phoneFull, entryDay(e).replace(/-/g, "/"), ITEM_NAME,
    `${e.cableQuantity} م`, e.createdByName || "", "", e.mobile || "",
  ];
  const period = `${from || "البداية"} إلى ${to || "اليوم"}`;
  const excel = () => {
    const ws = XLSX.utils.aoa_to_sheet([[MAINT_SHEET_TITLE], [period], MAINT_SHEET_COLS, ...rows.map(cells)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "صرف سلك الصيانة");
    XLSX.writeFile(wb, `maint-cable-sheet-${from || "all"}-${to || "now"}.xlsx`);
  };
  const pdf = () => printTablePDF({ title: `${MAINT_SHEET_TITLE} — ${period}`, columns: MAINT_SHEET_COLS, rows: rows.map(cells), rowsPerPage: 22 });
  const total = rows.reduce((s, e) => s + (Number(e.cableQuantity) || 0), 0);
  return (
    <Card className="overflow-hidden shadow-sm border-0 bg-white">
      <div className="p-3 border-b space-y-3">
        <div className="text-base font-bold text-center">{MAINT_SHEET_TITLE}</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1" htmlFor="mcs-from">من</label>
              <Input id="mcs-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-sm w-40" dir="ltr" /></div>
            <div><label className="text-xs text-muted-foreground block mb-1" htmlFor="mcs-to">إلى</label>
              <Input id="mcs-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-sm w-40" dir="ltr" /></div>
            <span className="text-sm text-muted-foreground pb-2">
              {isFetching && <Loader2 className="w-4 h-4 animate-spin inline ml-1" />}
              <b className="text-foreground">{rows.length}</b> صرف — إجمالى <b className="text-foreground tabular-nums">{Math.round(total * 100) / 100}</b> متر
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={excel} disabled={!rows.length} className="text-green-700 border-green-200 gap-1"><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
            <Button variant="outline" size="sm" onClick={pdf} disabled={!rows.length} className="text-red-700 border-red-200 gap-1" data-testid="button-maint-sheet-pdf"><Printer className="w-4 h-4" /> PDF</Button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="text-right text-sm" dir="rtl">
          <TableHeader className="bg-muted/50">
            <TableRow>
              {MAINT_SHEET_COLS.map((c) => <TableHead key={c} className="text-right font-bold whitespace-nowrap">{c}</TableHead>)}
              {isSuper && <TableHead className="text-right font-bold whitespace-nowrap">إلغاء</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={MAINT_SHEET_COLS.length + (isSuper ? 1 : 0)} className="text-center py-10 text-muted-foreground">
                {isFetching ? "جاري التحميل..." : "مفيش صرف سلك صيانة فى الفترة دى"}
              </TableCell></TableRow>
            ) : rows.map((e) => (
              <TableRow key={e.id}>
                {cells(e).map((c, j) => (
                  <TableCell key={j} dir={j === 0 || j === 6 ? "ltr" : undefined}
                    className={`whitespace-nowrap ${j === 0 || j === 6 ? "font-mono text-right" : ""} ${j === 5 ? "min-w-[120px]" : ""}`}>
                    {/* السوبر أدمن بيعدّل التاريخ فى عمود «التاريخ» نفسه (المالك ٢٠٢٦-١٠-١٣) */}
                    {j === 1 && isSuper ? (
                      <Input type="date" defaultValue={entryDay(e)} max={todayCairo()} dir="ltr" key={`${e.id}-${entryDay(e)}`}
                        className="h-8 w-36 text-xs" aria-label={`تاريخ سلك ${e.phoneLocal || e.phoneFull}`}
                        disabled={dateMutation.isPending}
                        onBlur={(ev) => {
                          const v = ev.target.value;
                          if (v && v !== entryDay(e)) dateMutation.mutate({ id: e.id, date: v });
                        }} />
                    ) : c}
                  </TableCell>
                ))}
                {isSuper && (
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                        disabled={cancelMutation.isPending}
                        onClick={() => { if (confirm(`إلغاء سلك الصيانة ${e.cableQuantity} م للرقم ${e.phoneLocal || e.phoneFull}؟`)) cancelMutation.mutate(e.id); }}>
                        <Trash2 className="w-4 h-4" /> إلغاء
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/** القسم كله: تابين — الإفادة (الافتراضى) وإدخالات السلك. */
export function MaintCableSection() {
  const [tab, setTab] = useState<"sheet" | "entries">("sheet");
  const tabs = [
    { id: "sheet" as const, label: "إفادة صرف سلك الصيانة" },
    { id: "entries" as const, label: "إدخالات السلك" },
  ];
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "sheet" ? <MaintCableSheet /> : <CableEntriesList />}
    </div>
  );
}
