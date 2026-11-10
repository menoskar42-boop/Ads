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
