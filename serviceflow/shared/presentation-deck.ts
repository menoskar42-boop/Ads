/**
 * «العرض التقديمى» — الأنواع والافتراضى وقراية القيمة المعروضة (مشتركة بين الشاشة والسيرفر).
 * التفاصيل: server/presentation-deck.ts
 */
export const DECK_KEY = "presentation_deck_v1";
export const IMG_PREFIX = "presentation_img_";

export type DeckExchange = { code: string; name: string; match: string };
export type Deck = {
  cover: { title: string; subtitle: string; meeting: string; date: string };
  person: { name: string; birthDate: string; job: string; department: string; sector: string; photoId: string; qualifications: string };
  career: { enabled: boolean; hireYear: string; items: string };
  area: { areaKm2: string; population: string; villages: string; housingUnits: string; mapId: string; extraRows: string };
  exchanges: DeckExchange[];
  customers: { weData: string; marketShare: string };
  decentLife: { enabled: boolean; phase1: string; phase2: string; notes: string };
  faults: { enabled: boolean; fromYear: string };
  // خطة الصيانة: المحقق بس — مفيش مستهدف (المالك ٢٠٢٦-١٠-٢٠)
  maintenance: { enabled: boolean; period: string; achievedCopper: string; achievedMsan: string; photoIds: string[] };
  /** نسبة الحجز وفك المتعذرات — نفس أعمدة تقرير «نسبة الحجز» بتاع منطقة أسيوط (المالك ٢٠٢٦-١٠-٢٠).
   *  مفتاح جديد (كان blocked) عشان الافتراضيات (أرقام الغنايم حتى ١٨ أكتوبر) تتحط فى العرض المحفوظ. */
  booking: { enabled: boolean; asOf: string; total: string; capacity: string; blocked: string; clarify: string;
    noReply: string; otherExchange: string; pct: string; regionName: string; regionPct: string };
  achievements: { enabled: boolean; items: string; photoIds: string[] };
  vision: { enabled: boolean; items: string };
  closing: { enabled: boolean; text: string };
  /** رقم مكتوب بإيد المالك بدل التلقائى: «GHNAT.lines» أو «total.boxes» … */
  overrides: Record<string, string>;
};

export const DEFAULT_EXCHANGES: DeckExchange[] = [
  { code: "GHNAT", name: "الغنايم", match: "الغنايم" },
  { code: "AMZAT", name: "العزايزة", match: "الغنايم-العزايزة" },
  { code: "DRGAT", name: "دير الجنادلة", match: "الغنايم-دير الجنادله" },
  { code: "NGOAT", name: "نجع العمدة", match: "الغنايم-نجع العمدة" },
];

export function defaultDeck(): Deck {
  return {
    cover: { title: "إدارة سنترالات الغنايم", subtitle: "عرض تقديمى", meeting: "", date: "" },
    person: { name: "", birthDate: "", job: "مدير إدارة سنترالات الغنايم", department: "منطقة أسيوط", sector: "قطاع وسط الصعيد", photoId: "", qualifications: "" },
    career: { enabled: true, hireYear: "", items: "" },
    area: { areaKm2: "", population: "", villages: "", housingUnits: "", mapId: "", extraRows: "" },
    exchanges: DEFAULT_EXCHANGES.map((e) => ({ ...e })),
    customers: { weData: "", marketShare: "" },
    decentLife: { enabled: false, phase1: "", phase2: "", notes: "" },
    faults: { enabled: true, fromYear: "2024" },
    maintenance: { enabled: true, period: "2026", achievedCopper: "", achievedMsan: "", photoIds: [] },
    booking: { enabled: true, asOf: "18 أكتوبر 2026", total: "1267", capacity: "1230", blocked: "36", clarify: "0",
      noReply: "0", otherExchange: "1", pct: "", regionName: "منطقة أسيوط", regionPct: "84%" },
    achievements: { enabled: false, items: "", photoIds: [] },
    vision: { enabled: false, items: "" },
    closing: { enabled: true, text: "شكراً لحسن استماعكم" },
    overrides: {},
  };
}

/** بيانات محفوظة قديمة/ناقصة + الافتراضى = Deck كامل (ومفيش حقول غريبة بتتحفظ). */
export function normalizeDeck(raw: any): Deck {
  const d = defaultDeck();
  const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max));
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[a-z0-9]{6,40}$/.test(x)).slice(0, 12) : []);
  const pick = <T extends Record<string, any>>(base: T, src: any): T => {
    const out: any = { ...base };
    for (const k of Object.keys(base)) {
      if (src?.[k] === undefined) continue;
      const b = (base as any)[k];
      out[k] = typeof b === "boolean" ? bool(src[k], b) : Array.isArray(b) ? ids(src[k]) : str(src[k]);
    }
    return out;
  };
  if (!raw || typeof raw !== "object") return d;
  for (const k of ["cover", "person", "career", "area", "customers", "decentLife", "faults", "maintenance", "booking", "achievements", "vision", "closing"] as const) {
    (d as any)[k] = pick((d as any)[k], raw[k]);
  }
  if (Array.isArray(raw.exchanges) && raw.exchanges.length) {
    d.exchanges = raw.exchanges.slice(0, 8).map((e: any) => ({ code: str(e?.code, 20), name: str(e?.name, 80), match: str(e?.match, 120) }))
      .filter((e: DeckExchange) => e.code || e.name || e.match);
  }
  if (raw.overrides && typeof raw.overrides === "object") {
    for (const [k, v] of Object.entries(raw.overrides)) {
      if (/^[A-Za-z0-9_]{1,20}\.[A-Za-z0-9_]{1,40}$/.test(k) && String(v ?? "").trim()) d.overrides[k] = str(v, 60);
    }
  }
  return d;
}

export type ExchangeAuto = {
  lines: number; copperCabinets: number; msanCabinets: number; boxes: number; capacity: number;
  msanVoice: number; msanData: number; accounts: number;
  /** عملاء البيانات (كل الشركات): بورتات الداتا فيها used (المالك ٢٠٢٦-١٠-٢٠) */
  dataUsed: number;
  /** الشغال صوت: بورتات الصوت فيها used */
  voiceUsed: number;
  /** عملاء بيانات WE: خطوط ليها أكونت وليها بورت حالى */
  weData: number;
};
export type DeckAuto = {
  exchanges: Record<string, ExchangeAuto>;
  total: ExchangeAuto;
  faultsByYear: { year: string; complaints: number; repeatPct: number | null; in48Pct: number | null }[];
  /** نفس المؤشرات شهر بشهر (YYYY-MM) — لو الفترة سنة واحدة الرسم بيبقى بالشهور */
  faultsByMonth?: { month: string; complaints: number; repeatPct: number | null; in48Pct: number | null }[];
  maintenance: { boxesTotal: number | null; boxesDone: number | null; byYear: { year: string; done: number }[] } | null;
  /** قيم «حياة كريمة» على الكباين زى ما هى متسجّلة (مساعدة للمالك وهو بيكتب المرحلة الأولى/التانية) */
  decentLife: { value: string; cabinets: number; villages: number }[];
  errors: string[];
  computedAt: string;
};

/** الرقم اللى بيظهر: المكتوب بالإيد لو موجود، وإلا التلقائى. */
export function deckValue(deck: Deck, auto: DeckAuto | null, scope: string, field: keyof ExchangeAuto): string {
  const o = deck.overrides[`${scope}.${field}`];
  if (o != null && String(o).trim()) return String(o).trim();
  const src = scope === "total" ? auto?.total : auto?.exchanges[scope];
  const n = src?.[field];
  return n == null ? "" : Number(n).toLocaleString("en-US");
}

// ───────────────────────── الشرايح ─────────────────────────
// قايمة الشرايح بالترتيب — نفس القايمة بترسمها الشاشة (React) وبيتعمل منها ملف الباور بوينت،
// فالاتنين مايختلفوش. الأقسام الاختيارية بتتشال لما مفتاحها مقفول أو مافيهاش بيانات.
export type Slide =
  | { kind: "cover"; title: string; subtitle: string; meeting: string; date: string }
  | { kind: "divider"; title: string }
  | { kind: "agenda"; title: string; items: string[] }
  | { kind: "cv"; title: string; photoId: string; fields: [string, string][]; qualificationsTitle: string; qualifications: string[] }
  | { kind: "list"; title: string; lead: string; items: string[] }
  | { kind: "table"; title: string; columns: string[]; rows: string[][]; imageId: string; note: string; totalLast: boolean }
  | { kind: "chart"; title: string; seriesLabel: string; unit: string; points: { label: string; value: number }[]; note: string }
  | { kind: "photos"; title: string; photoIds: string[] }
  | { kind: "closing"; text: string };

/** نسبة الحجز = الإمكانية ÷ إجمالى الطلبات — إلا لو مكتوبة */
export function bookingPct(b: Deck["booking"]): string {
  if (b.pct.trim()) return b.pct.trim();
  const n = (x: string) => Number(String(x).replace(/[,٬\s]/g, ""));
  const t = n(b.total), c = n(b.capacity);
  return t > 0 && c >= 0 && Number.isFinite(c) ? `${Math.round((100 * c) / t)}%` : "";
}

/** عملاء بيانات WE: المكتوب فى «العملاء» لو موجود، وإلا التلقائى (أكونت + بورت حالى) */
export function weDataValue(deck: Deck, auto: DeckAuto | null): string {
  return deck.customers.weData.trim() || deckValue(deck, auto, "total", "weData");
}
/** الحصة السوقية = عملاء WE ÷ عملاء البيانات كلهم — إلا لو المالك كاتبها */
export function marketShareValue(deck: Deck, auto: DeckAuto | null): string {
  if (deck.customers.marketShare.trim()) return deck.customers.marketShare.trim();
  const n = (x: string) => Number(String(x).replace(/[,٬\s]/g, ""));
  const we = n(weDataValue(deck, auto)), all = n(deckValue(deck, auto, "total", "dataUsed"));
  return we > 0 && all > 0 ? `${Math.round((1000 * we) / all) / 10}%` : "";
}

/** المسار الوظيفى: سطر لكل وظيفة «الوظيفة | من | إلى» — التواريخ نص حر (2009 · يناير 2015 · حتى الآن).
 *  السطور القديمة «الوظيفة | الفترة» بتتقرى زى ما هى (الفترة كلها فى «من»). */
export type CareerRow = { job: string; from: string; to: string };
export function careerRows(items: string): CareerRow[] {
  return String(items || "").split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const [job = "", from = "", ...rest] = l.split("|").map((x) => x.trim());
    return { job, from, to: rest.join(" ").trim() };
  });
}
export function careerItems(rows: CareerRow[]): string {
  // من غير trim: بيتنادى مع كل حرف، والمسافة اللى المالك لسه كاتبها لازم تفضل
  const clean = (x: string) => String(x || "").replace(/\|/g, "").replace(/[\r\n]+/g, " ");
  return rows.map((r) => `${clean(r.job)} | ${clean(r.from)} | ${clean(r.to)}`).join("\n");
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const lines = (s: string) => String(s || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const pairs = (s: string) => lines(s).map((l) => {
  const i = l.indexOf("|");
  return (i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]) as [string, string];
});
const pct = (a: string, b: string) => {
  const x = Number(String(a).replace(/[,٬\s]/g, "")), y = Number(String(b).replace(/[,٬\s]/g, ""));
  return x > 0 && y >= 0 && Number.isFinite(y) ? `${Math.round((100 * y) / x)}%` : "";
};

export function buildSlides(deck: Deck, auto: DeckAuto | null): Slide[] {
  const v = (scope: string, f: keyof ExchangeAuto) => deckValue(deck, auto, scope, f);
  const exName = (e: DeckExchange) => e.name || e.code;
  const slides: Slide[] = [];
  const c = deck.cover;
  slides.push({ kind: "cover", title: c.title, subtitle: c.subtitle, meeting: c.meeting, date: c.date });

  const p = deck.person;
  slides.push({
    kind: "cv", title: "السيرة الذاتية", photoId: p.photoId,
    fields: ([["الاســـم", p.name], ["تاريخ الميلاد", p.birthDate], ["الوظيفة", p.job], ["الإدارة العامة", p.department], ["القطاع", p.sector]] as [string, string][])
      .filter(([, x]) => x.trim()),
    qualificationsTitle: "المؤهل الدراسى", qualifications: lines(p.qualifications),
  });
  const sp = (x: string) => x.replace(/\s+/g, " ").trim();
  const career = careerRows(deck.career.items).map((r) => ({ job: sp(r.job), from: sp(r.from), to: sp(r.to) }))
    .filter((r) => r.job || r.from || r.to)
    .map((r) => [r.job, [r.from, r.to].filter(Boolean).join(" - ")].filter(Boolean).join("   "));
  if (deck.career.enabled && (deck.career.hireYear.trim() || career.length)) {
    slides.push({
      kind: "list", title: "المسار الوظيفى بالشركة المصرية للاتصالات",
      lead: deck.career.hireYear ? `تعيين سنة ${deck.career.hireYear} بالشركة المصرية للاتصالات` : "",
      items: career,
    });
  }

  const showPerf = deck.faults.enabled && (auto?.faultsByYear?.length ?? 0) > 0;
  // شرايح «مبادرات وأهم الإنجازات» بتتحسب الأول عشان الأجندة والفاصل مايظهروش وهى فاضية
  const work: Slide[] = [];
  const m = deck.maintenance;
  if (m.enabled) {
    const doneYear = auto?.maintenance?.byYear.find((y) => y.year === m.period)?.done;
    const achievedBoxes = deck.overrides["total.maintBoxes"] || (doneYear != null ? String(doneYear) : "");
    const rows = [
      ["البكسيات", v("total", "boxes"), achievedBoxes],
      ["الكباين النحاسية", v("total", "copperCabinets"), m.achievedCopper],
      ["كباين MSAN", v("total", "msanCabinets"), m.achievedMsan],
    ].filter((r) => String(r[2]).trim());
    if (rows.length) work.push({ kind: "table", title: `خطة الصيانة ورفع الكفاءة ${m.period}`, columns: ["البيان", "إجمالى الشبكة", "المحقق"], rows, imageId: "", note: "", totalLast: false });
    if (m.photoIds.length) work.push({ kind: "photos", title: "بعض صور أعمال الصيانة", photoIds: m.photoIds });
  }
  const b = deck.booking;
  if (b.enabled && (b.total || b.capacity || b.blocked)) {
    work.push({ kind: "table", title: `نسبة الحجز وفك المتعذرات${b.asOf ? ` حتى ${b.asOf}` : ""}`,
      columns: ["إجمالى الطلبات", "إجمالى الإمكانية", "متعذر", "توضيح عنوان", "بدون رد", "العنوان لا يتبع السنترال", "نسبة الحجز"],
      rows: [[b.total, b.capacity, b.blocked, b.clarify, b.noReply, b.otherExchange, bookingPct(b)]], imageId: "",
      note: b.regionPct.trim() ? `نسبة الحجز ${b.regionName.trim() ? `لـ${b.regionName.trim()}` : "للمنطقة"} فى نفس التاريخ: ${b.regionPct.trim()}` : "", totalLast: false });
  }
  if (deck.achievements.enabled && (deck.achievements.items || deck.achievements.photoIds.length)) {
    if (deck.achievements.items) work.push({ kind: "list", title: "أهم الإنجازات", lead: "", items: lines(deck.achievements.items) });
    if (deck.achievements.photoIds.length) work.push({ kind: "photos", title: "من الإنجازات", photoIds: deck.achievements.photoIds });
  }
  const showWork = work.length > 0;
  const agenda = ["نبذة عن إدارة سنترالات الغنايم", ...(showPerf ? ["مؤشرات ومعدلات الأداء"] : []),
    ...(showWork ? ["مبادرات وأهم الإنجازات"] : []), ...(deck.vision.enabled && deck.vision.items ? ["رؤية التطوير المستقبلية"] : [])];
  slides.push({ kind: "agenda", title: "الأجندة", items: agenda });

  // ── نبذة ──
  slides.push({ kind: "divider", title: "نبذة عن إدارة سنترالات الغنايم" });
  const a = deck.area;
  const overview: string[][] = [
    ["المساحة الجغرافية", a.areaKm2 ? `${a.areaKm2} كم²` : ""],
    ["عدد السكان", a.population],
    ["عدد القرى والتوابع", a.villages],
    ["عدد الوحدات السكنية المشغولة", a.housingUnits],
    ["عدد السنترالات", String(deck.exchanges.length)],
    ["عدد الكباين النحاسية", v("total", "copperCabinets")],
    ["عدد وحدات التجميع الذكية MSAN", v("total", "msanCabinets")],
    ["إجمالى بكسيات الإدارة", v("total", "boxes")],
    // المالك ٢٠٢٦-١٠-٢٠: «هنا لازم تحط الشغال صوت و الشغال داتا و عدد عملاء وى و نسبه الحصه السوقيه»
    ["عدد الخطوط الشغالة صوت", v("total", "voiceUsed")],
    ["عدد الخطوط الشغالة داتا", v("total", "dataUsed")],
    ["عدد عملاء البيانات WE", weDataValue(deck, auto)],
    ["الحصة السوقية WE DATA", marketShareValue(deck, auto)],
    ...pairs(a.extraRows),
  ].filter(([, x]) => String(x).trim());
  slides.push({ kind: "table", title: deck.cover.title, columns: ["البيان", deck.cover.title], rows: overview, imageId: a.mapId, note: "", totalLast: false });

  const cust: string[][] = [
    ["عدد خطوط الصوت", v("total", "lines")],
    ["عدد عملاء البيانات (كل الشركات)", v("total", "dataUsed")],
    ["عدد عملاء البيانات WE", weDataValue(deck, auto)],
    ["الحصة السوقية WE DATA", marketShareValue(deck, auto)],
    ["عدد عملاء الصوت MSAN", v("total", "msanVoice")],
    ["عدد عملاء البيانات MSAN", v("total", "msanData")],
    ...(deck.decentLife.enabled ? [
      ["عدد قرى حياة كريمة مرحلة أولى", deck.decentLife.phase1],
      ["عدد قرى حياة كريمة مرحلة ثانية", deck.decentLife.phase2],
    ] : []),
  ].filter(([, x]) => String(x).trim());
  slides.push({ kind: "table", title: `${deck.cover.title} — العملاء`, columns: ["البيان", deck.cover.title], rows: cust, imageId: "", note: deck.decentLife.enabled ? deck.decentLife.notes : "", totalLast: false });

  const exRows = deck.exchanges.map((e) => [exName(e), e.code, v(e.code, "lines"), v(e.code, "copperCabinets"), v(e.code, "msanCabinets"), v(e.code, "boxes"), v(e.code, "msanVoice"), v(e.code, "msanData")]);
  exRows.push(["الإجمالى", "", v("total", "lines"), v("total", "copperCabinets"), v("total", "msanCabinets"), v("total", "boxes"), v("total", "msanVoice"), v("total", "msanData")]);
  slides.push({ kind: "table", title: "سنترالات الإدارة", columns: ["السنترال", "الكود", "الخطوط", "كباين نحاس", "كباين MSAN", "البكسيات", "صوت MSAN", "داتا MSAN"], rows: exRows, imageId: "", note: "", totalLast: true });

  // ── الأداء ──
  if (showPerf && auto) {
    slides.push({ kind: "divider", title: "مؤشرات ومعدلات الأداء" });
    const fy = auto.faultsByYear;
    const fm = auto.faultsByMonth || [];
    const RNOTE = "التكرار = (الأعطال المغلقة − عدد الأرقام) ÷ عدد الأرقام";
    const INOTE = "من إجمالى الأعطال المبلّغة فى الفترة";
    if (fy.length === 1 && fm.length >= 2) {
      // سنة واحدة (مثلاً 2026): عمود لكل شهر، ونسبة السنة كلها فى الملاحظة
      const y = fy[0];
      const pts = (k: "repeatPct" | "in48Pct") => fm.filter((m) => m[k] != null).map((m) => ({ label: MONTHS[Number(m.month.slice(5, 7)) - 1] || m.month, value: m[k] as number }));
      slides.push({ kind: "chart", title: `نسب تكرار الأعطال عام ${y.year}`, seriesLabel: "نسبة التكرار شهرياً", unit: "%",
        points: pts("repeatPct"), note: `إجمالى عام ${y.year}: ${y.repeatPct ?? "—"}% — ${RNOTE}` });
      slides.push({ kind: "chart", title: `نتائج إزالة الأعطال خلال 48 ساعة عام ${y.year}`, seriesLabel: "الإزالة خلال 48 ساعة شهرياً", unit: "%",
        points: pts("in48Pct"), note: `إجمالى عام ${y.year}: ${y.in48Pct ?? "—"}% (${y.complaints.toLocaleString("en-US")} عطل) — ${INOTE}` });
    } else {
      const span = fy.length === 1 ? `عام ${fy[0].year}` : `من ${fy[0].year} حتى ${fy[fy.length - 1].year}`;
      slides.push({ kind: "chart", title: `${fy.length > 1 ? "تحسن " : ""}نسب تكرار الأعطال ${span}`, seriesLabel: "نسبة التكرار", unit: "%",
        points: fy.filter((f) => f.repeatPct != null).map((f) => ({ label: f.year, value: f.repeatPct as number })), note: RNOTE });
      slides.push({ kind: "chart", title: `نتائج إزالة الأعطال خلال 48 ساعة ${span}`, seriesLabel: "الإزالة خلال 48 ساعة", unit: "%",
        points: fy.filter((f) => f.in48Pct != null).map((f) => ({ label: f.year, value: f.in48Pct as number })), note: INOTE });
    }
  }

  // ── الإنجازات ── (الفاصل بيظهر بس لو تحته شرايح فعلاً)
  if (work.length) slides.push({ kind: "divider", title: "مبادرات وأهم الإنجازات" }, ...work);
  if (deck.vision.enabled && deck.vision.items) {
    slides.push({ kind: "divider", title: "رؤية التطوير المستقبلية" });
    slides.push({ kind: "list", title: "رؤية التطوير المستقبلية", lead: "", items: lines(deck.vision.items) });
  }
  if (deck.closing.enabled) slides.push({ kind: "closing", text: deck.closing.text || "شكراً" });
  return slides;
}
