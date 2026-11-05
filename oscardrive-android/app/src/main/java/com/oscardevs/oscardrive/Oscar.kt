package com.oscardevs.oscardrive

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * «Oscar Personality» (المالك ٢٠٢٦-١١-٠٥): أوسكار بيرد بجمل ثابتة اتعملت بصوت ذكاء اصطناعى **مرة واحدة**
 * (scripts/oscar-voice.js على السيرفر — زى ميزو فى برنامج الأطفال)، والشاشة بتنزّلها مرة وبتشغّلها من غير نت ولا AI.
 * الجمل نفسها فى assets/oscar_lines.json — لو صوتها لسه مانزلش، نفس الجملة بتتقال بصوت الشاشة (TextToSpeech).
 * والسواق يقدر يكتب جملته لحدث معيّن: السيرفر بيولّد صوتها مرة وبتتحفظ على الشاشة.
 */
object Oscar {
    private lateinit var app: Context
    private lateinit var prefs: Prefs
    private var lines: JSONObject = JSONObject()
    private var player: MediaPlayer? = null
    private val io = Executors.newSingleThreadExecutor()
    @Volatile var speakingUntil = 0L; private set
    @Volatile var packStatus: String = ""; private set

    fun init(ctx: Context) {
        if (::app.isInitialized) return
        app = ctx.applicationContext
        prefs = Prefs(app)
        lines = try { JSONObject(app.assets.open("oscar_lines.json").bufferedReader().use { it.readText() }).getJSONObject("lines") } catch (_: Exception) { JSONObject() }
    }

    val lang: String get() = if (prefs.voiceLang.startsWith("en")) "en" else "ar"
    fun ids(): List<String> = lines.keys().asSequence().toList()
    fun texts(id: String, l: String = lang): List<String> {
        val a: JSONArray = lines.optJSONObject(id)?.optJSONArray(l) ?: return emptyList()
        return (0 until a.length()).map { a.getString(it) }
    }

    private fun voiceDir(): File = File(app.filesDir, "voice/${prefs.oscarVoice}").also { it.mkdirs() }
    private fun customFile(id: String): File = File(app.filesDir, "voice/custom/${prefs.oscarVoice}-$lang-$id.mp3")

    /** أوسكار يقول جملة الحدث (عشوائى من صيغها). extra = كلام متغيّر بعدها (رقم السرعة مثلاً) بصوت الشاشة. */
    fun say(id: String, extra: String? = null) {
        if (!::app.isInitialized) return
        if (!prefs.oscarReplies) { if (extra != null) Speaker.say(extra); return }
        val custom = prefs.customLine(id, lang)
        val text = custom ?: texts(id).randomOrNull() ?: ""
        val file = if (custom != null) customFile(id).takeIf { it.exists() } else fileFor(text)
        speakingUntil = System.currentTimeMillis() + 2500 + (text.length + (extra?.length ?: 0)) * 80L
        if (file != null && file.exists()) play(file) { if (extra != null) Speaker.say(extra) }
        else Speaker.say(listOf(text, extra).filter { !it.isNullOrBlank() }.joinToString(". "))
    }

    /** كلام متغيّر بس (من غير جملة ثابتة) — بصوت الشاشة. */
    fun sayText(t: String) { speakingUntil = System.currentTimeMillis() + 1500 + t.length * 80L; Speaker.say(t) }

    private fun fileFor(text: String): File? {
        val name = prefs.voiceFiles(prefs.oscarVoice).optString(text, "")
        return if (name.isEmpty()) null else File(voiceDir(), name)
    }

    private fun play(f: File, after: () -> Unit) {
        try {
            player?.release()
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                setDataSource(f.absolutePath)
                setOnCompletionListener { it.release(); if (player === it) player = null; after() }
                prepare(); start()
            }
        } catch (_: Exception) { after() }
    }

    /** تنزيل صوت أوسكار (مرة واحدة · محتاج نت). بيحتفظ بخريطة «النص ⇒ الملف». */
    fun downloadPack(done: (String) -> Unit) {
        val voice = prefs.oscarVoice
        io.execute {
            val msg = try {
                val man = JSONObject(get("${Cloud.BASE}/voice/$voice/manifest.json").toString(Charsets.UTF_8)).getJSONObject("lines")
                val map = JSONObject(); var got = 0; var missing = 0
                for (id in man.keys()) for (l in listOf("ar", "en")) {
                    val arr = man.getJSONObject(id).optJSONArray(l) ?: continue
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        val f = o.optString("f", "")
                        if (f.isEmpty()) { missing++; continue }
                        val dst = File(voiceDir(), f)
                        if (!dst.exists()) { val b = get("${Cloud.BASE}/voice/$voice/$f"); dst.writeBytes(b) }
                        map.put(o.getString("t"), f); got++
                    }
                }
                prefs.setVoiceFiles(voice, map)
                if (got == 0) "صوت أوسكار لسه ماتعملش على السيرفر — بيتكلّم بصوت الشاشة لحد ما يتعمل"
                else "اتنزّل ✓ $got جملة" + if (missing > 0) " (و$missing لسه بصوت الشاشة)" else ""
            } catch (e: Exception) { "محتاج نت عشان التنزيل" }
            packStatus = msg
            done(msg)
        }
    }

    /** جملة من تأليف السواق: السيرفر بيولّد صوتها مرة وبتتحفظ. من غير نت/مفتاح ⇒ بتتقال بصوت الشاشة. */
    fun setCustom(id: String, text: String, done: (String) -> Unit) {
        val l = lang; val voice = prefs.oscarVoice
        prefs.setCustomLine(id, l, text.ifBlank { null })
        val f = customFile(id); f.parentFile?.mkdirs(); f.delete()
        if (text.isBlank()) { done("رجعت للجملة الأصلية"); return }
        io.execute {
            val msg = try {
                val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
                f.writeBytes(post("${Cloud.BASE}/api/car/voice", token, JSONObject().put("text", text).put("voice", voice).put("lang", l)))
                "اتعملت بصوت أوسكار ✓"
            } catch (e: Exception) { "اتحفظت — وهتتقال بصوت الشاشة لحد ما يبقى فيه نت" }
            done(msg)
        }
    }

    private fun get(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000; c.readTimeout = 20_000
            if (c.responseCode !in 200..299) throw Cloud.HttpError(c.responseCode)
            return c.inputStream.use { it.readBytes() }
        } finally { c.disconnect() }
    }

    private fun post(url: String, token: String, body: JSONObject): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000; c.readTimeout = 30_000; c.requestMethod = "POST"; c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json"); c.setRequestProperty("Authorization", "Bearer $token")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            if (c.responseCode !in 200..299) throw Cloud.HttpError(c.responseCode)
            return c.inputStream.use { it.readBytes() }
        } finally { c.disconnect() }
    }
}
