// «جلب الموبايل من WFM» (المالك ٢٠٢٦-١٠-١١) — سوبر أدمن بس.
//   • زرار فى «الأعطال الحالية» بيبعت الخطوط اللى مالهاش موبايل لطابور جهاز التنفيذ: السكربت
//     المدموج بيفتح WFM ← Work Order ← Service Id ← Search ← أمر الشغل ← «Cust. Mobile».
//   • «رقم الموبايل» بيتسجّل فى خانة الموبايل نفسها (line_mobiles).
//   • «تليفون بديل» لو مختلف مابيظهرش فى خانة الموبايل — بيظهر بزرار «بديل» جنبها.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Smartphone, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dispatchSpeedTool, openOpSite, WFM_MOBILE_AR } from "@/lib/exec-queue";
import { phoneLookupKey, dialMobile } from "@/lib/mobile-lookup";

export interface WfmMobileLast {
  phone: string;
  result: string;
  mobile: string | null;
  altMobile: string | null;
  message: string | null;
  reportedAt: string | null;
}

// محاولة رجعت «مفيش موبايل» أو «مش موجود» من أقل من يوم مابتتكرّرش من الزرار الجماعى
// (WFM هيرد نفس الرد). «فشل» تقنى بيتعاد عادى.
export const WFM_MOBILE_RETRY_MS = 24 * 60 * 60 * 1000;
export function skipWfmMobileRetry(last: WfmMobileLast | undefined, now = Date.now()): boolean {
  if (!last || (last.result !== "no_mobile" && last.result !== "not_found")) return false;
  const at = last.reportedAt ? new Date(last.reportedAt).getTime() : 0;
  return !!at && now - at < WFM_MOBILE_RETRY_MS;
}

/** آخر نتيجة جلب لكل رقم (مفتاح = الرقم القصير) — للسوبر أدمن بس. */
export function useWfmMobileLast(phones: Array<string | null | undefined>, enabled: boolean): Record<string, WfmMobileLast> {
  const key = useMemo(
    () => Array.from(new Set(phones.map(phoneLookupKey).filter(Boolean))).sort().join("|"),
    [phones],
  );
  const { data } = useQuery({
    queryKey: ["/api/wfm-mobile/last", key],
    enabled: enabled && Boolean(key),
    queryFn: async () => {
      const r = await fetch("/api/wfm-mobile/last", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: key.split("|") }),
      });
      if (!r.ok) return {};
      return ((await r.json()).data ?? {}) as Record<string, WfmMobileLast>;
    },
  });
  return data ?? {};
}

/** زرار «جلب الموبايل من WFM» — بيبعت الأرقام اللى مالهاش موبايل لطابور جهاز التنفيذ. */
export function FetchWfmMobilesButton({ phones, skipped }: { phones: string[]; skipped: number }) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const n = phones.length;
  const run = async () => {
    if (!n || busy) return;
    const extra = skipped ? `\n(${skipped} رقم اتجرّبوا خلال آخر يوم وWFM قال مفيش موبايل — مش هيتكرّروا)` : "";
    if (!confirm(`جلب رقم الموبايل من WFM لـ ${n} خط مالوش موبايل؟${extra}\n\nكل رقم: Work Order ← Service Id ← Cust. Mobile على جهاز التنفيذ.`)) return;
    setBusy(true);
    try {
      if (await dispatchSpeedTool("wfmmobile", phones, true)) {
        // النتايج بتوصل رقم-رقم — نحدّث الخانة كل شوية لحد ما الطابور يخلص
        [30, 90, 180, 360].forEach((s) => setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["/api/phone-lines/mobile-lookup"] });
          qc.invalidateQueries({ queryKey: ["/api/wfm-mobile/last"] });
        }, s * 1000));
        return;
      }
      // مفيش جهاز تنفيذ: رقم واحد يتفتح هنا، أكتر من كده لازم الطابور (رقم-رقم فى نفس التاب)
      if (n === 1) openOpSite("wfmmobile", phones[0]);
      else alert("فعّل «جهاز التنفيذ» الأول — جلب الموبايل لكذا رقم بيتنفّذ رقم-رقم من الطابور.");
    } finally { setBusy(false); }
  };
  return (
    <Button
      variant="outline" size="sm" onClick={run} disabled={!n || busy}
      className="gap-1 text-indigo-700 border-indigo-200"
      title="الخطوط المعروضة اللى مالهاش رقم موبايل — يجيب «رقم الموبايل» و«تليفون بديل» من WFM (Cust. Mobile)"
      data-testid="button-fetch-wfm-mobiles"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
      جلب الموبايل من WFM ({n})
    </Button>
  );
}

const sameNumber = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && dialMobile(a).replace(/^0+/, "") === dialMobile(b).replace(/^0+/, "");

/** زرار «بديل»: التليفون البديل من WFM — مش فى خانة الموبايل، بيبان لما تضغط. */
export function AltMobileButton({ alt, mobile }: { alt: string | null | undefined; mobile: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!alt || sameNumber(alt, mobile)) return null;
  const dial = dialMobile(alt);
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 hover:bg-indigo-50"
        title="تليفون بديل (من WFM — Cust. Mobile)"
        aria-expanded={open}
        data-testid="button-alt-mobile"
      >
        بديل
      </button>
      {open && (
        <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5" dir="ltr">
          <span className="font-mono text-xs">{alt}</span>
          <a href={`tel:${dial}`} className="text-emerald-600" title={`اتصال بالتليفون البديل: ${dial}`} aria-label={`اتصال بالتليفون البديل: ${dial}`}>
            <Phone className="h-3.5 w-3.5" />
          </a>
        </span>
      )}
    </span>
  );
}

/** سطر صغير تحت خانة فاضية: آخر محاولة جلب ماجابتش رقم (عشان مايتجرّبش على الفاضى). */
export function WfmMobileMiss({ last }: { last: WfmMobileLast | undefined }) {
  if (!last || last.result === "done") return null;
  return (
    <span className="block text-[10px] text-muted-foreground" title={last.message || undefined}>
      WFM: {WFM_MOBILE_AR[last.result] || last.result}
    </span>
  );
}
