package com.oscardevs.oscardrive.logic

import org.json.JSONArray

/**
 * «ودّينى X» لمكان مش محفوظ (٢٠٢٦-١١-١٩): بدل ما يفتح بحث تطبيق الخرايط، البحث بالاسم بيتم فى OpenStreetMap (Nominatim — مجانى من غير
 * مفتاح، طلب واحد لكل أمر صوت، وده جوه حدّهم: طلب فى الثانية) حوالين مكانك ⇒ الأقرب ⇒ الملاحة جوه Oscar Drive. المكان بيتبعت متقرّب
 * لحوالى ١ كم (زى Overpass). مفيش نتيجة/نت ⇒ زى الأول (بحث تطبيق الخرايط). نفس الحساب فى drive-web/road.js (searchUrl/parseSearch).
 */
object OsmSearch {
    const val BASE = "https://nominatim.openstreetmap.org/search"
    /** البحث بيفضّل ±٠٫٥° (~٥٠ كم) حوالين مكانك، ومن غير ما يقفل على البلد (مصر بس). */
    const val BOX_DEG = 0.5

    fun url(q: String, lat: Double?, lng: Double?): String {
        val enc = java.net.URLEncoder.encode(q.trim(), "UTF-8")
        val box = if (lat != null && lng != null) {
            val a = OsmNearby.round(lat); val o = OsmNearby.round(lng)
            fun f(v: Double) = String.format(java.util.Locale.US, "%.2f", v)
            "&viewbox=${f(o - BOX_DEG)},${f(a + BOX_DEG)},${f(o + BOX_DEG)},${f(a - BOX_DEG)}"
        } else ""
        return "$BASE?format=jsonv2&limit=8&countrycodes=eg&accept-language=ar&q=$enc$box"
    }

    /** رد Nominatim ⇒ أماكن (الاسم المختصر لو موجود، وإلا أول جزء من العنوان). */
    fun parse(json: String): List<NearbyResult> {
        val a = try { JSONArray(json) } catch (_: Exception) { return emptyList() }
        val out = ArrayList<NearbyResult>()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val lat = o.optString("lat").toDoubleOrNull() ?: continue
            val lng = o.optString("lon").toDoubleOrNull() ?: continue
            val name = o.optString("name").ifBlank { o.optString("display_name").substringBefore(",") }.trim()
            out += NearbyResult(name.ifBlank { "المكان" }, lat, lng)
        }
        return out
    }
}
