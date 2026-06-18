require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// عملاء محتملون مجمّعون من حملات التواصل (CRM).
// Idempotent: يتخطّى أي عميل رقمه موجود بالفعل. يُحدَّث كل ما نجيب عملاء جدد.
const LEADS = [
  { name: 'إسراء محمد', phone: '01010959964', business_name: 'هاند ميد وهدايا', category: 'هاند ميد', link: '', source: 'فيسبوك/بحث', status: 'converted', notes: 'قدّمت طلب واتفعّلت — متجر hand. إيميل me1720011@gmail.com' },
  { name: 'OS Handmade', phone: '01117946381', business_name: 'OS Handmade — ديكور وهاند ميد', category: 'هاند ميد/ديكور', link: 'instagram.com/oshandmade_', source: 'إنستجرام/بحث', status: 'interested', notes: 'ردّت "ماشي" واستغربت مجاني — اتبعتلها مثال delta' },
  { name: 'بيت الهنا', phone: '01108744638', business_name: 'بيت الهنا للأدوات المنزلية', category: 'أدوات منزلية', link: 'instagram.com/beitelhana2025', source: 'إنستجرام/بحث', status: 'contacted', notes: 'محل في النزهة الجديدة، تشكيلة كبيرة' },
  { name: 'Naomi Soap', phone: '01065524426', business_name: 'Naomi Soap — صابون هاند ميد', category: 'صابون/عناية', link: 'instagram.com/naomi_soap_09', source: 'إنستجرام/بحث', status: 'interested', notes: 'استغربت مجاني وسألت بكام — اتبعتلها مثال delta' },
];

async function run() {
  const c = await pool.connect();
  let added = 0, skipped = 0;
  try {
    for (const l of LEADS) {
      const ex = await c.query('SELECT 1 FROM crm_leads WHERE phone = $1', [l.phone]);
      if (ex.rows.length) { skipped++; continue; }
      await c.query(
        `INSERT INTO crm_leads (name, phone, business_name, category, link, source, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [l.name, l.phone, l.business_name, l.category, l.link || null, l.source, l.status, l.notes]
      );
      added++;
    }
    console.log(`CRM seed done: added ${added}, skipped ${skipped}`);
  } catch (e) {
    console.error('CRM seed error:', e.message, '\n(تأكد إنك شغّلت npm run db:schema الأول)');
  } finally {
    c.release();
    await pool.end();
  }
}

run();
