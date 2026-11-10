package com.oscardevs.oscardrive

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
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.oscardevs.oscardrive.logic.Hazard
import com.oscardevs.oscardrive.logic.ApproxLocation
import com.oscardevs.oscardrive.logic.RoadMemory
import com.oscardevs.oscardrive.logic.SunTimes
import com.oscardevs.oscardrive.logic.TripLogic
import com.oscardevs.oscardrive.logic.Wellness
import java.util.Calendar

/**
 * قلب Oscar Drive وهو شغّال: خدمة فى المقدمة (بتفضل شغّالة والسواق فاتح الخرايط أو الأغانى)
 * بتقرا الـGPS وبتشغّل كل المحرّكات: السرعة والتنبيه · الرحلة · ذاكرة الطريق · الاستراحة · الليل/النهار.
 *
 * ⚠️ الكاميرا الخلفية: التطبيق مابيلمسهاش خالص — الشاشة نفسها بتفتحها مع المارشدير فوق أى تطبيق.
 */
class DriveService : Service() {

    /** الحالة اللى الشاشة بتعرضها. */
    object State {
        @Volatile var running = false
        @Volatile var gpsEnabled = true
        @Volatile var speedKmh: Float? = null
        @Volatile var limitKmh = 90
        @Volatile var over = false
        @Volatile var headingDeg: Float? = null
        @Volatile var lat: Double? = null
        @Volatile var lng: Double? = null
        @Volatile var accuracyM: Float? = null
        /** المكان الحالى من الشبكة (تقريبى) مش من الـGPS — للعرض بس. */
        @Volatile var approx = false
        @Volatile var satsUsed = 0
        @Volatile var tripActive = false
        @Volatile var tripKm = 0.0
        @Volatile var tripMovingS = 0L
        @Volatile var tripStartMs = 0L
        @Volatile var tripAvgKmh = 0f
        @Volatile var drivingMin = 0
        @Volatile var night = false
        /** رسالة كبيرة على الشاشة (تنبيه طريق / استراحة) لحد وقت معيّن. */
        @Volatile var banner: String? = null
        @Volatile var bannerKind = ""      // hazard · break · speed
        @Volatile var bannerUntil = 0L
        /** كام شاشة من شاشات أوسكار قدّام السواق (القيادة · الملاحة). صفر ⇒ التنبيه المكتوب بيطلع إشعار فوق أى تطبيق. */
        @Volatile var screens = 0
        var listener: (() -> Unit)? = null
        /** اتغيّرت ذاكرة الطريق (اتسجّل/اتمسح) — الخدمة تعيد قرايتها. */
        @Volatile var hazardsDirty = true
    }

    private lateinit var prefs: Prefs
    private lateinit var db: Db
    private lateinit var lm: LocationManager
    private val main = Handler(Looper.getMainLooper())
    private val speed = SpeedLogic()
    private val trip = TripLogic()
    private val wellness = Wellness()
    private var hazards: List<Hazard> = emptyList()
    private val warned = HashMap<Long, Long>()
    private var gnssCb: Any? = null
    private var lastNotify = 0L
    private var lastNightCheck = 0L
    private var gpsAnnounced = false
    private var lostAnnounced = false

    private val gpsListener = object : LocationListener {
        override fun onLocationChanged(loc: Location) = onLocation(loc)
        override fun onProviderEnabled(provider: String) { State.gpsEnabled = true; publish() }
        override fun onProviderDisabled(provider: String) { State.gpsEnabled = false; publish() }
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }
    private var lastGpsMs = 0L
    private var lastFixSaved = 0L
    @Volatile private var netLoc: Location? = null
    @Volatile private var netMs: Long? = null
    private val netListener = object : LocationListener {
        // بيتحفظ بس — بيتعرض لو الـGPS مش لاقط (ApproxLocation)، ومابيدخلش فى السرعة ولا الرحلة ولا الحماية
        override fun onLocationChanged(loc: Location) { netLoc = loc; netMs = System.currentTimeMillis() }
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    private val tick = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()
            handleSpeed(speed.onTick(now))
            trip.onTick(now)?.let { tripEnded(it) }
            State.speedKmh = speed.speedKmh
            useApprox(now)
            // الـGPS وقع وإحنا ماشيين (نفق/جراج) — مرة واحدة لحد ما يرجع
            if (gpsAnnounced && speed.speedKmh == null && trip.active && !lostAnnounced) { lostAnnounced = true; gpsAnnounced = false; Oscar.say("gps_lost") }
            val moving = (speed.speedKmh ?: 0f) >= TripLogic.MOVING_KMH
            wellness.everyMin = prefs.breakMin
            wellness.onTick(now, moving)?.let { min ->
                val msg = Wellness.message(min)
                showBanner("☕ $msg", "break", 20_000)
                Speaker.say(msg, beep = true)
            }
            State.drivingMin = wellness.drivenMinutes(now)
            syncTrip()
            if (now - lastNightCheck > 60_000) { lastNightCheck = now; updateNight(now) }
            Guard.tick()
            if (State.banner != null && now > State.bannerUntil) State.banner = null
            publish()
            main.postDelayed(this, 1000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        db = Db.get(this)
        lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        Speaker.init(this)
        Guard.init(this)
        Oscar.init(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopSelf(); return START_NOT_STICKY }
        if (intent?.action == ACTION_REFRESH_FGS && State.running) { startInForeground(); return START_STICKY }
        if (intent?.action == ACTION_RECORD && State.running) { Guard.record(intent.getIntExtra("sec", 20), "manual"); return START_STICKY }
        if (State.running) { publish(); return START_STICKY }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSelf(); return START_NOT_STICKY
        }
        startInForeground()
        State.running = true
        State.limitKmh = prefs.limit
        State.hazardsDirty = true
        updateNight(System.currentTimeMillis())
        recoverParking()
        startGps()
        Guard.onBoot()
        // «صباح الخير، جاهز ننطلق؟» — من جمل أوسكار المسجّلة
        Oscar.say(if (Calendar.getInstance().get(Calendar.HOUR_OF_DAY) in 4..14) "startup_morning" else "startup_evening")
        main.post(tick)
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
        handleSpeed(speed.onTick(Long.MAX_VALUE / 2))
        trip.forceEnd()?.let { tripEnded(it) }
        syncTrip()
        publish()
        super.onDestroy()
    }

    /* ───────── GPS ───────── */

    @SuppressLint("MissingPermission")
    private fun startGps() {
        State.gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
        // A-GPS: بيانات الأقمار من الإنترنت عشان أول لقطة تبقى فى ثوانى (نفس «مراقب السرعة»)
        for (cmd in listOf("force_time_injection", "force_xtra_injection", "force_psds_injection")) {
            try { lm.sendExtraCommand(LocationManager.GPS_PROVIDER, cmd, null) } catch (_: Exception) {}
        }
        try { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, gpsListener, Looper.getMainLooper()) } catch (_: Exception) {}
        if (lm.allProviders.contains(LocationManager.NETWORK_PROVIDER)) {
            try { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 10_000L, 0f, netListener, Looper.getMainLooper()) } catch (_: Exception) {}
        }
        if (Build.VERSION.SDK_INT >= 24) {
            val cb = object : GnssStatus.Callback() {
                override fun onSatelliteStatusChanged(status: GnssStatus) {
                    var used = 0
                    for (i in 0 until status.satelliteCount) if (status.usedInFix(i)) used++
                    State.satsUsed = used
                }
            }
            try { lm.registerGnssStatusCallback(cb, main); gnssCb = cb } catch (_: Exception) {}
        }
    }

    private fun useApprox(now: Long) {
        val n = netLoc
        if (n != null && ApproxLocation.useNetwork(now, lastGpsMs, netMs)) {
            State.approx = true
            State.lat = n.latitude; State.lng = n.longitude
            State.accuracyM = if (n.hasAccuracy()) n.accuracy else null
        } else if (State.approx) {
            State.approx = false
            if (now - lastGpsMs > ApproxLocation.GPS_STALE_MS) { State.lat = null; State.lng = null; State.accuracyM = null }
        }
    }

    private fun onLocation(loc: Location) {
        val now = System.currentTimeMillis()
        lastGpsMs = now
        State.approx = false
        val acc = if (loc.hasAccuracy()) loc.accuracy else null
        State.limitKmh = prefs.limit
        handleSpeed(speed.onFix(SpeedLogic.Fix(now, if (loc.hasSpeed()) loc.speed else null, loc.latitude, loc.longitude, acc,
            if (Build.VERSION.SDK_INT >= 26 && loc.hasSpeedAccuracy()) loc.speedAccuracyMetersPerSecond else null), State.limitKmh))
        val kmh = speed.speedKmh
        trip.onFix(now, loc.latitude, loc.longitude, kmh, acc, if (loc.hasBearing()) loc.bearing else null)
        State.speedKmh = kmh
        State.over = speed.inViolation
        if (!gpsAnnounced && kmh != null) { gpsAnnounced = true; lostAnnounced = false; Oscar.say("gps_ready") }
        State.headingDeg = trip.headingDeg
        State.lat = loc.latitude; State.lng = loc.longitude
        State.accuracyM = acc
        if (acc != null && acc <= 50f) { prefs.lastLat = loc.latitude; prefs.lastLng = loc.longitude }
        // آخر لقطة كويسة كل ١٠ ثوانى — لو الشاشة فصلت فجأة مع العربية، دى مكان الركنة المرة الجاية
        if (acc != null && acc <= 100f && now - lastFixSaved > 10_000) { lastFixSaved = now; prefs.saveLastFix(loc.latitude, loc.longitude, acc, now) }
        checkHazards(now, kmh ?: 0f)
        Guard.onLocation(loc, kmh ?: 0f)
        syncTrip()
        publish()
    }

    /* ───────── المحرّكات ───────── */

    private fun handleSpeed(events: List<SpeedLogic.Event>) {
        for (e in events) when (e) {
            is SpeedLogic.Event.Alert -> if (prefs.speedAlerts) {
                val text = if (e.first) "انتبه. السرعة ${e.speedKmh}. الحد ${e.limitKmh}" else "هدّى السرعة. ${e.speedKmh}"
                Speaker.say(text, beep = true)
            }
            // «حارس الطريق»: كل تجاوز بيتسجّل (الوقت · أقصى سرعة · المدة · المكان)
            is SpeedLogic.Event.ViolationEnded -> e.v.let { v ->
                db.addSpeeding(v.startedAtMs, v.endedAtMs, v.maxSpeedKmh, v.limitKmh, v.durationS, v.lat, v.lng)
            }
        }
    }

    private fun checkHazards(now: Long, kmh: Float) {
        if (!prefs.hazardAlerts) return
        if (State.hazardsDirty) { hazards = db.hazards(); State.hazardsDirty = false }
        val lat = State.lat ?: return
        val lng = State.lng ?: return
        val hit = RoadMemory.ahead(hazards, lat, lng, trip.headingDeg, kmh, now, warned) ?: return
        warned[RoadMemory.warnKey(hit.first, hit.second, kmh)] = now
        val msg = RoadMemory.warning(hit.first, hit.second)
        showBanner("${hit.first.type.emoji} $msg", "hazard", 8_000)
        Speaker.say(msg, beep = true)
    }

    private fun tripEnded(s: TripLogic.Summary) {
        db.addTrip(s)
        if (prefs.autoOdo) prefs.addOdoGps(s.distanceM / 1000.0)
        if (prefs.autoPark) db.park(s.endLat, s.endLng, State.accuracyM.takeIf { !State.approx }, prefs.odoKm.toInt())
    }

    /**
     * الشاشة بتفصل مع العربية فجأة (من غير ما الرحلة تخلص) ⇒ أول ما تفتح تانى: آخر لقطة GPS قبل ما تفصل
     * (لو أحدث من آخر ركنة وبعيدة عنها) تتحفظ ركنة بوقتها الحقيقى.
     */
    private fun recoverParking() {
        if (!prefs.autoPark) return
        val last = db.parkings().firstOrNull()?.spot()
        val spot = com.oscardevs.oscardrive.logic.Parking.recover(prefs.lastFix(), last) ?: return
        db.park(spot.lat, spot.lng, spot.accuracyM, spot.odoKm, spot.timeMs)
    }

    private fun syncTrip() {
        State.tripActive = trip.active
        State.tripKm = trip.distanceM / 1000.0
        State.tripMovingS = trip.movingMs / 1000
        State.tripStartMs = trip.startMs
        State.tripAvgKmh = trip.avgKmh
    }

    private fun updateNight(now: Long) {
        val lat = State.lat ?: prefs.lastLat
        val lng = State.lng ?: prefs.lastLng
        State.night = when (prefs.theme) {
            1 -> false
            2 -> true
            else -> if (lat != 0.0 || lng != 0.0) SunTimes.isNight(lat, lng, now)
                else SunTimes.isNightByClock(Calendar.getInstance().get(Calendar.HOUR_OF_DAY))
        }
    }

    private fun showBanner(text: String, kind: String, ms: Long) {
        State.banner = text; State.bannerKind = kind; State.bannerUntil = System.currentTimeMillis() + ms
        // خرايط جوجل (أو أى تطبيق تانى) قدّامك ⇒ إشعار بيطلع فوقه ثوانى ويختفى — من غير إذن «الظهور فوق التطبيقات».
        // الصوت نفسه شغّال من الخدمة فى كل الحالات، فالإشعار ساكت.
        if (State.screens <= 0) alertHeadsUp(text, ms)
    }

    private fun alertHeadsUp(text: String, ms: Long) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(ALERT_CHANNEL) == null) {
                nm.createNotificationChannel(NotificationChannel(ALERT_CHANNEL, "تنبيهات الطريق", NotificationManager.IMPORTANCE_HIGH).apply {
                    setSound(null, null); enableVibration(false)
                })
            }
            val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, ALERT_CHANNEL).setTimeoutAfter(ms)
                else @Suppress("DEPRECATION") Notification.Builder(this).setPriority(Notification.PRIORITY_HIGH)
            nm.notify(ALERT_ID, b.setSmallIcon(R.drawable.ic_notify).setContentTitle("Oscar Drive").setContentText(text)
                .setCategory(Notification.CATEGORY_NAVIGATION).setAutoCancel(true).setContentIntent(open).build())
        } catch (_: Exception) {}
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
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Oscar Drive", NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val sp = State.speedKmh?.let { "${it.toInt()} كم/س · الرحلة ${"%.1f".format(State.tripKm)} كم" } ?: "بيدوّر على GPS…"
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setSmallIcon(R.drawable.ic_notify)
            .setContentTitle("Oscar Drive — الحد ${State.limitKmh}")
            .setContentText(sp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .build()
    }

    /** location دايماً، وcamera كمان لو إذن الكاميرا متاح (تسجيل تنبيه السرقة والتطبيق فى الخلفية). */
    private fun startInForeground() {
        if (Build.VERSION.SDK_INT >= 30 && Guard.cam.permitted()) {
            try {
                startForeground(NOTIF_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
                return
            } catch (_: Exception) { /* بدأت من الخلفية (مع تشغيل العربية) — location بس */ }
        }
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(NOTIF_ID, notification())
    }

    private fun notifyStatus() {
        try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, notification()) } catch (_: Exception) {}
    }

    companion object {
        const val ACTION_STOP = "com.oscardevs.oscardrive.STOP"
        const val ACTION_REFRESH_FGS = "com.oscardevs.oscardrive.REFRESH_FGS"
        const val ACTION_RECORD = "com.oscardevs.oscardrive.RECORD"
        private const val CHANNEL = "drive"
        private const val NOTIF_ID = 17
        private const val ALERT_CHANNEL = "road_alerts"
        private const val ALERT_ID = 18

        fun start(ctx: Context) {
            val i = Intent(ctx, DriveService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }

        fun send(ctx: Context, action: String, sec: Int = 0) {
            try { ctx.startService(Intent(ctx, DriveService::class.java).setAction(action).putExtra("sec", sec)) } catch (_: Exception) {}
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, DriveService::class.java).setAction(ACTION_STOP))
        }
    }
}
