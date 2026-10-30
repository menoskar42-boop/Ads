/**
 * قراءات القطمارس لأى يوم — من بياناتنا (data/katameros، منقولة من katameros-api برخصة MIT).
 *
 * المرحلة ١ من docs/MYBIBLE_KATAMEROS_PLAN.md: «قراءات يوم X» بنفس ترتيب katameros بالظبط
 * (reference-src/Repositories/LectionaryRepository.cs) — من غير أى طلب لقاعدة البيانات ولا لموقع تانى.
 * الناتج **مراجع** القراءات بس (مثلاً «58.13:7-25»)؛ النص من الكتاب المقدس عندنا فى المرحلة ٢.
 *
 * الترتيب:
 *   ١) حالات خاصة: كيهك (الأحد ٣٠ كيهك، ٢٩ كيهك، استعارة أحد هاتور) وبرامون الغطاس الممتد.
 *   ٢) الأعياد (ثابتة بالتاريخ القبطى، أو بالبُعد عن القيامة، أو ٧ يناير، أو برامون الميلاد).
 *      العيد اللى ليه قراءات خاصة بيرجّعها؛ واللى مالوش (الصعود، العنصرة، أحد توما، الختان…) عنوانه بس.
 *   ٣) الصوم الكبير (القيامة −٥٥ لحد −٩) ⇒ جدول الصوم (أسبوع × يوم).
 *   ٤) الخماسين (١–٤٩ يوم بعد القيامة) ⇒ جدول الخماسين.
 *   ٥) يوم ٢٩ من الشهر لو أحد (غير طوبة وأمشير) ⇒ قراءات ٢٩ من الشهر.
 *   ٦) الأحد ⇒ جدول الآحاد (رقم الأحد فى الشهر القبطى).
 *   ٧) غير كده ⇒ قراءات اليوم السنوية.
 */
import fs from "node:fs";
import path from "node:path";

export type KatSubType = "prophecy" | "psalm-gospel" | "pauline" | "catholic" | "acts" | "synaxarium" | "psalm";
export interface KatSub {
  type: KatSubType;
  ref?: string;
  psalms?: string[];
  gospels?: string[];
  /** psalm-gospel: false = لحن الصوم (من غير «قفوا بخوف…») */
  joyous?: boolean;
  simple?: boolean;
}
export interface KatSection { id: string; title: string; subSections: KatSub[] }
export interface KatSynaxariumEntry { order: number; title: string; slug: string | null }
export interface KatPlan {
  date: string;
  coptic: { year: number; month: number; day: number; monthName: string };
  weekday: number;
  /** من فين اتجابت القراءات — للمراجعة والاختبار */
  source: string;
  title: string | null;
  periodInfo: string | null;
  sections: KatSection[];
  synaxarium: KatSynaxariumEntry[];
}

export const COPTIC_MONTHS = ["", "توت", "بابه", "هاتور", "كيهك", "طوبة", "أمشير", "برمهات", "برموده", "بشنس", "بؤونة", "أبيب", "مسرى", "النسيء"];
const ORDINALS = ["", "الأول", "الثانى", "الثالث", "الرابع", "الخامس"];
const SECTION_TITLES: Record<string, string> = {
  vespers: "العشية", matins: "باكر", liturgy: "القداس",
  "hour-1": "الساعة الأولى", "hour-3": "الساعة الثالثة", "hour-6": "الساعة السادسة", "hour-9": "الساعة التاسعة",
  "hour-11": "الساعة الحادية عشر", "hour-12": "الساعة الثانية عشر",
};
const HOUR_TOKENS: Record<string, string> = {
  FirstHour: "الساعة الأولى", ThirdHour: "الساعة الثالثة", SixthHour: "الساعة السادسة", NinthHour: "الساعة التاسعة",
  EleventhHour: "الساعة الحادية عشر", TwelfthHour: "الساعة الثانية عشر", EveOf: "عشية",
};

// ── التاريخ ───────────────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
/** يوم ميلادى «YYYY-MM-DD» ⇒ رقم يوم (UTC) — من غير مناطق زمنية */
const dayNum = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
const fromDayNum = (n: number) => { const t = new Date(n * DAY_MS); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const weekdayOf = (n: number) => new Date(n * DAY_MS).getUTCDay();   // ٠ = الأحد
// نقطة ثابتة معروفة: ١ توت ١٧٤٣ = ١١ سبتمبر ٢٠٢٦. السنة القبطية ٣٦٥ يوم، والسنة n مكبوسة (٦ أيام نسيء) لو n % 4 == 3.
const COPTIC_ANCHOR = { year: 1743, dayNum: dayNum(2026, 9, 11) };
/** أول يوم (١ توت) فى سنة قبطية */
function copticNewYear(year: number): number {
  // عدد الأيام من ١ توت سنة A لحد ١ توت سنة B = 365*(B−A) + عدد السنين المكبوسة بينهم (السنة n مكبوسة لو n % 4 == 3)
  const leapsBefore = (y: number) => Math.floor(y / 4);   // السنين المكبوسة من ١ لحد y−1: n%4==3 ⇒ floor((y−1+1)/4)
  return COPTIC_ANCHOR.dayNum + 365 * (year - COPTIC_ANCHOR.year) + (leapsBefore(year) - leapsBefore(COPTIC_ANCHOR.year));
}
export function toCoptic(n: number): { year: number; month: number; day: number } {
  let year = COPTIC_ANCHOR.year + Math.floor((n - COPTIC_ANCHOR.dayNum) / 365.25);
  while (copticNewYear(year + 1) <= n) year++;
  while (copticNewYear(year) > n) year--;
  const off = n - copticNewYear(year);
  return { year, month: Math.floor(off / 30) + 1, day: (off % 30) + 1 };
}
export function fromCoptic(year: number, month: number, day: number): number {
  return copticNewYear(year) + 30 * (month - 1) + (day - 1);
}
/** القيامة (نفس معادلة CopticDateHelper.GetEasterDate) — ٣١ مارس + X + Y + ٣ */
export function easterDayNum(gYear: number): number {
  const A = gYear % 19, B = gYear % 4, C = gYear % 7;
  const X = (19 * A + 16) % 30;
  const Y = (2 * B + 4 * C + 6 * X) % 7;
  return dayNum(gYear, 3, 31) + X + Y + 3;
}

// ── البيانات (مرة واحدة فى الذاكرة) ─────────────────────────────────────────────────────
type RefRow = Record<string, any>;
interface Data {
  annual: Map<string, RefRow>; sunday: Map<string, RefRow>; lent: Map<string, RefRow>; pentecost: Map<string, RefRow>;
  feasts: Record<string, any>; feastNames: Record<string, string>;
  synaxarium: Map<string, KatSynaxariumEntry[]>;
}
let cache: Data | null = null;
export const KATAMEROS_DIR = path.join(process.cwd(), "data", "katameros");
function load(): Data {
  if (cache) return cache;
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(KATAMEROS_DIR, f), "utf8"));
  const byKey = (rows: RefRow[], key: (r: RefRow) => string) => new Map(rows.map((r) => [key(r), r] as [string, RefRow]));
  const synaxarium = new Map<string, KatSynaxariumEntry[]>();
  for (const s of read("synaxarium.ar.json")) {
    const k = `${s.month}-${s.day}`;
    if (!synaxarium.has(k)) synaxarium.set(k, []);
    synaxarium.get(k)!.push({ order: s.order, title: s.title, slug: s.slug ?? null });
  }
  cache = {
    annual: byKey(read("readings-annual.json"), (r) => `${r.Month_Number}-${r.Day}`),
    sunday: byKey(read("readings-sunday.json"), (r) => `${r.Month_Number}-${r.Day}`),
    lent: byKey(read("readings-great-lent.json"), (r) => `${r.Week}-${r.DayOfWeek}`),
    pentecost: byKey(read("readings-pentecost.json"), (r) => `${r.Week}-${r.DayOfWeek}`),
    feasts: read("feasts-readings.json"),
    feastNames: Object.fromEntries(read("feasts.ar.json").map((f: any) => [f.name.toLowerCase(), f.ar])),
    synaxarium,
  };
  return cache;
}

// ── الأقسام ───────────────────────────────────────────────────────────────────────────
const psalmGospel = (psalm: string | null, gospel: string, joyous = true): KatSub =>
  ({ type: "psalm-gospel", psalms: psalm ? [psalm] : [], gospels: [gospel], joyous });
/** نفس ReadingsRepository.GetFromRef: عشية (لو فيها مزمور) · باكر (ومعاها النبوات) · القداس (ومعاه السنكسار) */
function fromRefs(r: RefRow): KatSection[] {
  const out: KatSection[] = [];
  if (r.V_Psalm_Ref) out.push({ id: "vespers", title: SECTION_TITLES.vespers, subSections: [psalmGospel(r.V_Psalm_Ref, r.V_Gospel_Ref)] });
  out.push({ id: "matins", title: SECTION_TITLES.matins, subSections: [
    ...(r.Prophecy ? [{ type: "prophecy", ref: r.Prophecy } as KatSub] : []),
    psalmGospel(r.M_Psalm_Ref, r.M_Gospel_Ref),
  ] });
  out.push({ id: "liturgy", title: SECTION_TITLES.liturgy, subSections: [
    { type: "pauline", ref: r.P_Gospel_Ref }, { type: "catholic", ref: r.C_Gospel_Ref }, { type: "acts", ref: r.X_Gospel_Ref },
    { type: "synaxarium" },
    ...(r.L_Gospel_Ref ? [psalmGospel(r.L_Psalm_Ref, r.L_Gospel_Ref)] : []),
  ] });
  return out;
}
function feastSections(name: string, d: Data): { sections: KatSection[]; annual?: { month: number; day: number } } {
  const f = d.feasts[name];
  if (!f) throw new Error(`قراءات العيد ${name} مش موجودة فى feasts-readings.json`);
  if (f.annual) return { sections: fromRefs(d.annual.get(`${f.annual.month}-${f.annual.day}`)!), annual: f.annual };
  const next = f.nextDayFeast ? d.feastNames[String(f.nextDayFeast).toLowerCase()] ?? "" : "";
  return { sections: f.sections.map((s: any) => ({
    id: s.id,
    title: s.title
      ? String(s.title).replace(/\{(\w+)\}/g, (_: string, k: string) => (k === "NextDay" ? next : HOUR_TOKENS[k] ?? ""))
      : SECTION_TITLES[s.id] ?? s.id,
    subSections: s.subSections.map((x: KatSub) => ({ ...x })),
  })) };
}

// ── الأعياد (نفس ترتيب FeastsFactory بالظبط — الترتيب بيفرق لو عيدين وقعوا فى يوم واحد) ──────────────
type FeastCalc = { feast: string; build?: string; easter?: number; coptic?: [number, number]; jan?: number; paramoun?: true };
const FEASTS: FeastCalc[] = [
  { feast: "Christmas", jan: 7, build: "ConstructChristmas" },
  { feast: "NativityParamoun", paramoun: true, build: "ConstructNativityParamoun" },
  { feast: "Ascension", easter: 39 },
  { feast: "Pentecost", easter: 49 },
  { feast: "ThomasSunday", easter: 7 },
  { feast: "LazarusSaturday", easter: -8, build: "ConstructLazarusSaturday" },
  { feast: "TempleEntrance", coptic: [6, 8], build: "ConstructTempleEntrance" },   // ٨ أمشير
  { feast: "EgyptEntrance", coptic: [9, 24], build: "ConstructEgyptEntrance" },
  { feast: "Annunciation", coptic: [7, 29], build: "ConstructAnnunciation" },
  { feast: "Cross", coptic: [7, 10], build: "ConstructFeastOfTheCross" },
  { feast: "Cross", coptic: [1, 17], build: "ConstructFeastOfTheCross" },
  { feast: "Cross", coptic: [1, 18], build: "ConstructFeastOfTheCross2" },
  { feast: "Cross", coptic: [1, 19], build: "ConstructFeastOfTheCross3" },
  { feast: "FastOfNinevah", easter: -69, build: "ConstructFastOfNinevah1" },
  { feast: "FastOfNinevah", easter: -68, build: "ConstructFastOfNinevah2" },
  { feast: "FastOfNinevah", easter: -67, build: "ConstructFastOfNinevah3" },
  { feast: "Jonas", easter: -66, build: "ConstructFeastOfJonas" },
  { feast: "PalmSunday", easter: -7, build: "ConstructPalmSunday" },
  { feast: "PaschaMonday", easter: -6, build: "ConstructPaschaMonday" },
  { feast: "PaschaTuesday", easter: -5, build: "ConstructPaschaTuesday" },
  { feast: "TheophanyParamoun", coptic: [5, 10], build: "ConstructParamounTheophany" },
  { feast: "Theophany", coptic: [5, 11], build: "ConstructTheophany" },
  { feast: "WeddingOfCana", coptic: [5, 13], build: "ConstructWeddingOfCana" },
  { feast: "GreatLentPreparationSaturday", easter: -57, build: "ConstructGreatLentPreparationSaturday" },
  { feast: "GreatLentPreparationSunday", easter: -56, build: "ConstructGreatLentPreparationSunday" },
  { feast: "PaschaWednesday", easter: -4, build: "ConstructPaschaWednesday" },
  { feast: "PaschaThursday", easter: -3, build: "ConstructPaschaThursday" },
  { feast: "PaschaFriday", easter: -2, build: "ConstructPaschaFriday" },
  { feast: "PaschaSaturday", easter: -1, build: "ConstructPaschaSaturday" },
  { feast: "Easter", easter: 0, build: "ConstructEaster" },
  { feast: "Nayrouz", coptic: [1, 1], build: "ConstructNayrouz" },
  { feast: "Circumcision", coptic: [5, 6] },
  { feast: "Apostles", coptic: [11, 5] },
  { feast: "Transfiguration", coptic: [12, 13] },
  { feast: "StMaryAssumption", coptic: [12, 16] },
];
/** برامون الميلاد (NativityParamoun.cs): ٦ يناير، ولو جه سبت يومين، ولو جه أحد ٣ أيام — جوّه كيهك */
function isNativityParamoun(n: number, cMonth: number): boolean {
  const { y } = fromDayNum(n);
  const p = dayNum(y, 1, 6), wd = weekdayOf(p);
  return cMonth === 4 && ((wd === 0 && n >= p - 2 && n < p) || (wd === 6 && n >= p - 1 && n < p) || n === p);
}
function dayFeast(n: number, c: { month: number; day: number }, easterDiff: number): FeastCalc | null {
  const { m, d } = fromDayNum(n);
  for (const f of FEASTS) {
    if (f.easter !== undefined && f.easter === easterDiff) return f;
    if (f.coptic && f.coptic[0] === c.month && f.coptic[1] === c.day) {
      if (easterDiff >= -8 && easterDiff <= 0) continue;   // الأعياد القبطية جوّه أسبوع الآلام مابتتعيّدش
      return f;
    }
    if (f.jan !== undefined && m === 1 && d === f.jan) return f;
    if (f.paramoun && isNativityParamoun(n, c.month)) return f;
  }
  return null;
}

// ── الحالات الخاصة (SpecialCases/Kiahk.cs و Theophany.cs) ────────────────────────────────
const sundaysElapsed = (c: { year: number; month: number; day: number }) => {
  let k = 0;
  for (let i = 1; i <= c.day; i++) if (weekdayOf(fromCoptic(c.year, c.month, i)) === 0) k++;
  return k;
};
function specialCase(n: number, c: { year: number; month: number; day: number }, d: Data): { source: string; title: string | null; sections: KatSection[] } | null {
  const wd = weekdayOf(n), { y, m } = fromDayNum(n);
  // ٣٠ كيهك يوم أحد (اليوم اللى بعد الميلاد) ⇒ قراءات ٣٠ كيهك السنوية، مش الأحد الخامس
  if (c.month === 4 && wd === 0 && c.day === 30) return { source: "special:kiahk-30-sunday", title: null, sections: fromRefs(d.annual.get("4-30")!) };
  // الميلاد وقع ٢٨ كيهك ⇒ ٢٩ كيهك قراءاته السنوية
  if (c.month === 4 && c.day === 29 && toCoptic(dayNum(y, 1, 7)).day === 28) return { source: "special:kiahk-29", title: null, sections: fromRefs(d.annual.get("4-29")!) };
  // برامون الميلاد الجاى يوم أحد ⇒ كيهك فاضل فيه ٣ آحاد: آخر أحد فى هاتور = الأحد الأول من كيهك، وآحاد كيهك بتتزق واحد
  const paramoun = dayNum(y + 1, 1, 6);
  if (m !== 1 && weekdayOf(paramoun) === 0 && wd === 0) {
    const nb = sundaysElapsed(c);
    if (c.month === 3 && c.day + 7 > 30) return { source: "special:kiahk-sunday-1", title: null, sections: fromRefs(d.sunday.get("4-1")!) };
    if (c.month === 4) return { source: `special:kiahk-sunday-${nb + 1}`, title: null, sections: fromRefs(d.sunday.get(`4-${nb + 1}`)!) };
  }
  // برامون الغطاس الممتد: الغطاس (١١ طوبة) يوم اتنين ⇒ ٨ و٩ طوبة برامون، ولو يوم أحد ⇒ ٩ طوبة
  if (c.month === 5) {
    const tw = weekdayOf(fromCoptic(c.year, 5, 11));
    if ((tw === 1 && ((wd === 5 && c.day === 8) || (wd === 6 && c.day === 9))) || (tw === 0 && wd === 5 && c.day === 9)) {
      return { source: "special:theophany-paramoun", title: d.feastNames["theophanyparamoun"], sections: feastSections("ConstructTheophanyParamounSpecial", d).sections };
    }
  }
  return null;
}

// ── «قراءات يوم X» ─────────────────────────────────────────────────────────────────────
export function getKatamerosPlan(date: string): KatPlan {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error("التاريخ لازم يبقى YYYY-MM-DD");
  const d = load();
  const n = dayNum(+m[1], +m[2], +m[3]);
  const c = toCoptic(n);
  const wd = weekdayOf(n);
  const base = {
    date, weekday: wd,
    coptic: { ...c, monthName: COPTIC_MONTHS[c.month] },
    synaxarium: d.synaxarium.get(`${c.month}-${c.day}`) ?? [],
  };
  const done = (source: string, title: string | null, sections: KatSection[], periodInfo: string | null = null): KatPlan =>
    ({ ...base, source, title, periodInfo, sections });

  const sp = specialCase(n, c, d);
  if (sp) return done(sp.source, sp.title, sp.sections);

  const easter = easterDayNum(+m[1]);
  const easterDiff = n - easter;
  const feast = dayFeast(n, c, easterDiff);
  const feastTitle = feast ? d.feastNames[feast.feast.toLowerCase()] ?? null : null;
  if (feast?.build) return done(`feast:${feast.feast}`, feastTitle, feastSections(feast.build, d).sections);

  let row: RefRow | undefined, source: string, periodInfo: string | null = null;
  if (n >= easter - 55 && n <= easter - 9) {
    const week = Math.floor((n - (easter - 55)) / 7) + 1;
    row = d.lent.get(`${week}-${wd}`); source = `great-lent:${week}-${wd}`;
  } else if (easterDiff > 0 && easterDiff <= 49) {
    const week = Math.floor(easterDiff / 7) + 1 - (wd === 0 ? 1 : 0);
    row = d.pentecost.get(`${week}-${wd}`); source = `pentecost:${week}-${wd}`;
  } else if (c.day === 29 && wd === 0 && c.month !== 6 && c.month !== 5) {
    return done("feast:29th-of-month", null, feastSections("Construct29OfMonth", d).sections);   // من غير عنوان زى Construct29OfMonth
  } else if (wd === 0) {
    const nb = Math.floor((c.day - 1) / 7) + 1;
    row = d.sunday.get(`${c.month}-${nb}`); source = `sunday:${c.month}-${nb}`;
    periodInfo = `الأحد ${ORDINALS[nb] ?? nb} من شهر ${COPTIC_MONTHS[c.month]}`;
  } else {
    row = d.annual.get(`${c.month}-${c.day}`); source = `annual:${c.month}-${c.day}`;
  }
  if (!row) throw new Error(`مفيش قراءات لـ${source}`);
  return done(source, feastTitle, fromRefs(row), periodInfo);
}

/** للاختبارات: يمسح البيانات المحمّلة */
export function clearKatamerosLocalCache(): void { cache = null; }
