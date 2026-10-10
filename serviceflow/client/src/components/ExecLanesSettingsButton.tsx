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

interface ExecLanes {
  noreal: number;
  stop: number;
  refreshMinutes: number;
  refreshRange: { min: number; max: number };
  defaults: { noreal: number; stop: number; refreshMinutes: number };
  max: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

const LANES_URL = "/api/exec-queue/lanes";

export function ExecLanesSettingsButton() {
  const [open, setOpen] = useState(false);
  const [noreal, setNoreal] = useState("");
  const [stop, setStop] = useState("");
  const [refresh, setRefresh] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ExecLanes>({
    queryKey: [LANES_URL],
    queryFn: async () => {
      const r = await fetch(LANES_URL, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: open,
    retry: 1,
  });
  // نسخ القيم مرة واحدة لكل فتحة — مش مع كل إعادة جلب
  const filled = useRef(false);
  useEffect(() => { if (!open) filled.current = false; }, [open]);
  useEffect(() => {
    if (open && data && !filled.current) {
      filled.current = true;
      setNoreal(String(data.noreal)); setStop(String(data.stop)); setRefresh(String(data.refreshMinutes));
    }
  }, [open, data]);

  const max = data?.max ?? 8;
  const valid = (v: string) => /^\d+$/.test(v) && +v >= 1 && +v <= max;
  const rMin = data?.refreshRange?.min ?? 5, rMax = data?.refreshRange?.max ?? 240;
  const validRefresh = /^\d+$/.test(refresh) && +refresh >= rMin && +refresh <= rMax;
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(LANES_URL, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noreal: +noreal, stop: +stop, refreshMinutes: +refresh }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `خطأ ${r.status}`);
      return j;
    },
    onSuccess: () => {
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
        {stepper(id, v, set, 1, max, 1, valid(v), label)}
        <span className="text-xs text-muted-foreground">تاب (من 1 لـ {max}{def != null ? ` — الافتراضى ${def}` : ""})</span>
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
              {data.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  آخر تعديل: {String(data.updatedAt).slice(0, 16).replace("T", " ")}{data.updatedBy ? ` — ${data.updatedBy}` : ""}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={!data || !valid(noreal) || !valid(stop) || !validRefresh || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin ml-1" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
