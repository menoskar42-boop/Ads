import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { documentUploadStore, UploadedDocument } from '@/stores/documentUploadStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Upload, X, FileText, Image, Eye, Trash2, Download,
  FolderOpen, Filter, Plus,
} from 'lucide-react';

interface EnhancedDocumentsTabProps {
  patientId: string;
  visitId?: string;
}

type DocType = UploadedDocument['type'];

const DOC_TYPE_LABELS: Record<DocType, { en: string; ar: string; color: string }> = {
  xray:            { en: 'X-Ray',          ar: 'أشعة سينية',    color: 'bg-primary/10 text-primary' },
  lab:             { en: 'Lab Result',     ar: 'نتيجة مختبر',   color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  external_report: { en: 'External Report',ar: 'تقرير خارجي',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  prescription:    { en: 'Prescription',  ar: 'روشتة',          color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  other:           { en: 'Other',         ar: 'أخرى',           color: 'bg-muted text-muted-foreground' },
};

const EnhancedDocumentsTab: React.FC<EnhancedDocumentsTabProps> = ({ patientId, visitId }) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const [docs, setDocs] = useState<UploadedDocument[]>(() =>
    documentUploadStore.filter(d => d.patientId === patientId)
  );
  const [typeFilter, setTypeFilter] = useState<DocType | 'all'>('all');
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadForm, setUploadForm] = useState({ type: 'other' as DocType, description: '', tags: '' });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return documentUploadStore.subscribe(() =>
      setDocs(documentUploadStore.filter(d => d.patientId === patientId))
    );
  }, [patientId]);

  const filtered = typeFilter === 'all' ? docs : docs.filter(d => d.type === typeFilter);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter(f => f.size <= 5 * 1024 * 1024); // 5MB limit
    if (arr.length < files.length) {
      toast.warning(isAr ? 'تم تجاهل الملفات أكبر من 5MB' : 'Files larger than 5MB were skipped');
    }
    setPendingFiles(arr);
    setUploadOpen(true);
  };

  const processUpload = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    let saved = 0;

    for (const file of pendingFiles) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        documentUploadStore.add({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          patientId,
          visitId,
          uploadedBy: user?.id || '',
          type: uploadForm.type,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileData: base64,
          description: uploadForm.description,
          tags: uploadForm.tags.split(',').map(t => t.trim()).filter(Boolean),
          createdAt: new Date().toISOString(),
        });
        saved++;
      } catch {
        toast.error(`${isAr ? 'فشل رفع' : 'Failed to upload'}: ${file.name}`);
      }
    }

    if (saved > 0) {
      toast.success(isAr ? `تم رفع ${saved} ملف` : `${saved} file(s) uploaded`);
    }
    setPendingFiles([]);
    setUploadForm({ type: 'other', description: '', tags: '' });
    setUploadOpen(false);
    setUploading(false);
  };

  const deleteDoc = (id: string) => {
    documentUploadStore.remove(d => d.id === id);
    toast.success(isAr ? 'تم الحذف' : 'Deleted');
    if (previewDoc?.id === id) setPreviewDoc(null);
  };

  const downloadDoc = (doc: UploadedDocument) => {
    const link = document.createElement('a');
    link.href = doc.fileData;
    link.download = doc.fileName;
    link.click();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const isImage = (doc: UploadedDocument) => doc.fileType.startsWith('image/');
  const isPDF = (doc: UploadedDocument) => doc.fileType === 'application/pdf';

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', ...Object.keys(DOC_TYPE_LABELS)] as (DocType | 'all')[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {t === 'all' ? (isAr ? 'الكل' : 'All') : (isAr ? DOC_TYPE_LABELS[t as DocType].ar : DOC_TYPE_LABELS[t as DocType].en)}
              {t === 'all' ? ` (${docs.length})` : ` (${docs.filter(d => d.type === t).length})`}
            </button>
          ))}
        </div>
        <Button
          onClick={() => fileInputRef.current?.click()}
          className="gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          {isAr ? 'رفع ملف' : 'Upload File'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          {isAr ? 'اسحب الملفات هنا أو انقر للاختيار' : 'Drag & drop files or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">{isAr ? 'صور، PDF — حد 5MB لكل ملف' : 'Images, PDFs — max 5MB each'}</p>
      </div>

      {/* Gallery */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{isAr ? 'لا توجد ملفات' : 'No documents'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(doc => (
            <div
              key={doc.id}
              className="border rounded-xl overflow-hidden bg-card hover:shadow-md transition-shadow group"
            >
              {/* Thumbnail */}
              <div
                className="h-28 bg-muted/50 flex items-center justify-center cursor-pointer relative"
                onClick={() => setPreviewDoc(doc)}
              >
                {isImage(doc) ? (
                  <img
                    src={doc.fileData}
                    alt={doc.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : isPDF(doc) ? (
                  <div className="flex flex-col items-center text-red-400">
                    <FileText className="h-10 w-10" />
                    <span className="text-xs mt-1">PDF</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <FileText className="h-10 w-10" />
                    <span className="text-xs mt-1">{doc.fileName.split('.').pop()?.toUpperCase()}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                  <button className="bg-card rounded-full p-1.5 shadow" onClick={e => { e.stopPropagation(); setPreviewDoc(doc); }}>
                    <Eye className="h-3.5 w-3.5 text-foreground/70" />
                  </button>
                  <button className="bg-card rounded-full p-1.5 shadow" onClick={e => { e.stopPropagation(); downloadDoc(doc); }}>
                    <Download className="h-3.5 w-3.5 text-foreground/70" />
                  </button>
                  <button className="bg-card rounded-full p-1.5 shadow" onClick={e => { e.stopPropagation(); deleteDoc(doc.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              {/* Info */}
              <div className="p-2">
                <p className="text-xs font-medium truncate">{doc.fileName}</p>
                <div className="flex items-center justify-between mt-1">
                  <Badge className={`text-[10px] px-1.5 py-0 ${DOC_TYPE_LABELS[doc.type].color}`}>
                    {isAr ? DOC_TYPE_LABELS[doc.type].ar : DOC_TYPE_LABELS[doc.type].en}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{formatSize(doc.fileSize)}</span>
                </div>
                {doc.description && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{doc.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>{isAr ? `رفع ${pendingFiles.length} ملف` : `Upload ${pendingFiles.length} file(s)`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground mb-2">{isAr ? 'الملفات المختارة:' : 'Selected files:'}</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground text-xs ml-2 flex-shrink-0">{formatSize(f.size)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>{isAr ? 'نوع الملف' : 'Document Type'}</Label>
              <Select value={uploadForm.type} onValueChange={v => setUploadForm(f => ({ ...f, type: v as DocType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{isAr ? v.ar : v.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? 'وصف (اختياري)' : 'Description (optional)'}</Label>
              <Input
                value={uploadForm.description}
                onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                placeholder={isAr ? 'مثال: نتيجة مختبر 5 أبريل' : 'e.g. Lab result April 5'}
              />
            </div>
            <div>
              <Label>{isAr ? 'وسوم (مفصولة بفاصلة)' : 'Tags (comma-separated)'}</Label>
              <Input
                value={uploadForm.tags}
                onChange={e => setUploadForm(f => ({ ...f, tags: e.target.value }))}
                placeholder={isAr ? 'مثال: سكر, كلى' : 'e.g. diabetes, kidney'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); setPendingFiles([]); }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={processUpload} disabled={uploading}>
              {uploading ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'رفع' : 'Upload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl" dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {previewDoc?.fileName}
            </DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div>
              {isImage(previewDoc) ? (
                <img src={previewDoc.fileData} alt={previewDoc.fileName} className="w-full max-h-[60vh] object-contain rounded" />
              ) : isPDF(previewDoc) ? (
                <iframe src={previewDoc.fileData} className="w-full h-[60vh] rounded border" title={previewDoc.fileName} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2" />
                  <p>{isAr ? 'لا يمكن معاينة هذا النوع' : 'Preview not available for this file type'}</p>
                </div>
              )}
              <div className="flex justify-between items-center mt-3 text-sm text-muted-foreground">
                <span>{formatSize(previewDoc.fileSize)} • {previewDoc.createdAt.slice(0, 10)}</span>
                <Button size="sm" variant="outline" onClick={() => downloadDoc(previewDoc)} className="gap-1">
                  <Download className="h-3.5 w-3.5" />
                  {isAr ? 'تحميل' : 'Download'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnhancedDocumentsTab;
