import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocation, Link } from 'wouter';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { setMinistryUser, generateUserIdFromPhone, clearMinistryUser } from '@/lib/ministry-auth';
import { addUserGroup, clearUserGroups } from '@/lib/user-groups';

export default function MinistryAuth() {
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const handleLogin = async () => {
    if (!agreed) {
      toast.error('يجب الموافقة على شروط الاستخدام للمتابعة');
      return;
    }

    if (!name.trim() || !phone.trim()) {
      toast.error('الاسم ورقم الموبايل مطلوبان');
      return;
    }

    if (phone.trim().length < 10) {
      toast.error('رقم الموبايل غير صحيح');
      return;
    }

    setLoading(true);
    try {
      clearMinistryUser();

      const res = await fetch('/api/ministry/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMinistryUser({
        id: generateUserIdFromPhone(phone.trim()),
        name: name.trim(),
        phone: phone.trim(),
        role: data.role,
      });

      // Replace local groups with ONLY this user's groups from the server
      // (clear first so groups from other users/sessions don't show)
      clearUserGroups();

      if (data.groups && data.groups.length > 0) {
        for (const g of data.groups) {
          localStorage.setItem(`group_${g.groupCode}`, JSON.stringify({
            userName: g.userName,
            memberKey: g.memberKey,
            isLeader: g.isAdmin,
            groupCode: g.groupCode,
          }));
          addUserGroup({
            groupId: g.groupCode,
            groupName: g.groupName,
            churchName: g.churchName || '',
            role: g.isAdmin ? 'admin' : 'member',
            userName: g.userName,
            memberKey: g.memberKey,
          });
        }
        toast.success(`تم تسجيل الدخول بنجاح — ${data.groups.length} مجموعة`);
      } else if (data.role === 'admin') {
        toast.success('تم تسجيل الدخول كمسؤول');
      } else {
        toast.success('تم تسجيل الدخول بنجاح');
      }

      // التوجيه بعد الدخول:
      // 1) لو فيه وجهة محفوظة (جاء من رابط/صفحة جروب) → ارجع لها
      // 2) لو عنده مجموعة واحدة فقط → ادخلها مباشرة
      // 3) غير ذلك → قائمة المجموعات
      const redirectTarget = sessionStorage.getItem('postAuthRedirect');
      if (redirectTarget) {
        sessionStorage.removeItem('postAuthRedirect');
        navigate(redirectTarget);
      } else if (data.groups && data.groups.length === 1) {
        navigate(`/group/${data.groups[0].groupCode}`);
      } else {
        navigate('/groups');
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-lg">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">تسجيل الدخول</h1>
            <p className="text-sm text-muted-foreground">متابعة القراءة الروحية</p>
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">الاسم *</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="اكتب اسمك كما سجلته عند الانضمام"
                data-testid="input-ministry-name"
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
                data-testid="input-ministry-phone"
              />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked === true)}
                data-testid="checkbox-terms"
              />
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                أوافق على{' '}
                <Link href="/terms" className="text-primary underline font-medium" data-testid="link-terms">
                  شروط الاستخدام
                </Link>
                {' '}وسياسة الخصوصية
              </label>
            </div>
            {!agreed && (
              <p className="text-xs text-destructive" data-testid="text-terms-warning">يجب الموافقة على شروط الاستخدام للمتابعة</p>
            )}
            <Button onClick={handleLogin} disabled={loading || !agreed} className="w-full" data-testid="button-ministry-login">
              {loading ? 'جاري الدخول...' : 'دخول'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              لم تنضم لمجموعة بعد؟{' '}
              <Link href="/groups/join" className="text-primary underline" data-testid="link-join-group">
                انضم الآن
              </Link>
            </p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
