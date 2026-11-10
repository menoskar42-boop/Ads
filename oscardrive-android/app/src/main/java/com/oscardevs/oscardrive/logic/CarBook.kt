package com.oscardevs.oscardrive.logic

import kotlin.math.max
import kotlin.math.roundToInt

/*
 * المرحلة ٤ من خطة Oscar Drive (المالك ٢٠٢٦-١١-١٠: «كمل المرحله الرابعه») — مواصفات بند ١٦ §١–٥ و§٧:
 * العدّاد بالمعايرة · الركن · الصيانة (كاوتش أمامى/خلفى · ضمان · بالصوت) · البنزين (٨٠/٩٢/٩٥ بالفلوس أو باللتر ·
 * الفاضل · تكلفة المشوار) · التقارير. كله Kotlin صافى (بيتختبر على الكمبيوتر) — والشاشة بتحفظ وتعرض بس.
 * القاعدة فى كل حتة: **التقدير مكتوب إنه تقدير**، ومفيش رقم بيتألّف لما البيانات مش كفاية.
 */

/* ───────── العدّاد ───────── */

/**
 * العدّاد: آخر رقم كتبته إنت من التابلوه (المرجع) + الكيلومترات اللى الـGPS حسبها بعده.
 * كيلومترات الـGPS متسجّلة لوحدها (`gpsTotalKm`) ومابتتمسحش لما تعاير.
 */
data class Odometer(
    val calibratedKm: Double = 0.0,
    val calibratedAtMs: Long = 0,
    val gpsSinceCalKm: Double = 0.0,
    val gpsTotalKm: Double = 0.0,
) {
    val currentKm: Double get() = calibratedKm + gpsSinceCalKm
    val isSet: Boolean get() = calibratedAtMs > 0 || calibratedKm > 0

    fun addGps(km: Double): Odometer = if (km <= 0) this else copy(gpsSinceCalKm = gpsSinceCalKm + km, gpsTotalKm = gpsTotalKm + km)

    /** «خلّى العدّاد ٩٠ ألف» — الرقم ده المرجع الجديد، والـGPS بيكمّل عليه. */
    fun calibrate(km: Double, nowMs: Long): Odometer = copy(calibratedKm = max(0.0, km), calibratedAtMs = nowMs, gpsSinceCalKm = 0.0)

    /** للعرض: «٩٠٬٢٢٠ كم (٩٠٬٠٠٠ من التابلوه يوم … + ٢٢٠ من الـGPS)». */
    fun explain(dateOf: (Long) -> String): String =
        if (!isSet) "العدّاد لسه ماتكتبش — اكتبه من التابلوه مرة"
        else "${fmtKm(currentKm)} كم (${fmtKm(calibratedKm)} من التابلوه ${dateOf(calibratedAtMs)} + ${fmtKm(gpsSinceCalKm)} من الـGPS — تقريبى)"

    companion object {
        fun fmtKm(km: Double): String = "%,d".format(java.util.Locale.US, km.roundToInt()).replace(',', '٬')
    }
}

/** «خلّى العدّاد ٩٠ ألف» · «العداد 90000» · "set my odometer to 90,000" ⇐ ٩٠٠٠٠. */
object OdoVoice {
    fun parse(text: String): Int? {
        val t = VoiceEngine.normalize(text.replace(Regex("(\\d)[,٬](\\d)"), "$1$2"))
        if (!(t.contains("عداد") || t.contains("odometer") || t.contains("odo"))) return null
        Regex("(\\d{3,7})").find(t)?.let { return it.value.toInt() }
        Regex("(\\d{1,3})\\s*(?:الف|ألف|k|thousand)").find(t)?.let { return it.groupValues[1].toInt() * 1000 }
        return null
    }
}

/* ───────── الركن ───────── */

data class ParkSpot(val lat: Double, val lng: Double, val timeMs: Long, val accuracyM: Float?, val odoKm: Int?, val note: String = "")

object Parking {
    /** دقة أسوأ من كده ⇒ «مكان تقريبى». */
    const val APPROX_M = 50f
    /** نفس المكان تقريباً ⇒ مانكرّرش الركنة. */
    const val SAME_M = 30.0

    fun isApprox(p: ParkSpot) = p.accuracyM == null || p.accuracyM > APPROX_M

    /**
     * الشاشة بتفصل مع العربية فجأة. آخر لقطة GPS اتحفظت (`lastFix`) ⇐ لو أحدث من آخر ركنة وبعيدة عنها،
     * تبقى هى مكان الركنة (اتحفظ أول ما الشاشة تفتح تانى).
     */
    fun recover(lastFix: ParkSpot?, lastPark: ParkSpot?): ParkSpot? {
        val f = lastFix ?: return null
        if (lastPark == null) return f
        if (f.timeMs <= lastPark.timeMs + 60_000) return null
        if (Geo.distanceM(f.lat, f.lng, lastPark.lat, lastPark.lng) <= SAME_M) return null
        return f
    }

    /** للموبايل والشاشة: «آخر مكان معروف» دايماً — مش «مباشر». */
    fun label(p: ParkSpot, ago: String): String =
        "آخر مكان معروف للعربية — اتسجّل $ago" + if (isApprox(p)) " · تقريبى${p.accuracyM?.let { " ±${it.roundToInt()} م" } ?: ""}" else ""
}

/* ───────── الصيانة بالصوت ───────── */

/** «غيرت الزيت ٥٠٠٠ كيلو» ⇐ بنود اتعملت + كل كام كيلو (لو اتقال). */
data class MaintVoiceAction(val items: List<String>, val everyKm: Int? = null)

object MaintVoice {
    const val OIL = "زيت الموتور"
    const val OIL_FILTER = "فلتر الزيت"
    const val AIR_FILTER = "فلتر الهوا"
    const val FUEL_FILTER = "فلتر البنزين"
    const val TIRES_FRONT = "كاوتش أمامى"
    const val TIRES_REAR = "كاوتش خلفى"
    const val BATTERY = "البطارية"

    fun parse(text: String): MaintVoiceAction? {
        val t = " " + VoiceEngine.normalize(text) + " "
        if (!Regex(" (?:غيرت|غيرنا|ركبت|اتغير|اتغيرت|changed|replaced) ").containsMatchIn(t)) return null
        val km = Regex("(\\d{3,6})\\s*(?:كيلو|كم|km)?").find(t)?.groupValues?.get(1)?.toIntOrNull()
        val items = mutableListOf<String>()
        val tires = t.contains("كاوتش") || t.contains("فرد") || t.contains("فردتين") || t.contains("tire") || t.contains("tyre")
        if (tires) {
            val front = Regex("امامي|قدام|الاماميه|front").containsMatchIn(t)
            val rear = Regex("خلفي|ورا|اللي ورا|rear|back").containsMatchIn(t)
            val all = Regex("الاربع|اربع|اربعه|كله|all|four").containsMatchIn(t)
            when {
                all || (front && rear) -> { items += TIRES_FRONT; items += TIRES_REAR }
                front -> items += TIRES_FRONT
                rear -> items += TIRES_REAR
                else -> return MaintVoiceAction(emptyList())   // ⇐ يسأل: أمامى ولا خلفى ولا الأربعة؟ (مايفترضش الأربعة)
            }
        }
        if (t.contains("فلتر زيت") || t.contains("فلتر الزيت") || t.contains("oil filter")) items += OIL_FILTER
        else if (t.contains(" زيت") || t.contains(" الزيت") || t.contains(" oil")) items += OIL
        if (t.contains("فلتر الهوا") || t.contains("فلتر هوا") || t.contains("air filter")) items += AIR_FILTER
        if (t.contains("فلتر البنزين") || t.contains("فلتر بنزين") || t.contains("fuel filter")) items += FUEL_FILTER
        if (t.contains("بطاريه") || t.contains("battery")) items += BATTERY
        if (items.isEmpty() && !tires) return null
        return MaintVoiceAction(items.distinct(), km?.takeIf { items == listOf(OIL) && it in 1000..20000 })
    }
}

/** وضع الضمان: مواعيد الوكيل بالكيلو (إنت اللى بتكتبها — كل شركة غير التانية). */
object Warranty {
    /** أمثلة شائعة بس — مش مواصفات أى شركة، وبتتعدّل. */
    val EXAMPLE = listOf(1000, 5000, 10000, 20000, 30000, 40000)

    /** أول ميعاد ماتعملش ⇐ (الكيلو · فاضل كام). */
    fun next(milestones: List<Int>, done: Set<Int>, odoKm: Int): Pair<Int, Int>? =
        milestones.sorted().firstOrNull { it !in done }?.let { it to (it - odoKm) }
}

/* ───────── البنزين ───────── */

enum class Grade(val key: String, val ar: String) {
    G80("80", "بنزين ٨٠"), G92("92", "بنزين ٩٢"), G95("95", "بنزين ٩٥");
    companion object { fun of(k: String?): Grade? = entries.firstOrNull { it.key == k } }
}

/** سعر اللتر من تاريخ معيّن — الأسعار القديمة بتفضل للتفويلات القديمة. */
data class PricePoint(val grade: Grade, val fromMs: Long, val perLiter: Double)

object FuelPrices {
    fun at(points: List<PricePoint>, grade: Grade, timeMs: Long): Double? =
        points.filter { it.grade == grade && it.fromMs <= timeMs }.maxByOrNull { it.fromMs }?.perLiter

    fun current(points: List<PricePoint>, grade: Grade): Double? =
        points.filter { it.grade == grade }.maxByOrNull { it.fromMs }?.perLiter
}

/** «حطيت بنزين ٩٢ بـ٥٠٠ جنيه» · «حطيت ٢٥ لتر ٩٥» · «فولت» (لآخرها). */
data class FuelVoiceAction(val grade: Grade?, val amount: Double?, val liters: Double?, val full: Boolean?)

object FuelVoice {
    fun parse(text: String): FuelVoiceAction? {
        val t = " " + VoiceEngine.normalize(text) + " "
        val isFuel = Regex(" (?:حطيت|فولت|موّنت|مونت|زودت|added|filled|fueled) ").containsMatchIn(t) &&
            (t.contains("بنزين") || t.contains("فولت") || t.contains("لتر") || t.contains("جنيه") || t.contains("gas") || t.contains("liter") || t.contains("fuel"))
        if (!isFuel) return null
        val grade = when {
            Regex("(?:^|\\D)95(?:\\D|$)|خمسه وتسعين").containsMatchIn(t) -> Grade.G95
            Regex("(?:^|\\D)92(?:\\D|$)|اتنين وتسعين|اثنين وتسعين").containsMatchIn(t) -> Grade.G92
            Regex("(?:^|\\D)80(?:\\D|$)|تمانين|ثمانين").containsMatchIn(t) -> Grade.G80
            else -> null
        }
        val liters = Regex("(\\d+(?:\\.\\d+)?)\\s*(?:لتر|litre|liter|l )").find(t)?.groupValues?.get(1)?.toDoubleOrNull()
        val amount = Regex("(?:ب|بـ|by |for )\\s*(\\d+(?:\\.\\d+)?)|(\\d+(?:\\.\\d+)?)\\s*(?:جنيه|ج |pound|egp)").find(t)?.let {
            (it.groupValues[1].ifEmpty { it.groupValues[2] }).toDoubleOrNull()
        }?.takeIf { it != grade?.key?.toDouble() }
        val full = when {
            Regex("لاخرها|للاخر|فل تانك|تانك كامل|full|فولت").containsMatchIn(t) -> true
            Regex("جزء|شويه|نص تانك|partial").containsMatchIn(t) -> false
            else -> null
        }
        return FuelVoiceAction(grade, amount, liters, full)
    }
}

/** تفويلة (الجديدة): النوع + اللى دفعته + سعر اللتر وقتها. القديمة (من غير نوع) بتفضل شغّالة. */
data class FillRec(
    val id: Long, val odoKm: Int, val liters: Double, val paid: Double, val full: Boolean, val timeMs: Long,
    val grade: Grade? = null, val perLiter: Double? = null,
)

object FuelBook {
    /** لتر = المبلغ ÷ سعر اللتر. */
    fun litersFor(amount: Double, perLiter: Double): Double = if (perLiter > 0) amount / perLiter else 0.0

    private fun window(fills: List<FillRec>): Pair<List<FillRec>, Int>? {
        val s = fills.sortedBy { it.odoKm }
        val fulls = s.withIndex().filter { it.value.full }
        if (fulls.size < 2) return null
        val a = fulls[fulls.size - 2]; val b = fulls.last()
        val km = b.value.odoKm - a.value.odoKm
        if (km <= 0) return null
        return s.subList(a.index + 1, b.index + 1) to km
    }

    /** الاستهلاك الحقيقى «من فل لفل» (لتر/١٠٠ كم) — null لو مفيش تفويلتين لآخرها. */
    fun consumption(fills: List<FillRec>): Double? = window(fills)?.let { (w, km) -> w.sumOf { it.liters } / km * 100 }

    fun costPerKm(fills: List<FillRec>): Double? = window(fills)?.let { (w, km) -> w.sumOf { it.paid } / km }

    /** متوسط كل الفترات «من فل لفل» (التاريخى). */
    fun averageConsumption(fills: List<FillRec>): Double? {
        val s = fills.sortedBy { it.odoKm }
        val fulls = s.withIndex().filter { it.value.full }
        if (fulls.size < 2) return null
        val km = fulls.last().value.odoKm - fulls.first().value.odoKm
        if (km <= 0) return null
        val liters = s.subList(fulls.first().index + 1, fulls.last().index + 1).sumOf { it.liters }
        return liters / km * 100
    }

    data class Remaining(val liters: Double, val basis: String, val rateUsed: Double, val rateIsEstimate: Boolean)

    /**
     * البنزين الفاضل (**تقدير** — مش حساس): من آخر تفويلة لآخرها (التانك مليان) − اللى اتصرف من ساعتها
     * (كيلو × الاستهلاك) + أى تفويلة جزئية بعدها. مفيش تفويلة لآخرها أو مفيش عدّاد ⇒ null (اسأل السواق).
     */
    fun remaining(fills: List<FillRec>, odoNowKm: Double, tankL: Double, provisionalRate: Double): Remaining? {
        val s = fills.sortedBy { it.odoKm }
        val lastFull = s.lastOrNull { it.full } ?: return null
        if (tankL <= 0 || odoNowKm < lastFull.odoKm) return null
        val real = consumption(fills)
        val rate = real ?: provisionalRate
        val added = s.filter { !it.full && it.odoKm > lastFull.odoKm }.sumOf { it.liters }
        val used = (odoNowKm - lastFull.odoKm) * rate / 100
        val left = (tankL + added - used).coerceIn(0.0, tankL)
        val basis = "آخر تفويلة لآخرها على عدّاد ${Odometer.fmtKm(lastFull.odoKm.toDouble())} · مشيت ${Odometer.fmtKm(odoNowKm - lastFull.odoKm)} كم · " +
            "استهلاك ${"%.1f".format(rate)} لتر/١٠٠ كم${if (real == null) " (تقديرى — لسه مفيش تفويلتين لآخرها)" else ""}"
        return Remaining(left, basis, rate, real == null)
    }

    data class TripPlan(val km: Double, val liters: Double, val cost: Double?, val remaining: Double?, val refuel: Boolean, val text: String)

    /** قبل المشوار: «المشوار ~٣٠٠ كم ≈ ٣٠ لتر ≈ X جنيه، والفاضل ~١٥ ⇒ فوّل الأول». */
    fun trip(km: Double, rate: Double, rateIsEstimate: Boolean, perLiter: Double?, remaining: Double?, reserveL: Double = 5.0, odoUsed: Double? = null): TripPlan {
        val liters = km * rate / 100
        val cost = perLiter?.let { liters * it }
        val refuel = remaining != null && liters > remaining - reserveL
        val parts = mutableListOf("المشوار حوالى ${km.roundToInt()} كم ⇐ محتاج ~${"%.0f".format(liters)} لتر" +
            " (على ${"%.1f".format(rate)} لتر/١٠٠ كم${if (rateIsEstimate) " — تقديرى" else " من تفويلاتك"})")
        cost?.let { parts += "≈ ${it.roundToInt()} جنيه" }
        remaining?.let { parts += "الفاضل ~${"%.0f".format(it)} لتر (تقدير)" }
        if (refuel) parts += "⛽ فوّل قبل ما تمشى"
        odoUsed?.let { parts += "بحسب على عدّاد ${Odometer.fmtKm(it)}" }
        return TripPlan(km, liters, cost, remaining, refuel, parts.joinToString(" · "))
    }
}

/* ───────── التقارير ───────── */

data class TripRec(val startMs: Long, val distanceKm: Double, val movingS: Long)

data class MonthReport(
    val ym: String, val trips: Int, val km: Double, val drivingMin: Long,
    val fuelPaid: Double, val liters: Double, val fills: Int, val byGrade: Map<String, Double>, val maintDone: Int,
) {
    val costPerKm: Double? get() = if (km > 0 && fuelPaid > 0) fuelPaid / km else null
}

object Reports {
    /** «2026-11» من وقت (بتوقيت الشاشة — الدالة اللى بتدّيها الشاشة بتعمل التحويل). */
    fun monthly(trips: List<TripRec>, fills: List<FillRec>, maintDoneMs: List<Long>, ymOf: (Long) -> String): List<MonthReport> {
        val months = (trips.map { ymOf(it.startMs) } + fills.map { ymOf(it.timeMs) } + maintDoneMs.map(ymOf)).toSortedSet().reversed()
        return months.map { ym ->
            val t = trips.filter { ymOf(it.startMs) == ym }
            val f = fills.filter { ymOf(it.timeMs) == ym }
            MonthReport(ym, t.size, t.sumOf { it.distanceKm }, t.sumOf { it.movingS } / 60,
                f.sumOf { it.paid }, f.sumOf { it.liters }, f.size,
                f.groupBy { it.grade?.key ?: "?" }.mapValues { (_, v) -> v.sumOf { it.paid } },
                maintDoneMs.count { ymOf(it) == ym })
        }
    }
}
