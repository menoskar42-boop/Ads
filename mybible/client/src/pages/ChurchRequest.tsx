import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Church, Check, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { getMinistryUser } from '@/lib/ministry-auth';

const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر',
  'البحيرة', 'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية',
  'المنيا', 'القليوبية', 'الوادي الجديد', 'السويس', 'أسوان',
  'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
  'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا',
  'شمال سيناء', 'سوهاج',
];

export default function ChurchRequest() {
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const user = getMinistryUser();
    if (!user) {
      navigate('/ministry-auth');
      return;
    }
    setAdminName(user.name);
    setAdminPhone(user.phone);
  }, [navigate]);

  const handleSubmit = async () => {
    if (!name.trim() || !governorate || !adminName.trim() || !adminPhone.trim()) {
      toast.error('جميع الحقول المطلوبة يجب ملؤها');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/churches/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          governorate,
          adminName: adminName.trim(),
          adminPhone: adminPhone.trim(),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmitted(true);
      toast.success('تم إرسال الطلب بنجاح');
    } catch (err: any) {
      toast.error(err.message || 'فشل إرسال الطلب');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-lg">
        <SEOHead />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground mb-2">تم إرسال الطلب!</h2>
            <p className="text-sm text-muted-foreground mb-4">
              سيتم مراجعة طلبك والموافقة عليه قريباً.
              <br />
              سيتم التواصل معك على الرقم المسجل.
            </p>
            <Button onClick={() => navigate('/groups')} variant="outline" data-testid="button-back-to-groups">
              العودة للمجموعات
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-lg">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
              <Church className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">طلب إنشاء صفحة للكنيسة</h1>
              <p className="text-sm text-muted-foreground">سجل كنيستك لإنشاء مجموعات القراءة</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/groups')} data-testid="button-back-groups">
            <ArrowRight className="w-4 h-4 ml-1" />
            رجوع
          </Button>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="churchName">اسم الكنيسة *</Label>
              <Input id="churchName" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: كنيسة مارمرقس" data-testid="input-church-name" />
            </div>
            <div>
              <Label htmlFor="governorate">المحافظة *</Label>
              <select
                id="governorate"
                value={governorate}
                onChange={e => setGovernorate(e.target.value)}
                className="w-full border rounded-md p-2 bg-background text-foreground"
                data-testid="select-governorate"
              >
                <option value="">اختر المحافظة</option>
                {GOVERNORATES.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="adminName">اسم الخادم المسؤول *</Label>
              <Input id="adminName" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="اسم المسؤول" data-testid="input-admin-name" />
            </div>
            <div>
              <Label htmlFor="adminPhone">رقم الموبايل *</Label>
              <Input id="adminPhone" value={adminPhone} onChange={e => setAdminPhone(e.target.value)} placeholder="01000000000" type="tel" dir="ltr" className="text-left" data-testid="input-admin-phone" />
            </div>
            <div>
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية" data-testid="input-notes" />
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full" data-testid="button-submit-church">
              {loading ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
