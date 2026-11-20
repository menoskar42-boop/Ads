package com.oscardevs.oscardrive.logic

/**
 * إحداثيات مكتوبة بإيدك (البرومبت ٨ — ٢٠٢٦-١١-٢٠): «27.1809» و«31.1837»، أو «27.1809, 31.1837» فى الخانة الأولى، وبالأرقام العربى كمان.
 * null = مش صحيحة (Latitude من -٩٠ لـ٩٠ · Longitude من -١٨٠ لـ١٨٠ · مش ٠،٠).
 */
object Coords {
    private fun norm(s: String): String = s.map { c ->
        val i = "٠١٢٣٤٥٦٧٨٩".indexOf(c)
        when { i >= 0 -> '0' + i; c == '٫' -> '.'; c == '،' -> ','; else -> c }
    }.joinToString("").trim()

    fun parse(first: String, second: String): Pair<Double, Double>? {
        var a = norm(first); var b = norm(second)
        if (b.isEmpty() && (a.contains(',') || a.contains(' '))) {
            val parts = a.split(',', ' ').map { it.trim() }.filter { it.isNotEmpty() }
            if (parts.size != 2) return null
            a = parts[0]; b = parts[1]
        }
        val lat = a.toDoubleOrNull() ?: return null
        val lng = b.toDoubleOrNull() ?: return null
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0 || (lat == 0.0 && lng == 0.0)) return null
        return lat to lng
    }
}
