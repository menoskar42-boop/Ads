import React, { useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { getClinicInventory, dispenseItem } from '@/stores/inventoryStore';
import { visitStore } from '@/stores/visitStore';
import { useVisits } from '@/hooks/useVisits';
import { usePrescriptions } from '@/hooks/usePrescriptions';
import { useUsers } from '@/hooks/useUsers';
import { usePatients } from '@/hooks/usePatients';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { formatDate } from '@/lib/dateFormat';
import { Prescription, PrescriptionMedication, MedicationFrequency, PrescriptionStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Pill, Plus, RefreshCw, Clock, AlertTriangle, CheckCircle,
  XCircle, Trash2, Pencil, Calendar, Package, Printer, BookOpen, ChevronDown, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

interface PrescriptionsTabProps {
  patientId: string;
}

// ─── Common Egyptian Medications Autocomplete ───
const MEDICATIONS: { name: string; nameAr: string; defaultDosage: string }[] = [
  { name: 'Paracetamol', nameAr: 'باراسيتامول', defaultDosage: '500mg' },
  { name: 'Panadol', nameAr: 'بانادول', defaultDosage: '500mg' },
  { name: 'Paramol', nameAr: 'باراميكس', defaultDosage: '500mg' },
  { name: 'Ibuprofen', nameAr: 'إيبوبروفين', defaultDosage: '400mg' },
  { name: 'Brufen', nameAr: 'بروفين', defaultDosage: '400mg' },
  { name: 'Voltaren', nameAr: 'فولتارين', defaultDosage: '50mg' },
  { name: 'Amoxicillin', nameAr: 'أموكسيسيلين', defaultDosage: '500mg' },
  { name: 'Augmentin', nameAr: 'أوجمنتين', defaultDosage: '625mg' },
  { name: 'Azithromycin', nameAr: 'أزيثروميسين', defaultDosage: '500mg' },
  { name: 'Ciprofloxacin', nameAr: 'سيبروفلوكساسين', defaultDosage: '500mg' },
  { name: 'Metronidazole', nameAr: 'ميترونيدازول', defaultDosage: '500mg' },
  { name: 'Flagyl', nameAr: 'فلاجيل', defaultDosage: '500mg' },
  { name: 'Omeprazole', nameAr: 'أوميبرازول', defaultDosage: '20mg' },
  { name: 'Nexium', nameAr: 'نيكسيوم', defaultDosage: '40mg' },
  { name: 'Pantoprazole', nameAr: 'بانتوبرازول', defaultDosage: '40mg' },
  { name: 'Losartan', nameAr: 'لوسارتان', defaultDosage: '50mg' },
  { name: 'Amlodipine', nameAr: 'أملوديبين', defaultDosage: '5mg' },
  { name: 'Atenolol', nameAr: 'أتينولول', defaultDosage: '50mg' },
  { name: 'Lisinopril', nameAr: 'ليزينوبريل', defaultDosage: '10mg' },
  { name: 'Metformin', nameAr: 'ميتفورمين', defaultDosage: '500mg' },
  { name: 'Glucophage', nameAr: 'جلوكوفاج', defaultDosage: '500mg' },
  { name: 'Atorvastatin', nameAr: 'أتورفاستاتين', defaultDosage: '20mg' },
  { name: 'Crestor', nameAr: 'كريستور', defaultDosage: '10mg' },
  { name: 'Aspirin', nameAr: 'أسبرين', defaultDosage: '75mg' },
  { name: 'Clopidogrel', nameAr: 'كلوبيدوجريل', defaultDosage: '75mg' },
  { name: 'Furosemide', nameAr: 'فيوروسيميد', defaultDosage: '40mg' },
  { name: 'Dexamethasone', nameAr: 'ديكساميثازون', defaultDosage: '4mg' },
  { name: 'Prednisolone', nameAr: 'بريدنيزولون', defaultDosage: '5mg' },
  { name: 'Cetirizine', nameAr: 'سيتيريزين', defaultDosage: '10mg' },
  { name: 'Loratadine', nameAr: 'لوراتادين', defaultDosage: '10mg' },
  { name: 'Diphenhydramine', nameAr: 'ديفينهيدرامين', defaultDosage: '25mg' },
  { name: 'Salbutamol', nameAr: 'سالبوتامول', defaultDosage: '4mg' },
  { name: 'Ventolin', nameAr: 'فينتولين', defaultDosage: '100mcg' },
  { name: 'Theophylline', nameAr: 'ثيوفيلين', defaultDosage: '200mg' },
  { name: 'Codeine', nameAr: 'كودايين', defaultDosage: '30mg' },
  { name: 'Tramadol', nameAr: 'ترامادول', defaultDosage: '50mg' },
  { name: 'Diazepam', nameAr: 'ديازيبام', defaultDosage: '5mg' },
  { name: 'Alprazolam', nameAr: 'ألبرازولام', defaultDosage: '0.25mg' },
  { name: 'Sertraline', nameAr: 'سيرترالين', defaultDosage: '50mg' },
  { name: 'Fluoxetine', nameAr: 'فلوكسيتين', defaultDosage: '20mg' },
  { name: 'Vitamin D3', nameAr: 'فيتامين د3', defaultDosage: '1000IU' },
  { name: 'Vitamin B Complex', nameAr: 'فيتامين ب مركب', defaultDosage: '1 tablet' },
  { name: 'Folic Acid', nameAr: 'حمض الفوليك', defaultDosage: '5mg' },
  { name: 'Iron Supplement', nameAr: 'مكمل الحديد', defaultDosage: '150mg' },
  { name: 'Calcium Carbonate', nameAr: 'كربونات الكالسيوم', defaultDosage: '500mg' },
  { name: 'Zinc Supplement', nameAr: 'مكمل الزنك', defaultDosage: '20mg' },
];

// ─── Prescription Templates ───
type TemplateKey = 'cold' | 'hypertension' | 'pain' | 'diabetes' | 'allergy' | 'gastric';

const TEMPLATES: Record<TemplateKey, {
  nameEn: string; nameAr: string;
  meds: Omit<PrescriptionMedication, 'id'>[];
  notes?: string;
}> = {
  cold: {
    nameEn: 'Cold & Flu', nameAr: 'البرد والإنفلونزا',
    meds: [
      { name: 'Paracetamol', nameAr: 'باراسيتامول', dosage: '500mg', frequency: 'three_times_daily', duration: '5 days', refillsTotal: 0, refillsUsed: 0 },
      { name: 'Cetirizine', nameAr: 'سيتيريزين', dosage: '10mg', frequency: 'once_daily', duration: '5 days', refillsTotal: 0, refillsUsed: 0 },
    ],
    notes: 'Rest well, drink fluids, avoid cold air.',
  },
  hypertension: {
    nameEn: 'Hypertension', nameAr: 'ضغط الدم',
    meds: [
      { name: 'Amlodipine', nameAr: 'أملوديبين', dosage: '5mg', frequency: 'once_daily', duration: '30 days', refillsTotal: 2, refillsUsed: 0 },
      { name: 'Losartan', nameAr: 'لوسارتان', dosage: '50mg', frequency: 'once_daily', duration: '30 days', refillsTotal: 2, refillsUsed: 0 },
    ],
    notes: 'Monitor blood pressure daily. Low sodium diet.',
  },
  pain: {
    nameEn: 'Pain Relief', nameAr: 'تسكين الألم',
    meds: [
      { name: 'Ibuprofen', nameAr: 'إيبوبروفين', dosage: '400mg', frequency: 'three_times_daily', duration: '7 days', instructions: 'Take with food', refillsTotal: 0, refillsUsed: 0 },
      { name: 'Paracetamol', nameAr: 'باراسيتامول', dosage: '1000mg', frequency: 'twice_daily', duration: '7 days', refillsTotal: 0, refillsUsed: 0 },
    ],
  },
  diabetes: {
    nameEn: 'Type 2 Diabetes', nameAr: 'السكري النوع الثاني',
    meds: [
      { name: 'Metformin', nameAr: 'ميتفورمين', dosage: '500mg', frequency: 'twice_daily', duration: '30 days', instructions: 'Take with meals', refillsTotal: 2, refillsUsed: 0 },
    ],
    notes: 'Monitor blood sugar. Diet control. Regular exercise.',
  },
  allergy: {
    nameEn: 'Allergic Reaction', nameAr: 'الحساسية',
    meds: [
      { name: 'Cetirizine', nameAr: 'سيتيريزين', dosage: '10mg', frequency: 'once_daily', duration: '10 days', refillsTotal: 0, refillsUsed: 0 },
      { name: 'Dexamethasone', nameAr: 'ديكساميثازون', dosage: '4mg', frequency: 'twice_daily', duration: '5 days', refillsTotal: 0, refillsUsed: 0 },
    ],
  },
  gastric: {
    nameEn: 'Gastric & Acidity', nameAr: 'حموضة المعدة',
    meds: [
      { name: 'Omeprazole', nameAr: 'أوميبرازول', dosage: '20mg', frequency: 'twice_daily', duration: '14 days', instructions: 'Take before meals', refillsTotal: 0, refillsUsed: 0 },
      { name: 'Metronidazole', nameAr: 'ميترونيدازول', dosage: '500mg', frequency: 'three_times_daily', duration: '7 days', instructions: 'Take with food', refillsTotal: 0, refillsUsed: 0 },
    ],
    notes: 'Avoid spicy foods. Eat small frequent meals.',
  },
};

const frequencyLabels: Record<MedicationFrequency, { en: string; ar: string }> = {
  once_daily: { en: 'Once daily', ar: 'مرة يومياً' },
  twice_daily: { en: 'Twice daily', ar: 'مرتين يومياً' },
  three_times_daily: { en: '3 times daily', ar: '3 مرات يومياً' },
  four_times_daily: { en: '4 times daily', ar: '4 مرات يومياً' },
  as_needed: { en: 'As needed', ar: 'عند الحاجة' },
  weekly: { en: 'Weekly', ar: 'أسبوعياً' },
};

const statusConfig: Record<PrescriptionStatus, { en: string; ar: string; class: string }> = {
  active: { en: 'Active', ar: 'نشط', class: 'bg-chart-2/10 text-chart-2' },
  completed: { en: 'Completed', ar: 'مكتمل', class: 'bg-muted text-muted-foreground' },
  cancelled: { en: 'Cancelled', ar: 'ملغي', class: 'bg-destructive/10 text-destructive' },
};

const emptyMed: Omit<PrescriptionMedication, 'id'> = {
  name: '', nameAr: '', dosage: '', frequency: 'once_daily',
  duration: '', refillsTotal: 0, refillsUsed: 0,
};

const PrescriptionsTab: React.FC<PrescriptionsTabProps> = ({ patientId }) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { prescriptions, addPrescription, updatePrescription, deletePrescription, recordRefill } = usePrescriptions({ patientId });
  const { users } = useUsers();
  const { patients } = usePatients();
  const { settings } = useClinicSettings();
  const { visits } = useVisits();

  const [addOpen, setAddOpen] = useState(false);
  const [editRx, setEditRx] = useState<Prescription | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | PrescriptionStatus>('all');
  const [autocompletes, setAutocompletes] = useState<{ [idx: number]: string[] }>({});

  const [formMeds, setFormMeds] = useState<Omit<PrescriptionMedication, 'id'>[]>([{ ...emptyMed }]);
  const [formNotes, setFormNotes] = useState('');
  const [formExpiry, setFormExpiry] = useState('');

  // AI suggestions state
  const [aiDiagnosis, setAiDiagnosis] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [isAISuggesting, setIsAISuggesting] = useState(false);

  const isAr = language === 'ar';

  const patient = patients.find(p => p.id === patientId);
  const patientRx = prescriptions
    .filter(rx => rx.patientId === patientId)
    .filter(rx => filterStatus === 'all' || rx.status === filterStatus)
    .sort((a, b) => b.prescribedAt.localeCompare(a.prescribedAt));

  const getName = (userId: string) => {
    const u = users.find(x => x.id === userId);
    return isAr ? u?.nameAr : u?.name;
  };

  const resetForm = () => {
    setFormMeds([{ ...emptyMed }]);
    setFormNotes('');
    setFormExpiry('');
    setAutocompletes({});
    setAiDiagnosis('');
    setAiSuggestions([]);
  };

  const handleAISuggest = async () => {
    if (!aiDiagnosis.trim()) return;
    setIsAISuggesting(true);
    setAiSuggestions([]);
    try {
      const res = await fetch('/api/suggest-medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diagnosis: aiDiagnosis, patientAge: patient?.dateOfBirth ? String(new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()) : '', patientGender: patient?.gender || '' }),
      });
      const data = await res.json();
      setAiSuggestions(data.suggestions || []);
    } catch {
      toast.error(isAr ? 'فشل في جلب الاقتراحات' : 'Failed to get suggestions');
    } finally {
      setIsAISuggesting(false);
    }
  };

  const applyAISuggestion = (sugg: any) => {
    setFormMeds(prev => [...prev.filter(m => m.name), {
      name: sugg.name,
      nameAr: sugg.nameAr || sugg.name,
      dosage: sugg.dosage || '',
      frequency: sugg.frequency || 'once_daily',
      duration: sugg.duration || '',
      instructions: sugg.instructions || '',
      instructionsAr: sugg.instructionsAr || '',
      refillsTotal: 0,
      refillsUsed: 0,
    }]);
    toast.success(isAr ? `تمت إضافة ${sugg.nameAr || sugg.name}` : `Added ${sugg.name}`);
  };

  const openAdd = () => { resetForm(); setAddOpen(true); };
  const openEdit = (rx: Prescription) => {
    setFormMeds(rx.medications.map(({ id, ...rest }) => rest));
    setFormNotes(rx.notes || '');
    setFormExpiry(rx.expiresAt || '');
    setEditRx(rx);
  };

  const applyTemplate = (key: TemplateKey) => {
    const tpl = TEMPLATES[key];
    setFormMeds(tpl.meds.map(m => ({ ...m })));
    if (tpl.notes) setFormNotes(tpl.notes);
    toast.success(isAr ? `تم تطبيق نموذج: ${tpl.nameAr}` : `Template applied: ${tpl.nameEn}`);
  };

  const addMedRow = () => setFormMeds(prev => [...prev, { ...emptyMed }]);
  const removeMedRow = (index: number) => {
    if (formMeds.length <= 1) return;
    setFormMeds(prev => prev.filter((_, i) => i !== index));
    setAutocompletes(prev => { const next = { ...prev }; delete next[index]; return next; });
  };

  const updateMedRow = (index: number, field: string, value: any) => {
    setFormMeds(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const handleMedNameChange = (index: number, value: string) => {
    updateMedRow(index, 'name', value);
    if (value.length >= 2) {
      const suggestions = MEDICATIONS
        .filter(m => m.name.toLowerCase().startsWith(value.toLowerCase()))
        .map(m => m.name)
        .slice(0, 6);
      setAutocompletes(prev => ({ ...prev, [index]: suggestions }));
    } else {
      setAutocompletes(prev => { const next = { ...prev }; delete next[index]; return next; });
    }
  };

  const selectSuggestion = (index: number, name: string) => {
    const med = MEDICATIONS.find(m => m.name === name);
    if (med) {
      setFormMeds(prev => prev.map((m, i) => i === index
        ? { ...m, name: med.name, nameAr: med.nameAr, dosage: med.defaultDosage }
        : m
      ));
    }
    setAutocompletes(prev => { const next = { ...prev }; delete next[index]; return next; });
  };

  const savePrescription = () => {
    const validMeds = formMeds.filter(m => m.name.trim() && m.dosage.trim());
    if (validMeds.length === 0) {
      toast.error(isAr ? 'أضف دواء واحد على الأقل' : 'Add at least one medication');
      return;
    }
    const medications: PrescriptionMedication[] = validMeds.map((m, i) => ({
      ...m, id: `med-${Date.now()}-${i}`, refillsTotal: Number(m.refillsTotal) || 0, refillsUsed: 0,
    }));
    if (editRx) {
      updatePrescription(editRx.id, { medications, notes: formNotes.trim() || undefined, expiresAt: formExpiry || undefined });
      setEditRx(null);
      toast.success(isAr ? 'تم تحديث الوصفة' : 'Prescription updated');
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const localVisits = visitStore.filter(
        v => v.patientId === patientId &&
             v.date === today &&
             (v.status === 'in_consultation' || v.status === 'waiting' || v.status === 'checked_in')
      );
      const apiVisits = visits.filter(
        v => v.patientId === patientId &&
             v.date === today &&
             (v.status === 'in_consultation' || v.status === 'waiting' || v.status === 'checked_in')
      );
      const candidateVisits = apiVisits.length > 0 ? apiVisits : localVisits;
      const activeVisit = candidateVisits.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
      addPrescription({
        patientId, doctorId: user?.id || 'u-2', status: 'active', medications,
        visitId: activeVisit?.id,
        notes: formNotes.trim() || undefined,
        prescribedAt: new Date().toISOString().split('T')[0],
        expiresAt: formExpiry || undefined,
      });
      setAddOpen(false);
      toast.success(isAr ? 'تمت إضافة الوصفة' : 'Prescription added');
    }
    resetForm();
  };

  const handleRefill = (rxId: string, medId: string) => {
    recordRefill(rxId, medId);
    toast.success(isAr ? 'تم تسجيل إعادة الصرف' : 'Refill recorded');
  };

  // STEP 5 — Dispense now: match medication name against inventory and deduct 1 unit
  const handleDispenseNow = (rxId: string, med: PrescriptionMedication) => {
    const clinicId = user?.clinicId || 'clinic-1';
    const inventory = getClinicInventory(clinicId);
    const match = inventory.find(i =>
      i.name.toLowerCase().includes(med.name.toLowerCase()) ||
      i.nameAr.includes(med.nameAr || '') ||
      med.name.toLowerCase().includes(i.name.toLowerCase())
    );
    if (!match) {
      toast.error(isAr ? `"${med.nameAr || med.name}" غير موجود في المخزون` : `"${med.name}" not found in inventory`);
      return;
    }
    const result = dispenseItem({
      clinicId, itemId: match.id, quantity: 1,
      patientId, prescriptionId: rxId,
      dispensedBy: user?.id,
      notes: `Auto-dispensed from prescription`,
    });
    if (result.ok) {
      toast.success(isAr ? `تم صرف ${med.nameAr || med.name} من المخزون` : `Dispensed ${med.name} from inventory`);
    } else {
      toast.error(isAr ? result.errorAr : result.error);
    }
  };

  const confirmDelete = () => {
    if (deleteId) { deletePrescription(deleteId); setDeleteId(null); toast.success(isAr ? 'تم حذف الوصفة' : 'Prescription deleted'); }
  };

  const isRefillDueSoon = (med: PrescriptionMedication) => {
    if (!med.nextRefillDate || med.refillsUsed >= med.refillsTotal) return false;
    const diff = new Date(med.nextRefillDate).getTime() - Date.now();
    return diff <= 7 * 24 * 60 * 60 * 1000 && diff > 0;
  };
  const isRefillOverdue = (med: PrescriptionMedication) => {
    if (!med.nextRefillDate || med.refillsUsed >= med.refillsTotal) return false;
    return new Date(med.nextRefillDate).getTime() < Date.now();
  };

  const refillAlerts = patientRx
    .filter(rx => rx.status === 'active')
    .flatMap(rx => rx.medications)
    .filter(m => isRefillDueSoon(m) || isRefillOverdue(m)).length;

  // ─── PDF Print ───
  const handlePrint = (rx: Prescription) => {
    const doctorUser = users.find(u => u.id === rx.doctorId);
    const doctorName = isAr ? doctorUser?.nameAr : doctorUser?.name;
    const patientName = isAr ? patient?.nameAr : patient?.name;
    const clinicName = isAr ? settings.nameAr : settings.name;

    const medsHTML = rx.medications.map(med => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
          <strong>${isAr && med.nameAr ? med.nameAr : med.name}</strong>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${med.dosage}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${isAr ? frequencyLabels[med.frequency].ar : frequencyLabels[med.frequency].en}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${med.duration || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${isAr && med.instructionsAr ? med.instructionsAr : (med.instructions || '—')}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8"/>
  <title>${isAr ? 'وصفة طبية' : 'Prescription'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0066cc; padding-bottom: 16px; margin-bottom: 24px; }
    .clinic-name { font-size: 22px; font-weight: bold; color: #0066cc; }
    .clinic-info { font-size: 11px; color: #666; margin-top: 4px; }
    .rx-symbol { font-size: 48px; color: #0066cc; font-weight: bold; line-height: 1; }
    .section-label { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #666; letter-spacing: 0.5px; margin-bottom: 6px; margin-top: 20px; }
    .patient-doctor { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; background: #f8f9fa; padding: 14px 16px; border-radius: 6px; margin-bottom: 20px; }
    .field-label { font-size: 10px; color: #888; text-transform: uppercase; }
    .field-value { font-size: 14px; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #0066cc; color: white; padding: 10px 12px; font-size: 11px; font-weight: 600; text-align: ${isAr ? 'right' : 'left'}; }
    tr:nth-child(even) td { background: #fafafa; }
    .notes { background: #fffbf0; border: 1px solid #ffe090; border-radius: 6px; padding: 12px 16px; margin-top: 16px; font-size: 12px; }
    .footer { margin-top: 40px; display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px solid #ddd; }
    .signature-line { border-bottom: 1px solid #333; width: 160px; margin-top: 30px; }
    .signature-label { font-size: 10px; color: #666; margin-top: 4px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="clinic-name">${clinicName}</div>
      <div class="clinic-info">${settings.address}<br/>${settings.phone} &nbsp;|&nbsp; ${settings.email}</div>
    </div>
    <div class="rx-symbol">℞</div>
  </div>

  <div class="patient-doctor">
    <div>
      <div class="field-label">${isAr ? 'اسم المريض' : 'Patient Name'}</div>
      <div class="field-value">${patientName || '—'}</div>
      <div class="field-label" style="margin-top:10px">${isAr ? 'تاريخ الوصفة' : 'Date'}</div>
      <div class="field-value">${formatDate(rx.prescribedAt, language)}</div>
    </div>
    <div>
      <div class="field-label">${isAr ? 'الطبيب المعالج' : 'Prescribing Doctor'}</div>
      <div class="field-value">${doctorName || '—'}</div>
      ${rx.expiresAt ? `<div class="field-label" style="margin-top:10px">${isAr ? 'تاريخ الانتهاء' : 'Expires'}</div><div class="field-value">${formatDate(rx.expiresAt, language)}</div>` : ''}
    </div>
  </div>

  <div class="section-label">${isAr ? 'الأدوية الموصوفة' : 'Prescribed Medications'}</div>
  <table>
    <thead>
      <tr>
        <th>${isAr ? 'اسم الدواء' : 'Medication'}</th>
        <th>${isAr ? 'الجرعة' : 'Dosage'}</th>
        <th>${isAr ? 'التكرار' : 'Frequency'}</th>
        <th>${isAr ? 'المدة' : 'Duration'}</th>
        <th>${isAr ? 'التعليمات' : 'Instructions'}</th>
      </tr>
    </thead>
    <tbody>${medsHTML}</tbody>
  </table>

  ${rx.notes ? `<div class="notes"><strong>${isAr ? 'ملاحظات: ' : 'Notes: '}</strong>${rx.notes}</div>` : ''}

  <div class="footer">
    <div>
      <div class="signature-line"></div>
      <div class="signature-label">${isAr ? 'توقيع الطبيب' : 'Doctor Signature'}</div>
    </div>
    <div style="text-align:${isAr ? 'left' : 'right'}; font-size:10px; color:#aaa;">
      ${isAr ? 'تم الإصدار بواسطة ClinicFlow' : 'Issued via ClinicFlow'}
    </div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=800,height=700');
    if (win) { win.document.write(html); win.document.close(); win.onload = () => win.print(); }
  };

  // ─── Form UI ───
  const MedicationForm = () => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      {/* AI Drug Suggestions */}
      <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {isAr ? 'اقتراحات الأدوية بالذكاء الاصطناعي' : 'AI Drug Suggestions'}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={isAr ? 'أدخل التشخيص... مثال: ارتفاع ضغط الدم' : 'Enter diagnosis... e.g. Hypertension'}
            value={aiDiagnosis}
            onChange={e => setAiDiagnosis(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAISuggest()}
            dir={isAr ? 'rtl' : 'ltr'}
          />
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1 border-primary/40 text-primary" disabled={isAISuggesting || !aiDiagnosis.trim()} onClick={handleAISuggest}>
            {isAISuggesting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isAr ? 'اقترح' : 'Suggest'}
          </Button>
        </div>
        {aiSuggestions.length > 0 && (
          <div className="space-y-1">
            {aiSuggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-background rounded border text-xs gap-2">
                <div className="min-w-0">
                  <span className="font-medium">{isAr ? s.nameAr : s.name}</span>
                  <span className="text-muted-foreground mx-1">·</span>
                  <span className="text-muted-foreground">{s.dosage} · {s.duration}</span>
                  {s.reason && <p className="text-muted-foreground mt-0.5 line-clamp-1">{s.reason}</p>}
                </div>
                <Button type="button" size="sm" variant="outline" className="h-6 text-xs shrink-0" onClick={() => applyAISuggestion(s)}>
                  {isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Picker */}
      <div className="flex flex-wrap gap-2 pb-1">
        <span className="text-xs text-muted-foreground flex items-center gap-1 me-1">
          <BookOpen className="h-3.5 w-3.5" />
          {isAr ? 'نماذج جاهزة:' : 'Templates:'}
        </span>
        {(Object.entries(TEMPLATES) as [TemplateKey, typeof TEMPLATES[TemplateKey]][]).map(([key, tpl]) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => applyTemplate(key)}
          >
            {isAr ? tpl.nameAr : tpl.nameEn}
          </Button>
        ))}
      </div>
      <Separator />

      {formMeds.map((med, idx) => (
        <Card key={idx} className="border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {isAr ? `دواء ${idx + 1}` : `Medication ${idx + 1}`}
              </span>
              {formMeds.length > 1 && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMedRow(idx)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Autocomplete medication name */}
              <div className="grid gap-1.5 relative">
                <Label className="text-xs">{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'} *</Label>
                <Input
                  value={med.name}
                  onChange={e => handleMedNameChange(idx, e.target.value)}
                  onBlur={() => setTimeout(() => setAutocompletes(prev => { const n = { ...prev }; delete n[idx]; return n; }), 150)}
                  placeholder="e.g. Paracetamol"
                  data-testid={`input-med-name-${idx}`}
                  autoComplete="off"
                />
                {autocompletes[idx] && autocompletes[idx].length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                    {autocompletes[idx].map(suggestion => (
                      <button
                        key={suggestion}
                        type="button"
                        className="w-full text-start px-3 py-2 text-sm hover:bg-accent transition-colors"
                        onMouseDown={() => selectSuggestion(idx, suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input value={med.nameAr} onChange={e => updateMedRow(idx, 'nameAr', e.target.value)} dir="rtl" data-testid={`input-med-name-ar-${idx}`} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{isAr ? 'الجرعة' : 'Dosage'} *</Label>
                <Input value={med.dosage} onChange={e => updateMedRow(idx, 'dosage', e.target.value)} placeholder="e.g. 500mg" data-testid={`input-med-dosage-${idx}`} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{isAr ? 'التكرار' : 'Frequency'}</Label>
                <Select value={med.frequency} onValueChange={v => updateMedRow(idx, 'frequency', v)}>
                  <SelectTrigger data-testid={`select-med-frequency-${idx}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(frequencyLabels).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{isAr ? val.ar : val.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{isAr ? 'المدة' : 'Duration'}</Label>
                <Input value={med.duration} onChange={e => updateMedRow(idx, 'duration', e.target.value)} placeholder="e.g. 7 days" data-testid={`input-med-duration-${idx}`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">{isAr ? 'التعليمات' : 'Instructions'}</Label>
                <Input value={med.instructions || ''} onChange={e => updateMedRow(idx, 'instructions', e.target.value)} placeholder={isAr ? 'مع الطعام...' : 'Take with food...'} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">{isAr ? 'عدد إعادات الصرف' : 'Total Refills'}</Label>
                <Input type="number" min={0} value={med.refillsTotal} onChange={e => updateMedRow(idx, 'refillsTotal', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" size="sm" onClick={addMedRow} className="w-full gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        {isAr ? 'إضافة دواء آخر' : 'Add Another Medication'}
      </Button>
      <Separator />
      <div className="grid gap-1.5">
        <Label className="text-xs">{isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}</Label>
        <Input type="date" value={formExpiry} onChange={e => setFormExpiry(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">{isAr ? 'ملاحظات' : 'Notes'}</Label>
        <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as any)}>
            <SelectTrigger className="w-[140px] h-9" data-testid="select-rx-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'الكل' : 'All'}</SelectItem>
              {Object.entries(statusConfig).map(([key, val]) => (
                <SelectItem key={key} value={key}>{isAr ? val.ar : val.en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {refillAlerts > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {refillAlerts} {isAr ? 'تنبيه إعادة صرف' : 'refill alert(s)'}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5" data-testid="button-new-prescription">
          <Plus className="h-4 w-4" />
          {isAr ? 'وصفة جديدة' : 'New Prescription'}
        </Button>
      </div>

      {/* Prescription List */}
      {patientRx.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Pill className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{isAr ? 'لا توجد وصفات طبية' : 'No prescriptions found'}</p>
          </CardContent>
        </Card>
      ) : (
        patientRx.map(rx => (
          <Card key={rx.id} className="border-border/50" data-testid={`card-prescription-${rx.id}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">
                      {rx.medications.map(m => isAr && m.nameAr ? m.nameAr : m.name).join(', ')}
                    </CardTitle>
                    <Badge className={statusConfig[rx.status]?.class} variant="secondary">
                      {isAr ? statusConfig[rx.status]?.ar : statusConfig[rx.status]?.en}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {getName(rx.doctorId)} · {formatDate(rx.prescribedAt, language)}
                    {rx.expiresAt && ` · ${isAr ? 'ينتهي' : 'Expires'} ${formatDate(rx.expiresAt, language)}`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(rx)} title={isAr ? 'طباعة' : 'Print'} data-testid={`button-print-${rx.id}`}>
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rx)} data-testid={`button-edit-rx-${rx.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(rx.id)} data-testid={`button-delete-rx-${rx.id}`}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {rx.medications.map(med => (
                <div key={med.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">
                        {isAr && med.nameAr ? med.nameAr : med.name}
                      </span>
                      <Badge variant="outline" className="text-xs">{med.dosage}</Badge>
                    </div>
                    {isRefillOverdue(med) && <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" />{isAr ? 'متأخر' : 'Overdue'}</Badge>}
                    {isRefillDueSoon(med) && !isRefillOverdue(med) && <Badge className="bg-chart-4/10 text-chart-4 gap-1 text-xs"><Clock className="h-3 w-3" />{isAr ? 'قريباً' : 'Due Soon'}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{isAr ? frequencyLabels[med.frequency].ar : frequencyLabels[med.frequency].en}</span>
                    {med.duration && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{med.duration}</span>}
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" />{isAr ? 'إعادة صرف' : 'Refills'}: {med.refillsUsed}/{med.refillsTotal}</span>
                    {med.nextRefillDate && med.refillsUsed < med.refillsTotal && <span>{isAr ? 'التالي' : 'Next'}: {formatDate(med.nextRefillDate, language)}</span>}
                  </div>
                  {med.instructions && <p className="text-xs text-muted-foreground italic">{isAr && med.instructionsAr ? med.instructionsAr : med.instructions}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    {rx.status === 'active' && med.refillsUsed < med.refillsTotal && (
                      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => handleRefill(rx.id, med.id)}>
                        <RefreshCw className="h-3 w-3" />{isAr ? 'تسجيل إعادة صرف' : 'Record Refill'}
                      </Button>
                    )}
                    {rx.status === 'active' && (
                      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs border-green-300 text-green-700 hover:bg-green-50" onClick={() => handleDispenseNow(rx.id, med)}>
                        <Package className="h-3 w-3" />{isAr ? 'صرف الآن' : 'Dispense now'}
                      </Button>
                    )}
                  </div>
                  {med.refillsUsed >= med.refillsTotal && med.refillsTotal > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3 text-chart-2" />{isAr ? 'اكتملت إعادات الصرف' : 'All refills used'}</span>
                  )}
                </div>
              ))}
              {rx.notes && (<><Separator /><p className="text-xs text-muted-foreground">{rx.notes}</p></>)}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{isAr ? 'وصفة طبية جديدة' : 'New Prescription'}</DialogTitle></DialogHeader>
          <MedicationForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={savePrescription} data-testid="button-save-prescription">{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editRx} onOpenChange={open => !open && setEditRx(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{isAr ? 'تعديل الوصفة' : 'Edit Prescription'}</DialogTitle></DialogHeader>
          <MedicationForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRx(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={savePrescription}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? 'حذف الوصفة' : 'Delete Prescription'}</AlertDialogTitle>
            <AlertDialogDescription>{isAr ? 'هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure? This cannot be undone.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isAr ? 'حذف' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PrescriptionsTab;
