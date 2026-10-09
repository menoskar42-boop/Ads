package com.oscardevs.speedguard

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/** «يشتغل لوحده مع العربية»: الشاشة بتقوم مع الكونتاكت ⇒ المراقبة تبدأ من غير ما حد يلمسها. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!Prefs(context).autoStart) return
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        try { SpeedService.start(context) } catch (_: Exception) { /* النظام رفض التشغيل من الخلفية — السواق يفتح التطبيق */ }
    }
}
