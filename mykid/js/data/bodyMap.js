// ===== جسمي بالإنجليزي: صورة طفل وأجزاءها (٢٠٢٦-١٠-٢٦) =====
// المالك: «هل فيه حاجه تعرف الطفل اجزاء الجسم بالانجليزى» → ثلاث ألعاب على صورة
// واحدة (games/bodyMap.js): اتعلّم (دوس واسمع) · Where is…? · Head, Shoulders, Knees and Toes.
//
// parent: الجزء جوّه إيه — لو ميزو سأل عن الرأس والطفل داس على العين، صح (العين فى الرأس).
// ask: السؤال بالإنجليزى بالظبط (is/are حسب الكلمة).

export const BODY_MAP_PARTS = [
  { id: "head", en: "Head", ar: "الرأس", ask: "Where is your head?" },
  { id: "hair", en: "Hair", ar: "الشعر", ask: "Where is your hair?", parent: "head" },
  { id: "face", en: "Face", ar: "الوجه", ask: "Where is your face?", parent: "head" },
  { id: "eyebrow", en: "Eyebrow", ar: "الحاجب", ask: "Where is your eyebrow?", parent: "face" },
  { id: "eye", en: "Eye", ar: "العين", ask: "Where is your eye?", parent: "face" },
  { id: "ear", en: "Ear", ar: "الأذن", ask: "Where is your ear?", parent: "head" },
  { id: "nose", en: "Nose", ar: "الأنف", ask: "Where is your nose?", parent: "face" },
  { id: "mouth", en: "Mouth", ar: "الفم", ask: "Where is your mouth?", parent: "face" },
  { id: "cheek", en: "Cheek", ar: "الخد", ask: "Where is your cheek?", parent: "face" },
  { id: "chin", en: "Chin", ar: "الذقن", ask: "Where is your chin?", parent: "face" },
  { id: "neck", en: "Neck", ar: "الرقبة", ask: "Where is your neck?" },
  { id: "shoulder", en: "Shoulder", ar: "الكتف", ask: "Where is your shoulder?" },
  { id: "chest", en: "Chest", ar: "الصدر", ask: "Where is your chest?" },
  { id: "tummy", en: "Tummy", ar: "البطن", ask: "Where is your tummy?" },
  { id: "arm", en: "Arm", ar: "الذراع", ask: "Where is your arm?" },
  { id: "elbow", en: "Elbow", ar: "الكوع", ask: "Where is your elbow?", parent: "arm" },
  { id: "hand", en: "Hand", ar: "اليد", ask: "Where is your hand?", parent: "arm" },
  { id: "finger", en: "Finger", ar: "الإصبع", ask: "Where is your finger?", parent: "hand" },
  { id: "leg", en: "Leg", ar: "الساق", ask: "Where is your leg?" },
  { id: "knee", en: "Knee", ar: "الركبة", ask: "Where is your knee?", parent: "leg" },
  { id: "foot", en: "Foot", ar: "القدم", ask: "Where is your foot?", parent: "leg" },
  { id: "toes", en: "Toes", ar: "أصابع القدم", ask: "Where are your toes?", parent: "foot" },
];

const BY_ID = new Map(BODY_MAP_PARTS.map((p) => [p.id, p]));
export const bodyPart = (id) => BY_ID.get(id);

/** الطفل داس على `tapped` والمطلوب `target`: صح لو هو نفسه أو جوّاه (العين جوّه الرأس). */
export function isInside(tapped, target) {
  for (let id = tapped; id; id = BY_ID.get(id)?.parent) if (id === target) return true;
  return false;
}

// الأغنية بالترتيب — كل كلمة = الجزء اللى الطفل يلمسه
export const SONG_STEPS = [
  { word: "Head", part: "head" }, { word: "Shoulders", part: "shoulder" },
  { word: "Knees", part: "knee" }, { word: "Toes", part: "toes" },
  { word: "Knees", part: "knee" }, { word: "Toes", part: "toes" },
  { word: "Head", part: "head" }, { word: "Shoulders", part: "shoulder" },
  { word: "Knees", part: "knee" }, { word: "Toes", part: "toes" },
  { word: "Knees", part: "knee" }, { word: "Toes", part: "toes" },
  { word: "Eyes", part: "eye" }, { word: "Ears", part: "ear" },
  { word: "Mouth", part: "mouth" }, { word: "Nose", part: "nose" },
];
export const SONG_LINES = [
  "Head, shoulders, knees and toes, knees and toes",
  "Head, shoulders, knees and toes, knees and toes",
  "And eyes and ears and mouth and nose",
];
export const SONG_END = "Head, shoulders, knees and toes, knees and toes!";

export const FIND_ROUNDS = 8;

/** أسئلة «Where is…?» — من غير تكرار ورا بعض، وكل جزء مرة لحد ما يخلصوا. */
export function findPlan(rnd = Math.random, n = FIND_ROUNDS) {
  const ids = BODY_MAP_PARTS.map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

// كل الجمل اللى بتتنطق — لتسجيل الأصوات مرة واحدة (server/tts-games.js)
export function bodyMapPhrases() {
  const en = new Set(), ar = new Set();
  for (const p of BODY_MAP_PARTS) { en.add(p.en); en.add(p.ask); ar.add(p.ar); }
  for (const s of SONG_STEPS) en.add(s.word);
  en.add(SONG_END);
  return { en: [...en], ar: [...ar] };
}
