// وقت الإقلاع: القاعدة مش رادّة (سيرفر Oracle مخنوق أو الشبكة اتقطعت شوية) ⇒ نستنى ونحاول تانى بدل
// ما العملية تقع. المستضيف (src/lib/cohost_child.js) بيعيد تشغيل الانهيار ٥ مرات بس، فانقطاع ٣ دقايق
// كان بيوقف الموقع لحد نشر جديد. لو القاعدة مارجعتش خلال `maxMs` بنرمى آخر خطأ (BOOT FAILED زى الأول).
export async function waitForDatabase(
  ping: () => Promise<unknown>,
  { maxMs = 10 * 60_000, everyMs = 10_000, log = console.error, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<number> {
  const start = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      await ping();
      if (attempt > 1) log(`[boot] القاعدة ردّت بعد ${attempt} محاولة — بنكمّل الإقلاع`);
      return attempt;
    } catch (e: any) {
      if (Date.now() - start + everyMs > maxMs) throw e;
      log(`[boot] القاعدة مش رادّة (محاولة ${attempt}): ${e?.message || e} — هنحاول تانى بعد ${Math.round(everyMs / 1000)} ثانية`);
      await sleep(everyMs);
    }
  }
}
