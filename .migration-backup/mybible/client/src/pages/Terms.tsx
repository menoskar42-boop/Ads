import { motion } from 'framer-motion';
import { FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocation } from 'wouter';
import { SEOHead } from '@/components/SEOHead';

export default function Terms() {
  const [, navigate] = useLocation();

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">شروط وأحكام الاستخدام</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1 as any)} data-testid="button-back-terms">
            <ArrowRight className="w-4 h-4 ml-1" />
            رجوع
          </Button>
        </div>

        <Card className="p-6 space-y-6 leading-relaxed text-foreground">
          <p>باستخدامك لمنصة الكتاب المقدس رفيقي فإنك توافق على الشروط والأحكام التالية. إذا لم توافق على هذه الشروط، يرجى عدم استخدام المنصة.</p>

          <div>
            <h2 className="font-display text-lg font-bold mb-2">1. استخدام المنصة</h2>
            <p className="mb-2">منصة الكتاب المقدس رفيقي هي منصة إلكترونية تهدف إلى:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>قراءة الكتاب المقدس</li>
              <li>الدراسة الروحية</li>
              <li>متابعة القراءة الجماعية داخل مجموعات</li>
              <li>دعم أنشطة الكنائس وخدمة مدارس الأحد</li>
            </ul>
            <p className="mt-2">يجب استخدام المنصة فقط للأغراض الروحية والتعليمية المشروعة.</p>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold mb-2">2. مسؤولية المستخدم</h2>
            <p className="mb-2">يتعهد المستخدم بما يلي:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>إدخال بيانات صحيحة عند التسجيل</li>
              <li>عدم انتحال شخصية أي شخص أو جهة</li>
              <li>عدم استخدام المنصة لأي أنشطة مخالفة للقانون</li>
              <li>عدم استخدام المنصة لنشر أي محتوى مسيء أو تحريضي أو غير لائق</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold mb-2">3. مسؤولية المجموعات</h2>
            <p>المجموعات التي يتم إنشاؤها داخل المنصة تُدار من قبل الخادم أو المسؤول عن المجموعة.</p>
            <p className="mt-2">إدارة الموقع لا تتحمل المسؤولية الكاملة عن المحتوى أو النقاشات داخل المجموعات، وتبقى المسؤولية على مشرفي المجموعات.</p>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold mb-2">4. إنشاء المجموعات</h2>
            <p className="mb-2">يوافق المستخدم على أن:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>إنشاء المجموعات يجب أن يكون لأغراض روحية أو تعليمية</li>
              <li>يمنع استخدام المجموعات لأي أغراض سياسية أو تجارية أو غير قانونية</li>
            </ul>
            <p className="mt-2">ويحتفظ الموقع بحق إيقاف أو حذف أي مجموعة تخالف هذه الشروط.</p>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold mb-2">5. حماية المنصة</h2>
            <p className="mb-2">يمنع استخدام المنصة في:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>نشر محتوى غير قانوني</li>
              <li>التخطيط لأي أنشطة ضارة</li>
              <li>استخدام المنصة بطريقة قد تضر بالمستخدمين أو بالموقع</li>
            </ul>
            <p className="mt-2">ويحتفظ الموقع بحق تعليق أو إيقاف أي حساب يخالف هذه الشروط.</p>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold mb-2">6. إخلاء المسؤولية</h2>
            <p>منصة الكتاب المقدس رفيقي هي أداة مساعدة للقراءة والدراسة الروحية، وليست بديلاً عن الإرشاد الكنسي أو الروحي المباشر.</p>
            <p className="mt-2">الموقع غير مسؤول عن أي استخدام غير صحيح للمنصة.</p>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold mb-2">7. تعديل الشروط</h2>
            <p>يحتفظ الموقع بحق تعديل هذه الشروط في أي وقت عند الحاجة.</p>
            <p className="mt-2">ويعد استمرار استخدام المنصة بعد التعديل موافقة على الشروط الجديدة.</p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
