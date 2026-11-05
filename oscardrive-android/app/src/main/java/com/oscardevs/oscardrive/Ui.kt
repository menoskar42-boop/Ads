package com.oscardevs.oscardrive

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/**
 * ألوان وقطع الواجهة (من غير XML). ليلى = كحلى غامق زى التصميمات اللى المالك بعتها،
 * ونهارى = رمادى فاتح بنفس الترتيب — والواجهة بتقلب لوحدها مع الشروق والغروب.
 */
class Ui(private val ctx: Context, val night: Boolean) {
    val bg = Color.parseColor(if (night) "#0A101B" else "#E8EDF4")
    val surface = Color.parseColor(if (night) "#141D2C" else "#FFFFFF")
    val surface2 = Color.parseColor(if (night) "#1C2739" else "#EEF2F8")
    val line = Color.parseColor(if (night) "#283550" else "#D3DCE8")
    val ink = Color.parseColor(if (night) "#EEF3FA" else "#0E1726")
    val muted = Color.parseColor(if (night) "#8C9AB0" else "#55657C")
    val accent = Color.parseColor(if (night) "#4EA3F0" else "#1668C2")
    val good = Color.parseColor(if (night) "#34D399" else "#0B8F5F")
    val warn = Color.parseColor(if (night) "#FFB020" else "#B86E00")
    val bad = Color.parseColor(if (night) "#FF5A4E" else "#D2342A")

    fun dp(v: Int): Int = (v * ctx.resources.displayMetrics.density + 0.5f).toInt()

    fun round(color: Int, radiusDp: Int = 18, stroke: Int? = null): GradientDrawable = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radiusDp).toFloat()
        if (stroke != null) setStroke(dp(2), stroke)
    }

    fun text(s: CharSequence, sizeSp: Float = 16f, color: Int = ink, bold: Boolean = false, gravity: Int = Gravity.START): TextView =
        TextView(ctx).apply {
            text = s; textSize = sizeSp; setTextColor(color); this.gravity = gravity
            if (bold) typeface = Typeface.DEFAULT_BOLD
        }

    fun col(padDp: Int = 0): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(padDp), dp(padDp), dp(padDp), dp(padDp))
    }

    fun row(padDp: Int = 0): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(padDp), dp(padDp), dp(padDp), dp(padDp))
    }

    fun card(padDp: Int = 14): LinearLayout = col(padDp).apply { background = round(surface) }

    /** زرار كبير سهل الضغط وانت سايق (أقل حاجة ٥٦dp). kind: primary · neutral · danger · good */
    fun button(label: CharSequence, kind: String = "neutral", sizeSp: Float = 17f, onClick: () -> Unit): TextView =
        TextView(ctx).apply {
            text = label; textSize = sizeSp; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
            minHeight = dp(56); setPadding(dp(12), dp(8), dp(12), dp(8))
            val (bgc, fg) = when (kind) {
                "primary" -> accent to Color.WHITE
                "danger" -> bad to Color.WHITE
                "good" -> good to (if (night) Color.parseColor("#062016") else Color.WHITE)
                else -> surface2 to ink
            }
            background = round(bgc, 16); setTextColor(fg)
            isClickable = true; isFocusable = true
            setOnClickListener { onClick() }
        }

    fun chip(label: CharSequence, color: Int): TextView = TextView(ctx).apply {
        text = label; textSize = 14f; typeface = Typeface.DEFAULT_BOLD; setTextColor(color)
        setPadding(dp(12), dp(5), dp(12), dp(5))
        background = GradientDrawable().apply {
            setColor(Color.argb(40, Color.red(color), Color.green(color), Color.blue(color)))
            cornerRadius = dp(20).toFloat()
        }
    }

    fun space(wDp: Int, hDp: Int): View = View(ctx).apply { layoutParams = LinearLayout.LayoutParams(dp(wDp), dp(hDp)) }

    fun lp(w: Int, h: Int, weight: Float = 0f, marginDp: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(w, h, weight).apply { setMargins(dp(marginDp), dp(marginDp), dp(marginDp), dp(marginDp)) }

    companion object {
        /**
         * من أندرويد ١٥ (targetSdk ٣٥+، شرط جوجل بلاى) التطبيق بيترسم تحت شريط الحالة والأزرار —
         * فبنزق المحتوى بمقدارهم عشان مفيش زرار يستخبى تحتهم.
         */
        fun fitSystemBars(v: View) {
            if (android.os.Build.VERSION.SDK_INT < 35) return
            v.setOnApplyWindowInsetsListener { view, insets ->
                val b = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
                view.setPadding(b.left, b.top, b.right, b.bottom)
                insets
            }
        }

        const val MATCH = LinearLayout.LayoutParams.MATCH_PARENT
        const val WRAP = LinearLayout.LayoutParams.WRAP_CONTENT
    }
}
