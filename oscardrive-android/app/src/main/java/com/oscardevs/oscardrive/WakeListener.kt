package com.oscardevs.oscardrive

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * «يا أوسكار» — استماع متكرر ببرنامج التعرّف على الكلام اللى على الشاشة (مش محرّك استدعاء خاص ولا AI):
 * بيسمع جملة، يبعتها، ويرجع يسمع. شغّال بس والتطبيق قدامك على الشاشة، وبيسكت وأوسكار بيتكلّم
 * (عشان مايسمعش نفسه). بعض الشاشات بتعمل «بيب» مع كل مرة، وبيحتاج نت لو مفيش حزمة لغة على الجهاز.
 */
class WakeListener(private val ctx: Context, private val onText: (List<String>) -> Unit, private val onState: (String) -> Unit) : RecognitionListener {
    private val h = Handler(Looper.getMainLooper())
    private var sr: SpeechRecognizer? = null
    var active = false; private set
    private var errors = 0

    /** شغّال بمحرّك أوسكار اللى من غير نت (OfflineEars) مش ببرنامج الشاشة. */
    private var ears = false

    fun start(lang: String, offline: Boolean, useEars: Boolean = false) {
        if (active) return
        if (useEars) {
            active = true; ears = true
            OfflineEars.start(ctx, OfflineEars.langOf(lang), oneShot = false, onText = { onText(listOf(it)) }, onState = { st ->
                if (!OfflineEars.listening) active = false
                onState(st)
            })
            return
        }
        ears = false
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { onState("الشاشة مافيهاش برنامج تعرّف على الكلام — نزّل «أوسكار يسمع من غير نت» من شاشة 🎙️ Oscar"); return }
        this.lang = lang; this.offline = offline
        active = true; errors = 0
        sr = SpeechRecognizer.createSpeechRecognizer(ctx).also { it.setRecognitionListener(this) }
        onState("🎙️ سامعك — قول «يا أوسكار»")
        listen(0)
    }

    private var lang = "ar-EG"
    private var offline = true

    fun stop() {
        active = false
        if (ears) { ears = false; OfflineEars.stop(); onState(""); return }
        h.removeCallbacksAndMessages(null)
        try { sr?.cancel(); sr?.destroy() } catch (_: Exception) {}
        sr = null
        onState("")
    }

    private fun listen(delayMs: Long) {
        h.removeCallbacksAndMessages(null)
        h.postDelayed({
            if (!active) return@postDelayed
            val wait = Oscar.speakingUntil - System.currentTimeMillis()
            if (wait > 0) { listen(wait + 300); return@postDelayed }
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, offline)
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
            try { sr?.startListening(i) } catch (_: Exception) { listen(2000) }
        }, delayMs)
    }

    override fun onResults(results: Bundle?) {
        errors = 0
        val l = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
        if (l.isNotEmpty()) onText(l)
        listen(250)
    }

    override fun onError(error: Int) {
        if (!active) return
        errors++
        when (error) {
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> { onState("محتاج إذن الميكروفون"); stop(); return }
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER ->
                onState("التعرّف على الكلام محتاج نت على الشاشة دى (أو نزّل اللغة Offline من إعدادات الشاشة)")
        }
        // سكوت أو مافهمش = عادى: يرجع يسمع. أخطاء متكررة ⇒ يهدّى شوية عشان مايستهلكش الشاشة
        listen(if (errors > 5) 4000 else if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) 1200 else 300)
    }

    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onPartialResults(partialResults: Bundle?) {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
}
