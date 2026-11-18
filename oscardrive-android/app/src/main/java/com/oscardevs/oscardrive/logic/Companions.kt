package com.oscardevs.oscardrive.logic

import kotlin.math.abs
import kotlin.math.cos

/**
 * الموبايلات كمصادر GPS إضافية (المرحلة ٢ — docs/OSCAR_DRIVE_PHASES_2_3.md): هل الموبايل ده فعلاً فى العربية؟
 * درجة ثقة مستمرة (٠–١٠) مش اختبار واحد: كل قراءة (كل ~٢ ث) — قريب من الشاشة فى حدود دقة الاتنين + ١٥ م، ووانتو ماشيين نفس السرعة
 * (±١٠ كم/س) ونفس الاتجاه (±٣٠°) ⇒ +١ · بعيد ⇒ −٣، وأبعد من ١٠٠ م ⇒ صفر على طول (الموبايل اللى اتنسى فى البيت) · واقفين ⇒ مفيش إثبات فالدرجة زى ما هى ·
 * قراءة قديمة ⇒ −١. **موثوق** من ٧ (≈ ١٥ ث حركة متطابقة). الخطوة دى عرض بس — مكان العربية فاضل من GPS الشاشة.
 */
data class CompanionFix(val id: Long, val label: String, val lat: Double, val lng: Double, val accM: Float,
                        val speedMs: Float?, val headingDeg: Float?, val ageMs: Long)

class CompanionTracker {
    data class Status(val id: Long, val label: String, val score: Int, val trusted: Boolean, val fresh: Boolean,
                      val accM: Float, val ageS: Int, val distM: Double?,
                      /** مكان الموبايل متقدّم للحظة دى + سرعته واتجاهه (للخطوة ٣: الدمج). */
                      val lat: Double = 0.0, val lng: Double = 0.0, val kmh: Float? = null, val headingDeg: Float? = null)

    private val scores = HashMap<Long, Int>()

    fun update(fixes: List<CompanionFix>, carLat: Double?, carLng: Double?, carAccM: Float?, carKmh: Float?, carHeading: Float?): List<Status> {
        val out = ArrayList<Status>()
        for (f in fixes) {
            var s = scores[f.id] ?: 0
            val fresh = f.ageMs <= FRESH_MS
            var dist: Double? = null
            val (plat, plng) = project(f)
            if (!fresh) s -= 1
            else if (carLat != null && carLng != null) {
                dist = Geo.distanceM(carLat, carLng, plat, plng)
                val tol = (carAccM ?: 20f) + f.accM + NEAR_EXTRA_M
                val moving = (carKmh ?: 0f) >= MOVING_KMH
                if (dist > FAR_M) s = 0                 // بعيد بوضوح (اتنسى فى البيت / عربية تانية) ⇒ الثقة بتقع على طول
                else if (dist > tol) s -= 3
                else if (moving) {
                    val spOk = f.speedMs == null || abs(f.speedMs * 3.6f - (carKmh ?: 0f)) <= SPEED_TOL_KMH
                    val hdOk = f.headingDeg == null || carHeading == null || Geo.angleDiff(f.headingDeg, carHeading) <= HEADING_TOL_DEG
                    s += if (spOk && hdOk) 1 else -2
                }
            }
            s = s.coerceIn(0, MAX)
            scores[f.id] = s
            out += Status(f.id, f.label, s, s >= TRUST && fresh, fresh, f.accM, (f.ageMs / 1000).toInt(), dist,
                plat, plng, f.speedMs?.let { it * 3.6f }, f.headingDeg)
        }
        scores.keys.retainAll(fixes.map { it.id }.toSet())
        return out
    }

    /** القراءة عمرها ثانية–اتنين (السيرفر) ⇒ نقدّمها بسرعتها واتجاهها للحظة دى. */
    private fun project(f: CompanionFix): Pair<Double, Double> {
        val sp = f.speedMs ?: return f.lat to f.lng
        val h = f.headingDeg ?: return f.lat to f.lng
        val d = sp * (f.ageMs / 1000.0)
        val r = Math.toRadians(h.toDouble())
        return (f.lat + d * cos(r) / 111_320.0) to (f.lng + d * kotlin.math.sin(r) / (111_320.0 * cos(Math.toRadians(f.lat))))
    }

    companion object {
        const val FRESH_MS = 5_000L
        const val NEAR_EXTRA_M = 15f
        const val FAR_M = 100.0
        const val MOVING_KMH = 10f
        const val SPEED_TOL_KMH = 10f
        const val HEADING_TOL_DEG = 30f
        const val MAX = 10
        const val TRUST = 7

        /**
         * الخطوة ٣ — مكان العربية من المصادر الموثوقة بس: GPS الشاشة هو الأساس. الموبايل الموثوق:
         *  • الشاشة مالهاش GPS (أو قديم/تقريبى) ⇒ الموبايل الأدق لوحده.
         *  • الاتنين كويسين وقريبين من بعض فى حدود دقتهم ⇒ متوسط بالأوزان (1/دقة²) — مش متوسط أعمى.
         *  • مختلفين ⇒ الأدق لوحده بس لو أدق بوضوح (≤ نص دقة الشاشة)، وإلا الشاشة.
         * الارتفاع (الكوبرى) من الشاشة بس.
         */
        data class Fused(val lat: Double, val lng: Double, val accM: Float, val source: String, val kmh: Float?, val headingDeg: Float?)
        fun fuse(carLat: Double?, carLng: Double?, carAccM: Float?, st: List<Status>): Fused? {
            val phone = st.filter { it.trusted }.minByOrNull { it.accM }
            if (carLat == null || carLng == null) return phone?.let { Fused(it.lat, it.lng, it.accM, "الموبايل", it.kmh, it.headingDeg) }
            val ca = carAccM ?: 20f
            if (phone == null) return Fused(carLat, carLng, ca, "الشاشة", null, null)
            val d = Geo.distanceM(carLat, carLng, phone.lat, phone.lng)
            if (d <= ca + phone.accM) {
                val wc = 1.0 / (ca * ca); val wp = 1.0 / (phone.accM * phone.accM); val w = wc + wp
                val acc = (1.0 / kotlin.math.sqrt(w)).toFloat()
                return Fused((carLat * wc + phone.lat * wp) / w, (carLng * wc + phone.lng * wp) / w, acc, "دمج", null, null)
            }
            return if (phone.accM <= ca / 2) Fused(phone.lat, phone.lng, phone.accM, "الموبايل", null, null)
                   else Fused(carLat, carLng, ca, "الشاشة", null, null)
        }

        /** سطر الحالة على الشاشة — الموبايل المتوصّل مايتعرضش كمصدر GPS غير لما يبقى موثوق. */
        fun summary(st: List<Status>, carHasGps: Boolean): String {
            val trusted = st.filter { it.trusted }
            val best = trusted.minByOrNull { it.accM }
            return when {
                trusted.isNotEmpty() && carHasGps -> "📡 الشاشة + ${trusted.size} موبايل (أدق موبايل ${best!!.accM.toInt()} م)"
                trusted.isNotEmpty() -> "📡 GPS الموبايل بس (${best!!.label} · ${best.accM.toInt()} م) — الشاشة مالهاش GPS"
                st.any { it.fresh } -> "📡 ${st.count { it.fresh }} موبايل بيشارك — لسه بنتأكد إنه فى العربية"
                st.isNotEmpty() -> "📡 موبايل متوصّل بس الـGPS بتاعه قديم"
                carHasGps -> "📡 GPS الشاشة بس"
                else -> "📡 مفيش GPS"
            }
        }
    }
}
