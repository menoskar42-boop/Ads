/**
 * نص قراءات القطمارس من الكتاب المقدس عندنا — المرحلة ٢ من docs/MYBIBLE_KATAMEROS_PLAN.md.
 *
 * المرجع (مثلاً «58.13:7-25» أو «45.1:26-2:7» أو «19.32:11,6») ⇒ فقرات بآياتها من فاندايك عندنا.
 * - أرقام الأسفار ١–٦٦ عندهم = أرقامنا بالظبط وبنفس الترتيب (التكوين ١ … رؤيا يوحنا ٦٦).
 * - المزامير بترقيم فاندايك (العبرى) زى عندنا — مزمور ٧٢:١٠ «ملوك ترشيش…» مطابق حرفياً — ومفيش فروق ترقيم
 *   للعربى (جدول VerseRefMappings بتاعهم للإيطالى والألمانى والهولندى بس).
 * - الأسفار القانونية التانية (٦٧–٧٣: طوبيا، الحكمة، يشوع بن سيراخ…) ⇒ **المرجع من غير نص** (`pending`) لحد ما
 *   مصدر نصها يتأكد (data/deutero/README.md: النسبة لفاندايك غلط والمصدر محتاج تحقّق). ٣٨ مرجع، كلهم نبوات.
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
  /** سفر قانونى تانى (أو مرجع لسه بيتراجع): النص مستنى مصدر متأكَّد منه */
  pending?: true;
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

let fixes: Record<string, { to?: string; review?: true }> | null = null;
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
    for (const part of parseKatRef(fx?.to ?? key)) out.push({ part, pending: !!fx?.review || isDeutero(part.bookId, part.chapter) });
  }
  return out;
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
  return ours.get(id) ?? bookNames.get(id) ?? String(id);
}

/** مصدر الآيات: (رقم السفر، الإصحاح) ⇒ الآيات. الافتراضى من bible-cache (ذاكرة ⇐ نسخة الكتاب ⇐ القاعدة). */
export type VerseSource = (bookId: number, chapter: number) => Promise<{ verse: number; text: string }[]>;

export async function readingText(ref: string, getVerses: VerseSource, ours: Map<number, string>): Promise<KatReadingText> {
  const passages: KatPassage[] = [];
  for (const { part, pending } of katParts(ref)) {
    const book = bookName(part.bookId, ours);
    const s = part.spec;
    const range = "list" in s ? s.list.map(ar).join("، ") : `${ar(s.from)}${s.to === "end" ? "-آخره" : s.to === s.from ? "" : "-" + ar(s.to)}`;
    const label = `${book} ${ar(part.chapter)}: ${range}`;
    if (pending) { passages.push({ bookId: part.bookId, book, chapter: part.chapter, label, verses: [], pending: true }); continue; }
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
export async function planWithText(plan: KatPlan, getVerses: VerseSource, ours: Map<number, string>):
  Promise<Omit<KatPlan, "sections"> & { sections: { id: string; title: string; subSections: KatSubText[] }[] }> {
  const sections = [];
  for (const sec of plan.sections) {
    const subSections: KatSubText[] = [];
    for (const sub of sec.subSections) {
      const t: KatSubText = { ...sub };
      if (sub.ref) t.text = await readingText(sub.ref, getVerses, ours);
      if (sub.psalms) t.psalmsText = await Promise.all(sub.psalms.map((r) => readingText(r, getVerses, ours)));
      if (sub.gospels) t.gospelsText = await Promise.all(sub.gospels.map((r) => readingText(r, getVerses, ours)));
      subSections.push(t);
    }
    sections.push({ id: sec.id, title: sec.title, subSections });
  }
  return { ...plan, sections };
}
