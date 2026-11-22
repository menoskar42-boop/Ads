/**
 * Auto-generated + manually verified by scripts/fetch-playlists.mjs
 * Maps Arabic Bible book names → Daoud Lamei YouTube playlist IDs.
 * Used by server/daoud-lamei-service.ts to fetch per-book RSS feeds.
 *
 * To refresh: node scripts/fetch-playlists.mjs
 */
export const BOOK_PLAYLISTS: Record<string, string> = {
  // ── العهد القديم ──────────────────────────────────────────────
  "تكوين":          "PLvMAQ886uceu9UR4QRV_F2Jyda4JO0Avz",
  "خروج":           "PLvMAQ886ucevBfV1HR8AFpQHykLzJPlmB",
  "تثنية":          "PLvMAQ886ucesECrl5OLdpB7i-GT8VhSHF",
  "صموئيل أول":     "PLvMAQ886ucevFh13c_VBT5KIl1g3Ark95",
  "أيوب":           "PLvMAQ886ucesTU26czYR4O8PHUeEEsnuf",
  "مزامير":         "PLvMAQ886ucet-qZwbaHoTpBFQ-D5dyn7v",
  "أمثال":          "PLvMAQ886uceszM-qzz4JiVMcOCXLvgwLi",
  "نشيد الأنشاد":   "PLvMAQ886uceuNEtGULdfteBpGwNKiif_U",
  "إشعياء":         "PLvMAQ886ucesq5I1-_j9gB4uQgc5P5C_d",
  "حزقيال":         "PLvMAQ886uceslTdE1uO4NoQw3o-FJemsu",
  "يونان":          "PLvMAQ886uceuI83P8i9vifLN54uDix3Zv",
  "زكريا":          "PLvMAQ886ucevzY6nwV3LHTJGPrj0_zELP",
  // Deuterocanonical
  "يشوع بن سيراخ":  "PLvMAQ886ucesy3329P9HfJP2VrXRD2VSf",

  // ── العهد الجديد ──────────────────────────────────────────────
  "متى":            "PLvMAQ886ucevru0Ubq5aRKd0k5-y6YUiH",
  "مرقس":           "PLvMAQ886ucetCnNPq4ft5YY0dujWRuADy",   // "Gospel of St. Mark" (English playlist)
  "لوقا":           "PLvMAQ886uces4ptvHBf3eRsU38Xab2LD1",
  "يوحنا":          "PLvMAQ886ucev6eVL2fz6etg2gfSZYG-Pz",   // "تفسير إنجيل يوحنا" (fixed — was wrongly matched to يوحنا الدرجي)
  "أعمال الرسل":    "PLvMAQ886uceu_lgmX-HfKIbThcPWhdMog",
  "تيموثاوس ثانية": "PLvMAQ886uces-IIaXuMgsZqtc-7NF528d",
  "يهوذا":          "PLvMAQ886uceuO-qfmXx7w62ikKbqC7Pfr",
};

export function getPlaylistId(bookName: string): string | undefined {
  return BOOK_PLAYLISTS[bookName];
}
