package com.oscardevs.oscardrive

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Size
import java.io.File

/**
 * تسجيل كاميرا (Camera2 + MediaRecorder، من غير مكتبات ومن غير صوت) — المالك افترض إن كاميرا الرجوع
 * ظاهرة لأندرويد (٢٠٢٦-١١-٠٥)، و«🩺 فحص الشاشة» بيأكّد. لو الكاميرا مشغولة (الشاشة فاتحاها مع المارشدير)
 * أو مش ظاهرة: onDone بيرجع خطأ ومحدش بيقع.
 * المقاطع فى ملفات التطبيق نفسه (مش المعرض) — بتتمسح مع التطبيق، وبنحتفظ بآخر ٦٠٠ ميجا.
 */
class CamRecorder(private val ctx: Context) {
    @Volatile var busy = false; private set

    fun permitted() = ctx.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    /** كاميرا خارجية (USB) الأول، وبعدين الخلفية، وبعدين أى كاميرا. */
    fun pickCamera(): String? = try {
        val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val ids = cm.cameraIdList.toList()
        fun facing(id: String) = cm.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING)
        ids.firstOrNull { facing(it) == CameraCharacteristics.LENS_FACING_EXTERNAL }
            ?: ids.firstOrNull { facing(it) == CameraCharacteristics.LENS_FACING_BACK }
            ?: ids.firstOrNull()
    } catch (_: Exception) { null }

    fun dir(): File = (ctx.getExternalFilesDir("clips") ?: File(ctx.filesDir, "clips")).also { it.mkdirs() }

    @SuppressLint("MissingPermission")
    fun record(seconds: Int, onDone: (File?, String?) -> Unit) {
        if (busy) { onDone(null, "بيسجّل فعلاً"); return }
        if (!permitted()) { onDone(null, "إذن الكاميرا مش متاح"); return }
        val id = pickCamera() ?: run { onDone(null, "مفيش كاميرا ظاهرة لأندرويد"); return }
        busy = true
        val thread = HandlerThread("od-cam").apply { start() }
        val h = Handler(thread.looper)
        val file = File(dir(), "clip-${System.currentTimeMillis()}.mp4")
        var device: CameraDevice? = null
        var session: CameraCaptureSession? = null
        var rec: MediaRecorder? = null
        var finished = false
        fun finish(err: String?) {
            if (finished) return
            finished = true
            try { session?.stopRepeating() } catch (_: Exception) {}
            var ok = err == null
            if (ok) try { rec?.stop() } catch (_: Exception) { ok = false }
            try { rec?.release() } catch (_: Exception) {}
            try { session?.close() } catch (_: Exception) {}
            try { device?.close() } catch (_: Exception) {}
            thread.quitSafely()
            busy = false
            if (ok && file.length() > 0) { trim(); onDone(file, null) } else { file.delete(); onDone(null, err ?: "التسجيل ماكملش") }
        }
        try {
            val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val map = cm.getCameraCharacteristics(id).get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            val sizes = map?.getOutputSizes(MediaRecorder::class.java)?.toList().orEmpty()
            val size = sizes.filter { it.width <= 1280 && it.height <= 720 }.maxByOrNull { it.width * it.height }
                ?: sizes.minByOrNull { it.width * it.height } ?: Size(640, 480)
            val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
            r.setVideoSource(MediaRecorder.VideoSource.SURFACE)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
            r.setVideoSize(size.width, size.height)
            r.setVideoFrameRate(15)
            r.setVideoEncodingBitRate(1_200_000)
            r.setOutputFile(file.absolutePath)
            r.prepare()
            rec = r
            cm.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(cd: CameraDevice) {
                    device = cd
                    try {
                        @Suppress("DEPRECATION")
                        cd.createCaptureSession(listOf(r.surface), object : CameraCaptureSession.StateCallback() {
                            override fun onConfigured(s: CameraCaptureSession) {
                                session = s
                                try {
                                    val req = cd.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply { addTarget(r.surface) }
                                    s.setRepeatingRequest(req.build(), null, h)
                                    r.start()
                                    h.postDelayed({ finish(null) }, seconds * 1000L)
                                } catch (e: Exception) { finish("الكاميرا ماشتغلتش: ${e.message}") }
                            }
                            override fun onConfigureFailed(s: CameraCaptureSession) { finish("الكاميرا رفضت الإعداد") }
                        }, h)
                    } catch (e: Exception) { finish("الكاميرا ماشتغلتش: ${e.message}") }
                }
                override fun onDisconnected(cd: CameraDevice) { device = cd; finish("الكاميرا اتفصلت (ممكن الشاشة فاتحاها مع المارشدير)") }
                override fun onError(cd: CameraDevice, error: Int) { device = cd; finish("الكاميرا مشغولة أو مش متاحة ($error)") }
            }, h)
        } catch (e: Exception) { finish("الكاميرا مش متاحة: ${e.message}") }
    }

    /** بنحتفظ بآخر ٦٠٠ ميجا من التسجيلات. */
    private fun trim() {
        val files = dir().listFiles()?.sortedByDescending { it.lastModified() } ?: return
        var total = 0L
        for (f in files) { total += f.length(); if (total > 600L * 1024 * 1024) f.delete() }
    }
}
