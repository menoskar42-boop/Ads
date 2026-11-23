package com.oscardevs.oscardrive.logic

/**
 * «Oscar Voice» (المالك ٢٠٢٦-١١-٠٥): أوامر صوتية ثابتة زى «سيرى» زمان — من غير أى ذكاء اصطناعى.
 * الكلام بيتحوّل نص ببرنامج التعرّف اللى على الشاشة، وبعدين المطابقة هنا بقواعد ثابتة:
 *   • كل أمر ليه ID ثابت وصيغ عربى وإنجليزى، والسواق يقدر يضيف صيغه هو أو يقفل الأمر — من غير تعديل كود.
 *   • اسم الاستدعاء («يا أوسكار» · «Hey Oscar»…) قابل للتغيير. «يا أوسكار وصلنى البيت» = استدعاء + أمر فى جملة واحدة.
 *   • الصيغة اللى فيها * بتاخد الباقى (وصلنى لـ* ⇒ المكان). ولو أكتر من صيغة طابقت، الأطول (الأدق) بتكسب.
 * Kotlin صافى — متختبر فى VoiceTest.
 */
data class VoiceCommand(
    val id: String,
    val title: String,
    val ar: List<String>,
    val en: List<String>,
    /** أمر حسّاس — بيطلب تأكيد على الشاشة (أو الرقم السرى). */
    val confirm: Boolean = false,
)

data class VoiceMatch(val command: VoiceCommand, val slot: String?, val phrase: String)

/**
 * نتيجة «الفهم الذكى» (المالك ٢٠٢٦-١١-٠٧): `sure` = اتفهم بالحرف أو بالقاموس ⇒ يتنفّذ على طول.
 * مش `sure` ⇒ أوسكار يسأل «تقصد …؟». `learn` = كلمات اتسمعت ⇐ الكلمة الصح (تتحفظ لو قلت «أيوه»).
 */
data class Understood(
    val match: VoiceMatch,
    val sure: Boolean,
    val heard: String,
    val learn: Map<String, String> = emptyMap(),
    val rawHeard: String = heard,
)

object VoiceCatalog {
    val ALL: List<VoiceCommand> = listOf(
        VoiceCommand("nav.open", "افتح الملاحة", listOf("افتح الملاحه", "افتح الخريطه", "شغل الخريطه", "شغل الملاحه", "الخريطه"), listOf("open navigation", "open maps", "open the map", "start navigation")),
        VoiceCommand("nav.home", "روح البيت", listOf("روح البيت", "وديني البيت", "وصلني البيت", "وصلني للبيت", "روحني"), listOf("go home", "take me home", "navigate home")),
        VoiceCommand("nav.work", "روح الشغل", listOf("روح الشغل", "وديني الشغل", "وصلني الشغل", "وصلني للشغل"), listOf("go to work", "take me to work")),
        VoiceCommand("nav.fuel", "أقرب بنزينة", listOf("اقرب بنزينه", "فين بنزينه", "عاوز بنزين", "محطه بنزين", "بنزينه"), listOf("nearest gas station", "find gas", "gas station", "i need fuel")),
        // البرومبت ٦: «هات محطات البنزين» = قايمة (مش الأقرب على طول) · «اتصل بالمكان ده» = رقم آخر مكان لقيته
        VoiceCommand("nav.fuel.list", "محطات البنزين", listOf("هات محطات البنزين", "محطات البنزين", "البنزينات اللي حواليا", "وريني البنزينات"),
            listOf("show gas stations", "list gas stations")),
        VoiceCommand("place.call", "اتصل بالمكان ده", listOf("اتصل بالمكان ده", "اتصل بالمكان", "كلم المكان ده", "اتصل بيهم", "رقم المكان ده"),
            listOf("call this place", "call them")),
        VoiceCommand("nav.goto", "وصّلنى لمكان", listOf("وصلني ل*", "وصلني *", "وديني *", "خدني *", "روح *"), listOf("navigate to *", "take me to *", "go to *", "drive to *")),
        VoiceCommand("car.find", "العربية فين", listOf("العربيه فين", "فين العربيه", "مكان العربيه", "ركنت فين", "عربيتي فين", "وصلني للعربيه", "وديني للعربيه"),
            listOf("where is my car", "find my car", "where did i park", "take me to my car")),
        // المرحلة ٤: العدّاد · الصيانة · البنزين بالصوت (التفاصيل بتتفهم من الجملة كلها: OdoVoice · MaintVoice · FuelVoice)
        VoiceCommand("car.odo", "عدّل العدّاد", listOf("خلي العداد *", "العداد *", "عدل العداد *", "عداد العربيه *"), listOf("set my odometer to *", "set odometer to *", "odometer *")),
        VoiceCommand("car.maint", "سجّل صيانة", listOf("غيرت *", "غيرنا *", "ركبت *"), listOf("i changed *", "changed *", "replaced *")),
        VoiceCommand("fuel.add", "سجّل تفويلة", listOf("حطيت *", "فولت *", "فولت", "حطيت بنزين"), listOf("i added *", "added *", "filled *", "i filled up")),
        VoiceCommand("fuel.left", "فاضل كام بنزين", listOf("فاضل كام بنزين", "البنزين فاضل كام", "فاضل بنزين قد ايه", "البنزين كام"), listOf("how much fuel", "fuel left", "how much gas is left")),
        VoiceCommand("maint.next", "فاضل كام على الزيت", listOf("فاضل كام علي الزيت", "فاضل كام علي تغيير الزيت", "الصيانه الجايه", "ميعاد الزيت"), listOf("when is my oil change", "next service", "next oil change")),
        VoiceCommand("park.save", "احفظ مكان الركنة", listOf("ركنت هنا", "احفظ مكان العربيه", "احفظ الركنه", "سجل الركنه", "انا ركنت", "ركنا هنا", "ركنت العربيه"), listOf("save parking", "i parked here", "save my parking")),
        // «سجّل مطب هنا» اتسمعت «يا اوس سجل مطعمنا»؛ النداء مطلوب من MainActivity قبل تنفيذ الأمر.
        VoiceCommand("road.bump", "سجّل مطب", listOf("سجل مطب", "فيه مطب", "مطب هنا", "مطب", "سجل مطعمنا", "سجل مطعمنا هنا"),
            listOf("mark bump", "speed bump", "mark a speed bump", "bump here")),
        VoiceCommand("road.pothole", "سجّل حفرة", listOf("سجل حفره", "فيه حفره", "حفره هنا", "حفره"), listOf("mark pothole", "pothole here", "pothole")),
        // «مطب اتجاه واحد» (البرومبت ٥): الصيغة الأطول بتكسب «مطب» — و«سجّل مطب» لوحدها = اتجاهين زى الأول
        VoiceCommand("road.bump1", "سجّل مطب اتجاه واحد", listOf("سجل مطب اتجاه واحد", "مطب اتجاه واحد", "مطب في اتجاه واحد", "سجل مطب في اتجاه واحد"),
            listOf("mark a one way bump", "one way bump")),
        VoiceCommand("road.pothole1", "سجّل حفرة اتجاه واحد", listOf("سجل حفره اتجاه واحد", "حفره اتجاه واحد", "حفره في اتجاه واحد"),
            listOf("mark a one way pothole", "one way pothole")),
        VoiceCommand("road.radar", "سجّل رادار", listOf("سجل رادار", "فيه رادار", "رادار هنا", "رادار"), listOf("mark radar", "speed camera", "radar here")),
        VoiceCommand("road.danger", "سجّل مكان خطر", listOf("مكان خطر", "سجل خطر", "خطر هنا"), listOf("danger here", "mark danger")),
        VoiceCommand("info.speed", "السرعة كام", listOf("السرعه كام", "ماشي كام", "انا ماشي كام", "سرعتي كام", "اعرض السرعه"), listOf("what's my speed", "what is my speed", "how fast am i going", "show my speed", "my speed")),
        VoiceCommand("info.trip", "الرحلة", listOf("الرحله", "اعرض الرحله", "مشينا قد ايه", "المسافه"), listOf("trip", "show trip", "how far did we drive")),
        VoiceCommand("info.limit", "غيّر حد السرعة", listOf("خلي الحد *", "الحد *", "حد السرعه *"), listOf("set limit to *", "speed limit *", "limit *")),
        VoiceCommand("sec.arm", "فعّل الحماية", listOf("فعل الحمايه", "شغل الحمايه", "شغل الامن", "وضع الحمايه"), listOf("arm security", "enable security mode", "enable security", "security on")),
        VoiceCommand("sec.disarm", "اقفل الحماية", listOf("اقفل الحمايه", "الغي الحمايه", "وقف الحمايه"), listOf("disarm security", "disable security", "security off"), confirm = true),
        VoiceCommand("sec.status", "حالة العربية", listOf("حاله العربيه", "الحمايه شغاله", "حاله الحمايه"), listOf("security status", "car status")),
        // «اوسكار اسكرين شوت» (المالك ٢٠٢٦-١١-١٨): صورة من الكاميرا للطريق — صور مطبات لتدريب الموديل (زرار «📸 صوّر الطريق» برضه)
        VoiceCommand("road.shot", "صوّر الطريق", listOf("اسكرين شوت", "سكرين شوت", "سكرينشوت", "خد صوره", "صور الطريق", "صوره للطريق", "صور المطب",
            "صورلي الطريق", "صور الشارع", "صوره للشارع", "صور قدامي", "خد لقطه"),
            listOf("screenshot", "take a screenshot", "take a picture", "take a photo")),
        VoiceCommand("sec.record", "سجّل فيديو", listOf("سجل فيديو", "صور ورا", "شغل الكاميرا", "سجل كاميرا"), listOf("record video", "start recording", "record camera")),
        VoiceCommand("media.music", "شغّل الأغانى", listOf("شغل موسيقي", "شغل اغاني", "شغل الاغاني", "موسيقي", "اغاني"), listOf("play music", "music", "play songs")),
        VoiceCommand("media.up", "علّى الصوت", listOf("علي الصوت", "ارفع الصوت", "زود الصوت"), listOf("volume up", "louder", "turn it up")),
        VoiceCommand("media.down", "وطّى الصوت", listOf("وطي الصوت", "اخفض الصوت", "قلل الصوت"), listOf("volume down", "quieter", "turn it down")),
        VoiceCommand("screen.drive", "ارجع للرئيسية", listOf("ارجع للرئيسيه", "الرئيسيه", "شاشه القياده", "القياده"), listOf("go back home screen", "main screen", "dashboard")),
        VoiceCommand("screen.settings", "افتح الإعدادات", listOf("افتح الاعدادات", "الاعدادات"), listOf("open settings", "settings")),
        VoiceCommand("screen.car", "افتح السيارة", listOf("افتح السياره", "الصيانه", "صيانه العربيه"), listOf("open car", "maintenance")),
        VoiceCommand("screen.road", "افتح الطريق", listOf("افتح الطريق", "ذاكره الطريق"), listOf("road memory", "open road")),
        VoiceCommand("screen.security", "افتح الحماية", listOf("افتح الحمايه", "شاشه الحمايه"), listOf("open security")),
        VoiceCommand("screen.parking", "افتح الركن", listOf("افتح الركن", "شاشه الركن"), listOf("open parking")),
        VoiceCommand("sys.night", "الوضع الليلى", listOf("الوضع الليلي", "ليلي"), listOf("night mode", "dark mode")),
        VoiceCommand("sys.day", "الوضع النهارى", listOf("الوضع النهاري", "نهاري"), listOf("day mode", "light mode")),
        // المرحلة ٥: التطبيقات · الصوت والموسيقى · سبوتيفاى/يوتيوب · المؤقّت · التذكيرات · الطقس · الطريق · الرسايل · واتساب
        VoiceCommand("app.open", "افتح تطبيق", listOf("افتح *", "افتحلي *", "شغل تطبيق *"), listOf("open *", "launch *")),
        VoiceCommand("app.close", "اقفل تطبيق", listOf("اقفل *", "سكر *"), listOf("close *")),
        VoiceCommand("sys.home", "الشاشة الرئيسية", listOf("الشاشه الرئيسيه", "روح للشاشه الرئيسيه", "اطلع برا"), listOf("home screen", "go to home screen")),
        VoiceCommand("media.mute", "اكتم الصوت", listOf("اكتم الصوت", "اقفل الصوت", "سكت الصوت", "اكتم"), listOf("mute", "mute sound")),
        VoiceCommand("media.unmute", "رجّع الصوت", listOf("رجع الصوت", "افتح الصوت"), listOf("unmute")),
        VoiceCommand("media.set", "خلّى الصوت", listOf("خلي الصوت *", "الصوت علي *"), listOf("set volume to *", "volume to *")),
        VoiceCommand("media.pause", "وقّف الأغانى", listOf("وقف الاغاني", "وقف الموسيقي", "وقف الاغنيه"), listOf("pause", "pause music", "stop music")),
        VoiceCommand("media.play", "كمّل الأغانى", listOf("كمل الاغاني", "كمل الاغنيه", "كمل الموسيقي"), listOf("resume", "resume music")),
        VoiceCommand("media.next", "الأغنية اللى بعدها", listOf("اللي بعده", "الاغنيه الجايه", "التراك الجاي", "اللي بعدها"), listOf("next song", "next track", "skip song")),
        VoiceCommand("media.prev", "الأغنية اللى قبلها", listOf("اللي قبله", "الاغنيه اللي فاتت", "اللي قبلها"), listOf("previous song", "previous track")),
        VoiceCommand("media.spotify", "شغّل على سبوتيفاى", listOf("شغل * علي سبوتيفاي", "شغل * من سبوتيفاي", "شغللي * علي سبوتيفاي"), listOf("play * on spotify")),
        VoiceCommand("yt.search", "دوّر فى يوتيوب", listOf("دور في يوتيوب علي *", "دور علي يوتيوب *", "دورلي في اليوتيوب علي *", "يوتيوب *"), listOf("search youtube for *", "youtube *")),
        VoiceCommand("timer.set", "مؤقّت", listOf("موقت *", "تايمر *", "اعمل موقت *", "اعملي موقت *"), listOf("set a timer for *", "set timer for *", "timer *")),
        VoiceCommand("timer.stop", "الغى المؤقّت", listOf("وقف الموقت", "الغي الموقت", "اقفل الموقت"), listOf("cancel timer", "stop timer", "cancel the timer")),
        VoiceCommand("sw.start", "ساعة الإيقاف", listOf("ابدا ساعه الايقاف", "شغل ساعه الايقاف"), listOf("start stopwatch", "start the stopwatch")),
        VoiceCommand("sw.stop", "وقّف ساعة الإيقاف", listOf("وقف ساعه الايقاف"), listOf("stop stopwatch", "stop the stopwatch")),
        VoiceCommand("note.remind", "فكّرنى", listOf("فكرني *", "ذكرني *"), listOf("remind me *")),
        VoiceCommand("note.add", "سجّل ملاحظة", listOf("سجل ملاحظه *", "اكتب ملاحظه *", "ملاحظه *"), listOf("take a note *", "note *")),
        VoiceCommand("task.add", "ضيف مهمة", listOf("ضيف مهمه *", "مهمه جديده *"), listOf("add a task *", "add task *")),
        VoiceCommand("notes.read", "اقرا المهام", listOf("اقرا المهام", "المهام", "ايه المهام", "اقرا الملاحظات", "التذكيرات"), listOf("read my tasks", "my tasks", "read my notes")),
        VoiceCommand("weather", "الطقس", listOf("الجو ايه", "الطقس", "حاله الجو", "الجو عامل ايه", "الطقس النهارده"), listOf("weather", "what is the weather", "how is the weather")),
        VoiceCommand("road.info", "إيه اللى قدامى", listOf("ايه اللي قدامي", "الطريق قدامي", "فيه ايه قدامي"), listOf("what is ahead", "what's ahead")),
        VoiceCommand("notif.read", "اقرا الرسايل", listOf("اقرا الاشعارات", "اقرا الرسايل", "ايه الرسايل", "اقرا الرسائل"), listOf("read notifications", "read my messages")),
        VoiceCommand(
            "messenger.send",
            "ابعت رسالة على Oscar Messaging",
            listOf(
                "ابعت رسالة", "ابعت رسالة *", "ابعتلي رسالة", "ابعتلي رسالة *",
                "ابعث رسالة", "ابعث رسالة *", "ابعثلي رسالة", "ابعثلي رسالة *",
                "ارسل رسالة", "ارسل رسالة *", "ارسلي رسالة", "ارسلي رسالة *",
                "ابعت مسج", "ابعت مسج *", "ابعت message", "ابعت message *",
                "send رسالة", "send رسالة *",
                "رسالة إلى *", "رساله الى *", "رسالة ل*", "رساله ل*",
                "مسج إلى *", "مسج الى *", "مسج ل*",
            ),
            listOf(
                "send a message", "send a message *", "send message", "send message *",
                "send a text", "send a text *", "send text", "send text *",
                "message to *", "text to *",
            ),
        ),
        VoiceCommand("wa.send", "ابعت واتساب", listOf("ابعت *", "ابعتلي *", "ارسل *"), listOf("send whatsapp *", "send a whatsapp *", "send a message *", "send message *")),
        VoiceCommand("time.now", "الساعة كام", listOf("الساعه كام", "الوقت كام"), listOf("what time is it")),
        // المرحلة ٦: الأماكن — «احفظ المكان ده باسم الجيم» · «أقرب صيدلية» (و«ودّينى الجيم» = nav.goto)
        VoiceCommand("place.save", "احفظ المكان ده باسم", listOf("احفظ المكان ده باسم *", "احفظ المكان باسم *", "احفظ مكاني باسم *", "احفظ هنا باسم *",
            "سمي المكان ده *", "احفظ المكان ده *", "سجل المكان ده باسم *"), listOf("save this place as *", "save this location as *", "save location as *", "save place as *")),
        VoiceCommand("nav.near", "أقرب …", listOf("اقرب *", "فين اقرب *", "عاوز اقرب *", "دورلي علي اقرب *", "وديني لاقرب *", "وصلني لاقرب *"),
            listOf("nearest *", "find the nearest *", "where is the nearest *", "take me to the nearest *")),
        // المرحلة ٧: سلوك القيادة
        VoiceCommand("drive.score", "سواقتى عاملة إزاى", listOf("سواقتي عامله ازاي", "درجه السواقه", "درجه الرحله", "تقييم السواقه", "انا سايق ازاي"),
            listOf("how is my driving", "driving score", "trip score")),
        VoiceCommand("emergency", "طوارئ", listOf("طوارئ", "نجده", "الحقوني", "استغاثه"), listOf("emergency", "help me", "sos"), confirm = true),
        VoiceCommand("help", "بتعرف تعمل إيه", listOf("بتعرف تعمل ايه", "تقدر تعمل ايه", "مساعده", "الاوامر"), listOf("what can you do", "help", "commands")),
        VoiceCommand("cancel", "خلاص", listOf("خلاص", "بس", "الغي", "ولا حاجه", "لا خلاص", "سيبك", "انسي", "الغيها", "متسجلش"), listOf("cancel", "stop", "never mind")),
    )

    val WAKE_DISTINCT = listOf(
        "اوسكار", "اسكار", "وسكار", "اوسكر", "اوزكار", "سكار", "اوسكو", "اسكو", "اوسك", "اوسكا",
        "اسكا", "اوزكر", "اوسقار", "اسقار", "عوسكار", "اوشكار", "oscar", "oskar", "oscars", "os car",
    )
    val WAKE_RESTRICTED = listOf(
        "اوس", "اوز", "اسكر", "اذكر", "اسك", "ازكر",
    )
    val WAKE_NEVER = listOf(
        "سكر", "السكر", "سكره", "سكري", "عسكر", "عسكري", "عسكريه", "اسكندر", "اسكندريه",
        "سكرتير", "سكرتيره", "سكوتر", "اسكان", "سكان", "مسكر", "مسكره", "اسكت", "اسكتي",
    )

    /** قائمة توافق لاسماء الاستدعاء المحفوظة؛ قواعد المطابقة الفعلية في VoiceEngine.afterWake. */
    val DEFAULT_WAKE = ((WAKE_DISTINCT + WAKE_RESTRICTED).flatMap { alias -> listOf("يا $alias", alias) } +
        listOf("hey oscar", "ok oscar", "okay oscar")).distinct()

    fun byId(id: String) = ALL.firstOrNull { it.id == id }
}

data class WakeNameChanges(val added: List<String>, val removed: List<String>)

/** حساب تغييرات أسماء الاستدعاء بشكل مستقل عن Android ليسهل اختبار ترحيل التفضيلات. */
object WakeNameSettings {
    private fun key(name: String) = VoiceEngine.normalize(name)

    fun migrate(defaults: List<String>, saved: List<String>): WakeNameChanges {
        val defaultKeys = defaults.map(::key).toSet()
        val added = saved.filter { key(it).isNotBlank() && key(it) !in defaultKeys }.distinctBy(::key)
        return WakeNameChanges(added, emptyList())
    }

    fun effective(defaults: List<String>, added: List<String>, removed: List<String>): List<String> {
        val removedKeys = removed.map(::key).toSet()
        val seen = mutableSetOf<String>()
        return (defaults + added).filter { name ->
            val normalized = key(name)
            normalized.isNotBlank() && normalized !in removedKeys && seen.add(normalized)
        }
    }

    fun add(defaults: List<String>, added: List<String>, removed: List<String>, name: String): WakeNameChanges {
        val normalized = key(name)
        if (normalized.isBlank()) return WakeNameChanges(added, removed)
        val defaultKeys = defaults.map(::key).toSet()
        if (normalized in defaultKeys) {
            return WakeNameChanges(added.filterNot { key(it) == normalized }, removed.filterNot { key(it) == normalized })
        }
        val nextAdded = if (added.any { key(it) == normalized }) added else added + name.trim()
        return WakeNameChanges(nextAdded, removed.filterNot { key(it) == normalized })
    }

    fun remove(defaults: List<String>, added: List<String>, removed: List<String>, name: String): WakeNameChanges {
        val normalized = key(name)
        if (normalized.isBlank()) return WakeNameChanges(added, removed)
        if (defaults.any { key(it) == normalized }) {
            val defaultName = defaults.first { key(it) == normalized }
            val nextRemoved = if (removed.any { key(it) == normalized }) removed else removed + defaultName
            return WakeNameChanges(added.filterNot { key(it) == normalized }, nextRemoved)
        }
        return WakeNameChanges(added.filterNot { key(it) == normalized }, removed.filterNot { key(it) == normalized })
    }
}

class VoiceEngine(
    /** صيغ السواق الزيادة لكل أمر. */
    private val custom: Map<String, List<String>> = emptyMap(),
    /** أوامر مقفولة. */
    private val disabled: Set<String> = emptySet(),
    wakeNames: List<String> = VoiceCatalog.DEFAULT_WAKE,
    /** كلمات السواق علّمها لأوسكار («قلت مطب مش مطلب») — بتتقدّم على القاموس. */
    private val learned: Map<String, String> = emptyMap(),
) {
    private val wakes = wakeNames.map { normalize(it) }.filter { it.isNotBlank() }.distinct()
    private val wakePrefixes = listOf("يا", "هاي", "hey", "ok", "okay")
    private val standardWakePhrases = (VoiceCatalog.WAKE_DISTINCT + VoiceCatalog.WAKE_RESTRICTED)
        .flatMap { alias -> listOf(alias) + wakePrefixes.map { "$it $alias" } }.toSet()
    private val activeDistinctWakes = VoiceCatalog.WAKE_DISTINCT.map(::normalize).filter { alias ->
        alias in wakes || wakePrefixes.any { "$it $alias" in wakes }
    }
    private val activeRestrictedWakes = VoiceCatalog.WAKE_RESTRICTED.map(::normalize).filter { alias ->
        alias in wakes || wakePrefixes.any { "$it $alias" in wakes }
    }
    private val neverWakeAliases = VoiceCatalog.WAKE_NEVER.map(::normalize).toSet()
    private val customWakes = wakes.filterNot { it in standardWakePhrases }.sortedByDescending { it.length }
    var lastWakeFuzzyAlias: String? = null
        private set

    private fun levenshteinDistance(a: String, b: String): Int {
        var previous = IntArray(b.length + 1) { it }
        for (i in 1..a.length) {
            val current = IntArray(b.length + 1)
            current[0] = i
            for (j in 1..b.length) {
                current[j] = minOf(
                    current[j - 1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1,
                )
            }
            previous = current
        }
        return previous[b.length]
    }

    /** النص بعد الاستدعاء — أو null لو مفيش اسم استدعاء فى الكلام. */
    fun afterWake(text: String): String? {
        lastWakeFuzzyAlias = null
        val t = normalize(text)
        data class Hit(val start: Int, val end: Int)
        val hits = mutableListOf<Hit>()
        fun add(phrase: String) {
            val i = indexOfWords(t, phrase)
            if (i >= 0) hits += Hit(i, i + phrase.length)
        }
        for (alias in activeDistinctWakes) {
            if (alias in wakes) {
                add(alias)
                wakePrefixes.forEach { add("$it $alias") }
            } else {
                wakePrefixes.filter { "$it $alias" in wakes }.forEach { add("$it $alias") }
            }
        }
        for (alias in activeRestrictedWakes) {
            if (alias in wakes && (t == alias || t.startsWith("$alias "))) hits += Hit(0, alias.length)
            if (alias in wakes || "يا $alias" in wakes) add("يا $alias")
        }
        customWakes.forEach(::add)
        val hit = hits.minWithOrNull(compareBy<Hit> { it.start }.thenByDescending { it.end })
        if (hit != null) return t.substring(hit.end).trim()

        val words = t.split(' ').filter { it.isNotBlank() }
        if (words.isEmpty()) return null
        val candidateIndex = if (words.first() in wakePrefixes) 1 else 0
        val candidate = words.getOrNull(candidateIndex) ?: return null
        if (candidate.length < 4 || candidate.startsWith("ال") || candidate in neverWakeAliases) return null
        val alias = activeDistinctWakes.firstOrNull { wake ->
            wake.length >= 5 && ' ' !in wake && levenshteinDistance(candidate, wake) <= 1
        } ?: return null
        val rest = words.drop(candidateIndex + 1).joinToString(" ")
        if (candidate == "اسكور" && rest.isEmpty()) return null
        if (rest.isNotEmpty() && match(rest) == null) return null
        lastWakeFuzzyAlias = alias
        return rest
    }

    fun match(text: String): VoiceMatch? {
        val t = normalize(text)
        if (t.isBlank()) return null
        var best: VoiceMatch? = null
        var bestScore = -1
        for (c in VoiceCatalog.ALL) {
            if (c.id in disabled) continue
            for (raw in c.ar + c.en + custom[c.id].orEmpty()) {
                val p = normalize(raw.replace("*", " * ")).replace(" * ", "*").replace(" *", "*").replace("* ", "*").trim()
                if (p.isBlank()) continue
                val m = if (p.contains("*")) slotMatch(t, p) else if (indexOfWords(t, p) >= 0) "" else null
                if (m != null) {
                    val slot = m.takeIf { p.contains("*") }?.trim()?.takeIf { it.isNotEmpty() }
                    if (p.contains("*") && slot == null) continue
                    // صيغة ثابتة طابقت تغلب أى صيغة فيها * («وصلني لاقرب بنزينه» = بنزينة مش «وصلنى لمكان»)
                    val score = p.replace("*", "").length + if (p.contains("*")) 0 else 1000
                    if (best == null || score > bestScore) { best = VoiceMatch(c, slot, p); bestScore = score }
                }
            }
        }
        return best
    }

    /**
     * زى `match` بس بيفهم الكلام حتى لو اتسمع غلط — بالترتيب:
     *  ١) بالحرف ⇒ متأكد · ٢) بعد تصحيح الكلمات (اللى علّمته + قاموس مصرى) ⇒ متأكد ·
     *  ٣) أقرب أمر (كل كلمة قريبة من كلمة الأمر) ⇒ **مش متأكد** ⇐ يسأل.
     * الجزء الحر (اسم المكان · الرقم) بيرجع زى ما اتقال من غير تصحيح.
     */
    fun understand(text: String): Understood? {
        val t = normalize(text)
        if (t.isBlank()) return null
        val exact = match(t)
        // صيغة ثابتة بالحرف ⇒ خلاص. صيغة عامة (افتح * · ابعت *) ⇒ نشوف الأول لو التصحيح بيدّى أمر ثابت أدق
        // («افتح الملاحا» = افتح الملاحة مش تطبيق اسمه «الملاحا»).
        if (exact != null && !exact.phrase.contains("*")) return Understood(exact, true, t)
        val raw = t.split(' ')
        val fixed = raw.map { w -> learned[w] ?: EgyptWords.FIX_N[w] ?: w }
        val variants = mutableListOf<List<String>>()
        if (fixed != raw) variants += fixed
        // عربى وإنجليزى مخلوطين ⇒ كلمات الأوامر الإنجليزى بالعربى (لو الجملة فيها عربى)
        if (fixed.any { w -> w.any { it in '\u0600'..'\u06FF' } }) {
            val mixed = fixed.map { EgyptWords.MIXED[it] ?: it }
            if (mixed != fixed) variants += mixed
        }
        for (v in variants) match(v.joinToString(" "))?.let { if (!it.phrase.contains("*")) return Understood(keepRawSlot(it, raw), true, t) }
        if (exact != null) return Understood(exact, true, t)
        for (v in variants) match(v.joinToString(" "))?.let { return Understood(keepRawSlot(it, raw), true, t) }
        val f = fuzzy(fixed) ?: return null
        val learn = HashMap<String, String>()
        for ((heard, want) in f.second) if (heard != want) learn[raw[fixed.indexOf(heard).coerceAtLeast(0)]] = want
        return Understood(keepRawSlot(f.first, raw), false, t, learn)
    }

    /** الجزء الحر من الأمر ييجى من الكلام الأصلى مش المصحّح (عشان اسم مكان زى «المطلب» مايتغيّرش). */
    private fun keepRawSlot(m: VoiceMatch, raw: List<String>): VoiceMatch {
        val slot = m.slot ?: return m
        if (!m.phrase.endsWith("*")) return m
        val k = slot.split(' ').size
        return if (k <= raw.size) m.copy(slot = raw.takeLast(k).joinToString(" ")) else m
    }

    /** أقرب أمر: كل كلمة فى صيغة الأمر قريبة (≥ ٠٫٥) والمتوسط ≥ ٠٫٧٥. بيرجّع الأمر + (الكلمة اللى اتسمعت ⇐ كلمة الأمر). */
    private fun fuzzy(tokens: List<String>): Pair<VoiceMatch, List<Pair<String, String>>>? {
        var best: Pair<VoiceMatch, List<Pair<String, String>>>? = null
        var bestScore = 0.0
        for (c in VoiceCatalog.ALL) {
            if (c.id in disabled) continue
            for (rawP in c.ar + c.en + custom[c.id].orEmpty()) {
                val p = normalize(rawP.replace("*", " * ")).replace(" * ", "*").replace(" *", "*").replace("* ", "*").trim()
                if (p.isBlank()) continue
                val star = p.endsWith("*")
                if (p.contains("*") && !star) continue
                val pt = p.removeSuffix("*").trim().split(' ').filter { it.isNotEmpty() }
                if (pt.isEmpty() || pt.joinToString("").length < 3) continue
                // الصيغ اللى فيها مكان فاضى: لازم فى أول الكلام وبعدها كلام (الجزء الحر)
                val starts = if (star) listOf(0) else (0..tokens.size - pt.size).toList()
                for (i in starts) {
                    if (i < 0 || i + pt.size > tokens.size) continue
                    if (star && i + pt.size >= tokens.size) continue
                    val window = tokens.subList(i, i + pt.size)
                    val sims = window.indices.map { EgyptWords.similarity(window[it], pt[it]) }
                    if (sims.any { it < 0.5 }) continue
                    val score = sims.average()
                    if (score < 0.75 || score >= 1.0 && !star) continue
                    // الأطول (كلام أكتر اتطابق) بيكسب لو الدرجة قريبة
                    val ranked = score + pt.size * 0.01
                    if (ranked > bestScore) {
                        val slot = if (star) tokens.drop(i + pt.size).joinToString(" ") else null
                        best = VoiceMatch(c, slot, p) to window.indices.map { window[it] to pt[it] }
                        bestScore = ranked
                    }
                }
            }
        }
        return best
    }

    private fun slotMatch(t: String, p: String): String? {
        val prefix = p.substringBefore("*").trim()
        val suffix = p.substringAfter("*").trim()
        var rest = t
        if (prefix.isNotEmpty()) {
            // «وصلني ل*»: آخر كلمة فى البادئة حرف واحد (ل/ب) لازق فى اللى بعده ⇒ مانشترطش مسافة بعدها
            val attached = prefix.substringAfterLast(' ').length == 1
            var i = -1; var from = 0
            while (true) {
                val j = t.indexOf(prefix, from)
                if (j < 0) break
                val startOk = j == 0 || t[j - 1] == ' '
                val end = j + prefix.length
                val endOk = attached || end == t.length || t[end] == ' '
                if (startOk && endOk) { i = j; break }
                from = j + 1
            }
            if (i < 0) return null
            rest = t.substring(i + prefix.length)
        }
        if (suffix.isNotEmpty()) { val j = rest.lastIndexOf(suffix); if (j < 0) return null; rest = rest.substring(0, j) }
        return rest.trim()
    }

    companion object {
        private val TASHKEEL = Regex("[\\u064B-\\u0652\\u0640\\u0670]")
        private val PUNCT = Regex("[^\\p{L}\\p{N}\\s*]")
        private val AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"
        private val STRETCH = Regex("(\\p{L})\\1{2,}")

        fun normalize(s: String): String {
            var t = s.lowercase().replace(TASHKEEL, "")
            t = t.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')
                .replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي')
                .replace('ک', 'ك').replace('ی', 'ي').replace('ھ', 'ه')   // حروف فارسى بتطلع من بعض الكيبوردات/برامج التعرّف
            t = t.map { c -> val i = AR_DIGITS.indexOf(c); if (i >= 0) ('0' + i) else c }.joinToString("")
            t = t.replace("what's", "what is").replace(PUNCT, " ")
            t = t.replace(STRETCH, "$1")   // «مطبببب» · «سجلللل» (٣ حروف ورا بعض مفيش فى العربى) = حرف واحد
            return t.replace(Regex("\\s+"), " ").trim()
        }

        /** مكان العبارة فى النص على حدود الكلمات (مش جوه كلمة تانية) — أو -1. */
        fun indexOfWords(t: String, p: String): Int {
            var from = 0
            while (true) {
                val i = t.indexOf(p, from)
                if (i < 0) return -1
                val before = i == 0 || t[i - 1] == ' '
                val end = i + p.length
                val after = end == t.length || t[end] == ' '
                if (before && after) return i
                from = i + 1
            }
        }

        private val NUM_WORDS = mapOf(
            "عشرين" to 20, "تلاتين" to 30, "ثلاثين" to 30, "اربعين" to 40, "خمسين" to 50, "ستين" to 60, "سبعين" to 70,
            "تمانين" to 80, "ثمانين" to 80, "تسعين" to 90, "ميه" to 100, "مايه" to 100, "مية" to 100,
            "twenty" to 20, "thirty" to 30, "forty" to 40, "fifty" to 50, "sixty" to 60, "seventy" to 70,
            "eighty" to 80, "ninety" to 90, "hundred" to 100, "one hundred" to 100,
        )

        /** «مية وعشرين» = ١٢٠ · «80» = ٨٠ · «ninety» = ٩٠ — للحد. */
        fun number(slot: String?): Int? {
            val t = normalize(slot ?: return null)
            Regex("\\d{2,3}").find(t)?.let { return it.value.toInt() }
            var total = 0
            for (w in t.split(' ', 'و').filter { it.isNotBlank() }) {
                val v = NUM_WORDS[w] ?: NUM_WORDS[w.removePrefix("و")] ?: continue
                total += v
            }
            if (t.contains("one hundred") || t.contains("hundred")) { /* already counted */ }
            return total.takeIf { it > 0 }
        }
    }
}
