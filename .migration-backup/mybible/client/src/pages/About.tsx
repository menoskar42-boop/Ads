import { SEOHead } from '@/components/SEOHead';
import { Card } from '@/components/ui/card';
import { BookOpen, Heart, Users, Shield, Church, Wrench } from 'lucide-react';

export default function About() {
  const seo = {
    title: 'من نحن | الكتاب المقدس رفيقي',
    description: 'تعرّف على موقع الكتاب المقدس رفيقي، منصة مجانية متكاملة للقراءة اليومية والتفسير والمحتوى القبطي الأرثوذكسي باللغة العربية.',
    keywords: ['من نحن', 'الكتاب المقدس رفيقي', 'موقع الكتاب المقدس', 'قراءة الكتاب المقدس', 'أرثوذكسي'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'من نحن - الكتاب المقدس رفيقي',
      description: 'منصة مجانية متكاملة للقراءة اليومية والتفسير والمحتوى القبطي الأرثوذكسي باللغة العربية.',
      inLanguage: 'ar',
      isPartOf: {
        '@type': 'WebSite',
        name: 'الكتاب المقدس رفيقي'
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead dynamicSEO={seo} />
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
            <Users className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground" data-testid="text-about-title">من نحن</h1>
            <p className="text-sm text-muted-foreground">تعرّف على الكتاب المقدس رفيقي</p>
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-8 text-right leading-loose font-body text-base" dir="rtl">

            {/* رسالتنا */}
            <div className="flex items-start gap-3">
              <BookOpen className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h2 className="font-display text-xl font-bold mb-3">رسالتنا</h2>
                <p className="mb-3">
                  الكتاب المقدس رفيقي هو منصة مجانية متكاملة تهدف إلى تشجيع القراءة اليومية للكتاب المقدس باللغة العربية، وتقديم محتوى روحي وقبطي أرثوذكسي يساعد على الدراسة، والتأمل، والصلاة، والحياة الكنسية اليومية بطريقة بسيطة وحديثة ومتاحة للجميع.
                </p>
                <p>
                  نؤمن أن كلمة الله هي نور للحياة ومصدر للتعزية والرجاء، لذلك نسعى إلى توفير تجربة روحية متكاملة تجمع بين القراءة، والتفسير، والصلاة، والتعليم الكنسي، والخدمة داخل الكنائس في مكان واحد.
                </p>
              </div>
            </div>

            {/* ما نقدمه */}
            <div className="flex items-start gap-3">
              <Heart className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h2 className="font-display text-xl font-bold mb-3">ما نقدمه</h2>
                <ul className="list-disc list-inside space-y-2">
                  <li>قراءة الكتاب المقدس كاملاً باللغة العربية مع تفسير الآيات والإصحاحات</li>
                  <li>خطط قراءة يومية متعددة (30، 60، 90، 180، 365 يوم)</li>
                  <li>قسم التعزية الروحية مع آيات مصنفة حسب المشاعر والاحتياجات</li>
                  <li>قصص الكتاب المقدس للأطفال بطريقة مبسطة وممتعة</li>
                  <li>الاستماع لإصحاحات الكتاب المقدس عبر الفيديوهات والصوتيات</li>
                  <li>أدوات تحليل الآيات والبحث الذكي</li>
                </ul>
              </div>
            </div>

            {/* القسم القبطي الأرثوذكسي */}
            <div className="flex items-start gap-3">
              <Church className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h2 className="font-display text-xl font-bold mb-2">القسم القبطي الأرثوذكسي</h2>
                <p className="mb-3 text-muted-foreground">يضم الموقع مكتبة أرثوذكسية متكاملة تشمل:</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>الخولاجي المقدس، قداسات القديس باسيليوس والقديس غريغوريوس والقديس كيرلس بالعربية والقبطية</li>
                  <li>كتاب الأجبية الكامل وصلوات السواعي</li>
                  <li>القطمارس اليومي والقراءات الليتورجية على مدار السنة</li>
                  <li>السنكسار القبطي وسير القديسين والشهداء</li>
                  <li>مردات الشماس والألحان القبطية والإبصلمودية</li>
                  <li>تفاسير الآباء الأقباط للكتاب المقدس</li>
                  <li>الأسفار القانونية الثانية (الديوتيروكانونية)</li>
                  <li>خرائط الكتاب المقدس التاريخية والجغرافية</li>
                  <li>العقيدة القبطية الأرثوذكسية وقانون الإيمان النيقاوي</li>
                  <li>تاريخ الكنيسة القبطية وسير البطاركة</li>
                  <li>مكتبة كتب الآباء والكتابات الروحية</li>
                  <li>شخصيات الكنيسة القبطية عبر التاريخ</li>
                  <li>فيديوهات روحية وتعليمية مرتبطة بالمحتوى الكنسي</li>
                  <li>أسئلة وأجوبة لاهوتية من تراث قداسة البابا شنودة الثالث</li>
                </ul>
              </div>
            </div>

            {/* المجتمع والتواصل */}
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h2 className="font-display text-xl font-bold mb-2">المجتمع والتواصل</h2>
                <p className="mb-3 text-muted-foreground">لأن الحياة الروحية تنمو بالمشاركة، يوفر الموقع أدوات تساعد على التواصل والمتابعة الجماعية، منها:</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>مجموعات القراءة الروحية مع إمكانية إنشاء المجموعات والانضمام إليها والمحادثة الجماعية</li>
                  <li>تحديات قراءة الكتاب المقدس الجماعية</li>
                  <li>دليل الكنائس القبطية الأرثوذكسية</li>
                  <li>مشاركة الآيات والصور الروحية عبر وسائل التواصل الاجتماعي بسهولة</li>
                </ul>
              </div>
            </div>

            {/* أدوات روحية ذكية */}
            <div className="flex items-start gap-3">
              <Wrench className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h2 className="font-display text-xl font-bold mb-2">أدوات روحية ذكية</h2>
                <p className="mb-3 text-muted-foreground">يحتوي الموقع أيضاً على مجموعة من الأدوات الحديثة التي تساعد المستخدم في حياته الروحية اليومية، مثل:</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>"آياتي" لحفظ الآيات المفضلة والرجوع إليها لاحقاً</li>
                  <li>آية اليوم اليومية</li>
                  <li>مواضيع الكتاب المقدس المصنفة</li>
                  <li>عرض القداس على شاشات الكنيسة مع التحكم المباشر من الهاتف أو أي جهاز آخر</li>
                  <li>أنظمة عرض ليتورجية تساعد الخدام في التنقل بين القداسات ومردات الشماس بسهولة أثناء الصلاة</li>
                </ul>
              </div>
            </div>

            {/* مبادئنا */}
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-primary shrink-0 mt-1" />
              <div>
                <h2 className="font-display text-xl font-bold mb-3">مبادئنا</h2>
                <ul className="list-disc list-inside space-y-2">
                  <li>نحترم قدسية النص الكتابي ولا ننسخ أو نغيّر أي نص من الكتاب المقدس</li>
                  <li>التفاسير والمحتويات مأخوذة من مصادر موثوقة ومعتمدة</li>
                  <li>الموقع مجاني بالكامل ومتاح للجميع بدون قيود</li>
                  <li>نلتزم بحماية خصوصية المستخدمين</li>
                  <li>نسعى لتقديم التكنولوجيا الحديثة في خدمة الحياة الروحية والتعليم الكنسي</li>
                </ul>
              </div>
            </div>

          </div>
        </Card>
      </div>
    </div>
  );
}
