package com.oscardevs.oscardrive

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * الكلام مع drive.oscardevs.com (src/routes/drive_site.js). HttpURLConnection بس — من غير مكتبات.
 * كل نداء ممكن يفشل (مفيش نت / هوت سبوت بعيد) — اللى بينده بيسيب البيانات فى الطابور ويحاول بعدين.
 */
object Cloud {
    const val BASE = "https://drive.oscardevs.com"

    class HttpError(val code: Int) : Exception("HTTP $code")

    private fun call(path: String, token: String?, body: JSONObject?, readTimeoutMs: Int = 20_000): JSONObject {
        val c = URL(BASE + path).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000; c.readTimeout = readTimeoutMs
            c.requestMethod = "POST"
            c.setRequestProperty("Content-Type", "application/json")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            c.doOutput = true
            c.outputStream.use { it.write((body ?: JSONObject()).toString().toByteArray()) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) throw HttpError(code)
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally { c.disconnect() }
    }

    fun register(app: String): String = call("/api/car/register", null, JSONObject().put("app", app)).getString("token")
    fun sync(token: String, body: JSONObject): JSONObject = call("/api/car/sync", token, body)
    fun pairCode(token: String): String = call("/api/car/pair", token, null).getString("code")
    /** صورة طريق لتدريب موديل المطبات (JPEG base64 + بيانات المكان). */
    fun shot(token: String, body: JSONObject): JSONObject = call("/api/car/shot", token, body)
    /** «أوسكار مش فاهم» ⇒ الذكاء الاصطناعى على السيرفر (النص بس) — { cmd, arg }. */
    fun intent(token: String, text: String): JSONObject = call("/api/car/intent", token, JSONObject().put("text", text.take(200)))
    /** ذاكرة الطريق (رفع بالـuuid، و`pull` بيرجّع ذاكرة العربية كلها). */
    fun hazards(token: String, body: JSONObject): JSONObject = call("/api/car/hazards", token, body)
    /** جهات الاتصال التي وافق المالك على مزامنتها بين صفحة الموبايل والشاشة المرتبطة. */
    fun contacts(token: String, body: JSONObject): JSONObject = call("/api/car/contacts", token, body, readTimeoutMs = 60_000)
    /** الشاشة دى تاخد نفس العربية بكود من صفحة الموبايل (بعد مسح التطبيق). */
    fun relink(token: String, code: String): JSONObject = call("/api/car/relink", token, JSONObject().put("code", code))
    /** الربط بـQR: رقم ٨ أرقام + الرابط اللى بيتعرض QR، وسؤال «اتربطت؟». */
    fun claim(token: String): JSONObject = call("/api/car/claim", token, null)
    /** الموبايلات اللى بتشارك GPS دلوقتى (المرحلة ٢). */
    fun companions(token: String): JSONObject = call("/api/car/companions", token, null)
    /** «📲 ابعت للشاشة»: تأكيد اللى اتستلم (ack) + اللى لسه. */
    fun inbox(token: String, body: JSONObject): JSONObject = call("/api/car/inbox", token, body)
    /** «🩺 فحص الشاشة» لصفحة الموبايل (وضع المقارنة). */
    fun diag(token: String, body: JSONObject): JSONObject = call("/api/car/diag", token, body)
    fun claimStatus(token: String): JSONObject = call("/api/car/claim-status", token, null)
}
