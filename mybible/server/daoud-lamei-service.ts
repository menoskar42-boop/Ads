import { getPlaylistId } from "./daoud-lamei-playlists";

const CHANNEL_ID = "UCq43CuXeeYpHdEq56Lod0JA";
const CHANNEL_RSS = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const PLAYLIST_RSS = (id: string) =>
  `https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`;

export interface RssVideo {
  videoId: string;
  title: string;
}

interface CacheEntry {
  videos: RssVideo[];
  fetchedAt: number;
}

// key: "channel" | bookName (e.g. "يشوع")
const cache = new Map<string, CacheEntry>();
const SERVER_TTL = 6 * 60 * 60 * 1000; // 6 hours

function parseRssXml(xml: string): RssVideo[] {
  const videos: RssVideo[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const videoIdRegex = /<yt:videoId>([\s\S]*?)<\/yt:videoId>/;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const videoIdMatch = entry.match(videoIdRegex);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);

    if (videoIdMatch && titleMatch) {
      const rawTitle = titleMatch[1]
        .replace(/<!\[CDATA\[/g, "")
        .replace(/\]\]>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();

      if (rawTitle) {
        videos.push({ videoId: videoIdMatch[1].trim(), title: rawTitle });
      }
    }
  }
  return videos;
}

async function fetchRss(url: string): Promise<RssVideo[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BibleApp/1.0)" },
  });
  if (!res.ok) throw new Error(`RSS ${res.status} for ${url}`);
  return parseRssXml(await res.text());
}

/**
 * Fetch RSS videos for a given book.
 * - If the book has a known playlist → fetch that playlist's RSS.
 * - Always also fetch the channel RSS (latest 15) and merge.
 * - Deduplicates by videoId.
 */
export async function fetchDaoudLameiRss(
  bookName?: string,
  force = false
): Promise<RssVideo[]> {
  const cacheKey = bookName || "channel";
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.fetchedAt < SERVER_TTL) {
    return cached.videos;
  }

  const sources: Promise<RssVideo[]>[] = [
    fetchRss(CHANNEL_RSS).catch((e) => {
      console.error("[DaoudLamei] Channel RSS error:", e.message);
      return [];
    }),
  ];

  if (bookName) {
    const playlistId = getPlaylistId(bookName);
    if (playlistId) {
      console.log(`[DaoudLamei] Fetching playlist RSS for ${bookName}: ${playlistId}`);
      sources.push(
        fetchRss(PLAYLIST_RSS(playlistId)).catch((e) => {
          console.error("[DaoudLamei] Playlist RSS error:", e.message);
          return [];
        })
      );
    }
  }

  const results = await Promise.all(sources);
  const merged = results.flat();

  // Deduplicate by videoId
  const seen = new Set<string>();
  const deduped = merged.filter((v) => {
    if (seen.has(v.videoId)) return false;
    seen.add(v.videoId);
    return true;
  });

  console.log(
    `[DaoudLamei] Fetched ${deduped.length} videos for key="${cacheKey}"`
  );
  cache.set(cacheKey, { videos: deduped, fetchedAt: Date.now() });
  return deduped;
}

export function clearDaoudLameiCache(bookName?: string): void {
  if (bookName) {
    cache.delete(bookName);
    cache.delete("channel");
  } else {
    cache.clear();
  }
}
