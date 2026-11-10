package com.oscardevs.oscardrive

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * «اقرا الإشعارات» (المالك ٢٠٢٦-١١-٠٧، المرحلة ٥): رسالة واتساب/تليجرام/رسايل جديدة ⇐ أوسكار يقول «رسالة من X: …».
 * مقفولة افتراضياً — محتاجة إن السواق يفعّلها **و** يدّى إذن «الوصول للإشعارات» من إعدادات الشاشة.
 * تطبيقات الرسايل دى بس (مش أكواد البنوك ولا غيرها). النص مابيتحفظش على القرص ولا بيتبعت — آخر ١٠ فى الذاكرة بس عشان «اقرا الرسايل».
 */
class NotifyReader : NotificationListenerService() {
    override fun onListenerConnected() { Speaker.init(this); Oscar.init(this) }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName !in APPS) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0 || n.flags and Notification.FLAG_ONGOING_EVENT != 0) return
        val title = n.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val text = n.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
        if (title.isEmpty() || text.isEmpty()) return
        val key = "$title|$text"
        val now = System.currentTimeMillis()
        synchronized(recent) {
            if (recent.any { it.key == key && now - it.t < 60_000 }) return   // نفس الرسالة بتتكرر فى إشعارات واتساب
            recent.add(0, Msg(key, title, text.take(200), sbn.packageName, now))
            while (recent.size > 10) recent.removeAt(recent.size - 1)
        }
        if (!Prefs(this).readNotifs) return
        if (System.currentTimeMillis() < Oscar.speakingUntil) return
        Speaker.say("رسالة من $title: ${text.take(120)}")
    }

    data class Msg(val key: String, val from: String, val text: String, val pkg: String, val t: Long)

    companion object {
        val APPS = setOf("com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.google.android.apps.messaging",
            "com.android.mms", "com.samsung.android.messaging", "com.facebook.orca")
        val recent = mutableListOf<Msg>()
        fun last(n: Int = 3): List<Msg> = synchronized(recent) { recent.take(n) }
    }
}
