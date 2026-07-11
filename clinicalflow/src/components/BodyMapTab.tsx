import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { bodyAnnotationStore, BodyAnnotation } from '@/stores/bodyAnnotationStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, RotateCcw } from 'lucide-react';

interface BodyMapTabProps {
  patientId: string;
  visitId?: string;
}

type BodyView = 'front' | 'back' | 'face';

interface Zone {
  id: string;
  label: string;
  labelAr: string;
  cx: number;
  cy: number;
  r: number;
  view: BodyView;
}

const BODY_ZONES: Zone[] = [
  // Front
  { id: 'head', label: 'Head', labelAr: 'الرأس', cx: 100, cy: 40, r: 28, view: 'front' },
  { id: 'neck', label: 'Neck', labelAr: 'الرقبة', cx: 100, cy: 80, r: 14, view: 'front' },
  { id: 'chest_l', label: 'Left Chest', labelAr: 'صدر أيسر', cx: 75, cy: 120, r: 20, view: 'front' },
  { id: 'chest_r', label: 'Right Chest', labelAr: 'صدر أيمن', cx: 125, cy: 120, r: 20, view: 'front' },
  { id: 'abdomen', label: 'Abdomen', labelAr: 'البطن', cx: 100, cy: 170, r: 25, view: 'front' },
  { id: 'pelvis', label: 'Pelvis', labelAr: 'الحوض', cx: 100, cy: 215, r: 20, view: 'front' },
  { id: 'l_arm', label: 'Left Arm', labelAr: 'الذراع الأيسر', cx: 55, cy: 140, r: 14, view: 'front' },
  { id: 'r_arm', label: 'Right Arm', labelAr: 'الذراع الأيمن', cx: 145, cy: 140, r: 14, view: 'front' },
  { id: 'l_thigh', label: 'Left Thigh', labelAr: 'الفخذ الأيسر', cx: 80, cy: 260, r: 18, view: 'front' },
  { id: 'r_thigh', label: 'Right Thigh', labelAr: 'الفخذ الأيمن', cx: 120, cy: 260, r: 18, view: 'front' },
  { id: 'l_knee', label: 'Left Knee', labelAr: 'الركبة اليسرى', cx: 80, cy: 305, r: 14, view: 'front' },
  { id: 'r_knee', label: 'Right Knee', labelAr: 'الركبة اليمنى', cx: 120, cy: 305, r: 14, view: 'front' },
  { id: 'l_foot', label: 'Left Foot', labelAr: 'القدم اليسرى', cx: 80, cy: 360, r: 12, view: 'front' },
  { id: 'r_foot', label: 'Right Foot', labelAr: 'القدم اليمنى', cx: 120, cy: 360, r: 12, view: 'front' },
  // Back
  { id: 'back_head', label: 'Back of Head', labelAr: 'مؤخرة الرأس', cx: 100, cy: 40, r: 28, view: 'back' },
  { id: 'upper_back', label: 'Upper Back', labelAr: 'أعلى الظهر', cx: 100, cy: 110, r: 28, view: 'back' },
  { id: 'lower_back', label: 'Lower Back', labelAr: 'أسفل الظهر', cx: 100, cy: 175, r: 25, view: 'back' },
  { id: 'l_shoulder', label: 'Left Shoulder', labelAr: 'الكتف الأيسر', cx: 65, cy: 95, r: 16, view: 'back' },
  { id: 'r_shoulder', label: 'Right Shoulder', labelAr: 'الكتف الأيمن', cx: 135, cy: 95, r: 16, view: 'back' },
  { id: 'buttocks', label: 'Buttocks', labelAr: 'الأرداف', cx: 100, cy: 220, r: 22, view: 'back' },
  { id: 'l_calf', label: 'Left Calf', labelAr: 'ساق أيسر', cx: 80, cy: 310, r: 16, view: 'back' },
  { id: 'r_calf', label: 'Right Calf', labelAr: 'ساق أيمن', cx: 120, cy: 310, r: 16, view: 'back' },
  // Face
  { id: 'forehead', label: 'Forehead', labelAr: 'الجبهة', cx: 100, cy: 50, r: 20, view: 'face' },
  { id: 'l_eye', label: 'Left Eye', labelAr: 'العين اليسرى', cx: 75, cy: 90, r: 14, view: 'face' },
  { id: 'r_eye', label: 'Right Eye', labelAr: 'العين اليمنى', cx: 125, cy: 90, r: 14, view: 'face' },
  { id: 'nose', label: 'Nose', labelAr: 'الأنف', cx: 100, cy: 120, r: 12, view: 'face' },
  { id: 'l_ear', label: 'Left Ear', labelAr: 'الأذن اليسرى', cx: 55, cy: 105, r: 12, view: 'face' },
  { id: 'r_ear', label: 'Right Ear', labelAr: 'الأذن اليمنى', cx: 145, cy: 105, r: 12, view: 'face' },
  { id: 'mouth', label: 'Mouth', labelAr: 'الفم', cx: 100, cy: 150, r: 12, view: 'face' },
  { id: 'chin', label: 'Chin', labelAr: 'الذقن', cx: 100, cy: 175, r: 10, view: 'face' },
  { id: 'l_cheek', label: 'Left Cheek', labelAr: 'الخد الأيسر', cx: 70, cy: 135, r: 14, view: 'face' },
  { id: 'r_cheek', label: 'Right Cheek', labelAr: 'الخد الأيمن', cx: 130, cy: 135, r: 14, view: 'face' },
];

const BodyMapTab: React.FC<BodyMapTabProps> = ({ patientId, visitId }) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const [view, setView] = useState<BodyView>('front');
  const [annotations, setAnnotations] = useState<BodyAnnotation[]>(() =>
    bodyAnnotationStore.filter(a => a.patientId === patientId)
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [form, setForm] = useState({ procedure: '', notes: '' });

  useEffect(() => {
    return bodyAnnotationStore.subscribe(() =>
      setAnnotations(bodyAnnotationStore.filter(a => a.patientId === patientId))
    );
  }, [patientId]);

  const getZoneAnnotations = (zoneId: string) =>
    annotations.filter(a => a.zone === zoneId);

  const handleZoneClick = (zone: Zone) => {
    setSelectedZone(zone);
    setForm({ procedure: '', notes: '' });
    setDialogOpen(true);
  };

  const saveAnnotation = () => {
    if (!selectedZone || !form.procedure.trim()) {
      toast.error(isAr ? 'يرجى كتابة الإجراء' : 'Please enter a procedure');
      return;
    }
    bodyAnnotationStore.add({
      id: `ba-${Date.now()}`,
      patientId,
      visitId,
      doctorId: user?.id || '',
      view,
      zone: selectedZone.id,
      zoneAr: selectedZone.labelAr,
      procedure: form.procedure,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    });
    toast.success(isAr ? 'تم حفظ الملاحظة' : 'Annotation saved');
    setDialogOpen(false);
  };

  const deleteAnnotation = (id: string) => {
    bodyAnnotationStore.remove(a => a.id === id);
    toast.success(isAr ? 'تم الحذف' : 'Deleted');
  };

  const viewZones = BODY_ZONES.filter(z => z.view === view);
  const SVG_HEIGHT = view === 'face' ? 210 : 390;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="space-y-4">
      {/* View selector */}
      <div className="flex gap-2">
        {(['front', 'back', 'face'] as BodyView[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              view === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {v === 'front' ? (isAr ? 'أمامي' : 'Front') : v === 'back' ? (isAr ? 'خلفي' : 'Back') : (isAr ? 'الوجه' : 'Face')}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-col md:flex-row">
        {/* SVG body map */}
        <div className="flex-shrink-0">
          <svg width="200" height={SVG_HEIGHT} viewBox={`0 0 200 ${SVG_HEIGHT}`} className="border rounded-xl bg-muted/50">
            {/* Body outline simplified */}
            {view === 'front' && (
              <g stroke="#d1d5db" fill="none" strokeWidth="1.5">
                <ellipse cx="100" cy="40" rx="27" ry="30" />
                <line x1="100" y1="70" x2="100" y2="200" />
                <line x1="60" y1="100" x2="140" y2="100" />
                <line x1="60" y1="100" x2="40" y2="170" />
                <line x1="140" y1="100" x2="160" y2="170" />
                <line x1="85" y1="200" x2="75" y2="310" />
                <line x1="115" y1="200" x2="125" y2="310" />
                <line x1="75" y1="310" x2="72" y2="375" />
                <line x1="125" y1="310" x2="128" y2="375" />
              </g>
            )}
            {view === 'back' && (
              <g stroke="#d1d5db" fill="none" strokeWidth="1.5">
                <ellipse cx="100" cy="40" rx="27" ry="30" />
                <rect x="72" y="75" width="56" height="130" rx="8" />
                <line x1="72" y1="90" x2="40" y2="170" />
                <line x1="128" y1="90" x2="160" y2="170" />
                <line x1="85" y1="205" x2="75" y2="310" />
                <line x1="115" y1="205" x2="125" y2="310" />
                <line x1="75" y1="310" x2="72" y2="375" />
                <line x1="125" y1="310" x2="128" y2="375" />
              </g>
            )}
            {view === 'face' && (
              <g stroke="#d1d5db" fill="none" strokeWidth="1.5">
                <ellipse cx="100" cy="105" rx="65" ry="90" />
                <line x1="100" y1="15" x2="100" y2="195" strokeDasharray="3 3" opacity="0.4" />
              </g>
            )}

            {/* Zones */}
            {viewZones.map(zone => {
              const hasAnnotation = getZoneAnnotations(zone.id).length > 0;
              return (
                <g key={zone.id} onClick={() => handleZoneClick(zone)} className="cursor-pointer">
                  <circle
                    cx={zone.cx} cy={zone.cy} r={zone.r}
                    fill={hasAnnotation ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.08)'}
                    stroke={hasAnnotation ? '#ef4444' : '#93c5fd'}
                    strokeWidth={hasAnnotation ? 2 : 1}
                    className="hover:fill-blue-200 transition-colors"
                  />
                  {hasAnnotation && (
                    <circle cx={zone.cx + zone.r - 5} cy={zone.cy - zone.r + 5} r={5} fill="#ef4444" />
                  )}
                  <text
                    x={zone.cx} y={zone.cy + 4}
                    textAnchor="middle"
                    fontSize={zone.r > 16 ? 9 : 7}
                    fill={hasAnnotation ? '#991b1b' : '#374151'}
                    className="select-none pointer-events-none"
                  >
                    {isAr ? zone.labelAr.split(' ')[0] : zone.label.split(' ')[0]}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="text-xs text-muted-foreground text-center mt-1">{isAr ? 'انقر على المنطقة لإضافة ملاحظة' : 'Click a zone to annotate'}</p>
        </div>

        {/* Annotations list */}
        <div className="flex-1 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase">
            {isAr ? 'الملاحظات المسجلة' : 'Recorded Annotations'}
            <Badge variant="secondary" className="ms-2">{annotations.length}</Badge>
          </h3>
          {annotations.length === 0 ? (
            <p className="text-muted-foreground text-sm">{isAr ? 'لا توجد ملاحظات بعد' : 'No annotations yet'}</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {annotations.map(ann => {
                const zone = BODY_ZONES.find(z => z.id === ann.zone);
                return (
                  <div key={ann.id} className="border rounded-lg p-3 bg-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {isAr ? zone?.labelAr : zone?.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{ann.view}</span>
                        </div>
                        <p className="font-medium text-sm mt-1">{ann.procedure}</p>
                        {ann.notes && <p className="text-xs text-muted-foreground mt-0.5">{ann.notes}</p>}
                        <p className="text-xs text-muted-foreground/70 mt-1">{ann.createdAt.slice(0, 10)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-600 h-7 w-7"
                        onClick={() => deleteAnnotation(ann.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add annotation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>
              {isAr ? 'إضافة ملاحظة' : 'Add Annotation'} —{' '}
              {isAr ? selectedZone?.labelAr : selectedZone?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{isAr ? 'الإجراء / التشخيص' : 'Procedure / Finding'}</Label>
              <Input
                value={form.procedure}
                onChange={e => setForm(f => ({ ...f, procedure: e.target.value }))}
                placeholder={isAr ? 'مثال: ألم, طفح جلدي, كسر...' : 'e.g. Pain, rash, fracture...'}
                autoFocus
              />
            </div>
            <div>
              <Label>{isAr ? 'ملاحظات إضافية' : 'Additional Notes'}</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder={isAr ? 'تفاصيل إضافية...' : 'Additional details...'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveAnnotation}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BodyMapTab;
