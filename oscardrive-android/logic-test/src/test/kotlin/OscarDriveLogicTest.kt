import com.oscardevs.oscardrive.logic.*
import kotlin.math.abs
import kotlin.test.*

// خط مستقيم ناحية الشمال: كل ٠٫٠٠٠٠٩ درجة عرض ≈ ١٠ متر
private const val LAT0 = 30.0
private const val LNG0 = 31.0
private fun north(m: Double) = LAT0 + m / 111_195.0

class GeoTest {
    @Test fun compass() {
        assertEquals("N", Geo.compassEn(0f)); assertEquals("NE", Geo.compassEn(44f))
        assertEquals("E", Geo.compassEn(91f)); assertEquals("NW", Geo.compassEn(330f))
        assertEquals("N", Geo.compassEn(355f)); assertEquals("↗", Geo.arrow(45f))
        assertEquals("شمال شرق", Geo.compassAr(50f))
    }
    @Test fun angles() {
        assertEquals(20f, Geo.angleDiff(350f, 10f)); assertEquals(180f, Geo.angleDiff(0f, 180f))
        assertTrue(abs(Geo.bearingDeg(LAT0, LNG0, north(100.0), LNG0)) < 0.5f)
    }
    @Test fun sayDistance() {
        assertEquals("بعد 150 متر", Geo.sayDistance(160.0))
        assertEquals("بعد 1.2 كيلو", Geo.sayDistance(1240.0))
    }
}

class TripTest {
    @Test fun countsOnlyRealMovement() {
        val t = TripLogic()
        var now = 0L
        // واقف ودقة كويسة: رقص الـGPS مايبدأش رحلة
        repeat(30) { t.onFix(now, LAT0 + (it % 2) * 0.00005, LNG0, 1f, 8f, null); now += 1000 }
        assertFalse(t.active)
        // ماشى ١٠ م/ث (٣٦ كم/س) دقيقة = ٦٠٠ متر
        repeat(61) { t.onFix(now, north(it * 10.0), LNG0, 36f, 5f, 0f); now += 1000 }
        assertTrue(t.active)
        assertTrue(abs(t.distanceM - 600) < 5, "distance ${t.distanceM}")
        assertTrue(abs(t.avgKmh - 36f) < 1f)
        assertEquals(0f, t.headingDeg)
        // واقف وبيرقص دقيقتين: المسافة ماتزيدش
        val d = t.distanceM
        repeat(120) { t.onFix(now, north(600.0 + (it % 2) * 5), LNG0, 0.5f, 8f, null); now += 1000; assertNull(t.onTick(now)) }
        assertEquals(d, t.distanceM)
        // ٣ دقايق وقفة ⇒ الرحلة خلصت
        var s: TripLogic.Summary? = null
        repeat(70) { now += 1000; s = s ?: t.onTick(now) }
        assertNotNull(s); assertFalse(t.active)
        assertTrue(abs(s!!.distanceM - 600) < 5)
        assertEquals(36f, s!!.maxKmh)
    }
    @Test fun impossibleJumpIgnored() {
        val t = TripLogic(); var now = 0L
        repeat(10) { t.onFix(now, north(it * 10.0), LNG0, 36f, 5f, 0f); now += 1000 }
        t.onFix(now, north(5000.0), LNG0, 36f, 5f, 0f)   // نطّة ٥ كم فى ثانية
        assertTrue(t.distanceM < 200)
    }
    @Test fun shortTripDropped() {
        val t = TripLogic(); var now = 0L
        repeat(10) { t.onFix(now, north(it * 10.0), LNG0, 36f, 5f, 0f); now += 1000 }
        assertNull(t.forceEnd())
    }
}

class RoadMemoryTest {
    private val bump = Hazard(1, HazardType.BUMP, north(120.0), LNG0, 0f)
    @Test fun warnsAheadOnly() {
        val r = RoadMemory.ahead(listOf(bump), LAT0, LNG0, 0f, 50f, 0, emptyMap())
        assertNotNull(r); assertTrue(abs(r!!.second - 120) < 2)
        assertEquals("خلّى بالك، مطب بعد 100 متر", RoadMemory.warning(r.first, r.second))
        // ماشى جنوب (المطب وراك) ⇒ لأ
        assertNull(RoadMemory.ahead(listOf(bump), LAT0, LNG0, 180f, 50f, 0, emptyMap()))
        // واقف تقريباً ⇒ لأ
        assertNull(RoadMemory.ahead(listOf(bump), LAT0, LNG0, 0f, 5f, 0, emptyMap()))
        // اتنبّه من دقيقة ⇒ لأ، ومن ٦ دقايق ⇒ آه
        assertNull(RoadMemory.ahead(listOf(bump), LAT0, LNG0, 0f, 50f, 60_000, mapOf(1L to 0L)))
        assertNotNull(RoadMemory.ahead(listOf(bump), LAT0, LNG0, 0f, 50f, 360_000, mapOf(1L to 0L)))
    }
    @Test fun rangeGrowsWithSpeed() {
        val far = Hazard(2, HazardType.POTHOLE, north(300.0), LNG0, null)
        assertNull(RoadMemory.ahead(listOf(far), LAT0, LNG0, 0f, 40f, 0, emptyMap()))
        assertNotNull(RoadMemory.ahead(listOf(far), LAT0, LNG0, 0f, 100f, 0, emptyMap()))  // ١٢ ث × ٢٧٫٨ = ٣٣٣ م
    }
    @Test fun radarKeepsItsDirection() {
        val radar = Hazard(3, HazardType.RADAR, north(100.0), LNG0, 180f)  // متسجّل وهو رايح جنوب
        assertNull(RoadMemory.ahead(listOf(radar), LAT0, LNG0, 0f, 60f, 0, emptyMap()))
        val radarN = radar.copy(bearing = 5f)
        assertNotNull(RoadMemory.ahead(listOf(radarN), LAT0, LNG0, 0f, 60f, 0, emptyMap()))
    }
    @Test fun duplicates() {
        assertNotNull(RoadMemory.duplicateOf(listOf(bump), HazardType.BUMP, north(110.0), LNG0))
        assertNull(RoadMemory.duplicateOf(listOf(bump), HazardType.POTHOLE, north(110.0), LNG0))
        assertNull(RoadMemory.duplicateOf(listOf(bump), HazardType.BUMP, north(200.0), LNG0))
    }
}

class WellnessTest {
    @Test fun remindsAfterLimitThenEvery15() {
        val w = Wellness(60); var now = 0L; val got = mutableListOf<Int>()
        repeat(91 * 60) { w.onTick(now, true)?.let { got += it }; now += 1000 }
        assertEquals(listOf(60, 75, 90), got)
    }
    @Test fun tenMinuteStopResets() {
        val w = Wellness(60); var now = 0L
        repeat(50 * 60) { w.onTick(now, true); now += 1000 }
        repeat(10 * 60) { w.onTick(now, false); now += 1000 }
        w.onTick(now, false)
        assertNull(w.drivingSinceMs)
        var got: Int? = null
        repeat(30 * 60) { got = got ?: w.onTick(now, true); now += 1000 }
        assertNull(got)
    }
    @Test fun offMeansOff() {
        val w = Wellness(0); var now = 0L
        repeat(5 * 3600) { assertNull(w.onTick(now, true)); now += 1000 }
    }
    @Test fun message() {
        assertEquals("بقالك ساعتين سايق. خد استراحة واشرب حاجة", Wellness.message(120))
        assertEquals("بقالك ساعة و30 دقيقة سايق. خد استراحة واشرب حاجة", Wellness.message(90))
    }
}

class CarCareTest {
    private val day = CarCare.DAY_MS
    @Test fun status() {
        val oil = MaintItem(1, "زيت", 5000, 180, 10_000, 0)
        assertEquals(MaintStatus.OK, CarCare.status(oil, 12_000, 10 * day).status)
        assertEquals(MaintStatus.SOON, CarCare.status(oil, 14_600, 10 * day).status)
        assertEquals(MaintStatus.DUE, CarCare.status(oil, 15_100, 10 * day).status)
        assertEquals(MaintStatus.DUE, CarCare.status(oil, 11_000, 181 * day).status)   // بالأيام
        assertEquals("متأخر 100 كم · فاضل 170 يوم", CarCare.describe(CarCare.status(oil, 15_100, 10 * day)))
        val license = MaintItem(2, "ترخيص", 0, 365, 0, 0)
        assertNull(CarCare.status(license, 99_999, 0).kmLeft)
    }
    @Test fun fuelFullToFull() {
        val f = listOf(
            Fill(1, 10_000, 40.0, 600.0, true, 0),
            Fill(2, 10_250, 15.0, 225.0, false, 0),
            Fill(3, 10_500, 20.0, 300.0, true, 0),
        )
        assertEquals(7.0, Fuel.consumption(f)!!, 1e-9)        // ٣٥ لتر / ٥٠٠ كم
        assertEquals(1.05, Fuel.costPerKm(f)!!, 1e-9)
        assertNull(Fuel.consumption(f.take(2)))
    }
}

class SunTest {
    @Test fun cairoSummer() {
        // القاهرة ٢١ يونيو: الشروق ≈ ٢:٥٤ UTC والغروب ≈ ١٦:٥٩ UTC
        val rise = SunTimes.utcMinutes(30.04, 31.24, 172, true)!!
        val set = SunTimes.utcMinutes(30.04, 31.24, 172, false)!!
        assertTrue(abs(rise - (2 * 60 + 54)) < 10, "rise $rise")
        assertTrue(abs(set - (16 * 60 + 59)) < 10, "set $set")
        val noon = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply { set(2026, 5, 21, 10, 0, 0) }.timeInMillis
        assertFalse(SunTimes.isNight(30.04, 31.24, noon))
        assertTrue(SunTimes.isNight(30.04, 31.24, noon + 10 * 3600_000L))   // ٨ بالليل UTC
    }
}

class VoiceTest {
    @Test fun commands() {
        assertEquals(Cmd.MarkHazard(HazardType.BUMP), VoiceCommands.parse("سجّل مطب هنا"))
        assertEquals(Cmd.MarkHazard(HazardType.POTHOLE), VoiceCommands.parse("فى حفرة"))
        assertEquals(Cmd.MarkHazard(HazardType.RADAR), VoiceCommands.parse("رادار"))
        assertEquals(Cmd.NearestFuel, VoiceCommands.parse("وصلنى لأقرب بنزينة"))
        assertEquals(Cmd.FindCar, VoiceCommands.parse("العربية فين"))
        assertEquals(Cmd.Park, VoiceCommands.parse("ركنت هنا"))
        assertEquals(Cmd.GoTo("البيت"), VoiceCommands.parse("وصلني للبيت"))
        assertEquals(Cmd.GoTo("محطه مصر"), VoiceCommands.parse("خدنى لمحطة مصر"))
        assertEquals(Cmd.Music, VoiceCommands.parse("شغل أغانى"))
        assertEquals(Cmd.OpenMap, VoiceCommands.parse("افتح الخريطة"))
        assertEquals(Cmd.Emergency, VoiceCommands.parse("طوارئ"))
        assertEquals(Cmd.Unknown, VoiceCommands.parse("إزيك"))
    }
}
