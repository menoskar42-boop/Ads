package com.oscardevs.oscardrive.logic

/**
 * «خد استراحة ☕»: بيعدّ وقت السواقة المتصل. أول تذكير بعد المدة اللى السواق حددها (٠ = مقفول)،
 * وبعدين كل ١٥ دقيقة لحد ما يقف فعلاً. وقفة ١٠ دقايق = استراحة ⇒ العدّاد يبدأ من الأول.
 */
class Wellness(var everyMin: Int = 120) {
    var drivingSinceMs: Long? = null; private set
    private var lastMovingMs = 0L
    private var lastReminderMs = 0L

    fun drivenMinutes(nowMs: Long): Int = drivingSinceMs?.let { ((nowMs - it) / 60_000).toInt() } ?: 0

    /** بيتنده كل ثانية. بيرجّع عدد الدقايق لو لازم نفكّره دلوقتى. */
    fun onTick(nowMs: Long, moving: Boolean): Int? {
        if (moving) {
            if (drivingSinceMs == null) drivingSinceMs = nowMs
            lastMovingMs = nowMs
        } else if (drivingSinceMs != null && nowMs - lastMovingMs >= RESET_MS) {
            drivingSinceMs = null
            lastReminderMs = 0L
        }
        val since = drivingSinceMs ?: return null
        if (everyMin <= 0 || !moving) return null
        if (nowMs - since >= everyMin * 60_000L && nowMs - lastReminderMs >= REPEAT_MS) {
            lastReminderMs = nowMs
            return drivenMinutes(nowMs)
        }
        return null
    }

    companion object {
        const val RESET_MS = 10 * 60_000L
        const val REPEAT_MS = 15 * 60_000L
        val OPTIONS = listOf(0, 60, 90, 120, 180)

        fun message(min: Int): String {
            val h = min / 60; val m = min % 60
            val t = when {
                h == 0 -> "$m دقيقة"
                m == 0 -> if (h == 1) "ساعة" else if (h == 2) "ساعتين" else "$h ساعات"
                else -> "${if (h == 1) "ساعة" else if (h == 2) "ساعتين" else "$h ساعات"} و$m دقيقة"
            }
            return "بقالك $t سايق. خد استراحة واشرب حاجة"
        }
    }
}
