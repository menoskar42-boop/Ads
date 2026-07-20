// دروس منظّمة للأطفال — مسارات تعليمية متدرّجة (مدرسة الأطفال)
// كل كورس فيه دروس بالترتيب؛ يُفتح الدرس التالي بعد إتمام السابق.
// المحتوى مُضمَّن (لا حاجة لخادم) ويُتتبَّع التقدّم في localStorage.

export interface KidsLesson {
  id: string;
  title: string;
  emoji: string;
  teaching: string;       // شرح مبسّط للطفل
  verse: string;          // نص الآية
  verseRef: string;       // مرجع الآية
  videoId?: string;       // فيديو يوتيوب اختياري
  quiz: {
    question: string;
    options: string[];
    correctIndex: number;
  };
}

export interface KidsCourse {
  id: string;
  title: string;
  emoji: string;
  color: string;          // تدرّج لوني (from-… to-…)
  description: string;
  lessons: KidsLesson[];
}

export const kidsCourses: KidsCourse[] = [
  {
    id: 'ot-stories',
    title: 'قصص العهد القديم',
    emoji: '📜',
    color: 'from-amber-500 to-orange-600',
    description: 'رحلة من الخلق إلى الأنبياء',
    lessons: [
      {
        id: 'ot-creation',
        title: 'الله خلق العالم',
        emoji: '🌍',
        teaching: 'في البداية خلق الله السماء والأرض، والنور والبحار والحيوانات، وأخيراً خلق الإنسان على صورته. كل ما خلقه الله كان حسناً جداً.',
        verse: 'فِي الْبَدْءِ خَلَقَ اللهُ السَّمَاوَاتِ وَالأَرْضَ.',
        verseRef: 'تكوين 1:1',
        quiz: {
          question: 'ماذا خلق الله في البداية؟',
          options: ['السماوات والأرض', 'السيارات', 'المدارس'],
          correctIndex: 0,
        },
      },
      {
        id: 'ot-noah',
        title: 'نوح والفُلك',
        emoji: '🌈',
        teaching: 'أمر الله نوحاً أن يصنع فُلكاً كبيراً لينجو هو وعائلته والحيوانات من الطوفان، لأن نوحاً كان باراً وأطاع الله. وبعد الطوفان وضع الله قوس قزح علامة عهده.',
        verse: 'فَعَمِلَ نُوحٌ حَسَبَ كُلِّ مَا أَمَرَهُ بِهِ الرَّبُّ هكَذَا فَعَلَ.',
        verseRef: 'تكوين 7:5',
        quiz: {
          question: 'لماذا صنع نوح الفُلك؟',
          options: ['للعب', 'لينجو من الطوفان بطاعة الله', 'للصيد'],
          correctIndex: 1,
        },
      },
      {
        id: 'ot-abraham',
        title: 'إيمان إبراهيم',
        emoji: '⭐',
        teaching: 'دعا الله إبراهيم ليترك بلده ويذهب إلى أرض جديدة، فآمن إبراهيم وأطاع بدون أن يخاف. ووعده الله أن نسله سيكون كنجوم السماء في الكثرة.',
        verse: 'فَآمَنَ إِبْرَاهِيمُ بِاللهِ فَحُسِبَ لَهُ بِرًّا.',
        verseRef: 'يعقوب 2:23',
        quiz: {
          question: 'بماذا تميّز إبراهيم؟',
          options: ['بالإيمان والطاعة', 'بالكسل', 'بالخوف'],
          correctIndex: 0,
        },
      },
      {
        id: 'ot-joseph',
        title: 'يوسف الأمين',
        emoji: '👑',
        teaching: 'باع إخوة يوسف أخاهم بسبب الحسد، لكن الله كان معه فصار عزيزاً في مصر. وعندما التقى بإخوته سامحهم، لأن الله حوّل الشر إلى خير.',
        verse: 'أَنْتُمْ قَصَدْتُمْ لِي شَرًّا، أَمَّا اللهُ فَقَصَدَ بِهِ خَيْرًا.',
        verseRef: 'تكوين 50:20',
        quiz: {
          question: 'ماذا فعل يوسف مع إخوته الذين أساؤوا إليه؟',
          options: ['انتقم منهم', 'سامحهم', 'هرب منهم'],
          correctIndex: 1,
        },
      },
      {
        id: 'ot-moses',
        title: 'موسى وعبور البحر',
        emoji: '🌊',
        teaching: 'اختار الله موسى ليُخرج شعبه من العبودية في مصر. وعندما وصلوا البحر الأحمر، شقّ الله البحر فعبر الشعب على اليابسة. الله يصنع المعجزات لأولاده.',
        verse: 'اَلرَّبُّ يُقَاتِلُ عَنْكُمْ وَأَنْتُمْ تَصْمُتُونَ.',
        verseRef: 'خروج 14:14',
        quiz: {
          question: 'كيف عبر الشعب البحر الأحمر؟',
          options: ['بالسباحة', 'الله شقّ لهم البحر', 'بالقارب'],
          correctIndex: 1,
        },
      },
    ],
  },
  {
    id: 'jesus-life',
    title: 'حياة الرب يسوع',
    emoji: '✝️',
    color: 'from-sky-500 to-indigo-600',
    description: 'من الميلاد إلى القيامة',
    lessons: [
      {
        id: 'jesus-birth',
        title: 'ميلاد المسيح',
        emoji: '⭐',
        teaching: 'وُلد الرب يسوع في بيت لحم في مذود بسيط. جاء الرعاة والمجوس ليسجدوا له، لأنه هو المُخلّص الذي وعد الله به. الله أحبّنا فأرسل ابنه لنا.',
        verse: 'وُلِدَ لَكُمُ الْيَوْمَ مُخَلِّصٌ هُوَ الْمَسِيحُ الرَّبُّ.',
        verseRef: 'لوقا 2:11',
        quiz: {
          question: 'أين وُلد الرب يسوع؟',
          options: ['في قصر', 'في بيت لحم في مذود', 'في مدرسة'],
          correctIndex: 1,
        },
      },
      {
        id: 'jesus-baptism',
        title: 'معمودية يسوع',
        emoji: '🕊️',
        teaching: 'اعتمد الرب يسوع على يد يوحنا المعمدان في نهر الأردن. وحلّ الروح القدس عليه مثل حمامة، وجاء صوت من السماء يقول: هذا هو ابني الحبيب.',
        verse: 'هذَا هُوَ ابْنِي الْحَبِيبُ الَّذِي بِهِ سُرِرْتُ.',
        verseRef: 'متى 3:17',
        quiz: {
          question: 'من الذي عمّد الرب يسوع؟',
          options: ['يوحنا المعمدان', 'بطرس', 'موسى'],
          correctIndex: 0,
        },
      },
      {
        id: 'jesus-miracles',
        title: 'معجزات المسيح',
        emoji: '🍞',
        teaching: 'صنع الرب يسوع معجزات كثيرة: أشبع الجموع بخمس خبزات وسمكتين، وشفى المرضى، وأقام الموتى. فعل ذلك لأنه يحبّ الناس ويهتمّ بهم.',
        verse: 'فَأَكَلَ الْجَمِيعُ وَشَبِعُوا.',
        verseRef: 'متى 14:20',
        quiz: {
          question: 'بماذا أشبع الرب يسوع الجموع؟',
          options: ['بخمس خبزات وسمكتين', 'بالحلوى', 'لم يُطعمهم'],
          correctIndex: 0,
        },
      },
      {
        id: 'jesus-resurrection',
        title: 'القيامة المجيدة',
        emoji: '🌅',
        teaching: 'مات الرب يسوع على الصليب من أجل خطايانا، وفي اليوم الثالث قام من الأموات منتصراً على الموت! القيامة هي أعظم فرح، لأن المسيح حيّ إلى الأبد.',
        verse: 'لَيْسَ هُوَ ههُنَا، لكِنَّهُ قَامَ!',
        verseRef: 'لوقا 24:6',
        quiz: {
          question: 'ماذا حدث في اليوم الثالث؟',
          options: ['المسيح قام من الأموات', 'لا شيء', 'نام'],
          correctIndex: 0,
        },
      },
    ],
  },
  {
    id: 'values',
    title: 'فضائل وقيم',
    emoji: '💛',
    color: 'from-emerald-500 to-teal-600',
    description: 'نتعلّم كيف نعيش كأولاد الله',
    lessons: [
      {
        id: 'value-love',
        title: 'المحبة',
        emoji: '❤️',
        teaching: 'علّمنا الرب يسوع أن نحبّ الله من كل قلوبنا، ونحبّ الناس كأنفسنا، حتى الذين يسيئون إلينا. المحبة هي أعظم وصية.',
        verse: 'أَحِبُّوا بَعْضُكُمْ بَعْضًا كَمَا أَحْبَبْتُكُمْ.',
        verseRef: 'يوحنا 15:12',
        quiz: {
          question: 'ما هي أعظم وصية؟',
          options: ['المحبة', 'اللعب', 'النوم'],
          correctIndex: 0,
        },
      },
      {
        id: 'value-prayer',
        title: 'الصلاة',
        emoji: '🙏',
        teaching: 'الصلاة هي كلامنا مع الله كصديق. نشكره ونطلب منه ونثق أنه يسمعنا دائماً. علّمنا الرب يسوع صلاة "أبانا الذي في السموات".',
        verse: 'صَلُّوا بِلاَ انْقِطَاعٍ.',
        verseRef: '1تسالونيكي 5:17',
        quiz: {
          question: 'ما هي الصلاة؟',
          options: ['كلامنا مع الله', 'لعبة', 'أكل'],
          correctIndex: 0,
        },
      },
      {
        id: 'value-honesty',
        title: 'الأمانة والصدق',
        emoji: '🤝',
        teaching: 'الله يحبّ الأولاد الصادقين الأمناء. نقول الحق دائماً ولا نكذب، ونحافظ على ما يُؤتمَن علينا، لأن الصدق يُفرِح قلب الله.',
        verse: 'اُنْطُقُوا بِالصِّدْقِ كُلُّ وَاحِدٍ مَعَ قَرِيبِهِ.',
        verseRef: 'أفسس 4:25',
        quiz: {
          question: 'ماذا يحبّ الله من الأولاد؟',
          options: ['الكذب', 'الصدق والأمانة', 'الخصام'],
          correctIndex: 1,
        },
      },
      {
        id: 'value-obedience',
        title: 'الطاعة',
        emoji: '👂',
        teaching: 'نطيع الله ونطيع والدينا لأن هذا يُرضي الرب. الطفل المطيع يفرح ويبارَك. أطاع الرب يسوع نفسه أمّه ويوسف عندما كان طفلاً.',
        verse: 'أَيُّهَا الأَوْلاَدُ، أَطِيعُوا وَالِدِيكُمْ فِي الرَّبِّ.',
        verseRef: 'أفسس 6:1',
        quiz: {
          question: 'من نطيع لنُرضي الله؟',
          options: ['الله ووالدينا', 'لا أحد', 'الأشرار'],
          correctIndex: 0,
        },
      },
    ],
  },
];

// ── تتبّع التقدّم في localStorage ──
const PROGRESS_KEY = 'kids_courses_progress';

export function getCompletedLessons(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
}

export function markLessonComplete(lessonId: string): void {
  try {
    const p = getCompletedLessons();
    p[lessonId] = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {}
}

/** الدرس مفتوح إذا كان الأول في الكورس أو الدرس السابق مكتملاً. */
export function isLessonUnlocked(course: KidsCourse, lessonIndex: number, completed: Record<string, boolean>): boolean {
  if (lessonIndex === 0) return true;
  return !!completed[course.lessons[lessonIndex - 1].id];
}

export function courseProgress(course: KidsCourse, completed: Record<string, boolean>): number {
  const done = course.lessons.filter(l => completed[l.id]).length;
  return Math.round((done / course.lessons.length) * 100);
}
