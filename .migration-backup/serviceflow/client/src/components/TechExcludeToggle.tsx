import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// شكوى اتقفلت من التابلت عادى ⇒ السوبر أدمن بيستبعدها من حساب أى فنى (الإغلاق والمنطقة)، وبتفضل فى نتايج الإدارة
// (المالك ٢٠٢٦-١١-٠١ — server: POST /api/complaint-exclusions). بيظهر للسوبر أدمن بس، والشارة «مستبعد» للكل.
export function TechExcludeToggle({ complainNo, excluded, canEdit, onChange }: {
  complainNo: string; excluded: boolean; canEdit: boolean; onChange: (excluded: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const toggle = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/complaint-exclusions", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complainNo, excluded: !excluded }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || `HTTP ${r.status}`);
      onChange(!excluded);
      // أرقام الإزالة والتكرار وأداء الفنيين بتتحسب تانى
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/reports") });
      toast({ title: !excluded ? "اتستبعدت من حساب الفنيين" : "رجعت لحساب الفنى", description: `شكوى ${complainNo}`, duration: 3000 });
    } catch (e: any) {
      toast({ title: "ماتحفظش", description: e?.message || "", variant: "destructive", duration: 5000 });
    } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-1">
      {excluded && (
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 whitespace-nowrap" title="اتقفلت من التابلت عادى — مش محسوبة على أى فنى، ومحسوبة فى نتايج الإدارة">
          مستبعد من الفنيين
        </span>
      )}
      {canEdit && (
        <button type="button" disabled={busy} onClick={toggle}
          className={`text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${excluded ? "border-gray-300 text-gray-600 hover:bg-gray-50" : "border-amber-400 text-amber-700 hover:bg-amber-50"}`}
          title={excluded ? "رجّعها تتحسب على الفنى" : "اتقفلت من التابلت عادى — ماتتحسبش على فنى الإغلاق ولا فنى المنطقة"}
          data-testid={`button-exclude-${complainNo}`}>
          {busy ? "…" : excluded ? "إلغاء الاستبعاد" : "استبعاد من الفنى"}
        </button>
      )}
    </span>
  );
}
