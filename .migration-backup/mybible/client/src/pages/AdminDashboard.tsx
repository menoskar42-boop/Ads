import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Check, X, Church, MapPin, User, Phone, FileText, Trash2, PauseCircle, PlayCircle, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { getMinistryUser } from '@/lib/ministry-auth';

interface ChurchRequest {
  id: number;
  name: string;
  governorate: string;
  adminName: string;
  adminPhone: string;
  notes: string | null;
  status: string;
}

interface ActiveChurch {
  id: number;
  name: string;
  governorate: string;
  adminName: string;
  adminPhone: string;
  status: string;
  groups: { id: number; groupCode: string; name: string; leaderName: string }[];
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [pending, setPending] = useState<ChurchRequest[]>([]);
  const [active, setActive] = useState<ActiveChurch[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [expandedChurch, setExpandedChurch] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'church-delete' | 'group-delete'; id?: number; code?: string; name: string } | null>(null);

  const user = getMinistryUser();

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/groups');
      return;
    }
    fetchPending();
    fetchActive();
  }, []);

  const fetchPending = async () => {
    try {
      const res = await fetch(`/api/churches/pending?phone=${user?.phone}`);
      if (!res.ok) throw new Error('غير مسموح');
      const data = await res.json();
      setPending(data.churches || []);
    } catch (err: any) {
      toast.error(err.message || 'فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  };

  const fetchActive = async () => {
    try {
      const res = await fetch(`/api/admin/churches?phone=${user?.phone}`);
      if (!res.ok) return;
      const data = await res.json();
      setActive(data.churches || []);
    } catch {}
  };

  const handleToggleStatus = async (church: ActiveChurch) => {
    setProcessing(church.id);
    try {
      const res = await fetch(`/api/churches/${church.id}/toggle-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user?.phone }),
      });
      if (!res.ok) throw new Error('فشل تغيير الحالة');
      const data = await res.json();
      setActive(prev => prev.map(c => c.id === church.id ? { ...c, status: data.church.status } : c));
      toast.success(data.church.status === 'disabled' ? 'تم تعطيل الكنيسة' : 'تم تفعيل الكنيسة');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteChurch = async (id: number) => {
    setProcessing(id);
    setConfirmDialog(null);
    try {
      const res = await fetch(`/api/churches/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user?.phone }),
      });
      if (!res.ok) throw new Error('فشل الحذف');
      setActive(prev => prev.filter(c => c.id !== id));
      toast.success('تم حذف الكنيسة نهائياً');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteGroup = async (code: string, churchId: number) => {
    setConfirmDialog(null);
    try {
      const res = await fetch(`/api/admin/groups/${code}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: user?.phone }),
      });
      if (!res.ok) throw new Error('فشل الحذف');
      setActive(prev => prev.map(c => c.id === churchId
        ? { ...c, groups: c.groups.filter(g => g.groupCode !== code) }
        : c
      ));
      toast.success('تم حذف المجموعة');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleApprove = async (id: number) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/churches/${id}/approve`, { method: 'PUT' });
      if (!res.ok) throw new Error('فشل الموافقة');
      toast.success('تمت الموافقة على الكنيسة');
      setPending(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: number) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/churches/${id}/reject`, { method: 'PUT' });
      if (!res.ok) throw new Error('فشل الرفض');
      toast.success('تم رفض الطلب');
      setPending(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(null);
    }
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">لوحة تحكم الأدمن</h1>
            <p className="text-sm text-muted-foreground">إدارة طلبات الكنائس</p>
          </div>
        </div>

        {/* ── قسم الطلبات المعلقة (بنفس المنطق الأصلي) ── */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
        ) : pending.length === 0 ? (
          <Card className="p-8 text-center mb-8">
            <Church className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-lg font-bold text-foreground mb-1">لا توجد طلبات معلقة</p>
            <p className="text-sm text-muted-foreground">جميع الطلبات تمت مراجعتها</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-lg font-bold text-foreground">طلبات معلقة</h2>
              <Badge variant="destructive" className="text-sm">{pending.length}</Badge>
            </div>

            {pending.map(church => (
              <Card key={church.id} className="p-5 border-amber-200 dark:border-amber-800/30" data-testid={`card-pending-church-${church.id}`}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Church className="w-5 h-5 text-amber-600" />
                      <h3 className="font-display font-bold text-lg text-foreground">{church.name}</h3>
                    </div>
                    <Badge variant="outline" className="text-amber-600 border-amber-300">معلق</Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{church.governorate}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-4 h-4 shrink-0" />
                      <span>{church.adminName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4 shrink-0" />
                      <span dir="ltr">{church.adminPhone}</span>
                    </div>
                    {church.notes && (
                      <div className="flex items-start gap-2 text-muted-foreground sm:col-span-2">
                        <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{church.notes}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-2 border-t">
                    <Button
                      onClick={() => handleApprove(church.id)}
                      disabled={processing === church.id}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      data-testid={`button-approve-${church.id}`}
                    >
                      <Check className="w-4 h-4 ml-1" />
                      قبول
                    </Button>
                    <Button
                      onClick={() => handleReject(church.id)}
                      disabled={processing === church.id}
                      variant="destructive"
                      className="flex-1"
                      data-testid={`button-reject-${church.id}`}
                    >
                      <X className="w-4 h-4 ml-1" />
                      رفض
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── قسم الكنائس النشطة (يظهر دائماً تحت الطلبات) ── */}
        {!loading && (
          <div className="space-y-4">
            {active.length === 0 ? (
              <Card className="p-8 text-center">
                <Church className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">لا توجد كنائس معتمدة بعد</p>
              </Card>
            ) : active.map(church => (
              <Card key={church.id} className={`p-5 ${church.status === 'disabled' ? 'border-red-200 dark:border-red-800/30 opacity-75' : 'border-green-200 dark:border-green-800/30'}`} data-testid={`card-active-church-${church.id}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Church className="w-5 h-5 text-indigo-500" />
                    <div>
                      <h3 className="font-display font-bold text-foreground">{church.name}</h3>
                      <p className="text-xs text-muted-foreground">{church.governorate} · {church.adminName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={church.status === 'disabled' ? 'destructive' : 'secondary'} className="text-xs">
                      {church.status === 'disabled' ? 'معطل' : 'نشط'}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedChurch(expandedChurch === church.id ? null : church.id)} data-testid={`button-expand-church-${church.id}`}>
                      {expandedChurch === church.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`flex-1 text-xs ${church.status === 'disabled' ? 'border-green-400 text-green-600' : 'border-amber-400 text-amber-600'}`}
                    disabled={processing === church.id}
                    onClick={() => handleToggleStatus(church)}
                    data-testid={`button-toggle-${church.id}`}
                  >
                    {church.status === 'disabled'
                      ? <><PlayCircle className="w-3.5 h-3.5 ml-1" />تفعيل</>
                      : <><PauseCircle className="w-3.5 h-3.5 ml-1" />تعطيل</>
                    }
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-red-400 text-red-600 hover:bg-red-50"
                    disabled={processing === church.id}
                    onClick={() => setConfirmDialog({ type: 'church-delete', id: church.id, name: church.name })}
                    data-testid={`button-delete-church-${church.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 ml-1" />
                    حذف نهائي
                  </Button>
                </div>

                {expandedChurch === church.id && (
                  <div className="mt-4 pt-3 border-t space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-bold">المجموعات ({church.groups.length})</span>
                    </div>
                    {church.groups.length === 0 ? (
                      <p className="text-xs text-muted-foreground">لا توجد مجموعات</p>
                    ) : church.groups.map(g => (
                      <div key={g.groupCode} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                        <div>
                          <span className="text-sm font-medium">{g.name}</span>
                          <span className="text-xs text-muted-foreground mr-2">({g.groupCode})</span>
                          <p className="text-xs text-muted-foreground">الخادم: {g.leaderName}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-red-50"
                          onClick={() => setConfirmDialog({ type: 'group-delete', code: g.groupCode, id: church.id, name: g.name })}
                          data-testid={`button-delete-group-${g.groupCode}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* ── Dialog تأكيد الحذف ── */}
        <Dialog open={!!confirmDialog} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                تأكيد الحذف النهائي
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                هل أنت متأكد من حذف <span className="font-bold">"{confirmDialog?.name}"</span> نهائياً؟
                {confirmDialog?.type === 'church-delete' && <span className="block mt-1 text-destructive text-xs">⚠️ سيتم حذف جميع المجموعات والأعضاء التابعين لها</span>}
              </p>
              <div className="flex gap-3">
                <Button variant="destructive" className="flex-1" onClick={() => {
                  if (confirmDialog?.type === 'church-delete' && confirmDialog.id) handleDeleteChurch(confirmDialog.id);
                  if (confirmDialog?.type === 'group-delete' && confirmDialog.code && confirmDialog.id) handleDeleteGroup(confirmDialog.code, confirmDialog.id);
                }} data-testid="button-confirm-delete">
                  <Trash2 className="w-4 h-4 ml-1" />
                  نعم، احذف نهائياً
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDialog(null)} data-testid="button-cancel-delete">
                  إلغاء
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </motion.div>
    </div>
  );
}
