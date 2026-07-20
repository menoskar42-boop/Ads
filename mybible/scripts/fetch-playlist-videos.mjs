/**
 * Fetches ALL videos from given playlists, maps them to Bible chapters,
 * and outputs static mapping entries for daoud-lamei-static.ts
 *
 * Run: node scripts/fetch-playlist-videos.mjs
 */

import fs from "fs";

const PLAYLISTS = [
  { id: "PLvMAQ886uceslTdE1uO4NoQw3o-FJemsu", book: "حزقيال" },
  { id: "PLvMAQ886ucevzY6nwV3LHTJGPrj0_zELP", book: "زكريا" },
  { id: "PLvMAQ886ucet-qZwbaHoTpBFQ-D5dyn7v", book: "مزامير" },
  { id: "PLvMAQ886ucev6eVL2fz6etg2gfSZYG-Pz", book: "يوحنا" },
  { id: "PLvMAQ886ucet0Nin1a4hduH7YcYwf7LcC", book: "يوحنا" },   // Live يوحنا (merge)
  { id: "PLvMAQ886uceuO-qfmXx7w62ikKbqC7Pfr", book: "يهوذا" },
  { id: "PLvMAQ886uceutxbBBDLBZRCB2ool1L7Nz", book: null },       // unknown — auto-detect
  { id: "PLvMAQ886ucesTU26czYR4O8PHUeEEsnuf", book: "أيوب" },
  { id: "PLvMAQ886uceuNEtGULdfteBpGwNKiif_U", book: "نشيد الأنشاد" },
  { id: "PLvMAQ886uceu_lgmX-HfKIbThcPWhdMog", book: "أعمال الرسل" },
  { id: "PLvMAQ886ucesECrl5OLdpB7i-GT8VhSHF", book: "تثنية" },
  { id: "PLvMAQ886uces-IIaXuMgsZqtc-7NF528d", book: "تيموثاوس ثانية" },
  { id: "PLvMAQ886uceuwBuAi68oAjkKqYJeB71hI", book: null },
  { id: "PLvMAQ886uces3Z-qnw6PdEIjPpZzXBAW7", book: "أيوب" },    // أيوب second playlist
  { id: "PLvMAQ886ucevRLc2M4W30cL7-1VdM2M4o", book: null },
  { id: "PLvMAQ886uceszM-qzz4JiVMcOCXLvgwLi", book: "أمثال" },
  { id: "PLvMAQ886ucesg0RtbUt69Rzu6BmAA7_qI", book: null },
  { id: "PLvMAQ886ucevFh13c_VBT5KIl1g3Ark95", book: "صموئيل أول" },
  { id: "PLvMAQ886uceuNdncYUuEE-K4uK3WvdQnf", book: null },
  { id: "PLvMAQ886ucevru0Ubq5aRKd0k5-y6YUiH", book: "متى" },
  { id: "PLvMAQ886uceu9UR4QRV_F2Jyda4JO0Avz", book: "تكوين" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "ar,en;q=0.9",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPlaylistPage(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  const res = await fetch(url, { headers: HEADERS });
  const html = await res.text();

  const m = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*(?:var |<\/script>)/s);
  if (!m) throw new Error(`No ytInitialData for ${playlistId}`);

  const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
  const clientVer = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] || "2.20240101.00.00";
  const visitorData = html.match(/"visitorData"\s*:\s*"([^"]+)"/)?.[1] || "";

  return { data: JSON.parse(m[1]), apiKey, clientVer, visitorData };
}

function extractVideosFromData(data) {
  const videos = [];
  const str = JSON.stringify(data);

  // Extract playlistVideoRenderer entries
  const regex = /"playlistVideoRenderer"\s*:\s*\{[^{}]*?"videoId"\s*:\s*"([^"]+)"[^{}]*?"title"\s*:\s*\{[^{}]*?"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = regex.exec(str)) !== null) {
    videos.push({ videoId: m[1], title: m[2] });
  }

  // Also walk structure for any missed ones
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.playlistVideoRenderer) {
      const r = obj.playlistVideoRenderer;
      const id = r.videoId;
      const title = r.title?.runs?.[0]?.text || r.title?.simpleText || "";
      if (id && title && !videos.find((v) => v.videoId === id)) {
        videos.push({ videoId: id, title });
      }
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") walk(v);
    }
  }
  walk(data);

  return videos;
}

function extractContinuationToken(data) {
  const str = JSON.stringify(data);
  const m = str.match(/"continuationCommand"\s*:\s*\{[^}]*?"token"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

async function fetchContinuation(token, apiKey, clientVer, visitorData) {
  const body = {
    context: {
      client: { clientName: "WEB", clientVersion: clientVer, visitorData, hl: "ar" },
    },
    continuation: token,
  };
  const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getAllPlaylistVideos(playlistId) {
  const { data, apiKey, clientVer, visitorData } = await fetchPlaylistPage(playlistId);
  const all = extractVideosFromData(data);

  let token = extractContinuationToken(data);
  while (token) {
    await sleep(300);
    const cont = await fetchContinuation(token, apiKey, clientVer, visitorData);
    all.push(...extractVideosFromData(cont));
    token = extractContinuationToken(cont);
  }

  // Deduplicate
  const seen = new Set();
  return all.filter((v) => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });
}

// ── Chapter extraction from Arabic titles ────────────────────────────────
function extractChapters(title) {
  const chapters = new Set();

  // مزمور (119) or مزمور 119
  const psalmMatch = title.match(/مزمور\s*\(?(\d+)\)?/g);
  if (psalmMatch) {
    for (const m of psalmMatch) {
      const n = m.match(/\d+/);
      if (n) chapters.add(parseInt(n[0]));
    }
  }

  // إصحاح N or (N)
  // Handles: "إصحاح 1", "إصحاح (1)", "إصحاح 1 و 2 و 3", "إصحاح 1 - 5"
  const secMatch = title.match(/إصحاح\s*\(?(\d[\d\s\u0648وـ،,-]*)/g);
  if (secMatch) {
    for (const seg of secMatch) {
      const nums = seg.match(/\d+/g) || [];
      // If range (two numbers with dash), expand
      if (nums.length === 2 && (seg.includes("-") || seg.includes("–") || seg.includes("إلى"))) {
        const [a, b] = nums.map(Number);
        if (b - a < 30) for (let i = a; i <= b; i++) chapters.add(i);
      } else {
        nums.forEach((n) => chapters.add(parseInt(n)));
      }
    }
  }

  // "من إصحاح N إلى M"
  const rangeMatch = title.match(/من\s+إصحاح\s+(\d+)\s+إلى\s+(\d+)/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1]), b = parseInt(rangeMatch[2]);
    if (b - a < 30) for (let i = a; i <= b; i++) chapters.add(i);
  }

  return [...chapters].filter((n) => n > 0 && n <= 200);
}

// ── Detect book from playlist title ──────────────────────────────────────
const BOOK_TITLE_MAP = [
  ["التكوين",         "تكوين"],
  ["الخروج",          "خروج"],
  ["اللاويين",        "لاويين"],
  ["العدد",           "عدد"],
  ["التثنية",         "تثنية"],
  ["يشوع بن سيراخ",  "يشوع بن سيراخ"],
  ["يشوع",            "يشوع"],
  ["القضاة",          "قضاة"],
  ["راعوث",           "راعوث"],
  ["صموئيل الأول",    "صموئيل أول"],
  ["صموئيل الثاني",   "صموئيل ثاني"],
  ["الملوك الأول",    "ملوك أول"],
  ["الملوك الثاني",   "ملوك ثاني"],
  ["أيوب",            "أيوب"],
  ["المزامير",        "مزامير"],
  ["الأمثال",         "أمثال"],
  ["الجامعة",         "جامعة"],
  ["نشيد الأنشاد",    "نشيد الأنشاد"],
  ["إشعياء",          "إشعياء"],
  ["إرميا",           "إرميا"],
  ["مراثي",           "مراثي إرميا"],
  ["حزقيال",          "حزقيال"],
  ["دانيال",          "دانيال"],
  ["يونان",           "يونان"],
  ["زكريا",           "زكريا"],
  ["ملاخي",           "ملاخي"],
  ["متى",             "متى"],
  ["مرقس",            "مرقس"],
  ["لوقا",            "لوقا"],
  ["يوحنا",           "يوحنا"],
  ["أعمال الرسل",     "أعمال الرسل"],
  ["رومية",           "رومية"],
  ["كورنثوس الأولى",  "كورنثوس أولى"],
  ["كورنثوس الثانية", "كورنثوس ثانية"],
  ["غلاطية",          "غلاطية"],
  ["أفسس",            "أفسس"],
  ["فيلبي",           "فيلبي"],
  ["كولوسي",          "كولوسي"],
  ["تسالونيكي الأولى","تسالونيكي أولى"],
  ["تيموثاوس الأولى", "تيموثاوس أولى"],
  ["تيموثاوس الثانية","تيموثاوس ثانية"],
  ["تيطس",            "تيطس"],
  ["عبرانيين",        "عبرانيين"],
  ["يعقوب",           "يعقوب"],
  ["بطرس الأولى",     "بطرس أولى"],
  ["بطرس الثانية",    "بطرس ثانية"],
  ["يهوذا",           "يهوذا"],
  ["رؤيا",            "رؤيا"],
];

function detectBook(title) {
  for (const [arabic, key] of BOOK_TITLE_MAP) {
    if (title.includes(arabic)) return key;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  // book → chapter → [videoId, ...]
  const mapping = {};

  for (const { id, book: expectedBook } of PLAYLISTS) {
    console.log(`\nFetching playlist ${id}...`);
    let videos;
    try {
      videos = await getAllPlaylistVideos(id);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      continue;
    }
    console.log(`  ${videos.length} videos found`);
    if (videos.length === 0) continue;

    // Detect book from most common detection in titles
    let book = expectedBook;
    if (!book) {
      const detected = {};
      for (const v of videos) {
        const b = detectBook(v.title);
        if (b) detected[b] = (detected[b] || 0) + 1;
      }
      const sorted = Object.entries(detected).sort((a, b) => b[1] - a[1]);
      if (sorted.length) { book = sorted[0][0]; console.log(`  Auto-detected book: ${book}`); }
    }
    if (!book) { console.log(`  Could not detect book — skipping`); continue; }

    console.log(`  Book: ${book}`);
    if (!mapping[book]) mapping[book] = {};

    for (const { videoId, title } of videos) {
      const chapters = extractChapters(title);
      if (chapters.length === 0) {
        // Try detecting from مزمور N or (N)
        const simpleNum = title.match(/\((\d+)\)/);
        if (simpleNum && book === "مزامير") chapters.push(parseInt(simpleNum[1]));
      }
      for (const ch of chapters) {
        if (!mapping[book][ch]) mapping[book][ch] = [];
        if (!mapping[book][ch].includes(videoId)) mapping[book][ch].push(videoId);
      }
    }

    await sleep(500);
  }

  // ── Generate TypeScript output ────────────────────────────────
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
  console.log("\n=== GENERATED MAPPING ===");
  console.log(output);
  console.log("=========================");

  // Also save to a temp file for easy copy-paste
  fs.writeFileSync("scripts/generated-mapping.txt", output, "utf8");
  console.log("\nSaved to scripts/generated-mapping.txt");
}

main().catch((e) => { console.error(e); process.exit(1); });
