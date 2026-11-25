export type VerseGap = { from: number; to: number };

export function chooseDeuteroChapterSource<T>(
  embedded: readonly T[] | null | undefined,
  local: readonly T[] | null | undefined,
): { source: 'embedded' | 'local' | 'unavailable'; verses: T[] } {
  if (embedded?.length) return { source: 'embedded', verses: [...embedded] };
  if (local?.length) return { source: 'local', verses: [...local] };
  return { source: 'unavailable', verses: [] };
}

export function findMissingVerseRanges(verseNumbers: readonly number[]): VerseGap[] {
  const numbers = [...new Set(verseNumbers.filter((n) => Number.isInteger(n) && n > 0))]
    .sort((a, b) => a - b);
  const gaps: VerseGap[] = [];
  if (numbers.length && numbers[0] > 1) gaps.push({ from: 1, to: numbers[0] - 1 });
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] - numbers[i - 1] > 1) {
      gaps.push({ from: numbers[i - 1] + 1, to: numbers[i] - 1 });
    }
  }
  return gaps;
}
