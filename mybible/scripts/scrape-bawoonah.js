/**
 * Scrape بؤونة from st-takla.org
 *
 * HOW TO USE:
 * 1. Open any page on https://st-takla.org in your browser
 * 2. Press F12 → Console
 * 3. Paste this script and press Enter
 * 4. Wait ~2 minutes, then a file "bawoonah.json" will download
 */

(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const BASE = 'https://st-takla.org/Full-Free-Coptic-Books/Synaxarium-or-Synaxarion/10-Bawoonah';
  const results = [];

  function guessType(name) {
    if (/ملاك|ميخائيل|جبرائيل|رفائيل/.test(name)) return 'ملاك';
    if (/رسول|بطرس|بولس|يوحنا الرسول|مرقس|متى|لوقا|يعقوب/.test(name)) return 'رسول';
    if (/نبي|إيليا|موسى|داود|إشعياء/.test(name)) return 'نبي';
    if (/البابا|البطريرك/.test(name)) return 'بابا';
    if (/أسقف|مطران/.test(name)) return 'أسقف';
    if (/الشهيدة|استشهاد.*ة/.test(name)) return 'شهيدة';
    if (/شهيد|استشهاد/.test(name)) return 'شهيد';
    if (/راهبة/.test(name)) return 'راهبة';
    if (/راهب|ناسك|أنبا/.test(name)) return 'راهب';
    if (/عيد|تدشين|ظهور/.test(name)) return 'عيد';
    if (/قديسة/.test(name)) return 'قديسة';
    return 'قديس';
  }

  function parsePage(html, day) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const entries = [];

    // st-takla uses <h2> or <h3> for saint names, <p> for descriptions
    const headings = [...doc.querySelectorAll('h2, h3, .Tittle2, .Title2')];

    headings.forEach(h => {
      const name = h.textContent.trim().replace(/^\d+[\-\.\s]+/, '').trim();
      if (!name || name.length < 3) return;

      // collect description from following siblings until next heading
      let desc = '';
      let el = h.nextElementSibling;
      let count = 0;
      while (el && !['H2','H3'].includes(el.tagName) && count < 5) {
        const t = el.textContent.trim();
        if (t.length > 10) desc += t + ' ';
        el = el.nextElementSibling;
        count++;
      }

      entries.push({
        name,
        description: desc.trim().slice(0, 300),
        type: guessType(name)
      });
    });

    // Fallback: look for <b> or <strong> in paragraphs
    if (entries.length === 0) {
      doc.querySelectorAll('p').forEach(p => {
        const bold = p.querySelector('b, strong');
        if (!bold) return;
        const name = bold.textContent.trim();
        const desc = p.textContent.replace(bold.textContent, '').trim().slice(0, 300);
        if (name.length > 3) entries.push({ name, description: desc, type: guessType(name) });
      });
    }

    return entries;
  }

  console.log('🚀 Starting بؤونة scrape from st-takla.org...');

  for (let day = 1; day <= 30; day++) {
    const url = `${BASE}/${day}-Bawoonah.html`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const entries = parsePage(html, day);
      results.push({ day, entries });
      console.log(`✅ بؤونة ${day}: ${entries.length} تذكار`);
    } catch (err) {
      console.warn(`⚠️  بؤونة ${day}: ${err.message}`);
      results.push({ day, entries: [], error: err.message });
    }
    await delay(600);
  }

  // Download
  const json = JSON.stringify({ month: 10, monthName: 'بؤونه', days: results }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bawoonah.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  console.log(`✅ Done! ${results.length} days | ${results.reduce((s,r)=>s+r.entries.length,0)} total entries`);
  console.log('📥 File downloaded: bawoonah.json');
})();
