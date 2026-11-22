package com.oscardevs.oscardrive.logic

import kotlin.math.roundToInt

/**
 * المالك ٢٠٢٦-١١-٠٦: «تحديد الموقع بيعتمد على gps حتى بدون إنترنت و الانترنت لو موجود ممكن يساعد فى تدقيق الموقع».
 * الـGPS هو الأساس ومابيحتاجش نت. لو مفيش لقطة GPS حديثة (لسه بيدوّر · نفق · جراج) وفيه نت ⇒ موقع الشبكة
 * يتعرض **كمكان تقريبى** (الخريطة · الركن · الوضع الليلى) ومكتوب عليه دقته — ومابيدخلش أبداً فى السرعة
 * ولا العدّاد ولا الرحلة ولا المطبات ولا تنبيه الحماية (موقع الشبكة بيتنطّط مئات الأمتار).
 */
object ApproxLocation {
    /** من غير لقطة GPS المدة دى ⇒ الـGPS «مش موجود». */
    const val GPS_STALE_MS = 20_000L
    /** موقع شبكة أقدم من كده مايتعرضش. */
    const val NET_MAX_AGE_MS = 2 * 60_000L

    fun useNetwork(nowMs: Long, lastGpsMs: Long, netMs: Long?): Boolean =
        netMs != null && nowMs - lastGpsMs > GPS_STALE_MS && nowMs - netMs <= NET_MAX_AGE_MS

    fun label(accuracyM: Float?): String =
        "📶 مكان تقريبى" + (accuracyM?.let { " ±${it.roundToInt()} م" } ?: "")
}
