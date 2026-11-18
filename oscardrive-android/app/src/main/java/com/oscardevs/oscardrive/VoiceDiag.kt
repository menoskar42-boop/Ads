package com.oscardevs.oscardrive

import android.content.Context
import android.net.ConnectivityManager
import android.speech.SpeechRecognizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * تشخيص الكلام (البند ٦ — docs/OSCAR_DRIVE_AUDIT_REPORT.md): بيفصل الميكروفون ← التعرّف ← الفهم عشان نعرف التأخير/«مافهمتش» جاى منين.
 * آخر ١٢ حدث فى الذاكرة بس (مفيش ملف ولا إرسال)، وبيتعرضوا فى شاشة 🎙️ Oscar.
 */
object VoiceDiag {
    private val lines = ArrayDeque<String>()
    private val fmt = SimpleDateFormat("HH:mm:ss", Locale.US)

    @Synchronized fun add(s: String) {
        lines.addFirst("${fmt.format(Date())}  $s")
        while (lines.size > 12) lines.removeLast()
    }
    @Synchronized fun recent(): List<String> = lines.toList()

    /**
     * «من غير نت» بس لما مفيش نت فعلاً (C10): برنامج جوجل لما يتطلب منه offline والعربى مش متنزّل بيتأخر أو بيرجع «مافهمتش» —
     * وService Flow (نفس الكلام بالعربى) سريع لأنه على السحابة. الإعداد بقى معناه «اسمح بالتعرّف من غير نت لما النت يقطع».
     */
    fun preferOffline(ctx: Context, allowOffline: Boolean): Boolean = allowOffline && !online(ctx)

    @Suppress("DEPRECATION")
    fun online(ctx: Context): Boolean = try {
        (ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).activeNetworkInfo?.isConnected == true
    } catch (_: Exception) { false }

    fun errorName(e: Int): String = when (e) {
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "النت بطىء (timeout)"
        SpeechRecognizer.ERROR_NETWORK -> "مفيش نت"
        SpeechRecognizer.ERROR_AUDIO -> "الميكروفون مابعتش صوت"
        SpeechRecognizer.ERROR_SERVER -> "سيرفر جوجل رفض"
        SpeechRecognizer.ERROR_CLIENT -> "خطأ فى البرنامج (هيتعاد)"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "سكوت"
        SpeechRecognizer.ERROR_NO_MATCH -> "سمع صوت ومافهموش كلام"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "برنامج التعرّف مشغول (هيتعاد)"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "إذن الميكروفون"
        else -> "خطأ $e"
    }
}
