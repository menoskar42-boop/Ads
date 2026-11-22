/**
 * تجميع طلبات صفحة المجموعة — عشان ٧٠٠ عضو يفتحوا في نفس اللحظة
 * ما يعملوش ٧٠٠ ضربة على القاعدة.
 *
 * المشكلة: `GET /api/groups/:code` بيعمل أربع استعلامات، وبيتنادى من كل
 * عضو أول ما يفتح الصفحة. درس مار مرقس فيه ٧٠٠ عضو، ولو الرابط اتبعت في
 * الجروب الساعة ٦ بالظبط، دول بيدخلوا كلهم في نفس الدقيقة. وحوض
 * الاتصالات ١٥ — فالباقي بيقف في طابور و`connectionTimeoutMillis`
 * بيرميه.
 *
 * الحل حاجتين مع بعض:
 *   ١) **تجميع الطلبات الجارية** — لو فيه تحميل شغّال لنفس المجموعة،
 *      الطلبات اللي جاية بتستنّى **نفس الوعد** بدل ما كل واحد يفتح
 *      استعلام لوحده. ٧٠٠ طلب في نفس اللحظة = استعلام واحد.
 *   ٢) **عمر قصير للنتيجة** (ثواني) — الموجة اللي بعدها بتترد من
 *      الذاكرة.
 *
 * ⚠️ ده مسموح **بس** لأن رد الراوت ده مالوش علاقة بمين بيطلبه: مفيش
 * كوكي ولا مفتاح عضو داخل في الحساب. أي راوت رده بيختلف من عضو للتاني
 * **ماينفعش** يتحط هنا.
 *
 * وأي كتابة على المجموعة بتلغي نسختها فوراً (`invalidate`) عشان العضو
 * ما يقراش بيانات قديمة بعد ما غيّر حاجة بنفسه.
 */

/* كان ٨ ثواني. بقى ٥ دقايق (٢٠٢٦-١٠-٢٥، توفير حصة Supabase: كل تحميل = صفوف
 * الـ٧٠٠ عضو) — وده آمن لأن كل كتابة على المجموعة بتلغي النسخة قبل الكتابة
 * وبعدها (group-routes.ts)، وتحميل كان شغّال وقت الإلغاء مابيتحفظش. */
const TTL_MS = 5 * 60_000;
const MAX_GROUPS = 200;

interface Entry<T> {
  expiresAt: number;
  value?: T;
  inFlight?: Promise<T>;
}

const entries = new Map<string, Entry<unknown>>();

function evict() {
  while (entries.size > MAX_GROUPS) {
    const oldest = entries.keys().next();
    if (oldest.done) return;
    entries.delete(oldest.value);
  }
}

/** بيرجّع نسخة محفوظة، أو بينضم لتحميل شغّال، أو بيبدأ واحد جديد. */
export function getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key) as Entry<T> | undefined;

  if (hit?.inFlight) return hit.inFlight;
  if (hit && hit.value !== undefined && hit.expiresAt > now) return Promise.resolve(hit.value);

  const entry: Entry<T> = { expiresAt: now + TTL_MS };
  const inFlight = load().then(
    (value) => {
      // اتلغى وقت التحميل (كتابة حصلت) ⇒ النتيجة دى ممكن تكون قديمة: ماتتحفظش.
      // وnull/undefined (مجموعة مش موجودة) مابيتحفظش — ممكن تتعمل بعد ثانية.
      if (entries.get(key) === entry) {
        if (value === null || value === undefined) entries.delete(key);
        else entries.set(key, { expiresAt: Date.now() + TTL_MS, value });
        evict();
      }
      return value;
    },
    (err) => {
      // الفشل مايتخزّنش — الطلب الجاي يحاول من أول وجديد
      if (entries.get(key) === entry) entries.delete(key);
      throw err;
    },
  );

  entry.inFlight = inFlight;
  entries.set(key, entry);
  evict();
  return inFlight;
}

/** إلغاء نسخة مجموعة بعد أي كتابة عليها. */
export function invalidate(key: string): void {
  entries.delete(key);
}

/** للفحص والاختبار. */
export function clearAll(): void {
  entries.clear();
}
export function size(): number {
  return entries.size;
}
