/**
 * تسجيل قراءة درس الكتاب — ولو السيرفر مش متاح تتحفظ على الموبايل وتتبعت بعدين.
 *
 * ٢٠٢٦-١٠-٠٧: Supabase وقف القاعدة لحد ٢٤ أكتوبر. قبل كده الطابور ده كان بيمسك بس
 * لما النت نفسه يقطع (fetch يرمى)؛ لو السيرفر رد بخطأ (٥٠٠) القراءة كانت **بتضيع**.
 * دلوقتى: أى رد ٥xx / ٤٠٨ / ٤٢٩ أو نت قاطع ⇒ تتحفظ **بوقتها الحقيقى** (readAt)، والسيرفر
 * بيسجّلها بيوم قراءتها لما توصل (server/read-date.ts) — فأيام المواظبة ماتضيعش.
 * بتتمسح من الموبايل **بس** لما السيرفر يقبلها.
 */
export const QUEUE_KEY = 'offline_reading_queue';

type QueueItem = { url: string; body: Record<string, unknown> };
export interface PostResult { ok: boolean; queued: boolean; data: any }

const retryable = (status: number) => status >= 500 || status === 408 || status === 429;

function readQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q: QueueItem[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
function enqueue(item: QueueItem) {
  const q = readQueue();
  // نفس القراءة مرتين فى الطابور (نفس الرابط والإصحاح واليوم) = واحدة
  const day = String(item.body.readAt || '').slice(0, 10);
  const dup = q.some((x) => x.url === item.url && x.body.chapter === item.body.chapter &&
    (x.body.book ?? x.body.bookName) === (item.body.book ?? item.body.bookName) &&
    x.body.userName === item.body.userName && String(x.body.readAt || '').slice(0, 10) === day);
  if (!dup) { q.push(item); writeQueue(q); }
}

export const pendingReadings = (): number => readQueue().length;

export async function postReading(url: string, body: Record<string, unknown>): Promise<PostResult> {
  const payload = { ...body, readAt: body.readAt || new Date().toISOString() };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, queued: false, data };
    if (retryable(res.status)) { enqueue({ url, body: payload }); return { ok: false, queued: true, data: {} }; }
    return { ok: false, queued: false, data };
  } catch {
    enqueue({ url, body: payload });
    return { ok: false, queued: true, data: {} };
  }
}

let flushing = false;
/** يبعت المحفوظ بالترتيب. المقبول بيتمسح، والمرفوض نهائياً (٤xx) بيتمسح، والباقى يستنى. */
export async function flushReadingQueue(): Promise<{ sent: number; left: number }> {
  if (flushing) return { sent: 0, left: pendingReadings() };
  flushing = true;
  try {
    const queue = readQueue();
    if (!queue.length) return { sent: 0, left: 0 };
    const keep: QueueItem[] = [];
    let sent = 0;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const res = await fetch(item.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
        if (res.ok) sent++;
        else if (retryable(res.status)) {
          // السيرفر لسه مش متاح ⇒ خلّى الباقى كله زى ما هو ومتكمّلش ضرب
          keep.push(...queue.slice(i));
          break;
        }
      } catch { keep.push(...queue.slice(i)); break; }
    }
    // قراءات اتضافت وإحنا بنبعت
    const added = readQueue().slice(queue.length);
    writeQueue([...keep, ...added]);
    return { sent, left: keep.length + added.length };
  } finally { flushing = false; }
}
