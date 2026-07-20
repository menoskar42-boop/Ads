import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogIn, ArrowRight, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { addUserGroup } from '@/lib/user-groups';
import { getMinistryUser } from '@/lib/ministry-auth';

export default function GroupJoin() {
  const [, navigate] = useLocation();
  const user = getMinistryUser();

  const urlCode = new URLSearchParams(window.location.search).get('code') || '';
  const [groupCode, setGroupCode] = useState(urlCode.toUpperCase());
  const [userName, setUserName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [pendingGroup, setPendingGroup] = useState<{ name: string } | null>(null);

  const handleJoin = async () => {
    if (!groupCode.trim() || !userName.trim()) {
      toast.error('كود المجموعة واسم المستخدم مطلوبان');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      toast.error('رقم الموبايل مطلوب (10 أرقام على الأقل)');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupCode: groupCode.trim().toUpperCase(),
          userName: userName.trim(),
          phone: phone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.status === 'already_member') {
        const isAdmin = data.member.isAdmin === true;
        localStorage.setItem(`group_${data.group.groupCode}`, JSON.stringify({
          userName: userName.trim(),
          memberKey: data.member.memberKey,
          isLeader: isAdmin,
          groupCode: data.group.groupCode,
        }));
        addUserGroup({
          groupId: data.group.groupCode,
          groupName: data.group.name,
          churchName: data.group.churchName || '',
          role: isAdmin ? 'admin' : 'member',
          userName: userName.trim(),
          memberKey: data.member.memberKey,
        });
        toast.success('أنت عضو بالفعل في هذه المجموعة');
        navigate(`/group/${data.group.groupCode}`);
      } else if (data.status === 'pending') {
        setPendingGroup({ name: data.group.name });
        toast.success('تم إرسال طلب الانضمام بنجاح');
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل الانضمام');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-lg">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-md">
              <LogIn className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">الانضمام لمجموعة</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/groups')} data-testid="button-back-groups">
            <ArrowRight className="w-4 h-4 ml-1" />
            رجوع
          </Button>
        </div>

        {pendingGroup ? (
          <Card className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground mb-2">تم إرسال طلبك</h2>
            <p className="text-muted-foreground mb-1">
              طلب الانضمام لمجموعة <span className="font-bold text-foreground">{pendingGroup.name}</span> في انتظار موافقة الخادم المسؤول
            </p>
            <p className="text-sm text-muted-foreground mb-6">سيتم إضافتك للمجموعة بعد الموافقة</p>
            <Button variant="outline" onClick={() => navigate('/groups')} data-testid="button-back-to-groups">
              العودة لمجموعاتي
            </Button>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="code">كود المجموعة *</Label>
                <Input
                  id="code"
                  value={groupCode}
                  onChange={e => setGroupCode(e.target.value.toUpperCase())}
                  placeholder="مثال: A7K3P"
                  className="text-center font-mono text-lg tracking-widest"
                  maxLength={5}
                  data-testid="input-group-code"
                />
              </div>
              <div>
                <Label htmlFor="username">اسمك *</Label>
                <Input
                  id="username"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="اكتب اسمك"
                  data-testid="input-username"
                />
              </div>
              <div>
                <Label htmlFor="phone">رقم الموبايل *</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="01000000000"
                  type="tel"
                  dir="ltr"
                  className="text-left"
                  data-testid="input-join-phone"
                />
                <p className="text-xs text-muted-foreground mt-1">يُستخدم لتسجيل الدخول لاحقاً</p>
              </div>
              <Button onClick={handleJoin} disabled={loading} className="w-full" data-testid="button-join-group">
                {loading ? 'جاري إرسال الطلب...' : 'طلب الانضمام'}
              </Button>
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
