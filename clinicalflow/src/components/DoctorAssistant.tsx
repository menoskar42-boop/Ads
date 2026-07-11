import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mic, MicOff, ChevronDown, Pill, FileText, Stethoscope, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onInsert: (text: string) => void; // STEP 6: doctor triggers insert — no auto-fill
  language: 'ar' | 'en';
}

// ─── STEP 3: Clinical templates ───────────────────────────────────────────────
const TEMPLATES = [
  {
    key: 'uri',
    labelAr: 'التهاب مجاري تنفسية',
    labelEn: 'URI',
    textAr: 'الشكوى: التهاب حلق وسيلان أنف وسعال منذ ___ أيام.\nالفحص: بلعوم محتقن، بدون ضيق تنفس.\nالتشخيص: التهاب مجاري تنفسية علوية حاد.\nالعلاج:\n- باراسيتامول 500mg كل 8 ساعات عند الحاجة\n- ستربسيلز عند اللزوم\n- راحة وإكثار من السوائل',
    textEn: 'Complaint: Sore throat, rhinorrhea, cough for ___ days.\nExam: Erythematous pharynx, no respiratory distress.\nDiagnosis: Acute upper respiratory tract infection.\nPlan:\n- Paracetamol 500mg q8h PRN\n- Throat lozenges PRN\n- Rest and increased fluids',
  },
  {
    key: 'gastritis',
    labelAr: 'التهاب معدة',
    labelEn: 'Gastritis',
    textAr: 'الشكوى: ألم شرسوفي وحرقة معدة منذ ___ أيام.\nالفحص: ألم خفيف عند ضغط البطن، بدون دفاع بطني.\nالتشخيص: التهاب معدة.\nالعلاج:\n- أوميبرازول 20mg يومياً قبل الأكل\n- تجنب الأكل الحامض والحار\n- مراجعة بعد أسبوعين',
    textEn: 'Complaint: Epigastric pain and heartburn for ___ days.\nExam: Mild epigastric tenderness, no guarding.\nDiagnosis: Gastritis.\nPlan:\n- Omeprazole 20mg daily before meals\n- Avoid spicy/acidic food\n- Review in 2 weeks',
  },
  {
    key: 'headache',
    labelAr: 'صداع',
    labelEn: 'Headache',
    textAr: 'الشكوى: صداع منذ ___ أيام، شدة _/10.\nالفحص: الجهاز العصبي سليم، بدون تصلب رقبة.\nالتشخيص: صداع توتري.\nالعلاج:\n- إيبوبروفين 400mg عند الألم\n- تقليل ضغط النفس والنوم الكافي\n- مراجعة إذا استمر أكثر من أسبوع',
    textEn: 'Complaint: Headache for ___ days, severity _/10.\nExam: Neurological exam normal, no neck stiffness.\nDiagnosis: Tension headache.\nPlan:\n- Ibuprofen 400mg PRN\n- Stress reduction and adequate sleep\n- Review if persisting >1 week',
  },
  {
    key: 'htn',
    labelAr: 'ضغط دم',
    labelEn: 'Hypertension',
    textAr: 'الشكوى: قياس ضغط دم مرتفع.\nالفحص: ضغط _/_، نبض ___.\nالتشخيص: ارتفاع ضغط الدم.\nالعلاج:\n- أملوديبين 5mg يومياً\n- تقليل الملح، رياضة منتظمة\n- متابعة الضغط أسبوعياً',
    textEn: 'Complaint: Elevated blood pressure reading.\nExam: BP _/_, HR ___.\nDiagnosis: Hypertension.\nPlan:\n- Amlodipine 5mg daily\n- Low-salt diet, regular exercise\n- Weekly BP monitoring',
  },
];

// ─── STEP 2: Common drug list ─────────────────────────────────────────────────
const DRUGS = [
  'Paracetamol 500mg', 'Paracetamol 1g', 'Ibuprofen 400mg', 'Ibuprofen 600mg',
  'Aspirin 81mg', 'Aspirin 500mg', 'Amoxicillin 500mg', 'Amoxicillin 1g',
  'Augmentin 625mg', 'Azithromycin 500mg', 'Ciprofloxacin 500mg',
  'Omeprazole 20mg', 'Omeprazole 40mg', 'Pantoprazole 40mg',
  'Metformin 500mg', 'Metformin 1g', 'Glibenclamide 5mg', 'Sitagliptin 100mg',
  'Amlodipine 5mg', 'Amlodipine 10mg', 'Enalapril 5mg', 'Losartan 50mg',
  'Atorvastatin 20mg', 'Atorvastatin 40mg', 'Simvastatin 20mg',
  'Metronidazole 500mg', 'Fluconazole 150mg', 'Cetirizine 10mg',
  'Loratadine 10mg', 'Dexamethasone 4mg', 'Prednisolone 5mg',
  'Salbutamol inhaler', 'Budesonide inhaler', 'Furosemide 40mg',
  'Vitamin D3 1000IU', 'Vitamin C 500mg', 'Iron supplement',
];

// ─── STEP 4: Keyword → diagnosis suggestions (static mapping) ─────────────────
const DIAGNOSIS_MAP: { keywords: string[]; diagnoses: string[] }[] = [
  { keywords: ['صداع', 'headache', 'head'],       diagnoses: ['صداع توتري / Tension headache', 'شقيقة / Migraine', 'صداع عنقوي / Cervicogenic headache'] },
  { keywords: ['معدة', 'stomach', 'gastric', 'حرقة', 'heartburn'], diagnoses: ['التهاب معدة / Gastritis', 'ارتجاع / GERD', 'قرحة / PUD'] },
  { keywords: ['سعال', 'cough', 'كحة', 'بلعوم', 'throat'],        diagnoses: ['التهاب مجاري علوية / URI', 'التهاب شعبي / Bronchitis', 'حساسية / Allergic rhinitis'] },
  { keywords: ['ضغط', 'blood pressure', 'bp', 'hypertension'],    diagnoses: ['ارتفاع ضغط الدم / Hypertension', 'White coat hypertension'] },
  { keywords: ['سكر', 'glucose', 'diabetes', 'سكري'],             diagnoses: ['داء سكري نوع 2 / T2DM', 'مقدمة السكري / Prediabetes'] },
  { keywords: ['ألم صدر', 'chest pain', 'قلب', 'heart'],         diagnoses: ['ذبحة صدرية / Angina', 'ألم جداري / Musculoskeletal', 'ارتجاع / GERD'] },
  { keywords: ['دوخة', 'dizziness', 'vertigo', 'دوار'],           diagnoses: ['دوار وضعي / BPPV', 'خلل دهليزي / Vestibular neuritis', 'نقص ضغط وضعي / Orthostatic hypotension'] },
  { keywords: ['ظهر', 'back', 'عمود فقري', 'spine'],              diagnoses: ['ألم أسفل الظهر / LBP', 'انزلاق غضروفي / Disc herniation', 'تشنج عضلي / Muscle spasm'] },
];

function getDiagnosisSuggestions(text: string): string[] {
  const t = text.toLowerCase();
  const found = new Set<string>();
  for (const { keywords, diagnoses } of DIAGNOSIS_MAP) {
    if (keywords.some(k => t.includes(k.toLowerCase()))) {
      diagnoses.forEach(d => found.add(d));
    }
  }
  return [...found].slice(0, 6);
}

function getLastWord(text: string): string {
  return text.split(/\s/).pop()?.toLowerCase() || '';
}

// ─── Component ────────────────────────────────────────────────────────────────
const DoctorAssistant: React.FC<Props> = ({ onInsert, language }) => {
  const isAr = language === 'ar';
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [drugQuery, setDrugQuery] = useState('');
  const [showDrugs, setShowDrugs] = useState(false);
  const [diagSugg, setDiagSugg] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);
  const drugInputRef = useRef<HTMLInputElement>(null);

  // STEP 4: update diagnosis suggestions as text changes
  useEffect(() => {
    if (text.length > 5) setDiagSugg(getDiagnosisSuggestions(text));
    else setDiagSugg([]);
  }, [text]);

  // STEP 1: Web Speech API (browser-native, zero cost)
  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error(isAr ? 'المتصفح لا يدعم التعرف على الصوت' : 'Browser does not support voice input');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = isAr ? 'ar-EG' : 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join(' ');
      setText(prev => prev ? prev + ' ' + transcript : transcript);
    };
    rec.onerror = () => { setIsListening(false); toast.error(isAr ? 'خطأ في التعرف على الصوت' : 'Voice recognition error'); };
    rec.onend = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  // STEP 2: Drug suggestions filtered from DRUGS list
  const drugSuggestions = drugQuery.length >= 2
    ? DRUGS.filter(d => d.toLowerCase().includes(drugQuery.toLowerCase())).slice(0, 6)
    : [];

  const insertDrug = (drug: string) => {
    setText(prev => prev ? `${prev}\n- ${drug}` : `- ${drug}`);
    setDrugQuery('');
    setShowDrugs(false);
  };

  const insertDiagnosis = (diag: string) => {
    setText(prev => prev ? `${prev}\n${isAr ? 'التشخيص:' : 'Diagnosis:'} ${diag}` : `${isAr ? 'التشخيص:' : 'Diagnosis:'} ${diag}`);
  };

  // STEP 6: Insert into notes — doctor action, never automatic
  const handleInsert = () => {
    if (!text.trim()) return;
    onInsert(text.trim());
    setText('');
    setDiagSugg([]);
    toast.success(isAr ? 'تم إضافة النص للملاحظات' : 'Inserted into notes');
  };

  return (
    <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>

      {/* STEP 3: Template quick-insert row */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {isAr ? 'قوالب سريعة' : 'Quick Templates'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map(t => (
            <Button
              key={t.key}
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setText(isAr ? t.textAr : t.textEn)}
            >
              <Plus className="h-3 w-3" />
              {isAr ? t.labelAr : t.labelEn}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* STEP 1 + 5: Voice + text area */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
            <Stethoscope className="h-3 w-3" />
            {isAr ? 'ملاحظات المساعد' : 'Assistant Notes'}
          </p>
          <Button
            size="sm"
            variant={isListening ? 'destructive' : 'outline'}
            className="h-7 gap-1.5 text-xs"
            onClick={toggleVoice}
          >
            {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {isListening ? (isAr ? 'إيقاف' : 'Stop') : (isAr ? 'تسجيل صوتي' : 'Voice Input')}
            {isListening && <span className="h-2 w-2 rounded-full bg-white animate-pulse" />}
          </Button>
        </div>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={6}
          placeholder={isAr ? 'اكتب أو استخدم التسجيل الصوتي… مثال: مريض 40 سنة يشكو من صداع منذ يومين' : 'Type or use voice… e.g. 40yo male with 2-day headache'}
          className="text-sm"
        />
      </div>

      {/* STEP 4: Diagnosis suggestions (auto, keyword-based) */}
      {diagSugg.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
            <Stethoscope className="h-3 w-3" />
            {isAr ? 'اقتراحات تشخيص (انقر للإضافة)' : 'Diagnosis suggestions (click to add)'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {diagSugg.map(d => (
              <Badge
                key={d}
                variant="outline"
                className="cursor-pointer hover:bg-muted text-xs py-0.5"
                onClick={() => insertDiagnosis(d)}
              >
                {d}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Drug search */}
      <div className="relative">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1">
          <Pill className="h-3 w-3" />
          {isAr ? 'بحث عن دواء' : 'Drug Search'}
        </p>
        <Input
          ref={drugInputRef}
          className="h-8 text-xs"
          placeholder={isAr ? 'اكتب اسم الدواء…' : 'Type drug name…'}
          value={drugQuery}
          onChange={e => { setDrugQuery(e.target.value); setShowDrugs(true); }}
          onFocus={() => setShowDrugs(true)}
          onBlur={() => setTimeout(() => setShowDrugs(false), 150)}
        />
        {showDrugs && drugSuggestions.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 bg-background border rounded-md shadow-lg mt-0.5 overflow-hidden">
            {drugSuggestions.map(drug => (
              <button
                key={drug}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                onMouseDown={() => insertDrug(drug)}
              >
                <Pill className="h-3 w-3 text-muted-foreground" />
                {drug}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* STEP 6: Insert button — doctor confirms */}
      <Button className="w-full gap-2" onClick={handleInsert} disabled={!text.trim()}>
        <Plus className="h-4 w-4" />
        {isAr ? 'إضافة للملاحظات الرئيسية' : 'Insert into Main Notes'}
      </Button>
    </div>
  );
};

export default DoctorAssistant;
