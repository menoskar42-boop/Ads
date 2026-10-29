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

interface ExecLanes {
  noreal: number;
  stop: number;
  refreshMinutes: number;
  refreshRange: { min: number; max: number };
  /** باتش قياس ٩ الصبح: آخر قياس من كام يوم (٠ = كل الخطوط اللى ليها أكونت) */
  measureStaleDays: number;
  measureStaleRange: { min: number; max: number };
  defaults: { noreal: number; stop: number; refreshMinutes: number; measureStaleDays: number };
  max: number | null;   // null = مفيش سقف
  /** الإيقاف بالليل (١٢ بالليل ← ٧ الصبح): التحديث التلقائى وجهاز التنفيذ */
  nightPause?: NightPause;
  /** جسر Tampermonkey: مفتوح ⇒ الباتشات المؤجّلة «بدون Real» للجسر بس، وجهاز التنفيذ للعاجل */
  bridge?: boolean;
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
    }
  }, [open, data, dataUpdatedAt, openedAt]);

  // مفيش سقف لعدد التابات (المالك ٢٠٢٦-١٠-١٣) — الرقم اللى يتكتب هو اللى يتطبّق
  const valid = (v: string) => /^\d+$/.test(v) && +v >= 1;
  const rMin = data?.refreshRange?.min ?? 5, rMax = data?.refreshRange?.max ?? 240;
  const validRefresh = /^\d+$/.test(refresh) && +refresh >= rMin && +refresh <= rMax;
  const sMin = data?.measureStaleRange?.min ?? 0, sMax = data?.measureStaleRange?.max ?? 30;
  const validStale = /^\d+$/.test(staleDays) && +staleDays >= sMin && +staleDays <= sMax;
  const TIME_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
  const validNight = TIME_OK.test(night.start) && TIME_OK.test(night.end) && night.start !== night.end;
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(LANES_URL, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noreal: +noreal, stop: +stop, refreshMinutes: +refresh, measureStaleDays: +staleDays, nightPause: night, bridge }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `خطأ ${r.status}`);
      return j;
    },
    onSuccess: (j: any) => {
      saveNightPause(j?.nightPause ?? night);   // الجهاز ده يعرف على طول من غير ما يستنى
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
                      مفتوح: باتشات «قياس بدون Real» المؤجّلة (أكتر من ٣ خطوط، من غير متابعة) بيسحبها سكربت الجسر لوحده طول ما صفحة جوجل مفتوحة،
                      وجهاز التنفيذ بياخد العاجل بس. مقفول: جهاز التنفيذ بيعمل كل حاجة زى الأول، واللى كان مع الجسر بيرجعله على طول.
                    </span>
                  </span>
                  <Switch checked={bridge} onCheckedChange={setBridge} aria-label="جسر Tampermonkey للباتشات المؤجّلة" />
                </label>
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
            <Button disabled={!data || !valid(noreal) || !valid(stop) || !validRefresh || !validStale || !validNight || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin ml-1" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
