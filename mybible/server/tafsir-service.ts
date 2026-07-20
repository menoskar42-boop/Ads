import fs from "fs";
import path from "path";

interface TafsirEntry {
  book: string;
  chapter: number;
  verse: number;
  tafsir: string;
}

const tafsirCache: Record<string, TafsirEntry[]> = {};
const cacheOrder: string[] = [];
const MAX_CACHE_SIZE = 5;

function evictCache() {
  while (cacheOrder.length > MAX_CACHE_SIZE) {
    const oldest = cacheOrder.shift();
    if (oldest) delete tafsirCache[oldest];
  }
}

function getTafsirDir(): string {
  if (process.env.NODE_ENV === "production") {
    return path.resolve(__dirname, "public", "tafsir");
  }
  return path.resolve(process.cwd(), "client", "public", "tafsir");
}

function getTafsirPartsDir(): string {
  if (process.env.NODE_ENV === "production") {
    return path.resolve(__dirname, "public", "tafsir-parts");
  }
  return path.resolve(process.cwd(), "client", "public", "tafsir-parts");
}

function parseCSV(text: string): TafsirEntry[] {
  const entries: TafsirEntry[] = [];
  const lines = text.split("\n");
  if (lines.length < 2) return entries;

  let i = 1;
  while (i < lines.length) {
    let line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    let inQuotes = false;
    let fields: string[] = [];
    let current = "";

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        if (inQuotes && j + 1 < line.length && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }

    while (inQuotes && i + 1 < lines.length) {
      i++;
      current += "\n" + lines[i];
      for (let j = 0; j < lines[i].length; j++) {
        if (lines[i][j] === '"') {
          inQuotes = !inQuotes;
        }
      }
    }

    fields.push(current.replace(/"$/, ""));
    i++;

    if (fields.length >= 4) {
      const chapter = parseInt(fields[1], 10);
      const verse = parseInt(fields[2], 10);
      if (!isNaN(chapter) && !isNaN(verse)) {
        // Normalize RTF escape sequences like \'a1 (hex byte) that appear in
        // some CSV entries due to imperfect RTF→CSV conversion. In the context
        // of section headers like ( مر14:1\'a1 2) these act as range separators
        // and should be treated as hyphens.
        const tafsir = fields[3]
          .replace(/\r/g, "")
          .replace(/\\'[0-9a-fA-F]{2}/g, "-")
          .trim();
        entries.push({
          book: fields[0].trim(),
          chapter,
          verse,
          tafsir,
        });
      }
    }
  }

  return entries;
}

// Returns the single part file in tafsir-parts/ that covers `chapter`, or null.
function findPartFile(csvName: string, chapter: number): string | null {
  const partsDir = getTafsirPartsDir();
  if (!fs.existsSync(partsDir)) return null;
  const partFiles = fs.readdirSync(partsDir)
    .filter(f => f.startsWith(`${csvName}_`) && f.endsWith(".csv"));
  for (const f of partFiles) {
    const m = f.match(/_(\d+)_(\d+)\.csv$/);
    if (!m) continue;
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    if (chapter >= lo && chapter <= hi) return path.join(partsDir, f);
  }
  return null;
}

// Cache key for a specific part (e.g. "مزامير:part:1_30")
function partCacheKey(csvName: string, filePath: string): string {
  return `${csvName}:part:${path.basename(filePath)}`;
}

function loadEntries(csvName: string, chapter?: number): TafsirEntry[] | null {
  // If chapter is given and a split-parts directory exists for this book,
  // load only the part file that covers this chapter (saves ~80% RAM).
  if (chapter !== undefined) {
    const partFile = findPartFile(csvName, chapter);
    if (partFile) {
      const key = partCacheKey(csvName, partFile);
      if (tafsirCache[key]) {
        const idx = cacheOrder.indexOf(key);
        if (idx > -1) { cacheOrder.splice(idx, 1); cacheOrder.push(key); }
        return tafsirCache[key];
      }
      try {
        evictCache();
        const text = fs.readFileSync(partFile, "utf-8");
        const entries = parseCSV(text);
        tafsirCache[key] = entries;
        cacheOrder.push(key);
        console.log(`[tafsir] Loaded ${entries.length} entries for ${key} (cache: ${cacheOrder.length})`);
        return entries;
      } catch (err) {
        console.error(`[tafsir] Error reading part ${partFile}:`, err);
        return null;
      }
    }
  }

  if (tafsirCache[csvName]) {
    const idx = cacheOrder.indexOf(csvName);
    if (idx > -1) { cacheOrder.splice(idx, 1); cacheOrder.push(csvName); }
    return tafsirCache[csvName];
  }

  const tafsirDir = getTafsirDir();
  const filePath = path.join(tafsirDir, `${csvName}.csv`);

  if (fs.existsSync(filePath)) {
    try {
      evictCache();
      const text = fs.readFileSync(filePath, "utf-8");
      const entries = parseCSV(text);
      tafsirCache[csvName] = entries;
      cacheOrder.push(csvName);
      console.log(`[tafsir] Loaded ${entries.length} entries for ${csvName} (cache: ${cacheOrder.length})`);
      return entries;
    } catch (err) {
      console.error(`[tafsir] Error reading ${filePath}:`, err);
      return null;
    }
  }

  console.log(`[tafsir] File not found: ${filePath}`);
  return null;
}

export function getBookIntro(csvName: string): string | null {
  const entries = loadEntries(csvName, 1);
  if (!entries) return null;

  const v1Entry = entries.find((e) => e.chapter === 1 && e.verse === 1);
  if (!v1Entry) return null;

  if (
    v1Entry.tafsir.startsWith("مقدمة عن العهد القديم") ||
    v1Entry.tafsir.startsWith("مقدمة عن العهد الجديد")
  ) {
    const v2Entry = entries.find((e) => e.chapter === 1 && e.verse === 2);
    return v2Entry ? v2Entry.tafsir : v1Entry.tafsir;
  }

  return v1Entry.tafsir;
}

export function getChapterTafsir(
  csvName: string,
  chapter: number
): string | null {
  const entries = loadEntries(csvName, chapter);
  if (!entries) return null;

  const chapterEntries = entries.filter((e) => e.chapter === chapter);
  if (chapterEntries.length === 0) return null;

  if (chapter === 1) {
    const v1Entry = chapterEntries.find((e) => e.verse === 1);
    const hasTestamentIntro =
      v1Entry &&
      (v1Entry.tafsir.startsWith("مقدمة عن العهد القديم") ||
        v1Entry.tafsir.startsWith("مقدمة عن العهد الجديد"));

    let skipVerses = [1];
    if (hasTestamentIntro) skipVerses = [1, 2];

    const chapterTafsir = chapterEntries.find(
      (e) => !skipVerses.includes(e.verse)
    );
    if (chapterTafsir) return chapterTafsir.tafsir;
  }

  const nonIntro = chapterEntries.find((e) => e.verse !== 1);
  if (nonIntro) return nonIntro.tafsir;

  const uniqueTexts = Array.from(
    new Set(chapterEntries.map((e) => e.tafsir))
  );
  if (uniqueTexts.length === 1) {
    return uniqueTexts[0];
  }

  return chapterEntries[chapterEntries.length - 1].tafsir;
}

function extractVerseTafsir(fullText: string, verse: number, chapter?: number): string | null {
  interface VerseSection {
    startVerse: number;
    endVerse: number;
    startIndex: number;
    headerEnd: number;
    isPrimary: boolean;
  }

  const sections: VerseSection[] = [];

  // Matches:
  //   ( لو22:1-6):      book-abbrev (Arabic) immediately followed by chapter:verse
  //   ( 2كو5:21)        book-abbrev starting with digit
  //   ( 36:3):          numeric-only (no book name), chapter:verse
  //   ( كو4: 16)        space between colon and verse number
  // Group 1 = chapter, Group 2 = startVerse, Group 3 = endVerse (optional)
  const REF_CORE =
    /\(\s*(?:\d*[\u0600-\u06FF][\u0600-\u06FF]*\s*)?(\d+)\s*:\s*(\d+)(?:\s*[-–\u00a1]\s*(\d+))?\s*\)/;

  const bookRefLineStartPattern = new RegExp(
    `(?:^|\\n)\\s*${REF_CORE.source}\\s*:?`,
    "g"
  );

  const bookRefInlinePattern = new RegExp(
    `${REF_CORE.source}\\s*[:"\u201c\u201d]`,
    "g"
  );

  let match: RegExpExecArray | null;
  while ((match = bookRefLineStartPattern.exec(fullText)) !== null) {
    const refChapter = parseInt(match[1], 10);
    const startVerse = parseInt(match[2], 10);
    const endVerse = match[3] ? parseInt(match[3], 10) : startVerse;
    if (isNaN(startVerse) || startVerse > 200) continue;

    if (chapter && refChapter !== chapter) continue;

    const lineStart = match[0].match(/^[\n\s]*/)?.[0] || "";
    const beforeMatch = fullText.substring(Math.max(0, match.index - 1), match.index);
    const isLineStart = match.index === 0 || beforeMatch === "\n" || lineStart.includes("\n");
    if (!isLineStart) continue;

    const actualStart = match.index + lineStart.length;
    sections.push({
      startVerse,
      endVerse,
      startIndex: actualStart,
      headerEnd: match.index + match[0].length,
      isPrimary: true,
    });
  }

  while ((match = bookRefInlinePattern.exec(fullText)) !== null) {
    const refChapter = parseInt(match[1], 10);
    const startVerse = parseInt(match[2], 10);
    const endVerse = match[3] ? parseInt(match[3], 10) : startVerse;
    if (isNaN(startVerse) || startVerse > 200) continue;

    if (chapter && refChapter !== chapter) continue;

    const alreadyCovered = sections.some(
      (s) => Math.abs(s.startIndex - match!.index) < 10
    );
    if (alreadyCovered) continue;

    const prevNewline = fullText.lastIndexOf("\n", match.index);
    const sectionStart = prevNewline >= 0 ? prevNewline + 1 : match.index;

    sections.push({
      startVerse,
      endVerse,
      startIndex: sectionStart,
      headerEnd: match.index + match[0].length,
      isPrimary: true,
    });
  }

  // Matches verse/verses markers in various forms:
  //   آية 35:          classic form
  //   (آية 35):        with surrounding parens
  //   آية (35):        number in parens  ← was previously missed
  //   الآيات (31-33):  range in parens   ← was previously missed
  //   الآيات (52\'a153): \'a1 = Windows-1252 artifact for ¡ used as range sep
  // Group 1 = startVerse, Group 2 = endVerse (optional)
  const versePattern =
    /(?:^|\n)\s*\(?(?:ال)?[أآ]ي[ةات]+\s*\(?\s*(\d+)(?:\s*(?:[-–]|\\'a1)\s*(\d+))?\s*\)?\s*[:：]/g;

  while ((match = versePattern.exec(fullText)) !== null) {
    const verseNum = parseInt(match[1], 10);
    const verseEnd = match[2] ? parseInt(match[2], 10) : verseNum;
    if (isNaN(verseNum) || verseNum < 1 || verseNum > 200) continue;

    const alreadyCovered = sections.some(
      (s) => Math.abs(s.startIndex - match!.index) < 5
    );
    if (alreadyCovered) continue;

    const actualStart = match.index + (match[0].match(/^[\n\s]*/)?.[0].length || 0);
    sections.push({
      startVerse: verseNum,
      endVerse: verseEnd,
      startIndex: actualStart,
      headerEnd: match.index + match[0].length,
      isPrimary: false,
    });
  }

  sections.sort((a, b) => a.startIndex - b.startIndex);

  // NOTE: do NOT short-circuit here when sections.length === 0.
  // The last-resort at the bottom of this function handles plain-text blobs
  // (no section headers at all) by returning the full text — that path is
  // only reachable when sections is empty.

  let parentSection: { idx: number; section: VerseSection } | null = null;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section.isPrimary && verse >= section.startVerse && verse <= section.endVerse) {
      if (!parentSection || section.startIndex < parentSection.section.startIndex) {
        parentSection = { idx: i, section };
      }
    }
  }

  /** Strip header artifacts and return clean content from a section.
   *  Iterates until stable so that peeling one layer doesn't reveal another. */
  function cleanContent(raw: string): string {
    // Strip outer quotes first (CSV double-quote escaping artifacts)
    let s = raw
      .replace(/^[\u0022\u201c\u201d\u2018\u2019]+/, "")
      .replace(/[\u0022\u201c\u201d\u2018\u2019]+$/, "")
      .trim();

    // Iteratively strip leading artifacts (each pass may reveal another layer)
    let prev = "";
    while (s !== prev) {
      prev = s;
      s = s
        // English cross-reference line: "Luk 24:22-30" or "Mat 5:3"
        .replace(/^[A-Za-z]{1,10}[ \t]+\d+:\d+(?:[-–]\d+)?[ \t]*\n?/, "")
        // Sub-section label: "الآيات (31-33):" or "(آية25):" or "آية 5:"
        // Also handles \'a1 separator (Windows-1252 artifact): الآيات (52\'a153):
        .replace(/^\(?(?:ال)?[أآ]ي[ةات]+\s*\(?\s*\d+(?:(?:[\s\-–]|\\'a1)\d+)?\s*\)?\s*[:：]\s*/u, "")
        // Parenthesised Arabic section subtitle with no digits or colons:
        // e.g. "(المعمدان يكمل شهادته)" — strip it so we fall through to real content
        .replace(/^\([\u0600-\u06FF\u0020]{3,60}\)\s*\n?/u, "")
        // Remaining leading/trailing quote artifacts
        .replace(/^[\u0022\u201c\u201d\u2018\u2019]+/, "")
        .replace(/[\u0022\u201c\u201d\u2018\u2019]+$/, "")
        .trim();
    }
    return s;
  }

  if (parentSection) {
    const nextPrimaryIdx = sections.findIndex(
      (s, idx) => idx > parentSection!.idx && s.isPrimary
    );
    const parentEnd = nextPrimaryIdx >= 0
      ? sections[nextPrimaryIdx].startIndex
      : fullText.length;

    for (let i = parentSection.idx + 1; i < sections.length; i++) {
      if (sections[i].startIndex >= parentEnd) break;
      const section = sections[i];
      if (verse >= section.startVerse && verse <= section.endVerse) {
        // Use headerEnd so we skip past the sub-section label (e.g. "(آية25):")
        const contentStart = section.headerEnd;
        const end = i + 1 < sections.length
          ? sections[i + 1].startIndex
          : fullText.length;
        const content = cleanContent(fullText.substring(contentStart, end).trim());
        if (content.length >= 30) return content;
      }
    }

    // Return content after the range header (e.g. "( لو22:1-6): ")
    const rawContent = fullText.substring(parentSection.section.headerEnd, parentEnd).trim();
    const cleaned = cleanContent(rawContent);
    return cleaned.length >= 20
      ? cleaned
      : fullText.substring(parentSection.section.startIndex, parentEnd).trim();
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (verse >= section.startVerse && verse <= section.endVerse) {
      // Use headerEnd to skip section labels (e.g. "الآيات (35-38):")
      const contentStart = section.headerEnd;
      const end =
        i + 1 < sections.length ? sections[i + 1].startIndex : fullText.length;
      const content = cleanContent(fullText.substring(contentStart, end).trim());
      if (content.length >= 20) return content;
      // Nothing useful after the header — fall through to full text
    }
  }

  if (sections.length > 0) {
    const firstSection = sections[0];
    // If the verse appears BEFORE all known sections, the preamble is the tafsir
    if (verse < firstSection.startVerse && firstSection.startIndex > 50) {
      return fullText.substring(0, firstSection.startIndex).trim();
    }

    // Fallback: verse has no explicit marker — return content from the nearest
    // preceding section in textual order (covers unmarked tail verses like
    // رومية 8:27-39 and يوحنا 3:26 which have no individual آية markers).
    const prevSection = [...sections].reverse().find((s) => s.startVerse <= verse);
    if (prevSection) {
      const prevIdx = sections.indexOf(prevSection);
      const end =
        prevIdx + 1 < sections.length
          ? sections[prevIdx + 1].startIndex
          : fullText.length;
      const content = cleanContent(fullText.substring(prevSection.headerEnd, end).trim());
      if (content.length >= 50) return content;
    }

    // Sections exist but none covers this verse — don't return the full blob as
    // it would be misleading content from a different section's range.
    return null;
  }

  // No structured sections found at all — return the raw text as last resort
  return fullText.length > 50 ? fullText : null;
}

// Regex for the range header at the START of a tafsir field:
//   ( لو22:1-6):    Arabic book abbrev (no trailing digits) + chapter:verseStart-verseEnd
//   ( 2كو5:21):     digit-prefixed book abbrev
//   (36:3):         numeric only (no book name)
// Book part: optional leading digits + Arabic letters only (no digits after Arabic)
// Groups: [1]=chapter, [2]=startVerse, [3]=endVerse (optional)
const HEADER_RE =
  /^\s*\(\s*(?:\d*[\u0600-\u06FF]+\s*)?(\d+)\s*:\s*(\d+)(?:\s*[-–\u00a1]\s*(\d+))?\s*\)\s*:?\s*/;

function stripTafsirHeader(text: string): string {
  return text
    .replace(HEADER_RE, "")
    .replace(/^[\u0022\u201c\u201d\u2018\u2019]+/, "")
    .replace(/[\u0022\u201c\u201d\u2018\u2019]+$/, "")
    .trim();
}

export function getVerseTafsir(
  csvName: string,
  chapter: number,
  verse: number
): string | null {
  const entries = loadEntries(csvName, chapter);
  if (!entries) return null;

  const chapterEntries = entries.filter((e) => e.chapter === chapter);

  // ── Step 1: Try every entry for this exact verse (CSV may have duplicates
  //   with different tafsir blobs; the first one may not contain the right section)
  const verseEntries = chapterEntries.filter((e) => e.verse === verse);
  for (const entry of verseEntries) {
    if (!entry.tafsir) continue;
    const extracted = extractVerseTafsir(entry.tafsir, verse, chapter);
    if (extracted && extracted.length >= 20) return extracted;
  }

  // ── Step 2: Scan ALL chapter entries with extractVerseTafsir
  //   (the target section may live in a different row's tafsir blob)
  //   Use a Set to avoid rescanning the same blob twice.
  const seenBlobs = new Set(verseEntries.map((e) => e.tafsir));
  for (const entry of chapterEntries) {
    if (!entry.tafsir || seenBlobs.has(entry.tafsir)) continue;
    seenBlobs.add(entry.tafsir);
    const extracted = extractVerseTafsir(entry.tafsir, verse, chapter);
    if (extracted && extracted.length >= 20) return extracted;
  }

  // ── Step 3: Fallback — return any chapter entry whose FIRST range header
  //   covers the verse (handles blobs where extractVerseTafsir finds nothing)
  for (const entry of chapterEntries) {
    if (!entry.tafsir) continue;
    const m = HEADER_RE.exec(entry.tafsir);
    if (!m) continue;
    const refChapter = parseInt(m[1], 10);
    const startVerse = parseInt(m[2], 10);
    const endVerse = m[3] ? parseInt(m[3], 10) : startVerse;
    if (refChapter === chapter && verse >= startVerse && verse <= endVerse) {
      const stripped = stripTafsirHeader(entry.tafsir);
      if (stripped.length >= 20) return stripped;
    }
  }

  return null;
}

export function listAvailableBooks(): string[] {
  const books = new Set<string>();

  const tafsirDir = getTafsirDir();
  if (fs.existsSync(tafsirDir)) {
    fs.readdirSync(tafsirDir)
      .filter((f) => f.endsWith(".csv"))
      .forEach((f) => books.add(f.replace(".csv", "")));
  }

  const partsDir = getTafsirPartsDir();
  if (fs.existsSync(partsDir)) {
    fs.readdirSync(partsDir)
      .filter((f) => f.endsWith(".csv"))
      .forEach((f) => {
        const match = f.match(/^(.+)_\d+_\d+\.csv$/);
        if (match) books.add(match[1]);
      });
  }

  return Array.from(books).sort();
}
