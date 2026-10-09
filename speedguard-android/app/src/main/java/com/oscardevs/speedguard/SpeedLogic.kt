package com.oscardevs.speedguard

import java.util.UUID
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * قلب التطبيق: من قراءات الـGPS لسرعة + قرار الإنذار + تسجيل المخالفة. Kotlin صافى (مفيش
 * Android) عشان يتختبر على الكمبيوتر — SpeedLogicTest.
 *
 * السرعة نفسها من **Doppler** (Location.getSpeed): الشريحة بتحسبها من تردد إشارة الأقمار،
 * وده أدق بكتير من «المسافة ÷ الوقت» بين نقطتين (اللى بيتأثر بأى نطّة فى المكان). المسافة
 * ÷ الوقت احتياطى بس للأجهزة اللى مابترجّعش سرعة.
 *
 * ضد الإنذار الكاذب:
 *   • قرار الإنذار على **وسيط آخر ٣ قراءات** — قراءة واحدة شاذة مابتعملش إنذار.
 *   • لازم قراءتين متتاليتين فوق الحد عشان يبدأ التجاوز.
 *   • الخروج من التجاوز لما ينزل **تحت الحد بـ ٢ كم** ٣ قراءات (مايفضلش يرنّ على الحد).
 *   • دقة مكان أسوأ من ٥٠ م = القراءة مابتدخلش فى القرار.
 */
class SpeedLogic {
    data class Fix(
        val timeMs: Long,
        val speedMps: Float?,      // null لو الجهاز ماحسبش سرعة
        val lat: Double,
        val lng: Double,
        val accuracyM: Float?,
        val speedAccuracyMps: Float? = null,
    )

    data class Violation(
        val uuid: String,
        val startedAtMs: Long,
        val endedAtMs: Long,
        val maxSpeedKmh: Float,
        val limitKmh: Int,
        val durationS: Int,
        val lat: Double,
        val lng: Double,
    )

    sealed class Event {
        /** قول للسواق دلوقتى. first = أول مرة فى التجاوز ده. */
        data class Alert(val speedKmh: Int, val limitKmh: Int, val first: Boolean) : Event()
        data class ViolationEnded(val v: Violation) : Event()
    }

    /** السرعة المعروضة (كم/س) — null = مفيش قراءة صالحة حديثة. */
    var speedKmh: Float? = null; private set
    var lastFixMs: Long = 0; private set
    var lastAccuracyM: Float? = null; private set
    var lastSpeedAccuracyKmh: Float? = null; private set
    val inViolation: Boolean get() = episodeStart != null

    private var prev: Fix? = null
    private val recent = ArrayDeque<Float>()
    private var aboveCount = 0
    private var belowCount = 0
    private var episodeStart: Long? = null
    private var episodeMax = 0f
    private var episodeLat = 0.0
    private var episodeLng = 0.0
    private var episodeLimit = 0
    private var lastAlertMs = 0L
    private var lastAboveMs = 0L
    /** آخر قراءة كان فيها فوق الحد فعلاً — نهاية المخالفة (مش لحظة ما الإنذار اتقفل). */
    private var lastOverMs = 0L

    fun onFix(f: Fix, limitKmh: Int): List<Event> {
        val events = mutableListOf<Event>()
        val kmh = speedOf(f)
        prev = f
        lastFixMs = f.timeMs
        lastAccuracyM = f.accuracyM
        lastSpeedAccuracyKmh = f.speedAccuracyMps?.let { it * 3.6f }
        if (kmh == null) return events

        speedKmh = if (kmh < STANDSTILL_KMH) 0f else kmh
        val reliable = f.accuracyM == null || f.accuracyM <= MAX_ACCURACY_M
        if (!reliable) return events

        recent.addLast(kmh)
        while (recent.size > 3) recent.removeFirst()
        val m = median(recent)

        if (episodeStart == null) {
            if (m > limitKmh) {
                aboveCount++
                if (aboveCount == 1) { lastAboveMs = f.timeMs; episodeLat = f.lat; episodeLng = f.lng }
                if (aboveCount >= START_FIXES) {
                    episodeStart = lastAboveMs
                    lastOverMs = f.timeMs
                    episodeMax = m
                    episodeLimit = limitKmh
                    belowCount = 0
                    lastAlertMs = f.timeMs
                    events += Event.Alert(m.toInt(), limitKmh, first = true)
                }
            } else aboveCount = 0
        } else {
            if (m > episodeMax) episodeMax = m
            if (m <= limitKmh - HYSTERESIS_KMH) {
                belowCount++
                if (belowCount >= END_FIXES) close(lastOverMs)?.let { events += it }
            } else {
                belowCount = 0
                lastAboveMs = f.timeMs
                if (m > limitKmh) lastOverMs = f.timeMs
                if (m > limitKmh && f.timeMs - lastAlertMs >= REPEAT_MS) {
                    lastAlertMs = f.timeMs
                    events += Event.Alert(m.toInt(), limitKmh, first = false)
                }
            }
        }
        return events
    }

    /** بيتنده كل ثانية: الـGPS وقف (نفق/جراج) ⇒ السرعة غير معروفة، والتجاوز المفتوح بيتقفل. */
    fun onTick(nowMs: Long): List<Event> {
        if (lastFixMs != 0L && nowMs - lastFixMs > STALE_MS) {
            speedKmh = null
            recent.clear()
            aboveCount = 0
        }
        if (episodeStart != null && nowMs - lastFixMs > EPISODE_GAP_MS) {
            return listOfNotNull(close(lastOverMs))
        }
        return emptyList()
    }

    private fun close(endMs: Long): Event? {
        val start = episodeStart ?: return null
        episodeStart = null
        aboveCount = 0
        belowCount = 0
        val dur = ((endMs - start) / 1000).toInt().coerceAtLeast(0)
        if (dur < MIN_VIOLATION_S) return null
        return Event.ViolationEnded(Violation(
            UUID.randomUUID().toString(), start, endMs, (episodeMax * 10).toInt() / 10f,
            episodeLimit, dur, episodeLat, episodeLng))
    }

    private fun speedOf(f: Fix): Float? {
        f.speedMps?.let { if (it >= 0f && it < 120f) return it * 3.6f }
        // احتياطى: المسافة ÷ الوقت — بس بين قراءتين قريبتين ودقيقتين
        val p = prev ?: return null
        val dt = (f.timeMs - p.timeMs) / 1000.0
        if (dt < 0.5 || dt > 5.0) return null
        if ((f.accuracyM ?: 99f) > 25f || (p.accuracyM ?: 99f) > 25f) return null
        val v = distanceM(p.lat, p.lng, f.lat, f.lng) / dt * 3.6
        return if (v < 400) v.toFloat() else null
    }

    companion object {
        const val STANDSTILL_KMH = 2f
        const val MAX_ACCURACY_M = 50f
        const val START_FIXES = 2
        const val END_FIXES = 3
        const val HYSTERESIS_KMH = 2
        const val REPEAT_MS = 10_000L
        const val STALE_MS = 3_000L
        const val EPISODE_GAP_MS = 15_000L
        const val MIN_VIOLATION_S = 3

        fun median(xs: Collection<Float>): Float {
            val s = xs.sorted()
            return if (s.size % 2 == 1) s[s.size / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2f
        }

        fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
            val r = 6_371_000.0
            val dLat = Math.toRadians(lat2 - lat1)
            val dLng = Math.toRadians(lng2 - lng1)
            val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
            return 2 * r * atan2(sqrt(a), sqrt(1 - a))
        }
    }
}
