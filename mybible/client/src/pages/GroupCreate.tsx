import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, ArrowRight, Copy, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useLocation } from 'wouter';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { addUserGroup } from '@/lib/user-groups';
import { getMinistryUser } from '@/lib/ministry-auth';

export default function GroupCreate() {
  const [, navigate] = useLocation();
  const user = getMinistryUser();

  const [groupName, setGroupName] = useState('');
  const [leaderName, setLeaderName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [churchName, setChurchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ groupCode: string; leaderKey: string; groupName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!groupName.trim() || !leaderName.trim()) {
      toast.error('اسم المجموعة واسمك مطلوبان');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      toast.error('رقم الموبايل مطلوب (10 أرقام على الأقل)');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName.trim(),
          leaderName: leaderName.trim(),
          phone: phone.trim(),
          churchName: churchName.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const { group, leaderKey } = data;

      localStorage.setItem(`group_${group.groupCode}`, JSON.stringify({
        userName: leaderName.trim(),
        memberKey: leaderKey,
        isLeader: true,
        groupCode: group.groupCode,
      }));

      addUserGroup({
        groupId: group.groupCode,
        groupName: group.name,
        churchName: group.churchName || '',
        role: 'admin',
        userName: leaderName.trim(),
        memberKey: leaderKey,
      });

      setCreated({ groupCode: group.groupCode, leaderKey, groupName: group.name });
      toast.success('تم إنشاء المجموعة بنجاح!');
    } catch (err: any) {
      toast.error(err.message || 'فشل إنشاء المجموعة');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (created) {
      navigator.clipboard.writeText(created.groupCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-lg">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">إنشاء مجموعة</h1>
              <p className="text-sm text-muted-foreground">مجموعة قراءة روحية جديدة</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/groups')} data-testid="button-back-groups">
            <ArrowRight className="w-4 h-4 ml-1" />
            رجوع
          </Button>
        </div>

        {created ? (
          <Card className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Users className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">تم إنشاء المجموعة!</h2>
            <p className="text-sm text-muted-foreground mb-6">{created.groupName}</p>

            <div className="bg-muted rounded-xl p-4 mb-6">
              <p className="text-xs text-muted-foreground mb-2">كود الانضمام — شاركه مع أعضاء مجموعتك</p>
              <div className="flex items-center justify-center gap-3">
                <span className="font-mono text-3xl font-bold tracking-widest text-primary" data-testid="text-group-code">
                  {created.groupCode}
                </span>
                <Button variant="ghost" size="sm" onClick={copyCode} data-testid="button-copy-code">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate(`/group/${created.groupCode}`)} data-testid="button-go-to-group">
                دخول المجموعة
              </Button>
              <Button variant="outline" onClick={() => navigate('/groups')} data-testid="button-back-to-groups">
                مجموعاتي
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="group-name">اسم المجموعة *</Label>
                <Input
                  id="group-name"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="مثال: مجموعة الشباب — كنيسة مار جرجس"
                  data-testid="input-group-name"
                />
              </div>
              <div>
                <Label htmlFor="leader-name">اسمك (الخادم المسؤول) *</Label>
                <Input
                  id="leader-name"
                  value={leaderName}
                  onChange={e => setLeaderName(e.target.value)}
                  placeholder="اكتب اسمك"
                  data-testid="input-leader-name"
                />
              </div>
              <div>
                <Label htmlFor="phone">رقم موبايلك *</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="01000000000"
                  type="tel"
                  dir="ltr"
                  className="text-left"
                  data-testid="input-leader-phone"
                />
                <p className="text-xs text-muted-foreground mt-1">يُستخدم لتسجيل الدخول لاحقاً</p>
              </div>
              <div>
                <Label htmlFor="church-name">اسم الكنيسة (اختياري)</Label>
                <Input
                  id="church-name"
                  value={churchName}
                  onChange={e => setChurchName(e.target.value)}
                  placeholder="مثال: كنيسة مار مرقس"
                  data-testid="input-church-name"
                />
              </div>
              <Button onClick={handleCreate} disabled={loading} className="w-full" data-testid="button-create-group">
                {loading ? 'جاري الإنشاء...' : 'إنشاء المجموعة'}
              </Button>
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
