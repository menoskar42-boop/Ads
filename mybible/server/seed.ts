import { storage } from './storage';

// Sample Arabic Bible data (subset for demonstration)
const sampleBooksData = [
  // Old Testament
  { name: 'التكوين', testament: 'old', bookOrder: 1, chaptersCount: 50 },
  { name: 'الخروج', testament: 'old', bookOrder: 2, chaptersCount: 40 },
  { name: 'المزامير', testament: 'old', bookOrder: 19, chaptersCount: 150 },
  { name: 'الأمثال', testament: 'old', bookOrder: 20, chaptersCount: 31 },
  { name: 'إشعياء', testament: 'old', bookOrder: 23, chaptersCount: 66 },
  
  // New Testament
  { name: 'متى', testament: 'new', bookOrder: 40, chaptersCount: 28 },
  { name: 'مرقس', testament: 'new', bookOrder: 41, chaptersCount: 16 },
  { name: 'لوقا', testament: 'new', bookOrder: 42, chaptersCount: 24 },
  { name: 'يوحنا', testament: 'new', bookOrder: 43, chaptersCount: 21 },
  { name: 'رومية', testament: 'new', bookOrder: 45, chaptersCount: 16 },
  { name: 'فيلبي', testament: 'new', bookOrder: 50, chaptersCount: 4 },
];

// Sample verses (would need full Bible data in production)
const sampleVersesData = [
  // Psalm 23
  { bookName: 'المزامير', chapter: 23, verse: 1, text: 'اَلرَّبُّ رَاعِيَّ فَلاَ يُعْوِزُنِي شَيْءٌ.' },
  { bookName: 'المزامير', chapter: 23, verse: 2, text: 'فِي مَرَاعٍ خُضْرٍ يُرْبِضُنِي. إِلَى مِيَاهِ ٱلرَّاحَةِ يُورِدُنِي.' },
  { bookName: 'المزامير', chapter: 23, verse: 3, text: 'يَرُدُّ نَفْسِي. يَهْدِينِي إِلَى سُبُلِ ٱلْبِرِّ مِنْ أَجْلِ ٱسْمِهِ.' },
  { bookName: 'المزامير', chapter: 23, verse: 4, text: 'أَيْضًا إِذَا سِرْتُ فِي وَادِي ظِلِّ ٱلْمَوْتِ لاَ أَخَافُ شَرًّا، لأَنَّكَ أَنْتَ مَعِي. عَصَاكَ وَعُكَّازُكَ هُمَا يُعَزِّيَانِنِي.' },
  { bookName: 'المزامير', chapter: 23, verse: 5, text: 'تُرَتِّبُ قُدَّامِي مَائِدَةً تُجَاهَ مُضَايِقِيَّ. مَسَحْتَ بِٱلدُّهْنِ رَأْسِي. كَأْسِي رَيَّا.' },
  { bookName: 'المزامير', chapter: 23, verse: 6, text: 'إِنَّمَا خَيْرٌ وَرَحْمَةٌ يَتْبَعَانِنِي كُلَّ أَيَّامِ حَيَاتِي، وَأَسْكُنُ فِي بَيْتِ ٱلرَّبِّ إِلَى مَدَى ٱلأَيَّامِ.' },
  
  // John 3:16
  { bookName: 'يوحنا', chapter: 3, verse: 16, text: 'لأَنَّهُ هكَذَا أَحَبَّ ٱللهُ ٱلْعَالَمَ حَتَّى بَذَلَ ٱبْنَهُ ٱلْوَحِيدَ، لِكَيْ لاَ يَهْلِكَ كُلُّ مَنْ يُؤْمِنُ بِهِ، بَلْ تَكُونُ لَهُ ٱلْحَيَاةُ ٱلأَبَدِيَّةُ.' },
  
  // Matthew 5
  { bookName: 'متى', chapter: 5, verse: 3, text: 'طُوبَى لِلْمَسَاكِينِ بِٱلرُّوحِ، لأَنَّ لَهُمْ مَلَكُوتَ ٱلسَّمَاوَاتِ.' },
  { bookName: 'متى', chapter: 5, verse: 4, text: 'طُوبَى لِلْحَزَانَى، لأَنَّهُمْ يَتَعَزَّوْنَ.' },
  { bookName: 'متى', chapter: 11, verse: 28, text: 'تَعَالَوْا إِلَيَّ يَا جَمِيعَ ٱلْمُتْعَبِينَ وَٱلثَّقِيلِي ٱلأَحْمَالِ، وَأَنَا أُرِيحُكُمْ.' },
  
  // Romans
  { bookName: 'رومية', chapter: 8, verse: 28, text: 'وَنَحْنُ نَعْلَمُ أَنَّ كُلَّ ٱلأَشْيَاءِ تَعْمَلُ مَعًا لِلْخَيْرِ لِلَّذِينَ يُحِبُّونَ ٱللهَ، ٱلَّذِينَ هُمْ مَدْعُوُّونَ حَسَبَ قَصْدِهِ.' },
  
  // Philippians
  { bookName: 'فيلبي', chapter: 4, verse: 4, text: 'اِفْرَحُوا فِي ٱلرَّبِّ كُلَّ حِينٍ، وَأَقُولُ أَيْضًا: ٱفْرَحُوا.' },
  { bookName: 'فيلبي', chapter: 4, verse: 6, text: 'لاَ تَهْتَمُّوا بِشَيْءٍ، بَلْ فِي كُلِّ شَيْءٍ بِٱلصَّلاَةِ وَٱلدُّعَاءِ مَعَ ٱلشُّكْرِ، لِتُعْلَمْ طِلْبَاتُكُمْ لَدَى ٱللهِ.' },
  { bookName: 'فيلبي', chapter: 4, verse: 13, text: 'أَسْتَطِيعُ كُلَّ شَيْءٍ فِي ٱلْمَسِيحِ ٱلَّذِي يُقَوِّينِي.' },
  
  // Isaiah
  { bookName: 'إشعياء', chapter: 40, verse: 31, text: 'وَأَمَّا مُنْتَظِرُو ٱلرَّبِّ فَيُجَدِّدُونَ قُوَّةً. يَرْفَعُونَ أَجْنِحَةً كَٱلنُّسُورِ. يَرْكُضُونَ وَلاَ يَتْعَبُونَ. يَمْشُونَ وَلاَ يُعْيُونَ.' },
  { bookName: 'إشعياء', chapter: 41, verse: 10, text: 'لاَ تَخَفْ لأَنِّي مَعَكَ. لاَ تَتَلَفَّتْ لأَنِّي إِلهُكَ. قَدْ أَيَّدْتُكَ وَأَعَنْتُكَ وَعَضَدْتُكَ بِيَمِينِ بِرِّي.' },
];

const emotionsData = [
  { name: 'حزن', icon: '😢', color: 'blue' },
  { name: 'خوف', icon: '😨', color: 'purple' },
  { name: 'قلق', icon: '😰', color: 'orange' },
  { name: 'تعب', icon: '😩', color: 'gray' },
  { name: 'فرح', icon: '😊', color: 'yellow' },
  { name: 'وحدة', icon: '🥺', color: 'teal' },
];

const topicsData = [
  { name: 'العمل', icon: '💼' },
  { name: 'الصبر', icon: '⏳' },
  { name: 'الرجاء', icon: '🌅' },
  { name: 'الخدمة', icon: '🤝' },
  { name: 'الإيمان', icon: '✝️' },
];

const readingPlansData = [
  {
    name: 'خطة ٣٠ يوم',
    duration: '30 يوم',
    daysTotal: 30,
    description: 'اقرأ أهم قصص الكتاب المقدس',
    planData: Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      oldTestament: { book: 'التكوين', chapters: `${i + 1}` },
      newTestament: { book: 'متى', chapters: `${(i % 28) + 1}` },
    })),
  },
  {
    name: 'خطة ٦٠ يوم',
    duration: '60 يوم',
    daysTotal: 60,
    description: 'رحلة عبر العهد الجديد كاملاً',
    planData: Array.from({ length: 60 }, (_, i) => ({
      day: i + 1,
      newTestament: { book: i < 28 ? 'متى' : 'يوحنا', chapters: `${(i % 28) + 1}` },
    })),
  },
  {
    name: 'خطة ٩٠ يوم',
    duration: '90 يوم',
    daysTotal: 90,
    description: 'دراسة معمقة للإنجيل والرسائل',
    planData: Array.from({ length: 90 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1} - قراءة متنوعة`,
    })),
  },
  {
    name: 'خطة ٦ شهور',
    duration: '6 شهور',
    daysTotal: 180,
    description: 'قراءة شاملة للكتاب المقدس',
    planData: Array.from({ length: 180 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1} - قراءة شاملة`,
    })),
  },
  {
    name: 'خطة سنة كاملة',
    duration: 'سنة',
    daysTotal: 365,
    description: 'اقرأ الكتاب المقدس بالكامل في عام',
    planData: Array.from({ length: 365 }, (_, i) => ({
      day: i + 1,
      reading: `يوم ${i + 1} - الكتاب المقدس كاملاً`,
    })),
  },
];

const childStoriesData = [
  {
    title: 'قصة الخلق',
    summary: 'كيف خلق الله العالم في ستة أيام',
    ageGroup: '4-7 سنوات',
    imageEmoji: '🌍',
    content: 'في البداية، خلق الله السماوات والأرض. وكانت الأرض خالية ومظلمة. فقال الله: "ليكن نور!" فكان نور جميل. وفي كل يوم، خلق الله شيئًا جديدًا ورائعًا. خلق السماء والبحر، والأشجار والزهور، والشمس والقمر والنجوم. ثم خلق الطيور والأسماك والحيوانات. وأخيرًا، خلق الله الإنسان على صورته. ورأى الله كل ما صنعه فإذا هو حسن جدًا.',
    orderIndex: 1,
  },
  {
    title: 'نوح والفلك',
    summary: 'كيف أنقذ الله نوحًا وعائلته',
    ageGroup: '4-7 سنوات',
    imageEmoji: '🚢',
    content: 'كان نوح رجلاً صالحًا يحب الله. طلب الله من نوح أن يبني سفينة كبيرة جدًا تسمى الفُلك. جمع نوح الحيوانات من كل نوع - زوجين من كل حيوان. ثم جاء مطر غزير واستمر أربعين يومًا وأربعين ليلة. لكن نوح وعائلته والحيوانات كانوا آمنين داخل الفلك. وبعد أن توقف المطر، أرسل نوح حمامة فعادت بغصن زيتون. وعلم نوح أن الماء قد بدأ ينحسر. ووضع الله قوس قزح في السماء كوعد بأنه لن يغرق الأرض بالماء مرة أخرى.',
    orderIndex: 2,
  },
  {
    title: 'داود وجليات',
    summary: 'الفتى الشجاع الذي هزم العملاق',
    ageGroup: '6-10 سنوات',
    imageEmoji: '⚔️',
    content: 'كان داود فتى صغيرًا يرعى الغنم. وكان جليات عملاقًا ضخمًا يخيف الجميع. لكن داود كان يثق بالله. أخذ خمسة حجارة ومقلاعه وواجه العملاق. قال جليات: "هل تأتي إليّ بعصا؟" لكن داود أجاب: "أنت تأتي إليّ بسيف، أما أنا فآتي إليك باسم رب الجنود." ثم رمى داود حجرًا من مقلاعه فأصاب جليات في جبهته وسقط العملاق. وتعلم الجميع أن الله مع الشجعان الذين يثقون به.',
    orderIndex: 3,
  },
  {
    title: 'يونان والحوت',
    summary: 'النبي الذي ابتلعه الحوت',
    ageGroup: '5-9 سنوات',
    imageEmoji: '🐋',
    content: 'طلب الله من يونان أن يذهب إلى مدينة نينوى. لكن يونان خاف وهرب في سفينة. فأرسل الله عاصفة كبيرة. عرف يونان أنه أخطأ فألقى نفسه في البحر. أرسل الله حوتًا ضخمًا ابتلع يونان. بقي يونان في بطن الحوت ثلاثة أيام وثلاث ليالٍ وهو يصلي لله. سمع الله صلاته وأمر الحوت فقذف يونان على اليابسة. ذهب يونان إلى نينوى وأطاع الله هذه المرة.',
    orderIndex: 4,
  },
  {
    title: 'ميلاد يسوع',
    summary: 'قصة ولادة المخلص في بيت لحم',
    ageGroup: '3-6 سنوات',
    imageEmoji: '⭐',
    content: 'في ليلة مباركة، وُلد يسوع في مدينة بيت لحم. لم يكن هناك مكان في الفندق، فوضعته أمه مريم في مذود حيث تأكل الحيوانات. ظهر ملاك للرعاة وقال: "لا تخافوا! أبشركم بخبر عظيم. وُلد لكم اليوم مخلص." جاء الرعاة ليروا الطفل يسوع وسجدوا له. وجاء أيضًا مجوس من المشرق تبعوا نجمًا ساطعًا حتى وجدوا يسوع. قدموا له هدايا من ذهب ولبان ومر. كان ميلاد يسوع فرحًا عظيمًا للعالم كله.',
    orderIndex: 5,
  },
  {
    title: 'السامري الصالح',
    summary: 'قصة الرجل الذي ساعد غريبًا',
    ageGroup: '6-10 سنوات',
    imageEmoji: '💝',
    content: 'روى يسوع قصة عن رجل كان يسافر فسقط بين لصوص. ضربوه وأخذوا كل ما يملك وتركوه على الطريق. مر كاهن ورآه لكنه مضى دون أن يساعده. ثم مر رجل آخر ولم يساعده أيضًا. أخيرًا جاء رجل سامري. توقف وعالج جراحه ووضعه على دابته وذهب به إلى فندق واعتنى به. دفع صاحب الفندق أيضًا ليعتني به. قال يسوع: هذا السامري هو القريب الحقيقي. علينا أن نحب ونساعد كل من يحتاج إلينا حتى لو كان غريبًا.',
    orderIndex: 6,
  },
];

export async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  try {
    // Seed Bible Books
    console.log('📖 Seeding Bible books...');
    const bookMap = new Map<string, number>();
    for (const bookData of sampleBooksData) {
      const book = await storage.createBook(bookData);
      bookMap.set(book.name, book.id);
      console.log(`  ✓ Created book: ${book.name}`);
    }

    // Seed Bible Verses
    console.log('📜 Seeding Bible verses...');
    const verseIds: number[] = [];
    for (const verseData of sampleVersesData) {
      const bookId = bookMap.get(verseData.bookName);
      if (bookId) {
        const verse = await storage.createVerse({
          bookId,
          chapter: verseData.chapter,
          verse: verseData.verse,
          text: verseData.text,
        });
        verseIds.push(verse.id);
        console.log(`  ✓ Created verse: ${verseData.bookName} ${verseData.chapter}:${verseData.verse}`);
      }
    }

    // Seed Emotions
    console.log('😊 Seeding emotions...');
    const emotionIds: number[] = [];
    for (const emotionData of emotionsData) {
      const emotion = await storage.createEmotion(emotionData);
      emotionIds.push(emotion.id);
      console.log(`  ✓ Created emotion: ${emotion.name}`);
    }

    // Seed Topics
    console.log('📚 Seeding topics...');
    const topicIds: number[] = [];
    for (const topicData of topicsData) {
      const topic = await storage.createTopic(topicData);
      topicIds.push(topic.id);
      console.log(`  ✓ Created topic: ${topic.name}`);
    }

    // Map emotions to verses
    console.log('🔗 Creating emotion-verse mappings...');
    const emotionVerseMappings = [
      { emotionName: 'حزن', verseIndexes: [7, 8, 10] },
      { emotionName: 'خوف', verseIndexes: [14, 15] },
      { emotionName: 'قلق', verseIndexes: [11, 12] },
      { emotionName: 'تعب', verseIndexes: [9, 14] },
      { emotionName: 'فرح', verseIndexes: [11, 6] },
      { emotionName: 'وحدة', verseIndexes: [3, 15] },
    ];

    for (const mapping of emotionVerseMappings) {
      const emotion = emotionsData.findIndex(e => e.name === mapping.emotionName);
      if (emotion !== -1 && emotionIds[emotion]) {
        for (const verseIndex of mapping.verseIndexes) {
          if (verseIds[verseIndex]) {
            await storage.addEmotionVerse(emotionIds[emotion], verseIds[verseIndex]);
          }
        }
        console.log(`  ✓ Mapped ${mapping.emotionName} to verses`);
      }
    }

    // Map topics to verses
    console.log('🔗 Creating topic-verse mappings...');
    const topicVerseMappings = [
      { topicName: 'العمل', verseIndexes: [12, 13] },
      { topicName: 'الصبر', verseIndexes: [10, 14] },
      { topicName: 'الرجاء', verseIndexes: [10, 14] },
      { topicName: 'الخدمة', verseIndexes: [9] },
      { topicName: 'الإيمان', verseIndexes: [6, 13] },
    ];

    for (const mapping of topicVerseMappings) {
      const topic = topicsData.findIndex(t => t.name === mapping.topicName);
      if (topic !== -1 && topicIds[topic]) {
        for (const verseIndex of mapping.verseIndexes) {
          if (verseIds[verseIndex]) {
            await storage.addTopicVerse(topicIds[topic], verseIds[verseIndex]);
          }
        }
        console.log(`  ✓ Mapped ${mapping.topicName} to verses`);
      }
    }

    // Seed Reading Plans
    console.log('📅 Seeding reading plans...');
    for (const planData of readingPlansData) {
      const plan = await storage.createReadingPlan(planData);
      console.log(`  ✓ Created plan: ${plan.name}`);
    }

    // Seed Child Stories
    console.log('👶 Seeding children stories...');
    for (const storyData of childStoriesData) {
      const story = await storage.createChildStory(storyData);
      console.log(`  ✓ Created story: ${story.title}`);
    }

    // Create daily verse for today
    console.log('⭐ Creating daily verse...');
    if (verseIds[6]) {
      // John 3:16
      await storage.createDailyVerse({
        verseId: verseIds[6],
        date: new Date(),
      });
      console.log('  ✓ Set daily verse');
    }

    console.log('✅ Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run seeding if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
