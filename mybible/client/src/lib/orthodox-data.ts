export interface AgpeyaHour {
  id: string;
  name: string;
  arabicTime: string;
  description: string;
  psalms: string;
  url: string;
}

export interface LiturgyBook {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  pdfUrl?: string;
}

export interface HymnCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
}

export interface SaintVideo {
  id: string;
  youtubeId: string;
  title: string;
  description: string;
  category: string;
}

// ── الأجبية — روابط الكتاب الكامل ───────────────────────────────────────────
export interface AgpeyaBook {
  id: string;
  title: string;
  description: string;
  lang: string;
  url: string;
  type: 'pdf' | 'site';
}

export const agpeyaBooks: AgpeyaBook[] = [
  {
    id: 'agpeya-three-lang',
    title: 'الأجبية — عربي / قبطي / إنجليزي',
    description: 'كتاب الأجبية الكامل بثلاث لغات — للإيبوذياكون باسم سليمان — مشروع الكنوز القبطية.',
    lang: 'عربي + قبطي + إنجليزي',
    url: 'https://coptic-treasures.com/book/%D8%A7%D9%84%D8%A3%D8%AC%D8%A8%D9%8A%D8%A9-%D8%B9%D8%B1%D8%A8%D9%8A-%D8%A7%D9%86%D8%AC%D9%84%D9%8A%D8%B2%D9%8A-%D9%82%D8%A8%D8%B7%D9%8A-%D8%A5%D9%8A%D8%A8%D9%88%D8%B0%D9%8A%D8%A7%D9%83%D9%88/',
    type: 'pdf',
  },
  {
    id: 'agpeya-ar-coptic',
    title: 'الأجبية — عربي / قبطي',
    description: 'نسخة الأجبية باللغتين العربية والقبطية من المكتبة القبطية الأرثوذكسية.',
    lang: 'عربي + قبطي',
    url: 'https://copticbook.wordpress.com/liturgical-books/',
    type: 'pdf',
  },
  {
    id: 'agpeya-site',
    title: 'الأجبية — موقع agpeya.org',
    description: 'اقرأ الأجبية كاملةً أونلاين بالقبطية والعربية والإنجليزية — مع ساعات الصلاة السبع.',
    lang: 'عربي + قبطي + إنجليزي',
    url: 'https://agpeya.org',
    type: 'site',
  },
  {
    id: 'agpeya-takla',
    title: 'الأجبية — موقع الأنبا تكلا',
    description: 'الأجبية كاملةً بالعربية على موقع الأنبا تكلاهيمانوت مع شرح كل ساعة.',
    lang: 'عربي',
    url: 'https://st-takla.org/Liturgy-Taksa-و-Ekhologion/Agpia-Agpeya-arabic-coptic-liturgical-book/Agpia-000-index.html',
    type: 'site',
  },
];

// ── الأجبية — ساعات الصلاة السبع ────────────────────────────────────────────
export const agpeyaHours: AgpeyaHour[] = [
  {
    id: 'prime',
    name: 'صلاة باكر',
    arabicTime: 'الساعة 6 صباحاً',
    description: 'أولى ساعات الصلاة، تُذكّر بقيامة المسيح ونور اليوم الجديد. نبدأ بها يومنا مع الرب.',
    psalms: 'مزمور 63، 51، 150',
    url: 'https://agpeya.org/prime',
  },
  {
    id: 'terce',
    name: 'صلاة الساعة الثالثة',
    arabicTime: 'الساعة 9 صباحاً',
    description: 'تُحيي ذكرى نزول الروح القدس على الرسل في العليّة يوم الخمسين.',
    psalms: 'مزمور 19، 22، 150',
    url: 'https://agpeya.org/terce',
  },
  {
    id: 'sext',
    name: 'صلاة الساعة السادسة',
    arabicTime: 'الساعة 12 ظهراً',
    description: 'تُذكّر بصلب السيد المسيح في الساعة السادسة، وظلمة نصف النهار.',
    psalms: 'مزمور 55، 56، 57',
    url: 'https://agpeya.org/sext',
  },
  {
    id: 'none',
    name: 'صلاة الساعة التاسعة',
    arabicTime: 'الساعة 3 مساءً',
    description: 'تُحيي ذكرى وفاة السيد المسيح على الصليب وتسليمه الروح للآب.',
    psalms: 'مزمور 66، 116، 117',
    url: 'https://agpeya.org/none',
  },
  {
    id: 'vespers',
    name: 'صلاة الغروب',
    arabicTime: 'عند الغروب',
    description: 'تُذكّر بنزول السيد المسيح من الصليب ودفنه، وتشكر الله على نعم اليوم.',
    psalms: 'مزمور 104، 116، 128',
    url: 'https://agpeya.org/vespers',
  },
  {
    id: 'compline',
    name: 'صلاة النوم',
    arabicTime: 'قبل النوم',
    description: 'نختم بها يومنا ونُودع أنفسنا في حضن الله قبل النوم.',
    psalms: 'مزمور 4، 6، 12',
    url: 'https://agpeya.org/compline',
  },
  {
    id: 'midnight',
    name: 'صلاة نصف الليل',
    arabicTime: 'منتصف الليل',
    description: 'تُذكّر بمجيء العريس في نصف الليل، وتنتظر قيامة المسيح الأولى.',
    psalms: 'مزمور 119، 133، 134',
    url: 'https://agpeya.org/midnight',
  },
];

// ── الخولاجي والقداسات ────────────────────────────────────────────────────────
export const liturgyBooks: LiturgyBook[] = [
  {
    id: 'basil',
    name: 'قداس القديس باسيليوس',
    description: 'أكثر القداسات شيوعاً في الكنيسة القبطية الأرثوذكسية، يُقام في معظم أيام الأسبوع والأحد والأعياد. وضعه القديس باسيليوس الكبير.',
    icon: '✝️',
    url: 'https://st-takla.org/Lyrics-Spiritual-Songs/Words-of-Coptic-Alhan-Tasbeha-Kodas/Arabic-Coptic-Liturgy-Lyrics/Arab-Copts-Mass-Book-002-index-El-Kodas-El-Basily.html',
    pdfUrl: 'https://copticbook.wordpress.com/liturgical-books/',
  },
  {
    id: 'gregory',
    name: 'قداس القديس غريغوريوس',
    description: 'يُقام في الأعياد السيدية الكبرى السبعة: الميلاد، الغطاس، الشعانين، التجلّي، القيامة، الصعود، والعنصرة. وضعه القديس غريغوريوس الناطق بالإلهيات.',
    icon: '🕊️',
    url: 'https://st-takla.org/Lyrics-Spiritual-Songs/Words-of-Coptic-Alhan-Tasbeha-Kodas/Arabic-Coptic-Liturgy-Lyrics/Arab-Copts-Mass-Book-003-index-Al-Koddas-Al-Ghreghory.html',
    pdfUrl: 'https://copticbook.wordpress.com/liturgical-books/',
  },
  {
    id: 'cyril',
    name: 'قداس القديس كيرلس (المرقسي)',
    description: 'أقدم القداسات القبطية، يُقام في أيام الصوم الكبير المقدس. وضعه مار مرقس الرسول وأضاف إليه القديس كيرلس تعديلات. يتميز بمسحة نسكية خشوعية.',
    icon: '📖',
    url: 'https://st-takla.org/Lyrics-Spiritual-Songs/Words-of-Coptic-Alhan-Tasbeha-Kodas/Arabic-Coptic-Liturgy-Lyrics/Arab-Copts-Mass-Book-000-index.html',
    pdfUrl: 'https://copticbook.wordpress.com/liturgical-books/',
  },
  {
    id: 'kholagy-full',
    name: 'الخولاجي الكامل — موقع الأنبا تكلا',
    description: 'نصوص الثلاثة القداسات كاملةً مع خدمة الشماس والألحان باللغتين العربية والقبطية.',
    icon: '🏛️',
    url: 'https://st-takla.org/Lyrics-Spiritual-Songs/Words-of-Coptic-Alhan-Tasbeha-Kodas/Arabic-Coptic-Liturgy-Lyrics/Arab-Copts-Mass-Book-000-index.html',
    pdfUrl: 'https://archive.org/details/The4HolyLiturgiesOfTheOrthodoxChurchCoptic',
  },
];

// ── كتب الألحان القبطية ──────────────────────────────────────────────────────
export interface HymnBook {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  source: string;
}

export const hymnBooks: HymnBook[] = [
  {
    id: 'ibsalmodia-annual',
    name: 'الإبصلمودية السنوية',
    description: 'كتاب التسبحة اليومية الكاملة التي تُتلى عشية ونصف الليل وباكر كل يوم — بالعربي والقبطي.',
    icon: '📖',
    url: 'https://copticbook.wordpress.com/liturgical-books/',
    source: 'المكتبة القبطية الأرثوذكسية',
  },
  {
    id: 'ibsalmodia-kiahk',
    name: 'الإبصلمودية الكيهكية',
    description: 'ألحان تسبحة شهر كيهك المقدس وقطعه ومدائحه وذكصولوجياته — خاصة باستقبال ميلاد الرب.',
    icon: '⭐',
    url: 'https://st-takla.org/Lyrics-Spiritual-Songs/Words-of-Coptic-Alhan-Tasbeha-Kodas/Arabic-Coptic-04-Epsalmodia-Tasbeha/Arab-Copts-Tasbeha-Ebsalmodya-Book-000-index.html',
    source: 'موقع الأنبا تكلا',
  },
  {
    id: 'tasbeha-full',
    name: 'تسبحة نصف الليل — الهوسات والإبصاليات',
    description: 'كلمات تسبحة نصف الليل كاملةً: الهوسات والإبصاليات والذكصولوجيات مرتبة بالتفصيل لكل أيام الأسبوع.',
    icon: '🌙',
    url: 'https://st-takla.org/Lyrics-Spiritual-Songs/Words-of-Coptic-Alhan-Tasbeha-Kodas/Arabic-Coptic-04-Epsalmodia-Tasbeha/Arab-Copts-Tasbeha-Ebsalmodya-Book-000-index.html',
    source: 'موقع الأنبا تكلا',
  },
  {
    id: 'copticwave-hymns',
    name: 'معهد الألحان القبطية',
    description: 'موقع الموجة القبطية — معهد الألحان القبطية الكاملة مع النطق والشرح الطقسي.',
    icon: '🎼',
    url: 'https://copticwave.org/alhan/index.htm',
    source: 'copticwave.org',
  },
  {
    id: 'tasbeha-org-lib',
    name: 'مكتبة tasbeha.org',
    description: 'المكتبة الصوتية والنصية لألحان القداس والتسبحة وجميع المناسبات الطقسية القبطية.',
    icon: '🎵',
    url: 'https://tasbeha.org',
    source: 'tasbeha.org',
  },
  {
    id: 'coptic-treasures-hymns',
    name: 'الكنوز القبطية — كتب الألحان',
    description: 'مشروع الكنوز القبطية — مكتبة إلكترونية شاملة لكتب الألحان والعظات والكتب الطقسية.',
    icon: '💎',
    url: 'https://coptic-treasures.com',
    source: 'coptic-treasures.com',
  },
];

// ── ألحان قبطية — تصنيفات ────────────────────────────────────────────────────
export const hymnCategories: HymnCategory[] = [
  {
    id: 'tasbeha',
    name: 'التسبحة المقدسة',
    description: 'ألحان تسبحة منتصف الليل وصلاة باكر الليلية.',
    icon: '🎵',
    url: 'https://tasbeha.org',
  },
  {
    id: 'kiahk',
    name: 'ألحان شهر كيهك',
    description: 'ألحان شهر كيهك المقدس والتسابيح الخاصة بميلاد السيد المسيح.',
    icon: '⭐',
    url: 'https://tasbeha.org',
  },
  {
    id: 'passion',
    name: 'ألحان أسبوع الآلام',
    description: 'ألحان أسبوع البصخة المقدسة وخدمات الجمعة العظيمة.',
    icon: '✝️',
    url: 'https://tasbeha.org',
  },
  {
    id: 'resurrection',
    name: 'ألحان القيامة',
    description: 'ألحان عيد القيامة المجيدة وخماسيات الفرح.',
    icon: '🌅',
    url: 'https://tasbeha.org',
  },
  {
    id: 'liturgy-hymns',
    name: 'ألحان القداس',
    description: 'ألحان وتروس القداس الإلهي وخدمات الكنيسة اليومية.',
    icon: '🕊️',
    url: 'https://tasbeha.org',
  },
  {
    id: 'coptichymns',
    name: 'ألحان قبطية متنوعة',
    description: 'مجموعة واسعة من الألحان القبطية المقدسة لجميع المناسبات.',
    icon: '🎶',
    url: 'http://www.coptichymnsinenglish.com',
  },
];

// ── فيديوهات سير القديسين والشهداء ───────────────────────────────────────────
export const saintsVideos: SaintVideo[] = [
  {
    id: 'mark-apostle',
    youtubeId: 'PXXY9kSHiNY',
    title: 'سيرة القديس مارمرقس الرسول — كاروز الديار المصرية',
    description: 'قصة حياة القديس مارمرقس الرسول، أول بابا للإسكندرية ومؤسس الكنيسة القبطية، بأسلوب كرتوني ممتع بالعربية.',
    category: 'رسل',
  },
  {
    id: 'mina-wonder',
    youtubeId: 'eojiLDROk4o',
    title: 'سيرة القديس مارمينا العجائبي',
    description: 'قصة حياة القديس مينا الجندي المصري الذي ترك الجيش الروماني وآثر الاستشهاد على إنكار إيمانه بالمسيح.',
    category: 'شهداء',
  },
  {
    id: 'bishoy-great',
    youtubeId: 'doIPHQfX4w4',
    title: 'سيرة القديس الأنبا بيشوي — الرجل الكامل حبيب المخلص',
    description: 'قصة حياة القديس الأنبا بيشوي، أعظم نساك وادي النطرون والراهب الذي أُكرم بحضن المسيح الشخصي له.',
    category: 'رهبان',
  },
  {
    id: 'makarios-great',
    youtubeId: 'kD7thEK_ors',
    title: 'سيرة القديس الأنبا مقار الكبير',
    description: 'قصة حياة القديس الأنبا مقار الكبير، أبو البراري وأحد أعمدة الرهبنة القبطية في وادي النطرون.',
    category: 'رهبان',
  },
  {
    id: 'dimiana-martyr',
    youtubeId: 'BNQmw86rgPI',
    title: 'سيرة القديسة دميانة الشهيدة',
    description: 'قصة حياة القديسة دميانة بنت المرزبان مركوريوس، التي رفضت الزواج وكرّست حياتها لله حتى نالت إكليل الاستشهاد.',
    category: 'شهيدات',
  },
  {
    id: 'anthony-monks',
    youtubeId: 'RnK_w9VYZI0',
    title: 'سيرة القديس الأنبا أنطونيوس أبو الرهبان',
    description: 'قصة حياة القديس أنطونيوس الكبير مؤسس الرهبنة المسيحية، الذي تنازل عن كل ثروته وعاش في البرية مجاهداً.',
    category: 'رهبان',
  },
  {
    id: 'karas-monk',
    youtubeId: 'feXcTHa_BUw',
    title: 'سيرة القديس الأنبا كاراس السائح',
    description: 'قصة حياة القديس أنبا كاراس الراهب السائح، الذي عاش 57 سنة في البرية المصرية دون أن يرى وجه إنسان.',
    category: 'رهبان',
  },
  {
    id: 'abanoub-child',
    youtubeId: 'Bds1DgsPXq0',
    title: 'سيرة الشهيد أبانوب الطفل القبطي',
    description: 'قصة الطفل الشهيد أبانوب النهيسي (12 سنة) الذي استشهد في عهد دقلديانوس رافضاً إنكار المسيح — بأسلوب كرتوني.',
    category: 'شهداء',
  },
  {
    id: 'cyril-vi',
    youtubeId: '48GlOckNjRg',
    title: 'سيرة البابا كيرلس السادس — البطريرك الـ116',
    description: 'قصة حياة قداسة البابا كيرلس السادس، بابا الإسكندرية، الراهب الناسك الذي عاش في طاحونة هواء قبل توليه الكرسي البابوي.',
    category: 'آباء',
  },
  {
    id: 'habib-salib',
    youtubeId: '5n0wKsWy9g4',
    title: 'حبيب الصليب — سيرة الشهيد القبطي الحديث',
    description: 'قصة حياة ومعجزات الشهيد حبيب الصليب، الشهيد القبطي الذي لقب بـ"حبيب الصليب" نظراً لمحبته الشديدة للمسيح.',
    category: 'شهداء',
  },
  {
    id: 'martyrs21-story',
    youtubeId: 'm9eSaKOUqRk',
    title: 'قصة شهداء ليبيا الـ21 — شهداء الكنيسة والوطن',
    description: 'قصة شهداء ليبيا الـ21 كما يرويها شاهد عيان قبطي — الشباب المصري الذي فضّل الموت على إنكار المسيح عام 2015.',
    category: 'شهداء',
  },
  {
    id: 'martyrs21-film',
    youtubeId: 'Z3F-yaet8fA',
    title: 'قصة شهداء ليبيا الـ21 كما لم تُروَ من قبل',
    description: 'رواية سينمائية مؤثرة بالذكاء الاصطناعي لقصة الشهداء الأقباط الـ21 في ليبيا — رحلة إيمان هزّت العالم.',
    category: 'شهداء',
  },
  // ── أفلام درامية تمثيلية — إنتاج الكنيسة القبطية الأرثوذكسية ─────────────
  {
    id: 'samaan-tanner-hd',
    youtubeId: 'G3rymeKazFo',
    title: 'فيلم القديس سمعان الخراز — إنتاج دير سمعان HD',
    description: 'فيلم درامي تمثيلي ضخم بجودة عالية عن سيرة القديس سمعان الخراز الذي أجرى معجزة تحريك جبل المقطم بإيمانه — إنتاج دير القديس سمعان الخراز بالقاهرة.',
    category: 'أفلام درامية',
  },
  {
    id: 'jowa-eltahona',
    youtubeId: 'ovjC06uo-gQ',
    title: 'فيلم جوة الطاحونة — سيرة البابا كيرلس السادس',
    description: 'فيلم درامي تمثيلي كامل عن حياة قداسة البابا كيرلس السادس منذ شبابه الناسك في طاحونة الهواء حتى توليه كرسي البابوية — إنتاج كنسي قبطي.',
    category: 'أفلام درامية',
  },
  {
    id: 'saken-elkobar',
    youtubeId: 'R38a7y4ARSM',
    title: 'فيلم ساكن القبور — القديس يعقوب المجاهد',
    description: 'فيلم درامي تمثيلي مؤثر عن سيرة القديس يعقوب المجاهد الناسك الذي اختار السكن بين القبور رياضةً روحية — إنتاج قبطي أرثوذكسي.',
    category: 'أفلام درامية',
  },
  {
    id: 'abo-tarha-film',
    youtubeId: 's_7qI5ROT-M',
    title: 'فيلم الأنبا صرابامون أبو طرحة',
    description: 'الفيلم الكلاسيكي الشهير عن سيرة القديس الأنبا صرابامون أبو طرحة — من أبرز الأفلام الدرامية التمثيلية في تاريخ السينما الدينية القبطية.',
    category: 'أفلام درامية',
  },
  {
    id: 'petros-elaabed',
    youtubeId: 'Ar0G0GT5tFM',
    title: 'فيلم القديس بطرس العابد',
    description: 'عمل درامي تمثيلي تاريخي متميز عن سيرة القديس بطرس العابد — فيلم قبطي كنسي يجسّد حياة القديس بأسلوب سينمائي راقٍ.',
    category: 'أفلام درامية',
  },
  {
    id: 'filotathos-film',
    youtubeId: '7Gi8ZzKAEV0',
    title: 'فيلم القديس الشهيد فيلوتاؤوس — إنتاج ميديا سات',
    description: 'فيلم درامي تمثيلي عن سيرة القديس الشهيد فيلوتاؤوس — من إنتاج شركة ميديا سات المتخصصة في الأفلام القبطية الدرامية.',
    category: 'أفلام درامية',
  },
  {
    id: 'onisimos-film',
    youtubeId: 'n39zpM_ekeg',
    title: 'فيلم القديس الشهيد أنسيموس — إنتاج ميديا سات',
    description: 'فيلم درامي تمثيلي عن سيرة القديس الشهيد أنسيموس — إنتاج شركة ميديا سات المتخصصة في الأفلام الكنسية القبطية.',
    category: 'أفلام درامية',
  },
  {
    id: 'hermina-film',
    youtubeId: 'toTZZFhd7sI',
    title: 'فيلم القديس الأنبا هرمينا السائح — إنتاج ميديا سات',
    description: 'فيلم درامي تمثيلي عن سيرة القديس الأنبا هرمينا السائح الناسك — إنتاج ميديا سات بجودة عالية للكنيسة القبطية الأرثوذكسية.',
    category: 'أفلام درامية',
  },
  {
    id: 'mary-egyptian-film',
    youtubeId: 'EsBMwC64aHc',
    title: 'فيلم القديسة البارة مريم المصرية السائحة — قناة هللويا',
    description: 'فيلم درامي تمثيلي كامل عن سيرة القديسة التائبة مريم المصرية والقديس الأنبا زوسيما — إنتاج قبطي أرثوذكسي من قناة Alleluia.',
    category: 'أفلام درامية',
  },
  {
    id: 'athanasius-syriac-film',
    youtubeId: 'ItwBw1Bu6-o',
    title: 'فيلم الراهب الساهر القمص أثناسيوس السرياني — قناة هللويا',
    description: 'فيلم درامي تمثيلي عن سيرة الراهب الناسك القمص أثناسيوس السرياني — من إنتاج قناة Alleluia الكنسية القبطية.',
    category: 'أفلام درامية',
  },
  {
    id: 'samaan-akhmimy-film',
    youtubeId: 'IZJpL9Pt0Ks',
    title: 'فيلم شفيع المتألمين — القديس سمعان الاخميمي',
    description: 'فيلم درامي تمثيلي مؤثر عن سيرة القديس سمعان الاخميمي شفيع المتألمين — عمل كنسي قبطي يصوّر حياة القديس بأسلوب سينمائي.',
    category: 'أفلام درامية',
  },
];

export const videoCategories = ['أفلام درامية', 'شهداء', 'رسل', 'شهيدات', 'آباء', 'رهبان'];

// ── روابط القطمارس ────────────────────────────────────────────────────────────
export interface KatamerosLink {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  lang: string;
  featured?: boolean;
}

export const katamerosLinks: KatamerosLink[] = [
  {
    id: 'katameros-app',
    name: 'katameros.app',
    description: 'القطمارس القبطي الكامل — قراءات اليوم بـ 8 لغات منها العربية مع التقويم القبطي.',
    icon: '📅',
    url: 'https://katameros.app',
    lang: 'عربي + 7 لغات',
    featured: true,
  },
  {
    id: 'takla-readings',
    name: 'موقع الأنبا تكلا — القراءات اليومية',
    description: 'القراءات اليومية حسب التقويم القبطي مع السنكسار والإنجيل والرسائل والمزامير.',
    icon: '📖',
    url: 'https://st-takla.org/zJ/index.php/ar-readings-katamares',
    lang: 'عربي + إنجليزي',
  },
  {
    id: 'ava-bishoy-katameros',
    name: 'كنيسة الأنبا بيشوي — القطمارس',
    description: 'القطمارس السنوي الكامل من موقع كنيسة الأنبا بيشوي.',
    icon: '⛪',
    url: 'https://katamars.avabishoy.com/',
    lang: 'عربي',
  },
  {
    id: 'orsozox-katameros',
    name: 'المكتبة القبطية OrSoZoX',
    description: 'المكتبة القبطية الأرثوذكسية الشاملة — القطمارس والقراءات اليومية.',
    icon: '📚',
    url: 'https://orsozox.com/%D8%A7%D9%84%D9%82%D8%B7%D9%85%D8%A7%D8%B1%D8%B3-%D9%88-%D8%A7%D9%84%D9%82%D8%B1%D8%A7%D8%A1%D8%A7%D8%AA-%D8%A7%D9%84%D9%8A%D9%88%D9%85%D9%8A%D8%A9/',
    lang: 'عربي',
  },
  {
    id: 'ayakolyoum-katameros',
    name: 'آية كل يوم — قراءات القطمارس',
    description: 'قراءات القطمارس اليومية مع صلوات وشروحات روحية وخرائط وأقسام كاملة.',
    icon: '🌅',
    url: 'https://ayakolyoum.com/katamaros',
    lang: 'عربي',
  },
  {
    id: 'katameros-bible',
    name: 'دراسات في القراءات — katameros.bible',
    description: 'دراسات معمّقة في قراءات القطمارس اليومية مع مختارات من عظات آباء الكنيسة.',
    icon: '✝️',
    url: 'https://new.katameros.bible/readings/',
    lang: 'إنجليزي',
  },
];

// ── مواقع سير القديسين والشهداء الأقباط ──────────────────────────────────────
export interface MartyrsResource {
  id: string;
  name: string;
  description: string;
  icon: string;
  url: string;
  highlight: string;
}

export const martyrsResources: MartyrsResource[] = [
  {
    id: 'takla-saints',
    name: 'قاموس القديسين — موقع الأنبا تكلا',
    description: 'أشمل مرجع عربي لسير القديسين والشهداء الأقباط — مرتبون أبجدياً مع صور وشرح مفصّل.',
    icon: '📖',
    url: 'https://st-takla.org/Saints/Coptic-Saint-Hagiography-Kediseen-00-index.html',
    highlight: 'آلاف القديسين مرتبين أبجدياً',
  },
  {
    id: 'coptic-treasures-saints',
    name: 'مشروع الكنوز القبطية',
    description: 'مكتبة رقمية ضخمة تحتوي على كتب سير القديسين والشهداء وعظات آباء الكنيسة.',
    icon: '💎',
    url: 'https://coptic-treasures.com',
    highlight: 'كتب وعظات وصوتيات',
  },
  {
    id: 'copticwave-history',
    name: 'موقع الموجة القبطية — التاريخ',
    description: 'تاريخ الكنيسة القبطية وسير قديسيها وشهدائها مع شرح معمّق للطقوس والتقاليد.',
    icon: '🌊',
    url: 'https://copticwave.org/history/index.htm',
    highlight: 'تاريخ الكنيسة والقديسين',
  },
  {
    id: 'martyrs21-memorial',
    name: 'شهداء ليبيا الـ21 — ذكرى الاستشهاد',
    description: 'الشهداء الأقباط الواحد والعشرون الذين استُشهدوا في ليبيا عام 2015 — مُدرَجون في السنكسار القبطي.',
    icon: '✝️',
    url: 'https://st-takla.org/Saints/Coptic-Orthodox-Saints-Biography/Coptic-Saints-Story_2160.html',
    highlight: 'مُدرَجون رسمياً في السنكسار',
  },
  {
    id: 'orsozox-saints',
    name: 'المكتبة القبطية OrSoZoX — سير القديسين',
    description: 'المكتبة الشاملة للكنيسة القبطية الأرثوذكسية — قسم سير القديسين والشهداء والآباء.',
    icon: '🏛️',
    url: 'https://orsozox.com',
    highlight: 'مكتبة شاملة متعددة الأقسام',
  },
];

// ── مردات الشماس ───────────────────────────────────────────────────────────────
export interface DeaconResponse {
  arabic: string;
  copticArabic?: string;
  coptic?: string;
  meaning: string;
  usage: string;
}

export interface DeaconSection {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  responses: DeaconResponse[];
}

// ── تفاسير الكتاب المقدس ──────────────────────────────────────────────────────
export interface BibleCommentaryBook {
  title: string;
  url: string;
  category?: string;
}

export interface BibleCommentator {
  id: string;
  name: string;
  title: string;
  icon: string;
  description: string;
  booksNote?: string;
  coverage: string;
  collectionUrl: string;
  source: string;
  color: string;
  books?: BibleCommentaryBook[];
}

export const bibleCommentators: BibleCommentator[] = [
  {
    id: 'tadros-malaty',
    name: 'القمص تادرس يعقوب ملطي',
    title: 'رئيس دير مارجرجس — المحلة الكبرى',
    icon: '📖',
    description: 'أكثر مفسري الكتاب المقدس في الكنيسة القبطية خصوبةً وعمقاً. كتب تفاسير مطولة لمعظم أسفار العهد القديم والجديد تجمع بين الروحانية والعلم اللاهوتي. جميع تفاسيره متاحة مجاناً على الإنترنت.',
    booksNote: '70+ كتاباً وتفسيراً',
    coverage: 'معظم أسفار العهد القديم والجديد',
    collectionUrl: 'https://coptic-treasures.com/person/tadros-malaty/all-material/',
    source: 'مشروع الكنوز القبطية — مجاناً',
    color: 'blue',
  },
  {
    id: 'antonios-fekry',
    name: 'القمص أنطونيوس فكري',
    title: 'خادم ومفسر الكتاب المقدس',
    icon: '✍️',
    description: 'من أبرز مفسري الكتاب المقدس في الكنيسة القبطية. كتب تفاسير وافية لأسفار العهد القديم والجديد بأسلوب علمي وروحي. جميع كتبه متاحة للتحميل مجاناً.',
    booksNote: '40+ كتاباً',
    coverage: 'أسفار العهد القديم والجديد كاملاً',
    collectionUrl: 'https://library.awtar-alsama.com/a-88/',
    source: 'مكتبة أوتار السماء — مجاناً',
    color: 'green',
    books: [
      { title: 'تفسير سفر التكوين', url: 'https://library.awtar-alsama.com/88-032/', category: 'العهد القديم' },
      { title: 'تفسير سفر الخروج', url: 'https://library.awtar-alsama.com/88-079/', category: 'العهد القديم' },
      { title: 'تفسير سفر اللاويين', url: 'https://library.awtar-alsama.com/88-036/', category: 'العهد القديم' },
      { title: 'تفسير سفر العدد', url: 'https://library.awtar-alsama.com/88-037/', category: 'العهد القديم' },
      { title: 'تفسير سفر التثنية', url: 'https://library.awtar-alsama.com/88-038/', category: 'العهد القديم' },
      { title: 'تفسير سفر يشوع', url: 'https://library.awtar-alsama.com/88-039/', category: 'العهد القديم' },
      { title: 'حياة المسيح وزمانه', url: 'https://library.awtar-alsama.com/88-002/', category: 'العهد الجديد' },
      { title: 'أسرار الكنيسة السبعة', url: 'https://library.awtar-alsama.com/88-001/', category: 'لاهوت' },
      { title: 'قطمارس الأحاد', url: 'https://library.awtar-alsama.com/88-081/', category: 'طقسي' },
      { title: 'قطمارس الصوم الكبير', url: 'https://library.awtar-alsama.com/88-080/', category: 'طقسي' },
      { title: 'قطمارس أسبوع الآلام', url: 'https://library.awtar-alsama.com/88-083/', category: 'طقسي' },
      { title: 'المجموعة الكاملة', url: 'https://library.awtar-alsama.com/a-88/', category: 'مجموعة' },
    ],
  },
];

export interface CommentaryResource {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  badge?: string;
}

export const commentaryResources: CommentaryResource[] = [
  {
    id: 'coptic-treasures-tafseer',
    name: 'الكنوز القبطية — دراسات كتابية',
    description: 'مكتبة رقمية شاملة للدراسات الكتابية والتفاسير من آباء الكنيسة القبطية — مجانية بالكامل.',
    url: 'https://coptic-treasures.com/main-category/%D8%AF%D8%B1%D8%A7%D8%B3%D8%A7%D8%AA-%D9%83%D8%AA%D8%A7%D8%A8%D9%8A%D8%A9/',
    icon: '💎',
    badge: 'مجاني',
  },
  {
    id: 'christianlib-tafseer',
    name: 'موسوعة تفاسير الكتاب المقدس PDF',
    description: 'أكبر مكتبة عربية لتفاسير الكتاب المقدس بصيغة PDF — تضم تفاسير من مؤلفين متعددين للعهدين.',
    url: 'https://www.christianlib.com/10651.html/%D8%AA%D8%AD%D9%85%D9%8A%D9%84-%D9%85%D9%83%D8%AA%D8%A8%D8%A9-%D8%AA%D9%81%D8%A7%D8%B3%D9%8A%D8%B1-%D8%A7%D9%84%D9%83%D8%AA%D8%A7%D8%A8-%D8%A7%D9%84%D9%85%D9%82%D8%AF%D8%B3-pdf/',
    icon: '📚',
    badge: 'تحميل PDF',
  },
  {
    id: 'gotquestions-arabic',
    name: 'GotQuestions بالعربي — 7,869 سؤالاً كتابياً',
    description: 'أكبر موقع لإجابة أسئلة الكتاب المقدس بالعربية — يغطي آلاف الأسئلة اللاهوتية والكتابية.',
    url: 'https://www.gotquestions.org/Arabic/',
    icon: '❓',
    badge: '7,869 سؤال',
  },
  {
    id: 'awtar-alsama-lib',
    name: 'مكتبة أوتار السماء — تفاسير ودراسات',
    description: 'مكتبة رقمية مجانية تضم مئات الكتب القبطية الأرثوذكسية بصيغة PDF — قراءة أونلاين أو تحميل.',
    url: 'https://library.awtar-alsama.com/',
    icon: '🎵',
    badge: 'أونلاين + PDF',
  },
];

// ── كتب البابا شنودة الثالث ──────────────────────────────────────────────────
export interface PopeShenoudaBook {
  id: string;
  title: string;
  category: string;
  url: string;
  icon: string;
  description: string;
}

export const popeShenoudaBooks: PopeShenoudaBook[] = [
  { id: 'sh-lahoot-masih', title: 'لاهوت المسيح', category: 'لاهوت المسيح', url: 'https://library.awtar-alsama.com/30-001/', icon: '✝️', description: 'دراسة وافية في لاهوت السيد المسيح وألوهيته الكاملة من شواهد الكتاب المقدس' },
  { id: 'sh-tabee3at', title: 'طبيعة المسيح', category: 'لاهوت المسيح', url: 'https://library.awtar-alsama.com/30-002/', icon: '🕊️', description: 'أهم كتاب عقائدي يشرح طبيعة المسيح الواحدة من طبيعتين' },
  { id: 'sh-kanoon', title: 'قانون الإيمان', category: 'عقيدة', url: 'https://library.awtar-alsama.com/30-003/', icon: '📜', description: 'شرح مفصّل لقانون الإيمان النيقاوي وتاريخه ومعناه العقائدي' },
  { id: 'sh-khalas', title: 'الخلاص في المفهوم الأرثوذكسي', category: 'عقيدة', url: 'https://library.awtar-alsama.com/30-004/', icon: '✨', description: 'شرح وافٍ لمفهوم الخلاص في اللاهوت الأرثوذكسي وتمييزه عن المفهوم البروتستانتي' },
  { id: 'sh-kahnooot', title: 'الكهنوت', category: 'عقيدة', url: 'https://library.awtar-alsama.com/30-005/', icon: '⛪', description: 'دراسة عن سر الكهنوت وسلطانه وأهميته في الكنيسة الأرثوذكسية' },
  { id: 'sh-beda3', title: 'بدع حديثة', category: 'لاهوت مقارن', url: 'https://library.awtar-alsama.com/30-006/', icon: '⚠️', description: 'رصد للبدع الحديثة والرد عليها من منظور أرثوذكسي بدليل الكتاب والآباء' },
  { id: 'sh-zawaj', title: 'شريعة الزوجة الواحدة', category: 'لاهوت مقارن', url: 'https://library.awtar-alsama.com/30-007/', icon: '💍', description: 'دراسة في مفهوم الزواج الأحادي في الكنيسة القبطية وأساسه الكتابي' },
  { id: 'sh-moqaran', title: 'اللاهوت المقارن — ج1', category: 'لاهوت مقارن', url: 'https://library.awtar-alsama.com/30-008/', icon: '⚖️', description: 'مقارنة شاملة بين عقائد الكنيسة الأرثوذكسية والكنائس الأخرى' },
  { id: 'sh-shahod', title: 'شهود يهوه وهرطقاتهم', category: 'لاهوت مقارن', url: 'https://library.awtar-alsama.com/30-009/', icon: '🔍', description: 'رد علمي على هرطقات شهود يهوه من الكتاب المقدس وكتابات الآباء' },
  { id: 'sh-khalas-lahza', title: 'بدعة الخلاص في لحظة', category: 'لاهوت مقارن', url: 'https://library.awtar-alsama.com/30-011/', icon: '⏱️', description: 'الرد على عقيدة "الخلاص المضمون" البروتستانتية بالدليل الكتابي والآبائي' },
  { id: 'sh-matar', title: 'لماذا نرفض المطهر', category: 'لاهوت مقارن', url: 'https://library.awtar-alsama.com/30-012/', icon: '🔥', description: 'دراسة نقدية لعقيدة المطهر الكاثوليكية ورفضها من الكتاب والآباء' },
  { id: 'sh-as2ela', title: 'سنوات مع أسئلة الناس — لاهوت ج1', category: 'أسئلة وأجوبة', url: 'https://library.awtar-alsama.com/30-013/', icon: '❓', description: 'إجابات البابا شنودة على أسئلة المؤمنين في العقيدة واللاهوت' },
];

export const shenoudaBookCategories = ['الكل', 'لاهوت المسيح', 'عقيدة', 'لاهوت مقارن', 'أسئلة وأجوبة'];

// ── مصادر المكتبة القبطية الشاملة ────────────────────────────────────────────
export interface CopticLibrarySource {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  highlight: string;
  booksCount?: string;
}

export const copticLibrarySources: CopticLibrarySource[] = [
  {
    id: 'awtar-alsama-shenouda',
    name: 'مكتبة أوتار السماء — كتب البابا شنودة',
    description: 'جميع كتب البابا شنودة الثالث بصيغة PDF يمكن قراءتها أونلاين أو تحميلها مجاناً بدون قيود.',
    url: 'https://library.awtar-alsama.com/a-30/',
    icon: '👑',
    highlight: 'PDF مجاني — تحميل وقراءة أونلاين',
    booksCount: '30+ كتاباً',
  },
  {
    id: 'awtar-alsama-fekry',
    name: 'مكتبة أوتار السماء — القمص أنطونيوس فكري',
    description: 'جميع كتابات القمص أنطونيوس فكري بصيغة PDF — تفاسير للعهدين وكتب طقسية ولاهوتية.',
    url: 'https://library.awtar-alsama.com/a-88/',
    icon: '✍️',
    highlight: 'تفاسير كاملة للعهدين',
    booksCount: '40+ كتاباً',
  },
  {
    id: 'coptic-treasures-pope',
    name: 'الكنوز القبطية — البابا شنودة الثالث',
    description: 'فهرس موضوعات كتب وعظات قداسة البابا شنودة الثالث — مكتبة رقمية شاملة ومصنّفة بالموضوع.',
    url: 'https://coptic-treasures.com/person/117-pope-shenouda-iii/all-material/',
    icon: '💎',
    highlight: 'مصنّفة بالموضوع',
    booksCount: 'مئات المحاضرات والكتب',
  },
  {
    id: 'archive-shenouda',
    name: 'Archive.org — مجموعة كتب البابا شنودة',
    description: 'مجموعة ضخمة من كتب قداسة البابا شنودة الثالث على الإنترنت أرشيف — مفتوحة المصدر مجاناً.',
    url: 'https://archive.org/details/20211021_20211021_0858',
    icon: '🏛️',
    highlight: 'مفتوح المصدر — Archive.org',
    booksCount: 'عشرات الكتب',
  },
  {
    id: 'coptic-treasures-all',
    name: 'مشروع الكنوز القبطية — المكتبة الكاملة',
    description: 'مكتبة رقمية ضخمة للكنيسة القبطية — كتب، عظات، تفاسير، ألحان، صوتيات مجانية.',
    url: 'https://coptic-treasures.com/',
    icon: '📚',
    highlight: 'مكتبة شاملة لكل الأقسام',
  },
  {
    id: 'christianlib',
    name: 'مكتبة الكتب المسيحية',
    description: 'أكبر مكتبة إلكترونية عربية للكتب المسيحية — تحميل مجاني لمئات الكتب الأرثوذكسية.',
    url: 'https://www.christianlib.com/',
    icon: '📖',
    highlight: 'تحميل مجاني — مئات الكتب',
  },
];

// ── خرائط الكتاب المقدس ──────────────────────────────────────────────────────
// ── خريطة الكتاب المقدس التفاعلية المدمجة ────────────────────────────────────
export interface BibleLocation {
  id: string;
  name: string;
  nameAlt?: string;
  lat: number;
  lng: number;
  testament: 'قديم' | 'جديد' | 'كلاهما';
  category: 'مدن' | 'جبال' | 'أنهار وبحار' | 'مناطق';
  description: string;
  verse?: string;
  color: string;
}

export const bibleLocations: BibleLocation[] = [
  // ── مدن العهد القديم ──
  { id: 'jerusalem-ot', name: 'القدس (أورشليم)', lat: 31.7767, lng: 35.2345, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'مدينة داود وعاصمة المملكة الموحدة — مركز العبادة والهيكل المقدس.', verse: '2 صموئيل 5: 7' },
  { id: 'bethlehem', name: 'بيت لحم', lat: 31.7054, lng: 35.2024, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'مسقط رأس داود الملك، ومكان ميلاد يسوع المسيح.', verse: 'ميخا 5: 2 — لوقا 2: 4' },
  { id: 'hebron', name: 'الخليل (حبرون)', lat: 31.5253, lng: 35.0981, testament: 'قديم', category: 'مدن', color: '#6366f1', description: 'مدينة إبراهيم وسارة — مقبرة المكفيلة حيث دُفن آباء الإيمان.', verse: 'تكوين 23: 19' },
  { id: 'jericho', name: 'أريحا', lat: 31.8667, lng: 35.4500, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'أقدم مدينة في العالم — سقط سورها بمعجزة في عهد يشوع، وزارها يسوع وزكا.', verse: 'يشوع 6: 20 — لوقا 19: 1' },
  { id: 'beersheba', name: 'بئر سبع', lat: 31.2524, lng: 34.7916, testament: 'قديم', category: 'مدن', color: '#6366f1', description: 'الحدود الجنوبية لأرض الميعاد — مكان معاهدة إبراهيم وأبيمالك.', verse: 'تكوين 21: 31' },
  { id: 'samaria', name: 'السامرة (شكيم)', lat: 32.2707, lng: 35.1972, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'عاصمة مملكة إسرائيل الشمالية — المكان الذي يلقى فيه يسوع المرأة السامرية.', verse: 'يوحنا 4: 5' },
  { id: 'nazareth', name: 'الناصرة', lat: 32.7021, lng: 35.2978, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'مدينة نشأة يسوع — حيث أعلن بداية رسالته في المجمع.', verse: 'لوقا 4: 16' },
  { id: 'capernaum', name: 'كفرناحوم', lat: 32.8805, lng: 35.5748, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'مركز خدمة يسوع في الجليل — دعا هنا بطرس وأندراوس وياقوب ويوحنا.', verse: 'متى 4: 13' },
  { id: 'bethany', name: 'بيت عنيا', lat: 31.7658, lng: 35.2648, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'بيت لعازر ومريم ومرثا — هنا أقام يسوع لعازر من الموت.', verse: 'يوحنا 11: 1' },
  { id: 'cana', name: 'قانا الجليل', lat: 32.7572, lng: 35.3489, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'موقع أول معجزة يسوع — تحويل الماء إلى خمر في عرس قانا.', verse: 'يوحنا 2: 1' },
  { id: 'gaza', name: 'غزة', lat: 31.5017, lng: 34.4674, testament: 'قديم', category: 'مدن', color: '#6366f1', description: 'إحدى مدن الفلسطيين — ارتبطت بقصة شمشون البطل.', verse: 'قضاة 16: 21' },
  { id: 'nablus', name: 'نابلس (شكيم)', lat: 32.2211, lng: 35.2544, testament: 'قديم', category: 'مدن', color: '#6366f1', description: 'حيث اشترى إبراهيم قطعة الأرض الأولى في كنعان.', verse: 'تكوين 33: 19' },
  { id: 'megiddo', name: 'مجدو (أرمجدون)', lat: 32.5837, lng: 35.1838, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'مدينة الملوك الاستراتيجية — ذُكرت في سفر الرؤيا كموقع المعركة الأخيرة.', verse: 'رؤيا 16: 16' },
  { id: 'antioch', name: 'أنطاكية السورية', lat: 36.2021, lng: 36.1603, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'حيث سُمّي التلاميذ "مسيحيين" للمرة الأولى — انطلق منها بولس في رحلاته التبشيرية.', verse: 'أعمال 11: 26' },
  { id: 'damascus', name: 'دمشق', lat: 33.5138, lng: 36.2765, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'هنا اعترضه يسوع الممجد وتحوّل من اضطهاد المسيحيين إلى أعظم رسله.', verse: 'أعمال 9: 3' },
  { id: 'babylon', name: 'بابل', lat: 32.5355, lng: 44.4275, testament: 'قديم', category: 'مدن', color: '#6366f1', description: 'إمبراطورية نبوخذنصر الكبرى — سبى فيها يهوذا 70 عاماً.', verse: 'دانيال 1: 1' },
  { id: 'nineveh', name: 'نينوى', lat: 36.3590, lng: 43.1590, testament: 'قديم', category: 'مدن', color: '#6366f1', description: 'عاصمة آشور العظيمة — أُرسل إليها يونان فتابت المدينة بأكملها.', verse: 'يونان 1: 2' },
  { id: 'ur', name: 'أور الكلدانيين', lat: 30.9625, lng: 46.1039, testament: 'قديم', category: 'مدن', color: '#6366f1', description: 'مسقط رأس إبراهيم أبو الآباء — الذي غادرها مطيعاً لنداء الله.', verse: 'تكوين 11: 31' },
  { id: 'corinth', name: 'كورنثوس', lat: 37.9379, lng: 22.9316, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'أقام بولس فيها 18 شهراً وكتب إليها رسالتين هما أهم رسائله.', verse: 'أعمال 18: 1' },
  { id: 'ephesus', name: 'أفسس', lat: 37.9500, lng: 27.3667, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'حيث خدم بولس 3 سنوات وأحرق المؤمنون كتب السحر بقيمة 50000 درهم.', verse: 'أعمال 19: 19' },
  { id: 'rome', name: 'روما', lat: 41.9028, lng: 12.4964, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'عاصمة الإمبراطورية — كتب إليها بولس رسالة الرومية وبشّر فيها حتى استشهاده.', verse: 'رومية 1: 7' },
  { id: 'athens', name: 'أثينا', lat: 37.9838, lng: 23.7275, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'مركز الفلسفة اليونانية — خطب فيها بولس في الأريوباغوس عن "الإله المجهول".', verse: 'أعمال 17: 22' },
  { id: 'philippi', name: 'فيلبي', lat: 41.0135, lng: 24.2862, testament: 'جديد', category: 'مدن', color: '#10b981', description: 'أول كنيسة في أوروبا — أسّسها بولس حيث التقى ليدية وأُودع السجن وانفتحت أبوابه.', verse: 'أعمال 16: 12' },
  { id: 'alexandria', name: 'الإسكندرية', lat: 31.2001, lng: 29.9187, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'بوابة مصر الكبرى — أسّسها مارمرقس الرسول أول كنيسة في أفريقيا.', verse: 'أعمال 18: 24' },
  { id: 'cairo-egypt', name: 'مصر (القاهرة)', lat: 30.0444, lng: 31.2357, testament: 'كلاهما', category: 'مدن', color: '#f59e0b', description: 'ملجأ إبراهيم ومهد موسى — ثم مهجر العائلة المقدسة وأرض الكنيسة القبطية.', verse: 'متى 2: 13' },

  // ── جبال ──
  { id: 'mt-sinai', name: 'جبل سيناء (الطور)', lat: 28.5389, lng: 33.9753, testament: 'قديم', category: 'جبال', color: '#8b5cf6', description: 'حيث تجلّى الله لموسى وأعطاه الوصايا العشر ومواعيد الميثاق.', verse: 'خروج 19: 20' },
  { id: 'mt-ararat', name: 'جبل أراراط', lat: 39.7020, lng: 44.2990, testament: 'قديم', category: 'جبال', color: '#8b5cf6', description: 'حيث استقرّت سفينة نوح بعد الطوفان العظيم.', verse: 'تكوين 8: 4' },
  { id: 'mt-carmel', name: 'جبل الكرمل', lat: 32.7351, lng: 35.0628, testament: 'قديم', category: 'جبال', color: '#8b5cf6', description: 'موقع تحدّي إيليا النبي لأنبياء البعل — ونزول النار الإلهية.', verse: '1 ملوك 18: 19' },
  { id: 'mt-tabor', name: 'جبل تابور', lat: 32.6862, lng: 35.3918, testament: 'كلاهما', category: 'جبال', color: '#8b5cf6', description: 'جبل التجلّي — حيث تجلّى يسوع أمام بطرس ويعقوب ويوحنا وظهر موسى وإيليا.', verse: 'متى 17: 1' },
  { id: 'mt-hermon', name: 'جبل حرمون', lat: 33.4109, lng: 35.8580, testament: 'كلاهما', category: 'جبال', color: '#8b5cf6', description: 'أعلى جبل في منطقة فلسطين التاريخية — مصدر نهر الأردن.', verse: 'مزمور 133: 3' },
  { id: 'mt-olives', name: 'جبل الزيتون', lat: 31.7781, lng: 35.2461, testament: 'كلاهما', category: 'جبال', color: '#8b5cf6', description: 'حيث صلّى يسوع في جثسيماني وصعد إلى السماء — ومكان النبوة عن المجيء الثاني.', verse: 'أعمال 1: 12' },

  // ── أنهار وبحار ──
  { id: 'river-jordan', name: 'نهر الأردن', lat: 31.8437, lng: 35.5449, testament: 'كلاهما', category: 'أنهار وبحار', color: '#0891b2', description: 'عبره الشعب إلى أرض الميعاد — وفيه عمّد يوحنا المسيح وانفتحت السماء.', verse: 'يشوع 3: 17 — متى 3: 13' },
  { id: 'sea-galilee', name: 'بحيرة طبريا (الجليل)', lat: 32.8314, lng: 35.5921, testament: 'جديد', category: 'أنهار وبحار', color: '#0891b2', description: 'حيث دعا يسوع التلاميذ ومشى على الماء وأهدأ العواصف ومشى على أمواجها.', verse: 'متى 14: 25' },
  { id: 'dead-sea', name: 'البحر الميت', lat: 31.5, lng: 35.5, testament: 'قديم', category: 'أنهار وبحار', color: '#0891b2', description: 'أخفض نقطة في الأرض — بالقرب منه كانت سدوم وعمورة.', verse: 'تكوين 19: 24' },
  { id: 'river-nile', name: 'نهر النيل', lat: 30.0000, lng: 31.2000, testament: 'قديم', category: 'أنهار وبحار', color: '#0891b2', description: 'مهد الحضارة المصرية — وجد فيه موسى طفلاً في السلّة وتحوّل إلى دم عند الضربات.', verse: 'خروج 2: 3 — خروج 7: 20' },
  { id: 'mediterranean', name: 'البحر الأبيض المتوسط', lat: 34.0, lng: 28.0, testament: 'كلاهما', category: 'أنهار وبحار', color: '#0891b2', description: 'طريق التجارة والتبشير — أبحر فيه بولس في رحلاته الثلاث ونجا من غرق قرب مالطا.', verse: 'أعمال 27: 44' },
  { id: 'red-sea', name: 'البحر الأحمر', lat: 27.0, lng: 33.5, testament: 'قديم', category: 'أنهار وبحار', color: '#0891b2', description: 'شقّه موسى بعصاه وعبر منه الشعب على اليابسة وغرق فيه فرعون وجيشه.', verse: 'خروج 14: 21' },

  // ── مناطق ──
  { id: 'canaan', name: 'أرض كنعان (أرض الميعاد)', lat: 31.8, lng: 35.0, testament: 'قديم', category: 'مناطق', color: '#d97706', description: 'الأرض التي وعد الله بها إبراهيم وذريته — امتدت من نهر مصر إلى الفرات.', verse: 'تكوين 15: 18' },
  { id: 'galilee', name: 'الجليل', lat: 32.8, lng: 35.3, testament: 'كلاهما', category: 'مناطق', color: '#d97706', description: 'إقليم شمال فلسطين — حيث قضى يسوع معظم خدمته وأجرى معظم معجزاته.', verse: 'متى 4: 23' },
  { id: 'judea', name: 'اليهودية', lat: 31.5, lng: 35.1, testament: 'كلاهما', category: 'مناطق', color: '#d97706', description: 'إقليم جنوب فلسطين — وطن يهوذا وموطن بيت داود ومسقط رأس يسوع.', verse: 'متى 2: 1' },
  { id: 'sinai-region', name: 'شبه جزيرة سيناء', lat: 29.5, lng: 33.5, testament: 'قديم', category: 'مناطق', color: '#d97706', description: 'صحراء التيه — تاه فيها الشعب 40 سنة يتعلّم الإيمان والطاعة.', verse: 'خروج 16: 1' },
  { id: 'greece', name: 'اليونان (مقدونية)', lat: 40.5, lng: 22.5, testament: 'جديد', category: 'مناطق', color: '#d97706', description: 'انتشرت فيها الكنيسة الأولى — كورنثوس وأثينا وفيلبي وتسالونيكي وبيرية.', verse: 'أعمال 16: 9' },
];

export type BibleLocationCategory = 'الكل' | 'مدن' | 'جبال' | 'أنهار وبحار' | 'مناطق';
export type BibleLocationTestament = 'الكل' | 'قديم' | 'جديد' | 'كلاهما';
export const bibleLocationCategories: BibleLocationCategory[] = ['الكل', 'مدن', 'جبال', 'أنهار وبحار', 'مناطق'];

// kept for backward compat (external links no longer used)
export interface BibleMapResource {
  id: string; name: string; description: string; url: string; icon: string;
  testament: 'قديم' | 'جديد' | 'كلاهما'; badge?: string;
}
export const bibleMapResources: BibleMapResource[] = [];

// ── مردات الشماس ───────────────────────────────────────────────────────────────
// جميع النصوص تراث طقسي قبطي أرثوذكسي — مُحمَّل مباشرةً على الموقع
export const deaconSections: DeaconSection[] = [
  {
    id: 'general',
    title: 'المردات العامة المتكررة',
    icon: '🔔',
    color: 'amber',
    description: 'هذه المردات تتكرر كثيراً في القداس والصلوات اليومية ويُشارك فيها الشعب جميعاً. هي أساس المشاركة الجماعية في الطقس القبطي.',
    responses: [
      {
        arabic: 'كيريه إليسون',
        coptic: 'Ⲕⲩⲣⲓⲉ ⲉ̀ⲗⲉⲏⲥⲟⲛ',
        meaning: 'يا رب ارحم',
        usage: 'أكثر المردات تكراراً في القداس الإلهي وجميع الطقوس. تُقال 41 مرة عند تقديم الحمل.',
      },
      {
        arabic: 'آمين',
        coptic: 'Ⲁ̀ⲙⲏⲛ',
        meaning: 'حقاً / هكذا يكون',
        usage: 'يُقالها الشماس والشعب في نهاية كل صلاة وأوشية وقراءة مقدسة.',
      },
      {
        arabic: 'آمين، آمين، آمين',
        coptic: 'Ⲁ̀ⲙⲏⲛ ⲁ̀ⲙⲏⲛ ⲁ̀ⲙⲏⲩ',
        meaning: 'ثلاثة آمين تأكيداً للإيمان بالثالوث القدوس',
        usage: 'تُقال قبل تلاوة مرد الاعتراف "أؤمن، أؤمن، أؤمن" عند الاستعداد للتناول.',
      },
      {
        arabic: 'قدوس، قدوس، قدوس رب الصاباؤوت',
        coptic: 'Ⲁ̀ⲅⲓⲟⲥ Ⲁ̀ⲅⲓⲟⲥ Ⲁ̀ⲅⲓⲟⲥ',
        meaning: 'قدوس رب الجنود — ملء السماء والأرض مجده',
        usage: 'يُقالها الشماس والشعب عقب الـ 41 كيرياليسون في تقديم الحمل.',
      },
      {
        arabic: 'هلليلويا',
        coptic: 'Ⲁ̀ⲗⲗⲏⲗⲟⲩⲓⲁ',
        meaning: 'سبّحوا الرب — (عبرانية: هَلَّل يَهْوَه)',
        usage: 'ترنيمة تسبيح تُقال في كثير من مواضع القداس والتسبحة وخاصة في أوقات الفرح.',
      },
      {
        arabic: 'له المجد',
        meaning: 'نسبة المجد لله وحده',
        usage: 'تُقال في نهاية المزامير والتسابيح والأناشيد الروحية، ردٌّ على كل ما يُذكر من أعمال الله.',
      },
      {
        arabic: 'الرب يُشفيك',
        meaning: 'طلب الشفاء من الرب',
        usage: 'تُقال في الصلوات المخصصة للمرضى وفي مردات بعض الطقوس.',
      },
      {
        arabic: 'يا رب ارحمنا',
        meaning: 'طلب الرحمة الجماعية',
        usage: 'ترداد جماعي في الصلوات والأوشيات، يعبّر عن احتياج الشعب لرحمة الله.',
      },
    ],
  },
  {
    id: 'incense',
    title: 'مردات رفع البخور',
    icon: '🕯️',
    color: 'orange',
    description: 'مردات خدمة الشماس في رفع بخور عشية وباكر — تسبق القداس الإلهي وتُرتَّل أثناء صعود البخور أمام الهيكل.',
    responses: [
      {
        arabic: 'بسم الآب والابن والروح القدس إله واحد، آمين',
        meaning: 'افتتاح الخدمة باسم الثالوث الأقدس',
        usage: 'تُقال في بداية كل خدمة دينية وعند قرع أرباع الناقوس.',
      },
      {
        arabic: 'قوموا للصلاة',
        coptic: 'Ⲓⲑⲛⲁⲩ ⲉⲣⲟϥ',
        meaning: 'دعوة الشعب للوقوف في هيبة أمام الرب',
        usage: 'يقولها الشماس عند بداية الصلاة أو القراءة أو الإنجيل.',
      },
      {
        arabic: 'ننصتوا جميعاً بتقوى',
        meaning: 'دعوة للانتباه والتقوى أثناء الصلاة',
        usage: 'ينبّه الشماس الشعب بها على بدء الأوشية أو القراءة.',
      },
      {
        arabic: 'صلّوا من أجل الإنجيل المقدس',
        meaning: 'دعوة الشعب للصلاة من أجل إعلان كلمة الله',
        usage: 'يقولها الشماس قبل قراءة الإنجيل في رفع البخور.',
      },
      {
        arabic: 'لأن الكاهن رافع البخور يسأل المسيح إلهنا أن يقبل بخورنا ذبيحة روحية مقبولة لدى عرشه السماوي',
        meaning: 'طلب قبول البخور ذبيحةً روحية',
        usage: 'يُقالها الشماس أثناء صعود البخور قبل الهيكل عشية وباكر.',
      },
      {
        arabic: 'اللهم صلّ على نبيّك وعبدك موسى النبي',
        meaning: 'ذكر الأنبياء والقديسين في الصلاة',
        usage: 'تُقال في الأوشيات المخصصة لذكر الآباء والأنبياء خلال رفع البخور.',
      },
      {
        arabic: 'اشفعي فينا يا والدة الإله العذراء مريم',
        meaning: 'طلب شفاعة السيدة العذراء',
        usage: 'تُقال في مرد الثيؤطوكية المخصصة للسيدة العذراء أثناء رفع البخور.',
      },
      {
        arabic: 'يا رب اقبل منا هذا البخور رائحة طيبة',
        meaning: 'طلب قبول البخور كصلاة وعبادة',
        usage: 'يقولها الكاهن والشعب أثناء رفع المجمرة أمام الهيكل المقدس.',
      },
    ],
  },
  {
    id: 'liturgy',
    title: 'مردات القداس الإلهي',
    icon: '⛪',
    color: 'purple',
    description: 'المردات التي يرددها الشماس والشعب أثناء القداس الإلهي — مرتبة حسب تسلسلها الطقسي من الافتتاح حتى الاختتام.',
    responses: [
      {
        arabic: 'إن صوفيا ثيؤ',
        coptic: 'Ⲉⲛⲥⲟⲫⲓⲁ Ⲑⲉⲟⲩ',
        meaning: 'انصتوا بحكمة الله',
        usage: 'يقولها الشماس قبل قراءة الرسالة لتنبيه الشعب للانتباه لكلمة الله.',
      },
      {
        arabic: 'بروسخومين',
        coptic: 'Ⲡ̀ⲣⲟⲥⲭⲱⲙⲉⲛ',
        meaning: 'ننصت / ننتبه',
        usage: 'يقولها الشعب رداً على دعوة الشماس للانتباه والانصات.',
      },
      {
        arabic: 'أسباذيستيه أليلوس',
        coptic: 'Ⲁⲥⲡⲁⲍⲉⲥⲑⲉ ⲁⲗⲗⲏⲗⲟⲩⲥ',
        meaning: 'قبّلوا بعضكم بعضاً',
        usage: 'يدعو الشماس الشعب لتبادل قبلة السلام قبل صلاة الصلح.',
      },
      {
        arabic: 'إيس أناتولاس فليفساتي',
        coptic: 'Ⲓⲥ ⲁ̀ⲛⲁⲧⲟⲗⲁⲥ ⲃ̀ⲗⲉⲯⲁⲧⲉ',
        meaning: 'وإلى الشرق انظروا',
        usage: 'يوجّه الشماس الشعب لاستقبال القبلة نحو الشرق رمز مجيء المسيح.',
      },
      {
        arabic: 'اسجدوا لإنجيل ربنا يسوع المسيح',
        meaning: 'دعوة لتعظيم الإنجيل المقدس قبل قراءته',
        usage: 'يقولها الكاهن قبل قراءة الإنجيل فيردّ الشماس والشعب بكيرياليسون ثلاثاً.',
      },
      {
        arabic: 'مكسوم إكسيوس',
        coptic: 'Ⲙⲁⲝⲁⲓⲟⲩ ⲁⲝⲓⲟⲥ',
        meaning: 'مستحق — يُبارك الله هذا المستحق',
        usage: 'يُقالها الشماس والشعب عند إعلان أي تكريس أو رسامة في الكنيسة.',
      },
      {
        arabic: 'ولك ينبغي المجد والإكرام والسجود',
        meaning: 'تقديم المجد لله الثالوث',
        usage: 'يُقالها الشماس والشعب تكميلاً لتسبحة القداس الإلهي.',
      },
      {
        arabic: 'اشكروا الرب لأنه صالح',
        meaning: 'دعوة لشكر الله على صلاحه وعطاياه',
        usage: 'يُقالها الشماس في نهاية القداس دعوةً للشكر والتسبيح.',
      },
      {
        arabic: 'لأن رحمته إلى الأبد',
        meaning: 'إعلان رحمة الله الأبدية',
        usage: 'يردّ الشعب بها على دعوة الشكر في نهاية القداس.',
      },
    ],
  },
  {
    id: 'confession',
    title: 'مرد الاعتراف والتناول',
    icon: '🕊️',
    color: 'blue',
    description: 'المردات التي تُقال وقت الاستعداد للتناول من الأسرار المقدسة — اعترافاً بالإيمان واتضاعاً أمام الرب.',
    responses: [
      {
        arabic: 'أؤمن، أؤمن، أؤمن أن هذا هو بالحقيقة جسدك ودمك يا مسيح ملكنا وإلهنا',
        coptic: 'ϯⲛⲁϩϯ ϯⲛⲁϩϯ ϯⲛⲁϩϯ ϫⲉ ϧⲉⲛ ⲟⲩⲙⲉⲑⲙⲏⲓ',
        meaning: 'اعتراف بحضور المسيح الحقيقي في الأسرار المقدسة',
        usage: 'يقولها الشماس والشعب عند استعدادهم للتناول من جسد المسيح ودمه.',
      },
      {
        arabic: 'آمين — هلليلويا',
        coptic: 'Ⲁ̀ⲙⲏⲛ — Ⲁ̀ⲗⲗⲏⲗⲟⲩⲓⲁ',
        meaning: 'آمين — سبّحوا الرب',
        usage: 'يُقالها الشماس والشعب عند توزيع الأسرار المقدسة.',
      },
      {
        arabic: 'ليكن لنا بحسب إيمانك يا رب',
        meaning: 'طلب العمل بحسب إيمان المؤمنين',
        usage: 'تُقال عند التناول من الأسرار المقدسة تضرعاً واتضاعاً.',
      },
      {
        arabic: 'قدسٌ للآب، قدسٌ للابن، قدسٌ للروح القدس',
        meaning: 'تقديس الثالوث الأقدس قبل التناول',
        usage: 'تُقال مباشرة قبل التناول من الأسرار المقدسة تعبيراً عن الإيمان بالثالوث.',
      },
      {
        arabic: 'الجسد والدم الطاهر لابن الله يُقدَّمان إليّ، آمين',
        meaning: 'استقبال الأسرار المقدسة بإيمان وتواضع',
        usage: 'يقولها الشخص عند تناوله من الأسرار المقدسة.',
      },
    ],
  },
  {
    id: 'tasbeha',
    title: 'مردات التسبحة اليومية',
    icon: '🌙',
    color: 'indigo',
    description: 'مردات التسبحة القبطية اليومية (صلاة نصف الليل) — التي يُرتّلها الشمامسة والشعب في تسبحة نصف الليل والصباح.',
    responses: [
      {
        arabic: 'مزمور، مزمور، مزمور لداود النبي وملك إسرائيل',
        meaning: 'إعلان بدء التسبيح بمزامير داود',
        usage: 'تُقال في بداية التسبحة قبل ترتيل المزامير.',
      },
      {
        arabic: 'إبسالي إبسالي إبسالي',
        coptic: 'Ⲯⲁⲗⲓ ⲯⲁⲗⲓ ⲯⲁⲗⲓ',
        meaning: 'رنّموا رنّموا رنّموا — دعوة للتسبيح',
        usage: 'يُقالها الشماس في بداية كل مزمور دعوةً للشعب للتسبيح بالمزامير.',
      },
      {
        arabic: 'تنيشورين إيفيوفيلي',
        coptic: 'Ⲧⲉⲛϣⲱⲣⲡ ⲉ̀ϩⲟⲩⲛ ⲉ̀ⲫⲓⲟϣ',
        meaning: 'نقدم بواكير المزامير — أول المزامير',
        usage: 'يُقالها في بداية مزمور التسبحة عند الدخول في صلاة مزمور باكر.',
      },
      {
        arabic: 'تينيف تينيف تينيف — مبارك الرب إله إسرائيل',
        coptic: 'Ⲧⲉⲛⲱϣ ⲛ̀ⲉⲟⲟⲩ',
        meaning: 'نسبّح نسبّح نسبّح — ترديد التسبيح ثلاثاً',
        usage: 'يُقالها الشماس دعوةً للتسبيح الجماعي في التسبحة القبطية.',
      },
      {
        arabic: 'آبيه أبسي — أيها الحمل الذي رفع خطية العالم',
        coptic: 'Ⲁ̀ⲫⲏⲣⲓ ⲁ̀ⲃⲉⲥ',
        meaning: 'يا حمل الله الذي رفع خطايا العالم',
        usage: 'يُقالها الشماس والشعب في التسبحة ردًّا على ترتيل المزامير.',
      },
      {
        arabic: 'أنيكي إكسيوس',
        coptic: 'Ⲁ̀ⲛⲓⲕⲓ ⲁ̀ⲝⲓⲟⲥ',
        meaning: 'نقبل — يستحق — نعم يستحق',
        usage: 'تُقال في نهاية كل ترتيلة أو لحن في التسبحة تعبيراً عن الموافقة والقبول.',
      },
    ],
  },
  {
    id: 'agpeya',
    title: 'مردات الأجبية (ساعات الصلاة)',
    icon: '🙏',
    color: 'teal',
    description: 'مردات صلوات الأجبية الكنسي القبطي — الساعات السبع التي يُصلّيها المؤمن طوال اليوم تقديساً لكل لحظة.',
    responses: [
      {
        arabic: 'أشهد بإيمان واعتراف كامل أن هذا هو بالحقيقة جسد المسيح وهذا هو دمه الكريم',
        meaning: 'اعتراف إيمان الكنيسة القبطية بالأسرار',
        usage: 'تُقال في افتتاح كل صلاة من صلوات الأجبية تثبيتاً للإيمان.',
      },
      {
        arabic: 'يا رب يا رب يا رب ارحم',
        meaning: 'نداء الاتكال على الرب والطلب من رحمته',
        usage: 'تُقال في بداية كل صلاة ساعة للتركيز على حضور الله.',
      },
      {
        arabic: 'المجد للآب والابن والروح القدس الآن وكل أوان وإلى دهر الداهرين، آمين',
        meaning: 'تمجيد الثالوث الأقدس',
        usage: 'تُقال في نهاية كل مزمور من مزامير الأجبية وفي نهاية الصلوات.',
      },
      {
        arabic: 'السلام لكم جميعاً',
        meaning: 'تحية السلام المسيحية',
        usage: 'يُقالها الكاهن لبدء الصلاة أو الاجتماع فيردّ الشعب: ولروحك أيضاً.',
      },
      {
        arabic: 'ولروحك أيضاً',
        meaning: 'رد تحية السلام',
        usage: 'يردّها الشعب على تحية الكاهن "السلام لكم" في الأجبية والقداس.',
      },
      {
        arabic: 'الشكر لله',
        meaning: 'شكر الله في كل وقت',
        usage: 'ترداد كثير في الأجبية بعد كل مزمور وفي التحيات تعبيراً عن الشكر الدائم.',
      },
    ],
  },
  {
    id: 'special',
    title: 'مردات مناسبات خاصة',
    icon: '✨',
    color: 'emerald',
    description: 'مردات تُقال في المناسبات الكنسية الخاصة كأسبوع الآلام والقيامة والعيد الكبير والغطاس وأحد الشعانين.',
    responses: [
      {
        arabic: 'المسيح قام من بين الأموات ووطئ الموت بالموت ووهب الحياة للذين في القبور',
        meaning: 'إعلان قيامة المسيح — جوهر الإيمان المسيحي',
        usage: 'تُقال في كل قداسات العيد وطوال خمسين يوماً من عيد القيامة.',
      },
      {
        arabic: 'أوصنا لابن داود، مبارك الآتي باسم الرب، أوصنا في الأعالي',
        meaning: 'ترحيب بالمسيح الملك الداخل — تذكار دخوله أورشليم',
        usage: 'تُقال في أحد الشعانين (أحد السعف) احتفالاً بدخول المسيح أورشليم.',
      },
      {
        arabic: 'الصليب المقدس ظهر لنا نوراً — بارك يا رب',
        meaning: 'تعظيم الصليب المقدس',
        usage: 'تُقال في عيد الصليب وفي طقوس رفع الصليب.',
      },
      {
        arabic: 'هذا النور المقدس',
        meaning: 'الإشارة إلى نور المسيح في طقس إضاءة الشموع',
        usage: 'تُقال في طقس إضاءة شموع السبت المقدس احتفالاً بقيامة المسيح.',
      },
      {
        arabic: 'الرب قد مَلَك ويملك ويملك إلى الأبد',
        meaning: 'إعلان ملوكية الرب الأبدية',
        usage: 'تُقال في عيد الغطاس وفي المناسبات الكبرى للكنيسة.',
      },
      {
        arabic: 'طوبى للذين اختاروا الرحلة إلى السماء',
        meaning: 'تطويب الشهداء والمتنيّحين في إيمان',
        usage: 'تُقال في قداسات عيد الشهداء وفي صلوات الجنازات تذكيراً بالرجاء.',
      },
    ],
  },
  // ── قسم 8: لحن القسمة ────────────────────────────────────────────────────────
  {
    id: 'fraction',
    title: 'مردات لحن القسمة',
    icon: '🍞',
    color: 'rose',
    description: 'مردات اللحظة المقدسة التي يُكسر فيها الجسد المقدس (القسمة) — وهي ذروة القداس الإلهي وأشدّ لحظاته روحانية.',
    responses: [
      {
        arabic: 'وإذ أخذ يسوع الخبز شكر وكسر وأعطى تلاميذه قائلاً: خذوا كلوا هذا هو جسدي الذي يُكسر عنكم لمغفرة الخطايا',
        copticArabic: 'بيجي إيسوس إنيف ماثيتيس — جي باي أووم — بيجي ذا أنيتن بيجيوم بيكيلوم إيروف إبوليتيكازموس إن نيمنووبي',
        coptic: 'Ⲡⲉϫⲉ Ⲓⲏⲥⲟⲩⲥ ⲛⲉϥⲙⲁⲑⲏⲧⲏⲥ ϫⲓ ⲡⲁⲓ ⲟⲩⲱⲙ',
        meaning: 'كلمات التأسيس — تُتلى لحظة كسر الخبز المقدس',
        usage: 'يقولها الكاهن لحظة كسر الجسد المقدس فيصمت الكل هيبةً وخشوعاً.',
      },
      {
        arabic: 'آمين، آمين، آمين — صلوا أيها الشمامسة',
        copticArabic: 'أمين، أمين، أمين — أريتن أنووو',
        coptic: 'Ⲁ̀ⲙⲏⲛ Ⲁ̀ⲙⲏⲛ Ⲁ̀ⲙⲏⲛ',
        meaning: 'ثلاثة آمين عند لحن القسمة',
        usage: 'يُقالها الشعب ثلاث مرات في أعقاب كلمات التأسيس تأكيداً لحقيقة الحضور الإلهي.',
      },
      {
        arabic: 'قدوس الآب، قدوس الابن، قدوس الروح القدس',
        copticArabic: 'أجيوس أو ثيؤس — أجيوس إيسخيروس — أجيوس أثاناتوس — إيليسون إيماس',
        coptic: 'Ⲁ̀ⲅⲓⲟⲥ Ⲟ̀ Ⲑⲓ̈ⲟⲥ Ⲁ̀ⲅⲓⲟⲥ Ⲓⲥⲭⲩⲣⲟⲥ Ⲁ̀ⲅⲓⲟⲥ Ⲁ̀ⲑⲁⲛⲁⲧⲟⲥ',
        meaning: 'تقديس الثالوث الأقدس في لحظة القسمة',
        usage: 'يُقالها الكاهن والشماس والشعب معاً في مرد لحن القسمة.',
      },
      {
        arabic: 'اللهم ارحم — يا رب ارحمنا — إله ارحمنا',
        copticArabic: 'كيريه إليسون — كيريه إليسون — كيريه إليسون',
        meaning: 'صرخة الرحمة أمام الأسرار المقدسة',
        usage: 'يُرددها الشعب بخشوع أثناء تقسيم الجسد المقدس على المؤمنين.',
      },
      {
        arabic: 'يسوع المسيح أمس وهو ذاته اليوم وإلى الأبد',
        copticArabic: 'إيسوس بيخريستوس إن ذاو إف شوب نيم فأو نيم شا إيني إني',
        meaning: 'ثبات المسيح وأزليته — إعلان ثبات الإيمان',
        usage: 'تُقال في لحن القسمة تذكيراً بأن المقدَّم هو نفس المسيح الأزلي.',
      },
      {
        arabic: 'الجسد الطاهر والدم الكريم لرب الكل وإلهنا ومخلصنا يسوع المسيح',
        copticArabic: 'بيسوما إيثؤاب نيم بيسنوف إيتيمي إم بنوتي تيرف نيم بيننوتي نيم بين سوتير إيسوس بيخريستوس',
        meaning: 'إعلان هوية المقدَّم في الأسرار',
        usage: 'يقولها الكاهن مرفوعاً الجسد المقدس أمام الشعب قبيل توزيعه.',
      },
    ],
  },
  // ── قسم 9: سر المعمودية ──────────────────────────────────────────────────────
  {
    id: 'baptism',
    title: 'مردات سر المعمودية والميرون',
    icon: '💧',
    color: 'cyan',
    description: 'مردات طقس سر المعمودية المقدسة — الميلاد الثاني بالماء والروح — وسر الميرون المقدس الذي يلي المعمودية فوراً.',
    responses: [
      {
        arabic: 'باسم الآب والابن والروح القدس الإله الواحد — آمين',
        copticArabic: 'إن فران إم فيؤت نيم فشيري نيم بي بنيوما إيثؤاب — أنوق باتبيزو إيرو — آمين',
        coptic: 'Ⲉⲛ ⲫⲣⲁⲛ ⲙ̀ⲫⲓⲱⲧ ⲛⲉⲙ ⲫϣⲏⲣⲓ ⲛⲉⲙ ⲡⲓⲡⲛⲉⲩⲙⲁ ⲉⲑⲟⲩⲁⲃ',
        meaning: 'صيغة المعمودية الثلاثية باسم الثالوث الأقدس',
        usage: 'يقولها الكاهن عند غمس المعمَّد في الماء ثلاث مرات.',
      },
      {
        arabic: 'أعطِه يا رب — هلليلويا',
        copticArabic: 'أريتف ناف بينوتي — أليلويا',
        meaning: 'طلب موهبة الروح القدس للمعمَّد الجديد',
        usage: 'يُقالها الشعب بعد كل غمسة تشجيعاً وطلباً للبركة.',
      },
      {
        arabic: 'اجحد الشيطان — ونجاسته — وكبرياءه — وسيئاته — ومعلّميه — وأعماله',
        copticArabic: 'أبيرنيم بيشيطان — نيم نيف خوف — نيم نيف ثيبيؤنوت — نيم نيف ميتؤوش — نيم نيف تيؤش — نيم نيف ؤووبي',
        meaning: 'جحد الشيطان وأعماله — شرط المعمودية',
        usage: 'يُقالها الكاهن والمعمَّد أو وليّه بصوت عالٍ قبل الدخول في الماء.',
      },
      {
        arabic: 'وأُلحق بالمسيح — وأؤمن به — وأُعلن إيمانه المقدس',
        copticArabic: 'نيم شاف ابيخريستوس — نيم تينوهتف — نيم تين أو إيبوأل إن تيف بيستيس إيثؤاب',
        meaning: 'الإقرار بالانتساب للمسيح والإيمان به',
        usage: 'تُقال بعد جحد الشيطان مباشرةً إعلاناً للولاء لمسيح.',
      },
      {
        arabic: 'ختم عطية الروح القدس — آمين',
        copticArabic: 'سفراجيس إن دوريا إم بي بنيوما إيثؤاب — آمين',
        coptic: 'Ⲥ̀ⲫⲣⲁⲅⲓⲥ ⲛ̀ⲇⲱⲣⲉⲁ ⲙ̀ⲡⲓⲡⲛⲉⲩⲙⲁ ⲉⲑⲟⲩⲁⲃ',
        meaning: 'صيغة سر الميرون — ختم الروح القدس',
        usage: 'يقولها الكاهن عند مسح كل عضو بالميرون المقدس إثر المعمودية.',
      },
      {
        arabic: 'مبارك أنت يا رب الذي بارك هذه المياه بنعمة روحك القدوس',
        copticArabic: 'فسماريووت بينوتي إيتاف سمو إيني إن مووي إم بي بنيوما إيثؤاب',
        meaning: 'شكر الله على بركة الماء',
        usage: 'تُقال في ختام طقس التبريك بعد إتمام المعمودية.',
      },
    ],
  },
  // ── قسم 10: سر الإكليل ───────────────────────────────────────────────────────
  {
    id: 'wedding',
    title: 'مردات سر الإكليل المقدس (الزواج)',
    icon: '💍',
    color: 'pink',
    description: 'مردات طقس سر الإكليل القبطي المقدس — الزواج المسيحي الذي يجمع الرجل والمرأة في الرب ويُبارك وحدتهما بالصلاة والأسرار.',
    responses: [
      {
        arabic: 'يا ربنا يسوع المسيح انظر إلى عبديك هذين وبارك زواجهما',
        copticArabic: 'بينوتي إيسوس بيخريستوس — فناو إيبين بين أو أوبيؤس — أووو سمو إيبين ميتؤبيؤس',
        meaning: 'طلب البركة الإلهية على الزوجين',
        usage: 'يقولها الكاهن عند تتويج الزوجين بالإكليل المقدس.',
      },
      {
        arabic: 'ما جمعه الله لا يفرّقه إنسان',
        copticArabic: 'فيتاف توف إيروف إنجي بينوتي — إيرو أنسين فناسوشف إنجي أورومي',
        meaning: 'وحدة الزواج المسيحي الغير قابلة للانفصام',
        usage: 'تُقال في الإكليل تأكيداً لقدسية رابطة الزواج أمام الله والشعب.',
      },
      {
        arabic: 'باركهما يا رب كما باركت إبراهيم وإسحق ويعقوب',
        copticArabic: 'سمو إيروو بينوتي إيمبير إيثي إيتاك سمو إن أبراهام نيم إيساك نيم يعقوب',
        meaning: 'طلب بركة الآباء على الزوجين',
        usage: 'يُقالها الكاهن في أوشية الإكليل مستحضراً بركة الله للآباء.',
      },
      {
        arabic: 'اللهم أحوّط زواجهما بالبركة والمحبة والعفة والسلام',
        copticArabic: 'أو بينوتي — سوتب إيبين ميتؤبيؤس — إيتي ني أو إيمبير تيمي — إن أو أجابي — نيم أو سوفروسيني — نيم أو إيريني',
        meaning: 'الطلب لبيت الزوجين بالفضائل الأربع',
        usage: 'تُقال في صلاة الأوشية الرئيسية لطقس الإكليل.',
      },
      {
        arabic: 'ليفرح العريس بعروسه كما يفرح الرب بشعبه',
        copticArabic: 'مارف راشي إن بي نيومفيوس خن ت نيومفي إيمبير إيثي إف راشي إنجي بيثوييس خن لا أوف',
        meaning: 'تشبيه المحبة الزوجية بمحبة المسيح لكنيسته',
        usage: 'تُقال في ترتيل الإكليل تعبيراً عن القدوة الإلهية في المحبة.',
      },
      {
        arabic: 'مبارك أنت يا رب على هذا الزواج المقدس',
        copticArabic: 'فسماريووت بينوتي — إجن باي ميتؤبيؤس إيثؤاب',
        meaning: 'ختام بركة الإكليل',
        usage: 'يُقالها الشعب في نهاية طقس الإكليل شهادةً على قداسة هذا الزواج.',
      },
    ],
  },
  // ── قسم 11: سر مسحة المرضى ──────────────────────────────────────────────────
  {
    id: 'unction',
    title: 'مردات سر مسحة المرضى (الأوكتانيوس)',
    icon: '🕯️',
    color: 'yellow',
    description: 'مردات سر مسحة المرضى (الأوكتانيوس القبطي) — طقس يجمع سبعة مزامير وسبع رسائل وسبعة أناجيل وسبع مسحات وصلوات الشفاء.',
    responses: [
      {
        arabic: 'يا رب أشفِ عبدك هذا من كل مرض وكل ضعف وبارك بيت هذا',
        copticArabic: 'بينوتي ماك تالثو إن باي أوبيؤس إيبول إخن أوون إيشطيرتيس نيم أون مينكاح — أووو سمو إبين هاي',
        meaning: 'صلاة الشفاء الشاملة',
        usage: 'يقولها الكاهن عند كل مسحة من المسحات السبع بالزيت المقدس.',
      },
      {
        arabic: 'ربنا يسوع المسيح أنت الطبيب الصالح والحكيم الحقيقي',
        copticArabic: 'بيننوتي إيسوس بيخريستوس — إنثوك بي بسات إن أغاثوس — نيم بي سابيوس إم ميثميي',
        meaning: 'اعتراف بالمسيح الطبيب الإلهي',
        usage: 'تُقال في فاتحة سر المسحة إعلاناً للإيمان بالمسيح معافياً.',
      },
      {
        arabic: 'اشفِ بقدرتك واجمع بإرادتك وطهّر بنعمتك',
        copticArabic: 'تالثو خن تيك دينامياس — توف خن بيك أو أوشي — طبو خن تيك خاريس',
        meaning: 'طلب الشفاء والتطهير والتجميع',
        usage: 'يُقالها الكاهن والشمامسة أثناء المسحات السبع مع كل إنجيل.',
      },
      {
        arabic: 'مريض أحد فيكم فليدعُ قسوس الكنيسة فيصلّوا عليه ويدهنوه بزيت باسم الرب',
        copticArabic: 'أو أرووست إيخن أوتن — مارف موتي إن نيبريسبيتيروس إن تيكليسيا — نسي شيلهل إيجروف — نسي طوف إيروف إيبوليون خن فران إم بيثوييس',
        meaning: 'أساس سر المسحة من رسالة يعقوب ٥ : ١٤',
        usage: 'تُتلى هذه الآية في مقدمة الطقس تأصيلاً للسر الكنسي.',
      },
      {
        arabic: 'أيها المؤمنون الحضور صلّوا من أجل مريضنا ليشفيه الرب',
        copticArabic: 'أريتن شيلهل — إجن بين أرووست — خيكاس إف تالثوف إنجي بيثوييس',
        meaning: 'دعوة الشعب للاشتراك في الصلاة على المريض',
        usage: 'يقولها الشماس حثاً للشعب على المشاركة في صلاة طقس المسحة.',
      },
    ],
  },
  // ── قسم 12: مردات الجنازات والانتقال ────────────────────────────────────────
  {
    id: 'funeral',
    title: 'مردات الجنازات والانتقال',
    icon: '🕊️',
    color: 'slate',
    description: 'مردات طقس الانتقال وتوديع المتنيّحين — تُعبّر عن رجاء القيامة ويقين المؤمن بلقاء المسيح، وهي من أعمق الطقوس في الكنيسة القبطية.',
    responses: [
      {
        arabic: 'الرب راعيَّ فلا يعوزني شيء — مزمور 23',
        copticArabic: 'بيثوييس بيساجوم — إنشي شتيم شوبي ناي',
        coptic: 'Ⲡ̀ϭⲟⲓⲥ ⲡⲁⲥⲁϫⲱⲙ⸒ ⲛ̀ϣⲉ ϣⲧⲉⲙ ϣⲱⲡⲓ ⲛⲏⲓ',
        meaning: 'رجاء المتنيّح في رعاية الرب — مزمور الجنازة',
        usage: 'يُرتَّل في قداس الجنازة تعبيراً عن ثقة المؤمن بالرب.',
      },
      {
        arabic: 'أنا القيامة والحياة — مَن آمن بي ولو مات فسيحيا',
        copticArabic: 'أنوك بي أناستاسيس نيم بي أونخ — بيتناهتف إيجروي إيشتيم إفموت — فناونخ',
        meaning: 'كلام المسيح عن القيامة — يوحنا ١١ : ٢٥',
        usage: 'يتلوها الكاهن عند تكفين المتنيّح وفي قداس الجنازة إعلاناً لرجاء القيامة.',
      },
      {
        arabic: 'اللهم أضئ وجهه كالشمس وضعه في كنف آبائنا إبراهيم وإسحق ويعقوب',
        copticArabic: 'أو بينوتي — ريف أوينين إن فيف هو إيمبير إيثي بيري — نيم إريتف إخن تي سيني إن ني ؤيؤت إن أبراهام نيم إيساك نيم يعقوب',
        meaning: 'صلاة الراحة والنور الأبدي',
        usage: 'يُقالها الكاهن في أوشية الانتقال طالباً للمتنيّح النور والراحة.',
      },
      {
        arabic: 'إن ربنا يسوع المسيح سيبعثنا في اليوم الأخير',
        copticArabic: 'جي بيننوتي إيسوس بيخريستوس — فنا تاون إن خاي إن بيهوو إن شا إيمبير',
        meaning: 'إعلان الإيمان بالقيامة العامة',
        usage: 'تُقال في صلوات الجنازة تذكيراً بيوم القيامة والحياة الأبدية.',
      },
      {
        arabic: 'أيها المتنيّح الجديد اذهب بسلام — المسيح يفتح لك أبواب الفردوس',
        copticArabic: 'أو باي إيبراي إن ووت — موشي خن أو إيريني — بيخريستوس إف أووين إيجروك إن ني بيري إم بارادايسوس',
        meaning: 'توديع المؤمن المنتقل إلى حضن الآب',
        usage: 'تُقال في نهاية قداس الجنازة عند خروج الجثمان لمواراة الثرى.',
      },
      {
        arabic: 'نياح يا نياح يا نياح في فردوس النعيم',
        copticArabic: 'موتن — موتن — موتن — خن بارادايسوس إن تي إيريني',
        coptic: 'Ⲙ̀ⲡⲁⲣⲁⲇⲓⲥⲟⲥ ⲛ̀ⲧⲉⲡⲓⲉⲓⲣⲏⲛⲏ',
        meaning: 'طلب الراحة والنعيم الأبدي',
        usage: 'يُرددها الشعب في لحن الجنازة القبطي تعبيراً عن الرجاء.',
      },
    ],
  },
  // ── قسم 13: مردات أسبوع الآلام ──────────────────────────────────────────────
  {
    id: 'holy-week',
    title: 'مردات أسبوع الآلام',
    icon: '✝️',
    color: 'violet',
    description: 'مردات الأسبوع الأعظم — أسبوع الآلام المقدس من أحد الشعانين حتى سبت النور — أطول وأعمق خدمة طقسية في السنة القبطية كلها.',
    responses: [
      {
        arabic: 'يا من لبس الجسد وصُلب من أجلنا ارحمنا',
        copticArabic: 'بيتاف شيبي إن أو سوما — أووو إيتاف سطاورو إيثبيتن — ناي إيجرون',
        meaning: 'صرخة التوسل في أسبوع الآلام',
        usage: 'تُقال في قداسات أسبوع الآلام تذكاراً لآلام المسيح من أجل البشرية.',
      },
      {
        arabic: 'إن الملك يدخل، أمام وجهه يجري العبيد',
        copticArabic: 'بي أورو إف إن ناو إيروف — إن جووي نيم إن إيبس',
        coptic: 'Ⲡⲟⲩⲣⲟ ⲉϥⲛ̀ⲛⲁⲩ ⲉⲣⲟϥ ⲛ̀ϭⲟⲩⲉⲓ ⲛⲉⲙ ⲛ̀ⲏⲃⲥ',
        meaning: 'مرد استقبال الملك الداخل — أحد الشعانين',
        usage: 'يُرتَّل في أحد الشعانين حين يدخل الإنجيل أو الكاهن المصلّي رمزاً لدخول المسيح.',
      },
      {
        arabic: 'أمام صليبك نسجد يا سيدنا',
        copticArabic: 'تين أووشت إم بيك إيستاوروس — بين ثوييس',
        coptic: 'Ⲧⲉⲛⲟⲩⲱϣⲧ ⲙ̀ⲡⲉⲕⲉⲥⲧⲁⲩⲣⲟⲥ Ⲡⲉⲛϭⲟⲓⲥ',
        meaning: 'سجدة الصليب في أسبوع الآلام',
        usage: 'يُقالها الشعب وهم يسجدون أمام الصليب في خدمات أسبوع الآلام.',
      },
      {
        arabic: 'يا من مات عنا ودُفن وقام وصعد إلى السماء بارك شعبك',
        copticArabic: 'بيتاف موت إيثبيتن — أوو إيتاف خارس — أووو إيتاف توون أف — أووو إيتاف لي إيفري — سمو إن لاك',
        meaning: 'اعتراف بآلام المسيح ومجده في أسبوع الآلام',
        usage: 'تُقال في صلوات خدمات أسبوع الآلام الليلية والنهارية.',
      },
      {
        arabic: 'تبارك مجيء الرب — أوصنا للمسيح ملك إسرائيل',
        copticArabic: 'فسماريووت إن بيجي إم بيثوييس — أوصنا إبيخريستوس بي أورو إن إيسرايل',
        meaning: 'ترحيب بالمسيح في أحد الشعانين',
        usage: 'يُقالها الشعب يوم أحد الشعانين أثناء الدورة الكنسية.',
      },
      {
        arabic: 'يا من صُلب من أجلنا تطوّع وصلّب نفوسنا مع أهوائنا وشهواتنا',
        copticArabic: 'بيتاف سطاورو إيثبيتن — ماك ستاورو إن ني بيسيخي — نيم ني باثوس — نيم ني إيبيثيميا',
        meaning: 'طلب المشاركة في صليب المسيح بالتوبة',
        usage: 'تُقال في خدمات أسبوع الآلام طلباً للتوبة الحقيقية.',
      },
    ],
  },
  // ── قسم 14: مردات الرسامات والتكريس ─────────────────────────────────────────
  {
    id: 'ordination',
    title: 'مردات الرسامات والتكريس',
    icon: '🫶',
    color: 'amber',
    description: 'المردات التي يُقالها الشعب والشمامسة عند رسامة الكهنة والشمامسة وتكريس الأعضاء في الكنيسة القبطية.',
    responses: [
      {
        arabic: 'أكسيوس، أكسيوس، أكسيوس',
        copticArabic: 'أكسيوس — أكسيوس — أكسيوس',
        coptic: 'Ⲁ̀ⲝⲓⲟⲥ Ⲁ̀ⲝⲓⲟⲥ Ⲁ̀ⲝⲓⲟⲥ',
        meaning: 'يستحق — مستحق للرسامة',
        usage: 'يُقالها الشعب ثلاث مرات إقراراً باستحقاق المُرسَم عند وضع الأيدي عليه.',
      },
      {
        arabic: 'صلوا من أجل المرسَم الجديد ليثبته الرب في خدمة قدسه',
        copticArabic: 'أريتن شيلهل — إجن باي إيبراي إن ووت — خيكاس إف تاجروف إنجي بيثوييس — خن تيف ديكونيا إيثؤاب',
        meaning: 'دعوة الشعب للصلاة على المرسَم',
        usage: 'يقولها الشماس حثاً للشعب على الصلاة عند كل رسامة.',
      },
      {
        arabic: 'يا رب أعطِه نعمة روحك القدوس لأداء الخدمة المقدسة المُوكلة إليه',
        copticArabic: 'بينوتي — أريتف ناف إن تيك خاريس إن بيك بنيوما إيثؤاب — إيبول خيتوتف إن تيف ديكونيا إيثؤاب إيتاوسف ناف',
        meaning: 'طلب موهبة الروح القدس للخادم الجديد',
        usage: 'يُقالها الكاهن المُرسِم وضاعاً يديه على رأس المُرسَم.',
      },
      {
        arabic: 'اللهم ثبّته في الإيمان ووفّقه في الخدمة وأقمه عوناً لرعيتك',
        copticArabic: 'أو بينوتي — تاجروف خن تي بيستيس — نيم إجن تيف ديكونيا — نيم ماف شوبي إن بوهيث إن لاك',
        meaning: 'صلاة الثبات والتوفيق في الخدمة الكنسية',
        usage: 'تُقال في نهاية طقس الرسامة صلاةً من الشعب على خادمهم الجديد.',
      },
    ],
  },
];

// ── أسئلة مع البابا شنودة الثالث ─────────────────────────────────────────────
export interface PopeShenoudaQA {
  q: string;
  summary: string;
}

export interface PopeShenoudaQAVideo {
  id: string;
  videoId: string;
  title: string;
  subtitle: string;
  category: string;
  icon: string;
  description: string;
  questions: PopeShenoudaQA[];
}

export const popeShenoudaQAVideos: PopeShenoudaQAVideo[] = [
  // ── فيديو 1 ── MO4gQ1I6DNY ─────────────────────────────────────
  {
    id: 'qa-people-varied',
    videoId: 'MO4gQ1I6DNY',
    title: 'سنوات مع أسئلة الناس للبابا شنودة الثالث',
    subtitle: 'تفريغ حرفي — أسئلة متنوعة روحية ولاهوتية وعملية',
    category: 'روحي وعملي',
    icon: '💡',
    description: 'تجميعة من أسئلة الشعب القبطي طُرحت على قداسة البابا شنودة الثالث — تفريغ حرفي لما نطق به قداسته بأسلوبه المصري البسيط.',
    questions: [
      { q: 'واحد بيقول انا شاب بحاول ابدا في حياه التوبه وعندما ابدا تهجم علي الافكار الخاطئه', summary: 'طبيعي ان الشيطان لما يقيك عايز تتوب يعكسك، فمفاد وتجاهد وكل ما ربنا يلاقيك بتجاهد وبتثبت نعمه ربنا تشتغل معاك وتساعدك ما تخافش ده شيء طبيعي' },
      { q: 'واحد بيقول والدي ووالدتي وقت ما اتجوزوا عملوا اكليل في كنيسه خمسينيه وهم الان معاهم ست اولاد فهل يعتبر زواجهم باطل ام لا وهل يعملوا اكليل ارثوذكسي من جديد بعد ما خلفوا اولاد؟', summary: 'مفروض ان علشان حياه م تكون ماشيه صح ياخدوا سر الزيجه من الكنيسه ولو في اوضه مغلقه من غير ما حد يحس بيهم ممكن يكونوا شهوتهم اولادهم.. يعني لازم. اما من جهه الاولاد لا ذنب لهم في شيء بس المهم اللي انا عايز اساله بالنسبه للاولاد دول هل عمدوهم عند الخمسينيين ولا عمدوهم ارثوذكس؟ ده اللي يهمنا ده اللي انت تسال عليه. لكن ابوك وامك يعني ربنا يعوض عليك فيهم لو انهم خدوا بركه الاكليل الارثوذكسي تبقى بركه كويسه ويبقى انت ق الى حياه سليمه لكن المهم بالنسبه لكم انتم اتعمدت ارثوذكسي ولا لا' },
      { q: 'واحد بيقول بعد عودتي للكنيسه بعد فتره انقطاع طويله دايما يجيني شكوك', summary: 'الشيطان برض بيحسدك على رجوعك للكنيسه وبيحارب، خليك شديد كده وثابت' },
      { q: 'واحد بيسال على لا تدعو لكم ابا على الارض', summary: 'موجوده في كتاب الكهنوت اجابه طويله عريضه على هذا الموضوع تقدر تقراها' },
      { q: 'واحد بيقول اختي وهي ملتزمه بتعليم الكنيسه قامت بتعميد ابنها وعمره حوالي 40 يوم وقد نسي الاب الكاهن ان يجحد الشيطان مع انه لم يكن موسم عماد.. فما كان من اختي الا ان اخبرت الاب الكاهن ولكن ذلك اثناء القداس.. فاخبرها انه نسي ذلك وقام عندئذ بجحد الشيطان اي بعد العماد', summary: 'ما يهمش احنا نجحد الشيطان في اي وقت هو طبعا مفروض ان يجحد الشيطان قبل العماد لكن اذا كان نسي الكاهن كان مفروض اختك تنبهه قبليها ومع ذلك ممكن جحد الشيطان في اي وقت ساعات ناس يخشوا في الزحمه وسط العماد ولا الاب الكاهن واخد باله مين دخل ومين ما دخلش ومين جحد ومين ماحدش معلش تتصلح' },
      { q: 'ما رايكم في خصام بعض الاباء الكهنه لاقاربهم؟', summary: 'طبعا عثره وحشه ومفروض الكاهن اللي بيصلح الاخرين ويصالحها يكون في علاقه طيبه مع اهله وقرايبه' },
      { q: 'اين يوجد ايليا واخنوخ الان؟', summary: 'معرفش هم طبعا موجودين في السماء في مكان ما' },
      { q: 'هل السيد المسيح موجود الان في الفردوس ام في سماء السماوات؟', summary: 'موجود في الفردوس وفي سماء السماوات وفي كل مكان' },
      { q: 'انا من سهاج واعمل مفتش تحقيقات ووالدي محامي بسهاج وارغب العمل بالمحاماه فهل هي مهنه حرام ام مسموح بها في المسيحيه؟', summary: 'مسموح طبعا حد يقدر يقول حرام بس انت كمحامي حامي عن المظلومين ودافع عن حقوق الناس وما تكونش عارف ان في واحد كله خطا وثابته الجريمه عليه وتقف تكذب في المحكمه جايز الشخص اللي ثبت الجريمه عليه تشرح الظروف المحيطه به والحاله النفسيه الموجوده والركن الادبي في القضيه ما دام الركن المادي ثابت وشغله المحاماه شغله حلوه وكويسه كل شغله في الدنيا ممكن الواحد يسلك فيها بامانه وممكن يسلك بغير امانه تتوقف على طبيعه الانسان من جوه' },
      { q: 'توجد في احدى الكنائس اجساد مستورده للانبا انطونيوس والانبا باخوميوس هل قداستكم سمحتم بذلك؟', summary: 'عايز اقول ان في هيئات اجنبيه بتوزع حاجات يقولوا دي رفاه قديسين الموضوع في الواقع يحتاج الى بحث شديد جدا يعني قريت مره في القائمه ان كاتبين جزء من جسد الانبا بوله ومافيش حد يعرف ابدا اين يوجد الانبا بوله ده وربنا اخفى جسده عن الناس حتى ان الانبا انطونيوس اللي راه لاول مره راح مره تاني للمكان فمعرفش هو مدفون فين او شفت في مره كاتبين جسد القديسه مريم القبطيه ومافيش حد يعرف مريم القبطيه دي فين فارجو الحرص الشديد ومش اصول كنيسه من الكنائس تحط اي حاجه من الرفات اللي بيعطى ليهم من الخارج غير لما اعتمد هذا الامر من البطريركيه عندنا هنا وليكن هذا الامر صريحا لكل الناس' },
      { q: 'ناس بيسالوا على المواعيد، قولوا ناتي من الساعه التالته والنصف ونظل واقفين امام الباب حتى الساعه الخامسه وعندما نسال ليه يقولون لنا ان المفتاح مع سيدنا وهو اللي بيبعت المفتاح على الساعه الخمسه', summary: 'طبعاً الكلام ده مش صحيح انا مش موجود معايا مفتاح وبقفل وببعت له الساعه خمسه الكلام ده ما حصلش. جايز المسؤولين عن النظام يعني مش عايزين الكاتدرائية تتلخبط من الساعه 3. هو احنا لما نعمل البطاقات الشخصية او لما الدوله تنفذ الرقم القومي يبقى سهل يتعرف عشان مافيش حد من عناصر مش مضبوطه تخش اللي جايين بدال ما يقف انا هشوف بحث هذا الموضوع واشوف له حل' },
      { q: 'هل الله خلق الانسان ليحل محل الملائكه الساقطين؟', summary: 'طبعاً لا.. خليقه الانسان خليقه منفرده بطبعها لها نوعيه خاصه.. فربنا اراد ان يخلق نوعاً جديداً مش بديل، نوعاً جديداً من المخلوقات الحيه العاقله المتصله بالماده والجسد المادي.. ولذلك نحن لا نعتقد اطلاقاً ان الانسان بديل' },
      { q: 'هل يصح الصيام بالماء والملح عند النذر بالرغم من ان بعض الأسس كاتبين ينفون هذا النوع من الصيام على اعتبار ان جميع الخضروات بها زيت؟', summary: 'المعروف حينما ينذر انسان بميه وملح اللي في ضميره مش اللي في معمل التحليل. فاللي بينذر ميه وملح بينذر انه ياكل اي حاجه بس ما بيستعملش حاجات فيها زيت صرف.. وكل واحد بينذر حسب ضميره والله هو فاحص القلوب وعارف كل واحد قلبه فيه ايه' },
      { q: 'اذا كان هيرودس يريد قتل الصبي لماذا لم يرسل هيرودس مع المجوس جنود من عنده حتى يخبره بالخبر المؤكد؟', summary: 'هيرودس لم يصل الى الذكاء بتاع صاحب السؤال ده وما بعتش جنود. هو حب ان المجوس ناس عاديين ماشيين هيخشوا اي بيت ماحدش ياخد باله منهم فلما يعرفوا يقولوا له بعد كده يبعت الجنود.. لكن يبعت جنود معاهم يبصوا يلاقوا الناس دول داخلين بجنود طب ما يبقى الحكايه انكشفت وهو مش عايزها تبقى مكشوفه' },
      { q: 'هل كتب القديسون الاربعه الانجيليون البشائر مقسمه الى اصحاحات وايات؟', summary: 'لا طبعاً كاتبين الانجيل كله ورا بعضه مافيش لا تقسيم لا اصحاحات ولا دي.. جت فيما بعد في قرون متاخره ولذلك نجد ان المخطوطات القديمه للاناجيل ما فيهاش هذه التقاسيم ابدا' },
      { q: 'لماذا سميت قداستكم باسم الثالث والبابا كيرلس باسم السادس؟', summary: 'التسمية تعتمد على تسلسل الآباء البابوات الذين حملوا نفس الاسم تاريخياً، فالبابا شنودة الثالث جاء بعد البابا شنودة الأول والثاني، والبابا كيرلس السادس جاء بعد البابا كيرلس الخامس الذي تنيح منذ حوالي 60 عاماً' },
      { q: 'ما هو التعليم الكتابي حول عدم مفارقة اللاهوت للناسوت بعد موت السيد المسيح؟', summary: 'أكد البابا أن لاهوت السيد المسيح لم يفارق ناسوته منذ لحظة الاتحاد في بطن السيدة العذراء، وهذا يشمل حياته وموته وقيامته' },
      { q: 'استفسار بشأن ارتفاع أسعار مذكرات اللاهوت التي تباع بأسعار مبالغ فيها', summary: 'نصح البابا الطلاب بعدم شراء الكتب بأسعار غالية، ووعد بإصدار طبعات حديثة من كتبه بأسعار زهيدة وفي متناول الجميع' },
      { q: 'لماذا كان السيد المسيح يطلب أحياناً عدم الإخبار بالمعجزة؟', summary: 'أشار البابا إلى أن الظرف يختلف من حالة لأخرى، ففي بعض المواقف كان يطلب الصمت لأسباب محددة، وفي مواقف أخرى كان يأمر بالتبشير بما صنعه الرب' },
      { q: 'هل تصرف يهوذا كان بإرادته أم بفعل الشيطان؟', summary: 'أوضح البابا أن إرادة يهوذا استسلمت لعمل الشيطان، وأن الشيطان ليس له قوة إرغام بل يعتمد على الاقتراح والإغراء، والإنسان هو المسؤول عن قبول أو رفض تلك الأفكار' },
      { q: 'كيف نفرق بين الفكرة الشريرة الناتجة من القلب والفكرة الناتجة عن الشيطان؟', summary: 'الفكرة الشريرة الناتجة عن الشيطان تأتي من الخارج ويقاومها القلب من الداخل. أما الفكرة التي تأتي من داخل القلب فلا توجد فيها مقاومة داخلية، بل فيها رضا واتفاق وتنفيذ' },
      { q: 'قد وعدتم بإصدار كتاب عن الأرواح من سنوات', summary: 'أوضح البابا أنه يدرس الكتب التي ظهرت في هذا المجال (مثل كتب التقمص/الري إنكارنيشن) سواء المترجمة من الخارج أو التي كتبها علماء الأرواح في مصر، ليجمع مادة بحثية شاملة قبل إصدار الكتاب' },
    ],
  },
  // ── فيديو 2 ── Mgg_SYExZ5g ─────────────────────────────────────
  {
    id: 'qa-people-part5',
    videoId: 'Mgg_SYExZ5g',
    title: 'مع أسئلة الناس — تفريغ حرفي',
    subtitle: 'تفريغ حرفي — عزازيل وإنجيل برنابا والصوم والكنيسة المعلقة',
    category: 'روحي وعملي',
    icon: '🕊️',
    description: 'تفريغ حرفي لجلسة أسئلة وأجوبة مع قداسة البابا شنودة الثالث — يتناول موضوعات عقدية وكنسية وعملية بأسلوبه المصري الأصيل.',
    questions: [
      { q: 'سؤال حول مقالة الدكتور مصطفى محمود عن "عبادة الشيطان" وكلمة "عزازيل"', summary: 'عزازيل ليس هو الشيطان وليس اسماً من أسماء الشيطان.. الشيطان له أربعة أسماء وردت في سفر الرؤية: الشيطان وإبليس والحية القديمة والتنين.. عزازيل جاية من العزل يعني معزول.. كان فيه ذبيحتين: ذبيحة على حيوان يذبح ويقدم كذبيحة خطية، والثاني يعزل ويلقى بعيداً في البرية لا يراه أحد ولا يسمع عنه أحد، تذكاراً للآية التي تقول في المزامير: كبعد المشرق عن المغرب أبعد عنا معاصينا' },
      { q: 'ما رأيكم في الهجوم على التوراة بسبب العداوة لليهود؟', summary: 'يبدو أن في هذه الأيام نتيجة العداوة لليهود التي اشتدت جداً وخصوصاً بعد موقف نتنياهو المتعنت ضد العرب، بدأ هجوم شعبي كثير على اليهود، فالبعض افتكر أنهم لما يهاجموا اليهود هجموا التوراة، ومش عارفين أن التوراة دي بتاعتنا إحنا كمان مش بس بتاعة اليهود' },
      { q: 'هل هناك خطورة من زيارة إفريقيا (زائير)؟', summary: 'قد أُلغيت رحلتنا إلى زائير نتيجة للحرب المدنية الموجودة هناك.. أنا مش هروح زائير وما تخافوش، نعم ربنا يحفظ سلام.. وحتى لو ذهبنا إلى زائير وحتى لو دخلنا وسط زائير الأسود حتى ما تخافوش' },
      { q: 'ما رأيكم في ما يسمى "إنجيل برنابا"؟', summary: 'أنا ألقيت محاضرات عديدة جداً عن إنجيل برنابا.. وأرجو أن أنشر كتاب عن خرافة إنجيل برنابا.. وهو قد تُرجم إلى العربية وكان يُباع في مكتبة الأزهر على المعظم.. ما يسمى بإنجيل برنابا لا يقبله لا المسيحي ولا اليهودي ولا المسلم.. هو إنجيل مزيف يرجع إلى القرن الخامس عشر.. واسم برنابا لم يرد في القرآن إطلاقاً' },
      { q: 'رغبة البابا في التفرغ للكتابة', summary: 'عبر البابا عن أمنيته في الحصول على فترة راحة ليتفرغ لمكتبته، بهدف مراجعة وتنقيح محاضراته وتحويلها إلى كتب مطبوعة بأسلوب لغوي رصين ومناسب للنشر، بعيداً عن أسلوب الارتجال في المحاضرات العامة' },
      { q: 'لماذا لا يتم اتخاذ موقف سريع من اجتماعات دانيال البرموسي؟', summary: 'ما دام راهب تزوج أو قس تزوج يبقى يسقط عنه رتبة الكهنوت فلا يصير لا قساً ولا قمصاً ولا راهباً لأنه تزوج.. هو الذي اختار لنفسه هذا الطريق.. أنا مرت علي شهور كنت في كل اجتماع أربع في الكاتدرائية أمسك نقطة من نقط البدع بتاعته وأتكلم ضدها.. هو بروتستانتي رسمي.. طلبنا حضوره ورفض' },
      { q: 'لماذا يحصل الطالب على 13 من 20 ويريد أن يكون تحت الرعاية؟', summary: 'شوفوا يا جماعة لا تطلبوا.. إحنا مش عايزينكم تنجحوا بالرأفة ولا تنجحوا على الحركرك، ده أمر لا يليق بكم.. مفروض إنكم تاخدوا نمر نهائية لكن ما يجيش بتوع الرعاية يطلبوا أن يكونوا تحت الرعاية' },
      { q: 'ما هو الموقف من ترميم الكنيسة المعلقة؟', summary: 'مشكلتنا مع الكنيسة المعلقة هي تأكل الأساسات.. كل ما كنا نرجوه بالنسبة للكنيسة المعلقة أمران: الأمر الأول ترميم الأساسات التي تحت الكنيسة، والأمر الثاني أن شركة هندسية متخصصة في ترميم الأساسات تقوم بالموضوع' },
      { q: 'هل توافق على إنتاج فيلم عن زيارة العائلة المقدسة؟', summary: 'إحنا نوافق على كله، بس يعني أنا ماعرفش اللي يخرجوا فيلم زي ده يخرجوه إزاي، لأن الدنيا اتغيرت.. البلاد التي زارتها العائلة المقدسة ليست هي البلاد الموجودة الآن لا في شكلها ولا في مبانيها ولا حتى في اسمها.. حتى الكنائس الموجودة أثناء زيارة العائلة المقدسة لم تكن موجودة.. مافيش كنائس كانت موجودة في طفولة السيد المسيح.. أتركها لكم' },
      { q: 'الآباء الكهنة لم يحصلوا على العلاوة السنوية من ثلاث سنوات', summary: 'أشك في هذا، على كل هراجع هذه الأمور وهشوف إيه اللي يتعمل بكره، هو بس يعني نتيجة ما إن إحنا عايزين يكونوا في أحسن وضع' },
      { q: 'شكوى من تعليم كاهن يكرر أن أنبياء العهد القديم "سراق ولصوص"', summary: 'طبعا زعلان من التعليم المحزن والمؤسف لبعض الآباء.. أنا طبعا جاوبت على دي في الجزء الأول من سنوات مع أسئلة الناس.. وقال إنها آراء تختلف، ولما قالوله على الكلام اللي أنا قلته، قال أنا لي رأي، والبطريرك ليه رأي.. هو حاطط نفسه في هذه المستويات.. وللأسف أن الكاهن ده إكليريكي' },
      { q: 'ماذا عن الأشخاص الذين يرتدون ملابس علمانية وسط طلبة الكلية الإكليريكية؟', summary: 'إيه اللي حشر وسط النهار؟ إيه اللي قعد وسط الطلبة الإكليريكيين اللي لابسين ملابس رسمية؟ نقول لك ولم يرجع إلا هذا الإنسان الغريب الجنس' },
      { q: 'هل يمكن للمريضة أن تتناول وهي مريضة بعدة أمراض وتأكل لحماً وتشرب لبناً في الصيام؟', summary: 'دي لازم تجيب لي شهادة من الطبيب المعالج، واخدين بالكم، لكن مجرد أنها تقول أنا بهذا الشكل لا يكفي.. قوانين الكنيسة تسمح بالإعفاء من الصوم للمرضى والأطفال والشيوخ والحبالى والمرضعات.. لكن طبعاً هناك فرق بين نص القانون واستغلال القانون استغلالاً سيئاً.. الدين هو روح وليس نصوصاً وليس مجرد قوانين.. نصيحتي ليكي إنك تتناولي يوم الحد اللي ما فيهوش انقطاع، تكوني لحقتِ خلصتِ القداس وتناولتِ ورحتِ صايمة' },
      { q: 'أوعدي أسبوع الآلام تفطري ولو كنت في غرفة الإنعاش', summary: 'ممكن تقولي لي أب اعترافي سامح ما سامحش، تروحي تعيطي لله شوية وتقولي له هموت يا أبونا ضايعة يا أبونا يقول لك طب خلاص يا بنتي اللي هيحلك وتخرج بالحل كده بصنعة لطافة' },
      { q: 'نصيحة للتعامل مع الرغبة في تناول أطعمة معينة عند الإفطار للضرورة', summary: 'نقطة تاني في الفطار إذا سمح لك بالفطار نتيجة لأمراضك الكثيرة لا تأكلي طعاماً شهوانياً.. يعني برضه اسمك بتفطري مع ضبط النفس.. مثال كده واحدة يوصفوا لها بيض فتسلق البيضة وتأكلها لكن هي ليها نفس أن البيضة تكون مقلية بالسمن.. لا خليكي في ضبط النفس' },
      { q: 'بخصوص الكوليسترول والأطعمة المسموح بها للمريضة', summary: 'وما دام أنتِ مريضة بأمراض كثيرة، يبقى جايز الكوليسترول بالنسبة لكِ مضر، فأنصحك لو الكوليسترول بيتعبك تبتعدي عن الحاجات اللي فيها كوليسترول.. نعم البيض والسمنة والزبدة واللحمة' },
      { q: 'بخصوص التدخل في بعض المقالات التي تثير فتنة', summary: 'محدش يعرف إزاي دخل كده.. غلط' },
      { q: 'ختام الجلسة', summary: 'لا، سهر الست دي هتقول يا ريتني ما سألت.. نكتفي بكده، اتفضل نصلي' },
    ],
  },
  // ── فيديو 3 ── T6YvEuFgpOg ─────────────────────────────────────
  {
    id: 'qa-confession-father',
    videoId: 'T6YvEuFgpOg',
    title: 'كيف أختار أب اعترافي؟ — سنوات مع أسئلة الناس',
    subtitle: 'تفريغ حرفي — معايير اختيار الأب الروحي',
    category: 'حياة روحية',
    icon: '🙏',
    description: 'مقطع مركز من سلسلة "سنوات مع أسئلة الناس" — يُجيب البابا شنودة الثالث على سؤال جوهري في الحياة الروحية بأسلوبه الحرفي المصري.',
    questions: [
      { q: 'كيف اختار أب اعترافي؟', summary: 'لف على كذا واحد مدام لسه ما اعترفتش، وشوف الشخص الحنين اللي يقبل اعترافاتك بدون ما يحرجك ويتعبك، واللي يكون إرشاده إرشاد كويس يخلصك من الخطية، واللي يكون بيصلي من أجلك إنك تتوب.' },
    ],
  },
  // ── فيديو 4 ── G9CjlnjX01s ─────────────────────────────────────
  {
    id: 'qa-heavenly-degrees',
    videoId: 'G9CjlnjX01s',
    title: 'سنوات مع أسئلة الناس لمثلث الرحمات قداسة البابا شنودة الثالث',
    subtitle: 'تفريغ حرفي — أسئلة لاهوتية وروحية وعملية',
    category: 'لاهوت وعقيدة',
    icon: '🌟',
    description: 'تفريغ حرفي لجلسة أسئلة وأجوبة مع مثلث الرحمات قداسة البابا شنودة الثالث — يتناول درجات الملكوت، والروح بعد الجسد، والمسامحة، والضيقات، وأسئلة روحية وعملية متنوعة.',
    questions: [
      { q: 'هل هناك درجات في السماء (الملكوت) أم الجميع متساوون في السعادة؟', summary: 'طبعاً الكل هيكون فرحان وسعيد في الملكوت، لكن في درجات، زي ما الكتاب بيقول "نجم يمتاز عن نجم في الضياء". كل واحد هياخد مكافأته على قد تعبه وجهاده على الأرض. اللي تعب أكتر وجاهد أكتر مكافأته هتكون أكبر، لكن في النهاية الكل هيكون شبعان برؤية ربنا والوجود معاه، ومفيش حد هيحس بنقص لأن الكل هيكون في ملء الفرح.' },
      { q: 'هل الروح تعرف ما يحدث على الأرض بعد فارقت الجسد؟', summary: 'نعم، الأرواح في الفردوس عندها نوع من المعرفة باللي بيحصل على الأرض، وخصوصاً الحاجات اللي بتخص خلاصنا. هما بيصلوا من أجلنا، وشفاعة القديسين أكبر دليل على كده. إحنا والمنتقلين بنكون كنيسة واحدة، هما كنيسة منتصرة وإحنا كنيسة مجاهدة، والحب اللي بيننا بيخلي فيه صلة مستمرة بالصلاة.' },
      { q: 'كيف أسامح شخصاً أساء إليّ إساءة بالغة ولا أستطيع نسيانها؟', summary: 'المسامحة مش معناها إنك تمسح الذكرى من دماغك، الذاكرة مش بتمسح بقرار. لكن معناها إنك "ما تنتقمش"، وما تشيلش رغبة في رد الإساءة. لما تلاقي نفسك قادر تصلي للشخص ده وتطلب له الخير يبقى أنت سامحته. ومع الوقت ربنا بينزع المرارة من قلبك، وتتحول الإساءة لمجرد ذكرى قديمة مابتوجعش.' },
      { q: 'لماذا لُعنت شجرة التين رغم أنها كانت في غير موعد ثمارها؟', summary: 'شجرة التين كانت ترمز للرياء. المعروف إن التين بيطلع مع الورق أو قبله، فلما المسيح شاف ورق كتير المفروض يكون فيه ثمر. هي كانت بتدي مظهر كاذب، زي الإنسان اللي عنده مظهر التقوى الخارجي (الورق) لكن قلبه خالي من الثمر الروحي. فالمسيح لعن فيها "الرياء" علشان يعلمنا إن الجوهر أهم من المظهر.' },
      { q: 'لماذا يسمح الله بالضيق للأبرار بينما نجد الأشرار في رغد من العيش؟', summary: 'الضيق للأبرار هو تنقية، زي النار لما بتنقي الذهب من الشوائب، وهو كمان علشان زيادة إكليلهم في السماء. أما رغد الأشرار فهو وقتي ومحدود بالأرض، وربنا بيطيل أناته عليهم لعلهم يتوبوا ويرجعوا. لازم نفتكر دايماً قصة الغني ولعازر؛ المهم هو النهاية الأبدية مش الوضع المؤقت اللي إحنا عايشينه.' },
      { q: 'هل هناك ما يسمى بالحظ أو النصيب في المسيحية؟', summary: 'مفيش حاجة اسمها حظ أعمى، لكن فيه "تدبير إلهي". ربنا ضابط الكل وعارف كل شيء وبيسمح باللي فيه الخير لينا. اللي الناس بتسميه حظ هو في الحقيقة فرصة ربنا بيديها للإنسان، أو نتيجة تعب قديم، أو تدبير إلهي إحنا مش فاهمينه دلوقتي وهنفهمه بعدين.' },
      { q: 'كيف أتعامل مع الغيرة من نجاح الآخرين؟', summary: 'الغيرة هي نقص في المحبة وعدم ثقة في تدبير ربنا. علاجها إن الإنسان يدرب نفسه يشكر ربنا على العطايا اللي بيديها لغيره، ويصلي من أجل نجاحهم. افتكر إن كل واحد ليه وزناته الخاصة، ومسئوليتك قدام ربنا بتختلف عن غيرك، افرح لفرح الآخرين ربنا يفرحك.' },
      { q: 'كيف أمتنع عن خطية النميمة أو الإدانة وأنا أعيش في وسط يتحدث دائماً عن الآخرين؟', summary: 'إذا بدأ من حولك في الكلام عن الآخرين، حاول تغير مجرى الحديث بحكمة، أو اذكر صفة كويسة في الشخص اللي بيذموه. إذا ما قدرتش، فالانسحاب من الجلسة أفضل من المشاركة في الخطية بالسمع، لأن اللي بيسمع النميمة شريك فيها زي اللي بيقولها بالظبط.' },
      { q: 'هل يصح نذر شيء لله ثم الرجوع فيه أو تغييره؟', summary: 'الكتاب بيقول "أن لا تنذر خير من أن تنذر ولا تفي". النذر ده وعد قاطع لربنا. إذا كان فيه عذر قاهر يمنع الوفاء بيه، لازم تستشير أب الاعتراف أو الأسقف علشان يلاقوا حل أو استبدال النذر بشيء تاني، لكن ما ينفعش تهمله ببساطة كأنك ما وعدتش.' },
      { q: 'هل الكذب الأبيض لإنقاذ موقف مسموح به في المسيحية؟', summary: 'مفيش في المسيحية حاجة اسمها كذب أبيض وكذب أسود، الكذب هو كذب. قد يلجأ الإنسان للحكمة أو الصمت في مواقف معينة، لكن ما يبنيش نجاته على أساس من الباطل. الصدق هو صفة أولاد الله، والرب قال إن الشيطان هو "أبو الكذاب".' },
      { q: 'سؤال: لاهوت المسيح — هل فارق ناسوته وقت الموت على الصليب؟', summary: 'إطلاقاً، لاهوته لم يفارق ناسوته لحظة واحدة ولا طرفة عين. في الموت، فارقت الروح البشرية الجسد البشري، ولكن لاهوته ظل متحداً بروحه وظل متحداً بجسده في القبر، وعشان كدا الجسد لم يرَ فساداً.' },
      { q: 'كيف تكون المحبة للأعداء ممكنة عملياً؟', summary: 'المحبة للأعداء لا تعني بالضرورة العاطفة أو إنك تاخدهم بالأحضان، بل تعني ألا تضمر لهم شراً، وألا تشمت في مصيبتهم، وأن تساعدهم إذا كانوا في احتياج، وأن تصلي لكي يهديهم الله. هي قرار إرادي بالخير تجاههم.' },
      { q: 'هل من الممكن أن نطلق على السيدة العذراء لقب "شريكة في الفداء"؟', summary: 'لقب "شريكة في الفداء" لقب غير لاهوتي وغير دقيق، لأن الفادي واحد هو السيد المسيح وحده، هو اللي مات وهو اللي سفك دمه. العذراء اشتركت في التجسد الإلهي وهي اللي قدمت الجسد للمسيح، لكن الفداء عمل خاص بلاهوت المسيح المتحد بناسوته وحده. إحنا بنكرمها كأعظم القديسين، لكن ما نخلطش بين مقامها وبين عمل الفادي.' },
      { q: 'لماذا خلق الله الشيطان وهو يعلم مسبقاً أنه سيسقط ويغوي الإنسان؟', summary: 'ربنا خلق الشيطان ملاكاً نورانياً (عزائيل)، وخلقه بـ "إرادة حرة". الله لا يخلق شراً لكنه يخلق كائنات حرة، وهذه الكائنات هي التي تختار أن تكون خيرة أو شريرة. لو ربنا خلقنا مجبرين على الخير كنا بقينا زي الآلات. وسقوط الشيطان لم يعطل خطة الله، بل الله استغل حتى هذا الشر لكي يظهر محبته وفداءه للإنسان.' },
      { q: 'هل من حق الزوج أن يمنع زوجته من الذهاب للكنيسة أو ممارسة اعترافها؟', summary: 'الزواج مش عملية استعباد، ده شركة في الحياة. لا يجوز للزوج إنه يمنع زوجته عن ممارسة حياتها الروحية، لأن علاقة الإنسان بربنا دي علاقة خاصة ومقدسة. مفروض الزوج يشجع زوجته على الصلاة والاعتراف مش يعطلها. لكن الزوجة لازم تكون حكيمة، ما تروحش الكنيسة وتقضي وقت طويل وتسيب بيتها وأولادها مهملين أو زوجها محتاج حاجة، الحكمة واجبة من الطرفين.' },
      { q: 'هل يجوز للمسيحي أن يتبرع بأعضائه بعد وفاته؟', summary: 'الكنيسة لا تمانع في التبرع بالأعضاء بعد الوفاة، بل بالعكس دي تعتبر نوع من أنواع المحبة والتضحية من أجل إنقاذ حياة إنسان آخر. بس المهم يكون ده نابع من رغبة الإنسان وبدون تجارة في الأعضاء، يعني يكون غرضها إنساني بحت.' },
      { q: 'كيف أتعامل مع أهل زوجي الذين يضايقونني باستمرار؟', summary: 'بالصبر والحكمة والمحبة. "الجواب اللين يصرف الغضب". حاولي تكسبي ودهم بالكلمة الحلوة والمعاملة الطيبة، وافتكري إنهم أهل زوجك يعني بمثابة أهلك. إذا زادت المضايقات، حاولي تضعي حدوداً بـ"أدب" ومن غير صدام، وخلي زوجك هو اللي يتدخل بحكمة لفض المشاكل من غير ما يخسر أهله ولا يخسرك.' },
      { q: 'واحد بيسأل عن قراءة الأبراج — هل دي حرام؟', summary: 'طبعاً حرام وغير مستحبة. المسيحي بيؤمن بـ"العناية الإلهية" مش بحركة الكواكب. إنك تفتح الجرنان وتشوف حظك إيه النهاردة، ده نوع من الضعف في الإيمان. إحنا حياتنا في إيد ربنا مش في إيد برج الحمل ولا العقرب.' },
    ],
  },
  // ── فيديو 5 ── 6C4pGYI31fE ─────────────────────────────────────
  {
    id: 'qa-bible-heresies',
    videoId: '6C4pGYI31fE',
    title: 'شباب يطلبون من البابا إثبات عدم تحريف الإنجيل',
    subtitle: 'تفريغ حرفي — الرد على شبهات الكتاب المقدس',
    category: 'كتاب مقدس',
    icon: '📖',
    description: 'تفريغ حرفي لجلسة يرد فيها مثلث الرحمات البابا شنودة الثالث على أسئلة الشباب حول مصداقية الكتاب المقدس ولاهوت المسيح.',
    questions: [
      { q: 'سؤال من أحد الشباب يطلب أدلة على عدم تحريف الإنجيل', summary: 'الإنجيل كان منتشر في كل العالم بلغات كتيرة من القرون الأولى؛ قبطي وسرياني ويوناني ولاتيني. فلو حد حب يحرف في بلد، النسخ التانية اللي في البلاد التانية هتفضحه. ومين اللي ه يحرف؟ ولصالح مين؟ وهل اجتمع كل مسيحيين العالم في وقت واحد علشان يغيروا كل النسخ اللي في إيديهم؟ ده مستحيل عقلياً وتاريخياً. ده غير إن اقتباسات الآباء من الإنجيل في كتاباتهم لو جمعناها نقدر نكتب الإنجيل كله تاني من غير ما ننقصه كلمة.' },
      { q: 'كيف نرد على من يقول إن المسيح لم يقل "أنا الله فاعبدوني" بلفظها الصريح؟', summary: 'الإيمان مش بيتاخد من جملة واحدة، لكن من كل أعمال وأقوال المسيح. هو غفر الخطايا، ومين يغفر الخطايا إلا الله وحده؟ وقبل السجود، وقال "أنا والآب واحد"، وقال "من رآني فقد رأى الآب". الأفعال والصفات الإلهية اللي نسبها لنفسه وأكدها بمعجزاته أقوى بكتير من مجرد اللفظ، والرسل آمنوا بيه ونادوا بلاهوته في كل مكان.' },
      { q: 'هل يمكننا الاعتماد على العقل وحده في فهم الأمور اللاهوتية؟', summary: 'العقل له دور كبير، لكن العقل محدود واللاهوت غير محدود. إحنا بنستخدم العقل علشان نفهم اللي نقدر عليه، لكن فيه أمور بنقبلها بـ"الإيمان" اللي هو فوق مستوى العقل مش ضده. العقل يقودنا لباب الإيمان، وبعدين الإيمان هو اللي يدخلنا جوه الأسرار الإلهية. زي ما العين بتشوف لحد أفق معين كدا العقل له حدود في إدراك ذات الله.' },
      { q: 'إذا كان المسيح هو الله فكيف كان يأكل ويشرب وينام ويتألم؟', summary: 'لأنه أخذ جسداً حقيقياً، صار إنساناً كاملاً. لاهوته لم يمنع ناسوته من ممارسة الصفات البشرية الطبيعية إلا الخطية وحدها. هو جاع لكي يبارك طعامنا، وتألم لكي يشعر بآلامنا. لو لم يأكل ويشرب ويتألم لكان جسده جسداً خيالياً وما كانش الفداء يبقى حقيقي. هو إله كامل وإنسان كامل في نفس الوقت.' },
      { q: 'لماذا تمنع المسيحية تعدد الزوجات؟', summary: 'لأن ربنا من البدء خلق "ذكراً وأنثى"، آدم وحواء واحدة. والمسيح قال "يترك الرجل أباه وأمه ويلتصق بامرأته ويكون الاثنان جسداً واحداً". كلمة "الاثنان" تمنع الثلاثة والأربعة. الزواج في المسيحية هو صورة لاتحاد المسيح بالكنيسة، والمسيح له كنيسة واحدة، والكنيسة لها مسيح واحد.' },
    ],
  },

];

export const popeShenoudaQACategories = ['الكل', 'روحي وعملي', 'حياة روحية', 'لاهوت وعقيدة', 'كتاب مقدس', 'أسرة ومجتمع'];
