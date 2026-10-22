/**
 * «العرض التقديمى» (السوبر أدمن — المالك ٢٠٢٦-١٠-٢٠): البيانات اللى مش فى Service Flow بتتكتب هنا،
 * والأرقام اللى فيه بتيجى لوحدها (وينفع يتكتب فوقها رقم أدق)، والشرايح بتتعرض بنفس شكل الريفرنس —
 * معاينة + عرض بملء الشاشة بالأسهم. الأقسام الاختيارية ليها مفتاح.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Maximize2, Save, Trash2, Upload, X, ChevronLeft, ChevronRight, Presentation, Download } from "lucide-react";
import { buildSlides, slideKeys, visibleSlides, defaultDeck, monthLabel, hiddenFaultMonths, HIDDEN_KEY, periodAverageNote, customerGrowth, type FaultIndicator, monthPerThousand, parseNum, parseMonthWorking, serializeMonthWorking, bookingPct, installsRows, MAX_SET_PHOTOS, MAX_PHOTO_SETS, type MaintPhotoSet, MSAN_COLUMNS, msanRows, msanItems, careerRows, careerItems, type CareerRow, type Deck, type DeckAuto, type ExchangeAuto } from "@shared/presentation-deck";
import { DeckSlide, DeckSlideFit, deckImage } from "./DeckSlide";
import { withBase } from "@/lib/base-path";

type Resp = { deck: Deck; auto: DeckAuto; updatedAt: string | null; updatedBy: string | null };

const METRICS: { key: keyof ExchangeAuto; label: string }[] = [
  { key: "lines", label: "الخطوط" },
  { key: "copperCabinets", label: "كباين نحاس" },
  { key: "msanCabinets", label: "كباين MSAN" },
  { key: "boxes", label: "البكسيات" },
  // الشغال صوت/داتا = قاعدة العملاء (ملف مشتركى FTTH/ADSL) — المالك ٢٠٢٦-١٠-٢٠
  { key: "msanVoice", label: "شغال صوت" },
  { key: "msanData", label: "شغال داتا" },
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

/** جدول كباين «خطة MSAN»: صف لكل كابينة بـ٦ خانات — حالة محلية زى المسار الوظيفى عشان المسافات ماتتمسحش وانت بتكتب */
function MsanEditor({ items, onChange }: { items: string; onChange: (items: string) => void }) {
  const blank = () => MSAN_COLUMNS.map(() => "");
  const [list, setList] = useState<string[][]>(() => (msanRows(items).length ? msanRows(items) : [blank()]));
  useEffect(() => { if (msanItems(list.filter((r) => r.some((c) => c.trim()))) !== items) setList(msanRows(items).length ? msanRows(items) : [blank()]); }, [items]);
  const set = (next: string[][]) => { setList(next); onChange(msanItems(next.filter((r) => r.some((c) => c.trim())))); };
  const ph = ["11-1-216-41", "سوهاج شرق", "بندار الكرمانية", "12/05/2026", "كهرباء فقط", "EXBAND"];
  return (
    <div className="space-y-2 overflow-x-auto">
      <div className="grid grid-cols-[repeat(6,minmax(110px,1fr))_36px] gap-1 text-xs text-muted-foreground min-w-[760px]">
        {MSAN_COLUMNS.map((c) => <span key={c}>{c}</span>)}<span />
      </div>
      {list.map((r, i) => (
        <div key={i} className="grid grid-cols-[repeat(6,minmax(110px,1fr))_36px] gap-1 items-center min-w-[760px]" data-testid={`msan-row-${i}`}>
          {r.map((c, j) => (
            <Input key={j} className="h-8 text-sm" value={c} placeholder={i === 0 ? ph[j] : ""}
              onChange={(e) => set(list.map((x, k) => (k === i ? x.map((y, q) => (q === j ? e.target.value : y)) : x)))} />
          ))}
          <Button type="button" variant="ghost" size="sm" title="حذف" onClick={() => set(list.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => set([...list, blank()])} data-testid="msan-add">+ إضافة كابينة</Button>
    </div>
  );
}

const getJson = async (url: string) => {
  const r = await fetch(url, { credentials: "include" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || "تعذّر التحميل");
  return j;
};

/** صور من برنامج الصيانة: سنترال ← كابينة ← بكس ← صور قبل/بعد، والمالك بيختار (الحد ٨ صور فى العرض) */
function MaintPhotoPicker({ room, onAdd, limit = 8 }: { room: number; onAdd: (ids: string[]) => void; limit?: number }) {
  const [open, setOpen] = useState(false);
  const [ex, setEx] = useState("");
  const [cab, setCab] = useState("");
  const [box, setBox] = useState("");
  // المختار ممكن ييجى من أكتر من بكس — بيفضل محفوظ وانت بتغيّر البكس
  const [picked, setPicked] = useState<{ id: number; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const exQ = useQuery<{ id: number; name: string; photos: number }[]>({ queryKey: ["/api/presentation/maint/exchanges"], enabled: open, queryFn: () => getJson("/api/presentation/maint/exchanges") });
  const cabQ = useQuery<{ id: number; number: string; photos: number }[]>({ queryKey: ["maint-cab", ex], enabled: open && !!ex, queryFn: () => getJson(`/api/presentation/maint/cabinets?exchange=${ex}`) });
  const boxQ = useQuery<{ id: number; number: string; before: number; after: number }[]>({ queryKey: ["maint-box", cab], enabled: open && !!cab, queryFn: () => getJson(`/api/presentation/maint/boxes?cabinet=${cab}`) });
  const phQ = useQuery<{ id: number; type: "before" | "after"; at: string }[]>({ queryKey: ["maint-ph", box], enabled: open && !!box, queryFn: () => getJson(`/api/presentation/maint/photos?box=${box}`) });
  const exName = exQ.data?.find((e) => String(e.id) === ex)?.name || "";
  const cabNo = cabQ.data?.find((c) => String(c.id) === cab)?.number || "";
  const boxNo = boxQ.data?.find((b) => String(b.id) === box)?.number || "";
  const isPicked = (id: number) => picked.some((p) => p.id === id);
  const toggle = (id: number, type: string) => {
    if (isPicked(id)) return setPicked(picked.filter((p) => p.id !== id));
    if (picked.length >= room) return setErr(`الحد ${limit} صور هنا — فاضل ${room} بس`);
    setErr(null);
    setPicked([...picked, { id, label: `${exName} · كابينة ${cabNo} · بكس ${boxNo} · ${type === "after" ? "بعد" : "قبل"}` }]);
  };
  const add = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/presentation/maint/import", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: picked.map((p) => p.id) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message || "تعذّر نسخ الصور");
      const ids = (j as { id: string | null }[]).map((x) => x.id).filter(Boolean) as string[];
      if (ids.length < picked.length) setErr(`${picked.length - ids.length} صورة ماتلاقتش فى برنامج الصيانة`);
      onAdd(ids); setPicked([]);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const sel = "h-9 rounded-md border bg-background px-2 text-sm min-w-0";
  if (!open) return (
    <Button type="button" variant="outline" size="sm" disabled={room === 0} onClick={() => setOpen(true)} data-testid="maint-picker-open">
      اختيار من برنامج الصيانة {room === 0 ? `(وصلت للحد ${limit})` : ""}
    </Button>
  );
  const photos = phQ.data || [];
  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <b className="text-sm">صور من برنامج الصيانة</b>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}><X className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select className={sel} value={ex} onChange={(e) => { setEx(e.target.value); setCab(""); setBox(""); }} data-testid="maint-ex">
          <option value="">السنترال…</option>
          {exQ.data?.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.photos} صورة)</option>)}
        </select>
        <select className={sel} value={cab} disabled={!ex} onChange={(e) => { setCab(e.target.value); setBox(""); }} data-testid="maint-cab">
          <option value="">الكابينة…</option>
          {cabQ.data?.map((c) => <option key={c.id} value={c.id}>كابينة {c.number} ({c.photos})</option>)}
        </select>
        <select className={sel} value={box} disabled={!cab} onChange={(e) => setBox(e.target.value)} data-testid="maint-box">
          <option value="">البكس…</option>
          {boxQ.data?.map((b) => <option key={b.id} value={b.id}>بكس {b.number} (قبل {b.before} · بعد {b.after})</option>)}
        </select>
      </div>
      {(exQ.error || cabQ.error || boxQ.error || phQ.error) && <div className="text-xs text-red-600">{String((exQ.error || cabQ.error || boxQ.error || phQ.error as any)?.message)}</div>}
      {box && (phQ.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
        <div className="space-y-2">
          {(["before", "after"] as const).map((t) => {
            const list = photos.filter((p) => p.type === t);
            if (!list.length) return null;
            return (
              <div key={t}>
                <div className="text-xs text-muted-foreground mb-1">{t === "before" ? "قبل" : "بعد"}</div>
                <div className="flex flex-wrap gap-2">
                  {list.map((p) => (
                    <button key={p.id} type="button" onClick={() => toggle(p.id, t)} data-testid={`maint-photo-${p.id}`}
                      className={`relative rounded border-2 ${isPicked(p.id) ? "border-[#57318A]" : "border-transparent"}`}>
                      <img src={withBase(`/api/presentation/maint/photo/${p.id}`)} alt="" loading="lazy" className="w-28 h-20 object-cover rounded" />
                      {isPicked(p.id) && <span className="absolute top-1 left-1 bg-[#57318A] text-white text-xs rounded px-1">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>مختار {picked.length} — متاح {room}</span>
        {picked.length > 0 && <Button type="button" size="sm" onClick={add} disabled={busy} data-testid="maint-picker-add">
          {busy ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}إضافة المختار للعرض
        </Button>}
        {picked.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setPicked([])}>إلغاء الاختيار</Button>}
      </div>
      {picked.length > 0 && <ul className="text-xs text-muted-foreground list-disc pr-5">{picked.map((p) => <li key={p.id}>{p.label}</li>)}</ul>}
      {err && <div className="text-xs text-amber-700">{err}</div>}
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
  const [exporting, setExporting] = useState<"" | "deck" | "avg">("");
  const fetchPptx = async (kind: "deck" | "avg", path: string, name: string) => {
    setExporting(kind); setMsg(null);
    try {
      if (dirty) await save();
      const r = await fetch(path, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "تعذّر تجهيز الملف");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${name} ${new Date().toISOString().slice(0, 10)}.pptx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { setMsg(e.message); } finally { setExporting(""); }
  };
  const downloadPptx = () => fetchPptx("deck", "/api/presentation/pptx", deck.cover.title || "العرض التقديمى");
  // ملف لوحده بجداول حساب المتوسطات (المالك ٢٠٢٦-١٠-٢١)
  const downloadAverages = () => fetchPptx("avg", "/api/presentation/pptx-averages", "جداول حساب المتوسطات");
  const upload = async (file: File): Promise<string | null> => {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/presentation/image", { method: "POST", credentials: "include", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j?.message || "تعذّر رفع الصورة"); return null; }
    return j.id;
  };

  const auto = q.data?.auto ?? null;
  // كل الشرايح (لتاب «الشرايح» بزرار الإخفاء) — والعرض والباور بوينت بالظاهرة بس (المالك ٢٠٢٦-١٠-٢٢)
  const allSlides = useMemo(() => buildSlides(deck, auto), [deck, auto]);
  const allKeys = useMemo(() => slideKeys(allSlides), [allSlides]);
  const slides = useMemo(() => visibleSlides(deck, allSlides), [deck, allSlides]);
  const hiddenSet = new Set(deck.hiddenSlides);
  const setSlideShown = (key: string, shown: boolean) => {
    setDeck((d) => ({ ...d, hiddenSlides: shown ? d.hiddenSlides.filter((k) => k !== key) : [...d.hiddenSlides, key] }));
    setDirty(true);   // زى أى خانة — «حفظ» بيتفتح، والتحميل بيحفظ الأول
  };

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
  const Photos = ({ ids, onChange, max = 8, testId }: { ids: string[]; onChange: (ids: string[]) => void; max?: number; testId?: string }) => {
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
          const files = Array.from(e.target.files || []).slice(0, max - ids.length); const out = [...ids];
          for (const f of files) { const nid = await upload(f); if (nid) out.push(nid); }
          onChange(out); e.target.value = "";
        }} />
        {ids.length < max && <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} data-testid={testId}>
          <Upload className="w-4 h-4 ml-1" />{max === 8 ? "إضافة صور (لحد ٨)" : `رفع صور (لحد ${max})`}
        </Button>}
      </div>
    );
  };

  const d = deck;
  // شغال كل شهر (المالك ٢٠٢٦-١٠-٢١): بيتخزّن «YYYY-MM=العدد»، والفاضى = الشغال الحالى
  const workingMap = new Map<string, string>([...parseMonthWorking(d.faults.working).entries()].map(([k, v]) => [k, String(v)]));
  // نسب التكرار/الإزالة بالإيد (المالك ٢٠٢٦-١٠-٢٢): النص زى ما اتكتب (عشان «4.» وانت بتكتب مايتمسحش)، والفاضى = المحسوبة
  const rawMonths = (str: string) => new Map<string, string>(String(str || "").split(",").map((x) => x.split("=").map((y) => (y || "").trim()))
    .filter(([m, v]) => /^\d{4}-\d{2}$/.test(m || "") && v) as [string, string][]);
  const setMonthRate = (ind: "repeat" | "in24", month: string, v: string) => {
    const key = ind === "repeat" ? "repeatManual" : "in24Manual";
    const next = rawMonths(d.faults[key]);
    const clean = v.replace(/[^\d٠-٩.,٫]/g, "").replace(/[,٫]/g, ".");
    if (clean) next.set(month, clean); else next.delete(month);
    upd("faults", { [key]: [...next.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${k}=${x}`).join(",") } as any);
  };
  const setMonthWork = (month: string, v: string) => {
    const next = new Map<string, string>(workingMap);
    const clean = v.replace(/[^\d٠-٩]/g, "");
    if (clean) next.set(month, clean); else next.delete(month);
    upd("faults", { working: serializeMonthWorking(next) });
  };
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2"><Presentation className="w-5 h-5 text-[#5b2a86]" /> العرض التقديمى</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={view === "edit" ? "default" : "outline"} size="sm" onClick={() => setView("edit")}>البيانات</Button>
          <Button variant={view === "slides" ? "default" : "outline"} size="sm" onClick={() => setView("slides")}>
            الشرايح ({slides.length}{slides.length !== allSlides.length ? ` من ${allSlides.length}` : ""})
          </Button>
          <Button size="sm" className="bg-[#57318A] hover:bg-[#46276f]" onClick={() => setPresent(0)}><Maximize2 className="w-4 h-4 ml-1" />عرض</Button>
          <Button size="sm" variant="outline" onClick={downloadPptx} disabled={!!exporting} data-testid="button-deck-pptx">
            {exporting === "deck" ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Download className="w-4 h-4 ml-1" />}تحميل PowerPoint
          </Button>
          <Button size="sm" variant="outline" onClick={downloadAverages} disabled={!!exporting} data-testid="button-deck-avg-pptx">
            {exporting === "avg" ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Download className="w-4 h-4 ml-1" />}جداول المتوسطات (PowerPoint)
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
          {allSlides.map((s, i) => {
            const key = allKeys[i];
            const shown = !hiddenSet.has(key);
            const at = shown ? slides.indexOf(s) : -1;
            return (
              <div key={key} className="min-w-0 space-y-1" data-testid={`slide-card-${i}`}>
                <button type="button" className={`text-right w-full block ${shown ? "" : "opacity-35 grayscale"}`} disabled={!shown}
                  onClick={() => at >= 0 && setPresent(at)}>
                  <DeckSlideFit slide={s} />
                </button>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{shown ? `${at + 1}` : "مخفية — مش هتظهر فى العرض ولا الباور بوينت"}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span>{shown ? "ظاهرة" : "مخفية"}</span>
                    <span dir="ltr" className="inline-flex"><Switch checked={shown} onCheckedChange={(v) => setSlideShown(key, v)} data-testid={`slide-shown-${i}`} /></span>
                  </label>
                </div>
              </div>
            );
          })}
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
            <label className="flex items-center gap-2 text-sm">
              <span dir="ltr" className="inline-flex"><Switch checked={d.exchangesTable.enabled} onCheckedChange={(v) => upd("exchangesTable", { enabled: v })} data-testid="exchanges-slide-toggle" /></span>
              {d.exchangesTable.enabled ? "شريحة «سنترالات الإدارة» ظاهرة فى العرض" : "شريحة «سنترالات الإدارة» مخفية من العرض"}
            </label>
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
              من يناير 2025 لحد الشهر الحالى (من أوله لحد النهارده) — كل شهر محسوب لوحده، بنفس تعريفات «إحصائيات التكرار»
              و«إحصائيات الإزالة». كل مؤشر بشهوره: الزرار اللى جنب الرقم بيظهّر/يخفى الشهر ده من شريحة المؤشر ده بس.
              (الأرقام بتتحدّث بعد الحفظ)
            </p>
            <p className="text-xs">
              الأعطال فى الألف = أعطال الشهر ÷ <b>شغال الشهر</b> × 1000. اكتب الشغال لكل شهر فى عمود «الشغال» —
              الفاضى بيتحسب على الشغال الحالى{auto?.faultsWorking ? <> (آخر ملف مشتركين: <b className="tabular-nums">{auto.faultsWorking.toLocaleString("en-US")}</b>)</> : null}.
            </p>
            {auto?.faultsByMonth?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-muted-foreground text-xs"><th className="text-right p-1">الشهر</th>
                    <th className="p-1">الأعطال</th><th className="p-1">الشغال</th><th className="p-1">الأعطال فى الألف</th><th className="p-1">التكرار</th><th className="p-1">الإزالة خلال ٢٤ ساعة</th></tr></thead>
                  <tbody>
                    {auto.faultsByMonth.map((m) => {
                      // زرار لكل مؤشر فى كل شهر — مفيش اختيار شهور واحد للكل
                      const shown = (ind: FaultIndicator) => !hiddenFaultMonths(d, ind).has(m.month);
                      const show = (ind: FaultIndicator, value: ReactNode) => {
                        const on = shown(ind);
                        const toggle = (v: boolean) => {
                          const next = hiddenFaultMonths(d, ind);
                          if (v) next.delete(m.month); else next.add(m.month);
                          upd("faults", { [HIDDEN_KEY[ind]]: [...next].sort().join(",") } as any);
                        };
                        return (
                          <td className={`p-1 text-center tabular-nums ${on ? "" : "opacity-40"}`}>
                            <span className="inline-flex items-center gap-1.5">
                              <span dir="ltr" className="inline-flex"><Switch checked={on} onCheckedChange={toggle} data-testid={`fault-show-${ind}-${m.month}`} /></span>
                              {value}
                            </span>
                          </td>
                        );
                      };
                      const any = shown("pt") || shown("repeat") || shown("in24");
                      return (
                        <tr key={m.month} className={`border-t ${any ? "" : "opacity-60"}`} data-testid={`fault-month-${m.month}`}>
                          <td className="p-1 font-medium">{monthLabel(m.month, "full")}</td>
                          <td className="p-1 text-center tabular-nums">{(m.msanFaults ?? m.complaints).toLocaleString("en-US")}</td>
                          <td className="p-1 text-center">
                            <Input className="h-7 w-24 text-xs text-center tabular-nums mx-auto" inputMode="numeric" data-testid={`fault-working-${m.month}`}
                              value={workingMap.get(m.month) ?? ""} placeholder={auto.faultsWorking ? String(auto.faultsWorking) : ""}
                              onChange={(e) => setMonthWork(m.month, e.target.value)} />
                          </td>
                          {show("pt", monthPerThousand(d, auto, m) ?? "—")}
                          {(["repeat", "in24"] as const).map((ind) => {
                            const manual = rawMonths(ind === "repeat" ? d.faults.repeatManual : d.faults.in24Manual).get(m.month) ?? "";
                            const calc = ind === "repeat" ? m.repeatPct : m.in24Pct;
                            return (
                              <Fragment key={ind}>
                                {show(ind, <span className="inline-flex items-center gap-0.5">
                                  <Input className={`h-7 w-16 text-xs text-center tabular-nums ${manual ? "border-[#57318A] font-bold" : ""}`} inputMode="decimal"
                                    value={manual} placeholder={calc != null ? String(calc) : "—"} title={calc != null ? `المحسوبة: ${calc}% — اكتب رقم يغلبها، وامسحه ترجع المحسوبة` : ""}
                                    onChange={(e) => setMonthRate(ind, m.month, e.target.value)} data-testid={`fault-${ind}-${m.month}`} />%
                                </span>)}
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-muted-foreground">مفيش أعطال فى الفترة دى</p>}
            {auto?.faultsByMonth?.length ? (
              <div className="text-xs space-y-0.5 text-purple-900" data-testid="fault-period-averages">
                {([["pt", "الأعطال فى الألف", ""], ["repeat", "التكرار", "%"], ["in24", "الإزالة خلال ٢٤ ساعة", "%"]] as const).map(([ind, name, unit]) => {
                  const note = periodAverageNote(d, auto, ind, unit);
                  return note ? <div key={ind}><b>{name}:</b> {note}</div> : null;
                })}
              </div>
            ) : null}
          </Section>

          <Section title="مؤشرات تركيبات الصوت" on={d.installs.enabled} onToggle={(v) => upd("installs", { enabled: v })}>
            <p className="text-xs text-muted-foreground">صف الغنايم من تقرير المنطقة الشهرى — النسبة بتتحسب لوحدها من الإجمالى.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="الشهر"><Input value={d.installs.period} onChange={(e) => upd("installs", { period: e.target.value })} placeholder="سبتمبر 2026" /></Field>
              <Field label="إجمالى التركيبات"><Input value={d.installs.total} inputMode="numeric" data-testid="installs-total" onChange={(e) => upd("installs", { total: e.target.value })} /></Field>
              <Field label="خلال 24 ساعة (العدد)"><Input value={d.installs.in24} inputMode="numeric" data-testid="installs-in24" onChange={(e) => upd("installs", { in24: e.target.value })} /></Field>
              <Field label="خلال 48 ساعة (العدد)"><Input value={d.installs.in48} inputMode="numeric" onChange={(e) => upd("installs", { in48: e.target.value })} /></Field>
              <Field label="خلال 120 ساعة (العدد)"><Input value={d.installs.in120} inputMode="numeric" onChange={(e) => upd("installs", { in120: e.target.value })} /></Field>
              <Field label="متوسط زمن التركيب (ساعة)"><Input value={d.installs.avgHours} inputMode="decimal" onChange={(e) => upd("installs", { avgHours: e.target.value })} /></Field>
              <Field label="متبقيات الأعطال (العدد)" hint="0 = «لا توجد متبقيات» · فاضى = مش ظاهرة">
                <Input value={d.installs.remaining} inputMode="numeric" data-testid="installs-remaining" onChange={(e) => upd("installs", { remaining: e.target.value })} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              النسب: {installsRows(d.installs).filter((r) => r[2]).map((r) => `${r[0].replace("التركيب ", "")} ${r[2]}`).join(" · ") || "—"}
            </p>
          </Section>

          {/* بعرض الصفحة كلها — جدول الكباين ٦ خانات */}
          <div className="lg:col-span-2">
          <Section title="خطة MSAN" on={d.msan.enabled} onToggle={(v) => upd("msan", { enabled: v })}>
            <p className="text-xs text-muted-foreground">شريحة بعد «متبقيات الأعطال» — زى شريحة المنطقة. بتظهر لما تكتب أى رقم أو كابينة.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="عنوان الشريحة"><Input value={d.msan.title} onChange={(e) => upd("msan", { title: e.target.value })} /></Field>
              <Field label="المنطقة"><Input value={d.msan.region} onChange={(e) => upd("msan", { region: e.target.value })} /></Field>
              <Field label="المتبقى — الإجمالى" hint={(() => {
                const a = parseNum(d.msan.over3), b = parseNum(d.msan.under3);
                return a != null && b != null ? `متجاوز + غير متجاوز = ${a + b}` : undefined;
              })()}><Input value={d.msan.total} inputMode="numeric" data-testid="msan-total" onChange={(e) => upd("msan", { total: e.target.value })} /></Field>
              <Field label="متجاوز ٣ شهور"><Input value={d.msan.over3} inputMode="numeric" onChange={(e) => upd("msan", { over3: e.target.value })} /></Field>
              <Field label="غير متجاوز"><Input value={d.msan.under3} inputMode="numeric" onChange={(e) => upd("msan", { under3: e.target.value })} /></Field>
              <Field label="تم التمرير MPPS فى انتظار RFS"><Input value={d.msan.mpps} onChange={(e) => upd("msan", { mpps: e.target.value })} /></Field>
              <div className="col-span-2">
                <Field label="تم إصدار RFS فى انتظار الإحلال"><Input value={d.msan.rfs} onChange={(e) => upd("msan", { rfs: e.target.value })} placeholder="مثال: 1 قطع 25 أكتوبر & 1 تحتاج تزويد 4 كروت" /></Field>
              </div>
            </div>
            <MsanEditor items={d.msan.items} onChange={(items) => upd("msan", { items })} />
          </Section>
          </div>

          <Section title="خطة الصيانة" on={d.maintenance.enabled} onToggle={(v) => upd("maintenance", { enabled: v })}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="السنة"><Input value={d.maintenance.period} onChange={(e) => upd("maintenance", { period: e.target.value })} /></Field>
              <Field label="المحقق (بكسيات)" hint={`فاضى = من برنامج الصيانة: ${auto?.maintenance?.byYear.find((y) => y.year === d.maintenance.period)?.done ?? "—"}`}>
                <Input value={d.maintenance.achievedBoxes} inputMode="numeric" data-testid="maint-achieved-boxes"
                  placeholder={String(auto?.maintenance?.byYear.find((y) => y.year === d.maintenance.period)?.done ?? "تلقائى")}
                  onChange={(e) => upd("maintenance", { achievedBoxes: e.target.value })} />
              </Field>
              <Field label="المحقق (كباين نحاس)"><Input value={d.maintenance.achievedCopper} onChange={(e) => upd("maintenance", { achievedCopper: e.target.value })} /></Field>
              <Field label="المحقق (كباين MSAN)"><Input value={d.maintenance.achievedMsan} onChange={(e) => upd("maintenance", { achievedMsan: e.target.value })} /></Field>
            </div>
            {(() => {
              // الكباين اللى اتعمل فيها ولو بكس (بتتحسب كلها) — لكل سنترال، عشان المالك يتأكد إن كل السنترالات داخلة
              const cabs = (auto?.maintenance?.cabinets || []).filter((c) => c.year === d.maintenance.period);
              if (!cabs.length) return null;
              const by = new Map<string, { n: number; boxes: number }>();
              for (const c of cabs) { const x = by.get(c.exchange) || { n: 0, boxes: 0 }; x.n++; x.boxes += c.total; by.set(c.exchange, x); }
              return (
                <p className="text-xs text-purple-900" data-testid="maint-cabinets-by-exchange">
                  الكباين اللى اتعمل فيها صيانة ({d.maintenance.period}) — بتتحسب بكل بكسياتها:{" "}
                  {[...by.entries()].map(([ex, x]) => `${ex}: ${x.n} كابينة (${x.boxes.toLocaleString("en-US")} بكس)`).join(" · ")}
                </p>
              );
            })()}
            {/* المالك ٢٠٢٦-١٠-٢١: صور الصيانة «قبل وبعد» — شريحة لكل مجموعة، لحد صورتين قبل وصورتين بعد */}
            <div className="space-y-3" data-testid="maint-photo-sets">
              <div className="font-bold text-sm text-[#5b2a86]">صور الصيانة — قبل وبعد (شريحة لكل واحدة)</div>
              {d.maintenance.photoSets.map((set, si) => {
                const setOne = (patch: Partial<MaintPhotoSet>) =>
                  upd("maintenance", { photoSets: d.maintenance.photoSets.map((x, j) => (j === si ? { ...x, ...patch } : x)) });
                return (
                  <div key={si} className="rounded-md border p-3 space-y-2" data-testid={`maint-set-${si}`}>
                    <div className="flex items-center gap-2">
                      <b className="text-sm whitespace-nowrap">سلايد {si + 1}</b>
                      <Input value={set.label} placeholder="وصف تحت الصور (مثال: الغنايم · كابينة 1-1 · بكس 5)" onChange={(e) => setOne({ label: e.target.value })} />
                      <Button type="button" variant="ghost" size="sm" title="حذف السلايد" data-testid={`maint-set-del-${si}`}
                        onClick={() => upd("maintenance", { photoSets: d.maintenance.photoSets.filter((_, j) => j !== si) })}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["before", "after"] as const).map((t) => (
                        <div key={t} className="space-y-2">
                          <div className="text-xs font-bold">{t === "before" ? "صور قبل الصيانة" : "صور بعد الصيانة"} (لحد {MAX_SET_PHOTOS})</div>
                          <Photos ids={set[t]} max={MAX_SET_PHOTOS} testId={`maint-set-${si}-${t}-upload`} onChange={(ids) => setOne({ [t]: ids.slice(0, MAX_SET_PHOTOS) } as any)} />
                          <MaintPhotoPicker room={Math.max(0, MAX_SET_PHOTOS - set[t].length)} limit={MAX_SET_PHOTOS}
                            onAdd={(ids) => setOne({ [t]: [...set[t], ...ids].slice(0, MAX_SET_PHOTOS) } as any)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {d.maintenance.photoSets.length < MAX_PHOTO_SETS && (
                <Button type="button" variant="outline" size="sm" data-testid="maint-set-add"
                  onClick={() => upd("maintenance", { photoSets: [...d.maintenance.photoSets, { label: "", before: [], after: [] }] })}>+ إضافة سلايد</Button>
              )}
            </div>
            {d.maintenance.photoIds.length > 0 && (
              <Field label="صور قديمة (من غير قبل/بعد) — بتظهر بس لو مفيش سلايدات قبل وبعد">
                <Photos ids={d.maintenance.photoIds} onChange={(ids) => upd("maintenance", { photoIds: ids })} />
              </Field>
            )}
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
            {/* المالك ٢٠٢٦-١٠-٢١: الحال عند الاستلام (١ ديسمبر ٢٠٢٥) ← دلوقتى. الخانات الفاضية ⇒ الشريحة زى الأول */}
            <div className="border-t pt-3 space-y-3">
              <b className="text-sm">المقارنة: عند الاستلام ← دلوقتى</b>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="نسبة الحجز عند الاستلام %"><Input value={d.booking.handoverPct} inputMode="decimal" data-testid="booking-handover-pct" onChange={(e) => upd("booking", { handoverPct: e.target.value })} /></Field>
                <Field label="تاريخ الاستلام"><Input value={d.booking.handoverLabel} onChange={(e) => upd("booking", { handoverLabel: e.target.value })} placeholder="ديسمبر 2025" /></Field>
              </div>
              <p className="text-xs text-muted-foreground">فك المتعذرات: المحلول من إجمالى المتعذرات = المستهدف × المحقق من المستهدف — وده الرقم الكبير فى الشريحة.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([["prev", "العام الماضى"], ["cur", "السنة دى"]] as const).map(([k, t]) => {
                  const lab = `${k}Label` as const, tg = `${k}Target` as const, ac = `${k}Achieved` as const;
                  const net = (() => { const a = parseNum(d.booking[tg]), b = parseNum(d.booking[ac]); return a != null && b != null ? `${Number(((a * b) / 100).toFixed(2))}%` : "—"; })();
                  return (
                    <div key={k} className="rounded-md border p-2 space-y-2">
                      <Field label={`اسم الفترة (${t})`}><Input value={d.booking[lab]} onChange={(e) => upd("booking", { [lab]: e.target.value } as any)} /></Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="المستهدف %"><Input value={d.booking[tg]} inputMode="decimal" data-testid={`booking-${k}-target`} onChange={(e) => upd("booking", { [tg]: e.target.value } as any)} /></Field>
                        <Field label="المحقق من المستهدف %"><Input value={d.booking[ac]} inputMode="decimal" data-testid={`booking-${k}-achieved`} onChange={(e) => upd("booking", { [ac]: e.target.value } as any)} /></Field>
                      </div>
                      <div className="text-xs">المحلول من إجمالى المتعذرات: <b className="tabular-nums">{net}</b></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="نمو قاعدة العملاء (الشغال)" on={d.customers.growth} onToggle={(v) => upd("customers", { growth: v })}>
            {(() => {
              const g = customerGrowth(d, auto);
              return g ? (
                <p className="text-sm" data-testid="customer-growth">
                  عند الاستلام ({monthLabel("2025-11", "full")}): <b className="tabular-nums">{g.from.toLocaleString("en-US")}</b> ←
                  حالياً ({monthLabel(g.toMonth, "full")}): <b className="tabular-nums">{g.to.toLocaleString("en-US")}</b> —
                  الزيادة <b className="tabular-nums text-green-700">+{g.pct}% (+{g.diff.toLocaleString("en-US")} مشترك)</b>.
                  <span className="block text-xs text-muted-foreground">الأرقام من عمود «الشغال» فى مؤشرات الأداء — والشريحة بتيجى بعد شريحة الحجز.</span>
                </p>
              ) : <p className="text-xs text-muted-foreground">محتاج شغال نوفمبر 2025 والشهر الحالى فى عمود «الشغال».</p>;
            })()}
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
