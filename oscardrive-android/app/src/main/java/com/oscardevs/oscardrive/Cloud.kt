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

    private fun call(path: String, token: String?, body: JSONObject?): JSONObject {
        val c = URL(BASE + path).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000; c.readTimeout = 20_000
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
}
