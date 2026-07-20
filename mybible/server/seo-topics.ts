/**
 * SEO Auto Topic Generator — Phases 1, 5, 7
 * Turns user searches into permanent indexable topic pages.
 * Zero AI calls — pure keyword matching and normalization.
 */

export const ARABIC_STOP_WORDS = new Set([
  'في', 'من', 'إلى', 'على', 'عن', 'مع', 'هو', 'هي', 'هم', 'نحن',
  'انت', 'أنت', 'ما', 'ماذا', 'لا', 'لم', 'لن', 'قد', 'كل', 'بعض',
  'هذا', 'هذه', 'ذلك', 'تلك', 'الذي', 'التي', 'الذين', 'كان', 'كانت',
  'يكون', 'يكونون', 'أن', 'إن', 'لأن', 'حتى', 'أو', 'و', 'ف', 'ب',
  'ل', 'ك', 'قال', 'قالت', 'له', 'لها', 'لهم', 'فيه', 'فيها',
  'the', 'is', 'are', 'in', 'of', 'to', 'a', 'an',
]);

/**
 * Normalize Arabic text: remove diacritics, normalize letters
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Convert Arabic query to URL-safe slug
 */
export function toSlug(text: string): string {
  const normalized = normalizeArabic(text);
  return normalized
    .replace(/\s+/g, '-')
    .replace(/[^\u0600-\u06FF\u0750-\u077F\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Extract meaningful keywords from a query (remove stop words, short tokens)
 */
export function extractKeywords(query: string): string[] {
  const normalized = normalizeArabic(query);
  const tokens = normalized.split(/[\s\-،,]+/);
  return tokens
    .filter(t => t.length >= 2 && !ARABIC_STOP_WORDS.has(t))
    .slice(0, 8);
}

/**
 * Decide if a query is worth creating a topic page for
 */
export function isTopicWorthy(query: string): boolean {
  const q = query.trim();
  if (!q || q.length < 2) return false;
  const keywords = extractKeywords(q);
  return keywords.length >= 1;
}

/**
 * Build a canonical, de-duplicated title for a topic
 */
export function buildTopicTitle(query: string): string {
  const q = query.trim();
  // Capitalize first word nicely
  return q.charAt(0).toUpperCase() + q.slice(1);
}
