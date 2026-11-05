package com.oscardevs.oscardrive.logic

/**
 * الرحلة: بتبدأ أول ما العربية تتحرك (≥ ٨ كم/س)، وبتخلص لما تقف ٣ دقايق متصلة. المسافة بتتجمع
 * بس والعربية ماشية وقراءة الـGPS دقيقة — عشان الـGPS وهو واقف «بيرقص» حوالين المكان وده
 * مايتحسبش كيلومترات. ورحلة أقل من ٢٠٠ متر مابتتسجّلش (حركة فى الجراج).
 */
class TripLogic(private val stopEndMs: Long = STOP_END_MS) {
    data class Summary(
        val startMs: Long, val endMs: Long, val distanceM: Double, val movingS: Long,
        val maxKmh: Float, val startLat: Double, val startLng: Double, val endLat: Double, val endLng: Double,
    ) {
        val avgKmh: Float get() = if (movingS > 0) (distanceM / movingS * 3.6).toFloat() else 0f
        val totalS: Long get() = (endMs - startMs) / 1000
    }

    var active = false; private set
    var distanceM = 0.0; private set
    var movingMs = 0L; private set
    var maxKmh = 0f; private set
    var startMs = 0L; private set
    /** آخر اتجاه معروف (من حركة حقيقية) — واقف = بيفضل آخر اتجاه. */
    var headingDeg: Float? = null; private set
    var lastLat: Double? = null; private set
    var lastLng: Double? = null; private set

    private var startLat = 0.0
    private var startLng = 0.0
    private var anchorLat: Double? = null
    private var anchorLng: Double? = null
    private var anchorMs = 0L
    private var lastFixMs = 0L
    private var lastMoveMs = 0L

    val avgKmh: Float get() = if (movingMs > 0) (distanceM / (movingMs / 1000.0) * 3.6).toFloat() else 0f

    fun onFix(timeMs: Long, lat: Double, lng: Double, kmh: Float?, accuracyM: Float?, bearing: Float?) {
        lastLat = lat; lastLng = lng
        val good = accuracyM == null || accuracyM <= MAX_ACCURACY_M
        val v = kmh ?: 0f
        if (bearing != null && v >= HEADING_MIN_KMH && good) headingDeg = bearing
        if (!good) { lastFixMs = timeMs; return }

        if (!active) {
            if (v >= START_KMH) {
                active = true
                startMs = timeMs; startLat = lat; startLng = lng
                distanceM = 0.0; movingMs = 0; maxKmh = v
                anchorLat = lat; anchorLng = lng; anchorMs = timeMs
                lastMoveMs = timeMs
            }
            lastFixMs = timeMs
            return
        }

        val moving = v >= MOVING_KMH
        if (moving) {
            lastMoveMs = timeMs
            if (v > maxKmh) maxKmh = v
            val dt = timeMs - lastFixMs
            if (dt in 1..MAX_GAP_MS) movingMs += dt
            val aLat = anchorLat; val aLng = anchorLng
            if (aLat != null && aLng != null) {
                val d = Geo.distanceM(aLat, aLng, lat, lng)
                val secs = (timeMs - anchorMs) / 1000.0
                // نطّة مستحيلة (أسرع من ٢٥٠ كم/س بين النقطتين) = قراءة غلط — ماتتحسبش
                if (secs <= 0 || d / secs <= MAX_JUMP_MPS) distanceM += d
            }
            anchorLat = lat; anchorLng = lng; anchorMs = timeMs
        } else {
            // واقف: النقطة المرجعية بتفضل مكانها — رقص الـGPS مابيتجمعش
            anchorMs = timeMs
        }
        lastFixMs = timeMs
    }

    /** بيتنده كل ثانية — الرحلة بتخلص بعد وقفة طويلة. */
    fun onTick(nowMs: Long): Summary? {
        if (active && nowMs - lastMoveMs >= stopEndMs) return end(lastMoveMs)
        return null
    }

    /** التطبيق اتقفل — الرحلة المفتوحة تتسجّل لحد آخر حركة. */
    fun forceEnd(): Summary? = if (active) end(lastMoveMs) else null

    private fun end(endMs: Long): Summary? {
        active = false
        val s = Summary(startMs, endMs, distanceM, movingMs / 1000, maxKmh, startLat, startLng,
            lastLat ?: startLat, lastLng ?: startLng)
        anchorLat = null; anchorLng = null
        return if (s.distanceM >= MIN_TRIP_M) s else null
    }

    companion object {
        const val STOP_END_MS = 3 * 60_000L
        const val START_KMH = 8f
        const val MOVING_KMH = 3f
        const val HEADING_MIN_KMH = 5f
        const val MAX_ACCURACY_M = 30f
        const val MAX_GAP_MS = 5_000L
        const val MAX_JUMP_MPS = 70.0
        const val MIN_TRIP_M = 200.0
    }
}
