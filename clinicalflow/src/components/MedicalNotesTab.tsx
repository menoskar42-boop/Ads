import React, { useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMedicalNotes } from '@/hooks/useMedicalNotes';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/hooks/useAuth';
import { MedicalNoteCategory, NoteAttachment } from '@/types';
import { formatDate } from '@/lib/dateFormat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, AlertTriangle, Pill, Stethoscope, Heart, Scissors, CalendarCheck, FileText, Paperclip, X, Download, Image, File } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES: { value: MedicalNoteCategory; label: string; labelAr: string; icon: React.ElementType; color: string }[] = [
  { value: 'general', label: 'General', labelAr: 'عام', icon: FileText, color: 'bg-primary/10 text-primary' },
  { value: 'diagnosis', label: 'Diagnosis', labelAr: 'تشخيص', icon: Stethoscope, color: 'bg-chart-1/10 text-chart-1' },
  { value: 'prescription', label: 'Prescription', labelAr: 'وصفة طبية', icon: Pill, color: 'bg-chart-2/10 text-chart-2' },
  { value: 'allergy', label: 'Allergy', labelAr: 'حساسية', icon: AlertTriangle, color: 'bg-destructive/10 text-destructive' },
  { value: 'chronic_condition', label: 'Chronic Condition', labelAr: 'حالة مزمنة', icon: Heart, color: 'bg-chart-4/10 text-chart-4' },
  { value: 'surgical_history', label: 'Surgical History', labelAr: 'تاريخ جراحي', icon: Scissors, color: 'bg-chart-3/10 text-chart-3' },
  { value: 'follow_up', label: 'Follow-up', labelAr: 'متابعة', icon: CalendarCheck, color: 'bg-chart-5/10 text-chart-5' },
];

const getCategoryInfo = (cat: MedicalNoteCategory) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageMime = (mime: string) => mime.startsWith('image/');

interface MedicalNotesTabProps {
  patientId: string;
}

const MedicalNotesTab: React.FC<MedicalNotesTabProps> = ({ patientId }) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { notes, addNote, updateNote, deleteNote } = useMedicalNotes({ patientId });
  const { users } = useUsers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [form, setForm] = useState({ title: '', content: '', category: 'general' as MedicalNoteCategory });
  const [pendingAttachments, setPendingAttachments] = useState<NoteAttachment[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<NoteAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<NoteAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patientNotes = notes
    .filter(n => n.patientId === patientId)
    .filter(n => filterCategory === 'all' || n.category === filterCategory)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const getDoctorName = (doctorId: string) => {
    const u = users.find(x => x.id === doctorId);
    return language === 'ar' ? u?.nameAr : u?.name;
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ title: '', content: '', category: 'general' });
    setPendingAttachments([]);
    setExistingAttachments([]);
    setDialogOpen(true);
  };

  const openEdit = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    setEditingId(noteId);
    setForm({ title: note.title, content: note.content, category: note.category });
    setPendingAttachments([]);
    setExistingAttachments([...note.attachments]);
    setDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const maxSize = 10 * 1024 * 1024; // 10MB
    const newAttachments: NoteAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        toast.error(language === 'ar' ? `الملف ${file.name} كبير جداً (الحد 10MB)` : `File ${file.name} is too large (max 10MB)`);
        continue;
      }
      newAttachments.push({
        id: `att-${Date.now()}-${i}`,
        fileName: file.name,
        mimeType: file.type,
        fileUrl: URL.createObjectURL(file),
        size: file.size,
      });
    }
    setPendingAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string, fromExisting: boolean) => {
    if (fromExisting) {
      setExistingAttachments(prev => prev.filter(a => a.id !== id));
    } else {
      setPendingAttachments(prev => prev.filter(a => a.id !== id));
    }
  };

  const saveNote = () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }
    const allAttachments = [...existingAttachments, ...pendingAttachments];
    if (editingId) {
      updateNote(editingId, { title: form.title.trim(), content: form.content.trim(), category: form.category, attachments: allAttachments });
      toast.success(language === 'ar' ? 'تم تحديث الملاحظة' : 'Note updated');
    } else {
      addNote({
        patientId,
        doctorId: user?.id || 'doc-1',
        category: form.category,
        title: form.title.trim(),
        content: form.content.trim(),
        attachments: allAttachments,
      });
      toast.success(language === 'ar' ? 'تمت إضافة الملاحظة' : 'Note added');
    }
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteNote(deleteId);
      toast.success(language === 'ar' ? 'تم حذف الملاحظة' : 'Note deleted');
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={language === 'ar' ? 'كل الفئات' : 'All categories'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === 'ar' ? 'كل الفئات' : 'All Categories'}</SelectItem>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>
                {language === 'ar' ? cat.labelAr : cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {language === 'ar' ? 'إضافة ملاحظة' : 'Add Note'}
        </Button>
      </div>

      {/* Notes List */}
      {patientNotes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {language === 'ar' ? 'لا توجد ملاحظات طبية' : 'No medical notes'}
          </CardContent>
        </Card>
      ) : (
        patientNotes.map(note => {
          const catInfo = getCategoryInfo(note.category);
          const Icon = catInfo.icon;
          return (
            <Card key={note.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${catInfo.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold truncate">{note.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={catInfo.color} variant="secondary">
                          {language === 'ar' ? catInfo.labelAr : catInfo.label}
                        </Badge>
                        {note.attachments.length > 0 && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Paperclip className="h-3 w-3" />
                            {note.attachments.length}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(note.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(note.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>

                {/* Attachments display */}
                {note.attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {language === 'ar' ? 'المرفقات' : 'Attachments'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {note.attachments.map(att => (
                        <button
                          key={att.id}
                          onClick={() => setPreviewAttachment(att)}
                          className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs hover:bg-muted transition-colors cursor-pointer"
                        >
                          {isImageMime(att.mimeType) ? <Image className="h-3.5 w-3.5 text-chart-1" /> : <File className="h-3.5 w-3.5 text-chart-2" />}
                          <span className="max-w-[120px] truncate">{att.fileName}</span>
                          <span className="text-muted-foreground">{formatFileSize(att.size)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Separator className="my-3" />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{language === 'ar' ? 'الطبيب' : 'Doctor'}: {getDoctorName(note.doctorId) || '—'}</span>
                  <span>{language === 'ar' ? 'التاريخ' : 'Date'}: {formatDate(note.createdAt.split('T')[0], language)}</span>
                  {note.updatedAt !== note.createdAt && (
                    <span className="italic">
                      {language === 'ar' ? 'تم التعديل' : 'Edited'}: {formatDate(note.updatedAt.split('T')[0], language)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? (language === 'ar' ? 'تعديل الملاحظة' : 'Edit Note')
                : (language === 'ar' ? 'إضافة ملاحظة طبية' : 'Add Medical Note')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{language === 'ar' ? 'الفئة' : 'Category'}</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as MedicalNoteCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {language === 'ar' ? cat.labelAr : cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{language === 'ar' ? 'العنوان' : 'Title'} *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={language === 'ar' ? 'مثال: ارتفاع ضغط الدم' : 'e.g. Hypertension diagnosis'} />
            </div>
            <div className="grid gap-2">
              <Label>{language === 'ar' ? 'المحتوى' : 'Content'} *</Label>
              <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={4} placeholder={language === 'ar' ? 'تفاصيل الملاحظة الطبية...' : 'Medical note details...'} />
            </div>

            {/* Attachments section */}
            <div className="grid gap-2">
              <Label>{language === 'ar' ? 'المرفقات' : 'Attachments'}</Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5 w-fit" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
                {language === 'ar' ? 'إرفاق ملفات' : 'Attach Files'}
              </Button>
              <p className="text-xs text-muted-foreground">
                {language === 'ar' ? 'الحد الأقصى 10MB لكل ملف. يدعم الصور، PDF، Word، Excel' : 'Max 10MB per file. Supports images, PDF, Word, Excel'}
              </p>

              {/* Existing attachments */}
              {existingAttachments.length > 0 && (
                <div className="space-y-1">
                  {existingAttachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs">
                      {isImageMime(att.mimeType) ? <Image className="h-3.5 w-3.5 text-chart-1 shrink-0" /> : <File className="h-3.5 w-3.5 text-chart-2 shrink-0" />}
                      <span className="truncate flex-1">{att.fileName}</span>
                      <span className="text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeAttachment(att.id, true)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending attachments */}
              {pendingAttachments.length > 0 && (
                <div className="space-y-1">
                  {pendingAttachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                      {isImageMime(att.mimeType) ? <Image className="h-3.5 w-3.5 text-chart-1 shrink-0" /> : <File className="h-3.5 w-3.5 text-chart-2 shrink-0" />}
                      <span className="truncate flex-1">{att.fileName}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{language === 'ar' ? 'جديد' : 'New'}</Badge>
                      <span className="text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeAttachment(att.id, false)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{language === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveNote}>{language === 'ar' ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={open => !open && setPreviewAttachment(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              {previewAttachment?.fileName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[200px]">
            {previewAttachment && isImageMime(previewAttachment.mimeType) ? (
              <img
                src={previewAttachment.fileUrl}
                alt={previewAttachment.fileName}
                className="max-h-[60vh] max-w-full rounded-md object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <File className="h-16 w-16" />
                <p className="text-sm">{previewAttachment?.fileName}</p>
                <p className="text-xs">{previewAttachment && formatFileSize(previewAttachment.size)}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            {previewAttachment && (
              <Button variant="outline" className="gap-1.5" asChild>
                <a href={previewAttachment.fileUrl} download={previewAttachment.fileName}>
                  <Download className="h-4 w-4" />
                  {language === 'ar' ? 'تحميل' : 'Download'}
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'ar' ? 'حذف الملاحظة' : 'Delete Note'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ar' ? 'هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure? This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'ar' ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {language === 'ar' ? 'حذف' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MedicalNotesTab;
