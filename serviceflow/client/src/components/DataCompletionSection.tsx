import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { ROLES } from "@shared/schema";
import { format } from "date-fns";
import { Loader2, Plus, Trash2, Cable, Search, Lock, KeyRound, FileSpreadsheet, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";
import { WorkOrdersNoCableEntry } from "@/components/WorkOrdersNoCableEntry";
import { LineDataCorrection } from "@/components/LineDataCorrection";
import { LineDataCorrectionsReport } from "@/components/LineDataCorrectionsReport";

interface CableEntry {
  id: number;
  phoneLocal: string;
  phoneFull: string;
  workOrderType: string;
  cableQuantity: string;
  createdById: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  printedAt: string | null;
  editUnlockedAt: string | null;
  locked: boolean;
  canUnlock: boolean;
}

export function DataCompletionSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.SUPER_ADMIN;

  const [phone, setPhone] = useState("");
  const [workOrderType, setWorkOrderType] = useState("صيانة");   // الافتراضى
  const [cableQuantity, setCableQuantity] = useState("");
  const [mobile, setMobile] = useState(""); // رقم المحمول — يظهر عند اختيار «صيانة» فقط
  // المخزن المحلى: لو فنى الإغلاق مش من الخمسة السيرفر بيرجّع 422 needTech ⇒ نختار الفنى
  // اللى الكمية تتخصم من رصيده (server/local-store.ts)
  const [stockTech, setStockTech] = useState("");
  const [needTechNames, setNeedTechNames] = useState<string[] | null>(null);
  const isTech = user?.role === ROLES.TECH;
  const { data: myBalance } = useQuery<{ tech: string | null; started: boolean; balances: { type: "install" | "maint"; issued: number; used: number; balance: number }[] }>({
    queryKey: ["/api/local-store", "my-balance"],
    enabled: isTech,
    queryFn: async () => {
      const res = await fetch("/api/local-store/my-balance", { credentials: "include" });
      if (!res.ok) throw new Error("فشل التحميل");
      return res.json();
    },
  });
  const [search, setSearch] = useState("");
  // تابين: الإدخال اليدوى (رقم برقم)، وقائمة أوامر الشغل اللى لسه مالهاش كمية سلك
  // (نفس مصدر تقرير أوامر الشغل) وقدّام كل صف خانة إدخال.
  // التاب الافتراضى (قرار المالك ٢٠٢٦-١٠-٠٥): مسئول البيانات على «متابعة التصحيحات» (شغله
  // الأساسى)، والباقى على «أوامر شغل بدون كمية سلك». لو المستخدم لسه بيتحمّل وقت أول رندر
  // بنظبطه أول ما يوصل — إلا لو اختار تاب بإيده.
  type DcTab = "manual" | "orders" | "fix" | "fixlist";
  const defaultTabFor = (role?: string | null): DcTab => (role === ROLES.DATA_MANAGER ? "fixlist" : "orders");
  const [tab, setTabState] = useState<DcTab>(() => defaultTabFor(user?.role));
  const tabTouched = useRef(false);
  const setTab = (t: DcTab) => { tabTouched.current = true; setTabState(t); };
  useEffect(() => {
    if (!tabTouched.current && user?.role) setTabState(defaultTabFor(user.role));
  }, [user?.role]);

  const { data: entries = [], isFetching } = useQuery<CableEntry[]>({
    queryKey: ["/api/cable-entries", search],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search.trim()) p.set("q", search.trim());
      const res = await fetch(`/api/cable-entries?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل التحميل");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cable-entries", {
        phone, workOrderType, cableQuantity,
        mobile: workOrderType === "صيانة" ? mobile : "", // المحمول يُرسل مع «صيانة» فقط
        ...(stockTech ? { stockTech } : {}),
      });
      return res.json();
    },
    onSuccess: (d: any) => {
      toast({ title: "تم الحفظ", description: `كمية السلك للرقم ${phone} (${workOrderType})${d?.stockTech ? ` — من رصيد ${d.stockTech}` : ""}`, duration: 3500 });
      if (typeof d?.stockBalance === "number" && d.stockBalance < 0) {
        toast({ title: "الرصيد بالسالب", description: `رصيد سلك ${workOrderType === "صيانة" ? "الصيانة" : "التركيبات والنقل"} عند ${d.stockTech}: ${d.stockBalance} متر — محتاج أمر إفراج من المخزن المحلى`, variant: "destructive", duration: 8000 });
      }
      setStockTech("");
      setNeedTechNames(null);
      qc.invalidateQueries({ queryKey: ["/api/local-store"] });
      setPhone("");
      setCableQuantity("");
      setMobile("");
      setWorkOrderType("صيانة");
      qc.invalidateQueries({ queryKey: ["/api/cable-entries"] });
      qc.invalidateQueries({ queryKey: ["/api/work-orders"] });
    },
    onError: (e: Error) => {
      // رسالة الخطأ تأتى بصيغة "409: {\"message\":\"...\"}" — ننظّفها للعرض
      let msg = e.message || "حدث خطأ";
      const m = msg.match(/^\d+:\s*(.*)$/s);
      if (m) msg = m[1];
      try {
        const j = JSON.parse(msg);
        if (j?.message) msg = j.message;
        if (j?.needTech) {
          setNeedTechNames(j.techNames || []);
          toast({ title: "اختار الفنى", description: msg, duration: 7000 });
          return;
        }
      } catch { /* نص عادى */ }
      toast({ title: "تعذّر الحفظ", description: msg, variant: "destructive", duration: 6000 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/cable-entries/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cable-entries"] });
      qc.invalidateQueries({ queryKey: ["/api/work-orders"] });
    },
    onError: (e: Error) => {
      let msg = e.message || "حدث خطأ";
      const m = msg.match(/^\d+:\s*(.*)$/s);
      if (m) msg = m[1];
      try { const j = JSON.parse(msg); if (j?.message) msg = j.message; } catch { /* */ }
      toast({ title: "التعديل مقفل", description: msg, variant: "destructive", duration: 6000 });
    },
  });

  // الأدمن يمنح صلاحية تعديل لإدخال مطبوع (خلال 3 أيام من الطباعة)
  const unlockMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/cable-entries/${id}/unlock`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cable-entries"] });
      toast({ title: "تم منح صلاحية التعديل", duration: 3000 });
    },
    onError: (e: Error) => {
      let msg = e.message || "حدث خطأ";
      const m = msg.match(/^\d+:\s*(.*)$/s);
      if (m) msg = m[1];
      try { const j = JSON.parse(msg); if (j?.message) msg = j.message; } catch { /* */ }
      toast({ title: "تعذّر منح الصلاحية", description: msg, variant: "destructive", duration: 6000 });
    },
  });

  // كمية السلك: أرقام فقط مع نقطة عشرية واحدة
  const handleQtyChange = (v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) setCableQuantity(v);
  };
  // رقم التليفون: أرقام فقط (نضيف 88- تلقائياً عند الحفظ)
  const handlePhoneChange = (v: string) => {
    if (v === "" || /^\d*$/.test(v)) { setPhone(v); setNeedTechNames(null); setStockTech(""); }
  };

  const canSubmit = phone.trim().length >= 5 && /^\d+(\.\d+)?$/.test(cableQuantity.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) saveMutation.mutate();
  };

  const handleExportExcel = () => {
    const rows = entries.map((en, i) => ({
      "#": i + 1,
      "رقم التليفون": en.phoneFull,
      "نوع امر الشغل": en.workOrderType,
      "كمية السلك (متر)": en.cableQuantity,
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
      title: "استكمال بيانات — كمية السلك",
      columns: ["#", "رقم التليفون", "نوع امر الشغل", "كمية السلك (متر)", "بواسطة", "آخر تحديث"],
      rows: entries.map((en, i) => [
        i + 1, en.phoneFull, en.workOrderType, en.cableQuantity, en.createdByName,
        format(new Date(en.updatedAt), "yyyy/MM/dd HH:mm"),
      ]),
    });
  };

  const TABS: { id: "manual" | "orders" | "fix" | "fixlist"; label: string }[] = [
    { id: "orders",  label: "أوامر شغل بدون كمية سلك" },
    { id: "manual",  label: "إدخال كمية السلك" },
    { id: "fix",     label: "تصحيح بيانات" },
    { id: "fixlist", label: "متابعة التصحيحات" },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" ? <WorkOrdersNoCableEntry />
       : tab === "fix" ? <LineDataCorrection />
       : tab === "fixlist" ? <LineDataCorrectionsReport /> : (<>
      {/* نموذج الإدخال */}
      <Card className="p-4 sm:p-5 bg-white border-0 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Cable className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold">استكمال بيانات — كمية السلك</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          {/* رقم التليفون */}
          <div className="flex-1 min-w-[150px]">
            <Label className="text-xs text-muted-foreground block mb-1">رقم التليفون</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground font-mono shrink-0">88-</span>
              <Input
                inputMode="numeric"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="2657290"
                dir="ltr"
                className="text-sm text-left"
              />
            </div>
          </div>

          {/* نوع امر الشغل */}
          <div className="w-full sm:w-40">
            <Label className="text-xs text-muted-foreground block mb-1">نوع امر الشغل</Label>
            <Select value={workOrderType} onValueChange={(v) => { setWorkOrderType(v); setNeedTechNames(null); setStockTech(""); }}>
              <SelectTrigger className="text-right text-sm" dir="rtl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="تركيب" className="text-right">تركيب</SelectItem>
                <SelectItem value="نقل" className="text-right">نقل</SelectItem>
                <SelectItem value="صيانة" className="text-right">صيانة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* كمية السلك */}
          <div className="w-full sm:w-40">
            <Label className="text-xs text-muted-foreground block mb-1">كمية السلك (متر)</Label>
            <Input
              inputMode="decimal"
              value={cableQuantity}
              onChange={(e) => handleQtyChange(e.target.value)}
              placeholder="مثال: 12.5"
              dir="ltr"
              className="text-sm text-left"
            />
          </div>

          {/* رقم المحمول — يظهر عند اختيار «صيانة» فقط. يُسجَّل فى أرقام محمول الخطوط
              فيظهر عند البحث برقم التليفون ويتحدّث لو الخط له رقم سابق. */}
          {workOrderType === "صيانة" && (
            <div className="w-full sm:w-44">
              <Label className="text-xs text-muted-foreground block mb-1">رقم المحمول (اختيارى)</Label>
              <Input
                inputMode="tel"
                value={mobile}
                onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*$/.test(v)) setMobile(v); }}
                placeholder="01xxxxxxxxx"
                dir="ltr"
                className="text-sm text-left"
              />
            </div>
          )}

          {needTechNames && (
            <div className="w-full sm:w-48">
              <Label className="text-xs text-red-700 block mb-1">يتخصم من رصيد الفنى</Label>
              <Select value={stockTech} onValueChange={setStockTech}>
                <SelectTrigger className="text-right text-sm border-red-300" dir="rtl"><SelectValue placeholder="اختار الفنى" /></SelectTrigger>
                <SelectContent>
                  {needTechNames.map((t) => <SelectItem key={t} value={t} className="text-right">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="submit" disabled={!canSubmit || saveMutation.isPending || (!!needTechNames && !stockTech)} className="gap-1">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            حفظ
          </Button>
        </form>
        {isTech && myBalance?.started && myBalance.balances.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm tabular-nums">
            <span className="text-muted-foreground">رصيدك من المخزن المحلى:</span>
            {myBalance.balances.map((b) => (
              <span key={b.type} className={`px-2 py-0.5 rounded border ${b.balance < 0 ? "border-red-300 bg-red-50 text-red-700 font-bold" : "border-slate-200 bg-slate-50"}`}>
                {b.type === "maint" ? "صيانة" : "تركيبات ونقل"}: {b.balance} متر
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          ملاحظة: يُكتب رقم التليفون بدون <span className="font-mono">88-</span> (تُضاف تلقائياً). نفس الرقم يمكن أن يكون له
          كميتان مختلفتان لأمرى الشغل (تركيب / نقل). تظهر الكمية في تقرير أوامر الشغل تلقائياً.
        </p>
      </Card>

      {/* بحث + قائمة الإدخالات */}
      <Card className="overflow-hidden shadow-sm border-0 bg-white">
        <div className="p-3 border-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>إجمالي: <strong className="text-foreground">{entries.length}</strong> إدخال</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={handleExportExcel}
              disabled={entries.length === 0}
              className="text-green-700 border-green-200 gap-1"
            >
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={handleExportPDF}
              disabled={entries.length === 0}
              className="text-red-700 border-red-200 gap-1"
            >
              <Printer className="w-4 h-4" /> PDF
            </Button>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث برقم التليفون"
                className="text-sm pr-8"
                dir="rtl"
              />
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
                <TableHead className="text-right font-bold">بواسطة</TableHead>
                <TableHead className="text-right font-bold">آخر تحديث</TableHead>
                <TableHead className="text-right font-bold w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-14 text-muted-foreground">
                    {isFetching ? "جاري التحميل..." : "لا توجد إدخالات بعد"}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((en, idx) => (
                  <TableRow key={en.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell dir="ltr" className="text-left font-mono">{en.phoneFull}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${en.workOrderType === "نقل" ? "bg-blue-50 text-blue-700" : en.workOrderType === "صيانة" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                        {en.workOrderType}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{en.cableQuantity}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{en.createdByName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(en.updatedAt), "yyyy/MM/dd HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {en.locked && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-amber-700" title="مقفل بعد طباعة التقرير">
                            <Lock className="w-3.5 h-3.5" /> مقفل
                          </span>
                        )}
                        {en.locked && isAdmin && en.canUnlock && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => unlockMutation.mutate(en.id)}
                            disabled={unlockMutation.isPending}
                            title="منح صلاحية التعديل"
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                        )}
                        {(isAdmin || user?.id === en.createdById) && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
                            onClick={() => deleteMutation.mutate(en.id)}
                            disabled={deleteMutation.isPending || en.locked}
                            title={en.locked ? "مقفل بعد الطباعة" : "حذف"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      </>)}
    </div>
  );
}
