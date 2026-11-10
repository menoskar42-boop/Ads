package com.oscardevs.oscardrive

import android.content.Context
import com.oscardevs.oscardrive.logic.CarCare
import com.oscardevs.oscardrive.logic.FuelBook
import com.oscardevs.oscardrive.logic.MaintStatus
import com.oscardevs.oscardrive.logic.Reports
import com.oscardevs.oscardrive.logic.TripRec
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * ملخّص العربية لصفحة الموبايل (drive.oscardevs.com — المرحلة ٤): آخر ١٠ ركنات · العدّاد · حالة الصيانة ·
 * البنزين (الاستهلاك · الفاضل · آخر ١٠ تفويلات) · آخر ٦ شهور. بيتبعت مع مزامنة الحماية بس (لو مفعّلة ومربوطة)،
 * ولما يتغيّر بس — صف واحد على السيرفر بيتكتب فوقه، والتاريخ الكامل بيفضل على الشاشة.
 */
object CarReport {
    fun json(ctx: Context): JSONObject {
        val db = Db.get(ctx); val prefs = Prefs(ctx); val now = System.currentTimeMillis()
        val odo = prefs.odoKm
        val o = JSONObject().put("odo", odo).put("odoCalAt", prefs.odo.calibratedAtMs)
        o.put("parking", JSONArray().apply {
            for (p in db.parkings().take(10)) put(JSONObject().put("lat", p.lat).put("lng", p.lng).put("t", p.timeMs).apply {
                p.accuracyM?.let { put("acc", it.toDouble()) }; p.odoKm?.let { put("odo", it) }; if (p.note.isNotBlank()) put("note", p.note)
            })
        })
        o.put("maint", JSONArray().apply {
            for (m in db.maint()) {
                val st = CarCare.status(m, odo.toInt(), now)
                put(JSONObject().put("name", m.name).put("text", CarCare.describe(st))
                    .put("status", when (st.status) { MaintStatus.DUE -> "due"; MaintStatus.SOON -> "soon"; else -> "ok" }))
            }
        })
        val fills = db.fillRecs()
        val real = FuelBook.consumption(fills)
        val rem = FuelBook.remaining(fills, odo, prefs.tankL, prefs.provisionalRate)
        o.put("fuel", JSONObject().put("rate", real ?: prefs.provisionalRate).put("real", real != null).apply {
            rem?.let { put("left", it.liters) }; FuelBook.costPerKm(fills)?.let { put("cpk", it) }
            put("fills", JSONArray().apply {
                for (f in fills.take(10)) put(JSONObject().put("t", f.timeMs).put("liters", f.liters).put("paid", f.paid).put("full", f.full).put("odo", f.odoKm)
                    .apply { f.grade?.let { put("grade", it.key) } })
            })
        })
        val ym = SimpleDateFormat("yyyy-MM", Locale.US)
        o.put("months", JSONArray().apply {
            for (m in Reports.monthly(db.trips(0, 2000).map { TripRec(it.startMs, it.distanceM / 1000, it.movingS) }, fills,
                db.maintLog().map { it.doneMs }) { ym.format(Date(it)) }.take(6)) {
                put(JSONObject().put("ym", m.ym).put("trips", m.trips).put("km", m.km).put("min", m.drivingMin)
                    .put("paid", m.fuelPaid).put("liters", m.liters).put("fills", m.fills).put("maint", m.maintDone))
            }
        })
        return o
    }
}
