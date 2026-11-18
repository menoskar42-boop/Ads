package com.oscardevs.oscardrive.logic

import org.json.JSONObject

/**
 * «📲 ابعت للشاشة» (المالك ٢٠٢٦-١١-١٨): حاجة جت من صفحة الموبايل ⇒ هتتضاف إزاى على الشاشة. حساب بس (من غير قاعدة):
 * Inbox.kt بينفّذ. التذكير: الوقت أو المكان لو الموبايل بعته، وإلا بنفهمه زى الصوت («فكّرنى بعد ٢٠ دقيقة …»)، ولو مالوش وقت ولا مكان
 * يبقى مهمة (تذكير من غير ميعاد مابيترنّش أبداً).
 */
sealed class InboxStep {
    data class Place(val name: String, val lat: Double, val lng: Double) : InboxStep()
    data class Note(val kind: String, val text: String, val dueMs: Long? = null, val place: String? = null) : InboxStep()
    data class Fill(val liters: Double, val paid: Double, val full: Boolean, val gradeKey: String?, val odoKm: Int?) : InboxStep()
    object Skip : InboxStep()
}

object InboxPlan {
    fun plan(kind: String, p: JSONObject, nowMs: Long): InboxStep = when (kind) {
        "place" -> {
            val name = PlaceNames.tidy(p.optString("name"))
            val lat = p.optDouble("lat"); val lng = p.optDouble("lng")
            if (name.isBlank() || lat.isNaN() || lng.isNaN()) InboxStep.Skip else InboxStep.Place(name, lat, lng)
        }
        "task", "note" -> p.optString("text").trim().let { if (it.isEmpty()) InboxStep.Skip else InboxStep.Note(kind, it) }
        "remind" -> {
            val text = p.optString("text").trim()
            val due = if (p.has("dueMs") && !p.isNull("dueMs")) p.optLong("dueMs") else null
            val place = p.optString("place").trim().ifEmpty { null }
            when {
                text.isEmpty() -> InboxStep.Skip
                due != null || place != null -> InboxStep.Note("remind", text, due, place)
                else -> NoteVoice.parse(text, nowMs)?.takeIf { it.kind == NoteKind.REMIND && (it.dueMs != null || it.place != null) }
                    ?.let { InboxStep.Note("remind", it.text, it.dueMs, it.place) }
                    ?: InboxStep.Note("task", text)
            }
        }
        "fill" -> {
            val l = p.optDouble("liters")
            if (l.isNaN() || l <= 0) InboxStep.Skip
            else InboxStep.Fill(l, p.optDouble("paid", 0.0).takeIf { !it.isNaN() } ?: 0.0, p.optBoolean("full", false),
                p.optString("grade").takeIf { it in setOf("80", "92", "95") },
                if (p.has("odo") && !p.isNull("odo")) p.optInt("odo").takeIf { it > 0 } else null)
        }
        else -> InboxStep.Skip
    }
}
