/**
 * Arabic Text Normalization Utility
 * Handles character variations common in Arabic text:
 * - ى ↔ ي (alef maqsura vs yaa)
 * - ة ↔ ه (ta marbuta vs ha)
 * - أ/إ/آ/ا (various alef forms)
 * - ئ/ؤ → ء (hamza variations)
 * - Removes diacritics (tashkeel)
 * - Removes tatweel (kashida)
 */

export function normalizeArabicText(text: string): string {
  if (!text) return '';
  
  let normalized = text.trim().toLowerCase();
  
  // Remove Arabic diacritics (tashkeel): ً ٌ ٍ َ ُ ِ ّ ْ
  normalized = normalized.replace(/[\u064B-\u0652]/g, '');
  
  // Remove tatweel (kashida): ـ
  normalized = normalized.replace(/\u0640/g, '');
  
  // Normalize alef forms: أ إ آ ا → ا
  normalized = normalized.replace(/[أإآٱ]/g, 'ا');
  
  // Normalize alef maqsura to yaa: ى → ي
  normalized = normalized.replace(/ى/g, 'ي');
  
  // Normalize ta marbuta to ha: ة → ه
  normalized = normalized.replace(/ة/g, 'ه');
  
  // Normalize hamza on carriers to standalone hamza: ئ/ؤ → ء
  normalized = normalized.replace(/ئ/g, 'ء');
  normalized = normalized.replace(/ؤ/g, 'ء');
  
  // Normalize multiple spaces to single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  return normalized;
}

/**
 * Check if two Arabic texts match after normalization
 */
export function arabicTextsMatch(text1: string, text2: string): boolean {
  return normalizeArabicText(text1) === normalizeArabicText(text2);
}

/**
 * Check if normalized text1 contains normalized text2
 */
export function normalizedContains(text1: string, text2: string): boolean {
  return normalizeArabicText(text1).includes(normalizeArabicText(text2));
}
