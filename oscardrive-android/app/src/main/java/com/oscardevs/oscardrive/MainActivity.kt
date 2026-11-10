package com.oscardevs.oscardrive

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.RecognizerIntent
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.oscardevs.oscardrive.logic.CarCare
import com.oscardevs.oscardrive.logic.EgyptWords
import com.oscardevs.oscardrive.logic.Cmd
import com.oscardevs.oscardrive.logic.Fuel
import com.oscardevs.oscardrive.logic.Geo
import com.oscardevs.oscardrive.logic.Odometer
import com.oscardevs.oscardrive.logic.OdoVoice
import com.oscardevs.oscardrive.logic.MaintVoice
import com.oscardevs.oscardrive.logic.MaintVoiceAction
import com.oscardevs.oscardrive.logic.FuelVoice
import com.oscardevs.oscardrive.logic.FuelBook
import com.oscardevs.oscardrive.logic.FuelPrices
import com.oscardevs.oscardrive.logic.Grade
import com.oscardevs.oscardrive.logic.Warranty
import com.oscardevs.oscardrive.logic.Reports
import com.oscardevs.oscardrive.logic.TripRec
import com.oscardevs.oscardrive.logic.Parking
import com.oscardevs.oscardrive.logic.HazardType
import com.oscardevs.oscardrive.logic.MaintStatus
import com.oscardevs.oscardrive.logic.RoadMemory
import com.oscardevs.oscardrive.logic.VoiceCommands
import com.oscardevs.oscardrive.logic.VoiceCatalog
import com.oscardevs.oscardrive.logic.VoiceEngine
import com.oscardevs.oscardrive.logic.VoiceMatch
import com.oscardevs.oscardrive.logic.Understood
import android.widget.HorizontalScrollView
import com.oscardevs.oscardrive.logic.Wellness
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Oscar Drive — شاشة واحدة بالعرض (Landscape) فيها كل حاجة: القيادة · الملاحة · الركن · الطريق ·
 * السيارة · الإعدادات. من غير XML ولا مكتبات (شاشات العربيات الصينى كتير منها مافيهاش خدمات جوجل).
 * القاعدة: أى حاجة وانت سايق = زرار كبير واحد، والتفاصيل فى التابات التانية.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var db: Db
    private lateinit var ui: Ui
    private val main = Handler(Looper.getMainLooper())
    private var tab = "drive"
    private lateinit var content: FrameLayout
    private lateinit var rail: LinearLayout

    // عناصر شاشة القيادة اللى بتتحدّث كل ثانية
    private var speedTv: TextView? = null
    private var limitTv: TextView? = null
    private var headArrow: TextView? = null
    private var headEn: TextView? = null
    private var headAr: TextView? = null
    private var tripKmTv: TextView? = null
    private var tripInfoTv: TextView? = null
    private var gpsChip: TextView? = null
    private var clockTv: TextView? = null
    private var statusTv: TextView? = null
    private var bannerTv: TextView? = null
    private var startBtn: TextView? = null
    private var drivenTv: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        db = Db.get(this)
        Speaker.init(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        DriveService.State.night = initialNight()
        build()
        askPermissions()
        if (prefs.autoStart || DriveService.State.running) startIfReady()
    }

    override fun onResume() {
        super.onResume()
        DriveService.State.listener = { main.post { render() } }
        DriveService.State.screens++
        Guard.init(this)
        Guard.listener = { main.post { if (tab == "sec") refresh(); maybePinGate() } }
        Oscar.init(this)
        render()
        maybePinGate()
        startWakeIfOn()
    }

    override fun onPause() {
        DriveService.State.listener = null
        DriveService.State.screens--
        Guard.listener = null
        wake?.stop()
        super.onPause()
    }

    private fun initialNight(): Boolean = when (prefs.theme) {
        1 -> false
        2 -> true
        else -> if (prefs.lastLat != 0.0 || prefs.lastLng != 0.0)
            com.oscardevs.oscardrive.logic.SunTimes.isNight(prefs.lastLat, prefs.lastLng, System.currentTimeMillis())
        else com.oscardevs.oscardrive.logic.SunTimes.isNightByClock(Calendar.getInstance().get(Calendar.HOUR_OF_DAY))
    }

    /* ═══════════════ الهيكل: شريط التابات + المحتوى ═══════════════ */

    private fun build() {
        ui = Ui(this, DriveService.State.night)
        window.statusBarColor = ui.bg
        window.navigationBarColor = ui.bg
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(ui.bg)
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }
        rail = ui.col(6)
        root.addView(rail, LinearLayout.LayoutParams(ui.dp(104), Ui.MATCH))
        content = FrameLayout(this)
        root.addView(content, LinearLayout.LayoutParams(0, Ui.MATCH, 1f))
        Ui.fitSystemBars(root)
        setContentView(root)
        buildRail()
        showTab(tab)
    }

    private val tabs = listOf(
        "drive" to "🚗\nالقيادة", "nav" to "🧭\nالملاحة", "park" to "🅿️\nالركن", "sec" to "🛡️\nالحماية", "voice" to "🎙️\nOscar",
        "road" to "🛣️\nالطريق", "car" to "🔧\nالسيارة", "settings" to "⚙️\nالإعدادات",
    )

    private fun buildRail() {
        rail.removeAllViews()
        for ((key, label) in tabs) {
            val b = TextView(this).apply {
                text = label; textSize = 13f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD
                setTextColor(if (key == tab) Color.WHITE else ui.muted)
                background = if (key == tab) ui.round(ui.accent, 16) else null
                setOnClickListener { showTab(key) }
            }
            rail.addView(b, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f).apply { setMargins(0, ui.dp(3), 0, ui.dp(3)) })
        }
    }

    private fun showTab(key: String) {
        tab = key
        buildRail()
        content.removeAllViews()
        speedTv = null; limitTv = null; headArrow = null; headEn = null; headAr = null; tripKmTv = null
        tripInfoTv = null; gpsChip = null; clockTv = null; statusTv = null; bannerTv = null; startBtn = null; drivenTv = null
        val v: View = when (key) {
            "nav" -> scroll(navTab())
            "park" -> scroll(parkTab())
            "road" -> scroll(roadTab())
            "car" -> scroll(carTab())
            "settings" -> scroll(settingsTab())
            "sec" -> scroll(securityTab())
            "voice" -> scroll(voiceTab())
            else -> driveTab()
        }
        content.addView(v, FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH))
        render()
    }

    private fun refresh() = showTab(tab)

    private fun scroll(inner: View): View = ScrollView(this).apply {
        isFillViewport = true
        addView(inner)
    }

    /* ═══════════════ القيادة ═══════════════ */

    private fun driveTab(): View {
        val page = ui.col(10)

        // الشريط العلوى: الاسم · الـGPS · الساعة · ابدأ/وقف
        val top = ui.row()
        top.addView(ui.text("OSCAR DRIVE", 20f, ui.ink, bold = true).apply { letterSpacing = 0.08f })
        top.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        gpsChip = ui.chip("GPS", ui.muted).also { top.addView(it) }
        top.addView(ui.space(10, 1))
        clockTv = ui.text("", 18f, ui.ink, bold = true).also { top.addView(it) }
        top.addView(ui.space(10, 1))
        startBtn = ui.button("ابدأ", "good", 15f) { toggle() }.apply { minHeight = ui.dp(42) }
        top.addView(startBtn, LinearLayout.LayoutParams(ui.dp(96), ui.dp(44)))
        page.addView(top)

        bannerTv = ui.text("", 22f, Color.WHITE, bold = true, gravity = Gravity.CENTER).apply {
            visibility = View.GONE; setPadding(ui.dp(12), ui.dp(10), ui.dp(12), ui.dp(10))
            setOnClickListener { DriveService.State.banner = null; render() }
        }
        page.addView(bannerTv, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4))

        val body = ui.row()
        body.gravity = Gravity.CENTER
        page.addView(body, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))

        // يمين: الاتجاه + الرحلة
        val left = ui.col()
        val head = ui.card(12)
        head.gravity = Gravity.CENTER
        head.addView(ui.text("اتجاه الحركة", 14f, ui.muted, gravity = Gravity.CENTER))
        val hr = ui.row(); hr.gravity = Gravity.CENTER
        headArrow = ui.text("•", 40f, ui.accent, bold = true).also { hr.addView(it) }
        hr.addView(ui.space(8, 1))
        headEn = ui.text("--", 34f, ui.ink, bold = true).also { hr.addView(it) }
        head.addView(hr)
        headAr = ui.text("", 15f, ui.muted, gravity = Gravity.CENTER).also { head.addView(it) }
        left.addView(head, ui.lp(Ui.MATCH, 0, 1f, 4))
        val tripC = ui.card(12)
        tripC.gravity = Gravity.CENTER
        tripC.addView(ui.text("📍 الرحلة الحالية", 14f, ui.muted, gravity = Gravity.CENTER))
        tripKmTv = ui.text("0.0 km", 34f, ui.ink, bold = true, gravity = Gravity.CENTER).also { tripC.addView(it) }
        tripInfoTv = ui.text("", 14f, ui.muted, gravity = Gravity.CENTER).also { tripC.addView(it) }
        left.addView(tripC, ui.lp(Ui.MATCH, 0, 1f, 4))
        body.addView(left, LinearLayout.LayoutParams(0, Ui.MATCH, 1f))

        // النص: السرعة كبيرة + علامة الحد
        val center = ui.col()
        center.gravity = Gravity.CENTER
        val hDp = resources.displayMetrics.heightPixels / resources.displayMetrics.density
        speedTv = ui.text("--", (hDp * 0.30f).coerceIn(70f, 170f), ui.ink, bold = true, gravity = Gravity.CENTER).apply { includeFontPadding = false }
        center.addView(speedTv)
        center.addView(ui.text("km/h · كم/س", 16f, ui.muted, gravity = Gravity.CENTER))
        val lr = ui.row(); lr.gravity = Gravity.CENTER; lr.setPadding(0, ui.dp(8), 0, 0)
        lr.addView(ui.button("−", "neutral", 24f) { changeLimit(-5) }, LinearLayout.LayoutParams(ui.dp(56), ui.dp(56)))
        limitTv = TextView(this).apply {
            textSize = 24f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER; setTextColor(Color.BLACK)
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE); setStroke(ui.dp(6), Color.parseColor("#E53935")) }
        }
        lr.addView(limitTv, LinearLayout.LayoutParams(ui.dp(70), ui.dp(70)).apply { setMargins(ui.dp(12), 0, ui.dp(12), 0) })
        lr.addView(ui.button("+", "neutral", 24f) { changeLimit(+5) }, LinearLayout.LayoutParams(ui.dp(56), ui.dp(56)))
        center.addView(lr)
        drivenTv = ui.text("", 14f, ui.muted, gravity = Gravity.CENTER).also { center.addView(it) }
        body.addView(center, LinearLayout.LayoutParams(0, Ui.MATCH, 1.4f))

        // شمال: أزرار سريعة كبيرة
        val actions = ui.col()
        val pairs = listOf(
            listOf("〰️ مطب هنا" to { markHazard(HazardType.BUMP) }, "🕳️ حفرة" to { markHazard(HazardType.POTHOLE) }),
            listOf("📷 رادار" to { markHazard(HazardType.RADAR) }, "⚠️ خطر" to { markHazard(HazardType.DANGER) }),
            listOf("🅿️ ركنت هنا" to { parkHere() }, "🎤 أمر صوتى" to { listen() }),
            listOf("🧭 الخريطة" to { openMap() }, "⛽ بنزينة" to { nearestFuel() }),
        )
        for (p in pairs) {
            val r = ui.row()
            for ((label, fn) in p) r.addView(ui.button(label, "neutral", 15f) { fn() }, ui.lp(0, Ui.MATCH, 1f, 3))
            actions.addView(r, LinearLayout.LayoutParams(Ui.MATCH, 0, 1f))
        }
        body.addView(actions, LinearLayout.LayoutParams(0, Ui.MATCH, 1.1f))

        statusTv = ui.text("", 13f, ui.muted).also { page.addView(it) }
        return page
    }

    private fun render() {
        val s = DriveService.State
        if (s.night != ui.night) { build(); return }
        val now = System.currentTimeMillis()
        clockTv?.text = clock(now)
        startBtn?.let {
            it.text = if (s.running) "وقف" else "ابدأ"
            it.background = ui.round(if (s.running) ui.surface2 else ui.good, 16)
            it.setTextColor(if (s.running) ui.ink else Color.WHITE)
        }
        gpsChip?.let { c ->
            val (t, col) = when {
                !s.running -> "متوقف" to ui.muted
                !s.gpsEnabled -> "الـGPS مقفول" to ui.bad
                s.speedKmh == null && s.approx -> com.oscardevs.oscardrive.logic.ApproxLocation.label(s.accuracyM) to ui.warn
                s.speedKmh == null -> "بيدوّر على GPS…" to ui.warn
                else -> "GPS Connected" to ui.good
            }
            c.text = t; c.setTextColor(col)
            c.background = GradientDrawable().apply { setColor(Color.argb(40, Color.red(col), Color.green(col), Color.blue(col))); cornerRadius = ui.dp(20).toFloat() }
        }
        val sp = speedTv ?: return
        sp.text = s.speedKmh?.toInt()?.toString() ?: "--"
        sp.setTextColor(if (s.over) ui.bad else ui.ink)
        limitTv?.text = prefs.limit.toString()
        val h = s.headingDeg
        headArrow?.text = if (h != null) Geo.arrow(h) else "•"
        headEn?.text = if (h != null) Geo.compassEn(h) else "--"
        headAr?.text = if (h != null) Geo.compassAr(h) else "هيبان أول ما تتحرك"
        tripKmTv?.text = "%.1f km".format(Locale.US, s.tripKm)
        tripInfoTv?.text = if (s.tripActive) "⏱ ${duration(s.tripMovingS)} · متوسط ${s.tripAvgKmh.toInt()} كم/س" else "بتبدأ لوحدها أول ما تتحرك"
        drivenTv?.text = if (s.drivingMin > 0) "☕ سايق من ${s.drivingMin} دقيقة" + (if (prefs.breakMin > 0) " · الاستراحة كل ${prefs.breakMin}" else "") else ""
        val b = s.banner
        bannerTv?.let { tv ->
            if (b != null && now <= s.bannerUntil) {
                tv.visibility = View.VISIBLE; tv.text = b
                tv.background = ui.round(if (s.bannerKind == "break") ui.accent else ui.warn, 16)
            } else tv.visibility = View.GONE
        }
        val acc = s.accuracyM?.let { " · دقة ${it.toInt()} م" + if (s.approx) " (تقريبى من النت)" else "" } ?: ""
        statusTv?.text = "GPS · ${s.satsUsed} أقمار$acc · ${clock(now)} · Driving Mode" +
            (if (wake?.active == true) " · 🎙️ سامعك" else "") +
            if (!s.gpsEnabled) " — افتح الـLocation من إعدادات الشاشة" else ""
    }

    /* ═══════════════ الملاحة ═══════════════ */

    private fun navTab(): View {
        val page = ui.col(14)
        page.addView(header("🧭 الملاحة", if (NavActivity.available(this)) "الملاحة جوه Oscar Drive: الخريطة وتعليمات الانعطاف والوقت الباقى بالصوت — والتنبيهات شغّالة."
            else "بتفتح تطبيق الخرائط اللى على الشاشة (Google Maps أو غيره) — Oscar Drive بيفضل شغّال وراه وبينبّهك."))
        val r1 = ui.row()
        r1.addView(ui.button("🗺️ افتح الخريطة", "primary") { openMap() }, ui.lp(0, ui.dp(64), 1f, 4))
        r1.addView(ui.button("⛽ أقرب بنزينة", "neutral") { nearestFuel() }, ui.lp(0, ui.dp(64), 1f, 4))
        r1.addView(ui.button("🎤 قول وجهتك", "neutral") { listen() }, ui.lp(0, ui.dp(64), 1f, 4))
        page.addView(r1)

        val places = db.places()
        val r2 = ui.row()
        for (name in listOf("البيت", "الشغل")) {
            val p = places.firstOrNull { it.name == name }
            r2.addView(ui.button(if (p != null) "وصّلنى ${name}" else "احفظ ${name} = مكانى", if (p != null) "primary" else "neutral") {
                if (p != null) navigateTo(p.lat, p.lng, p.name) else savePlace(name)
            }, ui.lp(0, ui.dp(60), 1f, 4))
        }
        r2.addView(ui.button("＋ احفظ مكانى باسم", "neutral") { askText("اسم المكان", "مثلاً: بيت بابا", "") { savePlace(it) } }, ui.lp(0, ui.dp(60), 1f, 4))
        page.addView(r2)

        page.addView(section("أماكنك المحفوظة"))
        val others = places.filter { it.name != "البيت" && it.name != "الشغل" }
        if (others.isEmpty()) page.addView(ui.text("لسه مفيش. لما تكون فى مكان بتروحه كتير اضغط «احفظ مكانى باسم».", 15f, ui.muted))
        for (p in places) {
            val r = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            r.addView(ui.text("📍 ${p.name}" + here()?.let { "   ·   ${km(Geo.distanceM(it.first, it.second, p.lat, p.lng))}" }.orEmpty(), 17f, ui.ink, bold = true), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            r.addView(ui.button("وصّلنى", "primary", 15f) { navigateTo(p.lat, p.lng, p.name) }, ui.lp(ui.dp(110), ui.dp(50), 0f, 3))
            r.addView(ui.button("مسح", "neutral", 15f) { confirm("تمسح «${p.name}»؟") { db.deletePlace(p.id); refresh() } }, ui.lp(ui.dp(80), ui.dp(50), 0f, 3))
            page.addView(r, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4))
        }

        page.addView(section("🆘 الطوارئ"))
        val sos = prefs.emergencyPhone
        page.addView(ui.text(if (sos.isNotEmpty()) "الزرار بيجهّز رسالة فيها مكانك لـ ${prefs.emergencyName.ifEmpty { sos }} — وانت اللى بتدوس إرسال."
            else "حط رقم حد تثق فيه من «الإعدادات» — ولحد ده الزرار بيفتح المشاركة (واتساب/رسايل) وانت تختار.", 15f, ui.muted))
        page.addView(ui.button("🆘 ابعت مكانى دلوقتى", "danger", 19f) { emergency() }, ui.lp(Ui.MATCH, ui.dp(64), marginDp = 4))
        return page
    }

    /* ═══════════════ الركن ═══════════════ */

    private fun parkTab(): View {
        val page = ui.col(14)
        page.addView(header("🅿️ الركن", "مكان العربية بيتحفظ لوحده آخر كل رحلة (لو سايبها مفعّلة فى الإعدادات) — أو اضغط «ركنت هنا»."))
        val list = db.parkings()
        val last = list.firstOrNull()
        val c = ui.card(16)
        if (last == null) {
            c.addView(ui.text("لسه مفيش ركنة محفوظة.", 18f, ui.ink, bold = true))
        } else {
            c.addView(ui.text("آخر ركنة: ${ago(last.timeMs)}", 20f, ui.ink, bold = true))
            c.addView(ui.text(Parking.label(last.spot(), ago(last.timeMs)) +
                (last.odoKm?.let { " · العدّاد ${Odometer.fmtKm(it.toDouble())}" } ?: ""), 14f, if (Parking.isApprox(last.spot())) ui.warn else ui.muted))
            if (last.note.isNotBlank()) c.addView(ui.text("📝 ${last.note}", 15f, ui.ink))
            here()?.let { c.addView(ui.text("بعيدة عنك ${km(Geo.distanceM(it.first, it.second, last.lat, last.lng))}", 16f, ui.muted)) }
            val r = ui.row()
            r.addView(ui.button("🚶 وصّلنى للعربية", "primary") { navigateTo(last.lat, last.lng, "العربية", walk = true) }, ui.lp(0, ui.dp(60), 1f, 4))
            r.addView(ui.button("📤 ابعت مكانها", "neutral") { share("العربية راكنة هنا: ${Geo.mapsLink(last.lat, last.lng)}") }, ui.lp(0, ui.dp(60), 1f, 4))
            c.addView(r)
            c.addView(ui.button(if (last.note.isBlank()) "📝 ملاحظة (الدور · رقم المكان…)" else "📝 عدّل الملاحظة", "neutral", 15f) {
                askText("ملاحظة على الركنة", "مثلاً: الدور التانى تحت الأرض · عمود B4", last.note) { n -> db.setParkingNote(last.id, n); refresh() }
            }, ui.lp(Ui.MATCH, ui.dp(52), marginDp = 4))
        }
        page.addView(c, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4))
        page.addView(ui.button("🅿️ ركنت هنا", "good", 20f) { parkHere(); refresh() }, ui.lp(Ui.MATCH, ui.dp(64), marginDp = 4))

        val cam = ui.card(12)
        cam.addView(ui.text("📹 كاميرا الرجوع", 16f, ui.ink, bold = true))
        cam.addView(ui.text("الكاميرا بتفضل شغّالة من الشاشة نفسها أول ما تحط المارشدير، فوق أى تطبيق. Oscar Drive مابيلمسهاش خالص — " +
            "وقياس المسافة ورا العربية محتاج حساسات ركن، الكاميرا لوحدها ماتقدرش تقيسها صح.", 14f, ui.muted))
        page.addView(cam, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4))

        if (list.size > 1) {
            page.addView(section("الركنات اللى فاتت"))
            for (p in list.drop(1).take(15)) {
                val r = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                val extra = listOfNotNull(if (Parking.isApprox(p.spot())) "تقريبى" else null, p.note.takeIf { it.isNotBlank() }?.let { "📝 $it" }).joinToString(" · ")
                r.addView(ui.text(dateTime(p.timeMs) + if (extra.isNotEmpty()) "\n$extra" else "", 15f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
                r.addView(ui.button("🗺️", "neutral", 15f) { view("geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}") || toast("مفيش تطبيق خرائط") }, ui.lp(ui.dp(56), ui.dp(48), 0f, 2))
                r.addView(ui.button("وصّلنى", "neutral", 14f) { navigateTo(p.lat, p.lng, "الركنة", walk = true) }, ui.lp(ui.dp(92), ui.dp(48), 0f, 2))
                r.addView(ui.button("🗑️", "neutral", 15f) { confirm("تمسح الركنة دى؟") { db.deleteParking(p.id); refresh() } }, ui.lp(ui.dp(56), ui.dp(48), 0f, 2))
                page.addView(r, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
            }
        }
        return page
    }

    /* ═══════════════ الطريق: ذاكرة الطريق + حارس السرعة ═══════════════ */

    private fun roadTab(): View {
        val page = ui.col(14)
        page.addView(header("🛣️ ذاكرة الطريق", "سجّل المطب أو الحفرة أو الرادار وانت معدّى عليه (زرار أو صوتك)، والمرة الجاية Oscar Drive يقولك قبلها بحوالى ١٢ ثانية."))
        val r = ui.row()
        for (t in HazardType.entries) r.addView(ui.button("${t.emoji} ${t.ar}", "neutral", 15f) { markHazard(t); refresh() }, ui.lp(0, ui.dp(58), 1f, 3))
        page.addView(r)

        val hz = db.hazards()
        page.addView(section("المسجّل (${hz.size})"))
        if (hz.isEmpty()) page.addView(ui.text("لسه مفيش. أول مطب يقابلك اضغط «〰️ مطب هنا» من شاشة القيادة.", 15f, ui.muted))
        val pos = here()
        val sorted = if (pos != null) hz.sortedBy { Geo.distanceM(pos.first, pos.second, it.lat, it.lng) } else hz
        for (h in sorted.take(60)) {
            val row = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val dist = pos?.let { " · ${km(Geo.distanceM(it.first, it.second, h.lat, h.lng))}" } ?: ""
            row.addView(ui.text("${h.type.emoji} ${h.type.ar}$dist\n${dateTime(h.createdMs)}", 15f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(ui.button("🗺️", "neutral", 16f) { navigateTo(h.lat, h.lng, h.type.ar) }, ui.lp(ui.dp(60), ui.dp(48), 0f, 2))
            row.addView(ui.button("مسح", "neutral", 14f) { db.deleteHazard(h.id); DriveService.State.hazardsDirty = true; refresh() }, ui.lp(ui.dp(76), ui.dp(48), 0f, 2))
            page.addView(row, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }

        val sp = db.speeding()
        page.addView(section("🚨 حارس الطريق — مرات تجاوز السرعة (${sp.size})"))
        if (sp.isEmpty()) page.addView(ui.text("مفيش تجاوز متسجّل. أى مرة تعدّى الحد (${prefs.limit}) أكتر من ٣ ثوانى بتتسجّل هنا بمكانها.", 15f, ui.muted))
        for (v in sp.take(30)) {
            val row = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            row.addView(ui.text("${dateTime(v.startMs)}\nأقصى ${v.maxKmh.toInt()} (الحد ${v.limitKmh}) · ${v.durationS} ث", 15f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(ui.button("🗺️ فين", "neutral", 14f) { navigateTo(v.lat, v.lng, "تجاوز سرعة") }, ui.lp(ui.dp(90), ui.dp(48), 0f, 2))
            page.addView(row, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }
        if (sp.isNotEmpty()) page.addView(ui.button("امسح السجل", "neutral", 15f) { confirm("تمسح سجل التجاوزات كله؟") { db.clearSpeeding(); refresh() } }, ui.lp(Ui.MATCH, ui.dp(52), marginDp = 4))
        return page
    }

    /* ═══════════════ السيارة: العدّاد · الصيانة · البنزين · الرحلات ═══════════════ */

    private fun carTab(): View {
        val page = ui.col(14)
        page.addView(header("🔧 السيارة", "العدّاد = آخر رقم كتبته من التابلوه + كيلومترات الـGPS بعده. الصيانة والبنزين بيتحسبوا عليه."))
        val odo = prefs.odoKm.toInt()
        val o = prefs.odo
        val oc = ui.card(14).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val oText = ui.col(0)
        oText.addView(ui.text("العدّاد  ${if (odo > 0) Odometer.fmtKm(o.currentKm) + " كم" else "اكتب رقم العدّاد"}", 20f, ui.ink, bold = true))
        oText.addView(ui.text(o.explain { SimpleDateFormat("d/M/yyyy", Locale.US).format(Date(it)) } +
            if (o.gpsTotalKm > 0) "\nكل اللى الـGPS حسبه من الأول: ${Odometer.fmtKm(o.gpsTotalKm)} كم" else "", 13f, ui.muted))
        oc.addView(oText, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        oc.addView(ui.button("صحّح من التابلوه", "primary", 15f) {
            askNumber("رقم العدّاد من التابلوه (كم)", if (odo > 0) odo.toString() else "") { v -> setOdo(v) }
        }, ui.lp(ui.dp(150), ui.dp(54), 0f, 2))
        page.addView(oc, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4))

        // الصيانة
        page.addView(section("🛠️ الصيانة"))
        page.addView(ui.text("المواعيد الافتراضية تقديرية — عدّلها (⚙️) حسب كتالوج عربيتك. بالصوت: «غيرت الزيت ٥٠٠٠ كيلو» · «غيرت الكاوتش الأمامى».", 13f, ui.muted))
        val now = System.currentTimeMillis()
        val items = db.maint().map { it to CarCare.status(it, odo, now) }.sortedBy { it.second.status.ordinal * -1 }
        for ((item, st) in items) {
            val color = when (st.status) { MaintStatus.DUE -> ui.bad; MaintStatus.SOON -> ui.warn; else -> ui.good }
            val row = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val every = listOfNotNull(if (item.everyKm > 0) "كل %,d كم".format(Locale.US, item.everyKm) else null, if (item.everyDays > 0) "كل ${item.everyDays} يوم" else null).joinToString(" · ")
            val label = when (st.status) { MaintStatus.DUE -> "⛔ وقته"; MaintStatus.SOON -> "⏳ قرّب"; else -> "✅" }
            row.addView(ui.chip(label, color))
            row.addView(ui.space(8, 1))
            row.addView(ui.text("${item.name}\n${CarCare.describe(st)}   ($every)", 15f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(ui.button("اتعمل", "good", 14f) {
                if (odo <= 0) { toast("اكتب العدّاد الأول"); return@button }
                confirm("${item.name} اتعمل النهارده على عدّاد ${Odometer.fmtKm(odo.toDouble())}؟") { db.maintDone(item.id, odo); refresh() }
            }, ui.lp(ui.dp(84), ui.dp(48), 0f, 2))
            row.addView(ui.button("⚙️", "neutral", 15f) { editMaint(item.id, item.name, item.everyKm, item.everyDays) }, ui.lp(ui.dp(54), ui.dp(48), 0f, 2))
            page.addView(row, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }

        // البنزين
        page.addView(section("⛽ البنزين"))
        val fills = db.fillRecs()
        val cons = FuelBook.consumption(fills)
        val avg = FuelBook.averageConsumption(fills)
        val cpk = FuelBook.costPerKm(fills)
        page.addView(ui.text(if (cons != null) "الاستهلاك الحقيقى: %.1f لتر/١٠٠ كم (آخر فترة)%s · الكيلو بـ %.2f جنيه".format(Locale.US, cons,
                avg?.let { " · المتوسط %.1f".format(Locale.US, it) } ?: "", cpk ?: 0.0)
            else "الاستهلاك الحقيقى: لسه مش كفاية — سجّل تفويلتين «لآخرها» (بالفلوس أو باللتر). لحد ده بستخدم ${"%.1f".format(Locale.US, prefs.provisionalRate)} لتر/١٠٠ كم تقديرى.",
            16f, ui.ink, bold = cons != null))
        page.addView(ui.text(fuelLeftText(), 14f, ui.muted))
        page.addView(ui.button("＋ سجّل تفويلة (بالفلوس أو باللتر)", "primary") { addFill() }, ui.lp(Ui.MATCH, ui.dp(56), marginDp = 4))
        // الأسعار بتاريخها + التانك + الاستهلاك التقديرى
        val prices = prefs.fuelPrices()
        val pr = ui.row()
        for (g in Grade.entries) {
            val cur = FuelPrices.current(prices, g)
            pr.addView(ui.button("${g.ar}\n${cur?.let { "%.2f ج/لتر".format(Locale.US, it) } ?: "حط السعر"}", "neutral", 14f) {
                askText("سعر لتر ${g.ar} (جنيه) — التفويلات القديمة بتفضل بسعرها", "مثلاً 19.25", cur?.toString() ?: "", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL) { v ->
                    v.toDoubleOrNull()?.takeIf { it > 0 }?.let { prefs.addFuelPrice(g, it); refresh() } ?: toast("رقم غلط")
                }
            }, ui.lp(0, ui.dp(64), 1f, 3))
        }
        page.addView(pr)
        val tr = ui.row()
        tr.addView(ui.button(if (prefs.tankL > 0) "التانك ${"%.0f".format(Locale.US, prefs.tankL)} لتر" else "سعة التانك؟", "neutral", 14f) {
            askNumber("سعة التانك (لتر) — من كتالوج العربية", if (prefs.tankL > 0) prefs.tankL.toInt().toString() else "") { prefs.tankL = it.toDouble(); refresh() }
        }, ui.lp(0, ui.dp(54), 1f, 3))
        tr.addView(ui.button("استهلاك تقديرى ${"%.1f".format(Locale.US, prefs.provisionalRate)}", "neutral", 14f) {
            askText("استهلاك تقديرى (لتر/١٠٠ كم) لحد ما يبان الحقيقى", "مثلاً 8", prefs.provisionalRate.toString(), InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL) { v ->
                v.toDoubleOrNull()?.takeIf { it in 3.0..30.0 }?.let { prefs.provisionalRate = it; refresh() } ?: toast("بين ٣ و٣٠")
            }
        }, ui.lp(0, ui.dp(54), 1f, 3))
        page.addView(tr)
        for (f in fills.take(10)) {
            val row = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val g = f.grade?.ar ?: "بنزين"
            row.addView(ui.text("${dateTime(f.timeMs)} · عدّاد ${Odometer.fmtKm(f.odoKm.toDouble())}\n${"%.1f".format(Locale.US, f.liters)} لتر $g · ${"%.0f".format(Locale.US, f.paid)} جنيه" +
                (f.perLiter?.let { " (${"%.2f".format(Locale.US, it)}/لتر)" } ?: "") + if (f.full) " · لآخرها" else " · جزئى", 14f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(ui.button("مسح", "neutral", 14f) { confirm("تمسح التفويلة دى؟") { db.deleteFill(f.id); refresh() } }, ui.lp(ui.dp(76), ui.dp(46), 0f, 2))
            page.addView(row, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }

        // الضمان (اختيارى): مواعيد الوكيل اللى إنت بتكتبها
        page.addView(section("🏷️ صيانة الضمان (الوكيل)"))
        page.addView(toggle("العربية لسه فى الضمان", prefs.warrantyOn) { prefs.warrantyOn = it; if (it && prefs.warrantyKm.isEmpty()) prefs.warrantyKm = Warranty.EXAMPLE; refresh() })
        if (prefs.warrantyOn) {
            page.addView(ui.text("المواعيد دى أمثلة — كل شركة ليها جدول. عدّلها من كتيّب الضمان بتاعك.", 13f, ui.muted))
            val done = prefs.warrantyDone
            val wr = ui.row()
            for (km in prefs.warrantyKm) {
                val isDone = km in done
                wr.addView(ui.button("${if (isDone) "✅" else "⏳"} ${Odometer.fmtKm(km.toDouble())}", if (isDone) "good" else "neutral", 13f) {
                    prefs.warrantyDone = if (isDone) done - km else done + km; refresh()
                }, ui.lp(0, ui.dp(50), 1f, 2))
            }
            page.addView(wr)
            Warranty.next(prefs.warrantyKm, done, odo)?.let { (km, left) ->
                page.addView(ui.text("الجاية: ${Odometer.fmtKm(km.toDouble())} كم — ${if (left <= 0) "وقتها دلوقتى" else "فاضل ${Odometer.fmtKm(left.toDouble())} كم"}", 15f, if (left <= 500) ui.warn else ui.ink, bold = true))
            }
            page.addView(ui.button("✏️ عدّل المواعيد (بالكيلو، مفصولة بفاصلة)", "neutral", 14f) {
                askText("مواعيد الوكيل بالكيلو", "1000, 10000, 20000", prefs.warrantyKm.joinToString(", ")) { v ->
                    prefs.warrantyKm = v.split(',', '،', ' ').mapNotNull { it.trim().toIntOrNull() }.filter { it > 0 }; refresh()
                }
            }, ui.lp(Ui.MATCH, ui.dp(50), marginDp = 4))
        }

        // تقرير الشهور
        page.addView(section("📅 كل شهر"))
        val ymFmt = SimpleDateFormat("yyyy-MM", Locale.US)
        val months = Reports.monthly(db.trips(0, 2000).map { TripRec(it.startMs, it.distanceM / 1000, it.movingS) }, fills,
            db.maintLog().map { it.doneMs }) { ymFmt.format(Date(it)) }.take(3)
        if (months.isEmpty()) page.addView(ui.text("لسه مفيش رحلات ولا تفويلات.", 14f, ui.muted))
        for (m in months) {
            val c = ui.card(10)
            c.addView(ui.text(m.ym, 16f, ui.ink, bold = true))
            c.addView(ui.text("${m.trips} رحلة · ${"%.0f".format(Locale.US, m.km)} كم · ${duration(m.drivingMin * 60)} سواقة\n" +
                "بنزين: ${"%.0f".format(Locale.US, m.fuelPaid)} جنيه · ${"%.0f".format(Locale.US, m.liters)} لتر (${m.fills} تفويلة)" +
                (m.costPerKm?.let { " · الكيلو ~${"%.2f".format(Locale.US, it)} ج (تقريبى)" } ?: "") +
                (if (m.maintDone > 0) " · صيانة ${m.maintDone}" else ""), 14f, ui.ink))
            page.addView(c, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }

        // الرحلات
        page.addView(section("📊 رحلاتك"))
        val weekAgo = now - 7 * CarCare.DAY_MS
        val week = db.trips(weekAgo)
        val wKm = week.sumOf { it.distanceM } / 1000.0
        val wS = week.sumOf { it.movingS }
        val wAvg = if (wS > 0) wKm / (wS / 3600.0) else 0.0
        val stats = ui.row()
        for ((v, l) in listOf("%.0f كم".format(Locale.US, wKm) to "آخر ٧ أيام", duration(wS) to "وقت السواقة", "%.0f".format(Locale.US, wAvg) to "متوسط كم/س", week.size.toString() to "رحلة")) {
            val c = ui.card(10); c.gravity = Gravity.CENTER
            c.addView(ui.text(v, 22f, ui.ink, bold = true, gravity = Gravity.CENTER))
            c.addView(ui.text(l, 13f, ui.muted, gravity = Gravity.CENTER))
            stats.addView(c, ui.lp(0, Ui.WRAP, 1f, 3))
        }
        page.addView(stats)
        for (t in db.trips(0, 20)) {
            val row = ui.card(10)
            row.addView(ui.text("${dateTime(t.startMs)} · %.1f كم · ${duration(t.movingS)} · متوسط ${t.avgKmh.toInt()} · أقصى ${t.maxKmh.toInt()}".format(Locale.US, t.distanceM / 1000), 14f, ui.ink))
            page.addView(row, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }
        return page
    }

    /* ═══════════════ 🛡️ الحماية (Oscar Security) ═══════════════ */

    private var pinDialogOpen = false

    /** وضع الحماية شغّال والعربية لسه دايرة ⇒ الشاشة بتطلب الرقم السرى. */
    private fun maybePinGate() {
        if (pinDialogOpen || !Guard.on || !Guard.logic.needsPin || !DriveService.State.running || !Guard.pinSet()) return
        pinDialogOpen = true
        val f = EditText(this).apply {
            hint = "الرقم السرى"; textSize = 26f; gravity = Gravity.CENTER
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        val d = AlertDialog.Builder(this).setTitle("🛡️ وضع الحماية شغّال")
            .setMessage("اكتب الرقم السرى. من غيره أى حركة بالعربية بتتسجّل وبتوصل لموبايل صاحبها.")
            .setView(f).setPositiveButton("تأكيد", null).setNegativeButton("بعدين", null).setCancelable(false).create()
        d.setOnShowListener {
            d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if (Guard.tryPin(f.text.toString())) { d.dismiss(); say("أهلاً بيك") } else { f.setText(""); toast("الرقم غلط") }
            }
        }
        d.setOnDismissListener { pinDialogOpen = false }
        d.show()
    }

    private fun securityTab(): View {
        val page = ui.col(14)
        page.addView(header("🛡️ الحماية والتتبّع", "الـGPS بيسجّل مكان العربية على الشاشة حتى من غير نت، وأول ما أى نت يتوصل بيتبعت لصفحة موبايلك " +
            "(drive.oscardevs.com) ومعاه التنبيهات. الشاشة بتفصل مع إطفاء العربية، ولو حد فصلها التسجيل بيقف."))
        page.addView(toggle("شغّل الحماية والتتبّع (مكان العربية بيتبعت لصفحتك على drive.oscardevs.com بس)", prefs.securityOn) { v ->
            prefs.securityOn = v
            if (v) { Guard.onBoot(); Guard.syncSoon() }
        })
        if (!prefs.securityOn) return page

        // الحالة
        val st = ui.card(16)
        val armed = prefs.armed
        st.addView(ui.text(if (armed) "Protected · محمية" else "مش محمية", 26f, if (armed) ui.good else ui.muted, bold = true))
        st.addView(ui.text(if (armed) "مع كل تشغيل للعربية الشاشة بتطلب الرقم السرى، وأى حركة من غيره بتتسجّل وبتنبّهك." +
            (if (Guard.logic.unlocked) " (التشغيلة دى اتفتحت بالرقم)" else "")
            else "فعّلها لما تسيب العربية — أو من صفحة موبايلك.", 15f, ui.muted))
        val r = ui.row()
        if (!Guard.pinSet()) {
            r.addView(ui.button("🔢 حدّد الرقم السرى الأول", "primary") { changePin() }, ui.lp(0, ui.dp(58), 1f, 3))
        } else if (armed) {
            r.addView(ui.button("🔓 اقفل الحماية", "neutral") { askPin("اكتب الرقم السرى عشان تقفل الحماية") { Guard.setArmedFromCar(false); refresh() } }, ui.lp(0, ui.dp(58), 1f, 3))
        } else {
            r.addView(ui.button("🛡️ فعّل الحماية", "good") { Guard.setArmedFromCar(true); say("وضع الحماية اتفعّل"); refresh() }, ui.lp(0, ui.dp(58), 1f, 3))
        }
        r.addView(ui.button("📱 ربط موبايل", "primary") { pairPhone() }, ui.lp(0, ui.dp(58), 1f, 3))
        st.addView(r)
        page.addView(st, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4))

        val sync = ui.card(12)
        val last = prefs.lastSyncMs
        sync.addView(ui.text("☁️ آخر إرسال: " + (if (last > 0) ago(last) else "لسه") + " · مستنى الإرسال: ${Guard.pendingPoints()} مكان", 15f, ui.ink))
        Guard.lastError?.let { sync.addView(ui.text(it, 14f, ui.warn)) }
        sync.addView(ui.button("ابعت دلوقتى", "neutral", 14f) { Guard.syncSoon(); toast("بيبعت…") }, ui.lp(Ui.MATCH, ui.dp(48), marginDp = 2))
        page.addView(sync, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4))
        if (Guard.pinSet()) page.addView(ui.button("🔢 غيّر الرقم السرى", "neutral", 15f) { changePin() }, ui.lp(Ui.MATCH, ui.dp(50), marginDp = 4))

        // الكاميرا
        page.addView(section("📹 كاميرا العربية"))
        if (!Guard.cam.permitted()) {
            page.addView(ui.text("عشان التسجيل وقت تنبيه السرقة لازم إذن الكاميرا. الفيديو بيفضل على الشاشة دى بس.", 15f, ui.muted))
            page.addView(ui.button("اسمح بالكاميرا", "primary") { requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAM) }, ui.lp(Ui.MATCH, ui.dp(56), marginDp = 4))
        } else {
            if (Guard.cam.pickCamera() == null) page.addView(ui.text("⚠️ أندرويد مش شايف أى كاميرا على الشاشة دى — شوف «🩺 فحص الشاشة» فى الإعدادات.", 15f, ui.warn))
            page.addView(toggle("سجّل ٣٠ ثانية لما يحصل تنبيه سرقة", prefs.recordOnAlarm) { prefs.recordOnAlarm = it })
            page.addView(ui.button(if (Guard.cam.busy) "⏺ بيسجّل…" else "⏺ سجّل ٢٠ ثانية دلوقتى", "neutral") {
                if (DriveService.State.running) DriveService.send(this, DriveService.ACTION_RECORD, 20)
                else Guard.record(20, "manual") { err -> toast(err ?: "اتسجّل ✓") }
                toast("بيسجّل ٢٠ ثانية…"); main.postDelayed({ refresh() }, 600)
            }, ui.lp(Ui.MATCH, ui.dp(56), marginDp = 4))
        }
        val clips = Db.get(this).clips()
        if (clips.isNotEmpty()) page.addView(section("التسجيلات (${clips.size})"))
        for (c in clips.take(30)) {
            val row = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val why = if (c.reason == "alarm") "🚨 تنبيه سرقة" else "يدوى"
            row.addView(ui.text("${dateTime(c.t)} · ${c.sec} ث · %.1f ميجا\n$why".format(Locale.US, c.bytes / 1e6), 15f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(ui.button("▶", "primary", 16f) { playClip(c.path) }, ui.lp(ui.dp(60), ui.dp(48), 0f, 2))
            row.addView(ui.button("مسح", "neutral", 14f) { confirm("تمسح التسجيل ده؟") { java.io.File(c.path).delete(); Db.get(this).deleteClip(c.id); refresh() } }, ui.lp(ui.dp(76), ui.dp(48), 0f, 2))
            page.addView(row, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }

        // الأحداث
        val evs = Db.get(this).recentSecEvents(15)
        if (evs.isNotEmpty()) page.addView(section("آخر الأحداث"))
        val names = mapOf("started_armed" to "⚠️ اشتغلت والحماية شغّالة", "armed_move" to "🚨 اتحركت من غير الرقم", "pin_ok" to "✅ الرقم صح",
            "pin_wrong" to "⛔ رقم غلط ٣ مرات", "armed" to "🛡️ الحماية اتفعّلت", "disarmed" to "🔓 الحماية اتقفلت",
            "clip" to "📹 تسجيل", "camera_error" to "📷 الكاميرا ماسجّلتش")
        for (e in evs) page.addView(ui.text("${dateTime(e.t)} · ${names[e.kind] ?: e.kind}", 14f, ui.ink).apply { setPadding(ui.dp(6), ui.dp(3), ui.dp(6), ui.dp(3)) })
        return page
    }

    private fun pairPhone() {
        toast("بيجيب كود…")
        Guard.pairCode { code, err ->
            if (code == null) { toast(err ?: "مفيش نت"); return@pairCode }
            val box = ui.col(18)
            box.addView(ui.text(code.chunked(3).joinToString(" "), 44f, ui.ink, bold = true, gravity = Gravity.CENTER))
            box.addView(ui.text("على موبايلك افتح drive.oscardevs.com واكتب الكود ده. صالح ١٠ دقايق ولمرة واحدة.\n" +
                "على الآيفون: ضيف الصفحة للشاشة الرئيسية الأول (مشاركة ← Add to Home Screen) وافتحها من الأيقونة.", 15f, ui.muted, gravity = Gravity.CENTER))
            box.setBackgroundColor(ui.surface)
            AlertDialog.Builder(this).setTitle("📱 ربط موبايل").setView(box).setPositiveButton("تمام", null).show()
        }
    }

    private fun changePin() {
        val setNew = {
            askText("الرقم السرى الجديد (٤–٦ أرقام)", "••••", "", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD) { p ->
                if (Guard.setPin(p)) { toast("اتحفظ ✓"); refresh() } else toast("لازم ٤–٦ أرقام")
            }
        }
        if (Guard.pinSet()) askPin("اكتب الرقم السرى الحالى") { setNew() } else setNew()
    }

    private fun askPin(msg: String, ok: () -> Unit) {
        askText(msg, "••••", "", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD) { p ->
            if (Guard.checkPin(p)) ok() else toast("الرقم غلط")
        }
    }

    private fun playClip(path: String) {
        val v = android.widget.VideoView(this)
        v.setVideoPath(path)
        v.setOnPreparedListener { it.isLooping = false; v.start() }
        AlertDialog.Builder(this).setView(v).setPositiveButton("قفل", null).show()
    }

    /* ═══════════════ الإعدادات ═══════════════ */

    private fun settingsTab(): View {
        val page = ui.col(14)
        page.addView(header("⚙️ الإعدادات", "كل حاجة محفوظة على الشاشة نفسها — مفيش حساب ولا إنترنت مطلوب."))
        page.addView(optionRow("حد السرعة (التنبيه لما توصله)", listOf(60, 80, 90, 100, 120).map { it to "$it" }, prefs.limit) { prefs.limit = it })
        page.addView(optionRow("☕ فكّرنى بالاستراحة بعد", Wellness.OPTIONS.map { it to if (it == 0) "مقفول" else "${it / 60.0}".removeSuffix(".0") + " س" }, prefs.breakMin) { prefs.breakMin = it })
        page.addView(optionRow("الألوان", listOf(0 to "تلقائى (شروق/غروب)", 1 to "نهارى", 2 to "ليلى"), prefs.theme) { v ->
            prefs.theme = v
            DriveService.State.night = initialNight()
            build()
        })
        if (BuildConfig.NAV_SDK_KEY) {
            page.addView(optionRow("🧭 الملاحة", listOf(0 to "جوه Oscar Drive", 1 to "تطبيق الخرائط"), prefs.navMode) { prefs.navMode = it })
            val used = prefs.navUsedThisMonth(NavActivity.month())
            page.addView(ui.text("وجهات الملاحة جوه التطبيق الشهر ده من الشاشة دى: $used — أول ${NavActivity.FREE_PER_MONTH} فى الشهر مجانى من جوجل، " +
                "وبعدها بيفتح تطبيق الخرائط لوحده.", 13f, ui.muted).apply { setPadding(ui.dp(6), 0, ui.dp(6), ui.dp(6)) })
        }
        page.addView(toggle("🔊 تنبيه صوتى لما توصل حد السرعة", prefs.speedAlerts) { prefs.speedAlerts = it })
        page.addView(toggle("🛣️ نبّهنى قبل المطبات والحفر والرادار اللى سجّلتها", prefs.hazardAlerts) { prefs.hazardAlerts = it })
        page.addView(toggle("🅿️ احفظ مكان الركنة لوحده آخر كل رحلة", prefs.autoPark) { prefs.autoPark = it })
        page.addView(toggle("🔢 زوّد كيلومترات الرحلات على العدّاد", prefs.autoOdo) { prefs.autoOdo = it })
        page.addView(toggle("🚗 يشتغل لوحده مع تشغيل العربية", prefs.autoStart) { prefs.autoStart = it })

        page.addView(section("🆘 رقم الطوارئ"))
        page.addView(ui.text(if (prefs.emergencyPhone.isNotEmpty()) "${prefs.emergencyName} — ${prefs.emergencyPhone}" else "مش متحدد", 16f, ui.ink))
        page.addView(ui.button("حدّد الرقم", "neutral") {
            askText("اسم الشخص", "مثلاً: أخويا", prefs.emergencyName) { n ->
                askText("رقم تليفونه", "01xxxxxxxxx", prefs.emergencyPhone, InputType.TYPE_CLASS_PHONE) { p ->
                    prefs.emergencyName = n; prefs.emergencyPhone = p; refresh()
                }
            }
        }, ui.lp(Ui.MATCH, ui.dp(54), marginDp = 4))

        page.addView(section("عن التطبيق"))
        page.addView(ui.text("Oscar Drive — من OscarDevs (oscardevs.com). نسخة ${BuildConfig.VERSION_NAME}.\n" +
            "السرعة من الـGPS (Doppler) — قراءة استرشادية، وعدّاد العربية هو المرجع.\n" +
            "اتعمل عشان تبص عليه بسرعة: ماتستخدمش الشاشة وانت سايق أكتر من نظرة.", 14f, ui.muted))
        page.addView(ui.button("🩺 فحص الشاشة (GPS · الكاميرا · الشريحة · خدمات جوجل)", "primary", 16f) { showDeviceCheck() },
            ui.lp(Ui.MATCH, ui.dp(56), marginDp = 4))
        page.addView(ui.button("🔒 سياسة الخصوصية", "neutral", 15f) {
            view("https://oscardevs.com/oscar-drive/privacy") || toast("مفيش متصفح على الشاشة")
        }, ui.lp(Ui.MATCH, ui.dp(52), marginDp = 4))
        if (Build.VERSION.SDK_INT >= 23) {
            page.addView(ui.button("فتح إعدادات الـLocation", "neutral", 15f) {
                try { startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) } catch (_: Exception) {}
            }, ui.lp(Ui.MATCH, ui.dp(52), marginDp = 4))
        }
        return page
    }

    private fun optionRow(label: String, options: List<Pair<Int, String>>, current: Int, onPick: (Int) -> Unit): View {
        val c = ui.card(12)
        c.addView(ui.text(label, 16f, ui.ink, bold = true))
        val r = ui.row()
        for ((v, t) in options) {
            r.addView(ui.button(t, if (v == current) "primary" else "neutral", 15f) { onPick(v); refresh() }, ui.lp(0, ui.dp(52), 1f, 3))
        }
        c.addView(r)
        return c.also { it.layoutParams = ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4) }
    }

    private fun toggle(label: String, on: Boolean, set: (Boolean) -> Unit): View {
        val c = ui.card(10).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        c.addView(ui.text(label, 16f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        c.addView(ui.button(if (on) "شغّال" else "مقفول", if (on) "good" else "neutral", 15f) { set(!on); refresh() }, ui.lp(ui.dp(100), ui.dp(50), 0f, 2))
        c.layoutParams = ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4)
        return c
    }

    private fun header(t: String, sub: String): View {
        val c = ui.col()
        c.addView(ui.text(t, 26f, ui.ink, bold = true))
        c.addView(ui.text(sub, 15f, ui.muted).apply { setPadding(0, ui.dp(2), 0, ui.dp(10)) })
        return c
    }

    private fun section(t: String): View = ui.text(t, 19f, ui.ink, bold = true).apply { setPadding(0, ui.dp(16), 0, ui.dp(6)) }

    /* ═══════════════ الأفعال ═══════════════ */

    private fun toggle() {
        if (DriveService.State.running) { DriveService.stop(this); main.postDelayed({ render() }, 300); return }
        startIfReady(explain = true)
    }

    private fun startIfReady(explain: Boolean = false) {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            if (explain) askPermissions()
            return
        }
        try { DriveService.start(this) } catch (e: Exception) { if (explain) toast("مقدرتش أبدأ: ${e.message}") }
        main.postDelayed({ render() }, 300)
    }

    private fun changeLimit(d: Int) {
        prefs.limit = prefs.limit + d
        DriveService.State.limitKmh = prefs.limit
        render()
    }

    /** المكان الحالى (أو آخر مكان معروف). */
    private fun here(): Pair<Double, Double>? {
        val s = DriveService.State
        val lat = s.lat; val lng = s.lng
        if (lat != null && lng != null) return lat to lng
        if (prefs.lastLat != 0.0 || prefs.lastLng != 0.0) return prefs.lastLat to prefs.lastLng
        return null
    }

    private fun needHere(): Pair<Double, Double>? = here() ?: run {
        toast("لسه الـGPS ماحددش مكانك — اضغط «ابدأ» واستنى ثوانى")
        null
    }

    private fun markHazard(t: HazardType) {
        val (lat, lng) = needHere() ?: return
        val s = DriveService.State
        if (RoadMemory.duplicateOf(db.hazards(), t, lat, lng) != null) { oscar("already_saved", "${t.ar} متسجّل هنا قبل كده"); return }
        val moving = (s.speedKmh ?: 0f) >= 10f
        db.addHazard(t, lat, lng, if (moving) s.headingDeg else null)
        DriveService.State.hazardsDirty = true
        oscar(when (t) { HazardType.BUMP -> "bump_saved"; HazardType.POTHOLE -> "pothole_saved"; HazardType.RADAR -> "radar_saved"; else -> "danger_saved" },
            "اتسجّل ${t.ar}")
    }

    private fun parkHere() {
        val (lat, lng) = needHere() ?: return
        val s = DriveService.State
        // الدقة: من الـGPS لو لاقط · من الشبكة لو تقريبى · ولو آخر مكان معروف بس ⇒ مش معروفة (بتتكتب «تقريبى»)
        val acc = if (s.lat != null) s.accuracyM else null
        db.park(lat, lng, acc, prefs.odoKm.toInt())
        oscar("parking_saved", "اتحفظ مكان الركنة" + if (acc == null || acc > Parking.APPROX_M) " (تقريبى)" else "")
    }

    private fun savePlace(name: String) {
        val (lat, lng) = needHere() ?: return
        if (name.isBlank()) return
        db.addPlace(name.trim(), lat, lng)
        toast("اتحفظ «${name.trim()}»")
        refresh()
    }

    private fun openMap() {
        val p = here()
        val uri = if (p != null) "geo:${p.first},${p.second}?z=16" else "geo:0,0?z=3"
        view(uri) || toast("مفيش تطبيق خرائط على الشاشة")
    }

    private fun nearestFuel() {
        val p = here()
        val uri = if (p != null) "geo:${p.first},${p.second}?q=" + Uri.encode("gas station") else "geo:0,0?q=" + Uri.encode("gas station")
        view(uri) || toast("مفيش تطبيق خرائط على الشاشة")
    }

    /** الملاحة: جوه Oscar Drive (لو متاحة) وإلا تطبيق الخرائط — NavActivity بيقرّر وبيرجع للخرائط لو حصلت مشكلة. */
    private fun navigateTo(lat: Double, lng: Double, label: String, walk: Boolean = false) {
        if (!walk) tripFuelHint(lat, lng)
        NavActivity.start(this, lat, lng, label, walk)
    }

    /**
     * قبل مشوار طويل (> ٣٠ كم): المسافة التقريبية والبنزين والتكلفة والفاضل، وهل تفوّل الأول — ومكتوب على أساس إيه.
     * المسافة = خط مستقيم × ١٫٢٥ (تقريبى — الطريق الحقيقى بيبان فى الملاحة).
     */
    private fun tripFuelHint(lat: Double, lng: Double) {
        val from = here() ?: return
        val km = Geo.distanceM(from.first, from.second, lat, lng) / 1000 * 1.25
        if (km < 30) return
        val fills = db.fillRecs()
        val real = FuelBook.consumption(fills)
        val rem = FuelBook.remaining(fills, prefs.odoKm, prefs.tankL, prefs.provisionalRate)
        val grade = Grade.of(prefs.fuelGrade) ?: Grade.G92
        val plan = FuelBook.trip(km, real ?: prefs.provisionalRate, real == null, FuelPrices.current(prefs.fuelPrices(), grade), rem?.liters,
            odoUsed = prefs.odoKm.takeIf { it > 0 })
        Toast.makeText(this, "⛽ ${plan.text}", Toast.LENGTH_LONG).show()
        if (plan.refuel) Oscar.sayText("المشوار محتاج حوالى ${"%.0f".format(Locale.US, plan.liters)} لتر، والفاضل أقل — فوّل قبل ما تمشى")
    }

    private fun goTo(place: String) {
        val norm = VoiceCommands.normalize(place)
        val p = db.places().firstOrNull { VoiceCommands.normalize(it.name) == norm }
        if (p != null) { navigateTo(p.lat, p.lng, p.name); return }
        view("geo:0,0?q=" + Uri.encode(place)) || toast("مفيش تطبيق خرائط على الشاشة")
    }

    private fun music() {
        try {
            startActivity(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MUSIC).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) { toast("مفيش تطبيق أغانى معروف على الشاشة") }
    }

    private fun emergency() {
        val p = needHere() ?: return
        val text = "محتاج مساعدة. مكانى دلوقتى: ${Geo.mapsLink(p.first, p.second)}"
        val who = prefs.emergencyName.ifEmpty { prefs.emergencyPhone }
        confirm(if (prefs.emergencyPhone.isNotEmpty()) "هجهّز رسالة بمكانك لـ $who — وانت تدوس إرسال. تمام؟" else "هفتح المشاركة بمكانك وانت تختار تبعته لمين. تمام؟") {
            if (prefs.emergencyPhone.isNotEmpty()) {
                val i = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(prefs.emergencyPhone))).putExtra("sms_body", text)
                try { startActivity(i) } catch (_: ActivityNotFoundException) { share(text) }
            } else share(text)
        }
    }

    private fun share(text: String) {
        val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        try { startActivity(Intent.createChooser(i, "ابعت لـ…")) } catch (_: Exception) { toast("مفيش تطبيق للمشاركة") }
    }

    private fun view(uri: String): Boolean = try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (_: Exception) { false }

    /* ═══════════════ 🎙️ Oscar Voice: أوامر ثابتة من غير AI ═══════════════ */

    private var wake: WakeListener? = null
    /** بعد «يا أوسكار» لوحدها: الجملة الجاية جوّه ٨ ثوانى = أمر من غير ما تنادى تانى. */
    private var awaitingUntil = 0L

    private fun engine() = VoiceEngine(prefs.customPhrases(), prefs.disabledCommands, prefs.wakeNames, prefs.learnedWords())

    /** أوسكار يقول جملة الحدث + تظهر مكتوبة. */
    private fun oscar(id: String, shown: String? = null, extra: String? = null) {
        Oscar.say(id, extra)
        (shown ?: Oscar.texts(id).firstOrNull())?.let { toast(listOfNotNull(it, extra).joinToString(" — ")) }
    }

    /** زرار 🎤: برنامج التعرّف بتاع الشاشة يسمع جملة واحدة (من غير إذن ميكروفون للتطبيق). */
    private fun listen() {
        wake?.stop()
        if (useEars()) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC); return
            }
            OfflineEars.start(this, OfflineEars.langOf(prefs.voiceLang), oneShot = true,
                onText = { t -> handleHeard(listOf(t), button = true); startWakeIfOn() },
                onState = { st -> if (st.isNotEmpty()) toast(st) })
            return
        }
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, prefs.voiceLang)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, prefs.voiceOffline)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, if (prefs.voiceLang.startsWith("en")) "Say: take me home · mark a bump · what's my speed"
                else "قول: وصّلنى البيت · سجّل مطب · السرعة كام · فعّل الحماية")
        try { startActivityForResult(i, REQ_VOICE) }
        catch (_: ActivityNotFoundException) { toast("الشاشة مافيهاش برنامج تعرّف على الكلام — استخدم الأزرار") }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_VOICE) return
        if (resultCode == RESULT_OK) handleHeard(data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS).orEmpty(), button = true)
        startWakeIfOn()
    }

    /**
     * الكلام اللى اتسمع (أكتر من احتمال من برنامج التعرّف). من الزرار: أى أمر. من الاستماع الدائم: لازم الاسم الأول
     * («يا أوسكار …») أو جوّه ٨ ثوانى بعد ما ناديته — وغير كده بيتجاهل كلام العربية والراديو.
     */
    private fun handleHeard(heard: List<String>, button: Boolean) {
        if (heard.isEmpty()) return
        val e = engine()
        val now = System.currentTimeMillis()
        // ١) رد على «تقصد …؟» — «أيوه» ينفّذ ويتعلّم · «لأ» يلغى
        val p = pending
        if (p != null && now < pendingUntil) {
            val ans = heard.firstNotNullOfOrNull { EgyptWords.yesNo(VoiceEngine.normalize(e.afterWake(it) ?: it)) }
            if (ans != null) { if (ans) acceptGuess(p) else rejectGuess(); return }
        }
        pending = null
        var called = button || now < awaitingUntil
        var best: Understood? = null
        for (h in heard) {
            val rest = e.afterWake(h)
            val text = when {
                rest != null -> { called = true; rest }
                button || now < awaitingUntil -> h
                else -> null
            }
            if (text.isNullOrEmpty()) continue
            // ٢) «أنا قلت مطب مش مطلب» ⇒ أوسكار يحفظ الكلمة
            EgyptWords.correction(VoiceEngine.normalize(text))?.let { (wrong, right) ->
                prefs.addLearned(mapOf(wrong to right)); awaitingUntil = 0
                val msg = "تمام، هفتكر إن «$wrong» يعنى «$right»"
                Oscar.sayText(msg); toast(msg); return
            }
            e.understand(text)?.let { u -> val b = best; if (b == null || (u.sure && !b.sure)) best = u }
        }
        if (!called) return
        val u = best
        if (u == null) {
            if (heard.any { e.afterWake(it) == "" }) { awaitingUntil = now + 8000; oscar("hello"); return }
            awaitingUntil = 0; oscar("not_understood", "مافهمتش: «${heard.first()}»"); return
        }
        if (!u.sure) { askGuess(u); return }
        awaitingUntil = 0
        runCommand(u.match.command.id, u.match.slot, u.heard)
    }

    /* ── الفهم الذكى: لو مش متأكد بيسأل، ولو قلت «أيوه» بيتعلّم الكلمة ── */
    private var pending: Understood? = null
    private var pendingUntil = 0L
    private var guessDialog: AlertDialog? = null

    private fun askGuess(u: Understood) {
        val now = System.currentTimeMillis()
        pending = u; pendingUntil = now + 10_000; awaitingUntil = pendingUntil
        val q = "تقصد «${u.match.command.title}»؟"
        Oscar.sayText("$q قول أيوه أو لأ")
        guessDialog?.dismiss()
        guessDialog = AlertDialog.Builder(this).setTitle("🎙️ $q").setMessage("سمعت: «${u.heard}»")
            .setPositiveButton("أيوه") { _, _ -> acceptGuess(u) }
            .setNegativeButton("لأ") { _, _ -> rejectGuess() }
            .setOnCancelListener { pending = null }
            .show()
        // زرار 🎤 من غير استماع دايم ⇒ يسمع الرد مرة كمان (بمحرّك أوسكار بس — برنامج الشاشة بيفتح شاشة جوجل)
        if (wake?.active != true && useEars()) main.postDelayed({ if (pending === u) listen() }, 2500)
    }

    private fun acceptGuess(u: Understood) {
        pending = null; awaitingUntil = 0
        guessDialog?.dismiss(); guessDialog = null
        if (u.learn.isNotEmpty()) prefs.addLearned(u.learn)   // المرة الجاية يتفهم على طول
        runCommand(u.match.command.id, u.match.slot, u.heard)
    }

    private fun rejectGuess() {
        pending = null; awaitingUntil = 0
        guessDialog?.dismiss(); guessDialog = null
        oscar("ok", "تمام — قول الأمر تانى، أو قول مثلاً «أنا قلت مطب مش مطلب»")
    }

    /** كل أمر مربوط بوظيفة ثابتة — نفس الأزرار بالظبط. */
    private fun runCommand(id: String, slot: String?, heard: String = "") {
        val s = DriveService.State
        when (id) {
            "nav.open" -> { oscar("nav_start"); openMap() }
            "nav.home", "nav.work" -> {
                val name = if (id == "nav.home") "البيت" else "الشغل"
                val p = db.places().firstOrNull { it.name == name }
                if (p == null) oscar("need_home", "احفظ «$name» الأول من شاشة الملاحة") else { oscar("nav_start"); navigateTo(p.lat, p.lng, p.name) }
            }
            "nav.fuel" -> { oscar("fuel"); nearestFuel() }
            "nav.goto" -> { oscar("nav_start", "رايحين: $slot"); goTo(slot ?: return) }
            "car.find" -> db.parkings().firstOrNull()?.let { oscar("find_car"); navigateTo(it.lat, it.lng, "العربية", walk = true) } ?: oscar("no_parking")
            "park.save" -> parkHere()
            "road.bump" -> { markHazard(HazardType.BUMP); if (tab == "road") refresh() }
            "road.pothole" -> { markHazard(HazardType.POTHOLE); if (tab == "road") refresh() }
            "road.radar" -> { markHazard(HazardType.RADAR); if (tab == "road") refresh() }
            "road.danger" -> { markHazard(HazardType.DANGER); if (tab == "road") refresh() }
            "info.speed" -> s.speedKmh?.let { Oscar.sayText(if (Oscar.lang == "en") "${it.toInt()} kilometers per hour" else "سرعتنا ${it.toInt()} كيلو"); toast("${it.toInt()} كم/س") }
                ?: Oscar.sayText(if (Oscar.lang == "en") "No GPS speed yet" else "لسه الـGPS ماحددش السرعة")
            "info.trip" -> Oscar.sayText(if (s.tripActive) "مشينا %.1f كيلو فى ${s.tripMovingS / 60} دقيقة".format(Locale.US, s.tripKm) else "مفيش رحلة دلوقتى")
            "info.limit" -> VoiceEngine.number(slot)?.takeIf { it in Prefs.LIMIT_MIN..Prefs.LIMIT_MAX }?.let {
                prefs.limit = it; DriveService.State.limitKmh = it; Oscar.sayText("الحد بقى $it"); render()
            } ?: Oscar.sayText("قول رقم الحد، مثلاً: خلّى الحد تمانين")
            "sec.arm" -> if (!prefs.securityOn || !Guard.pinSet()) { oscar("security_setup"); showTab("sec") } else { Guard.setArmedFromCar(true); oscar("security_on"); if (tab == "sec") refresh() }
            "sec.disarm" -> if (!prefs.armed) oscar("security_off") else { oscar("pin_needed"); askPin("اكتب الرقم السرى عشان تقفل الحماية") { Guard.setArmedFromCar(false); oscar("security_off"); refresh() } }
            "sec.status" -> oscar(if (prefs.armed) "security_on" else "security_off")
            "sec.record" -> { oscar("record_start"); if (DriveService.State.running) DriveService.send(this, DriveService.ACTION_RECORD, 20) else Guard.record(20, "manual") }
            "media.music" -> { oscar("music"); music() }
            "media.up", "media.down" -> {
                val am = getSystemService(AUDIO_SERVICE) as android.media.AudioManager
                am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC,
                    if (id == "media.up") android.media.AudioManager.ADJUST_RAISE else android.media.AudioManager.ADJUST_LOWER, android.media.AudioManager.FLAG_SHOW_UI)
            }
            "screen.drive" -> showTab("drive")
            "screen.settings" -> showTab("settings")
            "screen.car" -> showTab("car")
            "screen.road" -> showTab("road")
            "screen.security" -> showTab("sec")
            "screen.parking" -> showTab("park")
            "sys.night", "sys.day" -> {
                prefs.theme = if (id == "sys.night") 2 else 1
                DriveService.State.night = initialNight(); build(); oscar(if (id == "sys.night") "night_on" else "day_on")
            }
            "emergency" -> { oscar("emergency"); emergency() }
            "help" -> { oscar("help"); showTab("voice") }
            "cancel" -> oscar("ok")
            // المرحلة ٤: العدّاد · الصيانة · البنزين بالصوت
            "car.odo" -> {
                val v = OdoVoice.parse("عداد " + (slot ?: "")) ?: OdoVoice.parse(heard)
                if (v == null) askNumber("رقم العدّاد من التابلوه (كم)", "") { setOdo(it) } else setOdo(v)
            }
            "car.maint" -> maintByVoice(MaintVoice.parse(heard))
            "fuel.add" -> FuelVoice.parse(heard).let { a -> addFill(a?.grade, a?.amount, a?.liters, a?.full) }
            "fuel.left" -> sayInfo(fuelLeftText())
            "maint.next" -> sayInfo(nextMaintText())
        }
    }

    private fun startWakeIfOn() {
        if (!prefs.voiceWake || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        val w = wake ?: WakeListener(this, { heard -> handleHeard(heard, button = false) }, { st -> wakeState = st; if (tab == "voice") refresh() }).also { wake = it }
        w.start(prefs.voiceLang, prefs.voiceOffline, useEars())
    }

    /** نسمع بمحرّك أوسكار (من غير نت) ولا ببرنامج الشاشة؟ تلقائى ⇒ أوسكار لو متنزّل (برنامج شاشة CitiSound بيقول إنه موجود وبيفشل). */
    private fun useEars(): Boolean = when (prefs.voiceEngine) {
        1 -> false
        2 -> true
        else -> OfflineEars.installed(this, OfflineEars.langOf(prefs.voiceLang))
    }
    private var wakeState = ""

    /* ═══════════════ 🎙️ شاشة أوسكار: الأوامر · الاسم · الصوت ═══════════════ */

    private fun voiceTab(): View {
        val page = ui.col(14)
        page.addView(header("🎙️ Oscar", "أوامر صوتية ثابتة بالعربى والإنجليزى — من غير ذكاء اصطناعى: الكلام بيتحوّل نص ببرنامج الشاشة، وكل أمر مربوط بوظيفة ثابتة. " +
            "تقدر تزوّد صيغك أو تقفل أى أمر، وتغيّر اسم الاستدعاء."))
        val r1 = ui.row()
        r1.addView(ui.button("🎤 اتكلّم دلوقتى", "primary") { listen() }, ui.lp(0, ui.dp(60), 1f, 3))
        page.addView(r1)

        page.addView(optionRow("لغة الكلام وردود أوسكار", listOf(0 to "عربى", 1 to "English"), if (prefs.voiceLang.startsWith("en")) 1 else 0) {
            prefs.voiceLang = if (it == 1) "en-US" else "ar-EG"; wake?.stop(); startWakeIfOn()
        })
        page.addView(toggle("📣 «يا أوسكار» — يسمع ويستنى اسمه طول ما التطبيق قدامك", prefs.voiceWake) { v ->
            prefs.voiceWake = v
            if (v) {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
                else startWakeIfOn()
            } else wake?.stop()
        })
        if (prefs.voiceWake && wakeState.isNotEmpty()) page.addView(ui.text(wakeState, 14f, ui.accent).apply { setPadding(ui.dp(6), 0, ui.dp(6), ui.dp(6)) })
        page.addView(toggle("📴 من غير نت قدر الإمكان (لو اللغة متنزّلة على الشاشة)", prefs.voiceOffline) { prefs.voiceOffline = it; wake?.stop(); startWakeIfOn() })

        // محرّك الكلام: برنامج الشاشة ولا محرّك أوسكار اللى من غير نت (شاشات زى CitiSound مافيهاش برنامج تعرّف شغّال)
        page.addView(optionRow("محرّك الكلام", listOf(0 to "تلقائى", 1 to "برنامج الشاشة", 2 to "أوسكار من غير نت"), prefs.voiceEngine) {
            prefs.voiceEngine = it; wake?.stop(); startWakeIfOn(); refresh()
        })
        val earsBox = ui.col(6)
        for ((lang, title) in listOf("ar" to "عربى", "en" to "English")) {
            val p = OfflineEars.PACKS.getValue(lang)
            val have = OfflineEars.installed(this, lang)
            val row = ui.row()
            val label = when {
                OfflineEars.downloading == lang -> "⏳ $title — ${OfflineEars.progress}"
                have -> "✅ $title — متنزّل"
                else -> "⬇️ نزّل $title (~${p.sizeMb} ميجا · مرة واحدة · محتاج نت)"
            }
            row.addView(ui.button(label, if (have) "ghost" else "primary", 15f) {
                if (have || OfflineEars.downloading != null) return@button
                toast("بينزّل… سيب الشاشة شغّالة وفيها نت")
                OfflineEars.download(this, lang, { refresh() }) { _, msg -> toast(msg); refresh(); if (OfflineEars.installed(this, OfflineEars.langOf(prefs.voiceLang))) { wake?.stop(); startWakeIfOn() } }
                refresh()
            }, ui.lp(0, ui.dp(54), 1f, 3))
            if (have) row.addView(ui.button("🗑️", "ghost", 15f) { OfflineEars.remove(this, lang); refresh() }, ui.lp(ui.dp(64), ui.dp(54), 0f, 3))
            earsBox.addView(row)
        }
        earsBox.addView(ui.text("🎧 أوسكار يسمع من غير نت: الكلام بيتحوّل نص على الشاشة نفسها ومابيتسجّلش ولا بيتبعت. " +
            "محتاج رامات فاضية (العربى ~${OfflineEars.PACKS.getValue("ar").minRamMb} ميجا) — الفاضى دلوقتى ${OfflineEars.freeRamMb(this)} ميجا.", 13f, ui.muted)
            .apply { setPadding(ui.dp(6), 0, ui.dp(6), ui.dp(6)) })
        page.addView(earsBox)

        // كلمات علّمتها لأوسكار (الفهم الذكى) — تقدر تمسح أى واحدة
        val learned = prefs.learnedWords()
        page.addView(ui.text("🧠 كلمات علّمتها لأوسكار" + if (learned.isEmpty()) " — لسه مفيش. لو فهمك غلط قول: «أنا قلت مطب مش مطلب»" else "", 15f, ui.ink, bold = true)
            .apply { setPadding(ui.dp(6), ui.dp(10), ui.dp(6), ui.dp(4)) })
        for ((heard, meant) in learned) {
            val row = ui.row()
            row.addView(ui.text("«$heard» ⇐ «$meant»", 15f), ui.lp(0, Ui.WRAP, 1f, 6))
            row.addView(ui.button("🗑️", "ghost", 15f) { prefs.removeLearned(heard); refresh() }, ui.lp(ui.dp(64), ui.dp(50), 0f, 3))
            page.addView(row)
        }

        // اسم الاستدعاء
        page.addView(section("اسم الاستدعاء"))
        val names = ui.row()
        for (n in prefs.wakeNames) names.addView(ui.button("$n ✕", "neutral", 14f) {
            if (prefs.wakeNames.size <= 1) toast("لازم اسم واحد على الأقل") else { prefs.wakeNames = prefs.wakeNames - n; refresh() }
        }, ui.lp(Ui.WRAP, ui.dp(48), 0f, 3))
        names.addView(ui.button("＋ اسم", "primary", 14f) { askText("اسم الاستدعاء", "مثلاً: يا كابتن", "") { t -> if (t.isNotBlank()) { prefs.wakeNames = prefs.wakeNames + t.trim(); refresh() } } },
            ui.lp(Ui.WRAP, ui.dp(48), 0f, 3))
        page.addView(HorizontalScrollView(this).apply { addView(names) })

        // جرّب جملة مكتوبة
        val test = ui.card(12).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val tf = EditText(this).apply { hint = "جرّب جملة: يا أوسكار وصلنى البيت"; textSize = 16f; setTextColor(ui.ink); setHintTextColor(ui.muted) }
        val res = ui.text("", 15f, ui.accent)
        test.addView(tf, LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
        test.addView(ui.button("افهمها", "neutral", 14f) {
            val e = engine(); val t = tf.text.toString(); val rest = e.afterWake(t)
            val m = e.match(rest ?: t)
            res.text = (if (rest != null) "✓ الاسم · " else "") + (m?.let { "⇒ ${it.command.title}" + (it.slot?.let { s -> " («$s»)" } ?: "") } ?: "⇒ مش مفهوم")
        }, ui.lp(ui.dp(100), ui.dp(50), 0f, 2))
        page.addView(test, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 4)); page.addView(res)

        // صوت أوسكار
        page.addView(section("🗣️ صوت أوسكار"))
        page.addView(toggle("أوسكار يرد بصوته", prefs.oscarReplies) { prefs.oscarReplies = it })
        page.addView(optionRow("الصوت", listOf(0 to "راجل", 1 to "ست"), if (prefs.oscarVoice == "female") 1 else 0) { prefs.oscarVoice = if (it == 1) "female" else "male"; Oscar.ensureBundled() })
        val dl = ui.row()
        dl.addView(ui.button("⬇️ نزّل صوت أوسكار", "primary", 15f) { toast("بينزّل…"); Oscar.downloadPack { msg -> main.post { toast(msg); refresh() } } }, ui.lp(0, ui.dp(54), 1f, 3))
        dl.addView(ui.button("▶ اسمعه", "neutral", 15f) { Oscar.say("hello") }, ui.lp(ui.dp(120), ui.dp(54), 0f, 3))
        page.addView(dl)
        if (Oscar.packStatus.isNotEmpty()) page.addView(ui.text(Oscar.packStatus, 14f, ui.muted))
        page.addView(ui.text("الجمل اتعملت مرة واحدة بالذكاء الاصطناعى وبتتنزّل ملفات على الشاشة — وبعدها مفيش نت ولا AI. لو صوت جملة لسه مانزلش، أوسكار بيقولها بصوت الشاشة.", 13f, ui.muted))
        for (eid in Oscar.ids()) {
            val row = ui.card(8).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val mine = prefs.customLine(eid, Oscar.lang)
            row.addView(ui.text((mine ?: Oscar.texts(eid).joinToString(" · ")) + if (mine != null) "  ✏️" else "", 14f, ui.ink), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            row.addView(ui.button("▶", "neutral", 14f) { Oscar.say(eid) }, ui.lp(ui.dp(52), ui.dp(44), 0f, 2))
            row.addView(ui.button("✏️", "neutral", 14f) {
                askText("جملتك للحدث ده (فاضى = الأصلية)", Oscar.texts(eid).firstOrNull() ?: "", mine ?: "") { t ->
                    Oscar.setCustom(eid, t.trim()) { msg -> main.post { toast(msg); refresh() } }
                }
            }, ui.lp(ui.dp(52), ui.dp(44), 0f, 2))
            page.addView(row, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 2))
        }

        // مدير الأوامر
        page.addView(section("📋 الأوامر (${VoiceCatalog.ALL.size})"))
        val custom = prefs.customPhrases()
        val off = prefs.disabledCommands
        for (c in VoiceCatalog.ALL) {
            val card = ui.card(10)
            val head = ui.row()
            head.addView(ui.text(c.title + if (c.confirm) "  🔒" else "", 17f, if (c.id in off) ui.muted else ui.ink, bold = true), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            head.addView(ui.button(if (c.id in off) "مقفول" else "شغّال", if (c.id in off) "neutral" else "good", 13f) {
                prefs.disabledCommands = if (c.id in off) off - c.id else off + c.id; refresh()
            }, ui.lp(ui.dp(90), ui.dp(44), 0f, 2))
            head.addView(ui.button("＋ صيغة", "neutral", 13f) {
                askText("صيغة جديدة لـ«${c.title}» (عربى أو English، * = مكان)", "مثلاً: ودّينى البيت", "") { t ->
                    if (t.isNotBlank()) { val m = custom.toMutableMap(); m[c.id] = custom[c.id].orEmpty() + t.trim(); prefs.setCustomPhrases(m); refresh() }
                }
            }, ui.lp(ui.dp(90), ui.dp(44), 0f, 2))
            card.addView(head)
            card.addView(ui.text("عربى: " + c.ar.joinToString(" · ") + "\nEnglish: " + c.en.joinToString(" · "), 13f, ui.muted))
            val mine = custom[c.id].orEmpty()
            if (mine.isNotEmpty()) {
                val r = ui.row()
                for (ph in mine) r.addView(ui.button("$ph ✕", "neutral", 13f) {
                    val m = custom.toMutableMap(); m[c.id] = mine - ph; prefs.setCustomPhrases(m); refresh()
                }, ui.lp(Ui.WRAP, ui.dp(42), 0f, 2))
                card.addView(HorizontalScrollView(this).apply { addView(r) })
            }
            page.addView(card, ui.lp(Ui.MATCH, Ui.WRAP, marginDp = 3))
        }
        return page
    }

    /** «فحص الشاشة»: إيه اللى الشاشة دى فيها فعلاً — قبل ما نبنى مانع السرقة على تخمين. */
    private fun showDeviceCheck() {
        val rows = DeviceCheck.report(this)
        val box = ui.col(14)
        for (r in rows) {
            val line = ui.row(4)
            line.addView(ui.text(r.label, 15f, if (r.verdict) ui.accent else ui.muted, bold = r.verdict), LinearLayout.LayoutParams(ui.dp(170), Ui.WRAP))
            line.addView(ui.text(r.value, 15f, ui.ink, bold = r.verdict), LinearLayout.LayoutParams(0, Ui.WRAP, 1f))
            box.addView(line)
        }
        val sv = ScrollView(this).apply { addView(box); setBackgroundColor(ui.surface) }
        AlertDialog.Builder(this).setTitle("🩺 فحص الشاشة").setView(sv)
            .setPositiveButton("شارك التقرير") { _, _ -> share(DeviceCheck.asText(rows)) }
            .setNegativeButton("قفل", null).show()
    }

    /* ═══════════════ حوارات صغيرة ═══════════════ */

    private fun editMaint(id: Long, name: String, km: Int, days: Int) {
        val box = ui.col(16)
        val kmIn = numberField("كل كام كيلو (٠ = مالوش)", km.toString())
        val dIn = numberField("كل كام يوم (٠ = مالوش)", days.toString())
        box.addView(kmIn); box.addView(dIn)
        AlertDialog.Builder(this).setTitle(name).setView(box)
            .setPositiveButton("حفظ") { _, _ ->
                db.maintEdit(id, kmIn.text.toString().toIntOrNull() ?: km, dIn.text.toString().toIntOrNull() ?: days); refresh()
            }.setNegativeButton("إلغاء", null).show()
    }

    /**
     * تفويلة (المرحلة ٤): النوع ٨٠/٩٢/٩٥ + «دفعت كام» **أو** «كام لتر» — لو كتبت المبلغ بس، اللترات = المبلغ ÷ سعر اللتر
     * (من جدول الأسعار، والسعر بيتحفظ مع التفويلة). لآخرها ولا جزئى. ممكن ييجى مملى من الصوت («حطيت ٩٢ بـ٥٠٠»).
     */
    private fun addFill(grade0: Grade? = null, amount0: Double? = null, liters0: Double? = null, full0: Boolean? = null) {
        val box = ui.col(16)
        var grade = grade0 ?: Grade.of(prefs.fuelGrade) ?: Grade.G92
        val prices = prefs.fuelPrices()
        val gradeRow = ui.row()
        val priceTv = ui.text("", 14f, ui.muted)
        val showPrice = { priceTv.text = FuelPrices.current(prices, grade)?.let { "سعر لتر ${grade.ar}: ${"%.2f".format(Locale.US, it)} جنيه" }
            ?: "مفيش سعر لـ${grade.ar} — اكتب اللترات، أو حط السعر من شاشة السيارة" }
        val gradeBtns = Grade.entries.map { g -> ui.button(g.key, if (g == grade) "primary" else "neutral", 16f) {} }
        gradeBtns.forEachIndexed { k, b ->
            b.setOnClickListener { grade = Grade.entries[k]; gradeBtns.forEachIndexed { m, x -> x.background = ui.round(if (m == k) ui.accent else ui.surface2, 14); x.setTextColor(if (m == k) Color.WHITE else ui.ink) }; showPrice() }
            gradeRow.addView(b, ui.lp(0, ui.dp(50), 1f, 3))
        }
        showPrice()
        val odoIn = numberField("العدّاد دلوقتى (كم)", prefs.odoKm.toInt().takeIf { it > 0 }?.toString() ?: "")
        val amountIn = numberField("دفعت كام (جنيه)", amount0?.let { "%.0f".format(Locale.US, it) } ?: "", decimal = true)
        val litIn = numberField("كام لتر (لو عارف — غير كده بتتحسب من المبلغ)", liters0?.let { "%.1f".format(Locale.US, it) } ?: "", decimal = true)
        val full = CheckBox(this).apply { text = "فوّلت لآخرها (التانك اتملا)"; isChecked = full0 ?: true; textSize = 17f }
        box.addView(gradeRow); box.addView(priceTv); box.addView(odoIn); box.addView(amountIn); box.addView(litIn); box.addView(full)
        AlertDialog.Builder(this).setTitle("⛽ تفويلة").setView(box)
            .setPositiveButton("حفظ") { _, _ ->
                val odo = odoIn.text.toString().toIntOrNull()
                val amount = amountIn.text.toString().toDoubleOrNull()
                val ppl = FuelPrices.at(prices, grade, System.currentTimeMillis())
                var lit = litIn.text.toString().toDoubleOrNull()
                if (lit == null && amount != null && ppl != null) lit = FuelBook.litersFor(amount, ppl)
                if (odo == null || lit == null || lit <= 0) {
                    toast(if (odo == null) "لازم العدّاد" else "اكتب اللترات، أو حط سعر ${grade.ar} من شاشة السيارة عشان أحسبها من المبلغ"); return@setPositiveButton
                }
                val paid = amount ?: (ppl?.let { it * lit } ?: 0.0)
                db.addFill(odo, lit, paid, full.isChecked, grade, ppl ?: if (amount != null && lit > 0) amount / lit else null)
                prefs.fuelGrade = grade.key
                if (odo > prefs.odoKm) setOdo(odo)
                sayInfo("اتسجّلت: ${"%.1f".format(Locale.US, lit)} لتر ${grade.ar}${if (paid > 0) " بـ${"%.0f".format(Locale.US, paid)} جنيه" else ""}" +
                    if (amount != null && litIn.text.isNullOrBlank()) " (اللترات محسوبة من سعر اللتر)" else "")
                refresh()
            }.setNegativeButton("إلغاء", null).show()
    }

    private fun numberField(hint: String, value: String, decimal: Boolean = false): EditText = EditText(this).apply {
        this.hint = hint; setText(value); textSize = 18f
        inputType = InputType.TYPE_CLASS_NUMBER or (if (decimal) InputType.TYPE_NUMBER_FLAG_DECIMAL else 0)
    }

    private fun askNumber(titleText: String, value: String, ok: (Int) -> Unit) {
        val f = numberField(titleText, value)
        AlertDialog.Builder(this).setTitle(titleText).setView(f)
            .setPositiveButton("حفظ") { _, _ -> f.text.toString().toIntOrNull()?.let(ok) }
            .setNegativeButton("إلغاء", null).show()
    }

    private fun askText(titleText: String, hint: String, value: String, type: Int = InputType.TYPE_CLASS_TEXT, ok: (String) -> Unit) {
        val f = EditText(this).apply { this.hint = hint; setText(value); textSize = 18f; inputType = type }
        AlertDialog.Builder(this).setTitle(titleText).setView(f)
            .setPositiveButton("تمام") { _, _ -> ok(f.text.toString()) }
            .setNegativeButton("إلغاء", null).show()
    }

    /** «خلّى العدّاد ٩٠ ألف» — المرجع الجديد بتاريخ النهارده، والـGPS بيكمّل عليه. */
    private fun setOdo(v: Int) {
        val first = prefs.odoKm < 1
        prefs.odoKm = v.toDouble()
        if (first) db.maintStartAt(v)
        sayInfo("تمام، العدّاد ${Odometer.fmtKm(v.toDouble())} كم — والـGPS هيكمّل عليه")
        refresh()
    }

    private fun sayInfo(t: String) { Oscar.sayText(t); toast(t) }

    /** «غيرت الزيت ٥٠٠٠ كيلو» · «غيرت الكاوتش الأمامى» · «غيرت الأربع فرد». */
    private fun maintByVoice(a: MaintVoiceAction?) {
        if (a == null) { sayInfo("قول مثلاً: غيرت الزيت ٥٠٠٠ كيلو، أو غيرت الكاوتش الأمامى"); return }
        if (a.items.isEmpty()) {   // «غيرت الكاوتش» من غير ما يحدد — مانفترضش الأربعة
            Oscar.sayText("الكاوتش الأمامى ولا الخلفى ولا الأربعة؟")
            AlertDialog.Builder(this).setTitle("🛞 غيّرت أنهى كاوتش؟")
                .setItems(arrayOf("الأمامى (فردتين)", "الخلفى (فردتين)", "الأربعة")) { _, i ->
                    maintByVoice(MaintVoiceAction(when (i) { 0 -> listOf(MaintVoice.TIRES_FRONT); 1 -> listOf(MaintVoice.TIRES_REAR); else -> listOf(MaintVoice.TIRES_FRONT, MaintVoice.TIRES_REAR) }))
                }.show()
            return
        }
        val doIt = { odo: Int ->
            for (name in a.items) {
                val item = db.maintByName(name) ?: run {
                    val d = CarCare.DEFAULTS.firstOrNull { it.first == name }
                    db.maintAdd(name, d?.second ?: 0, d?.third ?: 0, odo); db.maintByName(name)
                } ?: continue
                db.maintDone(item.id, odo, a.everyKm)
            }
            val oil = db.maintByName(MaintVoice.OIL)
            val next = if (MaintVoice.OIL in a.items && oil != null && oil.everyKm > 0) " — الزيت الجاى على ${Odometer.fmtKm((odo + oil.everyKm).toDouble())}" else ""
            sayInfo("تمام، سجّلت ${a.items.joinToString(" و")} على عدّاد ${Odometer.fmtKm(odo.toDouble())}$next")
            refresh()
        }
        val odo = prefs.odoKm.toInt()
        if (odo > 0) doIt(odo) else askNumber("العدّاد كام دلوقتى؟ (من التابلوه)", "") { v -> setOdo(v); doIt(v) }
    }

    private fun fuelLeftText(): String {
        val r = FuelBook.remaining(db.fillRecs(), prefs.odoKm, prefs.tankL, prefs.provisionalRate)
        return when {
            prefs.tankL <= 0 -> "اكتب سعة التانك الأول من شاشة السيارة عشان أقدر أقدّر الفاضل"
            r == null -> "محتاج تفويلة لآخرها عشان أعرف أحسب الفاضل — سجّلها لما تفوّل"
            else -> "الفاضل تقريباً ${"%.0f".format(Locale.US, r.liters)} لتر (تقدير — ${r.basis})"
        }
    }

    private fun nextMaintText(): String {
        val odo = prefs.odoKm.toInt(); val now = System.currentTimeMillis()
        val oil = db.maintByName(MaintVoice.OIL)
        val due = db.maint().map { it to CarCare.status(it, odo, now) }.filter { it.second.status != MaintStatus.OK }
        val parts = mutableListOf<String>()
        if (oil != null) parts += "الزيت: ${CarCare.describe(CarCare.status(oil, odo, now)).ifBlank { "مفيش ميعاد متحدد" }}"
        if (due.isNotEmpty()) parts += "قرّب أو وقته: " + due.joinToString("، ") { it.first.name }
        if (prefs.warrantyOn) Warranty.next(prefs.warrantyKm, prefs.warrantyDone, odo)?.let { (km, left) ->
            parts += "صيانة الوكيل الجاية على ${Odometer.fmtKm(km.toDouble())} (${if (left <= 0) "وقتها" else "فاضل ${Odometer.fmtKm(left.toDouble())} كم"})"
        }
        return if (parts.isEmpty()) "مفيش صيانة قرّبت" else parts.joinToString(" · ")
    }

    private fun confirm(msg: String, yes: () -> Unit) {
        AlertDialog.Builder(this).setMessage(msg).setPositiveButton("أيوه") { _, _ -> yes() }.setNegativeButton("لأ", null).show()
    }

    private fun say(t: String) { Speaker.say(t); toast(t) }
    private fun toast(t: String): Boolean { Toast.makeText(this, t, Toast.LENGTH_SHORT).show(); return true }

    /* ═══════════════ تنسيق ═══════════════ */

    private fun clock(ms: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = ms }
        val h = c.get(Calendar.HOUR).let { if (it == 0) 12 else it }
        return "%d:%02d %s".format(Locale.US, h, c.get(Calendar.MINUTE), if (c.get(Calendar.AM_PM) == Calendar.AM) "ص" else "م")
    }

    private fun duration(s: Long): String = if (s >= 3600) "%d:%02d س".format(Locale.US, s / 3600, (s % 3600) / 60) else "${s / 60} د"

    private fun km(m: Double): String = if (m < 1000) "${m.toInt()} م" else "%.1f كم".format(Locale.US, m / 1000)

    private fun dateTime(ms: Long): String = SimpleDateFormat("d/M  ", Locale.US).format(Date(ms)) + clock(ms)

    private fun ago(ms: Long): String {
        val m = (System.currentTimeMillis() - ms) / 60_000
        return when {
            m < 1 -> "دلوقتى"
            m < 60 -> "من $m دقيقة"
            m < 24 * 60 -> "من ${m / 60} ساعة"
            else -> dateTime(ms)
        }
    }

    /* ═══════════════ الأذونات ═══════════════ */

    private fun askPermissions() {
        val need = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.ACCESS_FINE_LOCATION; need += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.POST_NOTIFICATIONS
        }
        // «يا أوسكار» مفتوح افتراضياً ⇒ إذن الميكروفون مع أول تشغيل (مرة واحدة — لو اترفض الاستماع بيتقفل)
        if (prefs.voiceWake && !prefs.micAsked && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.RECORD_AUDIO; prefs.micAsked = true
        }
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), REQ_PERMS)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_PERMS && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startIfReady()
        else if (requestCode == REQ_PERMS) toast("Oscar Drive محتاج إذن المكان عشان يقيس السرعة")
        if (requestCode == REQ_PERMS && Manifest.permission.RECORD_AUDIO in permissions) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startWakeIfOn()
            else prefs.voiceWake = false
        }
        if (requestCode == REQ_MIC) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startWakeIfOn()
            else { prefs.voiceWake = false; toast("من غير الميكروفون استخدم زرار 🎤") }
            refresh()
        }
        if (requestCode == REQ_CAM) {
            if (Guard.cam.permitted()) { DriveService.send(this, DriveService.ACTION_REFRESH_FGS); toast("تمام — الكاميرا متاحة للتسجيل") }
            else toast("إذن الكاميرا اترفض")
            refresh()
        }
    }

    companion object {
        private const val REQ_PERMS = 1
        private const val REQ_VOICE = 5
        private const val REQ_CAM = 7
        private const val REQ_MIC = 8
    }
}
