package com.oscardevs.oscardrive.logic

/**
 * رد الذكاء الاصطناعى (/api/car/intent — src/drive/intent.js) ⇒ أمر من الكتالوج (المالك ٢٠٢٦-١١-٢٠: «لازم ذكاء اصطناعى لما الكلام
 * يبقى غير مطابق لأى أمر»). بيتسأل «تقصد …؟» قبل التنفيذ زى أى فهم مش متأكد. الاتصال مش على الشاشة (من صفحة الموبايل).
 */
object AiIntent {
    private val IDS = mapOf(
        "bump" to "road.bump", "bump1" to "road.bump1", "pothole" to "road.pothole", "pothole1" to "road.pothole1",
        "radar" to "road.radar", "danger" to "road.danger", "shot" to "road.shot", "park" to "park.save", "findpark" to "car.find",
        "fuel" to "nav.fuel", "fuel_list" to "nav.fuel.list", "near" to "nav.near", "goto" to "nav.goto", "placecall" to "place.call",
        "fuelleft" to "fuel.left", "maint" to "maint.next", "speed" to "info.speed",
    )

    /** (id الأمر، الجزء الحر) أو null. «near» بياخد اسم النوع بالعربى («صيدلية») عشان يتفهم بنفس طريق «أقرب …». */
    fun toCommand(cmd: String?, arg: String?): Pair<String, String?>? {
        val id = IDS[cmd ?: return null] ?: return null
        val a = arg?.trim()?.takeIf { it.isNotEmpty() && it != "null" }
        return when (id) {
            "nav.near" -> Nearby.KINDS.firstOrNull { it.id == a }?.let { id to it.ar }
            "nav.goto" -> a?.let { id to it }
            else -> id to null
        }
    }
}
