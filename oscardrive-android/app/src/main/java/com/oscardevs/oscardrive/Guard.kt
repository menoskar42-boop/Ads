package com.oscardevs.oscardrive

import android.content.Context
import android.location.Location
import android.os.Handler
import android.os.Looper
import com.oscardevs.oscardrive.logic.Pin
import com.oscardevs.oscardrive.logic.SecurityLogic
import com.oscardevs.oscardrive.logic.TrackPolicy
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

/**
 * «Oscar Security» على الشاشة (المالك ٢٠٢٦-١١-٠٥): بيشتغل جزئى من غير نت ويكمّل بالنت.
 *   • من غير نت: الـGPS بيسجّل المكان كل ١٠ ثوانى (ماشية) / دقيقة (واقفة) فى قاعدة الشاشة، وأحداث
 *     الحماية (اشتغلت · اتحركت من غير الرقم · رقم غلط) وتسجيلات الكاميرا بتتحفظ برضه.
 *   • أول ما أى نت يتوصل (هوت سبوت · أو نت السارق): كل اللى اتسجّل بيتبعت لـdrive.oscardevs.com،
 *     وصفحة الموبايل بتعرضه والإشعار بيوصل، والشاشة بتعرف لو المالك فعّل/قفل الحماية من الموبايل.
 * اختيارى بالكامل (securityOn) — مقفول = مفيش أى مكان بيتسجّل للإرسال ولا بيتبعت.
 */
object Guard {
    private lateinit var app: Context
    private lateinit var prefs: Prefs
    private lateinit var db: Db
    lateinit var cam: CamRecorder; private set
    val logic = SecurityLogic()
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var inited = false
    private var lastTrackMs = 0L
    private var lastSyncTry = 0L
    @Volatile private var syncing = false
    /** وقت الـGPS ناقص ساعة الشاشة — ساعة شاشات العربيات ممكن تبقى غلط لحد ما النت ييجى. */
    @Volatile private var clockOffset = 0L
    @Volatile var lastError: String? = null; private set
    var listener: (() -> Unit)? = null

    fun init(ctx: Context) {
        if (inited) return
        app = ctx.applicationContext; prefs = Prefs(app); db = Db.get(app); cam = CamRecorder(app)
        inited = true
    }

    val on: Boolean get() = inited && prefs.securityOn
    fun now(): Long = System.currentTimeMillis() + clockOffset

    /** الشاشة اشتغلت (الخدمة بدأت). */
    fun onBoot() {
        if (!on) return
        handle(logic.onBoot(now(), prefs.armed))
        syncSoon()
    }

    fun onLocation(loc: Location, kmh: Float) {
        if (!on) return
        if (loc.time > 1_600_000_000_000L) clockOffset = loc.time - System.currentTimeMillis()
        val acc = if (loc.hasAccuracy()) loc.accuracy else null
        val t = now()
        if (TrackPolicy.due(lastTrackMs, t, kmh) && (acc == null || acc <= 100f)) {
            db.addTrack(if (loc.time > 0) loc.time else t, loc.latitude, loc.longitude, kmh,
                if (loc.hasBearing()) loc.bearing else null, acc)
            lastTrackMs = t
        }
        handle(logic.onFix(t, loc.latitude, loc.longitude, kmh, acc))
    }

    /** كل ثانية من الخدمة. */
    fun tick() {
        if (!on) return
        handle(logic.tick(now()))
        if (System.currentTimeMillis() - lastSyncTry >= SYNC_EVERY_MS) syncSoon()
    }

    fun pinSet(): Boolean = inited && prefs.pinHash != null
    fun setPin(pin: String): Boolean {
        if (!Pin.valid(pin)) return false
        prefs.pinHash = Pin.hash(pin, prefs.pinSalt); return true
    }
    fun checkPin(pin: String): Boolean = prefs.pinHash != null && Pin.hash(pin, prefs.pinSalt) == prefs.pinHash

    /** السواق كتب الرقم على الشاشة. */
    fun tryPin(pin: String): Boolean {
        val ok = checkPin(pin)
        handle(logic.onPin(ok))
        return ok
    }

    /** تفعيل/قفل الحماية من الشاشة (القفل محتاج الرقم — الشاشة بتسأل قبلها). */
    fun setArmedFromCar(v: Boolean) {
        prefs.armed = v; prefs.armPending = true
        handle(logic.setArmed(v, fromCar = true))
        if (v) logic.onPin(true)   // اللى فعّلها من الشاشة هو اللى سايق دلوقتى — مايتطلبش منه الرقم فى نفس التشغيلة
        syncSoon()
    }

    private fun handle(evs: List<SecurityLogic.Event>) {
        if (evs.isEmpty()) return
        val s = DriveService.State
        for (e in evs) {
            db.addSecEvent(UUID.randomUUID().toString(), now(), e.kind.key, e.lat ?: s.lat, e.lng ?: s.lng)
            if (e.kind == SecurityLogic.Kind.ARMED_MOVE && prefs.recordOnAlarm) record(30, "alarm")
        }
        listener?.invoke()
        syncSoon()
    }

    /** تسجيل كاميرا (تنبيه سرقة أو يدوى). */
    fun record(seconds: Int, reason: String, done: ((String?) -> Unit)? = null) {
        val started = now()
        cam.record(seconds) { file, err ->
            main.post {
                if (file != null) {
                    val id = UUID.randomUUID().toString()
                    db.addClip(id, started, file.absolutePath, seconds, file.length(), reason)
                    db.addSecEvent(UUID.randomUUID().toString(), started, "clip", DriveService.State.lat, DriveService.State.lng,
                        JSONObject().put("reason", reason).toString())
                } else {
                    db.addSecEvent(UUID.randomUUID().toString(), started, "camera_error", null, null,
                        JSONObject().put("error", (err ?: "").take(200)).toString())
                }
                listener?.invoke()
                done?.invoke(err)
                syncSoon()
            }
        }
    }

    fun syncSoon() {
        if (!on || syncing) return
        syncing = true
        lastSyncTry = System.currentTimeMillis()
        io.execute {
            var more = false
            try { more = syncOnce() } catch (e: Cloud.HttpError) {
                lastError = "السيرفر رد ${e.code}"
                if (e.code == 401) prefs.deviceToken = null   // الجهاز اتمسح من السيرفر — يتسجّل تانى
            } catch (e: Exception) { lastError = "مفيش نت — البيانات محفوظة على الشاشة" }
            syncing = false
            main.post { listener?.invoke() }
            if (more) main.postDelayed({ syncSoon() }, 2000)
        }
    }

    /** دفعة واحدة. بترجع true لو لسه فيه نقط مستنية. */
    private fun syncOnce(): Boolean {
        val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
        val pts = db.pendingTrack(BATCH)
        val evs = db.unsentSecEvents()
        val clips = db.unsyncedClips()
        val body = JSONObject().put("app", BuildConfig.VERSION_NAME)
        body.put("points", JSONArray().also { a ->
            for (p in pts) a.put(JSONObject().put("t", p.t).put("lat", p.lat).put("lng", p.lng)
                .apply { p.s?.let { put("s", it.toDouble()) }; p.h?.let { put("h", it.toDouble()) }; p.a?.let { put("a", it.toDouble()) } })
        })
        body.put("events", JSONArray().also { a ->
            for (e in evs) a.put(JSONObject().put("uuid", e.uuid).put("kind", e.kind).put("t", e.t)
                .apply { e.lat?.let { put("lat", it) }; e.lng?.let { put("lng", it) }; put("detail", try { JSONObject(e.detail) } catch (_: Exception) { JSONObject() }) })
        })
        body.put("clips", JSONArray().also { a ->
            for (c in clips) a.put(JSONObject().put("uuid", c.uuid).put("t", c.t).put("sec", c.sec).put("bytes", c.bytes).put("reason", c.reason))
        })
        val pending = prefs.armPending
        if (pending) body.put("arm", JSONObject().put("armed", prefs.armed).put("baseVer", prefs.armedVer))
        val r = Cloud.sync(token, body)
        pts.lastOrNull()?.let { db.dropTrackUpTo(it.id) }
        db.markSecSent(evs.map { it.id })
        db.markClipsSynced(clips.map { it.id })
        val serverArmed = r.optBoolean("armed", prefs.armed)
        prefs.armedVer = r.optInt("armedVer", prefs.armedVer)
        prefs.armPending = false
        r.optString("name").takeIf { it.isNotBlank() }?.let { prefs.carName = it }
        if (serverArmed != prefs.armed || serverArmed != logic.armed) {
            prefs.armed = serverArmed
            main.post { logic.setArmed(serverArmed, fromCar = false); listener?.invoke() }
        }
        prefs.lastSyncMs = System.currentTimeMillis()
        lastError = null
        return pts.size >= BATCH
    }

    /** كود ربط الموبايل (محتاج نت). */
    fun pairCode(done: (String?, String?) -> Unit) {
        io.execute {
            try {
                val token = prefs.deviceToken ?: Cloud.register(BuildConfig.VERSION_NAME).also { prefs.deviceToken = it }
                val code = Cloud.pairCode(token)
                main.post { done(code, null) }
            } catch (e: Exception) { main.post { done(null, "محتاج نت عشان كود الربط") } }
        }
    }

    fun pendingPoints(): Long = if (inited) db.trackCount() else 0

    private const val SYNC_EVERY_MS = 30_000L
    private const val BATCH = 1000
}
