import { Link } from 'wouter';
import { SEOHead } from '@/components/SEOHead';
import type { PageSEO } from '@/lib/seo-config';

const sitemapSEO: PageSEO = {
  title: 'خريطة الموقع | الكتاب المقدس رفيقي',
  description: 'خريطة كاملة لجميع صفحات موقع رفيقي: الكتاب المقدس، الخولاجي، الأجبية، السنكسار، القطمارس، الألحان القبطية، وأكثر.',
  keywords: ['خريطة الموقع', 'الكتاب المقدس', 'الخولاجي', 'الأجبية', 'السنكسار'],
};

const sections = [
  {
    title: 'الكتاب المقدس',
    links: [
      { href: '/bible', label: 'الكتاب المقدس كاملاً' },
      { href: '/search', label: 'البحث في الكتاب المقدس' },
      { href: '/plans', label: 'خطط القراءة اليومية' },
      { href: '/emotions', label: 'آيات حسب المشاعر' },
      { href: '/daily-verse', label: 'آية اليوم' },
    ],
  },
  {
    title: 'أرثوذوكسيات',
    links: [
      { href: '/orthodox', label: 'قسم أرثوذوكسيات' },
      { href: '/orthodox/kholagy', label: 'الخولاجي المقدس (باسيليوس، غريغوريوس، كيرلس)' },
      { href: '/orthodox/agpeya', label: 'كتاب الأجبية — ساعات الصلاة السبع' },
      { href: '/orthodox/synaxarium', label: 'السنكسار القبطي — سير القديسين' },
      { href: '/orthodox/katameros', label: 'القطمارس — القراءات الليتورجية اليومية' },
      { href: '/orthodox/deacon', label: 'مردات الشماس' },
      { href: '/orthodox/hymns', label: 'الألحان القبطية والإبصلمودية' },
      { href: '/orthodox/saints', label: 'سير القديسين والشهداء الأقباط' },
      { href: '/orthodox/creed', label: 'العقيدة القبطية الأرثوذكسية' },
      { href: '/orthodox/history', label: 'تاريخ الكنيسة القبطية' },
      { href: '/orthodox/books', label: 'كتب الآباء القبطية' },
      { href: '/orthodox/qa', label: 'أسئلة وأجوبة لاهوتية' },
      { href: '/orthodox/figures', label: 'شخصيات الكنيسة القبطية' },
      { href: '/orthodox/apocrypha', label: 'الأسفار القانونية الثانية' },
      { href: '/orthodox/tafseer', label: 'تفاسير الآباء الأقباط' },
      { href: '/orthodox/maps', label: 'خرائط الكتاب المقدس التاريخية' },
      { href: '/orthodox/pope-qa', label: 'أسئلة البابا شنودة الثالث' },
    ],
  },
  {
    title: 'القداس والخولاجي',
    links: [
      { href: '/kholagy', label: 'صفحة الخولاجي التفاعلية' },
    ],
  },
  {
    title: 'للأطفال والعائلة',
    links: [
      { href: '/kids', label: 'قصص الكتاب المقدس للأطفال' },
    ],
  },
  {
    title: 'الكنائس',
    links: [
      { href: '/church', label: 'دليل الكنائس القبطية الأرثوذكسية' },
    ],
  },
  {
    title: 'أدوات روحية',
    links: [
      { href: '/challenge', label: 'تحدي قراءة الكتاب المقدس' },
      { href: '/premium', label: 'اشتراك بريميوم' },
    ],
  },
  {
    title: 'عن الموقع',
    links: [
      { href: '/about', label: 'عن رفيقي' },
      { href: '/contact', label: 'اتصل بنا' },
      { href: '/privacy', label: 'سياسة الخصوصية' },
      { href: '/terms', label: 'شروط الاستخدام' },
    ],
  },
];

export default function Sitemap() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl" dir="rtl">
      <SEOHead dynamicSEO={sitemapSEO} />
      <h1 className="text-2xl font-bold mb-8 text-foreground">خريطة الموقع</h1>
      <div className="space-y-8">
        {sections.map(section => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold mb-3 text-primary border-b pb-2">{section.title}</h2>
            <ul className="space-y-2 pr-2">
              {section.links.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-foreground/80 hover:text-primary hover:underline transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
