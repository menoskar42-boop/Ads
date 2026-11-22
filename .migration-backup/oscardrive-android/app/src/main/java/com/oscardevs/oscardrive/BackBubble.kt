package com.oscardevs.oscardrive

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import kotlin.math.abs

/**
 * زرار «⬅️ Oscar» العائم فوق تطبيق الخرايط الخارجى (قرار المالك ٢٠٢٦-١١-٢٠): لما الخريطة أو الملاحة بتفتح فى جوجل مابس (الإعدادات:
 * «تطبيق الخرائط»، أو الرجوع ليه لو الملاحة جوّه التطبيق مش متاحة) بيظهر زرار صغير بيرجّعك لـOscar Drive بضغطة، وبيختفى أول ما ترجع.
 * محتاج صلاحية «الظهور فوق التطبيقات» — من غيرها مفيش زرار والباقى زى ما هو. بيتسحب لأى مكان عشان مايغطّيش أزرار الملاحة.
 * الخريطة جوّه التطبيق مش محتاجاه (فيها «⬅️ رجوع» والمطبات).
 */
object BackBubble {
    private val main = Handler(Looper.getMainLooper())
    private var view: View? = null
    /** آخر مكان سحبته له (بيتفتكر طول ما التطبيق شغّال). */
    private var px = -1
    private var py = -1

    fun permitted(ctx: Context): Boolean = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)

    /** صفحة الصلاحية بتاعة Oscar Drive فى إعدادات أندرويد. */
    fun permissionIntent(ctx: Context): Intent =
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** بعد ما تطبيق خرايط خارجى اتفتح. */
    fun show(ctx: Context) {
        val app = ctx.applicationContext
        if (!Prefs(app).backBubble || !permitted(app)) return
        main.post { try { add(app) } catch (t: Throwable) { CrashLog.nonFatal(app, "BackBubble.show", t) } }
    }

    fun hide(ctx: Context) {
        val app = ctx.applicationContext
        main.post {
            val v = view ?: return@post
            view = null
            try { (app.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v) } catch (_: Exception) {}
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun add(app: Context) {
        if (view != null) return
        val wm = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val dm = app.resources.displayMetrics
        val d = dm.density
        val size = (64 * d).toInt()
        val b = TextView(app).apply {
            text = "⬅️\nOscar"; gravity = Gravity.CENTER; setTextColor(Color.WHITE); textSize = 13f
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xE61565C0.toInt()); setStroke((2 * d).toInt(), Color.WHITE) }
            contentDescription = "رجوع لـOscar Drive"
        }
        @Suppress("DEPRECATION")
        val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(size, size, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.START
            x = if (px >= 0) px else (8 * d).toInt()
            y = if (py >= 0) py else dm.heightPixels / 2 - size / 2
        }
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        b.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; moved = false }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (moved || abs(dx) > 12 * d || abs(dy) > 12 * d) {
                        moved = true
                        lp.x = (startX + dx).toInt().coerceIn(0, dm.widthPixels - size)
                        lp.y = (startY + dy).toInt().coerceIn(0, dm.heightPixels - size)
                        try { wm.updateViewLayout(b, lp) } catch (_: Exception) {}
                    }
                }
                MotionEvent.ACTION_UP -> {
                    if (moved) { px = lp.x; py = lp.y }
                    else {
                        hide(app)
                        try {
                            app.startActivity(Intent(app, MainActivity::class.java)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
                        } catch (t: Throwable) { CrashLog.nonFatal(app, "BackBubble.open", t) }
                    }
                }
            }
            true
        }
        wm.addView(b, lp)
        view = b
    }
}
