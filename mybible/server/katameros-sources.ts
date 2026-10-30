/**
 * مصادر نص القطمارس على السيرفر — اللى المرحلة ٤ (التحويل) هتستخدمه مع planWithText.
 *
 * - الأسفار ١–٦٦: bibleCache (الذاكرة ⇐ نسخة الكتاب ⇐ القاعدة) — نفس اللى صفحات الكتاب بتقرا منه.
 * - القانونية التانية: ملفنا sttakla-1877.json الأول (جوّه katameros-text)، ولو مااشتغلش ⇒ St-Takla لحظياً بنفس
 *   getStTaklaChapter اللى تبويب الأسفار القانونية وجروب مار مرقس بيقروا بيه (قرار المالك ٢٠٢٦-١٠-٣٠: «خلى سانت
 *   تكلا موجود احتياطى لو ملفاتنا مشتغلتش»). النتيجة بتتخزّن فى الذاكرة ٦ ساعات (والفشل ٥ دقايق) عشان مانضربش
 *   St-Takla مع كل زيارة.
 */
import type { DeuteroLive, VerseSource, TextOptions } from "./katameros-text";

/** اسم السفر ⇒ رقمه فى STTAKLA_BOOKS (server/deutero.ts) — مش أرقام katameros */
export const STTAKLA_IDS: Record<string, number> = {
  "طوبيا": 67, "يهوديت": 68, "الحكمة": 69, "يشوع بن سيراخ": 70, "باروخ": 71, "المكابيين الأول": 72, "المكابيين الثاني": 73,
};

type Verses = { verse: number; text: string }[] | null;
const liveCache = new Map<string, { at: number; ttl: number; v: Verses }>();
const OK_TTL = 6 * 3600_000, FAIL_TTL = 5 * 60_000;

/** St-Takla الاحتياطى. fetchChapter بيتمرّر فى الاختبار؛ الافتراضى getStTaklaChapter (import متأخّر عشان القاعدة) */
export function makeDeuteroLive(
  fetchChapter?: (stBookId: number, chapter: number) => Promise<{ ok: boolean; verses?: { verse: number; text: string }[] }>,
  now: () => number = Date.now,
): DeuteroLive {
  return async (bookName, chapter) => {
    const id = STTAKLA_IDS[bookName];
    if (!id) return null;
    const key = `${id}:${chapter}`;
    const hit = liveCache.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.v;
    let v: Verses = null;
    try {
      const fetcher = fetchChapter ?? (await import("./deutero")).getStTaklaChapter;
      const r = await fetcher(id, chapter);
      v = r.ok && r.verses?.length ? r.verses : null;
    } catch { v = null; }
    liveCache.set(key, { at: now(), ttl: v ? OK_TTL : FAIL_TTL, v });
    return v;
  };
}
export function _clearDeuteroLiveCache(): void { liveCache.clear(); }

/** الآيات من bibleCache (import متأخّر: الملف ده بيتقرا من غير ما القاعدة تتفتح) */
export const bibleVerses: VerseSource = async (bookId, chapter) => {
  const { bibleCache } = await import("./bible-cache");
  return (await bibleCache.getVersesByBook(bookId, chapter)).map((v) => ({ verse: v.verse, text: v.text }));
};

export const defaultTextOptions = (): TextOptions => ({ deuteroLive: makeDeuteroLive() });
