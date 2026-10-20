/**
 * «العرض التقديمى» (السوبر أدمن — المالك ٢٠٢٦-١٠-٢٠): البيانات اللى مش فى Service Flow بتتكتب هنا،
 * والأرقام اللى فيه بتيجى لوحدها (وينفع يتكتب فوقها رقم أدق)، والشرايح بتتعرض بنفس شكل الريفرنس —
 * معاينة + عرض بملء الشاشة بالأسهم. الأقسام الاختيارية ليها مفتاح.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Maximize2, Save, Trash2, Upload, X, ChevronLeft, ChevronRight, Presentation, Download } from "lucide-react";
import { buildSlides, defaultDeck, deckValue, monthLabel, hiddenFaultMonths, bookingPct, marketShareValue, careerRows, careerItems, type CareerRow, type Deck, type DeckAuto, type ExchangeAuto } from "@shared/presentation-deck";
import { DeckSlide, DeckSlideFit, deckImage } from "./DeckSlide";

type Resp = { deck: Deck; auto: DeckAuto; updatedAt: string | null; updatedBy: string | null };

const METRICS: { key: keyof ExchangeAuto; label: string }[] = [
  { key: "lines", label: "الخطوط" },
  { key: "copperCabinets", label: "كباين نحاس" },
  { key: "msanCabinets", label: "كباين MSAN" },
  { key: "boxes", label: "البكسيات" },
  { key: "msanVoice", label: "صوت MSAN" },
  { key: "msanData", label: "داتا MSAN" },
  { key: "voiceUsed", label: "الشغال صوت" },
  { key: "dataUsed", label: "الشغال داتا (كل الشركات)" },
  { key: "weData", label: "عملاء بيانات WE" },
];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>}
    </label>
  );
}

/** سطر لكل وظيفة: الوظيفة · من · إلى (التواريخ نص حر) */
function CareerEditor({ items, onChange }: { items: string; onChange: (items: string) => void }) {
  // حالة محلية: لو اتقرت من النص مع كل حرف كانت المسافات فى آخر الكلمة بتتمسح وانت بتكتب
  const [list, setList] = useState<CareerRow[]>(() => (careerRows(items).length ? careerRows(items) : [{ job: "", from: "", to: "" }]));
  useEffect(() => {
    // اتغيّر من برّه (تحميل/حفظ) → نقراه تانى
    if (careerItems(list) !== items) setList(careerRows(items).length ? careerRows(items) : [{ job: "", from: "", to: "" }]);
  }, [items]);
  const set = (next: CareerRow[]) => { setList(next); onChange(careerItems(next)); };
  const edit = (i: number, patch: Partial<CareerRow>) => set(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="hidden sm:grid grid-cols-[1fr_130px_130px_36px] gap-2 text-xs text-muted-foreground">
        <span>الوظيفة</span><span>من</span><span>إلى</span><span />
      </div>
      {list.map((r, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_130px_36px] gap-2 items-center">
          <Input placeholder="الوظيفة" value={r.job} onChange={(e) => edit(i, { job: e.target.value })} data-testid={`career-job-${i}`} />
          <Input placeholder="من (مثال: 2009)" value={r.from} onChange={(e) => edit(i, { from: e.target.value })} />
          <Input placeholder="إلى (أو: حتى الآن)" value={r.to} onChange={(e) => edit(i, { to: e.target.value })} />
          <Button type="button" variant="ghost" size="sm" title="حذف" onClick={() => set(list.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => set([...list, { job: "", from: "", to: "" }])} data-testid="career-add">+ إضافة وظيفة</Button>
    </div>
  );
}

function Section({ title, on, onToggle, children }: { title: string; on?: boolean; onToggle?: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-[#5b2a86]">{title}</h3>
        {onToggle && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {on ? "ظاهر فى العرض" : "مش ظاهر"}
            {/* dir=ltr: فى الصفحة العربى الزرار كان بيطلع برّه مكانه ويغطّى الكلام */}
            <span dir="ltr" className="inline-flex"><Switch checked={!!on} onCheckedChange={onToggle} /></span>
          </label>
        )}
      </div>
      {(on ?? true) && children}
    </Card>
  );
}

export function PresentationReport() {
  const qc = useQueryClient();
  const q = useQuery<Resp>({
    queryKey: ["/api/presentation"],
    queryFn: async () => {
      const r = await fetch("/api/presentation", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "تعذّر التحميل");
      return r.json();
    },
  });
  const [deck, setDeck] = useState<Deck>(defaultDeck());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "slides">("edit");
  const [present, setPresent] = useState<number | null>(null);
  useEffect(() => { if (q.data && !dirty) setDeck(q.data.deck); }, [q.data]);

  const upd = <K extends keyof Deck>(k: K, patch: Partial<Deck[K]>) => {
    setDeck((d) => ({ ...d, [k]: { ...(d[k] as any), ...patch } }));
    setDirty(true);
  };
  const setOverride = (key: string, val: string) => {
    setDeck((d) => {
      const o = { ...d.overrides };
      if (val.trim()) o[key] = val; else delete o[key];
      return { ...d, overrides: o };
    });
    setDirty(true);
  };
  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/presentation", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deck }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || "تعذّر الحفظ");
      setDeck(j.deck); setDirty(false); setMsg("اتحفظ ✓");
      await qc.invalidateQueries({ queryKey: ["/api/presentation"] });
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  };
  // باور بوينت: بيحفظ الأول لو فيه تعديلات، وبعدين بينزّل الملف (fetch عشان مسار الجذر والأخطاء)
  const [exporting, setExporting] = useState(false);
  const downloadPptx = async () => {
    setExporting(true); setMsg(null);
    try {
      if (dirty) await save();
      const r = await fetch("/api/presentation/pptx", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "تعذّر تجهيز الملف");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${deck.cover.title || "العرض التقديمى"} ${new Date().toISOString().slice(0, 10)}.pptx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { setMsg(e.message); } finally { setExporting(false); }
  };
  const upload = async (file: File): Promise<string | null> => {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/presentation/image", { method: "POST", credentials: "include", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j?.message || "تعذّر رفع الصورة"); return null; }
    return j.id;
  };

  const auto = q.data?.auto ?? null;
  const slides = useMemo(() => buildSlides(deck, auto), [deck, auto]);

  if (q.isLoading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;
  if (q.error) return <div className="p-6 text-red-600">{String((q.error as Error).message)}</div>;

  const ImagePick = ({ id, onChange, label }: { id: string; onChange: (id: string) => void; label: string }) => {
    const ref = useRef<HTMLInputElement>(null);
    return (
      <div className="flex items-center gap-2">
        {id ? <img src={deckImage(id)} alt="" className="w-16 h-16 object-cover rounded border" /> : <div className="w-16 h-16 rounded border bg-muted" />}
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return; const nid = await upload(f); if (nid) onChange(nid); e.target.value = "";
        }} />
        <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}><Upload className="w-4 h-4 ml-1" />{label}</Button>
        {id && <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}><Trash2 className="w-4 h-4" /></Button>}
      </div>
    );
  };
  const Photos = ({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) => {
    const ref = useRef<HTMLInputElement>(null);
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <div key={id} className="relative">
              <img src={deckImage(id)} alt="" className="w-24 h-16 object-cover rounded border" />
              <button type="button" className="absolute -top-2 -left-2 bg-white rounded-full border p-0.5" onClick={() => onChange(ids.filter((x) => x !== id))}><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
          const files = Array.from(e.target.files || []).slice(0, 8 - ids.length); const out = [...ids];
          for (const f of files) { const nid = await upload(f); if (nid) out.push(nid); }
          onChange(out); e.target.value = "";
        }} />
        {ids.length < 8 && <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}><Upload className="w-4 h-4 ml-1" />إضافة صور (لحد ٨)</Button>}
      </div>
    );
  };

  const d = deck;
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Presentation className="w-5 h-5 text-[#5b2a86]" /> العرض التقديمى</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={view === "edit" ? "default" : "outline"} size="sm" onClick={() => setView("edit")}>البيانات</Button>
          <Button variant={view === "slides" ? "default" : "outline"} size="sm" onClick={() => setView("slides")}>الشرايح ({slides.length})</Button>
          <Button size="sm" className="bg-[#57318A] hover:bg-[#46276f]" onClick={() => setPresent(0)}><Maximize2 className="w-4 h-4 ml-1" />عرض</Button>
          <Button size="sm" variant="outline" onClick={downloadPptx} disabled={exporting} data-testid="button-deck-pptx">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Download className="w-4 h-4 ml-1" />}تحميل PowerPoint
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty} data-testid="button-save-deck">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}حفظ
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          {dirty && !msg && <span className="text-xs text-amber-600">فيه تعديلات ماتحفظتش</span>}
        </div>
      </div>
      {auto?.errors?.length ? <div className="text-xs text-amber-700">أرقام ماتجابتش تلقائياً (اكتبها بإيدك): {auto.errors.map((e) => e.split(":")[0]).join(" · ")}</div> : null}

      {view === "slides" ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {slides.map((s, i) => (
            <button key={i} type="button" className="text-right min-w-0" onClick={() => setPresent(i)}>
              <DeckSlideFit slide={s} />
              <span className="text-xs text-muted-foreground">{i + 1}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="الغلاف">
            <div className="grid grid-cols-2 gap-3">
              <Field label="العنوان"><Input value={d.cover.title} onChange={(e) => upd("cover", { title: e.target.value })} /></Field>
              <Field label="فوق العنوان"><Input value={d.cover.subtitle} onChange={(e) => upd("cover", { subtitle: e.target.value })} /></Field>
              <Field label="الاجتماع"><Input value={d.cover.meeting} onChange={(e) => upd("cover", { meeting: e.target.value })} placeholder="اجتماع السيد المهندس رئيس القطاعات الجنوبية" /></Field>
              <Field label="التاريخ"><Input value={d.cover.date} onChange={(e) => upd("cover", { date: e.target.value })} placeholder="أكتوبر ٢٠٢٦" /></Field>
            </div>
          </Section>

          <Section title="السيرة الذاتية">
            <div className="grid grid-cols-2 gap-3">
              <Field label="الاسم"><Input value={d.person.name} onChange={(e) => upd("person", { name: e.target.value })} /></Field>
              <Field label="تاريخ الميلاد (اختيارى)"><Input value={d.person.birthDate} onChange={(e) => upd("person", { birthDate: e.target.value })} /></Field>
              <Field label="الوظيفة"><Input value={d.person.job} onChange={(e) => upd("person", { job: e.target.value })} /></Field>
              <Field label="الإدارة العامة"><Input value={d.person.department} onChange={(e) => upd("person", { department: e.target.value })} /></Field>
              <Field label="القطاع"><Input value={d.person.sector} onChange={(e) => upd("person", { sector: e.target.value })} /></Field>
              <Field label="الصورة الشخصية"><ImagePick id={d.person.photoId} label="رفع صورة" onChange={(id) => upd("person", { photoId: id })} /></Field>
            </div>
            <Field label="المؤهلات" hint="سطر لكل مؤهل (لحد ٦)">
              <Textarea rows={4} value={d.person.qualifications} onChange={(e) => upd("person", { qualifications: e.target.value })} />
            </Field>
          </Section>

          <Section title="المسار الوظيفى" on={d.career.enabled} onToggle={(v) => upd("career", { enabled: v })}>
            <Field label="سنة التعيين"><Input value={d.career.hireYear} onChange={(e) => upd("career", { hireYear: e.target.value })} /></Field>
            <Field label="الوظائف" hint="التواريخ نص عادى — اكتب أى حاجة: 2009 · يناير 2015 · حتى الآن">
              <CareerEditor items={d.career.items} onChange={(items) => upd("career", { items })} />
            </Field>
          </Section>

          <Section title="نبذة عن الإدارة">
            <div className="grid grid-cols-2 gap-3">
              <Field label="المساحة الجغرافية (كم²)"><Input value={d.area.areaKm2} onChange={(e) => upd("area", { areaKm2: e.target.value })} /></Field>
              <Field label="عدد السكان"><Input value={d.area.population} onChange={(e) => upd("area", { population: e.target.value })} placeholder="مثال: 250 ألف نسمة" /></Field>
              <Field label="عدد القرى والتوابع"><Input value={d.area.villages} onChange={(e) => upd("area", { villages: e.target.value })} /></Field>
              <Field label="الوحدات السكنية المشغولة"><Input value={d.area.housingUnits} onChange={(e) => upd("area", { housingUnits: e.target.value })} /></Field>
              <Field label="خريطة الإدارة"><ImagePick id={d.area.mapId} label="رفع خريطة" onChange={(id) => upd("area", { mapId: id })} /></Field>
            </div>
            <Field label="صفوف زيادة فى الجدول (اختيارى)" hint="سطر لكل صف: البيان | القيمة">
              <Textarea rows={2} value={d.area.extraRows} onChange={(e) => upd("area", { extraRows: e.target.value })} />
            </Field>
          </Section>

          <Section title="السنترالات والأرقام التلقائية">
            <p className="text-xs text-muted-foreground">الأرقام الرمادى جاية من Service Flow. اكتب فوقها لو عندك رقم أدق — الفاضى بيفضل تلقائى.</p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead><tr className="bg-muted">
                  <th className="p-1">الكود</th><th className="p-1">الاسم فى العرض</th><th className="p-1">الاسم فى السيستم</th>
                  {METRICS.map((m) => <th key={m.key} className="p-1">{m.label}</th>)}
                </tr></thead>
                <tbody>
                  {[...d.exchanges.map((e, i) => ({ e, i })), { e: { code: "total", name: "الإجمالى", match: "" }, i: -1 }].map(({ e, i }) => (
                    <tr key={e.code + i} className="border-b">
                      <td className="p-1">{i >= 0 ? <Input className="h-7 w-20 text-xs" value={e.code} onChange={(ev) => { const ex = [...d.exchanges]; ex[i] = { ...ex[i], code: ev.target.value }; setDeck({ ...d, exchanges: ex }); setDirty(true); }} /> : <b>الإجمالى</b>}</td>
                      <td className="p-1">{i >= 0 && <Input className="h-7 w-28 text-xs" value={e.name} onChange={(ev) => { const ex = [...d.exchanges]; ex[i] = { ...ex[i], name: ev.target.value }; setDeck({ ...d, exchanges: ex }); setDirty(true); }} />}</td>
                      <td className="p-1">{i >= 0 && <Input className="h-7 w-36 text-xs" value={e.match} onChange={(ev) => { const ex = [...d.exchanges]; ex[i] = { ...ex[i], match: ev.target.value }; setDeck({ ...d, exchanges: ex }); setDirty(true); }} />}</td>
                      {METRICS.map((m) => {
                        const key = `${e.code}.${m.key}`;
                        const src = e.code === "total" ? auto?.total : auto?.exchanges[e.code];
                        return (
                          <td key={m.key} className="p-1">
                            <Input className="h-7 w-20 text-xs" dir="ltr" value={d.overrides[key] ?? ""} placeholder={src ? Number(src[m.key]).toLocaleString("en-US") : "—"}
                              onChange={(ev) => setOverride(key, ev.target.value)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="العملاء">
            <label className="flex items-center gap-2 text-sm">
              <span dir="ltr" className="inline-flex"><Switch checked={d.customers.showShare} onCheckedChange={(v) => upd("customers", { showShare: v })} /></span>
              {d.customers.showShare ? "الحصة السوقية ظاهرة فى العرض" : "الحصة السوقية مخفية من العرض"}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="عدد عملاء البيانات WE" hint="فاضى = تلقائى: خطوط ليها أكونت وليها بورت حالى">
                <Input value={d.customers.weData} onChange={(e) => upd("customers", { weData: e.target.value })} placeholder={deckValue({ ...d, customers: { ...d.customers, weData: "" } }, auto, "total", "weData")} />
              </Field>
              <Field label="الحصة السوقية WE DATA" hint="فاضى = تلقائى: عملاء WE ÷ عملاء البيانات كلهم (الداتا used)">
                <Input value={d.customers.marketShare} onChange={(e) => upd("customers", { marketShare: e.target.value })} placeholder={marketShareValue({ ...d, customers: { ...d.customers, marketShare: "" } }, auto)} />
              </Field>
            </div>
          </Section>

          <Section title="قرى حياة كريمة" on={d.decentLife.enabled} onToggle={(v) => upd("decentLife", { enabled: v })}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="قرى المرحلة الأولى"><Input value={d.decentLife.phase1} onChange={(e) => upd("decentLife", { phase1: e.target.value })} /></Field>
              <Field label="قرى المرحلة الثانية"><Input value={d.decentLife.phase2} onChange={(e) => upd("decentLife", { phase2: e.target.value })} /></Field>
            </div>
            <Field label="ملاحظة تحت الجدول (اختيارى)"><Input value={d.decentLife.notes} onChange={(e) => upd("decentLife", { notes: e.target.value })} /></Field>
            {auto?.decentLife?.length ? (
              <p className="text-xs text-muted-foreground">من الكباين فى السيستم: {auto.decentLife.map((x) => `${x.value}: ${x.cabinets} كابينة / ${x.villages} قرية`).join(" · ")}</p>
            ) : null}
          </Section>

          <Section title="مؤشرات الأداء (الأعطال)" on={d.faults.enabled} onToggle={(v) => upd("faults", { enabled: v })}>
            <p className="text-xs text-muted-foreground">
              آخر ١٢ شهر + الشهر الحالى (من أوله لحد النهارده) — كل شهر محسوب لوحده، بنفس تعريفات «إحصائيات التكرار»
              و«إحصائيات الإزالة». اقفل أى شهر مش عايزه يظهر فى الرسم. (الأرقام بتتحدّث بعد الحفظ)
            </p>
            {auto?.faultsByMonth?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-muted-foreground text-xs"><th className="text-right p-1">يظهر</th><th className="text-right p-1">الشهر</th>
                    <th className="p-1">الأعطال</th><th className="p-1">التكرار</th><th className="p-1">الإزالة خلال ٤٨ ساعة</th></tr></thead>
                  <tbody>
                    {auto.faultsByMonth.map((m) => {
                      const hidden = hiddenFaultMonths(d);
                      const on = !hidden.has(m.month);
                      const toggle = (v: boolean) => {
                        const next = new Set(hidden);
                        if (v) next.delete(m.month); else next.add(m.month);
                        upd("faults", { hiddenMonths: [...next].sort().join(",") });
                      };
                      return (
                        <tr key={m.month} className={`border-t ${on ? "" : "opacity-50"}`} data-testid={`fault-month-${m.month}`}>
                          <td className="p-1"><span dir="ltr" className="inline-flex"><Switch checked={on} onCheckedChange={toggle} /></span></td>
                          <td className="p-1 font-medium">{monthLabel(m.month, "full")}</td>
                          <td className="p-1 text-center tabular-nums">{m.complaints.toLocaleString("en-US")}</td>
                          <td className="p-1 text-center tabular-nums">{m.repeatPct ?? "—"}%</td>
                          <td className="p-1 text-center tabular-nums">{m.in48Pct ?? "—"}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-muted-foreground">مفيش أعطال فى الفترة دى</p>}
          </Section>

          <Section title="خطة الصيانة" on={d.maintenance.enabled} onToggle={(v) => upd("maintenance", { enabled: v })}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="السنة"><Input value={d.maintenance.period} onChange={(e) => upd("maintenance", { period: e.target.value })} /></Field>
              <Field label="المحقق (بكسيات)" hint={`فاضى = من برنامج الصيانة: ${auto?.maintenance?.byYear.find((y) => y.year === d.maintenance.period)?.done ?? "—"}`}>
                <Input value={d.overrides["total.maintBoxes"] ?? ""} placeholder="تلقائى" onChange={(e) => setOverride("total.maintBoxes", e.target.value)} />
              </Field>
              <Field label="المحقق (كباين نحاس)"><Input value={d.maintenance.achievedCopper} onChange={(e) => upd("maintenance", { achievedCopper: e.target.value })} /></Field>
              <Field label="المحقق (كباين MSAN)"><Input value={d.maintenance.achievedMsan} onChange={(e) => upd("maintenance", { achievedMsan: e.target.value })} /></Field>
            </div>
            <Field label="صور أعمال الصيانة"><Photos ids={d.maintenance.photoIds} onChange={(ids) => upd("maintenance", { photoIds: ids })} /></Field>
          </Section>

          <Section title="نسبة الحجز وفك المتعذرات" on={d.booking.enabled} onToggle={(v) => upd("booking", { enabled: v })}>
            <p className="text-xs text-muted-foreground">نتيجة إدارة الغنايم — عدّل أى رقم لما ييجى تقرير أحدث.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="حتى تاريخ"><Input value={d.booking.asOf} onChange={(e) => upd("booking", { asOf: e.target.value })} /></Field>
              <Field label="إجمالى الطلبات (Grand Total)"><Input value={d.booking.total} onChange={(e) => upd("booking", { total: e.target.value })} /></Field>
              <Field label="إجمالى الإمكانية"><Input value={d.booking.capacity} onChange={(e) => upd("booking", { capacity: e.target.value })} /></Field>
              <Field label="متعذر"><Input value={d.booking.blocked} onChange={(e) => upd("booking", { blocked: e.target.value })} /></Field>
              <Field label="توضيح عنوان"><Input value={d.booking.clarify} onChange={(e) => upd("booking", { clarify: e.target.value })} /></Field>
              <Field label="بدون رد"><Input value={d.booking.noReply} onChange={(e) => upd("booking", { noReply: e.target.value })} /></Field>
              <Field label="العنوان لا يتبع السنترال"><Input value={d.booking.otherExchange} onChange={(e) => upd("booking", { otherExchange: e.target.value })} /></Field>
              <Field label="نسبة الحجز" hint="فاضى = الإمكانية ÷ الإجمالى">
                <Input value={d.booking.pct} onChange={(e) => upd("booking", { pct: e.target.value })} placeholder={bookingPct({ ...d.booking, pct: "" })} />
              </Field>
            </div>
          </Section>

          <Section title="أهم الإنجازات" on={d.achievements.enabled} onToggle={(v) => upd("achievements", { enabled: v })}>
            <Field label="الإنجازات" hint="سطر لكل إنجاز"><Textarea rows={5} value={d.achievements.items} onChange={(e) => upd("achievements", { items: e.target.value })} /></Field>
            <Field label="صور"><Photos ids={d.achievements.photoIds} onChange={(ids) => upd("achievements", { photoIds: ids })} /></Field>
          </Section>

          <Section title="رؤية التطوير المستقبلية" on={d.vision.enabled} onToggle={(v) => upd("vision", { enabled: v })}>
            <Field label="النقاط" hint="سطر لكل نقطة"><Textarea rows={5} value={d.vision.items} onChange={(e) => upd("vision", { items: e.target.value })} /></Field>
          </Section>

          <Section title="الختام" on={d.closing.enabled} onToggle={(v) => upd("closing", { enabled: v })}>
            <Field label="النص"><Input value={d.closing.text} onChange={(e) => upd("closing", { text: e.target.value })} /></Field>
          </Section>
        </div>
      )}

      {present != null && slides[present] && (
        <PresentMode slides={slides} index={present} onIndex={setPresent} onClose={() => setPresent(null)} />
      )}
    </div>
  );
}

function PresentMode({ slides, index, onIndex, onClose }: { slides: ReturnType<typeof buildSlides>; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const [w, setW] = useState(() => Math.min(window.innerWidth, (window.innerHeight * 16) / 9));
  useEffect(() => {
    const onResize = () => setW(Math.min(window.innerWidth, (window.innerHeight * 16) / 9));
    // عربى: السهم الشمال = اللى بعده
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" || e.key === "PageDown" || e.key === " ") onIndex(Math.min(slides.length - 1, index + 1));
      if (e.key === "ArrowRight" || e.key === "PageUp") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("resize", onResize); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey); };
  }, [index, slides.length]);
  // ملء الشاشة مرة واحدة لما العرض يفتح، ويتقفل معاه
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);
  const close = () => onClose();
  // portal على body: الصفحة جوّاها عناصر فيها transform بتخلّى fixed مايغطّيش الشاشة كلها
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" onClick={() => onIndex(Math.min(slides.length - 1, index + 1))}>
      <DeckSlide slide={slides[index]} width={w} />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 text-white/80 text-sm" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => onIndex(Math.max(0, index - 1))}><ChevronRight className="w-6 h-6" /></button>
        <span dir="ltr">{index + 1} / {slides.length}</span>
        <button type="button" onClick={() => onIndex(Math.min(slides.length - 1, index + 1))}><ChevronLeft className="w-6 h-6" /></button>
        <button type="button" onClick={close}><X className="w-6 h-6" /></button>
      </div>
    </div>,
    document.body,
  );
}
