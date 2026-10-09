package com.oscardevs.speedguard

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** إعدادات التطبيق + طابور المخالفات اللى لسه مااتبعتتش (لو النت قطع). */
class Prefs(context: Context) {
    private val sp: SharedPreferences = context.getSharedPreferences("speedguard", Context.MODE_PRIVATE)

    /** حد السرعة اللى السواق حدده (لو مش تبع شركة). */
    var personalLimit: Int
        get() = sp.getInt("limit", 90)
        set(v) = sp.edit().putInt("limit", v.coerceIn(LIMIT_MIN, LIMIT_MAX)).apply()

    var autoStart: Boolean
        get() = sp.getBoolean("auto_start", false)
        set(v) = sp.edit().putBoolean("auto_start", v).apply()

    /** معرّف ثابت للجهاز ده (بيتعمل مرة واحدة) — السيرفر بيرجّع نفس التوكن لنفس الجهاز. */
    val deviceId: String
        get() {
            var id = sp.getString("device_id", null)
            if (id == null) {
                id = UUID.randomUUID().toString()
                sp.edit().putString("device_id", id).apply()
            }
            return id
        }

    var fleetToken: String?
        get() = sp.getString("fleet_token", null)
        set(v) = sp.edit().putString("fleet_token", v).apply()
    var fleetName: String?
        get() = sp.getString("fleet_name", null)
        set(v) = sp.edit().putString("fleet_name", v).apply()
    var driverName: String?
        get() = sp.getString("driver_name", null)
        set(v) = sp.edit().putString("driver_name", v).apply()
    /** الحد اللى صاحب الشركة محدده — بيغلب حد السواق. */
    var fleetLimit: Int
        get() = sp.getInt("fleet_limit", 0)
        set(v) = sp.edit().putInt("fleet_limit", v).apply()

    val inFleet: Boolean get() = !fleetToken.isNullOrEmpty()
    val effectiveLimit: Int get() = if (inFleet && fleetLimit in LIMIT_MIN..LIMIT_MAX) fleetLimit else personalLimit

    fun leaveFleet() {
        sp.edit().remove("fleet_token").remove("fleet_name").remove("driver_name").remove("fleet_limit").remove("queue").apply()
    }

    /* ── طابور المخالفات ── */
    @Synchronized
    fun enqueue(v: JSONObject) {
        val arr = queue()
        arr.put(v)
        // سقف: لو الجهاز فضل من غير نت أيام، نحتفظ بآخر ٥٠٠ بس
        val trimmed = if (arr.length() > 500) JSONArray().also { t ->
            for (i in arr.length() - 500 until arr.length()) t.put(arr.get(i))
        } else arr
        sp.edit().putString("queue", trimmed.toString()).apply()
    }

    @Synchronized
    fun queue(): JSONArray = try { JSONArray(sp.getString("queue", "[]")) } catch (e: Exception) { JSONArray() }

    /** يشيل اللى اتبعت فعلاً (بالـuuid) — اللى اتضاف أثناء الإرسال بيفضل. */
    @Synchronized
    fun removeSent(uuids: Set<String>) {
        val arr = queue()
        val keep = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("uuid") !in uuids) keep.put(o)
        }
        sp.edit().putString("queue", keep.toString()).apply()
    }

    companion object {
        const val LIMIT_MIN = 20
        const val LIMIT_MAX = 200
    }
}
