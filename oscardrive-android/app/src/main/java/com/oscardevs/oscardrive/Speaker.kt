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

/** صوت التطبيق (عربى مصرى لو موجود): بيوطّى الأغانى وقت الكلام وبيرجّعها بعده. */
object Speaker {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var tone: ToneGenerator? = null
    private var focus: AudioFocusRequest? = null
    private var am: AudioManager? = null
    private var pending: String? = null

    fun init(ctx: Context) {
        if (tts != null) return
        val app = ctx.applicationContext
        am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        try { tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 90) } catch (_: Exception) {}
        tts = TextToSpeech(app) { status ->
            val t = tts ?: return@TextToSpeech
            if (status != TextToSpeech.SUCCESS) return@TextToSpeech
            val r = t.setLanguage(Locale.forLanguageTag("ar-EG"))
            ready = (if (r < 0) t.setLanguage(Locale.forLanguageTag("ar")) else r) >= 0
            t.setAudioAttributes(AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) {}
                override fun onDone(id: String?) { abandon() }
                @Deprecated("Deprecated in Java")
                override fun onError(id: String?) { abandon() }
            })
            pending?.let { pending = null; say(it) }
        }
    }

    val available: Boolean get() = ready

    fun beep() { try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP2, 350) } catch (_: Exception) {} }

    fun say(text: String, beep: Boolean = false) {
        if (beep) beep()
        val t = tts
        if (t == null || !ready) { pending = text; return }
        request()
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "od-" + System.currentTimeMillis())
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
