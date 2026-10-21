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
  faultsByMonth: [{ month: "2025-12", complaints: 900, repeatPct: 12.5, in24Pct: 80, msanFaults: null }, { month: "2026-01", complaints: 700, repeatPct: 9.1, in24Pct: 88, msanFaults: null }],
  maintenance: { boxesTotal: 1000, boxesDone: 214, byYear: [{ year: "2026", done: 214 }] },
  decentLife: [], errors: [], computedAt: "",
};
const hideAll = (d: any, v: string) => { d.faults.hiddenPt = v; d.faults.hiddenRepeat = v; d.faults.hiddenIn24 = v; };
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
  // المالك ٢٠٢٦-١٠-٢١: «بلاش مبادرات وأهم الإنجازات» — لا فى الأجندة ولا فاصل، حتى والشرايح نفسها موجودة
  const full = defaultDeck(); full.achievements = { enabled: true, items: "صيانة ٢١٤ بكس", photoIds: [] };
  const all = buildSlides(full, auto);
  assert.ok(!JSON.stringify(all).includes("مبادرات"));
  assert.deepEqual((all.find((s) => s.kind === "agenda") as any).items, [`نبذة عن ${full.cover.title}`, "مؤشرات ومعدلات الأداء"]);
  assert.ok(all.some((s) => s.kind === "list" && s.title === "أهم الإنجازات"));
  assert.ok(all.some((s) => s.kind === "compare" && s.title.startsWith("نسبة الحجز")));

  const d = defaultDeck();
  d.vision = { enabled: true, items: "FTTH لكل القرى\nتحديث الكباين" };
  d.achievements = { enabled: true, items: "صيانة ٢١٤ بكس", photoIds: [] };
  d.decentLife = { enabled: true, phase1: "12 قرية", phase2: "8 قرى", notes: "" };
  const on = buildSlides(d, auto);
  const vision = on.find((s) => s.kind === "list" && s.title === "رؤية التطوير المستقبلية");
  assert.deepEqual(vision && "items" in vision ? vision.items : null, ["FTTH لكل القرى", "تحديث الكباين"]);
  assert.ok(on.some((s) => s.kind === "list" && s.title === "أهم الإنجازات"));
  // حياة كريمة بقت فى شريحة النبذة (شريحة العملاء اتشالت)
  const cust = on.find((s) => s.kind === "table" && s.title === d.cover.title);
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

test("قاعدة العملاء: الشغال صوت/داتا من ملف المشتركين، ومفيش عملاء WE ولا حصة ولا شريحة عملاء", () => {
  assert.match(src, /LIKE 'used%'/);   // الحسبة القديمة لسه موجودة فى السيرفر (مش ظاهرة)
  const a: DeckAuto = { ...auto, total: { ...auto.total, msanVoice: 11521, msanData: 10662, voiceUsed: 9800, dataUsed: 8000, weData: 7120 } };
  const d = defaultDeck(); d.customers.showShare = true;
  const slides = buildSlides(d, a);
  // اسم الإدارة نفسه بقى آخره «العملاء» (شريحة النبذة) — المقصود شريحة العملاء القديمة بس
  assert.ok(!slides.some((s) => s.kind === "table" && s.title !== d.cover.title && s.title.endsWith("العملاء")));
  const ov = slides.find((s) => s.kind === "table" && s.title === d.cover.title);
  assert.ok(ov && ov.kind === "table");
  const get = (k: string) => ov.rows.find((r) => r[0] === k)?.[1];
  assert.equal(get("عدد الخطوط الشغالة صوت"), "11,521");
  assert.equal(get("عدد الخطوط الشغالة داتا"), "10,662");
  assert.equal(get("عدد عملاء البيانات WE"), undefined);
  assert.equal(get("الحصة السوقية WE DATA"), undefined);
});

test("مؤشرات الأعطال: من يناير 2025 لحد الشهر الحالى، كل شهر لوحده، وزرار يخفى أى شهر", async () => {
  const { faultsStartMonth } = await import("../shared/presentation-deck");
  assert.match(src, /NORM\("cd\.exchange_name"\)\} = ANY/);
  assert.match(src, /COALESCE\(cd\.time_till_now/);
  assert.match(src, /'YYYY-MM'\) >= \$2/);
  // المالك ٢٠٢٦-١٠-٢١: «من يناير 2025 الى أكتوبر 2026» — البداية ثابتة، والنهاية الشهر الحالى
  assert.equal(faultsStartMonth(new Date("2026-10-20T12:00:00Z")), "2025-01");
  assert.equal(faultsStartMonth(new Date("2027-03-05T12:00:00Z")), "2025-01");
  const a: DeckAuto = { ...auto, computedAt: "2026-10-20T18:00:00Z",
    faultsByMonth: [{ month: "2026-08", complaints: 70, repeatPct: 9, in24Pct: 85, msanFaults: null },
      { month: "2026-09", complaints: 60, repeatPct: 8, in24Pct: 90, msanFaults: null },
      { month: "2026-10", complaints: 50, repeatPct: 7, in24Pct: 92, msanFaults: null }] };
  const d = defaultDeck();
  let charts = buildSlides(d, a).filter((s) => s.kind === "chart");
  assert.equal(charts.length, 2);
  assert.ok(charts[0].kind === "chart" && charts[0].title === "نسب تكرار الأعطال شهرياً (أغسطس 2026 – أكتوبر 2026)");
  assert.deepEqual(charts[0].kind === "chart" && charts[0].points.map((p) => p.label), ["أغسطس", "سبتمبر", "أكتوبر"]);
  assert.ok(charts[1].kind === "chart" && charts[1].note.includes("أكتوبر من أوله لحد 20 أكتوبر"));
  // المالك يقفل أغسطس ⇒ سبتمبر وأكتوبر بس، كل واحد بنسبته هو
  hideAll(d, "2026-08");
  charts = buildSlides(d, a).filter((s) => s.kind === "chart");
  assert.deepEqual(charts[0].kind === "chart" && charts[0].points, [{ label: "سبتمبر", value: 8 }, { label: "أكتوبر", value: 7 }]);
  hideAll(d, "2026-08,2026-09,2026-10");
  assert.ok(!buildSlides(d, a).some((s) => s.kind === "chart"));
  // فاصل الأداء بيفضل طول ما التركيبات أو الصيانة أو الحجز جوّاه — ويتشال لو القسم كله فاضى
  d.maintenance.enabled = false; d.booking.enabled = false; d.installs.enabled = false;
  assert.ok(!buildSlides(d, a).some((s) => s.kind === "divider" && s.title === "مؤشرات ومعدلات الأداء"));
});

test("الصيانة وفك المتعذرات جوّه «مؤشرات ومعدلات الأداء» بعد الأعطال، والإنجازات بعدهم", () => {
  const d = defaultDeck();
  d.achievements = { enabled: true, items: "صيانة ٢١٤ بكس", photoIds: [] };
  d.vision = { enabled: true, items: "FTTH لكل القرى" };
  const k = kinds(d);
  const at = (x: string) => k.findIndex((s) => s.startsWith(x));
  const perf = k.indexOf("divider:مؤشرات ومعدلات الأداء");
  assert.ok(perf > 0);
  assert.ok(at("chart:") > perf);
  assert.ok(at("table:خطة الصيانة") > at("chart:"));
  assert.ok(at("compare:نسبة الحجز") > at("table:خطة الصيانة"));
  assert.ok(at("list:أهم الإنجازات") > at("compare:نسبة الحجز"));
  assert.ok(at("divider:رؤية التطوير") > at("list:أهم الإنجازات"));
  // مفيش فاصل تانى بين الأعطال والصيانة والحجز
  const between = k.slice(perf + 1, at("compare:نسبة الحجز"));
  assert.ok(!between.some((s) => s.startsWith("divider:")));
  // من غير أعطال: القسم لسه فى الأجندة لأن الصيانة والحجز جوّاه
  const noFaults = defaultDeck(); noFaults.faults.enabled = false;
  const agenda = buildSlides(noFaults, auto).find((s) => s.kind === "agenda") as any;
  assert.ok(agenda.items.includes("مؤشرات ومعدلات الأداء"));
  assert.ok(kinds(noFaults).includes("divider:مؤشرات ومعدلات الأداء"));
});

test("نسبة الحجز وفك المتعذرات: أرقام الغنايم حتى ١٨ أكتوبر افتراضياً، والعرض المحفوظ قبل كده بياخدها، وبتتعدّل", async () => {
  const { bookingPct } = await import("../shared/presentation-deck");
  // عرض محفوظ قبل القسم ده (فيه blocked القديم) — الأرقام الافتراضية بتتحط
  const old = normalizeDeck({ ...defaultDeck(), booking: undefined, blocked: { enabled: false, total: "" } });
  assert.equal(old.booking.enabled, true);
  assert.equal(old.booking.total, "1267");
  assert.equal(bookingPct(old.booking), "97%");
  // من ٢٠٢٦-١٠-٢١ الافتراضى فيه خانات المقارنة ⇒ شريحة «compare» وجدول التفاصيل تحتها
  const t = buildSlides(old, null).find((s) => s.kind === "compare");
  assert.ok(t && t.kind === "compare");
  assert.equal(t.title, "نسبة الحجز وفك المتعذرات حتى 18 أكتوبر 2026");
  assert.deepEqual(t.table?.rows, [["1267", "1230", "36", "0", "0", "1", "97%"]]);
  // مفيش مقارنة بالمنطقة (المالك: «أنا ليا نتيجتى فقط»)
  assert.doesNotMatch(JSON.stringify(t), /أسيوط|84%/);
  const d = normalizeDeck({ booking: { total: "1300", capacity: "1287" } });
  assert.equal(bookingPct(d.booking), "99%");
  d.booking.pct = "98.5%";
  assert.equal(bookingPct(d.booking), "98.5%");
  d.booking.enabled = false;
  assert.ok(!buildSlides(d, null).some((s) => (s.kind === "table" || s.kind === "compare") && s.title.startsWith("نسبة الحجز")));
});

test("شريحة «سنترالات الإدارة» اختيارية", () => {
  const d = defaultDeck();
  assert.ok(buildSlides(d, auto).some((s) => s.kind === "table" && s.title === "سنترالات الإدارة"));
  d.exchangesTable.enabled = false;
  assert.ok(!buildSlides(d, auto).some((s) => s.kind === "table" && s.title === "سنترالات الإدارة"));
  assert.equal(normalizeDeck({}).exchangesTable.enabled, true);
});

test("خطة الصيانة: المحقق بس من غير مستهدف", () => {
  const d = defaultDeck(); d.maintenance.achievedCopper = "12";
  const t = buildSlides(d, auto).find((s) => s.kind === "table" && s.title.startsWith("خطة الصيانة"));
  assert.ok(t && t.kind === "table");
  assert.deepEqual(t.columns, ["البيان", "إجمالى الشبكة", "المحقق"]);
  assert.deepEqual(t.rows, [["البكسيات", "300", "214"], ["الكباين النحاسية", "0", "12"]]);
  assert.equal((normalizeDeck({ maintenance: { targetBoxes: "400" } }).maintenance as any).targetBoxes, undefined);
});


// ─── المالك ٢٠٢٦-١٠-٢١: الحال عند الاستلام (١ ديسمبر ٢٠٢٥) مقابل دلوقتى ───

test("الأعطال فى الألف على شغال كل شهر — القيم المتوقعة من المالك", async () => {
  const { monthPerThousand, monthWorking, parseMonthWorking, serializeMonthWorking } = await import("../shared/presentation-deck");
  const months = [["2025-11", 292], ["2026-03", 288], ["2026-04", 282], ["2026-08", 277]] as const;
  const a: DeckAuto = { ...auto, faultsWorking: 10662, computedAt: "2026-10-21T08:00:00Z",
    faultsByMonth: months.map(([month, n]) => ({ month, complaints: n, repeatPct: 3, in24Pct: 95, msanFaults: n })) };
  const d = defaultDeck();   // الشغال المبدئى = أرقام المالك
  const got = Object.fromEntries(months.map(([month, n]) => [month, monthPerThousand(d, a, { month, msanFaults: n })]));
  assert.deepEqual(got, { "2025-11": 29.9, "2026-03": 28.3, "2026-04": 27.6, "2026-08": 26.4 });
  // الشهر اللى مالوش شغال مكتوب ⇒ الشغال الحالى (السلوك القديم)
  d.faults.working = serializeMonthWorking(new Map([...parseMonthWorking(d.faults.working)].filter(([m]) => m !== "2026-08")));
  assert.equal(monthWorking(d, a, "2026-08"), 10662);
  assert.equal(monthPerThousand(d, a, { month: "2026-08", msanFaults: 277 }), 26);
  // الشرايح: الرسم والجدول بنفس الأرقام، والسطر تحت الرسم، والشهور الظاهرة زى ما المالك اختارها
  const d2 = defaultDeck(); hideAll(d2, "2026-03,2026-04");
  const slides = buildSlides(d2, a);
  const chart = slides.find((x) => x.kind === "chart" && x.title.startsWith("عدد الأعطال فى الألف"));
  assert.ok(chart && chart.kind === "chart");
  assert.deepEqual(chart.points, [{ label: "نوفمبر 25", value: 29.9 }, { label: "أغسطس 26", value: 26.4 }]);
  assert.ok(chart.note.startsWith("الأعطال فى الألف محسوبة على عدد الشغال فى كل شهر"));
  const tbl = slides.find((x) => x.kind === "table" && x.title.startsWith("الأعطال مقارنة بالشغال"));
  assert.ok(tbl && tbl.kind === "table");
  assert.deepEqual(tbl.rows, [["نوفمبر 2025", "292", "9,781", "29.9"], ["أغسطس 2026", "277", "10,497", "26.4"]]);
  // أرقام عربى ومسح خانة
  assert.equal(parseMonthWorking("2026-01=٩٩٩٨, 2026-02=, bad=5").get("2026-01"), 9998);
  assert.equal(parseMonthWorking("2026-01=٩٩٩٨, 2026-02=, bad=5").size, 1);
});

test("نسبة الحجز وفك المتعذرات: خانات المقارنة مليانة ⇒ قبل ← بعد بالصافى", async () => {
  const { bookingCompare } = await import("../shared/presentation-deck");
  const d = defaultDeck();
  const s = buildSlides(d, null).find((x) => x.kind === "compare");
  assert.ok(s && s.kind === "compare");
  assert.equal(s.title, "نسبة الحجز وفك المتعذرات حتى 18 أكتوبر 2026");
  const [bk, bl] = s.panels;
  assert.deepEqual([bk.before.value, bk.after.value, bk.delta], ["88%", "97%", "\u200E+9 نقاط"]);
  assert.equal(bk.before.label, "عند الاستلام (ديسمبر 2025)");
  // الرقم الكبير = الصافى (المستهدف × المحقق)، مش المحقق لوحده
  assert.deepEqual([bl.before.value, bl.after.value, bl.delta], ["52.5%", "68.25%", "\u200E+15.75 نقطة"]);
  assert.match(bl.note, /المستهدف اترفع من 50% إلى 70%/);
  assert.doesNotMatch(`${bl.before.value} ${bl.after.value}`, /105|97\.5/);
  // جدول التفاصيل لسه تحتهم
  assert.deepEqual(s.table?.rows, [["1267", "1230", "36", "0", "0", "1", "97%"]]);
  // لوحة واحدة بس لو فك المتعذرات ناقص
  assert.equal(bookingCompare({ ...d.booking, curAchieved: "" }).length, 1);
});

test("نسبة الحجز وفك المتعذرات: خانات المقارنة فاضية ⇒ الشريحة زى ما كانت بالظبط", () => {
  const d = defaultDeck();
  Object.assign(d.booking, { handoverPct: "", prevTarget: "", prevAchieved: "", curTarget: "", curAchieved: "" });
  const slides = buildSlides(d, null);
  assert.ok(!slides.some((x) => x.kind === "compare"));
  const t = slides.find((x) => x.kind === "table" && x.title.startsWith("نسبة الحجز"));
  assert.ok(t && t.kind === "table");
  assert.deepEqual(t.columns, ["إجمالى الطلبات", "إجمالى الإمكانية", "متعذر", "توضيح عنوان", "بدون رد", "العنوان لا يتبع السنترال", "نسبة الحجز"]);
  assert.deepEqual(t.rows, [["1267", "1230", "36", "0", "0", "1", "97%"]]);
});

test("العرض المحفوظ قبل كده بياخد الخانات الجديدة لوحده (من غير SQL)، ومابيلمسش الإنجازات", () => {
  const saved = normalizeDeck({ faults: { enabled: true, hiddenMonths: "2025-12" },
    booking: { enabled: true, asOf: "18 أكتوبر 2026", total: "1267", capacity: "1230" },
    achievements: { enabled: true, items: "سطر الحجز\nسطر فك المتعذرات", photoIds: [] } });
  // اختيار الشهور القديم (واحد للكل) بيتحط لكل مؤشر
  assert.deepEqual([saved.faults.hiddenPt, saved.faults.hiddenRepeat, saved.faults.hiddenIn24], ["2025-12", "2025-12", "2025-12"]);
  assert.match(saved.faults.working, /2025-11=9781/);
  assert.equal(saved.booking.handoverPct, "88");
  assert.equal(saved.booking.curAchieved, "97.5");
  assert.equal(saved.achievements.items, "سطر الحجز\nسطر فك المتعذرات");
});

test("باور بوينت: شريحة المقارنة بتطلع بنفس الأرقام", async () => {
  const JSZip = (await import("jszip")).default;
  const { deckPptx } = await import("./presentation-pptx");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const im = { data: png, ext: "png" as const, w: 1, h: 1 };
  const slides = buildSlides(defaultDeck(), null);
  const idx = slides.findIndex((x) => x.kind === "compare") + 1;
  const zip = await JSZip.loadAsync(await deckPptx(slides, { weWhite: im, wePurple: im, telecomEgypt: im }, new Map()));
  const xml = await zip.file(`ppt/slides/slide${idx}.xml`)!.async("string");
  for (const t of ["88%", "97%", "+9 نقاط", "52.5%", "68.25%", "+15.75 نقطة", "عند الاستلام (ديسمبر 2025)", "1267"]) assert.ok(xml.includes(t), t);
});

test("«إدارة سنترالات الغنايم» بقت «إدارة تشغيل الشبكة وعمليات العملاء» — فى الافتراضى وفى العرض المحفوظ", () => {
  const NEW = "إدارة تشغيل الشبكة وعمليات العملاء";
  const def = defaultDeck();
  assert.equal(def.cover.title, NEW);
  assert.equal(def.person.job, `مدير ${NEW}`);
  // عرض محفوظ قبل التغيير (بكل أشكال الكتابة) بيتصلّح وقت التحميل من غير SQL
  const saved = normalizeDeck({
    cover: { title: "إدارة سنترالات الغنايم" },
    person: { job: "مدير ادارة سنترالات الغنايم", department: "منطقة أسيوط" },
    achievements: { enabled: true, items: "تطوير إداره سنترالات الغنايم\nسطر تانى" },
  });
  assert.equal(saved.cover.title, NEW);
  assert.equal(saved.person.job, `مدير ${NEW}`);
  assert.equal(saved.achievements.items, `تطوير ${NEW}\nسطر تانى`);
  assert.equal(saved.person.department, "منطقة أسيوط");
  const slides = buildSlides(saved, auto);
  const text = JSON.stringify(slides);
  assert.doesNotMatch(text, /سنترالات الغنايم/);
  assert.ok(slides.some((s) => s.kind === "divider" && s.title === `نبذة عن ${NEW}`));
  const agenda = slides.find((s) => s.kind === "agenda") as any;
  assert.equal(agenda.items[0], `نبذة عن ${NEW}`);
});

test("شريحة مؤشرات تركيبات الصوت جوّه «مؤشرات ومعدلات الأداء» — أرقام الغنايم سبتمبر 2026", () => {
  const d = defaultDeck();
  const slides = buildSlides(d, auto);
  const k = slides.map((s) => s.kind + ":" + ("title" in s ? s.title : ""));
  const i = k.indexOf("table:مؤشرات تركيبات الصوت - سبتمبر 2026");
  assert.ok(i > k.indexOf("divider:مؤشرات ومعدلات الأداء") && i > k.findIndex((x) => x.startsWith("chart:")));
  assert.ok(i < k.findIndex((x) => x.startsWith("table:خطة الصيانة")));
  const t = slides[i] as any;
  assert.deepEqual(t.columns, ["المؤشر", "العدد", "النسبة"]);
  assert.deepEqual(t.rows, [
    ["إجمالى التركيبات", "157", ""],
    ["التركيب خلال 24 ساعة", "155", "99%"],
    ["التركيب خلال 48 ساعة", "157", "100%"],
    ["التركيب خلال 120 ساعة", "157", "100%"],
    ["متوسط زمن التركيب", "6.2 ساعة", ""],
  ]);
  // من غير الشرايح التانية: التركيبات لوحدها بتظهّر قسم الأداء
  const only = defaultDeck(); only.faults.enabled = false; only.maintenance.enabled = false; only.booking.enabled = false;
  assert.ok(kinds(only).includes("divider:مؤشرات ومعدلات الأداء"));
  // مقفولة أو فاضية ⇒ مفيش شريحة
  only.installs.enabled = false;
  assert.ok(!kinds(only).some((x) => x.includes("تركيبات")));
  assert.ok(!kinds(only).includes("divider:مؤشرات ومعدلات الأداء"));
  const empty = defaultDeck(); empty.installs = { ...empty.installs, total: "", in24: "", in48: "", in120: "", avgHours: "" };
  assert.ok(!kinds(empty).some((x) => x.includes("تركيبات")));
  // عرض محفوظ قبل الشريحة دى بياخد أرقام سبتمبر لوحده
  assert.equal(normalizeDeck({ cover: { title: "x" } }).installs.in24, "155");
});

test("كل مؤشر بشهوره: الأعطال فى الألف · التكرار · الإزالة — شهور مختلفة فى كل شريحة", () => {
  const a: DeckAuto = { ...auto, computedAt: "2026-10-20T18:00:00Z",
    faultsByMonth: [
      { month: "2025-11", complaints: 300, repeatPct: 15, in24Pct: 70, msanFaults: 292 },
      { month: "2026-03", complaints: 290, repeatPct: 12, in24Pct: 80, msanFaults: 288 },
      { month: "2026-08", complaints: 280, repeatPct: 9, in24Pct: 90, msanFaults: 277 },
    ] };
  const d = defaultDeck();
  d.faults.hiddenPt = "2026-03";            // الأعطال فى الألف: نوفمبر وأغسطس
  d.faults.hiddenRepeat = "2025-11";        // التكرار: مارس وأغسطس
  d.faults.hiddenIn24 = "2025-11,2026-08";  // الإزالة: مارس بس
  const slides = buildSlides(d, a);
  const chart = (p: string) => slides.find((s) => s.kind === "chart" && s.title.startsWith(p)) as any;
  assert.deepEqual(chart("عدد الأعطال فى الألف").points.map((p: any) => p.label), ["نوفمبر 25", "أغسطس 26"]);
  assert.equal(chart("عدد الأعطال فى الألف").title, "عدد الأعطال فى الألف شهرياً (نوفمبر 2025 – أغسطس 2026)");
  const tbl = slides.find((s) => s.kind === "table" && s.title.startsWith("الأعطال مقارنة بالشغال")) as any;
  assert.deepEqual(tbl.rows.map((r: string[]) => r[0]), ["نوفمبر 2025", "أغسطس 2026"]);
  // نفس السنة ⇒ اسم الشهر بس، والعنوان بفترة المؤشر ده هو
  assert.deepEqual(chart("نسب تكرار").points, [{ label: "مارس", value: 12 }, { label: "أغسطس", value: 9 }]);
  assert.equal(chart("نسب تكرار").title, "نسب تكرار الأعطال شهرياً (مارس 2026 – أغسطس 2026)");
  assert.deepEqual(chart("نتائج إزالة").points, [{ label: "مارس", value: 80 }]);
  assert.equal(chart("نتائج إزالة").title, "نتائج إزالة الأعطال خلال 24 ساعة شهرياً (مارس 2026)");
  // مؤشر كل شهوره مقفولة ⇒ شريحته بس اللى بتتشال
  d.faults.hiddenIn24 = "2025-11,2026-03,2026-08";
  const s2 = buildSlides(d, a);
  assert.ok(!s2.some((s) => s.kind === "chart" && s.title.startsWith("نتائج إزالة")));
  assert.ok(s2.some((s) => s.kind === "chart" && s.title.startsWith("نسب تكرار")));
  // عرض محفوظ فيه اختيار مستقل لمؤشر ماياخدش القديم
  const saved = normalizeDeck({ faults: { enabled: true, hiddenMonths: "2026-03", hiddenRepeat: "" } });
  assert.deepEqual([saved.faults.hiddenPt, saved.faults.hiddenRepeat, saved.faults.hiddenIn24], ["2026-03", "", "2026-03"]);
});

test("الرسم بـ٢٢ شهر (يناير 2025 – أكتوبر 2026): خط أصغر والسنة تحت اسم الشهر — فى الصفحة والباور بوينت", async () => {
  const { chartLabelStyle, splitChartLabel } = await import("../shared/presentation-deck");
  assert.deepEqual(chartLabelStyle(5), { fs: 22, split: false, y0: 560, H: 380, noteY: 584 });
  assert.deepEqual(chartLabelStyle(13), { fs: 16, split: false, y0: 560, H: 380, noteY: 584 });
  assert.deepEqual(chartLabelStyle(16), { fs: 13, split: true, y0: 540, H: 360, noteY: 600 });
  assert.deepEqual(chartLabelStyle(22), { fs: 11, split: true, y0: 540, H: 360, noteY: 600 });
  // السطر اللى تحت الرسم بييجى تحت سطرين أسماء الشهور (y0 + 8 + سطرين)
  const st = chartLabelStyle(22);
  assert.ok(st.noteY >= st.y0 + 8 + 2 * (st.fs + 6));
  assert.deepEqual(splitChartLabel("سبتمبر 25"), ["سبتمبر", "25"]);
  assert.deepEqual(splitChartLabel("مارس"), ["مارس"]);
  const months: string[] = [];
  for (let y = 2025, m = 1; y < 2026 || m <= 10; m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, "0")}`);
  assert.equal(months.length, 22);
  const a: DeckAuto = { ...auto, computedAt: "2026-10-20T18:00:00Z",
    faultsByMonth: months.map((month, i) => ({ month, complaints: 100 + i, repeatPct: 10, in24Pct: 80, msanFaults: 250 + i })) };
  const slides = buildSlides(defaultDeck(), a);
  const rep = slides.find((s) => s.kind === "chart" && s.title.startsWith("نسب تكرار")) as any;
  assert.equal(rep.points.length, 22);
  assert.equal(rep.title, "نسب تكرار الأعطال شهرياً (يناير 2025 – أكتوبر 2026)");
  assert.equal(rep.points[0].label, "يناير 25");
  const { deckPptx } = await import("./presentation-pptx");
  const JSZip = (await import("jszip")).default;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const im = { data: png, ext: "png" as const, w: 1, h: 1 };
  const zip = await JSZip.loadAsync(await deckPptx([rep], { weWhite: im, wePurple: im, telecomEgypt: im }, new Map()));
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  // اسم الشهر والسنة فقرتين منفصلين جوّه نفس المربع
  assert.match(xml, /<a:t>يناير<\/a:t><\/a:r>(?:<a:endParaRPr[^>]*\/>)?<\/a:p><a:p><a:pPr[^>]*>(?:<a:buNone\/>)?<\/a:pPr><a:r><a:rPr[^>]*>(?:(?!<\/a:r>).)*<a:t>25<\/a:t>/s);
});

test("شغال يناير–أكتوبر 2025 = شغال نوفمبر 2025 (9781) — فى الافتراضى وفى العرض المحفوظ", async () => {
  const { parseMonthWorking, monthPerThousand, EARLY_2025_MONTHS } = await import("../shared/presentation-deck");
  const def = parseMonthWorking(defaultDeck().faults.working);
  for (const m of EARLY_2025_MONTHS) assert.equal(def.get(m), 9781, m);
  assert.equal(def.get("2025-11"), 9781);
  assert.equal(def.size, 22);
  // عرض محفوظ قبل كده (الشغال من نوفمبر بس) ⇒ يناير–أكتوبر بياخدوا رقم نوفمبر المحفوظ هو
  const saved = normalizeDeck({ faults: { enabled: true, working: "2025-11=9800,2025-12=9891,2026-08=10497" } });
  const w = parseMonthWorking(saved.faults.working);
  for (const m of EARLY_2025_MONTHS) assert.equal(w.get(m), 9800, m);
  assert.equal(w.get("2026-08"), 10497);
  // لو المالك كتب أى شهر فيهم بإيده، مابنلمسش الباقى
  const edited = parseMonthWorking(normalizeDeck({ faults: { enabled: true, working: "2025-03=9500,2025-11=9781" } }).faults.working);
  assert.equal(edited.get("2025-03"), 9500);
  assert.equal(edited.get("2025-01"), undefined);
  // الأعطال فى الألف لشهر من 2025 بتتقسم على 9781
  const a: DeckAuto = { ...auto, faultsWorking: 10662 };
  assert.equal(monthPerThousand(defaultDeck(), a, { month: "2025-05", msanFaults: 300 }), 30.7);
});
