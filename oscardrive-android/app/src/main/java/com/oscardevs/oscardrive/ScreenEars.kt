package com.oscardevs.oscardrive

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager

/**
 * «أوسكار» بيسمع طول ما التطبيق مفتوح — كمان وانت فى شاشة الخريطة أو الملاحة اللى جوّه التطبيق (المالك ٢٠٢٦-١١-١٩:
 * «طالما أنا فاتح التطبيق أوسكار على طول بيسمع، وأول ما أقوله أوسكار ينتبه وينفّذ»). قبل كده السماع كان فى الشاشة
 * الرئيسية بس وبيقف أول ما تفتح الخريطة. الكلام بيروح لنفس الفهم (MainActivity.handleHeard) عن طريق [sink] —
 * نفس الاسم ونفس الأوامر ونفس «أوسكار» لوحده ⇒ «أيوه» ويستنى ٨ ثوانى. نفس اختيار «📣 يا أوسكار» (Prefs.voiceWake).
 */
object ScreenEars {
    /** بتتحط من الشاشة الرئيسية (عايشة ورا الخريطة/الملاحة) وبتتشال لما تتقفل. */
    @Volatile var sink: ((List<String>) -> Unit)? = null

    /** محرّك أوسكار اللى من غير نت ولا برنامج الشاشة — نفس قاعدة MainActivity.useEars. */
    fun useEars(ctx: Context, p: Prefs): Boolean = when (p.voiceEngine) {
        1 -> false
        2 -> true
        else -> OfflineEars.installed(ctx, OfflineEars.langOf(p.voiceLang))
    }

    /** يبدأ السماع فى شاشة الخريطة/الملاحة (onResume) — وقّفه فى onPause. أى غلط ⇒ مابيوقّعش الشاشة. */
    fun start(a: Activity): WakeListener? = try {
        val p = Prefs(a)
        if (!p.voiceWake || sink == null || a.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) null
        else WakeListener(a, { heard -> sink?.invoke(heard) }, { }).also { it.start(p.voiceLang, p.voiceOffline, useEars(a, p)) }
    } catch (t: Throwable) { CrashLog.nonFatal(a, "ScreenEars.start", t); null }

    fun stop(a: Activity, w: WakeListener?) {
        try { w?.stop() } catch (t: Throwable) { CrashLog.nonFatal(a, "ScreenEars.stop", t) }
    }
}
