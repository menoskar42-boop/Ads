/**
 * Server-side video SEO registry.
 * Builds a deduplicated index of all Daoud Lamei Bible explanation videos
 * plus the Kids section hymns and stories — used by sitemap and bot-snapshot.
 */

export interface VideoSeoEntry {
  youtubeId: string;
  title: string;
  description: string;
  book: string;
  chapter: number;
  keywords: string[];
}

// Daoud Lamei static lesson mapping (server-side copy of shared data)
// Format: "Book-Chapter" → youtubeId | youtubeId[]
const LESSON_MAP: Record<string, string | string[]> = {
  "يشوع-1": ["iVomctbKFi0","PIk-uBXJrXE"], "يشوع-2": "PIk-uBXJrXE",
  "يشوع-3": "BEgM1FCFVD0", "يشوع-4": "zkTEYcfm3Dk", "يشوع-5": "2GJxkfiUIDI",
  "يشوع-6": ["2GJxkfiUIDI","G6T6U3zCVv4"], "يشوع-7": ["G6T6U3zCVv4","vaI1EBMkJHg"],
  "يشوع-8": ["vaI1EBMkJHg","9TT3tyOSADY"], "يشوع-9": "9TT3tyOSADY",
  "يشوع-10": ["6_peAx9WNTc","DjTHuni91IU"], "يشوع-11": "DjTHuni91IU",
  "يشوع-21": "TJGZBYNyXD0", "يشوع-23": "GQsUuVslFfc",
  "تكوين-1": ["YbwZQd7cpjU","g1eVDttBOO0"], "تكوين-2": "g1eVDttBOO0",
  "تكوين-3": ["yLiOVybZHUA","eJmWI5QWpAI","vtprTE-ZXZ8"], "تكوين-6": ["VGUBB8pqaSM","ma9_Fc6f9lA"],
  "تكوين-7": ["F_vHHL9m6v4","j8E8ivvO_EQ"], "تكوين-12": ["x7PzEZ45Y1w","X9MJTtD3rO4","9IcZWBNrxtE"],
  "تكوين-22": ["CNG1VbFOYQs","_xlTcm0gz4w"], "تكوين-37": ["HE3b7yfZkIg","ICBUC8hnJH0"],
  "تكوين-41": ["gDFuiPxJTz8","F3arDmAm0t4"], "تكوين-49": ["LDmcoWsPSb0","0uHVuRkgM44","vbFNDhEAcfw"],
  "تثنية-1": ["gbKLgO45ad4","7BerIBlirnA","6g13naEN5MA"], "تثنية-5": ["J_KuqvTmLas","zBoHzfAzrVE"],
  "تثنية-6": ["zBoHzfAzrVE","lgSu71Urbvk"], "تثنية-28": ["8uxEl53MvV4","252oVDveVao"],
  "تثنية-33": ["Ryfeh1wHsh4","QGxXUHpHzpY","xsEP8xTrEGE","MEGiAvMDlq4"],
  "صموئيل أول-1": ["BlidDmGrx-M","XnhYxye6g6o","J7aNHIe6aq0"],
  "صموئيل أول-17": ["Er43O6Z_byU","qorYmlC7ods","v6R-qVCclXg"],
  "صموئيل أول-24": ["OIXnFKDGMn8","leiqygcU4rQ"],
  "أيوب-1": ["In4Tl3KvKq4","9lCEO-hhxUU","zCxMqsz1FO4","ndT58pv5EcE"],
  "أيوب-38": ["XFscM-f4nBw","YYiG0pcRx5E"], "أيوب-42": "PNES_SPlg8U",
  "أمثال-1": ["BdxTNGAKy8E","5CejNgWQkF0","EQBpfD6s71k"],
  "أمثال-3": ["z-RxkN4ypbc","NgJIhnLYUmE","ha_2gdKpqjE"], "أمثال-8": ["HkBqAvjbQTQ","mDjTRjM1m3Y"],
  "نشيد الأنشاد-1": ["_XjOzT574C8","lPBVYllExrI","9SyFzmoKBD0"],
  "حزقيال-3": "t2fzp1yrx5w",
  "متى-1": ["znT5IMIAPW0","qTpk3VSna54"], "متى-5": ["U0feXv_h6pY","YAI1fwFPuvY","oQ_Ij_c4d6E"],
  "متى-6": ["UC1ZN8ybsKA","YytQFn3R-ks","5MqqqTBlhZM"], "متى-7": ["M4Bv56CSfIk","l55tpyE0eHI","LTnserUuKWQ"],
  "متى-14": ["rUqjy-9-pGc","y473ba5rl98"], "متى-24": ["dJjlfKqN044","Fz5MuRN6pQw"],
  "متى-26": ["QVJuhDs3lNY","7G_U0KsdkMI","iM4RbCMJ7pw"], "متى-27": ["TNpIOpqsFGw","xPxiuzTmTXc"],
  "لوقا-1": ["Ix-ZF-LDk-E","OA8b_qh5vtw","8CJIMLAdfOE"], "لوقا-2": "XMv3APN_VLY",
  "لوقا-9": ["AjWRWYFCzxM","29FRBaLN1SA"], "لوقا-19": "V-OyaTIP1FU",
  "يوحنا-1": ["DJhIwatChEo","pSUzBYlmnoc","1lGVZ2grVqI","Ug6HF2dfMNQ"],
  "يوحنا-3": ["IwyZewOC-28","926aDoxaVu4","axfpDi_gG5o"], "يوحنا-4": ["a-WJLXhgOms","gFqXBqB2AGk","5pIaX0RzDF8"],
  "يوحنا-11": ["5AjX4IXwQ4I","_I_QoIgpC-c","KGC2TFkig0I"], "يوحنا-14": ["NVnP5j8juA8","JZz6ATjp86c"],
  "يوحنا-17": ["qqxxaxs1rQc","dVIpTlGVIVo","BWTqAYBony0","M3D6AzEjjqI","SKJmuAx7Avc","SRg6Dg0Y0NM"],
  "يوحنا-20": ["e3ftIm6GU5I","O2tkjDNmzLs"],
  "أعمال الرسل-27": "rPPe4yxuPXs",
};

// Kids hymns video data (mirrors client/src/lib/kids-bible-videos-data.ts)
const KIDS_HYMNS: { youtubeId: string; title: string }[] = [
  { youtubeId: "Q4u8LMyEsiI", title: "ربي يسوع بيحبني (كارتون) - ترنيمة أطفال" },
  { youtubeId: "a5WrYXgVd9s", title: "إن كنت تحب يسوع قول آمين - ترنيمة أطفال" },
  { youtubeId: "8J63MAsoelA", title: "ربي يسوع علمني - ترنيمة أطفال" },
  { youtubeId: "-rqW2WQiHBA", title: "ربنا كلمني - موسى أنا عايزك إنت - ترنيمة أطفال" },
  { youtubeId: "G9r0Rd9sZuQ", title: "يسوع في بيتنا - ترنيمة أطفال" },
  { youtubeId: "Fb2J_KZCTvI", title: "اسمه يسوع - ترنيمة أطفال" },
  { youtubeId: "GeHDDPRsmj8", title: "عظيم هو ربنا - ترنيمة أطفال" },
  { youtubeId: "xIvb7i50KEw", title: "روح الله القدوس - ترنيمة أطفال" },
  { youtubeId: "RHD08VjiooI", title: "أنا فرحان (بالحركات) - ترنيمة أطفال" },
  { youtubeId: "wAp76FaQt3o", title: "خليك شجرة (كارتون) - ترنيمة أطفال" },
  { youtubeId: "eoW3qD_bkOE", title: "أنا مميز - ترنيمة أطفال" },
  { youtubeId: "WDaHVGM9XOA", title: "اتعلمت - كورال الملائكة - ترنيمة أطفال" },
  { youtubeId: "-uUSU-LVYo0", title: "أنا شغال - كورال الملائكة - ترنيمة أطفال" },
  { youtubeId: "cuN_6Jj3Kaw", title: "سلامنا اليكِ (كارتون) - ترنيمة أطفال" },
  { youtubeId: "bUzUUPVgDng", title: "أوعى تقول - ترنيمة أطفال" },
  { youtubeId: "EigsIr3VNMw", title: "إتمسك اللي عندك - ترنيمة أطفال" },
  { youtubeId: "H6og_wKrF6k", title: "أصحصح وأكون مستعد - ترنيمة أطفال" },
  { youtubeId: "QlcnGtNH7As", title: "صباح الخير يا بابا يسوع - ترنيمة أطفال" },
  { youtubeId: "_tMPWSGEu_U", title: "إنت عظيم - ترنيمة أطفال" },
  { youtubeId: "sOxYBvaGi_s", title: "قصة ميلادك يا يسوع - ترنيمة أطفال" },
  { youtubeId: "RYu1cvQL9eo", title: "يوسف النجار ده كان نجار (كرتون) - ترنيمة أطفال" },
  { youtubeId: "zMJNEBXgQkA", title: "يسوع زي السكر (كارتون) - ترنيمة أطفال" },
  { youtubeId: "nvg4WKV-9KY", title: "طول ما الشمس فيها نور (كارتون) - ترنيمة أطفال" },
  { youtubeId: "8Zk560IfbB8", title: "حنته حاجه حلوه قد البندقه (كارتون) - ترنيمة أطفال" },
  { youtubeId: "6zkkT6OEP1c", title: "كنيستى هى بيتى (كارتون كوجي) - ترنيمة أطفال" },
  { youtubeId: "DqsMQb9VCDw", title: "حبة قش (كارتون كوجي) - ترنيمة أطفال" },
];

// Kids Bible story videos
const KIDS_STORY_VIDEOS: { youtubeId: string; title: string }[] = [
  { youtubeId: "R2qW0MJlbEI", title: "حكاية آدم وحواء وبداية الخليقة - قصة أطفال" },
  { youtubeId: "tGd1nZPVxlI", title: "قصة نوح والطوفان - قصة الكتاب المقدس للأطفال" },
  { youtubeId: "zHbNkFtm2RY", title: "قصة إبراهيم وإسحاق - قصة الكتاب المقدس للأطفال" },
  { youtubeId: "k4XSaFqjhOo", title: "قصة يوسف وإخوته - قصة الكتاب المقدس للأطفال" },
  { youtubeId: "o1E_czHxdJo", title: "قصة موسى ومعجزة البحر الأحمر - قصة أطفال" },
];

let _registry: Map<string, VideoSeoEntry> | null = null;

function buildRegistry(): Map<string, VideoSeoEntry> {
  const map = new Map<string, VideoSeoEntry>();

  // Process Daoud Lamei lesson videos
  for (const [key, val] of Object.entries(LESSON_MAP)) {
    const dashIdx = key.lastIndexOf("-");
    const book = key.slice(0, dashIdx);
    const chapter = parseInt(key.slice(dashIdx + 1), 10);
    const ids = Array.isArray(val) ? val : [val];
    ids.forEach((id, partIdx) => {
      if (!map.has(id)) {
        const partLabel = ids.length > 1 ? ` (جزء ${partIdx + 1})` : "";
        map.set(id, {
          youtubeId: id,
          book,
          chapter,
          title: `شرح ${book} الإصحاح ${chapter}${partLabel} - أبونا داود لمعي`,
          description: `فيديو شرح وتفسير سفر ${book} الإصحاح ${chapter} مع أبونا داود لمعي. تفسير عميق ومبسط للكتاب المقدس باللغة العربية.`,
          keywords: [book, `إصحاح ${chapter}`, "داود لمعي", "تفسير", "شرح الكتاب المقدس"],
        });
      }
    });
  }

  // Kids hymns
  for (const h of KIDS_HYMNS) {
    if (!map.has(h.youtubeId)) {
      map.set(h.youtubeId, {
        youtubeId: h.youtubeId,
        book: "",
        chapter: 0,
        title: h.title,
        description: `${h.title} — ترانيم مسيحية للأطفال باللغة العربية. محتوى تعليمي ديني للأطفال.`,
        keywords: ["ترنيمة أطفال", "ترانيم مسيحية", "أطفال", "تعليم ديني"],
      });
    }
  }

  // Kids story videos
  for (const v of KIDS_STORY_VIDEOS) {
    if (!map.has(v.youtubeId)) {
      map.set(v.youtubeId, {
        youtubeId: v.youtubeId,
        book: "",
        chapter: 0,
        title: v.title,
        description: `${v.title} — قصة من قصص الكتاب المقدس المصورة للأطفال.`,
        keywords: ["قصص الأطفال", "الكتاب المقدس للأطفال", "قصة مسيحية"],
      });
    }
  }

  return map;
}

function getRegistry(): Map<string, VideoSeoEntry> {
  if (!_registry) _registry = buildRegistry();
  return _registry;
}

export function getAllVideoSeoEntries(): VideoSeoEntry[] {
  return Array.from(getRegistry().values());
}

export function getVideoSeoById(youtubeId: string): VideoSeoEntry {
  const found = getRegistry().get(youtubeId);
  if (found) return found;
  return {
    youtubeId,
    book: "",
    chapter: 0,
    title: "فيديو تفسير الكتاب المقدس | الكتاب المقدس رفيقي",
    description: "فيديو تفسيري من الكتاب المقدس باللغة العربية.",
    keywords: ["تفسير الكتاب المقدس", "فيديو ديني"],
  };
}
