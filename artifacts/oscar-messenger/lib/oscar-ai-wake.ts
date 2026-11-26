const clean = (text: string): string =>
  String(text || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/ی/g, "ي")
    .replace(/ھ/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();

const wakeAliases = [
  "اوسكار", "اسكار", "وسكار", "اوسكر", "اوزكار", "سكار", "اوسكو",
  "اسكو", "اوسك", "اوسكا", "اسكا", "اوزكر", "اوسقار", "اسقار",
  "عوسكار", "اوشكار", "oscar", "oskar", "oscars", "os car",
].map(clean);
const wakePrefixes = ["يا", "هاي", "hey", "ok", "okay"];
const wakeNever = [
  "سكر", "السكر", "سكره", "سكري", "عسكر", "عسكري", "عسكريه",
  "اسكندر", "اسكندريه", "سكرتير", "سكرتيره", "سكوتر", "اسكان",
  "سكان", "مسكر", "مسكره", "اسكت", "اسكتي",
];

export function hasOscarWake(text: string): boolean {
  const words = clean(text).split(" ").filter(Boolean);
  const candidateIndex = wakePrefixes.includes(words[0]) ? 1 : 0;
  const candidate = words[candidateIndex];
  return Boolean(candidate && wakeAliases.includes(candidate));
}

export function isOscarWakeOnly(text: string): boolean {
  const words = clean(text).split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const candidateIndex = wakePrefixes.includes(words[0]) ? 1 : 0;
  const candidate = words[candidateIndex];
  if (!candidate || wakeNever.includes(candidate)) return false;
  return wakeAliases.includes(candidate) && words.length === candidateIndex + 1;
}

export function isOscarAiExitPhrase(text: string): boolean {
  return clean(text).split(" ").some((word) => word === "خلاص" || word === "شكرا");
}
