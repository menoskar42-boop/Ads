package com.oscardevs.oscardrive

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import java.io.ByteArrayOutputStream

/**
 * إطار الكاميرا (YUV_420_888) ⇒ JPEG، من غير مكتبات (YuvImage المدمجة فى أندرويد) — «📸 صوّر الطريق» (٢٠٢٦-١١-٢٠).
 * كل كاميرا Camera2 لازم تدعم YUV، عكس JPEG المتكرر اللى كاميرات شاشات العربيات كتير بتقع فيه.
 */
object YuvJpeg {
    /** متوسط الإضاءة (عينة من الـY) أقل من ١٠ من ٢٥٥ = كاميرا من غير إشارة (شاشة سودا). */
    fun isDark(img: Image): Boolean {
        val p = img.planes[0]; val buf = p.buffer.duplicate()
        val w = img.width; val h = img.height; val rs = p.rowStride; val ps = p.pixelStride
        var sum = 0L; var n = 0
        var y = 0
        while (y < h) {
            var x = 0
            while (x < w) { val i = y * rs + x * ps; if (i < buf.limit()) { sum += buf.get(i).toInt() and 0xFF; n++ }; x += 16 }
            y += 16
        }
        return n > 0 && sum / n < 10
    }

    /** YUV_420_888 ⇒ NV21 (مع مراعاة rowStride/pixelStride) ⇒ JPEG بالجودة `quality`. */
    fun encode(img: Image, quality: Int): ByteArray {
        require(img.format == ImageFormat.YUV_420_888)
        val w = img.width; val h = img.height
        val nv21 = ByteArray(w * h + 2 * ((w + 1) / 2) * ((h + 1) / 2))
        val yp = img.planes[0]; val yb = yp.buffer.duplicate(); val yrs = yp.rowStride; val yps = yp.pixelStride
        var o = 0
        for (row in 0 until h) for (col in 0 until w) nv21[o++] = yb.get(row * yrs + col * yps)
        val u = img.planes[1]; val v = img.planes[2]
        val ub = u.buffer.duplicate(); val vb = v.buffer.duplicate()
        for (row in 0 until (h + 1) / 2) for (col in 0 until (w + 1) / 2) {
            nv21[o++] = vb.get(minOf(row * v.rowStride + col * v.pixelStride, vb.limit() - 1))   // NV21 = V ثم U
            nv21[o++] = ub.get(minOf(row * u.rowStride + col * u.pixelStride, ub.limit() - 1))
        }
        val out = ByteArrayOutputStream()
        YuvImage(nv21, ImageFormat.NV21, w, h, null).compressToJpeg(Rect(0, 0, w, h), quality, out)
        return out.toByteArray()
    }
}
