import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import {
  getClinicInsuranceCompanies, addInsuranceCompany, updateInsuranceCompany, deleteInsuranceCompany,
  getAllClinicPatientInsurance, addPatientInsurance, updatePatientInsurance, deletePatientInsurance,
  getInsuranceCompany,
  getClinicContracts, addContract, updateContract, deleteContract,
  getClinicClaims, updateClaimStatus, getClaimsSummary,
  InsuranceCompany, PatientInsurance, InsuranceContract, InsuranceClaim, ClaimStatus,
} from '@/stores/insuranceStore';
import { usePatients } from '@/hooks/usePatients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Shield, Plus, Edit2, Trash2, Building2, FileText, Check, X, ClipboardList, ScrollText, Send, DollarSign } from 'lucide-react';

// ─── Company form defaults ────────────────────────────────────────────────────
const emptyCompany = {
  name: '', nameAr: '', contactPhone: '', coveragePercent: 80, notes: '', isActive: true,
};

// ─── Policy form defaults ─────────────────────────────────────────────────────
const emptyPolicy = {
  patientId: '', insuranceCompanyId: '', policyNumber: '', coveragePercent: 80,
  expiryDate: '', isActive: true,
};

// ─── Contract form defaults ───────────────────────────────────────────────────
const emptyContract = {
  insuranceCompanyId: '', serviceName: '', serviceNameAr: '',
  agreedPrice: 0, copayPct: 20, isActive: true, validFrom: '', validUntil: '',
};

const CLAIM_STATUS_COLORS: Record<ClaimStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  sent:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  paid:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  rejected:'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const Insurance: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const clinicId = user?.clinicId || 'clinic-1';

  // ── State ──────────────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<InsuranceCompany[]>(() => getClinicInsuranceCompanies(clinicId));
  const [policies,  setPolicies]  = useState<PatientInsurance[]>(() => getAllClinicPatientInsurance(clinicId));

  const { patients: allPatients } = usePatients();
  const patients = useMemo(() => allPatients.filter(p => p.clinicId === clinicId || !p.clinicId), [allPatients, clinicId]);

  const [contracts, setContracts] = useState<InsuranceContract[]>(() => getClinicContracts(clinicId));
  const [claims,    setClaims]    = useState<InsuranceClaim[]>(() => getClinicClaims(clinicId));
  const claimsSummary = useMemo(() => getClaimsSummary(clinicId), [claims]);

  const refreshContracts = () => setContracts(getClinicContracts(clinicId));
  const refreshClaims    = () => setClaims(getClinicClaims(clinicId));

  // ── Contract dialog ────────────────────────────────────────────────────────
  const [contractDialog, setContractDialog] = useState<{ open: boolean; editing?: InsuranceContract }>({ open: false });
  const [contractForm, setContractForm]     = useState({ ...emptyContract });

  const openAddContract = () => { setContractForm({ ...emptyContract }); setContractDialog({ open: true }); };
  const openEditContract = (c: InsuranceContract) => {
    setContractForm({ insuranceCompanyId: c.insuranceCompanyId, serviceName: c.serviceName, serviceNameAr: c.serviceNameAr, agreedPrice: c.agreedPrice, copayPct: c.copayPct, isActive: c.isActive, validFrom: c.validFrom ?? '', validUntil: c.validUntil ?? '' });
    setContractDialog({ open: true, editing: c });
  };
  const handleSaveContract = () => {
    if (!contractForm.insuranceCompanyId || !contractForm.serviceName.trim()) {
      toast.error(isRTL ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields'); return;
    }
    if (contractDialog.editing) {
      updateContract(contractDialog.editing.id, { ...contractForm });
      toast.success(isRTL ? 'تم تحديث العقد' : 'Contract updated');
    } else {
      addContract({ ...contractForm, clinicId });
      toast.success(isRTL ? 'تمت إضافة العقد' : 'Contract added');
    }
    refreshContracts(); setContractDialog({ open: false });
  };
  const handleDeleteContract = (id: string) => { deleteContract(id); refreshContracts(); };

  const handleClaimStatus = (id: string, status: ClaimStatus) => {
    updateClaimStatus(id, status); refreshClaims();
    toast.success(isRTL ? 'تم تحديث حالة المطالبة' : 'Claim status updated');
  };

  // ── Company dialog ─────────────────────────────────────────────────────────
  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; editing?: InsuranceCompany }>({ open: false });
  const [companyForm, setCompanyForm]     = useState({ ...emptyCompany });

  // ── Policy dialog ──────────────────────────────────────────────────────────
  const [policyDialog, setPolicyDialog] = useState<{ open: boolean; editing?: PatientInsurance }>({ open: false });
  const [policyForm, setPolicyForm]     = useState({ ...emptyPolicy });

  const refreshCompanies = () => setCompanies(getClinicInsuranceCompanies(clinicId));
  const refreshPolicies  = () => setPolicies(getAllClinicPatientInsurance(clinicId));

  // ── Company CRUD ───────────────────────────────────────────────────────────
  const openAddCompany = () => {
    setCompanyForm({ ...emptyCompany });
    setCompanyDialog({ open: true });
  };

  const openEditCompany = (c: InsuranceCompany) => {
    setCompanyForm({
      name: c.name, nameAr: c.nameAr, contactPhone: c.contactPhone,
      coveragePercent: c.coveragePercent, notes: c.notes, isActive: c.isActive,
    });
    setCompanyDialog({ open: true, editing: c });
  };

  const handleSaveCompany = () => {
    if (!companyForm.name.trim() || !companyForm.nameAr.trim()) {
      toast.error(isRTL ? 'الاسم مطلوب بالعربي والإنجليزي' : 'Name is required in both languages');
      return;
    }
    if (companyDialog.editing) {
      updateInsuranceCompany(companyDialog.editing.id, { ...companyForm });
      toast.success(isRTL ? 'تم تحديث شركة التأمين' : 'Insurance company updated');
    } else {
      addInsuranceCompany({ ...companyForm, clinicId });
      toast.success(isRTL ? 'تمت إضافة شركة التأمين' : 'Insurance company added');
    }
    refreshCompanies();
    setCompanyDialog({ open: false });
  };

  const handleDeleteCompany = (id: string) => {
    deleteInsuranceCompany(id);
    refreshCompanies();
    toast.success(isRTL ? 'تم حذف شركة التأمين' : 'Insurance company deleted');
  };

  // ── Policy CRUD ────────────────────────────────────────────────────────────
  const openAddPolicy = () => {
    setPolicyForm({ ...emptyPolicy });
    setPolicyDialog({ open: true });
  };

  const openEditPolicy = (p: PatientInsurance) => {
    setPolicyForm({
      patientId: p.patientId, insuranceCompanyId: p.insuranceCompanyId,
      policyNumber: p.policyNumber, coveragePercent: p.coveragePercent,
      expiryDate: p.expiryDate, isActive: p.isActive,
    });
    setPolicyDialog({ open: true, editing: p });
  };

  const handleSavePolicy = () => {
    if (!policyForm.patientId || !policyForm.insuranceCompanyId || !policyForm.policyNumber.trim()) {
      toast.error(isRTL ? 'يرجى تعبئة جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    if (policyDialog.editing) {
      updatePatientInsurance(policyDialog.editing.id, { ...policyForm });
      toast.success(isRTL ? 'تم تحديث وثيقة التأمين' : 'Insurance policy updated');
    } else {
      addPatientInsurance({ ...policyForm, clinicId });
      toast.success(isRTL ? 'تمت إضافة وثيقة التأمين' : 'Insurance policy added');
    }
    refreshPolicies();
    setPolicyDialog({ open: false });
  };

  const handleDeletePolicy = (id: string) => {
    deletePatientInsurance(id);
    refreshPolicies();
    toast.success(isRTL ? 'تم حذف وثيقة التأمين' : 'Insurance policy deleted');
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getPatientName = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    if (!p) return patientId;
    return language === 'ar' ? (p.nameAr || p.name) : p.name;
  };

  const getCompanyName = (companyId: string) => {
    const c = getInsuranceCompany(companyId);
    if (!c) return companyId;
    return language === 'ar' ? c.nameAr : c.name;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isRTL ? 'التأمين والتغطية الصحية' : 'Insurance Management'}
        </h1>
        <p className="text-muted-foreground">
          {isRTL ? 'إدارة شركات التأمين ووثائق المرضى' : 'Manage insurance companies and patient policies'}
        </p>
      </div>

      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {isRTL ? 'شركات التأمين' : 'Insurance Companies'}
          </TabsTrigger>
          <TabsTrigger value="policies" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {isRTL ? 'تأمين المرضى' : 'Patient Policies'}
          </TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            {isRTL ? 'العقود' : 'Contracts'}
          </TabsTrigger>
          <TabsTrigger value="claims" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {isRTL ? 'المطالبات' : 'Claims'}
            {claimsSummary.pending > 0 && (
              <span className="ml-1 bg-yellow-500 text-white text-xs rounded-full px-1.5">{claimsSummary.pending}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Insurance Companies ── */}
        <TabsContent value="companies" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {isRTL ? 'شركات التأمين' : 'Insurance Companies'}
              </CardTitle>
              <Button onClick={openAddCompany} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {isRTL ? 'إضافة شركة' : 'Add Company'}
              </Button>
            </CardHeader>
            <CardContent>
              {companies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Shield className="h-12 w-12 mb-3 opacity-30" />
                  <p>{isRTL ? 'لا توجد شركات تأمين بعد' : 'No insurance companies yet'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
                      <TableHead>{isRTL ? 'نسبة التغطية' : 'Coverage %'}</TableHead>
                      <TableHead>{isRTL ? 'الهاتف' : 'Phone'}</TableHead>
                      <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                      <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {language === 'ar' ? c.nameAr : c.name}
                        </TableCell>
                        <TableCell>{c.coveragePercent}%</TableCell>
                        <TableCell dir="ltr">{c.contactPhone}</TableCell>
                        <TableCell>
                          <Badge variant={c.isActive ? 'default' : 'outline'}>
                            {c.isActive
                              ? (isRTL ? 'نشط' : 'Active')
                              : (isRTL ? 'غير نشط' : 'Inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditCompany(c)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteCompany(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Patient Policies ── */}
        <TabsContent value="policies" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {isRTL ? 'وثائق تأمين المرضى' : 'Patient Insurance Policies'}
              </CardTitle>
              <Button onClick={openAddPolicy} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {isRTL ? 'إضافة وثيقة' : 'Add Policy'}
              </Button>
            </CardHeader>
            <CardContent>
              {policies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-3 opacity-30" />
                  <p>{isRTL ? 'لا توجد وثائق تأمين بعد' : 'No insurance policies yet'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'المريض' : 'Patient'}</TableHead>
                      <TableHead>{isRTL ? 'شركة التأمين' : 'Company'}</TableHead>
                      <TableHead>{isRTL ? 'رقم الوثيقة' : 'Policy No.'}</TableHead>
                      <TableHead>{isRTL ? 'التغطية' : 'Coverage %'}</TableHead>
                      <TableHead>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'}</TableHead>
                      <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                      <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{getPatientName(p.patientId)}</TableCell>
                        <TableCell>{getCompanyName(p.insuranceCompanyId)}</TableCell>
                        <TableCell dir="ltr">{p.policyNumber}</TableCell>
                        <TableCell>{p.coveragePercent}%</TableCell>
                        <TableCell dir="ltr">{p.expiryDate}</TableCell>
                        <TableCell>
                          <Badge variant={p.isActive ? 'default' : 'outline'}>
                            {p.isActive
                              ? (isRTL ? 'نشطة' : 'Active')
                              : (isRTL ? 'منتهية' : 'Inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditPolicy(p)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeletePolicy(p.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Contracts ── */}
        <TabsContent value="contracts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-primary" />
                {isRTL ? 'عقود التأمين' : 'Insurance Contracts'}
              </CardTitle>
              <Button onClick={openAddContract} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {isRTL ? 'إضافة عقد' : 'Add Contract'}
              </Button>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ScrollText className="h-12 w-12 mb-3 opacity-30" />
                  <p>{isRTL ? 'لا توجد عقود بعد' : 'No contracts yet'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'شركة التأمين' : 'Company'}</TableHead>
                      <TableHead>{isRTL ? 'الخدمة' : 'Service'}</TableHead>
                      <TableHead>{isRTL ? 'السعر المتفق' : 'Agreed Price'}</TableHead>
                      <TableHead>{isRTL ? 'نسبة المريض %' : 'Copay %'}</TableHead>
                      <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>{getCompanyName(c.insuranceCompanyId)}</TableCell>
                        <TableCell className="font-medium">
                          {language === 'ar' ? c.serviceNameAr : c.serviceName}
                        </TableCell>
                        <TableCell dir="ltr">{c.agreedPrice} ج.م</TableCell>
                        <TableCell>{c.copayPct}%</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEditContract(c)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteContract(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Claims ── */}
        <TabsContent value="claims" className="mt-4 space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: isRTL ? 'معلقة' : 'Pending',  value: claimsSummary.pending,  color: 'text-yellow-600' },
              { label: isRTL ? 'مُرسَلة' : 'Sent',   value: claimsSummary.sent,     color: 'text-blue-600' },
              { label: isRTL ? 'مدفوعة' : 'Paid',   value: claimsSummary.paid,     color: 'text-green-600' },
              { label: isRTL ? 'مرفوضة' : 'Rejected',value: claimsSummary.rejected, color: 'text-red-600' },
            ].map(k => (
              <Card key={k.label} className="p-4 text-center">
                <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">{isRTL ? 'إجمالي مستحق' : 'Total Outstanding'}</div>
              <div className="text-xl font-bold text-yellow-600">{claimsSummary.totalPending.toFixed(2)} ج.م</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">{isRTL ? 'إجمالي مُحصَّل' : 'Total Collected'}</div>
              <div className="text-xl font-bold text-green-600">{claimsSummary.totalPaid.toFixed(2)} ج.م</div>
            </Card>
          </div>

          {/* Claims table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                {isRTL ? 'قائمة المطالبات' : 'Claims List'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {claims.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
                  <p>{isRTL ? 'لا توجد مطالبات بعد' : 'No claims yet'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'شركة التأمين' : 'Company'}</TableHead>
                      <TableHead>{isRTL ? 'الخدمة' : 'Service'}</TableHead>
                      <TableHead>{isRTL ? 'إجمالي الفاتورة' : 'Total'}</TableHead>
                      <TableHead>{isRTL ? 'نصيب التأمين' : 'Insurer Owes'}</TableHead>
                      <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                      <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {claims.map(cl => (
                      <TableRow key={cl.id}>
                        <TableCell>{getCompanyName(cl.insuranceCompanyId)}</TableCell>
                        <TableCell>{cl.serviceName}</TableCell>
                        <TableCell dir="ltr">{cl.totalAmount.toFixed(2)} ج.م</TableCell>
                        <TableCell dir="ltr" className="font-medium">{cl.insuranceAmount.toFixed(2)} ج.م</TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${CLAIM_STATUS_COLORS[cl.status]}`}>
                            {cl.status === 'pending'  ? (isRTL ? 'معلقة'   : 'Pending')
                            : cl.status === 'sent'   ? (isRTL ? 'مُرسَلة' : 'Sent')
                            : cl.status === 'paid'   ? (isRTL ? 'مدفوعة'  : 'Paid')
                            :                          (isRTL ? 'مرفوضة'  : 'Rejected')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {cl.status === 'pending' && (
                              <Button variant="ghost" size="sm" className="text-blue-600 h-7 px-2 text-xs"
                                onClick={() => handleClaimStatus(cl.id, 'sent')}>
                                <Send className="h-3 w-3 mr-1" />{isRTL ? 'إرسال' : 'Send'}
                              </Button>
                            )}
                            {cl.status === 'sent' && (
                              <>
                                <Button variant="ghost" size="sm" className="text-green-600 h-7 px-2 text-xs"
                                  onClick={() => handleClaimStatus(cl.id, 'paid')}>
                                  <DollarSign className="h-3 w-3 mr-1" />{isRTL ? 'مدفوع' : 'Mark Paid'}
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-600 h-7 px-2 text-xs"
                                  onClick={() => handleClaimStatus(cl.id, 'rejected')}>
                                  <X className="h-3 w-3 mr-1" />{isRTL ? 'مرفوض' : 'Reject'}
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Company Dialog ── */}
      <Dialog open={companyDialog.open} onOpenChange={open => setCompanyDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {companyDialog.editing
                ? (isRTL ? 'تعديل شركة التأمين' : 'Edit Insurance Company')
                : (isRTL ? 'إضافة شركة تأمين' : 'Add Insurance Company')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input
                  value={companyForm.name}
                  onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Misr Insurance"
                />
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input
                  value={companyForm.nameAr}
                  onChange={e => setCompanyForm(f => ({ ...f, nameAr: e.target.value }))}
                  placeholder="التأمين المصري"
                  dir="rtl"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'رقم الهاتف' : 'Contact Phone'}</Label>
              <Input
                value={companyForm.contactPhone}
                onChange={e => setCompanyForm(f => ({ ...f, contactPhone: e.target.value }))}
                placeholder="19200"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'نسبة التغطية (%)' : 'Coverage Percent (%)'}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={companyForm.coveragePercent}
                onChange={e => setCompanyForm(f => ({ ...f, coveragePercent: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Input
                value={companyForm.notes}
                onChange={e => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={companyForm.isActive}
                onCheckedChange={val => setCompanyForm(f => ({ ...f, isActive: val }))}
              />
              <Label>{isRTL ? 'نشط' : 'Active'}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyDialog({ open: false })}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveCompany}>
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Policy Dialog ── */}
      <Dialog open={policyDialog.open} onOpenChange={open => setPolicyDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {policyDialog.editing
                ? (isRTL ? 'تعديل وثيقة التأمين' : 'Edit Insurance Policy')
                : (isRTL ? 'إضافة وثيقة تأمين' : 'Add Insurance Policy')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{isRTL ? 'المريض' : 'Patient'}</Label>
              <Select value={policyForm.patientId} onValueChange={val => setPolicyForm(f => ({ ...f, patientId: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر المريض' : 'Select patient'} />
                </SelectTrigger>
                <SelectContent>
                  {patients.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {language === 'ar' ? (p.nameAr || p.name) : p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'شركة التأمين' : 'Insurance Company'}</Label>
              <Select value={policyForm.insuranceCompanyId} onValueChange={val => setPolicyForm(f => ({ ...f, insuranceCompanyId: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر الشركة' : 'Select company'} />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {language === 'ar' ? c.nameAr : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'رقم الوثيقة' : 'Policy Number'}</Label>
              <Input
                value={policyForm.policyNumber}
                onChange={e => setPolicyForm(f => ({ ...f, policyNumber: e.target.value }))}
                dir="ltr"
                placeholder="POL-2024-001"
              />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'نسبة التغطية (%)' : 'Coverage Percent (%)'}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={policyForm.coveragePercent}
                onChange={e => setPolicyForm(f => ({ ...f, coveragePercent: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'}</Label>
              <Input
                type="date"
                value={policyForm.expiryDate}
                onChange={e => setPolicyForm(f => ({ ...f, expiryDate: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={policyForm.isActive}
                onCheckedChange={val => setPolicyForm(f => ({ ...f, isActive: val }))}
              />
              <Label>{isRTL ? 'نشطة' : 'Active'}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyDialog({ open: false })}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSavePolicy}>
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contract Dialog ── */}
      <Dialog open={contractDialog.open} onOpenChange={open => setContractDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {contractDialog.editing
                ? (isRTL ? 'تعديل العقد' : 'Edit Contract')
                : (isRTL ? 'إضافة عقد' : 'Add Contract')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{isRTL ? 'شركة التأمين' : 'Insurance Company'}</Label>
              <Select value={contractForm.insuranceCompanyId} onValueChange={val => setContractForm(f => ({ ...f, insuranceCompanyId: val }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الشركة' : 'Select company'} /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{language === 'ar' ? c.nameAr : c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isRTL ? 'اسم الخدمة (إنجليزي)' : 'Service (English)'}</Label>
                <Input value={contractForm.serviceName} onChange={e => setContractForm(f => ({ ...f, serviceName: e.target.value }))} placeholder="Consultation" />
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'اسم الخدمة (عربي)' : 'Service (Arabic)'}</Label>
                <Input value={contractForm.serviceNameAr} onChange={e => setContractForm(f => ({ ...f, serviceNameAr: e.target.value }))} placeholder="كشف" dir="rtl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isRTL ? 'السعر المتفق (ج.م)' : 'Agreed Price (EGP)'}</Label>
                <Input type="number" min={0} value={contractForm.agreedPrice} onChange={e => setContractForm(f => ({ ...f, agreedPrice: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'نسبة المريض % (كوباي)' : 'Patient Copay %'}</Label>
                <Input type="number" min={0} max={100} value={contractForm.copayPct} onChange={e => setContractForm(f => ({ ...f, copayPct: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isRTL ? 'صالح من' : 'Valid From'}</Label>
                <Input type="date" value={contractForm.validFrom} onChange={e => setContractForm(f => ({ ...f, validFrom: e.target.value }))} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'صالح حتى' : 'Valid Until'}</Label>
                <Input type="date" value={contractForm.validUntil} onChange={e => setContractForm(f => ({ ...f, validUntil: e.target.value }))} dir="ltr" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractDialog({ open: false })}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveContract}>
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Insurance;
