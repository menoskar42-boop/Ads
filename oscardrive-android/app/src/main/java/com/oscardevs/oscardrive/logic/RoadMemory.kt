package com.oscardevs.oscardrive.logic

import kotlin.math.max

/**
 * «ذاكرة الطريق»: السواق بيسجّل مطب/حفرة/رادار/مكان خطر بزرار أو بصوته، والتطبيق بيحفظ المكان
 * واتجاه العربية، والمرة الجاية بينبّهه قبل ما يوصل (حوالى ١٢ ثانية قدّام، وأقل حاجة ١٥٠ متر).
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
    const val LOOKAHEAD_S = 12.0
    const val MIN_SPEED_KMH = 10f
    const val AHEAD_DEG = 40f
    const val SAME_WAY_DEG = 60f
    const val WARN_AGAIN_MS = 5 * 60_000L
    const val DUPLICATE_M = 30.0

    fun warnDistanceM(kmh: Float): Double = max(MIN_WARN_M, kmh / 3.6 * LOOKAHEAD_S)

    /** أقرب حاجة قدّامك محتاجة تنبيه دلوقتى — أو null. `warned` = id ⇒ آخر مرة اتنبّهت عليه. */
    fun ahead(
        hazards: List<Hazard>, lat: Double, lng: Double, headingDeg: Float?, kmh: Float,
        nowMs: Long, warned: Map<Long, Long>,
    ): Pair<Hazard, Double>? {
        if (kmh < MIN_SPEED_KMH || headingDeg == null) return null
        val range = warnDistanceM(kmh)
        var best: Pair<Hazard, Double>? = null
        for (h in hazards) {
            val d = Geo.distanceM(lat, lng, h.lat, h.lng)
            if (d > range) continue
            val last = warned[h.id]
            if (last != null && nowMs - last < WARN_AGAIN_MS) continue
            // قريب جداً: الاتجاه للنقطة بيبقى عشوائى — يكفى إن العربية ماشية ناحيته
            if (d > 25 && Geo.angleDiff(Geo.bearingDeg(lat, lng, h.lat, h.lng), headingDeg) > AHEAD_DEG) continue
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
