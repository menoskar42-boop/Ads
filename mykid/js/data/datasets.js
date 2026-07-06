// ===== سجلّ مجموعات البيانات (لتمريرها للألعاب عبر مفتاح نصّي) =====
import { ARABIC_LETTERS } from "./arabicLetters.js";
import { ENGLISH_LETTERS } from "./englishLetters.js";
import { ANIMALS } from "./animals.js";
import { FISH } from "./fish.js";
import { BIRDS } from "./birds.js";
import { FRUITS } from "./fruits.js";
import { COLORS } from "./colors.js";
import { SHAPES } from "./shapes.js";
import { JOBS } from "./jobs.js";
import { BODY_PARTS } from "./body.js";
import { TRANSPORT } from "./transport.js";
import { FOOD } from "./food.js";
import { WEEKDAYS } from "./weekdays.js";
import { OPPOSITES_FLAT } from "./opposites.js";
import { WORDS } from "./words.js";
import { NUMBERS } from "./numbers.js";
import { INSECTS } from "./insects.js";
import { FEELINGS } from "./feelings.js";
import { VERBS } from "./verbs.js";
import { FAMILY } from "./family.js";
import { WEATHER } from "./weather.js";
import { SEASONS } from "./seasons.js";
import { SENSES } from "./senses.js";
import { CLOTHES } from "./clothes.js";
import { SPORTS } from "./sports.js";
import { HOME } from "./home.js";
import { SCHOOL } from "./school.js";
import { MUSIC } from "./music.js";
import { PLACES } from "./places.js";
import { MONTHS } from "./months.js";
import { KITCHEN } from "./kitchen.js";
import { DRINKS } from "./drinks.js";
import { NATURE } from "./nature.js";
import { COUNTRIES } from "./countries.js";
import { TOOLS } from "./tools.js";
import { APPLIANCES } from "./appliances.js";
import { TIMEDAY } from "./timeday.js";
import { TASTES } from "./tastes.js";
import { HYGIENE } from "./hygiene.js";
import { SPACE } from "./space.js";
import { PLANTS } from "./plants.js";
import { DINOSAURS } from "./dinosaurs.js";

const DATASETS = {
  arabic: {
    key: "arabic",
    lang: "ar-EG",
    glyphKind: "letter", // طريقة العرض
    items: ARABIC_LETTERS,
  },
  english: {
    key: "english",
    lang: "en-US",
    glyphKind: "letter",
    items: ENGLISH_LETTERS,
  },
  animals: { key: "animals", lang: "ar-EG", glyphKind: "emoji", items: ANIMALS },
  fish: { key: "fish", lang: "ar-EG", glyphKind: "emoji", items: FISH },
  birds: { key: "birds", lang: "ar-EG", glyphKind: "emoji", items: BIRDS },
  fruits: { key: "fruits", lang: "ar-EG", glyphKind: "emoji", items: FRUITS },
  colors: { key: "colors", lang: "ar-EG", glyphKind: "emoji", items: COLORS },
  shapes: { key: "shapes", lang: "ar-EG", glyphKind: "emoji", items: SHAPES },
  jobs: { key: "jobs", lang: "ar-EG", glyphKind: "emoji", items: JOBS },
  body: { key: "body", lang: "ar-EG", glyphKind: "emoji", items: BODY_PARTS },
  transport: { key: "transport", lang: "ar-EG", glyphKind: "emoji", items: TRANSPORT },
  food: { key: "food", lang: "ar-EG", glyphKind: "emoji", items: FOOD },
  weekdays: { key: "weekdays", lang: "ar-EG", glyphKind: "emoji", items: WEEKDAYS },
  opposites: { key: "opposites", lang: "ar-EG", glyphKind: "emoji", items: OPPOSITES_FLAT },
  words: { key: "words", lang: "ar-EG", glyphKind: "emoji", items: WORDS },
  numbers: { key: "numbers", lang: "ar-EG", glyphKind: "number", items: NUMBERS },
  insects: { key: "insects", lang: "ar-EG", glyphKind: "emoji", items: INSECTS },
  feelings: { key: "feelings", lang: "ar-EG", glyphKind: "emoji", items: FEELINGS },
  verbs: { key: "verbs", lang: "ar-EG", glyphKind: "emoji", items: VERBS },
  family: { key: "family", lang: "ar-EG", glyphKind: "emoji", items: FAMILY },
  weather: { key: "weather", lang: "ar-EG", glyphKind: "emoji", items: WEATHER },
  seasons: { key: "seasons", lang: "ar-EG", glyphKind: "emoji", items: SEASONS },
  senses: { key: "senses", lang: "ar-EG", glyphKind: "emoji", items: SENSES },
  clothes: { key: "clothes", lang: "ar-EG", glyphKind: "emoji", items: CLOTHES },
  sports: { key: "sports", lang: "ar-EG", glyphKind: "emoji", items: SPORTS },
  home: { key: "home", lang: "ar-EG", glyphKind: "emoji", items: HOME },
  school: { key: "school", lang: "ar-EG", glyphKind: "emoji", items: SCHOOL },
  music: { key: "music", lang: "ar-EG", glyphKind: "emoji", items: MUSIC },
  places: { key: "places", lang: "ar-EG", glyphKind: "emoji", items: PLACES },
  months: { key: "months", lang: "ar-EG", glyphKind: "emoji", items: MONTHS },
  kitchen: { key: "kitchen", lang: "ar-EG", glyphKind: "emoji", items: KITCHEN },
  drinks: { key: "drinks", lang: "ar-EG", glyphKind: "emoji", items: DRINKS },
  nature: { key: "nature", lang: "ar-EG", glyphKind: "emoji", items: NATURE },
  countries: { key: "countries", lang: "ar-EG", glyphKind: "emoji", items: COUNTRIES },
  tools: { key: "tools", lang: "ar-EG", glyphKind: "emoji", items: TOOLS },
  appliances: { key: "appliances", lang: "ar-EG", glyphKind: "emoji", items: APPLIANCES },
  timeday: { key: "timeday", lang: "ar-EG", glyphKind: "emoji", items: TIMEDAY },
  tastes: { key: "tastes", lang: "ar-EG", glyphKind: "emoji", items: TASTES },
  hygiene: { key: "hygiene", lang: "ar-EG", glyphKind: "emoji", items: HYGIENE },
  space: { key: "space", lang: "ar-EG", glyphKind: "emoji", items: SPACE },
  plants: { key: "plants", lang: "ar-EG", glyphKind: "emoji", items: PLANTS },
  dinosaurs: { key: "dinosaurs", lang: "ar-EG", glyphKind: "emoji", items: DINOSAURS },
};

export function getDataset(key) {
  return DATASETS[key];
}

// يُستخدم في سكربت تسخين النطق (server/warm-tts.js) للمرور على كل المحتوى
export { DATASETS };
