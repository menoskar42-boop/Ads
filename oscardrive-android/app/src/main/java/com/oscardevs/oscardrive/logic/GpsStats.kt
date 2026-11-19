package com.oscardevs.oscardrive.logic

/**
 * «وضع المقارنة» (المرحلة ٣ بند ٣): جودة الـGPS فى آخر دقيقة — عدد القراءات فى الثانية ومتوسط الدقة وأسوأ ١٠٪ — عشان نقارن الشاشة
 * بالموبايل على نفس المقياس. نفس الحساب فى drive-web/road.js (gpsStats).
 */
class GpsStats(private val windowMs: Long = 60_000L) {
    private val t = ArrayDeque<Long>()
    private val acc = ArrayDeque<Float?>()

    @Synchronized fun add(nowMs: Long, accuracyM: Float?) {
        t.addLast(nowMs); acc.addLast(accuracyM)
        while (t.isNotEmpty() && nowMs - t.first() > windowMs) { t.removeFirst(); acc.removeFirst() }
    }

    data class Summary(val fixes: Int, val perSec: Double, val avgAccM: Double?, val p90AccM: Double?)

    @Synchronized fun summary(nowMs: Long): Summary {
        val keep = t.indices.filter { nowMs - t[it] <= windowMs }
        if (keep.isEmpty()) return Summary(0, 0.0, null, null)
        val span = maxOf(1_000L, nowMs - t[keep.first()])
        val a = keep.mapNotNull { acc[it]?.toDouble() }.sorted()
        return Summary(keep.size, keep.size * 1000.0 / span, if (a.isEmpty()) null else a.average(),
            if (a.isEmpty()) null else a[minOf(a.size - 1, (a.size * 0.9).toInt())])
    }
}
