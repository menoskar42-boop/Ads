package com.oscardevs.oscardrive

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.oscardevs.oscardrive.logic.WakeCapturePolicy

/**
 * «يا أوسكار» — استماع متكرر ببرنامج التعرّف على الكلام اللى على الشاشة (مش محرّك استدعاء خاص ولا AI):
 * بيسمع جملة، يبعتها، ويرجع يسمع. شغّال بس والتطبيق قدامك على الشاشة، وبيسكت وأوسكار بيتكلّم
 * (عشان مايسمعش نفسه). بعض الشاشات بتعمل «بيب» مع كل مرة، وبيحتاج نت لو مفيش حزمة لغة على الجهاز.
 */
class WakeListener(private val ctx: Context, private val onText: (List<String>) -> Unit, private val onState: (String) -> Unit,
                   /** النتايج الجزئية وانت لسه بتتكلم — للتصوير الفورى لأوامر الطريق (ProvisionalCapture). */
                   private val onPartial: ((List<String>) -> Unit)? = null) : RecognitionListener {
    private val h = Handler(Looper.getMainLooper())
    private val commandTimeoutHandler = Handler(Looper.getMainLooper())
    private var sr: SpeechRecognizer? = null
    var active = false; private set
    private var errors = 0
    private var oneShot = false
    private var onTimeout: (() -> Unit)? = null

    /** شغّال بمحرّك أوسكار اللى من غير نت (OfflineEars) مش ببرنامج الشاشة. */
    private var ears = false

    fun start(
        lang: String,
        offline: Boolean,
        useEars: Boolean = false,
        oneShot: Boolean = false,
        onTimeout: (() -> Unit)? = null,
    ) {
        if (active) return
        this.oneShot = oneShot
        this.onTimeout = onTimeout
        if (useEars) {
            if (!OfflineEars.installed(ctx, OfflineEars.langOf(lang))) {
                this.oneShot = false
                this.onTimeout = null
                onState("صوت أوسكار من غير نت لسه مانزلش — نزّله من شاشة 🎙️ Oscar")
                return
            }
            active = true; ears = true
            OfflineEars.start(ctx, OfflineEars.langOf(lang), oneShot = oneShot, onText = {
                if (this.oneShot) finishOneShot(listOf(it)) else onText(listOf(it))
            }, onState = { st ->
                if (!OfflineEars.listening) active = false
                onState(st)
            }, onPartial = onPartial?.let { f -> { p: String -> f(listOf(p)) } },
                onTimeout = { if (this.oneShot) finishOneShot(emptyList()) })
            return
        }
        ears = false
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { onState("الشاشة مافيهاش برنامج تعرّف على الكلام — نزّل «أوسكار يسمع من غير نت» من شاشة 🎙️ Oscar"); return }
        this.lang = lang; this.offline = offline
        active = true; errors = 0
        sr = SpeechRecognizer.createSpeechRecognizer(ctx).also { it.setRecognitionListener(this) }
        onState("🎙️ سامعك — قول «يا أوسكار»")
        if (oneShot) commandTimeoutHandler.postDelayed({ finishOneShot(emptyList()) }, WakeCapturePolicy.COMMAND_MAX_WAIT_MS)
        listen(0)
    }

    private var lang = "ar-EG"
    private var offline = true

    fun stop() {
        active = false
        oneShot = false
        onTimeout = null
        commandTimeoutHandler.removeCallbacksAndMessages(null)
        if (ears) { ears = false; OfflineEars.stop(); onState(""); return }
        h.removeCallbacksAndMessages(null)
        try { sr?.cancel(); sr?.destroy() } catch (_: Exception) {}
        sr = null
        onState("")
    }

    private fun finishOneShot(results: List<String>) {
        if (!oneShot || !active) return
        val timeout = onTimeout
        oneShot = false
        onTimeout = null
        stop()
        if (results.isEmpty()) timeout?.invoke() else onText(results)
    }

    private fun listen(delayMs: Long) {
        h.removeCallbacksAndMessages(null)
        h.postDelayed({
            if (!active) return@postDelayed
            val wait = Oscar.speakingUntil - System.currentTimeMillis()
            if (wait > 0) { listen(wait + 300); return@postDelayed }
            val wait2 = Speaker.speakingUntil - System.currentTimeMillis()   // تنبيه المطب بصوت الشاشة (C7)
            if (wait2 > 0) { listen(wait2 + 300); return@postDelayed }
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, VoiceDiag.preferOffline(ctx, offline))
                .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, onPartial != null)
            if (oneShot) {
                i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
                    WakeCapturePolicy.COMMAND_SILENCE_MS.toInt())
                i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS,
                    WakeCapturePolicy.POSSIBLE_COMMAND_SILENCE_MS.toInt())
            }
            startedMs = System.currentTimeMillis(); speechMs = 0L
            try { sr?.startListening(i) } catch (_: Exception) { recreate(); listen(2000) }
        }, delayMs)
    }

    private var startedMs = 0L
    private var speechMs = 0L

    /** برنامج جوجل على الشاشات الضعيفة بيعلق فى «مشغول» لو اتنده تانى على نفس النسخة — الحل المعروف: نقفله ونعمل واحد جديد (P1). */
    private fun recreate() {
        try { sr?.cancel(); sr?.destroy() } catch (_: Exception) {}
        sr = try { SpeechRecognizer.createSpeechRecognizer(ctx).also { it.setRecognitionListener(this) } } catch (_: Exception) { null }
    }

    override fun onResults(results: Bundle?) {
        errors = 0
        val l = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
        if (oneShot) { finishOneShot(l); return }
        val now = System.currentTimeMillis()
        val after = if (speechMs > 0) "${(now - speechMs) / 100 / 10.0} ث بعد ما بدأت تتكلم" else "${(now - startedMs) / 1000} ث"
        VoiceDiag.add(if (l.isEmpty()) "رجع فاضى ($after)" else "سمع «${l.first()}» ($after)")
        if (l.isNotEmpty()) onText(l)
        listen(250)
    }

    override fun onError(error: Int) {
        if (!active) return
        if (oneShot) {
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) onState("محتاج إذن الميكروفون")
            finishOneShot(emptyList())
            return
        }
        val silence = error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT || error == SpeechRecognizer.ERROR_NO_MATCH
        // السكوت عادى فى الاستماع المتواصل — مابيتحسبش خطأ (كان بيوصّل العدّاد لـ٥ فيستنى ٤ ث بين كل محاولة ويضيّع كلامك)
        if (!silence) { errors++; VoiceDiag.add("خطأ: ${VoiceDiag.errorName(error)}") }
        else if (speechMs > 0) VoiceDiag.add(VoiceDiag.errorName(error))
        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) { recreate(); listen(800); return }
        when (error) {
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> { onState("محتاج إذن الميكروفون"); stop(); return }
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER ->
                onState("التعرّف على الكلام محتاج نت على الشاشة دى (أو نزّل اللغة Offline من إعدادات الشاشة)")
        }
        // سكوت أو مافهمش = عادى: يرجع يسمع. أخطاء متكررة ⇒ يهدّى شوية عشان مايستهلكش الشاشة
        listen(if (errors > 5) 4000 else if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) 1200 else 300)
    }

    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() { speechMs = System.currentTimeMillis() }
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onPartialResults(partialResults: Bundle?) {
        val l = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty().filter { it.isNotBlank() }
        if (l.isNotEmpty() && System.currentTimeMillis() >= Oscar.speakingUntil) onPartial?.invoke(l)
    }
    override fun onEvent(eventType: Int, params: Bundle?) {}
}
