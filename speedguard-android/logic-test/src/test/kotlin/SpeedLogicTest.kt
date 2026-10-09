import com.oscardevs.speedguard.SpeedLogic
import com.oscardevs.speedguard.SpeedLogic.Event
import kotlin.test.*

class SpeedLogicTest {
    private fun drive(l: SpeedLogic, speedsKmh: List<Float?>, limit: Int, t0: Long = 1_000_000L, acc: Float = 5f): List<Event> {
        val out = mutableListOf<Event>()
        speedsKmh.forEachIndexed { i, s ->
            out += l.onFix(SpeedLogic.Fix(t0 + i * 1000L, s?.div(3.6f), 27.18 + i * 1e-4, 31.18, acc), limit)
        }
        return out
    }

    @Test fun noAlertUnderLimit() {
        val l = SpeedLogic()
        assertTrue(drive(l, List(20) { 78f }, 80).isEmpty())
        assertEquals(78, l.speedKmh!!.toInt())
    }

    @Test fun reachingTheLimitAlerts() {
        // «لما يوصل لسرعة معينة»: الحد ٨٠ ⇒ ٨٠ بالظبط بتنبّه، و٧٩ لأ
        assertTrue(drive(SpeedLogic(), List(5) { 79f }, 80).isEmpty())
        val ev = drive(SpeedLogic(), List(5) { 80f }, 80)
        assertEquals(80, ev.filterIsInstance<Event.Alert>().first().speedKmh)
    }

    @Test fun singleSpikeDoesNotAlert() {
        val l = SpeedLogic()
        assertTrue(drive(l, listOf(70f, 70f, 120f, 70f, 70f), 80).isEmpty())
    }

    @Test fun sustainedOverAlertsOnceThenRepeatsEvery10s() {
        val l = SpeedLogic()
        val ev = drive(l, List(25) { 95f }, 80)
        val alerts = ev.filterIsInstance<Event.Alert>()
        assertTrue(alerts.first().first)
        assertEquals(95, alerts.first().speedKmh)
        assertEquals(3, alerts.size)   // ثانية ~2، ثم كل ١٠ ثوانى (12، 22)
        assertTrue(l.inViolation)
    }

    @Test fun violationEndsWithHysteresisAndIsRecorded() {
        val l = SpeedLogic()
        val ev = drive(l, List(10) { 92f } + listOf(79f, 79f, 79f) + List(5) { 70f }, 80)
        // 79 = فوق (الحد - ٢) ⇒ لسه جوّه التجاوز؛ 70 ×٣ ⇒ يقفل
        val ended = ev.filterIsInstance<Event.ViolationEnded>()
        assertEquals(1, ended.size)
        val v = ended[0].v
        assertEquals(92f, v.maxSpeedKmh)
        assertEquals(80, v.limitKmh)
        assertTrue(v.durationS in 9..13, "duration ${v.durationS}")
        assertFalse(l.inViolation)
    }

    @Test fun shortBlipUnder3sIsNotRecorded() {
        val l = SpeedLogic()
        val ev = drive(l, listOf(85f, 85f, 70f, 70f, 70f, 70f), 80)
        assertTrue(ev.any { it is Event.Alert })
        assertTrue(ev.none { it is Event.ViolationEnded })
    }

    @Test fun gpsLossClosesOpenViolation() {
        val l = SpeedLogic()
        drive(l, List(8) { 100f }, 80)
        assertTrue(l.inViolation)
        val ev = l.onTick(1_000_000L + 7_000 + 20_000)
        assertNull(l.speedKmh)
        assertEquals(1, ev.filterIsInstance<Event.ViolationEnded>().size)
    }

    @Test fun poorAccuracyIgnoredForAlerts() {
        val l = SpeedLogic()
        assertTrue(drive(l, List(10) { 120f }, 80, acc = 80f).isEmpty())
    }

    @Test fun standstillShowsZero() {
        val l = SpeedLogic()
        drive(l, listOf(1.2f), 80)
        assertEquals(0f, l.speedKmh)
    }

    @Test fun fallbackDistanceOverTime() {
        val l = SpeedLogic()
        // مفيش Doppler: ٢٧.٧٨ م فى الثانية شمال = ١٠٠ كم/س
        val dLat = 27.78 / 111_195.0
        l.onFix(SpeedLogic.Fix(0, null, 30.0, 31.0, 5f), 80)
        l.onFix(SpeedLogic.Fix(1000, null, 30.0 + dLat, 31.0, 5f), 80)
        assertEquals(100, Math.round(l.speedKmh!!))
    }
}
