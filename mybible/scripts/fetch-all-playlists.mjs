/**
 * Comprehensive playlist fetcher with improved Arabic chapter detection.
 * Handles: "إصحاح N", "أصحاح N", "ص N", "مزمور N", "N(verse-verse)" formats.
 * Uses RSS (first 15) + ytInitialData continuation for full playlists.
 *
 * Run: node scripts/fetch-all-playlists.mjs
 */
import fs from "fs";

// ALL 21 playlists with correct book names
const PLAYLISTS = [
  { id: "PLvMAQ886uceslTdE1uO4NoQw3o-FJemsu", book: "حزقيال" },
  { id: "PLvMAQ886ucevzY6nwV3LHTJGPrj0_zELP", book: "زكريا" },
  { id: "PLvMAQ886ucet-qZwbaHoTpBFQ-D5dyn7v", book: "مزامير" },
  { id: "PLvMAQ886ucev6eVL2fz6etg2gfSZYG-Pz", book: "يوحنا" },
  { id: "PLvMAQ886ucet0Nin1a4hduH7YcYwf7LcC", book: "يوحنا" },
  { id: "PLvMAQ886uceuO-qfmXx7w62ikKbqC7Pfr", book: "يهوذا" },
  { id: "PLvMAQ886uceutxbBBDLBZRCB2ool1L7Nz", book: "لوقا" },
  { id: "PLvMAQ886ucesTU26czYR4O8PHUeEEsnuf", book: "أيوب" },
  { id: "PLvMAQ886uceuNEtGULdfteBpGwNKiif_U", book: "نشيد الأنشاد" },
  { id: "PLvMAQ886uceu_lgmX-HfKIbThcPWhdMog", book: "أعمال الرسل" },
  { id: "PLvMAQ886ucesECrl5OLdpB7i-GT8VhSHF", book: "تثنية" },
  { id: "PLvMAQ886uces-IIaXuMgsZqtc-7NF528d", book: "تيموثاوس ثانية" },
  { id: "PLvMAQ886uceuwBuAi68oAjkKqYJeB71hI", book: "لوقا" },
  { id: "PLvMAQ886uces3Z-qnw6PdEIjPpZzXBAW7", book: "أيوب" },
  { id: "PLvMAQ886ucevRLc2M4W30cL7-1VdM2M4o", book: "إرميا" },
  { id: "PLvMAQ886uceszM-qzz4JiVMcOCXLvgwLi", book: "أمثال" },
  { id: "PLvMAQ886ucesg0RtbUt69Rzu6BmAA7_qI", book: "ملوك أول" },
  { id: "PLvMAQ886ucevFh13c_VBT5KIl1g3Ark95", book: "صموئيل أول" },
  { id: "PLvMAQ886uceuNdncYUuEE-K4uK3WvdQnf", book: "إشعياء" },
  { id: "PLvMAQ886ucevru0Ubq5aRKd0k5-y6YUiH", book: "متى" },
  { id: "PLvMAQ886uceu9UR4QRV_F2Jyda4JO0Avz", book: "تكوين" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
  "Accept-Language": "ar,en;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fetch via RSS (returns up to 15 videos) ──────────────────────────────
async function fetchRSS(playlistId) {
  const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const xml = await res.text();
    const videos = [];
    const re = /<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const title = m[2]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'");
      videos.push({ videoId: m[1], title });
    }
    return videos;
  } catch {
    return [];
  }
}

// ── Fetch via ytInitialData + continuation ───────────────────────────────
async function fetchYTInitialData(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    const html = await res.text();
    const m = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*(?:var |<\/script>)/s);
    if (!m) return null;

    const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    const clientVer = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] || "2.20240101.00.00";
    const visitorData = html.match(/"visitorData"\s*:\s*"([^"]+)"/)?.[1] || "";

    return { data: JSON.parse(m[1]), apiKey, clientVer, visitorData };
  } catch {
    return null;
  }
}

function extractVideosFromYTData(data) {
  const str = JSON.stringify(data);
  const videos = [];
  const re = /"playlistVideoRenderer"\s*:\s*\{[^{}]*?"videoId"\s*:\s*"([^"]+)"[^{}]*?"title"\s*:\s*\{[^{}]*?"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    videos.push({ videoId: m[1], title: m[2] });
  }
  return videos;
}

function extractContinuationToken(data) {
  const str = JSON.stringify(data);
  const m = str.match(/"continuationCommand"\s*:\s*\{[^}]*?"token"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

async function fetchContinuation(token, apiKey, clientVer, visitorData) {
  const body = {
    context: { client: { clientName: "WEB", clientVersion: clientVer, visitorData, hl: "ar" } },
    continuation: token,
  };
  const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getAllVideos(playlistId) {
  // Try ytInitialData first (gets full playlist with continuation)
  const init = await fetchYTInitialData(playlistId);
  if (init) {
    const all = extractVideosFromYTData(init.data);
    if (all.length > 0) {
      let token = extractContinuationToken(init.data);
      while (token) {
        await sleep(300);
        const cont = await fetchContinuation(token, init.apiKey, init.clientVer, init.visitorData);
        all.push(...extractVideosFromYTData(cont));
        token = extractContinuationToken(cont);
      }
      // Deduplicate
      const seen = new Set();
      return all.filter(v => { if (seen.has(v.videoId)) return false; seen.add(v.videoId); return true; });
    }
  }

  // Fallback to RSS
  console.log(`    → RSS fallback`);
  return fetchRSS(playlistId);
}

// ── Chapter extraction (handles all Arabic formats) ──────────────────────
function extractChapters(title, book) {

  // Psalms: "مزمور N" or "(مزمور N)" or "مزمور N&M"
  if (book === "مزامير") {
    const psalmNums = [];
    const re = /مزمور\s*\(?(\d+)(?:\s*[&و]\s*(\d+))?\)?/g;
    let m;
    while ((m = re.exec(title)) !== null) {
      psalmNums.push(parseInt(m[1]));
      if (m[2]) psalmNums.push(parseInt(m[2]));
    }
    if (psalmNums.length > 0) return psalmNums.filter(n => n > 0 && n <= 200);
  }

  // تيموثاوس format: "N(verse-verse)" or "N(verse-verse) & M(verse-verse)"
  // e.g. "تيموثاوس الثانية 2(9-21)" or "تيموثاوس الثانية 1(13-18)& 2(1-8)"
  if (book === "تيموثاوس ثانية" || book === "تيموثاوس أولى") {
    const chapters = new Set();
    // Pattern: standalone chapter number followed by parenthesized verses OR
    // chapter number at end of title
    const re1 = /\b(\d+)\s*\(/g;
    const re2 = /\bالثانية\s+(\d+)\b/g;
    let m;
    while ((m = re1.exec(title)) !== null) {
      const n = parseInt(m[1]);
      if (n >= 1 && n <= 10) chapters.add(n);
    }
    while ((m = re2.exec(title)) !== null) chapters.add(parseInt(m[1]));
    // "تيموثاوس الثانية 4" at end
    const endMatch = title.match(/الثانية\s+(\d+)\s*$/);
    if (endMatch) chapters.add(parseInt(endMatch[1]));
    if (chapters.size > 0) return [...chapters].filter(n => n >= 1 && n <= 20);
  }

  // Acts "ص N" format: "ص1 (1-8)" "ص2 و ص3"
  if (book === "أعمال الرسل") {
    const chapters = new Set();
    const re = /ص\s*(\d+)/g;
    let m;
    while ((m = re.exec(title)) !== null) chapters.add(parseInt(m[1]));
    if (chapters.size > 0) return [...chapters].filter(n => n >= 1 && n <= 30);
  }

  // General: handle "إصحاح", "أصحاح", "اصحاح" (all three spellings)
  const chapters = new Set();

  // "إصحاح N" or "أصحاح N" or "اصحاح N" — with optional verse range
  const chapterPattern = /[إأا]صح[اآ]ح\s*\(?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*\)?/g;
  let m;
  while ((m = chapterPattern.exec(title)) !== null) {
    const a = parseInt(m[1]);
    const b = m[2] ? parseInt(m[2]) : a;
    if (b - a < 15) { for (let i = a; i <= b; i++) chapters.add(i); }
    else chapters.add(a);
  }

  // "إصحاح N و M" (multiple chapters separated by و/&)
  const multiPattern = /[إأا]صح[اآ]ح\s+(\d+)(?:\s*(?:[و&])\s*(?:[إأا]صح[اآ]ح\s+)?(\d+))*/g;
  while ((m = multiPattern.exec(title)) !== null) {
    // Extract all numbers from the match
    const nums = m[0].match(/\d+/g) || [];
    nums.forEach(n => { const num = parseInt(n); if (num >= 1 && num <= 200) chapters.add(num); });
  }

  // "من إصحاح N إلى M"
  const rangePattern = /من\s+[إأا]صح[اآ]ح\s+(\d+)\s+إلى\s+(\d+)/;
  const rangeMatch = title.match(rangePattern);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1]), b = parseInt(rangeMatch[2]);
    if (b - a < 20) for (let i = a; i <= b; i++) chapters.add(i);
  }

  return [...chapters].filter(n => n >= 1 && n <= 200);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const mapping = {}; // book → chapter → [videoId, ...]

  for (const { id, book } of PLAYLISTS) {
    console.log(`\nFetching [${book}] playlist ${id}...`);
    const videos = await getAllVideos(id);
    console.log(`  ${videos.length} videos`);
    if (videos.length === 0) continue;

    if (!mapping[book]) mapping[book] = {};

    for (const { videoId, title } of videos) {
      const chapters = extractChapters(title, book);
      if (chapters.length === 0) {
        // Debug: print unmatched titles
        // console.log(`    UNMATCHED: [${videoId}] ${title}`);
      }
      for (const ch of chapters) {
        if (!mapping[book][ch]) mapping[book][ch] = [];
        if (!mapping[book][ch].includes(videoId)) mapping[book][ch].push(videoId);
      }
    }

    await sleep(500);
  }

  // Generate TypeScript output
  const lines = [];
  for (const [book, chapters] of Object.entries(mapping).sort()) {
    lines.push(`\n  // ── ${book} ──`);
    const chNums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
    for (const ch of chNums) {
      const ids = chapters[ch];
      const val = ids.length === 1 ? `"${ids[0]}"` : `["${ids.join('", "')}"]`;
      lines.push(`  "${book}-${ch}": ${val},`);
    }
  }

  const output = lines.join("\n");
  fs.writeFileSync("scripts/generated-mapping.txt", output, "utf8");
  console.log("\n\nSaved to scripts/generated-mapping.txt");

  // Also print summary
  for (const [book, chapters] of Object.entries(mapping).sort()) {
    const chNums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
    console.log(`${book}: chapters [${chNums.join(",")}]`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
