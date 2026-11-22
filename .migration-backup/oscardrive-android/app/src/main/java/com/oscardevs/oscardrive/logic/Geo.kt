package com.oscardevs.oscardrive.logic

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** حسابات المكان والاتجاه — Kotlin صافى (بيتختبر على الكمبيوتر). */
object Geo {
    fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }

    /** الاتجاه من النقطة الأولى للتانية بالدرجات (٠ = شمال، ٩٠ = شرق). */
    fun bearingDeg(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Float {
        val p1 = Math.toRadians(lat1); val p2 = Math.toRadians(lat2)
        val dl = Math.toRadians(lng2 - lng1)
        val y = sin(dl) * cos(p2)
        val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
        return ((Math.toDegrees(atan2(y, x)) + 360.0) % 360.0).toFloat()
    }

    /** أصغر فرق بين اتجاهين (٠…١٨٠). */
    fun angleDiff(a: Float, b: Float): Float {
        val d = abs(((a - b) % 360f + 360f) % 360f)
        return if (d > 180f) 360f - d else d
    }

    private val EN = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    private val AR = listOf("شمال", "شمال شرق", "شرق", "جنوب شرق", "جنوب", "جنوب غرب", "غرب", "شمال غرب")
    private val ARROW = listOf("↑", "↗", "→", "↘", "↓", "↙", "←", "↖")

    private fun octant(deg: Float): Int = (((deg % 360f + 360f) % 360f) / 45f).roundToInt() % 8

    fun compassEn(deg: Float) = EN[octant(deg)]
    fun compassAr(deg: Float) = AR[octant(deg)]
    fun arrow(deg: Float) = ARROW[octant(deg)]

    /** «بعد ١٥٠ متر» — مقرّبة لأقرب ٥٠ متر، وفوق الكيلو بالكيلو. */
    fun sayDistance(m: Double): String = when {
        m < 50 -> "قدامك على طول"
        m < 1000 -> "بعد ${((m / 50).roundToInt() * 50)} متر"
        else -> "بعد ${"%.1f".format(java.util.Locale.US, m / 1000)} كيلو"
    }

    /** رابط خريطة يفتح فى أى تطبيق خرائط أو المتصفح. */
    fun mapsLink(lat: Double, lng: Double): String =
        "https://maps.google.com/?q=${"%.6f".format(java.util.Locale.US, lat)},${"%.6f".format(java.util.Locale.US, lng)}"
}
