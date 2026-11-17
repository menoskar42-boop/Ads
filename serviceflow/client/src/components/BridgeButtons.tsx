// زرارين جسر Tampermonkey جنب «جهاز التنفيذ» (سوبر أدمن) — المالك ٢٠٢٦-١٠-٢٩: «زرار فى Service Flow فى متصفح كروم
// اللى على نفس الجهاز أفتح بيه مايكروسوفت إيدج وممكن يقفله… اقفل يوقف الجسر ويوقف القياس».
//   • «افتح الجسر»: بيشيل علامة القفل من السيرفر، وبيفتح Edge على جوجل (رابط microsoft-edge: اللى Windows عامله
//     لـEdge — Chrome بيسأل أول مرة «Open Microsoft Edge?»). الجسر بيبدأ لوحده أول ما جوجل يفتح.
//   • «اقفل الجسر»: علامة قفل فى السيرفر + الخطوط اللى بتتقاس ترجع للطابور. الجسر بيعرف فى خلال ١٠ ثوانى:
//     تابات القياس بتاعته وتاب جوجل بيقفلوا نفسهم. مش زى زرار الإعدادات — الشغل المؤجّل مابيروحش لجهاز التنفيذ.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ROLES } from "@shared/schema";

const STATE_URL = "/api/exec-queue/bridge/state";
const EDGE_URL = "microsoft-edge:https://www.google.com.eg/";

type BridgeState = { stopped: boolean; enabled: boolean; seenSec: number | null; device: string | null };

export function BridgeButtons() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"" | "go" | "stop">("");
  const isSuper = user?.role === ROLES.SUPER_ADMIN;
  const { data } = useQuery<BridgeState>({
    queryKey: [STATE_URL],
    queryFn: async () => {
      const r = await fetch(STATE_URL, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    enabled: isSuper,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!isSuper) return null;

  const post = async (path: string) => {
    const r = await fetch(path, { method: "POST", credentials: "include" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || `خطأ ${r.status}`);
    return j;
  };

  const open = async () => {
    setBusy("go");
    try {
      await post("/api/exec-queue/bridge/go");
      qc.invalidateQueries({ queryKey: [STATE_URL] });
      window.location.assign(EDGE_URL);
      toast({ title: "بيفتح Edge…", description: "لو Chrome سألك «Open Microsoft Edge?» علّم Always allow ودوس Open. الجسر بيبدأ أول ما جوجل يفتح." });
    } catch (e: any) {
      toast({ title: "ماتفتحش", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const stop = async () => {
    if (!confirm("تقفل الجسر؟ القياس اللى شغّال هيقف وخطوطه ترجع للطابور، وتابات القياس وجوجل فى Edge هيقفلوا. الشغل المؤجّل هيستنى لحد «افتح الجسر» (مش هيروح لجهاز التنفيذ).")) return;
    setBusy("stop");
    try {
      const j = await post("/api/exec-queue/bridge/stop");
      qc.invalidateQueries({ queryKey: [STATE_URL] });
      toast({ title: "اتقفل الجسر", description: `${j.requeued ?? 0} خط كان بيتقاس رجع للطابور. Edge هيقفل تابات القياس وجوجل فى خلال ١٠ ثوانى.` });
    } catch (e: any) {
      toast({ title: "ماتقفلش", description: e.message, variant: "destructive" });
    } finally { setBusy(""); }
  };

  const stopped = !!data?.stopped;
  const alive = !stopped && data?.seenSec != null && data.seenSec < 90;
  const title = !data ? "جسر Tampermonkey"
    : !data.enabled ? "زرار «جسر Tampermonkey» فى رفع الملفات ← إعدادات مقفول — الجسر مش هياخد شغل حتى لو اتفتح"
    : stopped ? "الجسر مقفول — «افتح الجسر» بيفتح Edge والجسر يكمّل"
    : data.seenSec == null ? "الجسر ماكلّمش السيرفر من آخر تشغيل له"
    : `آخر مرة الجسر كلّم السيرفر: من ${data.seenSec < 90 ? `${data.seenSec} ثانية` : `${Math.round(data.seenSec / 60)} دقيقة`}${data.device ? ` (${data.device})` : ""}`;

  return (
    <div className="flex items-center gap-1" title={title}>
      <Button variant="outline" size="sm" onClick={open} disabled={busy !== ""}
        className={`gap-1 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${alive ? "border-emerald-500 text-emerald-700 bg-emerald-50" : "border-emerald-300 text-emerald-700"}`}>
        {busy === "go" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {alive ? "الجسر شغّال" : "افتح الجسر"}
      </Button>
      <Button variant="outline" size="sm" onClick={stop} disabled={busy !== "" || stopped}
        className="gap-1 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 border-red-300 text-red-700">
        {busy === "stop" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
        {stopped ? "الجسر مقفول" : "اقفل الجسر"}
      </Button>
    </div>
  );
}
