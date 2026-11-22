import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Church, Users, Plus, ChevronLeft, Shield, MapPin, Loader2, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useQuery } from '@tanstack/react-query';
import { getMinistryUser } from '@/lib/ministry-auth';
import { addUserGroup } from '@/lib/user-groups';

export default function ChurchView() {
  const params = useParams<{ churchId: string }>();
  const churchId = parseInt(params.churchId || '0');
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [description, setDescription] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [addServantOpen, setAddServantOpen] = useState(false);
  const [newServantName, setNewServantName] = useState('');
  const [newServantPhone, setNewServantPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const user = getMinistryUser();

  useEffect(() => {
    if (!user) {
      navigate('/ministry-auth');
    }
  }, [user, navigate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['church', churchId],
    queryFn: async () => {
      const res = await fetch(`/api/churches/${churchId}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: churchId > 0,
  });

  const { data: adminCheck } = useQuery({
    queryKey: ['church-admin', churchId, user?.phone],
    queryFn: async () => {
      const res = await fetch(`/api/churches/${churchId}/is-admin?phone=${encodeURIComponent(user?.phone || '')}`);
      return res.json();
    },
    enabled: churchId > 0 && !!user?.phone,
  });

  const userRole: 'admin' | 'servant' | null = adminCheck?.role ?? null;
  const isAuthorized = userRole !== null;
  const isFullAdmin  = userRole === 'admin';

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('اسم المجموعة مطلوب');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/churches/${churchId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          ageGroup: ageGroup.trim() || null,
          description: description.trim() || null,
          leaderName: user?.name || '',
          leaderPhone: user?.phone || '',
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      localStorage.setItem(`group_${result.group.groupCode}`, JSON.stringify({
        userName: user?.name,
        memberKey: result.leaderKey,
        isLeader: true,
        groupCode: result.group.groupCode,
      }));

      addUserGroup({
        groupId: result.group.groupCode,
        groupName: groupName.trim(),
        churchName: data?.church?.name || '',
        role: 'admin',
        userName: user?.name || '',
        memberKey: result.leaderKey,
      });

      toast.success('تم إنشاء المجموعة بنجاح');
      setCreateOpen(false);
      setGroupName('');
      setAgeGroup('');
      setDescription('');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'فشل إنشاء المجموعة');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminName.trim() || !newAdminPhone.trim()) {
      toast.error('الاسم والموبايل مطلوبان');
      return;
    }
    try {
      const res = await fetch(`/api/churches/${churchId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAdminName.trim(),
          phone: newAdminPhone.trim(),
          requestorPhone: user?.phone || '',
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success(result.alreadyExists ? 'هذا الشخص أدمن بالفعل' : 'تم إضافة الأدمن');
      setAddAdminOpen(false);
      setNewAdminName('');
      setNewAdminPhone('');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'فشل إضافة الأدمن');
    }
  };

  const handleAddServant = async () => {
    if (!newServantName.trim() || !newServantPhone.trim()) {
      toast.error('الاسم والموبايل مطلوبان');
      return;
    }
    try {
      const res = await fetch(`/api/churches/${churchId}/servants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newServantName.trim(),
          phone: newServantPhone.trim(),
          requestorPhone: user?.phone || '',
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success(result.alreadyExists ? 'هذا الشخص مسجّل بالفعل' : 'تم إضافة الخادم');
      setAddServantOpen(false);
      setNewServantName('');
      setNewServantPhone('');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'فشل إضافة الخادم');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.church) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="p-8 text-center">
          <h2 className="font-display text-xl font-bold mb-2">الكنيسة غير موجودة</h2>
          <Link href="/church"><Button variant="outline">العودة</Button></Link>
        </Card>
      </div>
    );
  }

  const { church, groups, admins } = data;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
              <Church className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">{church.name}</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{church.governorate}</span>
              </div>
            </div>
          </div>
          {isAuthorized && (
            <div className="flex gap-2 flex-wrap">
              {isFullAdmin && (
                <Button variant="outline" size="sm" onClick={() => setAddAdminOpen(true)} data-testid="button-add-admin">
                  <UserPlus className="w-4 h-4 ml-1" />
                  إضافة أدمن
                </Button>
              )}
              {isFullAdmin && (
                <Button variant="outline" size="sm" onClick={() => setAddServantOpen(true)} data-testid="button-add-servant">
                  <UserPlus className="w-4 h-4 ml-1" />
                  إضافة خادم
                </Button>
              )}
              <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-church-group">
                <Plus className="w-4 h-4 ml-1" />
                إنشاء مجموعة
              </Button>
            </div>
          )}
        </div>

        {userRole === 'admin' && (
          <div className="flex items-center gap-2 mb-4">
            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 gap-1">
              <Shield className="w-3 h-3" />
              أدمن الكنيسة
            </Badge>
          </div>
        )}
        {userRole === 'servant' && (
          <div className="flex items-center gap-2 mb-4">
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 gap-1">
              <Users className="w-3 h-3" />
              خادم
            </Badge>
          </div>
        )}

        {admins && admins.length > 0 && isAuthorized && (
          <Card className="p-4 mb-4">
            <h3 className="font-display font-bold text-foreground mb-2 text-sm">مسؤولو الكنيسة ({admins.length})</h3>
            <div className="flex flex-wrap gap-2">
              {admins.map((a: any) => (
                <Badge key={a.id} variant="outline" className="text-xs">{a.name}</Badge>
              ))}
            </div>
          </Card>
        )}

        <h2 className="font-display text-lg font-bold text-foreground mb-3">المجموعات ({groups?.length || 0})</h2>

        {(!groups || groups.length === 0) ? (
          <Card className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-display text-lg font-bold text-foreground mb-2">لا توجد مجموعات بعد</h3>
            <p className="text-sm text-muted-foreground">
              {isAuthorized ? 'أنشئ أول مجموعة لكنيستك' : 'لم يتم إنشاء مجموعات لهذه الكنيسة بعد'}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {groups.map((g: any) => {
              const myEntry = JSON.parse(localStorage.getItem(`group_${g.groupCode}`) || 'null');
              const isMember = !!myEntry;
              return (
                <Card
                  key={g.id}
                  className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => isMember ? navigate(`/group/${g.groupCode}`) : null}
                  data-testid={`card-group-${g.groupCode}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-foreground">{g.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {g.ageGroup && <Badge variant="outline" className="text-xs">{g.ageGroup}</Badge>}
                          {g.description && <span className="text-xs text-muted-foreground">{g.description}</span>}
                        </div>
                      </div>
                    </div>
                    {isMember ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs">عضو</Badge>
                        <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/groups/join?code=${g.groupCode}`);
                        }}
                        data-testid={`button-request-join-${g.groupCode}`}
                      >
                        <UserPlus className="w-3 h-3 ml-1" />
                        طلب انضمام
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء مجموعة جديدة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>اسم المجموعة *</Label>
                <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="مثال: فصل ابتدائي" data-testid="input-new-group-name" />
              </div>
              <div>
                <Label>الفئة العمرية</Label>
                <Input value={ageGroup} onChange={e => setAgeGroup(e.target.value)} placeholder="مثال: 10-12 سنة" data-testid="input-age-group" />
              </div>
              <div>
                <Label>وصف بسيط</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف المجموعة" data-testid="input-group-description" />
              </div>
              <Button onClick={handleCreateGroup} disabled={loading} className="w-full" data-testid="button-confirm-create-group">
                {loading ? 'جاري الإنشاء...' : 'إنشاء المجموعة'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة أدمن جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>اسم الأدمن *</Label>
                <Input value={newAdminName} onChange={e => setNewAdminName(e.target.value)} placeholder="الاسم" data-testid="input-new-admin-name" />
              </div>
              <div>
                <Label>رقم الموبايل *</Label>
                <Input value={newAdminPhone} onChange={e => setNewAdminPhone(e.target.value)} placeholder="01000000000" type="tel" dir="ltr" className="text-left" data-testid="input-new-admin-phone" />
              </div>
              <Button onClick={handleAddAdmin} className="w-full" data-testid="button-confirm-add-admin">
                إضافة
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addServantOpen} onOpenChange={setAddServantOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة خادم</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">الخادم يستطيع إنشاء مجموعات تحت الكنيسة فقط</p>
            <div className="space-y-4">
              <div>
                <Label>اسم الخادم *</Label>
                <Input value={newServantName} onChange={e => setNewServantName(e.target.value)} placeholder="الاسم" data-testid="input-new-servant-name" />
              </div>
              <div>
                <Label>رقم الموبايل *</Label>
                <Input value={newServantPhone} onChange={e => setNewServantPhone(e.target.value)} placeholder="01000000000" type="tel" dir="ltr" className="text-left" data-testid="input-new-servant-phone" />
              </div>
              <Button onClick={handleAddServant} className="w-full" data-testid="button-confirm-add-servant">
                إضافة الخادم
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
}
