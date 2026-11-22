package com.oscardevs.speedguard

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * الكلام مع سيرفر OscarDevs (src/routes/fleet.js). كل النداءات blocking — بتتنده من thread
 * فى الخلفية بس. أى خطأ نت بيرجع Result.failure ومابيوقعش التطبيق.
 */
object FleetApi {
    private val BASE = BuildConfig.SERVER + "/fleet/api"

    data class Joined(val token: String, val fleetName: String, val speedLimit: Int)
    data class Config(val fleetName: String, val driverName: String, val speedLimit: Int, val active: Boolean)

    fun join(code: String, name: String, deviceId: String): Result<Joined> = runCatching {
        val body = JSONObject().put("code", code).put("name", name).put("deviceId", deviceId)
        val j = call("POST", "/join", null, body)
        Joined(j.getString("token"), j.optString("fleetName"), j.optInt("speedLimit", 0))
    }

    fun config(token: String): Result<Config> = runCatching {
        val j = call("GET", "/config", token, null)
        Config(j.optString("fleetName"), j.optString("driverName"), j.optInt("speedLimit", 0), j.optBoolean("active", true))
    }

    /** بيرجع الحد الحالى من السيرفر (عشان يتحدّث مع كل رفعة). */
    fun sendViolations(token: String, items: JSONArray): Result<Int> = runCatching {
        val j = call("POST", "/violations", token, JSONObject().put("items", items))
        j.optInt("speedLimit", 0)
    }

    class ApiError(val status: Int, message: String) : Exception(message)

    private fun call(method: String, path: String, token: String?, body: JSONObject?): JSONObject {
        val c = URL(BASE + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            c.setRequestProperty("Accept", "application/json")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use(BufferedReader::readText) ?: ""
            val json = try { JSONObject(text) } catch (e: Exception) { JSONObject() }
            if (status !in 200..299) throw ApiError(status, json.optString("error", "خطأ من السيرفر ($status)"))
            return json
        } finally {
            c.disconnect()
        }
    }
}
