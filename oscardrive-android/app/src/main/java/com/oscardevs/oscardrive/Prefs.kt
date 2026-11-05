package com.oscardevs.oscardrive

import android.content.Context
import android.content.SharedPreferences

/** إعدادات السواق — كلها على الجهاز (مفيش حساب ولا سيرفر). */
class Prefs(context: Context) {
    private val sp: SharedPreferences = context.applicationContext.getSharedPreferences("oscardrive", Context.MODE_PRIVATE)

    var limit: Int
        get() = sp.getInt("limit", 90)
        set(v) = sp.edit().putInt("limit", v.coerceIn(LIMIT_MIN, LIMIT_MAX)).apply()
    /** تذكير الاستراحة بعد كام دقيقة سواقة متصلة (٠ = مقفول). */
    var breakMin: Int
        get() = sp.getInt("break_min", 120)
        set(v) = sp.edit().putInt("break_min", v).apply()
    var speedAlerts: Boolean
        get() = sp.getBoolean("speed_alerts", true)
        set(v) = sp.edit().putBoolean("speed_alerts", v).apply()
    var hazardAlerts: Boolean
        get() = sp.getBoolean("hazard_alerts", true)
        set(v) = sp.edit().putBoolean("hazard_alerts", v).apply()
    /** ٠ تلقائى (شروق/غروب) · ١ نهارى · ٢ ليلى */
    var theme: Int
        get() = sp.getInt("theme", 0)
        set(v) = sp.edit().putInt("theme", v).apply()
    var autoStart: Boolean
        get() = sp.getBoolean("auto_start", true)
        set(v) = sp.edit().putBoolean("auto_start", v).apply()
    /** آخر الرحلة = مكان الركنة لوحده. */
    var autoPark: Boolean
        get() = sp.getBoolean("auto_park", true)
        set(v) = sp.edit().putBoolean("auto_park", v).apply()
    /** كيلومترات الرحلات بتتزوّد على العدّاد لوحدها. */
    var autoOdo: Boolean
        get() = sp.getBoolean("auto_odo", true)
        set(v) = sp.edit().putBoolean("auto_odo", v).apply()
    var emergencyName: String
        get() = sp.getString("sos_name", "") ?: ""
        set(v) = sp.edit().putString("sos_name", v.trim()).apply()
    var emergencyPhone: String
        get() = sp.getString("sos_phone", "") ?: ""
        set(v) = sp.edit().putString("sos_phone", v.trim()).apply()
    /** عدّاد العربية بالكيلو (عشرى عشان الرحلات الصغيرة تتجمع). */
    var odoKm: Double
        get() = sp.getFloat("odo", 0f).toDouble()
        set(v) = sp.edit().putFloat("odo", v.coerceAtLeast(0.0).toFloat()).apply()
    /** آخر مكان معروف — للوضع الليلى قبل ما الـGPS يلقط. */
    var lastLat: Double
        get() = sp.getFloat("last_lat", 0f).toDouble()
        set(v) = sp.edit().putFloat("last_lat", v.toFloat()).apply()
    var lastLng: Double
        get() = sp.getFloat("last_lng", 0f).toDouble()
        set(v) = sp.edit().putFloat("last_lng", v.toFloat()).apply()

    companion object {
        const val LIMIT_MIN = 20
        const val LIMIT_MAX = 200
    }
}
