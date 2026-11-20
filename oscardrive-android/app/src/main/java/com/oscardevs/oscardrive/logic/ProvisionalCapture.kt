package com.oscardevs.oscardrive.logic

/** أوامر الطريق اللى بتسجّل لحظة (الصورة والمكان لازم يتاخدوا ساعة ما اتقالت). */
object RoadVoice {
    val IDS = setOf("road.shot", "road.bump", "road.pothole")
    fun isRoad(id: String?) = id != null && id in IDS
}

/**
 * التصوير الفورى لأوامر الطريق (المالك ٢٠٢٦-١١-٢٠): أول ما الكلام **شكله** «صوّر الطريق» / «سجّل مطب» / «سجّل حفرة»
 * (من النتايج الجزئية وانت لسه بتتكلم، أو قبل سؤال «تقصد …؟») بناخد المكان والاتجاه والوقت والصورة على طول —
 * بدل ما نستنى الجملة تخلص (على ٦٠ كم/س ثانيتين = ٣٣ متر بعد المطب).
 *
 *   • الأمر اتأكّد ⇒ البيانات دى هى اللى بتتحفظ فى نفس طريق الحفظ العادى (المطب فى القاعدة · الصورة فى Shots).
 *   • اتلغى · أمر تانى · مافهمش · عدّى [ttlMs] ⇒ بتتشال (الصورة فى الذاكرة بس، مااتكتبتش على الشاشة).
 *   • تصوير واحد فى المرة، ومفيش تصوير جديد جوّه [cooldownMs] بعد ما واحد اتحفظ (نفس الأمر اتسمع تانى).
 * Kotlin صافى — متختبر فى ProvisionalCaptureTest.
 */
class ProvisionalCapture(private val ttlMs: Long = TTL_MS, private val cooldownMs: Long = COOLDOWN_MS) {
    /** المكان والاتجاه لحظة ما اتقال الأمر (null = الـGPS مش لاقط). */
    data class Fix(val atMs: Long, val lat: Double?, val lng: Double?, val headingDeg: Float?, val speedKmh: Float?,
                   val accuracyM: Float?, val altitudeM: Double?) {
        val hasPlace get() = lat != null && lng != null
    }

    class Item internal constructor(val kind: String, val fix: Fix) {
        var jpg: ByteArray? = null; internal set
        var orientation = 0; internal set
        var camError: String? = null; internal set
        var camDone = false; internal set
        /** الأمر اللى اتأكّد (أى أمر طريق — «صوّر المطب» بعد «مطب» عادى). */
        var confirmed: String? = null; internal set
        var finished = false; internal set
    }

    var current: Item? = null; private set
    private var lastFinishMs = Long.MIN_VALUE / 2

    /** أمر طريق محتمل ⇒ Item جديد نصوّر له. null = مش أمر طريق، أو فيه تصوير شغّال، أو لسه حافظين واحد حالاً. */
    fun begin(kind: String, fix: Fix): Item? {
        if (!RoadVoice.isRoad(kind)) return null
        sweep(fix.atMs)
        val c = current
        if (c != null && !c.finished) return null
        if (fix.atMs - lastFinishMs in 0 until cooldownMs) return null
        return Item(kind, fix).also { current = it }
    }

    /** الكاميرا خلصت (صورة أو غلط). لو اتشال قبلها ⇒ الصورة ماتتحفظش. */
    fun cameraDone(item: Item, jpg: ByteArray?, orientation: Int, error: String?) {
        item.camDone = true
        if (item.finished || current !== item) return
        item.jpg = jpg; item.orientation = orientation; item.camError = if (jpg == null) (error ?: "الكاميرا مش متاحة") else null
    }

    /** الأمر اتأكّد. بيرجّع الـItem (فى وقته) — أو null ⇒ مفيش بيانات فورية واستخدم الطريقة العادية. */
    fun confirm(id: String, nowMs: Long): Item? {
        val c = current ?: return null
        if (!RoadVoice.isRoad(id)) { discard(); return null }
        if (c.finished || c.confirmed != null) return null
        if (nowMs - c.fix.atMs !in 0 until ttlMs) { discard(); return null }
        c.confirmed = id
        return c
    }

    /** true **مرة واحدة** لما الأمر يتأكّد والكاميرا تخلص ⇒ احفظ الصورة. */
    fun finishIfReady(item: Item, nowMs: Long): Boolean {
        if (item.finished || item.confirmed == null || !item.camDone || current !== item) return false
        item.finished = true; lastFinishMs = nowMs; current = null
        return true
    }

    /** إلغاء · أمر تانى · مافهمش ⇒ البيانات تتشال (اللى اتأكّد ومستنى الكاميرا مابيتلمسش). */
    fun discard() {
        val c = current ?: return
        if (c.confirmed != null && !c.finished) return
        c.finished = true; c.jpg = null
        current = null
    }

    /** اللى عدّى وقته من غير تأكيد بيتشال. */
    fun sweep(nowMs: Long) {
        val c = current ?: return
        if (!c.finished && c.confirmed == null && nowMs - c.fix.atMs >= ttlMs) discard()
    }

    companion object {
        /** يكفّى سؤال «تقصد …؟» (١٠ ثوانى) + وقت الكاميرا. */
        const val TTL_MS = 15_000L
        const val COOLDOWN_MS = RepeatGuard.WINDOW_MS
    }
}
