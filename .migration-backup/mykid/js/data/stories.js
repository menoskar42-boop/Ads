// ===== قصص تفاعلية قصيرة =====
// كل قصة: { id, title, emoji, region, scenes:[{emoji, text}] }
// المشاهد تُعرض واحداً تلو الآخر وتُنطق عبر Speech الموجود.
export const STORIES = [
  {
    id: "lion-friend",
    title: "الأسد والصديق الصغير",
    emoji: "🦁",
    region: "animals",
    scenes: [
      { emoji: "🦁", bg: "forest", mood: "calm", text: "كان فيه أسد كبير وقلبه طيّب عايش في غابة خضرا حلوة." },
      { emoji: "🐭", art: "🦁", with: "🐭", bg: "forest", mood: "scared", text: "وفجأة... سمِع صوت صغيّر بيرتعش! فأر صغيّر خايف متخبّي تحت الشجرة." },
      { emoji: "🤝", art: "🦁", with: "🐭", bg: "forest", mood: "happy", text: "الأسد بصّ له وضحك وقال بحنان: متخفش يا صغيري، أنا صاحبك." },
      { emoji: "🧀", art: "🐭", with: "🧀", bg: "forest", mood: "happy", text: "الفأر فرِح وجاب له أحلى قطعة جبنة وقال: شكراً يا صاحبي!" },
      { emoji: "❤️", art: "🦁", with: "🐭", bg: "forest", mood: "wonder", text: "ومن اليوم ده، بقوا أحسن صاحبين في الغابة كلها." },
    ],
  },
  {
    id: "apple-tree",
    title: "شجرة التفاح الكريمة",
    emoji: "🍎",
    region: "fruits",
    scenes: [
      { emoji: "🌳", mood: "calm", text: "في المزرعة، كانت فيه شجرة تفاح كبيرة وكريمة أوي." },
      { emoji: "🍎", mood: "happy", text: "كانت بتدّي تفاحة حمرا لكل طفل جعان." },
      { emoji: "👧", mood: "happy", text: "سارة أكلت تفاحة، فبقت قويّة ومبسوطة." },
      { emoji: "🌱", mood: "calm", text: "وعشان ترد الجميل، زرعت البذور علشان تكبر أشجار جديدة." },
      { emoji: "🍏", mood: "wonder", text: "وبعد كام يوم... طلعت شجرة صغيّرة خضرا! يا سلام." },
    ],
  },
  {
    id: "count-stars",
    title: "النجوم الخمس",
    emoji: "⭐",
    region: "numbers",
    scenes: [
      { emoji: "🌙", mood: "calm", text: "في الليل الهادي، القمر بصّ للسما الواسعة." },
      { emoji: "⭐", mood: "wonder", text: "وفجأة... طلعت نجمة واحدة بتلمع بنور حلو." },
      { emoji: "✨", mood: "excited", text: "وبعدين طلعت نجمتين، وتلاتة، وأربعة... عدّوا معايا!" },
      { emoji: "🌟", mood: "wonder", text: "وأخيراً بقوا خمس نجمات بيلمعوا في السما." },
      { emoji: "😴", mood: "calm", text: "والأطفال ناموا بسلام وهمّ بيعدّوا النجوم الخمسة." },
    ],
  },
  {
    id: "brave-fish",
    title: "السمكة الشجاعة",
    emoji: "🐠",
    region: "fish",
    scenes: [
      { emoji: "🐠", mood: "calm", text: "في البحر الأزرق العميق، كانت عايشة سمكة صغيّرة ملوّنة." },
      { emoji: "🌊", mood: "excited", text: "قرّرت بشجاعة تكتشف البحر الكبير لوحدها... يا للمغامرة!" },
      { emoji: "🐙", mood: "happy", text: "في الطريق قابلت أخطبوط لطيف مدّ لها إيده يساعدها." },
      { emoji: "🐢", mood: "calm", text: "وعامت بهدوء مع سلحفاة حكيمة بطيئة بتحب التأمّل." },
      { emoji: "🏡", mood: "wonder", text: "وبعدين رجعت بيتها فخورة ومبسوطة بمغامرتها الحلوة." },
    ],
  },
  // ===== قصص القيم والسلوكيات =====
  {
    id: "cleanliness",
    title: "النظافة سرّ الصحّة",
    emoji: "🧼",
    region: "values",
    scenes: [
      { emoji: "🙋", mood: "happy", text: "سامي لعب في الجنينة طول النهار، وفرِح أوي!" },
      { emoji: "🖐️", mood: "calm", text: "بس... بصّوا! إيديه اتوسّخت من التراب من كتر اللعب." },
      { emoji: "🚰", mood: "happy", text: "فسامي راح بسرعة وغسل إيديه بالميّة والصابون." },
      { emoji: "✨", mood: "wonder", text: "فبقت إيديه نضيفة ولامعة زيّ المراية!" },
      { emoji: "😄", mood: "happy", text: "افتكروا: النضافة بتخلّينا أصحّاء ومبسوطين على طول." },
    ],
  },
  {
    id: "cooperation",
    title: "التعاون قوّة",
    emoji: "🤝",
    region: "values",
    scenes: [
      { emoji: "🧸", art: "🧒", bg: "room", props: ["toys"], mood: "calm", text: "بعد اللعب، لُعَب الأصحاب اتبعتروا في كل حتة في الأوضة." },
      { emoji: "😟", art: "🧒", bg: "room", props: ["toys"], mood: "sad", text: "واحد منهم زِهِق وقال: الترتيب لوحدي صعب أوي..." },
      { emoji: "🤝", art: "🧒", with: "👦", bg: "room", mood: "excited", text: "وجِت الفكرة! الأصحاب كلهم اتعاونوا مع بعض في الترتيب." },
      { emoji: "⏱️", art: "🧒", bg: "room", mood: "wonder", text: "وفي كام دقيقة... بقت الأوضة مرتّبة ولامعة!" },
      { emoji: "🎉", art: "🧒", with: "👦", bg: "room", mood: "happy", text: "بالتعاون بنخلّص أي حاجة بسرعة وفرح." },
    ],
  },
  {
    id: "help-mom",
    title: "مساعدة أمّي",
    emoji: "👩",
    region: "values",
    scenes: [
      { emoji: "👩", art: "👩", bg: "room", props: ["pot"], mood: "sad", text: "كانت ماما ليلى تعبانة وهي بتجهّز الأكل على البوتاجاز." },
      { emoji: "🤔", art: "👧", bg: "room", mood: "calm", text: "فليلى وقفت تفكّر: أساعد ماما الحبيبة إزاي؟" },
      { emoji: "🍽️", art: "👧", bg: "room", props: ["table-plates"], mood: "happy", text: "وبكل حب، رصّت الأطباق على الترابيزة بنفسها." },
      { emoji: "🥰", art: "👩", with: "👧", bg: "room", mood: "happy", text: "فماما ابتسمت ابتسامة كبيرة وحضنت ليلى." },
      { emoji: "❤️", art: "👩", with: "👧", bg: "room", mood: "wonder", text: "فمساعدة الأهل بتملا البيت حب ودفا." },
    ],
  },
  {
    id: "honesty",
    title: "الصدق أمانة",
    emoji: "🌟",
    region: "values",
    scenes: [
      { emoji: "🍪", mood: "happy", text: "عمر شاف قطعة الحلوى الحلوة... فأكلها بسرعة من غير ما ياخد إذن." },
      { emoji: "😳", mood: "scared", text: "وبعدين جِت ماما وسألت: مين أكل الحلوى يا ترى؟" },
      { emoji: "🗣️", mood: "calm", text: "عمر بلع ريقه، وقال بصدق وشجاعة: أنا اللي أكلتها... أنا آسف." },
      { emoji: "🤗", mood: "happy", text: "فماما فرِحت بصدقه أكتر من الحلوى، وحضنته بحب." },
      { emoji: "🌟", mood: "wonder", text: "افتكر دايماً: الصادق بيحبّه كل الناس." },
    ],
  },
  {
    id: "sharing",
    title: "المشاركة جميلة",
    emoji: "🎁",
    region: "values",
    scenes: [
      { emoji: "🍎", art: "👧", with: "🍎", bg: "meadow", mood: "happy", text: "كان مع نور تفاحتين حُمر لذاذ." },
      { emoji: "👦", art: "👧", with: "👦", bg: "meadow", mood: "sad", text: "بس شافت صاحبها قاعد جعان من غير أكل..." },
      { emoji: "🤲", art: "👧", with: "👦", bg: "meadow", mood: "happy", text: "ففكّرت نور شوية... وبعدين دّت له تفاحة وقاسمته." },
      { emoji: "😊", art: "👧", with: "👦", bg: "meadow", mood: "happy", text: "فأكلوا مع بعض وضحكوا بسعادة كبيرة." },
      { emoji: "💛", mood: "wonder", text: "وكده... المشاركة بتعمل أحلى الصداقات." },
    ],
  },
  {
    id: "little-bird",
    title: "العصفور الذي تعلّم الطيران",
    emoji: "🐦",
    region: "birds",
    scenes: [
      { emoji: "🪹", mood: "sad", text: "في عش صغيّر عالي، عاش عصفور صغيّر خايف من الطيران." },
      { emoji: "🐦", mood: "calm", text: "ربتت على كتفه أمه وقالت: حرّك جناحيك بهدوء يا صغيري." },
      { emoji: "🌬️", mood: "excited", text: "العصفور رفرف... شوية شوية... وبعدين أقوى وأقوى!" },
      { emoji: "🕊️", mood: "wonder", text: "وفجأة طار عالي فوق الشجر! هو بيطير بجد!" },
      { emoji: "🌈", mood: "happy", text: "وبقى أسعد عصفور بيلعب ويطير في السما الواسعة." },
    ],
  },
  {
    id: "rainbow-colors",
    title: "قوس قزح الجميل",
    emoji: "🌈",
    region: "colors",
    scenes: [
      { emoji: "🌧️", mood: "calm", text: "بعد المطر، الشمس طلّت من ورا الغيوم وهي بتبتسم." },
      { emoji: "🔴", mood: "wonder", text: "وفي السما... طلع الأحمر، وبعدين البرتقاني والأصفر!" },
      { emoji: "🟢", mood: "excited", text: "وجِه الأخضر والأزرق بيلوّنوا السما بفرح." },
      { emoji: "🟣", mood: "wonder", text: "وكمّل البنفسجي قوس قزح في منتهى الجمال." },
      { emoji: "😍", mood: "happy", text: "فالأطفال فرحوا بكل الألوان الحلوة دي." },
    ],
  },
  {
    id: "family-love",
    title: "عائلتي الحبيبة",
    emoji: "👨‍👩‍👧‍👦",
    region: "family",
    scenes: [
      { emoji: "🏡", mood: "calm", text: "في بيت دافي صغيّر، عايشة عيلة مبسوطة ومتحابّة." },
      { emoji: "👨", mood: "happy", text: "بابا بيروح شغله، ويرجع بالليل بابتسامة كبيرة." },
      { emoji: "👩", mood: "happy", text: "وماما بتطبخ الأكل اللذيذ وتقرا لنا أحلى القصص." },
      { emoji: "🧒", mood: "happy", text: "والأطفال بيلعبوا مع بعض ويساعدوا بفرح ونشاط." },
      { emoji: "❤️", mood: "wonder", text: "فالعيلة كنز غالي بنحبّه ونحافظ عليه." },
    ],
  },
  {
    id: "kind-doctor",
    title: "الطبيب الطيّب",
    emoji: "👩‍⚕️",
    region: "jobs",
    scenes: [
      { emoji: "🤒", art: "🐰", bg: "room", mood: "sad", text: "الأرنب الصغيّر جاله برد ورشح... فبقى زعلان." },
      { emoji: "👩‍⚕️", bg: "clinic", with: "🐰", mood: "calm", text: "فراح للدكتورة الطيّبة في عيادتها النضيفة." },
      { emoji: "🩺", art: "👩‍⚕️", bg: "clinic", with: "🐰", mood: "calm", text: "كشفت عليه بلطف وحنان، وادّته دوا طعمه حلو." },
      { emoji: "🥕", art: "👩‍⚕️", bg: "clinic", with: "🐰", mood: "happy", text: "وقالت بابتسامة: كُل كويس ونام بدري يا صغيري." },
      { emoji: "😄", art: "🐰", bg: "meadow", mood: "happy", text: "وبعد يومين... الأرنب خِفّ خالص ورجع ينطّ ويلعب!" },
    ],
  },
  {
    id: "little-car",
    title: "السيّارة الصغيرة المجتهدة",
    emoji: "🚗",
    region: "transport",
    scenes: [
      { emoji: "🚗", mood: "happy", text: "كانت فيه عربية حمرا صغيّرة مليانة نشاط." },
      { emoji: "⛰️", mood: "calm", text: "وقدّامها تل عالي أوي... يا ترى تقدر تطلعه؟" },
      { emoji: "💨", mood: "excited", text: "حاولت... ودفعت نفسها بكل قوّتها... يلا! يلا!" },
      { emoji: "🎉", mood: "wonder", text: "وأخيراً... وصلت للقمّة بنجاح! يا للفرحة!" },
      { emoji: "🌟", mood: "happy", text: "واتعلّمنا منها: اللي بيتعب بيوصل، وما بنستسلمش أبداً." },
    ],
  },
  {
    id: "sun-and-rain",
    title: "الشمس والمطر",
    emoji: "🌦️",
    region: "weather",
    scenes: [
      { emoji: "☀️", mood: "happy", text: "الصبح، الشمس الدافية طلعت بتحيّي الدنيا." },
      { emoji: "☁️", mood: "calm", text: "وبعدين جِت غيمة بيضا صغيّرة بتتمشّى في السما." },
      { emoji: "🌧️", mood: "excited", text: "وفجأة... المطر نزل بيرقص، فسقى الورد والشجر!" },
      { emoji: "🌈", mood: "wonder", text: "وبعد المطر، طلّ قوس قزح في منتهى الجمال." },
      { emoji: "🌻", mood: "happy", text: "فالأرض فرحت بالشمس والمطر مع بعض." },
    ],
  },
];

export function getStory(id) {
  return STORIES.find((s) => s.id === id);
}
export function storiesForRegion(region) {
  return STORIES.filter((s) => s.region === region);
}
