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
        /** ارتفاع الـGPS (م) — بيتسجّل مع المطب (فلتر الكوبرى بعدين). */
        @Volatile var altitudeM: Double? = null
        /** دقة الارتفاع (م) لو الجهاز بيقولها (API 26+). */
        @Volatile var vAccM: Float? = null
        /** المكان الحالى من الشبكة (تقريبى) مش من الـGPS — للعرض بس. */
        @Volatile var approx = false
        @Volatile var satsUsed = 0
        /** مصادر الـGPS (المرحلة ٢): «الشاشة بس» · «الشاشة + موبايل» … — عرض بس. */
        @Volatile var gpsSources = ""
        /** التنبيهات شغّالة بمكان من: الشاشة · دمج · الموبايل. */
        @Volatile var posSource = ""
        @Volatile var companions: List<com.oscardevs.oscardrive.logic.CompanionTracker.Status> = emptyList()
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
        /** المؤقّت (المرحلة ٥): وقت ما يخلص (٠ = مفيش). وساعة الإيقاف: بدأت إمتى (٠ = واقفة) + اللى اتعدّ قبل كده. */
        @Volatile var timerEndMs = 0L
        @Volatile var swStartMs = 0L
        @Volatile var swAccumMs = 0L
        /** الملاحة جوه أوسكار قدّامك (المرحلة ٧: الردود أقصر). */
        @Volatile var navActive = false
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
    /** المرحلة ٧: فرملة/تسارع مفاجئ + تجاوزات الرحلة دى — بتتعدّ فى صمت والدرجة بعد ما الرحلة تخلص. */
    private val harsh = com.oscardevs.oscardrive.logic.HarshDetector()
    private var tripSpeedingN = 0
    private var tripSpeedingS = 0
    private var wasTripActive = false
    private val wellness = Wellness()
    private var hazards: List<Hazard> = emptyList()
    private val warned = HashMap<Long, Long>()
    /** صور المطب اللى أوسكار نبّه عليه (٨٠/٥٠/٢٥ متر) — لتدريب موديل المطبات. */
    private var shotPlan: com.oscardevs.oscardrive.logic.ShotPlan? = null
    private var shotHazard: Hazard? = null
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

    private var lastHazardSync = System.currentTimeMillis()

    /*
     * الموبايلات اللى بتشارك GPS (المرحلة ٢): كل ٢ ث لو فيه موبايل شارك فى آخر دقيقة، وإلا كل ١٥ ث — والشاشة مش مربوطة بالسيرفر ⇒ مفيش طلبات.
     * عرض بس (مؤشر مصادر الـGPS) — مكان العربية والتنبيهات فاضلين من GPS الشاشة لحد ما المالك يجرّب ويوافق.
     */
    private val compTracker = com.oscardevs.oscardrive.logic.CompanionTracker()
    private val compIo = java.util.concurrent.Executors.newSingleThreadExecutor()
    @Volatile private var compBusy = false
    private var lastCompPoll = 0L
    private var lastCompSeen = 0L
    private fun pollCompanions(now: Long) {
        val carGps = State.lat != null && !State.approx
        val token = prefs.deviceToken
        if (token == null || State.gpsSources.isEmpty()) State.gpsSources = com.oscardevs.oscardrive.logic.CompanionTracker.summary(State.companions, carGps)
        if (token == null) return
        val every = if (now - lastCompSeen < 60_000L) 2_000L else 15_000L
        if (compBusy || now - lastCompPoll < every) return
        lastCompPoll = now; compBusy = true
        compIo.execute {
            val fixes = try {
                val resp = Cloud.companions(token)
                if (resp.optBoolean("inbox")) main.post { HazardSync.syncSoon(this@DriveService) }   // «📲 ابعت للشاشة»: فيه حاجة جديدة من الموبايل
                val a = resp.optJSONArray("devices")
                (0 until (a?.length() ?: 0)).mapNotNull { i -> a!!.optJSONObject(i)?.let { o ->
                    com.oscardevs.oscardrive.logic.CompanionFix(o.optLong("id"), o.optString("label", "موبايل"), o.optDouble("lat"), o.optDouble("lng"),
                        o.optDouble("acc", 50.0).toFloat(), if (o.isNull("speed")) null else o.optDouble("speed").toFloat(),
                        if (o.isNull("heading")) null else o.optDouble("heading").toFloat(), o.optLong("ageMs"))
                } }
            } catch (_: Throwable) { null }
            main.post {
                compBusy = false
                if (fixes == null) return@post
                if (fixes.isNotEmpty()) lastCompSeen = System.currentTimeMillis()
                val st = compTracker.update(fixes, if (State.approx) null else State.lat, if (State.approx) null else State.lng,
                    State.accuracyM, State.speedKmh, State.headingDeg)
                State.companions = st
                State.gpsSources = com.oscardevs.oscardrive.logic.CompanionTracker.summary(st, State.lat != null && !State.approx) +
                    (if (prefs.useCompanionGps && st.any { it.trusted } && State.posSource.isNotEmpty()) " · المكان من: ${State.posSource}" else "")
                // GPS الشاشة واقف (نفق/الشاشة مالهاش إشارة) والموبايل موثوق ⇒ التنبيهات تكمّل بمكان الموبايل
                val now2 = System.currentTimeMillis()
                if (prefs.useCompanionGps && now2 - lastGpsMs > 5_000L) {
                    val ph = st.filter { it.trusted }.minByOrNull { it.accM }
                    if (ph != null) checkHazards(now2, ph.kmh ?: 0f, fromPhone = true)
                }
            }
        }
    }
    private val tick = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()
            handleSpeed(speed.onTick(now))
            if (now - lastHazardSync > 10 * 60_000L) { lastHazardSync = now; HazardSync.syncSoon(this@DriveService) }
            pollCompanions(now)
            trip.onTick(now)?.let { tripEnded(it) }
            State.speedKmh = speed.speedKmh
            useApprox(now)
            // الـGPS وقع وإحنا ماشيين (نفق/جراج) — مرة واحدة لحد ما يرجع
            if (gpsAnnounced && speed.speedKmh == null && trip.active && !lostAnnounced) { lostAnnounced = true; gpsAnnounced = false; Oscar.say("gps_lost", kind = com.oscardevs.oscardrive.logic.SpeechKind.INFO) }
            val moving = (speed.speedKmh ?: 0f) >= TripLogic.MOVING_KMH
            wellness.everyMin = prefs.breakMin
            wellness.onTick(now, moving)?.let { min ->
                val msg = Wellness.message(min)
                showBanner("☕ $msg", "break", 20_000)
                Speaker.say(msg, beep = true, kind = com.oscardevs.oscardrive.logic.SpeechKind.INFO)
            }
            State.drivingMin = wellness.drivenMinutes(now)
            syncTrip()
            if (now - lastNightCheck > 60_000) { lastNightCheck = now; updateNight(now) }
            Guard.tick()
            // المؤقّت + التذكيرات بالوقت (المرحلة ٥) — من نفس الخدمة، من غير خدمة ولا منبّه زيادة
            if (State.timerEndMs in 1..now) {
                State.timerEndMs = 0
                showBanner("⏰ المؤقّت خلص", "break", 15_000); Speaker.say("المؤقّت خلص", beep = true, kind = com.oscardevs.oscardrive.logic.SpeechKind.INFO)
            }
            if (now - lastRemCheck > 5_000) { lastRemCheck = now; checkReminders(now, null, null) }
            Speaker.flushWaiting()   // اللى استنى المكالمة تخلص
            if (State.banner != null && now > State.bannerUntil) State.banner = null
            publish()
            main.postDelayed(this, 1000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
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
        HazardSync.syncSoon(this, pull = true)   // ذاكرة الطريق: يرفع اللى مااترفعش وينزّل الناقص (من غير نت = بعدين)
        watchNetwork()
        Guard.onBoot()
        // «صباح الخير، جاهز ننطلق؟» — من جمل أوسكار المسجّلة
        Oscar.say(if (Calendar.getInstance().get(Calendar.HOUR_OF_DAY) in 4..14) "startup_morning" else "startup_evening",
            kind = com.oscardevs.oscardrive.logic.SpeechKind.CHATTER)
        main.post(tick)
        return START_STICKY
    }

    /** النت رجع (هوت سبوت/واى فاى) ⇒ مزامنة ذاكرة الطريق على طول بدل ما تستنى الـ١٠ دقايق. */
    private var netCb: Any? = null
    private fun watchNetwork() {
        if (Build.VERSION.SDK_INT < 24 || netCb != null) return
        try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val cb = object : android.net.ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: android.net.Network) {
                    main.postDelayed({ HazardSync.syncSoon(this@DriveService) }, 3000)   // نستنى الـDNS يجهز
                }
            }
            cm.registerDefaultNetworkCallback(cb); netCb = cb
        } catch (_: Exception) { /* مفيش — الـ١٠ دقايق كفاية */ }
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= 24) (netCb as? android.net.ConnectivityManager.NetworkCallback)?.let {
            try { (getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager).unregisterNetworkCallback(it) } catch (_: Exception) {}
        }
        netCb = null
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
        if (trip.active && !wasTripActive) { harsh.reset(); tripSpeedingN = 0; tripSpeedingS = 0 }
        wasTripActive = trip.active
        if (trip.active) harsh.onFix(now, kmh, acc)   // فى صمت — مفيش كلام عن السواقة وإنت سايق
        State.speedKmh = kmh
        State.over = speed.inViolation
        if (!gpsAnnounced && kmh != null) { gpsAnnounced = true; lostAnnounced = false; Oscar.say("gps_ready", kind = com.oscardevs.oscardrive.logic.SpeechKind.CHATTER) }
        State.headingDeg = trip.headingDeg
        State.lat = loc.latitude; State.lng = loc.longitude
        State.accuracyM = acc
        State.altitudeM = if (loc.hasAltitude()) loc.altitude else null
        State.vAccM = if (Build.VERSION.SDK_INT >= 26 && loc.hasVerticalAccuracy()) loc.verticalAccuracyMeters else null
        if (acc != null && acc <= 50f) { prefs.lastLat = loc.latitude; prefs.lastLng = loc.longitude }
        // آخر لقطة كويسة كل ١٠ ثوانى — لو الشاشة فصلت فجأة مع العربية، دى مكان الركنة المرة الجاية
        if (acc != null && acc <= 100f && now - lastFixSaved > 10_000) { lastFixSaved = now; prefs.saveLastFix(loc.latitude, loc.longitude, acc, now) }
        checkHazards(now, kmh ?: 0f)
        approachShots(now, loc.latitude, loc.longitude)
        // «فكرنى لما أوصل البيت»: كل ١٥ ثانية من الـGPS
        if (now - lastPlaceCheck > 15_000) { lastPlaceCheck = now; checkReminders(now, loc.latitude, loc.longitude) }
        Guard.onLocation(loc, kmh ?: 0f)
        syncTrip()
        publish()
    }

    /* ───────── المحرّكات ───────── */

    private fun handleSpeed(events: List<SpeedLogic.Event>) {
        for (e in events) when (e) {
            is SpeedLogic.Event.Alert -> if (prefs.speedAlerts) {
                val text = if (e.first) "انتبه. السرعة ${e.speedKmh}. الحد ${e.limitKmh}" else "هدّى السرعة. ${e.speedKmh}"
                Speaker.say(text, beep = true, kind = com.oscardevs.oscardrive.logic.SpeechKind.SAFETY)
            }
            // «حارس الطريق»: كل تجاوز بيتسجّل (الوقت · أقصى سرعة · المدة · المكان)
            is SpeedLogic.Event.ViolationEnded -> e.v.let { v ->
                db.addSpeeding(v.startedAtMs, v.endedAtMs, v.maxSpeedKmh, v.limitKmh, v.durationS, v.lat, v.lng)
                if (trip.active) { tripSpeedingN++; tripSpeedingS += v.durationS }
            }
        }
    }

    /** الخطوة ٣: المكان اللى التنبيهات شغّالة بيه (الشاشة · دمج · الموبايل الموثوق). */
    private fun fusedNow(): com.oscardevs.oscardrive.logic.CompanionTracker.Companion.Fused? {
        val gpsFresh = System.currentTimeMillis() - lastGpsMs < 5_000L && !State.approx
        val carLat = if (gpsFresh) State.lat else null
        val carLng = if (gpsFresh) State.lng else null
        val st = if (prefs.useCompanionGps) State.companions else emptyList()
        return com.oscardevs.oscardrive.logic.CompanionTracker.fuse(carLat, carLng, State.accuracyM, st)
    }

    private fun checkHazards(now: Long, kmh: Float, fromPhone: Boolean = false) {
        if (!prefs.hazardAlerts) return
        if (State.hazardsDirty) { hazards = db.hazards(); State.hazardsDirty = false }
        val f = fusedNow() ?: return
        State.posSource = f.source
        val lat = f.lat
        val lng = f.lng
        // اللى بيتعلّم (اتجاه/ارتفاع المطب) من GPS الشاشة بس — مش من الموبايل ولا الدمج
        val sLat = if (fromPhone) null else State.lat
        val sLng = if (fromPhone) null else State.lng
        val learned = if (sLat == null || sLng == null) emptyList() else RoadMemory.learnBearing(hazards, sLat, sLng, trip.headingDeg, kmh, State.accuracyM)
        val learnedAlt = if (sLat == null || sLng == null) emptyList() else RoadMemory.learnAltitude(hazards, sLat, sLng, kmh, State.accuracyM, State.altitudeM)
        if (learned.isNotEmpty() || learnedAlt.isNotEmpty()) {
            for ((id, b) in learned) db.setHazardBearing(id, b)
            for ((id, a) in learnedAlt) db.setHazardAltitude(id, a, State.accuracyM ?: RoadMemory.LEARN_ALT_ACC_M)
            hazards = db.hazards(); HazardSync.syncSoon(this)
        }
        val minKmh = if (prefs.quietSlow) RoadMemory.QUIET_SLOW_KMH else RoadMemory.STOPPED_KMH
        val heading = if (fromPhone) (f.headingDeg ?: trip.headingDeg) else trip.headingDeg
        val hit = RoadMemory.ahead(hazards, lat, lng, heading, kmh, now, warned,
            minKmh = minKmh, minWarnM = prefs.bumpWarnM.toDouble(),
            altitudeM = if (fromPhone) null else State.altitudeM, vAccM = State.vAccM) ?: return
        warned[RoadMemory.warnKey(hit.first, hit.second, kmh)] = now
        val msg = RoadMemory.warning(hit.first, hit.second)
        showBanner("${hit.first.type.emoji} $msg", "hazard", 8_000)
        Speaker.say(msg, beep = true, kind = com.oscardevs.oscardrive.logic.SpeechKind.SAFETY)
        if (prefs.autoShots && com.oscardevs.oscardrive.logic.ShotPlan.wants(hit.first.type) && shotPlan == null) {
            shotPlan = com.oscardevs.oscardrive.logic.ShotPlan(hit.first.id, now); shotHazard = hit.first
        }
    }

    /** بعد تنبيه مطب/حفرة: صورة عند ٨٠ و٥٠ و٢٥ متر (المكان معروف = صورة متعلّمة للتدريب). */
    private var lastShotUpload = 0L

    private fun approachShots(now: Long, lat: Double, lng: Double) {
        // الصور اللى اتصوّرت من غير نت: محاولة رفع كل ٥ دقايق
        if (now - lastShotUpload > 5 * 60_000L) { lastShotUpload = now; Shots.uploadSoon(this) }
        val p = shotPlan ?: return
        val h = shotHazard ?: run { shotPlan = null; return }
        val d = com.oscardevs.oscardrive.logic.Geo.distanceM(lat, lng, h.lat, h.lng)
        if (p.onDistance(d, now)) Shots.take(this, "bump_approach", h, d)
        if (p.done) { shotPlan = null; shotHazard = null }
    }

    private var lastRemCheck = 0L
    private var lastPlaceCheck = 0L

    private fun checkReminders(now: Long, lat: Double?, lng: Double?) {
        val rs = try { db.notes("remind", includeDone = false).map { it.reminder() } } catch (_: Exception) { return }
        if (rs.isEmpty()) return
        val due = com.oscardevs.oscardrive.logic.Reminders.dueByTime(rs, now) +
            if (lat != null && lng != null) com.oscardevs.oscardrive.logic.Reminders.dueByPlace(rs, lat, lng) else emptyList()
        for (r in due.distinctBy { it.id }) {
            db.setNoteDone(r.id)
            showBanner("🔔 ${r.text}", "break", 20_000)
            Speaker.say("فكّرتك: ${r.text}", beep = true, kind = com.oscardevs.oscardrive.logic.SpeechKind.INFO)
        }
    }

    private fun tripEnded(s: TripLogic.Summary) {
        // المرحلة ٧: الدرجة بعد ما الرحلة تخلص (العربية واقفة ٣ دقايق) — مكتوبة بس، مش بالصوت
        val b = com.oscardevs.oscardrive.logic.TripBehavior(s.distanceM / 1000.0, harsh.brakes, harsh.accels, tripSpeedingN, tripSpeedingS)
        val g = com.oscardevs.oscardrive.logic.DrivingScore.grade(b)
        db.addTrip(s, b, g.score)
        harsh.reset(); tripSpeedingN = 0; tripSpeedingS = 0; wasTripActive = false
        if (prefs.tripScore) showBanner("🎯 " + com.oscardevs.oscardrive.logic.DrivingScore.summary(b), "break", 25_000)
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
