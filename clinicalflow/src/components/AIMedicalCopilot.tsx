import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getToken } from '@/utils/authToken';
import { saveAISuggestion, getAIHistory, type AICopilotSuggestion } from '@/stores/aiCopilotStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Brain, Loader2, CheckCircle2, ClipboardCopy, History,
  AlertTriangle, ChevronDown, ChevronUp, Stethoscope,
  Pill, FileText, Hash,
} from 'lucide-react';

interface Props {
  patientId: string;
  visitId?: string;
  onApplyToNotes: (text: string) => void;
}

// ─── Section card ─────────────────────────────────────────────
function ResultCard({
  icon, label, value, onUse, isAr,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onUse: () => void;
  isAr: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        {icon}
        {label}
      </div>
      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{value}</p>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 w-full justify-start"
        onClick={onUse}
      >
        <ClipboardCopy className="h-3 w-3" />
        {isAr ? 'استخدم هذا' : 'Use this'}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
const AIMedicalCopilot: React.FC<Props> = ({ patientId, visitId, onApplyToNotes }) => {
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';

  // STEP 1 — input
  const [notesInput, setNotesInput] = useState('');
  const [loading, setLoading] = useState(false);

  // STEP 4 — result
  const [result, setResult] = useState<AICopilotSuggestion | null>(null);

  // STEP 6 — history panel
  const [showHistory, setShowHistory] = useState(false);
  const history = getAIHistory(patientId);

  // ─── Call backend (STEPS 2 & 3) ──────────────────────────────
  const generate = async () => {
    if (!notesInput.trim()) {
      toast.error(isAr ? 'أدخل ملاحظات المريض أولاً' : 'Enter patient notes first');
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/ai/medical-assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify({ patient_notes: notesInput, language }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      const suggestion: AICopilotSuggestion = {
        id: '',
        patientId,
        visitId,
        notes: notesInput,
        summary:   data.summary   || '',
        diagnosis: data.diagnosis || '',
        treatment: data.treatment || '',
        icdCode:   data.icd_code  || '',
        createdAt: '',
      };

      // STEP 6 — persist
      saveAISuggestion({ patientId, visitId, notes: notesInput, ...suggestion });

      setResult(suggestion);
      toast.success(isAr ? 'تم التحليل بنجاح' : 'Analysis complete');
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'فشل التحليل' : 'Analysis failed'));
    } finally {
      setLoading(false);
    }
  };

  // STEP 5 — apply helpers
  const applyField = (value: string, label: string) => {
    onApplyToNotes(value);
    toast.success(isAr ? `تم نسخ ${label} إلى الملاحظات` : `${label} applied to notes`);
  };

  const applyAll = () => {
    if (!result) return;
    const combined = [
      isAr ? `الملخص:\n${result.summary}` : `Summary:\n${result.summary}`,
      isAr ? `التشخيص:\n${result.diagnosis}` : `Diagnosis:\n${result.diagnosis}`,
      isAr ? `العلاج:\n${result.treatment}` : `Treatment:\n${result.treatment}`,
      isAr ? `رمز ICD: ${result.icdCode}` : `ICD Code: ${result.icdCode}`,
    ].join('\n\n');
    onApplyToNotes(combined);
    toast.success(isAr ? 'تم تطبيق كل النتائج على الملاحظات' : 'All results applied to notes');
  };

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* STEP 7 — Safety disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          {isAr
            ? 'مقترحات الذكاء الاصطناعي للمساعدة فقط. يجب مراجعتها والتحقق منها من قِبَل الطبيب قبل الاستخدام.'
            : 'AI suggestions are for assistance only. They must be reviewed and verified by the physician before use.'}
        </span>
      </div>

      {/* STEP 1 — Input */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            {isAr ? 'مساعد طبي ذكي' : 'AI Medical Copilot'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notesInput}
            onChange={e => setNotesInput(e.target.value)}
            rows={5}
            placeholder={
              isAr
                ? 'اكتب ملاحظات المريض هنا... مثل: مريض 40 سنة يشكو من ألم صدر منذ يومين مع ضيق تنفس...'
                : 'Write or speak patient notes... e.g. 40yo male with 2-day chest pain and shortness of breath...'
            }
          />
          <Button
            onClick={generate}
            disabled={loading || !notesInput.trim()}
            className="gap-2 w-full sm:w-auto"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Brain className="h-4 w-4" />}
            {isAr ? 'توليد المقترحات' : 'Generate Suggestions'}
          </Button>
        </CardContent>
      </Card>

      {/* STEP 4 — Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              {isAr ? 'نتائج التحليل' : 'Analysis Results'}
            </p>
            <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={applyAll}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isAr ? 'تطبيق الكل' : 'Apply All'}
            </Button>
          </div>

          <ResultCard
            icon={<FileText className="h-4 w-4" />}
            label={isAr ? 'ملخص الحالة' : 'Summary'}
            value={result.summary}
            onUse={() => applyField(result.summary, isAr ? 'الملخص' : 'Summary')}
            isAr={isAr}
          />
          <ResultCard
            icon={<Stethoscope className="h-4 w-4" />}
            label={isAr ? 'التشخيص المقترح' : 'Suggested Diagnosis'}
            value={result.diagnosis}
            onUse={() => applyField(result.diagnosis, isAr ? 'التشخيص' : 'Diagnosis')}
            isAr={isAr}
          />
          <ResultCard
            icon={<Pill className="h-4 w-4" />}
            label={isAr ? 'خطة العلاج المقترحة' : 'Suggested Treatment'}
            value={result.treatment}
            onUse={() => applyField(result.treatment, isAr ? 'العلاج' : 'Treatment')}
            isAr={isAr}
          />
          <ResultCard
            icon={<Hash className="h-4 w-4" />}
            label={isAr ? 'رمز ICD' : 'ICD Code'}
            value={result.icdCode}
            onUse={() => applyField(result.icdCode, isAr ? 'رمز ICD' : 'ICD Code')}
            isAr={isAr}
          />
        </div>
      )}

      {/* STEP 6 — History */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            {isAr ? `السجل السابق (${history.length})` : `Previous sessions (${history.length})`}
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showHistory && (
            <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
              {history.slice(0, 10).map(h => (
                <div key={h.id} className="rounded-lg border p-3 space-y-1 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{h.icdCode || '—'}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs font-medium truncate">{h.diagnosis}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{h.notes}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    onClick={() => setResult(h)}
                  >
                    {isAr ? 'عرض' : 'View'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIMedicalCopilot;
