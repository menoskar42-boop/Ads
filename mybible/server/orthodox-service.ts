/**
 * Orthodox Service — fetches today's Synaxarium from copticchurch.net
 * Uses server-side cache (6 hours) to avoid hammering the external site.
 */

interface SynaxariumEntry {
  title: string;
  url: string;
  anchor: string;
}

interface TodaySynaxarium {
  copticDate: string;
  entries: SynaxariumEntry[];
  fetchedAt: number;
}

let synaxariumCache: TodaySynaxarium | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;

function parseSynaxarium(html: string): TodaySynaxarium {
  const result: TodaySynaxarium = {
    copticDate: '',
    entries: [],
    fetchedAt: Date.now(),
  };

  // Extract the Arabic Coptic date
  const dateMatch = html.match(/سنكسار اليوم[^<]*-\s*([^<\n]+?)(?:<|\n|$)/i);
  if (dateMatch) {
    result.copticDate = dateMatch[1].trim().replace(/\\-/g, '-');
  }

  // Find the Arabic synaxarium section
  const arSectionMatch = html.match(/سنكسار اليوم([\s\S]*?)(?=<h[2-4]|<\/div|Popular Saints)/i);
  if (!arSectionMatch) return result;

  const section = arSectionMatch[1];

  // Extract links from Arabic section
  const linkRegex = /href="(https:\/\/www\.copticchurch\.net\/synaxarium\/[^"]*lang=ar[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(section)) !== null) {
    const url = match[1];
    const title = match[2].trim();
    const anchorMatch = url.match(/#(\d+)$/);
    const anchor = anchorMatch ? anchorMatch[1] : '';
    if (title && url) {
      result.entries.push({ title, url, anchor });
    }
  }

  if (!result.entries.length) {
    console.warn('[orthodox] Synaxarium parsing returned 0 entries — HTML structure may have changed');
  }

  return result;
}

export async function fetchTodaySynaxarium(): Promise<TodaySynaxarium> {
  if (synaxariumCache && Date.now() - synaxariumCache.fetchedAt < CACHE_TTL) {
    return synaxariumCache;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://www.copticchurch.net/synaxarium', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BibleApp/1.0)',
        'Accept-Language': 'ar,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const data = parseSynaxarium(html);
    synaxariumCache = data;
    return data;
  } catch (err) {
    console.error('[orthodox] Synaxarium fetch error:', err);
    return {
      copticDate: '',
      entries: [],
      fetchedAt: Date.now(),
    };
  }
}

export function clearSynaxariumCache() {
  synaxariumCache = null;
}
