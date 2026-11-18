package com.oscardevs.oscardrive

import android.content.Context
import com.oscardevs.oscardrive.logic.HazardType
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * ذاكرة الطريق على السيرفر (المالك ٢٠٢٦-١١-١٨ — docs/OSCAR_DRIVE_AUDIT_REPORT.md البند C1): المطبات والحفر والرادارات كانت على
 * الشاشة بس وبتضيع لما التطبيق يتمسح. دلوقتى كل تسجيل/مسح بيترفع لـdrive.oscardevs.com بالـuuid (الدفعة اللى بتتبعت مرتين
 * مابتتكررش)، ولو مفيش نت بيستنى ويترفع بعدين. وأول مزامنة فى كل تشغيل بتنزّل ذاكرة العربية من السيرفر وتضيف الناقص بس.
 * شغّال لوحده من غير «الحماية» — وتقدر تقفله من الإعدادات (prefs.cloudHazards).
 */
object HazardSync {
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var running = false
    @Volatile private var again = false
    @Volatile private var pulled = false
    @Volatile var lastOkMs = 0L; private set
    @Volatile var lastError: String? = null; private set
    private const val BATCH = 200

    /** اترفع/اتنزّل حاجة؟ (للإعدادات) */
    var listener: (() -> Unit)? = null

    fun syncSoon(ctx: Context, pull: Boolean = false) {
        val app = ctx.applicationContext
        val prefs = Prefs(app)
        if (!prefs.cloudHazards) return
        if (pull) pulled = false
        if (running) { again = true; return }
        running = true
        io.execute {
            do {
                again = false
                try { syncOnce(app, prefs); lastError = null; lastOkMs = System.currentTimeMillis() }
                catch (e: Cloud.HttpError) {
                    lastError = "السيرفر رد ${e.code}"
                    if (e.code == 401) prefs.deviceToken = null   // الجهاز اتشال من السيرفر — يتسجّل تانى المرة الجاية
                } catch (e: Exception) { lastError = "مفيش نت — المطبات محفوظة على الشاشة وهتترفع بعدين" }
            } while (again && lastError == null)
            running = false
            listener?.invoke()
        }
    }

    private fun syncOnce(app: Context, prefs: Prefs) {
        val db = Db.get(app)
        // شاشة جديدة لسه ماسجّلتش حاجة: مفيش داعى تتسجّل على السيرفر (ومفيش حاجة تنزل — الربط بالعربية القديمة بيبقى بالكود)
        if (prefs.deviceToken == null && db.pendingHazards() == 0) { pulled = true; return }
        val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
        var rounds = 0
        while (true) {
            val rows = db.unsyncedHazards(BATCH)
            val wantPull = !pulled && rows.size < BATCH
            if (rows.isEmpty() && pulled) return
            val body = JSONObject().put("items", JSONArray().also { a -> for (h in rows) a.put(json(h)) })
            if (wantPull) body.put("pull", true)
            val r = Cloud.hazards(token, body)
            db.markHazardsSynced(rows.map { it.id })
            if (wantPull) { merge(db, r.optJSONArray("items")); pulled = true }
            if (rows.size < BATCH || ++rounds >= 25) break
        }
        DriveService.State.hazardsDirty = true
    }

    private fun json(h: Db.HazardRow) = JSONObject().put("uuid", h.uuid).put("type", h.type).put("lat", h.lat).put("lng", h.lng)
        .put("t", h.createdMs).put("note", h.note).put("deleted", h.deleted).apply {
            h.bearing?.let { put("bearing", it.toDouble()) }; h.accuracy?.let { put("acc", it.toDouble()) }; h.altitude?.let { put("alt", it) }
        }

    /** اللى على السيرفر ومش على الشاشة بيتضاف (اتعلّم «مترفوع»). اللى على الشاشة — حتى الممسوح — مابيتلمسش. */
    private fun merge(db: Db, items: JSONArray?) {
        if (items == null || items.length() == 0) return
        val have = db.hazardUuids()
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val uuid = o.optString("uuid"); if (uuid.isBlank() || uuid in have) continue
            db.addHazard(HazardType.of(o.optString("type")), o.optDouble("lat"), o.optDouble("lng"),
                if (o.isNull("bearing") || !o.has("bearing")) null else o.optDouble("bearing").toFloat(),
                if (o.isNull("acc") || !o.has("acc")) null else o.optDouble("acc").toFloat(),
                if (o.isNull("alt") || !o.has("alt")) null else o.optDouble("alt"),
                uuid = uuid, createdMs = o.optLong("t", System.currentTimeMillis()), note = o.optString("note", ""), synced = true)
        }
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
                pulled = false
                main.post { done(r.optString("name"), null); syncSoon(app, pull = true) }
            } catch (e: Cloud.HttpError) {
                main.post { done(null, if (e.code == 400) "الكود غلط أو خلص وقته — اطلب كود جديد من صفحة الموبايل" else "السيرفر رد ${e.code}") }
            } catch (e: Exception) { main.post { done(null, "محتاج نت عشان الربط") } }
        }
    }
}
