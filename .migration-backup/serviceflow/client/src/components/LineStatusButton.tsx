// زرار «حالة الخط» (ASSIA المرحلة ٢ — المالك ٢٠٢٦-١١-١١): بيفتح آخر تقرير اتسحب للخط بالعربى السهل للفنى، وإمتى
// اتسحب، وزرار «تحديث دلوقتى» بيبعت «تحديث حالة الخط (ASSIA)» لجهاز التنفيذ ويستنى التقرير الجديد يوصل.
// بيظهر فى «بحث برقم التليفون» وجنب رقم الأكونت فى «الأعطال الحالية». التوصيف نفسه: shared/line-status-ar.ts
import { useEffect, useRef, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@shared/schema";
import { dispatchSpeedTool } from "@/lib/exec-queue";
import type { LineStatusAr, Level } from "@shared/line-status-ar";

const DZS_URL = "https://10.42.187.101:8080/expresse/";
type Latest = { report: { createdAt: string; pulledBy: string | null; stability: string | null; accountNo: string | null } | null; ar?: LineStatusAr };

const LEVEL_CLS: Record<Level, string> = {
  ok: "bg-emerald-50 border-emerald-200 text-emerald-900",
  warn: "bg-amber-50 border-amber-200 text-amber-900",
  bad: "bg-red-50 border-red-200 text-red-900",
  info: "bg-slate-50 border-slate-200 text-slate-800",
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "دلوقتى";
  if (m < 60) return `من ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 48) return `من ${h} ساعة`;
  return `من ${Math.round(h / 24)} يوم`;
};
const fmt = (iso: string) => new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });

/** بيبعت «تحديث حالة الخط (ASSIA)» زى الزرار اللى فى بحث برقم التليفون (من غير Real ولا Perform XELT) */
export async function refreshLineStatus(account: string, isSuper: boolean): Promise<void> {
  if (await dispatchSpeedTool("measure", [account], isSuper, { noReal: true, loop: true })) return;
  window.open(`${DZS_URL}#sf_accounts=${encodeURIComponent(account)}&sf_mode=loop`, "dzs_measure");
}

export function LineStatusButton({ account, phone, compact = false, onRefresh }: {
  account?: string | null; phone?: string | null; compact?: boolean; onRefresh?: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const isSuper = user?.role === ROLES.SUPER_ADMIN;
  const acc = String(account ?? "").trim();
  const ph = String(phone ?? "").replace(/\D/g, "").replace(/^88/, "");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Latest | null>(null);
  const [err, setErr] = useState("");
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<number | null>(null);
  const hidden = user?.role === ROLES.SALES || user?.role === ROLES.SALES_ADMIN || (!acc && ph.length < 5);

  const load = async (): Promise<Latest | null> => {
    try {
      const q = new URLSearchParams(acc ? { account: acc } : { phone: ph });
      const r = await fetch(`/api/line-status/latest?${q}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "تعذّر التحميل");
      setData(j); setErr("");
      return j;
    } catch (e: any) { setErr(e.message); return null; }
  };
  useEffect(() => { if (open) void load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  if (hidden) return null;

  const refresh = async () => {
    if (!acc) { alert("مفيش رقم أكونت للخط ده — مايقدرش يتسحب تقرير جديد"); return; }
    const before = data?.report?.createdAt || "";
    setWaiting(true);
    try { await (onRefresh ? onRefresh() : refreshLineStatus(acc, isSuper)); } catch { /* الرسالة ظهرت من الدالة */ }
    const started = Date.now();
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      const j = await load();
      const now = j?.report?.createdAt || "";
      if ((now && now !== before) || Date.now() - started > 15 * 60000) {
        if (timer.current) window.clearInterval(timer.current);
        timer.current = null; setWaiting(false);
      }
    }, 15000);
  };

  const ar = data?.ar;
  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded border border-teal-300 px-1.5 py-0.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 whitespace-nowrap"
          title="آخر تقرير حالة الخط (ASSIA) بالعربى" data-testid="button-line-status-row">
          <Activity className="w-3 h-3" /> حالة الخط
        </button>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)} className="bg-white gap-2 text-teal-700 border-teal-300" data-testid="button-line-status">
          <Activity className="w-4 h-4" /> حالة الخط
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>حالة الخط {ph || acc}</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {data?.report ? <>آخر مرة اتسحب التقرير: <b className="text-foreground">{fmt(data.report.createdAt)}</b> ({ago(data.report.createdAt)}){data.report.pulledBy ? ` — ${data.report.pulledBy}` : ""}</>
                : data ? "لسه مااتسحبش تقرير للخط ده" : err || "جارٍ التحميل…"}
            </span>
            <Button size="sm" variant="outline" className="gap-1" onClick={refresh} disabled={waiting || !acc}>
              {waiting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {waiting ? "بيتسحب تقرير جديد… (الصفحة هتتحدّث لوحدها)" : "تحديث دلوقتى"}
            </Button>
          </div>
          {ar && (
            <div className="space-y-3">
              <div className={`rounded-md border p-3 font-bold ${LEVEL_CLS[ar.level]}`}>{ar.headline}</div>
              <ul className="space-y-2">
                {ar.items.map((it, i) => (
                  <li key={i} className={`rounded-md border p-2 text-sm ${LEVEL_CLS[it.level]}`}>
                    <b>{it.label}:</b> <span dir="auto">{it.value}</span>
                    {it.note && <div className="text-xs mt-0.5 opacity-90">{it.note}</div>}
                  </li>
                ))}
              </ul>
              <details className="rounded-md border p-2">
                <summary className="cursor-pointer text-sm font-semibold">كل القراءات بالتفصيل</summary>
                <div className="space-y-4 mt-3">
                  {ar.tables.map((t, i) => (
                    <div key={i}>
                      <div className="text-xs font-bold text-muted-foreground mb-1">{t.page}{t.title ? ` — ${t.title}` : ""}</div>
                      {t.text && <p className="text-xs mb-1" dir="auto">{t.text}</p>}
                      {t.rows.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border">
                            <tbody>
                              {t.rows.map((r, j) => (
                                <tr key={j} className="border-t">
                                  <td className="p-1 font-medium whitespace-nowrap">{r.label}{r.label !== r.original && <span className="text-muted-foreground"> ({r.original})</span>}</td>
                                  {r.values.map((v, k) => <td key={k} className="p-1 font-mono" dir="ltr">{v}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
