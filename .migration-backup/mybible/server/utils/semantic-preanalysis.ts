import { normalizeArabicText } from './arabic-normalize';

interface SemanticRule {
  triggers: string[];
  canonicalPhrases: string[];
  tags: string[];
}

interface PreAnalysisResult {
  originalQuery: string;
  normalizedQuery: string;
  candidatePhrases: string[];
  detectedTags: string[];
  projectedEmotionKeys: string[]; // Valid emotion keys from ai_emotions
}

// Valid emotion keys from ai_emotions table (20 core emotions)
const VALID_EMOTION_KEYS = [
  'إحباط', 'احتياج', 'تعب', 'حزن', 'خوف', 'رجاء', 'سلام', 'فرح', 'قلق', 'وحدة',
  'غضب', 'ذنب', 'خجل', 'ندم', 'غيرة', 'يأس', 'ضغط نفسي', 'حيرة', 'شكر', 'إيمان'
] as const;

// Projects semantic concepts to valid emotion keys
const EMOTION_PROJECTION_MAP: Record<string, string> = {
  // Direct mappings
  'قلق': 'قلق',
  'خوف': 'خوف',
  'حزن': 'حزن',
  'فرح': 'فرح',
  'وحدة': 'وحدة',
  'تعب': 'تعب',
  'سلام': 'سلام',
  'رجاء': 'رجاء',
  'إحباط': 'إحباط',
  'احتياج': 'احتياج',
  
  // Pressure/stress → ضغط نفسي
  'ضغط': 'ضغط نفسي',
  'توتر': 'ضغط نفسي',
  'ضغط نفسي': 'ضغط نفسي',
  'وقت': 'قلق',
  'stress': 'ضغط نفسي',
  
  // Exhaustion → تعب
  'إرهاق': 'تعب',
  'استنزاف': 'تعب',
  'ضعف': 'تعب',
  'منهك': 'تعب',
  
  // Despair → يأس
  'يأس': 'يأس',
  'فقدان أمل': 'يأس',
  'استسلام': 'يأس',
  
  // Loneliness → وحدة
  'عزلة': 'وحدة',
  'انفصال': 'وحدة',
  'غربة': 'وحدة',
  
  // Sadness variants → حزن
  'كآبة': 'حزن',
  'اكتئاب': 'حزن',
  'أسى': 'حزن',
  'حسرة': 'حزن',
  'فقدان': 'حزن',
  'موت': 'حزن',
  
  // Fear variants → خوف
  'رعب': 'خوف',
  'فزع': 'خوف',
  'توجس': 'خوف',
  'مستقبل': 'خوف',
  
  // Joy variants → فرح
  'سعادة': 'فرح',
  'بهجة': 'فرح',
  'سرور': 'فرح',
  
  // Gratitude → شكر
  'شكر': 'شكر',
  'امتنان': 'شكر',
  'حمد': 'شكر',
  
  // Hope → رجاء
  'أمل': 'رجاء',
  'تفاؤل': 'رجاء',
  
  // Peace variants → سلام
  'هدوء': 'سلام',
  'طمأنينة': 'سلام',
  'راحة': 'سلام',
  
  // Spiritual concerns → احتياج
  'روحي': 'احتياج',
  'صلاة': 'احتياج',
  'بعد': 'احتياج',
  'شك': 'احتياج',
  
  // Guilt → ذنب
  'ذنب': 'ذنب',
  'خطيئة': 'ذنب',
  'خطأ': 'ذنب',
  'توبة': 'ذنب',
  
  // Regret → ندم
  'ندم': 'ندم',
  'أسف': 'ندم',
  
  // Anger → غضب
  'غضب': 'غضب',
  'انزعاج': 'غضب',
  'ظلم': 'غضب',
  'ضيق': 'قلق',
  
  // Jealousy → غيرة
  'غيرة': 'غيرة',
  'حسد': 'غيرة',
  
  // Shame → خجل
  'خجل': 'خجل',
  'عار': 'خجل',
  
  // Confusion → حيرة
  'حيرة': 'حيرة',
  'تردد': 'حيرة',
  'تساؤل': 'حيرة',
  
  // Faith → إيمان
  'إيمان': 'إيمان',
  'ثقة': 'إيمان',
  'تشتت': 'قلق',
  
  // Health → احتياج
  'مرض': 'احتياج',
  'صحة': 'احتياج',
};

const SYNONYM_MAP: Record<string, string[]> = {
  'ضغط': ['ضغط نفسي', 'توتر', 'إرهاق', 'تعب'],
  'تعب': ['تعب', 'إرهاق', 'استنزاف', 'ضعف'],
  'وحدة': ['وحدة', 'عزلة', 'انفصال', 'غربة'],
  'خوف': ['خوف', 'قلق', 'رعب', 'فزع', 'توجس'],
  'حزن': ['حزن', 'كآبة', 'اكتئاب', 'أسى', 'حسرة'],
  'غضب': ['غضب', 'انزعاج', 'ضيق', 'حنق'],
  'قلق': ['قلق', 'توتر', 'اضطراب', 'خوف'],
  'يأس': ['يأس', 'إحباط', 'فقدان أمل'],
  'فرح': ['فرح', 'سعادة', 'بهجة', 'سرور'],
  'شكر': ['شكر', 'امتنان', 'حمد'],
  'أمل': ['أمل', 'رجاء', 'تفاؤل'],
  'سلام': ['سلام', 'هدوء', 'طمأنينة', 'راحة'],
};

const COLLOQUIAL_TO_STANDARD: Record<string, string> = {
  'مش قادر': 'لا أستطيع',
  'مش لاقي': 'لا أجد',
  'مش عارف': 'لا أعرف',
  'بيجري': 'يمر بسرعة',
  'بيضغط': 'يضغط',
  'بيتعب': 'يتعب',
  'بيقلق': 'يقلق',
  'زهقت': 'مللت',
  'زهقان': 'ملل',
  'مخنوق': 'ضيق نفسي',
  'متضايق': 'منزعج',
  'مكتئب': 'اكتئاب',
  'محبط': 'إحباط',
  'خايف': 'خائف',
  'قلقان': 'قلق',
  'زعلان': 'حزين',
  'فرحان': 'فرح',
  'مبسوط': 'سعيد',
  'تعبان': 'تعب',
  'عيان': 'مريض',
  'وحداني': 'وحيد',
  'لوحدي': 'وحيد',
  'ضايع': 'ضائع',
  'حيران': 'حائر',
  'مشتت': 'تشتت',
  'مرهق': 'إرهاق',
  'منهك': 'إرهاق',
  'ميت': 'منهك جداً',
  'هلكان': 'منهك',
};

const SEMANTIC_RULES: SemanticRule[] = [
  {
    triggers: ['الوقت بيجري', 'مش لاحق', 'مفيش وقت', 'الوقت ضيق', 'مضغوط في الوقت'],
    canonicalPhrases: ['ضغط الوقت', 'ضغط نفسي', 'لا أجد وقتاً'],
    tags: ['ضغط', 'وقت', 'توتر'],
  },
  {
    triggers: ['مخنوق', 'ضيق نفسي', 'مكتوم', 'حاسس بضيق', 'ضايق'],
    canonicalPhrases: ['ضيق نفسي', 'قلق', 'اختناق نفسي', 'توتر'],
    tags: ['قلق', 'ضغط نفسي'],
  },
  {
    triggers: ['مش عارف أنام', 'مش قادر أنام', 'أرق', 'سهران', 'بفكر كتير بالليل'],
    canonicalPhrases: ['أرق', 'قلق', 'تفكير زائد'],
    tags: ['قلق', 'توتر'],
  },
  {
    triggers: ['مضغوط في الشغل', 'الشغل تعبني', 'ضغط الشغل', 'مش مرتاح في شغلي'],
    canonicalPhrases: ['ضغط العمل', 'توتر', 'إرهاق'],
    tags: ['ضغط', 'تعب', 'توتر'],
  },
  {
    triggers: ['مش قادر أكمل', 'خلاص مش قادر', 'استسلمت', 'مش قادر استمر'],
    canonicalPhrases: ['إرهاق شديد', 'يأس', 'استسلام', 'تعب'],
    tags: ['يأس', 'إرهاق', 'تعب'],
  },
  {
    triggers: ['مش قادر أصلي', 'مش لاقي وقت للصلاة', 'بعيد عن ربنا', 'مش قادر أقرب من ربنا'],
    canonicalPhrases: ['صعوبة في الصلاة', 'بعد عن الله', 'ضعف روحي'],
    tags: ['روحي', 'صلاة', 'بعد'],
  },
  {
    triggers: ['حد فاهمني', 'محدش سامعني', 'لوحدي', 'مفيش حد جنبي', 'معنديش حد', 'محتاج حد يسمعني', 'عايز حد يسمعني', 'محدش فاهمني', 'مفيش حد فاهمني'],
    canonicalPhrases: ['وحدة', 'عزلة', 'الشعور بالوحدة'],
    tags: ['وحدة', 'عزلة'],
  },
  {
    triggers: ['تعبت من كل حاجة', 'مش قادر أكمل', 'خلاص', 'استسلمت'],
    canonicalPhrases: ['إرهاق شديد', 'يأس', 'استسلام'],
    tags: ['إرهاق', 'يأس'],
  },
  {
    triggers: ['خايف من بكرة', 'قلقان على المستقبل', 'مش عارف هيحصل إيه'],
    canonicalPhrases: ['خوف من المستقبل', 'قلق', 'عدم يقين'],
    tags: ['خوف', 'قلق', 'مستقبل'],
  },
  {
    triggers: ['حد ظلمني', 'اتظلمت', 'الناس ظالمة'],
    canonicalPhrases: ['ظلم', 'مظلومية', 'عدم إنصاف'],
    tags: ['ظلم', 'غضب'],
  },
  {
    triggers: ['مش شايف أمل', 'مفيش فايدة', 'إيه الفايدة'],
    canonicalPhrases: ['فقدان أمل', 'يأس', 'إحباط'],
    tags: ['يأس', 'إحباط'],
  },
  {
    triggers: ['ربنا نسيني', 'الله فين', 'ليه ربنا سايبني'],
    canonicalPhrases: ['شعور بالتخلي', 'بعد عن الله', 'أزمة إيمان'],
    tags: ['روحي', 'شك', 'بعد'],
  },
  {
    triggers: ['عملت ذنب', 'غلطت', 'ندمان', 'مذنب'],
    canonicalPhrases: ['ذنب', 'ندم', 'شعور بالذنب'],
    tags: ['ذنب', 'ندم', 'توبة'],
  },
  {
    triggers: ['شكراً يا رب', 'الحمد لله', 'ربنا كريم'],
    canonicalPhrases: ['شكر', 'امتنان', 'حمد'],
    tags: ['شكر', 'فرح'],
  },
  {
    triggers: ['فرحان', 'مبسوط', 'سعيد', 'يوم حلو'],
    canonicalPhrases: ['فرح', 'سعادة', 'بهجة'],
    tags: ['فرح', 'سعادة'],
  },
  {
    triggers: ['محتاج سلام', 'عايز راحة', 'نفسي أرتاح'],
    canonicalPhrases: ['طلب سلام', 'راحة نفسية', 'هدوء'],
    tags: ['سلام', 'راحة'],
  },
  {
    triggers: ['مريض', 'عيان', 'تعبان جسدياً', 'صحتي'],
    canonicalPhrases: ['مرض', 'ضعف جسدي', 'صحة'],
    tags: ['مرض', 'صحة'],
  },
  {
    triggers: ['فقدت حد', 'مات', 'رحل', 'سابني'],
    canonicalPhrases: ['فقدان', 'حزن على فراق', 'موت'],
    tags: ['فقدان', 'حزن', 'موت'],
  },
  {
    triggers: ['مش فاهم ليه', 'ليه كده', 'إيه الحكمة'],
    canonicalPhrases: ['تساؤل', 'حيرة', 'بحث عن معنى'],
    tags: ['حيرة', 'تساؤل'],
  },
  // === NEW SEMANTIC RULES FOR WEAK CATEGORIES ===
  
  // الذنب واللوم
  {
    triggers: ['بلوم نفسي', 'لوم نفسي', 'دايماً بلوم'],
    canonicalPhrases: ['ذنب', 'لوم الذات'],
    tags: ['ذنب'],
  },
  {
    triggers: ['قصرت', 'أنا قصرت', 'حاسس إني قصرت'],
    canonicalPhrases: ['ذنب', 'تقصير'],
    tags: ['ذنب'],
  },
  {
    triggers: ['مش راضي عن نفسي', 'مش راضي عني'],
    canonicalPhrases: ['ذنب', 'عدم رضا عن الذات'],
    tags: ['ذنب'],
  },
  {
    triggers: ['مش قادر أسامح نفسي', 'مسامحش نفسي'],
    canonicalPhrases: ['ذنب', 'عدم مسامحة الذات'],
    tags: ['ذنب'],
  },
  {
    triggers: ['خيبت أمل', 'خيبت نفسي'],
    canonicalPhrases: ['ذنب', 'خيبة أمل'],
    tags: ['ذنب', 'إحباط'],
  },
  {
    triggers: ['شايف نفسي مقصر', 'أنا مقصر'],
    canonicalPhrases: ['ذنب', 'تقصير'],
    tags: ['ذنب'],
  },
  {
    triggers: ['نفسي أرجع أصلح', 'أصلح اللي فات'],
    canonicalPhrases: ['ندم', 'رغبة في الإصلاح'],
    tags: ['ندم'],
  },
  
  // طلب الطمأنينة والاحتياج
  {
    triggers: ['محتاج أهدى', 'نفسي أهدى', 'عايز أهدى'],
    canonicalPhrases: ['احتياج للسلام', 'طلب هدوء'],
    tags: ['احتياج'],
  },
  {
    triggers: ['نفسي حد يقولي', 'محتاج حد يقولي'],
    canonicalPhrases: ['احتياج للتعزية', 'طلب كلمة'],
    tags: ['احتياج'],
  },
  {
    triggers: ['نفسي أحس بالأمان', 'محتاج أحس بأمان'],
    canonicalPhrases: ['احتياج للأمان'],
    tags: ['احتياج'],
  },
  {
    triggers: ['محتاج أسمع كلمة', 'كلمة تريحني'],
    canonicalPhrases: ['احتياج للتعزية'],
    tags: ['احتياج'],
  },
  {
    triggers: ['نفسي ألاقي حد', 'عايز ألاقي حد'],
    canonicalPhrases: ['احتياج للدعم', 'وحدة'],
    tags: ['احتياج', 'وحدة'],
  },
  {
    triggers: ['نفسي حد يطمني', 'محتاج حد يطمني'],
    canonicalPhrases: ['احتياج للطمأنينة'],
    tags: ['احتياج'],
  },
  
  // التشتت والحيرة
  {
    triggers: ['حاسس إني تايه', 'أنا تايه', 'تايه في حياتي'],
    canonicalPhrases: ['تشتت', 'حيرة'],
    tags: ['حيرة', 'تشتت'],
  },
  {
    triggers: ['دماغي ملخبطة', 'ملخبط', 'أفكاري ملخبطة'],
    canonicalPhrases: ['حيرة', 'تشتت'],
    tags: ['حيرة'],
  },
  {
    triggers: ['كل حاجة داخلة في بعض', 'داخل في بعض'],
    canonicalPhrases: ['تشتت', 'فوضى'],
    tags: ['تشتت'],
  },
  {
    triggers: ['مش مسيطر على حياتي', 'فقدت السيطرة'],
    canonicalPhrases: ['فقدان السيطرة', 'قلق'],
    tags: ['قلق'],
  },
  {
    triggers: ['قراراتي ملخبطة', 'مش عارف أقرر'],
    canonicalPhrases: ['حيرة', 'تردد'],
    tags: ['حيرة'],
  },
  {
    triggers: ['حاسس إني ضايع', 'أنا ضايع', 'ضايع في الدنيا'],
    canonicalPhrases: ['ضياع', 'تيه'],
    tags: ['ضياع', 'حيرة'],
  },
  
  // الإحباط
  {
    triggers: ['فقدت الشغف', 'مفيش شغف'],
    canonicalPhrases: ['إحباط', 'فتور'],
    tags: ['إحباط'],
  },
  {
    triggers: ['مش شايف نتيجة', 'مفيش نتيجة'],
    canonicalPhrases: ['إحباط'],
    tags: ['إحباط'],
  },
  {
    triggers: ['واقف مكاني', 'مش متحرك'],
    canonicalPhrases: ['إحباط', 'جمود'],
    tags: ['إحباط'],
  },
  {
    triggers: ['مجهودي مش مقدر', 'محدش مقدرني'],
    canonicalPhrases: ['إحباط', 'عدم تقدير'],
    tags: ['إحباط'],
  },
  {
    triggers: ['فقدت الحماس', 'مفيش حماس'],
    canonicalPhrases: ['إحباط', 'فتور'],
    tags: ['إحباط'],
  },
  
  // الوحدة والاحتياج
  {
    triggers: ['نفسي حد يفهمني', 'محتاج حد يفهم'],
    canonicalPhrases: ['وحدة', 'احتياج للتفهم'],
    tags: ['وحدة', 'احتياج'],
  },
  {
    triggers: ['غريب وسط الناس', 'حاسس بالغربة'],
    canonicalPhrases: ['وحدة', 'غربة'],
    tags: ['وحدة'],
  },
  {
    triggers: ['محتاج حد أتكلم معاه', 'عايز أتكلم'],
    canonicalPhrases: ['وحدة', 'احتياج للحوار'],
    tags: ['وحدة', 'احتياج'],
  },
  
  // الحزن
  {
    triggers: ['حاجات وجعتني', 'وجعني', 'جرحني'],
    canonicalPhrases: ['حزن', 'ألم'],
    tags: ['حزن'],
  },
  {
    triggers: ['إحساس تقيل على قلبي', 'قلبي تقيل'],
    canonicalPhrases: ['حزن', 'ثقل'],
    tags: ['حزن'],
  },
  {
    triggers: ['أيام مكسور', 'حاسس إني مكسور'],
    canonicalPhrases: ['حزن', 'انكسار'],
    tags: ['حزن'],
  },
  {
    triggers: ['حاجة ناقصة جوايا', 'في فراغ'],
    canonicalPhrases: ['حزن', 'فراغ'],
    tags: ['حزن'],
  },
  
  // القلق
  {
    triggers: ['غلط هتحصل', 'في حاجة غلط'],
    canonicalPhrases: ['قلق', 'توجس'],
    tags: ['قلق'],
  },
  {
    triggers: ['دماغي مش بتهدى', 'مش بهدى'],
    canonicalPhrases: ['قلق', 'توتر'],
    tags: ['قلق'],
  },
  {
    triggers: ['مش مطمن', 'مش مرتاح'],
    canonicalPhrases: ['قلق', 'عدم طمأنينة'],
    tags: ['قلق'],
  },
  {
    triggers: ['بخاف أبدأ', 'خايف أبدأ'],
    canonicalPhrases: ['خوف', 'تردد'],
    tags: ['خوف'],
  },
  
  // الإيجابية
  {
    triggers: ['حاسس براحة', 'مرتاح', 'راحة بال'],
    canonicalPhrases: ['سلام', 'راحة'],
    tags: ['سلام'],
  },
  {
    triggers: ['مطمن', 'مطمّن', 'حاسس بطمأنينة'],
    canonicalPhrases: ['طمأنينة', 'سلام'],
    tags: ['طمأنينة', 'سلام'],
  },
  {
    triggers: ['عندي أمل', 'في أمل', 'لسه في أمل'],
    canonicalPhrases: ['رجاء', 'أمل'],
    tags: ['رجاء'],
  },
  {
    triggers: ['الأمور بتتحسن', 'الدنيا بتتحسن'],
    canonicalPhrases: ['رجاء', 'تحسن'],
    tags: ['رجاء'],
  },
  {
    triggers: ['حاسس بقوة', 'قوي', 'عندي قوة'],
    canonicalPhrases: ['ثقة', 'قوة'],
    tags: ['ثقة'],
  },
  {
    triggers: ['في خير جاي', 'خير جاي'],
    canonicalPhrases: ['رجاء', 'أمل'],
    tags: ['رجاء'],
  },
  {
    triggers: ['نفسيتي أحسن', 'أحسن من قبل'],
    canonicalPhrases: ['تحسن', 'رجاء'],
    tags: ['رجاء'],
  },
  {
    triggers: ['راضي', 'راضي بحالي'],
    canonicalPhrases: ['سلام', 'رضا'],
    tags: ['سلام'],
  },
  
  // ضغط الحياة
  {
    triggers: ['حياتي ماشية بسرعة', 'الدنيا بتجري'],
    canonicalPhrases: ['قلق', 'ضغط'],
    tags: ['قلق'],
  },
  {
    triggers: ['الإجازة مش بترجعلي', 'حتى الإجازة'],
    canonicalPhrases: ['تعب', 'إرهاق'],
    tags: ['تعب'],
  },
  {
    triggers: ['حاسس إني فاشل', 'أنا فاشل', 'فشلت', 'مش بعرف أعمل حاجة صح', 'مش نافع'],
    canonicalPhrases: ['شعور بالفشل', 'إحباط', 'عدم ثقة بالنفس'],
    tags: ['إحباط', 'يأس'],
  },
  {
    triggers: ['مش قادر أركز', 'ذهني مشتت', 'بنسى كتير', 'مش عارف أفكر'],
    canonicalPhrases: ['تشتت', 'قلق', 'ضغط ذهني'],
    tags: ['قلق', 'تشتت'],
  },
  {
    triggers: ['الناس بتجرحني', 'محدش بيحترمني', 'بيتعاملوا معايا وحش'],
    canonicalPhrases: ['جرح', 'إهانة', 'عدم احترام'],
    tags: ['حزن', 'غضب'],
  },
  {
    triggers: ['عايز أبطل', 'نفسي أسيب كل حاجة', 'عايز أهرب'],
    canonicalPhrases: ['رغبة في الهروب', 'إرهاق', 'يأس'],
    tags: ['يأس', 'إرهاق'],
  },
  {
    triggers: ['اليوم بيخلص', 'الوقت مش كافي', 'مفيش وقت', 'يومي مسروق', 'الوقت بيجري'],
    canonicalPhrases: ['ضغط الوقت', 'ضغط نفسي', 'لا أجد وقتاً', 'توتر', 'إرهاق'],
    tags: ['ضغط', 'وقت', 'توتر'],
  },
  {
    triggers: ['المسؤوليات', 'الحمل تقيل', 'مسؤولياتي كتير', 'واخدة طاقتي', 'تعبت من المسؤوليات'],
    canonicalPhrases: ['ثقل المسؤولية', 'ضغط نفسي', 'إرهاق', 'تعب'],
    tags: ['تعب', 'ضغط', 'إرهاق'],
  },
  {
    triggers: ['مش لاحق', 'مش قادر ألحق', 'كل حاجة بتفوتني'],
    canonicalPhrases: ['ضغط الوقت', 'قلق', 'توتر'],
    tags: ['قلق', 'ضغط'],
  },
];

const SIMPLE_EMOTION_KEYWORDS: Record<string, string[]> = {
  'حزن': ['حزين', 'زعلان', 'مكتئب', 'حسران', 'بكي', 'دموع', 'أسى'],
  'خوف': ['خايف', 'خائف', 'مرعوب', 'قلقان', 'متوتر'],
  'غضب': ['زعلان', 'متضايق', 'مخنوق', 'غاضب', 'حانق'],
  'وحدة': ['وحيد', 'لوحدي', 'وحداني', 'منعزل'],
  'قلق': ['قلقان', 'قلق', 'متوتر', 'مضطرب'],
  'يأس': ['محبط', 'يائس', 'مستسلم', 'فاقد أمل'],
  'فرح': ['فرحان', 'مبسوط', 'سعيد', 'مسرور'],
  'شكر': ['شاكر', 'ممتن', 'حامد'],
  'أمل': ['متفائل', 'عندي أمل', 'راجي'],
  'ضغط نفسي': ['مضغوط', 'ضغط', 'stress', 'مرهق', 'منهك'],
  'تعب': ['تعبان', 'مرهق', 'منهك', 'خلصت طاقتي'],
};

// KEYWORD_TO_TAGS: Maps SPECIFIC keywords (multi-word or distinctive single words) to emotion tags
// IMPORTANT: Avoid generic single words like "حد", "وقت", "اليوم" - they cause false positives
// Only use distinctive words/phrases that strongly indicate emotional states
const KEYWORD_TO_TAGS: Record<string, { tags: string[], phrases: string[] }> = {
  // Time pressure - SPECIFIC multi-word patterns
  'بيخلص': { tags: ['ضغط'], phrases: ['ضغط الوقت', 'قلق'] },
  'الوقت بيخلص': { tags: ['ضغط', 'قلق'], phrases: ['ضغط الوقت'] },
  'مفيش وقت': { tags: ['ضغط', 'قلق'], phrases: ['ضغط الوقت'] },
  'الوقت بيجري': { tags: ['ضغط'], phrases: ['ضغط الوقت', 'توتر'] },
  'يومي مسروق': { tags: ['ضغط', 'إحباط'], phrases: ['ضغط الوقت', 'إحباط'] },
  'مسروق مني': { tags: ['إحباط'], phrases: ['إحباط', 'حرمان'] },
  
  // Responsibility/burden - SPECIFIC phrases
  'مسؤوليات': { tags: ['تعب', 'ضغط'], phrases: ['ثقل المسؤولية', 'إرهاق'] },
  'المسؤوليات': { tags: ['تعب', 'ضغط'], phrases: ['ثقل المسؤولية', 'إرهاق'] },
  'واخدة طاقتي': { tags: ['تعب', 'إرهاق'], phrases: ['نفاد الطاقة', 'إرهاق'] },
  'خلصت طاقتي': { tags: ['تعب'], phrases: ['إرهاق', 'تعب'] },
  'حمل تقيل': { tags: ['تعب'], phrases: ['ثقل', 'تعب'] },
  
  // Inability/helplessness - SPECIFIC multi-word patterns
  'مش قادر': { tags: ['تعب', 'إحباط'], phrases: ['عجز', 'ضعف'] },
  'مش عارف': { tags: ['قلق', 'حيرة'], phrases: ['حيرة', 'قلق'] },
  'مش لاحق': { tags: ['ضغط', 'قلق'], phrases: ['ضغط الوقت'] },
  
  // Sleep/rest - SPECIFIC patterns only with context
  'مش عارف أنام': { tags: ['قلق', 'توتر'], phrases: ['أرق', 'قلق'] },
  'مش قادر أنام': { tags: ['قلق', 'توتر'], phrases: ['أرق', 'قلق'] },
  'صعب أنام': { tags: ['قلق'], phrases: ['أرق', 'قلق'] },
  'أرق': { tags: ['قلق'], phrases: ['أرق', 'قلق'] },
  
  // Emotional state - DISTINCTIVE keywords only
  'فاشل': { tags: ['إحباط', 'يأس'], phrases: ['شعور بالفشل', 'إحباط'] },
  'فشلت': { tags: ['إحباط'], phrases: ['فشل', 'إحباط'] },
  'محبط': { tags: ['إحباط'], phrases: ['إحباط'] },
  'يائس': { tags: ['يأس', 'إحباط'], phrases: ['يأس'] },
  'وحيد': { tags: ['وحدة'], phrases: ['وحدة'] },
  'لوحدي': { tags: ['وحدة'], phrases: ['وحدة', 'عزلة'] },
  'خايف': { tags: ['خوف'], phrases: ['خوف'] },
  'قلقان': { tags: ['قلق'], phrases: ['قلق'] },
  'تعبان': { tags: ['تعب'], phrases: ['تعب', 'إرهاق'] },
  'مرهق': { tags: ['تعب', 'إرهاق'], phrases: ['إرهاق'] },
  'منهك': { tags: ['تعب'], phrases: ['إرهاق'] },
  'حزين': { tags: ['حزن'], phrases: ['حزن'] },
  'زعلان': { tags: ['حزن', 'غضب'], phrases: ['حزن'] },
  
  // Relational/hurt - SPECIFIC patterns
  'بتجرحني': { tags: ['حزن', 'غضب'], phrases: ['جرح', 'ألم'] },
  'جرحني': { tags: ['حزن'], phrases: ['جرح'] },
  'محدش بيحترمني': { tags: ['حزن', 'غضب'], phrases: ['عدم احترام'] },
  'محدش بيسمعني': { tags: ['وحدة', 'احتياج'], phrases: ['وحدة', 'إهمال'] },
  'محدش فاهمني': { tags: ['وحدة'], phrases: ['وحدة', 'سوء فهم'] },
  
  // Escape/giving up - SPECIFIC verbs
  'عايز أبطل': { tags: ['يأس', 'إرهاق'], phrases: ['رغبة في التوقف'] },
  'نفسي أسيب': { tags: ['يأس'], phrases: ['رغبة في الهروب'] },
  'عايز أهرب': { tags: ['يأس', 'خوف'], phrases: ['هروب'] },
  
  // Specific contextual phrases
  'محتاج أرتاح': { tags: ['تعب', 'احتياج'], phrases: ['احتياج للراحة'] },
  'محتاج حد يسمعني': { tags: ['وحدة', 'احتياج'], phrases: ['احتياج للتفهم', 'وحدة'] },
  'محتاج حد يفهمني': { tags: ['وحدة', 'احتياج'], phrases: ['احتياج للتفهم'] },
  
  // === NEW PATTERNS FOR WEAK CATEGORIES ===
  
  // الذنب واللوم (Guilt/Blame)
  'بلوم نفسي': { tags: ['ذنب'], phrases: ['ذنب', 'لوم الذات'] },
  'لوم نفسي': { tags: ['ذنب'], phrases: ['ذنب', 'لوم الذات'] },
  'قصرت': { tags: ['ذنب'], phrases: ['ذنب', 'تقصير'] },
  'ندمان': { tags: ['ندم'], phrases: ['ندم'] },
  'نادم': { tags: ['ندم'], phrases: ['ندم'] },
  'مش راضي عن نفسي': { tags: ['ذنب'], phrases: ['ذنب', 'عدم رضا'] },
  'غلطت': { tags: ['ندم', 'ذنب'], phrases: ['ندم', 'خطأ'] },
  'أسامح نفسي': { tags: ['ذنب'], phrases: ['ذنب', 'مسامحة'] },
  'بالذنب': { tags: ['ذنب'], phrases: ['ذنب'] },
  'خيبت': { tags: ['ذنب', 'إحباط'], phrases: ['خيبة أمل', 'ذنب'] },
  'مقصر': { tags: ['ذنب'], phrases: ['ذنب', 'تقصير'] },
  
  // طلب الطمأنينة والاحتياج (Need for comfort)
  'محتاج أهدى': { tags: ['احتياج'], phrases: ['احتياج للسلام'] },
  'محتاج طمأنينة': { tags: ['احتياج'], phrases: ['احتياج للطمأنينة'] },
  'محتاج سلام': { tags: ['احتياج'], phrases: ['احتياج للسلام'] },
  'محتاج دعم': { tags: ['احتياج'], phrases: ['احتياج للدعم'] },
  'محتاج حد': { tags: ['احتياج', 'وحدة'], phrases: ['احتياج', 'وحدة'] },
  'نفسي حد': { tags: ['احتياج', 'وحدة'], phrases: ['احتياج', 'وحدة'] },
  'نفسي أحس': { tags: ['احتياج'], phrases: ['احتياج'] },
  'نفسي أهدى': { tags: ['احتياج'], phrases: ['احتياج للسلام'] },
  'بالأمان': { tags: ['احتياج'], phrases: ['احتياج للأمان'] },
  'كلمة تريحني': { tags: ['احتياج'], phrases: ['احتياج للتعزية'] },
  
  // التشتت والحيرة (Confusion/Disorientation)
  'تايه': { tags: ['حيرة', 'تشتت'], phrases: ['حيرة', 'تشتت'] },
  'ملخبطة': { tags: ['حيرة'], phrases: ['حيرة', 'تشتت'] },
  'ملخبط': { tags: ['حيرة'], phrases: ['حيرة', 'تشتت'] },
  'ضايع': { tags: ['ضياع', 'حيرة'], phrases: ['ضياع', 'تيه'] },
  'مشتت': { tags: ['تشتت', 'حيرة'], phrases: ['تشتت'] },
  'داخلة في بعض': { tags: ['تشتت'], phrases: ['تشتت', 'فوضى'] },
  'متلخبطة': { tags: ['حيرة'], phrases: ['حيرة'] },
  'مش مسيطر': { tags: ['قلق', 'ضعف'], phrases: ['فقدان السيطرة'] },
  
  // الإحباط وفقدان الشغف (Frustration)
  'فقدت الشغف': { tags: ['إحباط'], phrases: ['إحباط', 'فتور'] },
  'الشغف': { tags: ['إحباط'], phrases: ['فقدان الشغف'] },
  'مش شايف نتيجة': { tags: ['إحباط'], phrases: ['إحباط'] },
  'واقف مكاني': { tags: ['إحباط'], phrases: ['إحباط', 'جمود'] },
  'مش مقدّر': { tags: ['إحباط', 'حزن'], phrases: ['إحباط', 'عدم تقدير'] },
  'فقدت الحماس': { tags: ['إحباط'], phrases: ['إحباط', 'فتور'] },
  'الحماس': { tags: ['إحباط'], phrases: ['فقدان الحماس'] },
  'مش شايف أمل': { tags: ['إحباط', 'يأس'], phrases: ['يأس', 'إحباط'] },
  'ليه بحاول': { tags: ['إحباط', 'يأس'], phrases: ['إحباط'] },
  
  // المشاعر الإيجابية (Positive emotions) - HIGH PRIORITY
  'مبسوط': { tags: ['فرح'], phrases: ['فرح', 'سعادة'] },
  'مرتاح': { tags: ['سلام'], phrases: ['سلام', 'راحة'] },
  'راحة': { tags: ['سلام'], phrases: ['سلام'] },
  'مطمّن': { tags: ['طمأنينة'], phrases: ['طمأنينة', 'سلام'] },
  'مطمن': { tags: ['طمأنينة'], phrases: ['طمأنينة', 'سلام'] },
  'أمل': { tags: ['رجاء'], phrases: ['رجاء', 'أمل'] },
  'متفائل': { tags: ['رجاء'], phrases: ['رجاء', 'تفاؤل'] },
  'راضي': { tags: ['سلام'], phrases: ['رضا', 'سلام'] },
  'بقوة': { tags: ['ثقة'], phrases: ['ثقة', 'قوة'] },
  'خير جاي': { tags: ['رجاء'], phrases: ['رجاء', 'أمل'] },
  'بتتحسن': { tags: ['رجاء'], phrases: ['رجاء', 'تحسن'] },
  'أحسن': { tags: ['رجاء'], phrases: ['تحسن'] },
  
  // حالات إضافية
  'بسرعة وأنا': { tags: ['قلق', 'تشتت'], phrases: ['قلق', 'تشتت'] },
  'الإجازة مش': { tags: ['تعب'], phrases: ['تعب', 'إرهاق'] },
  'غلط هتحصل': { tags: ['قلق'], phrases: ['قلق'] },
  'مش بتهدى': { tags: ['قلق'], phrases: ['قلق', 'توتر'] },
  'أوقف تفكير': { tags: ['قلق'], phrases: ['قلق', 'تفكير زائد'] },
  'تقيل على قلبي': { tags: ['حزن'], phrases: ['حزن', 'ثقل'] },
  'مكسور': { tags: ['حزن'], phrases: ['حزن', 'انكسار'] },
  'ناقصة جوايا': { tags: ['حزن', 'فراغ'], phrases: ['فراغ', 'حزن'] },
  'غريب وسط': { tags: ['وحدة'], phrases: ['وحدة', 'غربة'] },
  'وجعتني': { tags: ['حزن', 'ألم'], phrases: ['ألم', 'حزن'] },
  'أبكي': { tags: ['حزن'], phrases: ['حزن', 'بكاء'] },
};

function normalizeColloquial(text: string): string {
  let normalized = text;
  for (const [colloquial, standard] of Object.entries(COLLOQUIAL_TO_STANDARD)) {
    const regex = new RegExp(colloquial, 'gi');
    normalized = normalized.replace(regex, standard);
  }
  return normalized;
}

// Extract keywords from text and return matching tags and phrases
function extractKeywords(inputText: string): { phrases: string[]; tags: string[] } {
  const matchedPhrases: string[] = [];
  const matchedTags: string[] = [];
  
  const normalizedInput = normalizeArabicText(inputText);
  
  for (const [keyword, data] of Object.entries(KEYWORD_TO_TAGS)) {
    const normalizedKeyword = normalizeArabicText(keyword);
    // Check if keyword exists anywhere in the text
    if (normalizedInput.includes(normalizedKeyword) || inputText.includes(keyword)) {
      matchedPhrases.push(...data.phrases);
      matchedTags.push(...data.tags);
      console.log(`[Keyword] Found "${keyword}" → tags: [${data.tags.join(', ')}]`);
    }
  }
  
  return {
    phrases: Array.from(new Set(matchedPhrases)),
    tags: Array.from(new Set(matchedTags)),
  };
}

function matchSemanticRules(inputText: string): { phrases: string[]; tags: string[] } {
  const matchedPhrases: string[] = [];
  const matchedTags: string[] = [];
  
  // Normalize the input text for consistent comparison
  const normalizedInput = normalizeArabicText(inputText);
  
  for (const rule of SEMANTIC_RULES) {
    for (const trigger of rule.triggers) {
      const normalizedTrigger = normalizeArabicText(trigger);
      // Check both raw input and normalized input for match
      if (normalizedInput.includes(normalizedTrigger) || inputText.includes(trigger)) {
        matchedPhrases.push(...rule.canonicalPhrases);
        matchedTags.push(...rule.tags);
        break;
      }
    }
  }
  
  return {
    phrases: Array.from(new Set(matchedPhrases)),
    tags: Array.from(new Set(matchedTags)),
  };
}

function extractSimpleEmotions(normalizedText: string): string[] {
  const detectedEmotions: string[] = [];
  
  for (const [emotion, keywords] of Object.entries(SIMPLE_EMOTION_KEYWORDS)) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeArabicText(keyword);
      if (normalizedText.includes(normalizedKeyword)) {
        detectedEmotions.push(emotion);
        break;
      }
    }
  }
  
  return Array.from(new Set(detectedEmotions));
}

function expandWithSynonyms(phrases: string[]): string[] {
  const expanded: string[] = [...phrases];
  
  for (const phrase of phrases) {
    const words = phrase.split(/\s+/);
    for (const word of words) {
      const normalizedWord = normalizeArabicText(word);
      for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
        if (normalizedWord.includes(normalizeArabicText(key))) {
          expanded.push(...synonyms);
        }
      }
    }
  }
  
  return Array.from(new Set(expanded));
}

function projectToValidEmotions(tags: string[], phrases: string[]): string[] {
  const projectedEmotions: Set<string> = new Set();
  
  // Project tags to valid emotion keys
  for (const tag of tags) {
    const normalizedTag = normalizeArabicText(tag);
    for (const [concept, emotionKey] of Object.entries(EMOTION_PROJECTION_MAP)) {
      if (normalizedTag.includes(normalizeArabicText(concept)) || 
          normalizeArabicText(concept).includes(normalizedTag)) {
        projectedEmotions.add(emotionKey);
      }
    }
  }
  
  // Also check phrases for projection
  for (const phrase of phrases) {
    const normalizedPhrase = normalizeArabicText(phrase);
    for (const [concept, emotionKey] of Object.entries(EMOTION_PROJECTION_MAP)) {
      if (normalizedPhrase.includes(normalizeArabicText(concept))) {
        projectedEmotions.add(emotionKey);
      }
    }
  }
  
  // Validate that all projected emotions are in VALID_EMOTION_KEYS
  const validProjected = Array.from(projectedEmotions).filter(e => 
    VALID_EMOTION_KEYS.includes(e as typeof VALID_EMOTION_KEYS[number])
  );
  
  return validProjected;
}

export function semanticPreAnalysis(query: string): PreAnalysisResult {
  console.log(`[Semantic] Starting pre-analysis for: "${query}"`);
  
  // Step 1: Apply colloquial normalization FIRST (on raw text to preserve triggers)
  const colloquialNormalized = normalizeColloquial(query);
  
  // Step 2: Then apply Arabic text normalization for matching
  const normalizedQuery = normalizeArabicText(query);
  const normalizedColloquial = normalizeArabicText(colloquialNormalized);
  
  console.log(`[Semantic] Colloquial normalized: "${colloquialNormalized}"`);
  console.log(`[Semantic] Normalized: "${normalizedQuery}"`);
  
  // PHASE 1: Match full triggers (exact/partial phrase matching) - NO keyword extraction here
  const { phrases: rawRulePhrases, tags: rawRuleTags } = matchSemanticRules(query);
  const { phrases: rulePhrases, tags: ruleTags } = matchSemanticRules(colloquialNormalized);
  const { phrases: normalizedRulePhrases, tags: normalizedRuleTags } = matchSemanticRules(normalizedColloquial);
  
  const simpleEmotions = extractSimpleEmotions(normalizedColloquial);
  
  let candidatePhrases = [
    ...rawRulePhrases,
    ...rulePhrases,
    ...normalizedRulePhrases,
    ...simpleEmotions,
  ];
  
  candidatePhrases = expandWithSynonyms(candidatePhrases);
  
  // Add all variations for maximum matching coverage
  candidatePhrases.push(colloquialNormalized);
  candidatePhrases.push(normalizedColloquial);
  candidatePhrases.push(normalizedQuery);
  candidatePhrases.push(query);
  
  candidatePhrases = Array.from(new Set(candidatePhrases)).filter(p => p.trim().length > 0);
  
  // Combine all tags from semantic rules only (NO keyword tags here)
  const allTags = Array.from(new Set([
    ...rawRuleTags, 
    ...ruleTags, 
    ...normalizedRuleTags, 
    ...simpleEmotions
  ]));
  
  // Project semantic concepts to valid emotion keys
  const projectedEmotionKeys = projectToValidEmotions(allTags, candidatePhrases);
  
  console.log(`[Semantic] Candidate phrases: [${candidatePhrases.slice(0, 5).join(', ')}...]`);
  console.log(`[Semantic] Detected tags: [${allTags.join(', ')}]`);
  console.log(`[Semantic] Projected emotion keys: [${projectedEmotionKeys.join(', ')}]`);
  
  return {
    originalQuery: query,
    normalizedQuery,
    candidatePhrases,
    detectedTags: allTags,
    projectedEmotionKeys,
  };
}

// NEW EXPORT: Keyword extraction as FALLBACK (last resort before "no match")
// This is called separately from semantic pre-analysis to maintain clean layer separation
export function extractKeywordsFallback(query: string): { projectedEmotions: string[] } {
  console.log(`[Keyword-Fallback] Extracting keywords from: "${query}"`);
  
  const normalizedQuery = normalizeArabicText(query);
  
  // Extract keywords from both raw and normalized text
  const { phrases: keywordPhrases, tags: keywordTags } = extractKeywords(query);
  const { phrases: keywordPhrasesNorm, tags: keywordTagsNorm } = extractKeywords(normalizedQuery);
  
  const allTags = Array.from(new Set([...keywordTags, ...keywordTagsNorm]));
  const allPhrases = Array.from(new Set([...keywordPhrases, ...keywordPhrasesNorm]));
  
  // Project to valid emotions
  const projectedEmotions = projectToValidEmotions(allTags, allPhrases);
  
  console.log(`[Keyword-Fallback] Tags: [${allTags.join(', ')}]`);
  console.log(`[Keyword-Fallback] Projected emotions: [${projectedEmotions.join(', ')}]`);
  
  return { projectedEmotions };
}

export function getCandidateQueries(query: string): string[] {
  const result = semanticPreAnalysis(query);
  return result.candidatePhrases;
}
