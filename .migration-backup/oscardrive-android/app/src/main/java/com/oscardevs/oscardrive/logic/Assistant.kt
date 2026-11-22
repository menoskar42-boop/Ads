package com.oscardevs.oscardrive.logic

import java.util.Calendar
import java.util.TimeZone
import kotlin.math.roundToInt

/*
 * المرحلة ٥ من خطة Oscar Drive (المالك ٢٠٢٦-١١-١٠: «كمل المرحله الخامسه») — بنود ٢٠ و٢١ وبند ١٦ §٨–١٠:
 * أوسكار يفتح ويقفل التطبيقات · الصوت والموسيقى · سبوتيفاى/يوتيوب من جوّه تطبيقاتهم · مؤقّت وساعة إيقاف ·
 * تذكيرات (بوقت أو «لما أوصل البيت») ومهام وملاحظات · الطقس · رسالة واتساب مكتوبة بالصوت (إنت تدوس إرسال).
 * كله قواعد ثابتة من غير AI — Kotlin صافى بيتختبر على الكمبيوتر.
 */

/* ───────── التطبيقات ───────── */

data class InstalledApp(val label: String, val pkg: String)

object AppNames {
    /** أسماء بتتقال بالعربى ⇐ الاسم الإنجليزى (اللى غالباً اسم التطبيق على الشاشة). */
    val ALIASES: Map<String, String> = mapOf(
        "يوتيوب" to "youtube", "اليوتيوب" to "youtube", "يوتوب" to "youtube",
        "سبوتيفاي" to "spotify", "سبوتفاي" to "spotify", "سبوتي فاي" to "spotify",
        "انغامي" to "anghami", "أنغامي" to "anghami",
        "شات جي بي تي" to "chatgpt", "تشات جي بي تي" to "chatgpt", "شات جبت" to "chatgpt", "chat gpt" to "chatgpt",
        "شات جي بي تي فويس" to "chatgpt", "chatgpt voice" to "chatgpt", "كلود فويس" to "claude",
        "كلود" to "claude", "جيميناي" to "gemini", "جيمناي" to "gemini",
        "واتساب" to "whatsapp", "واتس" to "whatsapp", "الواتس" to "whatsapp", "واتس اب" to "whatsapp",
        "فيسبوك" to "facebook", "الفيس" to "facebook", "ماسنجر" to "messenger", "انستجرام" to "instagram", "انستا" to "instagram",
        "تيك توك" to "tiktok", "تيكتوك" to "tiktok", "تليجرام" to "telegram", "نتفليكس" to "netflix", "شاهد" to "shahid",
        "خرايط جوجل" to "maps", "خرائط جوجل" to "maps", "الخرايط" to "maps", "جوجل مابس" to "maps", "ويز" to "waze",
        "كروم" to "chrome", "المتصفح" to "chrome", "الراديو" to "radio", "الموسيقي" to "music", "البلوتوث" to "bluetooth",
        "الكاميرا" to "camera", "الاعدادات" to "settings", "ساوند كلاود" to "soundcloud", "اوبر" to "uber", "كريم" to "careem",
    )

    private fun clean(s: String) = VoiceEngine.normalize(s).replace(" ", "")

    /**
     * أقرب تطبيقات للاسم اللى اتقال (عربى أو إنجليزى، قريب مش حرفى). درجة ٠..١، الأعلى الأول.
     * الواحد بيكسب لو أعلى من التانى بفرق واضح — غير كده الشاشة تسأل.
     */
    fun match(spoken: String, apps: List<InstalledApp>): List<Pair<InstalledApp, Double>> {
        val raw = VoiceEngine.normalize(spoken).removePrefix("تطبيق ").removePrefix("برنامج ").removePrefix("app ").trim()
        if (raw.isBlank()) return emptyList()
        val wants = listOfNotNull(raw, ALIASES[raw] ?: ALIASES.entries.firstOrNull { VoiceEngine.normalize(it.key) == raw }?.value)
            .map { clean(it) }.distinct()
        return apps.map { a ->
            val l = clean(a.label)
            val p = a.pkg.lowercase()
            val s = wants.maxOf { w ->
                when {
                    l == w -> 1.0
                    l.startsWith(w) || w.startsWith(l) && l.length >= 3 -> 0.92
                    l.contains(w) && w.length >= 4 -> 0.85
                    p.contains(w) && w.length >= 4 -> 0.8
                    else -> EgyptWords.similarity(l, w)
                }
            }
            a to s
        }.filter { it.second >= 0.7 }.sortedByDescending { it.second }
    }

    /** واحد واضح ⇒ هو · أكتر من واحد قريبين ⇒ null (اسأل). */
    fun clearWinner(m: List<Pair<InstalledApp, Double>>): InstalledApp? = when {
        m.isEmpty() -> null
        m.size == 1 -> m[0].first
        m[0].second - m[1].second >= 0.07 -> m[0].first
        else -> null
    }
}

/**
 * الكلام الحر (نص الرسالة · نص التذكير) لازم يفضل **زى ما اتقال** (همزة وتشكيل وأرقام) — المطابقة بتتعمل على
 * النص المتنضّف، وبعدها بناخد نفس عدد الكلمات من آخر الكلام الأصلى.
 */
object FreeText {
    fun tail(raw: String, normalizedTail: String): String {
        val k = normalizedTail.trim().split(' ').count { it.isNotBlank() }
        if (k == 0) return ""
        val words = raw.trim().split(Regex("\\s+")).filter { VoiceEngine.normalize(it).isNotBlank() }
        return if (k <= words.size) words.takeLast(k).joinToString(" ") else normalizedTail.trim()
    }
}

/* ───────── الأرقام والوقت بالكلام ───────── */

object SpokenNumbers {
    private val WORDS = mapOf(
        "واحد" to 1, "واحده" to 1, "اتنين" to 2, "اثنين" to 2, "تلاته" to 3, "ثلاثه" to 3, "تلات" to 3, "اربعه" to 4, "اربع" to 4,
        "خمسه" to 5, "خمس" to 5, "سته" to 6, "ست" to 6, "سبعه" to 7, "سبع" to 7, "تمانيه" to 8, "ثمانيه" to 8, "تمن" to 8,
        "تسعه" to 9, "تسع" to 9, "عشره" to 10, "عشر" to 10, "حداشر" to 11, "اتناشر" to 12, "ربعتاشر" to 14, "خمستاشر" to 15,
        "عشرين" to 20, "تلاتين" to 30, "اربعين" to 40, "خمسين" to 50, "ستين" to 60,
        "one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5, "six" to 6, "seven" to 7, "eight" to 8, "nine" to 9, "ten" to 10,
        "fifteen" to 15, "twenty" to 20, "thirty" to 30, "forty" to 40, "fifty" to 50, "sixty" to 60,
    )

    /** أول رقم فى الكلام (أرقام أو كلام) — «خمس دقايق» ⇐ ٥ · «خمسه وعشرين» ⇐ ٢٥. */
    fun first(text: String): Int? {
        val t = VoiceEngine.normalize(text)
        Regex("\\d+").find(t)?.let { return it.value.toInt() }
        var total = 0; var seen = false
        for (w in t.split(' ')) {
            val v = WORDS[w] ?: WORDS[w.removePrefix("و")]
            if (v != null) { total += v; seen = true } else if (seen) break
        }
        return total.takeIf { seen }
    }

    /** مدة بالدقايق: «ربع ساعه» ١٥ · «نص ساعه» ٣٠ · «ساعه» ٦٠ · «ساعتين» ١٢٠ · «١٠ دقايق» ١٠ · "5 minutes" ٥. */
    fun minutes(text: String): Int? {
        val t = " " + VoiceEngine.normalize(text) + " "
        if (t.contains(" ربع ساعه")) return 15
        if (t.contains(" نص ساعه") || t.contains("half an hour")) return 30
        if (t.contains(" ساعتين")) return 120
        if (t.contains(" دقيقتين")) return 2
        val n = first(t)
        val isHour = Regex(" (?:ساعه|ساعات|hour|hours) ").containsMatchIn(t)
        val isMin = Regex(" (?:دقيقه|دقايق|دقائق|minute|minutes|min) ").containsMatchIn(t)
        return when {
            n != null && isHour && !isMin -> n * 60
            n != null -> n
            isHour -> 60
            else -> null
        }
    }
}

/* ───────── التذكيرات والمهام والملاحظات ───────── */

enum class NoteKind { REMIND, TASK, NOTE }

/** «فكرنى لما أوصل البيت أجيب الطلبات» ⇐ (تذكير · «أجيب الطلبات» · عند «البيت»). */
data class NoteAction(val kind: NoteKind, val text: String, val dueMs: Long? = null, val place: String? = null)

object NoteVoice {
    private var raw = ""
    /** نص التذكير زى ما اتقال (من غير «إن»/«to» فى أوله). */
    private fun tidy(s: String): String {
        val n = s.trim().removePrefix("ان ").removePrefix("اني ").removePrefix("to ").trim()
        return FreeText.tail(raw, n)
    }

    fun parse(text: String, nowMs: Long, tz: TimeZone = TimeZone.getDefault()): NoteAction? {
        raw = text
        val t = VoiceEngine.normalize(text)
        // مهمة / ملاحظة
        Regex("^(?:ضيف |سجل |اكتب )?(?:مهمه|task|add (?:a )?task)\\s+(.+)$").find(t)?.let { return NoteAction(NoteKind.TASK, tidy(it.groupValues[1])) }
        Regex("^(?:سجل |اكتب |خد )?(?:ملاحظه|note|take (?:a )?note)\\s+(.+)$").find(t)?.let { return NoteAction(NoteKind.NOTE, tidy(it.groupValues[1])) }
        if (!(t.startsWith("فكرني") || t.startsWith("remind me") || t.startsWith("ذكرني"))) return null
        val body = t.removePrefix("فكرني").removePrefix("ذكرني").removePrefix("remind me").trim()
        // بالمكان: «لما اوصل البيت …» · «وانا راجع البيت …» · «when i get home …»
        Regex("^(?:لما (?:اوصل|اروح|ارجع)|وانا (?:راجع|رايح)|اول ما اوصل)\\s+((?:علي |الي )?\\S+)\\s+(.+)$").find(body)?.let {
            return NoteAction(NoteKind.REMIND, tidy(it.groupValues[2]), place = VoiceCommands.placeOf(it.groupValues[1]))
        }
        Regex("^when i (?:get|arrive|reach) (?:to )?(home|work|\\S+)\\s+(.+)$").find(body)?.let {
            val p = when (it.groupValues[1]) { "home" -> "البيت"; "work" -> "الشغل"; else -> it.groupValues[1] }
            return NoteAction(NoteKind.REMIND, tidy(it.groupValues[2]), place = p)
        }
        // بعد مدة: «بعد ١٠ دقايق …» · «in 10 minutes to …»
        Regex("^(?:بعد|in)\\s+(.+?(?:دقيقه|دقايق|دقائق|دقيقتين|ساعه|ساعتين|ساعات|minutes|minute|hours|hour))\\s+(.+)$").find(body)?.let {
            val m = SpokenNumbers.minutes(it.groupValues[1]) ?: return null
            return NoteAction(NoteKind.REMIND, tidy(it.groupValues[2]), dueMs = nowMs + m * 60_000L)
        }
        // الساعة: «الساعه ٥ …» · «الساعه ٥ ونص العصر …» · «at 5 pm …»
        Regex("^(?:الساعه|at)\\s+(\\d{1,2})(?:[:.](\\d{2}))?\\s*(ونص|وربع|الا ربع)?\\s*(الصبح|صباحا|ص|الضهر|العصر|المغرب|بالليل|مساء|م|am|pm)?\\s+(.+)$").find(body)?.let {
            val h = it.groupValues[1].toInt(); val mm = it.groupValues[2].toIntOrNull() ?: 0
            val add = when (it.groupValues[3]) { "ونص" -> 30; "وربع" -> 15; "الا ربع" -> -15; else -> 0 }
            val part = it.groupValues[4]
            val due = nextTime(nowMs, h, mm + add, part, tz) ?: return null
            return NoteAction(NoteKind.REMIND, tidy(it.groupValues[5]), dueMs = due)
        }
        // من غير وقت ولا مكان ⇒ مهمة (تتقال لما تسأل «المهام»)
        return body.takeIf { it.isNotBlank() }?.let { NoteAction(NoteKind.TASK, tidy(it)) }
    }

    /** أقرب وقت جاى للساعة دى (٥ ⇐ ٥ الصبح أو ٥ العصر، اللى ييجى الأول — إلا لو اتقال الصبح/بالليل). */
    fun nextTime(nowMs: Long, h: Int, m: Int, part: String, tz: TimeZone = TimeZone.getDefault()): Long? {
        if (h !in 0..23) return null
        val am = part in setOf("الصبح", "صباحا", "ص", "am")
        val pm = part in setOf("الضهر", "العصر", "المغرب", "بالليل", "مساء", "م", "pm")
        val hours = when {
            h > 12 -> listOf(h)
            am -> listOf(if (h == 12) 0 else h)
            pm -> listOf(if (h == 12) 12 else h + 12)
            else -> listOf(h % 12, h % 12 + 12)
        }
        val now = Calendar.getInstance(tz).apply { timeInMillis = nowMs }
        return hours.flatMap { hh ->
            (0..1).map { d ->
                (now.clone() as Calendar).apply {
                    add(Calendar.DAY_OF_YEAR, d); set(Calendar.HOUR_OF_DAY, hh); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                    add(Calendar.MINUTE, m)
                }.timeInMillis
            }
        }.filter { it > nowMs }.minOrNull()
    }
}

/** تذكير محفوظ: بوقت أو بمكان (إحداثيات المكان المحفوظ). */
data class Reminder(val id: Long, val text: String, val dueMs: Long?, val lat: Double?, val lng: Double?, val placeName: String?, val done: Boolean)

object Reminders {
    const val ARRIVE_M = 250.0

    fun dueByTime(list: List<Reminder>, nowMs: Long): List<Reminder> = list.filter { !it.done && it.dueMs != null && it.dueMs <= nowMs }

    /** «لما أوصل البيت»: قرّبت من المكان (≤ ٢٥٠ م). */
    fun dueByPlace(list: List<Reminder>, lat: Double, lng: Double): List<Reminder> = list.filter {
        !it.done && it.lat != null && it.lng != null && Geo.distanceM(lat, lng, it.lat, it.lng) <= ARRIVE_M
    }
}

/* ───────── المؤقّت وساعة الإيقاف ───────── */

object TimerVoice {
    /** «مؤقت ١٠ دقايق» · «تايمر ربع ساعه» · "set a timer for 5 minutes" ⇐ دقايق. */
    fun minutes(text: String): Int? = SpokenNumbers.minutes(text)?.takeIf { it in 1..600 }

    fun clock(ms: Long): String {
        val s = (ms / 1000).coerceAtLeast(0)
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }
}

/* ───────── واتساب: رسالة مكتوبة بالصوت ───────── */

data class OscarContact(val id: Long, val name: String, val phone: String)

/** «ابعت لأحمد واتساب أنا جاى فى الطريق» ⇐ (أحمد · «أنا جاى فى الطريق»). */
data class WaAction(val name: String, val text: String)

object WaVoice {
    fun parse(text: String): WaAction? {
        val t = VoiceEngine.normalize(text)
        val patterns = listOf(
            Regex("^(?:ابعت|ارسل|بعت)\\s+(?:رساله\\s+)?(?:ل|لـ)\\s*(\\S+(?:\\s\\S+)?)\\s+(?:علي\\s+)?(?:الواتس|واتساب|الواتساب|واتس)\\s+(?:ان |وقوله |قوله |بيقول )?(.+)$"),
            Regex("^(?:ابعت|ارسل|بعت)\\s+(?:الواتس|واتساب|الواتساب|واتس|رساله)\\s+(?:ل|لـ)\\s*(\\S+)\\s+(?:ان |وقوله |قوله )?(.+)$"),
            Regex("^send (?:a )?(?:whatsapp|message) to (.+?) (?:saying|that) (.+)$"),
            Regex("^send (?:a )?(?:whatsapp|message) to (\\S+) (.+)$"),
        )
        for (r in patterns) r.find(t)?.let { return WaAction(it.groupValues[1].trim(), FreeText.tail(text, it.groupValues[2])) }
        return null
    }

    /** أقرب جهة من «جهات أوسكار» للاسم اللى اتقال (عربى/إنجليزى، قريب). */
    fun contact(name: String, list: List<OscarContact>): OscarContact? {
        val n = VoiceEngine.normalize(name).removePrefix("ل")
        return list.map { c ->
            val cn = VoiceEngine.normalize(c.name)
            c to maxOf(EgyptWords.similarity(cn, n), if (cn.startsWith(n) || n.startsWith(cn)) 0.9 else 0.0,
                cn.split(' ').maxOf { EgyptWords.similarity(it, n) })
        }.filter { it.second >= 0.75 }.maxByOrNull { it.second }?.first
    }
}

object EgyptPhone {
    /** رقم بالشكل اللى واتساب عايزه (كود الدولة من غير +): «01012345678» ⇐ «201012345678». null لو مش رقم. */
    fun forWhatsApp(raw: String): String? {
        var d = raw.filter { it.isDigit() || it in "٠١٢٣٤٥٦٧٨٩" }.map { c -> val i = "٠١٢٣٤٥٦٧٨٩".indexOf(c); if (i >= 0) ('0' + i) else c }.joinToString("")
        if (d.startsWith("00")) d = d.drop(2)
        if (d.startsWith("01") && d.length == 11) d = "2$d"
        return d.takeIf { it.length in 10..15 }
    }
}

/* ───────── الطقس (Open-Meteo — مجانى من غير مفتاح) ───────── */

data class WeatherNow(val tempC: Double, val code: Int, val windKmh: Double?, val maxC: Double?, val minC: Double?, val rainChance: Int?)

object Weather {
    /** رموز WMO ⇐ كلام. */
    fun describe(code: Int): String = when (code) {
        0 -> "صحو"; 1 -> "صحو غالباً"; 2 -> "فيه شوية سحاب"; 3 -> "مغيّم"
        45, 48 -> "شبورة — خلّى بالك والسواقة على مهلك"
        51, 53, 55, 56, 57 -> "رذاذ"; 61, 63, 66 -> "مطر"; 65, 67 -> "مطر جامد"; 80, 81 -> "زخات مطر"; 82 -> "زخات مطر جامدة"
        71, 73, 75, 77, 85, 86 -> "تلج"; 95, 96, 99 -> "عواصف رعدية"
        else -> "الجو متغيّر"
    }

    fun say(w: WeatherNow): String {
        val parts = mutableListOf("دلوقتى ${w.tempC.roundToInt()} درجة و${describe(w.code)}")
        if (w.maxC != null && w.minC != null) parts += "العظمى النهارده ${w.maxC.roundToInt()} والصغرى ${w.minC.roundToInt()}"
        w.rainChance?.let { if (it >= 30) parts += "احتمال مطر $it٪" }
        w.windKmh?.let { if (it >= 35) parts += "ورياح ${it.roundToInt()} كم/س" }
        return parts.joinToString("، ")
    }

    /** الإحداثيات بتتقرّب لـ٠٫٠١ (~١ كم) قبل ما تتبعت — مش مكانك بالظبط. */
    fun url(lat: Double, lng: Double): String =
        "https://api.open-meteo.com/v1/forecast?latitude=${"%.2f".format(java.util.Locale.US, lat)}&longitude=${"%.2f".format(java.util.Locale.US, lng)}" +
            "&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1"
}
