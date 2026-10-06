// زر «إعدادات» فى «رفع الملفات» (سوبر أدمن): عدد التابات اللى جهاز التنفيذ بيفتحها مع بعض
// لـ«قياس بدون Real» و«إيقاف PO» على AXON. السيرفر هو اللى بيطبّق العدد فى سحب الطابور
// (/api/exec-queue/claim)، فالتغيير بيمشى من المهمة الجاية من غير ريفريش لجهاز التنفيذ.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ExecLanes {
  noreal: number;
  stop: number;
  defaults: { noreal: number; stop: number };
  max: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

const LANES_URL = "/api/exec-queue/lanes";

export function ExecLanesSettingsButton() {
  const [open, setOpen] = useState(false);
  const [noreal, setNoreal] = useState("");
  const [stop, setStop] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<ExecLanes>({
    queryKey: [LANES_URL],
    queryFn: async () => {
      const r = await fetch(LANES_URL, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    enabled: open,
  });
  useEffect(() => {
    if (open && data) { setNoreal(String(data.noreal)); setStop(String(data.stop)); }
  }, [open, data]);

  const max = data?.max ?? 8;
  const valid = (v: string) => /^\d+$/.test(v) && +v >= 1 && +v <= max;
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(LANES_URL, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noreal: +noreal, stop: +stop }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `خطأ ${r.status}`);
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LANES_URL] });
      toast({ title: "اتحفظ ✓", description: "العدد الجديد بيتطبّق من المهمة الجاية." });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "ماتحفظش", description: e.message, variant: "destructive" }),
  });

  const row = (label: string, hint: string, v: string, set: (s: string) => void, def?: number, id?: string) => (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" inputMode="numeric" min={1} max={max} value={v}
          onChange={(e) => set(e.target.value)} className="w-24 text-center"
          aria-invalid={!valid(v)} />
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
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>عدد تابات جهاز التنفيذ</DialogTitle>
            <DialogDescription>
              عدد صفحات AXON اللى بتتفتح مع بعض. النوعين مابيشتغلوش مع بعض فى نفس الوقت —
              كل نوع ياخد تاباته وهو لوحده، وأى نوع تانى (قياس Real، رفع سرعة) تاب واحد دايماً.
            </DialogDescription>
          </DialogHeader>
          {isLoading || !data ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {row("قياس بدون Real", "بيقرا History — مش real-time.", noreal, setNoreal, data.defaults.noreal, "lanes-noreal")}
              {row("إيقاف PO", "Stop Nightly PO. لو حصلت مشاكل جلسة على AXON رجّعه 1.", stop, setStop, data.defaults.stop, "lanes-stop")}
              {data.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  آخر تعديل: {String(data.updatedAt).slice(0, 16).replace("T", " ")}{data.updatedBy ? ` — ${data.updatedBy}` : ""}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={!data || !valid(noreal) || !valid(stop) || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin ml-1" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
