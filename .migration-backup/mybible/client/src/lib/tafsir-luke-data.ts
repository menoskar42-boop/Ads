const BASE_URL = "https://st-takla.org/pub_Bible-Interpretations/Holy-Bible-Tafsir-02-New-Testament/Father-Tadros-Yacoub-Malaty/03-Enjil-Loka/Tafseer-Angil-Luca__01-Chapter-";

const LUKE_VERSES_PER_CHAPTER: Record<number, number> = {
  1: 80, 2: 52, 3: 38, 4: 44, 5: 39, 6: 49, 7: 50, 8: 56,
  9: 62, 10: 42, 11: 54, 12: 59, 13: 35, 14: 35, 15: 32, 16: 31,
  17: 37, 18: 43, 19: 48, 20: 47, 21: 38, 22: 71, 23: 56, 24: 53
};

export function getLukeTafsirLink(chapter: number, verse: number): string | null {
  const versesInChapter = LUKE_VERSES_PER_CHAPTER[chapter];
  if (!versesInChapter || verse < 1 || verse > versesInChapter) {
    return null;
  }
  const chapterStr = String(chapter).padStart(2, '0');
  return `${BASE_URL}${chapterStr}.html#${verse}`;
}
