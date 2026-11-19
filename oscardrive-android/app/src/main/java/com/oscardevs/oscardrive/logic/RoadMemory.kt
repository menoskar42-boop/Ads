package com.oscardevs.oscardrive.logic

import kotlin.math.max

/**
 * «ذاكرة الطريق»: السواق بيسجّل مطب/حفرة/رادار/مكان خطر بزرار أو بصوته، والتطبيق بيحفظ المكان
 * واتجاه العربية، والمرة الجاية بينبّهه قبل ما يوصل — المسافة حسب السرعة (المالك ٢٠٢٦-١١-٠٦: «قبله بمسافة كافية
 * طبقاً لسرعتى»): ٨ ثوانى قدّامك + مسافة فرملة هادية، وأقل حاجة ١٥٠ متر. والرادار من **٣ كيلو** («الرادار التنبيه
 * الخاص بيه يجى قبله ب٣ كيلو») وبيتكرر تانى لما يقرب.
 *
 * ضد التنبيه الغلط:
 *   • لازم تكون ماشى (≥ ١٠ كم/س) والمكان **قدّامك** (فرق الاتجاه ≤ ٤٠°) — مش ورا ولا فى شارع جنبك.
 *   • الرادار بيتسجّل باتجاهه: الاتجاه العكسى (الناحية التانية من الطريق) مابينبّهش.
 *   • نفس المكان مابيتكررش فى أقل من ٥ دقايق.
 */
enum class HazardType(val key: String, val ar: String, val emoji: String, val directional: Boolean) {
    BUMP("bump", "مطب", "〰️", false),
    POTHOLE("pothole", "حفرة", "🕳️", false),
    RADAR("radar", "رادار", "📷", true),
    DANGER("danger", "مكان خطر", "⚠️", false);

    companion object {
        fun of(key: String?): HazardType = entries.firstOrNull { it.key == key } ?: DANGER
    }
}

data class Hazard(
    val id: Long,
    val type: HazardType,
    val lat: Double,
    val lng: Double,
    /** اتجاه العربية وقت التسجيل — null لو كانت واقفة. */
    val bearing: Float?,
    val note: String = "",
    val createdMs: Long = 0,
    /** ارتفاع الـGPS ودقته الأفقية وقت التسجيل (null للقديم) — فلتر الكوبرى. */
    val altitude: Double? = null,
    val accuracy: Float? = null,
)

object RoadMemory {
    const val MIN_WARN_M = 150.0
    /** ثوانى «تاخد بالك» قبل ما تبدأ تفرمل. */
    const val NOTICE_S = 8.0
    /** فرملة هادية (م/ث²) — مش فرملة طوارئ. */
    const val COMFORT_DECEL = 2.0
    /** الرادار: تنبيه أول من ٣ كيلو، وتانى على مسافة المطب العادية. */
    const val RADAR_WARN_M = 3000.0
    /** بعيد (> ٥٠٠ م) الطريق بيلف ⇒ سماحية أكبر فى «قدّامك». */
    const val FAR_M = 500.0
    const val FAR_AHEAD_DEG = 60f
    const val MIN_SPEED_KMH = 10f
    const val AHEAD_DEG = 40f
    const val SAME_WAY_DEG = 60f
    const val WARN_AGAIN_MS = 5 * 60_000L
    const val DUPLICATE_M = 30.0

    /**
     * مسافة التنبيه للمطبات والحفر والأماكن الخطر المتسجّلة (المالك ٢٠٢٦-١١-١٨): **١٠٠ م افتراضى** وتتغيّر من الإعدادات.
     * دى «أقل مسافة» — لو سرعتك عالية التنبيه بييجى أبعد (٨ ثوانى + فرملة هادية). الرادار (٣ كم) والكاميرا مالهمش دعوة بيها.
     */
    const val DEFAULT_BUMP_WARN_M = 100
    val BUMP_WARN_OPTIONS = listOf(50, 100, 150, 200, 250, 300)
    /** «وضع عدم الإزعاج» (المالك ٢٠٢٦-١١-١٨): مفيش تنبيه مطبات تحت ٧ كم/س. مقفول ⇒ بينبّه حتى وانت ماشى ببطء. */
    const val QUIET_SLOW_KMH = 7f
    /** أقل من كده = واقف (الـGPS بيتهزّ وانت راكن) — عشان مايفضلش ينبّه كل ٥ دقايق والعربية راكنة جنب مطب. */
    const val STOPPED_KMH = 2f
    /** مفيش اتجاه معروف لسه (أول التشغيل): بينبّه على اللى قريب جداً بس. */
    const val NO_HEADING_M = 40.0

    /** ٦٠ كم ⇒ ~٢٠٠ م · ١٠٠ ⇒ ~٤١٥ م · ١٢٠ ⇒ ~٥٤٥ م. `minM` = مسافة التنبيه اللى فى الإعدادات. */
    fun warnDistanceM(kmh: Float, minM: Double = MIN_WARN_M): Double {
        val v = kmh / 3.6
        return max(minM, v * NOTICE_S + v * v / (2 * COMFORT_DECEL))
    }

    fun rangeM(type: HazardType, kmh: Float, minM: Double = MIN_WARN_M): Double =
        if (type == HazardType.RADAR) max(RADAR_WARN_M, warnDistanceM(kmh)) else warnDistanceM(kmh, minM)

    /** مفتاح «اتنبّهت» — الرادار ليه مرحلتين (بعيد ⇒ id · قريب ⇒ -id) فبيتنبّه مرتين. */
    fun warnKey(h: Hazard, distanceM: Double, kmh: Float): Long =
        if (h.type == HazardType.RADAR && distanceM <= warnDistanceM(kmh)) -h.id else h.id

    /** أقرب حاجة قدّامك محتاجة تنبيه دلوقتى — أو null. `warned` = id ⇒ آخر مرة اتنبّهت عليه. */
    fun ahead(
        hazards: List<Hazard>, lat: Double, lng: Double, headingDeg: Float?, kmh: Float,
        nowMs: Long, warned: Map<Long, Long>,
        minKmh: Float = MIN_SPEED_KMH, minWarnM: Double = MIN_WARN_M,
        altitudeM: Double? = null, vAccM: Float? = null,
    ): Pair<Hazard, Double>? {
        if (kmh < minKmh) return null
        var best: Pair<Hazard, Double>? = null
        for (h in hazards) {
            val d = Geo.distanceM(lat, lng, h.lat, h.lng)
            if (d > rangeM(h.type, kmh, minWarnM)) continue
            if (headingDeg == null) {
                // لسه مفيش اتجاه (أول التشغيل): القريب جداً بس، ومن غير الرادار (ليه اتجاه)
                if (d > NO_HEADING_M || h.type.directional) continue
                if (warned[warnKey(h, d, kmh)]?.let { nowMs - it < WARN_AGAIN_MS } == true) continue
                if (best == null || d < best.second) best = h to d
                continue
            }
            val last = warned[warnKey(h, d, kmh)]
            if (last != null && nowMs - last < WARN_AGAIN_MS) continue
            // قريب جداً: الاتجاه للنقطة بيبقى عشوائى — يكفى إن العربية ماشية ناحيته
            val tol = if (d > FAR_M) FAR_AHEAD_DEG else AHEAD_DEG
            if (d > 25 && Geo.angleDiff(Geo.bearingDeg(lat, lng, h.lat, h.lng), headingDeg) > tol) continue
            if (h.type.directional && h.bearing != null && Geo.angleDiff(h.bearing, headingDeg) > SAME_WAY_DEG) continue
            // المطب/الحفرة بعرض الطريق: نفس الطريق فى الاتجاهين بينبّه، والطريق اللى بيقطعه (كوبرى فوقه/تحته · شارع جانبى) لأ
            if (!h.type.directional && h.bearing != null && !sameAxis(h.bearing, headingDeg)) continue
            if (!h.type.directional && otherLevel(h, altitudeM, vAccM)) continue
            if (best == null || d < best.second) best = h to d
        }
        return best
    }

    /**
     * الاتجاه (المالك ٢٠٢٦-١١-١٨ — المطب اللى تحت الكوبرى بينبّه وانت فوقه): المطب اللى ليه اتجاه تسجيل بينبّه لو انت ماشى
     * **على نفس محور الطريق** — نفس الاتجاه أو العكسى (المطب بعرض الطريق) — فى حدود ٤٠°. القديم من غير اتجاه بيفضل زى ما هو،
     * وبياخد اتجاه لوحده أول ما تعدّى من فوقه وانت ماشى (learnBearing) — مابنخترعش اتجاه.
     */
    const val AXIS_DEG = 40f
    fun sameAxis(a: Float, b: Float): Boolean { val d = Geo.angleDiff(a, b); return d <= AXIS_DEG || d >= 180f - AXIS_DEG }
    /**
     * عدّيت من فوقه (≤ ١٥ م) **ببطء** (٧–٢٥ كم/س — الناس بتهدّى عند المطب الحقيقى، وفوق الكوبرى لأ) واتجاهك معروف والـGPS كويس
     * ⇒ ده اتجاه الطريق. شرط البطء عشان العربية اللى معدّية على كوبرى فوق المطب ماتعلّمهوش اتجاه الكوبرى.
     */
    const val LEARN_M = 15.0
    const val LEARN_KMH = 7f
    const val LEARN_MAX_KMH = 25f
    const val LEARN_ACC_M = 20f
    fun learnBearing(hazards: List<Hazard>, lat: Double, lng: Double, headingDeg: Float?, kmh: Float, accuracyM: Float?): List<Pair<Long, Float>> {
        if (headingDeg == null || kmh < LEARN_KMH || kmh > LEARN_MAX_KMH || (accuracyM != null && accuracyM > LEARN_ACC_M)) return emptyList()
        return hazards.filter { !it.type.directional && it.bearing == null && Geo.distanceM(lat, lng, it.lat, it.lng) <= LEARN_M }
            .map { it.id to headingDeg }
    }

    /**
     * فلتر الكوبرى بالارتفاع (البند ٥ — المالك ٢٠٢٦-١١-١٨): الطريق الموازى فوق/تحت نفس المطب مابيتحلّش بالاتجاه. ارتفاع الـGPS
     * غلطه الرأسى عادة ١٫٥× الأفقى، فالمطب بيتشال بس لو الفرق **أكبر من غلط القراءتين مع بعض + ٣ م** — يعنى الشك = بينبّه
     * (تنبيه زيادة أحسن من مطب من غير تنبيه). القديم من غير ارتفاع: زى ما هو، وبياخد ارتفاع لما تعدّى عليه ببطء (learnAltitude).
     */
    const val ALT_MARGIN_M = 3.0
    const val V_ACC_FACTOR = 1.5f
    const val UNKNOWN_V_ACC_M = 15f
    fun otherLevel(h: Hazard, altitudeM: Double?, vAccM: Float?): Boolean {
        val a = h.altitude ?: return false
        val now = altitudeM ?: return false
        val storedErr = (h.accuracy ?: (UNKNOWN_V_ACC_M / V_ACC_FACTOR)) * V_ACC_FACTOR
        val nowErr = vAccM ?: UNKNOWN_V_ACC_M
        return kotlin.math.abs(now - a) - (storedErr + nowErr) > ALT_MARGIN_M
    }
    const val LEARN_ALT_ACC_M = 10f
    fun learnAltitude(hazards: List<Hazard>, lat: Double, lng: Double, kmh: Float, accuracyM: Float?, altitudeM: Double?): List<Pair<Long, Double>> {
        if (altitudeM == null || accuracyM == null || accuracyM > LEARN_ALT_ACC_M || kmh < LEARN_KMH || kmh > LEARN_MAX_KMH) return emptyList()
        return hazards.filter { !it.type.directional && it.altitude == null && Geo.distanceM(lat, lng, it.lat, it.lng) <= LEARN_M }
            .map { it.id to altitudeM }
    }

    /**
     * باج (المالك ٢٠٢٦-١١-١٩): «لما بسجّل مطب، قبل ما يقول اتسجّل مطب يقول على طول قدامك مطب» — المطب اللى لسه متسجّل
     * (أو اللى كان متسجّل فى نفس المكان) بيبقى تحت العربية بالظبط فالتنبيه بيمسكه. فاللى حوالين آخر تسجيل (٦٠ م) بيتسكّت دقيقتين.
     */
    const val JUST_MARKED_MS = 120_000L
    const val JUST_MARKED_M = 60.0
    fun skipJustMarked(hazards: List<Hazard>, markLat: Double?, markLng: Double?, markAt: Long, now: Long): List<Hazard> =
        if (markLat == null || markLng == null || markAt <= 0L || now - markAt > JUST_MARKED_MS) hazards
        else hazards.filter { Geo.distanceM(markLat, markLng, it.lat, it.lng) > JUST_MARKED_M }

    /** نفس النوع مسجّل فى نفس المكان تقريباً ⇒ مانكرّرهوش. */
    fun duplicateOf(hazards: List<Hazard>, type: HazardType, lat: Double, lng: Double): Hazard? =
        hazards.firstOrNull { it.type == type && Geo.distanceM(lat, lng, it.lat, it.lng) <= DUPLICATE_M }

    fun warning(h: Hazard, distanceM: Double): String = "خلّى بالك، ${h.type.ar} ${Geo.sayDistance(distanceM)}"
}
