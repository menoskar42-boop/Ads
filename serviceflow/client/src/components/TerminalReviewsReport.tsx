import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Grid3x3, FileSpreadsheet, Printer, X, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@shared/schema";
import { TERMINAL_STATE_LABEL, type TerminalState } from "@shared/terminal-review";

// «مراجعة البكس ترمنال بترمنال» (docs/SF_BOX_TERMINAL_REVIEW_PLAN.md، المالك ٢٠٢٦-١١-١٢):
// فنى الصيانة بيسجّل حالة كل ترمنال على موقع الصيانة، والسيستم بيقارن بالبيانات الفنية وينقل الخطوط ويبعتها لتصحيح
// البيانات. هنا: إحصائيات للكل (ماعدا المبيعات)، والتفصيلى لفنى المنطقة (كل فيما يخصه) والسوبر أدمن.
interface Row {
  id: number; central: string; cabinet: string; box: string; capacity: number;
  reviewedBy: string | null; doneAt: string | null; techHot: number | null; dataLines: number; moves: number;
  areaDecision: string | null; areaDecidedBy: string | null; superDecision: string | null; superDecidedBy: string | null;
  canDetail: boolean;
}
interface LineInfo { phone: string; terminal?: string | null; subName?: string | null; subAdd?: string | null; lastMeasAt?: string | null; lastScore?: number | null }
interface Detail {
  review: { id: number; central: string; cabinet: string; box: string; capacity: number; reviewedBy: string | null;
    doneAt: string | null; areaDecision: string | null; areaDecidedBy: string | null; superDecision: string | null };
  techHot: number; dataLines: number; countDiff: number;
  terminals: { terminal: number; state: TerminalState | null; lines: LineInfo[] }[];
  outside: LineInfo[];
  moves: { phone: string; from: string | null; to: string; at: string }[];
  hotWithoutLine: number[];
  leftoverOnNone: { phone: string; terminal: string | null }[];
  possibleFaults: { phone: string; terminal: string | null }[];
}

const fmtDt = (d: string | null | undefined) => {
  if (!d) return "-";
  const t = new Date(d);
  if (isNaN(t.getTime())) return "-";
  return t.toLocaleString("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
};
const AREA_LABEL: Record<string, string> = { confirmed: "فنى المنطقة أكّد", cancelled: "فنى المنطقة ألغى" };
const SUPER_LABEL: Record<string, string> = { re_review: "طلب مراجعة تانية", accept_area: "اعتمد كلام فنى المنطقة" };
const diffOf = (r: Row) => (r.dataLines ?? 0) - (r.techHot ?? 0);
const STATE_CLS: Record<TerminalState, string> = {
  hot: "bg-green-100 text-green-800", wire: "bg-amber-100 text-amber-800", none: "bg-gray-100 text-gray-700",
};

const COLS = ["#", "السنترال", "الكابينة", "البكس", "السعة", "فنى الصيانة", "تاريخ المراجعة",
  "عليها حرارة (الفنى)", "خطوط البيانات (لها فريم)", "الفرق", "اتنقل تلقائياً", "فنى المنطقة", "قرار السوبر أدمن"];

export function TerminalReviewsReport() {
  const { user } = useAuth();
  const isSuper = user?.role === ROLES.SUPER_ADMIN;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [diffOnly, setDiffOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isFetching, refetch } = useQuery<{ data: Row[] }>({
    queryKey: ["/api/terminal-reviews"],
    queryFn: async () => {
      const r = await fetch("/api/terminal-reviews", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "تعذّر التحميل");
      return r.json();
    },
  });
  const rows = data?.data ?? [];
  const shown = useMemo(() => rows.filter((r) => (!diffOnly || diffOf(r) !== 0)
    && (!search.trim() || [r.central, r.cabinet, r.box, r.reviewedBy].some((v) => String(v ?? "").includes(search.trim())))),
  [rows, search, diffOnly]);

  const stats = useMemo(() => ({
    boxes: shown.length,
    hot: shown.reduce((n, r) => n + (r.techHot ?? 0), 0),
    data: shown.reduce((n, r) => n + (r.dataLines ?? 0), 0),
    diff: shown.filter((r) => diffOf(r) !== 0).length,
    moves: shown.reduce((n, r) => n + (r.moves ?? 0), 0),
  }), [shown]);

  const exportRows = () => shown.map((r, i) => [i + 1, r.central, r.cabinet, r.box, r.capacity, r.reviewedBy ?? "", fmtDt(r.doneAt),
    r.techHot ?? "", r.dataLines, diffOf(r), r.moves,
    r.areaDecision ? `${AREA_LABEL[r.areaDecision] ?? r.areaDecision} — ${r.areaDecidedBy ?? ""}` : "",
    r.superDecision ? `${SUPER_LABEL[r.superDecision] ?? r.superDecision} — ${r.superDecidedBy ?? ""}` : ""]);
  const title = "مراجعة البكس ترمنال بترمنال";
  const handleExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([COLS, ...exportRows()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "مراجعة الترمنالات");
    XLSX.writeFile(wb, `terminal-reviews-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };
  const handlePDF = () => printTablePDF({ title, columns: COLS, rows: exportRows() });

  return (
    <Card className="p-4 sm:p-5 bg-white border-0 shadow-sm" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <Grid3x3 className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        فنى الصيانة بيسجّل حالة كل ترمنال (عليه حرارة · سلك بدون حرارة · لا سلك ولا حرارة)، والسيستم بيقارنها بخطوط البكس
        اللى ليها فريم وبينقل الخطوط للترمنالات اللى عليها حرارة ويبعتها لتصحيح البيانات. لو عدد الخطوط مختلف،
        فنى المنطقة يراجع على الطبيعة ويأكّد أو يلغى.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {[["بكسيات اتراجعت", stats.boxes], ["ترمنالات عليها حرارة", stats.hot], ["خطوط فى البيانات", stats.data],
          ["بكسيات فيها فرق عدد", stats.diff], ["خطوط اتنقلت تلقائياً", stats.moves]].map(([l, v]) => (
          <div key={String(l)} className="rounded border p-2 text-center">
            <div className="text-lg font-bold tabular-nums">{Number(v).toLocaleString("ar-EG")}</div>
            <div className="text-[11px] text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="السنترال / الكابينة / البكس / الفنى" className="text-sm pr-8" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
          اللى فيها فرق عدد بس
        </label>
        <div className="flex-1" />
        {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
        <Button variant="outline" size="sm" onClick={handleExcel} disabled={!shown.length} className="gap-1 text-green-700 border-green-200">
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={handlePDF} disabled={!shown.length} className="gap-1 text-red-700 border-red-200">
          <Printer className="w-4 h-4" /> PDF
        </Button>
      </div>

      {openId != null && (
        <TerminalReviewDetail id={openId} isSuper={isSuper} onClose={() => setOpenId(null)}
          onChanged={() => { void qc.invalidateQueries({ queryKey: ["/api/terminal-reviews"] }); }} toast={toast} />
      )}

      <div className="overflow-x-auto">
        <Table className="text-right text-sm">
          <TableHeader className="bg-muted/50">
            <TableRow>{[...COLS, ""].map((c) => <TableHead key={c} className="text-right font-bold whitespace-nowrap">{c}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {!shown.length ? (
              <TableRow><TableCell colSpan={COLS.length + 1} className="text-center py-8 text-muted-foreground">
                {isFetching ? "جارٍ التحميل…" : "مفيش مراجعات خلصت لحد دلوقتى"}
              </TableCell></TableRow>
            ) : shown.map((r, i) => {
              const diff = diffOf(r);
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.central}</TableCell>
                  <TableCell>{r.cabinet}</TableCell>
                  <TableCell className="font-medium text-blue-700">{r.box}</TableCell>
                  <TableCell className="tabular-nums">{r.capacity}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.reviewedBy || "-"}</TableCell>
                  <TableCell dir="ltr" className="text-left text-xs whitespace-nowrap">{fmtDt(r.doneAt)}</TableCell>
                  <TableCell className="tabular-nums">{r.techHot ?? "-"}</TableCell>
                  <TableCell className="tabular-nums">{r.dataLines}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold tabular-nums ${diff === 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.moves}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.areaDecision ? `${AREA_LABEL[r.areaDecision]} — ${r.areaDecidedBy ?? ""}` : diff !== 0 ? <span className="text-amber-700">مستنى فنى المنطقة</span> : "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{r.superDecision ? `${SUPER_LABEL[r.superDecision]} — ${r.superDecidedBy ?? ""}` : r.areaDecision === "cancelled" ? <span className="text-amber-700">مستنى السوبر أدمن</span> : "-"}</TableCell>
                  <TableCell>
                    {r.canDetail && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpenId(r.id)}>تفصيلى</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function TerminalReviewDetail({ id, isSuper, onClose, onChanged, toast }: {
  id: number; isSuper: boolean; onClose: () => void; onChanged: () => void; toast: (x: any) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { data, isLoading, refetch } = useQuery<Detail>({
    queryKey: ["/api/terminal-reviews", id],
    queryFn: async () => {
      const r = await fetch(`/api/terminal-reviews/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || "تعذّر التحميل");
      return r.json();
    },
  });
  const act = async (path: string, decision: string, ask: string) => {
    if (!confirm(ask)) return;
    setBusy(true);
    try {
      const r: any = await (await apiRequest("POST", `/api/terminal-reviews/${id}/${path}`, { decision })).json();
      toast({ title: r?.sent ? `اتسجّل — ${r.sent} خط اتبعت لتصحيح البيانات` : "اتسجّل" });
      await refetch(); onChanged();
    } catch (e: any) {
      toast({ title: e?.message || "تعذّر الحفظ", variant: "destructive" });
    } finally { setBusy(false); }
  };
  const lineText = (l: LineInfo) => [l.phone, l.subName, l.subAdd,
    l.lastMeasAt ? `آخر قياس ${fmtDt(l.lastMeasAt)}${l.lastScore != null ? ` — اسكور ${l.lastScore}` : ""}` : "مفيش قياس"]
    .filter(Boolean).join(" · ");
  const detailRows = () => (data?.terminals ?? []).map((t) => [t.terminal, t.state ? TERMINAL_STATE_LABEL[t.state] : "-",
    t.lines.map(lineText).join(" | ") || "-"]);

  return (
    <Card className="p-3 mb-4 border-primary/40">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm">
          تفصيلى — {data?.review.central} · كابينة {data?.review.cabinet} · بوكس {data?.review.box}
        </div>
        <div className="flex gap-2">
          {data && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-red-700 border-red-200" onClick={() => printTablePDF({
              title: `مراجعة الترمنالات — ${data.review.central} كابينة ${data.review.cabinet} بوكس ${data.review.box}`,
              columns: ["الترمنال", "حالته عند فنى الصيانة", "الخطوط فى البيانات (الاسم · العنوان · آخر قياس)"], rows: detailRows(),
            })}><Printer className="w-3.5 h-3.5" /> PDF</Button>
          )}
          <Button size="sm" variant="ghost" className="h-7" onClick={onClose} aria-label="قفل التفصيلى"><X className="w-4 h-4" /></Button>
        </div>
      </div>
      {isLoading || !data ? <Loader2 className="w-5 h-5 animate-spin mx-auto my-4" /> : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-3 text-xs">
            <span>فنى الصيانة: <b>{data.review.reviewedBy || "-"}</b> · {fmtDt(data.review.doneAt)}</span>
            <span>عليها حرارة: <b>{data.techHot}</b></span>
            <span>خطوط البيانات دلوقتى: <b>{data.dataLines}</b></span>
            <span className={data.countDiff ? "text-red-700 font-bold" : "text-green-700"}>الفرق: {data.countDiff > 0 ? `+${data.countDiff}` : data.countDiff}</span>
          </div>

          {data.countDiff !== 0 && !data.review.areaDecision && (
            <div className="flex flex-wrap items-center gap-2 rounded bg-amber-50 p-2">
              <span className="text-xs">عدد الخطوط عند فنى الصيانة مختلف عن البيانات — راجع على الطبيعة:</span>
              <Button size="sm" disabled={busy} className="h-7 bg-green-700 hover:bg-green-800 text-white"
                onClick={() => act("area-decision", "confirmed", "تأكيد مراجعة فنى الصيانة؟ الفروق هتروح لتصحيح البيانات.")}>تأكيد</Button>
              <Button size="sm" disabled={busy} variant="outline" className="h-7 text-red-700 border-red-300"
                onClick={() => act("area-decision", "cancelled", "إلغاء؟ المراجعة هتفضل زى ما هى والسوبر أدمن هيقرّر.")}>إلغاء</Button>
            </div>
          )}
          {data.review.areaDecision && (
            <div className="text-xs">{AREA_LABEL[data.review.areaDecision]} — {data.review.areaDecidedBy}
              {data.review.superDecision && <> · السوبر أدمن: {SUPER_LABEL[data.review.superDecision]}</>}</div>
          )}
          {isSuper && data.review.areaDecision === "cancelled" && !data.review.superDecision && (
            <div className="flex flex-wrap items-center gap-2 rounded bg-blue-50 p-2">
              <span className="text-xs">فنى المنطقة ألغى — القرار ليك:</span>
              <Button size="sm" disabled={busy} variant="outline" className="h-7"
                onClick={() => act("super-decision", "re_review", "البكس هيرجع لفنى الصيانة يراجعه تانى؟")}>فنى الصيانة يراجع تانى</Button>
              <Button size="sm" disabled={busy} variant="outline" className="h-7"
                onClick={() => act("super-decision", "accept_area", "اعتماد كلام فنى المنطقة؟")}>اعتمد كلام فنى المنطقة</Button>
            </div>
          )}
          {data.possibleFaults.length > 0 && (
            <div className="rounded bg-red-50 p-2 text-xs">
              <b>عطل محتمل</b> — خطوط فى البيانات على ترمنال «سلك بدون حرارة»:{" "}
              {data.possibleFaults.map((l) => `${l.phone} (ترمنال ${l.terminal})`).join("، ")}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table className="text-right text-xs">
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-right">الترمنال</TableHead>
                  <TableHead className="text-right">عند فنى الصيانة</TableHead>
                  <TableHead className="text-right">الخطوط فى البيانات (الاسم · العنوان · آخر قياس)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.terminals.map((t) => (
                  <TableRow key={t.terminal}>
                    <TableCell className="font-bold">{t.terminal}</TableCell>
                    <TableCell>{t.state ? <span className={`px-2 py-0.5 rounded ${STATE_CLS[t.state]}`}>{TERMINAL_STATE_LABEL[t.state]}</span> : "-"}</TableCell>
                    <TableCell className="whitespace-normal">
                      {t.lines.length ? t.lines.map((l) => <div key={l.phone}>{lineText(l)}</div>)
                        : t.state === "hot" ? <span className="text-red-700">عليه حرارة ومفيش خط فى البيانات</span> : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data.outside.length > 0 && (
            <div className="text-xs"><b>خطوط على ترمنال مش موجود فى البكس:</b> {data.outside.map((l) => `${l.phone} (${l.terminal || "فاضى"})`).join("، ")}</div>
          )}
          <div className="text-xs">
            <b>اللى السيستم نقله وقت المراجعة:</b>{" "}
            {data.moves.length ? data.moves.map((m) => `${m.phone}: من ترمنال ${m.from || "فاضى"} إلى ${m.to} (${fmtDt(m.at)})`).join(" · ") : "مفيش"}
          </div>
        </div>
      )}
    </Card>
  );
}
