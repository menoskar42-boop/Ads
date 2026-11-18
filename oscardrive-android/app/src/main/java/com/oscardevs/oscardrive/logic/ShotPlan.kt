package com.oscardevs.oscardrive.logic

/**
 * «صوّر المطب وانت جاى عليه» (المالك ٢٠٢٦-١١-١٨): لما أوسكار ينبّه على مطب أو حفرة **المالك سجّلها بإحداثياتها**، الكاميرا
 * بتاخد صورة عند ٨٠ و٥٠ و٢٥ متر قبلها — صور حقيقية من الطرق المصرية لتدريب موديل المطبات (المكان والمسافة معروفين = صورة متعلّمة).
 *
 *   • صورة واحدة لكل علامة، ولو قفز علامتين فى قراية GPS واحدة ⇒ صورة واحدة بس.
 *   • بيخلص لما يعدّى المطب (المسافة زادت ٢٠ متر عن أقل مسافة) أو بعد دقيقتين — مافيش صور «ورا» المطب.
 */
class ShotPlan(val hazardId: Long, private val startMs: Long, private val marksM: List<Double> = MARKS_M) {
    private var next = 0
    private var minD = Double.MAX_VALUE
    var done = false
        private set

    /** بترجع true لو لازم ناخد صورة دلوقتى. */
    fun onDistance(d: Double, nowMs: Long): Boolean {
        if (done) return false
        if (nowMs - startMs > MAX_MS) { done = true; return false }
        if (d < minD) minD = d
        else if (d - minD > PASSED_M) { done = true; return false }
        if (next < marksM.size && d <= marksM[next]) {
            while (next < marksM.size && d <= marksM[next]) next++
            if (next >= marksM.size) done = true
            return true
        }
        return false
    }

    companion object {
        val MARKS_M = listOf(80.0, 50.0, 25.0)
        const val PASSED_M = 20.0
        const val MAX_MS = 120_000L

        /** الصور للمطبات والحفر بس (الرادار والخطر مش للموديل). */
        fun wants(type: HazardType) = type == HazardType.BUMP || type == HazardType.POTHOLE
    }
}
