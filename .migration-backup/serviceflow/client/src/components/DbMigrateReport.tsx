import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Database, PlugZap, Play, Square, Scale, FileSpreadsheet, FileText, CheckCircle2, XCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";

// «نقل القاعدة لـ Oracle» — للسوبر أدمن بس (المالك ٢٠٢٦-١٠-٢١). السيرفر: server/db-migrate.ts.
// بتنسخ كل الجداول من قاعدة الموقع (قراية بس) لقاعدة Oracle وبتقارن الأعداد. الموقع مابيتحوّلش من هنا.

type TableResult = { name: string; source: number; target: number | null; ok: boolean | null };
type Job = {
  state: "idle" | "running" | "done" | "failed";
  phase: string; table: string | null; tablesDone: number; tablesTotal: number; rows: number; bytes: number;
  startedAt: string | null; finishedAt: string | null; error: string | null;
  results: TableResult[]; warnings: string[]; log: { at: string; msg: string }[];
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const mb = (b: number) => `${(b / 1048576).toLocaleString("en-US", { maximumFractionDigits: 1 })} ميجا`;
const dur = (a: string | null, b: string | null) => {
  if (!a) return "";
  const s = Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function call(path: string, method = "POST") {
  const r = await fetch(`/api/admin/db-migrate/${path}`, { method, credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `خطأ ${r.status}`);
  return j;
}

export function DbMigrateReport() {
  const [probe, setProbe] = useState<any>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [cmp, setCmp] = useState<{ at: string; tables: TableResult[]; allOk: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setJob(await call("status", "GET")); } catch {}
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (job?.state !== "running") return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [job?.state, refresh]);

  const run = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(name); setErr(null);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const doProbe = run("probe", async () => setProbe(await call("probe")));
  const doStart = run("start", async () => { setCmp(null); setJob(await call("start")); });
  const doCancel = run("cancel", async () => setJob(await call("cancel")));
  const doCompare = run("compare", async () => setCmp(await call("compare")));

  const running = job?.state === "running";
  const rows: TableResult[] = cmp ? cmp.tables : job?.results || [];
  const title = cmp ? `مقارنة الأعداد دلوقتى (${new Date(cmp.at).toLocaleString("ar-EG")})` : "نتيجة آخر نسخة";
  const COLS = ["الجدول", "صفوف الموقع الحالى", "صفوف Oracle", "مطابق؟"];
  const asRow = (r: TableResult) => [r.name, r.source, r.target ?? "—", r.ok ? "✓" : "✗"];
  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(COLS.map((c, i) => [c, asRow(r)[i]]))));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نقل القاعدة");
    XLSX.writeFile(wb, `db-migrate-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const handleExportPDF = () => printTablePDF({ title: `نقل القاعدة لـ Oracle — ${title}`, columns: COLS, rows: rows.map(asRow) });
  const bad = rows.filter((r) => !r.ok);

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="p-4 space-y-3 bg-white border-0 shadow-sm">
        <h3 className="font-bold text-base flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-700" /> نقل القاعدة لـ Oracle
        </h3>
        <p className="text-sm text-muted-foreground leading-6">
          بتنسخ كل الجداول من قاعدة الموقع الحالية لقاعدة Oracle وبتقارن عدد الصفوف. القاعدة الحالية
          <b> قراية بس</b> — ولا صف فيها بيتغيّر، والموقع بيفضل شغّال عليها. كل نسخة بتمسح نسخة Oracle
          القديمة وتعملها من جديد. الشغل اللى بيتسجّل بعد النسخة مابيوصلش Oracle — فالنسخة الأخيرة قبل
          التحويل بتتعمل والطابور واقف.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={doProbe} disabled={!!busy || running} variant="outline" className="gap-1" data-testid="db-migrate-probe">
            {busy === "probe" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />} فحص الاتصال
          </Button>
          <Button onClick={doStart} disabled={!!busy || running || !probe?.canCopy} className="gap-1" data-testid="db-migrate-start">
            {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} ابدأ النسخ لـ Oracle
          </Button>
          {running && (
            <Button onClick={doCancel} disabled={!!busy} variant="outline" className="gap-1 text-red-700 border-red-200" data-testid="db-migrate-cancel">
              <Square className="w-4 h-4" /> إيقاف
            </Button>
          )}
          <Button onClick={doCompare} disabled={!!busy || running} variant="outline" className="gap-1" data-testid="db-migrate-compare">
            {busy === "compare" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />} قارن الأعداد دلوقتى
          </Button>
        </div>
        {err && <div className="text-sm text-red-700 bg-red-50 rounded p-2" data-testid="db-migrate-error">{err}</div>}
      </Card>

      {probe && (
        <Card className="p-4 bg-white border-0 shadow-sm text-sm space-y-2" data-testid="db-migrate-probe-result">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="font-bold mb-1">قاعدة الموقع الحالية</div>
              <div>Postgres {probe.source?.version} · {fmt(probe.source?.sizeMb)} ميجا · {fmt(probe.source?.tables)} جدول · حوالى {fmt(probe.source?.rowsEstimate)} صف</div>
              <div>زمن الرد: <b data-testid="db-migrate-source-ms">{probe.source?.pingMs} ms</b></div>
              {!!probe.source?.extensions?.length && <div>إضافات: {probe.source.extensions.join("، ")}</div>}
            </div>
            <div>
              <div className="font-bold mb-1">قاعدة Oracle</div>
              {!probe.targetConfigured ? <div className="text-red-700">السر مش متحط</div>
                : probe.target?.error ? <div className="text-red-700">{probe.target.error}</div>
                : <>
                    <div>Postgres {probe.target.version} · {probe.target.db} · {probe.target.user} · التشفير: {probe.target.ssl ? "شغّال ✓" : "مقفول ✗"}</div>
                    <div>زمن الرد: <b data-testid="db-migrate-target-ms">{probe.target.pingMs} ms</b> · الحجم {fmt(probe.target.sizeMb)} ميجا · {fmt(probe.target.tables)} جدول</div>
                    <div>آخر نسخة: {probe.target.lastCopy
                      ? `${new Date(probe.target.lastCopy.started_at).toLocaleString("ar-EG")} — ${probe.target.lastCopy.ok ? "كاملة ✓" : "ماكملتش ✗"}`
                      : "مفيش"}</div>
                  </>}
            </div>
          </div>
          <div className={probe.canCopy ? "text-green-700 font-bold" : "text-red-700 font-bold"} data-testid="db-migrate-can-copy">
            {probe.canCopy ? "جاهز للنسخ ✓" : "النسخ مقفول: " + probe.reasons.join(" · ")}
          </div>
        </Card>
      )}

      {job && job.state !== "idle" && (
        <Card className="p-4 bg-white border-0 shadow-sm text-sm space-y-1" data-testid="db-migrate-job">
          <div className="flex items-center gap-2 font-bold" data-testid="db-migrate-state">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : job.state === "done" ? <CheckCircle2 className="w-4 h-4 text-green-700" /> : <XCircle className="w-4 h-4 text-red-700" />}
            {running ? "النسخ شغّال" : job.state === "done" ? "النسخ خلص" : "النسخ وقف"} — {job.phase}
          </div>
          <div>الجداول: {job.tablesDone} من {job.tablesTotal}{job.table ? ` · دلوقتى: ${job.table}` : ""}</div>
          <div>الصفوف: {fmt(job.rows)} · البيانات: {mb(job.bytes)} · الوقت: {dur(job.startedAt, job.finishedAt)}</div>
          {job.error && <div className="text-red-700">{job.error}</div>}
          {job.warnings.map((w, i) => <div key={i} className="text-amber-700">{w}</div>)}
        </Card>
      )}

      {!!rows.length && (
        <Card className="p-4 bg-white border-0 shadow-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-sm" data-testid="db-migrate-summary">
              {title}: {rows.length} جدول — {bad.length ? <span className="text-red-700">{bad.length} مختلف</span> : <span className="text-green-700">كلهم مطابقين ✓</span>}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExportExcel} size="sm" variant="outline" className="text-green-700 border-green-200 gap-1">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </Button>
              <Button onClick={handleExportPDF} size="sm" variant="outline" className="text-red-700 border-red-200 gap-1">
                <FileText className="w-4 h-4" /> PDF
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <Table>
              <TableHeader><TableRow>{COLS.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {[...bad, ...rows.filter((r) => r.ok)].map((r) => (
                  <TableRow key={r.name} className={r.ok ? "" : "bg-red-50"}>
                    <TableCell dir="ltr" className="text-right font-mono text-xs">{r.name}</TableCell>
                    <TableCell>{fmt(r.source)}</TableCell>
                    <TableCell>{fmt(r.target)}</TableCell>
                    <TableCell>{r.ok ? "✓" : "✗"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
