package com.oscardevs.oscardrive

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.google.android.libraries.navigation.NavigationApi
import com.google.android.libraries.navigation.NavigationView
import com.google.android.libraries.navigation.Navigator
import com.google.android.libraries.navigation.Waypoint
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * الملاحة جوه Oscar Drive (Google Navigation SDK): الخريطة + تعليمات الانعطاف + الوقت والمسافة
 * الباقيين + صوت الإرشاد — والخدمة بتفضل شغّالة وراها (تنبيه السرعة والمطبات والاستراحة).
 *
 * أى مشكلة (مفيش مفتاح · الشاشة مافيهاش خدمات جوجل · الشروط ماتقبلتش · مفيش نت · عدّى ١٠٠٠ وجهة
 * الشهر ده) ⇒ نفس الرحلة بتتفتح فى تطبيق الخرائط (Intent) — مجانى ومن غير ما السواق يعمل حاجة.
 */
class NavActivity : Activity() {
    private var navView: NavigationView? = null
    private var navigator: Navigator? = null
    private var arrival: Navigator.ArrivalListener? = null
    private var lat = 0.0
    private var lng = 0.0
    private var label = ""
    private var done = false
    private val main = Handler(Looper.getMainLooper())
    private var speedTv: TextView? = null

    private val tick = object : Runnable {
        override fun run() {
            val s = DriveService.State
            speedTv?.text = (s.speedKmh?.toInt()?.toString() ?: "--") + "  ·  الحد ${s.limitKmh}"
            speedTv?.setTextColor(if (s.over) Color.parseColor("#FF5A4E") else Color.WHITE)
            main.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        lat = intent.getDoubleExtra(EXTRA_LAT, 0.0)
        lng = intent.getDoubleExtra(EXTRA_LNG, 0.0)
        label = intent.getStringExtra(EXTRA_LABEL) ?: ""
        val walk = intent.getBooleanExtra(EXTRA_WALK, false)

        val nv = try { NavigationView(this) } catch (t: Throwable) { fallback("الخريطة مش متاحة على الشاشة دى"); return }
        navView = nv
        val root = FrameLayout(this)
        root.addView(nv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        root.addView(overlay(), FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM or Gravity.START).apply { setMargins(dp(12), dp(12), dp(12), dp(84)) })
        Ui.fitSystemBars(root)
        setContentView(root)
        nv.onCreate(savedInstanceState)

        try {
            NavigationApi.getNavigator(this, object : NavigationApi.NavigatorListener {
                override fun onNavigatorReady(n: Navigator) { navigator = n; route(n, walk) }
                override fun onError(errorCode: Int) { fallback(reason(errorCode)) }
            })
        } catch (t: Throwable) { fallback("الملاحة جوه التطبيق مش متاحة") }
    }

    private fun route(n: Navigator, walk: Boolean) {
        if (walk) { fallback(null); return }   // المشى: تطبيق الخرائط أنسب (الـSDK للعربيات)
        n.setAudioGuidance(Navigator.AudioGuidance.VOICE_ALERTS_AND_GUIDANCE)
        val wp = Waypoint.builder().setLatLng(lat, lng).setTitle(label.ifEmpty { "الوجهة" }).build()
        Prefs(this).countNav(month())
        n.setDestination(wp).setOnResultListener { status ->
            if (status == Navigator.RouteStatus.OK) {
                navView?.setTripProgressBarEnabled(true)
                navView?.setSpeedometerEnabled(true)
                navView?.setSpeedLimitIconEnabled(true)
                n.startGuidance()
            } else fallback("مالقيتش طريق من هنا")
        }
        val a = Navigator.ArrivalListener {
            Oscar.init(this); Oscar.say("arrived")
            n.stopGuidance(); n.clearDestinations()
            finish()
        }
        arrival = a
        n.addArrivalListener(a)
    }

    /** شريط صغير فوق الخريطة: السرعة من Oscar Drive + رجوع. */
    private fun overlay(): LinearLayout {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(6), dp(6), dp(6))
            background = GradientDrawable().apply { setColor(Color.parseColor("#E60A101B")); cornerRadius = dp(18).toFloat() }
            layoutDirection = android.view.View.LAYOUT_DIRECTION_RTL
        }
        speedTv = TextView(this).apply { textSize = 20f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE) }
        box.addView(speedTv)
        box.addView(TextView(this).apply {
            text = "✕ إنهاء"; textSize = 16f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE); gravity = Gravity.CENTER
            setPadding(dp(14), dp(10), dp(14), dp(10))
            background = GradientDrawable().apply { setColor(Color.parseColor("#D2342A")); cornerRadius = dp(14).toFloat() }
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(12), 0, 0, 0) })
        return box
    }

    private fun reason(code: Int): String = when (code) {
        NavigationApi.ErrorCode.NOT_AUTHORIZED -> "مفتاح خرايط جوجل مش شغّال"
        NavigationApi.ErrorCode.TERMS_NOT_ACCEPTED -> "لازم توافق على شروط جوجل للملاحة"
        NavigationApi.ErrorCode.NETWORK_ERROR -> "مفيش إنترنت"
        NavigationApi.ErrorCode.LOCATION_PERMISSION_MISSING -> "محتاج إذن المكان"
        else -> "الملاحة جوه التطبيق مش متاحة"
    }

    /** نفس الرحلة فى تطبيق الخرائط — مرة واحدة بس. */
    private fun fallback(why: String?) {
        if (done) return
        done = true
        if (why != null) Toast.makeText(this, "$why — هفتح تطبيق الخرائط", Toast.LENGTH_LONG).show()
        openMapsApp(this, lat, lng, label, intent.getBooleanExtra(EXTRA_WALK, false))
        finish()
    }

    override fun onStart() { super.onStart(); navView?.onStart() }
    override fun onResume() { super.onResume(); navView?.onResume(); main.post(tick) }
    override fun onPause() { navView?.onPause(); main.removeCallbacks(tick); super.onPause() }
    override fun onStop() { navView?.onStop(); super.onStop() }
    override fun onDestroy() {
        navigator?.let { n ->
            arrival?.let { n.removeArrivalListener(it) }
            try { n.stopGuidance(); n.clearDestinations() } catch (_: Throwable) {}
        }
        navView?.onDestroy()
        super.onDestroy()
    }
    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); navView?.onSaveInstanceState(outState) }
    override fun onConfigurationChanged(newConfig: Configuration) { super.onConfigurationChanged(newConfig); navView?.onConfigurationChanged(newConfig) }
    override fun onTrimMemory(level: Int) { super.onTrimMemory(level); navView?.onTrimMemory(level) }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

    companion object {
        const val EXTRA_LAT = "lat"
        const val EXTRA_LNG = "lng"
        const val EXTRA_LABEL = "label"
        const val EXTRA_WALK = "walk"
        /** أول ١٠٠٠ وجهة فى الشهر مجانى (على حساب جوجل كله، مش على الجهاز ده بس) — بعد كده تطبيق الخرائط. */
        const val FREE_PER_MONTH = 1000

        fun month(): String = SimpleDateFormat("yyyy-MM", Locale.US).format(Date())

        /** الملاحة جوه التطبيق متاحة؟ مفتاح + خدمات جوجل على الشاشة + السواق مختارها + لسه فى المجانى. */
        fun available(ctx: Context): Boolean {
            if (!BuildConfig.NAV_SDK_KEY) return false
            val p = Prefs(ctx)
            if (p.navMode != 0 || p.navUsedThisMonth(month()) >= FREE_PER_MONTH) return false
            return try { ctx.packageManager.getPackageInfo("com.google.android.gms", 0); true } catch (_: Exception) { false }
        }

        fun openMapsApp(ctx: Context, lat: Double, lng: Double, label: String, walk: Boolean): Boolean {
            val tries = listOf(
                "google.navigation:q=$lat,$lng" + if (walk) "&mode=w" else "",
                "geo:$lat,$lng?q=$lat,$lng(" + Uri.encode(label) + ")",
            )
            for (u in tries) {
                try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true }
                catch (_: Exception) {}
            }
            return false
        }

        fun start(ctx: Context, lat: Double, lng: Double, label: String, walk: Boolean) {
            if (!walk && available(ctx)) {
                ctx.startActivity(Intent(ctx, NavActivity::class.java)
                    .putExtra(EXTRA_LAT, lat).putExtra(EXTRA_LNG, lng).putExtra(EXTRA_LABEL, label).putExtra(EXTRA_WALK, walk))
                return
            }
            if (!openMapsApp(ctx, lat, lng, label, walk)) Toast.makeText(ctx, "مفيش تطبيق خرائط على الشاشة", Toast.LENGTH_SHORT).show()
        }
    }
}
