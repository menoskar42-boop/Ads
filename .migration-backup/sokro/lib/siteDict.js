'use strict';

// ── Which site does an Arabic name mean? ─────────────────────────────────────
//
// The model was guessing Latin domains from Arabic names, and a guess that
// LOOKS right is the dangerous kind: «سيلندر» became `selender.com`, the browse
// action failed with a raw `blocked url: dns resolution failed`, and the user
// was told nothing useful about a site that exists and works.
//
// So the names people actually type are written down. No model, no network, no
// latency — a lookup in a table. Anything not in the table falls through to
// search-based discovery (a separate step) rather than to a guess.
//
// The table is deliberately CONSERVATIVE. A wrong entry here is worse than no
// entry at all: an empty table sends the user to a search, while a wrong one
// sends them confidently to somebody else's website, and every caller of this
// module is about to type into a form. Add a site when you have opened it.

const SITES = [
  // ── مصر · بيع وشراء ───────────────────────────────────────────────────
  { domain: 'sylndr.com', label: 'سيلندر', names: ['سيلندر', 'سلندر', 'سليندر', 'sylndr'] },
  { domain: 'dubizzle.com.eg', label: 'دوبيزل مصر', names: ['دوبيزل', 'دوبيزيل', 'اوليكس', 'أوليكس', 'olx', 'dubizzle'] },
  { domain: 'noon.com', label: 'نون', names: ['نون', 'noon'] },
  { domain: 'amazon.eg', label: 'أمازون مصر', names: ['امازون مصر', 'أمازون مصر', 'سوق', 'سوق كوم', 'amazon eg', 'amazon egypt'] },
  { domain: 'amazon.com', label: 'أمازون', names: ['امازون', 'أمازون', 'amazon'] },
  { domain: 'jumia.com.eg', label: 'جوميا', names: ['جوميا', 'جميا', 'jumia'] },
  { domain: 'btech.com', label: 'بي تك', names: ['بي تك', 'بيتك', 'btech', 'b tech'] },
  { domain: 'raneen.com', label: 'رنين', names: ['رنين', 'raneen'] },
  { domain: 'carrefouregypt.com', label: 'كارفور مصر', names: ['كارفور', 'كارفور مصر', 'carrefour'] },
  { domain: 'shein.com', label: 'شي إن', names: ['شي ان', 'شي إن', 'شين', 'shein'] },
  { domain: 'aliexpress.com', label: 'علي إكسبريس', names: ['علي اكسبريس', 'علي إكسبريس', 'اليكسبريس', 'aliexpress'] },

  // ── مصر · أكل وتوصيل ─────────────────────────────────────────────────
  { domain: 'talabat.com', label: 'طلبات', names: ['طلبات', 'talabat'] },
  { domain: 'elmenus.com', label: 'إلمينوس', names: ['المنيوز', 'إلمينوس', 'الميوز', 'elmenus'] },

  // ── مصر · فلوس وبنوك ─────────────────────────────────────────────────
  { domain: 'fawry.com', label: 'فوري', names: ['فوري', 'fawry'] },
  { domain: 'cibeg.com', label: 'CIB', names: ['سي اي بي', 'التجاري الدولي', 'cib'] },
  { domain: 'banquemisr.com', label: 'بنك مصر', names: ['بنك مصر', 'banque misr'] },
  { domain: 'nbe.com.eg', label: 'البنك الأهلي المصري', names: ['البنك الاهلي', 'البنك الأهلي', 'الاهلي المصري', 'nbe'] },

  // ── مصر · اتصالات ────────────────────────────────────────────────────
  { domain: 'vodafone.com.eg', label: 'فودافون مصر', names: ['فودافون', 'vodafone'] },
  { domain: 'te.eg', label: 'وي (المصرية للاتصالات)', names: ['وي', 'المصرية للاتصالات', 'te', 'we'] },
  { domain: 'orange.eg', label: 'أورنج مصر', names: ['اورنج', 'أورنج', 'orange'] },
  { domain: 'etisalat.eg', label: 'اتصالات مصر', names: ['اتصالات', 'etisalat'] },

  // ── مصر · حكومة وسفر ─────────────────────────────────────────────────
  { domain: 'digital.gov.eg', label: 'بوابة مصر الرقمية', names: ['مصر الرقمية', 'البوابة الرقمية', 'digital gov'] },
  { domain: 'eta.gov.eg', label: 'مصلحة الضرائب المصرية', names: ['الضرائب', 'مصلحة الضرائب', 'eta'] },
  { domain: 'egyptair.com', label: 'مصر للطيران', names: ['مصر للطيران', 'egyptair'] },
  { domain: 'enr.gov.eg', label: 'السكك الحديدية', names: ['السكة الحديد', 'السكك الحديدية', 'القطارات', 'enr'] },

  // ── أخبار ورياضة ─────────────────────────────────────────────────────
  { domain: 'youm7.com', label: 'اليوم السابع', names: ['اليوم السابع', 'youm7'] },
  { domain: 'masrawy.com', label: 'مصراوي', names: ['مصراوي', 'masrawy'] },
  { domain: 'filgoal.com', label: 'في الجول', names: ['في الجول', 'فيلجول', 'filgoal'] },
  { domain: 'yallakora.com', label: 'يلا كورة', names: ['يلا كورة', 'يلاكورة', 'yallakora'] },

  // ── شغل وخدمات ───────────────────────────────────────────────────────
  { domain: 'khamsat.com', label: 'خمسات', names: ['خمسات', 'khamsat'] },
  { domain: 'mostaql.com', label: 'مستقل', names: ['مستقل', 'mostaql'] },
  { domain: 'wuzzuf.net', label: 'وظف', names: ['وظف', 'wuzzuf'] },
  { domain: 'booking.com', label: 'بوكينج', names: ['بوكينج', 'بوكنج', 'booking'] },
  { domain: 'airbnb.com', label: 'إير بي إن بي', names: ['ايربنب', 'إير بي ان بي', 'airbnb'] },
  { domain: 'careem.com', label: 'كريم', names: ['كريم', 'careem'] },
  { domain: 'uber.com', label: 'أوبر', names: ['اوبر', 'أوبر', 'uber'] },

  // ── مواقع عامة ───────────────────────────────────────────────────────
  { domain: 'google.com', label: 'جوجل', names: ['جوجل', 'قوقل', 'google'] },
  { domain: 'youtube.com', label: 'يوتيوب', names: ['يوتيوب', 'يوتوب', 'youtube'] },
  { domain: 'facebook.com', label: 'فيسبوك', names: ['فيسبوك', 'فيس بوك', 'facebook'] },
  { domain: 'instagram.com', label: 'إنستجرام', names: ['انستجرام', 'إنستجرام', 'انستا', 'instagram'] },
  { domain: 'x.com', label: 'إكس (تويتر)', names: ['تويتر', 'اكس', 'twitter'] },
  { domain: 'linkedin.com', label: 'لينكد إن', names: ['لينكد ان', 'لينكدان', 'linkedin'] },
  { domain: 'wikipedia.org', label: 'ويكيبيديا', names: ['ويكيبيديا', 'ويكبيديا', 'wikipedia'] },
];

/**
 * The same name, typed four ways.
 *
 * Arabic gets typed with and without hamza, with ي or ى at the end, with ة or
 * ه, with tashkeel pasted in from somewhere, and with «ال» in front. None of
 * those are different sites, so none of them may be a different key.
 */
function normalize(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[ً-ْٰـ]/g, '')   // tashkeel and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Built once. `موقع سيلندر` and `سيلندر` are the same request, so the leading
// words people put in front of a name are stripped rather than duplicated in
// every entry.
const LEADING = ['موقع', 'تطبيق', 'site', 'website', 'app', 'ال'];

const INDEX = new Map();
for (const site of SITES) {
  for (const n of site.names.concat([site.label])) {
    const key = normalize(n);
    if (key && !INDEX.has(key)) INDEX.set(key, site);
  }
}

function strip(name) {
  let out = normalize(name);
  for (let i = 0; i < 3; i++) {
    const before = out;
    for (const w of LEADING) {
      if (w === 'ال') { if (out.startsWith('ال') && out.length > 4) out = out.slice(2); }
      else if (out.startsWith(w + ' ')) out = out.slice(w.length + 1);
    }
    out = out.trim();
    if (out === before) break;
  }
  return out;
}

/** The site a name means, or null. Never guesses. */
function lookup(name) {
  const key = strip(name);
  if (!key) return null;
  return INDEX.get(key) || INDEX.get(normalize(name)) || null;
}

/**
 * What an action should open, given whatever the model put in `input.url`.
 *
 * Returns `{ url, source }` where source is:
 *   'url'  — it was already a URL, untouched;
 *   'host' — it was a bare domain (sylndr.com), so only the scheme was added;
 *   'dict' — a name that is IN the table; `site` carries the entry so the
 *            caller can tell the user WHICH site it opened, by name.
 * Returns null when the text is a name nobody here has written down. That is
 * the honest answer, and the caller then searches for it rather than inventing
 * a domain that may belong to somebody else.
 */
function resolve(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return { url: raw, source: 'url' };
  // A bare host, with or without a path: `sylndr.com`, `noon.com/eg-ar`.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(raw) && !/\s/.test(raw)) {
    return { url: 'https://' + raw, source: 'host' };
  }
  const site = lookup(raw);
  if (site) return { url: 'https://' + site.domain, source: 'dict', site };
  return null;
}

module.exports = { SITES, normalize, strip, lookup, resolve };
