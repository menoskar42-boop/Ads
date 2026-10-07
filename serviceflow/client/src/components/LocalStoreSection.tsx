// المخزن المحلى للسلك — سنترال الغنايم (المالك ٢٠٢٦-١٠-٠٧). السيرفر: server/local-store.ts
//   • الرصيد الحالى: رصيد المخزن لكل نوع + الرصيد اللى مع كل فنى (مستلم − مستخدم)
//   • تسجيل حركة: رصيد افتتاحى / وارد من المخزن الفرعى / صرف لفنى بأمر إفراج (مسئول البيانات والسوبر أدمن)
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
import { FileSpreadsheet, Loader2, Plus, Printer, Trash2, Warehouse } from "lucide-react";
import * as XLSX from "xlsx";

type CableType = "install" | "maint";
type MoveKind = "opening" | "receipt" | "issue";
const TYPE_LABEL: Record<CableType, string> = { install: "تركيبات ونقل", maint: "صيانة" };
const KIND_LABEL: Record<MoveKind, string> = { opening: "رصيد افتتاحى", receipt: "وارد من المخزن الفرعى", issue: "صرف لفنى" };

interface TechBalance { tech: string; type: CableType; issued: number; used: number; balance: number }
interface StoreTotals { opening: number; received: number; issued: number; balance: number; lastReceipt: string | null }
interface Summary {
  startDate: string | null; store: Record<CableType, StoreTotals>; techs: TechBalance[];
  techNames: string[]; canRecord: boolean;
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

/* ───────────── تسجيل حركة ───────────── */
function MoveForm({ s }: { s: Summary }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<MoveKind>(s.startDate ? "issue" : "opening");
  const [cableType, setCableType] = useState<CableType>("install");
  const [qty, setQty] = useState("");
  const [moveDate, setMoveDate] = useState(today());
  const [refNo, setRefNo] = useState("");
  const [techName, setTechName] = useState("");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/local-store/moves", { kind, cableType, qty, moveDate, refNo, techName, note })).json(),
    onSuccess: () => {
      toast({ title: "اتسجّلت الحركة", description: `${KIND_LABEL[kind]} — ${qty} متر ${TYPE_LABEL[cableType]}${kind === "issue" ? ` للفنى ${techName}` : ""}`, duration: 4000 });
      setQty(""); setRefNo(""); setNote("");
      qc.invalidateQueries({ queryKey: ["/api/local-store"] });
    },
    onError: (e) => toast({ title: "ماتسجّلتش", description: errText(e), variant: "destructive", duration: 6000 }),
  });
  const refLabel = kind === "issue" ? "رقم أمر الإفراج" : kind === "receipt" ? "أرقام أذونات الصرف" : "مرجع (اختيارى)";
  const valid = /^\d+(\.\d+)?$/.test(qty.trim()) && Number(qty) > 0 && !!moveDate
    && (kind !== "issue" || (!!techName && !!refNo.trim())) && (kind !== "receipt" || !!refNo.trim());
  return (
    <Card className="p-4 sm:p-5 bg-white border-0 shadow-sm">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }} className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">نوع الحركة</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as MoveKind)}>
            <SelectTrigger className="text-right text-sm" dir="rtl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as MoveKind[]).map((k) => <SelectItem key={k} value={k} className="text-right">{KIND_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">نوع السلك</Label>
          <TypeSelect value={cableType} onChange={setCableType} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">الكمية (متر)</Label>
          <Input inputMode="decimal" dir="ltr" className="text-left" value={qty} placeholder="200"
            onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setQty(v); }} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">التاريخ</Label>
          <Input type="date" dir="ltr" className="text-left" value={moveDate} max={today()} onChange={(e) => setMoveDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground block mb-1">{refLabel}</Label>
          <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder={kind === "receipt" ? "مثال: 1452، 1453" : ""} />
        </div>
        {kind === "issue" ? (
          <div>
            <Label className="text-xs text-muted-foreground block mb-1">الفنى المستلم</Label>
            <Select value={techName} onValueChange={setTechName}>
              <SelectTrigger className="text-right text-sm" dir="rtl"><SelectValue placeholder="اختار الفنى" /></SelectTrigger>
              <SelectContent>{s.techNames.map((t) => <SelectItem key={t} value={t} className="text-right">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label className="text-xs text-muted-foreground block mb-1">ملاحظة (اختيارى)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-3 flex items-center gap-3 flex-wrap">
          <Button type="submit" disabled={!valid || save.isPending} className="gap-1">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} تسجيل
          </Button>
          {kind === "issue" && (
            <span className="text-xs text-muted-foreground tabular-nums">رصيد المخزن المحلى من {TYPE_LABEL[cableType]}: {fmt(s.store[cableType].balance)} متر</span>
          )}
        </div>
      </form>
    </Card>
  );
}

/* ───────────── وارد ومنصرف ───────────── */
function LedgerTab({ s }: { s: Summary }) {
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
            {s.canRecord && <TableHead />}
          </TableRow></TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell className="tabular-nums">{from}</TableCell><TableCell colSpan={5} className="font-medium">رصيد أول المدة</TableCell>
              <TableCell className="tabular-nums font-bold">{fmt(data?.openingBalance ?? 0)}</TableCell>{s.canRecord && <TableCell />}
            </TableRow>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums whitespace-nowrap">{r.moveDate}</TableCell>
                <TableCell>{KIND_LABEL[r.kind]}{r.note ? <span className="text-xs text-muted-foreground"> — {r.note}</span> : null}</TableCell>
                <TableCell>{who(r)}</TableCell>
                <TableCell className="tabular-nums">{r.refNo ?? ""}</TableCell>
                <TableCell className="tabular-nums text-green-700">{r.in ? fmt(r.in) : ""}</TableCell>
                <TableCell className="tabular-nums text-amber-700">{r.out ? fmt(r.out) : ""}</TableCell>
                <TableCell className={`tabular-nums font-bold ${r.balance < 0 ? "text-red-600" : ""}`}>{fmt(r.balance)}</TableCell>
                {s.canRecord && (
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-destructive h-7 px-2" title="إلغاء الحركة (اتسجّلت غلط)"
                      onClick={() => { if (confirm(`إلغاء الحركة: ${KIND_LABEL[r.kind]} ${fmt(r.qty)} متر بتاريخ ${r.moveDate}؟`)) del.mutate(r.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-bold">
              <TableCell className="tabular-nums">{to}</TableCell><TableCell colSpan={3}>الإجمالى / رصيد آخر المدة</TableCell>
              <TableCell className="tabular-nums text-green-700">{fmt(data?.totalIn ?? 0)}</TableCell>
              <TableCell className="tabular-nums text-amber-700">{fmt(data?.totalOut ?? 0)}</TableCell>
              <TableCell className="tabular-nums">{fmt(data?.closingBalance ?? 0)}</TableCell>{s.canRecord && <TableCell />}
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
    ...rows.map((r, i) => ({ "#": i + 1, "رقم التليفون": r.phone, "نوع العمل": r.workOrderType, "كمية السلك (متر)": r.qty, "الفنى": r.tech, "تاريخ التسجيل": r.date })),
    { "#": "", "رقم التليفون": "الإجمالى", "كمية السلك (متر)": data?.total ?? 0 },
  ]);
  const pdf = () => printTablePDF({
    title,
    columns: ["#", "رقم التليفون", "نوع العمل", "كمية السلك (متر)", "الفنى", "تاريخ التسجيل"],
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
            <TableHead className="text-right">تاريخ التسجيل</TableHead>
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

export function LocalStoreSection() {
  const { data: s, isLoading, error } = useQuery<Summary>({
    queryKey: ["/api/local-store", "summary"],
    queryFn: () => getJson("/api/local-store/summary"),
  });
  type Tab = "balances" | "move" | "ledger" | "usage";
  const [tab, setTab] = useState<Tab>("balances");
  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (error || !s) return <Card className="p-4 text-destructive">{errText(error)}</Card>;
  const TABS: { id: Tab; label: string }[] = [
    { id: "balances", label: "الرصيد الحالى" },
    ...(s.canRecord ? [{ id: "move" as Tab, label: "تسجيل حركة" }] : []),
    { id: "ledger", label: "وارد ومنصرف" },
    { id: "usage", label: "بيان الاستخدام (للاستعواض)" },
  ];
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-2">
        <Warehouse className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold">المخزن المحلى — سلك سنترال الغنايم</h2>
        {s.startDate && <span className="text-xs text-muted-foreground">من {s.startDate}</span>}
      </div>
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "balances" && <BalancesTab s={s} />}
      {tab === "move" && s.canRecord && <MoveForm s={s} />}
      {tab === "ledger" && <LedgerTab s={s} />}
      {tab === "usage" && <UsageTab s={s} />}
    </div>
  );
}
