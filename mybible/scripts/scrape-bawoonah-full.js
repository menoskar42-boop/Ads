/**
 * Scrape بؤونة FULL TEXT from st-takla.org  (v3 — main-content heuristic)
 *
 * HOW TO USE:
 * 1. Open https://st-takla.org in your browser
 * 2. Press F12 → Console
 * 3. Paste this script and press Enter
 * 4. Wait ~3 minutes → file "bawoonah-full.json" downloads automatically
 */

(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const BASE = 'https://st-takla.org/Full-Free-Coptic-Books/Synaxarium-or-Synaxarion/10-Bawoonah';
  const results = [];

  // Fetch a page trying both URL formats, decoded as windows-1256
  async function fetchPage(day) {
    const variants = [
      `${BASE}/${String(day).padStart(2, '0')}-Bawoonah.html`,
      `${BASE}/${day}-Bawoonah.html`,
    ];
    for (const url of variants) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        // Try UTF-8 first; if it has replacement chars, fall back to windows-1256
        let txt = new TextDecoder('utf-8').decode(buf);
        if (txt.includes('�') || /Ø|Ù|Ã/.test(txt.slice(0, 2000))) {
          txt = new TextDecoder('windows-1256').decode(buf);
        }
        if (txt.includes('no longer exists') || txt.includes('غير متاح في الموقع')) continue;
        return txt;
      } catch {}
    }
    return null;
  }

  // Extract the main article container: the element with the most Arabic text
  // and the fewest links (to exclude nav/menus/footers).
  function extractMainText(doc) {
    const candidates = [...doc.querySelectorAll('div, td, article, section, main')];
    let best = null, bestScore = -Infinity;

    for (const el of candidates) {
      const text = el.textContent || '';
      const arabicChars = (text.match(/[؀-ۿ]/g) || []).length;
      const linkCount = el.querySelectorAll('a').length;
      // Skip tiny blocks
      if (arabicChars < 200) continue;
      // Score: lots of Arabic text, penalize link-heavy nav blocks
      const score = arabicChars - linkCount * 80;
      if (score > bestScore) { bestScore = score; best = el; }
    }

    if (!best) return '';

    // Pull paragraph-level text from the best container, preserving breaks
    const blocks = [];
    const walker = best.querySelectorAll('p, h1, h2, h3, h4, li, blockquote');
    if (walker.length > 0) {
      walker.forEach(node => {
        const t = node.textContent.trim().replace(/\s+/g, ' ');
        if (t.length > 2) blocks.push(t);
      });
    } else {
      blocks.push(best.textContent.trim());
    }

    return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  console.log('🚀 Scraping بؤونة full text from st-takla.org...');

  for (let day = 1; day <= 30; day++) {
    const html = await fetchPage(day);
    if (!html) {
      console.warn(`⚠️  بؤونة ${day}: page not found`);
      results.push({ day, rawText: '', error: 'not found' });
      await delay(700);
      continue;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Remove noise elements
    doc.querySelectorAll('script, style, nav, header, footer, .menu, .nav, [class*="enu"]').forEach(n => n.remove());

    const rawText = extractMainText(doc);
    results.push({ day, rawText });
    console.log(`✅ بؤونة ${day}: ${rawText.length.toLocaleString()} حرف`);
    await delay(700);
  }

  // Download
  const output = { month: 10, monthName: 'بؤونه', days: results };
  const json = JSON.stringify(output, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bawoonah-full.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  const totalChars = results.reduce((s, r) => s + (r.rawText?.length || 0), 0);
  console.log(`\n✅ Done! ${results.length} days | ${(totalChars / 1000).toFixed(0)}K characters`);
  console.log('📥 File: bawoonah-full.json');
})();
