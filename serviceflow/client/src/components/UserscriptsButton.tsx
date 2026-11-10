// زر «السكربتات» فى «رفع الملفات» (سوبر أدمن) — المالك ٢٠٢٦-١١-١٠: «عاوز الاسكريبتات بتاعه سيرفس فلو تتحدث كده… من الاعدادات».
// كل سكربت Tampermonkey بنسخته الحالية من المشروع وزرار «سطّب / حدّث». أول مرة بتسطّب من هنا (فوق النسخة القديمة،
// نفس الاسم ⇒ Tampermonkey بيعتبرها تحديث ومابيمسحش بياناتها)، وبعدها Tampermonkey بيحدّث لوحده لما @version يزيد.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileCode2, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ScriptRow {
  file: string;
  name: string;
  version: string;
  purpose: string;
  deprecated: string | null;
  installUrl: string | null;
}

const URL_ = "/api/userscripts";

export function UserscriptsButton() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<{ base: string; scripts: ScriptRow[] }>({
    queryKey: [URL_],
    staleTime: 0,
    refetchOnMount: "always",
    enabled: open,
    queryFn: async () => {
      const r = await fetch(URL_, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  const rotate = async () => {
    if (!confirm("مفتاح جديد ⇒ اللينكات القديمة تقف، ولازم تسطّب كل السكربتات تانى من هنا. تكمّل؟")) return;
    const r = await fetch("/api/userscripts/rotate-key", { method: "POST", credentials: "include" });
    toast({ title: r.ok ? "اتغيّر المفتاح ✓" : "ماتغيّرش", description: r.ok ? "سطّب السكربتات تانى من القايمة." : undefined });
    refetch();
  };
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setOpen(true)} data-testid="button-userscripts">
        <FileCode2 className="h-4 w-4" /> السكربتات
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto top-4 translate-y-0 sm:top-[50%] sm:-translate-y-1/2" dir="rtl">
          <DialogHeader>
            <DialogTitle>سكربتات Tampermonkey</DialogTitle>
            <DialogDescription className="text-right leading-relaxed">
              اضغط «سطّب / حدّث» لكل سكربت مرة واحدة على كل جهاز (Tampermonkey هيفتح صفحة Install أو Update فوق النسخة القديمة).
              بعد كده بيتحدّث لوحده لما تنزل نسخة جديدة — أو من Tampermonkey: Utilities ← Check for userscript updates.
            </DialogDescription>
          </DialogHeader>
          {isLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          {isError && (
            <div className="text-sm text-red-600 space-y-2">
              <p>ماقدرتش أجيب القايمة.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>حاول تانى</Button>
            </div>
          )}
          {data && (
            <div className="space-y-2">
              {data.scripts.map((s) => (
                <div key={s.file} className={`rounded-md border p-2 flex items-center gap-2 ${s.deprecated ? "bg-amber-50 border-amber-200" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" dir="auto">{s.name || s.file}</p>
                    <p className="text-xs text-muted-foreground">
                      <span dir="ltr">{s.version ? "v" + s.version : ""}</span>{s.purpose ? " · " + s.purpose : ""}
                    </p>
                    {s.deprecated && <p className="text-xs text-amber-700">قديم: {s.deprecated}</p>}
                  </div>
                  {s.installUrl && (
                    <Button asChild size="sm" className="gap-1 shrink-0">
                      <a href={s.installUrl} target="_blank" rel="noopener" data-testid={`install-${s.file}`}>
                        <ExternalLink className="h-3.5 w-3.5" /> سطّب / حدّث
                      </a>
                    </Button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">
                اللينكات فيها مفتاح سرّى (Tampermonkey مابيبعتش تسجيل الدخول). ماتبعتهاش لحد. لو اتبعتت بالغلط:
                <Button variant="ghost" size="sm" className="h-auto p-0 px-1 gap-1 underline" onClick={rotate}><RefreshCw className="h-3 w-3" /> غيّر المفتاح</Button>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
