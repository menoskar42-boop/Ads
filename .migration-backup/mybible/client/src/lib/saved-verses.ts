import { dataSync } from './user-data-sync';

const SAVED_KEY = 'savedVerses';
const HIGHLIGHT_KEY = 'highlightedVerses';

export interface SavedVerse {
  text: string;
  reference: string;
  date: string;
}

export interface HighlightedVerseLocal {
  text: string;
  reference: string;
  color: string;
  date: string;
}

export type MergedVerse = {
  text: string;
  reference: string;
  date: string;
  type: 'saved' | 'highlight';
  color?: string;
};

export function getSavedVerses(): SavedVerse[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedVerse[];
  } catch {
    return [];
  }
}

export function getHighlightedVerses(): HighlightedVerseLocal[] {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HighlightedVerseLocal[];
  } catch {
    return [];
  }
}

export function isVerseSaved(reference: string): boolean {
  return getSavedVerses().some(v => v.reference === reference);
}

export function saveVerse(text: string, reference: string): boolean {
  const verses = getSavedVerses();
  if (verses.some(v => v.reference === reference)) {
    return false;
  }
  const today = new Date().toISOString().split('T')[0];
  verses.unshift({ text, reference, date: today });
  localStorage.setItem(SAVED_KEY, JSON.stringify(verses));
  dataSync.savedVerse(reference, text);
  return true;
}

export function removeVerse(reference: string): void {
  const verses = getSavedVerses().filter(v => v.reference !== reference);
  localStorage.setItem(SAVED_KEY, JSON.stringify(verses));
  dataSync.removeSavedVerse(reference);
}

export function saveHighlightedVerse(text: string, reference: string, color: string): boolean {
  const verses = getHighlightedVerses();
  if (verses.some(v => v.reference === reference)) {
    return false;
  }
  const today = new Date().toISOString().split('T')[0];
  verses.unshift({ text, reference, color, date: today });
  localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(verses));
  dataSync.highlight(reference, text, color);
  return true;
}

export function removeHighlightedVerse(reference: string): void {
  const verses = getHighlightedVerses().filter(v => v.reference !== reference);
  localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(verses));
  dataSync.removeHighlight(reference);
}

export function getMergedVerses(): MergedVerse[] {
  const saved: MergedVerse[] = getSavedVerses().map(v => ({
    ...v,
    type: 'saved' as const,
  }));

  const highlighted: MergedVerse[] = getHighlightedVerses().map(v => ({
    text: v.text,
    reference: v.reference,
    date: v.date,
    type: 'highlight' as const,
    color: v.color,
  }));

  const all = [...saved, ...highlighted];
  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return all;
}
