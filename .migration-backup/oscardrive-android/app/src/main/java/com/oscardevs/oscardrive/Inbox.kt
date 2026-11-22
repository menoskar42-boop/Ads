package com.oscardevs.oscardrive

import android.content.Context
import com.oscardevs.oscardrive.logic.Grade
import com.oscardevs.oscardrive.logic.InboxPlan
import com.oscardevs.oscardrive.logic.InboxStep
import com.oscardevs.oscardrive.logic.VoiceCommands
import org.json.JSONArray
import org.json.JSONObject

/**
 * «📲 ابعت للشاشة»: بيسحب اللى الموبايل بعته (مكان · مهمة/ملاحظة/تذكير · تفويلة) ويضيفه لقاعدة الشاشة، وبيأكّد للسيرفر
 * (اللى بيمسح النص). بيتنده مع مزامنة المطبات (HazardSync، نفس التوكن ونفس مفتاح «☁️»)، ولما سؤال الموبايلات يقول فيه جديد.
 * الـuuid اللى اتنفّذ بيتحفظ (آخر ٣٠٠) عشان لو التأكيد ماوصلش مايتضافش مرتين.
 */
object Inbox {
    @Volatile var lastAdded: List<String> = emptyList(); private set

    /** على thread الخلفية. بيرجّع عدد اللى اتضاف. */
    fun pull(app: Context, prefs: Prefs, token: String): Int {
        val db = Db.get(app)
        val seen = prefs.inboxSeen.split(',').filter { it.isNotBlank() }.toMutableList()
        var ack = JSONArray()
        var added = 0
        val labels = mutableListOf<String>()
        repeat(4) {
            val r = Cloud.inbox(token, JSONObject().put("ack", ack))
            val items = r.optJSONArray("items") ?: JSONArray()
            if (items.length() == 0) { saveSeen(prefs, seen); lastAdded = labels; return added }
            ack = JSONArray()
            for (i in 0 until items.length()) {
                val o = items.optJSONObject(i) ?: continue
                val uuid = o.optString("uuid")
                if (uuid.isBlank()) continue
                if (uuid !in seen) {
                    apply(db, prefs, InboxPlan.plan(o.optString("kind"), o.optJSONObject("payload") ?: JSONObject(), System.currentTimeMillis()))
                        ?.let { labels += it; added++ }
                    seen += uuid
                }
                ack.put(uuid)
            }
        }
        Cloud.inbox(token, JSONObject().put("ack", ack))
        saveSeen(prefs, seen); lastAdded = labels
        return added
    }

    private fun saveSeen(prefs: Prefs, seen: List<String>) { prefs.inboxSeen = seen.takeLast(300).joinToString(",") }

    /** بيرجّع وصف قصير للى اتضاف (للإشعار/الصوت) أو null. */
    private fun apply(db: Db, prefs: Prefs, s: InboxStep): String? = when (s) {
        is InboxStep.Place -> { db.addPlace(s.name, s.lat, s.lng); "📍 ${s.name}" }
        is InboxStep.Note -> {
            if (s.kind == "remind" && s.place != null) {
                val norm = VoiceCommands.normalize(s.place)
                val p = db.places().firstOrNull { VoiceCommands.normalize(it.name) == norm }
                if (p != null) db.addNote("remind", s.text, lat = p.lat, lng = p.lng, place = p.name)
                else db.addNote("task", "${s.text} (لما توصل ${s.place})")   // المكان مش محفوظ ⇒ مهمة عشان ماتضيعش
            } else db.addNote(s.kind, s.text, dueMs = s.dueMs)
            (if (s.kind == "remind") "🔔 " else if (s.kind == "task") "✅ " else "📝 ") + s.text.take(40)
        }
        is InboxStep.Fill -> {
            val grade = Grade.of(s.gradeKey)
            db.addFill(s.odoKm ?: prefs.odoKm.toInt(), s.liters, s.paid, s.full, grade, if (s.paid > 0) s.paid / s.liters else null)
            "⛽ ${"%.1f".format(java.util.Locale.US, s.liters)} لتر"
        }
        InboxStep.Skip -> null
    }
}
