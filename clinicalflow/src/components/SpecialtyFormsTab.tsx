import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { specialtyFormStore, SpecialtyFormRecord } from '@/stores/specialtyFormStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface SpecialtyFormsTabProps {
  patientId: string;
  visitId?: string;
  doctorSpecialty?: string;
}

type FormType = 'dermatology' | 'gynecology' | 'pediatrics' | 'general' | 'ophthalmology' | 'orthopedics';

interface FormField {
  key: string;
  label: string;
  labelAr: string;
  type: 'text' | 'select' | 'textarea' | 'number' | 'radio';
  options?: { en: string; ar: string }[];
}

const FORM_SCHEMAS: Record<FormType, { name: string; nameAr: string; fields: FormField[] }> = {
  dermatology: {
    name: 'Dermatology Assessment',
    nameAr: 'تقييم جلدي',
    fields: [
      { key: 'lesion_type', label: 'Lesion Type', labelAr: 'نوع الآفة', type: 'select', options: [
        { en: 'Macule', ar: 'بقعة' }, { en: 'Papule', ar: 'حطاطة' }, { en: 'Plaque', ar: 'لويحة' },
        { en: 'Vesicle', ar: 'حويصلة' }, { en: 'Pustule', ar: 'بثرة' }, { en: 'Nodule', ar: 'عقيدة' },
      ]},
      { key: 'location', label: 'Location', labelAr: 'الموقع', type: 'text' },
      { key: 'duration', label: 'Duration', labelAr: 'المدة', type: 'text' },
      { key: 'itch', label: 'Pruritus', labelAr: 'الحكة', type: 'radio', options: [
        { en: 'Yes', ar: 'نعم' }, { en: 'No', ar: 'لا' },
      ]},
      { key: 'distribution', label: 'Distribution', labelAr: 'التوزيع', type: 'select', options: [
        { en: 'Localized', ar: 'موضعي' }, { en: 'Widespread', ar: 'منتشر' }, { en: 'Bilateral', ar: 'ثنائي' },
      ]},
      { key: 'diagnosis', label: 'Provisional Diagnosis', labelAr: 'التشخيص المبدئي', type: 'textarea' },
      { key: 'treatment', label: 'Treatment Plan', labelAr: 'خطة العلاج', type: 'textarea' },
    ],
  },
  gynecology: {
    name: 'Gynecology Assessment',
    nameAr: 'تقييم نسائي وتوليد',
    fields: [
      { key: 'lmp', label: 'Last Menstrual Period', labelAr: 'آخر دورة شهرية', type: 'text' },
      { key: 'cycle_length', label: 'Cycle Length (days)', labelAr: 'طول الدورة (أيام)', type: 'number' },
      { key: 'parity', label: 'Obstetric History (G/P)', labelAr: 'التاريخ التوليدي', type: 'text' },
      { key: 'contraception', label: 'Contraception', labelAr: 'موانع الحمل', type: 'select', options: [
        { en: 'None', ar: 'لا شيء' }, { en: 'OCP', ar: 'حبوب' }, { en: 'IUD', ar: 'لولب' },
        { en: 'Condom', ar: 'واقي' }, { en: 'Injectable', ar: 'حقن' }, { en: 'Other', ar: 'أخرى' },
      ]},
      { key: 'complaint', label: 'Main Complaint', labelAr: 'الشكوى الرئيسية', type: 'textarea' },
      { key: 'usg_findings', label: 'Ultrasound Findings', labelAr: 'نتائج السونار', type: 'textarea' },
      { key: 'diagnosis', label: 'Diagnosis', labelAr: 'التشخيص', type: 'textarea' },
    ],
  },
  pediatrics: {
    name: 'Pediatrics Assessment',
    nameAr: 'تقييم أطفال',
    fields: [
      { key: 'age_months', label: 'Age (months)', labelAr: 'العمر (شهور)', type: 'number' },
      { key: 'weight_kg', label: 'Weight (kg)', labelAr: 'الوزن (كجم)', type: 'number' },
      { key: 'height_cm', label: 'Height (cm)', labelAr: 'الطول (سم)', type: 'number' },
      { key: 'vaccination_status', label: 'Vaccination Status', labelAr: 'حالة التطعيم', type: 'select', options: [
        { en: 'Up to date', ar: 'محدّثة' }, { en: 'Incomplete', ar: 'ناقصة' }, { en: 'Unknown', ar: 'غير معروف' },
      ]},
      { key: 'feeding', label: 'Feeding', labelAr: 'التغذية', type: 'select', options: [
        { en: 'Breastfeeding', ar: 'رضاعة طبيعية' }, { en: 'Formula', ar: 'حليب صناعي' }, { en: 'Mixed', ar: 'مختلط' }, { en: 'Solid', ar: 'أكل صلب' },
      ]},
      { key: 'development', label: 'Developmental Milestones', labelAr: 'مراحل النمو', type: 'textarea' },
      { key: 'complaint', label: 'Chief Complaint', labelAr: 'الشكوى', type: 'textarea' },
      { key: 'diagnosis', label: 'Diagnosis', labelAr: 'التشخيص', type: 'textarea' },
    ],
  },
  general: {
    name: 'General Medicine',
    nameAr: 'طب عام',
    fields: [
      { key: 'presenting_complaint', label: 'Presenting Complaint', labelAr: 'الشكوى الرئيسية', type: 'textarea' },
      { key: 'history', label: 'History of Present Illness', labelAr: 'تاريخ المرض', type: 'textarea' },
      { key: 'past_medical', label: 'Past Medical History', labelAr: 'التاريخ الطبي', type: 'textarea' },
      { key: 'medications', label: 'Current Medications', labelAr: 'الأدوية الحالية', type: 'textarea' },
      { key: 'examination', label: 'Examination Findings', labelAr: 'نتائج الفحص', type: 'textarea' },
      { key: 'diagnosis', label: 'Diagnosis', labelAr: 'التشخيص', type: 'textarea' },
      { key: 'plan', label: 'Management Plan', labelAr: 'خطة العلاج', type: 'textarea' },
    ],
  },
  ophthalmology: {
    name: 'Ophthalmology Assessment',
    nameAr: 'تقييم عيون',
    fields: [
      { key: 'va_right', label: 'Visual Acuity Right', labelAr: 'حدة البصر أيمن', type: 'text' },
      { key: 'va_left', label: 'Visual Acuity Left', labelAr: 'حدة البصر أيسر', type: 'text' },
      { key: 'iop_right', label: 'IOP Right (mmHg)', labelAr: 'ضغط العين الأيمن', type: 'number' },
      { key: 'iop_left', label: 'IOP Left (mmHg)', labelAr: 'ضغط العين الأيسر', type: 'number' },
      { key: 'slit_lamp', label: 'Slit Lamp Findings', labelAr: 'نتائج المصباح الشقي', type: 'textarea' },
      { key: 'fundus', label: 'Fundus Examination', labelAr: 'قاع العين', type: 'textarea' },
      { key: 'diagnosis', label: 'Diagnosis', labelAr: 'التشخيص', type: 'textarea' },
    ],
  },
  orthopedics: {
    name: 'Orthopedics Assessment',
    nameAr: 'تقييم عظام',
    fields: [
      { key: 'site', label: 'Site of Complaint', labelAr: 'موقع الشكوى', type: 'text' },
      { key: 'onset', label: 'Onset', labelAr: 'البداية', type: 'select', options: [
        { en: 'Acute', ar: 'حاد' }, { en: 'Chronic', ar: 'مزمن' }, { en: 'Subacute', ar: 'شبه حاد' },
      ]},
      { key: 'mechanism', label: 'Mechanism of Injury', labelAr: 'آلية الإصابة', type: 'text' },
      { key: 'xray', label: 'X-Ray Findings', labelAr: 'نتائج الأشعة', type: 'textarea' },
      { key: 'rom', label: 'Range of Motion', labelAr: 'نطاق الحركة', type: 'textarea' },
      { key: 'diagnosis', label: 'Diagnosis', labelAr: 'التشخيص', type: 'textarea' },
      { key: 'plan', label: 'Treatment Plan', labelAr: 'خطة العلاج', type: 'textarea' },
    ],
  },
};

const FORM_TYPES = Object.keys(FORM_SCHEMAS) as FormType[];

const SpecialtyFormsTab: React.FC<SpecialtyFormsTabProps> = ({ patientId, visitId, doctorSpecialty }) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { users } = useUsers();
  const isAr = language === 'ar';

  const [records, setRecords] = useState<SpecialtyFormRecord[]>(() =>
    specialtyFormStore.filter(r => r.patientId === patientId)
  );
  const [selectedType, setSelectedType] = useState<FormType>(() => {
    // Auto-detect from doctor specialty name
    const spec = doctorSpecialty?.toLowerCase() || '';
    if (spec.includes('derm') || spec.includes('جلد')) return 'dermatology';
    if (spec.includes('gyn') || spec.includes('نساء')) return 'gynecology';
    if (spec.includes('ped') || spec.includes('أطفال')) return 'pediatrics';
    if (spec.includes('eye') || spec.includes('عيون')) return 'ophthalmology';
    if (spec.includes('orth') || spec.includes('عظام')) return 'orthopedics';
    return 'general';
  });
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    return specialtyFormStore.subscribe(() =>
      setRecords(specialtyFormStore.filter(r => r.patientId === patientId))
    );
  }, [patientId]);

  const schema = FORM_SCHEMAS[selectedType];

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const saveForm = () => {
    const now = new Date().toISOString();
    specialtyFormStore.add({
      id: `sf-${Date.now()}`,
      patientId,
      visitId,
      doctorId: user?.id || '',
      formType: selectedType,
      data: formData,
      createdAt: now,
      updatedAt: now,
    });
    toast.success(isAr ? 'تم حفظ النموذج' : 'Form saved');
    setFormData({});
    setIsAdding(false);
  };

  const deleteRecord = (id: string) => {
    specialtyFormStore.remove(r => r.id === id);
    toast.success(isAr ? 'تم الحذف' : 'Deleted');
  };

  const renderField = (field: FormField) => {
    const value = formData[field.key] || '';
    const label = isAr ? field.labelAr : field.label;

    return (
      <div key={field.key}>
        <Label className="text-sm">{label}</Label>
        {field.type === 'textarea' ? (
          <Textarea
            value={value}
            onChange={e => handleFieldChange(field.key, e.target.value)}
            rows={3}
            placeholder={label}
          />
        ) : field.type === 'select' ? (
          <Select value={value} onValueChange={v => handleFieldChange(field.key, v)}>
            <SelectTrigger><SelectValue placeholder={isAr ? 'اختر...' : 'Select...'} /></SelectTrigger>
            <SelectContent>
              {field.options?.map(opt => (
                <SelectItem key={opt.en} value={opt.en}>{isAr ? opt.ar : opt.en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === 'radio' ? (
          <div className="flex gap-4 mt-1">
            {field.options?.map(opt => (
              <label key={opt.en} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={field.key}
                  value={opt.en}
                  checked={value === opt.en}
                  onChange={() => handleFieldChange(field.key, opt.en)}
                />
                <span className="text-sm">{isAr ? opt.ar : opt.en}</span>
              </label>
            ))}
          </div>
        ) : (
          <Input
            type={field.type === 'number' ? 'number' : 'text'}
            value={value}
            onChange={e => handleFieldChange(field.key, e.target.value)}
            placeholder={label}
          />
        )}
      </div>
    );
  };

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-4">
      {/* Add new form */}
      {!isAdding ? (
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة نموذج جديد' : 'Add New Form'}
        </Button>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isAr ? 'نموذج تخصصي جديد' : 'New Specialty Form'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{isAr ? 'نوع النموذج' : 'Form Type'}</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {FORM_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => { setSelectedType(type); setFormData({}); }}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedType === type ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {isAr ? FORM_SCHEMAS[type].nameAr : FORM_SCHEMAS[type].name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {schema.fields.map(renderField)}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={saveForm}>{isAr ? 'حفظ النموذج' : 'Save Form'}</Button>
              <Button variant="outline" onClick={() => { setIsAdding(false); setFormData({}); }}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing records */}
      {records.length === 0 && !isAdding ? (
        <div className="text-center py-10 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{isAr ? 'لا توجد نماذج مسجلة' : 'No specialty forms recorded'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(record => {
            const recSchema = FORM_SCHEMAS[record.formType as FormType];
            const isExpanded = expandedId === record.id;
            return (
              <Card key={record.id}>
                <div
                  className="p-3 flex items-center justify-between cursor-pointer hover:bg-accent/40"
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="font-medium text-sm">
                      {isAr ? recSchema?.nameAr : recSchema?.name}
                    </span>
                    <Badge variant="outline" className="text-xs">{record.createdAt.slice(0, 10)}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400"
                      onClick={e => { e.stopPropagation(); deleteRecord(record.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
                {isExpanded && (
                  <CardContent className="pt-0 pb-3 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm">
                      {Object.entries(record.data).map(([key, value]) => {
                        if (!value) return null;
                        const field = recSchema?.fields.find(f => f.key === key);
                        const label = isAr ? field?.labelAr : field?.label;
                        return (
                          <div key={key}>
                            <span className="text-muted-foreground text-xs">{label || key}: </span>
                            <span className="font-medium">{String(value)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpecialtyFormsTab;
