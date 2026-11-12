// «الخرائط» فى برنامج الكوابل (المالك ٢٠٢٦-١١-١٢): خريطة الشبكة الثانوية (كهربى مش مساحى) — صورتها وجداول التفريغ:
// الكابلات (من/إلى · الطول · السعة · القطر · dead) · البكسيات (البلوك · فرعات الخرج · الوصلة · الاسم) · الاسبير · علامات الوصل.
// أى خانة اتقرت من الصورة ومش أكيدة عليها «يتراجع» لحد ما حد يراجعها على الورقة ويشيل العلامة.
// التعديل للأدمن ومهندس الكوابل والمشرف (السيرفر بيتحقق). الخطة: docs/CABLES_SECONDARY_MAP_PLAN.md
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import ExcelJS from "exceljs";
import { withBase } from "@/lib/base-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/cfm/components/ui/card";
import { Button } from "@/cfm/components/ui/button";
import { Input } from "@/cfm/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/cfm/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/cfm/components/ui/tabs";
import { useToast } from "@/cfm/hooks/use-toast";
import { Map as MapIcon, Plus, Save, Trash2, Upload, FileSpreadsheet, ArrowRight, AlertTriangle, Image as ImageIcon } from "lucide-react";
import type { CableMapData, MapSegment, MapBox, MapSpare, MapMarker } from "@shared/cfm-maps/types";
import { distancesFromCabinet, nodeLabel } from "@shared/cfm-maps/types";

interface MapListItem { id: number; central: string; cabinet: string; title: string; boxes: number; segments: number; images: number; updatedAt: string; updatedBy: string | null }
interface MapImage { id: number; caption: string | null; mime: string; size: number }
interface MapDetail { id: number; central: string; cabinet: string; title: string; data: CableMapData; images: MapImage[]; canEdit: boolean; updatedAt: string; updatedBy: string | null }

const api = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "حصل خطأ");
  return j;
};

type Col<T> = { key: keyof T; label: string; type?: "num" | "text" | "bool"; width?: string };

/** جدول بيتعدّل فى مكانه: كل خانة input لو فيه صلاحية، والصف اللى عليه uncertain لونه مختلف */
function EditTable<T extends { uncertain?: boolean; notes?: string }>({ rows, cols, edit, onChange, extra }: {
  rows: T[]; cols: Col<T>[]; edit: boolean; onChange: (rows: T[]) => void; extra?: (r: T) => React.ReactNode;
}) {
  const set = (i: number, k: keyof T, v: any) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            {cols.map((c) => <TableHead key={String(c.key)} style={{ minWidth: c.width }}>{c.label}</TableHead>)}
            {extra && <TableHead>المسافة من الكابينة</TableHead>}
            <TableHead>ملاحظات</TableHead>
            <TableHead>مراجعة</TableHead>
            {edit && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} className={r.uncertain ? "bg-amber-50" : ""}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              {cols.map((c) => (
                <TableCell key={String(c.key)}>
                  {edit ? (
                    <Input dir="ltr" className="h-8 min-w-[70px]" value={(r[c.key] as any) ?? ""}
                      onChange={(e) => set(i, c.key, c.type === "num" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />
                  ) : <span dir="auto">{(r[c.key] as any) ?? "—"}</span>}
                </TableCell>
              ))}
              {extra && <TableCell className="font-mono">{extra(r)}</TableCell>}
              <TableCell className="min-w-[200px] text-xs">
                {edit ? <Input className="h-8" value={r.notes || ""} onChange={(e) => set(i, "notes", e.target.value)} /> : r.notes || ""}
              </TableCell>
              <TableCell>
                {r.uncertain ? (
                  edit ? (
                    <Button size="sm" variant="outline" className="h-7 text-amber-700 border-amber-300" onClick={() => set(i, "uncertain", false)}>
                      يتراجع ✓ راجعته
                    </Button>
                  ) : <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-bold"><AlertTriangle className="w-3 h-3" />يتراجع</span>
                ) : <span className="text-emerald-700 text-xs">✓</span>}
              </TableCell>
              {edit && (
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="حذف الصف">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const SEG_COLS: Col<MapSegment>[] = [
  { key: "from", label: "من" }, { key: "to", label: "إلى" }, { key: "lengthM", label: "الطول (م)", type: "num" },
  { key: "pairs", label: "السعة (زوج)", type: "num" }, { key: "gaugeMm", label: "القطر (مم)", type: "num" },
  { key: "dead", label: "dead", type: "num" }, { key: "cablePairs", label: "الأزواج على الكابل" }, { key: "marker", label: "علامة الوصل" },
];
const BOX_COLS: Col<MapBox>[] = [
  { key: "box", label: "البكس" }, { key: "block", label: "البلوك" }, { key: "pairs", label: "فرعات الخرج" },
  { key: "joint", label: "الوصلة" }, { key: "nameAr", label: "الاسم", width: "140px" }, { key: "nameEn", label: "Name", width: "140px" },
  { key: "symbol", label: "الرمز" },
];
const SPARE_COLS: Col<MapSpare>[] = [
  { key: "joint", label: "الوصلة" }, { key: "count", label: "العدد", type: "num" }, { key: "block", label: "البلوك" },
  { key: "pairs", label: "الأزواج" }, { key: "cablePairs", label: "الأزواج على الكابل" },
];
const MARKER_COLS: Col<MapMarker & { uncertain?: boolean }>[] = [
  { key: "name", label: "العلامة" }, { key: "from", label: "من" }, { key: "to", label: "إلى" },
];

async function exportExcel(m: MapDetail, data: CableMapData) {
  const wb = new ExcelJS.Workbook();
  const d = distancesFromCabinet(data);
  const add = (name: string, header: string[], rows: any[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true }] });
    ws.addRow(header).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => { c.width = 16; });
  };
  add("الكابلات", ["من", "إلى", "الطول م", "السعة", "القطر مم", "dead", "الأزواج على الكابل", "علامة", "يتراجع", "ملاحظات"],
    data.segments.map((s) => [nodeLabel(s.from), nodeLabel(s.to), s.lengthM, s.pairs, s.gaugeMm, s.dead ?? "", s.cablePairs || "", s.marker || "", s.uncertain ? "يتراجع" : "", s.notes || ""]));
  add("البكسيات", ["البكس", "البلوك", "فرعات الخرج", "الوصلة", "الاسم", "Name", "الرمز", "المسافة من الكابينة م", "يتراجع", "ملاحظات"],
    data.boxes.map((b) => [b.box, b.block, b.pairs, nodeLabel(b.joint), b.nameAr || "", b.nameEn || "", b.symbol || "", d["B" + b.box] ?? "", b.uncertain ? "يتراجع" : "", b.notes || ""]));
  add("الاسبير", ["الوصلة", "العدد", "البلوك", "الأزواج", "الأزواج على الكابل", "ملاحظات"],
    data.spares.map((s) => [nodeLabel(s.joint), s.count, s.block, s.pairs, s.cablePairs || "", s.notes || ""]));
  add("علامات الوصل", ["العلامة", "من", "إلى", "ملاحظات"], data.markers.map((x) => [x.name, nodeLabel(x.from), nodeLabel(x.to), x.notes || ""]));
  add("بيانات الخريطة", ["البند", "القيمة"], Object.entries(data.meta).map(([k, v]) => [k, String(v ?? "")]).concat((data.notes || []).map((n) => ["ملاحظة", n])));
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = `خريطة-${m.central}-${m.cabinet}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function MapView({ id }: { id: number }) {
  const { toast } = useToast();
  const [m, setM] = useState<MapDetail | null>(null);
  const [data, setData] = useState<CableMapData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = () => api(`/api/cfm/maps/${id}`).then((x: MapDetail) => { setM(x); setData(x.data); setDirty(false); })
    .catch((e) => toast({ variant: "destructive", title: e.message }));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dist = useMemo(() => (data ? distancesFromCabinet(data) : {}), [data]);
  if (!m || !data) return <div className="p-10 text-center text-muted-foreground">جارٍ التحميل…</div>;
  const edit = m.canEdit;
  const change = (patch: Partial<CableMapData>) => { setData({ ...data, ...patch }); setDirty(true); };
  const uncertain = [...data.segments, ...data.boxes, ...data.spares].filter((x: any) => x.uncertain).length;
  const save = async () => {
    setSaving(true);
    try { await api(`/api/cfm/maps/${id}`, { method: "PUT", body: JSON.stringify({ data }) }); toast({ title: "اتحفظت ✓" }); await load(); }
    catch (e: any) { toast({ variant: "destructive", title: e.message }); }
    finally { setSaving(false); }
  };
  const upload = async (files: FileList | null) => {
    for (const f of Array.from(files || [])) {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(f); });
      try { await api(`/api/cfm/maps/${id}/images`, { method: "POST", body: JSON.stringify({ mime: f.type, base64, caption: f.name }) }); }
      catch (e: any) { toast({ variant: "destructive", title: `${f.name}: ${e.message}` }); }
    }
    await load();
  };
  const delImage = async (imageId: number) => {
    if (!confirm("تمسح الصورة دى من الخريطة؟")) return;
    try { await api(`/api/cfm/maps/${id}/images/${imageId}`, { method: "DELETE" }); await load(); } catch (e: any) { toast({ variant: "destructive", title: e.message }); }
  };
  const meta = data.meta;
  const setMeta = (k: keyof typeof meta, v: string) => change({ meta: { ...meta, [k]: v } });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link href="/maps"><Button variant="ghost" size="sm" className="gap-1"><ArrowRight className="w-4 h-4" />كل الخرائط</Button></Link>
          <h1 className="text-2xl font-bold">خريطة {meta.central} — كابينة {meta.cabinet}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {uncertain > 0 && <span className="text-sm text-amber-700 font-semibold inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{uncertain} خانة محتاجة مراجعة</span>}
          <Button variant="outline" className="gap-2 text-emerald-700" onClick={() => void exportExcel(m, data)}><FileSpreadsheet className="w-4 h-4" />Excel</Button>
          {edit && <Button className="gap-2" disabled={!dirty || saving} onClick={save}><Save className="w-4 h-4" />{saving ? "بيتحفظ…" : dirty ? "حفظ التعديلات" : "محفوظ"}</Button>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">بيانات الخريطة</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          {([["central", "السنترال"], ["cabinet", "الكابينة"], ["cabinetCodes", "أكواد الكابينة"], ["location", "المكان"], ["area", "المنطقة"],
            ["maker", "الجهة"], ["title", "العنوان"], ["scale", "مقياس الرسم"], ["notes", "ملاحظات"]] as [keyof typeof meta, string][]).map(([k, l]) => (
            <label key={k} className="block">
              <span className="text-muted-foreground text-xs">{l}</span>
              {edit ? <Input className="h-8" value={meta[k] || ""} onChange={(e) => setMeta(k, e.target.value)} /> : <div className="font-medium">{meta[k] || "—"}</div>}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">صور الخريطة ({m.images.length})</CardTitle>
          {edit && (
            <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer border rounded-md px-3 py-1.5 hover:bg-muted">
              <Upload className="w-4 h-4" />إضافة صور
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
            </label>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {m.images.length === 0 && <p className="text-muted-foreground text-sm">مفيش صور لسه.</p>}
          {m.images.map((img) => {
            // withBase: تحت oscardevs.com/serviceflow/ الصورة لازم تتطلب بمسار الجذر (الـimg مابيعدّيش على لفّة fetch)
            const src = withBase(`/api/cfm/maps/${id}/images/${img.id}`);
            return (
              <figure key={img.id} className="w-full sm:w-[48%] border rounded-lg overflow-hidden">
                <a href={src} target="_blank" rel="noreferrer" title="افتح الصورة كاملة">
                  <img src={src} alt={img.caption || "صورة الخريطة"} className="w-full max-h-[520px] object-contain bg-white" loading="lazy" />
                </a>
                <figcaption className="flex items-center justify-between gap-2 p-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" />{img.caption || "صورة"} — اضغط على الصورة تتفتح كاملة</span>
                  {edit && <Button size="sm" variant="ghost" className="h-6 text-red-600" onClick={() => void delImage(img.id)}>مسح</Button>}
                </figcaption>
              </figure>
            );
          })}
        </CardContent>
      </Card>

      <Tabs defaultValue="boxes">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="boxes">البكسيات ({data.boxes.length})</TabsTrigger>
          <TabsTrigger value="segments">الكابلات ({data.segments.length})</TabsTrigger>
          <TabsTrigger value="spares">الاسبير ({data.spares.length})</TabsTrigger>
          <TabsTrigger value="markers">علامات الوصل ({data.markers.length})</TabsTrigger>
          <TabsTrigger value="notes">ملاحظات</TabsTrigger>
        </TabsList>
        <TabsContent value="boxes">
          <Card><CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">المسافة من الكابينة = مجموع أطوال الكابلات على المسار لحد البكس. لو أى قطعة فى المسار عليها «يتراجع» المسافة تقريبية.</p>
            <EditTable rows={data.boxes} cols={BOX_COLS} edit={edit} onChange={(boxes) => change({ boxes })}
              extra={(b) => (dist["B" + b.box] != null ? `${dist["B" + b.box]} م` : "—")} />
            {edit && <Button variant="outline" size="sm" className="gap-1" onClick={() => change({ boxes: [...data.boxes, { box: "", block: "", pairs: "", joint: "" }] })}><Plus className="w-4 h-4" />بكس</Button>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="segments">
          <Card><CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">الأماكن: CAB = الكابينة · J10 = وصلة 10 · B28 = بكس 28. «الأزواج على الكابل» بترقيم الكابل نفسه عند الوصلة.</p>
            <EditTable rows={data.segments} cols={SEG_COLS} edit={edit} onChange={(segments) => change({ segments })} />
            {edit && <Button variant="outline" size="sm" className="gap-1" onClick={() => change({ segments: [...data.segments, { from: "", to: "", lengthM: null, pairs: null, gaugeMm: 0.4 }] })}><Plus className="w-4 h-4" />كابل</Button>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="spares">
          <Card><CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">«10*SP» على الخريطة = اسبير ١٠ أزواج فى الوصلة (مش بكس).</p>
            <EditTable rows={data.spares} cols={SPARE_COLS} edit={edit} onChange={(spares) => change({ spares })} />
            {edit && <Button variant="outline" size="sm" className="gap-1" onClick={() => change({ spares: [...data.spares, { joint: "", count: 10, block: "", pairs: "" }] })}><Plus className="w-4 h-4" />اسبير</Button>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="markers">
          <Card><CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">خط أفقى عليه نفس الحرف مرتين (A–A · B–B) = الكابل متكمّل من العلامة الأولى للتانية.</p>
            <EditTable rows={data.markers as any} cols={MARKER_COLS} edit={edit} onChange={(markers) => change({ markers })} />
            {edit && <Button variant="outline" size="sm" className="gap-1" onClick={() => change({ markers: [...data.markers, { name: "", from: "", to: "" }] })}><Plus className="w-4 h-4" />علامة</Button>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="notes">
          <Card><CardContent className="pt-4 space-y-2">
            {(data.notes || []).map((n, i) => (
              <div key={i} className="flex gap-2 items-start">
                {edit ? <Input value={n} onChange={(e) => change({ notes: (data.notes || []).map((x, j) => (j === i ? e.target.value : x)) })} /> : <p className="text-sm">• {n}</p>}
                {edit && <Button size="icon" variant="ghost" className="text-red-600" onClick={() => change({ notes: (data.notes || []).filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>}
              </div>
            ))}
            {edit && <Button variant="outline" size="sm" className="gap-1" onClick={() => change({ notes: [...(data.notes || []), ""] })}><Plus className="w-4 h-4" />ملاحظة</Button>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">آخر تعديل: {new Date(m.updatedAt).toLocaleString("ar-EG")}{m.updatedBy ? ` — ${m.updatedBy}` : ""}</p>
    </div>
  );
}

function MapList() {
  const { toast } = useToast();
  const [, go] = useLocation();
  const [items, setItems] = useState<MapListItem[] | null>(null);
  const [central, setCentral] = useState("");
  const [cabinet, setCabinet] = useState("");
  useEffect(() => { api("/api/cfm/maps").then((j) => setItems(j.items)).catch((e) => toast({ variant: "destructive", title: e.message })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    try { const j = await api("/api/cfm/maps", { method: "POST", body: JSON.stringify({ central, cabinet }) }); go(`/maps/${j.id}`); }
    catch (e: any) { toast({ variant: "destructive", title: e.message }); }
  };
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><MapIcon className="w-6 h-6" />الخرائط</h1>
        <p className="text-sm text-muted-foreground mt-1">خرايط الشبكة الثانوية (من الكابينة للبكسيات): صورة الخريطة وجداول الكابلات والوصلات والبكسيات.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items === null && <p className="text-muted-foreground">جارٍ التحميل…</p>}
        {items?.length === 0 && <p className="text-muted-foreground">مفيش خرايط لسه.</p>}
        {items?.map((x) => (
          <Link key={x.id} href={`/maps/${x.id}`}>
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardHeader><CardTitle className="text-lg">{x.central} — كابينة {x.cabinet}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>{x.boxes} بكس · {x.segments} كابل · {x.images} صورة</div>
                <div className="text-xs">{x.title}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">خريطة جديدة</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <Input className="w-48" placeholder="السنترال" value={central} onChange={(e) => setCentral(e.target.value)} />
          <Input className="w-40" placeholder="رقم الكابينة" value={cabinet} onChange={(e) => setCabinet(e.target.value)} />
          <Button className="gap-1" onClick={create}><Plus className="w-4 h-4" />إنشاء</Button>
          <span className="text-xs text-muted-foreground">(للأدمن ومهندس الكوابل والمشرف)</span>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Maps() {
  const [match, params] = useRoute("/maps/:id");
  return match && params?.id ? <MapView id={Number(params.id)} /> : <MapList />;
}
