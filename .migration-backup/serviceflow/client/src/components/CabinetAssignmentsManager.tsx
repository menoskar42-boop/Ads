import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Network, Plus, Trash2, Save, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// «توزيع الكباين» — كل فنى وكباينه (السوبر أدمن بس — المالك ٢٠٢٦-١١-٠١). سطر لكل كابينة نحاس:
// كابينة الامسان اللى عليها كابينتين نحاس = سطرين بنفس الكود. الحفظ بيسجّل تغيير الفنى بتاريخ
// (server/cabinet-assignments.ts) — والتقارير بتحسب قبل التاريخ على القديم وبعده على الجديد.
interface Row { id?: number | null; central: string; msanCode: string; cabinNumber: string; workerCode: string; _k: string }
interface Partner { id?: number | null; techCode: string; partnerCode: string; from: string; to?: string | null; note?: string | null; _k: string }
interface Tech { code: string; name: string }
interface Payload {
  rows: Omit<Row, "_k">[]; techs: Tech[]; partners: Omit<Partner, "_k">[]; today: string;
  history: { central: string; cabinNumber: string; msanCode: string | null; oldCode: string | null; newCode: string | null; date: string }[];
}

let seq = 0;
const key = () => `k${++seq}`;
const SEL = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

export function CabinetAssignmentsManager() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<Payload>({
    queryKey: ["/api/cabinet-assignments"], enabled: open, refetchOnMount: "always",
    queryFn: async () => {
      const r = await fetch("/api/cabinet-assignments", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || "فشل التحميل");
      return d;
    },
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [date, setDate] = useState("");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    setRows(data.rows.map((r) => ({ ...r, _k: key() })));
    setPartners(data.partners.map((p) => ({ ...p, _k: key() })));
    setDate(data.today);
    setDirty(false);
  }, [data]);

  const techs = data?.techs ?? [];
  const nameOf = useMemo(() => new Map(techs.map((t) => [t.code, t.name])), [techs]);
  const centrals = useMemo(() => [...new Set(rows.map((r) => r.central).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")), [rows]);
  const shown = rows.filter((r) => !q.trim() || [r.central, r.msanCode, r.cabinNumber, nameOf.get(r.workerCode) || ""].some((v) => v.includes(q.trim())));
  // ملخّص: كل فنى وعدد كباينه (النحاس)
  const perTech = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.workerCode || "", (m.get(r.workerCode || "") || 0) + 1);
    return [...m.entries()].map(([c, n]) => ({ name: c ? nameOf.get(c) || c : "من غير فنى", n })).sort((a, b) => b.n - a.n);
  }, [rows, nameOf]);

  const edit = (k: string, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r._k === k ? { ...r, ...patch } : r))); setDirty(true); };
  const editP = (k: string, patch: Partial<Partner>) => { setPartners((ps) => ps.map((p) => (p._k === k ? { ...p, ...patch } : p))); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/cabinet-assignments", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveDate: date,
          rows: rows.map(({ _k, ...x }) => x),
          partners: partners.map(({ _k, ...x }) => x),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || "فشل الحفظ");
      toast({ title: "اتحفظ التوزيع", description: `تغيير فنى: ${d.changed} · تعديل: ${d.updated} · إضافة: ${d.added} · مسح: ${d.deleted}` });
      qc.invalidateQueries({ predicate: (x) => String(x.queryKey[0] || "").startsWith("/api/reports") });
      await refetch();
    } catch (e: any) {
      toast({ title: "ماتحفظش", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && dirty && !window.confirm("فيه تعديلات مااتحفظتش. تقفل من غير حفظ؟")) return; setOpen(v); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50" data-testid="button-cabinet-assignments">
          <Network className="w-4 h-4 mr-2" />
          توزيع الكباين
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl text-right flex items-center gap-2">
            <Network className="w-5 h-5 text-emerald-700" /> توزيع الكباين على الفنيين
          </DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-4 text-right">
            <p className="text-sm text-muted-foreground">
              سطر لكل كابينة نحاس — كابينة الامسان اللى عليها كابينتين نحاس بتتكتب فى سطرين بنفس الكود.
              أى تغيير فى فنى كابينة بيتسجّل من <b>تاريخ التغيير</b>، وتقرير أداء الفنيين بيحسب اللى قبله على الفنى القديم واللى بعده على الجديد.
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {perTech.map((t) => <span key={t.name} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{t.name}: <b>{t.n}</b></span>)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث: سنترال / امسان / كابينة / فنى" className="max-w-xs" />
              <Button variant="outline" onClick={() => { setRows((rs) => [{ central: centrals[0] || "", msanCode: "", cabinNumber: "", workerCode: "", _k: key() }, ...rs]); setQ(""); setDirty(true); }}>
                <Plus className="w-4 h-4 ml-1" /> إضافة كابينة
              </Button>
              <span className="text-sm text-muted-foreground">{shown.length} من {rows.length} سطر</span>
            </div>
            <datalist id="ca-centrals">{centrals.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm" dir="rtl">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-right">#</th>
                    <th className="p-2 text-right min-w-[150px]">السنترال</th>
                    <th className="p-2 text-right min-w-[130px]">كود كابينة الامسان</th>
                    <th className="p-2 text-right min-w-[100px]">رقم الكابينة النحاس</th>
                    <th className="p-2 text-right min-w-[170px]">الفنى</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r._k} className={`border-t ${r.id == null ? "bg-emerald-50" : ""}`}>
                      <td className="p-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="p-1.5"><Input list="ca-centrals" value={r.central} onChange={(e) => edit(r._k, { central: e.target.value })} className="h-9" /></td>
                      <td className="p-1.5"><Input value={r.msanCode} dir="ltr" onChange={(e) => edit(r._k, { msanCode: e.target.value })} className="h-9 text-left" /></td>
                      <td className="p-1.5"><Input value={r.cabinNumber} dir="ltr" onChange={(e) => edit(r._k, { cabinNumber: e.target.value })} className="h-9 text-left" /></td>
                      <td className="p-1.5">
                        <select className={SEL} value={r.workerCode} onChange={(e) => edit(r._k, { workerCode: e.target.value })}>
                          <option value="">— من غير فنى —</option>
                          {techs.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                          {r.workerCode && !nameOf.has(r.workerCode) && <option value={r.workerCode}>كود {r.workerCode} (مش فى الأسماء)</option>}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <Button size="icon" variant="ghost" className="text-red-600" title="حذف السطر"
                          onClick={() => { setRows((rs) => rs.filter((x) => x._k !== r._k)); setDirty(true); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* فنى بيشتغل مع فنى تانى */}
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold flex items-center gap-1.5"><Users className="w-4 h-4" /> فنى بيشتغل مع فنى تانى</h3>
                <Button variant="outline" size="sm" onClick={() => { setPartners((ps) => [...ps, { techCode: "", partnerCode: "", from: date, to: null, _k: key() }]); setDirty(true); }}>
                  <Plus className="w-4 h-4 ml-1" /> إضافة
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                الفنى ده مالوش كباين فى الجدول. من التاريخ ده نتايجه ونتايج الفنى اللى معاه واحدة (مين ما قفل)، وبيشوف فى الموقع نفس خطوط القياس.
                لو شلت السطر، الشراكة بتخلص يوم قبل تاريخ التغيير وتاريخها بيفضل محسوب.
              </p>
              {partners.length === 0 ? <p className="text-sm text-muted-foreground">مفيش.</p> : partners.map((p) => (
                <div key={p._k} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_auto_auto] gap-2 items-center">
                  <select className={SEL} value={p.techCode} onChange={(e) => editP(p._k, { techCode: e.target.value })}>
                    <option value="">— الفنى —</option>
                    {techs.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                  </select>
                  <span className="text-sm">بيشتغل مع</span>
                  <select className={SEL} value={p.partnerCode} onChange={(e) => editP(p._k, { partnerCode: e.target.value })}>
                    <option value="">— الفنى —</option>
                    {techs.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                  </select>
                  <label className="text-xs flex items-center gap-1">من <Input type="date" value={p.from} onChange={(e) => editP(p._k, { from: e.target.value })} className="h-9 w-[150px]" /></label>
                  <label className="text-xs flex items-center gap-1">لحد <Input type="date" value={p.to || ""} onChange={(e) => editP(p._k, { to: e.target.value || null })} className="h-9 w-[150px]" /></label>
                  <Button size="icon" variant="ghost" className="text-red-600" title="إنهاء / حذف"
                    onClick={() => { setPartners((ps) => ps.filter((x) => x._k !== p._k)); setDirty(true); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 bg-background border-t pt-3 flex flex-wrap items-center gap-3">
              <label className="text-sm flex items-center gap-2 font-medium">
                تاريخ التغيير
                <Input type="date" value={date} max={data.today} onChange={(e) => setDate(e.target.value)} className="h-9 w-[160px]" />
              </label>
              <Button onClick={save} disabled={saving || !dirty} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />} حفظ الجدول
              </Button>
              {dirty && <span className="text-sm text-amber-700">فيه تعديلات مااتحفظتش</span>}
            </div>

            {data.history.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">آخر تغييرات الفنيين ({data.history.length})</summary>
                <ul className="mt-2 space-y-1">
                  {data.history.map((h, i) => (
                    <li key={i} className="text-muted-foreground">
                      {h.date} — {h.central} كابينة {h.cabinNumber}{h.msanCode ? ` (${h.msanCode})` : ""}: {nameOf.get(h.oldCode || "") || h.oldCode || "—"} ← {nameOf.get(h.newCode || "") || h.newCode || "—"}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
