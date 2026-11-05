package com.oscardevs.oscardrive

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.oscardevs.oscardrive.logic.CarCare
import com.oscardevs.oscardrive.logic.Fill
import com.oscardevs.oscardrive.logic.Hazard
import com.oscardevs.oscardrive.logic.HazardType
import com.oscardevs.oscardrive.logic.MaintItem
import com.oscardevs.oscardrive.logic.TripLogic

/**
 * قاعدة بيانات محلية (SQLite على الجهاز) — مفيش سحابة ولا حساب: الرحلات، ذاكرة الطريق، الأماكن،
 * الركنات، الصيانة، التفويلات، وسجل تجاوز السرعة.
 */
class Db private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "oscardrive.db", null, 2) {

    data class Trip(val id: Long, val startMs: Long, val endMs: Long, val distanceM: Double, val movingS: Long, val maxKmh: Float) {
        val avgKmh: Float get() = if (movingS > 0) (distanceM / movingS * 3.6).toFloat() else 0f
    }
    data class Place(val id: Long, val name: String, val lat: Double, val lng: Double)
    data class Parking(val id: Long, val lat: Double, val lng: Double, val timeMs: Long)
    data class Speeding(val id: Long, val startMs: Long, val maxKmh: Float, val limitKmh: Int, val durationS: Int, val lat: Double, val lng: Double)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE trips(id INTEGER PRIMARY KEY AUTOINCREMENT, start_ms INTEGER, end_ms INTEGER, distance_m REAL, moving_s INTEGER, max_kmh REAL, start_lat REAL, start_lng REAL, end_lat REAL, end_lng REAL)")
        db.execSQL("CREATE TABLE hazards(id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, lat REAL, lng REAL, bearing REAL, note TEXT, created_ms INTEGER)")
        db.execSQL("CREATE TABLE places(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, lat REAL, lng REAL)")
        db.execSQL("CREATE TABLE parking(id INTEGER PRIMARY KEY AUTOINCREMENT, lat REAL, lng REAL, time_ms INTEGER)")
        db.execSQL("CREATE TABLE maint(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, every_km INTEGER, every_days INTEGER, last_km INTEGER, last_ms INTEGER)")
        db.execSQL("CREATE TABLE fills(id INTEGER PRIMARY KEY AUTOINCREMENT, odo_km INTEGER, liters REAL, price REAL, full INTEGER, time_ms INTEGER)")
        db.execSQL("CREATE TABLE speeding(id INTEGER PRIMARY KEY AUTOINCREMENT, start_ms INTEGER, end_ms INTEGER, max_kmh REAL, limit_kmh INTEGER, duration_s INTEGER, lat REAL, lng REAL)")
        createSecurity(db)
        val now = System.currentTimeMillis()
        for ((name, km, days) in CarCare.DEFAULTS) {
            db.insert("maint", null, ContentValues().apply {
                put("name", name); put("every_km", km); put("every_days", days); put("last_km", 0); put("last_ms", now)
            })
        }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createSecurity(db)   // نسخة ١ مافيهاش الحماية — البيانات القديمة بتفضل زى ما هى
    }

    /** Oscar Security: طوابير بتستنى النت — أماكن · أحداث · تسجيلات الكاميرا. */
    private fun createSecurity(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS trk(id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, lat REAL, lng REAL, s REAL, h REAL, a REAL)")
        db.execSQL("CREATE TABLE IF NOT EXISTS sec_ev(id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE, t INTEGER, kind TEXT, lat REAL, lng REAL, detail TEXT, sent INTEGER DEFAULT 0)")
        db.execSQL("CREATE TABLE IF NOT EXISTS clips(id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE, t INTEGER, path TEXT, sec INTEGER, bytes INTEGER, reason TEXT, synced INTEGER DEFAULT 0)")
    }

    private inline fun <T> query(sql: String, args: Array<String> = emptyArray(), row: (Cursor) -> T): List<T> {
        val out = mutableListOf<T>()
        readableDatabase.rawQuery(sql, args).use { c -> while (c.moveToNext()) out += row(c) }
        return out
    }

    /* ── الرحلات ── */
    fun addTrip(s: TripLogic.Summary) {
        writableDatabase.insert("trips", null, ContentValues().apply {
            put("start_ms", s.startMs); put("end_ms", s.endMs); put("distance_m", s.distanceM); put("moving_s", s.movingS)
            put("max_kmh", s.maxKmh.toDouble()); put("start_lat", s.startLat); put("start_lng", s.startLng)
            put("end_lat", s.endLat); put("end_lng", s.endLng)
        })
    }
    fun trips(sinceMs: Long = 0, limit: Int = 500): List<Trip> =
        query("SELECT id,start_ms,end_ms,distance_m,moving_s,max_kmh FROM trips WHERE start_ms >= ? ORDER BY start_ms DESC LIMIT $limit",
            arrayOf(sinceMs.toString())) { Trip(it.getLong(0), it.getLong(1), it.getLong(2), it.getDouble(3), it.getLong(4), it.getFloat(5)) }

    /* ── ذاكرة الطريق ── */
    fun addHazard(type: HazardType, lat: Double, lng: Double, bearing: Float?): Long =
        writableDatabase.insert("hazards", null, ContentValues().apply {
            put("type", type.key); put("lat", lat); put("lng", lng)
            if (bearing != null) put("bearing", bearing.toDouble()) else putNull("bearing")
            put("note", ""); put("created_ms", System.currentTimeMillis())
        })
    fun hazards(): List<Hazard> = query("SELECT id,type,lat,lng,bearing,note,created_ms FROM hazards ORDER BY created_ms DESC") {
        Hazard(it.getLong(0), HazardType.of(it.getString(1)), it.getDouble(2), it.getDouble(3),
            if (it.isNull(4)) null else it.getFloat(4), it.getString(5) ?: "", it.getLong(6))
    }
    fun deleteHazard(id: Long) { writableDatabase.delete("hazards", "id=?", arrayOf(id.toString())) }

    /* ── الأماكن ── */
    fun addPlace(name: String, lat: Double, lng: Double) {
        writableDatabase.delete("places", "name=?", arrayOf(name))
        writableDatabase.insert("places", null, ContentValues().apply { put("name", name); put("lat", lat); put("lng", lng) })
    }
    fun places(): List<Place> = query("SELECT id,name,lat,lng FROM places ORDER BY name") { Place(it.getLong(0), it.getString(1), it.getDouble(2), it.getDouble(3)) }
    fun place(name: String): Place? = places().firstOrNull { it.name == name }
    fun deletePlace(id: Long) { writableDatabase.delete("places", "id=?", arrayOf(id.toString())) }

    /* ── الركن ── */
    fun park(lat: Double, lng: Double) {
        writableDatabase.insert("parking", null, ContentValues().apply { put("lat", lat); put("lng", lng); put("time_ms", System.currentTimeMillis()) })
        writableDatabase.execSQL("DELETE FROM parking WHERE id NOT IN (SELECT id FROM parking ORDER BY time_ms DESC LIMIT 20)")
    }
    fun parkings(): List<Parking> = query("SELECT id,lat,lng,time_ms FROM parking ORDER BY time_ms DESC") { Parking(it.getLong(0), it.getDouble(1), it.getDouble(2), it.getLong(3)) }

    /* ── الصيانة ── */
    fun maint(): List<MaintItem> = query("SELECT id,name,every_km,every_days,last_km,last_ms FROM maint ORDER BY id") {
        MaintItem(it.getLong(0), it.getString(1), it.getInt(2), it.getInt(3), it.getInt(4), it.getLong(5))
    }
    fun maintDone(id: Long, odoKm: Int) {
        writableDatabase.update("maint", ContentValues().apply { put("last_km", odoKm); put("last_ms", System.currentTimeMillis()) }, "id=?", arrayOf(id.toString()))
    }
    fun maintEdit(id: Long, everyKm: Int, everyDays: Int) {
        writableDatabase.update("maint", ContentValues().apply { put("every_km", everyKm); put("every_days", everyDays) }, "id=?", arrayOf(id.toString()))
    }
    /** أول مرة العدّاد يتكتب: البنود اللى لسه على صفر تبدأ من الرقم ده (مش «متأخرة ٨٠ ألف كيلو»). */
    fun maintStartAt(odoKm: Int) {
        writableDatabase.execSQL("UPDATE maint SET last_km = ? WHERE last_km = 0", arrayOf<Any>(odoKm))
    }

    /* ── التفويلات ── */
    fun addFill(odoKm: Int, liters: Double, price: Double, full: Boolean) {
        writableDatabase.insert("fills", null, ContentValues().apply {
            put("odo_km", odoKm); put("liters", liters); put("price", price); put("full", if (full) 1 else 0); put("time_ms", System.currentTimeMillis())
        })
    }
    fun fills(): List<Fill> = query("SELECT id,odo_km,liters,price,full,time_ms FROM fills ORDER BY odo_km DESC") {
        Fill(it.getLong(0), it.getInt(1), it.getDouble(2), it.getDouble(3), it.getInt(4) == 1, it.getLong(5))
    }
    fun deleteFill(id: Long) { writableDatabase.delete("fills", "id=?", arrayOf(id.toString())) }

    /* ── تجاوز السرعة ── */
    fun addSpeeding(startMs: Long, endMs: Long, maxKmh: Float, limitKmh: Int, durationS: Int, lat: Double, lng: Double) {
        writableDatabase.insert("speeding", null, ContentValues().apply {
            put("start_ms", startMs); put("end_ms", endMs); put("max_kmh", maxKmh.toDouble()); put("limit_kmh", limitKmh)
            put("duration_s", durationS); put("lat", lat); put("lng", lng)
        })
    }
    fun speeding(limit: Int = 50): List<Speeding> = query("SELECT id,start_ms,max_kmh,limit_kmh,duration_s,lat,lng FROM speeding ORDER BY start_ms DESC LIMIT $limit") {
        Speeding(it.getLong(0), it.getLong(1), it.getFloat(2), it.getInt(3), it.getInt(4), it.getDouble(5), it.getDouble(6))
    }
    fun clearSpeeding() { writableDatabase.delete("speeding", null, null) }

    /* ── Oscar Security: الطوابير ── */
    data class TrkRow(val id: Long, val t: Long, val lat: Double, val lng: Double, val s: Float?, val h: Float?, val a: Float?)
    data class SecEv(val id: Long, val uuid: String, val t: Long, val kind: String, val lat: Double?, val lng: Double?, val detail: String)
    data class Clip(val id: Long, val uuid: String, val t: Long, val path: String, val sec: Int, val bytes: Long, val reason: String, val synced: Boolean)

    fun addTrack(t: Long, lat: Double, lng: Double, s: Float?, h: Float?, a: Float?) {
        writableDatabase.insert("trk", null, ContentValues().apply {
            put("t", t); put("lat", lat); put("lng", lng)
            if (s != null) put("s", s.toDouble()) else putNull("s")
            if (h != null) put("h", h.toDouble()) else putNull("h")
            if (a != null) put("a", a.toDouble()) else putNull("a")
        })
        // سقف: أسبوعين من غير نت ماشية كل ١٠ ثوانى ≈ ١٢٠ ألف — بنحتفظ بآخر ١٥٠ ألف
        if (System.nanoTime() % 200 == 0L) writableDatabase.execSQL("DELETE FROM trk WHERE id <= (SELECT MAX(id) FROM trk) - 150000")
    }
    fun pendingTrack(limit: Int): List<TrkRow> = query("SELECT id,t,lat,lng,s,h,a FROM trk ORDER BY id LIMIT $limit") {
        TrkRow(it.getLong(0), it.getLong(1), it.getDouble(2), it.getDouble(3),
            if (it.isNull(4)) null else it.getFloat(4), if (it.isNull(5)) null else it.getFloat(5), if (it.isNull(6)) null else it.getFloat(6))
    }
    fun trackCount(): Long = readableDatabase.rawQuery("SELECT COUNT(*) FROM trk", null).use { c -> if (c.moveToFirst()) c.getLong(0) else 0 }
    fun dropTrackUpTo(id: Long) { writableDatabase.delete("trk", "id <= ?", arrayOf(id.toString())) }

    fun addSecEvent(uuid: String, t: Long, kind: String, lat: Double?, lng: Double?, detail: String = "{}") {
        writableDatabase.insert("sec_ev", null, ContentValues().apply {
            put("uuid", uuid); put("t", t); put("kind", kind); put("detail", detail)
            if (lat != null) put("lat", lat) else putNull("lat")
            if (lng != null) put("lng", lng) else putNull("lng")
        })
    }
    fun unsentSecEvents(): List<SecEv> = query("SELECT id,uuid,t,kind,lat,lng,detail FROM sec_ev WHERE sent=0 ORDER BY id LIMIT 200") {
        SecEv(it.getLong(0), it.getString(1), it.getLong(2), it.getString(3), if (it.isNull(4)) null else it.getDouble(4), if (it.isNull(5)) null else it.getDouble(5), it.getString(6) ?: "{}")
    }
    fun recentSecEvents(limit: Int = 30): List<SecEv> = query("SELECT id,uuid,t,kind,lat,lng,detail FROM sec_ev ORDER BY t DESC LIMIT $limit") {
        SecEv(it.getLong(0), it.getString(1), it.getLong(2), it.getString(3), if (it.isNull(4)) null else it.getDouble(4), if (it.isNull(5)) null else it.getDouble(5), it.getString(6) ?: "{}")
    }
    fun markSecSent(ids: List<Long>) { if (ids.isNotEmpty()) writableDatabase.execSQL("UPDATE sec_ev SET sent=1 WHERE id IN (${ids.joinToString(",")})") }

    fun addClip(uuid: String, t: Long, path: String, sec: Int, bytes: Long, reason: String) {
        writableDatabase.insert("clips", null, ContentValues().apply {
            put("uuid", uuid); put("t", t); put("path", path); put("sec", sec); put("bytes", bytes); put("reason", reason)
        })
    }
    fun clips(): List<Clip> = query("SELECT id,uuid,t,path,sec,bytes,reason,synced FROM clips ORDER BY t DESC") {
        Clip(it.getLong(0), it.getString(1), it.getLong(2), it.getString(3), it.getInt(4), it.getLong(5), it.getString(6) ?: "", it.getInt(7) == 1)
    }
    fun unsyncedClips(): List<Clip> = clips().filter { !it.synced }
    fun markClipsSynced(ids: List<Long>) { if (ids.isNotEmpty()) writableDatabase.execSQL("UPDATE clips SET synced=1 WHERE id IN (${ids.joinToString(",")})") }
    fun deleteClip(id: Long) { writableDatabase.delete("clips", "id=?", arrayOf(id.toString())) }

    companion object {
        @Volatile private var inst: Db? = null
        fun get(ctx: Context): Db = inst ?: synchronized(this) { inst ?: Db(ctx.applicationContext).also { inst = it } }
    }
}
