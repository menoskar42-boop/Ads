package com.oscardevs.oscardrive.logic

/**
 * «Oscar Security» على الشاشة (المالك ٢٠٢٦-١١-٠٥): وضع الحماية + اكتشاف الحركة + الرقم السرى.
 * Kotlin صافى عشان يتختبر على الكمبيوتر (SecurityTest).
 *
 * المعنى:
 *   • armed = وضع الحماية شغّال (بيتفعّل من الشاشة أو من صفحة الموبايل، ويفضل لحد ما حد يقفله).
 *   • وهو شغّال: كل تشغيل للعربية الشاشة بتطلب الرقم السرى. الرقم الصح = «الجلسة دى بأمان» (unlocked)
 *     لحد ما الشاشة تطفى. التشغيل الجاى بيطلبه تانى.
 *   • من غير الرقم: أول حركة حقيقية (سرعة ≥ ١٠ كم/س قراءتين ورا بعض، أو بعدت ٨٠ متر عن مكان التشغيل)
 *     بعد مهلة ٤٥ ثانية من التشغيل ⇒ حدث «armed_move» مرة واحدة (والتتبّع نفسه شغّال طول الوقت).
 *   • ٣ أرقام غلط ⇒ «pin_wrong» (مرة لكل ٣).
 */
class SecurityLogic(private val graceMs: Long = GRACE_MS) {
    enum class Kind(val key: String) { STARTED_ARMED("started_armed"), ARMED_MOVE("armed_move"), PIN_OK("pin_ok"), PIN_WRONG("pin_wrong"), ARMED("armed"), DISARMED("disarmed") }
    data class Event(val kind: Kind, val lat: Double? = null, val lng: Double? = null)

    var armed = false; private set
    var unlocked = false; private set
    var alarmed = false; private set
    private var bootMs = 0L
    private var anchorLat: Double? = null
    private var anchorLng: Double? = null
    private var fastCount = 0
    private var pendingMove: Event? = null
    private var wrong = 0

    /** الشاشة اشتغلت (الخدمة بدأت). */
    fun onBoot(nowMs: Long, armedNow: Boolean): List<Event> {
        bootMs = nowMs; armed = armedNow; unlocked = false; alarmed = false
        anchorLat = null; anchorLng = null; fastCount = 0; pendingMove = null; wrong = 0
        return if (armed) listOf(Event(Kind.STARTED_ARMED)) else emptyList()
    }

    /** تغيير الحماية: من الشاشة (fromCar=true ⇒ حدث) أو من الموبايل عن طريق السيرفر. */
    fun setArmed(v: Boolean, fromCar: Boolean): List<Event> {
        if (v == armed) return emptyList()
        armed = v
        alarmed = false; pendingMove = null; fastCount = 0
        if (v) { unlocked = false; anchorLat = null; anchorLng = null }
        return if (fromCar) listOf(Event(if (v) Kind.ARMED else Kind.DISARMED)) else emptyList()
    }

    val needsPin: Boolean get() = armed && !unlocked

    fun onPin(ok: Boolean): List<Event> {
        if (!armed) return emptyList()
        if (ok) { unlocked = true; wrong = 0; pendingMove = null; return listOf(Event(Kind.PIN_OK)) }
        wrong++
        return if (wrong % 3 == 0) listOf(Event(Kind.PIN_WRONG)) else emptyList()
    }

    fun onFix(nowMs: Long, lat: Double, lng: Double, kmh: Float, accuracyM: Float?): List<Event> {
        if (!needsPin || alarmed) return emptyList()
        val good = accuracyM == null || accuracyM <= 40f
        if (!good) return tick(nowMs)
        if (anchorLat == null) { anchorLat = lat; anchorLng = lng }
        fastCount = if (kmh >= MOVE_KMH) fastCount + 1 else 0
        val far = Geo.distanceM(anchorLat!!, anchorLng!!, lat, lng) > MOVE_M
        if (fastCount >= 2 || far) pendingMove = pendingMove ?: Event(Kind.ARMED_MOVE, lat, lng)
        return tick(nowMs)
    }

    /** بيتنده كل ثانية: الحركة اللى حصلت جوّه المهلة بتتبلّغ أول ما المهلة تخلص. */
    fun tick(nowMs: Long): List<Event> {
        val m = pendingMove ?: return emptyList()
        if (!needsPin || alarmed) { pendingMove = null; return emptyList() }
        if (nowMs - bootMs < graceMs) return emptyList()
        alarmed = true; pendingMove = null
        return listOf(m)
    }

    companion object {
        const val GRACE_MS = 45_000L
        const val MOVE_KMH = 10f
        const val MOVE_M = 80.0
    }
}

/** كل إمتى نسجّل مكان: ماشية = كل ١٠ ثوانى · واقفة = كل دقيقة. */
object TrackPolicy {
    const val MOVING_MS = 10_000L
    const val STOPPED_MS = 60_000L
    fun due(lastMs: Long, nowMs: Long, kmh: Float): Boolean = nowMs - lastMs >= if (kmh >= 3f) MOVING_MS else STOPPED_MS
}

/** الرقم السرى: ٤–٦ أرقام، بيتخزّن هاش بملح (مش الرقم نفسه). */
object Pin {
    fun valid(p: String) = p.length in 4..6 && p.all { it.isDigit() }
    fun hash(pin: String, salt: String): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        return md.digest("$salt:$pin".toByteArray()).joinToString("") { "%02x".format(it) }
    }
}
