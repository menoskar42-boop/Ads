export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  emoji: string;
  difficulty: QuizDifficulty;
}

export const quizQuestions: QuizQuestion[] = [
  // سهل
  { id: 'q01', question: 'من بنى الفلك الكبير لينجو من الطوفان؟', options: ['موسى', 'نوح', 'إبراهيم', 'داود'], correctIndex: 1, emoji: '🚢', difficulty: 'easy' },
  { id: 'q02', question: 'من قتل جليات العملاق بحجارة من المقلاع؟', options: ['شمشون', 'يوشع', 'داود', 'سليمان'], correctIndex: 2, emoji: '🪨', difficulty: 'easy' },
  { id: 'q03', question: 'في بطن أي مخلوق بقي يونان النبي؟', options: ['التنين', 'الحوت الكبير', 'الأسد', 'الدب'], correctIndex: 1, emoji: '🐋', difficulty: 'easy' },
  { id: 'q04', question: 'في أي مدينة وُلد السيد المسيح؟', options: ['القدس', 'الناصرة', 'بيت لحم', 'أريحا'], correctIndex: 2, emoji: '⭐', difficulty: 'easy' },
  { id: 'q05', question: 'كم عدد تلاميذ يسوع؟', options: ['عشرة', 'سبعة', 'اثنا عشر', 'خمسة عشر'], correctIndex: 2, emoji: '👥', difficulty: 'easy' },
  { id: 'q06', question: 'من هو أول إنسان خلقه الله؟', options: ['نوح', 'آدم', 'إبراهيم', 'موسى'], correctIndex: 1, emoji: '🌿', difficulty: 'easy' },
  { id: 'q07', question: 'ماذا فعل الله في اليوم السابع من الخلق؟', options: ['خلق البشر', 'خلق البحر', 'استراح', 'خلق النجوم'], correctIndex: 2, emoji: '☀️', difficulty: 'easy' },
  { id: 'q08', question: 'من هي أم يسوع؟', options: ['مرثا', 'مريم المجدلية', 'العذراء مريم', 'أليصابات'], correctIndex: 2, emoji: '💙', difficulty: 'easy' },
  { id: 'q09', question: 'كم خبزة وكم سمكة استخدمها يسوع لإطعام الخمسة آلاف؟', options: ['عشر خبزات وعشر سمكات', 'خبزتان وسمكة', 'خمس خبزات وسمكتان', 'سبع خبزات وسبع سمكات'], correctIndex: 2, emoji: '🐟', difficulty: 'easy' },
  { id: 'q10', question: 'ما اسم والد يسوع البشري الذي رعاه؟', options: ['زكريا', 'يوحنا', 'يوسف', 'شمعون'], correctIndex: 2, emoji: '🔨', difficulty: 'easy' },

  // متوسط
  { id: 'q11', question: 'كم يوماً وليلة بقي يونان داخل الحوت؟', options: ['يوم واحد', 'ثلاثة أيام وثلاث ليالٍ', 'سبعة أيام', 'أربعين يوماً'], correctIndex: 1, emoji: '🐋', difficulty: 'medium' },
  { id: 'q12', question: 'من فسَّر أحلام فرعون ملك مصر؟', options: ['موسى', 'إيليا', 'يوسف', 'دانيال'], correctIndex: 2, emoji: '🌙', difficulty: 'medium' },
  { id: 'q13', question: 'ما اسم أخ موسى الذي كان يتكلم عنه؟', options: ['يوسف', 'يعقوب', 'هارون', 'يشوع'], correctIndex: 2, emoji: '🌊', difficulty: 'medium' },
  { id: 'q14', question: 'كم سلة جمع التلاميذ بعد إشباع الخمسة آلاف؟', options: ['سبع سلال', 'اثنتا عشرة سلة', 'خمس سلال', 'عشرون سلة'], correctIndex: 1, emoji: '🧺', difficulty: 'medium' },
  { id: 'q15', question: 'من كتب مزمور "الرب راعيَّ"؟', options: ['سليمان', 'داود', 'موسى', 'إشعياء'], correctIndex: 1, emoji: '📜', difficulty: 'medium' },
  { id: 'q16', question: 'كم يوماً وليلة صام موسى في جبل سيناء؟', options: ['سبعة أيام', 'عشرون يوماً', 'أربعين يوماً', 'ثلاثة أيام'], correctIndex: 2, emoji: '⛰️', difficulty: 'medium' },
  { id: 'q17', question: 'من هو النبي الذي صعد إلى السماء في مركبة نارية؟', options: ['إشعياء', 'إيليا', 'حزقيال', 'دانيال'], correctIndex: 1, emoji: '🔥', difficulty: 'medium' },
  { id: 'q18', question: 'في أي مكان ظهر الله لموسى في العليقة المشتعلة؟', options: ['جبل أرارات', 'جبل سيناء', 'جبل حوريب', 'جبل الزيتون'], correctIndex: 2, emoji: '🌿', difficulty: 'medium' },
  { id: 'q19', question: 'كم يوماً وليلة مطرت السماء في زمن نوح؟', options: ['عشرون يوماً', 'ثلاثون يوماً', 'أربعون يوماً وأربعون ليلة', 'مئة يوم'], correctIndex: 2, emoji: '🌧️', difficulty: 'medium' },
  { id: 'q20', question: 'من هو النبي الذي استمعت أمه حنة لصلاتها ورُزقت به؟', options: ['داود', 'صموئيل', 'إيليا', 'إشعياء'], correctIndex: 1, emoji: '🙏', difficulty: 'medium' },

  // صعب
  { id: 'q21', question: 'ما اسم حديقة الأزهار التي صلى فيها يسوع قبل الصلب؟', options: ['حديقة عدن', 'بستان جثسيماني', 'حديقة القبر', 'جنة سليمان'], correctIndex: 1, emoji: '🌿', difficulty: 'hard' },
  { id: 'q22', question: 'من هو أول ملك على مملكة إسرائيل الموحدة؟', options: ['داود', 'شاول', 'سليمان', 'يربعام'], correctIndex: 1, emoji: '👑', difficulty: 'hard' },
  { id: 'q23', question: 'ماذا أكل يوحنا المعمدان في البرية؟', options: ['الخبز والماء', 'الجراد والعسل البري', 'التمر والماء', 'الخبز واللبن'], correctIndex: 1, emoji: '🍯', difficulty: 'hard' },
  { id: 'q24', question: 'كم عاماً عاش متوشالح وهو أطول الناس عمراً في الكتاب المقدس؟', options: ['مئة وعشرون سنة', 'خمسمائة سنة', 'تسعمائة وتسعة وستون سنة', 'سبعمائة سنة'], correctIndex: 2, emoji: '👴', difficulty: 'hard' },
  { id: 'q25', question: 'ما اسم التلميذ الذي سار على الماء مع يسوع ثم شك فغرق؟', options: ['يوحنا', 'يعقوب', 'بطرس', 'أندراوس'], correctIndex: 2, emoji: '🌊', difficulty: 'hard' },
  { id: 'q26', question: 'كم عاماً استغرق بناء هيكل سليمان؟', options: ['سبع سنوات', 'اثنتا عشرة سنة', 'عشرون سنة', 'أربعون سنة'], correctIndex: 0, emoji: '🏛️', difficulty: 'hard' },
  { id: 'q27', question: 'ما اسم قائد جيش أحاب الذي شُفي من البرص في عهد النبي أليشع؟', options: ['جدعون', 'نعمان', 'باراق', 'يوآب'], correctIndex: 1, emoji: '⚔️', difficulty: 'hard' },
  { id: 'q28', question: 'كم جراباً حملها التلاميذ في رحلة الإرسالية الأولى؟', options: ['واحد', 'اثنان', 'لا شيء', 'ثلاثة'], correctIndex: 2, emoji: '🎒', difficulty: 'hard' },
  { id: 'q29', question: 'ما اسم الرجل الذي وُلد أعمى وشفاه يسوع بالطين والبصاق؟', options: ['بارطيماوس', 'لم يُذكر اسمه', 'لعازر', 'شمعون'], correctIndex: 1, emoji: '👁️', difficulty: 'hard' },
  { id: 'q30', question: 'كم مرة أنكر بطرس يسوع في ليلة القبض؟', options: ['مرة واحدة', 'مرتين', 'ثلاث مرات', 'أربع مرات'], correctIndex: 2, emoji: '🐓', difficulty: 'hard' },
];

export const QUIZ_LENGTH = 10;

export function getRandomQuiz(): QuizQuestion[] {
  const easy = quizQuestions.filter(q => q.difficulty === 'easy');
  const medium = quizQuestions.filter(q => q.difficulty === 'medium');
  const hard = quizQuestions.filter(q => q.difficulty === 'hard');

  const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  return [
    ...shuffle(easy).slice(0, 4),
    ...shuffle(medium).slice(0, 4),
    ...shuffle(hard).slice(0, 2),
  ].sort(() => Math.random() - 0.5);
}
