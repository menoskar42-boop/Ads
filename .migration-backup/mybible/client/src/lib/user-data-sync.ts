// طبقة مزامنة شفافة لبيانات المستخدم الشخصية.
// المبدأ: localStorage يبقى الكاش الفوري (سرعة/أوفلاين)، والسيرفر مصدر الحقيقة.
// كل كتابة: محلياً فوراً + عملية للسيرفر (fire-and-forget)، ولو فشلت تُخزَّن في طابور.
// عند بدء التطبيق: ترحيل لمرة واحدة (guard) ثم سحب من السيرفر لتحديث الكاش.
// لا يغيّر أي شيء في الواجهة، ويشتغل للمجهول (السيرفر ينشئ صف users تلقائياً).

import { getUserGroups } from './user-groups';

const LS = {
  saved: 'savedVerses',
  highlight: 'highlightedVerses',
  memorized: 'memorized-verses',
  favHymns: 'favorite-hymns',
  planProgress: 'reading-plan-progress',
  daily: 'my-daily-readings',
};
const QUEUE_KEY = 'sync-queue';
const MIGRATED_KEY = 'server-sync:v1';

function memberKey(): string | null {
  try {
    const g = getUserGroups().find(x => x.memberKey);
    if (g?.memberKey) return g.memberKey;
    const old = JSON.parse(localStorage.getItem('readingGroup') || 'null');
    return old?.memberKey || null;
  } catch { return null; }
}

function readLS<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function writeLS(key: string, val: any) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ── طابور العمليات الفاشلة (أوفلاين) ─────────────────────────────────────────
type Op = { url: string; method: 'POST' | 'DELETE'; body: any };
function readQueue(): Op[] { return readLS<Op[]>(QUEUE_KEY, []); }
function writeQueue(q: Op[]) { writeLS(QUEUE_KEY, q.slice(-1000)); }

async function send(op: Op): Promise<boolean> {
  try {
    const res = await fetch(op.url, {
      method: op.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...op.body, memberKey: memberKey() }),
      credentials: 'include',
    });
    return res.ok;
  } catch { return false; }
}

export async function flushQueue(): Promise<void> {
  const q = readQueue();
  if (!q.length) return;
  const remaining: Op[] = [];
  for (const op of q) { if (!(await send(op))) remaining.push(op); }
  writeQueue(remaining);
}

function enqueue(op: Op) {
  // جرّب فوراً؛ لو فشل خزّنه في الطابور
  send(op).then(ok => {
    if (!ok) { const q = readQueue(); q.push(op); writeQueue(q); }
  }).catch(() => { const q = readQueue(); q.push(op); writeQueue(q); });
}

// ── دوال الكتابة (تُستدعى بعد الكتابة المحلية مباشرة) ────────────────────────
export const dataSync = {
  savedVerse: (verseRef: string, verseText?: string) => enqueue({ url: '/api/user/saved-verses', method: 'POST', body: { verseRef, verseText, kind: 'saved' } }),
  removeSavedVerse: (verseRef: string) => enqueue({ url: '/api/user/saved-verses', method: 'DELETE', body: { verseRef, kind: 'saved' } }),
  highlight: (verseRef: string, verseText: string, color: string) => enqueue({ url: '/api/user/saved-verses', method: 'POST', body: { verseRef, verseText, kind: 'highlight', color } }),
  removeHighlight: (verseRef: string) => enqueue({ url: '/api/user/saved-verses', method: 'DELETE', body: { verseRef, kind: 'highlight' } }),
  memorized: (verseRef: string) => enqueue({ url: '/api/user/memorized-verses', method: 'POST', body: { verseRef } }),
  removeMemorized: (verseRef: string) => enqueue({ url: '/api/user/memorized-verses', method: 'DELETE', body: { verseRef } }),
  favoriteHymn: (hymnId: string, title?: string) => enqueue({ url: '/api/user/favorite-hymns', method: 'POST', body: { hymnId, title } }),
  removeFavoriteHymn: (hymnId: string) => enqueue({ url: '/api/user/favorite-hymns', method: 'DELETE', body: { hymnId } }),
  planProgress: (data: any) => enqueue({ url: '/api/user/plan-progress', method: 'POST', body: { data } }),
  dailyReadings: (data: any) => enqueue({ url: '/api/user/daily-readings', method: 'POST', body: { data } }),
};

// ── الترحيل لمرة واحدة: يرفع كل localStorage الحالي للسيرفر ───────────────────
async function migrateOnce(): Promise<void> {
  if (localStorage.getItem(MIGRATED_KEY) === '1') return;
  const snapshot = {
    memberKey: memberKey(),
    savedVerses: readLS(LS.saved, []),
    highlightedVerses: readLS(LS.highlight, []),
    memorizedVerses: readLS(LS.memorized, []),
    favoriteHymns: readLS(LS.favHymns, []),
    readingPlanProgress: readLS(LS.planProgress, []),
    dailyReadings: readLS(LS.daily, []),
  };
  try {
    const res = await fetch('/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
      credentials: 'include',
    });
    if (res.ok) localStorage.setItem(MIGRATED_KEY, '1');
  } catch { /* هنعيد المحاولة في الفتح التالي */ }
}

// ── السحب من السيرفر → تحديث الكاش المحلي (السيرفر مصدر الحقيقة) ──────────────
async function getJson(url: string): Promise<any> {
  try {
    const mk = memberKey();
    const full = mk ? `${url}${url.includes('?') ? '&' : '?'}memberKey=${encodeURIComponent(mk)}` : url;
    const res = await fetch(full, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function pullAll(): Promise<void> {
  const [saved, memorized, hymns, planProgress, daily] = await Promise.all([
    getJson('/api/user/saved-verses'),
    getJson('/api/user/memorized-verses'),
    getJson('/api/user/favorite-hymns'),
    getJson('/api/user/plan-progress'),
    getJson('/api/user/daily-readings'),
  ]);

  if (Array.isArray(saved)) {
    const savedList = saved.filter((r: any) => r.kind === 'saved')
      .map((r: any) => ({ text: r.verseText || '', reference: r.verseRef, date: (r.createdAt || '').split('T')[0] || '' }));
    const highlightList = saved.filter((r: any) => r.kind === 'highlight')
      .map((r: any) => ({ text: r.verseText || '', reference: r.verseRef, color: r.color || 'yellow', date: (r.createdAt || '').split('T')[0] || '' }));
    // ادمج بدل الاستبدال الكامل حفاظاً على أي عنصر محلي لم يُرفَع بعد
    mergeByRef(LS.saved, savedList);
    mergeByRef(LS.highlight, highlightList);
  }
  if (Array.isArray(memorized)) {
    mergeStrings(LS.memorized, memorized.map((r: any) => r.verseRef));
  }
  if (Array.isArray(hymns)) {
    mergeStrings(LS.favHymns, hymns.map((r: any) => r.hymnId));
  }
  if (Array.isArray(planProgress)) writeLS(LS.planProgress, planProgress);
  if (Array.isArray(daily)) writeLS(LS.daily, daily);
}

function mergeByRef(key: string, serverList: any[]) {
  const local = readLS<any[]>(key, []);
  const map = new Map<string, any>();
  for (const it of local) if (it?.reference) map.set(it.reference, it);
  for (const it of serverList) if (it?.reference) map.set(it.reference, { ...map.get(it.reference), ...it });
  writeLS(key, Array.from(map.values()));
}
function mergeStrings(key: string, serverArr: string[]) {
  const local = readLS<string[]>(key, []);
  const set = new Set<string>([...local, ...serverArr.filter(Boolean)]);
  writeLS(key, Array.from(set));
}

// ── نقطة البدء — تُستدعى مرة عند تحميل التطبيق (لا تعطّل العرض) ───────────────
let started = false;
export function initUserDataSync(): void {
  if (started) return;
  started = true;
  const run = async () => {
    await flushQueue();      // ارفع أي تعديلات أوفلاين معلّقة أولاً
    await migrateOnce();     // ترحيل الموجود لمرة واحدة
    await pullAll();         // ثم اسحب من السيرفر لتحديث الكاش
  };
  // في الخلفية تماماً — لا await على مسار العرض
  run().catch(() => {});
  window.addEventListener('online', () => { flushQueue().catch(() => {}); });
}
