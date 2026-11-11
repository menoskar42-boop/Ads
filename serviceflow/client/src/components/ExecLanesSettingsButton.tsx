// زر «إعدادات» فى «رفع الملفات» (سوبر أدمن): عدد التابات اللى جهاز التنفيذ بيفتحها مع بعض
// لـ«قياس بدون Real» و«إيقاف PO» على AXON. السيرفر هو اللى بيطبّق العدد فى سحب الطابور
// (/api/exec-queue/claim)، فالتغيير بيمشى من المهمة الجاية من غير ريفريش لجهاز التنفيذ.
//
// الموبايل (المالك ٢٠٢٦-١٠-١٠: «شاشة الإعدادات بتنهج ومش بقدر أعدّل منها حاجة»):
//   • القيم بتتنسخ من السيرفر مرة واحدة لما الشاشة تتفتح — أى إعادة جلب بعدها (رفع ملف
//     بيعيد جلب كل استعلامات الصفحة) مابتمسحش اللى المستخدم كتبه.
//   • − و + جنب كل رقم: التعديل من غير كيبورد (الكيبورد على الآيفون بيحرّك النافذة).
//   • النافذة من فوق وبتتمرّر لو أطول من الشاشة، بدل ما تبقى فى النص وتتنطّط مع الكيبورد.
//   • لو التحميل فشل: رسالة + «حاول تانى» بدل دايرة بتلف على طول.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { saveNightPause, NIGHT_PAUSE_DEFAULT, type NightPause } from "@/lib/night-pause";
import { saveOpenView } from "@/lib/profile-optimization";

interface ExecLanes {
  noreal: number;
  stop: number;
  refreshMinutes: number;
  refreshRange: { min: number; max: number };
  /** باتش قياس ٩ الصبح: آخر قياس من كام يوم (٠ = كل الخطوط اللى ليها أكونت) */
  measureStaleDays: number;
  measureStaleRange: { min: number; max: number };
  /** باتش ٩ الصبح التالت «تحديث المسافة» لنفس أرقام «بدون Real» (مقفول افتراضياً) */
  autoLoopBatch?: boolean;
  /** Real بيشتغل جنب «إيقاف PO» و«بدون Real» فى نفس الوقت (مفتوح افتراضياً) */
  realParallel?: boolean;
  /** «إعادة بعد 102 و 104» التلقائية (مفتوحة افتراضياً) */
  retry102?: boolean;
  /** بعد كام دقيقة من القياس الأول */
  retry102Min?: number;
  retry102MinRange?: { min: number; max: number };
  retry102MinDefault?: number;
  defaults: { noreal: number; stop: number; refreshMinutes: number; measureStaleDays: number };
  max: number | null;   // null = مفيش سقف
  /** الإيقاف بالليل (١٢ بالليل ← ٧ الصبح): التحديث التلقائى وجهاز التنفيذ */
  nightPause?: NightPause;
  /** جسر Tampermonkey: مفتوح ⇒ الباتشات المؤجّلة «بدون Real» للجسر بس، وجهاز التنفيذ للعاجل */
  bridge?: boolean;
  /** طريقة فتح صفحات القياس بتاعة الجسر: تابات فى نافذة واحدة / كل خط فى نافذة لوحده */
  bridgeView?: "tabs" | "windows";
  /** آخر مرة الجسر كلّم السيرفر (ثوانى) — null = ماكلّمهوش من آخر تشغيل للسيرفر */
  bridgeSeenSec?: number | null;
  bridgeDevice?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

const LANES_URL = "/api/exec-queue/lanes";

export function ExecLanesSettingsButton() {
  const [open, setOpen] = useState(false);
  const [noreal, setNoreal] = useState("");
  const [stop, setStop] = useState("");
  const [refresh, setRefresh] = useState("");
  const [staleDays, setStaleDays] = useState("");
  const [night, setNight] = useState<NightPause>(NIGHT_PAUSE_DEFAULT);
  const [bridge, setBridge] = useState(false);
  const [autoLoop, setAutoLoop] = useState(false);
  const [realParallel, setRealParallel] = useState(true);
  const [retry102, setRetry102] = useState(true);
  const [retryMin, setRetryMin] = useState("5");
  const [bridgeView, setBridgeView] = useState<"tabs" | "windows">("tabs");
  const qc = useQueryClient();
  const { toast } = useToast();
  // المالك ٢٠٢٦-١٠-٢١: «كل ما أفتح متصفح ألاقى إعدادات مختلفة» — الإعداد العام staleTime:Infinity
  // كان بيخلّى كل تاب يعرض أول نسخة جابها (التاب المفتوح من امبارح يعرض إعدادات امبارح).
  // الإعدادات فى القاعدة (app_settings) واحدة لكل المتصفحات — فالشاشة بتجيبها من السيرفر كل ما تتفتح،
  // ومابتملاش الخانات غير من النسخة اللى اتجابت بعد الفتح.
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => { if (open) setOpenedAt(Date.now()); }, [open]);
  const { data, dataUpdatedAt, isLoading, isError, refetch, isFetching } = useQuery<ExecLanes>({
    queryKey: [LANES_URL],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const r = await fetch(LANES_URL, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      saveNightPause(j?.nightPause);
      saveOpenView(j?.bridgeView);   // تابات «إيقاف PO» بتتفتح بنفس الطريقة
      return j;
    },
    enabled: open,
    retry: 1,
  });
  // نسخ القيم مرة واحدة لكل فتحة — مش مع كل إعادة جلب
  const filled = useRef(false);
  useEffect(() => { if (!open) filled.current = false; }, [open]);
  useEffect(() => {
    if (open && data && !filled.current && openedAt && dataUpdatedAt >= openedAt) {
      filled.current = true;
      setNoreal(String(data.noreal)); setStop(String(data.stop)); setRefresh(String(data.refreshMinutes));
      setStaleDays(String(data.measureStaleDays ?? 1));
      setNight({ ...NIGHT_PAUSE_DEFAULT, ...(data.nightPause ?? {}) });
      setBridge(!!data.bridge);
      setAutoLoop(!!data.autoLoopBatch);
      setRealParallel(data.realParallel !== false);
      setRetry102(data.retry102 !== false);
      setRetryMin(String(data.retry102Min ?? 5));
      setBridgeView(data.bridgeView === "windows" ? "windows" : "tabs");
    }
  }, [open, data, dataUpdatedAt, openedAt]);

  // مفيش سقف لعدد التابات (المالك ٢٠٢٦-١٠-١٣) — الرقم اللى يتكتب هو اللى يتطبّق
  const valid = (v: string) => /^\d+$/.test(v) && +v >= 1;
  const rMin = data?.refreshRange?.min ?? 5, rMax = data?.refreshRange?.max ?? 240;
  const validRefresh = /^\d+$/.test(refresh) && +refresh >= rMin && +refresh <= rMax;
  const sMin = data?.measureStaleRange?.min ?? 0, sMax = data?.measureStaleRange?.max ?? 30;
  const validStale = /^\d+$/.test(staleDays) && +staleDays >= sMin && +staleDays <= sMax;
  const qMin = data?.retry102MinRange?.min ?? 1, qMax = data?.retry102MinRange?.max ?? 60;
  const validRetryMin = /^\d+$/.test(retryMin) && +retryMin >= qMin && +retryMin <= qMax;
  const TIME_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
  const validNight = TIME_OK.test(night.start) && TIME_OK.test(night.end) && night.start !== night.end;
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(LANES_URL, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noreal: +noreal, stop: +stop, refreshMinutes: +refresh, measureStaleDays: +staleDays, autoLoopBatch: autoLoop, realParallel, retry102, retry102Min: +retryMin, nightPause: night, bridge, bridgeView }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `خطأ ${r.status}`);
      return j;
    },
    onSuccess: (j: any) => {
      saveNightPause(j?.nightPause ?? night);   // الجهاز ده يعرف على طول من غير ما يستنى
      saveOpenView(j?.bridgeView ?? bridgeView);
      qc.invalidateQueries({ queryKey: [LANES_URL] });
      qc.invalidateQueries({ queryKey: ["/api/exec-queue/lanes"] });
      toast({ title: "اتحفظ ✓", description: "الإعدادات الجديدة بتتطبّق من المهمة/الدورة الجاية." });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "ماتحفظش", description: e.message, variant: "destructive" }),
  });

  // رقم بـ − و + (من غير كيبورد) — والكتابة لسه متاحة لو حد عايزها
  const stepper = (id: string | undefined, v: string, set: (s: string) => void, lo: number, hi: number, step: number, ok: boolean, label: string) => {
    const n = /^\d+$/.test(v) ? +v : lo;
    const go = (d: number) => set(String(Math.min(hi, Math.max(lo, n + d))));
    return (
      <div className="flex items-center gap-1" dir="ltr">
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label={`${label} −`}
          disabled={n <= lo} onClick={() => go(-step)}><Minus className="w-4 h-4" /></Button>
        <Input id={id} type="text" inputMode="numeric" pattern="[0-9]*" value={v}
          onChange={(e) => set(e.target.value.replace(/[^\d]/g, ""))} className="h-10 w-16 text-center text-base"
          aria-invalid={!ok} />
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label={`${label} +`}
          disabled={n >= hi} onClick={() => go(step)}><Plus className="w-4 h-4" /></Button>
      </div>
    );
  };
  const row = (label: string, hint: string, v: string, set: (s: string) => void, def?: number, id?: string) => (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        {stepper(id, v, set, 1, Number.MAX_SAFE_INTEGER, 1, valid(v), label)}
        <span className="text-xs text-muted-foreground">تاب (1 أو أكتر{def != null ? ` — الافتراضى ${def}` : ""})</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <Settings className="w-3.5 h-3.5" /> إعدادات
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90dvh] overflow-y-auto top-[4dvh] translate-y-0 sm:top-[50%] sm:translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle>إعدادات التنفيذ والتحديث</DialogTitle>
            <DialogDescription>
              عدد صفحات AXON اللى بتتفتح مع بعض. النوعين مابيشتغلوش مع بعض فى نفس الوقت —
              كل نوع ياخد تاباته وهو لوحده، وأى نوع تانى (قياس Real، رفع سرعة) تاب واحد دايماً.
            </DialogDescription>
          </DialogHeader>
          {isError && !data ? (
            <div className="flex flex-col items-center gap-3 py-6 text-sm">
              <p className="text-destructive">الإعدادات ماتحمّلتش — غالباً النت أو السيرفر مشغول.</p>
              <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                {isFetching && <Loader2 className="w-4 h-4 animate-spin ml-1" />} حاول تانى
              </Button>
            </div>
          ) : isLoading || !data ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {row("قياس بدون Real", "بيقرا History — مش real-time.", noreal, setNoreal, data.defaults.noreal, "lanes-noreal")}
              {row("إيقاف PO", "Stop Nightly PO. لو حصلت مشاكل جلسة على AXON رجّعه 1.", stop, setStop, data.defaults.stop, "lanes-stop")}
              <div className="space-y-1 pt-2 border-t">
                <label htmlFor="refresh-minutes" className="text-sm font-medium">تحديث التقارير اليومية تلقائياً كل</label>
                <div className="flex flex-wrap items-center gap-2">
                  {stepper("refresh-minutes", refresh, setRefresh, rMin, rMax, 5, validRefresh, "دقايق التحديث")}
                  <span className="text-xs text-muted-foreground">دقيقة (من {rMin} لـ {rMax} — الافتراضى {data.defaults.refreshMinutes})</span>
                </div>
                <p className="text-xs text-muted-foreground">بيشتغل على الجهاز اللى زرار «التحديث التلقائى» مفعّل عليه. التغيير بيتطبّق من الدورة الجاية.</p>
              </div>
              <div className="space-y-1 pt-2 border-t">
                <label htmlFor="measure-stale-days" className="text-sm font-medium">قياس ٩ الصبح (بدون Real): الخطوط اللى آخر قياس ليها من</label>
                <div className="flex flex-wrap items-center gap-2">
                  {stepper("measure-stale-days", staleDays, setStaleDays, sMin, sMax, 1, validStale, "أيام قياس ٩ الصبح")}
                  <span className="text-xs text-muted-foreground">يوم أو أكتر (الافتراضى {data.defaults.measureStaleDays ?? 1})</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {staleDays === "0" ? "٠ = كل الخطوط اللى ليها أكونت مهما كان آخر قياس." : "١ = أى خط ماتقاسش النهارده. ٠ = كل الخطوط اللى ليها أكونت."} والخطوط اللى ماتقاستش خالص بتدخل دايماً.
                </p>
                <label className="flex items-start gap-2 text-sm pt-1 cursor-pointer" data-testid="toggle-auto-loop-batch">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={autoLoop} onChange={(e) => setAutoLoop(e.target.checked)} />
                  <span>
                    باتش تالت «تحديث حالة الخط (ASSIA)» الساعة ٩ الصبح
                    <span className="block text-xs text-muted-foreground">بنفس أرقام باتش «بدون Real» — بيقرا المسافة بس من شاشة DSL. مقفول افتراضياً (قياس ٩ الصبح مابقاش بيقرا المسافة).</span>
                  </span>
                </label>
              </div>
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-medium">قياس Real</p>
                <label className="flex items-start gap-2 text-sm cursor-pointer" data-testid="toggle-real-parallel">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={realParallel} onChange={(e) => setRealParallel(e.target.checked)} />
                  <span>
                    Real يشتغل مع «إيقاف PO» و«بدون Real» فى نفس الوقت
                    <span className="block text-xs text-muted-foreground">مفتوح افتراضياً (Real واحد بس فى المرة). لو قفلته، Real بيستنى الإيقاف و«بدون Real» يخلصوا وبياخد الموقع لوحده، واللى بعده بيستناه.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer" data-testid="toggle-retry-102">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={retry102} onChange={(e) => setRetry102(e.target.checked)} />
                  <span>
                    «إعادة بعد 102 و 104» تلقائياً
                    <span className="block text-xs text-muted-foreground">لما Real يطلع 102 أو 104، يتقاس Real تانى بعد المدة دى من القياس الأول لو محدش قاسه. مفتوحة افتراضياً — لو قفلتها، الإعادات اللى متجدولة كمان مش هتتنفّذ.</span>
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-2 pr-6">
                  <label htmlFor="retry-102-min" className="text-sm">بعد</label>
                  {stepper("retry-102-min", retryMin, setRetryMin, qMin, qMax, 1, validRetryMin, "مدة إعادة 102 و 104")}
                  <span className="text-xs text-muted-foreground">دقيقة من القياس الأول (من {qMin} لـ {qMax} — الافتراضى {data.retry102MinDefault ?? 5})</span>
                </div>
              </div>
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-medium">فترة الإيقاف (توقيت القاهرة)</p>
                <div className="flex flex-wrap items-center gap-2 text-sm" dir="rtl">
                  <label htmlFor="night-start">من</label>
                  <Input id="night-start" type="time" value={night.start} className="h-10 w-28 text-center" dir="ltr"
                    onChange={(e) => setNight((n) => ({ ...n, start: e.target.value }))} aria-invalid={!validNight} />
                  <label htmlFor="night-end">لحد</label>
                  <Input id="night-end" type="time" value={night.end} className="h-10 w-28 text-center" dir="ltr"
                    onChange={(e) => setNight((n) => ({ ...n, end: e.target.value }))} aria-invalid={!validNight} />
                  <span className="text-xs text-muted-foreground">(الافتراضى 00:00 لحد 07:00)</span>
                </div>
                {!validNight && <p className="text-xs text-destructive">البداية والنهاية لازم يبقوا ساعة ودقيقة ومختلفين.</p>}
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-0.5">
                    <span className="block text-sm">التحديث التلقائى يقف فى الفترة دى</span>
                    <span className="block text-xs text-muted-foreground">حتى لو زرار «التحديث التلقائى» مفتوح، ومعاه التحديث الدورى للشاشات المفتوحة. لو حد بيستعمل البرنامج بالليل بيرجع عادى.</span>
                  </span>
                  <Switch checked={night.refresh} onCheckedChange={(v) => setNight((n) => ({ ...n, refresh: v }))} aria-label="التحديث التلقائى يقف فى فترة الإيقاف" />
                </label>
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-0.5">
                    <span className="block text-sm">جهاز التنفيذ يقف فى الفترة دى</span>
                    <span className="block text-xs text-muted-foreground">مابيستقبلش طلبات جديدة: بيخلّص اللى كان فى الطابور قبل بداية الفترة ويقف، وبيرجع لوحده آخرها. الطلبات اللى تتضاف جوّه الفترة بتستنى لآخرها.</span>
                  </span>
                  <Switch checked={night.executor} onCheckedChange={(v) => setNight((n) => ({ ...n, executor: v }))} aria-label="جهاز التنفيذ يقف فى فترة الإيقاف" />
                </label>
                <p className="text-xs text-muted-foreground">قاعدة البيانات بتنام لما محدش يسألها، والفاتورة على كل ساعة هى صاحية فيها.</p>
              </div>
              <div className="space-y-2 pt-2 border-t">
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">جسر Tampermonkey للباتشات المؤجّلة</span>
                    <span className="block text-xs text-muted-foreground">
                      مفتوح: الباتشات المؤجّلة (أكتر من ٣ خطوط) — «قياس بدون Real» و«إيقاف PO» (زى إيقاف ٩ الصبح) — بيسحبها سكربت الجسر لوحده طول ما صفحة جوجل مفتوحة؛ Real ورفع السرعة والإيقاف اللى بعده قياس بيفضلوا على جهاز التنفيذ،
                      وجهاز التنفيذ بياخد العاجل بس. مقفول: جهاز التنفيذ بيعمل كل حاجة زى الأول، واللى كان مع الجسر بيرجعله على طول.
                    </span>
                  </span>
                  <Switch checked={bridge} onCheckedChange={setBridge} aria-label="جسر Tampermonkey للباتشات المؤجّلة" />
                </label>
                <div className="space-y-1">
                  <p className="text-sm">طريقة فتح صفحات القياس وإيقاف PO</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="طريقة فتح صفحات القياس وإيقاف PO">
                    {([["tabs", "تابات فى نافذة واحدة"], ["windows", "كل خط فى نافذة لوحده"]] as const).map(([v, label]) => (
                      <Button key={v} type="button" size="sm" role="radio" aria-checked={bridgeView === v}
                        variant={bridgeView === v ? "default" : "outline"} onClick={() => setBridgeView(v)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {bridgeView === "windows"
                      ? "كل خط بيتفتح فى نافذة Edge لوحده وبيتقفل لما يخلص. محتاج تسمح بالـpopups لـgoogle.com وgoogle.com.eg فى Edge — لو ممنوعة بيتفتح تاب."
                      : "كل خط فى تاب لوحده فى نفس النافذة، وبيتقفل لما يخلص — زى جهاز التنفيذ، ومن غير popups."}
                    {" "}التغيير بيتطبّق فى خلال ١٠ ثوانى على الصفحات الجديدة.
                    {" "}وتابات «إيقاف PO» من جهاز التنفيذ بتتفتح بنفس الطريقة (فى النوافذ محتاج السماح بالـpopups لـoscardevs.com — وده مسموح أصلاً لو جهاز التنفيذ بيفتح تابات).
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.bridgeSeenSec == null
                    ? "الجسر ماكلّمش السيرفر من آخر تشغيل له."
                    : `آخر مرة الجسر كلّم السيرفر: من ${data.bridgeSeenSec < 90 ? `${data.bridgeSeenSec} ثانية` : `${Math.round(data.bridgeSeenSec / 60)} دقيقة`}${data.bridgeDevice ? ` (${data.bridgeDevice})` : ""}.`}
                  {bridge && (data.bridgeSeenSec == null || data.bridgeSeenSec > 600) && " ⚠️ لو الجسر مش شغّال، الباتشات دى هتفضل مستنية."}
                </p>
              </div>
              {data.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  آخر تعديل: {String(data.updatedAt).slice(0, 16).replace("T", " ")}{data.updatedBy ? ` — ${data.updatedBy}` : ""}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={!data || !valid(noreal) || !valid(stop) || !validRefresh || !validStale || !validRetryMin || !validNight || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin ml-1" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
