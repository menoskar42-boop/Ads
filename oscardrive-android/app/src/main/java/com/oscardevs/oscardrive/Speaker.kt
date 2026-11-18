package com.oscardevs.oscardrive

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import com.oscardevs.oscardrive.logic.Etiquette
import com.oscardevs.oscardrive.logic.SpeechDecision
import com.oscardevs.oscardrive.logic.SpeechKind

/** صوت التطبيق (عربى مصرى لو موجود): بيوطّى الأغانى وقت الكلام وبيرجّعها بعده. */
object Speaker {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var tone: ToneGenerator? = null
    private var focus: AudioFocusRequest? = null
    private var am: AudioManager? = null
    private var pending: String? = null
    private var appCtx: Context? = null
    private var attempts = 0
    private val h = android.os.Handler(android.os.Looper.getMainLooper())
    /** حالة النطق للإعدادات و«جرّب صوت التنبيه» (C8). */
    @Volatile var status: String = "بيجهّز…"; private set
    /** جملة أمان (مطب/سرعة) لسه بتتقال لحد إمتى — مايقطعهاش غير إنها تخلص (C6). */
    @Volatile private var safetyUntil = 0L

    fun init(ctx: Context) {
        if (appCtx != null) return
        val app = ctx.applicationContext
        appCtx = app
        am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        try { tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 90) } catch (_: Exception) {}
        create(app)
    }

    /** محرّك النطق ممكن مايشتغلش أول مرة (الشاشة لسه بتقوم) — كان بيفضل ساكت لحد ما التطبيق يتقفل. دلوقتى ٣ محاولات (C8). */
    private fun retry(app: Context) {
        try { tts?.shutdown() } catch (_: Exception) {}
        tts = null; ready = false
        if (attempts >= 3) { status = "محرّك النطق مش شغّال — التنبيه بالبيب بس. شوف إعدادات الشاشة ← تحويل النص لكلام"; return }
        h.postDelayed({ create(app) }, 5000L * attempts)
    }

    private fun create(app: Context) {
        attempts++
        tts = TextToSpeech(app) { st ->
            val t = tts ?: return@TextToSpeech
            if (st != TextToSpeech.SUCCESS) { status = "محرّك النطق ماشتغلش (محاولة $attempts)"; retry(app); return@TextToSpeech }
            val r = t.setLanguage(Locale.forLanguageTag("ar-EG"))
            ready = (if (r < 0) t.setLanguage(Locale.forLanguageTag("ar")) else r) >= 0
            status = if (ready) "جاهز ✓" else "مفيش صوت عربى فى محرّك النطق — نزّله من إعدادات الشاشة"
            t.setAudioAttributes(AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) { done(id) }
                @Deprecated("Deprecated in Java")
                override fun onError(id: String?) { done(id); status = "آخر جملة ماتقالتش (خطأ من محرّك النطق)" }
            })
            pending?.let { pending = null; say(it) }
        }
    }

    val available: Boolean get() = ready

    /**
     * بيتكلم لحد إمتى (C7): «يا أوسكار» بيستنى ده كمان — قبل كده الاستماع كان بيبدأ وسط تنبيه المطب (اللى بيتقال هنا مش من أوسكار)،
     * وعلى شاشات كتير بداية التعرّف بتكتم الصوت. تقدير من طول الجملة، وبيتصفّر أول ما النطق يخلص.
     */
    @Volatile var speakingUntil = 0L; private set

    fun beep() { try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP2, 350) } catch (_: Exception) {} }

    /** فيه مكالمة شغّالة (موبايل بالبلوتوث أو واتساب)؟ — من وضع الصوت، من غير أى إذن. */
    fun inCall(): Boolean {
        val m = am ?: return false
        return m.mode == AudioManager.MODE_IN_CALL || m.mode == AudioManager.MODE_IN_COMMUNICATION
    }

    /** يتقال دلوقتى؟ (المرحلة ٧: أوسكار مايقاطعش) — الأمان والردود دايماً، الباقى حسب المكالمة. */
    fun allowed(kind: SpeechKind): Boolean = Etiquette.decide(kind, inCall()) == SpeechDecision.SPEAK

    private val waiting = ArrayList<Pair<Long, String>>()

    /** اللى استنى المكالمة: يتقال مرة واحدة أول ما تخلص (لو لسه جديد). بيتنده من خدمة القيادة كل ثانية. */
    fun flushWaiting() {
        if (waiting.isEmpty() || inCall()) return
        val now = System.currentTimeMillis()
        val due = waiting.filter { now - it.first <= Etiquette.WAIT_MAX_MS }.map { it.second }.distinct()
        waiting.clear()
        if (due.isNotEmpty()) say(due.joinToString(". "), beep = true)
    }

    fun say(text: String, beep: Boolean = false, kind: SpeechKind = SpeechKind.ANSWER) {
        when (Etiquette.decide(kind, inCall())) {
            SpeechDecision.SPEAK -> {}
            SpeechDecision.WAIT -> { waiting.add(System.currentTimeMillis() to text); while (waiting.size > 5) waiting.removeAt(0); return }
            SpeechDecision.DROP -> return
        }
        if (beep) beep()
        val t = tts
        if (t == null || !ready) { pending = text; return }
        request()
        val now = System.currentTimeMillis()
        val est = 1500 + text.length * 90L
        // تنبيه أمان شغّال ⇒ اللى بعده يستنى دوره (QUEUE_ADD) بدل ما يمسحه — قبل كده أى جملة كانت بتقطع «خلّى بالك، مطب» (C6)
        val queue = safetyUntil > now
        speakingUntil = if (queue) maxOf(speakingUntil, now) + est else now + est
        if (kind == SpeechKind.SAFETY) safetyUntil = speakingUntil
        val id = (if (kind == SpeechKind.SAFETY) "od-s-" else "od-") + now
        if (t.speak(text, if (queue) TextToSpeech.QUEUE_ADD else TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
            status = "محرّك النطق رفض الجملة — بيعيد التشغيل"; if (!beep) beep(); appCtx?.let { attempts = 0; retry(it) }
        }
    }

    private fun done(id: String?) {
        val t = tts
        if (t == null || !t.isSpeaking) { speakingUntil = 0L; safetyUntil = 0L; abandon() }
        else if (id != null && id.startsWith("od-s-")) safetyUntil = 0L
    }

    /** «جرّب صوت التنبيه»: نفس طريق تنبيه المطب بالظبط + حالة النطق ومستوى الصوت. */
    fun testLine(): String {
        val m = am
        val vol = if (m != null) "${m.getStreamVolume(AudioManager.STREAM_MUSIC)}/${m.getStreamMaxVolume(AudioManager.STREAM_MUSIC)}" else "؟"
        say("خلّى بالك، مطب بعد 100 متر", beep = true, kind = SpeechKind.SAFETY)
        return "النطق: $status · مستوى الصوت (الوسائط): $vol" + if (inCall()) " · الشاشة فاكرة إن فيه مكالمة" else ""
    }

    private fun request() {
        val m = am ?: return
        if (Build.VERSION.SDK_INT >= 26) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).build()
            focus = req
            m.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            m.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        }
    }

    private fun abandon() {
        val m = am ?: return
        if (Build.VERSION.SDK_INT >= 26) focus?.let { m.abandonAudioFocusRequest(it) }
        else @Suppress("DEPRECATION") m.abandonAudioFocus(null)
    }
}
