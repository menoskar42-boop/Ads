package com.oscardevs.oscardrive

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.oscardevs.oscardrive.logic.Hazard
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/**
 * صور الطريق لتدريب موديل المطبات (المالك ٢٠٢٦-١١-١٨): «اوسكار اسكرين شوت» · زرار «📸 صوّر الطريق» · ولوحدها لما أوسكار ينبّه على
 * مطب/حفرة متسجّلة (ShotPlan: ٨٠ و٥٠ و٢٥ متر قبلها). كل صورة بتتحفظ على الشاشة الأول (shots/<id>.jpg + <id>.json فيه المكان والسرعة
 * والاتجاه والمطب والمسافة)، وبتترفع لـdrive.oscardevs.com أول ما يبقى فيه نت، وكلود بيراجعها قبل ما تدخل التدريب.
 * بعد الرفع الـjpg بيتمسح من الشاشة (الـjson بيفضل ‎.sent‎). مابنحتفظش بأكتر من ٨٠٠ صورة مستنية.
 */
object Shots {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var uploading = false
    const val MAX_PENDING = 800

    fun dir(ctx: Context): File = (ctx.getExternalFilesDir("shots") ?: File(ctx.filesDir, "shots")).also { it.mkdirs() }

    /** reason: voice · button · bump_approach. done(err) على الـmain thread. */
    fun take(ctx: Context, reason: String, hazard: Hazard? = null, distanceM: Double? = null, done: ((String?) -> Unit)? = null) {
        val app = ctx.applicationContext
        Guard.init(app)
        val s = DriveService.State
        val t = System.currentTimeMillis()
        Guard.cam.snap { bytes, orientation, err ->
            if (bytes == null) { main.post { done?.invoke(err) }; return@snap }
            io.execute {
                try {
                    val id = UUID.randomUUID().toString()
                    val d = dir(app)
                    File(d, "$id.jpg").writeBytes(bytes)
                    val meta = JSONObject().put("uuid", id).put("t", t).put("reason", reason).put("orientation", orientation)
                        .put("app", BuildConfig.VERSION_NAME)
                    s.lat?.let { meta.put("lat", it) }; s.lng?.let { meta.put("lng", it) }
                    s.speedKmh?.let { meta.put("kmh", it.toDouble()) }; s.headingDeg?.let { meta.put("heading", it.toDouble()) }
                    s.accuracyM?.let { meta.put("acc", it.toDouble()) }
                    if (hazard != null) meta.put("hazard", JSONObject().put("id", hazard.id).put("type", hazard.type.key)
                        .put("lat", hazard.lat).put("lng", hazard.lng))
                    if (distanceM != null) meta.put("distanceM", Math.round(distanceM).toInt())
                    File(d, "$id.json").writeText(meta.toString())
                    trim(d)
                    main.post { done?.invoke(null) }
                } catch (e: Exception) { main.post { done?.invoke("ماقدرتش أحفظ الصورة") } }
                uploadSoon(app)
            }
        }
    }

    /** عدد الصور اللى لسه ماترفعتش. */
    fun pending(ctx: Context): Int = dir(ctx).listFiles { f -> f.name.endsWith(".json") }?.size ?: 0

    fun uploadSoon(ctx: Context) {
        if (uploading) return
        uploading = true
        val app = ctx.applicationContext
        io.execute {
            try {
                val prefs = Prefs(app)
                val d = dir(app)
                val metas = d.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.lastModified() }.orEmpty()
                for (m in metas.take(30)) {
                    val jpg = File(d, m.name.removeSuffix(".json") + ".jpg")
                    if (!jpg.exists()) { m.delete(); continue }
                    val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
                    val body = JSONObject().put("meta", JSONObject(m.readText()))
                        .put("jpg", Base64.encodeToString(jpg.readBytes(), Base64.NO_WRAP))
                    try { Cloud.shot(token, body) } catch (e: Cloud.HttpError) {
                        if (e.code == 401) prefs.deviceToken = null
                        if (e.code == 400 || e.code == 413) { jpg.delete(); m.renameTo(File(d, m.name + ".bad")); continue }   // ماتتعادش للأبد
                        throw e
                    }
                    jpg.delete()
                    m.renameTo(File(d, m.name.removeSuffix(".json") + ".sent"))
                }
            } catch (_: Exception) { /* مفيش نت — هتترفع بعدين */ }
            uploading = false
        }
    }

    /** لو الصور المستنية كترت (شاشة من غير نت فترة طويلة) بنمسح الأقدم. */
    private fun trim(d: File) {
        val metas = d.listFiles { f -> f.name.endsWith(".json") }?.sortedByDescending { it.lastModified() } ?: return
        for (m in metas.drop(MAX_PENDING)) { File(d, m.name.removeSuffix(".json") + ".jpg").delete(); m.delete() }
        val sent = d.listFiles { f -> f.name.endsWith(".sent") || f.name.endsWith(".bad") }?.sortedByDescending { it.lastModified() } ?: return
        for (f in sent.drop(2000)) f.delete()
    }
}
