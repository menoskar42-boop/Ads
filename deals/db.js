'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DEALS_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DEALS_DATABASE_URL or DATABASE_URL is required');

const pool = new Pool({ connectionString });

async function initDealsDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deals_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      site_name TEXT NOT NULL DEFAULT 'Deals',
      site_description TEXT NOT NULL DEFAULT 'اختيارات شراء موصى بها',
      logo_url TEXT,
      theme_color TEXT NOT NULL DEFAULT '#0f766e',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO deals_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS deals_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deals_catalog_products (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (source IN ('MANUAL','AMAZON_API','ALIEXPRESS_API','ALIBABA_API','EBAY_API','NOON_API')),
      external_id TEXT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      short_description TEXT,
      full_description TEXT,
      brand TEXT,
      category_id INTEGER REFERENCES deals_categories(id) ON DELETE SET NULL,
      image_url TEXT,
      current_price NUMERIC(10,2),
      currency TEXT NOT NULL DEFAULT 'EGP',
      original_price NUMERIC(10,2),
      amazon_product_url TEXT,
      affiliate_url TEXT NOT NULL,
      rating NUMERIC(2,1),
      review_count INTEGER,
      availability TEXT,
      is_featured BOOLEAN NOT NULL DEFAULT false,
      is_published BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_deals_catalog_public
      ON deals_catalog_products (is_published, is_featured, created_at DESC);
    ALTER TABLE deals_catalog_products
      ADD COLUMN IF NOT EXISTS source_rank INTEGER,
      ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS deals_articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT,
      body TEXT NOT NULL,
      cover_image_url TEXT,
      is_published BOOLEAN NOT NULL DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- مافيش جدول مستخدمين للإدارة هنا بقصد: الدخول بيتحقّق من
    -- DEALS_ADMIN_EMAIL/DEALS_ADMIN_PASSWORD فقط (deals/app.js). كان في جدول
    -- deals_admin_users فاضي ومالوش أي قارئ في الكود — جدول هاشات كلمات سر
    -- محدّش بيكتب فيه ولا بيقرا منه هو سطح هجوم مجاني، فاتشال. أي رجوع
    -- لمستخدمين متعدّدين لازم يجي مع كود دخول بيقرا من الجدول فعلاً.

    INSERT INTO deals_categories (name, slug, description)
    VALUES
      ('اختيارات المنزل', 'home-picks', 'أفكار عملية وأدوات منزلية نراجعها من زاوية الاستخدام والقيمة.'),
      ('التقنية اليومية', 'everyday-tech', 'أدوات تقنية للاستخدام اليومي مع نقاط مقارنة واضحة قبل الشراء.'),
      ('العناية الشخصية', 'personal-care', 'منتجات عناية شخصية يومية نختارها من قوائم Amazon الأكثر مبيعًا.'),
      ('أساسيات يومية', 'daily-essentials', 'احتياجات منزلية واستهلاكية عملية بأسعار بسيطة.')
    ON CONFLICT (slug) DO NOTHING;

    INSERT INTO deals_articles (title, slug, excerpt, body, is_published, published_at)
    VALUES
      (
        'كيف تقارن أي منتج قبل الشراء؟',
        'how-to-compare-products',
        'إطار عملي من خمس نقاط يساعدك على المقارنة بعيدًا عن السعر وحده.',
        'ابدأ بتحديد الاستخدام الأساسي والنتيجة التي تريدها من المنتج. بعد ذلك قارن المواصفات التي تؤثر فعلًا في هذا الاستخدام، ثم راجع الحجم والضمان والتوافر والتكلفة النهائية.\\n\\nلا تجعل التقييمات أو السعر وحدهما سبب القرار؛ فالأفضل هو المنتج الذي يناسب احتياجك بوضوح ويظل متاحًا من متجر موثوق. الأسعار والتوافر قد يتغيران، لذلك راجع التفاصيل النهائية في المتجر الخارجي قبل الشراء.',
        true,
        now()
      ),
      (
        'دليل سريع لاختيار أداة تقنية للاستخدام اليومي',
        'everyday-tech-buying-guide',
        'أسئلة قصيرة تساعدك على اختيار أداة تقنية مناسبة بدون دفع مقابل مواصفات لن تستخدمها.',
        'حدّد أولًا مكان استخدام الأداة ومدة الاستخدام اليومية. ثم اسأل: هل الأولوية للسرعة أم البطارية أم سهولة الحمل؟ بعد ذلك قارن التوافق مع أجهزتك الحالية، وسهولة الصيانة، وسياسة الإرجاع لدى المتجر الخارجي.\\n\\nاكتب ثلاثة شروط لا يمكن التنازل عنها قبل فتح صفحات المنتجات. هذه الخطوة تقلل المقارنة العشوائية وتساعدك على اكتشاف القيمة الحقيقية لكل اختيار.',
        true,
        now()
      )
    ON CONFLICT (slug) DO NOTHING;
  `);
}

module.exports = { pool, initDealsDb };