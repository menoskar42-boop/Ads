package com.oscardevs.oscardrive.logic

/**
 * أوامر صوتية قليلة وواضحة (مش محادثة) — عشان السواق مايتشتّتش. النص اللى جاى من التعرّف على
 * الكلام بيتنضّف (من غير تشكيل، أ/إ/آ = ا، ة = ه، ى = ي) وبعدين بندوّر على كلمات مفتاحية.
 */
sealed class Cmd {
    data class MarkHazard(val type: HazardType) : Cmd()
    object Park : Cmd()
    object FindCar : Cmd()
    object NearestFuel : Cmd()
    data class GoTo(val place: String) : Cmd()
    object OpenMap : Cmd()
    object Music : Cmd()
    object Emergency : Cmd()
    object Unknown : Cmd()
}

object VoiceCommands {
    private val TASHKEEL = Regex("[\\u064B-\\u0652\\u0640]")

    fun normalize(s: String): String = s.replace(TASHKEEL, "")
        .replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
        .replace('ة', 'ه').replace('ى', 'ي')
        .replace(Regex("\\s+"), " ").trim()

    private fun has(t: String, vararg words: String) = words.any { t.contains(it) }

    fun parse(raw: String): Cmd {
        val t = normalize(raw)
        if (t.isEmpty()) return Cmd.Unknown
        if (has(t, "طوارئ", "نجده", "الحقوني", "استغاثه")) return Cmd.Emergency
        if (has(t, "مطب")) return Cmd.MarkHazard(HazardType.BUMP)
        if (has(t, "حفره", "حفر ", "نقره")) return Cmd.MarkHazard(HazardType.POTHOLE)
        if (has(t, "رادار")) return Cmd.MarkHazard(HazardType.RADAR)
        if (has(t, "خطر", "خطير")) return Cmd.MarkHazard(HazardType.DANGER)
        if (has(t, "بنزين", "محطه وقود", "تفويل", "فول")) return Cmd.NearestFuel
        if (has(t, "فين العربيه", "العربيه فين", "مكان العربيه", "ركنت فين", "وصلني للعربيه")) return Cmd.FindCar
        if (has(t, "ركنت", "اركن", "ركن هنا", "سجل الركنه")) return Cmd.Park
        if (has(t, "موسيقي", "اغاني", "اغنيه", "شغل حاجه")) return Cmd.Music
        val go = Regex("(?:وصلني|روحني|خدني|وديني)\\s+(.+)").find(t)
        if (go != null) {
            val place = placeOf(go.groupValues[1])
            if (place.isNotEmpty()) return Cmd.GoTo(place)
        }
        if (has(t, "البيت")) return Cmd.GoTo("البيت")
        if (has(t, "الشغل")) return Cmd.GoTo("الشغل")
        if (has(t, "خريطه", "الملاحه", "ماب")) return Cmd.OpenMap
        return Cmd.Unknown
    }

    /** «للبيت» = البيت · «لمحطة مصر» = محطة مصر · «على الشغل» = الشغل */
    fun placeOf(rest: String): String {
        var r = rest.trim()
        for (p in listOf("على ", "علي ", "الي ", "لحد ")) if (r.startsWith(p)) r = r.removePrefix(p).trim()
        r = when {
            r.startsWith("لل") -> "ال" + r.substring(2)
            r.startsWith("ل") && r.length > 2 -> r.substring(1)
            else -> r
        }
        return r.trim()
    }

    /** اللى التطبيق بيقوله بعد الأمر — تأكيد قصير. */
    fun reply(c: Cmd): String = when (c) {
        is Cmd.MarkHazard -> "تمام، سجّلت ${c.type.ar} هنا"
        Cmd.Park -> "تمام، حفظت مكان الركنة"
        Cmd.FindCar -> "هوديك لمكان العربية"
        Cmd.NearestFuel -> "بدوّر على أقرب بنزينة"
        is Cmd.GoTo -> "هوديك ${c.place}"
        Cmd.OpenMap -> "فتحت الخريطة"
        Cmd.Music -> "بشغّل الأغانى"
        Cmd.Emergency -> "أكّد على الشاشة عشان أبعت مكانك"
        Cmd.Unknown -> "مافهمتش. قول مثلاً: سجّل مطب، أو ركنت هنا"
    }
}
