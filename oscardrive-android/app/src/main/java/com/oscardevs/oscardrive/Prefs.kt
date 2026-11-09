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

    /** ٠ = الملاحة جوه Oscar Drive لو متاحة · ١ = تطبيق الخرائط دايماً. */
    var navMode: Int
        get() = sp.getInt("nav_mode", 0)
        set(v) = sp.edit().putInt("nav_mode", v).apply()

    /** عدّاد وجهات الملاحة جوه التطبيق فى الشهر ده — جوجل بتحسب كل وجهة، وأول ١٠٠٠ فى الشهر مجانى. */
    fun navUsedThisMonth(month: String): Int = if (sp.getString("nav_month", "") == month) sp.getInt("nav_count", 0) else 0
    fun countNav(month: String) {
        val n = navUsedThisMonth(month) + 1
        sp.edit().putString("nav_month", month).putInt("nav_count", n).apply()
    }

    /* ── Oscar Security ── */
    /** الحماية والتتبّع شغّالين؟ (اختيارى — من غيره مفيش أى مكان بيتبعت لأى حد) */
    var securityOn: Boolean
        get() = sp.getBoolean("sec_on", false)
        set(v) = sp.edit().putBoolean("sec_on", v).apply()
    var deviceToken: String?
        get() = sp.getString("sec_token", null)
        set(v) = sp.edit().putString("sec_token", v).apply()
    var armed: Boolean
        get() = sp.getBoolean("sec_armed", false)
        set(v) = sp.edit().putBoolean("sec_armed", v).apply()
    var armedVer: Int
        get() = sp.getInt("sec_armed_ver", 0)
        set(v) = sp.edit().putInt("sec_armed_ver", v).apply()
    /** الشاشة غيّرت الحماية ولسه السيرفر ماعرفش. */
    var armPending: Boolean
        get() = sp.getBoolean("sec_arm_pending", false)
        set(v) = sp.edit().putBoolean("sec_arm_pending", v).apply()
    var pinHash: String?
        get() = sp.getString("sec_pin", null)
        set(v) = sp.edit().putString("sec_pin", v).apply()
    val pinSalt: String
        get() {
            var s = sp.getString("sec_salt", null)
            if (s == null) { s = java.util.UUID.randomUUID().toString(); sp.edit().putString("sec_salt", s).apply() }
            return s
        }
    var recordOnAlarm: Boolean
        get() = sp.getBoolean("sec_rec_alarm", true)
        set(v) = sp.edit().putBoolean("sec_rec_alarm", v).apply()
    var lastSyncMs: Long
        get() = sp.getLong("sec_last_sync", 0L)
        set(v) = sp.edit().putLong("sec_last_sync", v).apply()
    var carName: String
        get() = sp.getString("sec_car_name", "") ?: ""
        set(v) = sp.edit().putString("sec_car_name", v).apply()

    /* ── Oscar Voice + Personality ── */
    /** لغة التعرّف على الكلام وردود أوسكار: ar-EG أو en-US (الأوامر بالعربى والإنجليزى بتتفهم الاتنين). */
    var voiceLang: String
        get() = sp.getString("v_lang", "ar-EG") ?: "ar-EG"
        set(v) = sp.edit().putString("v_lang", v).apply()
    /** «يا أوسكار»: استماع متكرر والتطبيق قدامك — **مفتوح افتراضياً** (المالك ٢٠٢٦-١١-٠٦: «خلى الافتراضى ان السماعه
     *  مفتوحه و ممكن اقفلها لو عاوز»). إذن الميكروفون بيتطلب أول تشغيل، ولو اترفض بيتقفل. وعلامة «🎙️ سامعك» ظاهرة. */
    var voiceWake: Boolean
        get() = sp.getBoolean("v_wake", true)
        set(v) = sp.edit().putBoolean("v_wake", v).apply()
    /** اتطلب إذن الميكروفون مع أول تشغيل خلاص (عشان مانطلبوش كل مرة). */
    var micAsked: Boolean
        get() = sp.getBoolean("v_mic_asked", false)
        set(v) = sp.edit().putBoolean("v_mic_asked", v).apply()
    /** محرّك الكلام: 0 تلقائى (أوسكار من غير نت لو متنزّل، وإلا برنامج الشاشة) · 1 برنامج الشاشة · 2 أوسكار من غير نت. */
    var voiceEngine: Int
        get() = sp.getInt("v_engine", 0)
        set(v) = sp.edit().putInt("v_engine", v).apply()
    var voiceOffline: Boolean
        get() = sp.getBoolean("v_offline", true)
        set(v) = sp.edit().putBoolean("v_offline", v).apply()
    var wakeNames: List<String>
        get() = jsonList(sp.getString("v_wake_names", null)) ?: com.oscardevs.oscardrive.logic.VoiceCatalog.DEFAULT_WAKE
        set(v) = sp.edit().putString("v_wake_names", org.json.JSONArray(v).toString()).apply()
    /** صيغ السواق الزيادة: { commandId: [صيغة…] } */
    fun customPhrases(): Map<String, List<String>> {
        val o = try { org.json.JSONObject(sp.getString("v_custom", "{}") ?: "{}") } catch (_: Exception) { org.json.JSONObject() }
        return o.keys().asSequence().associateWith { k -> jsonList(o.optJSONArray(k)?.toString()).orEmpty() }
    }
    fun setCustomPhrases(m: Map<String, List<String>>) {
        val o = org.json.JSONObject(); for ((k, v) in m) if (v.isNotEmpty()) o.put(k, org.json.JSONArray(v))
        sp.edit().putString("v_custom", o.toString()).apply()
    }
    var disabledCommands: Set<String>
        get() = sp.getStringSet("v_off", emptySet()) ?: emptySet()
        set(v) = sp.edit().putStringSet("v_off", v).apply()
    /** أوسكار بيرد بصوته (الجمل المسجّلة). */
    var oscarReplies: Boolean
        get() = sp.getBoolean("o_replies", true)
        set(v) = sp.edit().putBoolean("o_replies", v).apply()
    /** male · female */
    var oscarVoice: String
        get() = sp.getString("o_voice", "male") ?: "male"
        set(v) = sp.edit().putString("o_voice", v).apply()
    fun voiceFiles(voice: String): org.json.JSONObject =
        try { org.json.JSONObject(sp.getString("o_files_$voice", "{}") ?: "{}") } catch (_: Exception) { org.json.JSONObject() }
    fun setVoiceFiles(voice: String, m: org.json.JSONObject) = sp.edit().putString("o_files_$voice", m.toString()).apply()
    fun customLine(id: String, lang: String): String? = sp.getString("o_line_${lang}_$id", null)
    fun setCustomLine(id: String, lang: String, text: String?) =
        sp.edit().apply { if (text == null) remove("o_line_${lang}_$id") else putString("o_line_${lang}_$id", text) }.apply()

    private fun jsonList(s: String?): List<String>? = try {
        if (s == null) null else org.json.JSONArray(s).let { a -> (0 until a.length()).map { a.getString(it) } }
    } catch (_: Exception) { null }

    companion object {
        const val LIMIT_MIN = 20
        const val LIMIT_MAX = 200
    }
}
