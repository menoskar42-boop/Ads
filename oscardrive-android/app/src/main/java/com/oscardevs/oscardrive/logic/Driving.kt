package com.oscardevs.oscardrive.logic

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * المرحلة ٧ من خطة Oscar Drive (المالك ٢٠٢٦-١١-١٠: «كمل المرحله السابعه») — سلوك القيادة + أوسكار مايقاطعش:
 *  • فرملة/تسارع مفاجئ من سرعة الـGPS (تقديرى — مش حساس عربية) + تجاوزات السرعة اللى بتتسجّل أصلاً
 *    ⇒ درجة لكل رحلة **بعد ما تخلص** وملخّص شهرى. مفيش كلام عن الدرجة وإنت سايق.
 *  • أوسكار يعرف: فيه مكالمة؟ ماشى ولا واقف؟ فيه ملاحة؟ ⇒ تنبيهات الأمان الأول دايماً، الباقى يستنى المكالمة تخلص،
 *    والترحيب مايتقالش وسط مكالمة، والردود أقصر وإنت ماشى.
 * Kotlin صافى بيتختبر على الكمبيوتر.
 */

enum class HarshType(val ar: String) { BRAKE("فرملة مفاجئة"), ACCEL("تسارع مفاجئ") }

/**
 * فرملة/تسارع مفاجئ من سرعة الـGPS: بنقارن السرعة دلوقتى بالسرعة من ٢–٤ ثوانى (مش قراءتين ورا بعض — الـGPS بيرقص).
 * فرملة ≤ −٣٫٥ م/ث² (حوالى ١٣ كم/س فى الثانية) من سرعة ٢٠ كم/س أو أكتر · تسارع ≥ +٣ م/ث².
 * أكتر من ٩ م/ث² = قراءة غلط (أكتر من فرملة طوارئ بعربية ملّاكى) ⇒ مابتتحسبش. حدث واحد كل ٦ ثوانى بالكتير.
 */
class HarshDetector {
    private data class P(val t: Long, val kmh: Float)
    private val buf = ArrayDeque<P>()
    private var lastEventMs = 0L
    var brakes = 0; private set
    var accels = 0; private set

    fun reset() { buf.clear(); brakes = 0; accels = 0; lastEventMs = 0 }

    fun onFix(timeMs: Long, kmh: Float?, accuracyM: Float?): HarshType? {
        if (kmh == null || (accuracyM != null && accuracyM > MAX_ACC_M)) { buf.clear(); return null }
        buf.addLast(P(timeMs, kmh))
        while (buf.isNotEmpty() && timeMs - buf.first().t > WINDOW_MAX_MS) buf.removeFirst()
        val ref = buf.lastOrNull { timeMs - it.t in WINDOW_MIN_MS..WINDOW_MAX_MS } ?: return null
        val a = (kmh - ref.kmh) / 3.6f / ((timeMs - ref.t) / 1000f)
        if (kotlin.math.abs(a) > NOISE_MPS2 || timeMs - lastEventMs < GAP_MS) return null
        val type = when {
            a <= BRAKE_MPS2 && ref.kmh >= MIN_KMH -> HarshType.BRAKE
            a >= ACCEL_MPS2 && kmh >= MIN_KMH -> HarshType.ACCEL
            else -> return null
        }
        lastEventMs = timeMs
        if (type == HarshType.BRAKE) brakes++ else accels++
        buf.clear()   // مانعدّش نفس الفرملة مرتين
        return type
    }

    companion object {
        const val BRAKE_MPS2 = -3.5f
        const val ACCEL_MPS2 = 3.0f
        const val NOISE_MPS2 = 9.0f
        const val MIN_KMH = 20f
        const val MAX_ACC_M = 25f
        const val WINDOW_MIN_MS = 2_000L
        const val WINDOW_MAX_MS = 4_000L
        const val GAP_MS = 6_000L
    }
}

data class TripBehavior(val km: Double, val brakes: Int, val accels: Int, val speedingN: Int, val speedingS: Int)
data class TripGrade(val score: Int, val label: String, val tip: String)

object DrivingScore {
    /**
     * من ١٠٠: كل فرملة مفاجئة −٦ · تسارع −٤ · تجاوز سرعة −٥ ، والمجموع بيتقسم على المسافة (كل ١٠ كم = وحدة، وأقل من ١٠ كم = وحدة)
     * عشان رحلة طويلة فيها فرملة واحدة ماتتساويش برحلة قصيرة فيها نفس الفرملة · ووقت التجاوز نفسه (كل ١٥ ثانية −١، لحد −٢٠).
     */
    fun score(b: TripBehavior): Int {
        val events = b.brakes * 6.0 + b.accels * 4.0 + b.speedingN * 5.0
        val perTen = events / max(1.0, b.km / 10.0)
        val time = min(20.0, b.speedingS / 15.0)
        return (100 - perTen - time).roundToInt().coerceIn(0, 100)
    }

    fun label(s: Int): String = when {
        s >= 90 -> "ممتازة"
        s >= 75 -> "كويسة"
        s >= 60 -> "محتاجة تهدى شوية"
        else -> "خطر"
    }

    /** نصيحة واحدة — أكبر سبب نقّص الدرجة. */
    fun tip(b: TripBehavior): String {
        val parts = listOf(b.brakes * 6 to "سيب مسافة أكبر قدّامك عشان الفرملة تبقى هادية",
            b.accels * 4 to "دوس بنزين بالراحة — بيوفّر بنزين كمان",
            b.speedingN * 5 + b.speedingS / 15 to "التزم بالحد — أوسكار بينبّهك قبلها")
        val top = parts.maxByOrNull { it.first }!!
        return if (top.first == 0) "رحلة هادية — كمّل كده" else top.second
    }

    fun grade(b: TripBehavior): TripGrade = score(b).let { TripGrade(it, label(it), tip(b)) }

    /** الكلام اللى بيظهر بعد الرحلة (مش وإنت سايق). */
    fun summary(b: TripBehavior): String {
        val g = grade(b)
        val bits = listOfNotNull(
            b.brakes.takeIf { it > 0 }?.let { "$it فرملة مفاجئة" },
            b.accels.takeIf { it > 0 }?.let { "$it تسارع مفاجئ" },
            b.speedingN.takeIf { it > 0 }?.let { "$it تجاوز سرعة" })
        return "درجة الرحلة ${g.score}/100 (${g.label})" + (if (bits.isEmpty()) "" else " — " + bits.joinToString(" · ")) + ". ${g.tip}"
    }
}

data class ScoredTrip(val startMs: Long, val km: Double, val score: Int, val brakes: Int, val accels: Int, val speedingN: Int)
data class DrivingMonth(val ym: String, val trips: Int, val avgScore: Int, val brakes: Int, val accels: Int, val speedingN: Int, val best: Int, val worst: Int)

object DrivingMonths {
    /** المتوسط بالمسافة (رحلة ٥٠ كم أهم من رحلة ٢ كم). الرحلات القديمة اللى من غير درجة مابتدخلش. الأحدث الأول. */
    fun monthly(trips: List<ScoredTrip>, ym: (Long) -> String): List<DrivingMonth> =
        trips.groupBy { ym(it.startMs) }.map { (m, ts) ->
            val w = ts.sumOf { max(0.5, it.km) }
            DrivingMonth(m, ts.size, (ts.sumOf { it.score * max(0.5, it.km) } / w).roundToInt(),
                ts.sumOf { it.brakes }, ts.sumOf { it.accels }, ts.sumOf { it.speedingN }, ts.maxOf { it.score }, ts.minOf { it.score })
        }.sortedByDescending { it.ym }
}

/* ───────── أوسكار مايقاطعش ───────── */

enum class SpeechKind {
    /** السرعة · المطب/الرادار · الطوارئ — دايماً. */
    SAFETY,
    /** رد على أمر إنت قلته — دايماً (إنت اللى سألت). */
    ANSWER,
    /** تذكير · مؤقّت · استراحة · الـGPS/النت · وصلت — يستنى المكالمة تخلص. */
    INFO,
    /** قراية رسالة جديدة — وسط مكالمة بتتشال (الإشعار نفسه فاضل فى الموبايل). */
    MESSAGE,
    /** الترحيب وأى كلام مش لازم — وسط مكالمة بيتشال. */
    CHATTER,
}

enum class SpeechDecision { SPEAK, WAIT, DROP }

object Etiquette {
    fun decide(kind: SpeechKind, inCall: Boolean): SpeechDecision = when {
        !inCall || kind == SpeechKind.SAFETY || kind == SpeechKind.ANSWER -> SpeechDecision.SPEAK
        kind == SpeechKind.INFO -> SpeechDecision.WAIT
        else -> SpeechDecision.DROP
    }

    /** اللى مستنى بعد المكالمة بيتقال لو لسه ماعدّاش عليه ١٠ دقايق (غير كده خلاص مالوش لازمة). */
    const val WAIT_MAX_MS = 10 * 60_000L
    const val MOVING_KMH = 10f
    const val BRIEF_MAX = 90

    /**
     * وإنت ماشى أو فى ملاحة: الرد بيتقال أقصر (أول جملة) — والنص كامل بيفضل مكتوب على الشاشة.
     * واقف: زى ما هو.
     */
    fun brief(text: String, busy: Boolean): String {
        val t = text.trim()
        if (!busy || t.length <= BRIEF_MAX) return t
        val cut = Regex("[.؟?!]|،| — | · ").findAll(t).map { it.range.first }.firstOrNull { it in 20..BRIEF_MAX }
        return if (cut != null) t.substring(0, cut).trim() else t.take(BRIEF_MAX).substringBeforeLast(' ').trim() + "…"
    }
}
