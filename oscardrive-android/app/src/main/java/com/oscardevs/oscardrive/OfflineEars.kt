package com.oscardevs.oscardrive

import android.app.ActivityManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * «أوسكار يسمع من غير نت» (المالك ٢٠٢٦-١١-٠٨/٠٩): شاشة العربية (CitiSound · Android 11 · 2 جيجا) بتطلّع
 * «ميزة البحث الصوتى غير متاحة» — مافيهاش برنامج تعرّف على الكلام شغّال. ده محرّك جوّه التطبيق (Vosk، مفتوح المصدر
 * Apache-2.0) بيحوّل الكلام لنص **على الشاشة نفسها** من غير نت ولا AI، وبعدها نفس `VoiceEngine` بيفهم الأمر.
 *
 *  • النموذج بيتنزّل **مرة واحدة** (العربى ~٣١٨ ميجا · الإنجليزى ~٤٠ ميجا) ويتحفظ فى ملفات التطبيق.
 *  • قبل التحميل: فيه مساحة؟ وقبل التشغيل: فيه رامات فاضية كفاية؟ لو لأ بيقول بدل ما يقع.
 *  • الصوت مابيتسجّلش ولا بيتبعت — بيتحوّل نص وبيترمى.
 */
object OfflineEars {
    data class Pack(val lang: String, val url: String, val sizeMb: Int, val minRamMb: Int)

    val PACKS = mapOf(
        "ar" to Pack("ar", "https://alphacephei.com/vosk/models/vosk-model-ar-mgb2-0.4.zip", 318, 600),
        "en" to Pack("en", "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip", 40, 200),
    )

    private val main = Handler(Looper.getMainLooper())
    @Volatile var downloading: String? = null; private set
    @Volatile var progress = ""; private set

    private var model: Model? = null
    private var modelLang: String? = null
    private var service: SpeechService? = null
    @Volatile var listening = false; private set

    fun langOf(voiceLang: String) = if (voiceLang.startsWith("en")) "en" else "ar"
    private fun dir(ctx: Context, lang: String) = File(ctx.filesDir, "vosk/$lang")
    fun installed(ctx: Context, lang: String) = File(dir(ctx, lang), ".ok").exists()

    fun freeRamMb(ctx: Context): Long {
        val mi = ActivityManager.MemoryInfo()
        (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(mi)
        return mi.availMem / 1_048_576
    }
    fun freeDiskMb(ctx: Context): Long = StatFs(ctx.filesDir.path).availableBytes / 1_048_576

    /** تنزيل النموذج وفكّه (مرة واحدة · محتاج نت). */
    fun download(ctx: Context, lang: String, onProgress: (String) -> Unit, done: (Boolean, String) -> Unit) {
        val p = PACKS[lang] ?: return done(false, "لغة مش معروفة")
        if (downloading != null) return done(false, "فيه تنزيل شغّال")
        if (freeDiskMb(ctx) < p.sizeMb * 3L) return done(false, "المساحة الفاضية مش كفاية (محتاج ~${p.sizeMb * 3} ميجا)")
        downloading = lang
        Thread {
            val app = ctx.applicationContext
            val tmp = File(app.filesDir, "vosk/$lang.part"); tmp.deleteRecursively(); tmp.mkdirs()
            val result = try {
                var url = URL(p.url); var conn: HttpURLConnection
                var hops = 0
                while (true) {
                    conn = url.openConnection() as HttpURLConnection
                    conn.connectTimeout = 20_000; conn.readTimeout = 60_000; conn.instanceFollowRedirects = true
                    val code = conn.responseCode
                    if (code in 300..399 && hops++ < 5) { url = URL(url, conn.getHeaderField("Location")); conn.disconnect(); continue }
                    if (code != 200) throw IllegalStateException("HTTP $code")
                    break
                }
                val total = conn.contentLengthLong
                var read = 0L; var lastShown = -1
                val counting = object : java.io.FilterInputStream(conn.inputStream) {
                    override fun read(b: ByteArray, off: Int, len: Int): Int {
                        val n = super.read(b, off, len)
                        if (n > 0) {
                            read += n
                            val pct = if (total > 0) (read * 100 / total).toInt() else (read / 1_048_576).toInt()
                            if (pct != lastShown) { lastShown = pct; report(onProgress, if (total > 0) "بينزّل… $pct٪" else "بينزّل… $pct ميجا") }
                        }
                        return n
                    }
                }
                ZipInputStream(counting.buffered()).use { zip ->
                    while (true) {
                        val e = zip.nextEntry ?: break
                        // أول جزء فى المسار = اسم فولدر النموذج ⇒ بيتشال
                        val rel = e.name.substringAfter('/', "")
                        if (rel.isEmpty() || rel.contains("..")) continue
                        val f = File(tmp, rel)
                        if (e.isDirectory) f.mkdirs() else { f.parentFile?.mkdirs(); f.outputStream().use { zip.copyTo(it) } }
                    }
                }
                val final = dir(app, lang); final.deleteRecursively()
                if (!tmp.renameTo(final)) throw IllegalStateException("rename")
                File(final, ".ok").writeText(p.url)
                true to "اتنزّل ✓ — أوسكار بيسمع من غير نت"
            } catch (e: Exception) {
                tmp.deleteRecursively()
                false to "التنزيل وقف (${e.message ?: "نت"}) — جرّب تانى وفيه نت"
            }
            downloading = null
            main.post { done(result.first, result.second) }
        }.start()
    }

    private fun report(cb: (String) -> Unit, t: String) { progress = t; main.post { cb(t) } }

    fun remove(ctx: Context, lang: String) { stop(); if (modelLang == lang) { model?.close(); model = null; modelLang = null }; dir(ctx, lang).deleteRecursively() }

    /**
     * يبدأ يسمع. `oneShot` = زرار 🎤 (أول جملة وبس) · غير كده = «يا أوسكار» (كل جملة لحد ما يتقفل).
     * النتايج بتيجى على الـmain thread. الكلام اللى بيتقال وأوسكار بيتكلّم بيتشال (عشان مايسمعش نفسه).
     */
    fun start(ctx: Context, lang: String, oneShot: Boolean, onText: (String) -> Unit, onState: (String) -> Unit) {
        if (!installed(ctx, lang)) { onState("صوت أوسكار من غير نت لسه مانزلش — نزّله من شاشة 🎙️ Oscar"); return }
        stop()
        listening = true
        val app = ctx.applicationContext
        Thread {
            try {
                val m = if (modelLang == lang && model != null) model!! else {
                    val need = PACKS[lang]?.minRamMb ?: 300
                    val free = freeRamMb(app)
                    if (free < need) throw OutOfMemoryError("free $free < $need")
                    model?.close()
                    Model(dir(app, lang).path).also { model = it; modelLang = lang }
                }
                val rec = Recognizer(m, 16000f)
                val s = SpeechService(rec, 16000f)
                main.post {
                    if (!listening) { s.shutdown(); return@post }
                    service = s
                    onState(if (oneShot) "🎙️ اتكلّم…" else "🎙️ سامعك — قول «يا أوسكار» (من غير نت)")
                    s.startListening(object : RecognitionListener {
                        override fun onResult(hypothesis: String?) {
                            val text = textOf(hypothesis)
                            if (text.isBlank() || System.currentTimeMillis() < Oscar.speakingUntil) return
                            if (oneShot) stop()
                            onText(text)
                        }
                        override fun onFinalResult(hypothesis: String?) {}
                        override fun onPartialResult(hypothesis: String?) {}
                        override fun onError(e: Exception?) { stop(); onState("الميكروفون مش متاح (${e?.message ?: "خطأ"})") }
                        override fun onTimeout() { if (oneShot) stop() }
                    })
                }
            } catch (e: OutOfMemoryError) {
                listening = false; model = null; modelLang = null
                main.post { onState("الرامات الفاضية مش كفاية لمحرّك الصوت دلوقتى — اقفل تطبيقات تانية وجرّب، أو استخدم الأزرار") }
            } catch (e: Exception) {
                listening = false
                main.post { onState("محرّك الصوت ماشتغلش (${e.message ?: "خطأ"})") }
            }
        }.start()
    }

    fun stop() {
        listening = false
        service?.let { try { it.stop(); it.shutdown() } catch (_: Exception) {} }
        service = null
    }

    private fun textOf(json: String?): String = try { JSONObject(json ?: "{}").optString("text", "") } catch (_: Exception) { "" }
}
