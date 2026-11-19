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
    @Test fun justMarkedHazardIsNotAnnounced() {
        // المالك ٢٠٢٦-١١-١٩: بعد «سجّل مطب» مايقولش «قدامك مطب» على نفس المطب
        val here = Hazard(1, HazardType.BUMP, LAT0, LNG0, null)
        val far = Hazard(2, HazardType.BUMP, LAT0 + 0.002, LNG0, null)   // ~٢٢٠ م
        val kept = RoadMemory.skipJustMarked(listOf(here, far), LAT0, LNG0, 1_000L, 1_000L + 30_000L)
        assertEquals(listOf(2L), kept.map { it.id })
        assertEquals(2, RoadMemory.skipJustMarked(listOf(here, far), LAT0, LNG0, 1_000L, 1_000L + RoadMemory.JUST_MARKED_MS + 1).size)
        assertEquals(2, RoadMemory.skipJustMarked(listOf(here, far), null, null, 0L, 5_000L).size)
    }

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
        assertNotNull(RoadMemory.ahead(listOf(far), LAT0, LNG0, 0f, 100f, 0, emptyMap()))  // ٨ ث + فرملة ⇒ ~٤١٥ م
    }
    // المالك ٢٠٢٦-١١-٠٦: «تنبيه المطب يبقى قبله بمسافه كافيه طبقا لسرعتى»
    @Test fun distanceBySpeed() {
        assertEquals(150.0, RoadMemory.warnDistanceM(30f))
        assertTrue(abs(RoadMemory.warnDistanceM(60f) - 202) < 5)
        assertTrue(abs(RoadMemory.warnDistanceM(100f) - 415) < 5)
        assertTrue(abs(RoadMemory.warnDistanceM(120f) - 545) < 5)
        // كل ما تسرع المسافة بتزيد أسرع من الأول (١٢ ث ثابتة كانت ٤٠٠ م على ١٢٠)
        assertTrue(RoadMemory.warnDistanceM(120f) > 120 / 3.6 * 12)
    }
    // «الرادار التنبيه الخاص بيه يجى قبله ب٣ كيلو» — وفى اتجاهك بس، ومرة تانية لما يقرب
    @Test fun radarFrom3km() {
        val radar = Hazard(4, HazardType.RADAR, north(2800.0), LNG0, 2f)
        val r = RoadMemory.ahead(listOf(radar), LAT0, LNG0, 0f, 80f, 0, emptyMap())
        assertNotNull(r)
        val far = RoadMemory.warnKey(radar, r!!.second, 80f)
        assertEquals(4L, far)
        // الاتجاه التانى من الطريق ⇒ لأ
        assertNull(RoadMemory.ahead(listOf(radar.copy(bearing = 182f)), LAT0, LNG0, 0f, 80f, 0, emptyMap()))
        // أبعد من ٣ كم ⇒ لأ · مطب على ٢٨٠٠ م ⇒ لأ
        assertNull(RoadMemory.ahead(listOf(radar.copy(lat = north(3200.0))), LAT0, LNG0, 0f, 80f, 0, emptyMap()))
        assertNull(RoadMemory.ahead(listOf(radar.copy(type = HazardType.BUMP)), LAT0, LNG0, 0f, 80f, 0, emptyMap()))
        // اتنبّه من بعيد ⇒ لما يقرب (٢٠٠ م) بيتنبّه تانى
        val near = radar.copy(lat = north(200.0))
        val r2 = RoadMemory.ahead(listOf(near), LAT0, LNG0, 0f, 80f, 60_000, mapOf(far to 0L))
        assertNotNull(r2)
        assertEquals(-4L, RoadMemory.warnKey(near, r2!!.second, 80f))
    }
    @Test fun radarKeepsItsDirection() {
        val radar = Hazard(3, HazardType.RADAR, north(100.0), LNG0, 180f)  // متسجّل وهو رايح جنوب
        assertNull(RoadMemory.ahead(listOf(radar), LAT0, LNG0, 0f, 60f, 0, emptyMap()))
        val radarN = radar.copy(bearing = 5f)
        assertNotNull(RoadMemory.ahead(listOf(radarN), LAT0, LNG0, 0f, 60f, 0, emptyMap()))
    }
    // المالك ٢٠٢٦-١١-١٨: «وضع عدم الإزعاج» ⇒ مفيش تنبيه تحت ٧ كم/س · مقفول ⇒ بينبّه حتى وانت ماشى ببطء · المسافة ١٠٠ م افتراضى
    @Test fun slowAndConfigurableDistance() {
        val q = RoadMemory.QUIET_SLOW_KMH; val s = RoadMemory.STOPPED_KMH; val d100 = RoadMemory.DEFAULT_BUMP_WARN_M.toDouble()
        val near = Hazard(5, HazardType.BUMP, north(60.0), LNG0, 0f)
        // ٥ كم/س: عدم الإزعاج ⇒ لأ · من غيره ⇒ آه
        assertNull(RoadMemory.ahead(listOf(near), LAT0, LNG0, 0f, 5f, 0, emptyMap(), minKmh = q, minWarnM = d100))
        assertNotNull(RoadMemory.ahead(listOf(near), LAT0, LNG0, 0f, 5f, 0, emptyMap(), minKmh = s, minWarnM = d100))
        // ٨ كم/س ⇒ آه فى الحالتين · واقف (١ كم/س) ⇒ لأ
        assertNotNull(RoadMemory.ahead(listOf(near), LAT0, LNG0, 0f, 8f, 0, emptyMap(), minKmh = q, minWarnM = d100))
        assertNull(RoadMemory.ahead(listOf(near), LAT0, LNG0, 0f, 1f, 0, emptyMap(), minKmh = s, minWarnM = d100))
        // مطب على ١٢٠ م بسرعة ٣٠: مسافة ١٠٠ ⇒ لسه · ١٥٠ ⇒ آه
        assertNull(RoadMemory.ahead(listOf(bump), LAT0, LNG0, 0f, 30f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        assertNotNull(RoadMemory.ahead(listOf(bump), LAT0, LNG0, 0f, 30f, 0, emptyMap(), minKmh = s, minWarnM = 150.0))
        // السرعة العالية لسه بتبعّد التنبيه: ١٠٠ كم/س ⇒ ~٤١٥ م حتى لو الإعداد ١٠٠
        assertTrue(abs(RoadMemory.rangeM(HazardType.BUMP, 100f, 100.0) - 415) < 5)
        // الرادار مالوش دعوة بالإعداد (٣ كم)
        assertEquals(3000.0, RoadMemory.rangeM(HazardType.RADAR, 60f, 50.0))
    }
    // المالك ٢٠٢٦-١١-١٨: المطب اللى تحت الكوبرى كان بينبّه وانت فوقه — الطريق اللى بيقطعه مابينبّهش، ونفس الطريق فى الاتجاهين بينبّه
    @Test fun bumpOnTheSameRoadAxisOnly() {
        val s = RoadMemory.STOPPED_KMH
        val east = Hazard(9, HazardType.BUMP, north(80.0), LNG0, 90f)   // متسجّل والعربية رايحة شرق
        // انت رايح شمال (طريق بيقطعه / كوبرى فوقه) ⇒ لأ
        assertNull(RoadMemory.ahead(listOf(east), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        // نفس الطريق: رايح شمال والمطب متسجّل شمال أو جنوب (الاتجاه العكسى) ⇒ آه
        assertNotNull(RoadMemory.ahead(listOf(east.copy(bearing = 10f)), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        assertNotNull(RoadMemory.ahead(listOf(east.copy(bearing = 185f)), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        // قديم من غير اتجاه ⇒ زى الأول
        assertNotNull(RoadMemory.ahead(listOf(east.copy(bearing = null)), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        assertTrue(RoadMemory.sameAxis(350f, 20f)); assertTrue(RoadMemory.sameAxis(0f, 150f)); assertFalse(RoadMemory.sameAxis(0f, 60f))
    }
    @Test fun oldBumpLearnsItsDirectionWhenDrivenOver() {
        val old = Hazard(10, HazardType.BUMP, north(8.0), LNG0, null)
        val withDir = Hazard(11, HazardType.BUMP, north(5.0), LNG0, 30f)
        val radar = Hazard(12, HazardType.RADAR, north(5.0), LNG0, null)
        assertEquals(listOf(10L to 3f), RoadMemory.learnBearing(listOf(old, withDir, radar), LAT0, LNG0, 3f, 15f, 6f))
        assertTrue(RoadMemory.learnBearing(listOf(old), LAT0, LNG0, 3f, 5f, 6f).isEmpty())     // واقف تقريباً
        assertTrue(RoadMemory.learnBearing(listOf(old), LAT0, LNG0, 3f, 45f, 6f).isEmpty())    // سريع = غالباً كوبرى فوقه مش المطب نفسه
        assertTrue(RoadMemory.learnBearing(listOf(old), LAT0, LNG0, 3f, 15f, 40f).isEmpty())   // GPS وحش
        assertTrue(RoadMemory.learnBearing(listOf(old), LAT0, LNG0, null, 15f, 6f).isEmpty())
        assertTrue(RoadMemory.learnBearing(listOf(old.copy(lat = north(60.0))), LAT0, LNG0, 3f, 15f, 6f).isEmpty())   // بعيد
    }
    // البند ٥: الكوبرى الموازى — الارتفاع بيشيل التنبيه بس لو الفرق أكبر من غلط القراءتين + ٣ م (الشك = بينبّه)
    @Test fun bridgeAltitudeFilter() {
        val s = RoadMemory.STOPPED_KMH
        val under = Hazard(13, HazardType.BUMP, north(80.0), LNG0, 0f, altitude = 40.0, accuracy = 4f)   // متسجّل تحت الكوبرى
        // فوق الكوبرى بـ١٥ م والقراءة دقيقة (٣ م) ⇒ ١٥ − (٦ + ٣) = ٦ > ٣ ⇒ لأ
        assertNull(RoadMemory.ahead(listOf(under), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0, altitudeM = 55.0, vAccM = 3f))
        // نفس الطريق (فرق ٤ م) ⇒ آه · فرق ١٥ م بس القراءة وحشة (١٢ م) ⇒ آه (الشك = بينبّه)
        assertNotNull(RoadMemory.ahead(listOf(under), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0, altitudeM = 44.0, vAccM = 3f))
        assertNotNull(RoadMemory.ahead(listOf(under), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0, altitudeM = 55.0, vAccM = 12f))
        // من غير ارتفاع (قديم أو الجهاز مابيقولش) ⇒ زى الأول
        assertNotNull(RoadMemory.ahead(listOf(under.copy(altitude = null)), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0, altitudeM = 55.0, vAccM = 3f))
        assertNotNull(RoadMemory.ahead(listOf(under), LAT0, LNG0, 0f, 40f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        // الرادار مالوش دعوة
        assertFalse(RoadMemory.otherLevel(under.copy(altitude = null), 90.0, 1f))
        // القديم بياخد ارتفاع لما تعدّى عليه ببطء والـGPS كويس
        val old = Hazard(14, HazardType.BUMP, north(5.0), LNG0, null)
        assertEquals(listOf(14L to 41.5), RoadMemory.learnAltitude(listOf(old, under.copy(lat = north(5.0))), LAT0, LNG0, 15f, 6f, 41.5))
        assertTrue(RoadMemory.learnAltitude(listOf(old), LAT0, LNG0, 15f, 15f, 41.5).isEmpty())   // دقة وحشة
        assertTrue(RoadMemory.learnAltitude(listOf(old), LAT0, LNG0, 60f, 6f, 41.5).isEmpty())    // سريع
    }
    @Test fun noHeadingYet() {
        val s = RoadMemory.STOPPED_KMH
        // أول التشغيل ومفيش اتجاه: القريب جداً (≤ ٤٠ م) بس
        assertNotNull(RoadMemory.ahead(listOf(Hazard(6, HazardType.BUMP, north(30.0), LNG0, null)), LAT0, LNG0, null, 6f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        assertNull(RoadMemory.ahead(listOf(Hazard(7, HazardType.BUMP, north(80.0), LNG0, null)), LAT0, LNG0, null, 6f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
        assertNull(RoadMemory.ahead(listOf(Hazard(8, HazardType.RADAR, north(30.0), LNG0, 0f)), LAT0, LNG0, null, 6f, 0, emptyMap(), minKmh = s, minWarnM = 100.0))
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

class SecurityTest {
    @Test fun startArmedAndMoveWithoutPinAlarmsAfterGrace() {
        val s = SecurityLogic(); var now = 1_000_000L
        assertEquals(listOf(SecurityLogic.Kind.STARTED_ARMED), s.onBoot(now, true).map { it.kind })
        assertTrue(s.needsPin)
        // اتحركت على طول — جوّه المهلة مفيش تنبيه، وبعدها تنبيه واحد بس
        var got = mutableListOf<SecurityLogic.Event>()
        var firstAt = -1
        repeat(60) { i -> val e = s.onFix(now, north(i * 10.0), LNG0, 36f, 5f); if (e.isNotEmpty() && firstAt < 0) firstAt = i; got += e; now += 1000 }
        assertEquals(1, got.count { it.kind == SecurityLogic.Kind.ARMED_MOVE })
        assertTrue(firstAt in 44..46, "alarm at second $firstAt")
        got = mutableListOf(); repeat(60) { got += s.onFix(now, north(600 + it * 10.0), LNG0, 36f, 5f); now += 1000 }
        assertTrue(got.isEmpty())
    }
    @Test fun pinInsideGraceMeansNoAlarm() {
        val s = SecurityLogic(); var now = 0L
        s.onBoot(now, true)
        repeat(10) { s.onFix(now, north(it * 10.0), LNG0, 36f, 5f); now += 1000 }
        assertEquals(listOf(SecurityLogic.Kind.PIN_OK), s.onPin(true).map { it.kind })
        val got = mutableListOf<SecurityLogic.Event>()
        repeat(120) { got += s.onFix(now, north(100 + it * 10.0), LNG0, 36f, 5f); now += 1000 }
        assertTrue(got.isEmpty())
    }
    @Test fun wrongPinsAndDisarmedIsSilent() {
        val s = SecurityLogic()
        s.onBoot(0, true)
        assertTrue(s.onPin(false).isEmpty()); assertTrue(s.onPin(false).isEmpty())
        assertEquals(SecurityLogic.Kind.PIN_WRONG, s.onPin(false).single().kind)
        val off = SecurityLogic(); off.onBoot(0, false)
        assertFalse(off.needsPin)
        var now = 0L; val got = mutableListOf<SecurityLogic.Event>()
        repeat(120) { got += off.onFix(now, north(it * 10.0), LNG0, 36f, 5f); now += 1000 }
        assertTrue(got.isEmpty())
    }
    @Test fun gpsJitterWhileParkedIsNotMovement() {
        val s = SecurityLogic(); var now = 0L
        s.onBoot(now, true)
        val got = mutableListOf<SecurityLogic.Event>()
        repeat(300) { got += s.onFix(now, north((it % 3) * 15.0), LNG0, 2f, 12f); now += 1000 }
        assertTrue(got.isEmpty())
    }
    @Test fun remoteArmDuringSessionAsksPinAgain() {
        val s = SecurityLogic(); s.onBoot(0, false)
        assertTrue(s.setArmed(true, fromCar = false).isEmpty())
        assertTrue(s.needsPin)
        assertEquals(SecurityLogic.Kind.DISARMED, s.setArmed(false, fromCar = true).single().kind)
    }
    @Test fun trackPolicyAndPin() {
        assertTrue(TrackPolicy.due(0, 10_000, 30f)); assertFalse(TrackPolicy.due(0, 10_000, 0f))
        assertTrue(TrackPolicy.due(0, 60_000, 0f))
        assertTrue(Pin.valid("1234")); assertFalse(Pin.valid("12a4")); assertFalse(Pin.valid("123"))
        assertEquals(Pin.hash("1234", "s"), Pin.hash("1234", "s")); assertNotEquals(Pin.hash("1234", "s"), Pin.hash("1235", "s"))
    }
}

class VoiceEngineTest {
    private val e = VoiceEngine()
    private fun id(t: String) = e.match(t)?.command?.id
    @Test fun arabicAndEnglish() {
        assertEquals("nav.home", id("وصّلنى البيت"))
        assertEquals("nav.home", id("Take me home"))
        assertEquals("road.bump", id("فيه مطب هنا"))
        // «اوسكار اسكرين شوت» (٢٠٢٦-١١-١٨) — و«صوّر المطب» مايتفهمش «سجّل مطب»
        assertEquals("road.shot", id("اسكرين شوت"))
        assertEquals("road.shot", id("Take a screenshot"))
        assertEquals("road.shot", id("صوّر الطريق"))
        assertEquals("road.shot", id("صوّر المطب"))
        assertEquals("sec.record", id("صوّر ورا"))
        assertEquals("info.speed", id("أنا ماشى كام؟"))
        assertEquals("info.speed", id("What's my speed"))
        assertEquals("nav.fuel", id("وصلني لأقرب بنزينة"))
        assertEquals("sec.arm", id("فعّل الحماية"))
        assertEquals("sec.disarm", id("اقفل الحماية"))
        assertNull(id("الجو حلو النهارده"))
    }
    @Test fun slots() {
        val m = e.match("وصلني لمحطة مصر")!!
        assertEquals("nav.goto", m.command.id); assertEquals("محطه مصر", m.slot)
        assertEquals("nav.goto", e.match("navigate to cairo tower")!!.command.id)
        assertEquals(120, VoiceEngine.number(e.match("خلي الحد مية وعشرين")!!.slot))
        assertEquals(80, VoiceEngine.number(e.match("set limit to 80")!!.slot))
    }
    @Test fun wakeName() {
        assertEquals("وصلني البيت", e.afterWake("يا أوسكار وصلني البيت"))
        assertEquals("", e.afterWake("Hey Oscar"))
        assertNull(e.afterWake("وصلني البيت"))
        // C9: الاسم زى ما برنامج التعرّف بيكتبه فعلاً
        assertEquals("سجل مطب", e.afterWake("اسكار سجل مطب"))
        assertEquals("سجل مطب", e.afterWake("يا وسكار سجل مطب"))
        assertEquals("السرعه كام", e.afterWake("اوسكر السرعه كام"))
        val custom = VoiceEngine(wakeNames = listOf("يا كابتن"))
        assertEquals("السرعه كام", custom.afterWake("يا كابتن السرعة كام"))
        assertNull(custom.afterWake("يا أوسكار السرعة كام"))
    }
    @Test fun customPhrasesAndDisabled() {
        val c = VoiceEngine(custom = mapOf("park.save" to listOf("اركنها")), disabled = setOf("road.bump"))
        assertEquals("park.save", c.match("اركنها")?.command?.id)
        assertNull(c.match("سجل مطب"))
    }
}

// المالك ٢٠٢٦-١١-٠٦: الموقع GPS من غير نت، والنت يساعد بمكان تقريبى لحد ما الـGPS يلقط
class ApproxLocationTest {
    @Test fun networkOnlyWhenGpsIsMissing() {
        // GPS لقط من ٥ ثوانى ⇒ موقع الشبكة مايتستخدمش
        assertFalse(ApproxLocation.useNetwork(100_000, 95_000, 99_000))
        // مفيش GPS من دقيقة وفيه موقع شبكة حديث ⇒ يتستخدم
        assertTrue(ApproxLocation.useNetwork(100_000, 40_000, 90_000))
        // من أول التشغيل (مفيش GPS خالص) وفيه شبكة ⇒ يتستخدم
        assertTrue(ApproxLocation.useNetwork(100_000, 0, 99_000))
        // موقع شبكة قديم أو مفيش ⇒ لأ
        assertFalse(ApproxLocation.useNetwork(500_000, 0, 100_000))
        assertFalse(ApproxLocation.useNetwork(100_000, 0, null))
        assertEquals("📶 مكان تقريبى ±850 م", ApproxLocation.label(850f))
    }
}

// «Oscar Smart Voice Recognition» (المالك ٢٠٢٦-١١-٠٧): «سجل مطب» اتسمعت «سجلت مطلب»
class SmartVoiceTest {
    private val e = VoiceEngine()
    @Test fun dictionaryFixesKnownMishearsWithoutAsking() {
        val u = e.understand("سجلت مطلب")!!
        assertEquals("road.bump", u.match.command.id); assertTrue(u.sure)
        assertEquals("road.radar", e.understand("سجل ردار")!!.match.command.id)
        assertEquals("nav.open", e.understand("افتح الملاحا")!!.match.command.id)
        assertEquals("road.bump", e.understand("mark bum")!!.match.command.id)
    }
    @Test fun exactStaysExact() {
        val u = e.understand("سجل مطب")!!
        assertTrue(u.sure); assertEquals("road.bump", u.match.command.id)
        assertNull(e.understand("الجو حلو النهارده"))
    }
    @Test fun closeButUnknownAsks() {
        // «فعّل الحمايا» فى القاموس ⇒ متأكد · «فعل الحمايت» مش فى القاموس بس قريبة ⇒ يسأل
        assertTrue(e.understand("فعل الحمايا")!!.sure)
        val u = e.understand("فعل الحمايت")!!
        assertEquals("sec.arm", u.match.command.id); assertFalse(u.sure)
        assertEquals("الحمايه", u.learn["الحمايت"])
        // كلمة بعيدة ⇒ مفيش أمر (مايخمّنش)
        assertNull(e.understand("مطر"))
    }
    @Test fun placeNamesAndNumbersAreNotCorrected() {
        // «المطلب» اسم مكان ⇒ يفضل زى ما هو حتى لو القاموس بيصحّح «مطلب»
        val u = e.understand("وديتني مطعم المطلب")!!
        assertEquals("nav.goto", u.match.command.id); assertTrue(u.sure)
        assertEquals("مطعم المطلب", u.match.slot)
        assertEquals(120, VoiceEngine.number(e.understand("خلي الحد مية وعشرين")!!.match.slot))
    }
    @Test fun learnsFromTheDriver() {
        assertEquals("مزلقان" to "مطب", EgyptWords.correction(VoiceEngine.normalize("أنا قلت مطب مش مزلقان")))
        assertEquals("bomb" to "bump", EgyptWords.correction("i said bump not bomb"))
        assertNull(EgyptWords.correction("سجل مطب"))
        val taught = VoiceEngine(learned = mapOf("مزلقان" to "مطب"))
        val u = taught.understand("سجل مزلقان")!!
        assertEquals("road.bump", u.match.command.id); assertTrue(u.sure)
    }
    @Test fun yesNo() {
        assertEquals(true, EgyptWords.yesNo(VoiceEngine.normalize("أيوه")))
        assertEquals(true, EgyptWords.yesNo("yes please"))
        assertEquals(false, EgyptWords.yesNo(VoiceEngine.normalize("لأ")))
        assertEquals(false, EgyptWords.yesNo("لا مش ده"))
        assertNull(EgyptWords.yesNo("وصلني البيت"))
    }
    @Test fun mixedArabicEnglish() {
        assertEquals("nav.open", e.understand("open الملاحه")?.match?.command?.id ?: e.understand("افتح navigation")?.match?.command?.id)
    }
}

// المرحلة ٤ (المالك ٢٠٢٦-١١-١٠): العدّاد · الركن · الصيانة · البنزين · التقارير
class CarBookTest {
    private val day = 86_400_000L
    @Test fun odometerCalibration() {
        // «Oscar بيحسب ٩٨٬٩٠٠ والتابلوه ٩٠٬٠٠٠» ⇒ المرجع ٩٠٬٠٠٠ والـGPS بيكمّل عليه، والتاريخى مايتمسحش
        var o = Odometer().calibrate(0.0, 1).addGps(98_900.0)
        assertEquals(98_900.0, o.currentKm, 1e-9)
        o = o.calibrate(90_000.0, 5 * day)
        assertEquals(90_000.0, o.currentKm, 1e-9); assertEquals(98_900.0, o.gpsTotalKm, 1e-9)
        o = o.addGps(220.0)
        assertEquals(90_220.0, o.currentKm, 1e-9); assertEquals(5 * day, o.calibratedAtMs)
        assertEquals(90_000, OdoVoice.parse("خلي العداد ٩٠ ألف"))
        assertEquals(90_000, OdoVoice.parse("Set my odometer to 90,000 km"))
        assertNull(OdoVoice.parse("خلي الحد ٩٠"))
    }
    @Test fun parkingRecoverAfterPowerCut() {
        val park = ParkSpot(LAT0, LNG0, 1_000_000, 8f, 90_000)
        // آخر لقطة بعد الركنة وبعيدة ⇒ دى الركنة الجديدة (الشاشة فصلت قبل ما الرحلة تخلص)
        val fix = ParkSpot(north(500.0), LNG0, 2_000_000, 12f, 90_010)
        assertEquals(fix, Parking.recover(fix, park))
        // نفس المكان أو قديمة ⇒ لأ
        assertNull(Parking.recover(fix.copy(lat = north(10.0)), park))
        assertNull(Parking.recover(fix.copy(timeMs = 1_030_000), park))
        assertTrue(Parking.isApprox(fix.copy(accuracyM = 300f)))
        assertTrue(Parking.label(fix.copy(accuracyM = 300f), "من ساعة").contains("تقريبى ±300 م"))
        assertTrue(Parking.label(fix, "من ساعة").startsWith("آخر مكان معروف"))
    }
    @Test fun maintenanceByVoice() {
        assertEquals(MaintVoiceAction(listOf(MaintVoice.OIL), 5000), MaintVoice.parse("يا أوسكار غيرت الزيت ٥٠٠٠ كيلو"))
        assertEquals(MaintVoiceAction(listOf(MaintVoice.OIL), 3000), MaintVoice.parse("غيرت زيت 3000 كيلو"))
        assertEquals(listOf(MaintVoice.TIRES_FRONT, MaintVoice.TIRES_REAR), MaintVoice.parse("غيرت الأربع فرد")!!.items)
        assertEquals(listOf(MaintVoice.TIRES_FRONT), MaintVoice.parse("غيرت الكاوتش الأمامي")!!.items)
        assertEquals(listOf(MaintVoice.TIRES_REAR), MaintVoice.parse("غيرت الفردتين اللي ورا")!!.items)
        // «غيرت الكاوتش» من غير ما يقول أمامى/خلفى ⇒ مايفترضش الأربعة (يسأل)
        assertEquals(emptyList(), MaintVoice.parse("غيرت الكاوتش")!!.items)
        assertEquals(listOf(MaintVoice.OIL_FILTER), MaintVoice.parse("غيرت فلتر الزيت")!!.items)
        assertNull(MaintVoice.parse("سجل مطب"))
        assertEquals(10000 to 1000, Warranty.next(listOf(1000, 10000, 20000), setOf(1000), 9000))
    }
    @Test fun fuelPricesAndVoice() {
        val prices = listOf(PricePoint(Grade.G92, 0, 15.25), PricePoint(Grade.G92, 10 * day, 17.25), PricePoint(Grade.G95, 0, 19.0))
        assertEquals(15.25, FuelPrices.at(prices, Grade.G92, 5 * day)!!, 1e-9)    // التفويلة القديمة بسعرها القديم
        assertEquals(17.25, FuelPrices.at(prices, Grade.G92, 11 * day)!!, 1e-9)
        assertEquals(17.25, FuelPrices.current(prices, Grade.G92)!!, 1e-9)
        assertNull(FuelPrices.at(prices, Grade.G80, 11 * day))
        assertEquals(500.0 / 17.25, FuelBook.litersFor(500.0, 17.25), 1e-9)
        val a = FuelVoice.parse("يا أوسكار حطيت بنزين 92 بـ500 جنيه")!!
        assertEquals(Grade.G92, a.grade); assertEquals(500.0, a.amount); assertNull(a.liters)
        val b = FuelVoice.parse("I added 25 liters of gasoline 95")
        assertEquals(Grade.G95, b!!.grade); assertEquals(25.0, b.liters)
        assertEquals(true, FuelVoice.parse("فولت بنزين ٩٢ لآخرها")!!.full)
        assertNull(FuelVoice.parse("سجل مطب"))
    }
    @Test fun consumptionRemainingAndTrip() {
        val f = listOf(
            FillRec(1, 10_000, 40.0, 600.0, true, 0, Grade.G92),
            FillRec(2, 10_250, 15.0, 225.0, false, 1, Grade.G92),
            FillRec(3, 10_500, 20.0, 300.0, true, 2, Grade.G92),
        )
        assertEquals(7.0, FuelBook.consumption(f)!!, 1e-9)       // ٣٥ لتر / ٥٠٠ كم
        assertEquals(1.05, FuelBook.costPerKm(f)!!, 1e-9)
        assertNull(FuelBook.consumption(f.take(2)))               // مفيش بيانات كفاية ⇒ مايألّفش رقم
        // التانك ٤٥ لتر، مشيت ٢٠٠ كم من آخر فل على ٧ لتر/١٠٠ ⇒ ٤٥ − ١٤ = ٣١
        val r = FuelBook.remaining(f, 10_700.0, 45.0, 8.0)!!
        assertEquals(31.0, r.liters, 1e-9); assertFalse(r.rateIsEstimate)
        // من غير تفويلتين فل ⇒ الاستهلاك التقديرى ومكتوب كده
        val r2 = FuelBook.remaining(f.take(1), 10_100.0, 45.0, 10.0)!!
        assertEquals(35.0, r2.liters, 1e-9); assertTrue(r2.rateIsEstimate); assertTrue(r2.basis.contains("تقديرى"))
        assertNull(FuelBook.remaining(emptyList(), 10_000.0, 45.0, 8.0))
        // مثال المواصفات: ٣٠٠ كم على ١٠ لتر/١٠٠ ⇒ ٣٠ لتر، والفاضل ١٥ ⇒ فوّل الأول
        val t = FuelBook.trip(300.0, 10.0, false, 17.25, 15.0, odoUsed = 90_220.0)
        assertEquals(30.0, t.liters, 1e-9); assertTrue(t.refuel); assertEquals(517.5, t.cost!!, 1e-9)
        assertTrue(t.text.contains("90٬220"))
        assertFalse(FuelBook.trip(50.0, 10.0, false, null, 40.0).refuel)
    }
    @Test fun monthlyReport() {
        val ym = { ms: Long -> if (ms < 30 * day) "2026-10" else "2026-11" }
        val trips = listOf(TripRec(1, 12.5, 1800), TripRec(31 * day, 40.0, 3600), TripRec(32 * day, 10.0, 600))
        val fills = listOf(FillRec(1, 0, 20.0, 345.0, true, 31 * day, Grade.G92), FillRec(2, 0, 10.0, 190.0, false, 33 * day, Grade.G95))
        val m = Reports.monthly(trips, fills, listOf(31 * day), ym)
        assertEquals(listOf("2026-11", "2026-10"), m.map { it.ym })
        val nov = m.first()
        assertEquals(2, nov.trips); assertEquals(50.0, nov.km, 1e-9); assertEquals(70L, nov.drivingMin)
        assertEquals(535.0, nov.fuelPaid, 1e-9); assertEquals(mapOf("92" to 345.0, "95" to 190.0), nov.byGrade)
        assertEquals(1, nov.maintDone); assertEquals(10.7, nov.costPerKm!!, 1e-9)
    }
}

// المرحلة ٥ (المالك ٢٠٢٦-١١-١٠): التطبيقات · التذكيرات · المؤقّت · واتساب · الطقس
class AssistantTest {
    private val apps = listOf(InstalledApp("YouTube", "com.google.android.youtube"), InstalledApp("YouTube Music", "com.google.android.apps.youtube.music"),
        InstalledApp("Spotify", "com.spotify.music"), InstalledApp("ChatGPT", "com.openai.chatgpt"), InstalledApp("Claude", "com.anthropic.claude"),
        InstalledApp("Maps", "com.google.android.apps.maps"), InstalledApp("WhatsApp", "com.whatsapp"), InstalledApp("راديو", "com.car.radio"))
    @Test fun openAppsByArabicOrEnglishName() {
        assertEquals("com.spotify.music", AppNames.clearWinner(AppNames.match("سبوتيفاي", apps))?.pkg)
        assertEquals("com.openai.chatgpt", AppNames.clearWinner(AppNames.match("شات جي بي تي", apps))?.pkg)
        assertEquals("com.anthropic.claude", AppNames.clearWinner(AppNames.match("كلود", apps))?.pkg)
        assertEquals("com.google.android.apps.maps", AppNames.clearWinner(AppNames.match("خرايط جوجل", apps))?.pkg)
        assertEquals("com.whatsapp", AppNames.clearWinner(AppNames.match("الواتس", apps))?.pkg)
        assertEquals("com.car.radio", AppNames.clearWinner(AppNames.match("راديو", apps))?.pkg)
        // «يوتيوب» = YouTube بالظبط أوضح من YouTube Music
        assertEquals("com.google.android.youtube", AppNames.clearWinner(AppNames.match("يوتيوب", apps))?.pkg)
        assertTrue(AppNames.match("نتفليكس", apps).isEmpty())
    }
    @Test fun minutesInWords() {
        assertEquals(10, SpokenNumbers.minutes("١٠ دقايق")); assertEquals(5, SpokenNumbers.minutes("خمس دقايق"))
        assertEquals(15, SpokenNumbers.minutes("ربع ساعه")); assertEquals(30, SpokenNumbers.minutes("نص ساعة"))
        assertEquals(120, SpokenNumbers.minutes("ساعتين")); assertEquals(25, SpokenNumbers.minutes("خمسه وعشرين دقيقه"))
        assertEquals(5, TimerVoice.minutes("set a timer for 5 minutes")); assertEquals("1:05", TimerVoice.clock(65_000))
    }
    @Test fun reminders() {
        val tz = java.util.TimeZone.getTimeZone("Africa/Cairo")
        val cal = java.util.Calendar.getInstance(tz).apply { set(2026, 10, 10, 14, 0, 0); set(java.util.Calendar.MILLISECOND, 0) }
        val now = cal.timeInMillis
        // مثال المواصفات: «فكرنى وأنا راجع البيت أجيب الطلبات»
        assertEquals(NoteAction(NoteKind.REMIND, "أجيب الطلبات", place = "البيت"), NoteVoice.parse("فكرنى وأنا راجع البيت أجيب الطلبات", now, tz))
        assertEquals("البيت", NoteVoice.parse("فكرني لما اوصل للبيت اتصل بماما", now, tz)!!.place)
        assertEquals("الشغل", NoteVoice.parse("remind me when i get to work to call ahmed", now, tz)!!.place)
        assertEquals(now + 10 * 60_000, NoteVoice.parse("فكرني بعد ١٠ دقايق اشرب مية", now, tz)!!.dueMs)
        // «الساعه ٥» الساعة ٢ الضهر ⇒ ٥ العصر النهارده · «الساعه ٥ الصبح» ⇒ بكره
        val five = NoteVoice.parse("فكرني الساعه 5 اكلم الدكتور", now, tz)!!
        assertEquals(now + 3 * 3_600_000, five.dueMs); assertEquals("اكلم الدكتور", five.text)
        assertEquals(now + 15 * 3_600_000, NoteVoice.parse("فكرني الساعه 5 الصبح امشي", now, tz)!!.dueMs)
        assertEquals(now + 3 * 3_600_000 + 30 * 60_000, NoteVoice.parse("فكرني الساعه 5 ونص العصر اروح", now, tz)!!.dueMs)
        assertEquals(NoteAction(NoteKind.TASK, "اغير الزيت"), NoteVoice.parse("ضيف مهمه اغير الزيت", now, tz))
        assertEquals(NoteKind.NOTE, NoteVoice.parse("سجل ملاحظه الجراج بيقفل ١٢", now, tz)!!.kind)
        assertNull(NoteVoice.parse("سجل مطب", now, tz))
        val r = listOf(Reminder(1, "x", now - 1, null, null, null, false), Reminder(2, "y", null, LAT0, LNG0, "البيت", false))
        assertEquals(listOf(1L), Reminders.dueByTime(r, now).map { it.id })
        assertEquals(listOf(2L), Reminders.dueByPlace(r, north(200.0), LNG0).map { it.id })
        assertTrue(Reminders.dueByPlace(r, north(400.0), LNG0).isEmpty())
    }
    @Test fun whatsappDictation() {
        assertEquals(WaAction("احمد", "أنا جاى فى الطريق"), WaVoice.parse("ابعت لأحمد واتساب أنا جاى فى الطريق"))
        assertEquals(WaAction("ماما", "هتأخر نص ساعه"), WaVoice.parse("ابعت واتساب لماما هتأخر نص ساعه"))
        assertEquals("ahmed", WaVoice.parse("send whatsapp to ahmed saying i'm on my way")!!.name)
        val people = listOf(OscarContact(1, "أحمد", "01012345678"), OscarContact(2, "ماما", "01198765432"), OscarContact(3, "شوشو ماي لوف", "01234567890"))
        assertEquals(1L, WaVoice.contact("احمد", people)?.id)
        assertEquals(3L, WaVoice.contact("شوشو", people)?.id)
        assertNull(WaVoice.contact("كريم", people))
        assertEquals("201012345678", EgyptPhone.forWhatsApp("0101 234 5678"))
        assertEquals("201012345678", EgyptPhone.forWhatsApp("+20 101 234 5678"))
        assertEquals("201012345678", EgyptPhone.forWhatsApp("٠١٠١٢٣٤٥٦٧٨"))
        assertNull(EgyptPhone.forWhatsApp("123"))
    }
    @Test fun weather() {
        assertEquals("دلوقتى 24 درجة وصحو، العظمى النهارده 29 والصغرى 18، احتمال مطر 40٪",
            Weather.say(WeatherNow(23.6, 0, 10.0, 29.2, 17.8, 40)))
        assertTrue(Weather.describe(45).contains("شبورة"))
        assertTrue(Weather.url(30.04449, 31.23571).contains("latitude=30.04&longitude=31.24"))
    }
}

// المرحلة ٦ (المالك ٢٠٢٦-١١-١٠): الأماكن — حفظ بالصوت · الاسم القريب · الأماكن المتكررة · «أقرب …»
class PlacesTest {
    private val day = 86_400_000L
    private val now = 1_800_000_000_000L
    @Test fun savedNamesMatchLoosely() {
        val saved = listOf("الجيم", "بيت بابا", "النادي", "شغل مراتي")
        assertEquals("الجيم", PlaceNames.match(saved, "للجيم"))
        assertEquals("الجيم", PlaceNames.match(saved, "جيم"))
        assertEquals("بيت بابا", PlaceNames.match(saved, "لبيت بابا"))
        assertEquals("النادي", PlaceNames.match(saved, "على النادى"))
        assertEquals("بيت بابا", PlaceNames.match(saved, "بيت بابه"))   // التعرّف كتبها غلط
        assertNull(PlaceNames.match(saved, "محطه مصر"))
        assertEquals("الجيم", PlaceNames.tidy("باسم الجيم."))
    }
    @Test fun voiceSavesAndSearches() {
        val e = VoiceEngine()
        val s = e.understand("احفظ المكان ده باسم الجيم")!!
        assertEquals("place.save", s.match.command.id); assertEquals("الجيم", s.match.slot)
        assertEquals("place.save", e.understand("save this place as gym")!!.match.command.id)
        val n = e.understand("اقرب صيدليه")!!
        assertEquals("nav.near", n.match.command.id); assertEquals("pharmacy", Nearby.kindOf(n.match.slot!!)?.id)
        assertEquals("nav.fuel", e.understand("اقرب بنزينه")!!.match.command.id)   // الثابت بيغلب
        assertEquals("nav.goto", e.understand("وديني الجيم")!!.match.command.id)
    }
    @Test fun nearbyKinds() {
        assertEquals("atm", Nearby.kindOf("فين اقرب ATM")?.id)
        assertEquals("atm", Nearby.kindOf("مكنه فلوس")?.id)
        assertEquals("church", Nearby.kindOf("كنيسة")?.id)
        assertEquals("hospital", Nearby.kindOf("nearest hospital")?.id)
        assertEquals("tires", Nearby.kindOf("بنشر")?.id)
        assertNull(Nearby.kindOf("مشاكل"))          // «اكل» جوّه كلمة تانية مش مطعم
        val r = listOf(NearbyResult("بعيدة", north(900.0), LNG0), NearbyResult("قريبة", north(200.0), LNG0))
        assertEquals("قريبة", Nearby.nearest(r, LAT0, LNG0)?.name)
        assertFalse(Nearby.allowed(false, 0, 100))   // مقفول افتراضياً
        assertFalse(Nearby.allowed(true, 100, 100))  // الحد الشهرى
        assertTrue(Nearby.allowed(true, 99, 100))
    }
    @Test fun frequentStopsFromTripEnds() {
        val gym = (0 until 3).map { Visit(north(1000.0 + it * 20), LNG0, now - (it + 1) * day + 7 * 3_600_000L) }   // ٣ مرات فى أسبوع
        val once = listOf(Visit(north(5000.0), LNG0, now - day), Visit(north(5010.0), LNG0, now - 10 * day))       // مرتين بس
        val old = (0 until 4).map { Visit(north(9000.0), LNG0, now - (40 + it) * day) }                             // أقدم من ٤ أسابيع
        val f = FrequentPlaces.find(gym + once + old, emptyList(), emptyList(), now)
        assertEquals(1, f.size); assertEquals(3, f[0].visits); assertTrue(abs(f[0].lat - north(1020.0)) < 0.0002)
        assertEquals(17, f[0].usualHour); assertEquals("العصر", FrequentPlaces.partOfDay(17))   // ٣ العصر UTC = ٥ القاهرة
        // جنب مكان محفوظ أو اتقال عليه «مش مهم» ⇒ مايظهرش
        assertTrue(FrequentPlaces.find(gym, listOf(north(1050.0) to LNG0), emptyList(), now).isEmpty())
        assertTrue(FrequentPlaces.find(gym, emptyList(), listOf(north(1000.0) to LNG0), now).isEmpty())
    }
}

// المرحلة ٧ (المالك ٢٠٢٦-١١-١٠): سلوك القيادة + أوسكار مايقاطعش
class DrivingTest {
    @Test fun harshBrakeAndAccelFromGpsSpeed() {
        val d = HarshDetector()
        // ماشى ٨٠ ثابت ⇒ مفيش حاجة
        for (i in 0..5) assertNull(d.onFix(i * 1000L, 80f, 5f))
        // فرملة: ٨٠ ⇒ ٤٠ فى ٣ ثوانى = −٣٫٧ م/ث²
        assertNull(d.onFix(6000, 70f, 5f)); assertNull(d.onFix(7000, 55f, 5f))
        assertEquals(HarshType.BRAKE, d.onFix(8000, 40f, 5f))
        // نفس الفرملة مابتتعدّش تانى
        assertNull(d.onFix(9000, 30f, 5f)); assertNull(d.onFix(10000, 20f, 5f))
        assertEquals(1, d.brakes)
        // تسارع: ٢٠ ⇒ ٥٥ فى ٣ ثوانى = +٣٫٢ م/ث² (بعد ٦ ثوانى من آخر حدث)
        for (t in listOf(14000L, 15000L)) d.onFix(t, 20f, 5f)
        assertNull(d.onFix(16000, 32f, 5f))
        assertEquals(HarshType.ACCEL, d.onFix(17000, 44f, 5f)); assertEquals(1, d.accels)   // ٢٠ ⇒ ٤٤ فى ثانيتين = +٣٫٣ م/ث²
    }
    @Test fun gpsNoiseIsIgnored() {
        val d = HarshDetector()
        d.onFix(0, 60f, 5f)
        assertNull(d.onFix(1000, 20f, 5f))           // أقل من ثانيتين = مفيش مرجع ⇒ مابنحكمش من قراءتين ورا بعض
        val n = HarshDetector()
        n.onFix(0, 90f, 5f); n.onFix(1000, 90f, 5f)
        assertNull(n.onFix(2000, 10f, 5f))           // −١١ م/ث² = قراءة غلط
        val slow = HarshDetector()
        slow.onFix(0, 15f, 5f); slow.onFix(1000, 15f, 5f)
        assertNull(slow.onFix(3000, 0f, 5f))         // وقفة فى الزحمة من ١٥ كم/س مش فرملة خطر
        val bad = HarshDetector()
        bad.onFix(0, 80f, 60f); assertNull(bad.onFix(3000, 30f, 60f))   // دقة وحشة
    }
    @Test fun tripScore() {
        assertEquals(100, DrivingScore.score(TripBehavior(12.0, 0, 0, 0, 0)))
        assertEquals("رحلة هادية — كمّل كده", DrivingScore.tip(TripBehavior(12.0, 0, 0, 0, 0)))
        // رحلة ٥ كم فيها فرملتين ⇒ ٨٨
        assertEquals(88, DrivingScore.score(TripBehavior(5.0, 2, 0, 0, 0)))
        // نفس الفرملتين فى ٤٠ كم ⇒ ٩٧
        assertEquals(97, DrivingScore.score(TripBehavior(40.0, 2, 0, 0, 0)))
        // تجاوزين ٩٠ ثانية فى ١٠ كم ⇒ ١٠٠ − ١٠ − ٦ = ٨٤ ، والنصيحة عن السرعة
        val b = TripBehavior(10.0, 0, 1, 2, 90)
        assertEquals(80, DrivingScore.score(b)); assertTrue(DrivingScore.tip(b).contains("الحد"))
        assertEquals("خطر", DrivingScore.label(40))
        assertTrue(DrivingScore.summary(b).startsWith("درجة الرحلة 80/100 (كويسة)"))
    }
    @Test fun monthlyAverageWeightedByKm() {
        val ym = { ms: Long -> if (ms < 100) "2026-10" else "2026-11" }
        val m = DrivingMonths.monthly(listOf(ScoredTrip(200, 50.0, 90, 1, 0, 0), ScoredTrip(300, 2.0, 40, 2, 1, 1), ScoredTrip(10, 5.0, 100, 0, 0, 0)), ym)
        assertEquals("2026-11", m[0].ym); assertEquals(88, m[0].avgScore); assertEquals(3, m[0].brakes); assertEquals(40, m[0].worst)
        assertEquals(100, m[1].avgScore)
    }
    @Test fun oscarDoesNotInterrupt() {
        assertEquals(SpeechDecision.SPEAK, Etiquette.decide(SpeechKind.SAFETY, inCall = true))
        assertEquals(SpeechDecision.SPEAK, Etiquette.decide(SpeechKind.ANSWER, inCall = true))
        assertEquals(SpeechDecision.WAIT, Etiquette.decide(SpeechKind.INFO, inCall = true))
        assertEquals(SpeechDecision.DROP, Etiquette.decide(SpeechKind.CHATTER, inCall = true))
        assertEquals(SpeechDecision.DROP, Etiquette.decide(SpeechKind.MESSAGE, inCall = true))
        assertEquals(SpeechDecision.SPEAK, Etiquette.decide(SpeechKind.CHATTER, inCall = false))
        val long = "النهارده الجو مشمس ودرجة الحرارة ٢٤، العظمى ٢٩ والصغرى ١٨، واحتمال المطر ٤٠٪ — خلّى بالك من الشبورة الصبح بدرى على الطريق الصحراوى"
        assertEquals("النهارده الجو مشمس ودرجة الحرارة ٢٤", Etiquette.brief(long, busy = true))
        assertEquals(long, Etiquette.brief(long, busy = false))
        assertEquals("الساعة ٥", Etiquette.brief("الساعة ٥", busy = true))
        assertEquals("drive.score", VoiceEngine().understand("سواقتى عاملة إزاى")!!.match.command.id)
        assertEquals("drive.score", VoiceEngine().understand("how is my driving")!!.match.command.id)
    }
}

class ShotPlanTest {
    @Test fun snapsAt80_50_25_thenStops() {
        val p = ShotPlan(7, 0)
        val got = listOf(140.0, 100.0, 79.0, 70.0, 49.0, 30.0, 24.0, 10.0).map { p.onDistance(it, 1_000) }
        assertEquals(listOf(false, false, true, false, true, false, true, false), got)
        assertTrue(p.done)
    }
    @Test fun oneShotWhenGpsJumpsOverTwoMarks() {
        val p = ShotPlan(1, 0)
        assertTrue(p.onDistance(45.0, 1_000))     // ٨٠ و٥٠ فى قراية واحدة ⇒ صورة واحدة
        assertFalse(p.onDistance(40.0, 2_000))
        assertTrue(p.onDistance(20.0, 3_000))
    }
    @Test fun stopsAfterPassingOrTimeout() {
        val a = ShotPlan(1, 0)
        assertTrue(a.onDistance(60.0, 1_000))
        assertTrue(a.onDistance(40.0, 2_000))
        assertFalse(a.onDistance(65.0, 3_000)); assertTrue(a.done)   // عدّاه/لفّ ⇒ خلاص
        val b = ShotPlan(1, 0)
        assertFalse(b.onDistance(70.0, ShotPlan.MAX_MS + 1)); assertTrue(b.done)
        assertTrue(ShotPlan.wants(HazardType.BUMP)); assertTrue(ShotPlan.wants(HazardType.POTHOLE)); assertFalse(ShotPlan.wants(HazardType.RADAR))
    }
}

// المرحلة ٢: الموبايل فى العربية ولا لأ — درجة ثقة مستمرة، والمتوصّل مايتعرضش كمصدر غير لما يبقى موثوق
class CompanionTrackerTest {
    private fun fix(lat: Double, sp: Float? = 11f, hd: Float? = 0f, age: Long = 1000) =
        CompanionFix(1, "iPhone", lat, LNG0, 6f, sp, hd, age)
    @Test fun trustedAfterAbout15sOfMatchingMovement() {
        val t = CompanionTracker(); var st = emptyList<CompanionTracker.Status>()
        repeat(6) { st = t.update(listOf(fix(north(3.0))), LAT0, LNG0, 5f, 40f, 0f) }
        assertFalse(st[0].trusted)
        assertEquals("📡 1 موبايل بيشارك — لسه بنتأكد إنه فى العربية", CompanionTracker.summary(st, true))
        st = t.update(listOf(fix(north(3.0))), LAT0, LNG0, 5f, 40f, 0f)
        assertTrue(st[0].trusted)
        assertEquals("📡 الشاشة + 1 موبايل (أدق موبايل 6 م)", CompanionTracker.summary(st, true))
    }
    @Test fun phoneLeftAtHomeLosesTrustFast() {
        val t = CompanionTracker(); var st = emptyList<CompanionTracker.Status>()
        repeat(10) { st = t.update(listOf(fix(north(3.0))), LAT0, LNG0, 5f, 40f, 0f) }
        assertTrue(st[0].trusted)
        st = t.update(listOf(fix(north(500.0), sp = 0f)), LAT0, LNG0, 5f, 40f, 0f)   // العربية مشيت والموبايل فاضل مكانه
        assertFalse(st[0].trusted)
    }
    @Test fun parkedProvesNothingAndStaleDecays() {
        val t = CompanionTracker(); var st = emptyList<CompanionTracker.Status>()
        repeat(20) { st = t.update(listOf(fix(north(3.0), sp = 0f)), LAT0, LNG0, 5f, 0f, 0f) }
        assertEquals(0, st[0].score)                         // واقفين جنب بعض ⇒ مش دليل
        st = t.update(listOf(fix(north(3.0), age = 30_000)), LAT0, LNG0, 5f, 40f, 0f)
        assertFalse(st[0].fresh)
        assertEquals("📡 موبايل متوصّل بس الـGPS بتاعه قديم", CompanionTracker.summary(st, true))
        assertEquals("📡 GPS الشاشة بس", CompanionTracker.summary(emptyList(), true))
        assertEquals("📡 مفيش GPS", CompanionTracker.summary(emptyList(), false))
    }
    // الخطوة ٣: الدمج من الموثوق بس، ومش متوسط أعمى
    @Test fun fuseOnlyTrustedAndNotBlindly() {
        fun st(lat: Double, acc: Float, trusted: Boolean = true) =
            CompanionTracker.Status(1, "iPhone", if (trusted) 9 else 3, trusted, true, acc, 1, 5.0, lat, LNG0, 40f, 0f)
        // مفيش موبايل موثوق ⇒ الشاشة
        assertEquals("الشاشة", CompanionTracker.fuse(LAT0, LNG0, 8f, listOf(st(north(4.0), 4f, trusted = false)))!!.source)
        // قريبين فى حدود الدقة ⇒ دمج، والدقة أحسن من الاتنين
        val m = CompanionTracker.fuse(LAT0, LNG0, 8f, listOf(st(north(6.0), 4f)))!!
        assertEquals("دمج", m.source); assertTrue(m.accM < 4f); assertTrue(m.lat > LAT0 && m.lat < north(6.0))
        // مختلفين: الموبايل أدق بوضوح ⇒ الموبايل · مش أدق بوضوح ⇒ الشاشة
        assertEquals("الموبايل", CompanionTracker.fuse(LAT0, LNG0, 30f, listOf(st(north(60.0), 5f)))!!.source)
        assertEquals("الشاشة", CompanionTracker.fuse(LAT0, LNG0, 8f, listOf(st(north(60.0), 6f)))!!.source)
        // الشاشة مالهاش GPS ⇒ الموبايل الموثوق · مفيش حاجة ⇒ null
        assertEquals("الموبايل", CompanionTracker.fuse(null, null, null, listOf(st(north(6.0), 6f)))!!.source)
        assertNull(CompanionTracker.fuse(null, null, null, emptyList()))
    }
    @Test fun wrongDirectionOrSpeedDoesNotBuildTrust() {
        val t = CompanionTracker(); var st = emptyList<CompanionTracker.Status>()
        repeat(10) { st = t.update(listOf(fix(north(3.0), hd = 180f)), LAT0, LNG0, 5f, 40f, 0f) }
        assertFalse(st[0].trusted)
    }
}

// «أقرب بنزينة» جوه التطبيق من OpenStreetMap — المكان متقرّب لـ١ كم، والنتايج من العقد والمبانى
class OsmNearbyTest {
    @Test fun queryRoundsLocationAndUsesTheRightTags() {
        val q = OsmNearby.query("fuel", 27.18234, 31.18678)!!
        assertTrue(q.contains("nwr[amenity=fuel](around:5000,27.18,31.19);"))
        assertFalse(q.contains("27.182"))
        assertTrue(OsmNearby.query("atm", 27.0, 31.0)!!.contains("[amenity=bank][atm=yes]"))
        assertNull(OsmNearby.query("unknown", 27.0, 31.0))
    }
    @Test fun parseNodesAndWaysAndArabicName() {
        val json = """{"elements":[
          {"type":"node","lat":27.1,"lon":31.1,"tags":{"name":"Wataniya","name:ar":"وطنية"}},
          {"type":"way","center":{"lat":27.2,"lon":31.2},"tags":{"brand":"Mobil"}},
          {"type":"node","lat":27.3,"lon":31.3}]}"""
        val r = OsmNearby.parse(json, "بنزينة")
        assertEquals(listOf("وطنية", "Mobil", "بنزينة"), r.map { it.name })
        assertEquals(27.2, r[1].lat)
    }
}

// المالك ٢٠٢٦-١١-١٨: «أقوله دوّر على أقرب بنزينة يفتح على أقرب بنزينة ويضغط بدء مباشرة»
class FuelVoiceTest {
    @Test fun findNearestFuelPhrases() {
        val e = VoiceEngine()
        for (p in listOf("دور على اقرب بنزينه", "دوّر على أقرب بنزينة", "عاوز بنزين", "فين بنزينه"))
            assertEquals("nav.fuel", e.understand(p)?.match?.command?.id, p)
    }
}

class InboxPlanTest {
    private val now = 1_763_400_000_000L
    private fun j(s: String) = org.json.JSONObject(s)
    @Test fun placeTaskNoteFill() {
        assertEquals(InboxStep.Place("البيت", 27.1, 31.2), InboxPlan.plan("place", j("""{"name":"باسم البيت","lat":27.1,"lng":31.2}"""), now))
        assertEquals(InboxStep.Skip, InboxPlan.plan("place", j("""{"name":"البيت"}"""), now))
        assertEquals(InboxStep.Note("task", "أغيّر الزيت"), InboxPlan.plan("task", j("""{"text":" أغيّر الزيت "}"""), now))
        assertEquals(InboxStep.Fill(30.0, 600.0, true, "92", null), InboxPlan.plan("fill", j("""{"liters":30,"paid":600,"full":true,"grade":"92","odo":null}"""), now))
        assertEquals(InboxStep.Fill(10.0, 0.0, false, null, 52000), InboxPlan.plan("fill", j("""{"liters":10,"grade":"99","odo":52000}"""), now))
        assertEquals(InboxStep.Skip, InboxPlan.plan("hack", j("{}"), now))
    }
    @Test fun remindUsesTimeOrPlaceElseVoiceElseTask() {
        assertEquals(InboxStep.Note("remind", "أكلم ماما", now + 60_000), InboxPlan.plan("remind", j("""{"text":"أكلم ماما","dueMs":${now + 60_000}}"""), now))
        assertEquals(InboxStep.Note("remind", "الورق", null, "الشغل"), InboxPlan.plan("remind", j("""{"text":"الورق","place":"الشغل"}"""), now))
        val v = InboxPlan.plan("remind", j("""{"text":"فكرنى بعد 20 دقيقة اكلم ماما"}"""), now) as InboxStep.Note
        assertEquals("remind", v.kind); assertEquals(now + 20 * 60_000, v.dueMs)
        assertEquals(InboxStep.Note("task", "اشترى عيش"), InboxPlan.plan("remind", j("""{"text":"اشترى عيش"}"""), now))
    }
}

class GpsStatsTest {
    @Test fun ratesAndAccuracyInTheLastMinute() {
        val g = GpsStats()
        assertEquals(0, g.summary(0).fixes)
        for (i in 0 until 60) g.add(i * 1000L, if (i < 54) 5f else 50f)   // ٦٠ قراءة فى دقيقة، ٦ وحشين
        val s = g.summary(59_000)
        assertEquals(60, s.fixes)
        assertTrue(abs(s.perSec - 60 / 59.0) < 0.01)
        assertEquals(9.5, s.avgAccM!!, 0.001)
        assertEquals(50.0, s.p90AccM!!, 0.001)
        g.add(200_000, null)   // بعد دقايق: القديم بيتشال
        assertEquals(1, g.summary(200_000).fixes); assertNull(g.summary(200_000).avgAccM)
    }
}

class OsmSearchTest {
    @Test fun urlRoundsLocationAndParsesResults() {
        val u = OsmSearch.url("نادى الشمس", 27.18234, 31.18678)
        assertTrue(u.startsWith("https://nominatim.openstreetmap.org/search?format=jsonv2"))
        assertTrue(u.contains("countrycodes=eg")); assertTrue(u.contains("viewbox=30.69,27.68,31.69,26.68"))
        assertFalse(u.contains("27.182")); assertFalse(OsmSearch.url("x", null, null).contains("viewbox"))
        val r = OsmSearch.parse("""[{"lat":"27.2","lon":"31.2","name":"نادى الشمس","display_name":"نادى الشمس, أسيوط"},
            {"lat":"27.3","lon":"31.3","name":"","display_name":"شارع الجمهورية, أسيوط"},{"lat":"x","lon":"1"}]""")
        assertEquals(listOf("نادى الشمس", "شارع الجمهورية"), r.map { it.name })
        assertTrue(OsmSearch.parse("not json").isEmpty())
    }
}
