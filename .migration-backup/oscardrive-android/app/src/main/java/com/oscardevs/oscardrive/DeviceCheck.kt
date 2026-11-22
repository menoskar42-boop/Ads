package com.oscardevs.oscardrive

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.speech.SpeechRecognizer
import android.telephony.TelephonyManager
import java.util.Locale

/**
 * «فحص الشاشة» — المرحلة الأولى قبل «مانع السرقة» (المالك ٢٠٢٦-١١-٠٥): بيقول الشاشة دى فيها إيه فعلاً
 * من غير ما نخمّن. أهم سؤالين: هل الشاشة تقدر توصل للنت لوحدها (شريحة)؟ وهل كاميرا الرجوع ظاهرة
 * لأندرويد (يعنى تطبيق يقدر يسجّل منها)؟ والسواق يصوّر الصفحة أو يدوس «شارك التقرير».
 * مابيطلبش أى إذن جديد — كل ده بيتقرا من غير صلاحيات.
 */
object DeviceCheck {
    data class Row(val label: String, val value: String, val verdict: Boolean = false)

    fun report(ctx: Context): List<Row> {
        val out = mutableListOf<Row>()
        fun add(l: String, v: String) { out += Row(l, v) }
        val pm = ctx.packageManager

        add("الجهاز", "${Build.MANUFACTURER} ${Build.MODEL} (${Build.DEVICE} · ${Build.BOARD})")
        add("أندرويد", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        add("المعالج", "${Build.HARDWARE} · ${Build.SUPPORTED_ABIS.joinToString()}")
        try {
            val mi = ActivityManager.MemoryInfo()
            (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(mi)
            add("الذاكرة", "%.1f جيجا (فاضى %.1f)".format(Locale.US, mi.totalMem / 1e9, mi.availMem / 1e9))
        } catch (_: Exception) {}
        val dm = ctx.resources.displayMetrics
        add("الشاشة", "${dm.widthPixels}×${dm.heightPixels} · ${dm.densityDpi}dpi")

        // GPS
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val hasGps = lm.allProviders.contains(LocationManager.GPS_PROVIDER)
        val s = DriveService.State
        add("GPS", if (!hasGps) "مش موجود" else
            (if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) "شغّال" else "مقفول من الإعدادات") +
            (if (s.running) " · ${s.satsUsed} أقمار" + (s.accuracyM?.let { " · دقة ${it.toInt()} م" } ?: " · لسه مالقطش") else " · اضغط «ابدأ» عشان نشوف الأقمار"))

        // الكاميرات اللى أندرويد شايفها
        val cams = mutableListOf<String>()
        var appCamera = false
        try {
            val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            for (id in cm.cameraIdList) {
                val ch = cm.getCameraCharacteristics(id)
                val facing = when (ch.get(CameraCharacteristics.LENS_FACING)) {
                    CameraCharacteristics.LENS_FACING_BACK -> "خلفية"
                    CameraCharacteristics.LENS_FACING_FRONT -> "أمامية"
                    CameraCharacteristics.LENS_FACING_EXTERNAL -> "خارجية (USB)"
                    else -> "؟"
                }
                cams += "#$id $facing"
                appCamera = true
            }
        } catch (_: Exception) {}
        add("كاميرات أندرويد", if (cams.isEmpty()) "مفيش" else cams.joinToString(" · "))

        // أجهزة USB (محوّل فيديو UVC = كلاس 14)
        val usb = mutableListOf<String>()
        var uvc = false
        try {
            val um = ctx.getSystemService(Context.USB_SERVICE) as UsbManager
            for (d in um.deviceList.values) {
                var video = d.deviceClass == UsbConstants.USB_CLASS_VIDEO
                for (i in 0 until d.interfaceCount) if (d.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_VIDEO) video = true
                if (video) uvc = true
                usb += "%04x:%04x".format(d.vendorId, d.productId) + (d.productName?.let { " $it" } ?: "") + if (video) " (فيديو)" else ""
            }
        } catch (_: Exception) {}
        add("أجهزة USB", if (usb.isEmpty()) "مفيش" else usb.joinToString(" · "))

        // الإنترنت والشريحة
        val hasPhone = pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
        var sim = "مفيش مكان شريحة"
        var simReady = false
        if (hasPhone) try {
            val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            sim = when (tm.simState) {
                TelephonyManager.SIM_STATE_READY -> { simReady = true; "فيه شريحة شغّالة" }
                TelephonyManager.SIM_STATE_ABSENT -> "فيه مكان شريحة — فاضى"
                else -> "فيه مكان شريحة (الحالة ${tm.simState})"
            }
        } catch (_: Exception) { sim = "فيه مكان شريحة (مش واضح)" }
        add("الشريحة", sim)
        var net = "مفيش نت دلوقتى"
        try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.getNetworkCapabilities(cm.activeNetwork)?.let { c ->
                net = when {
                    c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "نت من الشريحة"
                    c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "واى فاى (هوت سبوت؟)"
                    else -> "متصل"
                }
            }
        } catch (_: Exception) {}
        add("الإنترنت", net)

        // خدمات جوجل والكلام
        fun ver(p: String): String? = try { pm.getPackageInfo(p, 0).versionName ?: "موجود" } catch (_: Exception) { null }
        add("خدمات جوجل", ver("com.google.android.gms")?.let { "موجودة ($it)" } ?: "مش موجودة")
        add("تطبيق خرايط جوجل", ver("com.google.android.apps.maps")?.let { "موجود" } ?: "مش موجود")
        // برامج التعرّف اللى على الشاشة بالاسم — CitiSound بيقول «موجود» وجوجل بيطلّع «ميزة البحث الصوتى غير متاحة»
        val recog = try {
            pm.queryIntentServices(android.content.Intent("android.speech.RecognitionService"), 0).map { it.serviceInfo.packageName }
        } catch (_: Exception) { emptyList() }
        add("التعرّف على الكلام", (if (SpeechRecognizer.isRecognitionAvailable(ctx)) "بيقول موجود" else "مش موجود") +
            (if (recog.isNotEmpty()) " · ${recog.joinToString()}" else "") +
            (if (ver("com.google.android.tts") != null) " · Speech Services موجودة" else " · Speech Services مش موجودة"))
        add("أوسكار يسمع من غير نت", listOf("ar" to "عربى", "en" to "English").joinToString(" · ") { (l, t) ->
            "$t ${if (OfflineEars.installed(ctx, l)) "متنزّل" else "مش متنزّل"}" } + " · رامات فاضية ${OfflineEars.freeRamMb(ctx)} ميجا")
        add("الصوت العربى", if (Speaker.available) "شغّال" else "مش جاهز")
        // «اتصل بأحمد» (لسه مش متعمول): فيه تطبيق اتصال بيستقبل رقم؟ وتطبيق جهات اتصال؟ — من غير إذن قراية الجهات
        val dialers = try {
            pm.queryIntentActivities(android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:123")), 0).map { it.activityInfo.packageName }.distinct()
        } catch (_: Exception) { emptyList() }
        add("تطبيق الاتصال", if (dialers.isEmpty()) "مفيش (المكالمات من برنامج البلوتوث بتاع الشاشة)" else dialers.joinToString())
        val contactsApps = try {
            pm.queryIntentActivities(android.content.Intent(android.content.Intent.ACTION_VIEW, android.provider.ContactsContract.Contacts.CONTENT_URI), 0).map { it.activityInfo.packageName }.distinct()
        } catch (_: Exception) { emptyList() }
        add("جهات الاتصال", if (contactsApps.isEmpty()) "مفيش تطبيق جهات" else contactsApps.joinToString())

        // الحكم — لمانع السرقة
        out += Row("🛡️ تتبّع العربية وانت مش فيها",
            when {
                simReady -> "ممكن — الشاشة ليها نت لوحدها"
                hasPhone -> "ممكن لو حطّيت شريحة بيانات فى الشاشة"
                else -> "مش ممكن من الشاشة دى لوحدها: النت جاى من الموبايل، فلو العربية اتسرقت وانت مش فيها الشاشة مالهاش نت"
            }, verdict = true)
        out += Row("📹 تسجيل كاميرا الرجوع",
            when {
                uvc -> "فيه جهاز فيديو USB — ممكن نجرّب التسجيل"
                appCamera -> "أندرويد شايف كاميرا — ممكن نجرّب (لازم نتأكد إنها كاميرا الرجوع)"
                else -> "الكاميرا مش ظاهرة لأندرويد (متوصلة بمدخل الشاشة) — التسجيل محتاج محوّل فيديو USB (UVC)"
            }, verdict = true)
        return out
    }

    fun asText(rows: List<Row>): String =
        "Oscar Drive — فحص الشاشة\n" + rows.joinToString("\n") { "${it.label}: ${it.value}" }
}
