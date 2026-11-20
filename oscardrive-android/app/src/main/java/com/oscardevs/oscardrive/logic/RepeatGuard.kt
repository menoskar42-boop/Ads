package com.oscardevs.oscardrive.logic

/**
 * برنامج التعرّف ساعات بيرجّع نفس الجملة مرتين ورا بعض (أو الاستماع فى الخريطة والشاشة الرئيسية الاتنين بيسمعوها) ⇒
 * «سجّل مطب» كانت بتتنفّذ مرتين (المالك ٢٠٢٦-١١-٢٠). نفس الأمر بنفس التفاصيل جوّه [windowMs] بيتجاهل.
 * علّى/وطّى الصوت والأغنية اللى بعدها مستثنيين — تكرارهم مقصود.
 */
class RepeatGuard(private val windowMs: Long = WINDOW_MS) {
    private var lastKey: String? = null
    private var lastMs = 0L

    /** true = نفّذ · false = تكرار لنفس الأمر لسه متنفّذ. */
    fun allow(id: String, slot: String?, nowMs: Long): Boolean {
        if (id in REPEATABLE) return true
        val key = id + "|" + VoiceEngine.normalize(slot.orEmpty())
        if (key == lastKey && nowMs - lastMs in 0 until windowMs) return false
        lastKey = key; lastMs = nowMs
        return true
    }

    companion object {
        const val WINDOW_MS = 4000L
        val REPEATABLE = setOf("media.up", "media.down", "media.next", "media.prev")
    }
}
