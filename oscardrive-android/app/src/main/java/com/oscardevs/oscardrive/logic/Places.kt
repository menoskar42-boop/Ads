package com.oscardevs.oscardrive.logic

import java.util.Calendar
import java.util.TimeZone

/*
 * المرحلة ٦ من خطة Oscar Drive (المالك ٢٠٢٦-١١-١٠: «كمل المرحله السادسه») — أماكن ومشاوير:
 *  • «احفظ المكان ده باسم الجيم» · «ودّينى الجيم» (الاسم قريب مش حرفى).
 *  • الأماكن المتكررة من نهايات الرحلات اللى متسجّلة أصلاً (مفيش GPS زيادة).
 *  • «أقرب صيدلية / مستشفى / ATM / كنيسة…»: افتراضياً بحث فى تطبيق الخرايط (مجانى). اختيار الأقرب أوتوماتيك
 *    بـPlaces API **مقفول افتراضياً** وبحد شهرى.
 * Kotlin صافى بيتختبر على الكمبيوتر.
 */

/* ───────── الأسماء المحفوظة ───────── */

object PlaceNames {
    /** «الجيم» = «جيم» = «للجيم» — للمقارنة بس (الاسم المحفوظ بيفضل زى ما اتكتب). */
    fun key(s: String): String {
        val t = VoiceEngine.normalize(VoiceCommands.placeOf(VoiceEngine.normalize(s)))
        return t.split(' ').filter { it.isNotBlank() }.joinToString(" ") { w ->
            if (w.startsWith("ال") && w.length > 3) w.substring(2) else w
        }
    }

    /**
     * أقرب اسم محفوظ للى اتقال. حرفى (بعد التنضيف) ⇐ على طول. قريب (≥ ٠٫٨) ⇐ لو مفيش تانى قريب بنفس الدرجة.
     * null = مش محفوظ ⇒ الشاشة تدوّر فى الخرايط بالاسم.
     */
    fun match(saved: List<String>, spoken: String): String? {
        val k = key(spoken)
        if (k.isEmpty()) return null
        saved.firstOrNull { key(it) == k }?.let { return it }
        val scored = saved.map { it to EgyptWords.similarity(key(it).replace(" ", ""), k.replace(" ", "")) }
            .filter { it.second >= 0.8 }.sortedByDescending { it.second }
        if (scored.isEmpty()) return null
        if (scored.size > 1 && scored[0].second - scored[1].second < 0.05) return null
        return scored[0].first
    }

    /** الاسم اللى هيتحفظ: من غير «باسم/اسمه» فى أوله، وبحد ٤٠ حرف. فاضى = مفيش اسم. */
    fun tidy(name: String): String {
        var n = name.trim().trim('«', '»', '"', '.', '،', ',')
        for (p in listOf("باسم ", "اسمه ", "إسمه ", "بإسم ", "as ", "called ")) if (n.startsWith(p)) n = n.removePrefix(p).trim()
        return n.take(40).trim()
    }
}

/* ───────── الأماكن المتكررة ───────── */

data class Visit(val lat: Double, val lng: Double, val timeMs: Long)
data class FrequentPlace(val lat: Double, val lng: Double, val visits: Int, val bestWeek: Int, val lastMs: Long, val usualHour: Int)

object FrequentPlaces {
    const val RADIUS_M = 150.0
    const val MIN_PER_WEEK = 3          // «أكتر من مرتين فى الأسبوع»
    const val WINDOW_DAYS = 28
    const val NEAR_SAVED_M = 200.0
    private const val WEEK_MS = 7 * 86_400_000L

    /**
     * نهايات الرحلات ⇐ أماكن وقفت فيها ٣ مرات أو أكتر فى أسبوع واحد (آخر ٤ أسابيع)، ومش جنب مكان محفوظ ولا مكان
     * إنت قلت عليه «مش مهم». الأكتر زيارات الأول، وبحد ٥.
     */
    fun find(
        visits: List<Visit>, saved: List<Pair<Double, Double>>, dismissed: List<Pair<Double, Double>>,
        now: Long, tz: TimeZone = TimeZone.getTimeZone("Africa/Cairo"), limit: Int = 5,
    ): List<FrequentPlace> {
        val recent = visits.filter { now - it.timeMs in 0..WINDOW_DAYS * 86_400_000L }.sortedBy { it.timeMs }
        val clusters = mutableListOf<MutableList<Visit>>()
        for (v in recent) {
            val c = clusters.minByOrNull { centre(it).let { (a, b) -> Geo.distanceM(a, b, v.lat, v.lng) } }
            if (c != null && centre(c).let { (a, b) -> Geo.distanceM(a, b, v.lat, v.lng) } <= RADIUS_M) c += v else clusters += mutableListOf(v)
        }
        return clusters.mapNotNull { c ->
            val (lat, lng) = centre(c)
            val best = c.maxOf { v -> c.count { it.timeMs >= v.timeMs && it.timeMs < v.timeMs + WEEK_MS } }
            if (best < MIN_PER_WEEK) return@mapNotNull null
            if ((saved + dismissed).any { Geo.distanceM(it.first, it.second, lat, lng) <= NEAR_SAVED_M }) return@mapNotNull null
            val hours = c.map { Calendar.getInstance(tz).apply { timeInMillis = it.timeMs }.get(Calendar.HOUR_OF_DAY) }
            val usual = hours.groupingBy { it }.eachCount().maxByOrNull { it.value }!!.key
            FrequentPlace(lat, lng, c.size, best, c.maxOf { it.timeMs }, usual)
        }.sortedWith(compareByDescending<FrequentPlace> { it.visits }.thenByDescending { it.lastMs }).take(limit)
    }

    private fun centre(c: List<Visit>) = c.sumOf { it.lat } / c.size to c.sumOf { it.lng } / c.size

    /** «غالباً الصبح» — يساعدك تفتكر المكان ده إيه. */
    fun partOfDay(h: Int): String = when (h) {
        in 5..11 -> "الصبح"
        in 12..15 -> "الضهر"
        in 16..18 -> "العصر"
        else -> "بالليل"
    }
}

/* ───────── «أقرب …» ───────── */

/** نوع مكان: الكلمات اللى بتتقال · اللى بيتكتب فى بحث الخرايط · نوع Places API. */
data class NearbyKind(val id: String, val ar: String, val words: List<String>, val mapsQuery: String, val placesType: String)

data class NearbyResult(val name: String, val lat: Double, val lng: Double)

object Nearby {
    val KINDS = listOf(
        NearbyKind("pharmacy", "صيدلية", listOf("صيدليه", "اجزخانه", "صيدلانيه", "pharmacy", "drugstore"), "صيدلية", "pharmacy"),
        NearbyKind("hospital", "مستشفى", listOf("مستشفي", "مستشفيات", "اسعاف", "طوارئ مستشفي", "hospital", "emergency room"), "مستشفى", "hospital"),
        NearbyKind("atm", "ATM", listOf("atm", "ايه تي ام", "مكنه فلوس", "مكينه فلوس", "ماكينه فلوس", "ماكينه صراف", "صراف", "صراف الي", "cash machine"), "ATM", "atm"),
        NearbyKind("bank", "بنك", listOf("بنك", "bank"), "بنك", "bank"),
        NearbyKind("church", "كنيسة", listOf("كنيسه", "كنايس", "church"), "كنيسة", "church"),
        NearbyKind("mosque", "جامع", listOf("جامع", "مسجد", "mosque"), "مسجد", "mosque"),
        NearbyKind("restaurant", "مطعم", listOf("مطعم", "اكل", "اتغدي", "restaurant", "food"), "مطعم", "restaurant"),
        NearbyKind("cafe", "كافيه", listOf("كافيه", "قهوه", "كوفي", "cafe", "coffee"), "كافيه", "cafe"),
        NearbyKind("market", "سوبر ماركت", listOf("سوبر ماركت", "سوبرماركت", "ماركت", "بقاله", "supermarket", "grocery"), "سوبر ماركت", "supermarket"),
        NearbyKind("mechanic", "ميكانيكى", listOf("ميكانيكي", "ورشه", "مركز صيانه", "mechanic", "car repair", "garage"), "ميكانيكى سيارات", "car_repair"),
        NearbyKind("tires", "بنشر", listOf("بنشر", "بنشري", "كاوتشي", "كاوتش", "tire shop", "tyre"), "بنشر كاوتش", "car_repair"),
        NearbyKind("wash", "مغسلة عربيات", listOf("مغسله", "غسيل عربيات", "غسيل العربيه", "car wash"), "مغسلة سيارات", "car_wash"),
        NearbyKind("police", "قسم شرطة", listOf("قسم", "شرطه", "بوليس", "نقطه شرطه", "police"), "قسم شرطة", "police"),
        NearbyKind("parking", "جراج", listOf("جراج", "باركنج", "مكان اركن", "parking"), "جراج", "parking"),
        NearbyKind("hotel", "فندق", listOf("فندق", "اوتيل", "hotel"), "فندق", "hotel"),
        NearbyKind("fuel", "بنزينة", listOf("بنزينه", "محطه بنزين", "gas station", "petrol"), "محطة بنزين", "gas_station"),
    )

    /** «أقرب صيدلية» · «فين أقرب ATM» · "nearest pharmacy". null = نوع مش معروف ⇒ بحث بالكلام زى ما اتقال. */
    fun kindOf(spoken: String): NearbyKind? {
        val t = " " + VoiceEngine.normalize(spoken) + " "
        return KINDS.firstOrNull { k -> k.words.any { w -> t.contains(" " + VoiceEngine.normalize(w) + " ") } }
            ?: KINDS.firstOrNull { k -> k.words.any { w -> w.length >= 4 && t.contains(VoiceEngine.normalize(w)) } }
    }

    /** الأقرب بالمسافة فى خط مستقيم. */
    fun nearest(results: List<NearbyResult>, lat: Double, lng: Double): NearbyResult? =
        results.minByOrNull { Geo.distanceM(lat, lng, it.lat, it.lng) }

    /** الحد الشهرى: مقفول (٠) = مايتبعتش طلب خالص. */
    fun allowed(enabled: Boolean, usedThisMonth: Int, cap: Int): Boolean = enabled && cap > 0 && usedThisMonth < cap

    const val DEFAULT_CAP = 100
    const val MAX_CAP = 2000
    const val RADIUS_M = 5000
}
