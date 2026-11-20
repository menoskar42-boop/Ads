package com.oscardevs.oscardrive.logic

import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * «أقرب بنزينة / صيدلية / ATM…» جوه التطبيق من غير فلوس (المالك ٢٠٢٦-١١-١٨: «كل أزرار الملاحه تتعامل داخل التطبيق طالما الإعدادات
 * بتقول داخل التطبيق»): خرايط OpenStreetMap المفتوحة (Overpass API — مجانى ومن غير مفتاح) بتلاقى الأقرب ⇒ الملاحة جوه Oscar Drive.
 * المكان بيتبعت **متقرّب لحوالى ١ كم** (زى الطقس) والبحث فى ٥ كم. لو مفيش نتيجة أو مفيش نت ⇒ زى الأول (بحث فى تطبيق الخرايط).
 * Places API (جوجل، بفلوس بعد حد) فاضل اختيارى زى ما هو.
 */
object OsmNearby {
    const val RADIUS_M = 5000
    /**
     * النطاق بيكبر لوحده (البرومبت ٦ — ٢٠٢٦-١١-٢٠): ٢ ⇒ ٥ ⇒ ١٠ ⇒ ٢٥ كم، وأول نطاق فيه نتيجة هو اللى بيتاخد. كده الأقرب دايماً من
     * القريب (Overpass بيرجّع ٤٠ نتيجة من غير ترتيب، فنطاق كبير من الأول ممكن يفوّت الأقرب) ومفيش نتايج ٤٠٠ كم.
     */
    val RADII_M = listOf(2000, 5000, 10000, 25000)
    const val URL = "https://overpass-api.de/api/interpreter"

    /** نوع «أقرب …» ⇒ فلتر OpenStreetMap. */
    fun filters(kindId: String): List<String>? = when (kindId) {
        "fuel" -> listOf("[amenity=fuel]")
        "pharmacy" -> listOf("[amenity=pharmacy]")
        "hospital" -> listOf("[amenity=hospital]")
        "atm" -> listOf("[amenity=atm]", "[amenity=bank][atm=yes]")
        "bank" -> listOf("[amenity=bank]")
        "church" -> listOf("[amenity=place_of_worship][religion=christian]")
        "mosque" -> listOf("[amenity=place_of_worship][religion=muslim]")
        "restaurant" -> listOf("[amenity=restaurant]", "[amenity=fast_food]")
        "cafe" -> listOf("[amenity=cafe]")
        "market" -> listOf("[shop=supermarket]", "[shop=convenience]")
        "mechanic" -> listOf("[shop=car_repair]")
        "tires" -> listOf("[shop=tyres]", "[shop=car_repair]")
        "wash" -> listOf("[amenity=car_wash]")
        "police" -> listOf("[amenity=police]")
        "parking" -> listOf("[amenity=parking]")
        "hotel" -> listOf("[tourism=hotel]")
        else -> null
    }

    /** المكان متقرّب (٠٫٠١° ≈ ١ كم) — مابنبعتش مكانك بالظبط لسيرفر برّه. */
    fun round(v: Double): Double = (v * 100).roundToInt() / 100.0

    fun query(kindId: String, lat: Double, lng: Double, radiusM: Int = RADIUS_M): String? {
        val f = filters(kindId) ?: return null
        val a = round(lat); val o = round(lng)
        val parts = f.joinToString("") { "nwr$it(around:$radiusM,$a,$o);" }
        return "[out:json][timeout:15];($parts);out center 40;"
    }

    /** رد Overpass ⇒ أماكن (العقدة ليها lat/lon، والمبنى/المنطقة ليها center). الاسم العربى لو موجود. */
    fun parse(json: String, fallbackName: String): List<NearbyResult> {
        val els = JSONObject(json).optJSONArray("elements") ?: return emptyList()
        val out = ArrayList<NearbyResult>()
        for (i in 0 until els.length()) {
            val e = els.optJSONObject(i) ?: continue
            val c = e.optJSONObject("center")
            val lat = if (e.has("lat")) e.optDouble("lat") else c?.optDouble("lat") ?: continue
            val lng = if (e.has("lon")) e.optDouble("lon") else c?.optDouble("lon") ?: continue
            if (lat.isNaN() || lng.isNaN()) continue
            val t = e.optJSONObject("tags")
            val name = listOf("name:ar", "name", "brand", "operator").firstNotNullOfOrNull { k -> t?.optString(k)?.takeIf { it.isNotBlank() } } ?: fallbackName
            val phone = listOf("phone", "contact:phone", "contact:mobile", "mobile").firstNotNullOfOrNull { k -> t?.optString(k)?.takeIf { it.isNotBlank() } }
                ?.split(';')?.first()?.trim()   // أكتر من رقم مفصولين بـ; ⇒ الأول
            out += NearbyResult(name, lat, lng, phone)
        }
        return out
    }
}
