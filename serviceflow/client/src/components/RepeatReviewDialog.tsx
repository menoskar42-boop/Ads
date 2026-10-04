import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, Lock, ExternalLink, RefreshCw, ClipboardCheck } from "lucide-react";
import { LineDataCorrection } from "@/components/LineDataCorrection";
import { MobileValue } from "@/lib/mobile-lookup";

// «رد التكرار» (قرار المالك ٢٠٢٦-١٠-٠٤) — رد واحد للخط فى الشهر، خطوات بالترتيب وكل خطوة
// بتتحفظ لوحدها: ١ بيان الخط ← ٢ فحص البكس ← ٣ الإفادات ← ٤ التقييم ← حفظ نهائى.
// السيرفر (server/repeat-reviews.ts) هو اللى بيفرض الترتيب والصلاحية — الشاشة بتعرض بس.

export const REPEAT_STEP_LABELS = ["لم يُرد", "البيان اتأكد", "الفحص اتربط", "الإفادات اتكتبت", "التقييم اتكتب"];

interface OneResp {
  canEdit: boolean;
  review: any | null;
  step: number;
  firstComplaintDate: string | null;
  line: { central: string | null; cabinNumber: string | null; boxNumber: string | null; dpTerminal: string | null;
          techName: string | null; subName: string | null; subAdd: string | null; mobile: string | null } | null;
  box: { central: string; cabinet: string; box: string; boxId: number | null };
  inspection: { id: number; date: string; by: string | null; badItems: number; valid: boolean; viewUrl: string } | null;
}
interface FaultOptions { techs: string[]; maintenance: string[]; splice: string[] }

const fmtAt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "");

// برّه الكومبوننت — لو اتعرّف جوّه، كل حرف بيتكتب بيعيد بناءه فالكتابة بتفقد التركيز
const Section = ({ n, title, done, locked, children }: { n: number; title: string; done: boolean; locked: boolean; children: ReactNode }) => (
  <section className={`rounded-lg border p-3 space-y-2 ${locked ? "opacity-60 bg-muted/30" : done ? "border-green-300 bg-green-50/40" : "border-purple-300"}`}>
    <h3 className="font-bold text-sm flex items-center gap-2">
      {done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : locked ? <Lock className="w-4 h-4 text-muted-foreground" /> : <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs grid place-items-center">{n}</span>}
      {title}
    </h3>
    {locked ? <p className="text-xs text-muted-foreground">كمّل الخطوة اللى قبلها الأول.</p> : children}
  </section>
);
const by = (name: string | null | undefined, at: string | null | undefined) =>
  name || at ? <p className="text-[11px] text-muted-foreground">{[name, fmtAt(at)].filter(Boolean).join(" · ")}</p> : null;


export function RepeatReviewDialog({ phone, month, open, onOpenChange, onChanged }: {
  phone: string; month: string; open: boolean; onOpenChange: (v: boolean) => void; onChanged?: () => void;
}) {
  const q = useQuery<OneResp>({
    queryKey: ["/api/repeat-reviews/one", phone, month],
    queryFn: async () => {
      const r = await fetch(`/api/repeat-reviews/one?phone=${encodeURIComponent(phone)}&month=${month}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "تعذّر التحميل");
      return j;
    },
    enabled: open,
    refetchOnMount: "always",
  });
  const d = q.data;
  const rv = d?.review;
  const canEdit = !!d?.canEdit;
  const step = d?.step ?? 0;

  const opts = useQuery<FaultOptions>({
    queryKey: ["/api/repeat-reviews/at-fault-options"],
    queryFn: async () => (await fetch("/api/repeat-reviews/at-fault-options", { credentials: "include" })).json(),
    enabled: open && canEdit,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [customer, setCustomer] = useState<string | null>(null);
  const [tech, setTech] = useState<string | null>(null);
  const [cause, setCause] = useState<string | null>(null);
  const [hasFault, setHasFault] = useState<boolean | null>(null);
  const [faultName, setFaultName] = useState<string | null>(null);
  // القيم المكتوبة: لو المستخدم لسه ماغيّرش حاجة بنعرض المحفوظ
  const vCustomer = customer ?? rv?.customer_statement ?? "";
  const vTech = tech ?? rv?.tech_statement ?? "";
  const vCause = cause ?? rv?.cause ?? "";
  const vHasFault = hasFault ?? (rv?.has_fault ?? null);
  const vFaultName = faultName ?? rv?.at_fault_name ?? "";

  const send = async (stepName: string, body: Record<string, unknown> = {}) => {
    setBusy(stepName);
    try {
      const r = await fetch("/api/repeat-reviews/step", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, month, step: stepName, ...body }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(j?.message || "تعذّر الحفظ"); return false; }
      await q.refetch();
      onChanged?.();
      return true;
    } finally { setBusy(null); }
  };

  const openInspection = async () => {
    setBusy("box-link");
    try {
      const r = await fetch("/api/repeat-reviews/box-link", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, month }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(j?.message || "تعذّر فتح الفحص"); return; }
      window.open(j.createUrl, "_blank", "noopener");
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-base">
            رد التكرار — {phone} — شهر {month}
            {rv?.status === "done" && <span className="mr-2 text-xs rounded bg-green-100 text-green-800 px-2 py-0.5">مكتمل</span>}
            {!canEdit && d && <span className="mr-2 text-xs rounded bg-slate-100 text-slate-700 px-2 py-0.5">عرض فقط</span>}
          </DialogTitle>
        </DialogHeader>
        {q.isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-purple-600" /></div>}
        {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}
        {d && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs bg-muted/40 rounded p-2">
              <span>العميل: <b>{d.line?.subName || "—"}</b></span>
              <span className="inline-flex items-center gap-1">الموبايل: <MobileValue mobile={d.line?.mobile} phone={phone} /></span>
              <span>فنى الخط: <b>{d.line?.techName || "—"}</b></span>
              <span>أول شكوى فى التكرار: <b dir="ltr">{d.firstComplaintDate || "—"}</b></span>
            </div>

            <Section n={1} title="تأكيد بيان الخط" done={!!rv?.line_status} locked={false}>
              <div className="text-xs grid grid-cols-2 gap-1">
                <span>السنترال: <b>{d.line?.central || "—"}</b></span>
                <span>الكابينة: <b>{d.line?.cabinNumber || "—"}</b></span>
                <span>البكس: <b>{d.line?.boxNumber || "—"}</b></span>
                <span>الترمنال: <b>{d.line?.dpTerminal || "—"}</b></span>
              </div>
              {rv?.line_status && (
                <p className="text-xs text-green-700">{rv.line_status === "corrected" ? "✓ البيان اتصحّح (وصل لمسئول البيانات)" : "✓ البيان اتأكد"}</p>
              )}
              {by(rv?.line_checked_by, rv?.line_checked_at)}
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!!busy} onClick={() => send("line", { status: "confirmed" })} data-testid="button-repeat-line-ok">
                    {busy === "line" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} البيان صح
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setCorrecting((v) => !v)}>تصحيح البيان</Button>
                </div>
              )}
              {canEdit && correcting && (
                <div className="border rounded p-2 bg-white">
                  <LineDataCorrection compact initialPhone={phone}
                    initialCentral={d.line?.central} initialCabin={d.line?.cabinNumber}
                    initialBox={d.line?.boxNumber} initialTerminal={d.line?.dpTerminal}
                    onSent={async () => { setCorrecting(false); await send("line", { status: "corrected" }); }} />
                </div>
              )}
            </Section>

            <Section n={2} title="فحص البكس" done={!!rv?.inspection_id} locked={!rv?.line_status}>
              <p className="text-xs">البكس: <b>{d.box.central} — كابينة {d.box.cabinet} — بكس {d.box.box}</b></p>
              {d.inspection ? (
                <div className={`text-xs rounded p-2 ${d.inspection.valid ? "bg-green-50" : "bg-amber-50"}`}>
                  آخر فحص: <b dir="ltr">{d.inspection.date}</b>{d.inspection.by ? ` — ${d.inspection.by}` : ""} — بنود محتاجة شغل: <b>{d.inspection.badItems}</b>
                  {!d.inspection.valid && <div className="text-amber-800 font-semibold mt-1">الفحص ده قبل أول شكوى فى التكرار — لازم إعادة فحص.</div>}
                  <a href={d.inspection.viewUrl} target="_blank" rel="noopener" className="mr-2 inline-flex items-center gap-1 text-blue-700 underline">
                    <ExternalLink className="w-3 h-3" /> عرض / تعديل الفحص
                  </a>
                </div>
              ) : <p className="text-xs text-amber-800">البكس ده مش مفحوص.</p>}
              {rv?.inspection_id && <p className="text-xs text-green-700">✓ مربوط بالفحص بتاريخ {rv.inspection_date ? String(rv.inspection_date).slice(0, 10) : ""}</p>}
              {by(rv?.inspection_linked_by, rv?.inspection_linked_at)}
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={openInspection} className="gap-1">
                    {busy === "box-link" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                    {d.inspection ? "إعادة فحص" : "افحص البكس"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => q.refetch()} className="gap-1">
                    <RefreshCw className="w-4 h-4" /> تحديث بعد الفحص
                  </Button>
                  <Button size="sm" disabled={!!busy || !d.inspection?.valid} onClick={() => send("inspection")}>
                    {busy === "inspection" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} اعتماد الفحص
                  </Button>
                </div>
              )}
            </Section>

            <Section n={3} title="الإفادات" done={!!(rv?.customer_statement && rv?.tech_statement)} locked={!rv?.inspection_id}>
              <label className="text-xs font-medium">إفادة العميل عن الخط المكرر</label>
              <Textarea value={vCustomer} onChange={(e) => setCustomer(e.target.value)} disabled={!canEdit} rows={2} />
              <label className="text-xs font-medium">إفادة الفنى عن الخط المكرر</label>
              <Textarea value={vTech} onChange={(e) => setTech(e.target.value)} disabled={!canEdit} rows={2} />
              {by(rv?.statements_by, rv?.statements_at)}
              {canEdit && (
                <Button size="sm" disabled={!!busy || !vCustomer.trim() || !vTech.trim()}
                  onClick={async () => { if (await send("statements", { customer: vCustomer, tech: vTech })) { setCustomer(null); setTech(null); } }}>
                  {busy === "statements" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} حفظ الإفادات
                </Button>
              )}
            </Section>

            <Section n={4} title="تقييم سبب العطل" done={!!rv?.cause} locked={!(rv?.customer_statement && rv?.tech_statement)}>
              <label className="text-xs font-medium">سبب العطل</label>
              <Textarea value={vCause} onChange={(e) => setCause(e.target.value)} disabled={!canEdit} rows={2} />
              <div className="flex items-center gap-4 text-xs">
                <span className="font-medium">يوجد مقصّر؟</span>
                <label className="inline-flex items-center gap-1"><input type="radio" checked={vHasFault === true} disabled={!canEdit} onChange={() => setHasFault(true)} /> نعم</label>
                <label className="inline-flex items-center gap-1"><input type="radio" checked={vHasFault === false} disabled={!canEdit} onChange={() => { setHasFault(false); setFaultName(""); }} /> لا</label>
              </div>
              {vHasFault === true && (
                canEdit ? (
                  <select value={vFaultName} onChange={(e) => setFaultName(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm w-full" dir="rtl" data-testid="select-repeat-at-fault">
                    <option value="">اختار اسم المقصّر</option>
                    <optgroup label="الفنيين">{(opts.data?.techs ?? []).map((n) => <option key={"t" + n} value={n}>{n}</option>)}</optgroup>
                    <optgroup label="فنيين الصيانة">{(opts.data?.maintenance ?? []).map((n) => <option key={"m" + n} value={n}>{n}</option>)}</optgroup>
                    <optgroup label="اللحامين (برنامج الكوابل)">{(opts.data?.splice ?? []).map((n) => <option key={"s" + n} value={n}>{n}</option>)}</optgroup>
                  </select>
                ) : <p className="text-xs">المقصّر: <b>{rv?.at_fault_name || "—"}</b></p>
              )}
              {by(rv?.assessed_by, rv?.assessed_at)}
              {canEdit && (
                <Button size="sm" disabled={!!busy || !vCause.trim() || vHasFault === null || (vHasFault && !vFaultName)}
                  onClick={async () => {
                    if (await send("assessment", { cause: vCause, hasFault: vHasFault, atFaultName: vHasFault ? vFaultName : "" })) {
                      setCause(null); setHasFault(null); setFaultName(null);
                    }
                  }}>
                  {busy === "assessment" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} حفظ التقييم
                </Button>
              )}
            </Section>

            {rv?.status === "done" ? (
              <p className="text-sm text-green-700 font-semibold">✓ الرد مكتمل — {[rv.completed_by, fmtAt(rv.completed_at)].filter(Boolean).join(" · ")}</p>
            ) : canEdit && (
              <Button className="w-full" disabled={!!busy || step < 4} onClick={() => send("complete")} data-testid="button-repeat-complete">
                {busy === "complete" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} حفظ نهائى
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
