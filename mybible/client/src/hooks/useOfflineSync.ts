import { useState, useCallback, useRef, useEffect } from 'react';
import { getCSVFileName } from '@/lib/tafsir-csv-service';
import { dailyReadings, feasts, type ReadingRef, type DayLectionary } from '@/lib/coptic-lectionary';

export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';
export type UpdateAvailability = 'unknown' | 'checking' | 'up-to-date' | 'update-available';

export interface SyncProgress {
  done: number;
  total: number;
  currentBook: string;
}

const CACHE_NAME = 'mybible-static-v1';
const CONCURRENCY = 6;
const STORED_VERSION_KEY  = 'offline_app_version';
const STORED_SYNC_DATE_KEY = 'offline_last_sync';

async function runBatch<T>(items: T[], fn: (item: T) => Promise<void>, signal: AbortSignal) {
  let i = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      if (signal.aborted) return;
      const item = items[i++];
      if (item !== undefined) await fn(item).catch(() => {});
    }
  });
  await Promise.all(workers);
}

function buildReadingTextUrl(ref: ReadingRef): string {
  const params = new URLSearchParams({
    bookName: ref.book,
    fromCh: String(ref.fromCh),
    fromVs: String(ref.fromVs),
    toCh:   String(ref.toCh),
    toVs:   String(ref.toVs),
  });
  return `/api/reading-text?${params}`;
}

function allLectionaryRefs(): ReadingRef[] {
  const refs: ReadingRef[] = [];
  const seen = new Set<string>();
  const add = (day: DayLectionary) => {
    for (const ref of [day.pauline, day.catholic, day.praxis, day.psalm, day.gospel]) {
      const key = buildReadingTextUrl(ref);
      if (!seen.has(key)) { seen.add(key); refs.push(ref); }
    }
  };
  for (const day of Object.values(dailyReadings)) add(day);
  for (const day of Object.values(feasts)) add(day);
  return refs;
}

async function fetchCurrentVersion(): Promise<number | null> {
  try {
    const res = await fetch('/api/app-version', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.version === 'number' ? data.version : null;
  } catch {
    return null;
  }
}

async function runLectionarySync(cache: Cache, signal: AbortSignal, onProgress: (done: number, total: number, book: string) => void) {
  // Clear old reading-text entries before re-downloading
  const keys = await cache.keys();
  for (const req of keys) {
    if (new URL(req.url).pathname.startsWith('/api/reading-text')) {
      await cache.delete(req);
    }
  }

  const refs = allLectionaryRefs();
  let done = 0;
  onProgress(0, refs.length, 'قراءات الخولاجي والقسم الأرثوذكسي');
  await runBatch(refs, async (ref) => {
    if (signal.aborted) return;
    const url = buildReadingTextUrl(ref);
    try { const r = await fetch(url, { signal }); if (r.ok) await cache.put(url, r); } catch {}
    done++;
    onProgress(done, refs.length, `قراءات الكتامارس (${ref.book})`);
  }, signal);
}

export function useOfflineSync() {
  const [status, setStatus]     = useState<SyncStatus>('idle');
  const [progress, setProgress] = useState<SyncProgress>({ done: 0, total: 0, currentBook: '' });
  const [updateAvail, setUpdateAvail] = useState<UpdateAvailability>('unknown');
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(() => {
    const s = localStorage.getItem(STORED_SYNC_DATE_KEY);
    return s ? new Date(Number(s)) : null;
  });
  const abortRef = useRef<AbortController | null>(null);

  // Check for updates when hook mounts (if we have a previous sync)
  useEffect(() => {
    if (!lastSyncDate) return;
    setUpdateAvail('checking');
    fetchCurrentVersion().then(serverVersion => {
      if (serverVersion === null) { setUpdateAvail('unknown'); return; }
      const storedVersion = Number(localStorage.getItem(STORED_VERSION_KEY) || '0');
      setUpdateAvail(serverVersion > storedVersion ? 'update-available' : 'up-to-date');
    });
  }, []);

  // ── Full offline download ─────────────────────────────────────────────────
  const startSync = useCallback(async () => {
    if (!('caches' in window)) { setStatus('error'); return; }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setStatus('syncing');
    setProgress({ done: 0, total: 0, currentBook: '' });

    try {
      const cache = await caches.open(CACHE_NAME);

      // Books list
      const booksRes = await fetch('/api/books', { signal });
      if (!booksRes.ok) throw new Error();
      await cache.put('/api/books', booksRes.clone());
      const books: { id: number; name: string; chaptersCount: number }[] = await booksRes.json();

      // Semi-static endpoints
      for (const url of ['/api/daily-readings', '/api/metrics/trending', '/api/reading-plans', '/api/emotions']) {
        if (signal.aborted) return;
        try { const r = await fetch(url, { signal }); if (r.ok) await cache.put(url, r); } catch {}
      }

      // Lectionary reading texts (Kholagy + Orthodox)
      await runLectionarySync(cache, signal, (done, total, book) =>
        setProgress({ done, total, currentBook: book })
      );
      if (signal.aborted) return;

      // All Bible chapters: verses + tafsir
      type WorkItem = { bookId: number; bookName: string; chapter: number; csvName: string | null };
      const workItems: WorkItem[] = [];
      for (const book of books) {
        const csvName = getCSVFileName(book.name);
        for (let ch = 1; ch <= book.chaptersCount; ch++) {
          workItems.push({ bookId: book.id, bookName: book.name, chapter: ch, csvName });
        }
      }
      const total = workItems.length * 2;
      let done = 0;
      setProgress({ done: 0, total, currentBook: '' });

      await runBatch(workItems, async (item) => {
        if (signal.aborted) return;
        const versesUrl = `/api/verses/book/${item.bookId}?chapter=${item.chapter}`;
        if (!(await cache.match(versesUrl))) {
          try { const r = await fetch(versesUrl, { signal }); if (r.ok) await cache.put(versesUrl, r); } catch {}
        }
        done++;
        setProgress({ done, total, currentBook: item.bookName });

        if (item.csvName) {
          const tafsirUrl = `/api/tafsir/chapter/${encodeURIComponent(item.csvName)}/${item.chapter}`;
          if (!(await cache.match(tafsirUrl))) {
            try { const r = await fetch(tafsirUrl, { signal }); if (r.ok) await cache.put(tafsirUrl, r); } catch {}
          }
        }
        done++;
        setProgress({ done, total, currentBook: item.bookName });
      }, signal);

      if (!signal.aborted) {
        const serverVersion = await fetchCurrentVersion();
        if (serverVersion) localStorage.setItem(STORED_VERSION_KEY, String(serverVersion));
        const now = Date.now();
        localStorage.setItem(STORED_SYNC_DATE_KEY, String(now));
        setLastSyncDate(new Date(now));
        setUpdateAvail('up-to-date');
        setStatus('done');
      }
    } catch {
      if (!abortRef.current?.signal.aborted) setStatus('error');
    }
  }, []);

  // ── Smart update: only re-sync changed content ────────────────────────────
  const startUpdate = useCallback(async () => {
    if (!('caches' in window)) { setStatus('error'); return; }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setStatus('syncing');
    setProgress({ done: 0, total: 0, currentBook: 'جاري التحديث...' });

    try {
      const cache = await caches.open(CACHE_NAME);

      // 1. Re-download semi-static endpoints
      for (const url of ['/api/daily-readings', '/api/metrics/trending', '/api/reading-plans', '/api/emotions']) {
        if (signal.aborted) return;
        try {
          const r = await fetch(url, { signal, cache: 'no-store' });
          if (r.ok) await cache.put(url, r);
        } catch {}
      }

      // 2. Clear + re-download all reading-text (lectionary may have changed)
      await runLectionarySync(cache, signal, (done, total, book) =>
        setProgress({ done, total, currentBook: book })
      );
      if (signal.aborted) return;

      // 3. Force SW to pick up new JS/CSS bundle
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }

      const serverVersion = await fetchCurrentVersion();
      if (serverVersion) localStorage.setItem(STORED_VERSION_KEY, String(serverVersion));
      const now = Date.now();
      localStorage.setItem(STORED_SYNC_DATE_KEY, String(now));
      setLastSyncDate(new Date(now));
      setUpdateAvail('up-to-date');
      setStatus('done');
    } catch {
      if (!abortRef.current?.signal.aborted) setStatus('error');
    }
  }, []);

  const cancelSync = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setProgress({ done: 0, total: 0, currentBook: '' });
  }, []);

  return { status, progress, startSync, startUpdate, cancelSync, updateAvail, lastSyncDate };
}
