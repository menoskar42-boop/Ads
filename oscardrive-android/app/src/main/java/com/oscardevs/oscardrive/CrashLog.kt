package com.oscardevs.oscardrive

import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * «التطبيق وقف» (المالك ٢٠٢٦-١١-١٨): بعد تحديث، التطبيق فتح ووقف، ومااشتغلش غير لما اتمسح واتسطّب من جديد — والبيانات القديمة
 * راحت من غير ما نعرف السبب. من دلوقتى أى وقوع بيتكتب سببه (الخطأ والسطر) فى ملف على الشاشة، وأول ما التطبيق يفتح تانى بيظهر
 * للسواق بزرار «شارك» عشان يبعته — من غير نت ومن غير أى بيانات شخصية (نوع الشاشة والنسخة والخطأ بس).
 */
object CrashLog {
    @Volatile private var installed = false
    private fun file(ctx: Context) = File(ctx.applicationContext.filesDir, "last_crash.txt")

    fun install(ctx: Context) {
        if (installed) return
        installed = true
        val app = ctx.applicationContext
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val sw = StringWriter(); e.printStackTrace(PrintWriter(sw))
                val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
                file(app).writeText("Oscar Drive ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · $stamp\n" +
                    "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n" +
                    "thread: ${t.name}\n\n" + sw.toString().take(12_000))
            } catch (_: Throwable) { /* مانوقّعش التطبيق مرتين */ }
            prev?.uncaughtException(t, e)
        }
    }

    /** آخر وقوع لسه ماتشافش (وبيتمسح بعد ما يتعرض). */
    fun take(ctx: Context): String? {
        val f = file(ctx)
        if (!f.exists()) return null
        return try { f.readText().also { f.delete() } } catch (_: Exception) { null }
    }
}
