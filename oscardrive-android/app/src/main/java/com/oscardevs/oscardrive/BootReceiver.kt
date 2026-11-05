package com.oscardevs.oscardrive

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/** العربية دارت ⇒ Oscar Drive يشتغل لوحده (لو السواق سايب «يشتغل مع العربية»). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (!Prefs(ctx).autoStart) return
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        try { DriveService.start(ctx) } catch (_: Exception) {}
    }
}
