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
  // بعض الملفات فيها BOM في أولها وسطور بنهايات CRLF
  const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 2) return entries;

  // ⚠️ الملفات دي مكتوبة بشكل غلط: حقل التفسير بيفتح بعلامة تنصيص و**ماتتقفلش
  // أبداً** (كل سطر فيه عدد فردي من العلامات). فعدّ العلامات — اللي كان
  // مستخدَم قبل كده — بيخلّي السجل يفضل "مفتوح" ويبلع السجلات اللي بعده، فيظهر
  // للمستخدم نص فيه صفوف CSV خام زي «أمثال,3,4,"…».
  //
  // الحاجة الوحيدة الموثوقة إن كل سجل بيبدأ بسطر شكله:
  //     <اسم السفر>,<رقم الإصحاح>,<رقم الآية>,
  // وأي سطر تاني هو امتداد للتفسير اللي قبله. وعشان ما نقسّمش سجل بالغلط لو
  // نص التفسير نفسه فيه سطر شبه ده، بنشترط إن اسم السفر يبقى **نفس** الاسم
  // اللي في أول سجل في الملف.
  const RECORD_START = /^("?)([^,\n]{0,40}?)\1,(\d+),(\d+),/;

  let bookLabel: string | null = null;
  let cur: { book: string; chapter: number; verse: number; parts: string[] } | null = null;

  const flush = () => {
    if (!cur) return;
    const tafsir = cur.parts
      .join("\n")
      .replace(/^"/, "")        // علامة الفتح
      .replace(/"$/, "")        // علامة الإقفال لو الملف سليم
      .replace(/""/g, '"')      // تنصيص مهروب جوّه الحقل
      // بقايا RTF زي \'a1 — في ترويسات المدى بتلعب دور شرطة الفصل
      .replace(/\\'[0-9a-fA-F]{2}/g, "-")
      .trim();
    if (tafsir) {
      entries.push({ book: cur.book, chapter: cur.chapter, verse: cur.verse, tafsir });
    }
    cur = null;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const m = RECORD_START.exec(line);
    const book = m ? m[2].trim() : null;

    // أول سجل في الملف بيحدّد اسم السفر المعتمد لباقي الملف
    if (m && bookLabel === null) bookLabel = book;

    if (m && book === bookLabel) {
      flush();
      cur = {
        book: book!,
        chapter: parseInt(m[3], 10),
        verse: parseInt(m[4], 10),
        parts: [line.slice(m[0].length)],
      };
    } else if (cur) {
      cur.parts.push(line);
    }
  }
  flush();

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

// ── التحقّق من إن النص فعلاً بتاع الإصحاح المطلوب ────────────────────────────
// التفسير بيفتتح بترويسة بتسمّي إصحاحه بالحروف («الإصحاح الثانى»). ده شاهد
// مستقل عن ترقيم الـCSV، وبيكشف السجلات اللي اترقّمت غلط في الاستخراج.

const ORD_ONES = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس',
  'السابع', 'الثامن', 'التاسع'];
const ORD_UNITS = ['', 'الحادي', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس',
  'السابع', 'الثامن', 'التاسع'];
// كل عقد بصيغتيه: الرفع (العشرون) والجر (العشرين) — النصوص بتستخدم الاتنين.
const ORD_TENS: Record<number, string[]> = {
  10: ['العاشر'],
  20: ['العشرون', 'العشرين'], 30: ['الثلاثون', 'الثلاثين'],
  40: ['الأربعون', 'الأربعين'], 50: ['الخمسون', 'الخمسين'],
  60: ['الستون', 'الستين'], 70: ['السبعون', 'السبعين'],
  80: ['الثمانون', 'الثمانين'], 90: ['التسعون', 'التسعين'],
  100: ['المائة', 'المئة'],
};

/** توحيد الألف/الياء/التاء المربوطة وحذف التشكيل — الملفات مش متسقة فيهم. */
function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOrdinals(): Map<string, number> {
  const m = new Map<string, number>();
  const put = (s: string, n: number) => { if (s) m.set(normalizeArabic(s), n); };
  for (let i = 1; i <= 9; i++) put(ORD_ONES[i], i);
  put(ORD_TENS[10][0], 10);
  for (let i = 11; i <= 19; i++) put(`${ORD_UNITS[i - 10]} عشر`, i);
  for (const t of [20, 30, 40, 50, 60, 70, 80, 90]) {
    for (const form of ORD_TENS[t]) {
      put(form, t);
      for (let u = 1; u <= 9; u++) put(`${ORD_UNITS[u]} و${form}`, t + u);
    }
  }
  for (const hundred of ORD_TENS[100]) {
    put(hundred, 100);
    for (let u = 1; u <= 9; u++) put(`${ORD_ONES[u]} بعد ${hundred}`, 100 + u);
    for (const t of [10, 20, 30, 40, 50]) {
      for (const form of ORD_TENS[t]) {
        put(`${form} بعد ${hundred}`, 100 + t);
        for (let u = 1; u <= 9; u++) {
          if (t === 10) put(`${ORD_UNITS[u]} عشر بعد ${hundred}`, 110 + u);
          else put(`${ORD_UNITS[u]} و${form} بعد ${hundred}`, 100 + t + u);
        }
      }
    }
  }
  return m;
}

const ORDINALS = buildOrdinals();

/**
 * رقم الإصحاح اللي النص بيقول عن نفسه إنه هو، أو null لو الترويسة مش مصرّحة.
 *
 * بنقرا **سطر الترويسة الأول بس**. لو وسّعنا أكتر بنلقط أرقام من المتن — زي
 * «كان المفروض أن يأتى بعد الإصحاح 18» أو «الإصحاح 1- سنير» (ترقيم قائمة) —
 * وكل دي بتدّي إنذارات كاذبة.
 */
export function declaredChapter(text: string): number | null {
  const head = normalizeArabic(text.split('\n')[0] ?? '');
  const digits = /^(?:مقدمه\s+)?(?:ل)?(?:الاصحاح|الاصحاحات)\s+(\d+)/.exec(head);
  if (digits) return parseInt(digits[1], 10);

  const m = /^(?:مقدمه\s+)?(?:ل)?(?:الاصحاح|الاصحاحات)\s+(.{1,32})/.exec(head);
  if (!m) return null;
  // الأطول أولاً عشان «الثاني والعشرون» ما تتقريش «الثاني»
  let best: number | null = null, bestLen = 0;
  for (const [name, num] of ORDINALS) {
    if (name.length > bestLen && m[1].startsWith(name)) { best = num; bestLen = name.length; }
  }
  return best;
}

/**
 * هل النص ده فعلاً بتاع الإصحاح المطلوب؟
 * بنرفض بس لما الترويسة تصرّح برقم **مختلف**. لو مفيش ترويسة مصرّحة (٢١٥ إصحاح
 * من ١١٨٩) بنقبله — الغياب مش دليل على الخطأ.
 */
export function belongsToChapter(text: string, chapter: number): boolean {
  const declared = declaredChapter(text);
  if (declared === null || declared === chapter) return true;
  // ترويسة مدى: «الإصحاحات السابع عشر حتى الحادى والعشرون» بتبدأ بأول رقم،
  // فأي إصحاح بعده جوّه المدى مقبول.
  const isRange = /الاصحاحات/.test(normalizeArabic(text.split('\n')[0] ?? ''));
  return isRange && chapter > declared;
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

/**
 * زي getChapterTafsir بالظبط بس **من غير** فلتر المحاذاة.
 * موجودة عشان script/check-tafsir-alignment.ts يقدر يشوف السجلات المرقّمة غلط؛
 * لو استخدم النسخة المفلترة هيلاقيها اتشالت وما يكشفش حاجة.
 * ماتستخدمهاش في أي راوت — دي للتشخيص بس.
 */
export function getChapterTafsirRaw(csvName: string, chapter: number): string | null {
  return chapterTafsir(csvName, chapter, false);
}

export function getChapterTafsir(csvName: string, chapter: number): string | null {
  return chapterTafsir(csvName, chapter, true);
}

function chapterTafsir(
  csvName: string,
  chapter: number,
  enforceAlignment: boolean
): string | null {
  const entries = loadEntries(csvName, chapter);
  if (!entries) return null;

  // بعض السجلات مرقّمة غلط في المصدر: عدد ١٩ متخزّن فيه تفسير عدد ٢٧، وحزقيال ٣
  // فيه تفسير حزقيال ٢. لو عرضناها زي ما هي، القارئ بياخد تفسير إصحاح تاني
  // **على إنه تفسير الإصحاح اللي فتحه** — وده أسوأ من إنه ما يلاقيش حاجة.
  // النص بيصرّح برقم إصحاحه في ترويسته، فنستبعد أي سجل بيقول رقم مختلف.
  const chapterEntries = entries
    .filter((e) => e.chapter === chapter)
    .filter((e) => !enforceAlignment || belongsToChapter(e.tafsir, chapter));
  if (chapterEntries.length === 0) return null;

  // الإصحاح الواحد ممكن يبقى ليه أكتر من نص: عنوان قصير («الإصحاح الخامس»)
  // جنب الشرح الكامل. لازم نرجّع الأغنى مش أول واحد نلاقيه — قبل كده كان متى ٥
  // بيعرض «الإصحاح الخامس» وبس رغم إن التفسير كله موجود في صف تاني.
  // القياس بالمحتوى المختلف مش بالطول الخام، عشان صف مليان سطر مكرّر ألف مرة
  // ما يكسبش (تكوين ٣ فيه صف كده).
  const richest = (list: TafsirEntry[]): string | null => {
    let best: string | null = null;
    let bestLen = -1;
    for (const e of list) {
      const len = uniqueContentLength(e.tafsir);
      if (len > bestLen) { bestLen = len; best = e.tafsir; }
    }
    return best;
  };

  // تخطّي الآية ١ له معنى في الإصحاح الأول بس — هناك بتكون مقدمة السفر أو
  // مقدمة العهد، مش تفسير الإصحاح. في باقي الأصحاحات الآية ١ هي مكان التفسير
  // نفسه، وتخطّيها كان بيرمي الشرح كله: متى ٥ عنده صفّين الاتنين على آية ١،
  // واحد ٢٩ ألف حرف والتاني ٢٦ حرف، والفلتر كان بيرمي الاتنين وينتهي بالأقصر.
  if (chapter === 1) {
    const v1Entry = chapterEntries.find((e) => e.verse === 1);
    const hasTestamentIntro =
      v1Entry &&
      (v1Entry.tafsir.startsWith("مقدمة عن العهد القديم") ||
        v1Entry.tafsir.startsWith("مقدمة عن العهد الجديد"));

    const skipVerses = hasTestamentIntro ? [1, 2] : [1];
    const chapterTafsir = richest(
      chapterEntries.filter((e) => !skipVerses.includes(e.verse))
    );
    if (chapterTafsir) return chapterTafsir;
  }

  const best = richest(chapterEntries);
  if (best) return best;

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

/**
 * تفسير آية بعينها، أو null لو مفيش.
 *
 * الغلاف ده بيرفض حاجة واحدة: إن نرجّع **مقدمة السفر** على إنها تفسير الآية.
 *
 * ليه: extractVerseTafsir لما ما تلاقيش قسم للآية بترجّع النص الخام كله، وسجل
 * الإصحاح الأول غالباً هو المقدمة. القياس على ٥٠٠ عيّنة (٤ آيات × أول إصحاحين
 * × ٦٥ سفر) طلّع ١٧٣ حالة — ٣٥٪ في ٥٨ سفر — بترجّع المقدمة. المستخدم اللي
 * بيضغط «تفسير الآية» ويشوف المقدمة مفيش قدامه أي علامة إنها مش تفسير آيته.
 *
 * عرض النص الغلط أسوأ من عرض «مفيش» — نفس المبدأ اللي اتعملت بيه
 * belongsToChapter().
 */
export function getVerseTafsir(
  csvName: string,
  chapter: number,
  verse: number
): string | null {
  const t = verseTafsirRaw(csvName, chapter, verse);
  if (!t) return null;
  const intro = getBookIntro(csvName);
  if (intro && sameOpening(t, intro)) return null;
  return t;
}

/** أول ٨٠ حرف متطابقة (بعد توحيد المسافات) = نفس النص عملياً. */
function sameOpening(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80);
  return norm(a) === norm(b);
}

function verseTafsirRaw(
  csvName: string,
  chapter: number,
  verse: number
): string | null {
  const entries = loadEntries(csvName, chapter);
  if (!entries) return null;

  // نفس فلتر getChapterTafsir — سجل مرقّم غلط ما ينفعش يتقرا كتفسير آية كمان.
  const chapterEntries = entries
    .filter((e) => e.chapter === chapter)
    .filter((e) => belongsToChapter(e.tafsir, chapter));

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

// ── تدقيق التغطية ────────────────────────────────────────────────────────────
// عدد الأصحاحات الحقيقي لكل سفر (بأسماء ملفات الـCSV زي ما هي في
// client/src/lib/tafsir-csv-service.ts). لازم نعرف الرقم المتوقّع عشان نقدر
// نقول «ناقص إصحاح ٣» بدل ما نقول بس «الملف موجود».
export const EXPECTED_CHAPTERS: Record<string, number> = {
  "تكوين": 50, "خروج": 40, "لاويين": 27, "عدد": 36, "تثنية": 34,
  "يشوع": 24, "قضاة": 21, "راعوث": 4, "صموئيل أول": 31, "صموئيل ثاني": 24,
  "ملوك أول": 22, "ملوك ثاني": 25, "أخبار أيام أول": 29, "أخبار أيام ثاني": 36,
  "عزرا": 10, "نحميا": 13, "أستير": 10, "أيوب": 42, "مزامير": 150,
  "أمثال": 31, "جامعة": 12, "نشيد الأنشاد": 8, "إشعياء": 66, "إرميا": 52,
  "مراثي إرميا": 5, "حزقيال": 48, "دانيال": 12, "هوشع": 14, "يوئيل": 3,
  "عاموس": 9, "عوبديا": 1, "يونان": 4, "ميخا": 7, "ناحوم": 3, "حبقوق": 3,
  "صفنيا": 3, "حجي": 2, "زكريا": 14, "ملاخي": 4,
  "متى": 28, "مرقس": 16, "لوقا": 24, "يوحنا": 21, "أعمال الرسل": 28,
  "رومية": 16, "كورنثوس أولى": 16, "كورنثوس ثانية": 13, "غلاطية": 6,
  "أفسس": 6, "فيلبي": 4, "كولوسي": 4, "تسالونيكي أولى": 5,
  "تسالونيكي ثانية": 3, "تيموثاوس أولى": 6, "تيموثاوس ثانية": 4,
  "تيطس": 3, "فليمون": 1, "عبرانيين": 13, "يعقوب": 5, "بطرس أولى": 5,
  "بطرس ثانية": 3, "يوحنا أولى": 5, "يوحنا ثانية": 1, "يوحنا ثالثة": 1,
  "يهوذا": 1, "رؤيا": 22,
  "طوبيا": 14, "يهوديت": 16, "حكمة سليمان": 19,
  "يشوع بن سيراخ": 51, "باروخ": 6,
  "المكابيين الأول": 16, "المكابيين الثاني": 15,
};

export interface BookCoverage {
  book: string;
  expected: number;
  present: number;
  missing: number[];
  /** true = مفيش ملف CSV للسفر ده أصلاً (مش مجرد أصحاحات ناقصة) */
  fileMissing: boolean;
  /** أصحاحات موجودة في الملف بس رقمها أكبر من عدد أصحاحات السفر (بيانات غلط) */
  extra: number[];
  /** أصحاحات فيها تفسير حقيقي (≥ SUBSTANTIVE_MIN_CHARS)، مش مجرد عنوان */
  substantive: number;
  /** طول النص عند الوسيط — مؤشّر سريع على عمق التفسير في السفر ده */
  medianChars: number;
}

export interface TafsirCoverage {
  books: BookCoverage[];
  totals: {
    expectedChapters: number;
    presentChapters: number;
    /** منهم: كام إصحاح فيه تفسير حقيقي مش مجرد عنوان قسم */
    substantiveChapters: number;
    missingBooks: number;
  };
  tafsirDir: string;
  partsDir: string;
  /**
   * ملفات CSV موجودة في المجلد بس اسمها مش مطابق لأي اسم سفر متوقّع.
   * دي أخطر حالة: الملف موجود والتفسير جوّاه، بس التطبيق مش بيلاقيه لأن
   * الاسم غلط (مثلاً "سفر الأمثال.csv" بدل "أمثال.csv") — فالمستخدم بيشوف
   * «لا يوجد تفسير» رغم إن البيانات موجودة.
   */
  unknownFiles: { file: string; suggestion: string | null }[];
}

/** أقرب اسم سفر متوقّع لاسم ملف غريب — عشان نقترح إعادة التسمية الصح. */
function closestBookName(name: string): string | null {
  const stripped = name.replace(/^سفر\s+/, '').replace(/^ال/, '').trim();
  let best: string | null = null;
  let bestLen = 0;
  for (const book of Object.keys(EXPECTED_CHAPTERS)) {
    const bare = book.replace(/^ال/, '');
    if (name.includes(book) || book.includes(stripped) || stripped.includes(bare)) {
      if (book.length > bestLen) { best = book; bestLen = book.length; }
    }
  }
  return best;
}

let coverageCache: TafsirCoverage | null = null;

/**
 * الحد الأدنى لطول النص عشان نعتبره **تفسير حقيقي** مش مجرد عنوان.
 * كتير من الملفات فيها عنوان القسم بس — زي «الإصحاح الأول» أو
 * «( يو1:1-18) المسيح الأزلي صار جسداً» — من غير أي شرح بعده.
 */
export const SUBSTANTIVE_MIN_CHARS = 120;

/**
 * لكل إصحاح في الملف: أطول نص تفسير موجود له.
 * بنرجّع الأطوال مش النصوص عشان ما نحتفظش بميجابايتات في الذاكرة.
 */
function chapterTextLengths(filePath: string): Map<number, number> {
  const found = new Map<number, number>();
  try {
    const entries = parseCSV(fs.readFileSync(filePath, "utf-8"));
    for (const e of entries) {
      if (!e.tafsir || e.tafsir.length < 20) continue;
      // نفس الفلتر اللي في getChapterTafsir — من غيره التقرير بيقول إن الإصحاح
      // فيه تفسير والتطبيق بيعرض «مفيش»، وهو ده اللي بيحصل في عدد ١٩ وحزقيال ٣.
      if (!belongsToChapter(e.tafsir, e.chapter)) continue;
      const len = uniqueContentLength(e.tafsir);
      const prev = found.get(e.chapter) ?? 0;
      if (len > prev) found.set(e.chapter, len);
    }
  } catch (err) {
    console.error(`[tafsir] coverage: تعذّرت قراءة ${filePath}:`, err);
  }
  return found;
}

/**
 * طول النص بعد ما نشيل السطور المكرّرة.
 *
 * بعض السجلات فيها نفس السطر متكرّر مئات المرات (خلل في الاستخراج من المصدر) —
 * مثلاً تكوين ٣ فيه سجل ١٠٠ ألف حرف عبارة عن آية واحدة متكرّرة ١٤٠٠ مرة. لو
 * قِسنا الطول الخام هنعتبره «تفسير عميق» وهو مجرد قمامة، فالقياس لازم يبقى على
 * المحتوى المختلف بس.
 */
function uniqueContentLength(text: string): number {
  const seen = new Set<string>();
  let total = 0;
  for (const line of text.split("\n")) {
    const key = line.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    total += key.length;
  }
  return total;
}

/** كل ملفات الـCSV اللي بتخصّ سفر معيّن (الملف الكامل + ملفات الأجزاء). */
function filesForBook(csvName: string): string[] {
  const out: string[] = [];
  const full = path.join(getTafsirDir(), `${csvName}.csv`);
  if (fs.existsSync(full)) out.push(full);

  const partsDir = getTafsirPartsDir();
  if (fs.existsSync(partsDir)) {
    for (const f of fs.readdirSync(partsDir)) {
      if (f.startsWith(`${csvName}_`) && /_\d+_\d+\.csv$/.test(f)) {
        out.push(path.join(partsDir, f));
      }
    }
  }
  return out;
}

/**
 * تقرير كامل: كل سفر، كل إصحاح — فيه تفسير ولا لأ.
 * بيقرا كل ملف مرة واحدة وبيرمي النص بعدها، فماينفخش الذاكرة زي loadEntries.
 * النتيجة متخزّنة في الكاش لأنها غالية؛ استخدم refresh=true بعد ما تضيف ملفات.
 */
export function getTafsirCoverage(refresh = false): TafsirCoverage {
  if (coverageCache && !refresh) return coverageCache;

  const books: BookCoverage[] = [];
  let expectedChapters = 0;
  let presentChapters = 0;
  let substantiveChapters = 0;
  let missingBooks = 0;

  for (const [book, expected] of Object.entries(EXPECTED_CHAPTERS)) {
    expectedChapters += expected;
    const files = filesForBook(book);
    if (files.length === 0) {
      missingBooks++;
      books.push({
        book, expected, present: 0, missing: [], fileMissing: true, extra: [],
        substantive: 0, medianChars: 0,
      });
      continue;
    }

    const lengths = new Map<number, number>();
    for (const f of files) {
      for (const [ch, len] of chapterTextLengths(f)) {
        if (len > (lengths.get(ch) ?? 0)) lengths.set(ch, len);
      }
    }

    const missing: number[] = [];
    for (let c = 1; c <= expected; c++) if (!lengths.has(c)) missing.push(c);
    const extra = Array.from(lengths.keys())
      .filter((c) => c < 1 || c > expected).sort((a, b) => a - b);

    const inRange = Array.from(lengths.entries()).filter(([c]) => c >= 1 && c <= expected);
    const substantive = inRange.filter(([, len]) => len >= SUBSTANTIVE_MIN_CHARS).length;
    const sorted = inRange.map(([, len]) => len).sort((a, b) => a - b);
    const medianChars = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    const present = expected - missing.length;
    presentChapters += present;
    substantiveChapters += substantive;
    books.push({
      book, expected, present, missing, fileMissing: false, extra,
      substantive, medianChars,
    });
  }

  // ملفات موجودة بس اسمها مش متعرّف عليه — سبب شائع لـ«لا يوجد تفسير» رغم
  // إن البيانات موجودة فعلاً على السيرفر.
  const unknownFiles: { file: string; suggestion: string | null }[] = [];
  for (const dir of [getTafsirDir(), getTafsirPartsDir()]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.csv')) continue;
      const base = f.replace(/\.csv$/, '').replace(/_\d+_\d+$/, '');
      if (base in EXPECTED_CHAPTERS) continue;
      unknownFiles.push({ file: path.join(dir, f), suggestion: closestBookName(base) });
    }
  }

  coverageCache = {
    books,
    totals: { expectedChapters, presentChapters, substantiveChapters, missingBooks },
    tafsirDir: getTafsirDir(),
    partsDir: getTafsirPartsDir(),
    unknownFiles,
  };
  return coverageCache;
}

/** هل فيه ملف تفسير للسفر ده أصلاً؟ (بيفرّق بين «السفر مش متحمّل» و«الإصحاح ناقص») */
export function hasBookFile(csvName: string): boolean {
  return filesForBook(csvName).length > 0;
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
