// ===== «كتاب الإنجليزى» (Hello! Little Stars — KG) جوّه mykid =====
//
// المالك ٢٠٢٦-١٠-١٤: «كتاب الإنجليزى بتاع بنتى… اعمل نفس التمارين بطريقة شيقة وجذابة
// ومتزهقش الطفل، مع كلمات مشجعة ليها». كل وحدة زى الكتاب بالظبط:
//   Language (الكلمات + جملة) · Phonics (حرفين: ٣ كلمات + كتابة الكابيتال والصغير) · CLIL ·
//   Story (جمل تتقرا) · Sight word (الكلمة + جملة + «لوّن الكلمة») · Revision (اسمع واختار،
//   وصّل الحرف بالصورة، اعدّ…). ميزو بيشرح بالعربى، والكلمات الإنجليزى بتتنطق إنجليزى.
//
// ملف صافى (من غير DOM) — الشاشة فى games/englishbook.js، والاختبارات بتستورده مباشرة.

const W = (w, e) => ({ w, e });

/** كل كلمات الكتاب بصورها — مكان واحد عشان الصورة تفضل هى هى فى كل الأنشطة. */
export const EB_WORDS = {
  // الوحدة ١: العيلة
  dad: "👨", mom: "👩", brother: "👦", sister: "👧", grandpa: "👴", grandma: "👵", baby: "👶",
  man: "🧔", mud: "🟤", apple: "🍎", ant: "🐜", axe: "🪓", sand: "🏖️", sun: "☀️", star: "⭐",
  // الوحدة ٢: جسمى
  head: "🙂", eye: "👁️", ear: "👂", nose: "👃", mouth: "👄", eyes: "👀", ears: "👂👂",
  arm: "💪", hand: "✋", leg: "🦵", foot: "🦶", finger: "☝️", girl: "👧", boy: "👦",
  turtle: "🐢", toy: "🧸", train: "🚂", pants: "👖", pen: "🖊️", pan: "🍳",
  numbers: "🔢", night: "🌙", nest: "🪺", map: "🗺️",
  // الوحدة ٣: فصلى
  // table اتشال (المالك ٢٠٢٦-١٠-٢٦: «حاطط رسمه كرسى و مسميه table») — مفيش إيموجى ترابيزة
  bag: "🎒", pencil: "✏️", book: "📕", eraser: "🧽", "pencil case": "👝",
  in: "📥", ink: "🖋️", insect: "🐞", cow: "🐄", cap: "🧢", cloud: "☁️",
  teacher: "🧑‍🏫", school: "🏫", playground: "🛝", classroom: "🧑‍🎓",
  fan: "🪭", frog: "🐸", fork: "🍴", desk: "🗄️", dog: "🐶", dress: "👗", cat: "🐱",
  // الوحدة ٤: لعبى
  doll: "🪆", "teddy bear": "🧸", car: "🚗", boat: "⛵", ball: "⚽",
  honey: "🍯", heart: "❤️", helicopter: "🚁", ostrich: "🦤", orange: "🍊", octopus: "🐙",
  plane: "✈️", balloon: "🎈", bus: "🚌", bike: "🚲", ship: "🚢",
  robot: "🤖", rabbit: "🐇", rice: "🍚", rat: "🐀", pot: "🍲",
  // الوحدة ٥: الحيوانات والنباتات
  goat: "🐐", tree: "🌳", flower: "🌼",
  banana: "🍌", bird: "🐦", lion: "🦁", lemon: "🍋", lollipop: "🍭",
  kite: "🪁", kiwi: "🥝", kick: "🦶⚽", egg: "🥚", elephant: "🐘", elbow: "🦾", hen: "🐔",
  people: "🧑‍🤝‍🧑", giraffe: "🦒", parrot: "🦜", bee: "🐝", fish: "🐟", phone: "📱",
  // الوحدة ٦: أكلنا
  yogurt: "🥣", chicken: "🍗", food: "🍽️", juice: "🧃", milk: "🥛", tea: "🍵", water: "💧", drink: "🥤",
  gorilla: "🦍", grapes: "🍇", whale: "🐋", window: "🪟", watermelon: "🍉", six: "6️⃣", box: "📦", fox: "🦊",
  // الوحدة ٧: هدومنا
  jacket: "🧥", "t-shirt": "👕", shorts: "🩳", sandals: "🩴", shoes: "👟", scarf: "🧣", gloves: "🧤", hat: "👒",
  van: "🚐", violin: "🎻", vase: "🏺", up: "⬆️", under: "⬇️", umbrella: "☂️", unicorn: "🦄",
  jam: "🫙", jellyfish: "🪼", queen: "👸", quack: "🦆", quiet: "🤫",
  // الوحدة ٨: الجو
  cold: "🥶", hot: "🥵", rainy: "🌧️", windy: "🌬️", sunny: "🌤️", snowy: "❄️",
  spring: "🌷", summer: "🏄", fall: "🍂", winter: "⛄", yarn: "🧶", "yo-yo": "🪀", zero: "0️⃣", zebra: "🦓", zoo: "🐒",
  wig: "💇", dig: "⛏️", log: "🪵", cup: "☕", pup: "🐕", yam: "🍠", earth: "🌍",
  // الوحدة ٩: الوظايف
  "police officer": "👮", doctor: "🧑‍⚕️", cleaner: "🧹", farmer: "🧑‍🌾", carpenter: "🪚", engineer: "👷", firefighter: "🧑‍🚒",
  pin: "📌", tin: "🥫", nap: "😴", sit: "🧘", tap: "🚰", turkey: "🦃", igloo: "🧊", sandwich: "🥪",
};
export const pic = (w) => W(w, EB_WORDS[w] || "❓");
/** الجمع بصورة المفرد (hands ← hand) — لـ «I have 2 …». */
const SINGULAR = { hands: "hand", legs: "leg", feet: "foot", arms: "arm", eyes: "eye", ears: "ear", apples: "apple" };
export const emojiOf = (w) => EB_WORDS[SINGULAR[w]] || EB_WORDS[w] || "❓";
export const NUM_EN = ["zero", "one", "two", "three", "four", "five"];

/**
 * الوحدات زى الكتاب. كل صفحة: { id, type, … } — والأنشطة بتتبنى من النوع (ebSteps).
 * الأنواع: vocab · letter · story · sight · review.
 */
export const EB_UNITS = [
  {
    id: "u1", title: "Unit 1 · My Family", ar: "عيلتى",
    pages: [
      {
        id: "u1-words", type: "vocab", title: "My Family", ar: "العيلة",
        words: ["dad", "mom", "brother", "sister", "grandpa", "grandma"],
        // He / She: الولد والراجل He، والبنت والست She
        sort: { say: "الولد والراجل بنقول عليهم He، والبنت والست She. اختار الصح لكل صورة",
          bins: [{ en: "He", ar: "ولد أو راجل" }, { en: "She", ar: "بنت أو ست" }],
          items: [["dad", "He"], ["mom", "She"], ["brother", "He"], ["sister", "She"], ["grandpa", "He"], ["grandma", "She"]] },
        sentence: (w, bin) => `${bin}'s my ${w}.`,
      },
      { id: "u1-M", type: "letter", ch: "M", sound: "m", words: ["man", "mom", "mud"] },
      { id: "u1-A", type: "letter", ch: "A", sound: "a", words: ["apple", "ant", "axe"] },
      { id: "u1-S", type: "letter", ch: "S", sound: "s", words: ["sand", "sun", "star"] },
      {
        id: "u1-story", type: "story", title: "Old and Young", ar: "كبير وصغير",
        lines: [
          { text: "He's my grandpa. He's old.", e: "👴" }, { text: "He's my brother. He's young.", e: "👦" },
          { text: "She's my grandma. She's old.", e: "👵" }, { text: "She's my sister. She's young.", e: "👧" },
          { text: "He's my dad. He's kind.", e: "👨" }, { text: "She's my mom. She's kind.", e: "👩" },
        ],
        // old / young: عكس بعض
        opposites: [["old", "👴"], ["young", "👦"]],
      },
      { id: "u1-I", type: "sight", word: "I", sentence: "I am Sam.", e: "👦", others: ["can", "the", "am", "sun"] },
      { id: "u1-review", type: "review", unit: "u1", letters: ["M", "A", "S"], words: ["apple", "sun", "boy", "grandpa", "ant", "star"] },
    ],
  },
  {
    id: "u2", title: "Unit 2 · My Body", ar: "جسمى",
    pages: [
      {
        id: "u2-words", type: "vocab", title: "My Body", ar: "جسمى",
        words: ["head", "eye", "ear", "nose", "mouth", "hand"],
        // I have 1 / I have 2 (الجمع بـ s)
        count: [["head", 1], ["eyes", 2], ["nose", 1], ["ears", 2], ["mouth", 1], ["hands", 2], ["legs", 2], ["feet", 2]],
      },
      { id: "u2-T", type: "letter", ch: "T", sound: "t", words: ["turtle", "toy", "train"] },
      { id: "u2-P", type: "letter", ch: "P", sound: "p", words: ["pants", "pen", "pan"] },
      {
        id: "u2-story", type: "story", title: "I'm a girl! I'm a boy!", ar: "أنا بنت وأنا ولد",
        lines: [
          { text: "I'm Dina. I'm a girl.", e: "👧" }, { text: "I have one nose.", e: "👃" },
          { text: "I have two feet.", e: "🦶🦶" }, { text: "I'm Adam. I'm a boy.", e: "👦" },
          { text: "I have one mouth.", e: "👄" }, { text: "I have two hands.", e: "✋✋" },
        ],
        opposites: [["girl", "👧"], ["boy", "👦"]],
      },
      { id: "u2-N", type: "letter", ch: "N", sound: "n", words: ["numbers", "night", "nest"] },
      { id: "u2-the", type: "sight", word: "the", sentence: "Sam taps the map.", e: "🗺️", others: ["can", "I", "am"] },
      { id: "u2-review", type: "review", unit: "u2", letters: ["T", "P", "N"], words: ["eye", "mouth", "hand", "night", "toy", "pan"] },
    ],
  },
  {
    id: "u3", title: "Unit 3 · In my Classroom", ar: "فصلى",
    pages: [
      {
        id: "u3-words", type: "vocab", title: "In my Classroom", ar: "الفصل",
        words: ["bag", "pencil", "book", "eraser", "pencil case"],
        // Where is my pencil? It is on the table / in the bag
        where: [["pencil", "on", "the table"], ["book", "in", "the bag"], ["eraser", "on", "the book"], ["pencil", "in", "the pencil case"]],
      },
      { id: "u3-I", type: "letter", ch: "I", sound: "i", words: ["in", "ink", "insect"] },
      { id: "u3-C", type: "letter", ch: "C", sound: "k", words: ["cow", "cap", "cloud"] },
      {
        id: "u3-story", type: "story", title: "I love my school", ar: "بحب مدرستى",
        lines: [
          { text: "I love my school.", e: "🏫" }, { text: "I love my teacher.", e: "🧑‍🏫" },
          { text: "I love my playground.", e: "🛝" }, { text: "I love my classroom.", e: "🧑‍🎓" },
        ],
      },
      { id: "u3-F", type: "letter", ch: "F", sound: "f", words: ["fan", "frog", "fork"] },
      { id: "u3-D", type: "letter", ch: "D", sound: "d", words: ["desk", "dog", "dress"] },
      { id: "u3-can", type: "sight", word: "can", sentence: "The fit cat can sit on Dad.", e: "🐱", others: ["I", "the", "am"] },
      { id: "u3-review", type: "review", unit: "u3", letters: ["I", "C", "F", "D"], words: ["bag", "pencil", "book", "insect", "cap", "dog"],
        countItems: [["eraser", 3], ["bag", 2], ["book", 1], ["pencil", 2]] },
    ],
  },
  {
    id: "u4", title: "Unit 4 · My Toys", ar: "لعبى",
    pages: [
      {
        id: "u4-words", type: "vocab", title: "My Toys", ar: "اللعب",
        words: ["doll", "teddy bear", "car", "boat", "ball", "train"],
        this: ["car", "doll", "boat", "teddy bear"], // This is my car.
      },
      { id: "u4-H", type: "letter", ch: "H", sound: "h", words: ["honey", "heart", "helicopter"] },
      { id: "u4-O", type: "letter", ch: "O", sound: "o", words: ["ostrich", "orange", "octopus"] },
      {
        id: "u4-story", type: "story", title: "Big and Small", ar: "كبير وصغير",
        lines: [
          { text: "The helicopter is small.", e: "🚁" }, { text: "The plane is big.", e: "✈️" },
          { text: "The car is small.", e: "🚗" }, { text: "The bus is big.", e: "🚌" },
          { text: "The boat is small.", e: "⛵" }, { text: "The ship is big.", e: "🚢" },
        ],
        // air / land / water
        sort: { say: "ده بيمشى فين؟ فى الجو air، ولا على الأرض land، ولا فى الميه water؟",
          bins: [{ en: "air", ar: "فى الجو" }, { en: "land", ar: "على الأرض" }, { en: "water", ar: "فى الميه" }],
          items: [["plane", "air"], ["car", "land"], ["ship", "water"], ["helicopter", "air"], ["bus", "land"], ["boat", "water"], ["bike", "land"], ["balloon", "air"]] },
      },
      { id: "u4-R", type: "letter", ch: "R", sound: "r", words: ["robot", "rabbit", "rice"] },
      { id: "u4-and", type: "sight", word: "and", sentence: "The rat and the cat ran to the hot pot.", e: "🐀🐱", others: ["the", "I", "can", "am"] },
      { id: "u4-review", type: "review", unit: "u4", letters: ["H", "O", "R", "T"], words: ["plane", "boat", "bike", "bus", "ship", "car"] },
    ],
  },
  {
    id: "u5", title: "Unit 5 · Animals and Plants", ar: "الحيوانات والنباتات",
    pages: [
      {
        id: "u5-words", type: "vocab", title: "Animals and Plants", ar: "الحيوانات والنباتات",
        words: ["cow", "goat", "tree", "flower"],
        see: ["goat", "flower", "cow", "tree"], // I can see the goat.
      },
      { id: "u5-B", type: "letter", ch: "B", sound: "b", words: ["banana", "ball", "bird"] },
      { id: "u5-L", type: "letter", ch: "L", sound: "l", words: ["lion", "lemon", "lollipop"] },
      {
        id: "u5-living", type: "story", icon: "🌱", title: "Living Things", ar: "كائن حى ولا لأ",
        lines: [
          { text: "People are living things.", e: "🧑‍🤝‍🧑" }, { text: "A giraffe is a living thing.", e: "🦒" },
          { text: "A plant is a living thing.", e: "🌳" }, { text: "A bike is a non-living thing.", e: "🚲" },
        ],
        sort: { say: "ده كائن حى بياكل ويكبر living، ولا حاجة مش حية non-living؟",
          bins: [{ en: "living", ar: "حى" }, { en: "non-living", ar: "مش حى" }],
          items: [["giraffe", "living"], ["bag", "non-living"], ["parrot", "living"], ["doll", "non-living"], ["bee", "living"], ["bike", "non-living"], ["elephant", "living"], ["phone", "non-living"]] },
      },
      {
        id: "u5-story", type: "story", title: "Clean Places", ar: "الأماكن النضيفة",
        lines: [
          { text: "My family likes clean places.", e: "👨‍👩‍👧" }, { text: "Animals like clean places.", e: "🦒" },
          { text: "Bees like clean places.", e: "🐝" }, { text: "Fish like clean places.", e: "🐟" },
        ],
      },
      { id: "u5-K", type: "letter", ch: "K", sound: "k", words: ["kite", "kiwi", "kick"] },
      { id: "u5-E", type: "letter", ch: "E", sound: "e", words: ["egg", "elephant", "elbow"] },
      { id: "u5-you", type: "sight", word: "you", sentence: "You fed the black hen.", e: "🐔", others: ["the", "and", "I", "can"] },
      { id: "u5-review", type: "review", unit: "u5", letters: ["B", "L", "K", "E"], words: ["cow", "goat", "tree", "flower", "bird", "lion"],
        match: [["b", "ball"], ["e", "egg"], ["k", "kiwi"], ["l", "lion"]] },
    ],
  },
  {
    id: "u6", title: "Unit 6 · Our Food", ar: "أكلنا",
    pages: [
      {
        id: "u6-words", type: "vocab", title: "Our Food", ar: "الأكل",
        words: ["apple", "yogurt", "chicken", "banana", "grapes", "egg"],
        lines: [{ text: "Do you like yogurt?", e: "🥣❓" }, { text: "Yes, I do.", e: "👍" }, { text: "No, I don't.", e: "👎" }],
        // Do you like …? — مفيش غلط: الطفل يقول رأيه
        likes: ["yogurt", "apple", "chicken", "banana"],
      },
      { id: "u6-G", type: "letter", ch: "G", sound: "g", words: ["gorilla", "grapes", "goat"] },
      { id: "u6-W", type: "letter", ch: "W", sound: "w", words: ["whale", "window", "watermelon"] },
      {
        id: "u6-drinks", type: "story", icon: "🥤", title: "Eat and Drink", ar: "ناكل ونشرب",
        lines: [
          { text: "I like juice.", e: "🧃" }, { text: "I like milk.", e: "🥛" }, { text: "I don't like tea.", e: "🍵" },
        ],
        sort: { say: "ده بناكله eat، ولا بنشربه drink؟",
          bins: [{ en: "eat", ar: "ناكله" }, { en: "drink", ar: "نشربه" }],
          items: [["apple", "eat"], ["milk", "drink"], ["chicken", "eat"], ["juice", "drink"], ["yogurt", "eat"], ["water", "drink"], ["banana", "eat"], ["tea", "drink"]] },
        sentenceOf: (w, bin) => `I can ${bin} ${w}.`,
      },
      {
        id: "u6-story", type: "story", title: "I can eat! I can drink!", ar: "أنا باكل وبشرب",
        lines: [
          { text: "I can eat apples.", e: "🍎" }, { text: "I can eat chicken.", e: "🍗" }, { text: "I can eat yogurt.", e: "🥣" },
          { text: "I can drink water.", e: "💧" }, { text: "I can drink milk.", e: "🥛" }, { text: "I can drink juice.", e: "🧃" },
        ],
      },
      { id: "u6-X", type: "letter", ch: "X", sound: "ks", pos: "end", words: ["six", "box", "fox"] },
      { id: "u6-we", type: "sight", word: "we", sentence: "We fix the big wet box.", e: "📦", others: ["you", "I", "the", "am"] },
      { id: "u6-review", type: "review", unit: "u6", letters: ["G", "W"], words: ["apple", "chicken", "milk", "juice", "grapes", "fox"],
        match: [["w", "window"], ["x", "fox"], ["g", "grapes"]] },
    ],
  },
  {
    id: "u7", title: "Unit 7 · Our Clothes", ar: "هدومنا",
    pages: [
      {
        id: "u7-words", type: "vocab", title: "Our Clothes", ar: "الهدوم",
        words: ["dress", "jacket", "pants", "t-shirt"],
        lines: [{ text: "What are you wearing?", e: "👀❓" }, { text: "I'm wearing my jacket.", e: "🧥" },
          { text: "I'm wearing my dress.", e: "👗" }, { text: "I'm wearing my t-shirt.", e: "👕" }],
      },
      { id: "u7-V", type: "letter", ch: "V", sound: "v", words: ["van", "violin", "vase"] },
      { id: "u7-U", type: "letter", ch: "U", sound: "u", words: ["up", "under", "umbrella"] },
      {
        id: "u7-seasons", type: "story", icon: "☀️", title: "Summer and Winter", ar: "صيف وشتا",
        lines: [
          { text: "In summer: t-shirt, shorts and sandals.", e: "👕🩳🩴" },
          { text: "In winter: coat, scarf and shoes.", e: "🧥🧣👟" },
        ],
        sort: { say: "دى بنلبسها فى الصيف Summer، ولا فى الشتا Winter؟",
          bins: [{ en: "Summer", ar: "صيف ☀️" }, { en: "Winter", ar: "شتا ❄️" }],
          items: [["t-shirt", "Summer"], ["jacket", "Winter"], ["shorts", "Summer"], ["scarf", "Winter"], ["sandals", "Summer"], ["gloves", "Winter"], ["hat", "Summer"]] },
      },
      {
        id: "u7-story", type: "story", title: "It's winter! It's summer!", ar: "شتا وصيف",
        lines: [
          { text: "It's winter!", e: "⛄" }, { text: "My sister is smart.", e: "👧" }, { text: "She is wearing a coat and shoes.", e: "🧥👟" },
          { text: "It's summer!", e: "🏄" }, { text: "My brother is smart.", e: "👦" }, { text: "He is wearing a t-shirt and shorts.", e: "👕🩳" },
        ],
      },
      { id: "u7-J", type: "letter", ch: "J", sound: "j", words: ["jam", "jellyfish", "jacket"] },
      { id: "u7-Q", type: "letter", ch: "Q", label: "Qu", sound: "kw", words: ["queen", "quack", "quiet"] },
      { id: "u7-go", type: "sight", word: "go", sentence: "I can go in the van.", e: "🚐", others: ["we", "you", "I", "am"] },
      { id: "u7-review", type: "review", unit: "u7", letters: ["V", "U", "J", "Q"], words: ["dress", "jacket", "pants", "t-shirt", "shorts", "umbrella"],
        match: [["qu", "queen"], ["v", "vase"], ["j", "jellyfish"], ["u", "umbrella"]] },
    ],
  },
  {
    id: "u8", title: "Unit 8 · The Weather", ar: "الجو",
    pages: [
      {
        id: "u8-words", type: "vocab", title: "What's the Weather Like?", ar: "الجو عامل إيه؟",
        words: ["cold", "hot", "rainy", "windy", "sunny", "snowy"],
        lines: [{ text: "What's the weather like today?", e: "🌍❓" }, { text: "It's hot.", e: "🥵" }, { text: "It's cold.", e: "🥶" },
          { text: "It's rainy.", e: "🌧️" }, { text: "It's windy.", e: "🌬️" }],
      },
      { id: "u8-Y", type: "letter", ch: "Y", sound: "y", words: ["yogurt", "yo-yo", "yarn"] },
      {
        id: "u8-seasons", type: "vocab", title: "The Four Seasons", ar: "الفصول الأربعة",
        words: ["spring", "summer", "fall", "winter"],
      },
      {
        id: "u8-story", type: "story", title: "Weather and Seasons", ar: "الجو فى كل فصل",
        lines: [
          { text: "It's snowy in the winter.", e: "⛄" }, { text: "It's sunny in the summer.", e: "🏄" },
          { text: "It's windy in the fall.", e: "🍂" }, { text: "It's nice in the spring.", e: "🌷" },
        ],
      },
      { id: "u8-Z", type: "letter", ch: "Z", sound: "z", words: ["zero", "zebra", "zoo"] },
      {
        id: "u8-cvc", type: "cvc", title: "Silly Rhymes", ar: "كلمات بتتسجّع",
        rhymes: [["cat", "hat"], ["hen", "pen"], ["dog", "log"], ["cup", "pup"], ["dig", "wig"]],
        lines: [
          { text: "The cat can nap on the hat.", e: "🐱👒" }, { text: "The hen can nap in the pen.", e: "🐔🖊️" },
          { text: "The dog can nap on the log.", e: "🐶🪵" }, { text: "The pup can nap by the cup.", e: "🐕☕" },
        ],
        build: ["cat", "hen", "dog", "cup"],
      },
      { id: "u8-for", type: "sight", word: "for", sentence: "The yam is for Zack.", e: "🍠", others: ["we", "you", "I", "am"] },
      {
        id: "u8-green", type: "story", icon: "♻️", title: "Be Green", ar: "نحافظ على الأرض",
        lines: [
          { text: "Be green and recycle.", e: "♻️" }, { text: "The earth is hot.", e: "🌍🥵" },
          { text: "Help the earth.", e: "🤲🌍" }, { text: "Recycle everything.", e: "🗑️♻️" },
        ],
      },
      { id: "u8-review", type: "review", unit: "u8", letters: ["Y", "Z"], words: ["hot", "cold", "rainy", "windy", "spring", "winter"],
        match: [["y", "yarn"], ["z", "zebra"]] },
    ],
  },
  {
    id: "u9", title: "Unit 9 · What do you do?", ar: "بتشتغل إيه؟",
    pages: [
      {
        id: "u9-words", type: "vocab", title: "What do you do?", ar: "الوظايف",
        words: ["teacher", "police officer", "doctor", "cleaner"],
        lines: [{ text: "What do you do?", e: "🤔" }, { text: "I'm a doctor.", e: "🧑‍⚕️" }, { text: "I'm a cleaner.", e: "🧹" },
          { text: "I'm a teacher.", e: "🧑‍🏫" }, { text: "I'm a police officer.", e: "👮" }],
      },
      {
        id: "u9-cvc", type: "cvc", title: "Read and Build", ar: "اقرا وركّب",
        build: ["pin", "sit", "pan", "ant", "tin", "nap"],
        missing: [["na_", "nap", ["p", "s", "t"]], ["ti_", "tin", ["s", "n", "p"]], ["_pple", "apple", ["t", "a"]], ["_andwich", "sandwich", ["p", "s"]], ["t_p", "tap", ["b", "a"]]],
        lines: [{ text: "This is an ant.", e: "🐜" }, { text: "The pin sat in pink ink.", e: "📌🖋️" }],
      },
      {
        id: "u9-jobs", type: "story", icon: "👷", title: "Your Job Is Important", ar: "كل شغلانة مهمة",
        lines: [
          { text: "I'm a farmer.", e: "🧑‍🌾" }, { text: "I'm a carpenter.", e: "🪚" },
          { text: "I'm an engineer.", e: "👷" }, { text: "I'm a firefighter.", e: "🧑‍🚒" },
        ],
      },
      {
        id: "u9-story", type: "story", title: "When I grow up", ar: "لما أكبر",
        lines: [
          { text: "What do you want to be?", e: "🤔" }, { text: "I want to be an engineer.", e: "👷" }, { text: "I want to be a farmer.", e: "🧑‍🌾" },
        ],
        // سؤال شخصى — مفيش غلط
        grow: ["doctor", "teacher", "engineer", "farmer", "firefighter", "police officer"],
      },
      { id: "u9-review", type: "review", unit: "u9", letters: ["Y", "Z", "B", "E"], words: ["teacher", "doctor", "farmer", "firefighter", "cleaner", "engineer"],
        match: [["y", "yarn"], ["z", "zebra"], ["b", "bird"], ["e", "egg"]] },
    ],
  },
];
export const EB_PAGES = EB_UNITS.flatMap((u) => u.pages);
/** كل حروف الكتاب بالترتيب (للمراجعة والمشتّتات). */
export const EB_LETTERS = EB_PAGES.filter((p) => p.type === "letter").map((p) => p.ch);
/** الكلمات اللى بتبدأ بحرف معيّن (من كلمات الكتاب). */
export const wordsStarting = (ch) => Object.keys(EB_WORDS).filter((w) => w[0].toUpperCase() === ch && !w.includes(" "));
/** الصوت فى أول الكلمة — ولـ X فى آخرها (six, box, fox زى الكتاب). */
export const hasSound = (pg, w) => (pg.pos === "end" ? w.slice(-1).toUpperCase() === pg.ch : w[0].toUpperCase() === pg.ch);

// ===== بناء الأنشطة =====
const shuffled = (rnd, a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = (rnd, a, n, not = []) => shuffled(rnd, a.filter((x) => !not.includes(x))).slice(0, n);
// كلمات صورتها مش واضحة لوحدها (in/up/quiet…) — بتظهر فى صفحتها بس، مش كمشتّتات
const ABSTRACT = ["eyes", "ears", "in", "up", "under", "quiet", "kick", "nap", "sit", "food", "drink", "numbers", "elbow", "tap", "zero", "six"];
export const ALL_WORDS = Object.keys(EB_WORDS).filter((w) => !ABSTRACT.includes(w));
/** مشتّتات صورتها مختلفة عن كل الصور اللى قدّام الطفل (مافيش صورتين شبه بعض فى نفس السؤال). */
const distinct = (rnd, pool, n, shown) => {
  const used = new Set(shown.map((w) => EB_WORDS[w]));
  const out = [];
  for (const w of shuffled(rnd, pool)) {
    if (out.length >= n) break;
    if (shown.includes(w) || used.has(EB_WORDS[w])) continue;
    used.add(EB_WORDS[w]);
    out.push(w);
  }
  return out;
};

/** «اسمع وفين»: ميزو يقول كلمة والطفل يلمس صورتها من ٣ — جولة لكل كلمة. */
function findRounds(words, rnd, pool = ALL_WORDS) {
  return shuffled(rnd, words).map((w) => ({ target: w, options: shuffled(rnd, [w, ...distinct(rnd, pool, 2, words.concat(w))]) }));
}
/** صور فيها الصوت وصور لأ (للمس اللى فيها الصوت). */
function firstSound(pg, rnd, good) {
  const bad = distinct(rnd, ALL_WORDS.filter((w) => !hasSound(pg, w)), 3, good);
  return shuffled(rnd, [...good.map((w) => ({ w, good: true })), ...bad.map((w) => ({ w, good: false }))]);
}
/** صفحة الحرف الصغيرة ({ch, pos}) — للمراجعة. */
const letterPg = (ch) => EB_PAGES.find((p) => p.type === "letter" && p.ch === ch) || { ch };
/** «Do you like …?» / «What do you want to be?»: سؤال رأى — أى اختيار صح وميزو يقول الجملة. */
const LIKE_OPTS = [{ label: "Yes, I do.", e: "👍" }, { label: "No, I don't.", e: "👎" }];
const aOrAn = (w) => (/^[aeiou]/.test(w) ? "an " : "a ") + w;

/** خطوات الصفحة (`only` للاختبار: أنواع بعينها). */
/** خطوة «تعرّف على الحرف»: الحرف وصوته وكلماته الـ٣ من الكتاب */
const meetStep = (pg) => ({ kind: "letterMeet", ch: pg.ch, label: pg.label || pg.ch, sound: pg.sound, pos: pg.pos || "start", words: pg.words });

/** صفحات الحروف اللى عليها نجمة فى الكتاب (الطفل خلّصها مرة على الأقل) */
export const starredLetterPages = (done) => EB_PAGES.filter((pg) => pg.type === "letter" && done && done[pg.id]);
/** «حروفى بالنجمة» (المالك ٢٠٢٦-١٠-٢٣): نفس «تعرّف على الحرف» برّه الكتاب على كذا حرف ورا بعض —
 *  من الحروف اللى عليها نجمة بس (اللى خلّصها قبل كده محسوبة)، بترتيب عشوائى ولحد MIX_MAX فى المرة */
export const MIX_MAX = 6;
export function letterMeetMix(done, rnd = Math.random, max = MIX_MAX) {
  return shuffled(rnd, starredLetterPages(done)).slice(0, max).map(meetStep);
}

export function ebSteps(pg, rnd = Math.random, only = null) {
  const want = (k) => !only || only.includes(k);
  const steps = [];
  if (pg.type === "vocab") {
    if (want("meetWords")) steps.push({ kind: "meetWords", words: pg.words });
    if (want("find")) steps.push({ kind: "find", rounds: findRounds(pg.words, rnd).slice(0, 4) });
    if (pg.sort && want("sort")) steps.push({ kind: "sort", say: pg.sort.say, bins: pg.sort.bins, items: shuffled(rnd, pg.sort.items).map(([w, bin]) => ({ w, bin, say: pg.sentence ? pg.sentence(w, bin) : w })) });
    if (pg.count && want("count12")) steps.push({ kind: "count12", items: shuffled(rnd, pg.count).slice(0, 6) });
    if (pg.where && want("sentences")) {
      steps.push({ kind: "sentences", lines: pg.where.map(([w, prep, place]) => ({
        text: `Where is my ${w}? It is ${prep} ${place}.`,
        // «the table» مالهاش صورة (مفيش إيموجى ترابيزة — الكرسى كان غلط): السهم بس
        e: `${EB_WORDS[w]} ${prep === "in" ? "➡️" : "⬆️"} ${EB_WORDS[place.replace("the ", "")] || ""}`.trim(),
      })) });
    }
    if (pg.this && want("sentences")) steps.push({ kind: "sentences", lines: pg.this.map((w) => ({ text: `This is my ${w}.`, e: EB_WORDS[w] })) });
    if (pg.see && want("sentences")) steps.push({ kind: "sentences", lines: pg.see.map((w) => ({ text: `I can see the ${w}.`, e: EB_WORDS[w] })) });
    if (pg.lines && want("sentences")) steps.push({ kind: "sentences", lines: pg.lines });
    if (pg.likes && want("choose")) {
      steps.push({ kind: "choose", rounds: shuffled(rnd, pg.likes).slice(0, 3).map((w) => ({ q: `Do you like ${w}?`, e: EB_WORDS[w], options: LIKE_OPTS.map((o) => ({ ...o, say: o.label })) })) });
    }
    if (want("find")) steps.push({ kind: "find", rounds: findRounds(pg.words, rnd).slice(0, 3) });
  } else if (pg.type === "letter") {
    const lo = pg.ch.toLowerCase();
    // المالك ٢٠٢٦-١٠-١٦/١٧: زى «كراسة الحروف» — ألعاب القلعة جوّه الصفحة، والكابيتال والصغير
    // كل واحد ٣ على النقط + ٥ لوحده (آخر ٣ من غير النقطة الخضرا)، وفى الآخر شهادة الحرف
    const write = (glyph, level, reps, noStart = false) => { if (want("write")) steps.push({ kind: "write", glyph, level, reps, ...(noStart ? { noStart } : {}) }); };
    const pics = [...new Set([...pg.words, ...wordsStarting(pg.ch)])].filter((w) => !ABSTRACT.includes(w) && (pg.pos === "end" || w[0].toUpperCase() === pg.ch));
    const words = shuffled(rnd, pics).slice(0, 3).map((w) => ({ w, e: emojiOf(w) }));
    const game = (g) => {
      if (g === "phonics" && pg.pos === "end") return; // X: الصوت فى آخر الكلمة — «بتبدأ بإيه؟» مالهاش معنى
      if (want("game") || want(g)) steps.push({ kind: "game", game: g, ch: pg.ch, ...(g === "phonics" || g === "eggs" ? { words } : {}) });
    };
    if (want("letterMeet")) steps.push(meetStep(pg));
    write(pg.ch, 2, 3);
    game("puzzle");
    write(lo, 2, 3);
    if (want("firstSound")) steps.push({ kind: "firstSound", ch: pg.ch, label: pg.label || pg.ch, pos: pg.pos || "start", items: firstSound(pg, rnd, pg.words) });
    game("flash");
    if (want("popLetter")) {
      const others = pick(rnd, [...new Set(EB_LETTERS.concat(["B", "E", "G", "K", "L", "U", "W", "Y"]))].filter((c) => c !== pg.ch), 5);
      const cells = shuffled(rnd, [pg.ch, pg.ch, lo, lo, ...others.slice(0, 2), ...others.slice(2, 4).map((c) => c.toLowerCase())]);
      steps.push({ kind: "popLetter", ch: pg.ch, cells });
    }
    write(pg.ch, 3, 2);
    game("eggs");
    write(lo, 3, 2);
    game("phonics");
    // 🔗 وصّل الحرف بالصورة (المالك ٢٠٢٦-١٠-٢٦): حرف الصفحة + حروف النجمة — الشاشة بتبنى الجولة
    if (pg.pos !== "end" && want("connect")) steps.push({ kind: "connect", ch: pg.ch });
    if (want("find")) steps.push({ kind: "find", rounds: findRounds(pg.words, rnd) });
    game("catch");
    game("sequence");
    write(pg.ch, 3, 3, true);
    write(lo, 3, 3, true);
    game("review");
  } else if (pg.type === "story") {
    if (pg.opposites && want("opposites")) steps.push({ kind: "opposites", pair: pg.opposites });
    if (want("sentences")) steps.push({ kind: "sentences", lines: pg.lines });
    if (want("pickSentence")) {
      const rounds = shuffled(rnd, pg.lines).slice(0, 4).map((l) => ({ text: l.text, answer: l.e, options: shuffled(rnd, [l.e, ...pick(rnd, [...new Set(pg.lines.map((x) => x.e))], 2, [l.e])]) }));
      steps.push({ kind: "pickSentence", rounds });
    }
    if (pg.sort && want("sort")) steps.push({ kind: "sort", say: pg.sort.say, bins: pg.sort.bins, items: shuffled(rnd, pg.sort.items).map(([w, bin]) => ({ w, bin, say: pg.sentenceOf ? pg.sentenceOf(w, bin) : w })) });
    if (pg.grow && want("choose")) {
      steps.push({ kind: "choose", rounds: [{ q: "What do you want to be?", e: "🤔", options: pg.grow.map((w) => ({ label: w, e: EB_WORDS[w], say: `I want to be ${aOrAn(w)}.` })) }] });
    }
  } else if (pg.type === "cvc") {
    // CVC: كلمات بتتسجّع، وتركيب الكلمة حرف حرف، والحرف الناقص، والجمل المضحكة
    if (pg.rhymes && want("rhyme")) steps.push({ kind: "rhyme", pairs: shuffled(rnd, pg.rhymes).slice(0, 4) });
    if (pg.build && want("build")) steps.push({ kind: "build", rounds: shuffled(rnd, pg.build).slice(0, 4).map((w) => ({ w, tiles: shuffled(rnd, [...w]) })) });
    if (pg.missing && want("missing")) {
      steps.push({ kind: "missing", rounds: shuffled(rnd, pg.missing).slice(0, 4).map(([pattern, w, opts]) => ({ pattern, w, answer: w[pattern.indexOf("_")], options: shuffled(rnd, opts) })) });
    }
    if (pg.lines && want("sentences")) steps.push({ kind: "sentences", lines: pg.lines });
  } else if (pg.type === "sight") {
    if (want("sightMeet")) steps.push({ kind: "sightMeet", word: pg.word, e: pg.e });
    if (want("spell")) steps.push({ kind: "spell", word: pg.word });
    if (want("sentences")) steps.push({ kind: "sentences", lines: [{ text: pg.sentence, e: pg.e, hl: pg.word }] });
    if (want("findColor")) {
      const k = 4;
      const cells = shuffled(rnd, [...Array(k).fill(pg.word), ...pick(rnd, pg.others, 4).concat(pg.others).slice(0, 4)]);
      steps.push({ kind: "findColor", word: pg.word, cells });
    }
  } else if (pg.type === "review") {
    if (want("find")) steps.push({ kind: "find", rounds: findRounds(pg.words, rnd).slice(0, 4) });
    if (want("matchLetter")) {
      const pairs = pg.match ? pg.match.map(([ch, w]) => ({ ch, w })) : pg.letters.map((ch) => ({ ch: ch.toLowerCase(), w: pick(rnd, wordsStarting(ch), 1)[0] }));
      steps.push({ kind: "matchLetter", pairs: shuffled(rnd, pairs).slice(0, 4) });
    }
    if (want("firstSound")) {
      // حرف ليه صورتين واضحين على الأقل (U فيها umbrella بس — up/under مش صور)
      const clear = (ch) => wordsStarting(ch).filter((w) => !ABSTRACT.includes(w));
      const lp = letterPg(pick(rnd, pg.letters.filter((ch) => clear(ch).length >= 2), 1)[0]);
      steps.push({ kind: "firstSound", ch: lp.ch, label: lp.label || lp.ch, pos: lp.pos || "start", items: firstSound(lp, rnd, pick(rnd, clear(lp.ch), 2)) });
    }
    if (pg.countItems && want("count")) steps.push({ kind: "count", rounds: shuffled(rnd, pg.countItems) });
  }
  return steps;
}

/** خطوة كتابة؟ (✏️ فى شريط الخطوات) */
export const isEbWrite = (s) => s.kind === "write" || s.kind === "spell";
