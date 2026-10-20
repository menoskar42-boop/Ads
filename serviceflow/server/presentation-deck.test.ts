// «العرض التقديمى» (المالك ٢٠٢٦-١٠-٢٠) — البيانات المكتوبة + الأرقام التلقائية + الشرايح
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSlides, defaultDeck, normalizeDeck, deckValue, type DeckAuto } from "../shared/presentation-deck";
import { autoDeck } from "./presentation-deck";

const src = readFileSync(new URL("./presentation-deck.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");

const ZERO = { lines: 0, copperCabinets: 0, msanCabinets: 0, boxes: 0, capacity: 0, msanVoice: 0, msanData: 0, accounts: 0, dataUsed: 0, voiceUsed: 0, weData: 0 };
const auto: DeckAuto = {
  exchanges: { GHNAT: { ...ZERO, lines: 5000, boxes: 300 }, AMZAT: { ...ZERO, lines: 1200 }, DRGAT: { ...ZERO }, NGOAT: { ...ZERO } },
  total: { ...ZERO, lines: 6200, boxes: 300 },
  faultsByYear: [],
  faultsByMonth: [{ month: "2025-12", complaints: 900, repeatPct: 12.5, in24Pct: 80, msanFaults: null, perThousand: null }, { month: "2026-01", complaints: 700, repeatPct: 9.1, in24Pct: 88, msanFaults: null, perThousand: null }],
  maintenance: { boxesTotal: 1000, boxesDone: 214, byYear: [{ year: "2026", done: 214 }] },
  decentLife: [], errors: [], computedAt: "",
};
const kinds = (d = defaultDeck(), a: DeckAuto | null = auto) => buildSlides(d, a).map((s) => s.kind + ":" + ("title" in s ? s.title : ""));

test("قراية بس، والمسارات كلها للسوبر أدمن، والتاب للسوبر أدمن", () => {
  assert.doesNotMatch(src, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+|TRUNCATE)\b/i);
  for (const r of [`app.get("/api/presentation"`, `app.put("/api/presentation"`, `app.post("/api/presentation/image"`,
    `app.get("/api/presentation/image/:id"`, `app.delete("/api/presentation/image/:id"`]) {
    assert.ok(routes.includes(`${r}, requireAuth, requireSuperAdmin`), r);
  }
  assert.match(dash, /reportTab === "presentation"\s+&& isSuperAdmin && <PresentationReport \/>/);
  assert.match(dash, /\(g\.label !== "العرض التقديمى" \|\| isSuperAdmin\)/);
});

test("الأقسام الاختيارية (حياة كريمة · الإنجازات · رؤية التطوير) مقفولة افتراضياً وبتظهر لما تتفتح", () => {
  const off = kinds();
  assert.ok(!off.some((k) => k.includes("رؤية التطوير") || k === "list:أهم الإنجازات"));
  assert.equal(off[0], "cover:" + defaultDeck().cover.title);
  assert.equal(off[off.length - 1], "closing:");
  assert.ok(off.includes("divider:مؤشرات ومعدلات الأداء"));
  // الصيانة مفتوحة افتراضياً — المحقق من برنامج الصيانة (٢١٤) بيطلع جدولها
  assert.ok(off.includes("table:خطة الصيانة ورفع الكفاءة 2026"));
  // ومن غير أى بيانات ماينفعش يطلع فاصل «مبادرات» فاضى ولا يتكتب فى الأجندة
  const bareDeck = defaultDeck(); bareDeck.booking.enabled = false;
  const bare = buildSlides(bareDeck, null);
  assert.ok(!bare.some((s) => s.kind === "divider" && s.title === "مبادرات وأهم الإنجازات"));
  assert.ok(!bare.some((s) => s.kind === "agenda" && s.items.includes("مبادرات وأهم الإنجازات")));

  const d = defaultDeck();
  d.vision = { enabled: true, items: "FTTH لكل القرى\nتحديث الكباين" };
  d.achievements = { enabled: true, items: "صيانة ٢١٤ بكس", photoIds: [] };
  d.decentLife = { enabled: true, phase1: "12 قرية", phase2: "8 قرى", notes: "" };
  const on = buildSlides(d, auto);
  const vision = on.find((s) => s.kind === "list" && s.title === "رؤية التطوير المستقبلية");
  assert.deepEqual(vision && "items" in vision ? vision.items : null, ["FTTH لكل القرى", "تحديث الكباين"]);
  assert.ok(on.some((s) => s.kind === "list" && s.title === "أهم الإنجازات"));
  const cust = on.find((s) => s.kind === "table" && s.title.endsWith("العملاء"));
  assert.ok(cust && cust.kind === "table" && cust.rows.some((r) => r.includes("12 قرية")));
  const agenda = on.find((s) => s.kind === "agenda");
  assert.ok(agenda && agenda.kind === "agenda" && agenda.items.includes("رؤية التطوير المستقبلية"));
});

test("مؤشرات الأداء بتتشال لو مفيش أعطال أو المفتاح مقفول", () => {
  assert.ok(!kinds(defaultDeck(), { ...auto, faultsByMonth: [] }).some((k) => k.startsWith("chart")));
  const d = defaultDeck(); d.faults.enabled = false;
  assert.ok(!kinds(d).some((k) => k.startsWith("chart")));
  const chart = buildSlides(defaultDeck(), auto).find((s) => s.kind === "chart");
  // سنتين مختلفين ⇒ اسم الشهر + السنة القصيرة
  assert.deepEqual(chart && chart.kind === "chart" ? chart.points : null, [{ label: "ديسمبر 25", value: 12.5 }, { label: "يناير 26", value: 9.1 }]);
});

test("الرقم المكتوب بالإيد يغلب التلقائى، والإجمالى آخر صف فى جدول السنترالات", () => {
  const d = defaultDeck();
  assert.equal(deckValue(d, auto, "GHNAT", "lines"), "5,000");
  d.overrides["GHNAT.lines"] = "5100";
  assert.equal(deckValue(d, auto, "GHNAT", "lines"), "5100");
  assert.equal(deckValue(d, null, "AMZAT", "lines"), "");
  const ex = buildSlides(d, auto).find((s) => s.kind === "table" && s.title === "سنترالات الإدارة");
  assert.ok(ex && ex.kind === "table" && ex.totalLast);
  assert.equal(ex.kind === "table" && ex.rows.length, 5);
  assert.equal(ex.kind === "table" && ex.rows[0][2], "5100");
});

test("normalizeDeck بيشيل الحقول الغريبة والصور والمفاتيح الغلط", () => {
  const d = normalizeDeck({
    cover: { title: "x", evil: "<script>" }, vision: { enabled: "yes", items: 5 },
    achievements: { enabled: true, photoIds: ["abcdef12", "../../etc", 3] },
    overrides: { "GHNAT.lines": "10", "bad key": "1", "GHNAT.boxes": "  " },
    exchanges: [{ code: "GHNAT", name: "الغنايم", match: "الغنايم", extra: 1 }, {}],
    hacker: true,
  });
  assert.equal((d.cover as any).evil, undefined);
  assert.equal(d.vision.enabled, false);
  assert.equal(d.vision.items, "5");
  assert.deepEqual(d.achievements.photoIds, ["abcdef12"]);
  assert.deepEqual(d.overrides, { "GHNAT.lines": "10" });
  assert.equal(d.exchanges.length, 1);
  assert.equal((d as any).hacker, undefined);
  assert.equal(normalizeDeck(null).exchanges.length, 4);
});

test("autoDeck: استعلام وقع مايوقّعش الباقى، والسنترال بيتطابق بالاسم بعد التطبيع", async () => {
  const db = {
    query: async (sql: string) => {
      if (sql.includes("maintenance.")) throw new Error("no schema");
      if (sql.includes("COUNT(DISTINCT tel_no)")) return { rows: [{ k: "الغنايم-العزايزه", n: "1200" }, { k: "غريب", n: "9" }] };
      return { rows: [] };
    },
  };
  const a = await autoDeck(db, defaultDeck());
  assert.equal(a.exchanges.AMZAT.lines, 1200);
  assert.equal(a.total.lines, 1200);
  assert.equal(a.maintenance, null);
  assert.ok(a.errors.some((e) => e.startsWith("الصيانة")));
});

test("باور بوينت: نفس الشرايح، أول عمود على اليمين، والنص متأمّن، والمسار للسوبر أدمن", async () => {
  const JSZip = (await import("jszip")).default;
  const { deckPptx } = await import("./presentation-pptx");
  // صورة PNG ١×١
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const im = { data: png, ext: "png" as const, w: 1, h: 1 };
  const d = defaultDeck();
  d.cover.title = "إدارة <الغنايم> & co";
  d.maintenance.photoIds = ["abcdef12"];
  const slides = buildSlides(d, auto);
  const buf = await deckPptx(slides, { weWhite: im, wePurple: im, telecomEgypt: im }, new Map([["abcdef12", { ...im, ext: "jpeg" as const }]]));
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  assert.equal(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, slides.length);
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  for (let i = 1; i <= slides.length; i++) assert.ok(ct.includes(`/ppt/slides/slide${i}.xml`));
  const cover = await zip.file("ppt/slides/slide1.xml")!.async("string");
  assert.match(cover, /إدارة &lt;الغنايم&gt; &amp; co/);
  assert.match(cover, /57318A/);
  const exIdx = slides.findIndex((s) => s.kind === "table" && s.title === "سنترالات الإدارة") + 1;
  const ex = await zip.file(`ppt/slides/slide${exIdx}.xml`)!.async("string");
  const heads = [...ex.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
  // أول عمود («السنترال») آخر واحد فى الـ XML = أقصى اليمين
  assert.ok(heads.indexOf("داتا MSAN") < heads.indexOf("السنترال"));
  assert.doesNotMatch(ex, /tblPr rtl/);
  assert.ok(names.some((n) => n.endsWith(".jpeg")));
  assert.ok(routes.includes(`app.get("/api/presentation/pptx", requireAuth, requireSuperAdmin`));
});

test("المسار الوظيفى: خانة للوظيفة ومن وإلى (نص حر)، والسطور القديمة بتتقرى، والفاضى مايطلعش شريحة", async () => {
  const { careerRows, careerItems } = await import("../shared/presentation-deck");
  const rows = [{ job: "مهندس صيانة", from: "2009", to: "2015" }, { job: "مدير إدارة | الغنايم", from: "يناير 2020", to: "حتى الآن" }];
  const items = careerItems(rows);
  assert.deepEqual(careerRows(items)[0], rows[0]);
  // المسافة فى آخر الكلمة بتفضل (بيتنادى مع كل حرف)
  assert.equal(careerItems([{ job: "مدير ", from: "", to: "" }]), "مدير  |  | ");
  assert.deepEqual(careerRows("مدير سنترال | 2012 - 2020"), [{ job: "مدير سنترال", from: "2012 - 2020", to: "" }]);
  const d = defaultDeck();
  d.career.items = items;
  const s = buildSlides(d, null).find((x) => x.kind === "list" && x.title.startsWith("المسار"));
  assert.deepEqual(s && s.kind === "list" ? s.items : null, ["مهندس صيانة   2009 - 2015", "مدير إدارة الغنايم   يناير 2020 - حتى الآن"]);
  d.career.items = careerItems([{ job: "", from: "", to: "" }]);
  assert.ok(!buildSlides(d, null).some((x) => x.kind === "list" && x.title.startsWith("المسار")));
});

test("العملاء: البيانات = بورتات used، وWE = أكونت + بورت حالى، والحصة السوقية بتتحسب منهم", async () => {
  const { marketShareValue, weDataValue } = await import("../shared/presentation-deck");
  assert.match(src, /LIKE 'used%'/);
  assert.match(src, /EXISTS \(SELECT 1 FROM phone_ports pp WHERE pp\.phone_number = la\.full_phone\)/);
  const a: DeckAuto = { ...auto, total: { ...auto.total, dataUsed: 8000, weData: 7120 } };
  const d = defaultDeck();
  assert.equal(weDataValue(d, a), "7,120");
  assert.equal(marketShareValue(d, a), "89%");
  d.customers.weData = "7500";
  assert.equal(marketShareValue(d, a), "93.8%");
  d.customers.marketShare = "90%";
  assert.equal(marketShareValue(d, a), "90%");
  assert.equal(marketShareValue(defaultDeck(), null), "");
  // الحصة مخفية افتراضياً (طلعت 104%) — بتظهر بالمفتاح بس
  const hidden = buildSlides(defaultDeck(), a).find((s) => s.kind === "table" && s.title.endsWith("العملاء"));
  assert.ok(hidden && hidden.kind === "table" && !hidden.rows.some((r) => r[0] === "الحصة السوقية WE DATA"));
  const shown = defaultDeck(); shown.customers.showShare = true;
  const cust = buildSlides(shown, a).find((s) => s.kind === "table" && s.title.endsWith("العملاء"));
  assert.ok(cust && cust.kind === "table" && cust.rows.some((r) => r[0] === "الحصة السوقية WE DATA" && r[1] === "89%"));
  assert.ok(cust.kind === "table" && !cust.rows.some((r) => r[0].includes("بأكونت")));
});

test("مؤشرات الأعطال: آخر ١٢ شهر + الحالى، كل شهر لوحده، وزرار يخفى أى شهر", async () => {
  const { faultsStartMonth } = await import("../shared/presentation-deck");
  assert.match(src, /NORM\("cd\.exchange_name"\)\} = ANY/);
  assert.match(src, /COALESCE\(cd\.time_till_now/);
  assert.match(src, /'YYYY-MM'\) >= \$2/);
  assert.equal(faultsStartMonth(new Date("2026-10-20T12:00:00Z")), "2025-10");
  assert.equal(faultsStartMonth(new Date("2026-01-05T12:00:00Z")), "2025-01");
  const a: DeckAuto = { ...auto, computedAt: "2026-10-20T18:00:00Z",
    faultsByMonth: [{ month: "2026-08", complaints: 70, repeatPct: 9, in24Pct: 85, msanFaults: null, perThousand: null },
      { month: "2026-09", complaints: 60, repeatPct: 8, in24Pct: 90, msanFaults: null, perThousand: null },
      { month: "2026-10", complaints: 50, repeatPct: 7, in24Pct: 92, msanFaults: null, perThousand: null }] };
  const d = defaultDeck();
  let charts = buildSlides(d, a).filter((s) => s.kind === "chart");
  assert.equal(charts.length, 2);
  assert.ok(charts[0].kind === "chart" && charts[0].title === "نسب تكرار الأعطال شهرياً (أغسطس 2026 – أكتوبر 2026)");
  assert.deepEqual(charts[0].kind === "chart" && charts[0].points.map((p) => p.label), ["أغسطس", "سبتمبر", "أكتوبر"]);
  assert.ok(charts[1].kind === "chart" && charts[1].note.includes("أكتوبر من أوله لحد 20 أكتوبر"));
  // المالك يقفل أغسطس ⇒ سبتمبر وأكتوبر بس، كل واحد بنسبته هو
  d.faults.hiddenMonths = "2026-08";
  charts = buildSlides(d, a).filter((s) => s.kind === "chart");
  assert.deepEqual(charts[0].kind === "chart" && charts[0].points, [{ label: "سبتمبر", value: 8 }, { label: "أكتوبر", value: 7 }]);
  d.faults.hiddenMonths = "2026-08,2026-09,2026-10";
  assert.ok(!buildSlides(d, a).some((s) => s.kind === "chart" || (s.kind === "divider" && s.title === "مؤشرات ومعدلات الأداء")));
});

test("نسبة الحجز وفك المتعذرات: أرقام الغنايم حتى ١٨ أكتوبر افتراضياً، والعرض المحفوظ قبل كده بياخدها، وبتتعدّل", async () => {
  const { bookingPct } = await import("../shared/presentation-deck");
  // عرض محفوظ قبل القسم ده (فيه blocked القديم) — الأرقام الافتراضية بتتحط
  const old = normalizeDeck({ ...defaultDeck(), booking: undefined, blocked: { enabled: false, total: "" } });
  assert.equal(old.booking.enabled, true);
  assert.equal(old.booking.total, "1267");
  assert.equal(bookingPct(old.booking), "97%");
  const t = buildSlides(old, null).find((s) => s.kind === "table" && s.title.startsWith("نسبة الحجز"));
  assert.ok(t && t.kind === "table");
  assert.equal(t.title, "نسبة الحجز وفك المتعذرات حتى 18 أكتوبر 2026");
  assert.deepEqual(t.rows, [["1267", "1230", "36", "0", "0", "1", "97%"]]);
  // مفيش مقارنة بالمنطقة (المالك: «أنا ليا نتيجتى فقط»)
  assert.equal(t.note, "");
  assert.doesNotMatch(JSON.stringify(t), /أسيوط|84%/);
  const d = normalizeDeck({ booking: { total: "1300", capacity: "1287" } });
  assert.equal(bookingPct(d.booking), "99%");
  d.booking.pct = "98.5%";
  assert.equal(bookingPct(d.booking), "98.5%");
  d.booking.enabled = false;
  assert.ok(!buildSlides(d, null).some((s) => s.kind === "table" && s.title.startsWith("نسبة الحجز")));
});

test("شريحة النبذة فيها الشغال صوت والشغال داتا وعملاء WE والحصة السوقية", () => {
  assert.match(src, /voice_status, ''\)\)\) LIKE 'used%'/);
  const a: DeckAuto = { ...auto, total: { ...auto.total, voiceUsed: 9800, dataUsed: 8000, weData: 7120 } };
  const sd = defaultDeck(); sd.customers.showShare = true;
  assert.equal(normalizeDeck({}).customers.showShare, false);
  const ov = buildSlides(sd, a).find((s) => s.kind === "table" && s.title === defaultDeck().cover.title);
  assert.ok(ov && ov.kind === "table");
  const get = (k: string) => ov.rows.find((r) => r[0] === k)?.[1];
  assert.equal(get("عدد الخطوط الشغالة صوت"), "9,800");
  assert.equal(get("عدد الخطوط الشغالة داتا"), "8,000");
  assert.equal(get("عدد عملاء البيانات WE"), "7,120");
  assert.equal(get("الحصة السوقية WE DATA"), "89%");
});

test("خطة الصيانة: المحقق بس من غير مستهدف", () => {
  const d = defaultDeck(); d.maintenance.achievedCopper = "12";
  const t = buildSlides(d, auto).find((s) => s.kind === "table" && s.title.startsWith("خطة الصيانة"));
  assert.ok(t && t.kind === "table");
  assert.deepEqual(t.columns, ["البيان", "إجمالى الشبكة", "المحقق"]);
  assert.deepEqual(t.rows, [["البكسيات", "300", "214"], ["الكباين النحاسية", "0", "12"]]);
  assert.equal((normalizeDeck({ maintenance: { targetBoxes: "400" } }).maintenance as any).targetBoxes, undefined);
});
