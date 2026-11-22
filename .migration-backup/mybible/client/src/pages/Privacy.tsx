import { SEOHead } from '@/components/SEOHead';
import { Card } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function Privacy() {
  const seo = {
    title: 'سياسة الخصوصية | الكتاب المقدس رفيقي',
    description: 'سياسة الخصوصية لموقع الكتاب المقدس رفيقي. تعرّف على كيفية حماية بياناتك وخصوصيتك أثناء استخدام الموقع.',
    keywords: ['سياسة الخصوصية', 'حماية البيانات', 'الكتاب المقدس رفيقي'],
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead dynamicSEO={seo} />
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground" data-testid="text-privacy-title">سياسة الخصوصية</h1>
            <p className="text-sm text-muted-foreground">آخر تحديث: فبراير 2026</p>
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-6 text-right leading-loose font-body text-base" dir="rtl">
            <section>
              <h2 className="font-display text-xl font-bold mb-2">مقدمة</h2>
              <p>
                نحن في "الكتاب المقدس رفيقي" نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية. توضح هذه السياسة كيفية جمع واستخدام وحماية المعلومات عند استخدامك لموقعنا.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-2">البيانات التي نجمعها</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>بيانات الجلسة: نستخدم ملفات جلسة مؤقتة لتحسين تجربة الاستخدام</li>
                <li>تقدم القراءة: نحفظ تقدمك في خطط القراءة محلياً على جهازك</li>
                <li>الآيات المظللة: يتم حفظ تظليلاتك لتتمكن من العودة إليها</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-2">كيف نستخدم بياناتك</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>لتوفير تجربة قراءة مخصصة ومستمرة</li>
                <li>لحفظ تفضيلاتك وتقدمك في القراءة</li>
                <li>لتحسين أداء الموقع وتجربة المستخدم</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-2">حماية البيانات</h2>
              <p>
                نحن لا نبيع أو نشارك أي بيانات شخصية مع أطراف ثالثة. جميع البيانات محفوظة بشكل آمن ومشفّر. لا نطلب أي معلومات شخصية حساسة مثل الاسم أو البريد الإلكتروني أو رقم الهاتف.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-2">ملفات تعريف الارتباط (Cookies)</h2>
              <p>
                نستخدم ملفات تعريف ارتباط ضرورية فقط لتشغيل الموقع وحفظ جلسة المستخدم. لا نستخدم ملفات تعريف ارتباط إعلانية أو تتبعية.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-2">محتوى الطرف الثالث</h2>
              <p>
                قد يحتوي الموقع على محتوى مضمّن من يوتيوب (فيديوهات الاستماع للإصحاحات وقصص الأطفال). هذا المحتوى يخضع لسياسة خصوصية جوجل/يوتيوب.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-2">تحديثات السياسة</h2>
              <p>
                قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم نشر أي تغييرات على هذه الصفحة.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
