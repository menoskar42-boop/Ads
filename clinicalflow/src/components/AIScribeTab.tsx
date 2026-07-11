import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { SOAPNote, SOAPNoteTemplate, SOAPNoteStatus } from '@/types';
import { soapNoteStore } from '@/stores/soapNoteStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sparkles, Plus, FileText, RefreshCw, Download, Save, ChevronLeft,
  Trash2, Clock, CheckCircle2, AlertCircle, Wand2, Mic, MicOff, Square,
} from 'lucide-react';

interface Props {
  patientId: string;
  patientName: string;
  specialty?: string;
}

type ViewMode = 'list' | 'new' | 'view';

const TEMPLATES: { value: SOAPNoteTemplate; labelEn: string; labelAr: string; descEn: string; descAr: string }[] = [
  {
    value: 'soap',
    labelEn: 'SOAP Note',
    labelAr: 'ملاحظة SOAP',
    descEn: 'Subjective · Objective · Assessment · Plan',
    descAr: 'الشكوى · الفحص · التشخيص · الخطة',
  },
  {
    value: 'treatment_note',
    labelEn: 'Treatment Note',
    labelAr: 'ملاحظة علاجية',
    descEn: 'History · Observations · Assessment · Plan · Follow-up',
    descAr: 'التاريخ · الملاحظات · التقييم · الخطة · المتابعة',
  },
  {
    value: 'referral_letter',
    labelEn: 'Referral Letter',
    labelAr: 'خطاب إحالة',
    descEn: 'Professional letter to referring specialist',
    descAr: 'خطاب رسمي للطبيب المحال إليه',
  },
  {
    value: 'patient_summary',
    labelEn: 'Patient Summary',
    labelAr: 'ملخص المريض',
    descEn: 'Concise summary of patient condition',
    descAr: 'ملخص موجز عن حالة المريض',
  },
];

const AIScribeTab: React.FC<Props> = ({ patientId, patientName, specialty }) => {
  const { isAr, language } = useLanguage();
  const { user } = useAuth();

  const [notes, setNotes] = useState<SOAPNote[]>(() =>
    soapNoteStore.getAll().filter(n => n.patientId === patientId)
  );
  const [mode, setMode] = useState<ViewMode>('list');
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null);

  // New note state
  const [template, setTemplate] = useState<SOAPNoteTemplate>('soap');
  const [consultationInput, setConsultationInput] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Refine state
  const [refinePrompt, setRefinePrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Voice-to-text state
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError(isAr ? 'المتصفح لا يدعم التعرف على الصوت' : 'Speech recognition not supported in this browser');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'ar' ? 'ar-EG' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => { setIsListening(true); setVoiceError(''); };
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript + ' ';
        }
      }
      if (transcript) {
        setConsultationInput(prev => prev + transcript);
      }
    };
    recognition.onerror = (event: any) => {
      setVoiceError(event.error === 'not-allowed'
        ? (isAr ? 'لم يتم السماح بالوصول إلى الميكروفون' : 'Microphone access denied')
        : (isAr ? 'خطأ في التعرف على الصوت' : 'Voice recognition error'));
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [isAr, language]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    const unsub = soapNoteStore.subscribe(() => {
      setNotes(soapNoteStore.getAll().filter(n => n.patientId === patientId));
    });
    return unsub;
  }, [patientId]);

  const selectedTemplate = TEMPLATES.find(t => t.value === template)!;

  const handleGenerate = async () => {
    if (!consultationInput.trim()) return;
    setIsGenerating(true);
    setGenerateError('');
    try {
      const res = await fetch('/api/generate-soap-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          consultationNotes: consultationInput,
          patientName,
          specialty: specialty || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGeneratedContent(data.content);
    } catch (err: any) {
      setGenerateError(err.message || 'Failed to generate note');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!refinePrompt.trim() || !generatedContent) return;
    setIsRefining(true);
    try {
      const res = await fetch('/api/generate-soap-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          consultationNotes: consultationInput,
          patientName,
          specialty: specialty || '',
          refinePrompt,
          existingNote: generatedContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refinement failed');
      setGeneratedContent(data.content);
      setRefinePrompt('');
    } catch (err: any) {
      setGenerateError(err.message || 'Failed to refine note');
    } finally {
      setIsRefining(false);
    }
  };

  const saveNote = (status: SOAPNoteStatus) => {
    if (!generatedContent.trim()) return;
    const now = new Date().toISOString();
    const saved = soapNoteStore.add({
      id: `sn-${Date.now()}`,
      patientId,
      doctorId: user?.id || '',
      template,
      consultationInput,
      generatedContent,
      status,
      specialty,
      createdAt: now,
      updatedAt: now,
    });
    resetNew();
    setMode('list');
  };

  const updateNoteStatus = (id: string, status: SOAPNoteStatus) => {
    soapNoteStore.update(n => n.id === id, { status, updatedAt: new Date().toISOString() });
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, status } : null);
  };

  const deleteNote = (id: string) => {
    soapNoteStore.remove(n => n.id === id);
    if (selectedNote?.id === id) { setSelectedNote(null); setMode('list'); }
  };

  const resetNew = () => {
    setTemplate('soap');
    setConsultationInput('');
    setGeneratedContent('');
    setRefinePrompt('');
    setGenerateError('');
  };

  const handleDownload = (note: SOAPNote) => {
    const tpl = TEMPLATES.find(t => t.value === note.template);
    const title = isAr ? tpl?.labelAr : tpl?.labelEn;
    const content = `${title}\n${'─'.repeat(50)}\nPatient: ${patientName}\nDate: ${new Date(note.createdAt).toLocaleDateString('en-GB')}\n\n${note.generatedContent}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patientName.replace(/\s/g, '_')}_${note.template}_${note.id.slice(-4)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (status: SOAPNoteStatus) =>
    status === 'final'
      ? <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"><CheckCircle2 className="h-3 w-3" />{isAr ? 'نهائي' : 'Final'}</Badge>
      : <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300"><Clock className="h-3 w-3" />{isAr ? 'مسودة' : 'Draft'}</Badge>;

  const templateLabel = (t: SOAPNoteTemplate) => {
    const tpl = TEMPLATES.find(x => x.value === t);
    return isAr ? tpl?.labelAr : tpl?.labelEn;
  };

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{isAr ? 'الكاتب الطبي بالذكاء الاصطناعي' : 'AI Medical Scribe'}</h3>
              <p className="text-xs text-muted-foreground">{isAr ? 'توليد ملاحظات طبية تلقائياً' : 'Auto-generate structured clinical notes'}</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => { resetNew(); setMode('new'); }}>
            <Plus className="h-4 w-4" />
            {isAr ? 'ملاحظة جديدة' : 'New Note'}
          </Button>
        </div>

        {notes.length === 0 ? (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Sparkles className="h-7 w-7 opacity-40" />
              </div>
              <p className="font-medium text-sm">{isAr ? 'لا توجد ملاحظات بعد' : 'No AI notes yet'}</p>
              <p className="text-xs text-center max-w-xs">
                {isAr
                  ? 'أدخل ملاحظات الكشف وسيقوم الذكاء الاصطناعي بتوليد ملف طبي منظم'
                  : 'Enter consultation notes and AI will generate a structured clinical document'}
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={() => { resetNew(); setMode('new'); }}>
                <Sparkles className="h-3.5 w-3.5" />
                {isAr ? 'ابدأ الآن' : 'Get Started'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(note => (
              <Card key={note.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => { setSelectedNote(note); setMode('view'); }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{templateLabel(note.template)}</span>
                          {statusBadge(note.status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{note.generatedContent.slice(0, 120)}…</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(note.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── VIEW NOTE ──────────────────────────────────────────────────────────────
  if (mode === 'view' && selectedNote) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setMode('list')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{templateLabel(selectedNote.template)}</span>
            {statusBadge(selectedNote.status)}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleDownload(selectedNote)}>
            <Download className="h-3.5 w-3.5" />
            {isAr ? 'تنزيل' : 'Download'}
          </Button>
          {selectedNote.status === 'draft' && (
            <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => updateNoteStatus(selectedNote.id, 'final')}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isAr ? 'تأكيد كنهائي' : 'Mark Final'}
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{selectedNote.generatedContent}</pre>
          </CardContent>
        </Card>

        {selectedNote.consultationInput && (
          <Card className="border-muted">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {isAr ? 'ملاحظات الكشف الأصلية' : 'Original Consultation Notes'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedNote.consultationInput}</p>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          {isAr ? 'تاريخ الإنشاء: ' : 'Created: '}
          {new Date(selectedNote.createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB')}
        </p>
      </div>
    );
  }

  // ── NEW NOTE ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => { resetNew(); setMode('list'); }}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="font-semibold text-sm">{isAr ? 'ملاحظة طبية جديدة' : 'New Clinical Note'}</h3>
          <p className="text-xs text-muted-foreground">{isAr ? 'أدخل ملاحظاتك وسيتولى الذكاء الاصطناعي التوثيق' : 'Enter your notes — AI handles the documentation'}</p>
        </div>
      </div>

      {/* Template Selector */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {isAr ? 'نوع المستند' : 'Document Type'}
          </label>
          <Select value={template} onValueChange={(v: SOAPNoteTemplate) => setTemplate(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  <div>
                    <div className="font-medium">{isAr ? t.labelAr : t.labelEn}</div>
                    <div className="text-xs text-muted-foreground">{isAr ? t.descAr : t.descEn}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {isAr ? selectedTemplate.descAr : selectedTemplate.descEn}
          </p>
        </CardContent>
      </Card>

      {/* Consultation Input */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {isAr ? 'ملاحظات الكشف' : 'Consultation Notes'}
            </label>
            <div className="flex items-center gap-2">
              {isListening && (
                <span className="text-xs text-red-500 animate-pulse flex items-center gap-1">
                  <span className="h-2 w-2 bg-red-500 rounded-full inline-block" />
                  {isAr ? 'جارٍ التسجيل...' : 'Recording...'}
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant={isListening ? 'destructive' : 'outline'}
                className="h-7 gap-1 text-xs"
                onClick={isListening ? stopListening : startListening}
              >
                {isListening ? <><Square className="h-3 w-3" />{isAr ? 'إيقاف' : 'Stop'}</> : <><Mic className="h-3 w-3" />{isAr ? 'تسجيل صوتي' : 'Voice'}</>}
              </Button>
            </div>
          </div>
          <Textarea
            rows={5}
            value={consultationInput}
            onChange={e => setConsultationInput(e.target.value)}
            placeholder={
              isAr
                ? 'اكتب ملاحظاتك عن المريض هنا أو استخدم التسجيل الصوتي... مثال: مريض 45 سنة يشكو من صداع منذ أسبوع، BP 140/90...'
                : 'Type notes here or use voice recording... e.g. 45yo male, 1-week headache, BP 140/90, afebrile...'
            }
            className={`resize-none text-sm ${isListening ? 'border-red-300 ring-1 ring-red-200' : ''}`}
            dir={isAr ? 'rtl' : 'ltr'}
          />
          {(generateError || voiceError) && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertCircle className="h-3.5 w-3.5" />
              {generateError || voiceError}
            </div>
          )}
          <Button
            className="w-full gap-2"
            disabled={!consultationInput.trim() || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <><RefreshCw className="h-4 w-4 animate-spin" />{isAr ? 'جاري التوليد...' : 'Generating...'}</>
            ) : (
              <><Sparkles className="h-4 w-4" />{isAr ? 'توليد بالذكاء الاصطناعي' : 'Generate with AI'}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Output */}
      {generatedContent && (
        <>
          <Card className="border-primary/30">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium text-primary uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isAr ? 'الملاحظة المُولَّدة' : 'Generated Note'}
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={handleGenerate} disabled={isGenerating}>
                  <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
                  {isAr ? 'إعادة' : 'Regenerate'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Textarea
                rows={12}
                value={generatedContent}
                onChange={e => setGeneratedContent(e.target.value)}
                className="resize-none text-sm font-mono"
                dir="ltr"
              />
            </CardContent>
          </Card>

          {/* AI Refine */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                {isAr ? 'تحسين بالذكاء الاصطناعي' : 'Refine with AI'}
              </label>
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  value={refinePrompt}
                  onChange={e => setRefinePrompt(e.target.value)}
                  placeholder={isAr ? 'مثال: أضف تفاصيل أكثر للتشخيص...' : 'e.g. Add more detail to the assessment section...'}
                  className="resize-none text-sm flex-1"
                />
                <Button
                  variant="outline"
                  className="gap-1.5 self-end"
                  disabled={!refinePrompt.trim() || isRefining}
                  onClick={handleRefine}
                >
                  {isRefining ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {isAr ? 'تطبيق' : 'Apply'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Save Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" className="gap-1.5" onClick={() => saveNote('draft')}>
              <Save className="h-4 w-4" />
              {isAr ? 'حفظ كمسودة' : 'Save as Draft'}
            </Button>
            <Button className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => saveNote('final')}>
              <CheckCircle2 className="h-4 w-4" />
              {isAr ? 'حفظ كنهائي' : 'Save as Final'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default AIScribeTab;
