// «جهاز التنفيذ المسجّل» جوّه «إعدادات التنفيذ والتحديث» (المالك ٢٠٢٦-١١-١٩): سجّل بصمة المتصفح ده كجهاز التنفيذ،
// وجهاز التنفيذ بيشتغل عليه لوحده أول ما Service Flow يفتح — إلا لو «يشتغل لوحده» اتقفل هنا.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { execDeviceLabel } from "@/lib/exec-queue";
import { browserFingerprint, EXEC_DEVICE_URL, type ExecDevice } from "@/lib/exec-device";

export function ExecDeviceSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mine, setMine] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { browserFingerprint().then(setMine).catch(() => setMine("")); }, []);
  const { data, isLoading } = useQuery<ExecDevice>({
    queryKey: [EXEC_DEVICE_URL],
    queryFn: async () => {
      const r = await fetch(EXEC_DEVICE_URL, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
  });

  const send = async (method: "POST" | "PUT", body: unknown, ok: string) => {
    setBusy(true);
    try {
      const r = await fetch(EXEC_DEVICE_URL, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `خطأ ${r.status}`);
      qc.setQueryData([EXEC_DEVICE_URL], j);
      toast({ title: ok });
    } catch (e: any) {
      toast({ title: "ماتحفظش", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const isThis = !!data?.fp && data.fp === mine;
  return (
    <div className="space-y-2 pb-3 border-b" data-testid="exec-device-section">
      <div className="text-sm font-medium">جهاز التنفيذ المسجّل</div>
      {isLoading || !data ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {data.fp
              ? <>المسجّل: <b>{data.label || "متصفح"}</b>{isThis ? " — ✓ المتصفح ده" : " — مش المتصفح ده"}</>
              : "مفيش جهاز مسجّل — جهاز التنفيذ بيشتغل بالزرار بس."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!isThis && (
              <Button type="button" size="sm" variant="outline" disabled={busy || !mine}
                onClick={() => send("POST", { fp: mine, label: execDeviceLabel() }, "اتسجّل المتصفح ده كجهاز التنفيذ")}>
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />} سجّل المتصفح ده
              </Button>
            )}
            {data.fp && (
              <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => send("PUT", { unregister: true }, "اتشال التسجيل")}>
                شيل التسجيل
              </Button>
            )}
          </div>
          {data.fp && (
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>
                يشتغل لوحده أول ما Service Flow يفتح على الجهاز المسجّل
                <span className="block text-xs text-muted-foreground">من غير ما تدوس «جهاز التنفيذ». لو قفلته بالزرار بيرجع يشتغل مع أول فتح للصفحة.</span>
              </span>
              <Switch checked={data.autoStart} disabled={busy}
                onCheckedChange={(v) => send("PUT", { autoStart: v }, v ? "هيشتغل لوحده" : "مش هيشتغل لوحده — بالزرار بس")} />
            </label>
          )}
        </>
      )}
    </div>
  );
}
