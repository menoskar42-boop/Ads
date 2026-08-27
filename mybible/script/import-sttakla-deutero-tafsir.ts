/**
 * Import the current St-Takla commentary pages for the deuterocanonical books.
 *
 * The generated CSV is deliberately written to client/public/tafsir first and
 * then must be passed through split-tafsir.ts.  The ignored source file is
 * removed after the split; only the committed parts are used at runtime.
 *
 * Usage:
 *   npx tsx script/import-sttakla-deutero-tafsir.ts
 *   npx tsx script/import-sttakla-deutero-tafsir.ts --book طوبيا
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SOURCE_DIR = path.join(ROOT, "client", "public", "tafsir");

interface BookDefinition {
  name: string;
  chapters: number;
  chapterUrl: (chapter: number) => string;
  introUrl: string;
}

const BOOKS: BookDefinition[] = [
  {
    name: "طوبيا",
    chapters: 14,
    chapterUrl: (chapter) =>
      `https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/tobit/chapter-${String(chapter).padStart(2, "0")}.html`,
    introUrl:
      "https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/tobit/introduction.html",
  },
  {
    name: "يهوديت",
    chapters: 16,
    chapterUrl: (chapter) =>
      `https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/judith/chapter-${String(chapter).padStart(2, "0")}.html`,
    introUrl:
      "https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/judith/introduction.html",
  },
  {
    name: "حكمة سليمان",
    chapters: 19,
    chapterUrl: (chapter) =>
      `https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/wisdom/chapter-${String(chapter).padStart(2, "0")}.html`,
    introUrl:
      "https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/wisdom/introduction.html",
  },
  {
    name: "يشوع بن سيراخ",
    chapters: 51,
    chapterUrl: (chapter) =>
      `https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/sirach/chapter-${String(chapter).padStart(2, "0")}.html`,
    introUrl:
      "https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/sirach/introduction.html",
  },
  {
    name: "باروخ",
    chapters: 6,
    chapterUrl: (chapter) =>
      `https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/baruch/chapter-${String(chapter).padStart(2, "0")}.html`,
    introUrl:
      "https://st-takla.org/bible/commentary/ar/ot/church-encyclopedia/baruch/introduction.html",
  },
  {
    name: "المكابيين الأول",
    chapters: 16,
    chapterUrl: (chapter) =>
      `https://st-takla.org/pub_Bible-Interpretations/Holy-Bible-Tafsir-01-Old-Testament/Father-Antonious-Fekry/45-Sefr-Makabyeen-El-Awal/Tafseer-Sefr-El-Makabyein-El-Awal__01-Chapter-${String(chapter).padStart(2, "0")}.html`,
    introUrl:
      "https://st-takla.org/pub_Bible-Interpretations/Holy-Bible-Tafsir-01-Old-Testament/Father-Antonious-Fekry/45-Sefr-Makabyeen-El-Awal/Tafseer-Sefr-El-Makabyein-El-Awal__00-introduction.html",
  },
  {
    name: "المكابيين الثاني",
    chapters: 15,
    chapterUrl: (chapter) =>
      `https://st-takla.org/pub_Bible-Interpretations/Holy-Bible-Tafsir-01-Old-Testament/H-G-Bishop-Makarious/46-Sefr-Makabieen-El-Thany/Tafseer-Sefr-El-Makabiein-El-Thani__01-Chapter-${String(chapter).padStart(2, "0")}.html`,
    introUrl:
      "https://st-takla.org/pub_Bible-Interpretations/Holy-Bible-Tafsir-01-Old-Testament/H-G-Bishop-Makarious/46-Sefr-Makabieen-El-Thany/Tafseer-Sefr-El-Makabiein-El-Thani__00-index.html",
  },
];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value) =>
      String.fromCodePoint(parseInt(value, 16)),
    );
}

function htmlToText(fragment: string): string {
  return decodeHtmlEntities(
    fragment
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|h[1-6]|tr|li|table|form|hr)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^St-Takla\.org Image:/i.test(line) &&
        !/صورة في موقع الأنبا تكلا/.test(line) &&
        !/موقع الأنبا تكلا هيمانوت لمؤلفين آخرين/.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyFragment(html: string): string {
  const bodyStart = html.indexOf('<div id="bodytext">');
  if (bodyStart < 0) throw new Error("لم نجد bodytext في صفحة St-Takla");
  const footerStart = html.indexOf("<!-- footer with contacts -->", bodyStart);
  const fragment = html.slice(bodyStart, footerStart >= 0 ? footerStart : undefined);

  // The hidden table contains the site's complete chapter index. It is
  // navigation, not commentary, and can be very large.
  return fragment
    .replace(/<tr\b[^>]*id=["']hidethis["'][^>]*>[\s\S]*?<\/tr>/i, "")
    // St-Takla places image credits in small tables beside the commentary.
    // They are attribution/caption chrome, not part of the explanation.
    .replace(
      /<table\b[^>]*>[\s\S]*?(?:St-Takla\.org Image|صورة في موقع الأنبا تكلا)[\s\S]*?<\/table>/gi,
      "",
    );
}

function extractPageBody(html: string): string {
  const fragment = bodyFragment(html);
  const title = fragment.search(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  const afterTitle = title >= 0 ? title : 0;
  const afterTitleFragment = fragment.slice(afterTitle);

  // Most current pages have a second H1 for the chapter topic. Maccabees
  // pages without one begin their content after the first divider.
  const h1Matches = [
    ...afterTitleFragment.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi),
  ];
  let start = 0;
  if (h1Matches.length > 1 && h1Matches[1].index !== undefined) {
    start = afterTitle + h1Matches[1].index;
  } else {
    const divider = afterTitleFragment.match(
      /<img\b[^>]*alt=["'][^"']*(?:Divider|فاصل)[^"']*["'][^>]*>/i,
    );
    start =
      divider?.index !== undefined
        ? afterTitle + divider.index + divider[0].length
        : afterTitle;
  }

  const end = fragment.search(/<table\b[^>]*class=["'][^"']*table-footer/i);
  const selected = fragment.slice(start, end >= 0 ? end : undefined);
  return htmlToText(selected)
    .replace(/^اضغط هنا لإظهار الفهرس\s*/u, "")
    .replace(/^(?:تفسير|شرح) سفر [^\n]+\n(?:مقدمة|[^\n]+)(?:\n|$)/u, "")
    .trim();
}

function arabicDigitsToNumber(value: string): number {
  return Number(value.replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function extractSections(body: string): Array<{ start: number; end: number; text: string }> {
  const lines = body.split("\n");
  const marks: Array<{ start: number; end: number; contentStart: number }> = [];
  let offset = 0;

  for (const line of lines) {
    const match =
      /(?:^|\s)(?:الآيات?|الآية|ع)\s*\(?([0-9٠-٩]+)(?:\s*[-–]\s*([0-9٠-٩]+))?\)?\s*:/u.exec(
        line,
      ) ??
      /\(\s*(?:الآيات?|الآية)\s*\(?([0-9٠-٩]+)(?:\s*[-–]\s*([0-9٠-٩]+))?\)?\s*:/u.exec(
        line,
      );

    if (match) {
      const start = arabicDigitsToNumber(match[1]);
      const end = match[2] ? arabicDigitsToNumber(match[2]) : start;
      marks.push({
        start,
        end,
        contentStart: offset + match.index + match[0].length,
      });
    }
    offset += line.length + 1;
  }

  return marks
    .map((mark, index) => ({
      start: mark.start,
      end: mark.end,
      text: body
        .slice(
          mark.contentStart,
          index + 1 < marks.length ? marks[index + 1].contentStart : body.length,
        )
        .trim(),
    }))
    .filter((section) => section.text.length >= 20);
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvRow(book: string, chapter: number, verse: number, tafsir: string): string {
  return `${book},${chapter},${verse},${csvCell(tafsir)}`;
}

async function fetchUtf8(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "MyBible tafsir importer (source attribution: St-Takla.org)" },
  });
  if (!response.ok) throw new Error(`${response.status} من ${url}`);
  const bytes = await response.arrayBuffer();
  return new TextDecoder("windows-1256").decode(bytes);
}

async function importBook(book: BookDefinition): Promise<void> {
  const intro = extractPageBody(await fetchUtf8(book.introUrl));
  const rows: string[] = ["book,chapter,verse,tafsir"];

  // verse=1 is reserved by the runtime for the book introduction.
  rows.push(csvRow(book.name, 1, 1, intro));

  let sections = 0;
  for (let chapter = 1; chapter <= book.chapters; chapter++) {
    const body = extractPageBody(await fetchUtf8(book.chapterUrl(chapter)));
    if (body.length < 20) throw new Error(`${book.name} إصحاح ${chapter} رجع بلا نص`);

    // verse=0 is a chapter-level record. It lets the existing service return
    // the complete chapter even when verse sections are sparse.
    rows.push(csvRow(book.name, chapter, 0, `(${chapter}:1): ${body}`));

    const chapterSections = extractSections(body);
    sections += chapterSections.length;
    for (const section of chapterSections) {
      const range = section.end === section.start ? `${section.start}` : `${section.start}-${section.end}`;
      rows.push(csvRow(book.name, chapter, section.start, `(${chapter}:${range}): ${section.text}`));
    }
    console.log(`${book.name}: إصحاح ${chapter}/${book.chapters}`);
  }

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  const target = path.join(SOURCE_DIR, `${book.name}-source.csv`);
  fs.writeFileSync(target, rows.join("\n") + "\n", "utf8");
  console.log(`تم إنشاء ${target} — ${rows.length - 1} سجلًا، ${sections} قسم آيات`);
}

const requested = process.argv.includes("--book")
  ? process.argv[process.argv.indexOf("--book") + 1]
  : null;
const selected = requested ? BOOKS.filter((book) => book.name === requested) : BOOKS;
if (selected.length === 0) throw new Error(`السفر غير معروف: ${requested}`);

for (const book of selected) await importBook(book);