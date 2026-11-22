// زر «موافقة تغيير بورت» لسطر فى تقرير التركيبات (المالك ٢٠٢٦-١١-١١: «أسفل زر إلغاء الاسناد زر لموافقة تغيير البورت»).
// نفس اللى فى «بحث برقم التليفون» بالظبط: سوبر أدمن بس، وبيعدّى على طابور جهاز التنفيذ (wfmaccept) لو شغّال،
// وإلا بيفتح WFM فى تاب. النتيجة بتتجاب بعد الضغط بس (مش لكل سطر فى التقرير).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@shared/schema";
import { dispatchSpeedTool, openOpSite, WFM_ACCEPT_AR } from "@/lib/exec-queue";

export function WfmAcceptButton({ phone }: { phone: string | null | undefined }) {
  const { user } = useAuth();
  const isSuper = user?.role === ROLES.SUPER_ADMIN;
  const sid = String(phone || "").replace(/\D/g, "").replace(/^88/, "");
  const [sent, setSent] = useState(false);
  const { data: last } = useQuery<{ data: { result: string; workId: string | null; reportedAt: string } | null }>({
    queryKey: ["/api/wfm-tasks/accept-last", sid],
    queryFn: async () => {
      const r = await fetch(`/api/wfm-tasks/accept-last?phone=${encodeURIComponent(sid)}`, { credentials: "include" });
      return r.ok ? r.json() : { data: null };
    },
    enabled: isSuper && sent && !!sid,
    refetchInterval: sent ? 30_000 : false,
  });
  if (!isSuper || !sid) return null;

  const run = async () => {
    if (!confirm(`موافقة تغيير بورت للرقم ${sid} على WFM؟\nالسكربت هيعمل Accept ثم Start ثم Change Port على مهمة الشئون الخارجية.`)) return;
    setSent(true);
    if (await dispatchSpeedTool("wfmaccept", [sid], isSuper)) return;
    openOpSite("wfmaccept", sid);
  };

  return (
    <>
      <button
        type="button"
        onClick={run}
        className="inline-flex items-center gap-1 rounded border border-emerald-300 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
        title="موافقة الشئون الخارجية على تغيير البورت فى WFM: Accept ← Start ← Update Work Status (Success / Change Port)"
        data-testid="button-wfm-accept-row"
      >
        <CheckCircle2 className="w-3 h-3" /> موافقة تغيير بورت
      </button>
      {sent && last?.data && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {WFM_ACCEPT_AR[last.data.result] || last.data.result}
          {last.data.workId ? ` · Work Id ${last.data.workId}` : ""}
          {` · ${String(last.data.reportedAt || "").replace("T", " ").slice(11, 16)}`}
        </span>
      )}
    </>
  );
}
