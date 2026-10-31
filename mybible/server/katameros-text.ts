/**
 * نص قراءات القطمارس من الكتاب المقدس عندنا — المرحلة ٢ من docs/MYBIBLE_KATAMEROS_PLAN.md.
 *
 * المرجع (مثلاً «58.13:7-25» أو «45.1:26-2:7» أو «19.32:11,6») ⇒ فقرات بآياتها من فاندايك عندنا.
 * - أرقام الأسفار ١–٦٦ عندهم = أرقامنا بالظبط وبنفس الترتيب (التكوين ١ … رؤيا يوحنا ٦٦).
 * - المزامير بترقيم فاندايك (العبرى) زى عندنا — مزمور ٧٢:١٠ «ملوك ترشيش…» مطابق حرفياً — ومفيش فروق ترقيم
 *   للعربى (جدول VerseRefMappings بتاعهم للإيطالى والألمانى والهولندى بس).
 * - الأسفار القانونية التانية (٦٧–٧٣: باروخ، طوبيا، يهوديت، المكابيين، الحكمة، يشوع بن سيراخ — نبوات بس) ⇒ النص من
 *   data/deutero/sttakla-1877.json: نفس النص اللى تبويب الأسفار القانونية وجروب مار مرقس بيقروه من St-Takla
 *   (الترجمة اليسوعية ١٨٧٧) — قرار المالك ٢٠٢٦-١٠-٣٠. اتقارن آية آية بالنص العربى فى قاعدة katameros نفسها: نفس
 *   الترجمة ونفس الترقيم (٤٣٣٩ من ٤٣٧٤ آية متطابقة غير الهمزات). إصحاح أرقام آياته مش متتالية (يشوع بن سيراخ ٢٩:
 *   صفحة المصدر ناقصة آيتين) مابيتعرضش منه نص؛ وأى آية ناقصة فى القراءة ⇒ المرجع من غير نص (`pending`).
 *   **St-Takla احتياطى** (قرار المالك ٢٠٢٦-١٠-٣٠: «خلى سانت تكلا موجود احتياطى لو ملفاتنا مشتغلتش»): لو الملف مش
 *   موجود أو بايظ أو الإصحاح مش فيه ⇒ نفس الإصحاح لحظياً من St-Takla (`deuteroLive` — نفس اللى الجروب بيقرا منه)،
 *   وبنفس الشروط: ترقيم متتالى وكل آيات القراءة موجودة، وإلا المرجع بس.
 * - دانيال ١٣ و١٤ (سوسنة وبيل والتنين) تتمة يونانية مش فى فاندايك ⇒ زى القانونية التانية.
 * - مراجع فيها غلطة أو ترقيم تانى (اتلقت بالاختبار) متصحّحة فى data/katameros/ref-fixes.json؛ اللى مش متأكدين من
 *   تصحيحه (`review`) بيتعرض مرجعه من غير نص.
 * - تقسيم المرجع زى ReadingsHelper.GetRefs بالظبط: «@» و«*@+» بيفصلوا فقرات، و«ص١:أ-ص٢:ب» بيتقسم لـ
 *   «ص١:أ-آخره» + الإصحاحات اللى فى النص كاملة + «ص٢:١-ب».
 */
import fs from "node:fs";
import path from "node:path";
import { KATAMEROS_DIR, type KatPlan, type KatSub } from "./katameros-local";

export interface KatVerse { verse: number; text: string }
export interface KatPassage {
  bookId: number;
  book: string;
  chapter: number;
  /** زى ما بيتكتب للقارئ: «متى ٢: ١-١٢» */
  label: string;
  verses: KatVerse[];
  /** سفر قانونى تانى نصه مش كامل عندنا (أو مرجع لسه بيتراجع) ⇒ المرجع بس */
  pending?: true;
  /** النص من data/deutero/sttakla-1877.json (الترجمة اليسوعية ١٨٧٧ — مش فاندايك) — الواجهة تكتب مصدره */
  deutero?: true;
  /** النص جه من St-Takla لحظياً (الاحتياطى) مش من ملفنا */
  live?: true;
}
export interface KatReadingText { ref: string; passages: KatPassage[] }

type VerseSpec = { from: number; to: number | "end" } | { list: number[] };
export interface RefPart { bookId: number; chapter: number; spec: VerseSpec }

/** «45.1:26-2:7@19.32:11,6» ⇒ أجزاء — نفس GetRefs + MakePassage */
export function parseKatRef(ref: string): RefPart[] {
  const out: RefPart[] = [];
  for (const raw of ref.split(/\*@\+|@/)) {
    const part = raw.trim();
    if (!part) continue;
    if (part.indexOf(":") !== part.lastIndexOf(":")) {
      // من إصحاح لإصحاح: «45.1:26-2:7»
      const p = part.split(/[-:]/);
      const [book, ch1] = p[0].split(".").map(Number);
      const v1 = Number(p[1]), ch2 = Number(p[2]);
      let vb2 = 1, ve2 = Number(p[3]);
      if (p.length > 4) { vb2 = Number(p[3]); ve2 = Number(p[4]); }
      out.push({ bookId: book, chapter: ch1, spec: { from: v1, to: "end" } });
      for (let c = ch1 + 1; c < ch2; c++) out.push({ bookId: book, chapter: c, spec: { from: 1, to: "end" } });
      out.push({ bookId: book, chapter: ch2, spec: { from: vb2, to: ve2 } });
      continue;
    }
    const m = /^(\d+)\.(\d+):(.+)$/.exec(part);
    if (!m) throw new Error(`مرجع مش مفهوم: ${part}`);
    const bookId = Number(m[1]), chapter = Number(m[2]), vs = m[3];
    if (vs.includes("-")) {
      const [a, b] = vs.split("-");
      out.push({ bookId, chapter, spec: { from: Number(a), to: b === "end" ? "end" : Number(b) } });
    } else if (vs.includes(",")) {
      out.push({ bookId, chapter, spec: { list: vs.split(",").map(Number) } });   // بالترتيب المكتوب (٣٢: ١١ ثم ٦)
    } else {
      out.push({ bookId, chapter, spec: { list: [Number(vs)] } });
    }
  }
  return out;
}

let fixes: Record<string, { to?: string; review?: true; skip?: true }> | null = null;
function refFixes() {
  if (!fixes) fixes = (JSON.parse(fs.readFileSync(path.join(KATAMEROS_DIR, "ref-fixes.json"), "utf8")) as { fixes: typeof fixes }).fixes ?? {};
  return fixes!;
}
/** سفر قانونى تانى أو تتمة يونانية (دانيال ١٣–١٤) — مالهاش نص متأكَّد منه عندنا */
export const isDeutero = (bookId: number, chapter: number) => bookId > 66 || (bookId === 27 && chapter > 12);

/** المرجع ⇒ أجزاء بعد التصحيحات: كل جزء معاه pending لو نصه مش هيتعرض */
export function katParts(ref: string): { part: RefPart; pending: boolean }[] {
  const out: { part: RefPart; pending: boolean }[] = [];
  for (const raw of ref.split(/\*@\+|@/)) {
    const key = raw.trim();
    if (!key) continue;
    const fx = refFixes()[key];
    if (fx?.skip) continue;
    for (const part of parseKatRef(fx?.to ?? key)) out.push({ part, pending: !!fx?.review || isDeutero(part.bookId, part.chapter) });
  }
  return out;
}

/** أرقام القانونية التانية عند katameros ⇒ اسم السفر فى sttakla-1877.json (= الاسم فى server/deutero.ts) */
export const DEUTERO_NAMES: Record<number, string> = {
  67: "باروخ", 68: "طوبيا", 69: "يهوديت", 70: "المكابيين الأول", 71: "المكابيين الثاني", 72: "الحكمة", 73: "يشوع بن سيراخ",
};
export const DEUTERO_FILE = path.join(KATAMEROS_DIR, "..", "deutero", "sttakla-1877.json");
let deuteroFile = DEUTERO_FILE;
let deuteroBooks: Map<string, Map<number, Map<number, string>>> | null = null;
/** للاختبار: ملف تانى (أو مش موجود) بدل sttakla-1877.json */
export function _setDeuteroFileForTest(file: string): void { deuteroFile = file; deuteroBooks = null; }
/** آيات بترقيم متتالى من ١ ونص مش فاضى ⇒ Map، غير كده null (مانعتمدش على ترقيم مكسور) */
function trustedChapter(verses: { verse: number; text: string }[] | null | undefined): Map<number, string> | null {
  if (!verses?.length || !verses.every((v, i) => v.verse === i + 1 && String(v.text || "").trim())) return null;
  return new Map(verses.map((v) => [v.verse, v.text]));
}
/** آيات إصحاح (verse ⇒ text)، أو null لو السفر أو الإصحاح مش موجود أو أرقام آياته مش متتالية من ١ */
export function deuteroChapter(bookId: number, chapter: number): Map<number, string> | null {
  if (!deuteroBooks) {
    deuteroBooks = new Map();
    try {
      if (fs.existsSync(deuteroFile)) {
        const d = JSON.parse(fs.readFileSync(deuteroFile, "utf8")) as
          { books: { name: string; chapters: { chapter: number; verses: { verse: number; text: string }[] }[] }[] };
        for (const b of d.books) {
          const chapters = new Map<number, Map<number, string>>();
          for (const c of b.chapters) {
            const t = trustedChapter(c.verses);
            if (t) chapters.set(c.chapter, t);
          }
          deuteroBooks.set(b.name, chapters);
        }
      }
    } catch (e: any) {
      // الملف بايظ ⇒ كأنه مش موجود، وSt-Takla الاحتياطى بيشتغل
      console.error("[katameros] تعذّر قراءة sttakla-1877.json:", e?.message || e);
      deuteroBooks = new Map();
    }
  }
  return deuteroBooks.get(DEUTERO_NAMES[bookId] ?? "")?.get(chapter) ?? null;
}
/** مصدر احتياطى لإصحاح قانونى تانى (باسم السفر) — على السيرفر St-Takla لحظياً (katameros-sources.ts) */
export type DeuteroLive = (bookName: string, chapter: number) => Promise<{ verse: number; text: string }[] | null>;
export interface TextOptions { deuteroLive?: DeuteroLive }

/** آيات القراءة من الإصحاح، أو null لو أى آية ناقصة */
function pickAll(ch: Map<number, string>, s: VerseSpec): KatVerse[] | null {
  const to = "list" in s ? 0 : s.to === "end" ? ch.size : s.to;
  const want = "list" in s ? s.list : Array.from({ length: to - s.from + 1 }, (_, i) => s.from + i);
  if (!want.length || want.some((v) => !ch.has(v))) return null;
  return want.map((v) => ({ verse: v, text: ch.get(v)! }));
}
/** نص قراءة قانونية تانية كاملة: من ملفنا، ولو مافيش ⇒ St-Takla الاحتياطى. null لو مفيش نص كامل متأكَّد منه */
async function deuteroPassage(part: RefPart, opts?: TextOptions): Promise<{ verses: KatVerse[]; live: boolean } | null> {
  if (!(part.bookId in DEUTERO_NAMES)) return null;
  const local = deuteroChapter(part.bookId, part.chapter);
  if (local) {
    const v = pickAll(local, part.spec);
    if (v) return { verses: v, live: false };
  }
  if (!opts?.deuteroLive) return null;
  let remote: Map<number, string> | null = null;
  try { remote = trustedChapter(await opts.deuteroLive(DEUTERO_NAMES[part.bookId], part.chapter)); } catch { remote = null; }
  const v = remote && pickAll(remote, part.spec);
  return v ? { verses: v, live: true } : null;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
let bookNames: Map<number, string> | null = null;
/** اسم السفر عندنا (١–٦٦ من نسخة الكتاب، والقانونية التانية من books.json بتاعهم) */
function bookName(id: number, ours: Map<number, string>): string {
  if (!bookNames) {
    const rows = JSON.parse(fs.readFileSync(path.join(KATAMEROS_DIR, "books.json"), "utf8")) as { id: number; ar: string }[];
    bookNames = new Map(rows.map((r) => [r.id, String(r.ar).replace(/^سفر\s+/, "").replace(/^1\s+/, "")]));
  }
  return ours.get(id) ?? DEUTERO_NAMES[id] ?? bookNames.get(id) ?? String(id);
}

/** مصدر الآيات: (رقم السفر، الإصحاح) ⇒ الآيات. الافتراضى من bible-cache (ذاكرة ⇐ نسخة الكتاب ⇐ القاعدة). */
export type VerseSource = (bookId: number, chapter: number) => Promise<{ verse: number; text: string }[]>;

export async function readingText(ref: string, getVerses: VerseSource, ours: Map<number, string>, opts?: TextOptions): Promise<KatReadingText> {
  const passages: KatPassage[] = [];
  for (const { part, pending } of katParts(ref)) {
    const book = bookName(part.bookId, ours);
    const s = part.spec;
    const range = "list" in s ? s.list.map(ar).join("، ") : `${ar(s.from)}${s.to === "end" ? "-آخره" : s.to === s.from ? "" : "-" + ar(s.to)}`;
    const label = `${book} ${ar(part.chapter)}: ${range}`;
    if (pending) {
      const dv = await deuteroPassage(part, opts);
      passages.push(dv
        ? { bookId: part.bookId, book, chapter: part.chapter, label, verses: dv.verses, deutero: true, ...(dv.live ? { live: true as const } : {}) }
        : { bookId: part.bookId, book, chapter: part.chapter, label, verses: [], pending: true });
      continue;
    }
    const all = await getVerses(part.bookId, part.chapter);
    const pick = "list" in s
      ? s.list.map((v) => all.find((x) => x.verse === v)).filter((x): x is { verse: number; text: string } => !!x)
      : all.filter((x) => x.verse >= s.from && (s.to === "end" || x.verse <= s.to));
    passages.push({ bookId: part.bookId, book, chapter: part.chapter, label, verses: pick.map((x) => ({ verse: x.verse, text: x.text })) });
  }
  return { ref, passages };
}

export interface KatSubText extends KatSub { text?: KatReadingText; psalmsText?: KatReadingText[]; gospelsText?: KatReadingText[] }
/** الخطة كلها بنصها — كل مرجع فى كل قسم */
export async function planWithText(plan: KatPlan, getVerses: VerseSource, ours: Map<number, string>, opts?: TextOptions):
  Promise<Omit<KatPlan, "sections"> & { sections: { id: string; title: string; subSections: KatSubText[] }[] }> {
  const sections = [];
  for (const sec of plan.sections) {
    const subSections: KatSubText[] = [];
    for (const sub of sec.subSections) {
      const t: KatSubText = { ...sub };
      if (sub.ref) t.text = await readingText(sub.ref, getVerses, ours, opts);
      if (sub.psalms) t.psalmsText = await Promise.all(sub.psalms.map((r) => readingText(r, getVerses, ours, opts)));
      if (sub.gospels) t.gospelsText = await Promise.all(sub.gospels.map((r) => readingText(r, getVerses, ours, opts)));
      subSections.push(t);
    }
    sections.push({ id: sec.id, title: sec.title, subSections });
  }
  return { ...plan, sections };
}
