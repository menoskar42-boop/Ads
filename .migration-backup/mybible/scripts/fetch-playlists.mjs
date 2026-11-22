/**
 * Fetches ALL playlists from Fr Daoud Lamei's YouTube channel
 * using ytInitialData scraping — zero API cost.
 *
 * Run: node scripts/fetch-playlists.mjs
 */

const CHANNEL_URL = "https://www.youtube.com/@frdaoudlamei/playlists";
const BROWSE_API  = "https://www.youtube.com/youtubei/v1/browse";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "ar,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ─── Arabic Bible book name → our app's book key ──────────────────────────
const TITLE_MAP = [
  // Old Testament
  ["التكوين",          "تكوين"],
  ["الخروج",           "خروج"],
  ["اللاويين",         "لاويين"],
  ["العدد",            "عدد"],
  ["التثنية",          "تثنية"],
  ["يشوع بن نون",      null],   // ignore — book key is يشوع but this is Joshua which is يشوع
  ["يشوع بن سيراخ",   "يشوع بن سيراخ"],  // Sirach — not in OT canon
  ["يشوع",             "يشوع"],
  ["القضاة",           "قضاة"],
  ["راعوث",            "راعوث"],
  ["صموئيل الأول",     "صموئيل أول"],
  ["صموئيل الثاني",    "صموئيل ثاني"],
  ["الملوك الأول",     "ملوك أول"],
  ["الملوك الثاني",    "ملوك ثاني"],
  ["أخبار الأيام الأول","أخبار أيام أول"],
  ["أخبار الأيام الثاني","أخبار أيام ثاني"],
  ["عزرا",             "عزرا"],
  ["نحميا",            "نحميا"],
  ["أستير",            "أستير"],
  ["أيوب",             "أيوب"],
  ["المزامير",         "مزامير"],
  ["الأمثال",          "أمثال"],
  ["الجامعة",          "جامعة"],
  ["نشيد الأنشاد",     "نشيد الأنشاد"],
  ["إشعياء",           "إشعياء"],
  ["إرميا",            "إرميا"],
  ["مراثي إرميا",      "مراثي إرميا"],
  ["حزقيال",           "حزقيال"],
  ["دانيال",           "دانيال"],
  ["هوشع",             "هوشع"],
  ["يوئيل",            "يوئيل"],
  ["عاموس",            "عاموس"],
  ["عوبديا",           "عوبديا"],
  ["يونان",            "يونان"],
  ["ميخا",             "ميخا"],
  ["ناحوم",            "ناحوم"],
  ["حبقوق",            "حبقوق"],
  ["صفنيا",            "صفنيا"],
  ["حجي",              "حجي"],
  ["زكريا",            "زكريا"],
  ["ملاخي",            "ملاخي"],
  // New Testament
  ["متى",              "متى"],
  ["مرقس",             "مرقس"],
  ["لوقا",             "لوقا"],
  ["يوحنا",            "يوحنا"],
  ["أعمال الرسل",      "أعمال الرسل"],
  ["رومية",            "رومية"],
  ["كورنثوس الأولى",   "كورنثوس أولى"],
  ["كورنثوس الثانية",  "كورنثوس ثانية"],
  ["غلاطية",           "غلاطية"],
  ["أفسس",             "أفسس"],
  ["فيلبي",            "فيلبي"],
  ["كولوسي",           "كولوسي"],
  ["تسالونيكي الأولى", "تسالونيكي أولى"],
  ["تسالونيكي الثانية","تسالونيكي ثانية"],
  ["تيموثاوس الأولى",  "تيموثاوس أولى"],
  ["تيموثاوس الثانية", "تيموثاوس ثانية"],
  ["تيطس",             "تيطس"],
  ["فليمون",           "فليمون"],
  ["عبرانيين",         "عبرانيين"],
  ["يعقوب",            "يعقوب"],
  ["بطرس الأولى",      "بطرس أولى"],
  ["بطرس الثانية",     "بطرس ثانية"],
  ["يوحنا الأولى",     "يوحنا أولى"],
  ["يوحنا الثانية",    "يوحنا ثانية"],
  ["يوحنا الثالثة",    "يوحنا ثالثة"],
  ["يهوذا",            "يهوذا"],
  ["رؤيا يوحنا",       "رؤيا"],
  ["الرؤيا",           "رؤيا"],
];

function matchBookFromTitle(title) {
  const clean = title.replace(/تفسير\s+/g, "").replace(/سفر\s+/g, "").replace(/إنجيل\s+/g, "").trim();
  for (const [arabic, key] of TITLE_MAP) {
    if (clean.includes(arabic) || title.includes(arabic)) {
      return key; // null = explicitly ignored
    }
  }
  return undefined; // unmatched
}

// ─── Extract playlists from a rendererList ────────────────────────────────
function extractPlaylists(data) {
  const items = [];
  const json = JSON.stringify(data);
  const regex = /"playlistId"\s*:\s*"([^"]+)"[^}]*?"title"\s*:\s*\{[^}]*?"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g;

  // Walk the structure instead — more reliable
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.gridPlaylistRenderer) {
      const r = obj.gridPlaylistRenderer;
      const id    = r.playlistId;
      const title = r.title?.runs?.[0]?.text || r.title?.simpleText || "";
      if (id && title) items.push({ id, title });
    } else if (obj.lockupViewModel) {
      const lv = obj.lockupViewModel;
      const id = lv.contentId;
      const title = lv.metadata?.lockupMetadataViewModel?.title?.content || "";
      if (id && title && id.startsWith("PL")) items.push({ id, title });
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") walk(v);
    }
  }

  walk(data);
  return items;
}

function extractContinuation(data) {
  const str = JSON.stringify(data);
  const m = str.match(/"continuationCommand"\s*:\s*\{[^}]*?"token"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function extractVisitorData(data) {
  const str = JSON.stringify(data);
  const m = str.match(/"visitorData"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching channel playlists page...");

  const html = await fetch(CHANNEL_URL, { headers: HEADERS }).then(r => r.text());

  const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*(?:var |<\/script>)/s)
             || html.match(/ytInitialData\s*=\s*(\{.+?\});/s);
  if (!match) {
    console.error("Could not find ytInitialData in page");
    process.exit(1);
  }

  let data;
  try { data = JSON.parse(match[1]); }
  catch (e) { console.error("JSON parse error:", e.message); process.exit(1); }

  const allPlaylists = extractPlaylists(data);
  console.log(`Initial batch: ${allPlaylists.length} playlists`);

  // Continuation — load more pages
  let token      = extractContinuation(data);
  const visitor  = extractVisitorData(data);
  const apiKey   = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
  const clientVer = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] || "2.20240101.00.00";

  let page = 1;
  while (token) {
    console.log(`Fetching continuation page ${++page}...`);
    const body = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: clientVer,
          visitorData: visitor || "",
          hl: "ar",
        },
      },
      continuation: token,
    };

    let contData;
    try {
      const res = await fetch(`${BROWSE_API}?key=${apiKey}`, {
        method:  "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      contData = await res.json();
    } catch (e) {
      console.error("Continuation fetch error:", e.message);
      break;
    }

    const batch = extractPlaylists(contData);
    console.log(`  → ${batch.length} more playlists`);
    allPlaylists.push(...batch);
    token = extractContinuation(contData);
  }

  // Deduplicate
  const seen = new Set();
  const unique = allPlaylists.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  console.log(`\nTotal unique playlists found: ${unique.length}`);

  // ─── Map to Bible books ────────────────────────────────────────
  const matched   = {};
  const unmatched = [];

  for (const { id, title } of unique) {
    const book = matchBookFromTitle(title);
    if (book === null) {
      // explicitly ignored
    } else if (book) {
      matched[book] = id;
      console.log(`  ✓ "${title}" → ${book} (${id})`);
    } else {
      unmatched.push(`  ? "${title}" (${id})`);
    }
  }

  console.log(`\nMatched books: ${Object.keys(matched).length}`);
  if (unmatched.length) {
    console.log(`Unmatched (${unmatched.length}):`);
    unmatched.forEach(l => console.log(l));
  }

  // ─── Write output ──────────────────────────────────────────────
  const entries = Object.entries(matched)
    .map(([book, id]) => `  "${book}": "${id}",`)
    .join("\n");

  const output = `/**
 * Auto-generated by scripts/fetch-playlists.mjs
 * Maps Arabic Bible book names → Daoud Lamei YouTube playlist IDs.
 * Used by server/daoud-lamei-service.ts to fetch per-book RSS feeds.
 */
export const BOOK_PLAYLISTS: Record<string, string> = {
${entries}
};

export function getPlaylistId(bookName: string): string | undefined {
  return BOOK_PLAYLISTS[bookName];
}
`;

  const fs = await import("fs");
  fs.writeFileSync("server/daoud-lamei-playlists.ts", output, "utf8");
  console.log("\n✅ Written: server/daoud-lamei-playlists.ts");
}

main().catch(e => { console.error(e); process.exit(1); });
