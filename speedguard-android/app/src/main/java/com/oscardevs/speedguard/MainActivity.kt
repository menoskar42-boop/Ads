package com.oscardevs.speedguard

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.util.concurrent.Executors

/**
 * الشاشة: رقم سرعة كبير يتقرا من بعيد، الحد (+/−)، ابدأ/وقف، حالة الـGPS، والانضمام لشركة.
 * من غير XML — كل حاجة متبنية هنا عشان التطبيق يفضل بسيط ومن غير مكتبات.
 */
class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private lateinit var speedText: TextView
    private lateinit var unitText: TextView
    private lateinit var limitText: TextView
    private lateinit var limitNote: TextView
    private lateinit var gpsText: TextView
    private lateinit var startBtn: Button
    private lateinit var minusBtn: Button
    private lateinit var plusBtn: Button
    private lateinit var fleetBox: LinearLayout

    private val bg = Color.parseColor("#0B1016")
    private val card = Color.parseColor("#151D27")
    private val ink = Color.parseColor("#EEF3F8")
    private val muted = Color.parseColor("#93A3B4")
    private val good = Color.parseColor("#3DDC84")
    private val bad = Color.parseColor("#FF5A4E")
    private val accent = Color.parseColor("#4EA3F0")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(buildUi())
        askPermissions()
    }

    override fun onResume() {
        super.onResume()
        SpeedService.State.listener = { main.post { render() } }
        render()
    }

    override fun onPause() {
        SpeedService.State.listener = null
        super.onPause()
    }

    /* ───────── الواجهة ───────── */

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
            setPadding(dp(16), dp(16), dp(16), dp(24))
            layoutDirection = View.LAYOUT_DIRECTION_RTL
        }

        // السرعة
        speedText = TextView(this).apply {
            text = "--"; textSize = 120f; setTextColor(ink); typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER; includeFontPadding = false
        }
        unitText = TextView(this).apply { text = "كم/ساعة"; textSize = 20f; setTextColor(muted); gravity = Gravity.CENTER }
        gpsText = TextView(this).apply { textSize = 15f; setTextColor(muted); gravity = Gravity.CENTER; setPadding(0, dp(6), 0, dp(12)) }
        root.addView(speedText); root.addView(unitText); root.addView(gpsText)

        // الحد
        val limitRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = box() ; setPadding(dp(12), dp(10), dp(12), dp(10)) }
        minusBtn = bigButton("−") { changeLimit(-5) }
        plusBtn = bigButton("+") { changeLimit(+5) }
        limitText = TextView(this).apply { textSize = 34f; setTextColor(ink); typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER }
        val limitCol = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        limitCol.addView(TextView(this).apply { text = "حد السرعة"; textSize = 15f; setTextColor(muted); gravity = Gravity.CENTER })
        limitCol.addView(limitText)
        limitRow.addView(plusBtn, LinearLayout.LayoutParams(dp(72), dp(64)))
        limitRow.addView(limitCol, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        limitRow.addView(minusBtn, LinearLayout.LayoutParams(dp(72), dp(64)))
        root.addView(limitRow)
        limitNote = TextView(this).apply { textSize = 14f; setTextColor(muted); gravity = Gravity.CENTER; setPadding(0, dp(4), 0, dp(10)) }
        root.addView(limitNote)

        // ابدأ/وقف
        startBtn = Button(this).apply {
            textSize = 22f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.BLACK)
            setOnClickListener { toggle() }
        }
        root.addView(startBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)))

        val row2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(10), 0, dp(10)) }
        row2.addView(CheckBox(this).apply {
            text = "يشتغل لوحده مع العربية"; setTextColor(ink); textSize = 15f
            isChecked = prefs.autoStart
            setOnCheckedChangeListener { _, c -> prefs.autoStart = c }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        row2.addView(smallButton("اختبار الصوت") {
            if (SpeedService.State.running) Toast.makeText(this, "الإنذار هيتنطق لما تعدّى الحد", Toast.LENGTH_SHORT).show()
            else TestVoice.speak(this, prefs.effectiveLimit)
        })
        root.addView(row2)

        // الشركة
        fleetBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = box(); setPadding(dp(14), dp(12), dp(14), dp(14)) }
        root.addView(fleetBox)

        root.addView(TextView(this).apply {
            text = "مراقب السرعة — OscarDevs · نسخة ${BuildConfig.VERSION_NAME} تجريبية"
            textSize = 12f; setTextColor(muted); gravity = Gravity.CENTER; setPadding(0, dp(16), 0, 0)
        })
        return ScrollView(this).apply { setBackgroundColor(bg); addView(root) }
    }

    private fun renderFleet() {
        fleetBox.removeAllViews()
        val title = TextView(this).apply { textSize = 17f; setTextColor(ink); typeface = Typeface.DEFAULT_BOLD }
        fleetBox.addView(title)
        if (prefs.inFleet) {
            title.text = "تبع شركة: ${prefs.fleetName ?: ""}"
            fleetBox.addView(TextView(this).apply {
                text = "السواق: ${prefs.driverName ?: ""}\nالحد بيحدده صاحب الشركة، وكل تجاوز بيوصله." +
                    (if (SpeedService.State.pending > 0) "\nمستنى إرسال: ${SpeedService.State.pending} (أول ما النت يرجع)" else "")
                textSize = 14f; setTextColor(muted); setPadding(0, dp(4), 0, dp(8))
            })
            fleetBox.addView(smallButton("خروج من الشركة") {
                prefs.leaveFleet(); render()
            })
        } else {
            title.text = "تبع شركة؟"
            fleetBox.addView(TextView(this).apply { text = "اكتب كود الشركة واسمك — الحد هيبقى اللى صاحب الشركة محدده."; textSize = 14f; setTextColor(muted) })
            val code = input("كود الشركة", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS)
            val name = input("اسم السواق", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS)
            fleetBox.addView(code); fleetBox.addView(name)
            fleetBox.addView(smallButton("انضمام") { join(code.text.toString().trim(), name.text.toString().trim()) })
        }
    }

    private fun render() {
        val s = SpeedService.State
        val running = s.running
        val limit = prefs.effectiveLimit
        val sp = s.speedKmh
        speedText.text = if (running && sp != null) sp.toInt().toString() else "--"
        speedText.setTextColor(if (running && s.over) bad else if (running && sp != null) good else ink)
        limitText.text = limit.toString()
        val locked = prefs.inFleet
        minusBtn.isEnabled = !locked; plusBtn.isEnabled = !locked
        minusBtn.alpha = if (locked) .35f else 1f; plusBtn.alpha = minusBtn.alpha
        limitNote.text = if (locked) "الحد من الشركة" else "اضغط + أو − (كل ضغطة ٥)"
        gpsText.text = when {
            !running -> "اضغط «ابدأ» عشان يبدأ يقيس"
            !s.gpsEnabled -> "الـGPS مقفول — افتحه من الإعدادات"
            sp == null -> "بيدوّر على الأقمار… (${s.satsUsed}/${s.satsSeen})"
            else -> buildString {
                append("أقمار ${s.satsUsed}/${s.satsSeen}")
                s.accuracyM?.let { append(" · دقة المكان ±${it.toInt()} م") }
                s.speedAccKmh?.let { append(" · دقة السرعة ±${"%.1f".format(it)} كم/س") }
            }
        }
        startBtn.text = if (running) "إيقاف" else "ابدأ"
        startBtn.background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(if (running) bad else good) }
        renderFleet()
    }

    /* ───────── الأفعال ───────── */

    private fun toggle() {
        if (SpeedService.State.running) { SpeedService.stop(this); main.postDelayed({ render() }, 300); return }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { askPermissions(); return }
        val lm = getSystemService(LOCATION_SERVICE) as android.location.LocationManager
        if (!lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)) {
            Toast.makeText(this, "افتح الـGPS (الموقع) الأول", Toast.LENGTH_LONG).show()
            try { startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) } catch (_: Exception) {}
            return
        }
        SpeedService.start(this)
        main.postDelayed({ render() }, 300)
    }

    private fun changeLimit(d: Int) {
        if (prefs.inFleet) return
        prefs.personalLimit = prefs.personalLimit + d
        SpeedService.State.limitKmh = prefs.effectiveLimit
        render()
    }

    private fun join(code: String, name: String) {
        if (code.length < 4 || name.length < 2) { Toast.makeText(this, "اكتب الكود واسمك", Toast.LENGTH_SHORT).show(); return }
        Toast.makeText(this, "بيتصل بالشركة…", Toast.LENGTH_SHORT).show()
        io.execute {
            val r = FleetApi.join(code.uppercase(), name, prefs.deviceId)
            main.post {
                r.onSuccess { j ->
                    prefs.fleetToken = j.token; prefs.fleetName = j.fleetName; prefs.driverName = name
                    if (j.speedLimit in Prefs.LIMIT_MIN..Prefs.LIMIT_MAX) prefs.fleetLimit = j.speedLimit
                    SpeedService.State.limitKmh = prefs.effectiveLimit
                    Toast.makeText(this, "تمام — انضميت لـ ${j.fleetName}", Toast.LENGTH_LONG).show()
                }.onFailure { e ->
                    Toast.makeText(this, e.message ?: "مافيش نت — جرّب تانى", Toast.LENGTH_LONG).show()
                }
                render()
            }
        }
    }

    private fun askPermissions() {
        val need = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.ACCESS_FINE_LOCATION; need += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.POST_NOTIFICATIONS
        }
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        render()
    }

    /* ───────── أدوات ───────── */

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun box() = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(card) }

    private fun bigButton(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label; textSize = 30f; setTextColor(Color.BLACK); typeface = Typeface.DEFAULT_BOLD
        background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(accent) }
        setOnClickListener { onClick() }
    }

    private fun smallButton(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label; textSize = 15f; setTextColor(Color.BLACK)
        background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(accent) }
        setPadding(dp(14), dp(6), dp(14), dp(6))
        setOnClickListener { onClick() }
    }

    private fun input(hint: String, type: Int) = EditText(this).apply {
        this.hint = hint; inputType = type; setTextColor(ink); setHintTextColor(muted); textSize = 17f
    }
}
