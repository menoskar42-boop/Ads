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

    /** ٦٠ كم ⇒ ~٢٠٠ م · ١٠٠ ⇒ ~٤١٥ م · ١٢٠ ⇒ ~٥٤٥ م. */
    fun warnDistanceM(kmh: Float): Double {
        val v = kmh / 3.6
        return max(MIN_WARN_M, v * NOTICE_S + v * v / (2 * COMFORT_DECEL))
    }

    fun rangeM(type: HazardType, kmh: Float): Double =
        if (type == HazardType.RADAR) max(RADAR_WARN_M, warnDistanceM(kmh)) else warnDistanceM(kmh)

    /** مفتاح «اتنبّهت» — الرادار ليه مرحلتين (بعيد ⇒ id · قريب ⇒ -id) فبيتنبّه مرتين. */
    fun warnKey(h: Hazard, distanceM: Double, kmh: Float): Long =
        if (h.type == HazardType.RADAR && distanceM <= warnDistanceM(kmh)) -h.id else h.id

    /** أقرب حاجة قدّامك محتاجة تنبيه دلوقتى — أو null. `warned` = id ⇒ آخر مرة اتنبّهت عليه. */
    fun ahead(
        hazards: List<Hazard>, lat: Double, lng: Double, headingDeg: Float?, kmh: Float,
        nowMs: Long, warned: Map<Long, Long>,
    ): Pair<Hazard, Double>? {
        if (kmh < MIN_SPEED_KMH || headingDeg == null) return null
        var best: Pair<Hazard, Double>? = null
        for (h in hazards) {
            val d = Geo.distanceM(lat, lng, h.lat, h.lng)
            if (d > rangeM(h.type, kmh)) continue
            val last = warned[warnKey(h, d, kmh)]
            if (last != null && nowMs - last < WARN_AGAIN_MS) continue
            // قريب جداً: الاتجاه للنقطة بيبقى عشوائى — يكفى إن العربية ماشية ناحيته
            val tol = if (d > FAR_M) FAR_AHEAD_DEG else AHEAD_DEG
            if (d > 25 && Geo.angleDiff(Geo.bearingDeg(lat, lng, h.lat, h.lng), headingDeg) > tol) continue
            if (h.type.directional && h.bearing != null && Geo.angleDiff(h.bearing, headingDeg) > SAME_WAY_DEG) continue
            if (best == null || d < best.second) best = h to d
        }
        return best
    }

    /** نفس النوع مسجّل فى نفس المكان تقريباً ⇒ مانكرّرهوش. */
    fun duplicateOf(hazards: List<Hazard>, type: HazardType, lat: Double, lng: Double): Hazard? =
        hazards.firstOrNull { it.type == type && Geo.distanceM(lat, lng, it.lat, it.lng) <= DUPLICATE_M }

    fun warning(h: Hazard, distanceM: Double): String = "خلّى بالك، ${h.type.ar} ${Geo.sayDistance(distanceM)}"
}
