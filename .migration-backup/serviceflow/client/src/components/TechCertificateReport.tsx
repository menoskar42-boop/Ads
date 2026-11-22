// شهادات تقدير الفنيين (المالك ٢٠٢٦-١١-٠٥) — فى «إنشاء جداول»: اسم الفنى + شهر التقدير + المركز ⇒ شهادة
// بنفس نموذج المالك، وتتحفظ PDF من نافذة الطباعة (زى باقى التقارير). كذا فنى ⇒ كل واحد صفحة.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Award, FileSpreadsheet, Printer, Plus, X } from "lucide-react";
import { certificateHtml, defaultIssued, monthParts, rankLabel, RANKS, type CertItem } from "@/lib/tech-certificate";

const prevMonth = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function TechCertificateReport() {
  const [month, setMonth] = useState(prevMonth);
  const [issued, setIssued] = useState("");             // فاضى = أول الشهر اللى بعده
  const [jobTitle, setJobTitle] = useState("فنــي");
  const [rows, setRows] = useState<CertItem[]>([{ name: "", rank: 1 }]);

  const { data: techList = [] } = useQuery<{ workerCode: string; techName: string }[]>({
    queryKey: ["/api/technician-names"],
    queryFn: async () => {
      const r = await fetch("/api/technician-names", { credentials: "include" });
      if (!r.ok) throw new Error("فشل");
      return r.json();
    },
  });
  const techNames = useMemo(
    () => Array.from(new Set(techList.map((t) => t.techName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ar")),
    [techList],
  );

  const ready = rows.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim() }));
  const opts = (toolbar: boolean) => ({
    month, issued: issued || defaultIssued(month), jobTitle, toolbar,
    logoUrl: `${window.location.origin}/we-logo.png`,
  });
  const preview = useMemo(
    () => certificateHtml([ready[0] ?? { name: "اسم الفنى", rank: rows[0]?.rank ?? 1 }], opts(false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ready[0]), rows[0]?.rank, month, issued, jobTitle],
  );

  const setRow = (i: number, patch: Partial<CertItem>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { name: "", rank: Math.min(RANKS.length, (rs[rs.length - 1]?.rank ?? 0) + 1) }]);

  const handleExportPDF = () => {
    if (!ready.length) return;
    const w = window.open("", "_blank");
    if (w) { w.document.write(certificateHtml(ready, opts(true))); w.document.close(); }
  };
  const handleExportExcel = () => {
    const { name, year } = monthParts(month);
    const ws = XLSX.utils.json_to_sheet(ready.map((r) => ({ "الفنى": r.name, "المركز": rankLabel(r.rank), "الشهر": `${name} ${year}` })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "شهادات التقدير");
    XLSX.writeFile(wb, `certificates-${month}.xlsx`);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="p-4 bg-white border-0 shadow-sm space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="text-base font-bold w-full sm:w-auto flex items-center gap-2"><Award className="w-5 h-5 text-purple-700" /> شهادات تقدير الفنيين</h2>
          <label className="text-sm">شهر التقدير
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="block border rounded-md text-sm px-2 py-1.5 bg-white" data-testid="input-cert-month" />
          </label>
          <label className="text-sm">تاريخ التحرير
            <input type="date" value={issued || defaultIssued(month)} onChange={(e) => setIssued(e.target.value)}
              className="block border rounded-md text-sm px-2 py-1.5 bg-white" />
          </label>
          <label className="text-sm">الوظيفة
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="w-28 text-sm" />
          </label>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!ready.length} className="text-green-700 border-green-200 gap-1">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" onClick={handleExportPDF} disabled={!ready.length} className="bg-purple-700 hover:bg-purple-800 gap-1" data-testid="button-cert-pdf">
            <Printer className="w-4 h-4" /> استخراج PDF {ready.length > 1 ? `(${ready.length} شهادات)` : ""}
          </Button>
        </div>

        <datalist id="cert-tech-names">{techNames.map((t) => <option key={t} value={t} />)}</datalist>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input list="cert-tech-names" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder="اسم الفنى (اختار من القايمة أو اكتبه)" className="w-full sm:w-80 text-sm" data-testid={`input-cert-name-${i}`} />
              <select value={r.rank} onChange={(e) => setRow(i, { rank: Number(e.target.value) })}
                className="border rounded-md text-sm px-2 py-2 bg-white" title="المركز">
                {RANKS.map((label, k) => <option key={k} value={k + 1}>المركز {label}</option>)}
              </select>
              {rows.length > 1 && (
                <button onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="text-red-500 hover:text-red-700" title="شيل">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1"><Plus className="w-4 h-4" /> فنى تانى</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          «استخراج PDF» بيفتح الشهادات (كل فنى صفحة) — اختار «حفظ بصيغة PDF»، والورق Letter بالعرض والهوامش «بدون».
        </p>
      </Card>

      <Card className="p-3 bg-white border-0 shadow-sm overflow-x-auto">
        <div className="text-xs text-muted-foreground mb-2">معاينة{ready.length > 1 ? " (أول شهادة)" : ""}</div>
        {/* الشهادة 11×8.5 إنش (1056×816) — المعاينة بنص الحجم */}
        <div style={{ width: 528, height: 416, overflow: "hidden" }} className="mx-auto">
          <iframe title="معاينة الشهادة" srcDoc={preview} style={{ width: 1056, height: 850, border: 0, transform: "scale(0.5)", transformOrigin: "0 0" }} />
        </div>
      </Card>
    </div>
  );
}
