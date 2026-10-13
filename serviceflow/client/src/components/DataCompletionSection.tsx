import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { ROLES } from "@shared/schema";
import { Loader2, Plus, Cable } from "lucide-react";
import { WorkOrdersNoCableEntry } from "@/components/WorkOrdersNoCableEntry";
import { LineDataCorrection } from "@/components/LineDataCorrection";
import { LineDataCorrectionsReport } from "@/components/LineDataCorrectionsReport";
import { CableEntriesList } from "@/components/MaintCableSection";


export function DataCompletionSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [phone, setPhone] = useState("");
  // المالك (٢٠٢٦-١٠-٠٧): التاب ده «إدخال كمية سلك الصيانة» — النوع صيانة دايماً (مش دروب ليست)،
  // والكمية بتتخصم من رصيد سلك الصيانة اللى مع الفنى. التركيب/النقل من «أوامر شغل بدون كمية سلك».
  const workOrderType = "صيانة";
  const [cableQuantity, setCableQuantity] = useState("");
  const [mobile, setMobile] = useState(""); // رقم المحمول — يظهر عند اختيار «صيانة» فقط
  // تاريخ الشغل (المالك ٢٠٢٦-١٠-١٣): السلك بيتسجّل بالتاريخ ده — النهارده افتراضياً ويتعدّل.
  // بيفضل زى ما هو بعد الحفظ (عشان إدخال كذا رقم من نفس اليوم ورا بعض).
  const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const [workDay, setWorkDay] = useState(cairoToday);
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


  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cable-entries", {
        phone, workOrderType, cableQuantity, workDate: workDay,
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



  // كمية السلك: أرقام فقط مع نقطة عشرية واحدة
  const handleQtyChange = (v: string) => {
    if (v === "" || /^\d*\.?\d*$/.test(v)) setCableQuantity(v);
  };
  // رقم التليفون: أرقام فقط (نضيف 88- تلقائياً عند الحفظ)
  const handlePhoneChange = (v: string) => {
    if (v === "" || /^\d*$/.test(v)) { setPhone(v); setNeedTechNames(null); setStockTech(""); }
  };

  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(workDay) && workDay <= cairoToday();
  const canSubmit = phone.trim().length >= 5 && /^\d+(\.\d+)?$/.test(cableQuantity.trim()) && validDay;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) saveMutation.mutate();
  };



  const ALL_TABS: { id: "manual" | "orders" | "fix" | "fixlist"; label: string }[] = [
    { id: "orders",  label: "أوامر شغل بدون كمية سلك" },
    { id: "manual",  label: "إدخال كمية سلك الصيانة" },
    { id: "fix",     label: "تصحيح بيانات" },
    { id: "fixlist", label: "متابعة التصحيحات" },
  ];
  // مسئول البيانات (قرار المالك ٢٠٢٦-١٠-٠٧): «متابعة التصحيحات» و«أوامر شغل بدون كمية سلك» بس،
  // والأولى هى الافتراضى — من غير «إدخال كمية سلك الصيانة» و«تصحيح بيانات».
  const isDataManager = user?.role === ROLES.DATA_MANAGER;
  const DM_TABS: DcTab[] = ["fixlist", "orders"];
  const TABS = isDataManager
    ? DM_TABS.map((id) => ALL_TABS.find((t) => t.id === id)!)
    : ALL_TABS;
  const shownTab: DcTab = isDataManager && !DM_TABS.includes(tab) ? "fixlist" : tab;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              shownTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shownTab === "orders" ? <WorkOrdersNoCableEntry />
       : shownTab === "fix" ? <LineDataCorrection />
       : shownTab === "fixlist" ? <LineDataCorrectionsReport /> : (<>
      {/* نموذج الإدخال */}
      <Card className="p-4 sm:p-5 bg-white border-0 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Cable className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold">إدخال كمية سلك الصيانة</h2>
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

          {/* نوع امر الشغل — صيانة دايماً */}
          <div className="w-full sm:w-40">
            <Label className="text-xs text-muted-foreground block mb-1">نوع امر الشغل</Label>
            <div className="h-10 px-3 flex items-center rounded-md border bg-amber-50 text-amber-800 text-sm font-medium" data-testid="fixed-order-type">صيانة</div>
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

          {/* التاريخ — السلك بيتسجّل بيه (النهارده افتراضياً) */}
          <div className="w-full sm:w-40">
            <Label htmlFor="cable-work-day" className="text-xs text-muted-foreground block mb-1">التاريخ</Label>
            <Input
              id="cable-work-day"
              type="date"
              value={workDay}
              max={cairoToday()}
              onChange={(e) => setWorkDay(e.target.value)}
              dir="ltr"
              className="text-sm text-left"
              aria-invalid={!validDay}
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
          ملاحظة: يُكتب رقم التليفون بدون <span className="font-mono">88-</span> (تُضاف تلقائياً). الكمية بتتخصم من رصيد
          سلك الصيانة اللى مع الفنى فى المخزن المحلى. سلك التركيب والنقل بيتسجّل من «أوامر شغل بدون كمية سلك».
        </p>
      </Card>

      {/* قايمة الإدخالات اتنقلت لقسم المخزن ← «سلك الصيانة» (المالك ٢٠٢٦-١٠-١٢). الفنى بس
          بيشوف إدخالاته هنا عشان يراجع ويمسح غلطه على طول. */}
      {isTech && <CableEntriesList />}
      </>)}
    </div>
  );
}
