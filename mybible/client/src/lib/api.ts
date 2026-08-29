const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  console.log(`[API] ${options?.method || 'GET'} ${url}`);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      credentials: 'include',
    });

    console.log(`[API] Response status: ${response.status}`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      console.error(`[API] Error response:`, error);
      throw new Error(error.message || 'Request failed');
    }

    const data = await response.json();
    console.log(`[API] Response data:`, data);
    return data;
  } catch (error) {
    console.error(`[API] Fetch error:`, error);
    throw error;
  }
}

export interface User {
  id: string;
  isPremium: boolean;
  aiUsageRemaining: number;
  subscriptionExpiry?: string;
}

export interface BibleBook {
  id: number;
  name: string;
  testament: 'old' | 'new';
  bookOrder: number;
  chaptersCount: number;
}

export interface BibleVerse {
  id: number;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
  book?: BibleBook;
}

export interface DailyVerse {
  id: number;
  verseId: number;
  date: string;
  verse: BibleVerse;
  book: BibleBook;
}

export interface ReadingPlan {
  id: number;
  name: string;
  duration: string;
  daysTotal: number;
  description: string;
  planData: any;
}

export interface UserReadingProgress {
  id: number;
  userId: string;
  planId: number;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  lastReadAt?: string;
}

export interface HighlightedVerse {
  id: number;
  userId: string;
  verseId: number;
  color: string;
  note?: string;
  createdAt: string;
  verse: BibleVerse;
  book: BibleBook;
}

export interface Emotion {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export interface Topic {
  id: number;
  name: string;
  icon: string;
}

export interface SynaxariumEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  anchor: string;
}

export interface SynaxariumDay {
  copticDate: string;
  entries: SynaxariumEntry[];
  fetchedAt: number;
  source: 'copticchurch.net';
  sourceUrl: string;
  month?: number;
  day?: number;
}

export interface EmotionTopicVerse {
  id: number;
  bookId: number;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface ChildStory {
  id: number;
  title: string;
  summary: string;
  ageGroup: string;
  imageEmoji?: string;
  content: string;
  orderIndex: number;
}

export interface AiResponse {
  success: boolean;
  response?: string;
  error?: string;
  modelUsed?: 'local' | 'free' | 'paid';
  remainingRequests?: number;
}

export interface DeuteroSourceBook {
  id: number;
  name: string;
  bookOrder: number;
  chaptersCount: number;
}

export interface DeuteroSourceVerse {
  verse: number;
  text: string;
}

export interface DeuteroSourceStatus {
  available: boolean;
  sourceName: string;
  sourceUrl: string;
  reason?: string;
  checkedAt: string;
}

export interface DeuteroSourceCatalog {
  status: DeuteroSourceStatus;
  books: DeuteroSourceBook[];
}

export interface DeuteroSourceChapter {
  book: DeuteroSourceBook;
  chapter: number;
  source: string;
  sourceUrl: string;
  verses: DeuteroSourceVerse[];
}

export type StTaklaSectionKey = 'ritual' | 'bible' | 'calendar';

export interface StTaklaBrowseLink {
  id: string;
  label: string;
  url: string;
}

export interface StTaklaSectionCatalog {
  key: StTaklaSectionKey;
  title: string;
  description: string;
  sourceUrl: string;
  browse: StTaklaBrowseLink[];
  status: 'ok' | 'unavailable';
  error?: string;
}

export interface StTaklaSectionItem {
  id: string;
  title: string;
  url: string;
}

export interface StTaklaPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface StTaklaSectionArticle {
  section: StTaklaSectionKey;
  title: string;
  content: string;
  source: 'St-Takla.org';
  sourceUrl: string;
}

export interface StTaklaSectionBrowseResponse {
  section: StTaklaSectionKey;
  source: 'St-Takla.org';
  sourceUrl: string;
  items: StTaklaSectionItem[];
  pagination?: StTaklaPagination;
  article?: StTaklaSectionArticle;
}

export const api = {
  user: {
    get: () => fetchApi<User>('/user'),
    upgradeToPremium: () => fetchApi<{ success: boolean; isPremium: boolean; subscriptionExpiry: string }>('/user/premium', { method: 'POST' }),
  },

  books: {
    getAll: () => fetchApi<BibleBook[]>('/books'),
    getByTestament: (testament: 'old' | 'new') => fetchApi<BibleBook[]>(`/books/${testament}`),
    getChapters: (bookId: number) => fetchApi<number[]>(`/books/${bookId}/chapters`),
  },

  verses: {
    getByBook: (bookId: number, chapter?: number) =>
      fetchApi<BibleVerse[]>(`/verses/book/${bookId}${chapter ? `?chapter=${chapter}` : ''}`),
    search: (query: string, limit = 50) =>
      fetchApi<BibleVerse[]>(`/verses/search?q=${encodeURIComponent(query)}&limit=${limit}`),
    aiEnhancedSearch: (query: string) =>
      fetchApi<{
        exactResults: Array<BibleVerse & { bookName?: string; relevanceScore?: number; matchType?: string }>;
        semanticResults: Array<BibleVerse & { bookName?: string; relevanceScore?: number; matchType?: string }>;
        results: Array<BibleVerse & { bookName?: string; relevanceScore?: number; matchType?: string }>;
        enhanced: boolean;
      }>(
        '/search/ai-enhanced',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }
      ),
  },

  orthodox: {
    getSynaxarium: () =>
      fetchApi<SynaxariumDay>('/orthodox/synaxarium', { cache: 'no-store' }),
    getSynaxariumDay: (month: number, day: number) =>
      fetchApi<SynaxariumDay>(`/orthodox/synaxarium?month=${month}&day=${day}`),
    getKatamerosDay: (date: string) =>
      fetchApi<{
        status: string;
        source: string;
        date: string;
        sourcePageUrl: string;
        sourceIndexUrl: string;
        title: string;
        readings: Array<{
          id: string;
          section: string;
          label: string;
          reference: string;
          sourceUrl: string;
          verses: Array<{ chapter: number; verse: number; text: string }>;
          status: 'ok' | 'unavailable';
          error?: string;
        }>;
      }>(`/orthodox/katameros?date=${encodeURIComponent(date)}`),
  },
  dailyVerse: {
    get: () => fetchApi<DailyVerse | null>('/daily-verse'),
    getByDate: (date: string) => fetchApi<DailyVerse | null>(`/daily-verse/${date}`),
  },

  readingPlans: {
    getAll: () => fetchApi<ReadingPlan[]>('/reading-plans'),
    getById: (id: number) => fetchApi<ReadingPlan>(`/reading-plans/${id}`),
  },

  userProgress: {
    getAll: () => fetchApi<UserReadingProgress[]>('/user/progress'),
    create: (planId: number, currentDay = 0, completedDays: number[] = []) =>
      fetchApi<UserReadingProgress>('/user/progress', {
        method: 'POST',
        body: JSON.stringify({ planId, currentDay, completedDays }),
      }),
    update: (id: number, currentDay: number, completedDays: number[]) =>
      fetchApi<UserReadingProgress>(`/user/progress/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ currentDay, completedDays }),
      }),
  },

  highlights: {
    getAll: () => fetchApi<HighlightedVerse[]>('/user/highlights'),
    create: (verseId: number, color: string, note?: string) =>
      fetchApi<HighlightedVerse>('/user/highlights', {
        method: 'POST',
        body: JSON.stringify({ verseId, color, note }),
      }),
    delete: (id: number) =>
      fetchApi<{ success: boolean }>(`/user/highlights/${id}`, { method: 'DELETE' }),
  },

  emotions: {
    getAll: () => fetchApi<Emotion[]>('/emotions'),
    getVerses: (id: number) => fetchApi<EmotionTopicVerse[]>(`/emotions/${id}/verses`),
  },

  topics: {
    getAll: () => fetchApi<Topic[]>('/topics'),
    getVerses: (id: number) => fetchApi<EmotionTopicVerse[]>(`/topics/${id}/verses`),
  },

  childStories: {
    getAll: () => fetchApi<ChildStory[]>('/child-stories'),
    getById: (id: number) => fetchApi<ChildStory>(`/child-stories/${id}`),
  },

  ai: {
    query: (query: string) =>
      fetchApi<AiResponse>('/ai/query', {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
  },

  stTakla: {
    getSections: () =>
      fetchApi<{ source: 'St-Takla.org'; sections: StTaklaSectionCatalog[] }>('/orthodox/sttakla/sections'),
    browse: (section: StTaklaSectionKey, key: string, query = '', page = 1, pageSize = 40) =>
      fetchApi<StTaklaSectionBrowseResponse>(
        `/orthodox/sttakla/sections/${section}/browse?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
      ),
    article: (section: StTaklaSectionKey, url: string) =>
      fetchApi<StTaklaSectionArticle>(
        `/orthodox/sttakla/sections/${section}/article?url=${encodeURIComponent(url)}`,
      ),
  },

  deuteroSource: {
    getCatalog: () => fetchApi<DeuteroSourceCatalog>('/deutero/sttakla'),
    getChapter: (bookId: number, chapter: number) =>
      fetchApi<DeuteroSourceChapter>(`/deutero/sttakla/books/${bookId}/chapters/${chapter}`),
  },
};
