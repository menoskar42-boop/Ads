// زر «إلغاء الاسناد» لسطر فى تقرير — نفس اللى فى «بحث برقم التليفون» بالظبط (المالك ٢٠٢٦-١٠-٢٦):
// نختار Cancel أو «اسناد لفنى آخر» (وكود العامل بيتبعت للسكربت أوتوماتيك)، والتنفيذ بيعدّى على
// طابور جهاز التنفيذ لو شغّال، وإلا بيفتح WFM فى تاب (dispatchSpeedTool ← openOpSite «wfmcancel»).
// فى «المعاينات الحالية» الرقم اللى بيتدوّر بيه على WFM هو المسلسل نفسه.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@shared/schema";
import { dispatchSpeedTool, openOpSite } from "@/lib/exec-queue";

/** مين يقدر يلغى الاسناد من التقرير: السوبر أدمن والأدمن والشئون الخارجية — والفنى (التقرير بيجيله أوامره هو بس). */
export function canCancelWfmFromReport(role: string | undefined): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN || role === ROLES.EXTERNAL || role === ROLES.TECH;
}

/** الرقم اللى بيتبعت لـ WFM: أرقام بس، ومن غير 88 فى أول رقم التليفون (المسلسل بيتبعت زى ما هو). */
export function wfmServiceId(raw: string | null | undefined, isSerial: boolean): string {
  const d = String(raw || "").replace(/\D/g, "");
  return isSerial ? d : d.replace(/^88/, "");
}

export function WfmCancelButton({ phone, isSerial = false, defaultTech }: { phone: string | null | undefined; isSerial?: boolean; defaultTech?: string | null }) {
  const { user } = useAuth();
  const isSuper = user?.role === ROLES.SUPER_ADMIN;
  const sid = wfmServiceId(phone, isSerial);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"cancel" | "reassign">("cancel");
  const [tech, setTech] = useState("");

  const { data: techList, isLoading, isError, refetch } = useQuery<{ workerCode: string; techName: string }[]>({
    queryKey: ["/api/technician-names"],
    queryFn: async () => {
      const r = await fetch("/api/technician-names", { credentials: "include" });
      if (!r.ok) throw new Error("تعذّر تحميل قائمة الفنيين");
      return r.json();
    },
    retry: 3, retryDelay: (n: number) => Math.min(1000 * 2 ** n, 8000),
    enabled: open, // القائمة بتتحمّل لما المودال يتفتح بس — مش لكل سطر فى التقرير
    staleTime: 5 * 60 * 1000,
  });
  const techByName = new Map((techList ?? []).map((t) => [(t.techName || "").trim(), (t.workerCode || "").trim()]));
  const techOptions = Array.from(techByName.keys()).filter(Boolean).sort((a, b) => a.localeCompare(b, "ar"));

  if (!sid || !canCancelWfmFromReport(user?.role)) return null;

  const start = () => {
    setMode("cancel");
    setTech((defaultTech || "").trim());
    setOpen(true);
  };
  const submit = async () => {
    const worker = (techByName.get(tech) || "").trim();
    if (mode === "reassign") {
      if (!tech) { alert(isError ? "قائمة الفنيين ماتحمّلتش — اضغط «إعادة المحاولة» الأول" : "اختر الفنى اللى هتتسند عليه المهمة"); return; }
      if (!worker) { alert(`الفنى «${tech}» مالوش كود عامل مسجّل — حدّثه من إدارة البيانات الفنية أولاً`); return; }
    }
    setOpen(false);
    const params = mode === "reassign" ? { mode: "reassign", worker, workerName: tech } : { mode: "cancel" };
    if (await dispatchSpeedTool("wfmcancel", [sid], isSuper, { params })) return;
    openOpSite("wfmcancel", sid, params);
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex items-center gap-1 rounded border border-rose-300 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 whitespace-nowrap"
        title={`إلغاء إسناد المهمة على WFM بـ${isSerial ? "المسلسل" : "الرقم"} ${sid}`}
        data-testid="button-wfm-cancel-row"
      >
        <Ban className="w-3 h-3" /> إلغاء الاسناد
      </button>
      {open && (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-4 space-y-3 text-sm" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Ban className="w-5 h-5 text-rose-700" /> مهمة WFM — <span dir="ltr">{sid}</span></h3>
              <button onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === "cancel"} onChange={() => setMode("cancel")} />
                إلغاء الاسناد <span className="text-xs text-muted-foreground">(Cancel مباشرةً)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={mode === "reassign"} onChange={() => setMode("reassign")} />
                اسناد لفنى آخر <span className="text-xs text-muted-foreground">(Re-assign مباشرةً)</span>
              </label>
            </div>
            {mode === "reassign" && (
              <div className="grid gap-1">
                <label className="text-muted-foreground">الفنى اللى هتتسند عليه المهمة *</label>
                <select value={tech} onChange={(e) => setTech(e.target.value)} disabled={isLoading || isError}
                  className="border rounded-md px-3 py-2 disabled:bg-muted">
                  <option value="">
                    {isLoading ? "— جارٍ تحميل قائمة الفنيين… —" : isError ? "— تعذّر تحميل القائمة —"
                      : techOptions.length === 0 ? "— مفيش فنيين مسجّلين —" : "— اختر الفنى —"}
                  </option>
                  {techOptions.map((t) => (
                    <option key={t} value={t}>{t}{techByName.get(t) ? ` (${techByName.get(t)})` : " — بدون كود عامل"}</option>
                  ))}
                </select>
                {isError && (
                  <div className="flex items-center gap-2 text-xs text-red-700">
                    <span>تعذّر تحميل قائمة الفنيين (النت أو السيرفر مشغول).</span>
                    <button type="button" onClick={() => refetch()} className="underline">إعادة المحاولة</button>
                  </div>
                )}
                {tech && <p className="text-xs">كود العامل: <b dir="ltr">{techByName.get(tech) || "غير مسجّل"}</b></p>}
              </div>
            )}
            {mode === "cancel" && (
              <p className="text-xs text-muted-foreground">
                السكربت هيضغط <b>Cancel</b> على السطر مباشرةً. ملحوظة: WFM بيرفض إلغاء مهمة حالتها
                <span dir="ltr"> Started</span> — ساعتها استخدم «اسناد لفنى آخر».
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button size="sm" onClick={submit} className="bg-rose-700 hover:bg-rose-800 gap-1">
                <Ban className="w-4 h-4" /> ابدأ على WFM
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
