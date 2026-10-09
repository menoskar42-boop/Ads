package com.oscardevs.speedguard

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.GnssStatus
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/**
 * خدمة فى المقدمة: بتفضل شغّالة والسواق فاتح الخرايط أو الأغانى. بتقرا الـGPS، بتحسب
 * السرعة (SpeedLogic)، بتنطق الإنذار، وبتسجّل المخالفات وتبعتها لصاحب الشركة.
 */
class SpeedService : Service() {

    /** الحالة اللى الشاشة بتعرضها — الشاشة بتسجّل listener وبتقرا من هنا. */
    object State {
        @Volatile var running = false
        @Volatile var speedKmh: Float? = null
        @Volatile var limitKmh = 90
        @Volatile var over = false
        @Volatile var satsUsed = 0
        @Volatile var satsSeen = 0
        @Volatile var accuracyM: Float? = null
        @Volatile var speedAccKmh: Float? = null
        @Volatile var pending = 0
        @Volatile var gpsEnabled = true
        var listener: (() -> Unit)? = null
    }

    private lateinit var prefs: Prefs
    private lateinit var lm: LocationManager
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val logic = SpeedLogic()
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var tone: ToneGenerator? = null
    private var focus: AudioFocusRequest? = null
    private var gnssCb: Any? = null
    private var lastSync = 0L
    private var lastNotify = 0L

    private val gpsListener = object : LocationListener {
        override fun onLocationChanged(loc: Location) = onLocation(loc)
        override fun onProviderEnabled(provider: String) { State.gpsEnabled = true; publish() }
        override fun onProviderDisabled(provider: String) { State.gpsEnabled = false; publish() }
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }
    // الشبكة: مابناخدش منها سرعة — وجودها بس بيخلّى النظام يجهّز بيانات المكان التقريبى
    // للـGPS (أول لقطة أسرع). القراءات نفسها بنتجاهلها.
    private val netListener = object : LocationListener {
        override fun onLocationChanged(loc: Location) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    private val tick = object : Runnable {
        override fun run() {
            handle(logic.onTick(System.currentTimeMillis()))
            State.speedKmh = logic.speedKmh
            publish()
            val now = System.currentTimeMillis()
            if (now - lastSync > SYNC_MS) { lastSync = now; sync() }
            main.postDelayed(this, 1000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }
        if (State.running) { publish(); return START_STICKY }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSelf(); return START_NOT_STICKY
        }
        startInForeground()
        State.running = true
        State.limitKmh = prefs.effectiveLimit
        State.pending = prefs.queue().length()
        initAudio()
        startGps()
        main.post(tick)
        sync()
        return START_STICKY
    }

    override fun onDestroy() {
        State.running = false
        State.speedKmh = null
        State.over = false
        main.removeCallbacksAndMessages(null)
        try { lm.removeUpdates(gpsListener) } catch (_: Exception) {}
        try { lm.removeUpdates(netListener) } catch (_: Exception) {}
        if (Build.VERSION.SDK_INT >= 24) (gnssCb as? GnssStatus.Callback)?.let { try { lm.unregisterGnssStatusCallback(it) } catch (_: Exception) {} }
        tts?.shutdown(); tts = null
        tone?.release(); tone = null
        // تجاوز مفتوح ساعة ما الخدمة اتقفلت يتسجّل
        handle(logic.onTick(Long.MAX_VALUE / 2))
        publish()
        io.shutdown()
        super.onDestroy()
    }

    /* ───────── GPS ───────── */

    @SuppressLint("MissingPermission")
    private fun startGps() {
        State.gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
        // A-GPS: نطلب من النظام يحقن الوقت وبيانات مدارات الأقمار من الإنترنت (XTRA/PSDS)
        // — الـGPS بيلقط الأقمار فى ثوانى بدل دقايق. لو الجهاز مابيدعمش الأمر، بيتجاهله.
        for (cmd in listOf("force_time_injection", "force_xtra_injection", "force_psds_injection")) {
            try { lm.sendExtraCommand(LocationManager.GPS_PROVIDER, cmd, null) } catch (_: Exception) {}
        }
        // minTime = 0: بأسرع ما الشريحة تقدر (١ لـ ١٠ مرات فى الثانية حسب الجهاز)
        lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, gpsListener, Looper.getMainLooper())
        if (lm.allProviders.contains(LocationManager.NETWORK_PROVIDER)) {
            try { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000L, 0f, netListener, Looper.getMainLooper()) } catch (_: Exception) {}
        }
        if (Build.VERSION.SDK_INT >= 24) {
            val cb = object : GnssStatus.Callback() {
                override fun onSatelliteStatusChanged(status: GnssStatus) {
                    var used = 0
                    for (i in 0 until status.satelliteCount) if (status.usedInFix(i)) used++
                    State.satsUsed = used
                    State.satsSeen = status.satelliteCount
                }
            }
            try { lm.registerGnssStatusCallback(cb, main); gnssCb = cb } catch (_: Exception) {}
        }
    }

    private fun onLocation(loc: Location) {
        val speedAcc = if (Build.VERSION.SDK_INT >= 26 && loc.hasSpeedAccuracy()) loc.speedAccuracyMetersPerSecond else null
        val fix = SpeedLogic.Fix(
            timeMs = System.currentTimeMillis(),
            speedMps = if (loc.hasSpeed()) loc.speed else null,
            lat = loc.latitude, lng = loc.longitude,
            accuracyM = if (loc.hasAccuracy()) loc.accuracy else null,
            speedAccuracyMps = speedAcc,
        )
        State.limitKmh = prefs.effectiveLimit
        handle(logic.onFix(fix, State.limitKmh))
        State.speedKmh = logic.speedKmh
        State.accuracyM = logic.lastAccuracyM
        State.speedAccKmh = logic.lastSpeedAccuracyKmh
        State.over = logic.inViolation
        publish()
    }

    private fun handle(events: List<SpeedLogic.Event>) {
        for (e in events) when (e) {
            is SpeedLogic.Event.Alert -> say(e.speedKmh, e.limitKmh, e.first)
            is SpeedLogic.Event.ViolationEnded -> record(e.v)
        }
    }

    /* ───────── الصوت ───────── */

    private fun initAudio() {
        try { tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100) } catch (_: Exception) {}
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val t = tts ?: return@TextToSpeech
                val r = t.setLanguage(Locale("ar", "EG"))
                val r2 = if (r < 0) t.setLanguage(Locale("ar")) else r
                ttsReady = r2 >= 0
                t.setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) {}
                    override fun onDone(id: String?) { abandonFocus() }
                    @Deprecated("Deprecated in Java")
                    override fun onError(id: String?) { abandonFocus() }
                })
            }
        }
    }

    /** بيوطّى صوت الأغانى وقت الإنذار وبيرجّعه بعده. */
    private fun requestFocus() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= 26) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).build()
            focus = req
            am.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        }
    }

    private fun abandonFocus() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= 26) focus?.let { am.abandonAudioFocusRequest(it) }
        else @Suppress("DEPRECATION") am.abandonAudioFocus(null)
    }

    fun say(speed: Int, limit: Int, first: Boolean) {
        try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP2, 400) } catch (_: Exception) {}
        val t = tts
        if (t != null && ttsReady) {
            requestFocus()
            val text = if (first) "انتبه. السرعة $speed. الحد $limit" else "هدّى السرعة. $speed"
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "alert-" + System.currentTimeMillis())
        }
    }

    /* ───────── المخالفات + الأسطول ───────── */

    private fun record(v: SpeedLogic.Violation) {
        if (!prefs.inFleet) return   // لوحده: الإنذار بس، مفيش حد يتبعتله
        prefs.enqueue(JSONObject()
            .put("uuid", v.uuid)
            .put("startedAt", iso(v.startedAtMs))
            .put("endedAt", iso(v.endedAtMs))
            .put("maxSpeed", v.maxSpeedKmh.toDouble())
            .put("speedLimit", v.limitKmh)
            .put("durationS", v.durationS)
            .put("lat", v.lat)
            .put("lng", v.lng))
        State.pending = prefs.queue().length()
        sync()
    }

    /** بيبعت الطابور وبيجيب الحد الحالى من الشركة — فى الخلفية، والفشل بيستنى الدورة الجاية. */
    private fun sync() {
        val token = prefs.fleetToken ?: return
        io.execute {
            val q: JSONArray = prefs.queue()
            if (q.length() > 0) {
                val batch = JSONArray()
                val ids = mutableSetOf<String>()
                for (i in 0 until minOf(q.length(), 200)) {
                    val o = q.optJSONObject(i) ?: continue
                    batch.put(o); ids += o.optString("uuid")
                }
                FleetApi.sendViolations(token, batch).onSuccess { lim ->
                    prefs.removeSent(ids)
                    if (lim in Prefs.LIMIT_MIN..Prefs.LIMIT_MAX) prefs.fleetLimit = lim
                }
            }
            FleetApi.config(token).onSuccess { c ->
                if (c.speedLimit in Prefs.LIMIT_MIN..Prefs.LIMIT_MAX) prefs.fleetLimit = c.speedLimit
                if (c.fleetName.isNotEmpty()) prefs.fleetName = c.fleetName
            }
            State.pending = prefs.queue().length()
            State.limitKmh = prefs.effectiveLimit
            main.post { publish() }
        }
    }

    /* ───────── الإشعار + الشاشة ───────── */

    private fun publish() {
        State.listener?.invoke()
        val now = System.currentTimeMillis()
        if (now - lastNotify > 2000) { lastNotify = now; notifyStatus() }
    }

    private fun notification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "مراقب السرعة", NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val sp = State.speedKmh?.let { "${it.toInt()} كم/س" } ?: "بيدوّر على GPS…"
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setSmallIcon(R.drawable.ic_notify)
            .setContentTitle("مراقب السرعة — الحد ${State.limitKmh}")
            .setContentText(sp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .build()
    }

    private fun startInForeground() {
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(NOTIF_ID, notification())
    }

    private fun notifyStatus() {
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, notification()) } catch (_: Exception) {}
    }

    companion object {
        const val ACTION_STOP = "com.oscardevs.speedguard.STOP"
        private const val CHANNEL = "speed"
        private const val NOTIF_ID = 7
        private const val SYNC_MS = 60_000L

        private fun iso(ms: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(ms))

        fun start(ctx: Context) {
            val i = Intent(ctx, SpeedService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, SpeedService::class.java).setAction(ACTION_STOP))
        }
    }
}
