 phase 13).
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id             SERIAL PRIMARY KEY,
        customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        label          TEXT,
        recipient_name TEXT,
        phone          TEXT,
        governorate    TEXT,
        city           TEXT,
        street         TEXT,
        apartment      TEXT,
        notes          TEXT,
        is_default     BOOLEAN NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_addresses ON customer_addresses (customer_id);
      -- Product Q&A (Amazon roadmap phase 17).
      CREATE TABLE IF NOT EXISTS product_questions (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        author_name TEXT,
        question    TEXT NOT NULL,
        answer      TEXT,
        answered_at TIMESTAMPTZ,
        is_approved BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_questions ON product_questions (product_id, is_approved);
      -- Loyalty points (Amazon roadmap phase 19).
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;
      -- معدّلات الولاء (البند ٩١). كانت متصلّبة في راوت الطلب: نقطة لكل
      -- جنيه و١٠٠ نقطة بجنيه — يعني كل تاجر على المنصّة بيدّي خصم ١٪ على كل
      -- بيعة من غير ما يختاره ولا يشوفه. الافتراضي هنا هو نفس الأرقام دي
      -- بالظبط، فمفيش متجر هيلاقي معدّله اتغيّر. التشغيل نفسه فاضل مكانه
      -- الوحيد (company_features.loyalty) — مفتاحين لنفس الحاجة معناه إن حد
      -- هيقفل واحد ويفتكر إنها اتقفلت.
      -- مكتبة الثيمات (البند ٩١). الثيم بيتطبّق **على خانات التاجر نفسها**،
      -- فالعمودين دول للذاكرة والخط بس: أنهي ثيم اتطبّق آخر مرة، وأنهي خط
      -- شغّال. مافيش هنا نسخة تانية من الألوان — نسختين معناها سؤال «مين
      -- بيكسب» وإجابته بتبقى مخفية عن اللي دفع فلوس عشان يتحكّم في شكل متجره.
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS shop_theme TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS shop_font TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS loyalty_earn_per NUMERIC(6,2) NOT NULL DEFAULT 1;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS loyalty_redeem_per INTEGER NOT NULL DEFAULT 100;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS loyalty_max_percent NUMERIC(5,2) NOT NULL DEFAULT 100;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0;
      -- Order status tracking (Amazon roadmap phase 15).
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cod';
      -- Marketing pixels + product feed (competitor phase 24).
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS fb_pixel_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS ga4_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
      /* موافقة الزائر على بيكسلات التاجر (البند ٨٩).
       *
       * 'off' افتراضياً — عشان سلوك المتاجر الشغّالة مايتغيّرش في الصمت.
       * 'ask' معناها بيكسلات التاجر مابتتحمّلش لحد ما الزائر يوافق.
       *
       * ⚠️ ده عن **بيكسلات التاجر بس**. إعلانات أدسنس بتاعتنا ليها آلية
       * موافقة خاصة بجوجل، وماينفعش نتلاعب بيها من هنا (خط أحمر). */
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS consent_mode TEXT NOT NULL DEFAULT 'off';
      /* توكن Conversion API بتاع ميتا — سرّ التاجر، مشفّر في الخزنة زي
       * مفاتيح بوابات الدفع، ومابيترجعش للفورم أبداً. */
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS fb_capi_token_enc TEXT;
      -- Store wallet / gift-card credit per customer (competitor phase 31).
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_used NUMERIC(10,2) NOT NULL DEFAULT 0;
      /* Two taps on "buy" = two orders, and the stock deducted twice.
       *
       * The cart is cleared AFTER the commit, so a second request that started
       * before the first finished still sees a full cart and places its own
       * order. A flag on the session does not fix it either: concurrent
       * requests each load their own copy of the session and the last write
       * wins — the race is exactly the case a session flag cannot see.
       *
       * So the checkout form carries a token minted when the page was rendered,
       * and the database refuses the second one. A constraint is the only thing
       * both requests are guaranteed to agree about.
       */
      /* Cancelling an order used to flip a status column and nothing else —
       * the wallet money, the redeemed points and the stock all stayed gone.
       * This marks an order whose effects have been undone, so a merchant
       * clicking cancel twice (or cancelled → pending → cancelled) refunds
       * once. See src/lib/order_reversal.js. */
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS idem_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idem
        ON orders (company_id, idem_token) WHERE idem_token IS NOT NULL;
      /* Every visit to the payment page used to register a BRAND NEW payment
       * intent at the gateway for the same order. Two live payment pages for
       * one basket, and the buyer's back button is enough to open the second.
       * The intent is now kept on the order and reused while it is still
       * valid; payment_attempt only moves when a genuinely new one is
       * needed, so the gateway's merchant_order_id stays unique per attempt. */
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_url TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_attempt INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_cents INTEGER;
      -- Abandoned checkout recovery (competitor phase 26). One live snapshot per
      -- customer+store; deleted on a completed order, so rows here = carts that
      -- reached checkout but never converted. Merchant sends a manual reminder.
      CREATE TABLE IF NOT EXISTS abandoned_carts (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        customer_name TEXT,
        customer_phone TEXT,
        items_summary TEXT,
        total         NUMERIC(10,2) NOT NULL DEFAULT 0,
        item_count    INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, customer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts ON abandoned_carts (company_id, updated_at DESC);
      -- Automatic cart recovery (backlog 80). The reminder's own state lives on
      -- the cart, so the claim that stops a double-send is one UPDATE on the
      -- row being sent — not a second table that can disagree with this one.
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_state    TEXT;
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_at       TIMESTAMPTZ;
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS reminder_error    TEXT;
      CREATE INDEX IF NOT EXISTS idx_abandoned_due ON abandoned_carts (reminder_state, updated_at);
      -- Off by default, like every other merchant feature: sending marketing
      -- from a shop's name is the shop's decision, never ours.
      CREATE TABLE IF NOT EXISTS cart_recovery_settings (
        company_id    INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        enabled       BOOLEAN NOT NULL DEFAULT false,
        delay_minutes INTEGER NOT NULL DEFAULT 60,
        cooldown_days INTEGER NOT NULL DEFAULT 7,
        max_attempts  INTEGER NOT NULL DEFAULT 2,
        subject       TEXT,
        body          TEXT,
        coupon_code   TEXT,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Store analytics (competitor phase 29): one row per storefront page view,
      -- with the referrer host bucketed to a traffic source. Fire-and-forget
      -- insert; used for visits/conversion/top-source dashboards.
      CREATE TABLE IF NOT EXISTS store_visits (
        id          BIGSERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL DEFAULT 'store',
        source      TEXT NOT NULL DEFAULT 'direct',
        visited_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_store_visits ON store_visits (company_id, visited_at DESC);
      -- Multi-currency display (competitor phase 33). Base currency stays
      -- companies.currency; these are display-only conversions. rate = how many
      -- units of this currency equal ONE base unit (display = base * rate).
      CREATE TABLE IF NOT EXISTS store_currencies (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        symbol      TEXT NOT NULL,
        rate        NUMERIC(14,6) NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        UNIQUE (company_id, code)
      );
      -- Recurring subscriptions (competitor phase 32). COD-style: a daily job
      -- creates the next order and advances next_renewal — no gateway needed.
      ALTER TABLE products ADD COLUMN IF NOT EXISTS subscribable BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_interval_days INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS subscriptions (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity      INTEGER NOT NULL DEFAULT 1,
        unit_price    NUMERIC(10,2) NOT NULL,
        interval_days INTEGER NOT NULL DEFAULT 30,
        -- active | paused (the product went away or is out of stock and the
        -- merchant has to decide) | cancelled
        status        TEXT NOT NULL DEFAULT 'active',
        next_renewal  DATE NOT NULL,
        ship_name     TEXT,
        ship_phone    TEXT,
        ship_address  TEXT,
        last_order_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_due ON subscriptions (status, next_renewal);
      CREATE TABLE IF NOT EXISTS gift_cards (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        amount      NUMERIC(10,2) NOT NULL,
        redeemed_by INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        redeemed_at TIMESTAMPTZ,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      );
      CREATE TABLE IF NOT EXISTS order_status_history (
        id         SERIAL PRIMARY KEY,
        order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status     TEXT NOT NULL,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_order_status_history ON order_status_history (order_id, created_at);
      -- Back-in-stock / price-drop alerts (Amazon roadmap phase 18).
      CREATE TABLE IF NOT EXISTS stock_notifications (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        email       TEXT NOT NULL,
        notify_on   TEXT NOT NULL DEFAULT 'back_in_stock',
        notified    BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_stock_notifications ON stock_notifications (product_id, notified);
      -- Return / refund requests (Amazon roadmap phase 20).
      CREATE TABLE IF NOT EXISTS return_requests (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        reason      TEXT,
        notes       TEXT,
        status      TEXT NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_return_requests ON return_requests (company_id, status);
      -- Product variants (Amazon roadmap phase 8): size/color/… with own stock + price delta.
      CREATE TABLE IF NOT EXISTS product_variants (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        attributes  JSONB NOT NULL DEFAULT '{}',
        sku         TEXT,
        price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 0,
        image_url   TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants (product_id, is_active);
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
      -- Deals / Deal of the Day (Amazon roadmap phase 10).
      CREATE TABLE IF NOT EXISTS deals (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        discount_pct SMALLINT NOT NULL CHECK (discount_pct BETWEEN 1 AND 90),
        ends_at      TIMESTAMPTZ,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_deals_company ON deals (company_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_deals_product ON deals (product_id, is_active);
      CREATE TABLE IF NOT EXISTS deals_products (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'AMAZON_API')),
        asin TEXT,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        short_description TEXT,
        full_description TEXT,
        brand TEXT,
        category TEXT,
        image_url TEXT,
        current_price NUMERIC(10,2),
        currency TEXT DEFAULT 'EGP',
        amazon_product_url TEXT,
        affiliate_url TEXT NOT NULL,
        rating NUMERIC(2,1),
        review_count INTEGER,
        availability TEXT,
        is_featured BOOLEAN NOT NULL DEFAULT false,
        is_published BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_deals_products_public
        ON deals_products (company_id, is_published, is_featured, created_at DESC);
      -- Coupons (Amazon roadmap phase 11).
      CREATE TABLE IF NOT EXISTS coupons (
        id               SERIAL PRIMARY KEY,
        company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code             TEXT NOT NULL,
        discount_type    TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
        discount_value   NUMERIC(10,2) NOT NULL DEFAULT 0,
        min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        max_uses         INTEGER,
        used_count       INTEGER NOT NULL DEFAULT 0,
        expires_at       TIMESTAMPTZ,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zone TEXT;
      -- Shipping zones by governorate (Amazon roadmap phase 12).
      CREATE TABLE IF NOT EXISTS shipping_zones (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        governorate    TEXT NOT NULL,
        cost           NUMERIC(10,2) NOT NULL DEFAULT 0,
        free_over      NUMERIC(10,2),
        eta_days       TEXT,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, governorate)
      );
      -- Courier integration per merchant (competitor phase 25). Each store enters
      -- its OWN provider + API key; the platform holds no shared courier account.
      -- 'manual' works with ANY courier today (merchant types the AWB per order).
      CREATE TABLE IF NOT EXISTS shipping_integrations (
        company_id  INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL DEFAULT 'none', -- none|manual|bosta
        api_key     TEXT,
        pickup_phone   TEXT,
        pickup_address TEXT,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_provider TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_tracking_url TEXT;
      -- Per-store feature flags (Amazon roadmap phase 21). Only overrides stored.
      CREATE TABLE IF NOT EXISTS company_features (
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        feature_key TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT true,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, feature_key)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_product_review_customer ON product_reviews (product_id, customer_id) WHERE customer_id IS NOT NULL;
      -- Search acceleration (Amazon roadmap phase 1): fast catalogue scans + name lookups.
      CREATE INDEX IF NOT EXISTS idx_products_company_active ON products (company_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (lower(name));
      CREATE INDEX IF NOT EXISTS idx_products_name_ar_lower ON products (lower(name_ar));
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_ar TEXT;
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_en TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS promo_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_headline TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_subtext TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_cta_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_phone TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_address TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_trust_bar BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_promo_bar BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_hero_cards BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_banners BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_categories BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_contact BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS color_accent TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_card1_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_card2_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_about BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_services BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_portfolio BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS profession TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS page_content JSONB;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service1_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service1_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service2_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service2_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service3_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service3_desc TEXT;
      /* الخدمات من ٤ لـ٦ (البند ٩٠).
       *
       * صفحة البورتفوليو العامة بتعرض **ستة** كروت خدمات من زمان، واللوحة
       * كانت بتعدّل تلاتة بس — يعني نص الخدمات على صفحة التاجر كان نص
       * الافتراضي بتاع المهنة، ومحدش يقدر يغيّره: كلام مش بتاعه معروض على
       * صفحته باسمه. */
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service4_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service4_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service5_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service5_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service6_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service6_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_text_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_btn_bg TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_btn_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_facebook TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_instagram TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_linkedin TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_twitter TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_tiktok TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_youtube TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_threads TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_website TEXT;
      ALTER TABLE banner_slides ADD COLUMN IF NOT EXISTS slot TEXT DEFAULT 'section';
    `);
    // Who opened, changed or deleted a patient's record. Three external
    // reviews asked for this separately (clinic, nutrition, radiology) — until
    // now the question had no answer at all, not a bad one.
    await client.query(require('./src/lib/audit').SCHEMA);
    await client.query(`
      -- Portfolio items were title + description + image, which answers "what
      -- does it look like" and nothing else. A prospect asks "who was the
      -- client, what was wrong, what did you do, what changed" — so an item can
      -- now carry a case study. Every column is nullable: an item with a title
      -- and a photo stays exactly as valid as it was.
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS image_alt TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS project_url TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS category TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS client_name TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS problem TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS solution TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS result TEXT;
      ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS before_image_url TEXT;
    `);

    // Demo catalog for the Delta showcase store (only seeded when it has no products,
    // so a real owner's products are never duplicated or overwritten).
    const deltaRes = await client.query("SELECT id, currency FROM companies WHERE slug = 'delta'");
    if (deltaRes.rows.length) {
      const deltaId = deltaRes.rows[0].id;
      if (!deltaRes.rows[0].currency) {
        await client.query('UPDATE companies SET currency = $1 WHERE id = $2', ['EGP', deltaId]);
      }
      const cnt = await client.query('SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1', [deltaId]);
      if (cnt.rows[0].n === 0) {
        const addCat = async (ar, en, idx) => (await client.query(
          'INSERT INTO product_categories (company_id, name, name_ar, name_en, order_index) VALUES ($1,$2,$2,$3,$4) RETURNING id',
          [deltaId, ar, en, idx]
        )).rows[0].id;
        const catPhones = await addCat('موبايلات', 'Mobiles', 0);
        const catComp = await addCat('لابتوبات وكمبيوترات', 'Laptops & PCs', 1);
        // Product images live under /public/products/<slug>.png — committed
        // to the repo so they're always available without depending on an
        // external CDN. Each one is rendered to match its product type.
        const img = (file) => '/products/' + file + '.jpg';
        const demo = [
          [catPhones, 'آيفون 15 برو ماكس 256GB', 'iPhone 15 Pro Max', 'هيكل تيتانيوم، شاشة 6.7 بوصة Super Retina XDR، شريحة A17 Pro، وكاميرا 48 ميجابكسل.', 84999, img('iphone-15-pro-max'), 12],
          [catPhones, 'سامسونج جالاكسي S24 ألترا', 'Samsung Galaxy S24 Ultra', 'شاشة 6.8 بوصة Dynamic AMOLED، قلم S Pen، كاميرا 200 ميجابكسل ومعالج Snapdragon 8 Gen 3.', 72999, img('galaxy-s24-ultra'), 9],
          [catPhones, 'جوجل بيكسل 8 برو', 'Google Pixel 8 Pro', 'أفضل كاميرا حوسبية، شريحة Tensor G3، وتحديثات أندرويد لمدة 7 سنوات.', 41999, img('pixel-8-pro'), 15],
          [catPhones, 'آيفون 14 128GB', 'iPhone 14', 'شاشة 6.1 بوصة، شريحة A15 Bionic، نظام كاميرا مزدوج وبطارية تدوم طوال اليوم.', 44999, img('iphone-14'), 20],
          [catPhones, 'شاومي ريدمي نوت 13 برو', 'Xiaomi Redmi Note 13 Pro', 'شاشة AMOLED 120Hz، كاميرا 200 ميجابكسل، وشحن سريع 67 واط بسعر اقتصادي.', 18999, img('xiaomi-note13'), 30],
          [catComp,   'ماك بوك برو 16 M3 Pro',     'MacBook Pro 16 M3 Pro', 'شريحة M3 Pro، شاشة Liquid Retina XDR، 18GB رام و512GB SSD لأصحاب الأعمال الاحترافية.', 149999, img('macbook-pro-16'), 6],
          [catComp,   'ماك بوك إير M2 13 بوصة',     'MacBook Air M2', 'تصميم نحيف بوزن 1.2 كجم، شريحة M2، وبطارية تدوم حتى 18 ساعة.', 64999, img('macbook-air'), 11],
          [catComp,   'لابتوب Dell XPS 15',         'Dell XPS 15', 'معالج Intel Core i7، شاشة 15.6 بوصة OLED، 16GB رام وكرت RTX 4050.', 89999, img('dell-xps-15'), 8],
          [catComp,   'لابتوب ASUS ROG Gaming',     'ASUS ROG Gaming Laptop', 'للألعاب الثقيلة: RTX 4070، شاشة 165Hz، ومعالج Ryzen 9 وتبريد متقدم.', 99999, img('asus-rog-gaming'), 7],
          [catComp,   'كمبيوتر مكتبي للألعاب RGB',   'RGB Gaming Desktop PC', 'تجميعة قوية: RTX 4070 Ti، 32GB رام، SSD 1TB، وإضاءة RGB كاملة.', 79999, img('rgb-gaming-pc'), 5],
        ];
        for (const [cat, nameAr, nameEn, descAr, price, image, stock] of demo) {
          await client.query(
            `INSERT INTO products (company_id, category_id, name, description, price, image_url, stock, is_active, name_ar, name_en, description_ar)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true,$3,$8,$4)`,
            [deltaId, cat, nameAr, descAr, price, image, stock, nameEn]
          );
        }
        console.log(`Delta demo catalog seeded (${demo.length} products).`);
      } else {
        // Existing installations may still hold the old loremflickr URLs.
        // Migrate them to the new local /products/<slug>.png files keyed
        // off the product's name_en so each picture matches its title.
        const updates = [
          ['iPhone 15 Pro Max', '/products/iphone-15-pro-max.jpg'],
          ['Samsung Galaxy S24 Ultra', '/products/galaxy-s24-ultra.jpg'],
          ['Google Pixel 8 Pro', '/products/pixel-8-pro.jpg'],
          ['iPhone 14', '/products/iphone-14.jpg'],
          ['Xiaomi Redmi Note 13 Pro', '/products/xiaomi-note13.jpg'],
          ['MacBook Pro 16 M3 Pro', '/products/macbook-pro-16.jpg'],
          ['MacBook Air M2', '/products/macbook-air.jpg'],
          ['Dell XPS 15', '/products/dell-xps-15.jpg'],
          ['ASUS ROG Gaming Laptop', '/products/asus-rog-gaming.jpg'],
          ['RGB Gaming Desktop PC', '/products/rgb-gaming-pc.jpg'],
        ];
        let touched = 0;
        for (const [nameEn, imgPath] of updates) {
          const r = await client.query(
            `UPDATE products SET image_url = $1
             WHERE company_id = $2 AND name_en = $3
               AND (image_url IS NULL OR image_url LIKE '%loremflickr%' OR image_url <> $1)`,
            [imgPath, deltaId, nameEn]
          );
          touched += r.rowCount || 0;
        }
        if (touched) console.log(`Delta product images updated to local set (${touched} rows).`);
      }
    }

    // Delta brand assets (logo + 3 hero banners) — committed under
    // public/. Apply once when the demo store has no logo / no section
    // banners yet so existing customised stores aren't overwritten.
    if (deltaRes.rows.length) {
      const deltaId = deltaRes.rows[0].id;
      // Logo
      await client.query(
        `UPDATE companies SET logo_url = $1
         WHERE id = $2 AND (logo_url IS NULL OR logo_url = '' OR logo_url LIKE 'https://loremflickr%')`,
        ['/uploads/delta-logo.png', deltaId]
      );
      // Banners — only seed if there aren't any 'section' banners yet
      // Drop the outdated banner set (delta-banner-1/2/3) so the refreshed
      // images apply, without touching any custom banners the store added.
      await client.query(
        "DELETE FROM banner_slides WHERE company_id = $1 AND slot = 'section' AND image_url LIKE '/banners/delta-banner-_.jpg'",
        [deltaId]
      );
      const hasSection = await client.query(
        "SELECT 1 FROM banner_slides WHERE company_id = $1 AND slot = 'section' LIMIT 1",
        [deltaId]
      );
      if (!hasSection.rows.length) {
        const banners = [
          ['/banners/delta-banner-phone.jpg', 'أحدث الموبايلات — iPhone | Samsung | Pixel'],
          ['/banners/delta-banner-laptop.jpg', 'أقوى اللابتوبات — MacBook | Dell | ASUS ROG'],
          ['/banners/delta-banner-pc.jpg', 'كمبيوترات الألعاب — أداء وحوش بإضاءة RGB'],
        ];
        for (let i = 0; i < banners.length; i++) {
          await client.query(
            `INSERT INTO banner_slides (company_id, image_url, target_url, caption, slot, order_index, is_active)
             VALUES ($1, $2, NULL, $3, 'section', $4, true)`,
            [deltaId, banners[i][0], banners[i][1], i]
          );
        }
        console.log(`Delta hero banners seeded (${banners.length}).`);
      }
    }

    // Ensure demo store-owner logins exist so each store can be managed from its
    // dashboard. SECURITY: these demo tenants are PUBLIC and linked from the
    // homepage, so they must never carry predictable passwords. Provide a
    // per-tenant secret (DEMO_DELTA_PASSWORD / DEMO_PETRA_PASSWORD) if you need
    // to log in; otherwise the account is rotated to a random, unknowable
    // password on every boot so the old seeded creds (delta123/petra123) can
    // never be used again.
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const demoOwners = [
      ['delta', 'delta@test.com', 'shop'],
      ['petra', 'petra@test.com', 'portfolio'],
    ];
    for (const [slug, email, pageType] of demoOwners) {
      const c = await client.query('SELECT id FROM companies WHERE slug = $1', [slug]);
      if (c.rows.length) {
        await client.query('UPDATE companies SET page_type = $1 WHERE id = $2', [pageType, c.rows[0].id]);
        const envPwd = process.env['DEMO_' + slug.toUpperCase() + '_PASSWORD'];
        const pwd = (envPwd && envPwd.length >= 8) ? envPwd : crypto.randomBytes(24).toString('hex');
        const hash = await bcrypt.hash(pwd, 10);
        await client.query(
          `INSERT INTO company_users (company_id, email, password_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
          [c.rows[0].id, email, hash]
        );
      }
    }

    // Demo CUSTOMER account for QA of the storefront customer area (wishlist,
    // points, wallet, addresses, order tracking). Same security stance as the
    // demo merchants: only created when DEMO_CUSTOMER_PASSWORD is explicitly set
    // (>=8 chars). Without it, no demo customer exists (customers self-register),
    // so there is never a hardcoded customer backdoor.
    const demoCustPwd = process.env.DEMO_CUSTOMER_PASSWORD || '';
    if (demoCustPwd.length >= 8) {
      const custHash = await bcrypt.hash(demoCustPwd, 10);
      await client.query(
        `INSERT INTO customers (email, password_hash, full_name, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        ['customer@demo.oscardevs.com', custHash, 'عميل تجريبي', '01000000000']
      );
    }

    // SECURITY: never bootstrap the super-admin from predictable hardcoded
    // defaults — that turned a missing secret into a full platform backdoor
    // (anyone could log in with the known default email/password). Only create
    // or rotate the admin when BOTH secrets are explicitly provided. If they're
    // missing, skip entirely (admin login stays disabled) and warn loudly.
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (adminEmail && adminPassword) {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await client.query(
        `INSERT INTO admins (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [adminEmail, adminHash]
      );
      /* نشلّ حساب الأدمن الافتراضي القديم — **مانمسحوش**.
       *
       * كان `DELETE FROM admins WHERE email='admin@oscardevs.com'`، وده كان
       * بيقع كل إقلاع بـ:
       *   update or delete on table "admins" violates foreign key
       * لأن `signup_applications.reviewer_id` بيشاور على `admins(id)`، فلو
       * الحساب القديم راجع أي طلب المسح ممنوع. والخطأ كان بيتلمّ في
       * `catch` كـ«DB init warning» — يعني **الحماية كانت فاشلة كل مرة
       * والحساب الافتراضي فاضل موجود في الإنتاج**.
       *
       * والمسح مكانش الحل الصح أصلاً: لو نجح كنا هنفقد سجل مين راجع أنهي
       * طلب. الحساب دلوقتي بياخد هاش عشوائي مالوش كلمة سر مقابلة، فمفيش
       * دخول بيه أبداً، وسجل المراجعات بيفضل سليم. */
      if (adminEmail !== 'admin@oscardevs.com') {
        const deadHash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
        const r = await client.query(
          'UPDATE admins SET password_hash = $1 WHERE email = $2 RETURNING id',
          [deadHash, 'admin@oscardevs.com']);
        if (r.rowCount) {
          console.warn('[SECURITY] حساب الأدمن الافتراضي القديم admin@oscardevs.com اتشلّ (الدخول بيه مقفول).');
        }
      }
    } else {
      console.warn('[SECURITY] ADMIN_EMAIL/ADMIN_PASSWORD not set — super-admin bootstrap skipped (no default account created). Set them as deployment secrets to enable admin login.');
    }

    console.log('Database tables ready.');
  } catch (err) {
    console.error('DB init warning:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Start immediately so Replit can detect the open port
const httpServer = http.createServer(app);
const sokroWss = new (require('ws').WebSocketServer)({ noServer: true });
sokroStream.attach(sokroWss);
httpServer.on('upgrade', (req, socket, head) => {
  const host = String(req.headers['x-tenant-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const pathname = new URL(req.url, 'http://internal').pathname;
  if (!host.startsWith('sokro.') || pathname !== '/api/calls/stream') return socket.destroy();
  const token = new URL(req.url, 'http://internal').searchParams.get('token');
  const claims = require('./sokro/auth').verify(String(token || ''));
  if (!claims || claims.purpose !== 'phone_stream' || !claims.sub || !claims.callId) return socket.destroy();
  sokroWss.handleUpgrade(req, socket, head, ws => sokroWss.emit('connection', ws, req, claims));
});
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Oscardevs Ads running on http://0.0.0.0:${PORT}`);
});

// ===== Co-hosted mybible: auto-launch on the same VM =====
// When MYBIBLE_UPSTREAM + MYBIBLE_DATABASE_URL are set and the built app exists,
// start mybible as a child process on its internal port, with ITS OWN database
// and session secret (passed explicitly so they don't collide with OscarDevs').
// The host gateway then proxies mybible.oscardevs.com to it. INERT otherwise, so
// the deploy's Run command can stay `node server.js` — no separate launcher.
const { launchCoHostedApp } = require('./src/lib/cohost_child');
const { setCoHostStatus } = require('./src/lib/cohost_status');
const {
  assertMyBibleCutoverSecrets,
  isMyBibleMaintenanceMode,
  resolveMyBibleDatabaseUrl,
} = require('./src/lib/mybible_database');
const mybibleMaintenanceMode = isMyBibleMaintenanceMode();
if (process.env.MYBIBLE_UPSTREAM && !mybibleMaintenanceMode) {
  assertMyBibleCutoverSecrets();
}
const mybibleDatabaseUrl = resolveMyBibleDatabaseUrl();

if (process.env.MYBIBLE_UPSTREAM && mybibleDatabaseUrl && !mybibleMaintenanceMode) {
  const mybibleDist = path.join(__dirname, 'mybible', 'dist', 'index.cjs');
  if (fs.existsSync(mybibleDist)) {
    const mbPort = process.env.MYBIBLE_PORT || '5001';
    // Shared secret for the internal daily-push trigger. mybible's
    // /api/push/trigger-daily rejects requests without it, so when the owner
    // hasn't set one we mint a random per-boot secret and hand it to the child —
    // the endpoint stays closed to the outside, but OscarDevs can always call it
    // with zero configuration.
    const mbCronSecret = process.env.MYBIBLE_CRON_SECRET
      || process.env.CRON_SECRET
      || require('crypto').randomBytes(24).toString('hex');
    const mybibleEnv = Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: mbPort,
      // mybible MUST use its own DB + secret (keeps the members logged in):
      DATABASE_URL: mybibleDatabaseUrl,
      SESSION_SECRET: process.env.MYBIBLE_SESSION_SECRET || process.env.SESSION_SECRET,
      // mybible MUST use its OWN VAPID keys so the members' existing push
      // subscriptions keep working. We deliberately do NOT fall back to
      // OscarDevs' VAPID — empty (push disabled) is safer than wrong keys
      // (which would silently fail to deliver to the 700 subscribers).
      VAPID_PUBLIC_KEY: process.env.MYBIBLE_VAPID_PUBLIC_KEY || '',
      VAPID_PRIVATE_KEY: process.env.MYBIBLE_VAPID_PRIVATE_KEY || '',
      VAPID_EMAIL: process.env.MYBIBLE_VAPID_EMAIL || '',
      CRON_SECRET: mbCronSecret,
    });

    // إعادة التشغيل والإيقاف النظيف اتنقلوا لـ`src/lib/cohost_child.js` عشان
    // التطبيق التاني المستضاف (Service Flow) ياخد **نفس** المنطق بدل نسخة
    // تانية منه تفرق عنه مع الوقت. السلوك زي ما كان بالظبط.
    launchCoHostedApp({
      name: 'mybible',
      dist: mybibleDist,
      cwd: path.join(__dirname, 'mybible'),
      env: mybibleEnv,
      onGaveUp: (n) => {
        for (const h of ['mybible.oscardevs.com', 'mybible2.oscardevs.com']) {
          setCoHostStatus(h, { app: 'الكتاب المقدس', state: 'gave-up', reason: n });
        }
      },
    });
    console.log('🕮 Co-hosted mybible launched on 127.0.0.1:' + mbPort);

    // ── Daily verse push: drive it from THIS (always-alive) process ──────────
    // mybible schedules its own 6 AM cron internally, but that timer dies with
    // the child — a crash/restart anywhere before 06:00 silently skips the day
    // (exactly what happened when Neon's idle-suspend killed it at 02:48).
    // NeuroPilot solves this with an external trigger; here the parent plays
    // that role: every 30 min inside the 06:00–07:59 Cairo window we POST to
    // mybible's trigger endpoint. Its `last_daily_notif_date` DB guard makes
    // repeat calls a no-op, so this can only ever add a missed send, never a
    // duplicate one.
    setInterval(() => {
      try {
        const h = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }));
        if (h !== 6 && h !== 7) return;
        const url = String(process.env.MYBIBLE_UPSTREAM).replace(/\/+$/, '') + '/api/push/trigger-daily';
        fetch(url, {
          method: 'POST',
          headers: { 'x-cron-secret': mbCronSecret, 'content-type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(20000),
        })
          .then((r) => r.ok
            ? console.log('[co-host] mybible daily push trigger ok')
            : console.error('[co-host] mybible daily push trigger failed, status', r.status))
          .catch((err) => console.error('[co-host] mybible daily push trigger error:', err.message));
      } catch (e) { /* never let the timer throw */ }
    }, 30 * 60 * 1000).unref();
  } else {
    console.warn('[co-host] MYBIBLE_UPSTREAM set but mybible/dist/index.cjs missing — build mybible first');
  }
} else if (process.env.MYBIBLE_UPSTREAM && mybibleMaintenanceMode) {
  console.warn('[co-host] MyBible maintenance mode enabled — child process not started');
}

// ===== Co-hosted Service Flow: auto-launch on the same VM =====
//
// Service Flow أداة تشغيل داخلية (سنترال الغنايم — الشركة المصرية
// للاتصالات). بتتستضاف بنفس نمط mybible: عملية مستقلة على بورت داخلي،
// والبوّاب بيوجّهلها النطاق اللي في `SERVICEFLOW_HOST`.
//
// **بقاعدتها هي.** `SERVICEFLOW_DATABASE_URL` إجباري — من غيره مابتقومش
// خالص بدل ما تقع على قاعدة أوسكار ديفز. ونفس الكلام على سرّ الجلسة:
// سرّ غلط معناه إن كل المستخدمين يتسجّل خروجهم.
//
// **فترة التجربة:** المالك عايز النشر القديم على ريبليت والنسخة دي
// يشتغلوا مع بعض على نفس القاعدة لحد ما يتأكد. المهام المجدولة لازم
// تفضل مع عملية واحدة بس — فالنسخة دي بتقوم بـ`SF_SCHEDULERS=off`
// افتراضياً. لما القديم يتقفل، شيل `SERVICEFLOW_SCHEDULERS=off` من
// الإعدادات (أو خلّيها `on`) عشان المهام تنتقل هنا.
//
// مطفي بالكامل من غير `SERVICEFLOW_UPSTREAM` — أوسكار ديفز زي ما هو.
if (process.env.SERVICEFLOW_UPSTREAM) {
  // ممكن يبقى أكتر من نطاق (مفصولين بفاصلة) — مثلاً النطاق العادى + لينك
  // ريبليت اللى ما بيعدّيش على Cloudflare. الحالة تتسجّل لكل واحد لوحده،
  // وإلا صفحة الـ٥٠٣ ما بتلاقيش سبب لأى منهم.
  // المفتاح الثابت معاهم: باب المسار شغّال على أى نطاق، فلازم يلاقى السبب.
  const sfHostList = parseHosts(process.env.SERVICEFLOW_HOST).concat([SERVICEFLOW_STATUS_KEY]);
  const sfDatabaseUrl = String(process.env.SERVICEFLOW_DATABASE_URL || '').trim();
  const sfDist = path.join(__dirname, 'serviceflow', 'dist', 'index.cjs');
  if (!sfDatabaseUrl) {
    console.error('[co-host] SERVICEFLOW_UPSTREAM متظبّط من غير SERVICEFLOW_DATABASE_URL — '
      + 'مش هنشغّلها. تشغيلها على قاعدة أوسكار ديفز أسوأ بكتير من إنها ما تشتغلش.');
    for (const h of sfHostList) setCoHostStatus(h, {
      app: 'Service Flow', state: 'missing-config', reason: 'SERVICEFLOW_DATABASE_URL',
    });
  } else {
    const sfPort = process.env.SERVICEFLOW_PORT || '5003';
    const sfEnv = Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: sfPort,
      DATABASE_URL: sfDatabaseUrl,
      SESSION_SECRET: process.env.SERVICEFLOW_SESSION_SECRET || process.env.SESSION_SECRET,
      // المهام المجدولة: مقفولة افتراضياً طول ما النشر القديم شغّال.
      SF_SCHEDULERS: process.env.SERVICEFLOW_SCHEDULERS || 'off',
    });
    const started = launchCoHostedApp({
      name: 'serviceflow',
      dist: sfDist,
      cwd: path.join(__dirname, 'serviceflow'),
      env: sfEnv,
      // لما نبطّل نحاول، صفحة الـ٥٠٢ تقول كده بدل «حاول تاني بعد لحظات».
      onGaveUp: (n) => { for (const h of sfHostList) setCoHostStatus(h, {
        app: 'Service Flow', state: 'gave-up', reason: n,
      }); },
    });
    for (const h of sfHostList) setCoHostStatus(h, started
      ? { app: 'Service Flow', state: 'running' }
      : { app: 'Service Flow', state: 'not-built' });
    if (started) {
      console.log('🛠️  Co-hosted Service Flow launched on 127.0.0.1:' + sfPort
        + ' (hosts: ' + sfHostList.join(', ') + ', schedulers: ' + sfEnv.SF_SCHEDULERS + ')');

      /* إعداد ناقص بيقفل أجزاء كاملة **في صمت**، والوحيد اللي هيلاحظ هو
       * المستخدم اللي بيدوّر على حاجة مش موجودة. فبنقولها في اللوج وقت
       * الإقلاع بدل ما تتكتشف بعد أسبوع. */
      if (sfEnv.MAINTENANCE_ENABLED !== 'true' && !sfEnv.MAINTENANCE_DATABASE_URL) {
        console.warn('[co-host] ⚠️ Service Flow: موقع الصيانة **مش هيتركّب** — '
          + 'محتاج MAINTENANCE_ENABLED=true (أو MAINTENANCE_DATABASE_URL).');
      }
      if (!sfEnv.SF_API_TOKEN) {
        console.warn('[co-host] ⚠️ Service Flow: SF_API_TOKEN مش متظبّط — '
          + 'الربط بين الصيانة وServiceFlow هيترفض، وفيه توكنات بديلة مكتوبة '
          + 'في الكود على جيت‌هب العام.');
      }
      if (!process.env.SERVICEFLOW_SESSION_SECRET) {
        console.warn('[co-host] ⚠️ Service Flow: SERVICEFLOW_SESSION_SECRET مش متظبّط — '
          + 'بيستخدم سرّ أوسكار ديفز، وكل مستخدمي Service Flow هيتسجّل خروجهم.');
      }
    }
  }
}

// ===== Co-hosted Deals affiliate app: auto-launch on the same VM =====
// Deals is a separate Express process. With no DEALS_UPSTREAM this block is
// inert and the existing OscarDevs application is unchanged.
if (process.env.DEALS_UPSTREAM) {
  const dealsEntry = path.join(__dirname, 'deals', 'app.js');
  if (fs.existsSync(dealsEntry)) {
    const dealsPort = process.env.DEALS_PORT || '5002';
    const dealsEnv = Object.assign({}, process.env, {
      NODE_ENV: process.env.NODE_ENV || 'production',
      PORT: dealsPort,
      DEALS_PORT: dealsPort,
      DEALS_PUBLIC_URL: process.env.DEALS_PUBLIC_URL || 'https://deals.oscardevs.com',
    });
    let dealsRestarts = 0;
    let dealsShuttingDown = false;
    let dealsChild = null;
    const launchDeals = () => {
      const startedAt = Date.now();
      dealsChild = require('child_process').spawn(process.execPath, [dealsEntry], {
        cwd: path.join(__dirname, 'deals'),
        stdio: 'inherit',
        env: dealsEnv,
      });
      dealsChild.on('exit', (code, signal) => {
        if (dealsShuttingDown) return;
        if (Date.now() - startedAt > 60000) dealsRestarts = 0;
        const delay = Math.min(30000, 1000 * Math.pow(2, dealsRestarts));
        dealsRestarts += 1;
        console.error(`[co-host] deals exited (code=${code} signal=${signal}) — restarting in ${delay}ms`);
        setTimeout(launchDeals, delay);
      });
      dealsChild.on('error', (err) => console.error('[co-host] deals spawn error:', err));
    };
    const shutdownDeals = () => {
      dealsShuttingDown = true;
      if (dealsChild) { try { dealsChild.kill(); } catch (_) {} }
    };
    process.once('SIGTERM', shutdownDeals);
    process.once('SIGINT', shutdownDeals);
    launchDeals();
    console.log('🛍️ Co-hosted Deals launched on 127.0.0.1:' + dealsPort);
  } else {
    console.warn('[co-host] DEALS_UPSTREAM set but deals/app.js is missing');
  }
}

// Run schema migration in background — does not block startup.
// After the core tables are ready, ensure the pharmacy module's tables and
// demo pharmacy exist (additive, idempotent — safe on every boot).
const { ensurePharmacySchema } = require('./src/pharmacy/schema');
const { ensureFoodSchema } = require('./src/food/schema');
const { ensureAccountingSchema } = require('./src/accounting/schema');
const { ensureKakeiboSchema } = require('./src/kakeibo/schema');
const { ensureClinicSchema } = require('./src/clinic/schema');
const { ensureGymSchema } = require('./src/gym/schema');
const { ensureRadiologySchema } = require('./src/radiology/schema');
const { ensureFurnitureSchema } = require('./src/furniture/schema');
const { ensureWorkshopSchema } = require('./src/workshop/schema');
const { ensureEinvoiceSchema } = require('./src/einvoice/schema');
const { ensureHallSchema } = require('./src/hall/schema');
const { ensureNurserySchema } = require('./src/nursery/schema');
const { ensureInstallmentsSchema } = require('./src/installments/schema');
const { ensureNutritionSchema } = require('./src/nutrition/schema');
const { ensureSokroSchema } = require('./sokro/schema');
const { syncMedicinesSafe } = require('./src/pharmacy/medicine_sync');
initDb()
  .then(() => ensurePharmacySchema())
  .then(() => ensureFoodSchema())
  .then(() => ensureAccountingSchema())
  .then(() => ensureKakeiboSchema())
  .then(() => ensureClinicSchema())
  .then(() => ensureGymSchema())
  .then(() => ensureRadiologySchema())
  .then(() => ensureFurnitureSchema())
  .then(() => ensureWorkshopSchema())
  .then(() => ensureEinvoiceSchema())
  .then(() => ensureHallSchema())
  .then(() => ensureNurserySchema())
  .then(() => ensureInstallmentsSchema())
  .then(() => ensureNutritionSchema())
  .then(() => ensureSokroSchema())
  // Auto-import the full Egyptian medicines catalog once the tables exist.
  // Runs in the background, is staleness-gated (won't re-download if fresh),
  // and can never crash boot. A daily timer keeps a long-running instance
  // up to date without anyone editing the code.
  .then(() => { syncMedicinesSafe(); })
  /* ── تبليغ IndexNow عند النشر اللي بيغيّر صفحات ────────────────────────
   *
   * بيانات Bing Webmaster الحقيقية أظهرت **صفر URL مرسلة خلال آخر اتناشر
   * ساعة**: التكامل موجود من زمان، ومحدّش بينده عليه غير رابط أدمن يدوي.
   *
   * ⚠️ **مش بيبعت مع كل إقلاع.** `submitOnce` بتخزّن بصمة قايمة العناوين
   * في قاعدة البيانات، فالإقلاع اللي القايمة فيه زي ما هي مابيبعتش خالص.
   * الإرسال بيحصل لما نشر يزوّد صفحة أو يشيلها — وده بالظبط اللي IndexNow
   * اتعملت عشانه.
   *
   * والفشل مابيوقّفش الإقلاع: البصمة مابتتسجّلش غير بعد نجاح، فالمحاولة
   * بتتعاد في الإقلاع الجاي لوحدها. */
  .then(async () => {
    const indexnow = require('./src/lib/indexnow');
    /* `pool` هنا كان بيتقرا من `const` جوّه `initDb()` — نطاق بلوك، فبرّه
     * الدالة هو `ReferenceError: pool is not defined`. والنتيجة إن الـ
     * `.catch` تحت كان بيبلعه كـ«DB init warning» في كل إقلاع، **وIndexNow
     * ما اتبعتش ولا مرة** — يعني كل نشر بيزوّد صفحة أو يشيلها ماكانش
     * بيتبلّغ لمحركات البحث أصلاً. `shared_pool` بيخلّي ده نفس الـpool
     * بتاع التطبيق مش واحد جديد. */
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const urls = langRoutes.publicUrls(process.env.SITE_ORIGIN || 'https://oscardevs.com');
    const r = await indexnow.submitOnce(pool, urls, 'public-pages');
    if (r.body === 'unchanged') console.log(`[IndexNow] ${urls.length} عنوان — ما اتغيّرش، مافيش إرسال`);
    else if (r.status >= 200 && r.status < 300) console.log(`[IndexNow] اتبعت ${urls.length} عنوان (${r.status})`);
    else if (r.status !== 0) console.warn('[IndexNow] الإرسال فشل:', r.status, r.body);
  })
  .catch(err => console.error('DB init warning:', err.message))
  .finally(() => {
    // Start backups only after additive schema work has finished, so pg_dump
    // does not compete with startup DDL for locks on the external database.
    adsBackup.startAdsBackupScheduler();
  });

setInterval(() => { syncMedicinesSafe(); }, 24 * 60 * 60 * 1000).unref();

// NeuroPilot push schema — run independently so it never depends on the
// pharmacy/food chain above completing on a fresh DB.
neuroPush.ensureSchema().catch((err) => console.error('[neuropilot push schema]', err.message));

// Back-in-stock notifier (phase 18) — check every 15 min for restocked products.
try {
  const stockNotifier = require('./src/lib/stock_notifier');
  setInterval(() => { stockNotifier.checkAndNotify().catch(() => {}); }, 15 * 60 * 1000).unref();
} catch (e) { /* optional */ }

// Kakeibo daily expense-logging reminders (best-effort; self-gated to evening +
// once/day per user). Checks hourly so long-running instances remind opted-in users.
try {
  const kkbPush = require('./src/kakeibo/push');
  setInterval(() => { kkbPush.dailyReminders().catch(() => {}); }, 60 * 60 * 1000).unref();
} catch (e) { /* push optional */ }

// NeuroPilot daily reminder — INTERNAL cron fallback. Fires at ~08:00 Cairo when
// the instance happens to be awake (dedup-guarded so it never double-sends). The
// RELIABLE path is the external trigger below (Replit Autoscale sleeps, so this
// internal timer won't run while the app is scaled to zero).
/* The hour is not a thing that happens once.
 *
 * This timer ticks every 30 minutes, so `h === 8` was true at 08:00 AND at
 * 08:30 — every gym owner got the same renewal alert twice each morning, and
 * so did every NeuroPilot user. An in-process flag would not have fixed it
 * either: Autoscale runs more than one instance, each with its own memory.
 *
 * The day is claimed in the database, so exactly one tick on exactly one
 * instance runs the job. See src/lib/once_daily.js. */
const onceDaily = require('./src/lib/once_daily');
setInterval(async () => {
  try {
    const h = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }));
    if (h !== 8) return;
    if (await onceDaily.claimToday(sessionPool, 'neuropilot_daily')) {
      neuroPush.sendDaily().catch(() => {});
    }
    if (await onceDaily.claimToday(sessionPool, 'gym_expiry_alerts')) {
      require('./src/lib/gym_alerts').runExpiryAlerts().catch(() => {}); // gym renewals
    }
    onceDaily.sweep(sessionPool).catch(() => {});
  } catch (e) { /* ignore */ }
}, 30 * 60 * 1000).unref();

// Clinic WhatsApp reminders. Hourly; the job itself only acts during the Cairo
// evening hour it sends in, and every send is deduped against
// clinic_whatsapp_log — so an extra tick can never double-message a patient.
const clinicReminders = require('./src/clinic/reminders');
// `pool` used to be referenced here bare, but no module-level pool exists in
// this file — it was a const inside initDb(). Every hourly tick therefore threw
// ReferenceError before reaching .catch(), the uncaughtException handler
// swallowed it, and clinic reminders silently never sent. With the shared-pool
// patch, this Pool is the same bounded pool the rest of the app uses.
const remindersPool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
setInterval(() => {
  clinicReminders.sendDueReminders(remindersPool).catch((e) => console.error('[reminders]', e.message));
}, 60 * 60 * 1000).unref();

// Subscriptions (phase 32): create due recurring orders. Runs hourly and is
// idempotent per day (each renewal advances next_renewal past today), so it
// self-heals whenever the instance is awake. Also exposed as an external
// trigger below for scale-to-zero hosting.
const subscriptions = require('./src/lib/subscriptions');
setInterval(() => { subscriptions.runDueRenewals().catch(() => {}); }, 60 * 60 * 1000).unref();
subscriptions.runDueRenewals().catch(() => {}); // once on boot

// Abandoned-cart reminders (backlog 80). Every 15 minutes, because the shortest
// delay a merchant may set is 15 — checking hourly would turn "remind after 15
// minutes" into "remind after up to an hour", which is not what the screen says.
//
// Running often is safe by construction: each cart is claimed with a
// compare-and-swap before its email leaves, so an extra tick — or a second
// instance — sends nothing twice. See src/shop/cart_recovery_job.js.
const cartRecoveryJob = require('./src/shop/cart_recovery_job');
const cartRecoveryPool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
setInterval(() => {
  cartRecoveryJob.runDue(cartRecoveryPool).catch((e) => console.error('[cart_recovery]', e.message));
}, 15 * 60 * 1000).unref();

