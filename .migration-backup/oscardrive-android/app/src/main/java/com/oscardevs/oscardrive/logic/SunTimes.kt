package com.oscardevs.oscardrive.logic

import java.util.Calendar
import java.util.TimeZone
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import kotlin.math.tan

/**
 * الشروق والغروب من مكان العربية والتاريخ (خوارزمية NOAA المبسّطة — دقة دقيقتين تقريباً) —
 * عشان الواجهة تقلب ليلى/نهارى لوحدها من غير إنترنت ولا حساس ضوء.
 */
object SunTimes {
    private fun rad(d: Double) = Math.toRadians(d)
    private fun deg(r: Double) = Math.toDegrees(r)
    private fun norm(x: Double, m: Double) = ((x % m) + m) % m

    /** دقيقة الشروق/الغروب بتوقيت UTC (من نص الليل) — null لو الشمس مابتطلعش/مابتغيبش. */
    fun utcMinutes(lat: Double, lng: Double, dayOfYear: Int, rising: Boolean): Double? {
        val lngHour = lng / 15.0
        val t = dayOfYear + ((if (rising) 6.0 else 18.0) - lngHour) / 24.0
        val m = 0.9856 * t - 3.289
        val l = norm(m + 1.916 * sin(rad(m)) + 0.020 * sin(rad(2 * m)) + 282.634, 360.0)
        var ra = norm(deg(atan(0.91764 * tan(rad(l)))), 360.0)
        ra += floor(l / 90.0) * 90.0 - floor(ra / 90.0) * 90.0
        ra /= 15.0
        val sinDec = 0.39782 * sin(rad(l))
        val cosDec = cos(asin(sinDec))
        val cosH = (cos(rad(90.833)) - sinDec * sin(rad(lat))) / (cosDec * cos(rad(lat)))
        if (cosH > 1 || cosH < -1) return null
        val h = (if (rising) 360.0 - deg(acos(cosH)) else deg(acos(cosH))) / 15.0
        val localT = h + ra - 0.06571 * t - 6.622
        return norm(localT - lngHour, 24.0) * 60.0
    }

    fun isNight(lat: Double, lng: Double, nowMs: Long): Boolean {
        val c = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = nowMs }
        val day = c.get(Calendar.DAY_OF_YEAR)
        val nowMin = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE)
        val rise = utcMinutes(lat, lng, day, true) ?: return false
        val set = utcMinutes(lat, lng, day, false) ?: return false
        // بعد الغروب بربع ساعة لحد قبل الشروق بربع ساعة = ليل (الشفق لسه فيه نور)
        val r = rise - 15; val s = set + 15
        return if (r < s) nowMin < r || nowMin >= s else nowMin >= s && nowMin < r
    }

    /** من غير GPS: ليل من ٦ المغرب لـ٦ الصبح بالساعة المحلية. */
    fun isNightByClock(hour: Int): Boolean = hour >= 18 || hour < 6
}
