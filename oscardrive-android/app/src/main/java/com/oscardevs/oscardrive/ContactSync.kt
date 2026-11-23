package com.oscardevs.oscardrive

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * مزامنة الجهات التي وافق المالك على مشاركتها مع صفحة الموبايل.
 * عند إيقافها، تظل قاعدة الشاشة المحلية كما هي ولا تُرسل أي جهة.
 */
object ContactSync {
    data class Result(val ok: Boolean, val enabled: Boolean, val message: String)

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var lastAttemptMs = 0L
    private var pendingSync: Runnable? = null

    fun syncSoon(ctx: Context, force: Boolean = false) {
        val app = ctx.applicationContext
        synchronized(this) {
            pendingSync?.let(main::removeCallbacks)
            pendingSync = Runnable { sync(app, force = force) }.also { main.postDelayed(it, 1500) }
        }
    }

    fun sync(
        ctx: Context,
        enable: Boolean = false,
        disable: Boolean = false,
        force: Boolean = false,
        done: ((Result) -> Unit)? = null,
    ) {
        val app = ctx.applicationContext
        val now = System.currentTimeMillis()
        if (!enable && !disable && !force && now - lastAttemptMs < 60_000L) return
        lastAttemptMs = now
        io.execute {
            val prefs = Prefs(app)
            try {
                var token = prefs.deviceToken
                if (token.isNullOrBlank()) {
                    if (!enable) {
                        main.post { done?.invoke(Result(false, false, "اربط الشاشة بالموبايل أولًا.")) }
                        return@execute
                    }
                    token = Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
                }
                val authToken = token ?: throw IllegalStateException("missing device token")
                fun localItems(): JSONArray {
                    val items = JSONArray()
                    for (contact in Db.get(app).contactsForSync().take(1000)) {
                        items.put(JSONObject()
                            .put("id", contact.id)
                            .put("name", contact.name)
                            .put("tels", JSONArray(contact.tels))
                            .put("updatedMs", contact.updatedMs)
                            .put("deleted", contact.deleted))
                    }
                    return items
                }
                val response = when {
                    disable -> Cloud.contacts(authToken, JSONObject().put("disable", true))
                    enable -> Cloud.contacts(authToken, JSONObject().put("enable", true).put("items", localItems()))
                    else -> {
                        // Check consent using an empty payload first. Never send local contacts unless
                        // the server confirms this car has already enabled sharing.
                        val status = Cloud.contacts(authToken, JSONObject().put("items", JSONArray()))
                        if (!status.optBoolean("enabled", false)) status
                        else Cloud.contacts(authToken, JSONObject().put("items", localItems()))
                    }
                }
                val enabled = response.optBoolean("enabled", false)
                if (enabled) {
                    val remote = mutableListOf<Db.SyncContact>()
                    val array = response.optJSONArray("items") ?: JSONArray()
                    for (i in 0 until array.length()) {
                        val item = array.optJSONObject(i) ?: continue
                        val telsJson = item.optJSONArray("tels") ?: item.optJSONArray("phones") ?: JSONArray()
                        val tels = (0 until telsJson.length()).map { telsJson.optString(it) }.filter { it.isNotBlank() }
                        remote.add(Db.SyncContact(
                            id = item.optString("id"),
                            name = item.optString("name"),
                            tels = tels,
                            updatedMs = item.optLong("updatedMs", System.currentTimeMillis()),
                            deleted = item.optBoolean("deleted", false),
                        ))
                    }
                    val map = mutableMapOf<String, String>()
                    val idMap = response.optJSONObject("idMap")
                    if (idMap != null) {
                        val keys = idMap.keys()
                        while (keys.hasNext()) {
                            val key = keys.next()
                            map[key] = idMap.optString(key)
                        }
                    }
                    Db.get(app).mergeContactSync(remote, map)
                }
                main.post {
                    done?.invoke(Result(true, enabled,
                        if (disable) "اتوقفت المزامنة؛ النسخ المحلية مازالت موجودة."
                        else if (enabled) "جهات الاتصال متزامنة مع أجهزة السيارة المرتبطة."
                        else "المزامنة غير مفعّلة؛ لم تُرسل جهات الاتصال."))
                }
            } catch (e: Cloud.HttpError) {
                if (e.code == 401) prefs.deviceToken = null
                main.post { done?.invoke(Result(false, false, "السيرفر رد ${e.code}؛ القائمة المحلية لم تتغير.")) }
            } catch (_: Throwable) {
                main.post { done?.invoke(Result(false, false, "مفيش اتصال؛ القائمة محفوظة على الشاشة.")) }
            }
        }
    }
}
