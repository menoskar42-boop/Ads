import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePatients } from '@/hooks/usePatients';
import { usePermissions } from '@/hooks/usePermissions';
import { getPatientMeta, updatePatientMeta, patientMetaStore } from '@/stores/patientTagStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Search, Plus, User, Phone, Eye, CalendarPlus, FileText, EyeOff,
  KeyRound, Tag, Archive, ArchiveRestore, MessageCircle, Upload,
  X, Sparkles, Loader2, CheckSquare, Square,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Patient } from '@/types';

const Patients: React.FC = () => {
  const { t, language } = useLanguage();
  const isAr = language === 'ar';
  const navigate = useNavigate();
  const { patients, addPatient } = usePatients();
  const permissions = usePermissions();

  // ── Existing state ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'recent'>('name');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: '', nameAr: '', phone: '', email: '', password: '', dateOfBirth: '', gender: 'male' as 'male' | 'female',
  });

  // ── NEW: Bulk selection ──────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [tagDialog, setTagDialog] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // ── NEW: CSV Import ──────────────────────────────────────────────────────
  const [csvDialog, setCsvDialog] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Partial<Patient>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── NEW: AI Search ───────────────────────────────────────────────────────
  const [aiSearch, setAiSearch] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);

  // Collect all unique tags across patients
  const allTags = Array.from(new Set(
    patients.flatMap(p => getPatientMeta(p.id).tags)
  )).filter(Boolean);

  const getAge = (dob: string) => {
    if (!dob) return '-';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };

  // ── Filter & sort ────────────────────────────────────────────────────────
  const filtered = patients
    .filter(p => {
      const meta = getPatientMeta(p.id);
      if (!showArchived && meta.isArchived) return false;
      if (showArchived && !meta.isArchived) return false;
      if (activeTagFilter && !meta.tags.includes(activeTagFilter)) return false;
      if (aiResultIds !== null && !aiResultIds.includes(p.id)) return false;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.nameAr.includes(searchQuery.trim()) ||
        p.phone.replace(/[\s\-()]/g, '').includes(q.replace(/[\s\-()]/g, ''))
      );
    })
    .filter(p => genderFilter === 'all' || p.gender === genderFilter)
    .sort((a, b) => {
      if (sortBy === 'recent') return b.createdAt.localeCompare(a.createdAt);
      return (isAr ? a.nameAr : a.name).localeCompare(isAr ? b.nameAr : b.name);
    });

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(filtered.map(p => p.id)));
  const clearSelection = () => setSelected(new Set());

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const bulkWhatsApp = () => {
    const phones = Array.from(selected).map(id => patients.find(p => p.id === id)?.phone).filter(Boolean);
    phones.forEach(phone => {
      window.open(`https://wa.me/2${phone}`, '_blank');
    });
    toast.success(isAr ? `تم فتح ${phones.length} محادثة واتساب` : `Opened ${phones.length} WhatsApp chats`);
  };

  const bulkArchive = (archive: boolean) => {
    selected.forEach(id => updatePatientMeta(id, { isArchived: archive }));
    toast.success(archive
      ? (isAr ? `تم أرشفة ${selected.size} مريض` : `Archived ${selected.size} patients`)
      : (isAr ? `تم إلغاء أرشفة ${selected.size} مريض` : `Unarchived ${selected.size} patients`)
    );
    clearSelection();
  };

  const bulkTag = () => {
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    if (!tags.length) return;
    selected.forEach(id => {
      const meta = getPatientMeta(id);
      const combined = Array.from(new Set([...meta.tags, ...tags]));
      updatePatientMeta(id, { tags: combined });
    });
    toast.success(isAr ? `تم إضافة الوسوم لـ ${selected.size} مريض` : `Tags added to ${selected.size} patients`);
    setTagInput('');
    setTagDialog(false);
    clearSelection();
  };

  // ── CSV Import ────────────────────────────────────────────────────────────
  const handleCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error(isAr ? 'الملف فارغ' : 'Empty file'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
        return {
          name: obj.name || obj['full name'] || '',
          nameAr: obj.namear || obj['arabic name'] || obj['اسم عربي'] || '',
          phone: obj.phone || obj.mobile || obj.هاتف || '',
          email: obj.email || '',
          dateOfBirth: obj.dob || obj['date of birth'] || '',
          gender: (obj.gender?.toLowerCase() === 'female' || obj.gender === 'أنثى' ? 'female' : 'male') as 'male' | 'female',
        } as Partial<Patient>;
      }).filter(r => r.name && r.phone);
      setCsvPreview(rows);
      setCsvDialog(true);
    };
    reader.readAsText(file);
  };

  const importCSV = () => {
    let count = 0;
    csvPreview.forEach(row => {
      if (row.name && row.phone) {
        addPatient({
          name: row.name, nameAr: row.nameAr || row.name,
          phone: row.phone!, email: row.email || '', password: '',
          dateOfBirth: row.dateOfBirth || '', gender: row.gender || 'male',
        });
        count++;
      }
    });
    toast.success(isAr ? `تم استيراد ${count} مريض` : `Imported ${count} patients`);
    setCsvDialog(false);
    setCsvPreview([]);
  };

  // ── AI Smart Search ───────────────────────────────────────────────────────
  const runAiSearch = async () => {
    if (!aiSearch.trim()) return;
    setAiSearching(true);
    try {
      const patientList = patients.map(p => ({
        id: p.id,
        name: p.name,
        nameAr: p.nameAr,
        phone: p.phone,
        gender: p.gender,
        age: getAge(p.dateOfBirth),
        tags: getPatientMeta(p.id).tags,
      }));
      const res = await fetch('/api/smart-patient-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiSearch, patients: patientList }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiResultIds(data.ids || []);
        toast.success(isAr ? `وجدت ${data.ids?.length || 0} نتيجة` : `Found ${data.ids?.length || 0} results`);
      } else {
        // Fallback: keyword search
        const q = aiSearch.toLowerCase();
        const ids = patients.filter(p =>
          p.name.toLowerCase().includes(q) || p.nameAr.includes(aiSearch)
        ).map(p => p.id);
        setAiResultIds(ids);
      }
    } catch {
      const q = aiSearch.toLowerCase();
      const ids = patients.filter(p =>
        p.name.toLowerCase().includes(q) || p.nameAr.includes(aiSearch)
      ).map(p => p.id);
      setAiResultIds(ids);
    } finally {
      setAiSearching(false);
    }
  };

  // ── Add patient ───────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!newPatient.name || !newPatient.phone) return;
    addPatient({ ...newPatient });
    if (newPatient.password) {
      const pw = JSON.parse(localStorage.getItem('cf_patient_passwords') || '{}');
      pw[newPatient.phone] = newPatient.password;
      localStorage.setItem('cf_patient_passwords', JSON.stringify(pw));
    }
    setIsAddDialogOpen(false);
    setNewPatient({ name: '', nameAr: '', phone: '', email: '', password: '', dateOfBirth: '', gender: 'male' });
    setShowPw(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('patients.title')}</h1>
          <p className="text-muted-foreground">{filtered.length} {isAr ? 'مريض' : 'patients'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* CSV Import */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {isAr ? 'استيراد CSV' : 'Import CSV'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleCSVFile(e.target.files[0])}
          />

          {/* Archive toggle */}
          <Button
            variant={showArchived ? 'secondary' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => { setShowArchived(s => !s); clearSelection(); }}
          >
            {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {showArchived ? (isAr ? 'إلغاء الأرشفة' : 'Show Active') : (isAr ? 'المؤرشفون' : 'Archived')}
          </Button>

          {/* Add patient */}
          {permissions.canAddPatient && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" />{t('patients.add')}</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('patients.add')}</DialogTitle>
                  <DialogDescription>{isAr ? 'أضف معلومات المريض الجديد' : 'Add new patient information'}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{isAr ? 'الاسم (EN) *' : 'Name (EN) *'}</Label>
                      <Input value={newPatient.name} onChange={e => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="John Doe" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{isAr ? 'الاسم (AR)' : 'Name (AR)'}</Label>
                      <Input value={newPatient.nameAr} onChange={e => setNewPatient({ ...newPatient, nameAr: e.target.value })} placeholder="جون دو" dir="rtl" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{isAr ? 'رقم الهاتف *' : 'Phone *'}</Label>
                    <Input value={newPatient.phone} onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="01xxxxxxxxx" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isAr ? 'البريد الإلكتروني' : 'Email'}</Label>
                    <Input type="email" value={newPatient.email} onChange={e => setNewPatient({ ...newPatient, email: e.target.value })} placeholder="patient@email.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      {isAr ? 'كلمة المرور (للدخول على البوابة)' : 'Password (for patient portal)'}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPw ? 'text' : 'password'}
                        value={newPatient.password}
                        onChange={e => setNewPatient({ ...newPatient, password: e.target.value })}
                        placeholder={isAr ? 'على الأقل 6 أحرف' : 'At least 6 characters'}
                        className="pr-10 rtl:pr-3 rtl:pl-10"
                      />
                      <button type="button" className="absolute right-2 rtl:right-auto rtl:left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(v => !v)}>
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{isAr ? 'تاريخ الميلاد' : 'Date of Birth'}</Label>
                      <Input type="date" value={newPatient.dateOfBirth} onChange={e => setNewPatient({ ...newPatient, dateOfBirth: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('patients.gender')}</Label>
                      <Select value={newPatient.gender} onValueChange={(v: 'male' | 'female') => setNewPatient({ ...newPatient, gender: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          <SelectItem value="male">{t('patients.male')}</SelectItem>
                          <SelectItem value="female">{t('patients.female')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t('common.cancel')}</Button>
                  <Button onClick={handleAdd} disabled={!newPatient.name || !newPatient.phone}>{t('common.save')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* AI Smart Search */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute top-2.5 h-4 w-4 text-purple-400" style={{ [language === 'ar' ? 'right' : 'left']: '10px' }} />
              <Input
                value={aiSearch}
                onChange={e => setAiSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAiSearch()}
                placeholder={isAr ? 'بحث ذكي: "مرضى السكر فوق 50 سنة"...' : 'AI search: "diabetic patients over 50"...'}
                style={{ [language === 'ar' ? 'paddingRight' : 'paddingLeft']: '36px' }}
              />
            </div>
            <Button onClick={runAiSearch} disabled={aiSearching || !aiSearch.trim()} variant="outline" size="sm" className="gap-1.5">
              {aiSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-purple-500" />}
              {isAr ? 'بحث AI' : 'AI Search'}
            </Button>
            {aiResultIds !== null && (
              <Button variant="ghost" size="sm" onClick={() => { setAiResultIds(null); setAiSearch(''); }} className="gap-1">
                <X className="h-4 w-4" />{isAr ? 'مسح' : 'Clear'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters + Tag chips */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground rtl:left-auto rtl:right-3" />
              <Input
                placeholder={isAr ? 'بحث بالاسم أو رقم الهاتف...' : 'Search by name or phone number...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 rtl:pl-3 rtl:pr-10"
              />
            </div>
            <Select value={genderFilter} onValueChange={(v: 'all' | 'male' | 'female') => setGenderFilter(v)}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={t('patients.gender')} /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value="all">{isAr ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="male">{t('patients.male')}</SelectItem>
                <SelectItem value="female">{t('patients.female')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: 'name' | 'recent') => setSortBy(v)}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value="name">{isAr ? 'الاسم' : 'Name'}</SelectItem>
                <SelectItem value="recent">{isAr ? 'الأحدث' : 'Recent'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveTagFilter(null)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${!activeTagFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {isAr ? 'الكل' : 'All'}
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${activeTagFilter === tag ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-primary">{selected.size} {isAr ? 'محدد' : 'selected'}</span>
          <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={bulkWhatsApp}>
            <MessageCircle className="h-3.5 w-3.5 text-green-600" />
            {isAr ? 'واتساب' : 'WhatsApp'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => setTagDialog(true)}>
            <Tag className="h-3.5 w-3.5 text-blue-600" />
            {isAr ? 'وسم' : 'Tag'}
          </Button>
          {!showArchived ? (
            <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => bulkArchive(true)}>
              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              {isAr ? 'أرشفة' : 'Archive'}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={() => bulkArchive(false)}>
              <ArchiveRestore className="h-3.5 w-3.5 text-muted-foreground" />
              {isAr ? 'إلغاء أرشفة' : 'Unarchive'}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 ms-auto" onClick={clearSelection}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <button onClick={selected.size === filtered.length ? clearSelection : selectAll}>
                    {selected.size === filtered.length && filtered.length > 0
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </TableHead>
                <TableHead>{t('patients.name')}</TableHead>
                <TableHead>{t('patients.phone')}</TableHead>
                <TableHead>{t('patients.age')}</TableHead>
                <TableHead>{t('patients.gender')}</TableHead>
                <TableHead>{isAr ? 'الوسوم' : 'Tags'}</TableHead>
                <TableHead className="w-32 text-right">{isAr ? 'إجراءات' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(patient => {
                const meta = getPatientMeta(patient.id);
                const isSelected = selected.has(patient.id);
                return (
                  <TableRow
                    key={patient.id}
                    className={`cursor-pointer hover:bg-accent/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    onClick={() => navigate(`/patients/${patient.id}`)}
                  >
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(patient.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium">{isAr ? patient.nameAr : patient.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3" />{patient.phone}
                      </div>
                    </TableCell>
                    <TableCell>{getAge(patient.dateOfBirth)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {patient.gender === 'male' ? t('patients.male') : t('patients.female')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {meta.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">#{tag}</span>
                        ))}
                        {meta.tags.length > 3 && <span className="text-xs text-muted-foreground">+{meta.tags.length - 3}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-view-profile-${patient.id}`} onClick={(e) => { e.stopPropagation(); navigate(`/patients/${patient.id}`); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isAr ? 'عرض الملف' : 'View Profile'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-book-appointment-${patient.id}`} onClick={(e) => { e.stopPropagation(); navigate(`/appointments?patientId=${patient.id}`); }}>
                              <CalendarPlus className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isAr ? 'حجز موعد' : 'Book Appointment'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-medical-file-${patient.id}`} onClick={(e) => { e.stopPropagation(); navigate(`/patients/${patient.id}?tab=medical`); }}>
                              <FileText className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isAr ? 'الملف الطبي' : 'Medical File'}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <User className="h-10 w-10 opacity-40" />
                      <p className="text-sm font-medium">{isAr ? 'لا يوجد مرضى' : 'No patients found'}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tag dialog */}
      <Dialog open={tagDialog} onOpenChange={setTagDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isAr ? 'إضافة وسوم' : 'Add Tags'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{isAr ? `إضافة وسوم لـ ${selected.size} مريض` : `Add tags to ${selected.size} patients`}</p>
            <div>
              <Label>{isAr ? 'الوسوم (مفصولة بفاصلة)' : 'Tags (comma-separated)'}</Label>
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder={isAr ? 'مثال: سكري, ضغط, مزمن' : 'e.g. diabetes, hypertension, chronic'}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={bulkTag}>{isAr ? 'إضافة' : 'Add Tags'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV preview dialog */}
      <Dialog open={csvDialog} onOpenChange={setCsvDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAr ? 'معاينة البيانات المستوردة' : 'CSV Import Preview'}</DialogTitle>
            <DialogDescription>{isAr ? `${csvPreview.length} سطر جاهز للاستيراد` : `${csvPreview.length} rows ready to import`}</DialogDescription>
          </DialogHeader>
          <div className="rounded border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{isAr ? 'الهاتف' : 'Phone'}</TableHead>
                  <TableHead>{isAr ? 'الجنس' : 'Gender'}</TableHead>
                  <TableHead>{isAr ? 'تاريخ الميلاد' : 'DOB'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvPreview.slice(0, 20).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.phone}</TableCell>
                    <TableCell>{row.gender}</TableCell>
                    <TableCell>{row.dateOfBirth}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {csvPreview.length > 20 && (
            <p className="text-xs text-muted-foreground text-center">+{csvPreview.length - 20} {isAr ? 'سطر إضافي' : 'more rows'}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCsvDialog(false); setCsvPreview([]); }}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={importCSV}>{isAr ? `استيراد ${csvPreview.length} مريض` : `Import ${csvPreview.length} patients`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Patients;
