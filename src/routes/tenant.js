const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const payVault = require('../lib/pay_vault');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');
const { getPreset } = require('../lib/portfolio_presets');
const { isDemoSlug } = require('../lib/demo_mode');
const booking = require('../clinic/booking');
const money = require('../lib/money');
const stock = require('../pharmacy/stock');
const foodOptions = require('../food/options');
const foodIngredients = require('../food/ingredients');
const foodDelivery = require('../food/delivery');
const tenantWords = require('../lib/tenant_words');
const gymBookings = require('../gym/bookings');
const push = require('../lib/push');
const shopFeatures = require('../lib/shop_features');
const deals = require('../lib/deals');
const aiAssistant = require('../lib/ai_order_assistant');
const aiReplyCache = require('../lib/ai_reply_cache');
const { loadPaymentMethods } = require('../lib/payment_methods');
const { createGatewayPayment, loadPaySettings, gatewayReady } = require('../lib/gateways');
const paymob = require('../lib/gateways/paymob');
const { getEnabledModules } = require('../clinic/modules');
const { sendWhatsApp, renderTemplate } = require('../lib/whatsapp');
const { rateLimit: _rl, clientIp, clientIp: _cip } = require('../middleware/rateLimit');
const uploads = require('../lib/uploads');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEFAULT_CONFIRM_TPL = 'مرحباً {name}، تم استلام حجزك في {clinic}{doctor}. سنؤكّد الموعد قريباً. شكراً لك.';

const workshopBookLimiter = _rl({
  name: 'workshop-public-booking',
  windowMs: 10 * 60 * 1000,
  max: 8,
  keyFn: (req) => ((req.tenant && req.tenant.id) || 'workshop') + '|' + _cip(req),
});

const workshopUploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(workshopUploadDir)) fs.mkdirSync(workshopUploadDir, { recursive: true });
const workshopPhotoUpload = uploads.guard(multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, workshopUploadDir),
    filename: (req, file, cb) => cb(null,
      `workshop-book-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${uploads.extname(file, '.bin')}`),
  }),
  limits: { files: 3, fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.mimetype)),
}).array('issue_photos', 3), 'image');

function workshopPhone(value) {
  const phone = String(value == null ? '' : value).replace(/[^\d+]/g, '').slice(0, 30);
  return phone.length >= 7 ? phone : '';
}

function cleanupWorkshopUploads(files) {
  (files || []).forEach((file) => { if (file && file.path) { try { fs.unlinkSync(file.path); } catch (_) {} } });
}

function localDateTimeValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function workshopHours(hours) {
  const match = String(hours || '').match(/(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|إلى|الى|حتى)\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return { start: 9 * 60, end: 17 * 60 };
  const start = Math.min(1439, Number(match[1]) * 60 + Number(match[2] || 0));
  const end = Math.min(1439, Number(match[3]) * 60 + Number(match[4] || 0));
  return end > start ? { start, end } : { start: 9 * 60, end: 17 * 60 };
}

async function workshopAvailableSlots(companyId, hours) {
  const occupied = (await pool.query(
    `SELECT starts_at, ends_at FROM workshop_appointments
      WHERE company_id=$1 AND starts_at >= now()
        AND starts_at < now() + interval '21 days'
        AND status IN ('booked','confirmed','arrived')`, [companyId]
  )).rows.map((row) => ({
    start: new Date(row.starts_at),
    end: row.ends_at ? new Date(row.ends_at) : new Date(new Date(row.starts_at).getTime() + 60 * 60 * 1000),
  }));
  const range = workshopHours(hours);
  const now = new Date(Date.now() + 30 * 60 * 1000);
  const slots = [];
  for (let day = 0; day < 21 && slots.length < 80; day += 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + day);
    for (let minutes = range.start; minutes < range.end && slots.length < 80; minutes += 60) {
      const slot = new Date(date);
      slot.setMinutes(minutes);
      if (slot < now) continue;
      const value = localDateTimeValue(slot);
      const slotEnd = new Date(slot.getTime() + 60 * 60 * 1000);
      if (occupied.some((booking) => slot < booking.end && slotEnd > booking.start)) continue;
      slots.push({
        value,
        label: slot.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })
          + ' — ' + slot.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      });
    }
  }
  return slots;
}

router.get('/book', async (req, res, next) => {
  if (!req.tenant || req.tenant.page_type !== 'workshop') return next();
  const settings = (await pool.query(
    'SELECT * FROM workshop_settings WHERE company_id=$1', [req.tenant.id]
  )).rows[0] || {};
  /* الصفحة بتفضل شغّالة وبتقول إن الحجز مقفول — مش ٤٠٤. الزائر اللي
   * جاي من جوجل أو من لينك مبعوت لازم يلاقي مواعيد الورشة وتليفونها،
   * مش صفحة مفقودة. والقفل الحقيقي على الـPOST. */
  const bookingIsOpen = await bookingOpen('workshop_settings', req.tenant.id);
  const slots = bookingIsOpen
    ? await workshopAvailableSlots(req.tenant.id, settings.hours)
    : [];
  res.render('workshop_public/book', {
    company: req.tenant, settings,
    slots,
    bookingOpen: bookingIsOpen,
    booked: req.query.booked === '1',
    error: ['invalid', 'closed', 'disabled'].includes(String(req.query.error || '')) ? req.query.error : null,
  });
});

router.post('/book', workshopBookLimiter, workshopPhotoUpload, async (req, res, next) => {
  if (!req.tenant || req.tenant.page_type !== 'workshop') return next();
  const b = req.body || {};
  const uploadedFiles = req.files || [];
  /* الزرار بيتسأل **على السيرفر**، قبل أي كتابة. إخفاء الفورم في القالب
   * لوحده مش قفل — أي حد يقدر يبعت POST من غير الصفحة. وبنمسح الصور
   * المرفوعة الأول عشان ورشة مقفولة ماتسيبش ملفات على الديسك. */
  if (!await bookingOpen('workshop_settings', req.tenant.id)) {
    cleanupWorkshopUploads(uploadedFiles);
    return res.redirect('/book?error=disabled');
  }
  const photoUrls = uploadedFiles.map((file) => `/uploads/${file.filename}`);
  // A hidden field catches the common no-JS bot without punishing a real
  // customer; rate limiting remains the backstop for repeated submissions.
  if (String(b.website || '').trim()) {
    cleanupWorkshopUploads(uploadedFiles);
    return res.redirect('/book?booked=0');
  }
  const name = String(b.name || '').trim().slice(0, 120);
  const phone = workshopPhone(b.phone);
  const plate = String(b.plate || '').trim().slice(0, 30);
  const starts = new Date(String(b.starts_at || ''));
  const concern = String(b.concern || '').trim().slice(0, 1000);
  if (!name || !phone || !plate || !concern || isNaN(starts)
      || starts < new Date(Date.now() + 30 * 60 * 1000)
      || starts > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)) {
    cleanupWorkshopUploads(uploadedFiles);
    return res.redirect('/book?error=invalid');
  }
  const settings = (await pool.query(
    'SELECT hours FROM workshop_settings WHERE company_id=$1', [req.tenant.id]
  )).rows[0] || {};
  const available = await workshopAvailableSlots(req.tenant.id, settings.hours);
  if (!available.some((slot) => slot.value === String(b.starts_at))) {
    cleanupWorkshopUploads(uploadedFiles);
    return res.redirect('/book?error=closed');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let customer = (await client.query(
      `SELECT id FROM workshop_customers
        WHERE company_id=$1 AND phone=$2 AND is_active
        ORDER BY id LIMIT 1 FOR UPDATE`, [req.tenant.id, phone])).rows[0];
    if (!customer) {
      customer = (await client.query(
        `INSERT INTO workshop_customers (company_id, name, phone, whatsapp)
         VALUES ($1,$2,$3,$3) RETURNING id`,
        [req.tenant.id, name, phone])).rows[0];
    } else {
      await client.query(
        `UPDATE workshop_customers SET name=$1, phone=$2
          WHERE id=$3 AND company_id=$4`, [name, phone, customer.id, req.tenant.id]
      );
    }
    const make = String(b.make || '').trim().slice(0, 60);
    const model = String(b.model || '').trim().slice(0, 60);
    const year = parseInt(b.model_year, 10);
    let vehicle = (await client.query(
      `SELECT id FROM workshop_vehicles
        WHERE company_id=$1 AND LOWER(plate)=LOWER($2)
        ORDER BY id LIMIT 1 FOR UPDATE`, [req.tenant.id, plate])).rows[0];
    if (!vehicle) {
      vehicle = (await client.query(
        `INSERT INTO workshop_vehicles (company_id, customer_id, plate, make, model, model_year)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [req.tenant.id, customer.id, plate, make || null, model || null,
         Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1 ? year : null])).rows[0];
    } else {
      await client.query(
        `UPDATE workshop_vehicles SET customer_id=$1, make=COALESCE(NULLIF($2,''),make),
                model=COALESCE(NULLIF($3,''),model)
          WHERE id=$4 AND company_id=$5`,
        [customer.id, make, model, vehicle.id, req.tenant.id]);
    }
    const appointment = await client.query(
      `INSERT INTO workshop_appointments
        (company_id, customer_id, vehicle_id, starts_at, status, service_type, concern, notes, source)
       VALUES ($1,$2,$3,$4,'booked',$5,$6,$7,'public')`,
      [req.tenant.id, customer.id, vehicle.id, starts,
       String(b.service_type || '').trim().slice(0, 120) || 'طلب صيانة',
       concern, String(b.notes || '').trim().slice(0, 500) || null]);
    for (const imageUrl of photoUrls) {
      await client.query(
        `INSERT INTO workshop_appointment_photos (company_id, appointment_id, image_url, caption)
         VALUES ($1,$2,$3,$4)`,
        [req.tenant.id, appointment.rows[0].id, imageUrl, 'صورة مرفقة مع طلب الحجز']
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    cleanupWorkshopUploads(uploadedFiles);
    console.error('[workshop public booking]', e.message);
    return res.redirect('/book?error=invalid');
  } finally { client.release(); }
  res.redirect('/book?booked=1');
});

// Fire-and-forget WhatsApp booking confirmation. Only sends if the clinic has
// the whatsapp module enabled, activated it, and turned on auto-confirm. Any
// failure is swallowed — booking must never depend on message delivery.
async function maybeSendBookingConfirm(company, name, phone, doctorId) {
  try {
    const mods = await getEnabledModules(pool, company.id);
    if (!mods.has('whatsapp')) return;
    const w = (await pool.query('SELECT * FROM clinic_whatsapp WHERE company_id=$1', [company.id])).rows[0];
    if (!w || !w.active || !w.auto_confirm) return;
    let doctorName = '';
    if (doctorId) {
      const d = (await pool.query('SELECT name FROM clinic_doctors WHERE id=$1 AND company_id=$2', [doctorId, company.id])).rows[0];
      if (d) doctorName = ' مع ' + d.name;
    }
    const msg = renderTemplate(w.confirm_template || DEFAULT_CONFIRM_TPL, {
      name, clinic: company.company_name, doctor: doctorName, time: '',
    });
    await sendWhatsApp(w, phone, msg);
  } catch (e) { console.error('[booking whatsapp]', e.message); }
}

// Load a merchant's paid AI subscription (or null). The site is free; the AI
// order assistant only runs for merchants with an active, unexpired sub that
// still has monthly quota left.
async function loadAiSub(companyId) {
  try {
    return (await pool.query('SELECT * FROM food_ai_subscriptions WHERE company_id = $1', [companyId])).rows[0] || null;
  } catch (e) { return null; }
}
// Active = status 'active', not past expiry, and quota not exhausted.
function aiSubActive(sub) {
  if (!sub || sub.status !== 'active') return false;
  if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) return false;
  return true;
}
function aiQuotaLeft(sub) {
  const quota = Number(sub.monthly_quota) || 0;
  const used = Number(sub.used_this_period) || 0;
  return quota > 0 && used < quota;
}
// Very light per-tenant+IP rate limit for the AI endpoint (cost guard).
const aiRate = new Map();
function aiRateOk(key, maxPerMin) {
  const now = Date.now();
  const arr = (aiRate.get(key) || []).filter((t) => now - t < 60000);
  if (arr.length >= maxPerMin) { aiRate.set(key, arr); return false; }
  arr.push(now); aiRate.set(key, arr);
  if (aiRate.size > 5000) aiRate.clear();
  return true;
}

// Guard for the public pharmacy order routes: tenant must be a pharmacy whose
// online store is enabled. Loads the settings row onto req.
async function pharmacyOrderGuard(req, res, next) {
  const company = req.tenant;
  if (!company || company.page_type !== 'pharmacy') {
    return res.status(404).render('404', { subdomain: company ? company.slug : null });
  }
  try {
    const s = (await pool.query('SELECT * FROM pharmacy_settings WHERE company_id = $1', [company.id])).rows[0] || {};
    if (!s.online_store_enabled) return res.redirect('/');
    req.pharmacySettings = s;
    next();
  } catch (e) { console.error('order guard error:', e.message); res.status(500).send('Error.'); }
}

// Per-tenant PWA manifest served at the subdomain root (slug.oscardevs.com/
// manifest.webmanifest) so each store/clinic/gym installs as its own app with
// its own icon + name. Uses the host-resolved tenant (req.tenant).
router.get('/manifest.webmanifest', (req, res) => {
  const c = req.tenant;
  if (!c) return res.status(404).json({ error: 'not found' });
  const icon = c.logo_url || '/logo.png';
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    name: c.company_name,
    short_name: String(c.company_name || 'App').slice(0, 12),
    description: c.description || c.company_name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: c.theme_color || '#1e3a8a',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      { src: icon, sizes: 'any',     type: 'image/png', purpose: 'any' },
      { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

router.get('/', async (req, res) => {
  const company = req.tenant;
  const ads = req.tenantAds || [];

  let portfolio = [];
  try {
    // is_hidden: a merchant taking a project down (client asked, work is dated)
    // without losing it. is_featured first, then the order they arranged.
    const portfolioResult = await pool.query(
      `SELECT * FROM portfolio_items
        WHERE company_id = $1 AND COALESCE(is_hidden, false) = false
        ORDER BY COALESCE(is_featured, false) DESC, order_index, created_at DESC`,
      [company.id]
    );
    portfolio = portfolioResult.rows;
  } catch (err) {
    console.error('Portfolio query error:', err.message);
  }

  let products = [];
  let categories = [];
  let activeProductCount = 0;
  let dealsProducts = [];
  let dealsProductCount = 0;
  let shopPriceRange = { min: 0, max: 0 };
  let shopFilters = { sort: '', min: '', max: '', instock: false };
  if (company.page_type === 'shop') {
    try {
      categories = (await pool.query(
        'SELECT * FROM product_categories WHERE company_id = $1 ORDER BY order_index, name',
        [company.id]
      )).rows;
      const filterCat = parseInt(req.query.category, 10);
      const q = (req.query.q || '').trim();
      const minP = parseFloat(req.query.min);
      const maxP = parseFloat(req.query.max);
      const inStockOnly = req.query.instock === '1';
      const params = [company.id];
      let where = 'company_id = $1 AND is_active = true';
      if (Number.isFinite(filterCat)) { where += ' AND category_id = $' + (params.push(filterCat)); }
      if (q) { where += ' AND (name ILIKE $' + (params.push('%' + q + '%')) + ' OR name_ar ILIKE $' + params.length + ' OR description ILIKE $' + params.length + ')'; }
      if (Number.isFinite(minP)) { where += ' AND price >= $' + params.push(minP); }
      if (Number.isFinite(maxP)) { where += ' AND price <= $' + params.push(maxP); }
      if (inStockOnly) { where += ' AND stock > 0'; }
      const minRating = parseInt(req.query.rating, 10);
      if (minRating >= 1 && minRating <= 5) { where += ' AND avg_rating >= $' + params.push(minRating); }
      // Sort options (Amazon roadmap phase 2): price/newest/best-selling.
      const sortMap = {
        price_asc: 'price ASC NULLS LAST', price_desc: 'price DESC NULLS LAST',
        newest: 'created_at DESC', best: 'sold_count DESC NULLS LAST, created_at DESC',
      };
      const orderBy = sortMap[req.query.sort] || 'created_at DESC';
      const productsResult = await pool.query(
        `SELECT * FROM products WHERE ${where} ORDER BY ${orderBy}`,
        params
      );
      products = productsResult.rows;
      // Total active catalogue size (independent of category/search filters)
      // drives the indexing quality gate below.
      activeProductCount = (await pool.query(
        'SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1 AND is_active = true',
        [company.id]
      )).rows[0].n;
      // Catalogue price bounds drive the price-filter slider (phase 2).
      const pr = (await pool.query(
        'SELECT COALESCE(MIN(price),0) AS mn, COALESCE(MAX(price),0) AS mx FROM products WHERE company_id = $1 AND is_active = true',
        [company.id]
      )).rows[0];
      shopPriceRange = { min: Math.floor(Number(pr.mn) || 0), max: Math.ceil(Number(pr.mx) || 0) };
      shopFilters = {
        sort: (req.query.sort || '').toString(),
        min: Number.isFinite(minP) ? minP : '',
        max: Number.isFinite(maxP) ? maxP : '',
        instock: inStockOnly,
      };
    } catch (err) { console.error('Products query error:', err.message); }
  }
  if (company.page_type === 'deals') {
    try {
      dealsProducts = (await pool.query(
        `SELECT * FROM deals_products
         WHERE company_id = $1 AND is_published = true
         ORDER BY is_featured DESC, created_at DESC`,
        [company.id]
      )).rows;
      dealsProductCount = dealsProducts.length;
    } catch (err) { console.error('Deals products query error:', err.message); }
  }

  // Pharmacy tenants load their live inventory (joined to the shared medicine
  // catalog) plus their settings. available_qty = qty - reserved so items held
  // for an online order don't read as sellable at the counter.
  let pharmacyItems = [];
  let pharmacySettings = null;
  let pharmacyStockCount = 0;
  if (company.page_type === 'pharmacy') {
    try {
      const q = (req.query.q || '').trim();
      const params = [company.id];
      let where = 'pi.company_id = $1';
      if (q) {
        where += ' AND (m.name_ar ILIKE $' + (params.push('%' + q + '%')) +
                 ' OR m.name_en ILIKE $' + params.length +
                 ' OR pi.barcode = $' + (params.push(q)) +
                 ' OR m.barcode = $' + params.length + ')';
      }
      pharmacyItems = (await pool.query(
        `SELECT pi.id, pi.medicine_id, pi.qty, pi.reserved_qty, pi.price, pi.expiry,
                pi.min_qty, pi.image_url, pi.description,
                GREATEST(pi.qty - pi.reserved_qty, 0) AS available_qty,
                m.name_ar, m.name_en, m.form, m.manufacturer, m.scientific_name
         FROM pharmacy_inventory pi
         JOIN medicines m ON m.id = pi.medicine_id
         WHERE ${where}
         ORDER BY m.name_ar`,
        params
      )).rows;
      pharmacyStockCount = (await pool.query(
        'SELECT COUNT(*)::int AS n FROM pharmacy_inventory WHERE company_id = $1',
        [company.id]
      )).rows[0].n;
      pharmacySettings = (await pool.query(
        'SELECT * FROM pharmacy_settings WHERE company_id = $1',
        [company.id]
      )).rows[0] || null;
    } catch (err) { console.error('Pharmacy query error:', err.message); }
  }

  // Orders tenant (restaurant / supermarket): load active outlets with their
  // categories + available items for the menu.
  let foodOutlets = [];
  let foodItemCount = 0;
  let aiAssistantOn = false;
  let foodUpsellOn = false;
  if (company.page_type === 'orders') {
    try {
      foodOutlets = (await pool.query(
        'SELECT * FROM food_outlets WHERE company_id = $1 AND is_active = true ORDER BY vertical', [company.id]
      )).rows;
      for (const o of foodOutlets) {
        o.categories = (await pool.query(
          'SELECT * FROM food_categories WHERE outlet_id = $1 ORDER BY sort_order, id', [o.id]
        )).rows;
        o.items = (await pool.query(
          'SELECT * FROM food_items WHERE outlet_id = $1 AND is_available = true ORDER BY sort_order, id', [o.id]
        )).rows;
        o.rating = (await pool.query(
          'SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*)::int AS n FROM food_reviews WHERE outlet_id = $1', [o.id]
        )).rows[0];
        // Modifier groups for this outlet's items, attached to the item they
        // belong to. One query per outlet rather than one per item.
        if (o.items.length) {
          const opts = (await pool.query(
            `SELECT op.id AS option_id, op.item_id, op.name AS group_name, op.required, op.min_select, op.max_select,
                    v.id AS value_id, v.name AS value_name, v.price_delta
               FROM food_item_options op
               LEFT JOIN food_item_option_values v ON v.option_id = op.id
              WHERE op.item_id = ANY($1)
              ORDER BY op.sort_order, op.id, v.sort_order, v.id`,
            [o.items.map((i) => i.id)]
          )).rows;
          const byItem = {};
          for (const r of opts) {
            const list = (byItem[r.item_id] = byItem[r.item_id] || []);
            let g = list.find((x) => x.id === r.option_id);
            if (!g) {
              g = { id: r.option_id, name: r.group_name, required: r.required === true,
                min: r.min_select, max: r.max_select, values: [] };
              list.push(g);
            }
            if (r.value_id) g.values.push({ id: r.value_id, name: r.value_name, delta: Number(r.price_delta) || 0 });
          }
          for (const it of o.items) it.options = byItem[it.id] || [];
        }
        // Delivery areas this branch charges by. A branch with none keeps its
        // single flat fee and the picker never appears.
        o.zones = (await pool.query(
          `SELECT id, name, fee, min_order, free_over, eta_min FROM food_zones
            WHERE company_id = $1 AND is_active = true AND (outlet_id IS NULL OR outlet_id = $2)
            ORDER BY name`, [company.id, o.id]
        )).rows;
        foodItemCount += o.items.length;
      }
      // Paid AI assistant: only surface the chat widget when the merchant has an
      // active, unexpired subscription with quota left (the site itself is free).
      const sub = await loadAiSub(company.id);
      aiAssistantOn = aiSubActive(sub) && aiQuotaLeft(sub);
      // Upsell suggestions ride the same subscription but don't burn message quota.
      foodUpsellOn = aiSubActive(sub) && sub.upsell_enabled !== false;
    } catch (err) { console.error('Food query error:', err.message); }
  }

  // Clinic tenant: load the clinic's doctors + settings. Each clinic is its own
  // page (no shared directory); its doctors each get a public /doctor/<slug> page.
  let clinicDoctors = [];
  let clinicSettings = null;
  let clinicSpecialtyLabel = '';
  if (company.page_type === 'clinic') {
    try {
      clinicDoctors = (await pool.query(
        'SELECT * FROM clinic_doctors WHERE company_id = $1 AND is_active = true ORDER BY sort_order, id',
        [company.id]
      )).rows;
      clinicSettings = (await pool.query(
        'SELECT * FROM clinic_settings WHERE company_id = $1', [company.id]
      )).rows[0] || null;
      // specialty is stored as a key. Printing it raw put "dentistry" in the
      // page title, the visible text and the MedicalClinic schema — resolve it
      // to a readable name in the visitor's language. Clinics that typed their
      // own specialty keep the text they typed.
      if (clinicSettings && clinicSettings.specialty) {
        clinicSpecialtyLabel = require('../clinic/specialties')
          .labelFor(clinicSettings.specialty, res.locals.t);
      }
    } catch (err) { console.error('Clinic query error:', err.message); }
  }

  let gymSettings = null, gymPlans = [], gymTrainers = [], gymClasses = [], gymGallery = [];
  if (company.page_type === 'gym') {
    try {
      gymSettings = (await pool.query('SELECT * FROM gym_settings WHERE company_id=$1', [company.id])).rows[0] || null;
      gymPlans = (await pool.query('SELECT * FROM gym_plans WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [company.id])).rows;
      gymTrainers = (await pool.query('SELECT * FROM gym_trainers WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [company.id])).rows;
      gymClasses = (await pool.query(
        `SELECT c.*, t.name AS trainer_name FROM gym_classes c
         LEFT JOIN gym_trainers t ON t.id=c.trainer_id
         WHERE c.company_id=$1 AND c.is_active=true ORDER BY c.day_of_week, c.sort_order, c.id`, [company.id])).rows;
      gymGallery = (await pool.query('SELECT url FROM gym_gallery WHERE company_id=$1 ORDER BY sort_order, id LIMIT 12', [company.id])).rows;
    } catch (err) { console.error('Gym query error:', err.message); }
  }

  let banners = [];
  try {
    banners = (await pool.query(
      'SELECT * FROM banner_slides WHERE company_id = $1 AND is_active = true ORDER BY order_index, created_at',
      [company.id]
    )).rows;
  } catch (bErr) { console.error('Banners query error:', bErr.message); }

  const cart = (req.session.carts && req.session.carts[company.slug]) || {};
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);

  // Payment methods the merchant chose to show (default: cash on delivery).
  let payment = null;
  if (['shop', 'pharmacy', 'orders'].includes(company.page_type)) {
    payment = await loadPaymentMethods(pool, company, res.locals.t);
  }

  // Store analytics (phase 29): log a storefront visit for shop tenants only.
  if (company.page_type === 'shop') {
    try { require('../lib/store_analytics').logVisit(company.id, 'store', req.get('referer'), req.hostname); }
    catch (e) { /* never block render */ }
  }

  // A furniture showroom's public page: who they are and what they make. The
  // catalogue is the point — a showroom page with no pieces on it is a business
  // card, and nobody drives across town for a business card.
  let furnitureSettings = null;
  let furnitureProducts = [];
  let furnitureBranches = [];
  if (company.page_type === 'furniture') {
    try {
      furnitureSettings = (await pool.query(
        'SELECT * FROM furniture_settings WHERE company_id = $1', [company.id]
      )).rows[0] || null;
      furnitureProducts = (await pool.query(
        `SELECT id, name, category, selling_price, notes, image_path,
                width_cm, depth_cm, height_cm, material, finish, warranty_months
           FROM furniture_products
          WHERE company_id = $1 AND is_active
          ORDER BY category NULLS LAST, name LIMIT 60`, [company.id]
      )).rows;
      // The options, priced. Read in one query for the whole page rather than
      // one per piece, and priced on the server: the card shows what the
      // showroom would actually charge, not base + delta added up in a browser.
      const FV = require('../furniture/variants');
      const vs = (await pool.query(
        `SELECT id, product_id, name, price_delta FROM furniture_product_variants
          WHERE company_id = $1 AND is_active ORDER BY id LIMIT 400`, [company.id]
      )).rows;
      // الفروع اللي الزبون يقدر يزورها فعلاً. المعرض والمخزن مش نفس الحاجة،
      // فالنوع بيتعرض معاها بدل ما كلهم يتقالوا «فرع».
      furnitureBranches = (await pool.query(
        `SELECT name, kind, address, phone FROM furniture_branches
          WHERE company_id = $1 AND is_active ORDER BY id LIMIT 12`, [company.id]
      )).rows;
      for (const p of furnitureProducts) {
        p.specs = FV.specLines(p);
        const mine = vs.filter((v) => Number(v.product_id) === Number(p.id));
        // The plain piece is dropped from the public list — the card already
        // shows its price. What is left are the alternatives, or nothing.
        p.options = FV.optionsFor(p, mine).filter((o) => o.id !== '');
      }
    } catch (e) { /* never block render */ }
  }

  // A nutrition practice's own public page: who they are, how to reach them,
  // and a booking request. Loaded the same way the clinic's is.
  let nutritionSettings = null;
  let nutritionDays = [];
  if (company.page_type === 'nutrition') {
    try {
      nutritionSettings = (await pool.query(
        'SELECT * FROM nutrition_settings WHERE company_id = $1', [company.id]
      )).rows[0] || null;
      // تقويم الحجز (البند ٨٤): الخانات بتتحسب من إعدادات العيادة ناقص اللي
      // اتحجز فعلاً — مفيش جدول خانات متخزّن يبات شغّال بعد ما المواعيد تتغيّر.
      const nb = require('../nutrition/booking');
      const cfg = nb.settingsFrom(nutritionSettings || {});
      if (cfg.enabled) {
        const taken = (await pool.query(
          `SELECT slot_at FROM nutrition_appointments
            WHERE company_id = $1 AND status <> 'cancelled'
              AND slot_at >= now() - interval '1 day'
              AND slot_at <= now() + interval '30 days'`, [company.id])).rows;
        nutritionDays = nb.daysAhead(cfg, taken);
      }
    } catch (e) { /* never block render */ }
  }

  // A workshop's public page: who they are, what they fix, and the one thing a
  // customer actually wants before driving over — can you take my car today.
  let workshopSettings = null;
  let workshopStats = null;
  if (company.page_type === 'workshop') {
    try {
      workshopSettings = (await pool.query(
        'SELECT * FROM workshop_settings WHERE company_id = $1', [company.id]
      )).rows[0] || null;
      const st = await pool.query(
        `SELECT (SELECT COUNT(*)::int FROM workshop_jobs WHERE company_id=$1 AND status='delivered') AS jobs_done,
                (SELECT COUNT(*)::int FROM workshop_vehicles WHERE company_id=$1) AS vehicles,
                (SELECT COUNT(*)::int FROM workshop_technicians WHERE company_id=$1 AND is_active) AS technicians`,
        [company.id]);
      workshopStats = st.rows[0] || null;
    } catch (e) { /* never block render */ }
  }

  // A hall's public page is an enquiry form with a building behind it, so the
  // packages load with it — the price is the question, and hiding it costs the
  // hall the families it could have served.
  let hallSettings = null;
  let hallPackages = [];
  if (company.page_type === 'hall') {
    try {
      hallSettings = (await pool.query(
        'SELECT * FROM hall_settings WHERE company_id = $1', [company.id])).rows[0] || null;
      hallPackages = (await pool.query(
        `SELECT id, name, description, base_price, price_per_head, includes
           FROM hall_packages WHERE company_id=$1 AND is_active
          ORDER BY sort_order, name LIMIT 12`, [company.id])).rows;
    } catch (e) { /* never block render */ }
  }

  // A nursery's public page is a trust page: a parent wants the ages, the hours,
  // the groups and who teaches them before they will type a phone number. So the
  // groups load with the page rather than sitting behind an enquiry.
  let nurserySettings = null;
  let nurseryGroups = [];
  if (company.page_type === 'nursery') {
    try {
      nurserySettings = (await pool.query(
        'SELECT * FROM nursery_settings WHERE company_id = $1', [company.id])).rows[0] || null;
      nurseryGroups = (await pool.query(
        `SELECT id, name, teacher, schedule, monthly_fee
           FROM nursery_groups WHERE company_id=$1 AND is_active
          ORDER BY sort_order, name LIMIT 12`, [company.id])).rows;
    } catch (e) { /* never block render */ }
  }

  // A قسّطلي shop's page is a plain explainer — its real product is the
  // statement link each customer already has, not this page.
  let instSettings = null;
  if (company.page_type === 'installments') {
    try {
      instSettings = (await pool.query(
        'SELECT * FROM inst_settings WHERE company_id = $1', [company.id])).rows[0] || null;
    } catch (e) { /* never block render */ }
  }

  let view;
  if (company.page_type === 'deals') view = 'tenant_deals';
  else if (company.page_type === 'shop') view = 'tenant_shop';
  else if (company.page_type === 'pharmacy') view = 'tenant_pharmacy';
  else if (company.page_type === 'orders') view = 'tenant_orders';
  else if (company.page_type === 'clinic') view = 'tenant_clinic';
  else if (company.page_type === 'nutrition') view = 'tenant_nutrition';
  else if (company.page_type === 'furniture') view = 'tenant_furniture';
  else if (company.page_type === 'workshop') view = 'tenant_workshop';
  else if (company.page_type === 'hall') view = 'tenant_hall';
  else if (company.page_type === 'nursery') view = 'tenant_nursery';
  else if (company.page_type === 'installments') view = 'tenant_installments';
  else if (company.page_type === 'gym') view = 'tenant_gym';
  else view = 'tenant_portfolio';

  // Indexing quality gate: keep thin tenant pages out of the index (and away
  // from AdSense review) until they hold real content, then let them in
  // automatically. noindex,follow so links are still crawled. A filtered or
  // search view is never the canonical page, so it's also kept out.
  const descLen = (company.description || '').trim().length;
  const hasFilter = Boolean((req.query.q || '').trim()) || Number.isFinite(parseInt(req.query.category, 10));
  let indexable;
  if (company.page_type === 'deals') indexable = dealsProductCount >= 3 && descLen >= 40;
  else if (company.page_type === 'shop') indexable = activeProductCount >= 3;
  // The demo pharmacy (slug 'pharmacy') is a sample, not a real business —
  // keep it out of the index; real customer pharmacies index once they have stock.
  else if (company.page_type === 'pharmacy') indexable = pharmacyStockCount >= 3;
  // Demo orders merchant (slug 'orders') stays out of the index like the demo pharmacy.
  else if (company.page_type === 'orders') indexable = foodItemCount >= 3;
  // A clinic indexes once it has a real doctor + a description; the demo clinic
  // (slug 'clinic') stays out of the index like the other demos.
  else if (company.page_type === 'clinic') indexable = clinicDoctors.length >= 1 && descLen >= 40;
  // A gym indexes once it has plans + a description; the demo gym (slug 'gym')
  // stays out of the index like the other demos.
  else if (company.page_type === 'gym') indexable = gymPlans.length >= 1 && descLen >= 40;
  // A furniture showroom has no public page yet — the back-office is phase 1 and
  // the storefront is not built. Without this it falls through to the generic
  // portfolio view below and, with a long enough description, indexes as a page
  // that shows none of what it claims: a thin/doorway page by any reading.
  // Was hard-coded false while there was no furniture view at all and the page
  // fell through to the generic portfolio template — a page showing none of
  // what it claimed. Now there is a real showroom page, so it earns the same
  // kind of gate as the others: enough pieces to be worth landing on.
  else if (company.page_type === 'furniture') {
    indexable = furnitureProducts.length >= 3;
  }
  // Same shape as the workshop's: a hall page is about the hall, and one that
  // says nothing has no business in the index.
  else if (company.page_type === 'hall') {
    const hAbout = hallSettings && hallSettings.about ? hallSettings.about.trim().length : 0;
    indexable = (descLen >= 40 || hAbout >= 60);
  }
  // Same gate again for a nursery: a parent landing from a search must find
  // something that answers "who are you", and a page that says nothing is thin
  // content whatever it is about.
  else if (company.page_type === 'nursery') {
    const nAbout = nurserySettings && nurserySettings.about ? nurserySettings.about.trim().length : 0;
    indexable = (descLen >= 40 || nAbout >= 60);
  }
  // Same gate again. The instalments page is thin by design, so it only earns
  // the index once the shop has actually said who it is and what it sells.
  else if (company.page_type === 'installments') {
    const iAbout = instSettings && instSettings.about ? instSettings.about.trim().length : 0;
    indexable = (descLen >= 40 || iAbout >= 60);
  }
  // A workshop has no catalogue to count, so the gate is the same as the
  // clinic's: does the page actually say anything? A page that cannot answer
  // why somebody clicked it has no business in the index.
  else if (company.page_type === 'workshop') {
    const wAbout = workshopSettings && workshopSettings.about ? workshopSettings.about.trim().length : 0;
    indexable = (descLen >= 40 || wAbout >= 60);
  }
  // Same gate as the clinic's: a practice page with no description and nothing
  // written about the practice shows a visitor nothing, and indexing it would
  // put a page in front of people that cannot answer why they clicked.
  else if (company.page_type === 'nutrition') {
    // البوابة دي كانت بتقيس بطول الحروف: ٤٠ حرف = ست كلمات، والصفحة كانت
    // بتتأرشف وهي ٩٦ كلمة — أقل من حد المشروع نفسه (١٢٠) اللي `seo-audit`
    // بيرفض تحته، ويعني صفحة رقيقة متأرشفة ضد حساب أدسنس.
    //
    // دلوقتي بتتقاس بكلام العيادة نفسه: النبذة **والخدمات** اللي الأخصائي
    // كتبها. اللي مايكتبش يفضل بره الفهرس لحد ما يكتب — ولما يكتب بيدخل
    // لوحده من غير ما حد يطلب.
    const nw = tenantWords.enough(
      [company.description, nutritionSettings && nutritionSettings.about,
        nutritionSettings && nutritionSettings.services], 0, 40);
    indexable = nw.ok;
  }
  else indexable = portfolio.length >= 2 || descLen >= 120;

  // بوابة الديمو الواحدة — تسري على **كل** الأنواع.
  //
  // كان كل نوع بيستثني الديمو بتاعه بالاسم (`slug !== 'clinic'`… إحدى عشر
  // مرة)، والنوعين الوحيدين اللي اتنسيوا هما اللي فيهم ديمو مليان فعلاً:
  // `shop` (petra و delta) و `portfolio`. النتيجة إن متجر ديمو بعشر منتجات
  // مخترعة بأسعارها كان **بيتأرشف وعليه إعلانات** — محتوى عيّنة معروض على
  // إنه متجر حقيقي، وده مخالفة لجوجل ولأدسنس مع بعض.
  //
  // `isDemoSlug` هي القايمة الوحيدة الصح (`src/lib/demo_mode.js`)، فبتتقرا
  // مرة هنا. أي ديمو جديد يتضاف هناك بيبقى مستثنى تلقائياً — مافيش سطر
  // ينتسي تاني.
  if (isDemoSlug(company.slug)) indexable = false;

  const noindex = !indexable || hasFilter;
  // AdSense: never show ads on genuinely thin pages (filtered views still have
  // real content, so only true thinness suppresses ads).
  if (!indexable) res.locals.showAds = false;
  // Pharmacy pages carry no ads at all for now (owner's decision to keep the
  // pharmacy vertical clear of AdSense while the account is under review).
  if (company.page_type === 'pharmacy') res.locals.showAds = false;
  // Medical (clinic) pages likewise carry NO ads — health content is sensitive
  // and we keep the clinic vertical clear of AdSense (owner's decision).
  if (company.page_type === 'clinic') res.locals.showAds = false;
  // A nutrition practice page carries none either: it is health-adjacent and
  // the whole vertical is deliberately ad-free.
  if (company.page_type === 'nutrition') res.locals.showAds = false;
  // Four more verticals join them, measured rather than guessed. Rendering each
  // template with a FULLY filled-in tenant (long description, six items, every
  // setting populated) and counting the words:
  //
  //     orders 101 · nursery 135 · hall 136 · workshop 149 · installments 159
  //
  // against the 250-word floor this repo uses for a monetised page. These are
  // not thin because the customer left them empty — they are as full as their
  // template gets, so the indexable gate above never fires and every one of
  // them served ads on ~100–160 words. That is rule #5 in
  // docs/SEO_MISTAKES_LOG.md, and the account it risks is the one CLAUDE.md
  // says not to break.
  //
  // Ads come back per vertical when its template carries enough content to
  // clear the floor; scripts/seo-audit-tenants.js is what says when.
  if (['orders', 'workshop', 'hall', 'nursery', 'installments'].includes(company.page_type)) {
    res.locals.showAds = false;
  }

  const preset = getPreset(company.profession);
  const pc = company.page_content || {};
  const pick = (k) => (Array.isArray(pc[k]) && pc[k].length ? pc[k] : preset[k]);
  const content = {
    stats: pick('stats'),
    testimonials: pick('testimonials'),
    process: pick('process'),
    faq: pick('faq'),
  };

  res.render(view, {
    company,
    noindex,
    preset,
    pageContent: pc,
    content,
    topAd:     ads.find(a => a.position === 'top')     || null,
    sidebarAd: ads.find(a => a.position === 'sidebar') || null,
    footerAd:  ads.find(a => a.position === 'footer')  || null,
    portfolio,
    // The portfolio template carries a full set of sample work — six invented
    // projects with stock photos, "480+ مشروع منجز", a 4.9 rating — that used
    // to render for ANY tenant with no items of their own. On a real business's
    // page that is not a placeholder, it is a fabricated track record: a
    // visitor sent the link reads six client names the merchant never worked
    // with. The samples now belong to the demo tenants only, and everyone else
    // gets the empty state (owner) or nothing at all (visitor).
    sampleContent: isDemoSlug(company.slug),
    isPageOwner: Boolean(req.session && req.session.companyId === company.id),
    products,
    dealsProducts,
    dealsProductCount,
    categories,
    banners,
    pharmacyItems,
    pharmacySettings,
    pharmacyStockCount,
    foodOutlets,
    foodItemCount,
    aiAssistantOn,
    foodUpsellOn,
    clinicDoctors,
    clinicSettings,
    clinicSpecialtyLabel,
    nutritionSettings,
    nutritionDays,
    furnitureSettings,
    workshopSettings,
    hallSettings,
    hallPackages,
    nurserySettings,
    nurseryGroups,
    instSettings,
    enquirySent: req.query.enquired === '1',
    workshopStats,
    furnitureProducts,
    furnitureBranches,
    gymSettings,
    gymPlans,
    gymTrainers,
    gymClasses,
    gymGallery,
    /* Codes the server knows, so the page cannot be made to say something the
       gym did not write. */
    gymBookedStatus: ['booked', 'waitlist'].includes(String(req.query.booked || '')) ? req.query.booked : null,
    gymBookError: ['1', 'dup', 'closed', 'members'].includes(String(req.query.bookerr || ''))
      ? (req.query.bookerr === '1' ? 'bad' : req.query.bookerr) : null,
    payment,
    currentCategory: req.query.category || '',
    currentSearch: req.query.q || '',
    shopPriceRange, shopFilters,
    feat: company.page_type === 'shop' ? await shopFeatures.getFeatures(company.id) : {},
    deals: company.page_type === 'shop' ? await deals.activeDealsMap(company.id) : {},
    storeCurrencies: company.page_type === 'shop'
      ? (await pool.query('SELECT code, symbol, rate FROM store_currencies WHERE company_id=$1 AND is_active=true ORDER BY sort_order, id', [company.id])).rows
      : [],
    cartCount,
    sent: req.query.sent === '1',
    /* A code the server knows, never text from the URL: this string is printed
       inside a red box on the clinic's own page under the clinic's own name. */
    contactError: ['1', 'taken', 'past', 'far', 'closed'].includes(String(req.query.error || ''))
      ? req.query.error : null,
  });
});

// ── Deals product detail (manual affiliate catalogue) ────────────────────────
function dealsGuard(req, res, next) {
  if (!req.tenant || req.tenant.page_type !== 'deals') return res.redirect('/');
  next();
}

router.get('/product/:slug', dealsGuard, async (req, res) => {
  const company = req.tenant;
  try {
    const product = (await pool.query(
      `SELECT * FROM deals_products
       WHERE company_id = $1 AND slug = $2 AND is_published = true`,
      [company.id, String(req.params.slug || '').slice(0, 120)]
    )).rows[0];
    if (!product) return res.redirect('/');
    res.locals.showAds = false;
    res.render('tenant_deals_product', {
      company,
      product,
      noindex: false,
    });
  } catch (err) {
    console.error('Deals product detail error:', err.message);
    res.redirect('/');
  }
});

// ── Clinic tenant public routes ─────────────────────────────────────────────
function clinicGuard(req, res, next) {
  if (!req.tenant || req.tenant.page_type !== 'clinic') return res.redirect('/');
  next();
}

// Public doctor profile page (each doctor of a clinic has its own indexable page).
router.get('/doctor/:slug', clinicGuard, async (req, res) => {
  const company = req.tenant;
  try {
    const doctor = (await pool.query(
      'SELECT * FROM clinic_doctors WHERE company_id=$1 AND slug=$2 AND is_active=true',
      [company.id, String(req.params.slug || '').slice(0, 80)]
    )).rows[0];
    if (!doctor) return res.redirect('/');
    const clinicSettings = (await pool.query('SELECT * FROM clinic_settings WHERE company_id=$1', [company.id])).rows[0] || null;
    const clinicDoctors = (await pool.query('SELECT id,slug,name,specialty FROM clinic_doctors WHERE company_id=$1 AND is_active=true ORDER BY sort_order,id', [company.id])).rows;
    // صفحة الطبيب بوابتها لوحدها (مش داخلة في بوابة صفحة التينانت فوق)،
    // فبتقرا نفس قايمة الديمو صراحةً — أطبّاء العيادة النموذجية مخترعين.
    const indexable = !!(doctor.bio && doctor.bio.trim().length >= 40) && !isDemoSlug(company.slug);
    res.locals.showAds = false; // medical page — never serve ads (AdSense policy)
    res.render('tenant_clinic_doctor', { company, doctor, clinicSettings, clinicDoctors, noindex: !indexable, sent: req.query.sent === '1' });
  } catch (e) { console.error('Doctor page:', e.message); res.redirect('/'); }
});

/**
 * Is public booking switched on for this tenant?
 *
 * The setting existed and only the VIEW read it: the button was hidden and the
 * route accepted the POST anyway. A hidden button is not a closed door — a
 * saved page, a browser's back button, or anybody who has seen the form once
 * still books, and the merchant who deliberately turned bookings off keeps
 * getting them and cannot see why.
 *
 * Default is ON: a tenant with no settings row at all has not switched
 * anything off, and refusing them would break every clinic that never opened
 * the settings page.
 */
async function bookingOpen(table, companyId) {
  try {
    const r = await pool.query(
      `SELECT booking_enabled FROM ${table} WHERE company_id=$1`, [companyId]);
    return !r.rows.length || r.rows[0].booking_enabled !== false;
  } catch (e) {
    // A settings table that cannot be read must not silently close a working
    // booking form — that would take a merchant's bookings away over a blip.
    console.error('[bookingOpen]', table, e.message);
    return true;
  }
}

/* حجز موعد في عيادة تغذية (البند ٨٤).
 *
 * نفس شكل حجز العيادة: الخانة بتتفحص جوّه جملة الكتابة، فاتنين بيحجزوا نفس
 * الخانة في نفس الثانية واحد بس بينجح. والزرار اللي كان بيفتح واتساب مابقاش
 * هو الطريقة الوحيدة — بقى فيه تقويم بخانات حقيقية. */
function nutritionGuard(req, res, next) {
  if (!req.tenant || req.tenant.page_type !== 'nutrition') return res.redirect('/');
  next();
}

router.post('/nutrition/book', nutritionGuard, async (req, res) => {
  const company = req.tenant;
  const b = req.body || {};
  const nb = require('../nutrition/booking');
  const name = String(b.patient_name || '').trim().slice(0, 80);
  const phone = String(b.patient_phone || '').trim().slice(0, 20);
  if (!name || phone.replace(/[^0-9]/g, '').length < 7) return res.redirect('/?error=1#book');
  try {
    if (!await bookingOpen('nutrition_settings', company.id)) return res.redirect('/?error=closed#book');
    const cfg = nb.settingsFrom((await pool.query(
      'SELECT * FROM nutrition_settings WHERE company_id=$1', [company.id])).rows[0] || {});
    const at = nb.slotAt(b.day, b.time);
    if (!at) return res.redirect('/?error=1#book');
    // الخانة اللي مش من مواعيد العيادة أصلاً بتترفض — مش بتتقبل عشان الشكل
    // بتاعها مظبوط.
    const offered = nb.slotsFor(cfg, String(b.day), []).some((s) => s.time === String(b.time));
    if (!offered) return res.redirect('/?error=1#book');
    const bad = nb.slotProblem(at);
    if (bad) return res.redirect('/?error=' + bad + '#book');
    const q = nb.insertIfFree({
      companyId: company.id, name, phone, at,
      note: String(b.note || '').trim().slice(0, 300) || null,
      status: 'pending', minutes: cfg.minutes,
    });
    const done = await pool.query(q.text, q.values);
    if (!done.rows.length) return res.redirect('/?error=taken#book');
    return res.redirect('/?sent=1#book');
  } catch (e) {
    console.error('[nutrition book]', e.message);
    return res.redirect('/?error=1#book');
  }
});

// Appointment booking submission (public form → clinic_appointments).
router.post('/book', clinicGuard, async (req, res) => {
  const company = req.tenant;
  const name = String((req.body && req.body.patient_name) || '').trim().slice(0, 80);
  const phone = String((req.body && req.body.patient_phone) || '').trim().slice(0, 20);
  if (!name || phone.replace(/[^0-9]/g, '').length < 7) return res.redirect('/?error=1#book');
  let doctorId = parseInt(req.body.doctor_id, 10); if (!Number.isFinite(doctorId)) doctorId = null;
  let slotAt = null; if (req.body.slot_at) { const d = new Date(req.body.slot_at); if (!isNaN(d.getTime())) slotAt = d.toISOString(); }
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
  try {
    // The switch the merchant actually flipped.
    if (!await bookingOpen('clinic_settings', company.id)) return res.redirect('/?error=closed#book');
    if (doctorId) { const ok = (await pool.query('SELECT 1 FROM clinic_doctors WHERE id=$1 AND company_id=$2', [doctorId, company.id])).rowCount; if (!ok) doctorId = null; }
    // A slot that has already gone is a typo, not a booking — it lands in the
    // queue where nobody looks for it.
    const bad = booking.slotProblem(slotAt);
    if (bad) return res.redirect('/?error=' + bad + '#book');
    // The clash test lives inside the INSERT: a clinic that shares its booking
    // link on WhatsApp really does get two people on the same slot in the same
    // second, and a SELECT beforehand lets both through.
    const appt = await booking.book(pool, {
      companyId: company.id, doctorId, name, phone,
      slotAt, reason: reason || null, status: 'pending',
    });
    if (!appt) return res.redirect('/?error=taken#book');
    // Auto-confirm over WhatsApp (best-effort, non-blocking).
    maybeSendBookingConfirm(company, name, phone, doctorId);
    const ref = req.get('referer') || '';
    const back = ref.includes('/doctor/') ? ref.split('?')[0].split('#')[0] : '/';
    res.redirect(back + '?sent=1#book');
  } catch (e) { console.error('Booking:', e.message); res.redirect('/?error=1#book'); }
});

// ── Gym tenant public routes (check-in + self class booking) ────────────────
function gymGuard(req, res, next) {
  if (!req.tenant || req.tenant.page_type !== 'gym') return res.redirect('/');
  next();
}

// Find a member by their membership code OR phone within this gym.
/**
 * Find the member behind a code or a phone number.
 *
 * `LIMIT 1` was the bug. The code is now unique per gym, so that lookup has one
 * answer or none. The PHONE cannot be made unique and should not be — a father
 * and his son on one number is a normal thing, not a data error. So when a
 * phone matches more than one member this returns `ambiguous` instead of
 * picking the first row: logging one person's attendance against another, and
 * reading the wrong subscription to decide whether to let them in, is a
 * failure that looks exactly like success from the desk.
 *
 * Returns { member } · { ambiguous: true } · {}.
 */
async function findGymMember(companyId, code, phone) {
  const c = String(code || '').trim();
  const p = String(phone || '').replace(/[^0-9]/g, '');
  if (c) {
    const r = (await pool.query(
      'SELECT * FROM gym_members WHERE company_id=$1 AND lower(btrim(code))=lower(btrim($2))',
      [companyId, c])).rows;
    if (r.length === 1) return { member: r[0] };
    if (r.length > 1) return { ambiguous: true };
  }
  if (p.length >= 7) {
    const r = (await pool.query(
      "SELECT * FROM gym_members WHERE company_id=$1 AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$2 LIMIT 2",
      [companyId, p])).rows;
    if (r.length === 1) return { member: r[0] };
    if (r.length > 1) return { ambiguous: true };
  }
  return {};
}

// Check-in page (member types code/phone → records attendance if active).
router.get('/checkin', gymGuard, (req, res) => {
  res.render('tenant_gym_checkin', { company: req.tenant, result: null, noindex: true });
});
router.post('/checkin', gymGuard, async (req, res) => {
  const company = req.tenant;
  let result;
  try {
    const found = await findGymMember(company.id, req.body.code, req.body.phone);
    const member = found.member;
    if (found.ambiguous) {
      // Two members on one number is normal. Guessing between them is not.
      result = { ok: false, msg: 'الرقم ده مسجّل لأكتر من عضو — ادخل بكود العضوية عشان نعرف مين فيهم.' };
    } else if (!member) {
      result = { ok: false, msg: 'مالقيناش عضو بالبيانات دي. تأكّد من كود العضوية أو الموبايل.' };
    } else {
      const m = (await pool.query(
        "SELECT end_date, status FROM gym_memberships WHERE member_id=$1 AND status='active' AND end_date >= CURRENT_DATE ORDER BY end_date DESC LIMIT 1",
        [member.id]
      )).rows[0];
      if (!m) {
        result = { ok: false, name: member.name, msg: 'اشتراكك منتهي أو متجمّد — كلّم الاستقبال للتجديد.' };
      } else {
        // One row per member per day, decided by the unique index rather than
        // by a SELECT two taps of the same card would race past. A repeat tap
        // is not an error — it is somebody who already came in today.
        const ins = await pool.query(
          `INSERT INTO gym_attendance (company_id, member_id, day)
           VALUES ($1,$2,(now() AT TIME ZONE 'Africa/Cairo')::date)
           ON CONFLICT (company_id, member_id, day) DO NOTHING RETURNING id`,
          [company.id, member.id]);
        const till = new Date(m.end_date).toLocaleDateString('ar-EG');
        result = ins.rows.length
          ? { ok: true, name: member.name, msg: `أهلاً ${member.name}! تم تسجيل حضورك. اشتراكك نشط حتى ${till}.` }
          : { ok: true, name: member.name, msg: `أهلاً ${member.name}! حضورك النهاردة متسجّل خلاص. اشتراكك نشط حتى ${till}.` };
      }
    }
  } catch (e) { console.error('[gym checkin]', e.message); result = { ok: false, msg: 'حصل خطأ، حاول تاني.' }; }
  res.render('tenant_gym_checkin', { company, result, noindex: true });
});

// Self class booking (member books a class for a date; capacity → waitlist).
/* A form on the open internet fills a class in seconds.
 *
 * Three things, in increasing order of how much they cost a real person:
 *
 *   1. a RATE LIMIT per gym per IP — a human books one or two classes, not
 *      thirty; this costs an honest visitor nothing at all;
 *   2. a HONEYPOT field, hidden from people and irresistible to a script that
 *      fills every input it finds. A filled honeypot is answered like a normal
 *      success so the script learns nothing, and nothing is written;
 *   3. MEMBERS ONLY, which the gym switches on itself — it is the only one of
 *      the three that can turn away somebody real.
 */
const gymBookLimiter = _rl({
  name: 'gym-book', windowMs: 15 * 60000, max: 8,
  keyFn: (req) => ((req.tenant && req.tenant.id) || 'g') + '|' + _cip(req),
});

router.post('/book-class', gymBookLimiter, gymGuard, async (req, res) => {
  const company = req.tenant;
  const classId = parseInt(req.body.class_id, 10);
  try {
    if (!await bookingOpen('gym_settings', company.id)) return res.redirect('/?bookerr=closed#classes');
    // The honeypot: a field no human sees, so anything in it came from a script.
    // It is answered like a success on purpose — an error would tell the script
    // which field to leave alone next time.
    if (String(req.body.website || '').trim() !== '') return res.redirect('/?booked=booked#classes');
    const name = String(req.body.name || '').trim().slice(0, 80);
    const phone = String(req.body.phone || '').trim().slice(0, 20);
    const phoneKey = phone.replace(/[^0-9]/g, '');
    if (!name || phoneKey.length < 7) return res.redirect('/?bookerr=1#classes');
    // The member link is optional on a public class booking, so an ambiguous
    // phone books the class under the typed name without attaching it to
    // anybody's file — better than attaching it to the wrong one.
    const member = (await findGymMember(company.id, req.body.code, phone)).member || null;
    // …unless the gym said members only, in which case the link is the point.
    if (!member) {
      const setting = await pool.query('SELECT booking_members_only FROM gym_settings WHERE company_id=$1', [company.id]);
      if (setting.rows[0] && setting.rows[0].booking_members_only === true) {
        return res.redirect('/?bookerr=members#classes');
      }
    }

    /* Counting and then inserting is how a class of twenty ends up with
     * thirty-nine people in it. Twenty requests arriving together each read
     * "19 booked", each decide there is room, and each insert. Nothing is
     * wrong with any one of them.
     *
     * Locking the CLASS row is what makes the count mean something: every
     * booking for that class queues behind the same row, so the count each one
     * reads includes the bookings before it. The lock is on gym_classes and not
     * on the bookings, because there is no booking row yet to lock. */
    const client = await pool.connect();
    let status;
    let token = null;
    try {
      await client.query('BEGIN');
      const gymClass = (await client.query(
        'SELECT * FROM gym_classes WHERE id=$1 AND company_id=$2 AND is_active=true FOR UPDATE',
        [classId, company.id])).rows[0];
      if (!gymClass) { await client.query('ROLLBACK'); return res.redirect('/?bookerr=1#classes'); }

      /* Next occurrence of the class's weekday — and if that is TODAY and the
       * class has already started, next week instead.
       *
       * The old query stopped at the weekday, so at ten at night a member could
       * book the six o'clock class that finished four hours ago. It counted
       * against the capacity of a session that no longer existed, and the
       * member turned up to a locked studio the following morning.
       *
       * Everything is measured in Cairo time, not the server's: CURRENT_DATE on
       * a UTC host rolls over at 2am local, so for two hours every night "today"
       * meant yesterday's class.
       */
      const bookingDate = (await client.query(
        `WITH n AS (SELECT (now() AT TIME ZONE 'Africa/Cairo') AS ts),
              t AS (SELECT ts, ts::date AS today,
                           CASE WHEN $2 ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                                THEN $2::time ELSE NULL END AS starts
                      FROM n),
              b AS (SELECT ts, today, starts,
                           (today + ((7 + $1 - EXTRACT(DOW FROM ts)::int) % 7)) AS d
                      FROM t)
         SELECT (CASE WHEN d = today AND starts IS NOT NULL AND starts <= ts::time
                      THEN d + 7 ELSE d END)::date AS d
           FROM b`,
        [gymClass.day_of_week, gymClass.start_time || null])).rows[0].d;
      const booked = (await client.query(
        "SELECT COUNT(*)::int n FROM gym_bookings WHERE class_id=$1 AND booking_date=$2 AND status='booked'",
        [classId, bookingDate])).rows[0].n;
      status = booked >= gymClass.capacity ? 'waitlist' : 'booked';
      // The token is how the member reaches this booking again — to cancel it,
      // or to move it. Without one, a place taken is a place that can only be
      // given back by phoning the gym, which is why full classes stayed full of
      // people who were not coming.
      token = crypto.randomBytes(9).toString('hex');
      await client.query(
        `INSERT INTO gym_bookings (company_id, class_id, member_id, member_name, member_phone, phone_key, booking_date, status, token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        // gymClass.id — the row the FOR UPDATE above proved is this gym's.
        [company.id, gymClass.id, member ? member.id : null, name, phone, phoneKey, bookingDate, status, token]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      // The unique index fired: this phone already holds a place in this class
      // on this day. Not an error to shout about — say it plainly.
      if (String(e.message).includes('idx_gym_one_booking_per_person')) {
        return res.redirect('/?bookerr=dup#classes');
      }
      throw e;
    } finally { client.release(); }
    // Straight to the booking's own page: it carries the place in the queue
    // and the two things a member needs — cancel, or move to another day.
    res.redirect(token ? ('/gym/booking/' + token) : ('/?booked=' + status + '#classes'));
  } catch (e) { console.error('[gym book-class]', e.message); res.redirect('/?bookerr=1#classes'); }
});

/* ─── حجز العضو: صفحته وإلغاؤه ونقله (backlog 85) ───────────────
 *
 * A booking a member cannot reach is a booking they cannot give back. The token
 * identifies one booking — it is not a login and grants nothing else.
 */
router.get('/gym/booking/:token', async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'gym') return res.status(404).render('404', { subdomain: null });
  try {
    const b = (await pool.query(
      `SELECT b.*, c.name AS class_name, c.start_time, c.day_of_week, c.capacity, t.name AS trainer_name
         FROM gym_bookings b
         JOIN gym_classes c ON c.id = b.class_id
         LEFT JOIN gym_trainers t ON t.id = c.trainer_id
        WHERE b.token=$1 AND b.company_id=$2`, [String(req.params.token || '').slice(0, 40), company.id]
    )).rows[0];
    if (!b) return res.status(404).render('404', { subdomain: company.slug });
    // Where they stand, if they are waiting. A member who can see "3rd in line"
    // stops phoning the gym to ask.
    const queue = (await pool.query(
      `SELECT id, status, created_at FROM gym_bookings
        WHERE class_id=$1 AND booking_date=$2 AND company_id=$3 AND status='waitlist'`,
      [b.class_id, b.booking_date, company.id])).rows;
    const today = new Date().toISOString().slice(0, 10);
    res.render('gym_booking', {
      company, booking: b,
      place: gymBookings.placeInLine(b, queue),
      canCancel: gymBookings.canCancel(b, today),
      saved: req.query.saved === '1',
      err: ['missing', 'already', 'past', 'date', 'same', 'wrong_day', 'save'].includes(String(req.query.err || ''))
        ? req.query.err : null,
    });
  } catch (e) {
    console.error('[gym booking page]', e.message);
    res.status(500).send('error');
  }
});

/**
 * إلغاء — and the freed place goes to the first person waiting, now.
 *
 * In the same transaction, not by a nightly job: a class is at 6pm and a
 * nightly job promotes somebody at midnight. Exactly one person moves up, the
 * one who has waited longest — the order the list was formed in is the only
 * one that cannot be argued with at the door.
 */
router.post('/gym/booking/:token/cancel', async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'gym') return res.status(404).render('404', { subdomain: null });
  const token = String(req.params.token || '').slice(0, 40);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = (await client.query(
      'SELECT * FROM gym_bookings WHERE token=$1 AND company_id=$2 FOR UPDATE', [token, company.id])).rows[0];
    if (!b) { await client.query('ROLLBACK'); return res.status(404).render('404', { subdomain: company.slug }); }
    const today = new Date().toISOString().slice(0, 10);
    const verdict = gymBookings.canCancel(b, today);
    if (!verdict.ok) {
      await client.query('ROLLBACK');
      return res.redirect('/gym/booking/' + token + '?err=' + verdict.why);
    }
    await client.query("UPDATE gym_bookings SET status='cancelled' WHERE id=$1 AND company_id=$2", [b.id, company.id]);

    // Only a confirmed place frees a seat; giving up a place on the waiting
    // list does not promote anybody.
    if (String(b.status) === 'booked') {
      const waiting = (await client.query(
        `SELECT id, status, created_at FROM gym_bookings
          WHERE class_id=$1 AND booking_date=$2 AND company_id=$3 AND status='waitlist'
          FOR UPDATE`, [b.class_id, b.booking_date, company.id])).rows;
      const next = gymBookings.nextInLine(waiting);
      if (next) {
        await client.query(
          "UPDATE gym_bookings SET status='booked', promoted_at=now() WHERE id=$1 AND company_id=$2 AND status='waitlist'",
          [next.id, company.id]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[gym booking cancel]', e.message);
    return res.redirect('/gym/booking/' + token + '?err=save');
  } finally { client.release(); }
  res.redirect('/gym/booking/' + token + '?saved=1');
});

/** نقل — the same class, another day it actually runs. */
router.post('/gym/booking/:token/move', async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'gym') return res.status(404).render('404', { subdomain: null });
  const token = String(req.params.token || '').slice(0, 40);
  const to = String((req.body || {}).date || '').slice(0, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = (await client.query(
      'SELECT * FROM gym_bookings WHERE token=$1 AND company_id=$2 FOR UPDATE', [token, company.id])).rows[0];
    if (!b) { await client.query('ROLLBACK'); return res.status(404).render('404', { subdomain: company.slug }); }
    const cls = (await client.query(
      'SELECT * FROM gym_classes WHERE id=$1 AND company_id=$2', [b.class_id, company.id])).rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const verdict = gymBookings.canMove(b, cls, to, today);
    if (!verdict.ok) {
      await client.query('ROLLBACK');
      return res.redirect('/gym/booking/' + token + '?err=' + verdict.why);
    }
    // The new day has its own capacity: moving into a full day joins its
    // waiting list rather than overfilling the class.
    const booked = (await client.query(
      "SELECT COUNT(*)::int n FROM gym_bookings WHERE class_id=$1 AND booking_date=$2 AND company_id=$3 AND status='booked'",
      [b.class_id, to, company.id])).rows[0].n;
    const status = cls && booked >= Number(cls.capacity) ? 'waitlist' : 'booked';
    await client.query(
      'UPDATE gym_bookings SET booking_date=$3, status=$4, moved_at=now() WHERE id=$1 AND company_id=$2',
      [b.id, company.id, to, status]);

    // The day they left may now have a free seat.
    if (String(b.status) === 'booked') {
      const waiting = (await client.query(
        `SELECT id, status, created_at FROM gym_bookings
          WHERE class_id=$1 AND booking_date=$2 AND company_id=$3 AND status='waitlist' FOR UPDATE`,
        [b.class_id, b.booking_date, company.id])).rows;
      const next = gymBookings.nextInLine(waiting);
      if (next) {
        await client.query(
          "UPDATE gym_bookings SET status='booked', promoted_at=now() WHERE id=$1 AND company_id=$2 AND status='waitlist'",
          [next.id, company.id]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // Already booked on that day: the one-booking index fired.
    if (String(e.message).includes('idx_gym_one_booking_per_person')) {
      return res.redirect('/gym/booking/' + token + '?err=same');
    }
    console.error('[gym booking move]', e.message);
    return res.redirect('/gym/booking/' + token + '?err=save');
  } finally { client.release(); }
  res.redirect('/gym/booking/' + token + '?saved=1');
});

// Public order form for one medicine (?m=<medicine_id>).
router.get('/order', pharmacyOrderGuard, async (req, res) => {
  const company = req.tenant;
  const mid = parseInt(req.query.m, 10);
  try {
    const item = (await pool.query(
      `SELECT pi.medicine_id, pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available,
              m.name_ar, m.name_en, m.form
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE pi.company_id = $1 AND pi.medicine_id = $2`, [company.id, mid]
    )).rows[0];
    if (!item || Number(item.available) <= 0) return res.redirect('/');
    // The buyer is one click from paying here, so this page has to say HOW.
    // It is a separate route from the cart, and it was the one that never
    // received the merchant's payment methods — the cart shows them above its
    // confirm button and this page showed nothing at all.
    const payment = await loadPaymentMethods(pool, company, res.locals.t);
    res.render('tenant_pharmacy_order', {
      company, item, settings: req.pharmacySettings, noindex: true, done: false, order: null,
      error: req.query.e || null, payment,
      canonical: canonicalCompanyUrl(company.slug),
    });
  } catch (e) { console.error('order form error:', e.message); res.status(500).send('Error.'); }
});

// Create the order + reserve stock (owner rule #14: reserved so it isn't sold
// at the counter). Single-item quick order.
router.post('/order', pharmacyOrderGuard, async (req, res) => {
  const company = req.tenant;
  const b = req.body || {};
  const mid = parseInt(b.medicine_id, 10);
  const qty = Math.max(1, parseInt(b.qty, 10) || 1);
  const name = String(b.customer_name || '').trim().slice(0, 100);
  const phone = String(b.customer_phone || '').trim().slice(0, 30);
  const address = String(b.customer_address || '').trim().slice(0, 300);
  if (!mid || !name || !phone) return res.redirect('/order?m=' + mid + '&e=1');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = (await client.query(
      `SELECT pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available, m.name_ar
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE pi.company_id = $1 AND pi.medicine_id = $2 FOR UPDATE`, [company.id, mid]
    )).rows[0];
    if (!inv || Number(inv.available) < qty) { await client.query('ROLLBACK'); return res.redirect('/order?m=' + mid + '&e=2'); }
    const price = Number(inv.price) || 0;
    const total = price * qty;
    const token = crypto.randomBytes(9).toString('hex');
    const ord = (await client.query(
      `INSERT INTO pharmacy_orders (company_id, customer_name, customer_phone, customer_address, total_amount, status, track_token)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
      [company.id, name, phone, address || null, total, token]
    )).rows[0];
    await client.query(
      `INSERT INTO pharmacy_order_items (order_id, medicine_id, name, qty, price) VALUES ($1,$2,$3,$4,$5)`,
      [ord.id, mid, inv.name_ar, qty, price]
    );
    await stock.reserve(client, company.id, [{ medicine_id: mid, qty }]);
    await client.query('COMMIT');
    // Mobile push to the pharmacy owner — same channel as shop orders/messages.
    push.sendToCompany(company.id, {
      title: '🧾 طلب صيدلية جديد',
      body: `طلب جديد من ${name}: ${inv.name_ar} × ${qty}`,
      url: '/pharmacy/orders',
    }, 'order').catch((e) => console.error('[push pharmacy order] error:', e.message));
    // The confirmation page needs them MOST: the order exists, the money does
    // not yet, and this is where a buyer paying by InstaPay or a link finds out
    // where to send it.
    const payment = await loadPaymentMethods(pool, company, res.locals.t);
    res.render('tenant_pharmacy_order', {
      company, item: null, settings: req.pharmacySettings, noindex: true, done: true,
      order: { id: ord.id, name: inv.name_ar, qty, total, token }, payment,
      canonical: canonicalCompanyUrl(company.slug),
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('order create error:', e.message);
    res.redirect('/order?m=' + mid + '&e=3');
  } finally {
    client.release();
  }
});

// Create a MULTI-medicine order from the client cart. The customer enters their
// contact details once and checks out the whole cart (COD). Prices/availability
// are re-read from the DB per item and stock is reserved for all of them.
router.post('/order/cart', pharmacyOrderGuard, async (req, res) => {
  const company = req.tenant;
  const b = req.body || {};
  const langQ = res.locals.lang === 'en' ? '?lang=en' : '';
  let cart;
  try { cart = JSON.parse(b.cart || '[]'); } catch (e) { cart = []; }
  cart = (Array.isArray(cart) ? cart : [])
    .map((x) => ({ id: parseInt(x.id, 10), q: Math.max(1, parseInt(x.q, 10) || 1) }))
    .filter((x) => x.id);
  const name = String(b.customer_name || '').trim().slice(0, 100);
  const phone = String(b.customer_phone || '').trim().slice(0, 30);
  const address = String(b.customer_address || '').trim().slice(0, 300);
  if (!cart.length || !name || phone.length < 6) return res.redirect('/' + langQ);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lines = [];
    let itemsTotal = 0;
    for (const c of cart) {
      const inv = (await client.query(
        `SELECT pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available, m.name_ar
         FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
         WHERE pi.company_id = $1 AND pi.medicine_id = $2 FOR UPDATE`, [company.id, c.id]
      )).rows[0];
      if (!inv || Number(inv.available) < c.q) {
        // Was: redirect to the storefront and say nothing. The customer got
        // their cart back, full, with no idea why the order did not go
        // through — and the honest answer ("somebody bought the last two while
        // you were typing your address") is one they can act on.
        await client.query('ROLLBACK');
        const which = inv ? encodeURIComponent(String(inv.name_ar || '').slice(0, 60)) : '';
        return res.redirect('/' + (langQ ? langQ + '&' : '?') + 'err=stock'
          + (which ? '&item=' + which : '') + (inv ? '&left=' + Number(inv.available) : ''));
      }
      const price = Number(inv.price) || 0;
      itemsTotal += price * c.q;
      lines.push({ medicine_id: c.id, name: inv.name_ar, qty: c.q, price });
    }
    // Flat delivery fee (if the pharmacy enabled delivery with a fee).
    const s = req.pharmacySettings || {};
    const deliveryFee = (s.delivery_enabled && Number(s.delivery_fee) > 0) ? Number(s.delivery_fee) : 0;
    const total = itemsTotal + deliveryFee;
    const token = crypto.randomBytes(9).toString('hex');
    const ord = (await client.query(
      `INSERT INTO pharmacy_orders (company_id, customer_name, customer_phone, customer_address, total_amount, status, track_token)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
      [company.id, name, phone, address || null, total, token]
    )).rows[0];
    for (const ln of lines) {
      await client.query(
        `INSERT INTO pharmacy_order_items (order_id, medicine_id, name, qty, price) VALUES ($1,$2,$3,$4,$5)`,
        [ord.id, ln.medicine_id, ln.name, ln.qty, ln.price]
      );
    }
    await stock.reserve(client, company.id, lines.map((l) => ({ medicine_id: l.medicine_id, qty: l.qty })));
    await client.query('COMMIT');
    push.sendToCompany(company.id, {
      title: '🧾 طلب صيدلية جديد',
      body: `طلب جديد من ${name}: ${lines.length} صنف`,
      url: '/pharmacy/orders',
    }, 'order').catch((e) => console.error('[push pharmacy cart order] error:', e.message));
    return res.redirect('/order/track/' + token + langQ);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('cart order create error:', e.message);
    return res.redirect('/' + langQ);
  } finally {
    client.release();
  }
});

// ── Customer order tracking (Talabat-style) ──
// Public, keyed by the order's unguessable token. Shows live status and lets
// the customer enable push so the pharmacy's status updates reach their phone.
async function loadTrackedOrder(req) {
  const company = req.tenant;
  if (!company || company.page_type !== 'pharmacy') return null;
  const token = String(req.params.token || '').trim();
  if (!token) return null;
  const o = (await pool.query(
    'SELECT * FROM pharmacy_orders WHERE track_token = $1 AND company_id = $2', [token, company.id]
  )).rows[0];
  return o || null;
}

router.get('/order/track/:token', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.redirect('/');
    const items = (await pool.query(
      `SELECT oi.name, oi.qty, oi.price, m.name_en AS med_en
       FROM pharmacy_order_items oi LEFT JOIN medicines m ON m.id = oi.medicine_id
       WHERE oi.order_id = $1`, [order.id]
    )).rows;
    const paySettings = await loadPaySettings(pool, req.tenant.id);
    const canPayOnline = gatewayReady(paySettings) && order.payment_status !== 'paid';
    // A buyer opens this page to answer one of two questions: where is my order,
    // and how do I pay for it. Unpaid orders get the methods; a paid one does
    // not, because a receipt asking for a transfer is how somebody pays twice.
    const payment = order.payment_status === 'paid'
      ? null : await loadPaymentMethods(pool, req.tenant, res.locals.t);
    res.render('tenant_pharmacy_track', {
      company: req.tenant, order, items, noindex: true, payment,
      pushKey: push.publicKey(),
      canPayOnline, payUrl: '/order/pharmacy/pay/' + order.track_token,
      canonical: canonicalCompanyUrl(req.tenant.slug),
    });
  } catch (e) { console.error('track error:', e.message); res.status(500).send('Error.'); }
});

router.get('/order/track/:token/status', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.status(404).json({});
    res.json({ status: order.status });
  } catch (e) { res.status(500).json({}); }
});

/* ─── Online payment (pharmacy + food), same flow as the shop ──
   Each merchant is a single page type, transacts with their OWN gateway keys.
   merchantOrderId is prefixed per vertical so the webhook can route it. */
const PAY_INTENT_REUSE_MS = 50 * 60 * 1000;   // gateway keys live an hour

async function initiateTenantPay(req, res, { table, prefix, total, name, phone, email, addr, backUrl, order }) {
  const company = req.tenant;
  try {
    const paySettings = await loadPaySettings(pool, company.id);
    if (!gatewayReady(paySettings)) return res.redirect(backUrl + '?payerror=1');
    const amountCents = Math.round(Number(total) * 100);

    // Reuse the live intent. Both of these routes are reachable from a tracking
    // link the customer keeps in WhatsApp, so "opened twice" is the normal case,
    // not the edge case — and every open used to create another payment page
    // for the same order at the merchant's gateway.
    const o = order || {};
    if (o.payment_url && o.payment_intent_at
        && (Date.now() - new Date(o.payment_intent_at).getTime()) < PAY_INTENT_REUSE_MS
        && Number(o.payment_intent_cents) === amountCents) {
      return res.redirect(o.payment_url);
    }

    const parts = String(name || '').trim().split(/\s+/);
    const attempt = (Number(o.payment_attempt) || 0) + 1;
    const out = await createGatewayPayment(pool, company, {
      amountCents,
      currency: company.currency || 'EGP',
      merchantOrderId: prefix + '-' + req.__orderId + (attempt > 1 ? '-' + attempt : ''),
      billing: { first_name: parts[0] || 'Customer', last_name: parts.slice(1).join(' ') || 'NA', email: email || 'na@na.com', phone: phone || 'NA', street: addr || 'NA' },
    });
    await pool.query(
      `UPDATE ${table} SET payment_status='pending', payment_ref=$1, payment_url=$2,
              payment_intent_at=now(), payment_intent_cents=$3, payment_attempt=$4
        WHERE id=$5`,
      [String(out.orderId || ''), out.url, amountCents, attempt, req.__orderId]
    );
    res.redirect(out.url);
  } catch (err) { console.error('[tenant pay initiate]', err.message); res.redirect(backUrl + '?payerror=1'); }
}

router.get('/order/pharmacy/pay/:token', pharmacyOrderGuard, async (req, res) => {
  const o = (await pool.query('SELECT * FROM pharmacy_orders WHERE track_token=$1 AND company_id=$2', [req.params.token, req.tenant.id])).rows[0];
  if (!o) return res.redirect('/');
  if (o.payment_status === 'paid') return res.redirect('/order/track/' + o.track_token);
  req.__orderId = o.id;
  return initiateTenantPay(req, res, { table: 'pharmacy_orders', prefix: 'pharmacy', total: o.total_amount, name: o.customer_name, phone: o.customer_phone, addr: o.customer_address, backUrl: '/order/track/' + o.track_token, order: o });
});

router.get('/order/food/pay/:token', foodOrderGuard, async (req, res) => {
  const o = (await pool.query('SELECT * FROM food_orders WHERE track_token=$1 AND company_id=$2', [req.params.token, req.tenant.id])).rows[0];
  if (!o) return res.redirect('/');
  if (o.payment_status === 'paid') return res.redirect('/order/food/' + o.track_token);
  req.__orderId = o.id;
  return initiateTenantPay(req, res, { table: 'food_orders', prefix: 'food', total: o.total, name: o.customer_name, phone: o.phone, addr: o.delivery_address, backUrl: '/order/food/' + o.track_token, order: o });
});

// Informational buyer return page (never trusts query params).
router.get('/order/pay/return', (req, res) => {
  res.render('shop/pay_return', { ok: String(req.query.success) === 'true' });
});

// Server-to-server Paymob webhook for tenant (pharmacy/food) orders. HMAC-verified
// with the merchant's own secret before marking paid — the only trusted source.
router.post('/order/pay/paymob/callback', async (req, res) => {
  try {
    const company = req.tenant;
    if (!company) return res.status(200).send('no tenant');
    const obj = (req.body && req.body.obj) || {};
    const providedHmac = req.query.hmac || (req.body && req.body.hmac);
    const moid = String((obj.order && obj.order.merchant_order_id) || '');
    // `food-12` and `food-12-3` are the same order, a later attempt.
    const m = /^(pharmacy|food)-(\d+)(?:-\d+)?$/.exec(moid);
    if (!m) return res.status(200).send('ignored');
    const table = m[1] === 'pharmacy' ? 'pharmacy_orders' : 'food_orders';
    const orderId = parseInt(m[2], 10);
    const amountCol = table === 'pharmacy_orders' ? 'total_amount' : 'total';
    const o = (await pool.query(
      `SELECT company_id, payment_intent_cents, ${amountCol} AS amount FROM ${table} WHERE id=$1`, [orderId]
    )).rows[0];
    if (!o || o.company_id !== company.id) return res.status(200).send('no order');
    const settings = (await pool.query('SELECT gateway_hmac, gateway_hmac_enc FROM payment_settings WHERE company_id=$1', [o.company_id])).rows[0];
    // Encrypted at rest; the plaintext column is the pre-migration fallback.
    const hmacSecret = payVault.read(settings && settings.gateway_hmac_enc, settings && settings.gateway_hmac);
    if (!paymob.verifyCallbackHmac(obj, hmacSecret, providedHmac)) {
      console.error('[paymob tenant callback] HMAC mismatch', moid);
      return res.status(403).send('bad hmac');
    }
    // A valid signature says Paymob sent this. It does not say it paid for THIS
    // order — the amount and the transaction's own state have to agree too.
    const want = Number(o.payment_intent_cents) || Math.round(Number(o.amount) * 100);
    const verdict = paymob.paymentAccepted(obj, want, company.currency || 'EGP');
    if (verdict.ok) {
      await pool.query(`UPDATE ${table} SET payment_status='paid', payment_ref=$1 WHERE id=$2 AND payment_status <> 'paid'`, [String(obj.id || ''), orderId]);
      push.sendToCompany(o.company_id, { title: '💳 دفع أونلاين', body: 'تم دفع الطلب #' + orderId + ' أونلاين', url: company.page_type === 'pharmacy' ? '/pharmacy/orders' : '/food/orders' }, 'order').catch(() => {});
    } else {
      // Not an error to answer with — Paymob retries on non-200. Logged so the
      // merchant's own support can see a rejected settlement instead of silence.
      console.error('[paymob tenant callback] refused', moid, verdict.why);
    }
    res.status(200).send('ok');
  } catch (err) { console.error('[paymob tenant callback]', err.message); res.status(200).send('err'); }
});

// Customer poll for the delivery driver's live location (only while the order
// is out for delivery).
router.get('/order/track/:token/location', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.status(404).json({});
    if (order.status !== 'out_for_delivery' || order.driver_lat == null) return res.json({});
    res.json({ lat: Number(order.driver_lat), lng: Number(order.driver_lng), at: order.driver_loc_at });
  } catch (e) { res.status(500).json({}); }
});

router.post('/order/track/:token/subscribe', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.status(404).json({ ok: false });
    const ok = await push.saveOrderSubscription(order.id, req.body && req.body.subscription);
    res.json({ ok: !!ok });
  } catch (e) { console.error('track subscribe error:', e.message); res.status(500).json({ ok: false }); }
});

/* ─── Orders (restaurant/supermarket) checkout ──────────── */
async function foodOrderGuard(req, res, next) {
  const company = req.tenant;
  if (!company || company.page_type !== 'orders') {
    return res.status(404).render('404', { subdomain: company ? company.slug : null });
  }
  next();
}

// Validate a coupon for a company against a subtotal. Returns { ok, discount,
// coupon } — discount is 0 when invalid. Never throws.
async function validateFoodCoupon(db, companyId, code, subtotal) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return { ok: false, discount: 0 };
  try {
    const c = (await db.query('SELECT * FROM food_coupons WHERE company_id=$1 AND code=$2', [companyId, code])).rows[0];
    if (!c || !c.is_active) return { ok: false, discount: 0 };
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { ok: false, discount: 0 };
    if (c.usage_limit && Number(c.usage_limit) > 0 && Number(c.used_count) >= Number(c.usage_limit)) return { ok: false, discount: 0 };
    if (c.min_order && subtotal < Number(c.min_order)) return { ok: false, discount: 0 };
    // Two bounds, and the second one is not redundant. Saving is clamped to
    // 0–100 now, but rows written before that are still in the table, and a
    // coupon can never take more than the basket it is applied to — otherwise
    // the delivery fee gets eaten and the customer pays nothing.
    let discount = subtotal * money.percent(c.discount_percent, 0) / 100;
    if (c.max_discount && Number(c.max_discount) > 0) discount = Math.min(discount, Number(c.max_discount));
    discount = money.discount(discount, subtotal);
    return { ok: discount > 0, discount, coupon: c };
  } catch (e) { console.error('coupon validate error:', e.message); return { ok: false, discount: 0 }; }
}

// Live coupon check for the cart drawer. Rate-limited per tenant+IP so it can't
// be abused as an oracle to brute-force a merchant's private coupon codes.
const _couponLimiter = _rl({ name: 'coupon', windowMs: 60000, max: 20, keyFn: (req) => ((req.tenant && req.tenant.id) || 't') + '|' + _cip(req) });
router.get('/order/coupon-check', _couponLimiter, foodOrderGuard, async (req, res) => {
  const subtotal = Number(req.query.subtotal) || 0;
  const r = await validateFoodCoupon(pool, req.tenant.id, req.query.code, subtotal);
  res.json({ ok: r.ok, discount: r.discount, percent: r.coupon ? Number(r.coupon.discount_percent) : 0 });
});

// AI order assistant (PAID). Gated by an active subscription + monthly quota.
// The model only ever sees THIS merchant's menu, and every returned item id is
// re-validated against the DB inside the assistant lib.
router.post('/order/food/ai', foodOrderGuard, async (req, res) => {
  const company = req.tenant;
  const lang = (res.locals.lang === 'en') ? 'en' : 'ar';
  const say = (ar, en) => (lang === 'en' ? en : ar);

  const sub = await loadAiSub(company.id);
  if (!aiSubActive(sub)) {
    return res.status(403).json({ ok: false, error: say('المساعد الذكي غير مُفعّل لهذا المتجر.', 'The AI assistant is not enabled for this shop.') });
  }
  if (!aiQuotaLeft(sub)) {
    return res.status(429).json({ ok: false, error: say('تم تجاوز حصّة الباقة لهذا الشهر.', 'This month\'s plan quota has been used up.') });
  }
  if (!aiAssistant.isEnabled()) {
    return res.status(503).json({ ok: false, error: say('خدمة المساعد غير متاحة حالياً.', 'The assistant service is temporarily unavailable.') });
  }

  // Input sanitization + length cap.
  const message = String((req.body && req.body.message) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!message) return res.status(400).json({ ok: false, error: say('اكتب رسالتك.', 'Type your message.') });

  // Rate limit: 12 messages/min per (tenant, ip).
  //
  // العنوان من `clientIp` المشترك، مش من **أول** عنصر في `X-Forwarded-For`.
  // الشكل القديم كان بيقرا اللي العميل بنفسه بيكتبه، فالحدّ ده كان بيتخطّى
  // بسطر في الطلب — والشات ده بيكلّف فلوس على كل نداء.
  const ip = clientIp(req);
  if (!aiRateOk(company.id + '|' + ip, 12)) {
    return res.status(429).json({ ok: false, error: say('محاولات كتير بسرعة، استنى شوية.', 'Too many messages, please slow down.') });
  }

  // Accept a short prior history from the client (text only).
  let history = [];
  try {
    const h = req.body && req.body.history;
    if (Array.isArray(h)) history = h.slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 500) }));
  } catch (e) { history = []; }

  // Current cart from the client so the model knows what's already in it (never
  // re-add, and can correct/remove). Validated shape only.
  let currentCart = [];
  try {
    const c = req.body && req.body.cart;
    if (Array.isArray(c)) currentCart = c.slice(0, 60).map((it) => ({
      id: parseInt(it.id, 10) || 0,
      name: String(it.name || '').slice(0, 80),
      qty: Math.max(0, Math.min(99, parseInt(it.qty, 10) || 0)),
    })).filter((it) => it.id && it.qty > 0);
  } catch (e) { currentCart = []; }

  try {
    // Load the merchant's active menu (same shape the storefront uses).
    const outlets = (await pool.query(
      'SELECT * FROM food_outlets WHERE company_id = $1 AND is_active = true ORDER BY vertical', [company.id]
    )).rows;
    for (const o of outlets) {
      o.categories = (await pool.query('SELECT * FROM food_categories WHERE outlet_id = $1 ORDER BY sort_order, id', [o.id])).rows;
      o.items = (await pool.query('SELECT * FROM food_items WHERE outlet_id = $1 AND is_available = true ORDER BY sort_order, id', [o.id])).rows;
    }

    // "Generate once, reuse for free" — the Safari (mykid) trick, applied here
    // per-restaurant. We only cache STATELESS opening questions (no cart, no
    // prior history): the repeated FAQ-type messages many different customers
    // send fresh ("مواعيدكم إيه؟"، "بتوصلوا فين؟"، "فيه صيامي؟"). Anything that
    // depends on the cart/conversation always runs live. The menu fingerprint is
    // part of the key, so a cached answer auto-invalidates when the menu changes.
    const cacheable = history.length === 0 && currentCart.length === 0;
    const cacheNs = 'food:' + company.id;
    const cacheKey = cacheable
      ? [aiAssistant.answerSignature(outlets), lang, aiAssistant.normalizeQuestion(message)]
      : null;

    // Log the turn + count it against the merchant's plan. Same for a cached or a
    // live answer — the customer still got an AI reply; only the Groq cost is saved.
    const logTurn = async (reply, tokens) => {
      try {
        await pool.query('INSERT INTO food_ai_messages (company_id, role, content, tokens) VALUES ($1,$2,$3,$4)', [company.id, 'user', message, 0]);
        await pool.query('INSERT INTO food_ai_messages (company_id, role, content, tokens) VALUES ($1,$2,$3,$4)', [company.id, 'assistant', reply, tokens || 0]);
        await pool.query('UPDATE food_ai_subscriptions SET used_this_period = used_this_period + 1 WHERE company_id = $1', [company.id]);
      } catch (e) { console.error('[ai log]', e.message); }
    };

    // Cache hit → serve the saved reply with NO model call (the whole saving).
    if (cacheKey) {
      const hit = await aiReplyCache.get(pool, cacheNs, cacheKey);
      if (hit && hit.reply) {
        await logTurn(hit.reply, 0);
        return res.json({ ok: true, reply: hit.reply, cart: [], updates: [], checkout: false, cached: true });
      }
    }

    const out = await aiAssistant.runAssistant({
      outlets, history, message, lang, currentCart,
      cur: (res.locals.t ? res.locals.t('pharmacy.currency') : 'ج.م'),
      merchantName: company.company_name || company.slug,
    });

    await logTurn(out.reply, out.tokens || 0);

    // Store only "pure answer" turns — ones that produced NO cart mutation — so a
    // cached reply is always safe to replay verbatim for the next customer. An
    // order-building turn (add_to_cart / update_cart / checkout) is never cached.
    if (cacheKey && out.reply && !out.cart.length && !(out.updates || []).length && !out.checkout) {
      aiReplyCache.put(pool, cacheNs, cacheKey, { reply: out.reply }).catch(() => {});
    }

    res.json({ ok: true, reply: out.reply, cart: out.cart, updates: out.updates || [], checkout: !!out.checkout });
  } catch (e) {
    const st = e && e.status;
    // 429 = Groq daily/rate limit reached (common on the free tier under heavy
    // testing); 401/403 = key problem. Give the customer a clear, graceful
    // message and let them keep ordering from the menu directly.
    if (st === 429) {
      console.error('[ai assistant] Groq RATE/QUOTA (429) — daily limit likely reached:', e.message);
      return res.status(503).json({ ok: false, error: say('المساعد الذكي وصل للحد اليومي دلوقتي — تقدر تطلب من المنيو مباشرة، أو جرّب المساعد كمان شوية.', 'The assistant hit its daily limit — please order from the menu directly or try again later.') });
    }
    if (st === 401 || st === 403) {
      console.error('[ai assistant] Groq AUTH error (' + st + ') — check GROQ_API_KEY:', e.message);
      return res.status(503).json({ ok: false, error: say('المساعد مش متاح دلوقتي — تقدر تطلب من المنيو مباشرة.', 'The assistant is unavailable right now — please order from the menu directly.') });
    }
    console.error('[ai assistant]', st ? ('Groq ' + st + ': ') : '', e.message);
    res.status(502).json({ ok: false, error: say('حصل خطأ مؤقت، جرّب تاني.', 'A temporary error occurred, please try again.') });
  }
});

// Upsell suggestions (PAID, part of the AI subscription). Given the cart's item
// ids, suggest a few complementary items from the SAME merchant's menu — from
// categories not already in the cart. Pure menu-driven (no invented content).
router.get('/order/food/upsell', foodOrderGuard, async (req, res) => {
  const company = req.tenant;
  try {
    const sub = await loadAiSub(company.id);
    if (!aiSubActive(sub) || sub.upsell_enabled === false) return res.json({ items: [] });
    const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 40);
    if (!ids.length) return res.json({ items: [] });
    // Outlets + categories already represented in the cart.
    const ctx = (await pool.query(
      `SELECT fi.id, fi.outlet_id, fi.category_id
       FROM food_items fi JOIN food_outlets fo ON fo.id = fi.outlet_id
       WHERE fo.company_id = $1 AND fi.id = ANY($2::int[])`, [company.id, ids]
    )).rows;
    if (!ctx.length) return res.json({ items: [] });
    const outletIds = [...new Set(ctx.map((r) => r.outlet_id))];
    const cartCats = new Set(ctx.map((r) => r.category_id));
    // Candidate items from the same outlets, not already in the cart, available.
    const cands = (await pool.query(
      `SELECT fi.id, fi.name, fi.name_ar, fi.price, fi.category_id, fi.outlet_id
       FROM food_items fi
       WHERE fi.outlet_id = ANY($1::int[]) AND fi.is_available = true AND fi.id <> ALL($2::int[])
       ORDER BY fi.sort_order, fi.id`, [outletIds, ids]
    )).rows;
    // Prefer items whose category is NOT in the cart (complementary), else any.
    const complementary = cands.filter((c) => !cartCats.has(c.category_id));
    const pick = (complementary.length ? complementary : cands).slice(0, 3);
    const lang = res.locals.lang === 'en' ? 'en' : 'ar';
    res.json({
      items: pick.map((c) => ({
        id: c.id,
        name: (lang === 'en' && c.name) ? c.name : (c.name_ar || c.name),
        price: Number(c.price) || 0,
        outlet: c.outlet_id,
      })),
    });
  } catch (e) { console.error('[upsell]', e.message); res.json({ items: [] }); }
});

// Create a food order from the client cart (COD). Prices are re-read from the
// DB (never trusted from the client) and min-order is enforced per outlet.
router.post('/order/food', foodOrderGuard, async (req, res) => {
  const company = req.tenant;
  let cart;
  try { cart = JSON.parse(req.body.cart || '[]'); } catch (e) { cart = []; }
  // The chosen modifiers ride along per line; the server prices them.
  cart = foodOptions.normalizeCart(cart);
  const name = String(req.body.customer_name || '').trim().slice(0, 100);
  const phone = String(req.body.phone || '').trim().slice(0, 30);
  const address = String(req.body.address || '').trim().slice(0, 300);
  const notes = String(req.body.notes || '').trim().slice(0, 500);
  const orderType = foodOptions.typeOf(req.body.order_type);
  const tableNo = String(req.body.table_no || '').trim().slice(0, 20);
  if (!cart.length || !name || phone.length < 6) return res.redirect('/?err=order');
  // An address is a delivery's business. Asking a customer who is collecting
  // for one is how this system used to work, and it was wrong in both
  // directions: it demanded what it did not need and charged for what it was
  // not doing.
  if (foodOptions.needsAddress(orderType) && !address) return res.redirect('/?err=address');
  if (foodOptions.needsTable(orderType) && !tableNo) return res.redirect('/?err=table');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = cart.map(i => i.id);
    const rows = (await client.query(
      `SELECT fi.id, fi.name, fi.name_ar, fi.price, fi.outlet_id, fo.delivery_fee, fo.min_order,
              fo.allow_delivery, fo.allow_pickup, fo.allow_dine_in
       FROM food_items fi JOIN food_outlets fo ON fo.id = fi.outlet_id
       WHERE fi.id = ANY($1) AND fo.company_id = $2 AND fi.is_available = true AND fo.is_active = true`,
      [ids, company.id]
    )).rows;
    const byId = {}; rows.forEach(r => { byId[r.id] = r; });

    // The option groups for exactly the items in this cart, with their values.
    // Read here rather than trusted from the browser: the client says WHICH
    // options were chosen, this says what they cost and whether they even
    // belong to that item.
    const optRows = (await client.query(
      `SELECT o.id AS option_id, o.item_id, o.name AS group_name, o.required, o.min_select, o.max_select,
              v.id AS value_id, v.name AS value_name, v.price_delta
         FROM food_item_options o
         LEFT JOIN food_item_option_values v ON v.option_id = o.id
        WHERE o.item_id = ANY($1)
        ORDER BY o.sort_order, o.id, v.sort_order, v.id`,
      [ids]
    )).rows;
    const groupsByItem = {};
    for (const r of optRows) {
      const list = (groupsByItem[r.item_id] = groupsByItem[r.item_id] || []);
      let g = list.find((x) => x.id === r.option_id);
      if (!g) {
        g = { id: r.option_id, name: r.group_name, required: r.required === true,
          min_select: r.min_select, max_select: r.max_select, values: [] };
        list.push(g);
      }
      if (r.value_id) g.values.push({ id: r.value_id, name: r.value_name, price_delta: r.price_delta });
    }

    let subtotal = 0; const outSub = {}; const outFee = {}; const lineItems = [];
    let optionError = null;
    for (const it of cart) {
      const r = byId[it.id]; if (!r) continue;
      const priced = foodOptions.priceLine(r, groupsByItem[r.id] || [], it.opts);
      if (!priced.ok) { optionError = priced.why; break; }
      const line = priced.price * it.q; subtotal += line;
      outSub[r.outlet_id] = (outSub[r.outlet_id] || 0) + line;
      outFee[r.outlet_id] = Number(r.delivery_fee) || 0;
      lineItems.push({
        id: r.id, name: (r.name_ar || r.name), qty: it.q, price: priced.price,
        outlet: r.outlet_id, options: priced.chosen,
      });
    }
    if (optionError) {
      // Refusing beats quietly serving a large at the small price, or cooking
      // something nobody chose.
      await client.query('ROLLBACK');
      return res.redirect('/?err=' + (optionError === 'unknown_option' ? 'option' : 'option_' + optionError));
    }
    if (!lineItems.length) { await client.query('ROLLBACK'); return res.redirect('/?err=order'); }
    // One order belongs to one branch. A cart mixing two outlets was stored
    // under `lineItems[0].outlet`: the first branch's kitchen got a ticket for
    // food it does not make, and the second branch never saw the order at all —
    // while the customer was charged both branches' delivery fees. Refusing is
    // the honest fix; splitting one basket into two orders with two deliveries
    // is not what the customer pressed the button for.
    const outletIds = Object.keys(outSub);
    if (outletIds.length > 1) {
      await client.query('ROLLBACK');
      return res.redirect('/?err=multibranch');
    }
    for (const oid of Object.keys(outSub)) {
      const r = rows.find(x => String(x.outlet_id) === String(oid));
      if (r && Number(r.min_order) > 0 && outSub[oid] < Number(r.min_order)) {
        await client.query('ROLLBACK'); return res.redirect('/?err=minorder');
      }
    }
    // Pickup and dine-in pay no delivery fee — the whole point of choosing them.
    // For a delivery, the area decides: a branch with zones charges the zone's
    // fee, one without keeps its single flat fee exactly as before.
    let zone = null;
    let flatFee = Object.keys(outFee).reduce((s, k) => s + outFee[k], 0);
    if (foodOptions.typeOf(orderType) === 'delivery') {
      const zoneRows = (await client.query(
        `SELECT * FROM food_zones WHERE company_id=$1 AND is_active=true
           AND (outlet_id IS NULL OR outlet_id = $2) ORDER BY name`,
        [company.id, Number(outletIds[0])]
      )).rows;
      const q = foodDelivery.quote(zoneRows, req.body.zone_id, flatFee, subtotal);
      if (!q.ok) {
        // A missing or unknown area used to mean free delivery anywhere. It is
        // a refusal now, the same as the shop's checkout.
        await client.query('ROLLBACK');
        return res.redirect('/?err=' + q.why);
      }
      flatFee = q.fee;
      zone = q.zone;
    }
    const deliveryFee = foodOptions.feeFor(orderType, flatFee);
    // And the outlet has to actually offer what was asked for.
    const outletRow = rows.find((x) => String(x.outlet_id) === String(outletIds[0]));
    if (!foodOptions.offers(outletRow, orderType)) {
      await client.query('ROLLBACK');
      return res.redirect('/?err=ordertype');
    }
    let cp = await validateFoodCoupon(client, company.id, req.body.coupon, subtotal);
    // Claim the use BEFORE pricing the order, and claim it conditionally.
    // Validating and then incrementing left a window where two customers both
    // read used_count = 9 against a limit of 10 and both got the discount —
    // "last 10 orders" quietly became "however many arrive in the same second".
    // The UPDATE re-checks the limit in its own WHERE, so exactly one wins.
    if (cp.ok) {
      const claim = await client.query(
        `UPDATE food_coupons SET used_count = used_count + 1
          WHERE id = $1 AND company_id = $2
            AND (usage_limit IS NULL OR usage_limit <= 0 OR used_count < usage_limit)
          RETURNING used_count`,
        [cp.coupon.id, company.id]
      );
      // Lost the race: the order still goes through, at full price, rather than
      // failing on the customer for something they did not do.
      if (!claim.rowCount) cp = { ok: false, discount: 0 };
    }
    const discount = cp.ok ? cp.discount : 0;
    const total = Math.max(0, subtotal + deliveryFee - discount);
    const token = crypto.randomBytes(9).toString('hex');
    const ord = (await client.query(
      `INSERT INTO food_orders (company_id, outlet_id, customer_name, status, total, delivery_fee, delivery_address, phone, notes, coupon_code, discount_amount, track_token, order_type, table_no, zone_id, zone_name)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [company.id, Number(outletIds[0]), name, total, deliveryFee,
       foodOptions.needsAddress(orderType) ? (address || null) : null, phone, notes || null,
       cp.ok ? cp.coupon.code : null, discount, token, orderType,
       foodOptions.needsTable(orderType) ? tableNo : null,
       zone ? zone.id : null, zone ? zone.name : null]
    )).rows[0];
    for (const li of lineItems) {
      await client.query(
        `INSERT INTO food_order_items (order_id, item_id, name_snapshot, quantity, price, options)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [ord.id, li.id, li.name, li.qty, li.price, JSON.stringify(li.options || [])]
      );
    }
    await client.query(`INSERT INTO food_order_events (order_id, status, note) VALUES ($1,'pending','created')`, [ord.id]);
    // The kitchen's shelf follows the order, in the same transaction. A
    // restaurant that tracks ingredients wants them gone when the order is
    // taken, not when somebody remembers; one that does not track any has no
    // recipes and this does nothing at all.
    //
    // Deliberately NOT wrapped in its own try/catch: a failed statement aborts
    // the whole Postgres transaction, so "swallow the error and carry on" would
    // produce an order that cannot commit — the worst of both. Either the order
    // and its stock movement both happen, or neither does.
    const recipeRows = (await client.query(
      'SELECT item_id, ingredient_id, qty FROM food_recipes WHERE item_id = ANY($1)',
      [lineItems.map((l) => l.id)]
    )).rows;
    if (recipeRows.length) {
      const byItem = {};
      for (const r of recipeRows) (byItem[r.item_id] = byItem[r.item_id] || []).push(r);
      const need = foodIngredients.needFor(lineItems, byItem);
      if (need.size) await foodIngredients.consume(client, company.id, ord.id, need);
    }
    await client.query('COMMIT');
    push.sendToCompany(company.id, { title: '🛎️ طلب جديد', body: 'طلب جديد من ' + name, url: '/food' }, 'order')
      .catch(e => console.error('[food order push] ' + e.message));
    res.redirect('/order/food/' + token);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('food order error:', e.message);
    res.redirect('/?err=order');
  } finally { client.release(); }
});

// Order confirmation page.
router.get('/order/food/:token', foodOrderGuard, async (req, res) => {
  const company = req.tenant;
  try {
    const ord = (await pool.query(
      'SELECT * FROM food_orders WHERE track_token = $1 AND company_id = $2', [req.params.token, company.id]
    )).rows[0];
    if (!ord) return res.redirect('/');
    const items = (await pool.query('SELECT * FROM food_order_items WHERE order_id = $1', [ord.id])).rows;
    const reviewed = (await pool.query('SELECT 1 FROM food_reviews WHERE order_id = $1 LIMIT 1', [ord.id])).rows.length > 0;
    const paySettings = await loadPaySettings(pool, company.id);
    const canPayOnline = gatewayReady(paySettings) && ord.payment_status !== 'paid';
    res.render('orders/confirm', {
      company, order: ord, items, noindex: true,
      reviewed: reviewed || req.query.reviewed === '1',
      canPayOnline, payUrl: '/order/food/pay/' + ord.track_token,
    });
  } catch (e) { console.error('food confirm error:', e.message); res.status(500).send('Error.'); }
});

// Live status for the customer tracking page (polled).
router.get('/order/food/:token/status', foodOrderGuard, async (req, res) => {
  try {
    const ord = (await pool.query(
      'SELECT status FROM food_orders WHERE track_token = $1 AND company_id = $2', [req.params.token, req.tenant.id]
    )).rows[0];
    if (!ord) return res.status(404).json({ ok: false });
    res.json({ ok: true, status: ord.status });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// Customer rating for a delivered order (one review per order).
router.post('/order/food/:token/review', foodOrderGuard, async (req, res) => {
  try {
    const ord = (await pool.query(
      'SELECT id, outlet_id, status FROM food_orders WHERE track_token = $1 AND company_id = $2', [req.params.token, req.tenant.id]
    )).rows[0];
    // Server-side enforcement of the UI's delivered-only rule: reviews are only
    // accepted for delivered orders, so an attacker can't place a throwaway COD
    // order and immediately spam ratings to skew the public aggregateRating.
    if (!ord || ord.status !== 'delivered') return res.redirect('/order/food/' + req.params.token);
    const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 0));
    if (rating >= 1) {
      const ex = await pool.query('SELECT 1 FROM food_reviews WHERE order_id = $1 LIMIT 1', [ord.id]);
      if (!ex.rows.length) {
        await pool.query('INSERT INTO food_reviews (outlet_id, order_id, rating, comment) VALUES ($1,$2,$3,$4)',
          [ord.outlet_id, ord.id, rating, (req.body.comment || '').trim().slice(0, 500) || null]);
      }
    }
    res.redirect('/order/food/' + req.params.token + '?reviewed=1');
  } catch (e) { console.error('food review error:', e.message); res.redirect('/order/food/' + req.params.token); }
});

// ── Live product search API (Amazon roadmap phase 1) ─────────────────────────
// JSON autocomplete for the shop storefront. Tenant-scoped (req.tenant), active
// products only, matches name/name_ar/description. Returns up to 10 with a
// thumbnail + price so the client can render a suggestions dropdown.
router.get('/api/search', async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'shop') return res.json({ items: [] });
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 1) return res.json({ items: [] });
  try {
    const like = '%' + q + '%';
    const rows = (await pool.query(
      `SELECT id, name, name_ar, price, image_url FROM products
       WHERE company_id = $1 AND is_active = true
         AND (name ILIKE $2 OR name_ar ILIKE $2 OR description ILIKE $2)
       ORDER BY (name ILIKE $3) DESC, sold_count DESC NULLS LAST, created_at DESC
       LIMIT 10`,
      [company.id, like, q + '%']
    )).rows;
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name_ar || r.name,
        price: Number(r.price) || 0,
        image: r.image_url || '',
      })),
    });
  } catch (e) { console.error('[shop search]', e.message); res.json({ items: [] }); }
});

// ── Product feed for Facebook Catalog / Google Merchant (phase 24) ───────────
router.get('/feed.xml', async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'shop') return res.status(404).send('Not found');
  const xesc = (s) => String(s || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  const base = 'https://' + company.slug + '.oscardevs.com';
  try {
    const rows = (await pool.query(
      'SELECT id, name, name_ar, description, description_ar, price, image_url, stock FROM products WHERE company_id=$1 AND is_active=true ORDER BY id',
      [company.id]
    )).rows;
    // The feed used to say EGP for every store. A store selling in SAR had its
    // prices read as Egyptian pounds — Google Merchant rejects the mismatch,
    // and Facebook Catalog silently imports the wrong number, which is worse.
    // g:price wants an ISO-4217 code, so anything that is not three letters
    // falls back rather than shipping "ج.م" into an XML feed.
    const raw = String(company.currency || '').trim().toUpperCase();
    const cur = /^[A-Z]{3}$/.test(raw) ? raw : 'EGP';
    const items = rows.map((p) => {
      const name = p.name_ar || p.name || '';
      const desc = (p.description_ar || p.description || name).slice(0, 4000);
      const img = p.image_url ? (p.image_url.startsWith('http') ? p.image_url : base + p.image_url) : '';
      return [
        '  <item>',
        `    <g:id>${p.id}</g:id>`,
        `    <g:title>${xesc(name)}</g:title>`,
        `    <g:description>${xesc(desc)}</g:description>`,
        `    <g:link>${base}/shop/${company.slug}/product/${p.id}</g:link>`,
        img ? `    <g:image_link>${xesc(img)}</g:image_link>` : '',
        `    <g:availability>${p.stock > 0 ? 'in stock' : 'out of stock'}</g:availability>`,
        `    <g:price>${Number(p.price).toFixed(2)} ${cur}</g:price>`,
        '    <g:condition>new</g:condition>',
        '  </item>',
      ].filter(Boolean).join('\n');
    }).join('\n');
    res.type('application/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n<channel>\n' +
      `<title>${xesc(company.company_name)}</title>\n<link>${base}/</link>\n<description>${xesc(company.company_name)} — كتالوج المنتجات</description>\n` +
      items + '\n</channel>\n</rss>\n'
    );
  } catch (e) { console.error('[feed]', e.message); res.status(500).send('error'); }
});

// ── Product comparison (Amazon roadmap phase 9) ──────────────────────────────
router.get('/compare', async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'shop') return res.redirect('/');
  const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 4);
  let products = [];
  if (ids.length) {
    try {
      products = (await pool.query(
        `SELECT p.*, c.name AS category_name FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE p.company_id=$1 AND p.is_active=true AND p.id = ANY($2::int[])`,
        [company.id, ids]
      )).rows;
      // preserve the requested order
      products.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    } catch (e) { console.error('[compare]', e.message); }
  }
  res.render('shop/compare', { company, products, noindex: true, showAds: false });
});


// ── Public enquiry from a hall's page ────────────────────────────────────────
//
// The one form on the page, and the reason the page exists. Rate limited and
// honeypotted like every other public write: this creates a row and a
// follow-up task, so a bot loose on it fills the hall's morning with noise.
// _rl is already imported above for the coupon limiter. Keyed per tenant as
// well as per IP so one busy hall cannot throttle another's enquiries.
const hallEnquiryLimiter = _rl({
  name: 'hall-enquiry', windowMs: 60 * 60000, max: 6,
  keyFn: (req) => ((req.tenant && req.tenant.id) || 'h') + '|' + _cip(req),
});

router.post('/enquire', hallEnquiryLimiter, async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'hall') return res.redirect('/');
  const b = req.body || {};

  // Same pair /apply and /contact use: answer success either way so the bot
  // stops retrying instead of learning what to avoid.
  const bot = String(b.website || '').trim()
    || (Number(b.ft) && Date.now() - Number(b.ft) < 2500);
  if (bot) return res.redirect('/?enquired=1');

  const clip = (v, n) => { const s2 = String(v == null ? '' : v).trim().slice(0, n); return s2 || null; };
  const name = clip(b.name, 120);
  const phone = clip(b.phone, 40);
  if (!name || !phone) return res.redirect('/');

  try {
    await pool.query(
      `INSERT INTO hall_enquiries (company_id, name, phone, whatsapp, event_date, event_type,
                                   guests, budget, note, source, next_action_on)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,'website', CURRENT_DATE)`,
      [company.id, name, phone,
       /^\d{4}-\d{2}-\d{2}$/.test(String(b.event_date || '')) ? b.event_date : null,
       clip(b.event_type, 60),
       Number.isFinite(parseInt(b.guests, 10)) ? parseInt(b.guests, 10) : null,
       Number.isFinite(Number(b.budget)) && Number(b.budget) > 0 ? Number(b.budget) : null,
       clip(b.note, 1000)]
    );
  } catch (e) {
    // A failed insert must not lose the family. Log it and still thank them —
    // the phone number is on the page and they will use it.
    console.error('[hall enquiry]', e.message);
  }
  res.redirect('/?enquired=1');
});

// ── Public enrolment enquiry from a nursery's page ───────────────────────────
//
// Same shape and the same protections as the hall's. Its own limiter rather
// than a shared one, because a nursery and a hall on the same server should
// never be able to exhaust each other's quota.
const nurseryEnrolLimiter = _rl({
  name: 'nursery-enrol', windowMs: 60 * 60000, max: 6,
  keyFn: (req) => ((req.tenant && req.tenant.id) || 'n') + '|' + _cip(req),
});

router.post('/enrol', nurseryEnrolLimiter, async (req, res) => {
  const company = req.tenant;
  if (!company || company.page_type !== 'nursery') return res.redirect('/');
  const b = req.body || {};

  const bot = String(b.website || '').trim()
    || (Number(b.ft) && Date.now() - Number(b.ft) < 2500);
  if (bot) return res.redirect('/?enquired=1');

  const clip = (v, n) => { const s2 = String(v == null ? '' : v).trim().slice(0, n); return s2 || null; };
  const name = clip(b.name, 120);
  const phone = clip(b.phone, 40);
  if (!name || !phone) return res.redirect('/');

  try {
    await pool.query(
      `INSERT INTO nursery_enquiries (company_id, name, phone, whatsapp, child_name,
                                      child_age, interest, note, source, next_action_on)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'website', CURRENT_DATE)`,
      [company.id, name, phone, clip(b.child_name, 120), clip(b.child_age, 40),
       clip(b.interest, 120), clip(b.note, 1000)]
    );
  } catch (e) {
    // Never lose the parent over a database error — thank them and let the
    // phone number on the page do the rest.
    console.error('[nursery enrol]', e.message);
  }
  res.redirect('/?enquired=1');
});

module.exports = router;
