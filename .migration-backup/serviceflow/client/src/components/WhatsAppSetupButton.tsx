import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, RefreshCw } from "lucide-react";

// شاشة «واتساب» للسوبر أدمن (قرار المالك ٢٠٢٦-١٠-٠٥): حالة الأرضى 088 2650500 واسم العرض
// والقوالب الأربعة عند Meta، وتسجيل الرقم على الـAPI بـPIN (٦ أرقام) — الـPIN بيروح لـMeta
// على طول من السيرفر، ومابيتخزّنش ولا بيظهر تانى.

const STATUS_AR: Record<string, string> = {
  CONNECTED: "متصل — جاهز للإرسال", PENDING: "معلّق — محتاج تسجيل بالـPIN", DISCONNECTED: "مفصول",
  FLAGGED: "عليه تحذير جودة", RESTRICTED: "مقيّد", BANNED: "محظور", MIGRATED: "متنقل",
  APPROVED: "معتمد", REJECTED: "مرفوض", PENDING_REVIEW: "قيد المراجعة", IN_REVIEW: "قيد المراجعة",
  AVAILABLE_WITHOUT_REVIEW: "متاح", DECLINED: "مرفوض", NONE: "—", VERIFIED: "متأكد", NOT_VERIFIED: "مش متأكد",
  PAUSED: "متوقف مؤقتاً", DISABLED: "متعطّل", GREEN: "عالية", YELLOW: "متوسطة", RED: "منخفضة", UNKNOWN: "—",
};
const ar = (v: unknown) => (v == null || v === "" ? "—" : STATUS_AR[String(v)] ?? String(v));
// القالب PENDING = «قيد المراجعة» عند Meta — مش «معلّق محتاج PIN» زى الرقم
const TEMPLATE_AR: Record<string, string> = { PENDING: "قيد المراجعة عند Meta", APPROVED: "معتمد", REJECTED: "مرفوض", PAUSED: "متوقف مؤقتاً", DISABLED: "متعطّل" };
const arTemplate = (v: unknown) => TEMPLATE_AR[String(v ?? "")] ?? ar(v);
// مراجعة حساب واتساب عند Meta + توثيق النشاط (WABA)
const REVIEW_AR: Record<string, string> = { PENDING: "قيد المراجعة عند Meta", APPROVED: "معتمد", REJECTED: "مرفوض" };
const VERIFY_AR: Record<string, string> = { not_verified: "مش متوثّق (مسموح بحد 250 عميل/يوم)", verified: "متوثّق", pending: "قيد التوثيق", failed: "التوثيق اترفض" };
const tone = (v: unknown) => {
  const s = String(v ?? "");
  return /CONNECTED|APPROVED|VERIFIED|GREEN|AVAILABLE/.test(s) && !/NOT_VERIFIED/.test(s) ? "text-emerald-700"
    : /REJECTED|DECLINED|BANNED|RESTRICTED|DISABLED|RED|DISCONNECTED/.test(s) ? "text-red-700" : "text-amber-700";
};

export function WhatsAppSetupButton() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [registering, setRegistering] = useState(false);
  const q = useQuery<any>({
    queryKey: ["/api/whatsapp/status"],
    queryFn: async () => {
      const r = await fetch("/api/whatsapp/status", { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "تعذّر التحميل");
      return j;
    },
    enabled: open,
    refetchOnMount: "always",
  });
  const d = q.data;
  const ph = d?.phone;
  const register = async () => {
    setRegistering(true);
    try {
      const r = await fetch("/api/whatsapp/register", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "تعذّر التسجيل");
      setPin("");
      alert("الرقم اتسجّل ✓ — احتفظ بالـPIN فى مكان آمن (بيتطلب لو الرقم اتنقل).");
      void q.refetch();
    } catch (e: any) {
      alert(e?.message || "تعذّر التسجيل");
    } finally { setRegistering(false); }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1 text-emerald-700 border-emerald-300" data-testid="button-whatsapp-setup">
        <MessageCircle className="w-4 h-4" /> <span className="hidden sm:inline">واتساب</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="text-right">واتساب — رسايل متابعة الأعطال</DialogTitle></DialogHeader>
          {q.isLoading && <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div>}
          {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}
          {d && !d.configured && (
            <p className="text-sm text-amber-800 bg-amber-50 rounded p-2">
              أسرار واتساب مش موجودة فى Replit (WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID) — أو اتحطّت ولسه ماعملتش Republish.
            </p>
          )}
          {d?.configured && (
            <div className="space-y-3 text-sm">
              <div className="rounded border p-2 space-y-1">
                <div>الرقم: <b dir="ltr">{ph?.display_phone_number ?? "—"}</b></div>
                <div>الحالة: <b className={tone(ph?.status)}>{ar(ph?.status)}</b></div>
                <div>اسم العرض: <b>{ph?.verified_name ?? "—"}</b> — <span className={tone(ph?.name_status)}>{ar(ph?.name_status)}</span></div>
                <div>التأكيد بالمكالمة: <span className={tone(ph?.code_verification_status)}>{ar(ph?.code_verification_status)}</span></div>
                <div>الجودة: <span className={tone(ph?.quality_rating)}>{ar(ph?.quality_rating)}</span></div>
                {d.waba?.account_review_status && (
                  <div data-testid="text-whatsapp-account-review">مراجعة الحساب: <span className={d.waba.account_review_status === "APPROVED" ? "text-green-700" : d.waba.account_review_status === "REJECTED" ? "text-red-700" : "text-amber-700"}>
                    {REVIEW_AR[d.waba.account_review_status] ?? d.waba.account_review_status}</span></div>
                )}
                {d.waba?.business_verification_status && (
                  <div>توثيق النشاط: <span className="text-muted-foreground">{VERIFY_AR[d.waba.business_verification_status] ?? d.waba.business_verification_status}</span></div>
                )}
              </div>
              {d.waba?.account_review_status === "PENDING" && (
                <p className="text-xs text-amber-800 bg-amber-50 rounded p-2" data-testid="text-whatsapp-review-pending">
                  Meta لسه بتراجع الحساب — التسجيل بالـPIN هيترفض بـ«Unverified WABA» لحد ما المراجعة تخلص
                  (عادةً خلال ٢٤ ساعة، وMeta بتقول لحد يومين شغل؛ لو عدّى ٧ أيام يتفتح طلب دعم). اضغط «تحديث» بعدين.
                </p>
              )}

              {ph && ph.status !== "CONNECTED" && (
                <div className="rounded border border-emerald-300 bg-emerald-50/50 p-2 space-y-2">
                  <p className="font-semibold">تسجيل الرقم على الـAPI</p>
                  <p className="text-xs text-muted-foreground">
                    اختار PIN من ٦ أرقام واحفظه عندك (بيتطلب لو الرقم اتنقل بعدين). بيتبعت لـMeta على طول
                    ومابيتخزّنش فى الموقع.
                  </p>
                  <div className="flex gap-2">
                    <Input type="password" inputMode="numeric" autoComplete="one-time-code" name="wa-register-pin" maxLength={6} value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="PIN ٦ أرقام" className="w-40 text-center tracking-widest" dir="ltr"
                      data-testid="input-whatsapp-pin" />
                    <Button onClick={register} disabled={registering || pin.length !== 6} data-testid="button-whatsapp-register">
                      {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : null} تسجيل الرقم
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded border p-2">
                <p className="font-semibold mb-1">القوالب</p>
                {(d.templates ?? []).length === 0 ? <p className="text-xs text-muted-foreground">{d.hasWaba ? "مفيش قوالب ظاهرة." : "WHATSAPP_WABA_ID ناقص فى Replit."}</p> : (
                  <ul className="space-y-1 text-xs">
                    {d.templates.map((t: any) => (
                      <li key={t.name + t.language} className="flex justify-between gap-2">
                        <span dir="ltr" className="font-mono">{t.name}</span>
                        <span className={tone(t.status)}>{arTemplate(t.status)}{t.rejected_reason && t.rejected_reason !== "NONE" ? ` — ${t.rejected_reason}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(d.errors ?? []).map((e: string, i: number) => <p key={i} className="text-xs text-red-600">{e}</p>)}
              <p className="text-xs text-muted-foreground">
                زرار الواتساب الأخضر جنب محمول العميل بيبعت بالقالب المناسب لوحده، وبيشتغل لما الرقم يبقى «متصل» والقوالب «معتمد».
              </p>
              <Button variant="outline" size="sm" onClick={() => q.refetch()} className="gap-1"><RefreshCw className="w-4 h-4" /> تحديث</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
