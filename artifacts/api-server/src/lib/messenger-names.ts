const ARABIC_NAME_MAP: Record<string, string> = {
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ٱ: "ا",
  ى: "ي",
  ة: "ه",
  ؤ: "و",
  ئ: "ي",
};

export function displayNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(
      /[أإآٱىةؤئ]/g,
      (character) => ARABIC_NAME_MAP[character] ?? character,
    )
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, " ");
}

export const DISPLAY_NAME_TAKEN_AR = "الاسم ده مستخدم، اختار اسم تانى";
export const USERNAME_TAKEN_AR = "اسم المستخدم ده مستخدم، اختار اسم تانى";
export const PHONE_TAKEN_AR = "رقم الموبايل ده مسجّل على حساب تانى";
