package com.oscardevs.oscardrive

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.oscardevs.oscardrive.logic.CarCare
import com.oscardevs.oscardrive.logic.Fill
import com.oscardevs.oscardrive.logic.FillRec
import com.oscardevs.oscardrive.logic.Grade
import com.oscardevs.oscardrive.logic.ParkSpot
import com.oscardevs.oscardrive.logic.Hazard
import com.oscardevs.oscardrive.logic.HazardType
import com.oscardevs.oscardrive.logic.MaintItem
import com.oscardevs.oscardrive.logic.TripLogic

/**
 * قاعدة بيانات محلية (SQLite على الجهاز) — مفيش سحابة ولا حساب: الرحلات، ذاكرة الطريق، الأماكن،
 * الركنات، الصيانة، التفويلات، وسجل تجاوز السرعة.
 */
class Db private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "oscardrive.db", null, 5) {

    data class Trip(val id: Long, val startMs: Long, val endMs: Long, val distanceM: Double, val movingS: Long, val maxKmh: Float,
                    val score: Int? = null, val brakes: Int = 0, val accels: Int = 0, val speedingN: Int = 0, val speedingS: Int = 0) {
        val avgKmh: Float get() = if (movingS > 0) (distanceM / movingS * 3.6).toFloat() else 0f
    }
    data class Place(val id: Long, val name: String, val lat: Double, val lng: Double)
    data class Parking(val id: Long, val lat: Double, val lng: Double, val timeMs: Long,
                       val accuracyM: Float? = null, val odoKm: Int? = null, val note: String = "") {
        fun spot() = ParkSpot(lat, lng, timeMs, accuracyM, odoKm, note)
    }
    data class MaintLog(val itemId: Long, val name: String, val doneMs: Long, val odoKm: Int)
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
        upgrade3(db, fresh = true)
        upgrade4(db)
        upgrade5(db)
        val now = System.currentTimeMillis()
        for ((name, km, days) in CarCare.DEFAULTS) {
            db.insert("maint", null, ContentValues().apply {
                put("name", name); put("every_km", km); put("every_days", days); put("last_km", 0); put("last_ms", now)
            })
        }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createSecurity(db)   // نسخة ١ مافيهاش الحماية — البيانات القديمة بتفضل زى ما هى
        if (oldVersion < 3) upgrade3(db, fresh = false)
        if (oldVersion < 4) upgrade4(db)
        if (oldVersion < 5) upgrade5(db)
    }

    /** نسخة ٥ (المرحلة ٧): سلوك القيادة لكل رحلة — الرحلات القديمة بتفضل من غير درجة (NULL). */
    private fun upgrade5(db: SQLiteDatabase) {
        for (c in listOf("brakes INTEGER", "accels INTEGER", "speeding_n INTEGER", "speeding_s INTEGER", "score INTEGER"))
            try { db.execSQL("ALTER TABLE trips ADD COLUMN $c") } catch (_: Exception) { /* موجود */ }
    }

    /** نسخة ٤ (المرحلة ٥): التذكيرات والمهام والملاحظات · «جهات أوسكار» لرسايل الواتساب (إنت بتكتبها — مش جهات الموبايل). */
    private fun upgrade4(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, text TEXT, due_ms INTEGER, lat REAL, lng REAL, place TEXT, done INTEGER DEFAULT 0, created_ms INTEGER)")
        db.execSQL("CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT)")
    }

    /* ── التذكيرات · المهام · الملاحظات ── */
    data class Note(val id: Long, val kind: String, val text: String, val dueMs: Long?, val lat: Double?, val lng: Double?, val place: String?, val done: Boolean, val createdMs: Long) {
        fun reminder() = com.oscardevs.oscardrive.logic.Reminder(id, text, dueMs, lat, lng, place, done)
    }
    fun addNote(kind: String, text: String, dueMs: Long? = null, lat: Double? = null, lng: Double? = null, place: String? = null): Long =
        writableDatabase.insert("notes", null, ContentValues().apply {
            put("kind", kind); put("text", text.take(300)); put("created_ms", System.currentTimeMillis()); put("done", 0)
            if (dueMs != null) put("due_ms", dueMs) else putNull("due_ms")
            if (lat != null && lng != null) { put("lat", lat); put("lng", lng) } else { putNull("lat"); putNull("lng") }
            if (place != null) put("place", place) else putNull("place")
        })
    fun notes(kind: String? = null, includeDone: Boolean = true): List<Note> =
        query("SELECT id,kind,text,due_ms,lat,lng,place,done,created_ms FROM notes" +
            (if (kind != null) " WHERE kind = ?" else "") + (if (!includeDone) (if (kind != null) " AND" else " WHERE") + " done = 0" else "") +
            " ORDER BY done, COALESCE(due_ms, created_ms) DESC LIMIT 200", if (kind != null) arrayOf(kind) else emptyArray()) {
            Note(it.getLong(0), it.getString(1) ?: "", it.getString(2) ?: "", if (it.isNull(3)) null else it.getLong(3),
                if (it.isNull(4)) null else it.getDouble(4), if (it.isNull(5)) null else it.getDouble(5), it.getString(6), it.getInt(7) == 1, it.getLong(8))
        }
    fun setNoteDone(id: Long, done: Boolean = true) { writableDatabase.update("notes", ContentValues().apply { put("done", if (done) 1 else 0) }, "id=?", arrayOf(id.toString())) }
    fun deleteNote(id: Long) { writableDatabase.delete("notes", "id=?", arrayOf(id.toString())) }

    /* ── جهات أوسكار (لرسايل الواتساب) ── */
    fun contacts(): List<com.oscardevs.oscardrive.logic.OscarContact> = query("SELECT id,name,phone FROM contacts ORDER BY name") {
        com.oscardevs.oscardrive.logic.OscarContact(it.getLong(0), it.getString(1) ?: "", it.getString(2) ?: "")
    }
    fun addContact(name: String, phone: String) { writableDatabase.insert("contacts", null, ContentValues().apply { put("name", name.take(60)); put("phone", phone.take(30)) }) }
    fun deleteContact(id: Long) { writableDatabase.delete("contacts", "id=?", arrayOf(id.toString())) }

    /**
     * نسخة ٣ (المرحلة ٤): الركنة بدقتها وعدّادها وملاحظة · التفويلة بنوع البنزين وسعر اللتر · سجل الصيانة ·
     * الكاوتش أمامى وخلفى منفصلين (البند القديم «الكاوتش» بيبقى «أمامى» ويتعمل «خلفى» بنفس آخر تغيير — مايضيعش حاجة).
     */
    private fun upgrade3(db: SQLiteDatabase, fresh: Boolean) {
        for (sql in listOf(
            "ALTER TABLE parking ADD COLUMN acc REAL", "ALTER TABLE parking ADD COLUMN odo INTEGER", "ALTER TABLE parking ADD COLUMN note TEXT",
            "ALTER TABLE fills ADD COLUMN grade TEXT", "ALTER TABLE fills ADD COLUMN ppl REAL",
        )) try { db.execSQL(sql) } catch (_: Exception) { /* موجود */ }
        db.execSQL("CREATE TABLE IF NOT EXISTS maint_log(id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, name TEXT, done_ms INTEGER, odo INTEGER)")
        if (fresh) return
        db.rawQuery("SELECT id, every_km, every_days, last_km, last_ms FROM maint WHERE name = 'الكاوتش'", null).use { c ->
            if (c.moveToFirst()) {
                db.execSQL("UPDATE maint SET name = 'كاوتش أمامى' WHERE id = ?", arrayOf<Any>(c.getLong(0)))
                db.insert("maint", null, ContentValues().apply {
                    put("name", "كاوتش خلفى"); put("every_km", c.getInt(1)); put("every_days", c.getInt(2)); put("last_km", c.getInt(3)); put("last_ms", c.getLong(4))
                })
            }
        }
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
    fun addTrip(s: TripLogic.Summary, b: com.oscardevs.oscardrive.logic.TripBehavior? = null, score: Int? = null) {
        writableDatabase.insert("trips", null, ContentValues().apply {
            if (b != null && score != null) {
                put("brakes", b.brakes); put("accels", b.accels); put("speeding_n", b.speedingN); put("speeding_s", b.speedingS); put("score", score)
            }
            put("start_ms", s.startMs); put("end_ms", s.endMs); put("distance_m", s.distanceM); put("moving_s", s.movingS)
            put("max_kmh", s.maxKmh.toDouble()); put("start_lat", s.startLat); put("start_lng", s.startLng)
            put("end_lat", s.endLat); put("end_lng", s.endLng)
        })
    }
    fun trips(sinceMs: Long = 0, limit: Int = 500): List<Trip> =
        query("SELECT id,start_ms,end_ms,distance_m,moving_s,max_kmh,score,brakes,accels,speeding_n,speeding_s FROM trips WHERE start_ms >= ? ORDER BY start_ms DESC LIMIT $limit",
            arrayOf(sinceMs.toString())) {
            Trip(it.getLong(0), it.getLong(1), it.getLong(2), it.getDouble(3), it.getLong(4), it.getFloat(5),
                if (it.isNull(6)) null else it.getInt(6), it.getInt(7), it.getInt(8), it.getInt(9), it.getInt(10))
        }

    /** نهايات الرحلات (للأماكن المتكررة) — من الجدول الموجود، مفيش تسجيل زيادة. */
    fun tripEnds(sinceMs: Long): List<com.oscardevs.oscardrive.logic.Visit> =
        query("SELECT end_lat,end_lng,end_ms FROM trips WHERE end_ms >= ? AND end_lat IS NOT NULL AND NOT (end_lat = 0 AND end_lng = 0)", arrayOf(sinceMs.toString())) {
            com.oscardevs.oscardrive.logic.Visit(it.getDouble(0), it.getDouble(1), it.getLong(2))
        }

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
    fun park(lat: Double, lng: Double, accuracyM: Float? = null, odoKm: Int? = null, timeMs: Long = System.currentTimeMillis(), note: String = "") {
        writableDatabase.insert("parking", null, ContentValues().apply {
            put("lat", lat); put("lng", lng); put("time_ms", timeMs); put("note", note)
            if (accuracyM != null) put("acc", accuracyM.toDouble()) else putNull("acc")
            if (odoKm != null && odoKm > 0) put("odo", odoKm) else putNull("odo")
        })
        writableDatabase.execSQL("DELETE FROM parking WHERE id NOT IN (SELECT id FROM parking ORDER BY time_ms DESC LIMIT 30)")
    }
    fun parkings(): List<Parking> = query("SELECT id,lat,lng,time_ms,acc,odo,note FROM parking ORDER BY time_ms DESC") {
        Parking(it.getLong(0), it.getDouble(1), it.getDouble(2), it.getLong(3),
            if (it.isNull(4)) null else it.getFloat(4), if (it.isNull(5)) null else it.getInt(5), it.getString(6) ?: "")
    }
    fun deleteParking(id: Long) { writableDatabase.delete("parking", "id=?", arrayOf(id.toString())) }
    fun setParkingNote(id: Long, note: String) { writableDatabase.update("parking", ContentValues().apply { put("note", note.take(200)) }, "id=?", arrayOf(id.toString())) }

    /* ── الصيانة ── */
    fun maint(): List<MaintItem> = query("SELECT id,name,every_km,every_days,last_km,last_ms FROM maint ORDER BY id") {
        MaintItem(it.getLong(0), it.getString(1), it.getInt(2), it.getInt(3), it.getInt(4), it.getLong(5))
    }
    fun maintDone(id: Long, odoKm: Int, everyKm: Int? = null) {
        val now = System.currentTimeMillis()
        writableDatabase.update("maint", ContentValues().apply {
            put("last_km", odoKm); put("last_ms", now); if (everyKm != null && everyKm > 0) put("every_km", everyKm)
        }, "id=?", arrayOf(id.toString()))
        val name = query("SELECT name FROM maint WHERE id = ?", arrayOf(id.toString())) { it.getString(0) }.firstOrNull() ?: ""
        writableDatabase.insert("maint_log", null, ContentValues().apply { put("item_id", id); put("name", name); put("done_ms", now); put("odo", odoKm) })
    }
    fun maintByName(name: String): MaintItem? = maint().firstOrNull { it.name == name }
    fun maintAdd(name: String, everyKm: Int, everyDays: Int, lastKm: Int) {
        writableDatabase.insert("maint", null, ContentValues().apply {
            put("name", name.take(40)); put("every_km", everyKm); put("every_days", everyDays); put("last_km", lastKm); put("last_ms", System.currentTimeMillis())
        })
    }
    fun maintDelete(id: Long) { writableDatabase.delete("maint", "id=?", arrayOf(id.toString())) }
    fun maintLog(limit: Int = 200): List<MaintLog> = query("SELECT item_id,name,done_ms,odo FROM maint_log ORDER BY done_ms DESC LIMIT $limit") {
        MaintLog(it.getLong(0), it.getString(1) ?: "", it.getLong(2), it.getInt(3))
    }
    fun maintEdit(id: Long, everyKm: Int, everyDays: Int) {
        writableDatabase.update("maint", ContentValues().apply { put("every_km", everyKm); put("every_days", everyDays) }, "id=?", arrayOf(id.toString()))
    }
    /** أول مرة العدّاد يتكتب: البنود اللى لسه على صفر تبدأ من الرقم ده (مش «متأخرة ٨٠ ألف كيلو»). */
    fun maintStartAt(odoKm: Int) {
        writableDatabase.execSQL("UPDATE maint SET last_km = ? WHERE last_km = 0", arrayOf<Any>(odoKm))
    }

    /* ── التفويلات ── */
    /** `price` = اللى دفعته كله (جنيه) · `perLiter` = سعر اللتر وقتها (بيفضل للتفويلة دى حتى لو السعر اتغيّر). */
    fun addFill(odoKm: Int, liters: Double, price: Double, full: Boolean, grade: Grade? = null, perLiter: Double? = null) {
        writableDatabase.insert("fills", null, ContentValues().apply {
            put("odo_km", odoKm); put("liters", liters); put("price", price); put("full", if (full) 1 else 0); put("time_ms", System.currentTimeMillis())
            if (grade != null) put("grade", grade.key) else putNull("grade")
            if (perLiter != null && perLiter > 0) put("ppl", perLiter) else putNull("ppl")
        })
    }
    fun fillRecs(): List<FillRec> = query("SELECT id,odo_km,liters,price,full,time_ms,grade,ppl FROM fills ORDER BY odo_km DESC") {
        FillRec(it.getLong(0), it.getInt(1), it.getDouble(2), it.getDouble(3), it.getInt(4) == 1, it.getLong(5),
            Grade.of(it.getString(6)), if (it.isNull(7)) null else it.getDouble(7))
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
