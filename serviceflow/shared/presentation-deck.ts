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
  /** شريحة «سنترالات الإدارة» (جدول السنترالات الأربعة) — اختيارية */
  exchangesTable: { enabled: boolean };
  /** showShare: الحصة السوقية فى العرض — مقفولة افتراضياً (المالك ٢٠٢٦-١٠-٢٠: طلعت 104% فغالباً غلط لحد ما تتراجع) */
  customers: { weData: string; marketShare: string; showShare: boolean };
  decentLife: { enabled: boolean; phase1: string; phase2: string; notes: string };
  /** hiddenPt / hiddenRepeat / hiddenIn24: الشهور المخفية من كل مؤشر لوحده «YYYY-MM» مفصولة بفاصلة
   *  (المالك ٢٠٢٦-١٠-٢١: «مش لازم نفس الشهور لكل مؤشرات الأداء» — كانت hiddenMonths واحدة للكل) */
  /** working: شغال كل شهر «YYYY-MM=العدد» مفصولة بفاصلة — الأعطال فى الألف بتتقسم عليه، والفاضى = الشغال الحالى
   *  (المالك ٢٠٢٦-١٠-٢١: القسمة على الشغال الحالى كانت بتظلم الشهور القديمة) */
  faults: { enabled: boolean; hiddenPt: string; hiddenRepeat: string; hiddenIn24: string; working: string };
  // خطة الصيانة: المحقق بس — مفيش مستهدف (المالك ٢٠٢٦-١٠-٢٠)
  maintenance: { enabled: boolean; period: string; achievedCopper: string; achievedMsan: string; photoIds: string[] };
  /** نسبة الحجز وفك المتعذرات — نفس أعمدة تقرير «نسبة الحجز» بتاع منطقة أسيوط (المالك ٢٠٢٦-١٠-٢٠).
   *  مفتاح جديد (كان blocked) عشان الافتراضيات (أرقام الغنايم حتى ١٨ أكتوبر) تتحط فى العرض المحفوظ. */
  booking: { enabled: boolean; asOf: string; total: string; capacity: string; blocked: string; clarify: string;
    noReply: string; otherExchange: string; pct: string;
    /** المقارنة عند الاستلام ← دلوقتى (المالك ٢٠٢٦-١٠-٢١، استلم ١ ديسمبر ٢٠٢٥). الفاضى = الشريحة زى الأول */
    handoverPct: string; handoverLabel: string;
    /** فك المتعذرات: المحلول من إجمالى المتعذرات = المستهدف × المحقق من المستهدف */
    prevLabel: string; prevTarget: string; prevAchieved: string;
    curLabel: string; curTarget: string; curAchieved: string };
  /** مؤشرات تركيبات الصوت (المالك ٢٠٢٦-١٠-٢١، من تقرير المنطقة الشهرى) — صف الغنايم بس، من غير المنطقة */
  installs: { enabled: boolean; period: string; total: string; in24: string; in48: string; in120: string; avgHours: string };
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

/** شغال كل شهر من المالك (٢٠٢٦-١٠-٢١) — قيم مبدئية بتتعدّل من صفحة البيانات */
/** المالك ٢٠٢٦-١٠-٢١: «الشغال من يناير 2025 لأكتوبر 2025 خليه زى شغال نوفمبر 2025» (9781) */
export const EARLY_2025_MONTHS = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10"];
export const DEFAULT_MONTH_WORKING = [
  ...EARLY_2025_MONTHS.map((m) => `${m}=9781`),
  "2025-11=9781", "2025-12=9891", "2026-01=9998", "2026-02=10059", "2026-03=10160", "2026-04=10210",
  "2026-05=10304", "2026-06=10356", "2026-07=10432", "2026-08=10497", "2026-09=10608", "2026-10=10751",
].join(",");

/** اسم الإدارة فى العرض (المالك ٢٠٢٦-١٠-٢١: «أى حاجة فيها إدارة سنترالات الغنايم تبقى إدارة تشغيل الشبكة
 * وعمليات العملاء»). الاسم القديم بيتبدّل كمان فى أى نص محفوظ وقت التحميل (normalizeDeck). */
export const DEPT_NAME = "إدارة تشغيل الشبكة وعمليات العملاء";
const OLD_DEPT_NAME = /[إاأ]دار[ةه]\s+سنترالات\s+الغنايم/g;
export const renameDept = (s: string) => s.replace(OLD_DEPT_NAME, DEPT_NAME);

export function defaultDeck(): Deck {
  return {
    cover: { title: DEPT_NAME, subtitle: "عرض تقديمى", meeting: "", date: "" },
    person: { name: "", birthDate: "", job: `مدير ${DEPT_NAME}`, department: "منطقة أسيوط", sector: "قطاع وسط الصعيد", photoId: "", qualifications: "" },
    career: { enabled: true, hireYear: "", items: "" },
    area: { areaKm2: "", population: "", villages: "", housingUnits: "", mapId: "", extraRows: "" },
    exchanges: DEFAULT_EXCHANGES.map((e) => ({ ...e })),
    customers: { weData: "", marketShare: "", showShare: false },
    exchangesTable: { enabled: true },
    decentLife: { enabled: false, phase1: "", phase2: "", notes: "" },
    faults: { enabled: true, hiddenPt: "", hiddenRepeat: "", hiddenIn24: "", working: DEFAULT_MONTH_WORKING },
    maintenance: { enabled: true, period: "2026", achievedCopper: "", achievedMsan: "", photoIds: [] },
    booking: { enabled: true, asOf: "18 أكتوبر 2026", total: "1267", capacity: "1230", blocked: "36", clarify: "0",
      noReply: "0", otherExchange: "1", pct: "",
      // أرقام المالك (٢٠٢٦-١٠-٢١) — مفاتيح جديدة فبتتحط فى العرض المحفوظ لوحدها، ولو اتمسحت الشريحة ترجع زى الأول
      handoverPct: "88", handoverLabel: "ديسمبر 2025",
      prevLabel: "العام الماضى (لحد نوفمبر 2025)", prevTarget: "50", prevAchieved: "105",
      curLabel: "السنة دى", curTarget: "70", curAchieved: "97.5" },
    // أرقام الغنايم من «تقرير مؤشرات تركيبات الصوت - سبتمبر 2026» — مفتاح جديد فبيتحط فى العرض المحفوظ لوحده
    installs: { enabled: true, period: "سبتمبر 2026", total: "157", in24: "155", in48: "157", in120: "157", avgHours: "6.2" },
    achievements: { enabled: false, items: "", photoIds: [] },
    vision: { enabled: false, items: "" },
    closing: { enabled: true, text: "شكراً لحسن استماعكم" },
    overrides: {},
  };
}

/** بيانات محفوظة قديمة/ناقصة + الافتراضى = Deck كامل (ومفيش حقول غريبة بتتحفظ). */
export function normalizeDeck(raw: any): Deck {
  const d = defaultDeck();
  const str = (v: unknown, max = 4000) => renameDept(typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max));
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
  for (const k of ["cover", "person", "career", "area", "customers", "exchangesTable", "decentLife", "faults", "maintenance", "booking", "installs", "achievements", "vision", "closing"] as const) {
    (d as any)[k] = pick((d as any)[k], raw[k]);
  }
  // عرض محفوظ قبل ما الفترة تبدأ من يناير 2025: شهور يناير–أكتوبر 2025 كلها فاضية ⇒ بتاخد شغال نوفمبر 2025
  {
    const w = parseMonthWorking(d.faults.working);
    const nov = w.get("2025-11");
    if (nov != null && EARLY_2025_MONTHS.every((m) => !w.has(m))) {
      for (const m of EARLY_2025_MONTHS) w.set(m, nov);
      d.faults.working = serializeMonthWorking(w);
    }
  }
  // عرض محفوظ قبل فصل الشهور (كان فيه عمود «يظهر» واحد للكل): بياخد اختيار المالك الجديد — ٨ شهور لكل رسم
  // (OWNER_FAULT_MONTHS) — مرة واحدة بس، ولو العرض فيه اختيار لكل مؤشر خلاص مابنلمسهوش.
  // ولو اختيار المالك مش متاح (مفيش) يرجع للاختيار القديم الواحد لكل مؤشر عشان مفيش حاجة تبوظ.
  if (raw.faults && typeof raw.faults === "object") {
    const legacyHidden = typeof raw.faults.hiddenMonths === "string" ? str(raw.faults.hiddenMonths) : "";
    const months = periodMonths(new Date());
    for (const ind of Object.keys(HIDDEN_KEY) as FaultIndicator[]) {
      const k = HIDDEN_KEY[ind];
      if (raw.faults[k] !== undefined) continue;
      const pick = new Set(OWNER_FAULT_MONTHS[ind] || []);
      d.faults[k] = pick.size ? months.filter((m) => !pick.has(m)).join(",") : legacyHidden;
    }
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
  faultsByYear: { year: string; complaints: number; repeatPct: number | null; in24Pct: number | null }[];
  /** نفس المؤشرات شهر بشهر (YYYY-MM) — لو الفترة سنة واحدة الرسم بيبقى بالشهور */
  /** complaints/repeatPct/in24Pct: أعطال السنترال (exchange_name)؛ msanFaults: زى تقرير «عدد الأعطال فى الألف».
   *  الأعطال فى الألف بتتحسب هنا (monthPerThousand) على شغال الشهر — مش فى السيرفر */
  faultsByMonth?: { month: string; complaints: number; repeatPct: number | null; in24Pct: number | null;
    msanFaults: number | null;
    /** العدّ الخام (للمتوسط المرجّح للفترة): المغلقة · عدد الأرقام المغلقة · اللى اتشال خلال ٢٤ ساعة */
    closed?: number; phones?: number; in24?: number }[];
  /** الشغال (fbb_subs من آخر ملف FTTH/ADSL) اللى الأعطال فى الألف بتتقسم عليه */
  faultsWorking?: number | null;
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
  | { kind: "chart"; title: string; seriesLabel: string; unit: string; points: { label: string; value: number }[]; note: string;
      /** خط أفقى متقطّع عند قيمة أول شهر ظاهر (المالك: «عند الاستلام») */
      baseline?: { value: number; label: string } | null;
      /** «متوسط ديسمبر 2025 – سبتمبر 2026: X مقابل Y فى نوفمبر 2025» */
      avgNote?: string }
  | { kind: "photos"; title: string; photoIds: string[] }
  | { kind: "closing"; text: string }
  /** مقارنة قبل ← بعد (نسبة الحجز وفك المتعذرات)، وتحتها جدول التفاصيل */
  | { kind: "compare"; title: string; panels: ComparePanel[]; table: { columns: string[]; rows: string[][] } | null };
/** أماكن شريحة المقارنة على لوحة ١٢٨٠×٧٢٠ — واحدة للشاشة والباور بوينت */
export function compareLayout(n: number) {
  const gap = 60, total = 1160;
  const panelW = n <= 1 ? 760 : (total - gap * (n - 1)) / n;
  const startRight = n <= 1 ? 1280 - (1280 - panelW) / 2 : 1220;   // أول لوحة يمين
  const cardW = (panelW - 60) / 2;
  return {
    panelW, cardW, cardH: 150, cardTop: 165, tableTop: 505,
    xOf: (i: number) => startRight - panelW - i * (panelW + gap),   // left لكل لوحة
  };
}
export type ComparePanel = { heading: string; before: { label: string; value: string }; after: { label: string; value: string }; delta: string; note: string };

/** نسبة الحجز = الإمكانية ÷ إجمالى الطلبات — إلا لو مكتوبة */
export function bookingPct(b: Deck["booking"]): string {
  if (b.pct.trim()) return b.pct.trim();
  const n = (x: string) => Number(String(x).replace(/[,٬\s]/g, ""));
  const t = n(b.total), c = n(b.capacity);
  return t > 0 && c >= 0 && Number.isFinite(c) ? `${Math.round((100 * c) / t)}%` : "";
}

/** صفوف شريحة التركيبات: العدد خلال كل مدة + نسبته من الإجمالى (مقرّبة لأقرب رقم صحيح زى تقرير المنطقة) */
export function installsRows(i: Deck["installs"]): string[][] {
  const total = parseNum(i.total);
  const fmt = (x: string) => { const n = parseNum(x); return n == null ? "" : n.toLocaleString("en-US"); };
  const pct = (x: string) => { const n = parseNum(x); return n != null && total ? `${Math.round((100 * n) / total)}%` : ""; };
  const rows = [
    ["إجمالى التركيبات", fmt(i.total), ""],
    ["التركيب خلال 24 ساعة", fmt(i.in24), pct(i.in24)],
    ["التركيب خلال 48 ساعة", fmt(i.in48), pct(i.in48)],
    ["التركيب خلال 120 ساعة", fmt(i.in120), pct(i.in120)],
    ["متوسط زمن التركيب", parseNum(i.avgHours) != null ? `${parseNum(i.avgHours)} ساعة` : "", ""],
  ];
  return rows.filter((r) => r[1]);
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

/** رقم من نص المالك: بيقبل الأرقام العربى (٨٨) و«٫» و«،» و«%» */
export function parseNum(v: unknown): number | null {
  const t = String(v ?? "").trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, ".").replace(/[,،٬\s%٪]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
/** شغال كل شهر من صفحة البيانات «YYYY-MM=العدد» */
export function parseMonthWorking(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of String(s || "").split(",")) {
    const [m, v] = part.split("=").map((x) => (x || "").trim());
    const n = parseNum(v);
    if (/^\d{4}-\d{2}$/.test(m) && n != null && n > 0) out.set(m, n);
  }
  return out;
}
export function serializeMonthWorking(m: Map<string, number | string>): string {
  return [...m.entries()].filter(([, v]) => String(v).trim()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${String(v).trim()}`).join(",");
}
/** شغال الشهر: المكتوب بإيد المالك، وإلا الشغال الحالى (آخر ملف مشتركين) */
export function monthWorking(deck: Deck, auto: DeckAuto | null, month: string): number | null {
  return parseMonthWorking(deck.faults.working).get(month) ?? (auto?.faultsWorking || null);
}
/** الأعطال فى الألف = أعطال الشهر ÷ شغال الشهر × 1000 (رقم عشرى واحد) */
export function monthPerThousand(deck: Deck, auto: DeckAuto | null, m: { month: string; msanFaults: number | null }): number | null {
  const w = monthWorking(deck, auto, m.month);
  if (m.msanFaults == null || !w) return null;
  return Math.round((10000 * m.msanFaults) / w) / 10;
}

/** «+9 نقاط» / «+15.75 نقطة» */
const fmtNum = (n: number) => String(Number(n.toFixed(2)));
export function pointsDelta(d: number): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  const a = Math.abs(d);
  const word = Number.isInteger(Number(a.toFixed(2))) && a >= 3 && a <= 10 ? "نقاط" : "نقطة";
  // \u200E (LRM): من غيرها الإشارة بتطلع بعد الرقم فى السطر العربى («9+ نقاط»)
  return `\u200E${sign}${fmtNum(a)} ${word}`;
}
/** مقارنة نسبة الحجز وفك المتعذرات (عند الاستلام ← دلوقتى). الخانات الفاضية/الناقصة ⇒ مفيش لوحة */
export function bookingCompare(b: Deck["booking"]): ComparePanel[] {
  const panels: ComparePanel[] = [];
  const h = parseNum(b.handoverPct), now = parseNum(bookingPct(b));
  if (h != null && now != null) {
    panels.push({ heading: "نسبة الحجز",
      before: { label: `عند الاستلام${b.handoverLabel.trim() ? ` (${b.handoverLabel.trim()})` : ""}`, value: `${fmtNum(h)}%` },
      after: { label: b.asOf.trim() ? `حالياً (حتى ${b.asOf.trim()})` : "حالياً", value: `${fmtNum(now)}%` },
      delta: pointsDelta(now - h), note: "نسبة الحجز = الإمكانية ÷ إجمالى الطلبات" });
  }
  const pt = parseNum(b.prevTarget), pa = parseNum(b.prevAchieved), ct = parseNum(b.curTarget), ca = parseNum(b.curAchieved);
  if (pt != null && pa != null && ct != null && ca != null) {
    // الرقم الكبير = الصافى (المستهدف × المحقق) — مش المحقق لوحده (١٠٥٪ ← ٩٧٫٥٪ كان هيبان كأنه نزل)
    const prev = (pt * pa) / 100, cur = (ct * ca) / 100;
    panels.push({ heading: "فك المتعذرات (المحلول من إجمالى المتعذرات)",
      before: { label: b.prevLabel.trim() || "العام الماضى", value: `${fmtNum(prev)}%` },
      after: { label: b.curLabel.trim() || "السنة دى", value: `${fmtNum(cur)}%` },
      delta: pointsDelta(cur - prev),
      note: `المستهدف اترفع من ${fmtNum(pt)}% إلى ${fmtNum(ct)}% · المحقق من المستهدف ${fmtNum(pa)}% ثم ${fmtNum(ca)}%` });
  }
  return panels;
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

/** أول شهر فى فترة مؤشرات الأعطال — المالك ٢٠٢٦-١٠-٢١: «من يناير 2025 لحد أكتوبر 2026» (لحد الشهر الحالى).
 *  كانت ١٢ شهر قبل الشهر الحالى. */
export const FAULTS_FROM_MONTH = "2025-01";
export function faultsStartMonth(_now: Date): string {
  return FAULTS_FROM_MONTH;
}
/** شهور الفترة من يناير 2025 لحد الشهر الحالى (UTC) */
export function periodMonths(now: Date): string[] {
  const end = now.toISOString().slice(0, 7);
  const out: string[] = [];
  let [y, m] = FAULTS_FROM_MONTH.split("-").map(Number);
  for (let k = 0; k < 600; k++) {
    const s = `${y}-${String(m).padStart(2, "0")}`;
    if (s > end) break;
    out.push(s);
    m === 12 ? (y++, m = 1) : m++;
  }
  return out;
}

/** المالك استلم الإدارة ١ ديسمبر ٢٠٢٥ ⇒ نوفمبر 2025 = «عند الاستلام»، والمتوسط من ديسمبر 2025 لسبتمبر 2026 */
export const HANDOVER_MONTH = "2025-11";
export const AVG_FROM = "2025-12";
export const AVG_TO = "2026-09";

/** اختيار المالك (٢٠٢٦-١٠-٢١) — ٨ شهور لكل رسم. بيتحط فى العرض المحفوظ مرة واحدة لو مفيهوش اختيار لكل مؤشر */
export const OWNER_FAULT_MONTHS: Record<FaultIndicator, string[]> = {
  pt: ["2025-11", "2025-12", "2026-02", "2026-03", "2026-04", "2026-06", "2026-07", "2026-08"],
  repeat: ["2025-11", "2025-12", "2026-02", "2026-03", "2026-04", "2026-06", "2026-07", "2026-08"],
  in24: ["2025-11", "2025-12", "2026-02", "2026-03", "2026-04", "2026-07", "2026-08", "2026-09"],
};

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
/** متوسط الفترة (ديسمبر 2025 – سبتمبر 2026) لكل مؤشر — على كل شهور الفترة مش الظاهرة بس — وقيمة نوفمبر 2025:
 *  · الأعطال فى الألف: متوسط قيم الشهور (كل شهر على شغاله)
 *  · التكرار: مرجّح = Σ(المغلقة − عدد الأرقام) ÷ Σ عدد الأرقام — نفس تعريف «إحصائيات التكرار»
 *  · الإزالة: مرجّح = Σ اللى اتشال خلال ٢٤ ساعة ÷ Σ الأعطال — نفس تعريف «إحصائيات الإزالة» */
export function periodAverage(deck: Deck, auto: DeckAuto | null, ind: FaultIndicator): { avg: number | null; handover: number | null; method: string } {
  const all = auto?.faultsByMonth || [];
  const inRange = all.filter((m) => m.month >= AVG_FROM && m.month <= AVG_TO);
  const nov = all.find((m) => m.month === HANDOVER_MONTH);
  if (ind === "pt") {
    const v = inRange.map((m) => monthPerThousand(deck, auto, m)).filter((x): x is number => x != null);
    return { avg: v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 2) : null,
      handover: nov ? monthPerThousand(deck, auto, nov) : null, method: "متوسط قيم الشهور" };
  }
  if (ind === "repeat") {
    const ok = inRange.filter((m) => m.closed != null && m.phones != null);
    const ph = ok.reduce((a, m) => a + (m.phones || 0), 0);
    const rep = ok.reduce((a, m) => a + ((m.closed || 0) - (m.phones || 0)), 0);
    return { avg: ph > 0 ? round((100 * rep) / ph, 1) : null, handover: nov?.repeatPct ?? null,
      method: "مرجّح: التكرار ÷ الأرقام" };
  }
  const ok = inRange.filter((m) => m.in24 != null);
  const n = ok.reduce((a, m) => a + m.complaints, 0);
  const in24 = ok.reduce((a, m) => a + (m.in24 || 0), 0);
  return { avg: n > 0 ? round((100 * in24) / n, 1) : null, handover: nov?.in24Pct ?? null,
    method: "مرجّح: المُزال خلال 24 ساعة ÷ الأعطال" };
}
export function periodAverageNote(deck: Deck, auto: DeckAuto | null, ind: FaultIndicator, unit: string): string {
  const { avg, handover, method } = periodAverage(deck, auto, ind);
  if (avg == null) return "";
  const vs = handover != null ? ` مقابل ${handover}${unit} فى ${monthLabel(HANDOVER_MONTH, "full")}` : "";
  return `متوسط ${monthLabel(AVG_FROM, "full")} – ${monthLabel(AVG_TO, "full")}: ${avg}${unit}${vs} (${method})`;
}

/** ملف «جداول المتوسطات» (المالك ٢٠٢٦-١٠-٢١: «الجداول التفصيلية لحساب المتوسط اعملها فى ملف باور بوينت لوحدها»).
 *  لكل مؤشر: نوفمبر 2025 (عند الاستلام) ← كل شهر من ديسمبر 2025 لسبتمبر 2026 ← صف أخير بالمتوسط/الإجمالى المرجّح.
 *  الصف الأخير بيتحسب من periodAverage نفسها — نفس الرقم اللى تحت الرسم بالظبط. */
export function averageSlides(deck: Deck, auto: DeckAuto | null): Slide[] {
  const all = auto?.faultsByMonth || [];
  const nov = all.filter((m) => m.month === HANDOVER_MONTH);
  const range = all.filter((m) => m.month >= AVG_FROM && m.month <= AVG_TO);
  const span = `${monthLabel(AVG_FROM, "full")} – ${monthLabel(AVG_TO, "full")}`;
  const n = (x: number | null | undefined, d = 0) => (x == null ? "—" : Number(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const name = (m: string) => monthLabel(m, "full") + (m === HANDOVER_MONTH ? " (عند الاستلام)" : "");
  // صف أخير بكلمة واحدة (سطر واحد) — والفترة مكتوبة فى العنوان والملاحظة
  const out: Slide[] = [{ kind: "cover", title: "جداول حساب المتوسطات", subtitle: deck.cover.title,
    meeting: `مؤشرات الأداء: متوسط ${span} مقابل ${monthLabel(HANDOVER_MONTH, "full")} (عند الاستلام)`, date: deck.cover.date }];

  const pt = periodAverage(deck, auto, "pt");
  const ptRows = [...nov, ...range].filter((m) => monthPerThousand(deck, auto, m) != null)
    .map((m) => [name(m.month), n(m.msanFaults), n(monthWorking(deck, auto, m.month)), n(monthPerThousand(deck, auto, m), 1)]);
  if (ptRows.length) out.push({ kind: "table", title: "الأعطال فى الألف — شهر بشهر", columns: ["الشهر", "عدد الأعطال", "الشغال", "الأعطال فى الألف"],
    rows: [...ptRows, ["المتوسط", "", "", n(pt.avg, 2)]], imageId: "", totalLast: true,
    note: `أعطال الشهر ÷ شغال الشهر × 1000 — المتوسط = متوسط قيم ${span}` });

  const rp = periodAverage(deck, auto, "repeat");
  const rpOk = (m: (typeof all)[number]) => m.closed != null && m.phones != null;
  const rpRows = [...nov, ...range].filter(rpOk).map((m) => [name(m.month), n(m.closed), n(m.phones), n((m.closed || 0) - (m.phones || 0)), `${n(m.repeatPct, 1)}%`]);
  const rpSum = (k: (m: (typeof all)[number]) => number) => range.filter(rpOk).reduce((a, m) => a + k(m), 0);
  if (rpRows.length) out.push({ kind: "table", title: "نسبة التكرار — شهر بشهر", columns: ["الشهر", "الأعطال المغلقة", "عدد الأرقام", "التكرار", "نسبة التكرار"],
    rows: [...rpRows, ["الإجمالى", n(rpSum((m) => m.closed || 0)), n(rpSum((m) => m.phones || 0)),
      n(rpSum((m) => (m.closed || 0) - (m.phones || 0))), rp.avg == null ? "—" : `${n(rp.avg, 1)}%`]], imageId: "", totalLast: true,
    note: `التكرار = المغلقة − عدد الأرقام · النسبة = التكرار ÷ عدد الأرقام · الإجمالى = ${span}` });

  const rm = periodAverage(deck, auto, "in24");
  const rmOk = (m: (typeof all)[number]) => m.in24 != null;
  const rmRows = [...nov, ...range].filter(rmOk).map((m) => [name(m.month), n(m.complaints), n(m.in24), `${n(m.in24Pct, 1)}%`]);
  const rmSum = (k: (m: (typeof all)[number]) => number) => range.filter(rmOk).reduce((a, m) => a + k(m), 0);
  if (rmRows.length) out.push({ kind: "table", title: "الإزالة خلال 24 ساعة — شهر بشهر", columns: ["الشهر", "إجمالى الأعطال", "المُزال خلال 24 ساعة", "النسبة"],
    rows: [...rmRows, ["الإجمالى", n(rmSum((m) => m.complaints)), n(rmSum((m) => m.in24 || 0)), rm.avg == null ? "—" : `${n(rm.avg, 1)}%`]],
    imageId: "", totalLast: true, note: `النسبة = المُزال خلال 24 ساعة ÷ إجمالى الأعطال · الإجمالى = ${span}` });
  return out;
}

/** هندسة الرسم الخطى — الصفحة (DeckSlide) والباور بوينت بيرسموا من نفس الأرقام بالظبط.
 *  المحور مش من الصفر: من تحت أقل قيمة لفوق أعلى قيمة بهامش، عشان الفرق بين الشهور يبان.
 *  أسماء الشهور ≈ ٦٠٪ من خط القيم ولون رمادى فاتح (المالك: «موجودة بس مش لافتة للنظر»). */
export const LINE_CHART = { x0: 150, W: 980, y0: 515, H: 315, noteY: 578, avgY: 606, monthColor: "9AA0A6", valueColor: "111111", lineColor: "00B0F0" };
export function lineChartGeom(points: { label: string; value: number }[], unit: string, baseline?: number | null) {
  const { x0, W, y0, H } = LINE_CHART;
  const n = Math.max(1, points.length);
  const vals = points.map((p) => p.value).concat(baseline != null ? [baseline] : []);
  const min = vals.length ? Math.min(...vals) : 0, max = vals.length ? Math.max(...vals) : 1;
  const span = Math.max(max - min, Math.abs(max) * 0.05, 1);
  const rawStep = (span * 1.7) / 4;
  const pow = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((k) => k >= rawStep) || 10 * pow;
  let lo = Math.floor((min - span * 0.35) / step) * step;
  const hi = Math.ceil((max + span * 0.35) / step) * step;
  if (lo < 0 && min >= 0) lo = 0;
  const y = (v: number) => y0 - ((v - lo) / (hi - lo || 1)) * H;
  const ticks: { y: number; text: string }[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push({ y: y(v), text: `${round(v, step < 1 ? 1 : 0)}${unit}` });
  const valueFs = n <= 8 ? 22 : n <= 13 ? 18 : 14;
  const dec = points.some((p) => !Number.isInteger(p.value)) ? 1 : 0;
  const labelFs = Math.max(9, Math.round(valueFs * 0.6));
  const split = n > 13;
  return {
    ticks, valueFs, labelFs, split,
    // كل القيم بنفس عدد العلامات العشرية (27.0 مش 27 جنب 27.9 — زى أرقام المالك)
    pts: points.map((p, i) => ({ cx: x0 + (W / n) * (i + 0.5), cy: y(p.value), text: `${p.value.toFixed(dec)}${unit}`,
      label: split ? splitChartLabel(p.label) : [p.label] })),
    baselineY: baseline != null ? y(baseline) : null,
  };
}

/** «سبتمبر 25» ⇒ ["سبتمبر", "25"] */
export const splitChartLabel = (l: string) => {
  const i = l.lastIndexOf(" ");
  return i > 0 ? [l.slice(0, i), l.slice(i + 1)] : [l];
};
/** «2026-09» ⇒ «سبتمبر» / «سبتمبر 26» / «سبتمبر 2026» */
export function monthLabel(m: string, year: "none" | "short" | "full"): string {
  const name = MONTHS[Number(m.slice(5, 7)) - 1] || m;
  return year === "none" ? name : `${name} ${year === "short" ? m.slice(2, 4) : m.slice(0, 4)}`;
}
/** مؤشرات الأعطال — كل واحد بشهوره: الأعطال فى الألف (الرسم + جدول الشغال) · التكرار · الإزالة خلال ٢٤ ساعة */
export type FaultIndicator = "pt" | "repeat" | "in24";
export const HIDDEN_KEY = { pt: "hiddenPt", repeat: "hiddenRepeat", in24: "hiddenIn24" } as const;
export const hiddenFaultMonths = (deck: Deck, ind: FaultIndicator) =>
  new Set(deck.faults[HIDDEN_KEY[ind]].split(",").map((x) => x.trim()).filter(Boolean));
/** شهور المؤشر: اللى فيها أعطال، فى الفترة، ومش مخفية من المؤشر ده، وليها قيمة فيه */
export function visibleFaultMonths(deck: Deck, auto: DeckAuto | null, ind: FaultIndicator) {
  const hidden = hiddenFaultMonths(deck, ind);
  return (auto?.faultsByMonth || []).filter((m) => !hidden.has(m.month)
    && (ind === "pt" ? monthPerThousand(deck, auto, m) != null : ind === "repeat" ? m.repeatPct != null : m.in24Pct != null));
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

  const ptMonths = visibleFaultMonths(deck, auto, "pt");
  const repMonths = visibleFaultMonths(deck, auto, "repeat");
  const in24Months = visibleFaultMonths(deck, auto, "in24");
  const showFaults = deck.faults.enabled && (ptMonths.length + repMonths.length + in24Months.length) > 0;
  // المالك ٢٠٢٦-١٠-٢١: «بلاش مبادرات وأهم الإنجازات» (مالهاش سطر فى الأجندة ولا فاصل)، و«خلى الصيانة
  // وفك المتعذرات يبقوا جوّه مؤشرات الأداء» — فقسم الأداء بيظهر لو فيه أعطال أو صيانة أو حجز
  const perfExtra: Slide[] = [];
  const achv: Slide[] = [];
  // المالك ٢٠٢٦-١٠-٢١: «اعمل سلايد لنسبة التركيبات وخليها جوّه مؤشرات الأداء» — بعد الأعطال على طول
  const ins = deck.installs;
  const insRows = ins.enabled ? installsRows(ins) : [];
  if (insRows.length > 1) perfExtra.push({ kind: "table", title: `مؤشرات تركيبات الصوت${ins.period ? ` - ${ins.period}` : ""}`,
    columns: ["المؤشر", "العدد", "النسبة"], rows: insRows, imageId: "", note: "النسبة = التركيبات خلال المدة ÷ إجمالى التركيبات", totalLast: false });
  const m = deck.maintenance;
  if (m.enabled) {
    const doneYear = auto?.maintenance?.byYear.find((y) => y.year === m.period)?.done;
    const achievedBoxes = deck.overrides["total.maintBoxes"] || (doneYear != null ? String(doneYear) : "");
    const rows = [
      ["البكسيات", v("total", "boxes"), achievedBoxes],
      ["الكباين النحاسية", v("total", "copperCabinets"), m.achievedCopper],
      ["كباين MSAN", v("total", "msanCabinets"), m.achievedMsan],
    ].filter((r) => String(r[2]).trim());
    if (rows.length) perfExtra.push({ kind: "table", title: `خطة الصيانة ورفع الكفاءة ${m.period}`, columns: ["البيان", "إجمالى الشبكة", "المحقق"], rows, imageId: "", note: "", totalLast: false });
    if (m.photoIds.length) perfExtra.push({ kind: "photos", title: "بعض صور أعمال الصيانة", photoIds: m.photoIds });
  }
  const b = deck.booking;
  if (b.enabled && (b.total || b.capacity || b.blocked)) {
    const title = `نسبة الحجز وفك المتعذرات${b.asOf ? ` حتى ${b.asOf}` : ""}`;
    const columns = ["إجمالى الطلبات", "إجمالى الإمكانية", "متعذر", "توضيح عنوان", "بدون رد", "العنوان لا يتبع السنترال", "نسبة الحجز"];
    // المالك ٢٠٢٦-١٠-٢٠: «احذف المقارنة بأسيوط — أنا ليا نتيجتى فقط»
    const rows = [[b.total, b.capacity, b.blocked, b.clarify, b.noReply, b.otherExchange, bookingPct(b)]];
    // المالك ٢٠٢٦-١٠-٢١: عند الاستلام ← دلوقتى. لو خانات المقارنة فاضية ⇒ الجدول زى ما كان بالظبط
    const panels = bookingCompare(b);
    if (panels.length) perfExtra.push({ kind: "compare", title, panels, table: { columns, rows } });
    else perfExtra.push({ kind: "table", title, columns, rows, imageId: "", note: "", totalLast: false });
  }
  if (deck.achievements.enabled && (deck.achievements.items || deck.achievements.photoIds.length)) {
    if (deck.achievements.items) achv.push({ kind: "list", title: "أهم الإنجازات", lead: "", items: lines(deck.achievements.items) });
    if (deck.achievements.photoIds.length) achv.push({ kind: "photos", title: "من الإنجازات", photoIds: deck.achievements.photoIds });
  }
  const showPerf = showFaults || perfExtra.length > 0;
  const agenda = [`نبذة عن ${DEPT_NAME}`, ...(showPerf ? ["مؤشرات ومعدلات الأداء"] : []),
    ...(deck.vision.enabled && deck.vision.items ? ["رؤية التطوير المستقبلية"] : [])];
  slides.push({ kind: "agenda", title: "الأجندة", items: agenda });

  // ── نبذة ──
  slides.push({ kind: "divider", title: `نبذة عن ${DEPT_NAME}` });
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
    // المالك ٢٠٢٦-١٠-٢٠: الشغال صوت والشغال داتا «من قاعدة العملاء» (ملف مشتركى FTTH/ADSL: fv_subs / fbb_subs
    // بكود MSAN كباين الإدارة — نفس «الشغال» بتاع تقرير الأعطال فى الألف)، وعملاء WE والحصة اتشالوا.
    ["عدد الخطوط الشغالة صوت", v("total", "msanVoice")],
    ["عدد الخطوط الشغالة داتا", v("total", "msanData")],
    ...(deck.decentLife.enabled ? [
      ["عدد قرى حياة كريمة مرحلة أولى", deck.decentLife.phase1],
      ["عدد قرى حياة كريمة مرحلة ثانية", deck.decentLife.phase2],
    ] : []),
    ...pairs(a.extraRows),
  ].filter(([, x]) => String(x).trim());
  slides.push({ kind: "table", title: deck.cover.title, columns: ["البيان", deck.cover.title], rows: overview, imageId: a.mapId,
    note: deck.decentLife.enabled ? deck.decentLife.notes : "", totalLast: false });
  // شريحة «العملاء» اتشالت (المالك ٢٠٢٦-١٠-٢٠: «السلايد دى شيلها»)

  const exRows = deck.exchanges.map((e) => [exName(e), e.code, v(e.code, "lines"), v(e.code, "copperCabinets"), v(e.code, "msanCabinets"), v(e.code, "boxes"), v(e.code, "msanVoice"), v(e.code, "msanData")]);
  exRows.push(["الإجمالى", "", v("total", "lines"), v("total", "copperCabinets"), v("total", "msanCabinets"), v("total", "boxes"), v("total", "msanVoice"), v("total", "msanData")]);
  // اختيارية (المالك ٢٠٢٦-١٠-٢٠: «خلى السلايد دى اختيارية تظهر ولا لأ»)
  if (deck.exchangesTable.enabled) slides.push({ kind: "table", title: "سنترالات الإدارة", columns: ["السنترال", "الكود", "الخطوط", "كباين نحاس", "كباين MSAN", "البكسيات", "صوت MSAN", "داتا MSAN"], rows: exRows, imageId: "", note: "", totalLast: true });

  // ── الأداء ──
  if (showPerf) slides.push({ kind: "divider", title: "مؤشرات ومعدلات الأداء" });
  if (showFaults && auto) {
    // كل شهر محسوب لوحده (الشهر الحالى من أوله لحد النهارده)، وكل مؤشر بشهوره هو — المالك بيخفى أى شهر من أى مؤشر
    const cur = (auto.computedAt || new Date().toISOString()).slice(0, 7);
    const months = (fm: typeof ptMonths) => {
      const sameYear = fm.every((m) => m.month.slice(0, 4) === fm[0].month.slice(0, 4));
      return {
        label: (m: string) => monthLabel(m, sameYear ? "none" : "short"),
        span: fm.length === 1 ? monthLabel(fm[0].month, "full") : `${monthLabel(fm[0].month, "full")} – ${monthLabel(fm[fm.length - 1].month, "full")}`,
        partial: fm[fm.length - 1].month === cur
          ? ` · ${monthLabel(cur, "none")} من أوله لحد ${Number((auto.computedAt || "").slice(8, 10)) || ""} ${monthLabel(cur, "none")}` : "",
      };
    };
    // خط «عند الاستلام» عند قيمة أول شهر ظاهر (نوفمبر 2025 فى اختيار المالك)
    const base = (fm: typeof ptMonths, val: (m: (typeof ptMonths)[number]) => number) =>
      ({ value: val(fm[0]), label: fm[0].month === HANDOVER_MONTH ? "عند الاستلام" : `أول شهر: ${monthLabel(fm[0].month, "full")}` });
    // المالك ٢٠٢٦-١٠-٢١: الأعطال فى الألف على شغال كل شهر (المكتوب فى صفحة البيانات، والفاضى = الشغال الحالى)
    if (ptMonths.length) {
      const { label, span, partial } = months(ptMonths);
      slides.push({ kind: "chart", title: `عدد الأعطال فى الألف شهرياً (${span})`, seriesLabel: "أعطال لكل ١٠٠٠ مشترك شغال", unit: "",
        points: ptMonths.map((m) => ({ label: label(m.month), value: monthPerThousand(deck, auto, m)! })),
        note: `الأعطال فى الألف محسوبة على عدد الشغال فى كل شهر${partial}`,
        baseline: base(ptMonths, (m) => monthPerThousand(deck, auto, m)!), avgNote: periodAverageNote(deck, auto, "pt", "") });
      // جدول «الأعطال مقارنة بالشغال» اتشال من العرض (المالك ٢٠٢٦-١٠-٢١) — التفاصيل فى ملف «جداول المتوسطات» (averageSlides)
    }
    if (repMonths.length) {
      const { label, span, partial } = months(repMonths);
      slides.push({ kind: "chart", title: `نسب تكرار الأعطال شهرياً (${span})`, seriesLabel: "نسبة التكرار", unit: "%",
        points: repMonths.map((m) => ({ label: label(m.month), value: m.repeatPct as number })),
        note: `كل شهر محسوب لوحده: (الأعطال المغلقة − عدد الأرقام) ÷ عدد الأرقام${partial}`,
        baseline: base(repMonths, (m) => m.repeatPct as number), avgNote: periodAverageNote(deck, auto, "repeat", "%") });
    }
    if (in24Months.length) {
      const { label, span, partial } = months(in24Months);
      slides.push({ kind: "chart", title: `نتائج إزالة الأعطال خلال 24 ساعة شهرياً (${span})`, seriesLabel: "الإزالة خلال 24 ساعة", unit: "%",
        points: in24Months.map((m) => ({ label: label(m.month), value: m.in24Pct as number })),
        note: `كل شهر محسوب لوحده: من إجمالى الأعطال المبلّغة فى الشهر — زى «إحصائيات الإزالة»${partial}`,
        baseline: base(in24Months, (m) => m.in24Pct as number), avgNote: periodAverageNote(deck, auto, "in24", "%") });
    }
  }

  // الصيانة وفك المتعذرات جوّه قسم الأداء بعد الأعطال، والإنجازات بعدهم من غير فاصل
  slides.push(...perfExtra, ...achv);
  if (deck.vision.enabled && deck.vision.items) {
    slides.push({ kind: "divider", title: "رؤية التطوير المستقبلية" });
    slides.push({ kind: "list", title: "رؤية التطوير المستقبلية", lead: "", items: lines(deck.vision.items) });
  }
  if (deck.closing.enabled) slides.push({ kind: "closing", text: deck.closing.text || "شكراً" });
  return slides;
}
