package com.oscardevs.oscardrive.logic

/**
 * «Oscar Smart Voice Recognition» (المالك ٢٠٢٦-١١-٠٧): برنامج التعرّف ساعات بيكتب الكلمة غلط
 * («سجل مطب» ⇐ «سجلت مطلب»). القاموس ده = الكلمات المصرى اللى بتتلخبط ⇐ الكلمة اللى فى الأوامر.
 * كلمة بكلمة (بعد التنضيف: من غير تشكيل، ة=ه، ى=ي، أ/إ/آ=ا) — ومابيلمسش اسم مكان ولا رقم (الجزء الحر من الأمر
 * بيفضل زى ما اتقال). اللى السواق بيعلّمه لأوسكار («أنا قلت مطب مش مطلب») بيتحفظ لوحده ويتقدّم على القاموس ده.
 */
object EgyptWords {
    val FIX: Map<String, String> = mapOf(
        // مطب · حفرة · رادار
        "مطلب" to "مطب", "مطبب" to "مطب", "متب" to "مطب", "مطبات" to "مطب", "المطب" to "مطب", "مطاب" to "مطب", "مطبه" to "مطب",
        "الحفره" to "حفره", "حفر" to "حفره", "نقره" to "حفره", "حفرا" to "حفره",
        "ردار" to "رادار", "رادر" to "رادار", "الرادار" to "رادار", "رادارات" to "رادار",
        // «سجّل» بتتسمع «سجلت / سجلي / سجلنا»
        "سجلت" to "سجل", "سجلي" to "سجل", "سجلنا" to "سجل", "اسجل" to "سجل", "سجلها" to "سجل",
        // البنزين والتفويل
        "بانزينه" to "بنزينه", "بنزينا" to "بنزينه", "البنزينه" to "بنزينه", "بنزينة" to "بنزينه", "بنزن" to "بنزين",
        "مونت" to "فولت", "موّنت" to "فولت", "مونّت" to "فولت", "فوّلت" to "فولت",
        // الكاوتش والصيانة
        "كاتش" to "كاوتش", "كوتش" to "كاوتش", "كاوتشات" to "كاوتش", "الكاوتش" to "كاوتش", "الكوتش" to "كاوتش",
        "صيانا" to "صيانه", "الصيانا" to "الصيانه",
        // الملاحة والخريطة
        "الملاحا" to "الملاحه", "الملاحة" to "الملاحه", "ملاحه" to "الملاحه", "الخريطا" to "الخريطه", "خريطا" to "خريطه",
        // الحماية والعربية
        "الحمايا" to "الحمايه", "حمايا" to "حمايه", "العربيا" to "العربيه", "عربيا" to "عربيه",
        // وديني · وصلني
        "وديتني" to "وديني", "ودني" to "وديني", "وصلتني" to "وصلني", "وصلنا" to "وصلني",
        // English mishears
        "bum" to "bump", "bumper" to "bump", "raider" to "radar", "rader" to "radar", "potholes" to "pothole",
        "navigations" to "navigation", "gass" to "gas",
    )

    /** كلام مخلوط («open الملاحه» · «افتح navigation»): كلمات الأوامر الإنجليزى ⇐ العربى. */
    val MIXED: Map<String, String> = mapOf(
        "open" to "افتح", "start" to "شغل", "play" to "شغل", "mark" to "سجل", "save" to "احفظ", "stop" to "وقف",
        "navigation" to "الملاحه", "nav" to "الملاحه", "map" to "الخريطه", "maps" to "الخريطه", "home" to "البيت", "work" to "الشغل",
        "bump" to "مطب", "pothole" to "حفره", "radar" to "رادار", "danger" to "خطر", "security" to "الحمايه", "music" to "اغاني",
        "speed" to "السرعه", "trip" to "الرحله", "settings" to "الاعدادات", "parking" to "الركن", "car" to "العربيه", "gas" to "بنزينه",
    )

    /** القاموس بعد التنضيف (المفاتيح مكتوبة زى ما بتتقال، والمقارنة على النص المتنضّف). */
    val FIX_N: Map<String, String> by lazy {
        FIX.entries.associate { VoiceEngine.normalize(it.key) to VoiceEngine.normalize(it.value) }
    }

    /** نعم/لأ للسؤال «تقصد …؟». null = مش رد. */
    private val YES = setOf("ايوه", "ايوا", "اه", "تمام", "صح", "اكيد", "نعم", "ماشي", "اوكي", "ok", "okay",
        "yes", "yeah", "yep", "correct", "sure", "right", "بالظبط", "هو ده", "اه هو")
    private val NO = setOf("لا", "لاء", "لاا", "مش ده", "غلط", "no", "nope", "wrong", "مش كده", "لا مش")

    fun yesNo(normalized: String): Boolean? {
        val t = " $normalized "
        if (NO.any { t.contains(" $it ") }) return false
        if (YES.any { t.contains(" $it ") }) return true
        return null
    }

    private val CORRECT_AR = Regex("(?:انا )?(?:قلت|اقصد|قصدي|بقول|قصدت) (\\S+) (?:مش|مو|وليس|مش قصدي) (\\S+)")
    private val CORRECT_EN = Regex("i (?:said|meant|mean|say) (\\S+) not (\\S+)")

    /** «أنا قلت مطب مش مطلب» ⇐ (مطلب ⇐ مطب). null = مش تصحيح. */
    fun correction(normalized: String): Pair<String, String>? {
        val m = CORRECT_AR.find(normalized) ?: CORRECT_EN.find(normalized) ?: return null
        val right = m.groupValues[1]; val wrong = m.groupValues[2]
        return if (right != wrong && right.length >= 2 && wrong.length >= 2) wrong to right else null
    }

    /** تشابه كلمتين ٠..١ (مسافة تعديل Levenshtein). */
    fun similarity(a: String, b: String): Double {
        if (a == b) return 1.0
        if (a.isEmpty() || b.isEmpty()) return 0.0
        var prev = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val cur = IntArray(b.length + 1); cur[0] = i
            for (j in 1..b.length) cur[j] = minOf(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            prev = cur
        }
        return 1.0 - prev[b.length].toDouble() / maxOf(a.length, b.length)
    }
}
