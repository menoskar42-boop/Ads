'use strict';

// One-time catalog seed for Deals. Product titles/descriptions are editorial
// summaries; prices and Bestseller ranks are observations from Amazon.eg and
// must be refreshed before being presented as current.

const { pool, initDealsDb } = require('../deals/db');

const AMAZON_TAG = 'oscardevs-21';
const CHECKED_AT = '2026-08-30T00:00:00.000Z';

const products = [
  {
    asin: 'B0DH8LFHP7',
    rank: 1,
    category: 'everyday-tech',
    title: 'كابل Anker USB-C إلى USB-A بطول 1.8 متر',
    brand: 'Anker',
    price: 150,
    short: 'كابل شحن ونقل بيانات مضفّر ومتوافق مع أجهزة Android وSamsung وiPhone الحديثة.',
    full: 'اختيار عملي للاستخدام اليومي والشحن ونقل البيانات. راجع توافق المنفذ وسرعة الشحن مع جهازك قبل الشراء. السعر المرصود وترتيب Bestseller يتغيران حسب عروض Amazon.',
  },
  {
    asin: 'B0CCSHR1DF',
    rank: 2,
    category: 'everyday-tech',
    title: 'كابل Joyroom USB-C إلى USB-C بقدرة 60 واط',
    brand: 'Joyroom',
    price: 65.55,
    short: 'كابل Type-C إلى Type-C يدعم الشحن السريع ونقل البيانات بطول متر.',
    full: 'مناسب للأجهزة التي تستخدم USB-C مثل الهواتف والأجهزة اللوحية وبعض أجهزة الكمبيوتر. تحقق من قدرة الشاحن والجهاز قبل الاعتماد على سرعة الشحن القصوى.',
  },
  {
    asin: 'B09Y37BSM9',
    rank: 3,
    category: 'everyday-tech',
    title: 'محول مقابس السفر iLOCK',
    brand: 'iLOCK',
    price: 56,
    short: 'محول مقابس صغير للسفر والاستخدام مع أنواع مختلفة من المقابس.',
    full: 'حل بسيط للمسافرين أو للاستخدام في أماكن تختلف فيها مواصفات المقابس. المحول لا يحوّل الجهد الكهربائي؛ افحص توافق الجهد قبل توصيل أي جهاز.',
  },
  {
    asin: 'B09C7BWVX7',
    rank: 4,
    category: 'everyday-tech',
    title: 'كابل LDNIO LS441 Lightning بطول متر',
    brand: 'LDNIO',
    price: 53.20,
    short: 'كابل Lightning للشحن ونقل البيانات بطول متر.',
    full: 'خيار منخفض التكلفة لمن يحتاج كابل Lightning إضافيًا. تحقق من توافقه مع جهازك ومن تفاصيل الشحن والضمان على صفحة Amazon.',
  },
  {
    asin: 'B0DRDPSKQH',
    rank: 5,
    category: 'daily-essentials',
    title: 'بطاريات Camelion AAA زنك-كربون — عبوة 12',
    brand: 'Camelion',
    price: 93.52,
    short: 'عبوة بطاريات AAA للاستخدامات المنزلية والأجهزة منخفضة الاستهلاك.',
    full: 'مناسبة لأجهزة التحكم والساعات وبعض الأدوات المنزلية. راجع نوع البطارية المطلوب لجهازك ولا تستخدم بطاريات مختلفة معًا.',
  },
  {
    asin: 'B0D22RLPP3',
    rank: 6,
    category: 'everyday-tech',
    title: 'سماعات Soundcore K20i اللاسلكية',
    brand: 'Soundcore',
    price: 619,
    short: 'سماعات Bluetooth بوقت تشغيل طويل وميكروفونين للمكالمات.',
    full: 'خيار للاستخدام اليومي والاستماع والمكالمات، مع تطبيق وتحكم في الصوت حسب وصف المنتج. راجع تفاصيل الضمان والتوافق قبل الشراء.',
  },
  {
    asin: 'B07MMFCTCX',
    rank: 1,
    category: 'personal-care',
    title: 'ماء تنظيف الوجه Garnier SkinActive Micellar — 100 مل',
    brand: 'Garnier',
    price: 80.50,
    short: 'ماء ميسيلار للاستخدام اليومي في تنظيف البشرة وإزالة آثار المكياج.',
    full: 'منتج عناية شخصية صغير وسهل الحمل. راجع المكونات والتحذيرات ونوع البشرة المناسب قبل الاستخدام، وتأكد من العبوة والتوافر عند فتح Amazon.',
  },
  {
    asin: 'B099GGJW15',
    rank: 2,
    category: 'personal-care',
    title: 'صابون Dosh الكلاسيكي — عبوة 4 قطع',
    brand: 'Dosh',
    price: 51.30,
    short: 'عبوة صابون للاستخدام اليومي، وقد يختلف اللون أو العطر حسب المتاح.',
    full: 'اختيار أساسي منخفض التكلفة للاستخدام اليومي. راجع الرائحة والمكونات وتفاصيل العبوة قبل إتمام الشراء.',
  },
  {
    asin: 'B07LBQQ6P4',
    rank: 3,
    category: 'personal-care',
    title: 'غسول الوجه Garnier Skin Naturals Light — 50 مل',
    brand: 'Garnier',
    price: 52.18,
    short: 'غسول وجه بحجم صغير مناسب للتجربة أو الحمل أثناء السفر.',
    full: 'منتج عناية يومية بحجم صغير. راجع المكونات ونوع البشرة وتفاصيل العبوة التي قد تختلف قبل الشراء.',
  },
  {
    asin: 'B08WJL45KJ',
    rank: 6,
    category: 'personal-care',
    title: 'صابون Five Fives بحمض الساليسيليك — 50 جم',
    brand: 'Five Fives',
    price: 28.35,
    short: 'صابون صغير للعناية بالبشرة، بمكوّن حمض الساليسيليك حسب وصف المنتج.',
    full: 'راجع المكونات وطريقة الاستخدام واختبر ملاءمة المنتج لبشرتك قبل الاستخدام المنتظم. السعر المرصود قابل للتغير.',
  },
  {
    asin: 'B091MDSKTQ',
    rank: 1,
    category: 'home-picks',
    title: 'أغطية حفظ الطعام المرنة — عبوة 100 غطاء',
    brand: 'Generic',
    price: 16.91,
    short: 'أغطية قابلة لإعادة الاستخدام لتغطية الأطباق والأوعية وأواني الطبخ.',
    full: 'أداة منزلية بسيطة للمساعدة في حفظ الطعام وتغطية الأوعية بأحجام مختلفة. راجع المقاسات والخامة والتفاصيل النهائية في Amazon.',
  },
  {
    asin: 'B0C6FKFHVB',
    rank: 2,
    category: 'home-picks',
    title: 'فوط تنظيف من الألياف الدقيقة LeRoy — عبوة 20',
    brand: 'LeRoy',
    price: 54.29,
    short: 'فوط متعددة الألوان سريعة الجفاف وامتصاصها جيد للتنظيف اليومي.',
    full: 'مناسبة لتنظيف الأسطح والأعمال المنزلية اليومية. راجع الأبعاد والخامة وتفاصيل الغسيل قبل الشراء.',
  },
  {
    asin: 'B08BLJ473G',
    rank: 3,
    category: 'home-picks',
    title: 'مضرب حليب Portal قابل لإعادة الشحن',
    brand: 'Portal',
    price: 116,
    short: 'مضرب حليب محمول بثلاث سرعات للاستخدام مع القهوة والمشروبات.',
    full: 'خيار عملي لتحضير رغوة الحليب والمشروبات المنزلية، مع استخدامات خفيفة أخرى. راجع الملحقات وطريقة الشحن قبل الطلب.',
  },
  {
    asin: 'B0G229JVYV',
    rank: 4,
    category: 'home-picks',
    title: 'معطر Glade متعدد الاستخدامات — 480 مل',
    brand: 'Glade',
    price: 44.99,
    short: 'معطر منزلي برائحة شرقية للاستخدام في المساحات المنزلية.',
    full: 'منتج للاستخدام المنزلي اليومي. راجع تعليمات الاستخدام والتحذيرات وتفاصيل الرائحة قبل الشراء.',
  },
  {
    asin: 'B08P5MP4YC',
    rank: 5,
    category: 'home-picks',
    title: 'ميزان مطبخ رقمي Portal حتى 10 كجم',
    brand: 'Portal',
    price: 110,
    short: 'ميزان مطبخ رقمي بشاشة LCD لوزن المكونات حتى 10 كجم.',
    full: 'مفيد لوزن مكونات الطبخ والخبز والتحضير اليومي. راجع دقة القياس ومصدر الطاقة والأبعاد في صفحة Amazon.',
  },
];

async function main() {
  await initDealsDb();
  await pool.query(`
    ALTER TABLE deals_catalog_products
      ADD COLUMN IF NOT EXISTS source_rank INTEGER,
      ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ
  `);

  const categories = await pool.query('SELECT id, slug FROM deals_categories WHERE slug = ANY($1::text[])', [
    [...new Set(products.map((p) => p.category))],
  ]);
  const categoryIds = Object.fromEntries(categories.rows.map((row) => [row.slug, row.id]));

  for (const product of products) {
    const amazonUrl = `https://www.amazon.eg/dp/${product.asin}`;
    const affiliateUrl = `${amazonUrl}?tag=${AMAZON_TAG}`;
    const slug = `amazon-${product.asin.toLowerCase()}`;
    await pool.query(
      `INSERT INTO deals_catalog_products
       (source, external_id, title, slug, short_description, full_description, brand, category_id,
        image_url, current_price, currency, original_price, amazon_product_url, affiliate_url,
        rating, review_count, availability, is_featured, is_published, source_rank, price_checked_at)
       VALUES ('MANUAL',$1,$2,$3,$4,$5,$6,$7,NULL,$8,'EGP',NULL,$9,$10,NULL,NULL,$11,$12,true,$13,$14)
       ON CONFLICT (slug) DO UPDATE SET
        external_id=EXCLUDED.external_id, title=EXCLUDED.title, short_description=EXCLUDED.short_description,
        full_description=EXCLUDED.full_description, brand=EXCLUDED.brand, category_id=EXCLUDED.category_id,
        current_price=EXCLUDED.current_price, currency=EXCLUDED.currency, amazon_product_url=EXCLUDED.amazon_product_url,
        affiliate_url=EXCLUDED.affiliate_url, availability=EXCLUDED.availability, is_featured=EXCLUDED.is_featured,
        is_published=EXCLUDED.is_published, source_rank=EXCLUDED.source_rank, price_checked_at=EXCLUDED.price_checked_at,
        updated_at=now()`,
      [
        product.asin,
        product.title,
        slug,
        product.short,
        product.full,
        product.brand,
        categoryIds[product.category] || null,
        product.price,
        amazonUrl,
        affiliateUrl,
        'تحقق من السعر والتوافر في Amazon',
        product.rank <= 3,
        product.rank,
        CHECKED_AT,
      ],
    );
  }

  console.log(`Seeded ${products.length} Amazon.eg products with affiliate tag ${AMAZON_TAG}.`);
}

main()
  .catch((error) => {
    console.error('[seed-deals-amazon]', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());