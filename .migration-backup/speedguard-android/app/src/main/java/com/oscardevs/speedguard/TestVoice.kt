package com.oscardevs.speedguard

import android.content.Context
import android.speech.tts.TextToSpeech
import android.widget.Toast
import java.util.Locale

/** «اختبار الصوت»: بينطق جملة الإنذار مرة — عشان السواق يظبط الصوت ويتأكد إن العربى متسطّب. */
object TestVoice {
    private var tts: TextToSpeech? = null

    fun speak(ctx: Context, limit: Int) {
        tts?.shutdown()
        val app = ctx.applicationContext
        tts = TextToSpeech(app) { status ->
            val t = tts ?: return@TextToSpeech
            if (status != TextToSpeech.SUCCESS) { Toast.makeText(app, "محرك النطق مش شغّال على الجهاز", Toast.LENGTH_LONG).show(); return@TextToSpeech }
            val r = t.setLanguage(Locale("ar", "EG")).let { if (it < 0) t.setLanguage(Locale("ar")) else it }
            if (r < 0) {
                Toast.makeText(app, "النطق العربى مش متسطّب — هيشتغل التنبيه بالصفارة بس. ثبّت «Google Text-to-Speech» واختار العربى.", Toast.LENGTH_LONG).show()
                return@TextToSpeech
            }
            t.speak("انتبه. السرعة ${limit + 7}. الحد $limit", TextToSpeech.QUEUE_FLUSH, null, "test")
        }
    }
}
