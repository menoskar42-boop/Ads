package com.oscardevs.oscardrive

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions
import com.oscardevs.oscardrive.logic.HazardType

/**
 * الخريطة جوه Oscar Drive (المرحلة ٣ — المالك: «لما بدوس افتح الخريطة بيفتح تطبيق جوجل مابس برّه»): خريطة جوجل تفاعلية جوه التطبيق —
 * مكان العربية (نقطة أندرويد الزرقا) · زووم وسحب · علامات المطبات/الحفر/الرادارات المتسجّلة · بتتابع العربية واتجاهها لحد ما تسحب
 * الخريطة بإيدك («📍 تابعنى» يرجّعها). مكتبة الخرايط جوه Navigation SDK الموجودة أصلاً — مفيش مكتبة جديدة. خرايط الموبايل (Dynamic Maps
 * على Maps SDK for Android) مجانية فى أسعار جوجل — ومن غير مفتاح (NAV_SDK_KEY) بيفتح تطبيق الخرائط زى الأول.
 */
class MapActivity : Activity() {
    private var mapView: MapView? = null
    private var map: GoogleMap? = null
    private var follow = true
    private var info: TextView? = null
    private var followBtn: TextView? = null
    private val main = Handler(Looper.getMainLooper())
    private lateinit var ui: Ui

    private val tick = object : Runnable {
        override fun run() {
            val s = DriveService.State
            info?.text = (s.speedKmh?.let { "${it.toInt()} كم/س" } ?: "بيدوّر على GPS…") +
                (s.accuracyM?.let { " · دقة ${it.toInt()} م" } ?: "") + (if (s.gpsSources.isNotEmpty()) "\n${s.gpsSources}" else "")
            val m = map; val lat = s.lat; val lng = s.lng
            if (m != null && follow && lat != null && lng != null) {
                val cur = m.cameraPosition
                m.animateCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder().target(LatLng(lat, lng))
                    .zoom(if (cur.zoom < 12f) 16f else cur.zoom).bearing(s.headingDeg ?: cur.bearing).tilt(0f).build()), 800, null)
            }
            main.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!BuildConfig.NAV_SDK_KEY) { fallback(); return }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        ui = Ui(this, DriveService.State.night)
        val mv = try { MapView(this) } catch (t: Throwable) { fallback(); return }
        mapView = mv
        mv.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        root.addView(mv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val bar = ui.row(8).apply { setBackgroundColor(ui.surface) }
        bar.addView(ui.button("⬅️ رجوع", "neutral", 16f) { finish() }, ui.lp(0, ui.dp(56), 1f, 3))
        val fb = ui.button("📍 تابعنى", "primary", 16f) { follow = true; renderFollow() }
        followBtn = fb
        bar.addView(fb, ui.lp(0, ui.dp(56), 1f, 3))
        val tv = ui.text("", 15f, ui.ink).apply { setPadding(ui.dp(8), 0, ui.dp(8), 0) }
        info = tv
        bar.addView(tv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 2f))
        root.addView(bar, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        setContentView(root)
        mv.getMapAsync { m ->
            map = m
            m.uiSettings.isZoomControlsEnabled = true
            m.uiSettings.isCompassEnabled = true
            m.uiSettings.isMyLocationButtonEnabled = false
            m.setPadding(0, ui.dp(72), 0, 0)
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                try { m.isMyLocationEnabled = true } catch (_: SecurityException) {}
            }
            m.setOnCameraMoveStartedListener { reason -> if (reason == GoogleMap.OnCameraMoveStartedListener.REASON_GESTURE) { follow = false; renderFollow() } }
            showHazards(m)
            // «شوفه»: نقطة معيّنة (ركنة · تفويلة) ⇒ علامة عليها ومن غير متابعة
            if (intent.hasExtra("lat")) {
                val p = LatLng(intent.getDoubleExtra("lat", 0.0), intent.getDoubleExtra("lng", 0.0))
                m.addMarker(MarkerOptions().position(p).title(intent.getStringExtra("label") ?: "📍"))?.showInfoWindow()
                follow = false; renderFollow()
                m.moveCamera(CameraUpdateFactory.newLatLngZoom(p, 17f)); return@getMapAsync
            }
            val s = DriveService.State
            val start = if (s.lat != null && s.lng != null) LatLng(s.lat!!, s.lng!!) else Prefs(this).let { p -> LatLng(p.lastLat, p.lastLng) }
            m.moveCamera(CameraUpdateFactory.newLatLngZoom(start, if (start.latitude == 0.0) 5f else 16f))
        }
        renderFollow()
    }

    private fun renderFollow() { followBtn?.text = if (follow) "📍 بتتابعك" else "📍 تابعنى" }

    /** المطبات/الحفر/الرادارات المتسجّلة (أقرب ٣٠٠ — الشاشة ضعيفة). */
    private fun showHazards(m: GoogleMap) {
        val s = DriveService.State
        val all = try { Db.get(this).hazards() } catch (_: Exception) { emptyList() }
        val near = if (s.lat != null && s.lng != null) all.sortedBy { com.oscardevs.oscardrive.logic.Geo.distanceM(s.lat!!, s.lng!!, it.lat, it.lng) } else all
        for (h in near.take(300)) {
            val hue = when (h.type) {
                HazardType.BUMP -> BitmapDescriptorFactory.HUE_ORANGE
                HazardType.POTHOLE -> BitmapDescriptorFactory.HUE_RED
                HazardType.RADAR -> BitmapDescriptorFactory.HUE_AZURE
                HazardType.DANGER -> BitmapDescriptorFactory.HUE_YELLOW
            }
            m.addMarker(MarkerOptions().position(LatLng(h.lat, h.lng)).title("${h.type.emoji} ${h.type.ar}").icon(BitmapDescriptorFactory.defaultMarker(hue)))
        }
    }

    private fun fallback() {
        val s = DriveService.State
        val uri = if (s.lat != null && s.lng != null) "geo:${s.lat},${s.lng}?z=16" else "geo:0,0?z=3"
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri))) } catch (_: Exception) {}
        finish()
    }

    override fun onStart() { super.onStart(); mapView?.onStart() }
    override fun onResume() { super.onResume(); mapView?.onResume(); DriveService.State.screens++; main.post(tick) }
    override fun onPause() { main.removeCallbacks(tick); DriveService.State.screens--; mapView?.onPause(); super.onPause() }
    override fun onStop() { mapView?.onStop(); super.onStop() }
    override fun onDestroy() { mapView?.onDestroy(); super.onDestroy() }
    override fun onLowMemory() { super.onLowMemory(); mapView?.onLowMemory() }
    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); mapView?.onSaveInstanceState(outState) }
}
