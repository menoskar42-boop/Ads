// المخزن المحلى للسلك — سنترال الغنايم (المالك ٢٠٢٦-١٠-٠٧). السيرفر: server/local-store.ts
//   • الرصيد الحالى: رصيد المخزن لكل نوع + الرصيد اللى مع كل فنى (مستلم − مستخدم)
//   • تسجيل حركة: رصيد افتتاحى / وارد من المخزن الفرعى / صرف لفنى بأمر إفراج (مسئول البيانات والسوبر أدمن)
//     — صفحة رئيسية بزراير كبيرة وكل حركة خطوات واضحة (مسئول البيانات خبرته فى الكمبيوتر قليلة)
//   • وارد ومنصرف: دفتر المخزن المحلى بالتواريخ والكميات والرصيد بعد كل حركة
//   • بيان الاستخدام: كل تركيب/صيانة بكمية السلك — بيتطبع ويتطلب بيه الاستعواض من المخزن الفرعى
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { printTablePDF } from "@/lib/print-pdf";
import { AlertTriangle, ArrowRight, ClipboardList, Pencil, BookOpen, Boxes, CheckCircle2, FileSpreadsheet, FileText, Loader2, PackageMinus, PackagePlus, Printer, Trash2, Users, Warehouse } from "lucide-react";
import * as XLSX from "xlsx";

type CableType = "install" | "maint";
type MoveKind = "opening" | "receipt" | "issue";
const TYPE_LABEL: Record<CableType, string> = { install: "تركيبات ونقل", maint: "صيانة" };
const KIND_LABEL: Record<MoveKind, string> = { opening: "رصيد افتتاحى", receipt: "وارد من المخزن الفرعى", issue: "صرف لفنى" };

interface TechBalance { tech: string; type: CableType; issued: number; used: number; balance: number }
interface StoreTotals { opening: number; received: number; issued: number; balance: number; lastReceipt: string | null }
interface Summary {
  startDate: string | null; store: Record<CableType, StoreTotals>; techs: TechBalance[];
  techNames: string[]; canRecord: boolean; canEditOpening?: boolean; canEditMoves?: boolean; unassigned: Record<CableType, number>;
}
interface LedgerRow {
  id: number; kind: MoveKind; qty: number; moveDate: string; refNo: string | null; techName: string | null;
  note: string | null; createdByName: string; in: number; out: number; balance: number;
}
interface Ledger { openingBalance: number; rows: LedgerRow[]; totalIn: number; totalOut: number; closingBalance: number }
interface UsageRow { id: number; phone: string; workOrderType: string; qty: number; tech: string; date: string; enteredBy: string }

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const monthStart = () => today().slice(0, 8) + "01";
const nextDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US");
const errText = (e: any) => {
  let msg = e?.message || "حدث خطأ";
  const m = String(msg).match(/^\d+:\s*(.*)$/s);
  if (m) msg = m[1];
  try { const j = JSON.parse(msg); if (j?.message) msg = j.message; } catch { /* نص عادى */ }
  return msg;
};
const getJson = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(errText({ message: `${res.status}: ${await res.text()}` }));
  return res.json();
};
const exportExcel = (sheet: string, file: string, rows: Record<string, unknown>[]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
  XLSX.writeFile(wb, `${file}-${today()}.xlsx`);
};

function ExportButtons({ onExcel, onPdf, disabled }: { onExcel: () => void; onPdf: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onExcel} disabled={disabled} className="text-green-700 border-green-200 gap-1">
        <FileSpreadsheet className="w-4 h-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={onPdf} disabled={disabled} className="text-red-700 border-red-200 gap-1">
        <Printer className="w-4 h-4" /> PDF
      </Button>
    </div>
  );
}

const TypeSelect = ({ value, onChange }: { value: CableType; onChange: (v: CableType) => void }) => (
  <Select value={value} onValueChange={(v) => onChange(v as CableType)}>
    <SelectTrigger className="text-right text-sm" dir="rtl"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="install" className="text-right">{TYPE_LABEL.install}</SelectItem>
      <SelectItem value="maint" className="text-right">{TYPE_LABEL.maint}</SelectItem>
    </SelectContent>
  </Select>
);

/* ───────────── الرصيد الحالى ───────────── */
function BalancesTab({ s }: { s: Summary }) {
  const rows = s.techs;
  const excel = () => exportExcel("أرصدة الفنيين", "local-store-balances", [
    ...(["install", "maint"] as CableType[]).map((t) => ({
      "البند": `رصيد المخزن المحلى — ${TYPE_LABEL[t]}`, "مستلم/وارد": s.store[t].opening + s.store[t].received,
      "مستخدم/منصرف": s.store[t].issued, "الرصيد": s.store[t].balance,
    })),
    ...rows.map((r) => ({ "البند": `${r.tech} — ${TYPE_LABEL[r.type]}`, "مستلم/وارد": r.issued, "مستخدم/منصرف": r.used, "الرصيد": r.balance })),
  ]);
  const pdf = () => printTablePDF({
    title: `المخزن المحلى — الرصيد الحالى (${today()})`,
    columns: ["البند", "نوع السلك", "مستلم / وارد", "مستخدم / منصرف", "الرصيد (متر)"],
    rows: [
      ...(["install", "maint"] as CableType[]).map((t) => ["المخزن المحلى", TYPE_LABEL[t], fmt(s.store[t].opening + s.store[t].received), fmt(s.store[t].issued), fmt(s.store[t].balance)]),
      ...rows.map((r) => [r.tech, TYPE_LABEL[r.type], fmt(r.issued), fmt(r.used), fmt(r.balance)]),
    ],
    rowsPerPage: 20,
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["install", "maint"] as CableType[]).map((t) => (
          <Card key={t} className="p-4 bg-white border-0 shadow-sm">
            <div className="text-sm text-muted-foreground">رصيد المخزن المحلى — {TYPE_LABEL[t]}</div>
            <div className={`text-3xl font-bold tabular-nums mt-1 ${s.store[t].balance < 0 ? "text-red-600" : "text-foreground"}`}>
              {fmt(s.store[t].balance)} <span className="text-base font-normal text-muted-foreground">متر</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2 tabular-nums">
              افتتاحى {fmt(s.store[t].opening)} · وارد {fmt(s.store[t].received)} · منصرف للفنيين {fmt(s.store[t].issued)}
              {s.store[t].lastReceipt ? ` · آخر وارد ${s.store[t].lastReceipt}` : ""}
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden shadow-sm border-0 bg-white">
        <div className="p-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-bold">الرصيد اللى مع كل فنى</div>
          <ExportButtons onExcel={excel} onPdf={pdf} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-right">الفنى</TableHead>
              <TableHead className="text-right">نوع السلك</TableHead>
              <TableHead className="text-right">مستلم بأوامر إفراج</TableHead>
              <TableHead className="text-right">مستخدم (استكمال البيانات)</TableHead>
              <TableHead className="text-right">الرصيد معاه</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.tech}-${r.type}`}>
                  <TableCell className="font-medium">{r.tech}</TableCell>
                  <TableCell>{TYPE_LABEL[r.type]}</TableCell>
                  <TableCell className="tabular-nums">{fmt(r.issued)}</TableCell>
                  <TableCell className="tabular-nums">{fmt(r.used)}</TableCell>
                  <TableCell className={`tabular-nums font-bold ${r.balance < 0 ? "text-red-600 bg-red-50" : ""}`}>{fmt(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!s.startDate && (
          <p className="p-3 text-xs text-muted-foreground border-t">المخزن لسه مابدأش — سجّل الرصيد الافتتاحى من «تسجيل حركة». الاستخدام بيتخصم من الفنيين من يوم أول حركة.</p>
        )}
      </Card>
    </div>
  );
}

/* ───────────── تسجيل حركة — خطوات واضحة لمسئول البيانات ─────────────
 * المالك ٢٠٢٦-١٠-٠٧: «الاستخدام يبقى سهل وواضح جداً». فكل حركة صفحة لوحدها: زراير كبيرة
 * بدل القوائم، كل خانة مكتوب جنبها هى إيه، جملة بتقول هيتسجّل إيه بالظبط قبل الحفظ،
 * والناقص مكتوب بالاسم بدل زرار مقفول من غير سبب. */
const BigChoice = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className={`min-h-[52px] px-5 py-3 rounded-xl border-2 text-base font-bold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-slate-200 bg-white hover:border-primary/50"}`}>
    {children}
  </button>
);
const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2 text-base font-bold">
      <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm tabular-nums">{n}</span>
      {title}
    </div>
    <div className="pr-9">{children}</div>
  </div>
);

function MoveForm({ s, kind, onDone }: { s: Summary; kind: MoveKind; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cableType, setCableType] = useState<CableType | "">("");
  const [qty, setQty] = useState("");
  const [moveDate, setMoveDate] = useState(today());
  const [refNo, setRefNo] = useState("");
  const [techName, setTechName] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/local-store/moves", { kind, cableType, qty, moveDate, refNo, techName, note })).json(),
    onSuccess: () => { setSaved(sentence); qc.invalidateQueries({ queryKey: ["/api/local-store"] }); },
    onError: (e) => toast({ title: "ماتسجّلش", description: errText(e), variant: "destructive", duration: 8000 }),
  });
  const isIssue = kind === "issue", isReceipt = kind === "receipt";
  const qtyOk = /^\d+(\.\d+)?$/.test(qty.trim()) && Number(qty) > 0;
  const missing = [
    !cableType && "نوع السلك",
    isIssue && !techName && "الفنى",
    !qtyOk && "الكمية",
    isIssue && !refNo.trim() && "رقم أمر الإفراج",
    isReceipt && !refNo.trim() && "رقم إذن الصرف",
    !moveDate && "التاريخ",
  ].filter(Boolean) as string[];
  const typeText = cableType ? `سلك ${TYPE_LABEL[cableType]}` : "سلك";
  const sentence = isIssue
    ? `صرف ${qty || "؟"} متر ${typeText} للفنى ${techName || "؟"} — أمر إفراج رقم ${refNo.trim() || "؟"} — بتاريخ ${moveDate}`
    : isReceipt
      ? `استلام ${qty || "؟"} متر ${typeText} من المخزن الفرعى — إذن صرف رقم ${refNo.trim() || "؟"} — بتاريخ ${moveDate}`
      : `رصيد أول مرة: ${qty || "؟"} متر ${typeText} موجود فى المخزن المحلى يوم ${moveDate}`;
  const after = cableType ? s.store[cableType].balance : 0;
  const title = isIssue ? "صرف سلك لفنى" : isReceipt ? "استلام سلك من المخزن الفرعى" : "رصيد أول مرة (الموجود فى المخزن دلوقتى)";

  if (saved) {
    return (
      <Card className="p-6 sm:p-8 bg-white border-0 shadow-sm text-center space-y-4">
        <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" />
        <div className="text-xl font-bold">اتسجّل</div>
        <div className="text-base">{saved}</div>
        <div className="flex justify-center gap-3 flex-wrap pt-2">
          <Button size="lg" onClick={() => { setSaved(null); setQty(""); setRefNo(""); setNote(""); setTechName(""); }}>تسجيل حركة تانية من نفس النوع</Button>
          <Button size="lg" variant="outline" onClick={onDone}>رجوع للصفحة الرئيسية</Button>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5 sm:p-7 bg-white border-0 shadow-sm space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xl font-bold">{title}</h3>
        <Button variant="ghost" onClick={onDone} className="gap-1"><ArrowRight className="w-4 h-4" /> رجوع</Button>
      </div>
      <Step n={1} title="نوع السلك">
        <div className="flex gap-3 flex-wrap">
          <BigChoice active={cableType === "install"} onClick={() => setCableType("install")}>سلك تركيبات ونقل</BigChoice>
          <BigChoice active={cableType === "maint"} onClick={() => setCableType("maint")}>سلك صيانة</BigChoice>
        </div>
        {isIssue && cableType && (
          <p className="text-sm text-muted-foreground mt-2 tabular-nums">موجود فى المخزن المحلى دلوقتى: <strong className={after <= 0 ? "text-red-600" : "text-foreground"}>{fmt(after)} متر</strong></p>
        )}
      </Step>
      {isIssue && (
        <Step n={2} title="الفنى اللى استلم">
          <div className="flex gap-3 flex-wrap">
            {s.techNames.map((t) => <BigChoice key={t} active={techName === t} onClick={() => setTechName(t)}>{t}</BigChoice>)}
          </div>
        </Step>
      )}
      <Step n={isIssue ? 3 : 2} title="الكمية بالمتر">
        <div className="flex items-center gap-3 flex-wrap">
          <Input inputMode="decimal" dir="ltr" value={qty} placeholder="مثال: 200"
            onChange={(e) => { const v = e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))); if (v === "" || /^\d*\.?\d*$/.test(v)) setQty(v); }}
            className="w-40 h-12 text-xl text-center tabular-nums" />
          <span className="text-base">متر</span>
          {isIssue && <Button type="button" variant="outline" onClick={() => setQty("200")}>لفة كاملة (200 متر)</Button>}
        </div>
      </Step>
      {(isIssue || isReceipt) && (
        <Step n={isIssue ? 4 : 3} title={isIssue ? "رقم أمر الإفراج" : "رقم إذن الصرف"}>
          <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} className="w-full sm:w-80 h-12 text-lg" dir="ltr"
            placeholder={isReceipt ? "مثال: 1452 - 1453" : "مثال: 55"} />
          {isReceipt && <p className="text-sm text-muted-foreground mt-1">لو الكمية جت بأكتر من إذن، اكتب الأرقام كلها ورا بعض.</p>}
        </Step>
      )}
      <Step n={isIssue ? 5 : isReceipt ? 4 : 3} title="التاريخ">
        <div className="flex items-center gap-3 flex-wrap">
          <Input type="date" dir="ltr" value={moveDate} max={today()} onChange={(e) => setMoveDate(e.target.value)} className="w-52 h-12 text-lg" />
          {moveDate === today()
            ? <span className="text-sm text-muted-foreground">النهارده — غيّره بس لو {isIssue ? "الصرف" : "الاستلام"} كان يوم تانى</span>
            : <Button type="button" variant="ghost" onClick={() => setMoveDate(today())}>رجّعه للنهارده</Button>}
        </div>
      </Step>
      {!isIssue && (
        <Step n={isReceipt ? 5 : 4} title="ملاحظة (مش ضرورى)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="w-full sm:w-96 h-11" />
        </Step>
      )}
      <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-base leading-relaxed">
        <div className="text-sm text-muted-foreground mb-1">هيتسجّل:</div>
        <div className="font-bold">{sentence}</div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button size="lg" className="h-12 px-8 text-lg gap-2 bg-green-600 hover:bg-green-700" disabled={!!missing.length || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} تأكيد وحفظ
        </Button>
        {missing.length > 0 && <span className="text-base text-amber-700">ناقص: {missing.join("، ")}</span>}
      </div>
    </Card>
  );
}

/* ───────────── شغل محتاج تحديد الفنى ───────────── */
function UnassignedView({ s, onDone }: { s: Summary; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<CableType>(s.unassigned.install ? "install" : "maint");
  const { data, isFetching } = useQuery<{ rows: UsageRow[] }>({
    queryKey: ["/api/local-store", "usage", type, "__none__"],
    queryFn: () => getJson(`/api/local-store/usage?type=${type}&tech=__none__`),
  });
  const assign = useMutation({
    mutationFn: async ({ id, tech }: { id: number; tech: string }) => (await apiRequest("POST", `/api/local-store/entries/${id}/tech`, { tech })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/local-store"] }); toast({ title: "اتحدّد الفنى", duration: 2500 }); },
    onError: (e) => toast({ title: "ماتحدّدش", description: errText(e), variant: "destructive" }),
  });
  const rows = data?.rows ?? [];
  return (
    <Card className="p-5 sm:p-7 bg-white border-0 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xl font-bold">شغل محتاج تحدّد الفنى</h3>
        <Button variant="ghost" onClick={onDone} className="gap-1"><ArrowRight className="w-4 h-4" /> رجوع</Button>
      </div>
      <p className="text-base text-muted-foreground">
        الكميات دى اتسجّلت وفنى الإغلاق مش من الفنيين الخمسة. دوس على اسم الفنى اللى استخدم السلك عشان يتخصم من رصيده.
      </p>
      <div className="flex gap-3 flex-wrap">
        <BigChoice active={type === "install"} onClick={() => setType("install")}>تركيبات ونقل ({s.unassigned.install})</BigChoice>
        <BigChoice active={type === "maint"} onClick={() => setType("maint")}>صيانة ({s.unassigned.maint})</BigChoice>
        {isFetching && <Loader2 className="w-5 h-5 animate-spin self-center" />}
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border p-3 flex flex-wrap items-center gap-3">
            <div className="min-w-[180px]">
              <div className="font-mono text-lg" dir="ltr">{r.phone}</div>
              <div className="text-sm text-muted-foreground tabular-nums">{r.workOrderType} · {fmt(r.qty)} متر · {r.date}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {s.techNames.map((t) => (
                <Button key={t} variant="outline" disabled={assign.isPending} onClick={() => assign.mutate({ id: r.id, tech: t })}>{t}</Button>
              ))}
            </div>
          </div>
        ))}
        {!rows.length && !isFetching && <p className="text-center text-muted-foreground py-6">مفيش حاجة محتاجة تحديد</p>}
      </div>
    </Card>
  );
}

/* ───────────── تعديل حركة اتسجّلت غلط (السوبر أدمن — المالك ٢٠٢٦-١٠-٠٧) ───────────── */
function EditMoveRow({ r, s, cols, onDone }: { r: LedgerRow; s: Summary; cols: number; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(r.qty));
  const [moveDate, setMoveDate] = useState(r.moveDate);
  const [refNo, setRefNo] = useState(r.refNo ?? "");
  const [techName, setTechName] = useState(r.techName ?? "");
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/local-store/moves/${r.id}`, { qty, moveDate, refNo, techName })).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/local-store"] }); toast({ title: "اتعدّلت الحركة", duration: 3000 }); onDone(); },
    onError: (e) => toast({ title: "ماتعدّلتش", description: errText(e), variant: "destructive", duration: 7000 }),
  });
  const ok = /^\d+(\.\d+)?$/.test(qty.trim()) && Number(qty) > 0 && !!moveDate
    && (r.kind === "opening" || !!refNo.trim()) && (r.kind !== "issue" || !!techName);
  return (
    <TableRow className="bg-amber-50/60">
      <TableCell colSpan={cols}>
        <div className="flex items-end gap-2 flex-wrap" data-testid={`edit-move-${r.id}`}>
          <span className="text-sm font-bold self-center">تعديل {KIND_LABEL[r.kind]}:</span>
          <div><Label className="text-xs text-muted-foreground block mb-1">التاريخ</Label>
            <Input type="date" dir="ltr" value={moveDate} max={today()} onChange={(e) => setMoveDate(e.target.value)} className="h-9 w-40" /></div>
          <div><Label className="text-xs text-muted-foreground block mb-1">الكمية (متر)</Label>
            <Input inputMode="decimal" dir="ltr" value={qty} className="h-9 w-24 text-center"
              onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setQty(v); }} /></div>
          {r.kind !== "opening" && (
            <div><Label className="text-xs text-muted-foreground block mb-1">{r.kind === "issue" ? "رقم أمر الإفراج" : "أرقام أذونات الصرف"}</Label>
              <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} className="h-9 w-40" dir="ltr" /></div>
          )}
          {r.kind === "issue" && (
            <div className="w-36"><Label className="text-xs text-muted-foreground block mb-1">الفنى</Label>
              <Select value={techName} onValueChange={setTechName}>
                <SelectTrigger className="text-right text-sm h-9" dir="rtl"><SelectValue placeholder="اختار الفنى" /></SelectTrigger>
                <SelectContent>{s.techNames.map((t) => <SelectItem key={t} value={t} className="text-right">{t}</SelectItem>)}</SelectContent>
              </Select></div>
          )}
          <Button size="sm" className="h-9" disabled={!ok || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} حفظ التعديل
          </Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={onDone}>إلغاء</Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ───────────── وارد ومنصرف ───────────── */
function LedgerTab({ s }: { s: Summary }) {
  const [editing, setEditing] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<CableType>("install");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const { data, isFetching } = useQuery<Ledger>({
    queryKey: ["/api/local-store", "moves", type, from, to],
    queryFn: () => getJson(`/api/local-store/moves?type=${type}&from=${from}&to=${to}`),
  });
  const del = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/local-store/moves/${id}`)).json(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/local-store"] }); toast({ title: "اتلغت الحركة", duration: 3000 }); },
    onError: (e) => toast({ title: "ماتلغتش", description: errText(e), variant: "destructive" }),
  });
  const rows = data?.rows ?? [];
  const who = (r: LedgerRow) => (r.kind === "issue" ? r.techName : r.kind === "receipt" ? "المخزن الفرعى" : "—");
  const title = `وارد ومنصرف المخزن المحلى — سلك ${TYPE_LABEL[type]} من ${from} إلى ${to}`;
  const excel = () => exportExcel("وارد ومنصرف", `local-store-ledger-${type}`, [
    { "التاريخ": from, "البيان": "رصيد أول المدة", "الرصيد": data?.openingBalance ?? 0 },
    ...rows.map((r) => ({ "التاريخ": r.moveDate, "البيان": KIND_LABEL[r.kind], "من / إلى": who(r), "رقم الإذن / أمر الإفراج": r.refNo ?? "", "وارد": r.in || "", "منصرف": r.out || "", "الرصيد": r.balance, "سجّلها": r.createdByName })),
    { "التاريخ": to, "البيان": "الإجمالى / رصيد آخر المدة", "وارد": data?.totalIn ?? 0, "منصرف": data?.totalOut ?? 0, "الرصيد": data?.closingBalance ?? 0 },
  ]);
  const pdf = () => printTablePDF({
    title,
    columns: ["التاريخ", "البيان", "من / إلى", "رقم الإذن / أمر الإفراج", "وارد", "منصرف", "الرصيد"],
    rows: [
      [from, "رصيد أول المدة", "", "", "", "", fmt(data?.openingBalance ?? 0)],
      ...rows.map((r) => [r.moveDate, KIND_LABEL[r.kind], who(r), r.refNo ?? "", r.in ? fmt(r.in) : "", r.out ? fmt(r.out) : "", fmt(r.balance)]),
      [to, "الإجمالى / رصيد آخر المدة", "", "", fmt(data?.totalIn ?? 0), fmt(data?.totalOut ?? 0), fmt(data?.closingBalance ?? 0)],
    ],
    rowsPerPage: 18,
  });
  return (
    <Card className="overflow-hidden shadow-sm border-0 bg-white">
      <div className="p-3 border-b flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-40"><Label className="text-xs text-muted-foreground block mb-1">نوع السلك</Label><TypeSelect value={type} onChange={setType} /></div>
          <div><Label className="text-xs text-muted-foreground block mb-1">من</Label><Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs text-muted-foreground block mb-1">إلى</Label><Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {isFetching && <Loader2 className="w-4 h-4 animate-spin mb-3" />}
        </div>
        <ExportButtons onExcel={excel} onPdf={pdf} disabled={!data} />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">البيان</TableHead>
            <TableHead className="text-right">من / إلى</TableHead>
            <TableHead className="text-right">رقم الإذن / أمر الإفراج</TableHead>
            <TableHead className="text-right">وارد</TableHead>
            <TableHead className="text-right">منصرف</TableHead>
            <TableHead className="text-right">الرصيد</TableHead>
            {s.canEditMoves && <TableHead />}
          </TableRow></TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell className="tabular-nums">{from}</TableCell><TableCell colSpan={5} className="font-medium">رصيد أول المدة</TableCell>
              <TableCell className="tabular-nums font-bold">{fmt(data?.openingBalance ?? 0)}</TableCell>{s.canEditMoves && <TableCell />}
            </TableRow>
            {rows.flatMap((r) => [
              <TableRow key={r.id}>
                <TableCell className="tabular-nums whitespace-nowrap">{r.moveDate}</TableCell>
                <TableCell>{KIND_LABEL[r.kind]}{r.note ? <span className="text-xs text-muted-foreground"> — {r.note}</span> : null}</TableCell>
                <TableCell>{who(r)}</TableCell>
                <TableCell className="tabular-nums">{r.refNo ?? ""}</TableCell>
                <TableCell className="tabular-nums text-green-700">{r.in ? fmt(r.in) : ""}</TableCell>
                <TableCell className="tabular-nums text-amber-700">{r.out ? fmt(r.out) : ""}</TableCell>
                <TableCell className={`tabular-nums font-bold ${r.balance < 0 ? "text-red-600" : ""}`}>{fmt(r.balance)}</TableCell>
                {s.canEditMoves && (
                  <TableCell className="whitespace-nowrap">
                    <Button variant="ghost" size="sm" className="h-7 px-2" title="تعديل الحركة (اتسجّلت غلط)"
                      onClick={() => setEditing(r.id)} data-testid={`button-edit-move-${r.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive h-7 px-2" title="إلغاء الحركة (اتسجّلت غلط)"
                      onClick={() => { if (confirm(`إلغاء الحركة: ${KIND_LABEL[r.kind]} ${fmt(r.qty)} متر بتاريخ ${r.moveDate}؟`)) del.mutate(r.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>,
              editing === r.id && s.canEditMoves
                ? <EditMoveRow key={`edit-${r.id}`} r={r} s={s} cols={8} onDone={() => setEditing(null)} />
                : null,
            ])}
            <TableRow className="bg-muted/40 font-bold">
              <TableCell className="tabular-nums">{to}</TableCell><TableCell colSpan={3}>الإجمالى / رصيد آخر المدة</TableCell>
              <TableCell className="tabular-nums text-green-700">{fmt(data?.totalIn ?? 0)}</TableCell>
              <TableCell className="tabular-nums text-amber-700">{fmt(data?.totalOut ?? 0)}</TableCell>
              <TableCell className="tabular-nums">{fmt(data?.closingBalance ?? 0)}</TableCell>{s.canEditMoves && <TableCell />}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* ───────────── بيان الاستخدام (للاستعواض) ───────────── */
function UsageTab({ s }: { s: Summary }) {
  const [type, setType] = useState<CableType>("install");
  // الافتراضى: من اليوم اللى بعد آخر وارد (اللى اتعوّض قبل كده) — أو من بداية المخزن
  const defaultFrom = (t: CableType) => (s.store[t].lastReceipt ? nextDay(s.store[t].lastReceipt!) : s.startDate ?? monthStart());
  const [from, setFrom] = useState(defaultFrom("install"));
  const [to, setTo] = useState(today());
  const [tech, setTech] = useState("all");
  const { data, isFetching } = useQuery<{ rows: UsageRow[]; total: number; startDate: string | null }>({
    queryKey: ["/api/local-store", "usage", type, from, to, tech],
    queryFn: () => getJson(`/api/local-store/usage?type=${type}&from=${from}&to=${to}${tech !== "all" ? `&tech=${encodeURIComponent(tech)}` : ""}`),
  });
  const rows = data?.rows ?? [];
  const byTech = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.tech, (m.get(r.tech) || 0) + (Number(r.qty) || 0));
    return [...m.entries()];
  }, [rows]);
  const title = `بيان ${type === "install" ? "التركيبات والنقل" : "أعمال الصيانة"} وكمية السلك — من ${from} إلى ${to}`;
  const excel = () => exportExcel("بيان الاستخدام", `local-store-usage-${type}`, [
    ...rows.map((r, i) => ({ "#": i + 1, "رقم التليفون": r.phone, "نوع العمل": r.workOrderType, "كمية السلك (متر)": r.qty, "الفنى": r.tech, "تاريخ الإغلاق": r.date })),
    { "#": "", "رقم التليفون": "الإجمالى", "كمية السلك (متر)": data?.total ?? 0 },
  ]);
  const pdf = () => printTablePDF({
    title,
    columns: ["#", "رقم التليفون", "نوع العمل", "كمية السلك (متر)", "الفنى", "تاريخ الإغلاق"],
    rows: [...rows.map((r, i) => [i + 1, r.phone, r.workOrderType, fmt(r.qty), r.tech, r.date]), ["", "الإجمالى", "", fmt(data?.total ?? 0), "", ""]],
    rowsPerPage: 22,
  });
  return (
    <Card className="overflow-hidden shadow-sm border-0 bg-white">
      <div className="p-3 border-b flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-40"><Label className="text-xs text-muted-foreground block mb-1">نوع السلك</Label>
            <TypeSelect value={type} onChange={(t) => { setType(t); setFrom(defaultFrom(t)); }} /></div>
          <div><Label className="text-xs text-muted-foreground block mb-1">من</Label><Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs text-muted-foreground block mb-1">إلى</Label><Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="w-36"><Label className="text-xs text-muted-foreground block mb-1">الفنى</Label>
            <Select value={tech} onValueChange={setTech}>
              <SelectTrigger className="text-right text-sm" dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                {s.techNames.map((t) => <SelectItem key={t} value={t} className="text-right">{t}</SelectItem>)}
              </SelectContent>
            </Select></div>
          {isFetching && <Loader2 className="w-4 h-4 animate-spin mb-3" />}
        </div>
        <ExportButtons onExcel={excel} onPdf={pdf} disabled={!rows.length} />
      </div>
      <div className="px-3 py-2 text-sm flex flex-wrap gap-x-4 gap-y-1 border-b bg-muted/30 tabular-nums">
        <span>الإجمالى: <strong>{fmt(data?.total ?? 0)}</strong> متر فى <strong>{rows.length}</strong> {type === "install" ? "تركيب/نقل" : "عطل"}</span>
        {byTech.map(([t, q]) => <span key={t} className="text-muted-foreground">{t}: {fmt(q)}</span>)}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-right">#</TableHead>
            <TableHead className="text-right">رقم التليفون</TableHead>
            <TableHead className="text-right">نوع العمل</TableHead>
            <TableHead className="text-right">كمية السلك (متر)</TableHead>
            <TableHead className="text-right">الفنى</TableHead>
            <TableHead className="text-right">تاريخ الإغلاق</TableHead>
            <TableHead className="text-right">سجّلها</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums">{i + 1}</TableCell>
                <TableCell className="font-mono" dir="ltr">{r.phone}</TableCell>
                <TableCell>{r.workOrderType}</TableCell>
                <TableCell className="tabular-nums font-bold">{fmt(r.qty)}</TableCell>
                <TableCell>{r.tech}</TableCell>
                <TableCell className="tabular-nums">{r.date}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{r.enteredBy}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">مفيش استخدام مسجّل فى الفترة دى</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="p-3 text-xs text-muted-foreground border-t">
        البيان ده بيتطبع ويتطلب بيه استعواض الكمية من المخزن الفرعى. لما الكمية توصل سجّلها من «تسجيل حركة» ← «وارد من المخزن الفرعى» بأرقام أذونات الصرف.
      </p>
    </Card>
  );
}

/* ───────────── تعديل الرصيد الافتتاحى (السوبر أدمن — المالك ٢٠٢٦-١٠-٠٧) ───────────── */
function OpeningEditor({ type, opening }: { type: CableType; opening: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(opening));
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/local-store/opening", { cableType: type, qty })).json(),
    onSuccess: (d: any) => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["/api/local-store"] });
      toast({ title: "اتعدّل الرصيد الافتتاحى", description: `سلك ${TYPE_LABEL[type]}: كان ${fmt(d.oldQty)} — بقى ${fmt(d.qty)} متر`, duration: 5000 });
    },
    onError: (e) => toast({ title: "ماتعدّلش", description: errText(e), variant: "destructive" }),
  });
  if (!editing) {
    return (
      <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
        الرصيد الافتتاحى: <b className="text-foreground">{fmt(opening)} متر</b>
        <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => { setQty(String(opening)); setEditing(true); }}
          data-testid={`button-edit-opening-${type}`}><Pencil className="w-3.5 h-3.5" /> تعديل</Button>
      </div>
    );
  }
  const ok = /^\d+(\.\d+)?$/.test(qty.trim());
  return (
    <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap text-sm">
      <span>الرصيد الافتتاحى:</span>
      <Input inputMode="decimal" dir="ltr" value={qty} className="w-28 h-9 text-center tabular-nums"
        onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setQty(v); }} />
      <span>متر</span>
      <Button size="sm" disabled={!ok || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} حفظ
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
      <span className="w-full text-xs text-muted-foreground">رصيد المخزن بيتحسب من جديد على الرقم ده، والقيمة القديمة بتتكتب ملاحظة على الرصيد الافتتاحى فى دفتر الوارد والمنصرف.</span>
    </div>
  );
}

/* ───────────── سجل الحركات بمين سجّلها (السوبر أدمن — المالك ٢٠٢٦-١٠-٠٧) ───────────── */
interface RegisterRow {
  id: number; kind: MoveKind; cableType: CableType; qty: number; moveDate: string; refNo: string | null; techName: string | null;
  note: string | null; createdByName: string; createdAt: string; deletedByName: string | null; deletedAt: string | null;
}
function RegisterView() {
  const [kind, setKind] = useState<"all" | MoveKind>("all");
  const [type, setType] = useState<"all" | CableType>("all");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [showDeleted, setShowDeleted] = useState(false);
  const params = new URLSearchParams({ from, to, ...(kind !== "all" ? { kind } : {}), ...(type !== "all" ? { type } : {}), ...(showDeleted ? { deleted: "1" } : {}) });
  const { data, isFetching } = useQuery<{ rows: RegisterRow[] }>({
    queryKey: ["/api/local-store", "register", kind, type, from, to, showDeleted],
    queryFn: () => getJson(`/api/local-store/register?${params}`),
  });
  const rows = data?.rows ?? [];
  const status = (r: RegisterRow) => (r.deletedAt ? `ملغاة — ${r.deletedByName ?? ""} ${r.deletedAt}` : "سارية");
  const active = rows.filter((r) => !r.deletedAt);
  const sum = (k: MoveKind) => active.filter((r) => r.kind === k).reduce((a, r) => a + r.qty, 0);
  const COLS = ["#", "التاريخ", "الحركة", "نوع السلك", "الكمية (متر)", "الفنى المستلم", "رقم الإفراج / الإذن", "ملاحظة", "سجّلها", "وقت التسجيل", "الحالة"];
  const cells = (r: RegisterRow, i: number) => [i + 1, r.moveDate, KIND_LABEL[r.kind], TYPE_LABEL[r.cableType], fmt(r.qty), r.techName ?? "", r.refNo ?? "", r.note ?? "", r.createdByName, r.createdAt, status(r)];
  const title = `سجل حركات المخزن المحلى — من ${from} إلى ${to}`;
  const excel = () => exportExcel("سجل الحركات", "local-store-register", rows.map((r, i) => Object.fromEntries(COLS.map((c, j) => [c, cells(r, i)[j]]))));
  const pdf = () => printTablePDF({ title, columns: COLS, rows: rows.map(cells), rowsPerPage: 16 });
  return (
    <Card className="overflow-hidden shadow-sm border-0 bg-white">
      <div className="p-3 border-b flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-44"><Label className="text-xs text-muted-foreground block mb-1">الحركة</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger className="text-right text-sm" dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                <SelectItem value="issue" className="text-right">الإفراجات للفنيين</SelectItem>
                <SelectItem value="receipt" className="text-right">الوارد وأذونات الصرف</SelectItem>
                <SelectItem value="opening" className="text-right">الرصيد الافتتاحى</SelectItem>
              </SelectContent>
            </Select></div>
          <div className="w-40"><Label className="text-xs text-muted-foreground block mb-1">نوع السلك</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger className="text-right text-sm" dir="rtl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-right">الكل</SelectItem>
                <SelectItem value="install" className="text-right">{TYPE_LABEL.install}</SelectItem>
                <SelectItem value="maint" className="text-right">{TYPE_LABEL.maint}</SelectItem>
              </SelectContent>
            </Select></div>
          <div><Label className="text-xs text-muted-foreground block mb-1">من</Label><Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs text-muted-foreground block mb-1">إلى</Label><Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <label className="flex items-center gap-1 text-sm mb-2"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> اعرض الملغى والمتعدّل</label>
          {isFetching && <Loader2 className="w-4 h-4 animate-spin mb-3" />}
        </div>
        <ExportButtons onExcel={excel} onPdf={pdf} disabled={!rows.length} />
      </div>
      <div className="px-3 py-2 text-sm flex flex-wrap gap-x-4 gap-y-1 border-b bg-muted/30 tabular-nums">
        <span>إفراجات: <b>{fmt(sum("issue"))}</b> متر</span>
        <span>وارد: <b>{fmt(sum("receipt"))}</b> متر</span>
        <span>رصيد افتتاحى: <b>{fmt(sum("opening"))}</b> متر</span>
        <span className="text-muted-foreground">({active.length} حركة سارية)</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>{COLS.map((c) => <TableHead key={c} className="text-right whitespace-nowrap">{c}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id} className={r.deletedAt ? "opacity-60 line-through decoration-red-400" : ""}>
                {cells(r, i).map((c, j) => (
                  <TableCell key={j} className={j === 7 ? "min-w-[180px] text-xs" : j === 10 && r.deletedAt ? "text-red-700 whitespace-nowrap no-underline" : "whitespace-nowrap tabular-nums"}>{c || "—"}</TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length && !isFetching && (
              <TableRow><TableCell colSpan={COLS.length} className="text-center text-muted-foreground py-6">مفيش حركات فى الفترة دى</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

type View = "home" | "opening" | "receipt" | "issue" | "balances" | "ledger" | "usage" | "unassigned" | "register";

const ActionTile = ({ icon: Icon, title, hint, onClick, tone }: { icon: any; title: string; hint: string; onClick: () => void; tone: string }) => (
  <button type="button" onClick={onClick}
    className={`text-right rounded-2xl border-2 p-5 min-h-[120px] flex items-start gap-4 transition-colors bg-white hover:shadow-md ${tone}`}>
    <Icon className="w-9 h-9 shrink-0 mt-1" />
    <span>
      <span className="block text-lg font-bold">{title}</span>
      <span className="block text-sm text-muted-foreground mt-1 leading-relaxed">{hint}</span>
    </span>
  </button>
);

export function LocalStoreSection() {
  const { data: s, isLoading, error } = useQuery<Summary>({
    queryKey: ["/api/local-store", "summary"],
    queryFn: () => getJson("/api/local-store/summary"),
  });
  const [view, setView] = useState<View>("home");
  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (error || !s) return <Card className="p-4 text-destructive">{errText(error)}</Card>;
  const home = () => setView("home");
  const back = (
    <Button variant="ghost" onClick={home} className="gap-1"><ArrowRight className="w-4 h-4" /> رجوع للصفحة الرئيسية</Button>
  );
  const unassignedTotal = s.unassigned.install + s.unassigned.maint;
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-2">
        <Warehouse className="w-6 h-6 text-primary" />
        <h2 className="text-lg font-bold">المخزن المحلى — سلك سنترال الغنايم</h2>
      </div>

      {view === "home" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["install", "maint"] as CableType[]).map((t) => (
              <Card key={t} className="p-5 bg-white border-0 shadow-sm">
                <div className="text-base text-muted-foreground">موجود فى المخزن من سلك {TYPE_LABEL[t]}</div>
                <div className={`text-4xl font-bold tabular-nums mt-1 ${s.store[t].balance < 0 ? "text-red-600" : ""}`}>
                  {fmt(s.store[t].balance)} <span className="text-lg font-normal text-muted-foreground">متر</span>
                </div>
                {s.canEditOpening && <OpeningEditor type={t} opening={s.store[t].opening} />}
              </Card>
            ))}
          </div>

          {!s.canRecord && (
            <div className="text-sm text-muted-foreground">عرض فقط — تسجيل حركات المخزن لمسئول البيانات.</div>
          )}

          {unassignedTotal > 0 && s.canRecord && (
            <button type="button" onClick={() => setView("unassigned")}
              className="w-full text-right rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-center gap-3 text-amber-900">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <span className="text-base font-bold">فيه {unassignedTotal} شغل محتاج تحدّد الفنى بتاعه — دوس هنا</span>
            </button>
          )}

          {s.canRecord && (
            <div className="space-y-3">
              <div className="text-lg font-bold">عايز تعمل إيه؟</div>
              {!s.startDate && (
                <ActionTile icon={Boxes} title="أول مرة: سجّل الموجود فى المخزن" tone="border-blue-300 text-blue-900"
                  hint="قبل أى حاجة — اكتب كمية السلك الموجودة فى المخزن المحلى دلوقتى (لكل نوع مرة)." onClick={() => setView("opening")} />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <ActionTile icon={PackagePlus} title="استلمت سلك من المخزن الفرعى" tone="border-green-300 text-green-900"
                  hint="لما المخزن الفرعى يبعت سلك — بأرقام أذونات الصرف." onClick={() => setView("receipt")} />
                <ActionTile icon={PackageMinus} title="صرفت سلك لفنى" tone="border-orange-300 text-orange-900"
                  hint="لما فنى يستلم سلك من المخزن المحلى — بأمر الإفراج." onClick={() => setView("issue")} />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-lg font-bold">التقارير</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ActionTile icon={Users} title="الرصيد اللى مع كل فنى" tone="border-slate-200 text-slate-900"
                hint="استلم كام — استخدم كام — فاضل معاه كام." onClick={() => setView("balances")} />
              <ActionTile icon={BookOpen} title="دفتر الوارد والمنصرف" tone="border-slate-200 text-slate-900"
                hint={s.canEditMoves ? "كل حركات المخزن بالرصيد بعد كل حركة — ومنه تعدّل أو تلغى أى إفراج أو إذن اتسجّل غلط." : "كل حركات المخزن بالتاريخ والرصيد بعد كل حركة."} onClick={() => setView("ledger")} />
              <ActionTile icon={FileText} title="بيان التركيبات للاستعواض" tone="border-slate-200 text-slate-900"
                hint="التركيبات والصيانة بكمية السلك — يتطبع ويتطلب بيه سلك من المخزن الفرعى." onClick={() => setView("usage")} />
              {s.canEditMoves && (
                <ActionTile icon={ClipboardList} title="سجل الإفراجات والوارد" tone="border-purple-200 text-purple-900"
                  hint="كل إفراج طلع لفنى وكل وارد بأذونات صرفه — ومين سجّل كل حركة وإمتى، والملغى بمين ألغاه." onClick={() => setView("register")} />
              )}
            </div>
          </div>
          {s.canRecord && s.startDate && (
            <div className="text-sm text-muted-foreground">
              المخزن شغّال من {s.startDate}.{" "}
              <button type="button" className="underline" onClick={() => setView("opening")}>إضافة رصيد أول مرة لنوع تانى</button>
            </div>
          )}
        </>
      )}

      {(view === "opening" || view === "receipt" || view === "issue") && s.canRecord && <MoveForm key={view} s={s} kind={view} onDone={home} />}
      {view === "unassigned" && s.canRecord && <UnassignedView s={s} onDone={home} />}
      {view === "balances" && <>{back}<BalancesTab s={s} /></>}
      {view === "ledger" && <>{back}<LedgerTab s={s} /></>}
      {view === "usage" && <>{back}<UsageTab s={s} /></>}
      {view === "register" && s.canEditMoves && <>{back}<RegisterView /></>}
    </div>
  );
}
