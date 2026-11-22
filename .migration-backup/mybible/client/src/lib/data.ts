export interface Verse {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  testament: 'old' | 'new';
}

export interface DailyReading {
  id: string;
  oldTestament: { book: string; chapters: string };
  newTestament: { book: string; chapters: string };
  psalm?: { chapter: number };
  proverb?: { chapter: number; verses: string };
  estimatedMinutes: number;
}

export interface ReadingPlan {
  id: string;
  name: string;
  duration: string;
  daysTotal: number;
  description: string;
  progress?: number;
}

export interface Emotion {
  id: string;
  name: string;
  icon: string;
  color: string;
  verses: string[];
}

export interface Topic {
  id: string;
  name: string;
  icon: string;
  verses: string[];
}

export interface ChildStory {
  id: string;
  title: string;
  summary: string;
  ageGroup: string;
  imageUrl?: string;
  content: string;
}

export const dailyVerse: Verse = {
  id: 'john-3-16',
  book: 'يوحنا',
  chapter: 3,
  verse: 16,
  text: 'لأَنَّهُ هكَذَا أَحَبَّ ٱللهُ ٱلْعَالَمَ حَتَّى بَذَلَ ٱبْنَهُ ٱلْوَحِيدَ، لِكَيْ لاَ يَهْلِكَ كُلُّ مَنْ يُؤْمِنُ بِهِ، بَلْ تَكُونُ لَهُ ٱلْحَيَاةُ ٱلأَبَدِيَّةُ.',
  testament: 'new'
};

export const todayReading: DailyReading = {
  id: 'today-1',
  oldTestament: { book: 'التكوين', chapters: '1-2' },
  newTestament: { book: 'متى', chapters: '1' },
  psalm: { chapter: 1 },
  proverb: { chapter: 1, verses: '1-7' },
  estimatedMinutes: 12
};

export const readingPlans: ReadingPlan[] = [
  { id: 'plan-30', name: 'خطة ٣٠ يوم', duration: '30 يوم', daysTotal: 30, description: 'اقرأ أهم قصص الكتاب المقدس', progress: 12 },
  { id: 'plan-60', name: 'خطة ٦٠ يوم', duration: '60 يوم', daysTotal: 60, description: 'رحلة عبر العهد الجديد كاملاً' },
  { id: 'plan-90', name: 'خطة ٩٠ يوم', duration: '90 يوم', daysTotal: 90, description: 'دراسة معمقة للإنجيل والرسائل' },
  { id: 'plan-180', name: 'خطة ٦ شهور', duration: '6 شهور', daysTotal: 180, description: 'قراءة شاملة للكتاب المقدس' },
  { id: 'plan-365', name: 'خطة سنة كاملة', duration: 'سنة', daysTotal: 365, description: 'اقرأ الكتاب المقدس بالكامل في عام' }
];

export const emotions: Emotion[] = [
  { id: 'sadness', name: 'حزن', icon: '😢', color: 'blue', verses: ['مزمور 34:18', 'متى 5:4', 'رومية 8:28'] },
  { id: 'fear', name: 'خوف', icon: '😨', color: 'purple', verses: ['إشعياء 41:10', 'مزمور 23:4', '2 تيموثاوس 1:7'] },
  { id: 'anxiety', name: 'قلق', icon: '😰', color: 'orange', verses: ['فيلبي 4:6-7', 'متى 6:34', '1 بطرس 5:7'] },
  { id: 'tiredness', name: 'تعب', icon: '😩', color: 'gray', verses: ['متى 11:28', 'إشعياء 40:31', 'مزمور 62:1'] },
  { id: 'joy', name: 'فرح', icon: '😊', color: 'yellow', verses: ['فيلبي 4:4', 'مزمور 16:11', 'نحميا 8:10'] },
  { id: 'loneliness', name: 'وحدة', icon: '🥺', color: 'teal', verses: ['تثنية 31:6', 'مزمور 139:7-10', 'متى 28:20'] }
];

export const topics: Topic[] = [
  { id: 'work', name: 'العمل', icon: '💼', verses: ['كولوسي 3:23', 'أمثال 12:11', 'جامعة 9:10'] },
  { id: 'patience', name: 'الصبر', icon: '⏳', verses: ['يعقوب 1:4', 'رومية 12:12', 'غلاطية 6:9'] },
  { id: 'hope', name: 'الرجاء', icon: '🌅', verses: ['رومية 15:13', 'إرميا 29:11', 'عبرانيين 11:1'] },
  { id: 'service', name: 'الخدمة', icon: '🤝', verses: ['غلاطية 5:13', 'مرقس 10:45', 'متى 25:40'] },
  { id: 'faith', name: 'الإيمان', icon: '✝️', verses: ['عبرانيين 11:1', 'رومية 10:17', 'مرقس 11:24'] }
];

export const childStories: ChildStory[] = [
  {
    id: 'creation',
    title: 'قصة الخلق',
    summary: 'كيف خلق الله العالم في ستة أيام',
    ageGroup: '4-7 سنوات',
    content: 'في البداية، خلق الله السماوات والأرض. وكانت الأرض خالية ومظلمة. فقال الله: "ليكن نور!" فكان نور جميل. وفي كل يوم، خلق الله شيئًا جديدًا ورائعًا...'
  },
  {
    id: 'noah',
    title: 'نوح والفلك',
    summary: 'كيف أنقذ الله نوحًا وعائلته',
    ageGroup: '4-7 سنوات',
    content: 'كان نوح رجلاً صالحًا يحب الله. طلب الله من نوح أن يبني سفينة كبيرة جدًا تسمى الفُلك. جمع نوح الحيوانات من كل نوع...'
  },
  {
    id: 'david-goliath',
    title: 'داود وجليات',
    summary: 'الفتى الشجاع الذي هزم العملاق',
    ageGroup: '6-10 سنوات',
    content: 'كان داود فتى صغيرًا يرعى الغنم. وكان جليات عملاقًا ضخمًا يخيف الجميع. لكن داود كان يثق بالله. أخذ خمسة حجارة ومقلاعه...'
  },
  {
    id: 'jonah',
    title: 'يونان والحوت',
    summary: 'النبي الذي ابتلعه الحوت',
    ageGroup: '5-9 سنوات',
    content: 'طلب الله من يونان أن يذهب إلى مدينة نينوى. لكن يونان خاف وهرب في سفينة. فأرسل الله عاصفة كبيرة، وابتلعه حوت ضخم...'
  },
  {
    id: 'jesus-birth',
    title: 'ميلاد يسوع',
    summary: 'قصة ولادة المخلص في بيت لحم',
    ageGroup: '3-6 سنوات',
    content: 'في ليلة مباركة، وُلد يسوع في مدينة بيت لحم. وضعته أمه مريم في مذود. جاء الرعاة والمجوس ليسجدوا له...'
  },
  {
    id: 'good-samaritan',
    title: 'السامري الصالح',
    summary: 'قصة الرجل الذي ساعد غريبًا',
    ageGroup: '6-10 سنوات',
    content: 'روى يسوع قصة عن رجل سقط بين لصوص. مر كثيرون ولم يساعدوه. لكن رجلاً سامريًا طيبًا توقف وعالج جراحه واعتنى به...'
  }
];

export const sampleVerses: Verse[] = [
  { id: 'ps-23-1', book: 'مزمور', chapter: 23, verse: 1, text: 'اَلرَّبُّ رَاعِيَّ فَلاَ يُعْوِزُنِي شَيْءٌ.', testament: 'old' },
  { id: 'ps-23-2', book: 'مزمور', chapter: 23, verse: 2, text: 'فِي مَرَاعٍ خُضْرٍ يُرْبِضُنِي. إِلَى مِيَاهِ ٱلرَّاحَةِ يُورِدُنِي.', testament: 'old' },
  { id: 'ps-23-3', book: 'مزمور', chapter: 23, verse: 3, text: 'يَرُدُّ نَفْسِي. يَهْدِينِي إِلَى سُبُلِ ٱلْبِرِّ مِنْ أَجْلِ ٱسْمِهِ.', testament: 'old' },
  { id: 'ps-23-4', book: 'مزمور', chapter: 23, verse: 4, text: 'أَيْضًا إِذَا سِرْتُ فِي وَادِي ظِلِّ ٱلْمَوْتِ لاَ أَخَافُ شَرًّا، لأَنَّكَ أَنْتَ مَعِي. عَصَاكَ وَعُكَّازُكَ هُمَا يُعَزِّيَانِنِي.', testament: 'old' },
  { id: 'matt-5-3', book: 'متى', chapter: 5, verse: 3, text: 'طُوبَى لِلْمَسَاكِينِ بِٱلرُّوحِ، لأَنَّ لَهُمْ مَلَكُوتَ ٱلسَّمَاوَاتِ.', testament: 'new' },
  { id: 'matt-5-4', book: 'متى', chapter: 5, verse: 4, text: 'طُوبَى لِلْحَزَانَى، لأَنَّهُمْ يَتَعَزَّوْنَ.', testament: 'new' },
  { id: 'rom-8-28', book: 'رومية', chapter: 8, verse: 28, text: 'وَنَحْنُ نَعْلَمُ أَنَّ كُلَّ ٱلأَشْيَاءِ تَعْمَلُ مَعًا لِلْخَيْرِ لِلَّذِينَ يُحِبُّونَ ٱللهَ، ٱلَّذِينَ هُمْ مَدْعُوُّونَ حَسَبَ قَصْدِهِ.', testament: 'new' },
  { id: 'phil-4-13', book: 'فيلبي', chapter: 4, verse: 13, text: 'أَسْتَطِيعُ كُلَّ شَيْءٍ فِي ٱلْمَسِيحِ ٱلَّذِي يُقَوِّينِي.', testament: 'new' }
];

export const bibleBooks = {
  old: [
    'التكوين', 'الخروج', 'اللاويين', 'العدد', 'التثنية',
    'يشوع', 'القضاة', 'راعوث', '1 صموئيل', '2 صموئيل',
    '1 الملوك', '2 الملوك', '1 أخبار', '2 أخبار', 'عزرا',
    'نحميا', 'أستير', 'أيوب', 'المزامير', 'الأمثال',
    'الجامعة', 'نشيد الأنشاد', 'إشعياء', 'إرميا', 'مراثي إرميا',
    'حزقيال', 'دانيال', 'هوشع', 'يوئيل', 'عاموس',
    'عوبديا', 'يونان', 'ميخا', 'ناحوم', 'حبقوق',
    'صفنيا', 'حجي', 'زكريا', 'ملاخي'
  ],
  new: [
    'متى', 'مرقس', 'لوقا', 'يوحنا', 'أعمال الرسل',
    'رومية', '1 كورنثوس', '2 كورنثوس', 'غلاطية', 'أفسس',
    'فيلبي', 'كولوسي', '1 تسالونيكي', '2 تسالونيكي', '1 تيموثاوس',
    '2 تيموثاوس', 'تيطس', 'فليمون', 'عبرانيين', 'يعقوب',
    '1 بطرس', '2 بطرس', '1 يوحنا', '2 يوحنا', '3 يوحنا',
    'يهوذا', 'رؤيا يوحنا'
  ]
};

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export interface HighlightedVerse {
  verseId: string;
  color: HighlightColor;
  note?: string;
}
