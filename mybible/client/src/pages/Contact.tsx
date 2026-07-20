import { SEOHead } from '@/components/SEOHead';
import { Card } from '@/components/ui/card';
import { Mail, MessageCircle, Globe } from 'lucide-react';

export default function Contact() {
  const seo = {
    title: 'تواصل معنا | الكتاب المقدس رفيقي',
    description: 'تواصل مع فريق الكتاب المقدس رفيقي للاستفسارات والملاحظات والاقتراحات.',
    keywords: ['تواصل معنا', 'اتصل بنا', 'الكتاب المقدس رفيقي'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'تواصل معنا - الكتاب المقدس رفيقي',
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
            <MessageCircle className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground" data-testid="text-contact-title">تواصل معنا</h1>
            <p className="text-sm text-muted-foreground">نسعد بتواصلك واقتراحاتك</p>
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-6 text-right leading-loose font-body text-base" dir="rtl">
            <p>
              نرحّب بجميع استفساراتك وملاحظاتك واقتراحاتك. هدفنا هو تقديم أفضل تجربة لقراءة الكتاب المقدس باللغة العربية.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <Mail className="w-6 h-6 text-primary shrink-0" />
                <div>
                  <h3 className="font-semibold">البريد الإلكتروني</h3>
                  <p className="text-muted-foreground">Contact@oscardevs.com</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
                <Globe className="w-6 h-6 text-primary shrink-0" />
                <div>
                  <h3 className="font-semibold">الموقع</h3>
                  <p className="text-muted-foreground">mybible.oscardevs.com</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
              <h3 className="font-display font-bold mb-2">ملاحظة</h3>
              <p className="text-sm">
                الكتاب المقدس رفيقي هو موقع تطوعي مجاني بالكامل. نقدّر صبرك في انتظار الرد على رسائلك.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
