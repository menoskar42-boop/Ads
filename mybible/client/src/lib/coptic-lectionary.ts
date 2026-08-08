// ── قراءات القداس اليومية ──────────────────────────────────────────────────
//
// ⚠️ تحذير: البيانات دي **ليست القطمارس القبطي الحقيقي**.
//
// الهيدر القديم كان بيقول «المصدر: الكتامارس الأرثوذكسي القبطي (طبعة البطريرك
// شنودة الثالث)» — وده ادّعاء غير صحيح. فحص البيانات بيوضّح إنها خطة قراءات
// متسلسلة مولّدة آلياً: الإنجيل بيمشي بالترتيب (يوحنا ١: ١-١٧ ← ١: ١٨-٣٤ ←
// ١: ٣٥-٥١ ← ٢: ١-١٢ …) شريحة كل أسبوع، وكذلك البولس (رومية بالترتيب)
// والكاثوليكون (يعقوب بالترتيب) والإبركسيس (أعمال بالترتيب). القطمارس الحقيقي
// مابيشتغلش كده — بيوزّع قراءات محدّدة على أيام السنة الطقسية.
//
// وكمان: ١٠٢ يوم بس من ٣٦٥، على أيام أسبوعية، والباقي بياخد أقرب يوم سابق.
//
// **ماتعتمدش على الملف ده في قدّاس.** لازم يتبدّل بالقطمارس الحقيقي من مصدر
// كنسي معتمد. سيبنا الهيدر ده صريح عشان محدش يفتكر البيانات موثّقة.
//
// المفتاح: "month-day" بالتقويم القبطي، أو "feast-اسم" للأعياد الثابتة

export interface ReadingRef {
  book:   string;   // اسم الكتاب بالعربي كما في قاعدة البيانات
  fromCh: number;
  fromVs: number;
  toCh:   number;
  toVs:   number;
  label:  string;   // مثال: "رومية 8: 1-39"
}

export interface DayLectionary {
  pauline:  ReadingRef;
  catholic: ReadingRef;
  praxis:   ReadingRef;
  psalm:    ReadingRef;
  gospel:   ReadingRef;
}

// ─────────────────────────────────────────────────────────────────────────────
// قراءات الأعياد الكبرى الثابتة (feast-*)
// ─────────────────────────────────────────────────────────────────────────────
const feasts: Record<string, DayLectionary> = {

  // عيد الميلاد المجيد (29 كيهك)
  'feast-christmas': {
    pauline:  { book: 'غلاطية',    fromCh: 4,  fromVs: 4,  toCh: 4,  toVs: 7,  label: 'غلاطية 4: 4-7' },
    catholic: { book: 'عبرانيين',  fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 12, label: 'عبرانيين 1: 1-12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 13, fromVs: 16, toCh: 13, toVs: 41, label: 'أعمال 13: 16-41' },
    psalm:    { book: 'المزامير',   fromCh: 110, fromVs: 3, toCh: 110, toVs: 3,  label: 'مزمور 110: 3' },
    gospel:   { book: 'لوقا',      fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 20, label: 'لوقا 2: 1-20' },
  },

  // عيد الغطاس (11 طوبة)
  'feast-epiphany': {
    pauline:  { book: 'رومية',      fromCh: 6,  fromVs: 3,  toCh: 6,  toVs: 11, label: 'رومية 6: 3-11' },
    catholic: { book: 'يوحنا الأولى', fromCh: 5, fromVs: 5, toCh: 5, toVs: 12, label: 'يوحنا الأولى 5: 5-12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 19, fromVs: 1, toCh: 19, toVs: 7,  label: 'أعمال 19: 1-7' },
    psalm:    { book: 'المزامير',   fromCh: 29, fromVs: 3,  toCh: 29, toVs: 3,  label: 'مزمور 29: 3' },
    gospel:   { book: 'مرقس',      fromCh: 1,  fromVs: 9,  toCh: 1,  toVs: 11, label: 'مرقس 1: 9-11' },
  },

  // أحد الشعانين (أحد السعف)
  'feast-palm-sunday': {
    pauline:  { book: 'فيلبي',      fromCh: 4,  fromVs: 4,  toCh: 4,  toVs: 13, label: 'فيلبي 4: 4-13' },
    catholic: { book: 'يوحنا الأولى', fromCh: 5, fromVs: 1, toCh: 5, toVs: 5,  label: 'يوحنا الأولى 5: 1-5' },
    praxis:   { book: 'أعمال الرسل', fromCh: 28, fromVs: 11, toCh: 28, toVs: 31, label: 'أعمال 28: 11-31' },
    psalm:    { book: 'المزامير',   fromCh: 118, fromVs: 26, toCh: 118, toVs: 26, label: 'مزمور 118: 26' },
    gospel:   { book: 'يوحنا',     fromCh: 12, fromVs: 12, toCh: 12, toVs: 22, label: 'يوحنا 12: 12-22' },
  },

  // أحد القيامة المجيدة (عيد الفصح)
  'feast-easter': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 5, fromVs: 7, toCh: 5, toVs: 8, label: 'كورنثوس الأولى 5: 7-8' },
    catholic: { book: 'بطرس الأولى',   fromCh: 1, fromVs: 3, toCh: 1, toVs: 9, label: 'بطرس الأولى 1: 3-9' },
    praxis:   { book: 'أعمال الرسل', fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 14, label: 'أعمال 1: 1-14' },
    psalm:    { book: 'المزامير',   fromCh: 118, fromVs: 24, toCh: 118, toVs: 24, label: 'مزمور 118: 24' },
    gospel:   { book: 'يوحنا',     fromCh: 20, fromVs: 1,  toCh: 20, toVs: 18, label: 'يوحنا 20: 1-18' },
  },

  // عيد الصعود
  'feast-ascension': {
    pauline:  { book: 'أفسس',      fromCh: 4,  fromVs: 7,  toCh: 4,  toVs: 16, label: 'أفسس 4: 7-16' },
    catholic: { book: 'يوحنا الأولى', fromCh: 4, fromVs: 7, toCh: 4, toVs: 21, label: 'يوحنا الأولى 4: 7-21' },
    praxis:   { book: 'أعمال الرسل', fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 11, label: 'أعمال 1: 1-11' },
    psalm:    { book: 'المزامير',   fromCh: 47, fromVs: 5,  toCh: 47, toVs: 5,  label: 'مزمور 47: 5' },
    gospel:   { book: 'لوقا',      fromCh: 24, fromVs: 49, toCh: 24, toVs: 53, label: 'لوقا 24: 49-53' },
  },

  // عيد العنصرة (الخمسين المقدسة)
  'feast-pentecost': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 12, fromVs: 1, toCh: 12, toVs: 14, label: 'كورنثوس الأولى 12: 1-14' },
    catholic: { book: 'يوحنا الأولى', fromCh: 4, fromVs: 1, toCh: 4, toVs: 6, label: 'يوحنا الأولى 4: 1-6' },
    praxis:   { book: 'أعمال الرسل', fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 21, label: 'أعمال 2: 1-21' },
    psalm:    { book: 'المزامير',   fromCh: 104, fromVs: 30, toCh: 104, toVs: 30, label: 'مزمور 104: 30' },
    gospel:   { book: 'يوحنا',     fromCh: 14, fromVs: 15, toCh: 14, toVs: 27, label: 'يوحنا 14: 15-27' },
  },

  // عيد دخول السيد إلى الهيكل (8 أمشير)
  'feast-presentation': {
    pauline:  { book: 'عبرانيين',  fromCh: 2,  fromVs: 14, toCh: 2,  toVs: 18, label: 'عبرانيين 2: 14-18' },
    catholic: { book: 'يوحنا الأولى', fromCh: 3, fromVs: 1, toCh: 3, toVs: 10, label: 'يوحنا الأولى 3: 1-10' },
    praxis:   { book: 'أعمال الرسل', fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 16, label: 'أعمال 3: 1-16' },
    psalm:    { book: 'المزامير',   fromCh: 45, fromVs: 12, toCh: 45, toVs: 12, label: 'مزمور 45: 12' },
    gospel:   { book: 'لوقا',      fromCh: 2,  fromVs: 22, toCh: 2,  toVs: 40, label: 'لوقا 2: 22-40' },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// قراءات الأحاد السنوية (حسب اليوم القبطي)
// مُنظَّمة حسب شهر وأحاد الكنيسة القبطية
// ─────────────────────────────────────────────────────────────────────────────
const dailyReadings: Record<string, DayLectionary> = {

  // ── توت (أول شهور السنة القبطية — سبتمبر/أكتوبر) ──
  '1-1': {
    pauline:  { book: 'رومية',      fromCh: 8,  fromVs: 1,  toCh: 8,  toVs: 11, label: 'رومية 8: 1-11' },
    catholic: { book: 'يعقوب',      fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 12, label: 'يعقوب 1: 1-12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 1,  fromVs: 15, toCh: 1,  toVs: 26, label: 'أعمال 1: 15-26' },
    psalm:    { book: 'المزامير',   fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 6,  label: 'مزمور 1: 1-6' },
    gospel:   { book: 'يوحنا',     fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 17, label: 'يوحنا 1: 1-17' },
  },
  '1-8': {
    pauline:  { book: 'رومية',      fromCh: 8,  fromVs: 12, toCh: 8,  toVs: 27, label: 'رومية 8: 12-27' },
    catholic: { book: 'يعقوب',      fromCh: 1,  fromVs: 13, toCh: 1,  toVs: 27, label: 'يعقوب 1: 13-27' },
    praxis:   { book: 'أعمال الرسل', fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 21, label: 'أعمال 2: 1-21' },
    psalm:    { book: 'المزامير',   fromCh: 8,  fromVs: 1,  toCh: 8,  toVs: 9,  label: 'مزمور 8: 1-9' },
    gospel:   { book: 'يوحنا',     fromCh: 1,  fromVs: 18, toCh: 1,  toVs: 34, label: 'يوحنا 1: 18-34' },
  },
  '1-15': {
    pauline:  { book: 'رومية',      fromCh: 8,  fromVs: 28, toCh: 8,  toVs: 39, label: 'رومية 8: 28-39' },
    catholic: { book: 'يعقوب',      fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 13, label: 'يعقوب 2: 1-13' },
    praxis:   { book: 'أعمال الرسل', fromCh: 2,  fromVs: 22, toCh: 2,  toVs: 41, label: 'أعمال 2: 22-41' },
    psalm:    { book: 'المزامير',   fromCh: 19, fromVs: 1,  toCh: 19, toVs: 6,  label: 'مزمور 19: 1-6' },
    gospel:   { book: 'يوحنا',     fromCh: 1,  fromVs: 35, toCh: 1,  toVs: 51, label: 'يوحنا 1: 35-51' },
  },
  '1-22': {
    pauline:  { book: 'رومية',      fromCh: 9,  fromVs: 1,  toCh: 9,  toVs: 18, label: 'رومية 9: 1-18' },
    catholic: { book: 'يعقوب',      fromCh: 2,  fromVs: 14, toCh: 2,  toVs: 26, label: 'يعقوب 2: 14-26' },
    praxis:   { book: 'أعمال الرسل', fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 16, label: 'أعمال 3: 1-16' },
    psalm:    { book: 'المزامير',   fromCh: 23, fromVs: 1,  toCh: 23, toVs: 6,  label: 'مزمور 23: 1-6' },
    gospel:   { book: 'يوحنا',     fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 12, label: 'يوحنا 2: 1-12' },
  },
  '1-29': {
    pauline:  { book: 'رومية',      fromCh: 10, fromVs: 1,  toCh: 10, toVs: 13, label: 'رومية 10: 1-13' },
    catholic: { book: 'يعقوب',      fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 18, label: 'يعقوب 3: 1-18' },
    praxis:   { book: 'أعمال الرسل', fromCh: 4,  fromVs: 1,  toCh: 4,  toVs: 22, label: 'أعمال 4: 1-22' },
    psalm:    { book: 'المزامير',   fromCh: 27, fromVs: 1,  toCh: 27, toVs: 6,  label: 'مزمور 27: 1-6' },
    gospel:   { book: 'يوحنا',     fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 21, label: 'يوحنا 3: 1-21' },
  },

  // ── بابه (أكتوبر/نوفمبر) ──
  '2-7': {
    pauline:  { book: 'رومية',      fromCh: 11, fromVs: 1,  toCh: 11, toVs: 24, label: 'رومية 11: 1-24' },
    catholic: { book: 'يعقوب',      fromCh: 4,  fromVs: 1,  toCh: 4,  toVs: 12, label: 'يعقوب 4: 1-12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 4,  fromVs: 23, toCh: 4,  toVs: 37, label: 'أعمال 4: 23-37' },
    psalm:    { book: 'المزامير',   fromCh: 34, fromVs: 1,  toCh: 34, toVs: 10, label: 'مزمور 34: 1-10' },
    gospel:   { book: 'يوحنا',     fromCh: 4,  fromVs: 1,  toCh: 4,  toVs: 26, label: 'يوحنا 4: 1-26' },
  },
  '2-14': {
    pauline:  { book: 'رومية',      fromCh: 12, fromVs: 1,  toCh: 12, toVs: 21, label: 'رومية 12: 1-21' },
    catholic: { book: 'يعقوب',      fromCh: 4,  fromVs: 13, toCh: 5,  toVs: 6,  label: 'يعقوب 4: 13-5: 6' },
    praxis:   { book: 'أعمال الرسل', fromCh: 5,  fromVs: 1,  toCh: 5,  toVs: 16, label: 'أعمال 5: 1-16' },
    psalm:    { book: 'المزامير',   fromCh: 46, fromVs: 1,  toCh: 46, toVs: 11, label: 'مزمور 46: 1-11' },
    gospel:   { book: 'يوحنا',     fromCh: 5,  fromVs: 1,  toCh: 5,  toVs: 18, label: 'يوحنا 5: 1-18' },
  },
  '2-21': {
    pauline:  { book: 'رومية',      fromCh: 13, fromVs: 1,  toCh: 13, toVs: 14, label: 'رومية 13: 1-14' },
    catholic: { book: 'يعقوب',      fromCh: 5,  fromVs: 7,  toCh: 5,  toVs: 20, label: 'يعقوب 5: 7-20' },
    praxis:   { book: 'أعمال الرسل', fromCh: 5,  fromVs: 17, toCh: 5,  toVs: 42, label: 'أعمال 5: 17-42' },
    psalm:    { book: 'المزامير',   fromCh: 48, fromVs: 1,  toCh: 48, toVs: 14, label: 'مزمور 48: 1-14' },
    gospel:   { book: 'يوحنا',     fromCh: 6,  fromVs: 1,  toCh: 6,  toVs: 21, label: 'يوحنا 6: 1-21' },
  },
  '2-28': {
    pauline:  { book: 'رومية',      fromCh: 14, fromVs: 1,  toCh: 14, toVs: 23, label: 'رومية 14: 1-23' },
    catholic: { book: 'بطرس الأولى', fromCh: 1, fromVs: 1, toCh: 1, toVs: 12, label: 'بطرس الأولى 1: 1-12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 6,  fromVs: 1,  toCh: 6,  toVs: 15, label: 'أعمال 6: 1-15' },
    psalm:    { book: 'المزامير',   fromCh: 92, fromVs: 1,  toCh: 92, toVs: 8,  label: 'مزمور 92: 1-8' },
    gospel:   { book: 'يوحنا',     fromCh: 6,  fromVs: 22, toCh: 6,  toVs: 40, label: 'يوحنا 6: 22-40' },
  },

  // ── هاتور (نوفمبر/ديسمبر) ──
  '3-6': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 1, fromVs: 1, toCh: 1, toVs: 17, label: 'كورنثوس الأولى 1: 1-17' },
    catholic: { book: 'بطرس الأولى', fromCh: 1, fromVs: 13, toCh: 1, toVs: 25, label: 'بطرس الأولى 1: 13-25' },
    praxis:   { book: 'أعمال الرسل', fromCh: 7,  fromVs: 1,  toCh: 7,  toVs: 29, label: 'أعمال 7: 1-29' },
    psalm:    { book: 'المزامير',   fromCh: 95, fromVs: 1,  toCh: 95, toVs: 7,  label: 'مزمور 95: 1-7' },
    gospel:   { book: 'يوحنا',     fromCh: 6,  fromVs: 41, toCh: 6,  toVs: 59, label: 'يوحنا 6: 41-59' },
  },
  '3-13': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 2, fromVs: 1, toCh: 2, toVs: 16, label: 'كورنثوس الأولى 2: 1-16' },
    catholic: { book: 'بطرس الأولى', fromCh: 2, fromVs: 1, toCh: 2, toVs: 12, label: 'بطرس الأولى 2: 1-12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 7,  fromVs: 30, toCh: 7,  toVs: 60, label: 'أعمال 7: 30-60' },
    psalm:    { book: 'المزامير',   fromCh: 96, fromVs: 1,  toCh: 96, toVs: 9,  label: 'مزمور 96: 1-9' },
    gospel:   { book: 'يوحنا',     fromCh: 7,  fromVs: 1,  toCh: 7,  toVs: 24, label: 'يوحنا 7: 1-24' },
  },
  '3-20': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 3, fromVs: 1, toCh: 3, toVs: 23, label: 'كورنثوس الأولى 3: 1-23' },
    catholic: { book: 'بطرس الأولى', fromCh: 2, fromVs: 13, toCh: 2, toVs: 25, label: 'بطرس الأولى 2: 13-25' },
    praxis:   { book: 'أعمال الرسل', fromCh: 8,  fromVs: 1,  toCh: 8,  toVs: 25, label: 'أعمال 8: 1-25' },
    psalm:    { book: 'المزامير',   fromCh: 100, fromVs: 1, toCh: 100, toVs: 5,  label: 'مزمور 100: 1-5' },
    gospel:   { book: 'يوحنا',     fromCh: 8,  fromVs: 1,  toCh: 8,  toVs: 20, label: 'يوحنا 8: 1-20' },
  },
  '3-27': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 4, fromVs: 1, toCh: 4, toVs: 21, label: 'كورنثوس الأولى 4: 1-21' },
    catholic: { book: 'بطرس الأولى', fromCh: 3, fromVs: 1, toCh: 3, toVs: 12, label: 'بطرس الأولى 3: 1-12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 8,  fromVs: 26, toCh: 8,  toVs: 40, label: 'أعمال 8: 26-40' },
    psalm:    { book: 'المزامير',   fromCh: 111, fromVs: 1, toCh: 111, toVs: 10, label: 'مزمور 111: 1-10' },
    gospel:   { book: 'يوحنا',     fromCh: 9,  fromVs: 1,  toCh: 9,  toVs: 25, label: 'يوحنا 9: 1-25' },
  },

  // ── كيهك (ديسمبر/يناير — شهر الصوم والترقب) ──
  '4-5': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 5, fromVs: 1, toCh: 6, toVs: 11, label: 'كورنثوس الأولى 5: 1-6: 11' },
    catholic: { book: 'بطرس الأولى', fromCh: 3, fromVs: 13, toCh: 4, toVs: 6, label: 'بطرس الأولى 3: 13-4: 6' },
    praxis:   { book: 'أعمال الرسل', fromCh: 9,  fromVs: 1,  toCh: 9,  toVs: 22, label: 'أعمال 9: 1-22' },
    psalm:    { book: 'المزامير',   fromCh: 122, fromVs: 1, toCh: 122, toVs: 9,  label: 'مزمور 122: 1-9' },
    gospel:   { book: 'يوحنا',     fromCh: 10, fromVs: 1,  toCh: 10, toVs: 21, label: 'يوحنا 10: 1-21' },
  },
  '4-12': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 6, fromVs: 12, toCh: 7, toVs: 7, label: 'كورنثوس الأولى 6: 12-7: 7' },
    catholic: { book: 'بطرس الأولى', fromCh: 4, fromVs: 7, toCh: 4, toVs: 19, label: 'بطرس الأولى 4: 7-19' },
    praxis:   { book: 'أعمال الرسل', fromCh: 9,  fromVs: 23, toCh: 9,  toVs: 43, label: 'أعمال 9: 23-43' },
    psalm:    { book: 'المزامير',   fromCh: 126, fromVs: 1, toCh: 126, toVs: 6,  label: 'مزمور 126: 1-6' },
    gospel:   { book: 'يوحنا',     fromCh: 10, fromVs: 22, toCh: 10, toVs: 42, label: 'يوحنا 10: 22-42' },
  },
  '4-19': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 7, fromVs: 8, toCh: 7, toVs: 24, label: 'كورنثوس الأولى 7: 8-24' },
    catholic: { book: 'بطرس الأولى', fromCh: 5, fromVs: 1, toCh: 5, toVs: 14, label: 'بطرس الأولى 5: 1-14' },
    praxis:   { book: 'أعمال الرسل', fromCh: 10, fromVs: 1,  toCh: 10, toVs: 23, label: 'أعمال 10: 1-23' },
    psalm:    { book: 'المزامير',   fromCh: 130, fromVs: 1, toCh: 130, toVs: 8,  label: 'مزمور 130: 1-8' },
    gospel:   { book: 'يوحنا',     fromCh: 11, fromVs: 1,  toCh: 11, toVs: 27, label: 'يوحنا 11: 1-27' },
  },
  '4-26': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 7, fromVs: 25, toCh: 8, toVs: 13, label: 'كورنثوس الأولى 7: 25-8: 13' },
    catholic: { book: 'بطرس الثانية', fromCh: 1, fromVs: 1, toCh: 1, toVs: 11, label: 'بطرس الثانية 1: 1-11' },
    praxis:   { book: 'أعمال الرسل', fromCh: 10, fromVs: 24, toCh: 10, toVs: 48, label: 'أعمال 10: 24-48' },
    psalm:    { book: 'المزامير',   fromCh: 132, fromVs: 1, toCh: 132, toVs: 9,  label: 'مزمور 132: 1-9' },
    gospel:   { book: 'يوحنا',     fromCh: 11, fromVs: 28, toCh: 11, toVs: 44, label: 'يوحنا 11: 28-44' },
  },

  // ── طوبة (يناير/فبراير) ──
  '5-4': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 9, fromVs: 1, toCh: 9, toVs: 27, label: 'كورنثوس الأولى 9: 1-27' },
    catholic: { book: 'بطرس الثانية', fromCh: 1, fromVs: 12, toCh: 2, toVs: 3, label: 'بطرس الثانية 1: 12-2: 3' },
    praxis:   { book: 'أعمال الرسل', fromCh: 11, fromVs: 1,  toCh: 11, toVs: 18, label: 'أعمال 11: 1-18' },
    psalm:    { book: 'المزامير',   fromCh: 133, fromVs: 1, toCh: 133, toVs: 3,  label: 'مزمور 133: 1-3' },
    gospel:   { book: 'يوحنا',     fromCh: 12, fromVs: 1,  toCh: 12, toVs: 19, label: 'يوحنا 12: 1-19' },
  },
  '5-11': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 10, fromVs: 1, toCh: 10, toVs: 22, label: 'كورنثوس الأولى 10: 1-22' },
    catholic: { book: 'بطرس الثانية', fromCh: 2, fromVs: 4, toCh: 2, toVs: 22, label: 'بطرس الثانية 2: 4-22' },
    praxis:   { book: 'أعمال الرسل', fromCh: 11, fromVs: 19, toCh: 11, toVs: 30, label: 'أعمال 11: 19-30' },
    psalm:    { book: 'المزامير',   fromCh: 135, fromVs: 1, toCh: 135, toVs: 7,  label: 'مزمور 135: 1-7' },
    gospel:   { book: 'يوحنا',     fromCh: 13, fromVs: 1,  toCh: 13, toVs: 20, label: 'يوحنا 13: 1-20' },
  },
  '5-18': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 11, fromVs: 17, toCh: 11, toVs: 34, label: 'كورنثوس الأولى 11: 17-34' },
    catholic: { book: 'بطرس الثانية', fromCh: 3, fromVs: 1, toCh: 3, toVs: 18, label: 'بطرس الثانية 3: 1-18' },
    praxis:   { book: 'أعمال الرسل', fromCh: 12, fromVs: 1,  toCh: 12, toVs: 24, label: 'أعمال 12: 1-24' },
    psalm:    { book: 'المزامير',   fromCh: 138, fromVs: 1, toCh: 138, toVs: 8,  label: 'مزمور 138: 1-8' },
    gospel:   { book: 'يوحنا',     fromCh: 14, fromVs: 1,  toCh: 14, toVs: 14, label: 'يوحنا 14: 1-14' },
  },
  '5-25': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 12, fromVs: 1, toCh: 12, toVs: 31, label: 'كورنثوس الأولى 12: 1-31' },
    catholic: { book: 'يوحنا الأولى', fromCh: 1, fromVs: 1, toCh: 1, toVs: 10, label: 'يوحنا الأولى 1: 1-10' },
    praxis:   { book: 'أعمال الرسل', fromCh: 13, fromVs: 1,  toCh: 13, toVs: 15, label: 'أعمال 13: 1-15' },
    psalm:    { book: 'المزامير',   fromCh: 139, fromVs: 1, toCh: 139, toVs: 12, label: 'مزمور 139: 1-12' },
    gospel:   { book: 'يوحنا',     fromCh: 15, fromVs: 1,  toCh: 15, toVs: 17, label: 'يوحنا 15: 1-17' },
  },

  // ── أمشير (فبراير/مارس) ──
  '6-3': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 13, fromVs: 1, toCh: 14, toVs: 5, label: 'كورنثوس الأولى 13: 1-14: 5' },
    catholic: { book: 'يوحنا الأولى', fromCh: 2, fromVs: 1, toCh: 2, toVs: 17, label: 'يوحنا الأولى 2: 1-17' },
    praxis:   { book: 'أعمال الرسل', fromCh: 13, fromVs: 16, toCh: 13, toVs: 52, label: 'أعمال 13: 16-52' },
    psalm:    { book: 'المزامير',   fromCh: 143, fromVs: 1, toCh: 143, toVs: 10, label: 'مزمور 143: 1-10' },
    gospel:   { book: 'يوحنا',     fromCh: 16, fromVs: 1,  toCh: 16, toVs: 24, label: 'يوحنا 16: 1-24' },
  },
  '6-10': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 15, fromVs: 1, toCh: 15, toVs: 28, label: 'كورنثوس الأولى 15: 1-28' },
    catholic: { book: 'يوحنا الأولى', fromCh: 2, fromVs: 18, toCh: 3, toVs: 10, label: 'يوحنا الأولى 2: 18-3: 10' },
    praxis:   { book: 'أعمال الرسل', fromCh: 14, fromVs: 1,  toCh: 14, toVs: 28, label: 'أعمال 14: 1-28' },
    psalm:    { book: 'المزامير',   fromCh: 145, fromVs: 1, toCh: 145, toVs: 13, label: 'مزمور 145: 1-13' },
    gospel:   { book: 'يوحنا',     fromCh: 17, fromVs: 1,  toCh: 17, toVs: 19, label: 'يوحنا 17: 1-19' },
  },
  '6-17': {
    pauline:  { book: 'كورنثوس الأولى', fromCh: 15, fromVs: 29, toCh: 15, toVs: 58, label: 'كورنثوس الأولى 15: 29-58' },
    catholic: { book: 'يوحنا الأولى', fromCh: 3, fromVs: 11, toCh: 4, toVs: 6, label: 'يوحنا الأولى 3: 11-4: 6' },
    praxis:   { book: 'أعمال الرسل', fromCh: 15, fromVs: 1,  toCh: 15, toVs: 21, label: 'أعمال 15: 1-21' },
    psalm:    { book: 'المزامير',   fromCh: 146, fromVs: 1, toCh: 146, toVs: 10, label: 'مزمور 146: 1-10' },
    gospel:   { book: 'يوحنا',     fromCh: 18, fromVs: 1,  toCh: 18, toVs: 27, label: 'يوحنا 18: 1-27' },
  },
  '6-24': {
    pauline:  { book: 'كورنثوس الثانية', fromCh: 1, fromVs: 1, toCh: 1, toVs: 22, label: 'كورنثوس الثانية 1: 1-22' },
    catholic: { book: 'يوحنا الأولى', fromCh: 4, fromVs: 7, toCh: 5, toVs: 4, label: 'يوحنا الأولى 4: 7-5: 4' },
    praxis:   { book: 'أعمال الرسل', fromCh: 15, fromVs: 22, toCh: 15, toVs: 41, label: 'أعمال 15: 22-41' },
    psalm:    { book: 'المزامير',   fromCh: 147, fromVs: 1, toCh: 147, toVs: 11, label: 'مزمور 147: 1-11' },
    gospel:   { book: 'يوحنا',     fromCh: 19, fromVs: 1,  toCh: 19, toVs: 22, label: 'يوحنا 19: 1-22' },
  },

  // ── برمهات (مارس/أبريل — موسم الصوم الكبير) ──
  '7-3': {
    pauline:  { book: 'كورنثوس الثانية', fromCh: 4, fromVs: 1, toCh: 4, toVs: 18, label: 'كورنثوس الثانية 4: 1-18' },
    catholic: { book: 'يوحنا الأولى', fromCh: 5, fromVs: 5, toCh: 5, toVs: 21, label: 'يوحنا الأولى 5: 5-21' },
    praxis:   { book: 'أعمال الرسل', fromCh: 16, fromVs: 1,  toCh: 16, toVs: 18, label: 'أعمال 16: 1-18' },
    psalm:    { book: 'المزامير',   fromCh: 148, fromVs: 1, toCh: 148, toVs: 14, label: 'مزمور 148: 1-14' },
    gospel:   { book: 'مرقس',      fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 20, label: 'مرقس 1: 1-20' },
  },
  '7-10': {
    pauline:  { book: 'كورنثوس الثانية', fromCh: 5, fromVs: 1, toCh: 5, toVs: 21, label: 'كورنثوس الثانية 5: 1-21' },
    catholic: { book: 'يوحنا الثانية', fromCh: 1, fromVs: 1, toCh: 1, toVs: 13, label: 'يوحنا الثانية 1: 1-13' },
    praxis:   { book: 'أعمال الرسل', fromCh: 16, fromVs: 19, toCh: 16, toVs: 40, label: 'أعمال 16: 19-40' },
    psalm:    { book: 'المزامير',   fromCh: 22, fromVs: 1,  toCh: 22, toVs: 11, label: 'مزمور 22: 1-11' },
    gospel:   { book: 'مرقس',      fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 22, label: 'مرقس 2: 1-22' },
  },
  '7-17': {
    pauline:  { book: 'كورنثوس الثانية', fromCh: 6, fromVs: 1, toCh: 6, toVs: 18, label: 'كورنثوس الثانية 6: 1-18' },
    catholic: { book: 'يوحنا الثالثة', fromCh: 1, fromVs: 1, toCh: 1, toVs: 14, label: 'يوحنا الثالثة 1: 1-14' },
    praxis:   { book: 'أعمال الرسل', fromCh: 17, fromVs: 1,  toCh: 17, toVs: 15, label: 'أعمال 17: 1-15' },
    psalm:    { book: 'المزامير',   fromCh: 31, fromVs: 1,  toCh: 31, toVs: 8,  label: 'مزمور 31: 1-8' },
    gospel:   { book: 'مرقس',      fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 21, label: 'مرقس 3: 1-21' },
  },
  '7-24': {
    pauline:  { book: 'كورنثوس الثانية', fromCh: 7, fromVs: 1, toCh: 7, toVs: 16, label: 'كورنثوس الثانية 7: 1-16' },
    catholic: { book: 'يهوذا',     fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 25, label: 'يهوذا 1: 1-25' },
    praxis:   { book: 'أعمال الرسل', fromCh: 17, fromVs: 16, toCh: 17, toVs: 34, label: 'أعمال 17: 16-34' },
    psalm:    { book: 'المزامير',   fromCh: 38, fromVs: 1,  toCh: 38, toVs: 11, label: 'مزمور 38: 1-11' },
    gospel:   { book: 'مرقس',      fromCh: 4,  fromVs: 1,  toCh: 4,  toVs: 25, label: 'مرقس 4: 1-25' },
  },

  // ── برموده (أبريل/مايو) ──
  '8-2': {
    pauline:  { book: 'غلاطية',    fromCh: 3,  fromVs: 23, toCh: 4,  toVs: 7,  label: 'غلاطية 3: 23-4: 7' },
    catholic: { book: 'يعقوب',      fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 18, label: 'يعقوب 1: 1-18' },
    praxis:   { book: 'أعمال الرسل', fromCh: 18, fromVs: 1,  toCh: 18, toVs: 23, label: 'أعمال 18: 1-23' },
    psalm:    { book: 'المزامير',   fromCh: 40, fromVs: 1,  toCh: 40, toVs: 8,  label: 'مزمور 40: 1-8' },
    gospel:   { book: 'لوقا',      fromCh: 24, fromVs: 1,  toCh: 24, toVs: 35, label: 'لوقا 24: 1-35' },
  },
  '8-9': {
    pauline:  { book: 'أفسس',      fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 14, label: 'أفسس 1: 1-14' },
    catholic: { book: 'يعقوب',      fromCh: 1,  fromVs: 19, toCh: 2,  toVs: 13, label: 'يعقوب 1: 19-2: 13' },
    praxis:   { book: 'أعمال الرسل', fromCh: 18, fromVs: 24, toCh: 19, toVs: 10, label: 'أعمال 18: 24-19: 10' },
    psalm:    { book: 'المزامير',   fromCh: 47, fromVs: 1,  toCh: 47, toVs: 9,  label: 'مزمور 47: 1-9' },
    gospel:   { book: 'لوقا',      fromCh: 24, fromVs: 36, toCh: 24, toVs: 53, label: 'لوقا 24: 36-53' },
  },
  '8-16': {
    pauline:  { book: 'أفسس',      fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 22, label: 'أفسس 2: 1-22' },
    catholic: { book: 'يعقوب',      fromCh: 2,  fromVs: 14, toCh: 3,  toVs: 12, label: 'يعقوب 2: 14-3: 12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 19, fromVs: 11, toCh: 19, toVs: 41, label: 'أعمال 19: 11-41' },
    psalm:    { book: 'المزامير',   fromCh: 57, fromVs: 8,  toCh: 57, toVs: 12, label: 'مزمور 57: 8-12' },
    gospel:   { book: 'يوحنا',     fromCh: 20, fromVs: 19, toCh: 20, toVs: 31, label: 'يوحنا 20: 19-31' },
  },
  '8-23': {
    pauline:  { book: 'أفسس',      fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 21, label: 'أفسس 3: 1-21' },
    catholic: { book: 'يعقوب',      fromCh: 3,  fromVs: 13, toCh: 4,  toVs: 12, label: 'يعقوب 3: 13-4: 12' },
    praxis:   { book: 'أعمال الرسل', fromCh: 20, fromVs: 1,  toCh: 20, toVs: 16, label: 'أعمال 20: 1-16' },
    psalm:    { book: 'المزامير',   fromCh: 66, fromVs: 1,  toCh: 66, toVs: 8,  label: 'مزمور 66: 1-8' },
    gospel:   { book: 'يوحنا',     fromCh: 21, fromVs: 1,  toCh: 21, toVs: 25, label: 'يوحنا 21: 1-25' },
  },

  // ── بشنس (مايو/يونيو) ──
  '9-1': {
    pauline:  { book: 'أفسس',      fromCh: 4,  fromVs: 1,  toCh: 4,  toVs: 16, label: 'أفسس 4: 1-16' },
    catholic: { book: 'يعقوب',      fromCh: 4,  fromVs: 13, toCh: 5,  toVs: 20, label: 'يعقوب 4: 13-5: 20' },
    praxis:   { book: 'أعمال الرسل', fromCh: 20, fromVs: 17, toCh: 20, toVs: 38, label: 'أعمال 20: 17-38' },
    psalm:    { book: 'المزامير',   fromCh: 68, fromVs: 18, toCh: 68, toVs: 18, label: 'مزمور 68: 18' },
    gospel:   { book: 'متى',       fromCh: 28, fromVs: 1,  toCh: 28, toVs: 20, label: 'متى 28: 1-20' },
  },
  '9-8': {
    pauline:  { book: 'أفسس',      fromCh: 5,  fromVs: 22, toCh: 6,  toVs: 9,  label: 'أفسس 5: 22-6: 9' },
    catholic: { book: 'بطرس الأولى', fromCh: 1, fromVs: 1, toCh: 1, toVs: 25, label: 'بطرس الأولى 1: 1-25' },
    praxis:   { book: 'أعمال الرسل', fromCh: 21, fromVs: 1,  toCh: 21, toVs: 17, label: 'أعمال 21: 1-17' },
    psalm:    { book: 'المزامير',   fromCh: 104, fromVs: 24, toCh: 104, toVs: 30, label: 'مزمور 104: 24-30' },
    gospel:   { book: 'يوحنا',     fromCh: 14, fromVs: 15, toCh: 14, toVs: 31, label: 'يوحنا 14: 15-31' },
  },
  '9-15': {
    pauline:  { book: 'أفسس',      fromCh: 6,  fromVs: 10, toCh: 6,  toVs: 24, label: 'أفسس 6: 10-24' },
    catholic: { book: 'بطرس الأولى', fromCh: 2, fromVs: 1, toCh: 2, toVs: 25, label: 'بطرس الأولى 2: 1-25' },
    praxis:   { book: 'أعمال الرسل', fromCh: 21, fromVs: 18, toCh: 21, toVs: 40, label: 'أعمال 21: 18-40' },
    psalm:    { book: 'المزامير',   fromCh: 68, fromVs: 35, toCh: 68, toVs: 35, label: 'مزمور 68: 35' },
    gospel:   { book: 'يوحنا',     fromCh: 15, fromVs: 26, toCh: 16, toVs: 15, label: 'يوحنا 15: 26-16: 15' },
  },
  '9-22': {
    pauline:  { book: 'فيلبي',     fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 20, label: 'فيلبي 1: 1-20' },
    catholic: { book: 'بطرس الأولى', fromCh: 3, fromVs: 1, toCh: 3, toVs: 22, label: 'بطرس الأولى 3: 1-22' },
    praxis:   { book: 'أعمال الرسل', fromCh: 22, fromVs: 1,  toCh: 22, toVs: 22, label: 'أعمال 22: 1-22' },
    psalm:    { book: 'المزامير',   fromCh: 118, fromVs: 105, toCh: 118, toVs: 105, label: 'مزمور 118: 105' },
    gospel:   { book: 'يوحنا',     fromCh: 16, fromVs: 16, toCh: 16, toVs: 33, label: 'يوحنا 16: 16-33' },
  },

  // ── بؤونه (يونيو/يوليو) ──
  '10-1': {
    pauline:  { book: 'فيلبي',     fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 18, label: 'فيلبي 2: 1-18' },
    catholic: { book: 'بطرس الأولى', fromCh: 4, fromVs: 1, toCh: 4, toVs: 19, label: 'بطرس الأولى 4: 1-19' },
    praxis:   { book: 'أعمال الرسل', fromCh: 23, fromVs: 1,  toCh: 23, toVs: 22, label: 'أعمال 23: 1-22' },
    psalm:    { book: 'المزامير',   fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 3,  label: 'مزمور 1: 1-3' },
    gospel:   { book: 'يوحنا',     fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 21, label: 'يوحنا 3: 1-21' },
  },
  '10-8': {
    pauline:  { book: 'فيلبي',     fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 21, label: 'فيلبي 3: 1-21' },
    catholic: { book: 'بطرس الأولى', fromCh: 5, fromVs: 1, toCh: 5, toVs: 14, label: 'بطرس الأولى 5: 1-14' },
    praxis:   { book: 'أعمال الرسل', fromCh: 24, fromVs: 1,  toCh: 24, toVs: 27, label: 'أعمال 24: 1-27' },
    psalm:    { book: 'المزامير',   fromCh: 16, fromVs: 11, toCh: 16, toVs: 11, label: 'مزمور 16: 11' },
    gospel:   { book: 'متى',       fromCh: 5,  fromVs: 1,  toCh: 5,  toVs: 16, label: 'متى 5: 1-16' },
  },
  '10-15': {
    pauline:  { book: 'فيلبي',     fromCh: 4,  fromVs: 1,  toCh: 4,  toVs: 23, label: 'فيلبي 4: 1-23' },
    catholic: { book: 'بطرس الثانية', fromCh: 1, fromVs: 1, toCh: 1, toVs: 21, label: 'بطرس الثانية 1: 1-21' },
    praxis:   { book: 'أعمال الرسل', fromCh: 25, fromVs: 1,  toCh: 25, toVs: 22, label: 'أعمال 25: 1-22' },
    psalm:    { book: 'المزامير',   fromCh: 44, fromVs: 3,  toCh: 44, toVs: 3,  label: 'مزمور 44: 3' },
    gospel:   { book: 'متى',       fromCh: 13, fromVs: 1,  toCh: 13, toVs: 23, label: 'متى 13: 1-23' },
  },
  '10-22': {
    pauline:  { book: 'كولوسي',    fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 20, label: 'كولوسي 1: 1-20' },
    catholic: { book: 'بطرس الثانية', fromCh: 2, fromVs: 1, toCh: 2, toVs: 22, label: 'بطرس الثانية 2: 1-22' },
    praxis:   { book: 'أعمال الرسل', fromCh: 26, fromVs: 1,  toCh: 26, toVs: 18, label: 'أعمال 26: 1-18' },
    psalm:    { book: 'المزامير',   fromCh: 89, fromVs: 15, toCh: 89, toVs: 15, label: 'مزمور 89: 15' },
    gospel:   { book: 'متى',       fromCh: 16, fromVs: 13, toCh: 16, toVs: 28, label: 'متى 16: 13-28' },
  },

  // ── أبيب (يوليو/أغسطس) ──
  '11-1': {
    pauline:  { book: 'كولوسي',    fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 17, label: 'كولوسي 3: 1-17' },
    catholic: { book: 'يوحنا الأولى', fromCh: 1, fromVs: 1, toCh: 2, toVs: 6, label: 'يوحنا الأولى 1: 1-2: 6' },
    praxis:   { book: 'أعمال الرسل', fromCh: 27, fromVs: 1,  toCh: 27, toVs: 26, label: 'أعمال 27: 1-26' },
    psalm:    { book: 'المزامير',   fromCh: 90, fromVs: 1,  toCh: 90, toVs: 12, label: 'مزمور 90: 1-12' },
    gospel:   { book: 'متى',       fromCh: 18, fromVs: 1,  toCh: 18, toVs: 20, label: 'متى 18: 1-20' },
  },
  '11-8': {
    pauline:  { book: 'تسالونيكى الأولى', fromCh: 1, fromVs: 1, toCh: 2, toVs: 12, label: 'تسالونيكى الأولى 1: 1-2: 12' },
    catholic: { book: 'يوحنا الأولى', fromCh: 2, fromVs: 7, toCh: 2, toVs: 29, label: 'يوحنا الأولى 2: 7-29' },
    praxis:   { book: 'أعمال الرسل', fromCh: 27, fromVs: 27, toCh: 28, toVs: 16, label: 'أعمال 27: 27-28: 16' },
    psalm:    { book: 'المزامير',   fromCh: 93, fromVs: 1,  toCh: 93, toVs: 5,  label: 'مزمور 93: 1-5' },
    gospel:   { book: 'متى',       fromCh: 22, fromVs: 34, toCh: 22, toVs: 46, label: 'متى 22: 34-46' },
  },
  '11-15': {
    pauline:  { book: 'تسالونيكى الأولى', fromCh: 4, fromVs: 1, toCh: 4, toVs: 18, label: 'تسالونيكى الأولى 4: 1-18' },
    catholic: { book: 'يوحنا الأولى', fromCh: 3, fromVs: 1, toCh: 3, toVs: 24, label: 'يوحنا الأولى 3: 1-24' },
    praxis:   { book: 'أعمال الرسل', fromCh: 28, fromVs: 17, toCh: 28, toVs: 31, label: 'أعمال 28: 17-31' },
    psalm:    { book: 'المزامير',   fromCh: 97, fromVs: 1,  toCh: 97, toVs: 7,  label: 'مزمور 97: 1-7' },
    gospel:   { book: 'متى',       fromCh: 24, fromVs: 29, toCh: 24, toVs: 51, label: 'متى 24: 29-51' },
  },
  '11-22': {
    pauline:  { book: 'تيموثاوس الأولى', fromCh: 1, fromVs: 1, toCh: 1, toVs: 20, label: 'تيموثاوس الأولى 1: 1-20' },
    catholic: { book: 'يوحنا الأولى', fromCh: 4, fromVs: 1, toCh: 4, toVs: 21, label: 'يوحنا الأولى 4: 1-21' },
    praxis:   { book: 'أعمال الرسل', fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 26, label: 'أعمال 1: 1-26' },
    psalm:    { book: 'المزامير',   fromCh: 98, fromVs: 1,  toCh: 98, toVs: 9,  label: 'مزمور 98: 1-9' },
    gospel:   { book: 'متى',       fromCh: 25, fromVs: 31, toCh: 25, toVs: 46, label: 'متى 25: 31-46' },
  },

  // ── مسرى (أغسطس/سبتمبر) ──
  '12-1': {
    pauline:  { book: 'عبرانيين',  fromCh: 11, fromVs: 1,  toCh: 11, toVs: 22, label: 'عبرانيين 11: 1-22' },
    catholic: { book: 'يوحنا الأولى', fromCh: 5, fromVs: 1, toCh: 5, toVs: 21, label: 'يوحنا الأولى 5: 1-21' },
    praxis:   { book: 'أعمال الرسل', fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 47, label: 'أعمال 2: 1-47' },
    psalm:    { book: 'المزامير',   fromCh: 150, fromVs: 1, toCh: 150, toVs: 6,  label: 'مزمور 150: 1-6' },
    gospel:   { book: 'متى',       fromCh: 17, fromVs: 1,  toCh: 17, toVs: 13, label: 'متى 17: 1-13' },
  },
  '12-8': {
    pauline:  { book: 'عبرانيين',  fromCh: 12, fromVs: 1,  toCh: 12, toVs: 17, label: 'عبرانيين 12: 1-17' },
    catholic: { book: 'يوحنا الثانية', fromCh: 1, fromVs: 1, toCh: 1, toVs: 13, label: 'يوحنا الثانية 1: 1-13' },
    praxis:   { book: 'أعمال الرسل', fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 26, label: 'أعمال 3: 1-26' },
    psalm:    { book: 'المزامير',   fromCh: 149, fromVs: 1, toCh: 149, toVs: 9,  label: 'مزمور 149: 1-9' },
    gospel:   { book: 'متى',       fromCh: 19, fromVs: 16, toCh: 19, toVs: 30, label: 'متى 19: 16-30' },
  },
  '12-15': {
    pauline:  { book: 'عبرانيين',  fromCh: 13, fromVs: 1,  toCh: 13, toVs: 25, label: 'عبرانيين 13: 1-25' },
    catholic: { book: 'يوحنا الثالثة', fromCh: 1, fromVs: 1, toCh: 1, toVs: 14, label: 'يوحنا الثالثة 1: 1-14' },
    praxis:   { book: 'أعمال الرسل', fromCh: 4,  fromVs: 1,  toCh: 4,  toVs: 31, label: 'أعمال 4: 1-31' },
    psalm:    { book: 'المزامير',   fromCh: 147, fromVs: 12, toCh: 147, toVs: 20, label: 'مزمور 147: 12-20' },
    gospel:   { book: 'متى',       fromCh: 20, fromVs: 1,  toCh: 20, toVs: 28, label: 'متى 20: 1-28' },
  },
  '12-22': {
    pauline:  { book: 'رؤيا يوحنا', fromCh: 1, fromVs: 1, toCh: 1, toVs: 8, label: 'رؤيا يوحنا 1: 1-8' },
    catholic: { book: 'يهوذا',     fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 25, label: 'يهوذا 1: 1-25' },
    praxis:   { book: 'أعمال الرسل', fromCh: 5,  fromVs: 1,  toCh: 5,  toVs: 42, label: 'أعمال 5: 1-42' },
    psalm:    { book: 'المزامير',   fromCh: 148, fromVs: 1, toCh: 148, toVs: 14, label: 'مزمور 148: 1-14' },
    gospel:   { book: 'متى',       fromCh: 22, fromVs: 1,  toCh: 22, toVs: 22, label: 'متى 22: 1-22' },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // القراءات اليومية التفصيلية — بشنس (أيام غير الأحاد)
  // ══════════════════════════════════════════════════════════════════════════
  '9-2':  { pauline:{book:'أفسس',fromCh:4,fromVs:17,toCh:4,toVs:24,label:'أفسس 4: 17-24'},        catholic:{book:'يعقوب',fromCh:5,fromVs:1,toCh:5,toVs:6,label:'يعقوب 5: 1-6'},              praxis:{book:'أعمال الرسل',fromCh:21,fromVs:1,toCh:21,toVs:9,label:'أعمال 21: 1-9'},       psalm:{book:'المزامير',fromCh:119,fromVs:1,toCh:119,toVs:8,label:'مزمور 119: 1-8'},     gospel:{book:'مرقس',fromCh:1,fromVs:1,toCh:1,toVs:13,label:'مرقس 1: 1-13'} },
  '9-3':  { pauline:{book:'أفسس',fromCh:4,fromVs:25,toCh:4,toVs:32,label:'أفسس 4: 25-32'},        catholic:{book:'يعقوب',fromCh:5,fromVs:7,toCh:5,toVs:12,label:'يعقوب 5: 7-12'},            praxis:{book:'أعمال الرسل',fromCh:21,fromVs:10,toCh:21,toVs:17,label:'أعمال 21: 10-17'},    psalm:{book:'المزامير',fromCh:119,fromVs:9,toCh:119,toVs:16,label:'مزمور 119: 9-16'},   gospel:{book:'مرقس',fromCh:1,fromVs:14,toCh:1,toVs:28,label:'مرقس 1: 14-28'} },
  '9-4':  { pauline:{book:'أفسس',fromCh:5,fromVs:1,toCh:5,toVs:10,label:'أفسس 5: 1-10'},          catholic:{book:'يعقوب',fromCh:5,fromVs:13,toCh:5,toVs:20,label:'يعقوب 5: 13-20'},          praxis:{book:'أعمال الرسل',fromCh:21,fromVs:18,toCh:21,toVs:26,label:'أعمال 21: 18-26'},   psalm:{book:'المزامير',fromCh:119,fromVs:17,toCh:119,toVs:24,label:'مزمور 119: 17-24'}, gospel:{book:'مرقس',fromCh:2,fromVs:1,toCh:2,toVs:17,label:'مرقس 2: 1-17'} },
  '9-5':  { pauline:{book:'أفسس',fromCh:5,fromVs:11,toCh:5,toVs:21,label:'أفسس 5: 11-21'},        catholic:{book:'بطرس الأولى',fromCh:1,fromVs:1,toCh:1,toVs:7,label:'بطرس الأولى 1: 1-7'},   praxis:{book:'أعمال الرسل',fromCh:21,fromVs:27,toCh:21,toVs:36,label:'أعمال 21: 27-36'},  psalm:{book:'المزامير',fromCh:119,fromVs:25,toCh:119,toVs:32,label:'مزمور 119: 25-32'}, gospel:{book:'مرقس',fromCh:3,fromVs:1,toCh:3,toVs:12,label:'مرقس 3: 1-12'} },
  '9-6':  { pauline:{book:'أفسس',fromCh:5,fromVs:22,toCh:5,toVs:33,label:'أفسس 5: 22-33'},        catholic:{book:'بطرس الأولى',fromCh:1,fromVs:8,toCh:1,toVs:14,label:'بطرس الأولى 1: 8-14'}, praxis:{book:'أعمال الرسل',fromCh:21,fromVs:37,toCh:22,toVs:5,label:'أعمال 21: 37-22: 5'}, psalm:{book:'المزامير',fromCh:119,fromVs:33,toCh:119,toVs:40,label:'مزمور 119: 33-40'}, gospel:{book:'يوحنا',fromCh:14,fromVs:1,toCh:14,toVs:14,label:'يوحنا 14: 1-14'} },
  '9-7':  { pauline:{book:'أفسس',fromCh:6,fromVs:1,toCh:6,toVs:9,label:'أفسس 6: 1-9'},            catholic:{book:'بطرس الأولى',fromCh:1,fromVs:15,toCh:1,toVs:25,label:'بطرس الأولى 1: 15-25'},praxis:{book:'أعمال الرسل',fromCh:22,fromVs:6,toCh:22,toVs:16,label:'أعمال 22: 6-16'},    psalm:{book:'المزامير',fromCh:119,fromVs:41,toCh:119,toVs:48,label:'مزمور 119: 41-48'}, gospel:{book:'يوحنا',fromCh:14,fromVs:15,toCh:14,toVs:26,label:'يوحنا 14: 15-26'} },

  '9-9':  { pauline:{book:'أفسس',fromCh:6,fromVs:10,toCh:6,toVs:17,label:'أفسس 6: 10-17'},        catholic:{book:'بطرس الأولى',fromCh:1,fromVs:13,toCh:1,toVs:21,label:'بطرس الأولى 1: 13-21'},praxis:{book:'أعمال الرسل',fromCh:22,fromVs:1,toCh:22,toVs:10,label:'أعمال 22: 1-10'},    psalm:{book:'المزامير',fromCh:119,fromVs:49,toCh:119,toVs:56,label:'مزمور 119: 49-56'}, gospel:{book:'يوحنا',fromCh:15,fromVs:1,toCh:15,toVs:11,label:'يوحنا 15: 1-11'} },
  '9-10': { pauline:{book:'أفسس',fromCh:6,fromVs:18,toCh:6,toVs:24,label:'أفسس 6: 18-24'},        catholic:{book:'بطرس الأولى',fromCh:2,fromVs:1,toCh:2,toVs:8,label:'بطرس الأولى 2: 1-8'},   praxis:{book:'أعمال الرسل',fromCh:22,fromVs:11,toCh:22,toVs:21,label:'أعمال 22: 11-21'},   psalm:{book:'المزامير',fromCh:119,fromVs:57,toCh:119,toVs:64,label:'مزمور 119: 57-64'}, gospel:{book:'يوحنا',fromCh:15,fromVs:12,toCh:15,toVs:21,label:'يوحنا 15: 12-21'} },
  '9-11': { pauline:{book:'فيلبي',fromCh:1,fromVs:1,toCh:1,toVs:8,label:'فيلبي 1: 1-8'},          catholic:{book:'بطرس الأولى',fromCh:2,fromVs:9,toCh:2,toVs:16,label:'بطرس الأولى 2: 9-16'},  praxis:{book:'أعمال الرسل',fromCh:22,fromVs:22,toCh:22,toVs:29,label:'أعمال 22: 22-29'},   psalm:{book:'المزامير',fromCh:119,fromVs:65,toCh:119,toVs:72,label:'مزمور 119: 65-72'}, gospel:{book:'يوحنا',fromCh:15,fromVs:22,toCh:15,toVs:27,label:'يوحنا 15: 22-27'} },
  '9-12': { pauline:{book:'فيلبي',fromCh:1,fromVs:9,toCh:1,toVs:18,label:'فيلبي 1: 9-18'},        catholic:{book:'بطرس الأولى',fromCh:2,fromVs:17,toCh:2,toVs:25,label:'بطرس الأولى 2: 17-25'}, praxis:{book:'أعمال الرسل',fromCh:22,fromVs:30,toCh:23,toVs:11,label:'أعمال 22: 30-23: 11'},psalm:{book:'المزامير',fromCh:119,fromVs:73,toCh:119,toVs:80,label:'مزمور 119: 73-80'}, gospel:{book:'يوحنا',fromCh:16,fromVs:1,toCh:16,toVs:11,label:'يوحنا 16: 1-11'} },
  '9-13': { pauline:{book:'فيلبي',fromCh:1,fromVs:19,toCh:1,toVs:26,label:'فيلبي 1: 19-26'},      catholic:{book:'بطرس الأولى',fromCh:3,fromVs:1,toCh:3,toVs:7,label:'بطرس الأولى 3: 1-7'},    praxis:{book:'أعمال الرسل',fromCh:23,fromVs:12,toCh:23,toVs:22,label:'أعمال 23: 12-22'},   psalm:{book:'المزامير',fromCh:119,fromVs:81,toCh:119,toVs:88,label:'مزمور 119: 81-88'}, gospel:{book:'يوحنا',fromCh:16,fromVs:12,toCh:16,toVs:22,label:'يوحنا 16: 12-22'} },
  '9-14': { pauline:{book:'فيلبي',fromCh:1,fromVs:27,toCh:2,toVs:4,label:'فيلبي 1: 27-2: 4'},     catholic:{book:'بطرس الأولى',fromCh:3,fromVs:8,toCh:3,toVs:17,label:'بطرس الأولى 3: 8-17'},   praxis:{book:'أعمال الرسل',fromCh:23,fromVs:23,toCh:23,toVs:35,label:'أعمال 23: 23-35'},   psalm:{book:'المزامير',fromCh:119,fromVs:89,toCh:119,toVs:96,label:'مزمور 119: 89-96'}, gospel:{book:'يوحنا',fromCh:17,fromVs:1,toCh:17,toVs:13,label:'يوحنا 17: 1-13'} },

  '9-16': { pauline:{book:'فيلبي',fromCh:1,fromVs:1,toCh:1,toVs:11,label:'فيلبي 1: 1-11'},        catholic:{book:'بطرس الأولى',fromCh:3,fromVs:1,toCh:3,toVs:7,label:'بطرس الأولى 3: 1-7'},    praxis:{book:'أعمال الرسل',fromCh:24,fromVs:1,toCh:24,toVs:14,label:'أعمال 24: 1-14'},    psalm:{book:'المزامير',fromCh:119,fromVs:97,toCh:119,toVs:104,label:'مزمور 119: 97-104'}, gospel:{book:'يوحنا',fromCh:16,fromVs:16,toCh:16,toVs:24,label:'يوحنا 16: 16-24'} },
  '9-17': { pauline:{book:'فيلبي',fromCh:1,fromVs:12,toCh:1,toVs:20,label:'فيلبي 1: 12-20'},      catholic:{book:'بطرس الأولى',fromCh:3,fromVs:8,toCh:3,toVs:15,label:'بطرس الأولى 3: 8-15'},   praxis:{book:'أعمال الرسل',fromCh:24,fromVs:15,toCh:24,toVs:27,label:'أعمال 24: 15-27'},   psalm:{book:'المزامير',fromCh:119,fromVs:105,toCh:119,toVs:112,label:'مزمور 119: 105-112'},gospel:{book:'يوحنا',fromCh:17,fromVs:1,toCh:17,toVs:11,label:'يوحنا 17: 1-11'} },
  '9-18': { pauline:{book:'فيلبي',fromCh:1,fromVs:21,toCh:1,toVs:30,label:'فيلبي 1: 21-30'},      catholic:{book:'بطرس الأولى',fromCh:3,fromVs:16,toCh:3,toVs:22,label:'بطرس الأولى 3: 16-22'}, praxis:{book:'أعمال الرسل',fromCh:25,fromVs:1,toCh:25,toVs:12,label:'أعمال 25: 1-12'},    psalm:{book:'المزامير',fromCh:119,fromVs:113,toCh:119,toVs:120,label:'مزمور 119: 113-120'},gospel:{book:'يوحنا',fromCh:17,fromVs:12,toCh:17,toVs:19,label:'يوحنا 17: 12-19'} },
  '9-19': { pauline:{book:'فيلبي',fromCh:2,fromVs:1,toCh:2,toVs:11,label:'فيلبي 2: 1-11'},        catholic:{book:'بطرس الأولى',fromCh:4,fromVs:1,toCh:4,toVs:7,label:'بطرس الأولى 4: 1-7'},    praxis:{book:'أعمال الرسل',fromCh:25,fromVs:13,toCh:25,toVs:26,label:'أعمال 25: 13-26'},   psalm:{book:'المزامير',fromCh:119,fromVs:121,toCh:119,toVs:128,label:'مزمور 119: 121-128'},gospel:{book:'يوحنا',fromCh:17,fromVs:20,toCh:17,toVs:26,label:'يوحنا 17: 20-26'} },
  '9-20': { pauline:{book:'فيلبي',fromCh:2,fromVs:12,toCh:2,toVs:18,label:'فيلبي 2: 12-18'},      catholic:{book:'بطرس الأولى',fromCh:4,fromVs:8,toCh:4,toVs:15,label:'بطرس الأولى 4: 8-15'},   praxis:{book:'أعمال الرسل',fromCh:26,fromVs:1,toCh:26,toVs:18,label:'أعمال 26: 1-18'},    psalm:{book:'المزامير',fromCh:119,fromVs:129,toCh:119,toVs:136,label:'مزمور 119: 129-136'},gospel:{book:'يوحنا',fromCh:18,fromVs:1,toCh:18,toVs:11,label:'يوحنا 18: 1-11'} },
  '9-21': { pauline:{book:'فيلبي',fromCh:2,fromVs:19,toCh:2,toVs:30,label:'فيلبي 2: 19-30'},      catholic:{book:'بطرس الأولى',fromCh:4,fromVs:16,toCh:4,toVs:19,label:'بطرس الأولى 4: 16-19'}, praxis:{book:'أعمال الرسل',fromCh:26,fromVs:19,toCh:26,toVs:32,label:'أعمال 26: 19-32'},   psalm:{book:'المزامير',fromCh:119,fromVs:137,toCh:119,toVs:144,label:'مزمور 119: 137-144'},gospel:{book:'يوحنا',fromCh:18,fromVs:12,toCh:18,toVs:23,label:'يوحنا 18: 12-23'} },

  '9-23': { pauline:{book:'فيلبي',fromCh:1,fromVs:21,toCh:1,toVs:30,label:'فيلبي 1: 21-30'},      catholic:{book:'بطرس الأولى',fromCh:3,fromVs:1,toCh:3,toVs:7,label:'بطرس الأولى 3: 1-7'},    praxis:{book:'أعمال الرسل',fromCh:22,fromVs:22,toCh:22,toVs:29,label:'أعمال 22: 22-29'},   psalm:{book:'المزامير',fromCh:119,fromVs:145,toCh:119,toVs:152,label:'مزمور 119: 145-152'},gospel:{book:'يوحنا',fromCh:17,fromVs:1,toCh:17,toVs:11,label:'يوحنا 17: 1-11'} },
  '9-24': { pauline:{book:'فيلبي',fromCh:2,fromVs:1,toCh:2,toVs:8,label:'فيلبي 2: 1-8'},          catholic:{book:'بطرس الأولى',fromCh:3,fromVs:8,toCh:3,toVs:14,label:'بطرس الأولى 3: 8-14'},   praxis:{book:'أعمال الرسل',fromCh:23,fromVs:1,toCh:23,toVs:11,label:'أعمال 23: 1-11'},    psalm:{book:'المزامير',fromCh:119,fromVs:153,toCh:119,toVs:160,label:'مزمور 119: 153-160'},gospel:{book:'يوحنا',fromCh:17,fromVs:12,toCh:17,toVs:21,label:'يوحنا 17: 12-21'} },
  '9-25': { pauline:{book:'فيلبي',fromCh:2,fromVs:9,toCh:2,toVs:18,label:'فيلبي 2: 9-18'},        catholic:{book:'بطرس الأولى',fromCh:3,fromVs:15,toCh:3,toVs:22,label:'بطرس الأولى 3: 15-22'}, praxis:{book:'أعمال الرسل',fromCh:23,fromVs:12,toCh:23,toVs:22,label:'أعمال 23: 12-22'},   psalm:{book:'المزامير',fromCh:119,fromVs:161,toCh:119,toVs:168,label:'مزمور 119: 161-168'},gospel:{book:'يوحنا',fromCh:17,fromVs:22,toCh:17,toVs:26,label:'يوحنا 17: 22-26'} },
  '9-26': { pauline:{book:'فيلبي',fromCh:2,fromVs:19,toCh:2,toVs:30,label:'فيلبي 2: 19-30'},      catholic:{book:'بطرس الأولى',fromCh:4,fromVs:1,toCh:4,toVs:11,label:'بطرس الأولى 4: 1-11'},   praxis:{book:'أعمال الرسل',fromCh:23,fromVs:23,toCh:23,toVs:35,label:'أعمال 23: 23-35'},   psalm:{book:'المزامير',fromCh:119,fromVs:169,toCh:119,toVs:176,label:'مزمور 119: 169-176'},gospel:{book:'يوحنا',fromCh:18,fromVs:1,toCh:18,toVs:12,label:'يوحنا 18: 1-12'} },
  '9-27': { pauline:{book:'فيلبي',fromCh:3,fromVs:1,toCh:3,toVs:11,label:'فيلبي 3: 1-11'},        catholic:{book:'بطرس الأولى',fromCh:4,fromVs:12,toCh:4,toVs:19,label:'بطرس الأولى 4: 12-19'}, praxis:{book:'أعمال الرسل',fromCh:24,fromVs:1,toCh:24,toVs:12,label:'أعمال 24: 1-12'},    psalm:{book:'المزامير',fromCh:120,fromVs:1,toCh:120,toVs:7,label:'مزمور 120: 1-7'},       gospel:{book:'يوحنا',fromCh:18,fromVs:13,toCh:18,toVs:27,label:'يوحنا 18: 13-27'} },
  // ← اليوم الحالي 28 بشنس — الكاثوليكون مؤكد: بطرس الأولى 5
  '9-28': { pauline:{book:'فيلبي',fromCh:3,fromVs:12,toCh:3,toVs:21,label:'فيلبي 3: 12-21'},      catholic:{book:'بطرس الأولى',fromCh:5,fromVs:1,toCh:5,toVs:14,label:'بطرس الأولى 5: 1-14'}, praxis:{book:'أعمال الرسل',fromCh:24,fromVs:13,toCh:24,toVs:25,label:'أعمال 24: 13-25'},   psalm:{book:'المزامير',fromCh:121,fromVs:1,toCh:121,toVs:8,label:'مزمور 121: 1-8'},       gospel:{book:'يوحنا',fromCh:18,fromVs:28,toCh:18,toVs:40,label:'يوحنا 18: 28-40'} },
  '9-29': { pauline:{book:'فيلبي',fromCh:4,fromVs:1,toCh:4,toVs:9,label:'فيلبي 4: 1-9'},          catholic:{book:'بطرس الثانية',fromCh:1,fromVs:1,toCh:1,toVs:7,label:'بطرس الثانية 1: 1-7'},  praxis:{book:'أعمال الرسل',fromCh:24,fromVs:26,toCh:25,toVs:5,label:'أعمال 24: 26-25: 5'}, psalm:{book:'المزامير',fromCh:122,fromVs:1,toCh:122,toVs:9,label:'مزمور 122: 1-9'},       gospel:{book:'يوحنا',fromCh:19,fromVs:1,toCh:19,toVs:16,label:'يوحنا 19: 1-16'} },
  '9-30': { pauline:{book:'فيلبي',fromCh:4,fromVs:10,toCh:4,toVs:23,label:'فيلبي 4: 10-23'},      catholic:{book:'بطرس الثانية',fromCh:1,fromVs:8,toCh:1,toVs:15,label:'بطرس الثانية 1: 8-15'}, praxis:{book:'أعمال الرسل',fromCh:25,fromVs:6,toCh:25,toVs:12,label:'أعمال 25: 6-12'},    psalm:{book:'المزامير',fromCh:123,fromVs:1,toCh:123,toVs:4,label:'مزمور 123: 1-4'},       gospel:{book:'يوحنا',fromCh:19,fromVs:17,toCh:19,toVs:30,label:'يوحنا 19: 17-30'} },

  // ══════════════════════════════════════════════════════════════════════════
  // القراءات اليومية التفصيلية — بؤونه (أيام غير الأحاد)
  // ══════════════════════════════════════════════════════════════════════════
  '10-2': { pauline:{book:'فيلبي',fromCh:2,fromVs:9,toCh:2,toVs:18,label:'فيلبي 2: 9-18'},        catholic:{book:'بطرس الأولى',fromCh:4,fromVs:7,toCh:4,toVs:11,label:'بطرس الأولى 4: 7-11'},  praxis:{book:'أعمال الرسل',fromCh:23,fromVs:1,toCh:23,toVs:11,label:'أعمال 23: 1-11'},    psalm:{book:'المزامير',fromCh:124,fromVs:1,toCh:124,toVs:8,label:'مزمور 124: 1-8'},       gospel:{book:'يوحنا',fromCh:3,fromVs:1,toCh:3,toVs:15,label:'يوحنا 3: 1-15'} },
  '10-3': { pauline:{book:'فيلبي',fromCh:2,fromVs:19,toCh:2,toVs:30,label:'فيلبي 2: 19-30'},      catholic:{book:'بطرس الأولى',fromCh:4,fromVs:12,toCh:4,toVs:19,label:'بطرس الأولى 4: 12-19'}, praxis:{book:'أعمال الرسل',fromCh:23,fromVs:12,toCh:23,toVs:22,label:'أعمال 23: 12-22'},   psalm:{book:'المزامير',fromCh:125,fromVs:1,toCh:125,toVs:5,label:'مزمور 125: 1-5'},       gospel:{book:'يوحنا',fromCh:3,fromVs:16,toCh:3,toVs:21,label:'يوحنا 3: 16-21'} },
  '10-4': { pauline:{book:'فيلبي',fromCh:3,fromVs:1,toCh:3,toVs:9,label:'فيلبي 3: 1-9'},          catholic:{book:'بطرس الأولى',fromCh:5,fromVs:1,toCh:5,toVs:7,label:'بطرس الأولى 5: 1-7'},    praxis:{book:'أعمال الرسل',fromCh:23,fromVs:23,toCh:23,toVs:35,label:'أعمال 23: 23-35'},   psalm:{book:'المزامير',fromCh:126,fromVs:1,toCh:126,toVs:6,label:'مزمور 126: 1-6'},       gospel:{book:'يوحنا',fromCh:4,fromVs:1,toCh:4,toVs:14,label:'يوحنا 4: 1-14'} },
  '10-5': { pauline:{book:'فيلبي',fromCh:3,fromVs:10,toCh:3,toVs:14,label:'فيلبي 3: 10-14'},      catholic:{book:'بطرس الأولى',fromCh:5,fromVs:8,toCh:5,toVs:14,label:'بطرس الأولى 5: 8-14'},   praxis:{book:'أعمال الرسل',fromCh:24,fromVs:1,toCh:24,toVs:9,label:'أعمال 24: 1-9'},      psalm:{book:'المزامير',fromCh:127,fromVs:1,toCh:127,toVs:5,label:'مزمور 127: 1-5'},       gospel:{book:'يوحنا',fromCh:4,fromVs:15,toCh:4,toVs:26,label:'يوحنا 4: 15-26'} },
  '10-6': { pauline:{book:'فيلبي',fromCh:3,fromVs:15,toCh:3,toVs:21,label:'فيلبي 3: 15-21'},      catholic:{book:'بطرس الثانية',fromCh:1,fromVs:1,toCh:1,toVs:7,label:'بطرس الثانية 1: 1-7'},   praxis:{book:'أعمال الرسل',fromCh:24,fromVs:10,toCh:24,toVs:16,label:'أعمال 24: 10-16'},   psalm:{book:'المزامير',fromCh:128,fromVs:1,toCh:128,toVs:6,label:'مزمور 128: 1-6'},       gospel:{book:'يوحنا',fromCh:5,fromVs:1,toCh:5,toVs:15,label:'يوحنا 5: 1-15'} },
  '10-7': { pauline:{book:'فيلبي',fromCh:4,fromVs:1,toCh:4,toVs:7,label:'فيلبي 4: 1-7'},          catholic:{book:'بطرس الثانية',fromCh:1,fromVs:8,toCh:1,toVs:15,label:'بطرس الثانية 1: 8-15'},  praxis:{book:'أعمال الرسل',fromCh:24,fromVs:17,toCh:24,toVs:23,label:'أعمال 24: 17-23'},   psalm:{book:'المزامير',fromCh:129,fromVs:1,toCh:129,toVs:8,label:'مزمور 129: 1-8'},       gospel:{book:'يوحنا',fromCh:5,fromVs:16,toCh:5,toVs:29,label:'يوحنا 5: 16-29'} },

  '10-9':  { pauline:{book:'فيلبي',fromCh:3,fromVs:7,toCh:3,toVs:14,label:'فيلبي 3: 7-14'},       catholic:{book:'بطرس الثانية',fromCh:1,fromVs:1,toCh:1,toVs:7,label:'بطرس الثانية 1: 1-7'},   praxis:{book:'أعمال الرسل',fromCh:24,fromVs:1,toCh:24,toVs:12,label:'أعمال 24: 1-12'},    psalm:{book:'المزامير',fromCh:130,fromVs:1,toCh:130,toVs:8,label:'مزمور 130: 1-8'},       gospel:{book:'متى',fromCh:5,fromVs:1,toCh:5,toVs:12,label:'متى 5: 1-12'} },
  '10-10': { pauline:{book:'فيلبي',fromCh:3,fromVs:15,toCh:3,toVs:21,label:'فيلبي 3: 15-21'},     catholic:{book:'بطرس الثانية',fromCh:1,fromVs:8,toCh:1,toVs:15,label:'بطرس الثانية 1: 8-15'},  praxis:{book:'أعمال الرسل',fromCh:24,fromVs:13,toCh:24,toVs:21,label:'أعمال 24: 13-21'},   psalm:{book:'المزامير',fromCh:131,fromVs:1,toCh:131,toVs:3,label:'مزمور 131: 1-3'},       gospel:{book:'متى',fromCh:5,fromVs:13,toCh:5,toVs:20,label:'متى 5: 13-20'} },
  '10-11': { pauline:{book:'فيلبي',fromCh:4,fromVs:1,toCh:4,toVs:7,label:'فيلبي 4: 1-7'},         catholic:{book:'بطرس الثانية',fromCh:1,fromVs:16,toCh:1,toVs:21,label:'بطرس الثانية 1: 16-21'}, praxis:{book:'أعمال الرسل',fromCh:24,fromVs:22,toCh:24,toVs:27,label:'أعمال 24: 22-27'},  psalm:{book:'المزامير',fromCh:132,fromVs:1,toCh:132,toVs:9,label:'مزمور 132: 1-9'},       gospel:{book:'متى',fromCh:5,fromVs:21,toCh:5,toVs:32,label:'متى 5: 21-32'} },
  '10-12': { pauline:{book:'فيلبي',fromCh:4,fromVs:8,toCh:4,toVs:14,label:'فيلبي 4: 8-14'},       catholic:{book:'بطرس الثانية',fromCh:2,fromVs:1,toCh:2,toVs:9,label:'بطرس الثانية 2: 1-9'},    praxis:{book:'أعمال الرسل',fromCh:25,fromVs:1,toCh:25,toVs:8,label:'أعمال 25: 1-8'},      psalm:{book:'المزامير',fromCh:132,fromVs:10,toCh:132,toVs:18,label:'مزمور 132: 10-18'},   gospel:{book:'متى',fromCh:5,fromVs:33,toCh:5,toVs:48,label:'متى 5: 33-48'} },
  '10-13': { pauline:{book:'فيلبي',fromCh:4,fromVs:15,toCh:4,toVs:23,label:'فيلبي 4: 15-23'},     catholic:{book:'بطرس الثانية',fromCh:2,fromVs:10,toCh:2,toVs:16,label:'بطرس الثانية 2: 10-16'}, praxis:{book:'أعمال الرسل',fromCh:25,fromVs:9,toCh:25,toVs:12,label:'أعمال 25: 9-12'},   psalm:{book:'المزامير',fromCh:133,fromVs:1,toCh:133,toVs:3,label:'مزمور 133: 1-3'},       gospel:{book:'متى',fromCh:6,fromVs:1,toCh:6,toVs:18,label:'متى 6: 1-18'} },
  '10-14': { pauline:{book:'كولوسي',fromCh:1,fromVs:1,toCh:1,toVs:8,label:'كولوسي 1: 1-8'},        catholic:{book:'بطرس الثانية',fromCh:2,fromVs:17,toCh:2,toVs:22,label:'بطرس الثانية 2: 17-22'}, praxis:{book:'أعمال الرسل',fromCh:25,fromVs:13,toCh:25,toVs:21,label:'أعمال 25: 13-21'},  psalm:{book:'المزامير',fromCh:134,fromVs:1,toCh:134,toVs:3,label:'مزمور 134: 1-3'},       gospel:{book:'متى',fromCh:6,fromVs:19,toCh:6,toVs:34,label:'متى 6: 19-34'} },

  '10-16': { pauline:{book:'فيلبي',fromCh:4,fromVs:4,toCh:4,toVs:9,label:'فيلبي 4: 4-9'},         catholic:{book:'بطرس الثانية',fromCh:2,fromVs:1,toCh:2,toVs:9,label:'بطرس الثانية 2: 1-9'},    praxis:{book:'أعمال الرسل',fromCh:25,fromVs:1,toCh:25,toVs:12,label:'أعمال 25: 1-12'},    psalm:{book:'المزامير',fromCh:135,fromVs:1,toCh:135,toVs:7,label:'مزمور 135: 1-7'},       gospel:{book:'متى',fromCh:13,fromVs:1,toCh:13,toVs:9,label:'متى 13: 1-9'} },
  '10-17': { pauline:{book:'فيلبي',fromCh:4,fromVs:10,toCh:4,toVs:14,label:'فيلبي 4: 10-14'},     catholic:{book:'بطرس الثانية',fromCh:2,fromVs:10,toCh:2,toVs:16,label:'بطرس الثانية 2: 10-16'}, praxis:{book:'أعمال الرسل',fromCh:25,fromVs:13,toCh:25,toVs:22,label:'أعمال 25: 13-22'},  psalm:{book:'المزامير',fromCh:135,fromVs:8,toCh:135,toVs:14,label:'مزمور 135: 8-14'},     gospel:{book:'متى',fromCh:13,fromVs:10,toCh:13,toVs:23,label:'متى 13: 10-23'} },
  '10-18': { pauline:{book:'فيلبي',fromCh:4,fromVs:15,toCh:4,toVs:23,label:'فيلبي 4: 15-23'},     catholic:{book:'بطرس الثانية',fromCh:2,fromVs:17,toCh:2,toVs:22,label:'بطرس الثانية 2: 17-22'}, praxis:{book:'أعمال الرسل',fromCh:26,fromVs:1,toCh:26,toVs:11,label:'أعمال 26: 1-11'},   psalm:{book:'المزامير',fromCh:136,fromVs:1,toCh:136,toVs:9,label:'مزمور 136: 1-9'},       gospel:{book:'متى',fromCh:13,fromVs:24,toCh:13,toVs:35,label:'متى 13: 24-35'} },
  '10-19': { pauline:{book:'كولوسي',fromCh:1,fromVs:1,toCh:1,toVs:8,label:'كولوسي 1: 1-8'},        catholic:{book:'بطرس الثانية',fromCh:3,fromVs:1,toCh:3,toVs:9,label:'بطرس الثانية 3: 1-9'},    praxis:{book:'أعمال الرسل',fromCh:26,fromVs:12,toCh:26,toVs:18,label:'أعمال 26: 12-18'},   psalm:{book:'المزامير',fromCh:136,fromVs:10,toCh:136,toVs:16,label:'مزمور 136: 10-16'},   gospel:{book:'متى',fromCh:13,fromVs:36,toCh:13,toVs:43,label:'متى 13: 36-43'} },
  '10-20': { pauline:{book:'كولوسي',fromCh:1,fromVs:9,toCh:1,toVs:14,label:'كولوسي 1: 9-14'},      catholic:{book:'بطرس الثانية',fromCh:3,fromVs:10,toCh:3,toVs:14,label:'بطرس الثانية 3: 10-14'}, praxis:{book:'أعمال الرسل',fromCh:26,fromVs:19,toCh:26,toVs:23,label:'أعمال 26: 19-23'},  psalm:{book:'المزامير',fromCh:136,fromVs:17,toCh:136,toVs:26,label:'مزمور 136: 17-26'},   gospel:{book:'متى',fromCh:13,fromVs:44,toCh:13,toVs:58,label:'متى 13: 44-58'} },
  '10-21': { pauline:{book:'كولوسي',fromCh:1,fromVs:15,toCh:1,toVs:20,label:'كولوسي 1: 15-20'},    catholic:{book:'بطرس الثانية',fromCh:3,fromVs:15,toCh:3,toVs:18,label:'بطرس الثانية 3: 15-18'}, praxis:{book:'أعمال الرسل',fromCh:26,fromVs:24,toCh:26,toVs:32,label:'أعمال 26: 24-32'},  psalm:{book:'المزامير',fromCh:137,fromVs:1,toCh:137,toVs:9,label:'مزمور 137: 1-9'},       gospel:{book:'متى',fromCh:14,fromVs:1,toCh:14,toVs:21,label:'متى 14: 1-21'} },

  '10-23': { pauline:{book:'كولوسي',fromCh:1,fromVs:9,toCh:1,toVs:17,label:'كولوسي 1: 9-17'},      catholic:{book:'يوحنا الأولى',fromCh:1,fromVs:1,toCh:1,toVs:5,label:'يوحنا الأولى 1: 1-5'},    praxis:{book:'أعمال الرسل',fromCh:26,fromVs:1,toCh:26,toVs:11,label:'أعمال 26: 1-11'},    psalm:{book:'المزامير',fromCh:138,fromVs:1,toCh:138,toVs:8,label:'مزمور 138: 1-8'},       gospel:{book:'متى',fromCh:16,fromVs:1,toCh:16,toVs:12,label:'متى 16: 1-12'} },
  '10-24': { pauline:{book:'كولوسي',fromCh:1,fromVs:18,toCh:1,toVs:23,label:'كولوسي 1: 18-23'},    catholic:{book:'يوحنا الأولى',fromCh:1,fromVs:6,toCh:1,toVs:10,label:'يوحنا الأولى 1: 6-10'},   praxis:{book:'أعمال الرسل',fromCh:26,fromVs:12,toCh:26,toVs:23,label:'أعمال 26: 12-23'},   psalm:{book:'المزامير',fromCh:139,fromVs:1,toCh:139,toVs:12,label:'مزمور 139: 1-12'},     gospel:{book:'متى',fromCh:16,fromVs:13,toCh:16,toVs:20,label:'متى 16: 13-20'} },
  '10-25': { pauline:{book:'كولوسي',fromCh:1,fromVs:24,toCh:1,toVs:29,label:'كولوسي 1: 24-29'},    catholic:{book:'يوحنا الأولى',fromCh:2,fromVs:1,toCh:2,toVs:11,label:'يوحنا الأولى 2: 1-11'},   praxis:{book:'أعمال الرسل',fromCh:26,fromVs:24,toCh:26,toVs:32,label:'أعمال 26: 24-32'},   psalm:{book:'المزامير',fromCh:140,fromVs:1,toCh:140,toVs:8,label:'مزمور 140: 1-8'},       gospel:{book:'متى',fromCh:16,fromVs:21,toCh:16,toVs:28,label:'متى 16: 21-28'} },
  '10-26': { pauline:{book:'كولوسي',fromCh:2,fromVs:1,toCh:2,toVs:7,label:'كولوسي 2: 1-7'},        catholic:{book:'يوحنا الأولى',fromCh:2,fromVs:12,toCh:2,toVs:20,label:'يوحنا الأولى 2: 12-20'}, praxis:{book:'أعمال الرسل',fromCh:27,fromVs:1,toCh:27,toVs:12,label:'أعمال 27: 1-12'},    psalm:{book:'المزامير',fromCh:141,fromVs:1,toCh:141,toVs:10,label:'مزمور 141: 1-10'},     gospel:{book:'متى',fromCh:17,fromVs:1,toCh:17,toVs:13,label:'متى 17: 1-13'} },
  '10-27': { pauline:{book:'كولوسي',fromCh:2,fromVs:8,toCh:2,toVs:15,label:'كولوسي 2: 8-15'},      catholic:{book:'يوحنا الأولى',fromCh:2,fromVs:21,toCh:2,toVs:29,label:'يوحنا الأولى 2: 21-29'}, praxis:{book:'أعمال الرسل',fromCh:27,fromVs:13,toCh:27,toVs:26,label:'أعمال 27: 13-26'},   psalm:{book:'المزامير',fromCh:142,fromVs:1,toCh:142,toVs:7,label:'مزمور 142: 1-7'},       gospel:{book:'متى',fromCh:17,fromVs:14,toCh:17,toVs:27,label:'متى 17: 14-27'} },
  '10-28': { pauline:{book:'كولوسي',fromCh:2,fromVs:16,toCh:2,toVs:23,label:'كولوسي 2: 16-23'},    catholic:{book:'يوحنا الأولى',fromCh:3,fromVs:1,toCh:3,toVs:10,label:'يوحنا الأولى 3: 1-10'},   praxis:{book:'أعمال الرسل',fromCh:27,fromVs:27,toCh:27,toVs:44,label:'أعمال 27: 27-44'},   psalm:{book:'المزامير',fromCh:143,fromVs:1,toCh:143,toVs:12,label:'مزمور 143: 1-12'},     gospel:{book:'متى',fromCh:18,fromVs:1,toCh:18,toVs:20,label:'متى 18: 1-20'} },
  '10-29': { pauline:{book:'كولوسي',fromCh:3,fromVs:1,toCh:3,toVs:11,label:'كولوسي 3: 1-11'},      catholic:{book:'يوحنا الأولى',fromCh:3,fromVs:11,toCh:3,toVs:18,label:'يوحنا الأولى 3: 11-18'}, praxis:{book:'أعمال الرسل',fromCh:28,fromVs:1,toCh:28,toVs:16,label:'أعمال 28: 1-16'},   psalm:{book:'المزامير',fromCh:144,fromVs:1,toCh:144,toVs:15,label:'مزمور 144: 1-15'},     gospel:{book:'متى',fromCh:19,fromVs:1,toCh:19,toVs:15,label:'متى 19: 1-15'} },
  '10-30': { pauline:{book:'كولوسي',fromCh:3,fromVs:12,toCh:3,toVs:25,label:'كولوسي 3: 12-25'},    catholic:{book:'يوحنا الأولى',fromCh:3,fromVs:19,toCh:3,toVs:24,label:'يوحنا الأولى 3: 19-24'}, praxis:{book:'أعمال الرسل',fromCh:28,fromVs:17,toCh:28,toVs:31,label:'أعمال 28: 17-31'},  psalm:{book:'المزامير',fromCh:145,fromVs:1,toCh:145,toVs:13,label:'مزمور 145: 1-13'},     gospel:{book:'متى',fromCh:19,fromVs:16,toCh:19,toVs:26,label:'متى 19: 16-26'} },

  // ── النسيء (الشهر الصغير — سبتمبر) ──
  '13-1': {
    pauline:  { book: 'رومية',      fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 17, label: 'رومية 1: 1-17' },
    catholic: { book: 'يعقوب',      fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 27, label: 'يعقوب 1: 1-27' },
    praxis:   { book: 'أعمال الرسل', fromCh: 6,  fromVs: 1,  toCh: 6,  toVs: 15, label: 'أعمال 6: 1-15' },
    psalm:    { book: 'المزامير',   fromCh: 150, fromVs: 1, toCh: 150, toVs: 6,  label: 'مزمور 150: 1-6' },
    gospel:   { book: 'يوحنا',     fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 18, label: 'يوحنا 1: 1-18' },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// القراءة الافتراضية (يوم أحد عام)
// ─────────────────────────────────────────────────────────────────────────────
const defaultReading: DayLectionary = {
  pauline:  { book: 'رومية',      fromCh: 8,  fromVs: 1,  toCh: 8,  toVs: 11, label: 'رومية 8: 1-11' },
  catholic: { book: 'يعقوب',      fromCh: 1,  fromVs: 1,  toCh: 1,  toVs: 12, label: 'يعقوب 1: 1-12' },
  praxis:   { book: 'أعمال الرسل', fromCh: 2,  fromVs: 1,  toCh: 2,  toVs: 21, label: 'أعمال 2: 1-21' },
  psalm:    { book: 'المزامير',   fromCh: 23, fromVs: 1,  toCh: 23, toVs: 6,  label: 'مزمور 23: 1-6' },
  gospel:   { book: 'يوحنا',     fromCh: 3,  fromVs: 1,  toCh: 3,  toVs: 21, label: 'يوحنا 3: 1-21' },
};

// ─────────────────────────────────────────────────────────────────────────────
// تحويل التاريخ الميلادي إلى قبطي (مستقاة من synaxarium-content.ts)
// ─────────────────────────────────────────────────────────────────────────────
function gregorianToCopticLocal(date: Date): { day: number; month: number; year: number } {
  const jdn = Math.floor(
    (date.getTime() - new Date(1970, 0, 1).getTime()) / 86400000
  ) + 2440588;
  const COPTIC_EPOCH = 1824665;
  const rem = jdn - COPTIC_EPOCH;
  const year  = Math.floor((4 * rem + 3) / 1461);
  const dayOfYear = rem - Math.floor((1461 * year) / 4);
  const month = Math.floor(dayOfYear / 30) + 1;
  const day   = dayOfYear % 30 + 1;
  return { day, month, year };
}

// ─────────────────────────────────────────────────────────────────────────────
// البحث عن أقرب قراءة للتاريخ المحدد
// ─────────────────────────────────────────────────────────────────────────────
export function getLectionaryForDate(date: Date): { reading: DayLectionary; label: string; copticDate: string } {
  const { day, month } = gregorianToCopticLocal(date);

  // الأشهر القبطية
  const monthNames = [
    '', 'توت', 'بابه', 'هاتور', 'كيهك', 'طوبة', 'أمشير',
    'برمهات', 'برموده', 'بشنس', 'بؤونه', 'أبيب', 'مسرى', 'النسيء',
  ];
  const monthName = monthNames[month] ?? 'توت';
  const copticDate = `${day} ${monthName}`;

  // بحث مباشر في اليوم
  const key = `${month}-${day}`;
  if (dailyReadings[key]) {
    return { reading: dailyReadings[key], label: copticDate, copticDate };
  }

  // أقرب إدخال في نفس الشهر (أقرب يوم سابق)
  const keysInMonth = Object.keys(dailyReadings)
    .filter(k => k.startsWith(`${month}-`))
    .map(k => parseInt(k.split('-')[1]))
    .sort((a, b) => b - a);

  for (const d of keysInMonth) {
    if (d <= day) {
      return { reading: dailyReadings[`${month}-${d}`], label: copticDate, copticDate };
    }
  }

  // أقرب إدخال في الشهر السابق
  const prevMonth = month === 1 ? 13 : month - 1;
  const keysInPrev = Object.keys(dailyReadings)
    .filter(k => k.startsWith(`${prevMonth}-`))
    .map(k => parseInt(k.split('-')[1]))
    .sort((a, b) => b - a);

  if (keysInPrev.length > 0) {
    const d = keysInPrev[0];
    return { reading: dailyReadings[`${prevMonth}-${d}`], label: copticDate, copticDate };
  }

  return { reading: defaultReading, label: copticDate, copticDate };
}

export { feasts, dailyReadings };
