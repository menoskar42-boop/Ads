package com.oscardevs.oscardrive

import android.content.Context
import com.oscardevs.oscardrive.logic.HazardType
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * ذاكرة الطريق على السيرفر (المالك ٢٠٢٦-١١-١٨ — docs/OSCAR_DRIVE_AUDIT_REPORT.md البند C1): المطبات والحفر والرادارات كانت على
 * الشاشة بس وبتضيع لما التطبيق يتمسح. دلوقتى كل تسجيل/مسح بيترفع لـdrive.oscardevs.com بالـuuid (الدفعة اللى بتتبعت مرتين
 * مابتتكررش)، ولو مفيش نت بيستنى ويترفع بعدين. **وفى الاتجاهين** (المالك ٢٠٢٦-١١-١٨: «طالما فيه نت … المطبات اللى على السيرفر
 * تتحفظ على الشاشة والعكس»): كل مزامنة بتنزّل ذاكرة العربية وتضيف الناقص على الشاشة وتمسح اللى اتمسح على السيرفر — أول التشغيل،
 * أول ما النت يرجع، بعد أى تسجيل/مسح، وكل ١٠ دقايق.
 * شغّال لوحده من غير «الحماية» — وتقدر تقفله من الإعدادات (prefs.cloudHazards).
 */
object HazardSync {
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var running = false
    @Volatile private var again = false
    @Volatile var lastOkMs = 0L; private set
    @Volatile var lastError: String? = null; private set
    private const val BATCH = 200

    /** اترفع/اتنزّل حاجة؟ (للإعدادات) */
    var listener: (() -> Unit)? = null

    @Suppress("UNUSED_PARAMETER")
    fun syncSoon(ctx: Context, pull: Boolean = true) {
        val app = ctx.applicationContext
        val prefs = Prefs(app)
        if (!prefs.cloudHazards) return
        if (running) { again = true; return }
        running = true
        io.execute {
            do {
                again = false
                try { syncOnce(app, prefs); lastError = null; lastOkMs = System.currentTimeMillis() }
                catch (e: Cloud.HttpError) {
                    lastError = "السيرفر رد ${e.code}"
                    if (e.code == 401) prefs.deviceToken = null   // الجهاز اتشال من السيرفر — يتسجّل تانى المرة الجاية
                } catch (e: Throwable) { lastError = "مفيش نت — المطبات محفوظة على الشاشة وهتترفع بعدين" }
            } while (again && lastError == null)
            running = false
            listener?.invoke()
        }
    }

    private fun syncOnce(app: Context, prefs: Prefs) {
        val db = Db.get(app)
        // شاشة جديدة لسه ماسجّلتش حاجة: مفيش داعى تتسجّل على السيرفر (ومفيش حاجة تنزل — الربط بالعربية القديمة بيبقى بالكود)
        if (prefs.deviceToken == null && db.pendingHazards() == 0) return
        val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
        var rounds = 0
        while (true) {
            val rows = db.unsyncedHazards(BATCH)
            val last = rows.size < BATCH || rounds >= 24
            val body = JSONObject().put("items", JSONArray().also { a -> for (h in rows) a.put(json(h)) })
            if (last) body.put("pull", true)   // آخر دفعة بتنزّل ذاكرة السيرفر (بعد ما كل اللى عندنا اترفع)
            val r = Cloud.hazards(token, body)
            db.markHazardsSynced(rows.map { it.id })
            if (last) {
                val changed = merge(db, r.optJSONArray("items"), r.optJSONArray("deleted"))
                if (changed) DriveService.State.hazardsDirty = true
                break
            }
            rounds++
        }
        DriveService.State.hazardsDirty = true
        // «📲 ابعت للشاشة»: اللى الموبايل بعته (مكان · مهمة · تذكير · تفويلة) — فشلها مايوقّفش مزامنة المطبات
        try {
            if (Inbox.pull(app, prefs, token) > 0) {
                val what = Inbox.lastAdded.joinToString(" · ")
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    Speaker.say("وصل من الموبايل: " + Inbox.lastAdded.joinToString("، ") { it.drop(2).trim() }.take(120),
                        kind = com.oscardevs.oscardrive.logic.SpeechKind.INFO)
                    android.widget.Toast.makeText(app, "📲 من الموبايل: $what", android.widget.Toast.LENGTH_LONG).show()
                }
            }
        } catch (e: Cloud.HttpError) { if (e.code == 401) throw e } catch (_: Throwable) { /* المرة الجاية */ }
    }

    private fun json(h: Db.HazardRow) = JSONObject().put("uuid", h.uuid).put("type", h.type).put("lat", h.lat).put("lng", h.lng)
        .put("t", h.createdMs).put("note", h.note).put("deleted", h.deleted).put("oneway", h.oneway).apply {
            h.bearing?.let { put("bearing", it.toDouble()) }; h.accuracy?.let { put("acc", it.toDouble()) }; h.altitude?.let { put("alt", it) }
        }

    /**
     * اللى على السيرفر ومش على الشاشة بيتضاف (اتعلّم «مترفوع»)، واللى اتمسح على السيرفر بيتمسح من الشاشة (علامة بس).
     * اللى على الشاشة ومش على السيرفر مابيتلمسش — هو اللى بيترفع.
     */
    private fun merge(db: Db, items: JSONArray?, deleted: JSONArray?): Boolean {
        var changed = false
        if (deleted != null && deleted.length() > 0) {
            val gone = (0 until deleted.length()).mapNotNull { deleted.optString(it).takeIf { u -> u.isNotBlank() } }
            if (db.markDeletedFromServer(gone) > 0) changed = true
        }
        if (items == null || items.length() == 0) return changed
        val have = db.hazardUuids()
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val uuid = o.optString("uuid"); if (uuid.isBlank()) continue
            // موجود: «اتجاه واحد ⇄ اتجاهين» اتعدّل من صفحة الموبايل ⇒ يتحدّث (لو مفيش تعديل هنا لسه ماترفعش)
            if (uuid in have) { if (o.has("oneway") && db.setHazardOnewayFromServer(uuid, o.optBoolean("oneway"))) changed = true; continue }
            db.addHazard(HazardType.of(o.optString("type")), o.optDouble("lat"), o.optDouble("lng"),
                if (o.isNull("bearing") || !o.has("bearing")) null else o.optDouble("bearing").toFloat(),
                if (o.isNull("acc") || !o.has("acc")) null else o.optDouble("acc").toFloat(),
                if (o.isNull("alt") || !o.has("alt")) null else o.optDouble("alt"),
                uuid = uuid, createdMs = o.optLong("t", System.currentTimeMillis()), note = o.optString("note", ""), synced = true,
                oneway = o.optBoolean("oneway", false))
            changed = true
        }
        return changed
    }

    /** الربط بـQR: بيطلب رقم من السيرفر. done(الرابط اللى يتعرض QR, الرقم, خطأ). */
    fun claim(ctx: Context, done: (String?, String?, String?) -> Unit) {
        val app = ctx.applicationContext
        val prefs = Prefs(app)
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        io.execute {
            try {
                val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
                val r = Cloud.claim(token)
                main.post { done(r.optString("url"), r.optString("code"), null) }
            } catch (e: Throwable) { main.post { done(null, null, "محتاج نت عشان الربط") } }
        }
    }

    /** الموبايل أكّد؟ done(اسم العربية) لو اتربطت، وإلا null. بيتنده كل ٣ ثوانى والـQR ظاهر. */
    fun claimStatus(ctx: Context, done: (String?) -> Unit) {
        val app = ctx.applicationContext
        val prefs = Prefs(app)
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        val token = prefs.deviceToken ?: return
        Thread {
            val name = try { Cloud.claimStatus(token).let { if (it.optBoolean("linked")) it.optString("name", "عربيتك") else null } } catch (_: Throwable) { null }
            main.post { done(name) }
            if (name != null) { name.takeIf { it.isNotBlank() }?.let { prefs.carName = it }; syncSoon(app, pull = true) }
        }.start()
    }

    /** الشاشة دى اتسطّبت من جديد: كود من صفحة الموبايل يربطها بنفس العربية، وبعدها الذاكرة بتنزل. done(اسم العربية, خطأ). */
    fun relink(ctx: Context, code: String, done: (String?, String?) -> Unit) {
        val app = ctx.applicationContext
        val prefs = Prefs(app)
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        io.execute {
            try {
                val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
                val r = Cloud.relink(token, code.trim())
                r.optString("name").takeIf { it.isNotBlank() }?.let { prefs.carName = it }
                main.post { done(r.optString("name"), null); syncSoon(app, pull = true) }
            } catch (e: Cloud.HttpError) {
                main.post { done(null, if (e.code == 400) "الكود غلط أو خلص وقته — اطلب كود جديد من صفحة الموبايل" else "السيرفر رد ${e.code}") }
            } catch (e: Throwable) { main.post { done(null, "محتاج نت عشان الربط") } }
        }
    }
}
