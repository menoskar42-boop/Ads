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
    getSynaxarium: async () => {
      const res = await fetch('/api/orthodox/synaxarium');
      if (!res.ok) throw new Error('Failed to fetch synaxarium');
      return res.json() as Promise<{ copticDate: string; entries: { title: string; url: string; anchor: string }[] }>;
    },
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
};
