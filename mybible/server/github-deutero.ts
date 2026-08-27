import MDBReader from 'mdb-reader';

const OWNER = 'aymhenry';
const REPOSITORY = 'Bible-for-Windows';
const BRANCH = 'main';
const BIBLE_FILE = 'DataFiles/BibleMan02.bib';
const MANIFEST_FILE = 'code/modBasicData.au3';
const REPOSITORY_URL = `https://github.com/${OWNER}/${REPOSITORY}`;
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}/${BRANCH}`;
const STATUS_TTL_MS = 60_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const TARGET_BOOKS = [
  { id: 67, name: 'طوبيا', order: 67, aliases: ['طوبيا'] },
  { id: 68, name: 'يهوديت', order: 68, aliases: ['يهوديت'] },
  { id: 69, name: 'الحكمة', order: 69, aliases: ['الحكمة'] },
  { id: 70, name: 'يشوع بن سيراخ', order: 70, aliases: ['يشوع بن سيراخ', 'سيراخ'] },
  { id: 71, name: 'باروخ', order: 71, aliases: ['باروخ', 'باروك'] },
  { id: 72, name: 'المكابيين الأول', order: 72, aliases: ['المكابيين الأول'] },
  { id: 73, name: 'المكابيين الثاني', order: 73, aliases: ['المكابيين الثاني'] },
] as const;

export type DeuteroSourceBook = {
  id: number;
  name: string;
  bookOrder: number;
  chaptersCount: number;
};

export type DeuteroSourceVerse = {
  verse: number;
  text: string;
};

export type DeuteroSourceStatus = {
  available: boolean;
  reason?: 'private-or-not-found' | 'file-missing' | 'source-unavailable' | 'books-not-found' | 'invalid-source';
  repositoryUrl: string;
  sourceUrl: string;
  manifestUrl: string;
  branch: string;
  checkedAt: string;
};

export type DeuteroSourceCatalog = {
  status: DeuteroSourceStatus;
  books: DeuteroSourceBook[];
};

type GitHubFileMetadata = {
  sha: string;
  size: number;
  download_url?: string;
};

type RemoteMetadata = {
  bible: GitHubFileMetadata;
  manifest: GitHubFileMetadata;
  checkedAt: number;
};

type ParsedSource = {
  cacheKey: string;
  books: DeuteroSourceBook[];
  verses: Map<number, Map<number, DeuteroSourceVerse[]>>;
};

let metadataCache: RemoteMetadata | null = null;
let parsedCache: ParsedSource | null = null;

function sourceStatus(overrides: Partial<DeuteroSourceStatus> = {}): DeuteroSourceStatus {
  return {
    available: false,
    repositoryUrl: REPOSITORY_URL,
    sourceUrl: `${RAW_BASE}/${BIBLE_FILE}`,
    manifestUrl: `${RAW_BASE}/${MANIFEST_FILE}`,
    branch: BRANCH,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function normalizeBookName(name: string): string {
  return name
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTargetBook(name: string): (typeof TARGET_BOOKS)[number] | undefined {
  const normalized = normalizeBookName(name);
  return TARGET_BOOKS.find((book) => book.aliases.some((alias) => normalizeBookName(alias) === normalized));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MyBible-live-source',
        ...init.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getFileMetadata(pathname: string): Promise<GitHubFileMetadata | null> {
  const response = await fetchWithTimeout(`${API_BASE}/contents/${pathname}?ref=${encodeURIComponent(BRANCH)}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub metadata request failed: ${response.status}`);
  }

  const data = await response.json() as GitHubFileMetadata;
  if (!data.sha || typeof data.size !== 'number') {
    throw new Error('GitHub returned invalid file metadata');
  }
  if (data.size > MAX_FILE_BYTES) {
    throw new Error('GitHub source file is too large');
  }
  return data;
}

async function getRemoteMetadata(): Promise<RemoteMetadata | null> {
  if (metadataCache && Date.now() - metadataCache.checkedAt < STATUS_TTL_MS) {
    return metadataCache;
  }

  let bible: GitHubFileMetadata | null;
  let manifest: GitHubFileMetadata | null;
  try {
    [bible, manifest] = await Promise.all([
      getFileMetadata(BIBLE_FILE),
      getFileMetadata(MANIFEST_FILE),
    ]);
  } catch (error) {
    metadataCache = null;
    parsedCache = null;
    console.error('[deutero-source] metadata error:', error);
    return null;
  }

  if (!bible || !manifest) {
    metadataCache = null;
    parsedCache = null;
    return null;
  }

  metadataCache = { bible, manifest, checkedAt: Date.now() };
  return metadataCache;
}

async function downloadFile(pathname: string): Promise<Buffer> {
  // Never follow a URL supplied by the repository API. Both paths are fixed
  // allowlisted files, which keeps this integration from becoming an SSRF proxy.
  const url = `${RAW_BASE}/${pathname}`;
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/octet-stream' } });
  if (!response.ok) throw new Error(`GitHub source download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw new Error('GitHub source file is too large');
  return bytes;
}

function parseManifest(manifestText: string): Map<number, string> {
  const names = new Map<number, string>();
  const pattern = /\$avArray\[(\d{1,3})\]\s*=\s*"([^"]*)"/g;
  for (const match of manifestText.matchAll(pattern)) {
    const id = Number(match[1]);
    const name = match[2].trim();
    if (id > 0 && name) names.set(id, name);
  }
  return names;
}

function parseBibleDatabase(buffer: Buffer, manifestText: string): ParsedSource {
  const namesById = parseManifest(manifestText);
  const sourceIds = new Map<number, (typeof TARGET_BOOKS)[number]>();
  for (const [id, name] of namesById) {
    const target = isTargetBook(name);
    if (target) sourceIds.set(id, target);
  }

  if (sourceIds.size === 0) {
    throw new Error('Deuterocanonical books were not found in the public source');
  }

  const reader = new MDBReader(buffer);
  const table = reader.getTable('tblBible');
  const rows = table.getData<{
    bibBibleCode: number;
    bibChptrNo: number;
    bibSectionNo: number;
    bibSectionSubNo: number;
    bibText: string | null;
  }>({
    columns: ['bibBibleCode', 'bibChptrNo', 'bibSectionNo', 'bibSectionSubNo', 'bibText'],
  });

  const verses = new Map<number, Map<number, DeuteroSourceVerse[]>>();
  for (const row of rows) {
    const target = sourceIds.get(Number(row.bibBibleCode));
    const chapter = Number(row.bibChptrNo);
    const verse = Number(row.bibSectionNo);
    const text = String(row.bibText || '').replace(/\s+/g, ' ').trim();
    if (!target || !chapter || !verse || !text) continue;

    const chapters = verses.get(target.id) || new Map<number, DeuteroSourceVerse[]>();
    const chapterVerses = chapters.get(chapter) || [];
    const existing = chapterVerses.find((item) => item.verse === verse);
    if (existing) {
      existing.text = `${existing.text} ${text}`.trim();
    } else {
      chapterVerses.push({ verse, text });
    }
    chapters.set(chapter, chapterVerses);
    verses.set(target.id, chapters);
  }

  const books = TARGET_BOOKS
    .filter((book) => verses.has(book.id))
    .map((book) => ({
      id: book.id,
      name: book.name,
      bookOrder: book.order,
      chaptersCount: verses.get(book.id)?.size || 0,
    }))
    .filter((book) => book.chaptersCount > 0);

  if (books.length === 0) {
    throw new Error('Deuterocanonical books have no readable verses in the public source');
  }

  return {
    cacheKey: '',
    books,
    verses,
  };
}

async function loadParsedSource(metadata: RemoteMetadata): Promise<ParsedSource> {
  const cacheKey = `${metadata.bible.sha}:${metadata.manifest.sha}`;
  if (parsedCache?.cacheKey === cacheKey) return parsedCache;

  try {
    const [bibleBuffer, manifestBuffer] = await Promise.all([
      downloadFile(BIBLE_FILE),
      downloadFile(MANIFEST_FILE),
    ]);
    const parsed = parseBibleDatabase(bibleBuffer, manifestBuffer.toString('utf8'));
    parsed.cacheKey = cacheKey;
    parsedCache = parsed;
    return parsed;
  } catch (error) {
    parsedCache = null;
    console.error('[deutero-source] parse error:', error);
    throw error;
  }
}

export async function getDeuteroSourceCatalog(): Promise<DeuteroSourceCatalog> {
  const metadata = await getRemoteMetadata();
  if (!metadata) {
    return { status: sourceStatus({ reason: 'private-or-not-found' }), books: [] };
  }

  try {
    const parsed = await loadParsedSource(metadata);
    return {
      status: sourceStatus({ available: true }),
      books: parsed.books,
    };
  } catch {
    return {
      status: sourceStatus({ reason: 'books-not-found' }),
      books: [],
    };
  }
}

export async function getDeuteroSourceChapter(
  bookId: number,
  chapter: number,
): Promise<{ catalog: DeuteroSourceCatalog; verses: DeuteroSourceVerse[] }> {
  const metadata = await getRemoteMetadata();
  if (!metadata) {
    return {
      catalog: { status: sourceStatus({ reason: 'private-or-not-found' }), books: [] },
      verses: [],
    };
  }

  try {
    const parsed = await loadParsedSource(metadata);
    const book = parsed.books.find((item) => item.id === bookId);
    if (!book) {
      return {
        catalog: { status: sourceStatus({ reason: 'books-not-found' }), books: [] },
        verses: [],
      };
    }
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chaptersCount) {
      return {
        catalog: { status: sourceStatus({ available: true }), books: parsed.books },
        verses: [],
      };
    }
    const verses = [...(parsed.verses.get(bookId)?.get(chapter) || [])]
      .sort((a, b) => a.verse - b.verse);
    return {
      catalog: { status: sourceStatus({ available: true }), books: parsed.books },
      verses,
    };
  } catch {
    return {
      catalog: { status: sourceStatus({ reason: 'books-not-found' }), books: [] },
      verses: [],
    };
  }
}