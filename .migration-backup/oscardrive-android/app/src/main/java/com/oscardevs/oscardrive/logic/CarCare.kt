package com.oscardevs.oscardrive.logic

import kotlin.math.max

/** صيانة العربية: كل بند بيتعمل كل كذا كيلو و/أو كل كذا يوم. */
data class MaintItem(
    val id: Long,
    val name: String,
    val everyKm: Int,     // ٠ = مالوش عدّاد كيلومترات
    val everyDays: Int,   // ٠ = مالوش ميعاد بالأيام
    val lastKm: Int,
    val lastDateMs: Long,
)

enum class MaintStatus { OK, SOON, DUE }

data class MaintResult(val status: MaintStatus, val kmLeft: Int?, val daysLeft: Int?)

object CarCare {
    const val DAY_MS = 86_400_000L

    /** البنود الأساسية لأى عربية بنزين — السواق يعدّل الأرقام زى ما الكتالوج بتاعه يقول. */
    val DEFAULTS: List<Triple<String, Int, Int>> = listOf(
        Triple("زيت الموتور", 5000, 180),
        Triple("فلتر الزيت", 5000, 180),
        Triple("فلتر الهوا", 10000, 0),
        Triple("فلتر التكييف", 15000, 365),
        Triple("فلتر البنزين", 20000, 0),
        Triple("تيل الفرامل", 30000, 0),
        Triple("البوجيهات", 40000, 0),
        Triple("مية الرادياتير", 40000, 730),
        // الكاوتش أمامى وخلفى منفصلين (المالك: «ماتفترضش إن الأربعة اتغيّروا لو غيّرت اتنين»)
        Triple("كاوتش أمامى", 40000, 1460),
        Triple("كاوتش خلفى", 40000, 1460),
        Triple("البطارية", 0, 730),
        Triple("ترخيص العربية", 0, 365),
    )

    fun status(item: MaintItem, odoKm: Int, nowMs: Long): MaintResult {
        val kmLeft = if (item.everyKm > 0) item.lastKm + item.everyKm - odoKm else null
        val daysLeft = if (item.everyDays > 0) ((item.lastDateMs + item.everyDays * DAY_MS - nowMs) / DAY_MS).toInt() else null
        val due = (kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft <= 0)
        val soon = (kmLeft != null && kmLeft <= max(300, item.everyKm / 10)) || (daysLeft != null && daysLeft <= 14)
        return MaintResult(if (due) MaintStatus.DUE else if (soon) MaintStatus.SOON else MaintStatus.OK, kmLeft, daysLeft)
    }

    fun describe(r: MaintResult): String {
        val parts = mutableListOf<String>()
        r.kmLeft?.let { parts += if (it <= 0) "متأخر ${-it} كم" else "فاضل $it كم" }
        r.daysLeft?.let { parts += if (it <= 0) "متأخر ${-it} يوم" else "فاضل $it يوم" }
        return parts.joinToString(" · ")
    }
}

/** تفويلة: العدّاد وقتها، كام لتر، دفعت كام، وفوّلت لآخرها ولا لأ. */
data class Fill(val id: Long, val odoKm: Int, val liters: Double, val price: Double, val full: Boolean, val timeMs: Long)

object Fuel {
    /**
     * الاستهلاك (لتر/١٠٠ كم) بطريقة «من فل لفل»: بين آخر تفويلتين لآخرها، اللترات اللى اتحطت بعد
     * الأولى (لحد التانية ومعاها) ÷ الكيلومترات اللى اتمشت بينهم. مفيش تفويلتين فل ⇒ null.
     */
    fun consumption(fills: List<Fill>): Double? {
        val s = fills.sortedBy { it.odoKm }
        val fulls = s.withIndex().filter { it.value.full }
        if (fulls.size < 2) return null
        val a = fulls[fulls.size - 2]; val b = fulls.last()
        val km = b.value.odoKm - a.value.odoKm
        if (km <= 0) return null
        val liters = s.subList(a.index + 1, b.index + 1).sumOf { it.liters }
        return liters / km * 100.0
    }

    /** تكلفة الكيلو (جنيه/كم) على نفس الفترة. */
    fun costPerKm(fills: List<Fill>): Double? {
        val s = fills.sortedBy { it.odoKm }
        val fulls = s.withIndex().filter { it.value.full }
        if (fulls.size < 2) return null
        val a = fulls[fulls.size - 2]; val b = fulls.last()
        val km = b.value.odoKm - a.value.odoKm
        if (km <= 0) return null
        return s.subList(a.index + 1, b.index + 1).sumOf { it.price } / km
    }
}
