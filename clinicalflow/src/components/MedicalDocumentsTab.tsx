import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useDocuments } from '@/hooks/useDocuments';
import { useDocumentAudit } from '@/hooks/useDocumentAudit';
import { useSpecialties } from '@/hooks/useSpecialties';
import { useUsers } from '@/hooks/useUsers';
import { usePermissions } from '@/hooks/usePermissions';
import { MedicalDocument, DocumentType, DocumentVisibilityMode } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Upload, FileText, FlaskConical, ScanLine, ClipboardList,
  Eye, Download, Trash2, Shield, Settings2, Calendar,
  User, Stethoscope, FolderOpen, Lock, Search, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';

interface MedicalDocumentsTabProps {
  patientId: string;
}

const DOC_TYPE_CONFIG: Record<DocumentType, { icon: typeof FileText; label: string; labelAr: string; color: string }> = {
  prescription: { icon: FileText, label: 'Prescriptions', labelAr: 'الوصفات الطبية', color: 'text-blue-600' },
  lab_test: { icon: FlaskConical, label: 'Lab Tests', labelAr: 'التحاليل', color: 'text-green-600' },
  radiology: { icon: ScanLine, label: 'Radiology', labelAr: 'الأشعة', color: 'text-purple-600' },
  medical_report: { icon: ClipboardList, label: 'Medical Reports', labelAr: 'التقارير الطبية', color: 'text-orange-600' },
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const MedicalDocumentsTab: React.FC<MedicalDocumentsTabProps> = ({ patientId }) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { getPatientDocuments, addDocument, deleteDocument, getVisibility, updateVisibility } = useDocuments();
  const { logAccess } = useDocumentAudit();
  const { specialties } = useSpecialties();
  const { users } = useUsers();
  const permissions = usePermissions();
  const isAr = language === 'ar';

  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState<MedicalDocument | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadForm, setUploadForm] = useState({
    specialtyId: '',
    doctorId: '',
    documentType: '' as DocumentType | '',
    title: '',
    titleAr: '',
    notes: '',
    file: null as File | null,
  });

  const documents = useMemo(() => getPatientDocuments(patientId), [patientId, getPatientDocuments]);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.titleAr.includes(searchQuery) ||
      d.fileName.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  const groupedBySpecialty = useMemo(() => {
    const groups: Record<string, MedicalDocument[]> = {};
    for (const doc of filteredDocuments) {
      if (!groups[doc.specialtyId]) groups[doc.specialtyId] = [];
      groups[doc.specialtyId].push(doc);
    }
    return groups;
  }, [filteredDocuments]);

  const getSpecName = (id: string) => {
    const spec = specialties.find(s => s.id === id);
    return spec ? (isAr ? spec.nameAr : spec.name) : id;
  };

  const getUserName = (id: string) => {
    const u = users.find(usr => usr.id === id);
    return u ? (isAr ? u.nameAr : u.name) : id;
  };

  // True if the current user should see doctor identity on a given document
  const canSeeDoctorIdentityForDoc = (doc: MedicalDocument): boolean => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'reception' || user.role === 'super_admin') return true;
    if (user.role === 'doctor') return doc.doctorId === user.id || doc.uploadedBy === user.id;
    return false;
  };

  // For doctors viewing another doctor's document: show specialty team label instead of name
  const getDoctorDisplay = (doc: MedicalDocument): string => {
    if (canSeeDoctorIdentityForDoc(doc)) return getUserName(doc.doctorId);
    return isAr ? 'فريق التخصص' : 'Specialty Team';
  };

  const getUploaderDisplay = (doc: MedicalDocument): string => {
    if (canSeeDoctorIdentityForDoc(doc)) return getUserName(doc.uploadedBy);
    return isAr ? 'فريق التخصص' : 'Specialty Team';
  };

  const handleUpload = () => {
    if (!uploadForm.specialtyId || !uploadForm.documentType || !uploadForm.title.trim() || !uploadForm.file) {
      toast.error(isAr ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    const fileUrl = URL.createObjectURL(uploadForm.file);
    const newDoc = addDocument({
      patientId,
      specialtyId: uploadForm.specialtyId,
      doctorId: uploadForm.doctorId || user?.id || '',
      uploadedBy: user?.id || '',
      documentType: uploadForm.documentType as DocumentType,
      title: uploadForm.title,
      titleAr: uploadForm.titleAr || uploadForm.title,
      fileName: uploadForm.file.name,
      mimeType: uploadForm.file.type,
      fileUrl,
      fileSize: uploadForm.file.size,
      notes: uploadForm.notes,
      uploadDate: new Date().toISOString().split('T')[0],
    });

    logAccess({
      userId: user?.id || '',
      patientId,
      documentId: newDoc.id,
      action: 'upload',
    });

    toast.success(isAr ? 'تم رفع المستند بنجاح' : 'Document uploaded successfully');
    setUploadOpen(false);
    setUploadForm({ specialtyId: '', doctorId: '', documentType: '', title: '', titleAr: '', notes: '', file: null });
  };

  const handleView = (doc: MedicalDocument) => {
    setViewDoc(doc);
    logAccess({
      userId: user?.id || '',
      patientId,
      documentId: doc.id,
      action: 'view',
    });
  };

  const handleDownload = (doc: MedicalDocument) => {
    logAccess({
      userId: user?.id || '',
      patientId,
      documentId: doc.id,
      action: 'download',
    });
    if (doc.fileUrl) {
      const a = document.createElement('a');
      a.href = doc.fileUrl;
      a.download = doc.fileName;
      a.click();
    }
    toast.success(isAr ? 'جاري تحميل المستند' : 'Downloading document');
  };

  const handleDelete = (doc: MedicalDocument) => {
    deleteDocument(doc.id);
    toast.success(isAr ? 'تم حذف المستند' : 'Document deleted');
  };

  const activeSpecialties = specialties.filter(s => s.isActive);
  const doctorsForSpecialty = uploadForm.specialtyId
    ? users.filter(u => u.role === 'doctor' && u.specialtyId === uploadForm.specialtyId && u.isActive)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold" data-testid="text-documents-title">
            {isAr ? 'المستندات الطبية' : 'Medical Documents'}
          </h3>
          <Badge variant="secondary" data-testid="text-documents-count">{documents.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={isAr ? 'بحث في المستندات...' : 'Search documents...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 w-[200px]"
              data-testid="input-search-documents"
            />
          </div>
          {permissions.canManageDocumentPermissions && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} data-testid="button-document-settings">
              <Settings2 className="h-4 w-4 mr-1.5" />
              {isAr ? 'الإعدادات' : 'Settings'}
            </Button>
          )}
          {permissions.canUploadDocuments && (
            <Button size="sm" onClick={() => setUploadOpen(true)} data-testid="button-upload-document">
              <Upload className="h-4 w-4 mr-1.5" />
              {isAr ? 'رفع مستند' : 'Upload Document'}
            </Button>
          )}
        </div>
      </div>

      {user?.role === 'doctor' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
          {isAr
            ? 'وضع الخصوصية: هوية الأطباء الآخرين مخفية. يمكنك رؤية مستنداتك الخاصة بالكامل، أما مستندات زملائك فتظهر فقط بالتخصص ونوع الفحص.'
            : 'Privacy mode: Other doctors\' identities are hidden. You see your own documents in full; colleagues\' documents show specialty and type only.'}
        </div>
      )}

      {Object.keys(groupedBySpecialty).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">{isAr ? 'لا توجد مستندات طبية' : 'No medical documents'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedBySpecialty).map(([specId, docs]) => {
            const byType: Record<string, MedicalDocument[]> = {};
            for (const doc of docs) {
              if (!byType[doc.documentType]) byType[doc.documentType] = [];
              byType[doc.documentType].push(doc);
            }

            return (
              <Card key={specId} data-testid={`card-specialty-docs-${specId}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Stethoscope className="h-4 w-4 text-primary" />
                    {getSpecName(specId)}
                    <Badge variant="outline" className="ml-auto">{docs.length}</Badge>
                    {user?.role === 'doctor' && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        {isAr ? 'تخصصك' : 'Your Specialty'}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue={Object.keys(byType)[0]} className="w-full">
                    <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0 mb-3">
                      {(Object.keys(DOC_TYPE_CONFIG) as DocumentType[]).map(type => {
                        const typeDocs = byType[type];
                        if (!typeDocs || typeDocs.length === 0) return null;
                        const cfg = DOC_TYPE_CONFIG[type];
                        const Icon = cfg.icon;
                        return (
                          <TabsTrigger
                            key={type}
                            value={type}
                            className="gap-1.5 data-[state=active]:bg-primary/10"
                            data-testid={`tab-doctype-${type}`}
                          >
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                            {isAr ? cfg.labelAr : cfg.label}
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{typeDocs.length}</Badge>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>

                    {(Object.keys(DOC_TYPE_CONFIG) as DocumentType[]).map(type => {
                      const typeDocs = byType[type];
                      if (!typeDocs || typeDocs.length === 0) return null;
                      return (
                        <TabsContent key={type} value={type} className="mt-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{isAr ? 'العنوان' : 'Title'}</TableHead>
                                <TableHead>{isAr ? 'الملف' : 'File'}</TableHead>
                                <TableHead>{isAr ? 'الحجم' : 'Size'}</TableHead>
                                <TableHead>{isAr ? 'رفع بواسطة' : 'Uploaded By'}</TableHead>
                                <TableHead>{isAr ? 'التاريخ' : 'Date'}</TableHead>
                                <TableHead className="text-right">{isAr ? 'إجراءات' : 'Actions'}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {typeDocs.sort((a, b) => b.uploadDate.localeCompare(a.uploadDate)).map(doc => (
                                <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                                  <TableCell className="font-medium">
                                    {isAr ? doc.titleAr : doc.title}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                                    {doc.fileName}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {formatFileSize(doc.fileSize)}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    <span className={!canSeeDoctorIdentityForDoc(doc) ? 'text-muted-foreground italic' : ''}>
                                      {getUploaderDisplay(doc)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-sm">{doc.uploadDate}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleView(doc)}
                                        data-testid={`button-view-doc-${doc.id}`}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleDownload(doc)}
                                        data-testid={`button-download-doc-${doc.id}`}
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                      {(user?.role === 'admin' || doc.uploadedBy === user?.id) && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive hover:text-destructive"
                                          onClick={() => handleDelete(doc)}
                                          data-testid={`button-delete-doc-${doc.id}`}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {isAr ? 'رفع مستند طبي' : 'Upload Medical Document'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{isAr ? 'التخصص' : 'Specialty'} *</Label>
              <Select
                value={uploadForm.specialtyId}
                onValueChange={v => setUploadForm(f => ({ ...f, specialtyId: v, doctorId: '' }))}
              >
                <SelectTrigger data-testid="select-upload-specialty">
                  <SelectValue placeholder={isAr ? 'اختر التخصص' : 'Select specialty'} />
                </SelectTrigger>
                <SelectContent>
                  {(user?.role === 'doctor' && user.specialtyId
                    ? activeSpecialties.filter(s => s.id === user.specialtyId)
                    : activeSpecialties
                  ).map(s => (
                    <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr : s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(user?.role === 'admin' || user?.role === 'reception') && uploadForm.specialtyId && (
              <div>
                <Label>{isAr ? 'الطبيب' : 'Doctor'}</Label>
                <Select
                  value={uploadForm.doctorId}
                  onValueChange={v => setUploadForm(f => ({ ...f, doctorId: v }))}
                >
                  <SelectTrigger data-testid="select-upload-doctor">
                    <SelectValue placeholder={isAr ? 'اختر الطبيب' : 'Select doctor'} />
                  </SelectTrigger>
                  <SelectContent>
                    {doctorsForSpecialty.map(d => (
                      <SelectItem key={d.id} value={d.id}>{isAr ? d.nameAr : d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>{isAr ? 'نوع المستند' : 'Document Type'} *</Label>
              <Select
                value={uploadForm.documentType}
                onValueChange={v => setUploadForm(f => ({ ...f, documentType: v as DocumentType }))}
              >
                <SelectTrigger data-testid="select-upload-type">
                  <SelectValue placeholder={isAr ? 'اختر النوع' : 'Select type'} />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOC_TYPE_CONFIG) as DocumentType[]).map(type => (
                    <SelectItem key={type} value={type}>
                      {isAr ? DOC_TYPE_CONFIG[type].labelAr : DOC_TYPE_CONFIG[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{isAr ? 'العنوان (EN)' : 'Title (EN)'} *</Label>
              <Input
                value={uploadForm.title}
                onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                placeholder={isAr ? 'عنوان المستند بالإنجليزية' : 'Document title in English'}
                data-testid="input-upload-title"
              />
            </div>

            <div>
              <Label>{isAr ? 'العنوان (AR)' : 'Title (AR)'}</Label>
              <Input
                value={uploadForm.titleAr}
                onChange={e => setUploadForm(f => ({ ...f, titleAr: e.target.value }))}
                placeholder={isAr ? 'عنوان المستند بالعربية' : 'Document title in Arabic'}
                data-testid="input-upload-title-ar"
              />
            </div>

            <div>
              <Label>{isAr ? 'الملف' : 'File'} *</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => setUploadForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
                data-testid="input-upload-file"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isAr ? 'PDF, صور, مستندات Word' : 'PDF, Images, Word documents'}
              </p>
            </div>

            <div>
              <Label>{isAr ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea
                value={uploadForm.notes}
                onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={isAr ? 'ملاحظات إضافية...' : 'Additional notes...'}
                rows={2}
                data-testid="input-upload-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleUpload} data-testid="button-confirm-upload">
              <Upload className="h-4 w-4 mr-1.5" />
              {isAr ? 'رفع' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {viewDoc && (isAr ? viewDoc.titleAr : viewDoc.title)}
            </DialogTitle>
          </DialogHeader>
          {viewDoc && (
            <div className="space-y-3">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isAr ? 'النوع' : 'Type'}</span>
                  <Badge variant="outline">
                    {isAr ? DOC_TYPE_CONFIG[viewDoc.documentType].labelAr : DOC_TYPE_CONFIG[viewDoc.documentType].label}
                  </Badge>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isAr ? 'التخصص' : 'Specialty'}</span>
                  <span>{getSpecName(viewDoc.specialtyId)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isAr ? 'الطبيب' : 'Doctor'}</span>
                  {canSeeDoctorIdentityForDoc(viewDoc) ? (
                    <span>{getUserName(viewDoc.doctorId)}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground italic text-xs">
                      <EyeOff className="h-3 w-3" />
                      {isAr ? 'محمي' : 'Private'}
                    </span>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isAr ? 'رفع بواسطة' : 'Uploaded By'}</span>
                  {canSeeDoctorIdentityForDoc(viewDoc) ? (
                    <span>{getUserName(viewDoc.uploadedBy)}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground italic text-xs">
                      <EyeOff className="h-3 w-3" />
                      {isAr ? 'محمي' : 'Private'}
                    </span>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isAr ? 'الملف' : 'File'}</span>
                  <span className="text-xs">{viewDoc.fileName} ({formatFileSize(viewDoc.fileSize)})</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isAr ? 'التاريخ' : 'Date'}</span>
                  <span>{viewDoc.uploadDate}</span>
                </div>
                {viewDoc.notes && (
                  <>
                    <Separator />
                    <div className="text-sm">
                      <span className="text-muted-foreground">{isAr ? 'ملاحظات' : 'Notes'}</span>
                      <p className="mt-1">{viewDoc.notes}</p>
                    </div>
                  </>
                )}
              </div>

              {viewDoc.fileUrl && viewDoc.mimeType.startsWith('image/') && (
                <div className="rounded-lg border overflow-hidden">
                  <img src={viewDoc.fileUrl} alt={viewDoc.title} className="w-full max-h-[400px] object-contain" />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                {isAr ? 'تم تسجيل هذا الوصول في سجل المراجعة' : 'This access has been recorded in the audit log'}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDoc(null)}>
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
            {viewDoc && (
              <Button onClick={() => handleDownload(viewDoc)} data-testid="button-download-from-view">
                <Download className="h-4 w-4 mr-1.5" />
                {isAr ? 'تحميل' : 'Download'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {isAr ? 'إعدادات خصوصية المستندات' : 'Document Privacy Settings'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'تحكم في ما يمكن للأطباء رؤيته من مستندات في تخصصهم'
                : 'Control what documents doctors can see within their specialty'}
            </p>
            {activeSpecialties.map(spec => {
              const currentMode = getVisibility(spec.id);
              return (
                <div key={spec.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{isAr ? spec.nameAr : spec.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentMode === 'own_only'
                        ? (isAr ? 'يرى مستنداته فقط' : 'Own documents only')
                        : (isAr ? 'يرى كل مستندات التخصص' : 'All specialty documents')
                      }
                    </p>
                  </div>
                  <Select
                    value={currentMode}
                    onValueChange={(v: DocumentVisibilityMode) => {
                      updateVisibility(spec.id, v);
                      toast.success(isAr ? 'تم تحديث الإعدادات' : 'Settings updated');
                    }}
                  >
                    <SelectTrigger className="w-[160px]" data-testid={`select-visibility-${spec.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="specialty_all">{isAr ? 'كل التخصص' : 'All Specialty'}</SelectItem>
                      <SelectItem value="own_only">{isAr ? 'المستندات الخاصة فقط' : 'Own Only'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalDocumentsTab;
