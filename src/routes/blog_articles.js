// Original Arabic articles for the OscarDevs blog. Each article's full body lives
// in its own EJS file under src/views/blog/articles/<slug>.ejs so the long prose
// stays out of the route layer.
const ARTICLES = [
  {
    slug: 'choose-domain-name',
    title: 'إزاي تختار اسم نطاق (Domain) مناسب لمشروعك',
    excerpt: 'دليل عملي لاختيار اسم نطاق بيبقى سهل التذكّر، مناسب للسوق العربي، وبيخدم علامتك التجارية على المدى الطويل — بدون أخطاء شائعة.',
    date: '2026-05-10',
    readMins: 6,
  },
  {
    slug: 'shop-vs-portfolio',
    title: 'الفرق بين المتجر الإلكتروني والبورتفوليو وأيهما يناسبك',
    excerpt: 'لو محتار بين موقع بورتفوليو يعرض أعمالك ومتجر إلكتروني يبيع منتجاتك، المقال ده هيوضّحلك الفرق الجوهري وإمتى تختار كل واحد.',
    date: '2026-05-14',
    readMins: 7,
  },
  {
    slug: 'seo-for-small-business',
    title: 'أهمية تحسين محرّكات البحث (SEO) للمشاريع الصغيرة',
    excerpt: 'دليل مبسّط للـSEO لأصحاب المشاريع الصغيرة — لماذا هو ضروري، وأهم 7 خطوات عملية تقدر تنفّذها بنفسك من غير ميزانية كبيرة.',
    date: '2026-05-18',
    readMins: 8,
  },
  {
    slug: 'launch-first-site',
    title: 'خطوات إطلاق موقعك الأول من الفكرة للتنفيذ',
    excerpt: 'خارطة طريق من 8 خطوات لأي صاحب مشروع عايز يطلق موقعه الأول — من تحديد الهدف لاختيار الاستضافة لإطلاق رسمي ناجح.',
    date: '2026-05-22',
    readMins: 9,
  },
];

const BY_SLUG = Object.fromEntries(ARTICLES.map(a => [a.slug, a]));

module.exports = { ARTICLES, BY_SLUG };
