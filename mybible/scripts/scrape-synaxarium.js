/**
 * Coptic Synaxarium Scraper — copticchurch.net
 *
 * HOW TO USE:
 * 1. Open https://www.copticchurch.net/synaxarium in your browser
 * 2. Press F12 → Console tab
 * 3. Paste this entire script and press Enter
 * 4. Wait ~10 minutes while it fetches all 365 days
 * 5. A file "synaxarium.json" will download automatically
 */

(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  const COPTIC_MONTHS = [
    { num: 1,  name: 'توت',     days: 30 },
    { num: 2,  name: 'بابه',    days: 30 },
    { num: 3,  name: 'هاتور',   days: 30 },
    { num: 4,  name: 'كيهك',    days: 30 },
    { num: 5,  name: 'طوبه',    days: 30 },
    { num: 6,  name: 'أمشير',   days: 30 },
    { num: 7,  name: 'برمهات',  days: 30 },
    { num: 8,  name: 'برموده',  days: 30 },
    { num: 9,  name: 'بشنس',    days: 30 },
    { num: 10, name: 'بؤونه',   days: 30 },
    { num: 11, name: 'أبيب',    days: 30 },
    { num: 12, name: 'مسرى',    days: 30 },
    { num: 13, name: 'نسيء',    days: 6  },
  ];

  // ── Step 1: detect URL pattern from the current page ──────────────────────
  async function detectUrlPattern() {
    // Try pattern A: ?m=1&d=1
    let res = await fetch('/synaxarium?m=1&d=1');
    if (res.ok) return (m, d) => `/synaxarium?m=${m}&d=${d}`;

    // Try pattern B: /synaxarium/tout/1  (English month names)
    const ENGLISH = ['','tout','baba','hathor','kiahk','toba','amshir',
                     'baramhat','baramouda','bashans','paona','epep','mesra','nasie'];
    res = await fetch(`/synaxarium/${ENGLISH[1]}/1`);
    if (res.ok) return (m, d) => `/synaxarium/${ENGLISH[m]}/${d}`;

    // Try pattern C: /synaxarium/1/1
    res = await fetch('/synaxarium/1/1');
    if (res.ok) return (m, d) => `/synaxarium/${m}/${d}`;

    // Fallback: use the navigation link on current page
    const nextLink = document.querySelector('a[href*="synaxar"]');
    if (nextLink) {
      const href = nextLink.getAttribute('href');
      console.warn('Auto-detection uncertain. Detected sample link:', href);
      console.warn('Please inspect it and update the script manually if needed.');
    }

    throw new Error('Could not detect URL pattern. Make sure you are on https://www.copticchurch.net/synaxarium');
  }

  // ── Step 2: parse one page's HTML into entries ────────────────────────────
  function parsePage(html, monthNum, day) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const entries = [];

    // Common structure: each saint/feast is a heading followed by paragraph(s)
    // Try multiple selector strategies

    // Strategy A: <h3> or <h4> headings as titles, next <p> siblings as descriptions
    const headings = doc.querySelectorAll('h3, h4, .synaxar-title, .saint-title');
    if (headings.length > 0) {
      headings.forEach(h => {
        const name = h.textContent.trim();
        if (!name) return;
        let desc = '';
        let sibling = h.nextElementSibling;
        while (sibling && !['H3','H4'].includes(sibling.tagName)) {
          desc += sibling.textContent.trim() + ' ';
          sibling = sibling.nextElementSibling;
        }
        entries.push({ name, description: desc.trim(), type: guessType(name) });
      });
      if (entries.length > 0) return entries;
    }

    // Strategy B: look for <strong> or <b> as title within paragraphs
    const paragraphs = doc.querySelectorAll('p');
    paragraphs.forEach(p => {
      const bold = p.querySelector('strong, b');
      if (bold) {
        const name = bold.textContent.trim();
        const rest = p.textContent.replace(bold.textContent, '').trim();
        if (name) entries.push({ name, description: rest, type: guessType(name) });
      }
    });
    if (entries.length > 0) return entries;

    // Strategy C: entire page text as one entry (fallback)
    const body = doc.querySelector('.synaxar-content, #content, main, body');
    const text = body ? body.textContent.trim() : '';
    if (text.length > 50) {
      entries.push({ name: `بؤونة ${day} - محتوى كامل`, description: text.slice(0, 2000), type: 'أخرى' });
    }

    return entries;
  }

  function guessType(name) {
    if (/ملاك|ميخائيل|جبرائيل|رفائيل/.test(name)) return 'ملاك';
    if (/رسول|بطرس|بولس|يوحنا الرسول|متى|مرقس|لوقا|يعقوب/.test(name)) return 'رسول';
    if (/نبي|إيليا|موسى|داود|إشعياء|إرميا/.test(name)) return 'نبي';
    if (/البابا|بطريرك|البطريرك/.test(name)) return 'بابا';
    if (/أسقف|مطران/.test(name)) return 'أسقف';
    if (/الشهيدة|مرتيرة/.test(name)) return 'شهيدة';
    if (/شهيد|مرتير|استشهاد/.test(name)) return 'شهيد';
    if (/الراهبة|راهبة/.test(name)) return 'راهبة';
    if (/راهب|ناسك|أنبا/.test(name)) return 'راهب';
    if (/القديسة|السيدة/.test(name)) return 'قديسة';
    if (/عيد|تدشين|كاتدرائية/.test(name)) return 'عيد';
    return 'قديس';
  }

  // ── Step 3: main loop ──────────────────────────────────────────────────────
  console.log('🔍 Detecting URL pattern...');
  let urlFn;
  try {
    urlFn = await detectUrlPattern();
    console.log('✅ URL pattern detected.');
  } catch (e) {
    console.error('❌', e.message);
    return;
  }

  const results = [];
  let done = 0;
  const total = COPTIC_MONTHS.reduce((s, m) => s + m.days, 0);

  for (const month of COPTIC_MONTHS) {
    for (let day = 1; day <= month.days; day++) {
      const url = urlFn(month.num, day);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const entries = parsePage(html, month.num, day);
        results.push({ month: month.num, monthName: month.name, day, entries });
      } catch (err) {
        console.warn(`⚠️  ${month.name} ${day}: ${err.message}`);
        results.push({ month: month.num, monthName: month.name, day, entries: [], error: err.message });
      }

      done++;
      if (done % 10 === 0) console.log(`📖 ${done}/${total} days fetched...`);

      await delay(400); // polite delay — ~2.5 requests/sec
    }
  }

  // ── Step 4: download result ────────────────────────────────────────────────
  const json = JSON.stringify(results, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'synaxarium-copticchurch.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log(`✅ Done! ${results.length} days saved to synaxarium-copticchurch.json`);
  console.log(`📊 Total entries: ${results.reduce((s, r) => s + r.entries.length, 0)}`);
})();
