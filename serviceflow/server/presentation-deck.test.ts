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
    `app.get("/api/presentation/image/:id"`, `app.delete("/api/presentation/image/:id"`,
    `app.get("/api/presentation/pptx"`, `app.get("/api/presentation/pptx-averages"`]) {
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
  // (+ خطوط الصوت والداتا بتاعة المالك — بتتحط مرة واحدة فى العرض المحفوظ القديم)
  assert.deepEqual(d.overrides, { "GHNAT.lines": "10", "total.msanVoice": "12,019", "total.msanData": "10,751" });
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
  d.maintenance.enabled = false; d.booking.enabled = false; d.installs.enabled = false; d.customers.growth = false;
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

test("خطة الصيانة: المحقق = إجمالى بكسيات الكباين اللى اتعمل فيها ولو بكس، وتفصيلها تحت الجدول", () => {
  // البكس «اتعمل» لو مهمته اتقفلت «مكتملة» فى برنامج الصيانة (نفس تقرير «الصيانة المكتملة») — مش لازم كل بنودها
  assert.match(src, /WHERE mt\.status = 'completed'\s+OR \(mt\.technician_id IS NOT NULL/);
  assert.match(src, /COALESCE\(mt\.completed_at, MAX\(s\.done_at\)\)/);
  const cab = (cabinet: string, done: number, total: number) => ({ year: "2026", exchange: "الغنايم", cabinet, done, total, source: "network" as const });
  const a: DeckAuto = { ...auto, maintenance: { boxesTotal: 1000, boxesDone: 248, byYear: [{ year: "2026", done: 248 }],
    cabinets: [cab("1", 3, 40), cab("2", 1, 35), cab("5", 12, 30), { ...cab("9", 2, 0), year: "2025" }] } };
  const d = defaultDeck(); d.maintenance.achievedCopper = "12";
  const slides = buildSlides(d, a);
  const t = slides.find((s) => s.kind === "table" && s.title === "خطة الصيانة ورفع الكفاءة 2026") as any;
  assert.deepEqual(t.columns, ["البيان", "إجمالى الشبكة", "المحقق"]);
  // ٣ كباين فى 2026 (التانية اتعمل فيها بكس واحد بس) ⇒ 40 + 35 + 30 = 105 بدل 248 (عدد البكسيات اللى اتعملت)
  assert.deepEqual(t.rows, [["البكسيات", "300", "105"], ["الكباين النحاسية", "0", "12"]]);
  assert.match(t.note, /ولو بكس واحد/);
  assert.deepEqual(t.sub.columns, ["السنترال", "رقم الكابينة", "عدد البكسيات فى الكابينة"]);
  assert.deepEqual(t.sub.rows, [["الغنايم", "1", "40"], ["الغنايم", "2", "35"], ["الغنايم", "5", "30"], ["الإجمالى", "3 كابينة", "105"]]);
  assert.equal(t.sub.totalLast, true);
  // الرقم المكتوب بالإيد يغلب، ومن غير تفصيل
  d.maintenance.achievedBoxes = "1049";
  const t2 = buildSlides(d, a).find((s) => s.kind === "table" && s.title === "خطة الصيانة ورفع الكفاءة 2026") as any;
  assert.deepEqual(t2.rows[0], ["البكسيات", "300", "1049"]);
  assert.equal(t2.sub, null);
  assert.equal(t2.note, "");
  // كباين كتير ⇒ أول ٦ تحت الجدول، والباقى ١٢ فى كل شريحة «تابع»، والإجمالى فى آخر واحدة
  d.maintenance.achievedBoxes = "";
  const many: DeckAuto = { ...a, maintenance: { ...a.maintenance!, cabinets: Array.from({ length: 20 }, (_, i) => cab(String(i + 1), 1, 10)) } };
  const all = buildSlides(d, many).filter((s) => s.kind === "table" && s.title.startsWith("خطة الصيانة ورفع الكفاءة 2026")) as any[];
  assert.equal(all.length, 3);
  assert.equal(all[0].sub.rows.length, 6);
  assert.equal(all[0].sub.totalLast, false);
  assert.equal(all[1].title, "خطة الصيانة ورفع الكفاءة 2026 — تفصيل الكباين (تابع)");
  assert.equal(all[1].rows.length, 12);
  assert.equal(all[2].rows.length, 3);
  assert.deepEqual(all[2].rows[2], ["الإجمالى", "20 كابينة", "200"]);
  assert.ok(all[2].totalLast && !all[1].totalLast);
  // من غير بيانات كباين ⇒ عدد برنامج الصيانة زى الأول
  const t3 = buildSlides(d, auto).find((s) => s.kind === "table" && s.title.startsWith("خطة الصيانة")) as any;
  assert.deepEqual(t3.rows[0], ["البكسيات", "300", "214"]);
  assert.equal(t3.sub, null);
  // عرض محفوظ قديم: لو كان كاتب رقم فى الخانة القديمة يفضل هو
  const old = normalizeDeck({ maintenance: { enabled: true, period: "2026" }, overrides: { "total.maintBoxes": "260" } });
  assert.equal(old.maintenance.achievedBoxes, "260");
  assert.equal(old.overrides["total.maintBoxes"], undefined);
  assert.equal(normalizeDeck({ maintenance: { enabled: true, period: "2026" } }).maintenance.achievedBoxes, "");
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
  // جدول «الأعطال مقارنة بالشغال» اتشال من العرض — التفاصيل فى ملف «جداول المتوسطات»
  assert.ok(!slides.some((x) => x.kind === "table" && x.title.startsWith("الأعطال مقارنة بالشغال")));
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
  assert.ok(!slides.some((x) => x.kind === "compare" && x.title.startsWith("نسبة الحجز")));
  const t = slides.find((x) => x.kind === "table" && x.title.startsWith("نسبة الحجز"));
  assert.ok(t && t.kind === "table");
  assert.deepEqual(t.columns, ["إجمالى الطلبات", "إجمالى الإمكانية", "متعذر", "توضيح عنوان", "بدون رد", "العنوان لا يتبع السنترال", "نسبة الحجز"]);
  assert.deepEqual(t.rows, [["1267", "1230", "36", "0", "0", "1", "97%"]]);
});

test("العرض المحفوظ قبل كده بياخد الخانات الجديدة لوحده (من غير SQL)، ومابيلمسش الإنجازات", async () => {
  const saved = normalizeDeck({ faults: { enabled: true, hiddenMonths: "2025-12" },
    booking: { enabled: true, asOf: "18 أكتوبر 2026", total: "1267", capacity: "1230" },
    achievements: { enabled: true, items: "سطر الحجز\nسطر فك المتعذرات", photoIds: [] } });
  // العمود القديم الواحد ⇒ اختيار المالك الجديد (٨ شهور لكل رسم) — كل شهر فى الفترة غيرهم مخفى
  const { OWNER_FAULT_MONTHS, periodMonths } = await import("../shared/presentation-deck");
  for (const [ind, k] of [["pt", "hiddenPt"], ["repeat", "hiddenRepeat"], ["in24", "hiddenIn24"]] as const) {
    const hidden = new Set((saved.faults as any)[k].split(","));
    const shown = periodMonths(new Date()).filter((m: string) => !hidden.has(m));
    assert.deepEqual(shown, OWNER_FAULT_MONTHS[ind], ind);
  }
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
  const only = defaultDeck(); only.faults.enabled = false; only.maintenance.enabled = false; only.booking.enabled = false; only.customers.growth = false;
  assert.ok(kinds(only).includes("divider:مؤشرات ومعدلات الأداء"));
  // مقفولة أو فاضية ⇒ مفيش شريحة
  only.installs.enabled = false;
  assert.ok(!kinds(only).some((x) => x.includes("تركيبات")));
  assert.ok(!kinds(only).includes("divider:مؤشرات ومعدلات الأداء"));
  const empty = defaultDeck(); empty.installs = { ...empty.installs, total: "", in24: "", in48: "", in120: "", avgHours: "" };
  assert.ok(!kinds(empty).some((x) => x.includes("تركيبات")));
  // عرض محفوظ قبل الشريحة دى بياخد أرقام سبتمبر لوحده
  assert.equal(normalizeDeck({ cover: { title: "x" } }).installs.in24, "155");
  // «متبقيات الأعطال» شريحة لوحدها بعد التركيبات على طول: 0 ⇒ «لا توجد متبقيات بإدارة الغنايم»
  const ri = k.indexOf("table:متبقيات الأعطال");
  assert.equal(ri, i + 1);
  assert.deepEqual((slides[ri] as any).rows, [["متبقيات الأعطال بإدارة الغنايم", "لا توجد متبقيات"]]);
  const d3 = defaultDeck(); d3.installs.remaining = "4";
  const r3 = buildSlides(d3, auto).find((s) => s.kind === "table" && s.title === "متبقيات الأعطال") as any;
  assert.deepEqual(r3.rows, [["متبقيات الأعطال بإدارة الغنايم", "4 عطل متبقى"]]);
  d3.installs.remaining = "";
  assert.ok(!buildSlides(d3, auto).some((s) => s.kind === "table" && s.title === "متبقيات الأعطال"));
  assert.equal(normalizeDeck({ installs: { enabled: true } }).installs.remaining, "0");
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
  assert.ok(!slides.some((s) => s.kind === "table" && s.title.startsWith("الأعطال مقارنة بالشغال")));
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
  // عرض محفوظ فيه اختيار لمؤشر بيفضل زى ما هو (الفاضى = كل الشهور ظاهرة)
  const saved = normalizeDeck({ faults: { enabled: true, hiddenMonths: "2026-03", hiddenRepeat: "" } });
  assert.equal(saved.faults.hiddenRepeat, "");
});

test("الرسم بـ٢٢ شهر (يناير 2025 – أكتوبر 2026): خط أصغر والسنة تحت اسم الشهر — فى الصفحة والباور بوينت", async () => {
  const { lineChartGeom, LINE_CHART, splitChartLabel } = await import("../shared/presentation-deck");
  // أسماء الشهور ≈ ٦٠٪ من خط القيم، ومن ١٤ شهر السنة تحت الاسم
  const g8 = lineChartGeom(Array.from({ length: 8 }, (_, i) => ({ label: `م ${i}`, value: 20 + i })), "");
  assert.deepEqual([g8.valueFs, g8.labelFs, g8.split], [22, 13, false]);
  const g22 = lineChartGeom(Array.from({ length: 22 }, (_, i) => ({ label: `م ${i}`, value: 20 + i })), "");
  assert.deepEqual([g22.valueFs, g22.labelFs, g22.split], [14, 9, true]);
  // سطرين الملاحظة والمتوسط تحت سطرين أسماء الشهور
  assert.ok(LINE_CHART.noteY >= LINE_CHART.y0 + 22 + 2 * (g22.labelFs + 2));
  assert.ok(LINE_CHART.avgY > LINE_CHART.noteY + 20);
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
  // اسم الشهر والسنة فقرتين منفصلين جوّه نفس المربع، ولونهم رمادى فاتح
  assert.match(xml, /<a:srgbClr val="9AA0A6"\/><\/a:solidFill>(?:(?!<\/a:r>).)*<a:t>يناير<\/a:t><\/a:r>(?:<a:endParaRPr[^>]*\/>)?<\/a:p><a:p><a:pPr[^>]*>(?:<a:buNone\/>)?<\/a:pPr><a:r><a:rPr[^>]*>(?:(?!<\/a:r>).)*<a:t>25<\/a:t>/s);
  // رسم خطى: نقط (ellipse) وخط «عند الاستلام» المتقطّع — مفيش أعمدة
  assert.match(xml, /prst="ellipse"/);
  assert.match(xml, /<a:prstDash val="dash"\/>/);
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

test("اختيار المالك + القيم المتوقعة + خط «عند الاستلام» + متوسط ديسمبر 2025 – سبتمبر 2026", async () => {
  const { periodAverage, OWNER_FAULT_MONTHS, periodMonths, monthPerThousand } = await import("../shared/presentation-deck");
  // أعطال MSAN لكل شهر — نوفمبر/مارس/أبريل/أغسطس من المالك، والباقى بيطلّع القيم اللى المالك كتبها على شغال كل شهر
  const faults: Record<string, number> = { "2025-11": 292, "2025-12": 266, "2026-01": 280, "2026-02": 253, "2026-03": 288,
    "2026-04": 282, "2026-05": 285, "2026-06": 280, "2026-07": 291, "2026-08": 277, "2026-09": 290, "2026-10": 150 };
  // التكرار والإزالة: عدّ خام بيطلّع نسب المالك (6.5% · 3.0% … و 93.6% · 94.3% …)
  const rep: Record<string, [number, number]> = { "2025-11": [213, 200], "2025-12": [206, 200], "2026-01": [208, 200], "2026-02": [206.6, 200],
    "2026-03": [207.6, 200], "2026-04": [205, 200], "2026-05": [208, 200], "2026-06": [211.4, 200], "2026-07": [207.8, 200],
    "2026-08": [209, 200], "2026-09": [207, 200], "2026-10": [204, 200] };
  const in24: Record<string, [number, number]> = { "2025-11": [936, 1000], "2025-12": [943, 1000], "2026-01": [940, 1000], "2026-02": [943, 1000],
    "2026-03": [947, 1000], "2026-04": [951, 1000], "2026-05": [939, 1000], "2026-06": [940, 1000], "2026-07": [952, 1000],
    "2026-08": [954, 1000], "2026-09": [950, 1000], "2026-10": [940, 1000] };
  const a: DeckAuto = { ...auto, faultsWorking: 10662, computedAt: "2026-10-21T10:00:00Z",
    faultsByMonth: Object.keys(faults).map((month) => {
      const [closed, phones] = rep[month], [i24, n] = in24[month];
      return { month, complaints: n, closed, phones, in24: i24, msanFaults: faults[month],
        repeatPct: Math.round((1000 * (closed - phones)) / phones) / 10, in24Pct: Math.round((1000 * i24) / n) / 10 };
    }) };
  // القيم المتوقعة من المالك
  const d = normalizeDeck({ faults: { enabled: true, hiddenMonths: "" } });   // عرض محفوظ قديم ⇒ اختيار المالك
  const pt = (m: string) => monthPerThousand(d, a, { month: m, msanFaults: faults[m] });
  assert.deepEqual(OWNER_FAULT_MONTHS.pt.map(pt), [29.9, 26.9, 25.2, 28.3, 27.6, 27.0, 27.9, 26.4]);
  const slides = buildSlides(d, a);
  const chart = (p: string) => slides.find((s) => s.kind === "chart" && s.title.startsWith(p)) as any;
  const c1 = chart("عدد الأعطال فى الألف"), c2 = chart("نسب تكرار"), c3 = chart("نتائج إزالة");
  assert.deepEqual(c1.points.map((p: any) => p.value), [29.9, 26.9, 25.2, 28.3, 27.6, 27.0, 27.9, 26.4]);
  assert.deepEqual(c2.points.map((p: any) => p.value), [6.5, 3, 3.3, 3.8, 2.5, 5.7, 3.9, 4.5]);
  assert.deepEqual(c3.points.map((p: any) => p.value), [93.6, 94.3, 94.3, 94.7, 95.1, 95.2, 95.4, 95]);
  assert.deepEqual(c3.points.map((p: any) => p.label), ["نوفمبر 25", "ديسمبر 25", "فبراير 26", "مارس 26", "أبريل 26", "يوليو 26", "أغسطس 26", "سبتمبر 26"]);
  // خط «عند الاستلام» عند قيمة نوفمبر 2025 فى التلاتة
  assert.deepEqual([c1.baseline, c2.baseline, c3.baseline], [
    { value: 29.9, label: "عند الاستلام" }, { value: 6.5, label: "عند الاستلام" }, { value: 93.6, label: "عند الاستلام" }]);
  // المتوسط على كل شهور ديسمبر – سبتمبر (مش الظاهرة بس)
  const months = periodMonths(new Date("2026-10-21T00:00:00Z")).filter((m) => m >= "2025-12" && m <= "2026-09");
  assert.equal(months.length, 10);
  const ptAvg = Math.round((months.map(pt).reduce((x, y) => x + (y as number), 0) / 10) * 100) / 100;
  assert.deepEqual(periodAverage(d, a, "pt"), { avg: ptAvg, handover: 29.9, method: "متوسط قيم الشهور" });
  // التكرار مرجّح: Σ(المغلقة − الأرقام) ÷ Σ الأرقام — مش متوسط النسب
  const rs = months.reduce((x, m) => x + rep[m][0] - rep[m][1], 0), ps = months.reduce((x, m) => x + rep[m][1], 0);
  assert.equal(periodAverage(d, a, "repeat").avg, Math.round((1000 * rs) / ps) / 10);
  assert.equal(periodAverage(d, a, "repeat").handover, 6.5);
  const is = months.reduce((x, m) => x + in24[m][0], 0), ns = months.reduce((x, m) => x + in24[m][1], 0);
  assert.equal(periodAverage(d, a, "in24").avg, Math.round((1000 * is) / ns) / 10);
  assert.equal(c1.avgNote, `متوسط ديسمبر 2025 – سبتمبر 2026: ${ptAvg} مقابل 29.9 فى نوفمبر 2025 (متوسط قيم الشهور)`);
  assert.match(c2.avgNote, /^متوسط ديسمبر 2025 – سبتمبر 2026: [\d.]+% مقابل 6\.5% فى نوفمبر 2025 \(مرجّح/);
  assert.match(c3.avgNote, /^متوسط ديسمبر 2025 – سبتمبر 2026: [\d.]+% مقابل 93\.6% فى نوفمبر 2025 \(مرجّح/);
  // ملف «جداول المتوسطات»: غلاف + ٣ جداول، نوفمبر أول صف، و١٠ شهور ديسمبر – سبتمبر، والصف الأخير = نفس رقم سطر المتوسط
  const { averageSlides } = await import("../shared/presentation-deck");
  const av = averageSlides(d, a) as any[];
  assert.deepEqual(av.map((x) => x.kind), ["cover", "table", "table", "table"]);
  assert.equal(av[0].title, "جداول حساب المتوسطات");
  const [tp, tr, ti] = av.slice(1);
  assert.equal(tp.rows.length, 12);
  assert.deepEqual(tp.rows[0], ["نوفمبر 2025 (عند الاستلام)", "292", "9,781", "29.9"]);
  assert.deepEqual(tp.rows[1], ["ديسمبر 2025", "266", "9,891", "26.9"]);
  assert.deepEqual(tp.rows[11], ["المتوسط", "", "", ptAvg.toFixed(2)]);
  assert.match(tp.note, /ديسمبر 2025 – سبتمبر 2026/);
  assert.ok(tp.totalLast && tr.totalLast && ti.totalLast);
  // التكرار: الصف الأخير إجماليات الفترة + النسبة المرجّحة
  assert.deepEqual(tr.columns, ["الشهر", "الأعطال المغلقة", "عدد الأرقام", "التكرار", "نسبة التكرار"]);
  assert.equal(tr.rows[11][2], ps.toLocaleString("en-US"));
  assert.equal(tr.rows[11][4], `${(Math.round((1000 * rs) / ps) / 10).toFixed(1)}%`);
  assert.equal(ti.rows[0][3], "93.6%");
  assert.equal(ti.rows[11][1], ns.toLocaleString("en-US"));
  assert.equal(ti.rows[11][3], `${(Math.round((1000 * is) / ns) / 10).toFixed(1)}%`);
  // والملف بيتعمل باور بوينت سليم
  const { deckPptx } = await import("./presentation-pptx");
  const JSZip = (await import("jszip")).default;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const im = { data: png, ext: "png" as const, w: 1, h: 1 };
  const zip = await JSZip.loadAsync(await deckPptx(av, { weWhite: im, wePurple: im, telecomEgypt: im }, new Map(), "x"));
  assert.ok(zip.file("ppt/slides/slide4.xml"));
  // من غير العدّ الخام (بيانات قديمة) مفيش سطر متوسط مرجّح — بدل رقم غلط
  const noRaw: DeckAuto = { ...a, faultsByMonth: a.faultsByMonth!.map(({ closed, phones, in24, ...m }) => m) };
  assert.equal(periodAverage(d, noRaw, "repeat").avg, null);
});

test("قيم الرسم الخطى بعلامة عشرية واحدة لو فيه قيمة كسرية (27.0 · 3.0% · 95.0%)", async () => {
  const { lineChartGeom } = await import("../shared/presentation-deck");
  assert.deepEqual(lineChartGeom([{ label: "a", value: 27 }, { label: "b", value: 27.9 }], "").pts.map((p) => p.text), ["27.0", "27.9"]);
  assert.deepEqual(lineChartGeom([{ label: "a", value: 3 }, { label: "b", value: 6.5 }], "%").pts.map((p) => p.text), ["3.0%", "6.5%"]);
  assert.deepEqual(lineChartGeom([{ label: "a", value: 3 }, { label: "b", value: 6 }], "%").pts.map((p) => p.text), ["3%", "6%"]);
});

test("نمو قاعدة العملاء (الشغال): نوفمبر 2025 ← الشهر الحالى، بعد شريحة الحجز وكنتيجة ليها", async () => {
  const { customerGrowth } = await import("../shared/presentation-deck");
  const a: DeckAuto = { ...auto, faultsWorking: 10662, computedAt: "2026-10-21T10:00:00Z" };
  const d = defaultDeck();
  const g = customerGrowth(d, a)!;
  assert.deepEqual([g.from, g.to, g.diff, g.pct, g.toMonth], [9781, 10751, 970, 9.9, "2026-10"]);
  assert.equal(g.months.length, 12);   // نوفمبر 2025 → أكتوبر 2026
  const slides = buildSlides(d, a);
  const k = slides.map((s) => s.kind + ":" + ("title" in s ? s.title : ""));
  const gi = k.indexOf("compare:نمو قاعدة العملاء (الشغال) — نتيجة ارتفاع نسبة الحجز");
  assert.ok(gi > 0 && gi === k.findIndex((x) => x.startsWith("compare:نسبة الحجز")) + 1);
  assert.ok(gi > k.indexOf("divider:مؤشرات ومعدلات الأداء"));
  const s = slides[gi] as any;
  assert.equal(s.panels.length, 1);
  assert.deepEqual(s.panels[0].before, { label: "عند الاستلام (نوفمبر 2025)", value: "9,781" });
  assert.deepEqual(s.panels[0].after, { label: "حالياً (أكتوبر 2026)", value: "10,751" });
  assert.equal(s.panels[0].delta, "\u200E+9.9%");
  assert.equal(s.panels[0].note, "زيادة 970 مشترك فى 11 شهر — نتيجة ارتفاع نسبة الحجز من 88% إلى 97% (طلبات أكتر اتركّبت)");
  assert.equal(s.table.columns[0], "نوفمبر 25");
  assert.equal(s.table.rows[0][0], "9,781");
  assert.equal(s.table.rows[0][11], "10,751");
  // الزرار يخفيها
  d.customers.growth = false;
  assert.ok(!buildSlides(d, a).some((x) => x.kind === "compare" && x.title.startsWith("نمو قاعدة العملاء")));
  // عرض محفوظ قديم بياخدها ظاهرة
  assert.equal(normalizeDeck({ customers: { weData: "" } }).customers.growth, true);
});

test("خطوط الصوت 12,019 والداتا 10,751 (أرقام المالك) — مرة واحدة فى العرض المحفوظ القديم، والمسح بيرجّع التلقائى", () => {
  const a: DeckAuto = { ...auto, total: { ...auto.total, msanVoice: 11521, msanData: 10662 } };
  const old = normalizeDeck({ cover: { title: "x" }, customers: { weData: "" } });
  assert.equal(old.overrides["total.msanVoice"], "12,019");
  assert.equal(old.overrides["total.msanData"], "10,751");
  const ov = buildSlides(old, a).find((s) => s.kind === "table" && s.title === old.cover.title) as any;
  assert.equal(ov.rows.find((r: string[]) => r[0] === "عدد الخطوط الشغالة صوت")[1], "12,019");
  assert.equal(ov.rows.find((r: string[]) => r[0] === "عدد الخطوط الشغالة داتا")[1], "10,751");
  // بعد الحفظ (فيه customers.growth) والمالك مسح الخانة ⇒ مابترجعش
  const saved = JSON.parse(JSON.stringify(old)); delete saved.overrides["total.msanVoice"];
  assert.equal(normalizeDeck(saved).overrides["total.msanVoice"], undefined);
  // رقم كان كاتبه قبل كده يفضل
  assert.equal(normalizeDeck({ customers: {}, overrides: { "total.msanVoice": "11900" } }).overrides["total.msanVoice"], "11900");
});

test("صور الصيانة «قبل وبعد»: شريحة لكل مجموعة، لحد صورتين قبل وصورتين بعد، والقديمة بس لو مفيش مجموعات", async () => {
  const { beforeAfterLayout } = await import("../shared/presentation-deck");
  const d = defaultDeck();
  d.maintenance.photoIds = ["old0001"];
  // من غير مجموعات ⇒ الشريحة القديمة زى ما هى
  assert.ok(buildSlides(d, auto).some((s) => s.kind === "photos" && s.title === "بعض صور أعمال الصيانة"));
  d.maintenance.photoSets = [
    { label: "الغنايم · كابينة 1-1 · بكس 5", before: ["bef0001", "bef0002"], after: ["aft0001"] },
    { label: "", before: [], after: [] },                     // فاضية ⇒ مالهاش شريحة
    { label: "دير الجنادلة · كابينة 3-1", before: ["bef0003"], after: ["aft0002", "aft0003"] },
  ];
  const slides = buildSlides(d, auto);
  const ba = slides.filter((s) => s.kind === "beforeAfter") as any[];
  assert.equal(ba.length, 2);
  assert.deepEqual(ba[0], { kind: "beforeAfter", title: "صور أعمال الصيانة — قبل وبعد", caption: "الغنايم · كابينة 1-1 · بكس 5",
    before: ["bef0001", "bef0002"], after: ["aft0001"] });
  assert.ok(!slides.some((s) => s.kind === "photos" && s.title === "بعض صور أعمال الصيانة"));
  // بعد جدول الصيانة على طول
  const k = slides.map((s) => s.kind + ":" + ("title" in s ? s.title : ""));
  assert.equal(k.indexOf("beforeAfter:صور أعمال الصيانة — قبل وبعد"), k.findIndex((x) => x.startsWith("table:خطة الصيانة")) + 1);
  // الحفظ بيقصّ لصورتين فى كل ناحية و١٢ مجموعة، وبيشيل المعرّفات الغلط
  const n = normalizeDeck({ maintenance: { photoSets: [
    { label: "x", before: ["aaaaaa1", "aaaaaa2", "aaaaaa3"], after: ["../evil", "bbbbbb1"] },
    ...Array.from({ length: 20 }, () => ({ label: "", before: [], after: [] })) ] } });
  assert.equal(n.maintenance.photoSets.length, 12);
  assert.deepEqual(n.maintenance.photoSets[0], { label: "x", before: ["aaaaaa1", "aaaaaa2"], after: ["bbbbbb1"] });
  assert.deepEqual(normalizeDeck({ maintenance: { enabled: true } }).maintenance.photoSets, []);
  // الهندسة: قبل يمين وبعد شمال، وصورتين جنب بعض جوّه الناحية
  const L = beforeAfterLayout(2, 1);
  assert.ok(L.before.label.x > L.after.label.x);
  assert.equal(L.before.photos.length, 2);
  assert.ok(L.before.photos[0].x > L.before.photos[1].x);
  assert.equal(L.after.photos.length, 1);
  assert.equal(L.after.photos[0].w, 580);
  // باور بوينت: لافتتين + الصور (contain) + الوصف
  const JSZip = (await import("jszip")).default;
  const { deckPptx } = await import("./presentation-pptx");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const im = { data: png, ext: "png" as const, w: 1, h: 1 };
  const images = new Map(["bef0001", "bef0002", "aft0001"].map((id) => [id, { ...im, ext: "jpeg" as const }]));
  const zip = await JSZip.loadAsync(await deckPptx([ba[0]], { weWhite: im, wePurple: im, telecomEgypt: im }, images));
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  assert.match(xml, /قبل الصيانة/);
  assert.match(xml, /بعد الصيانة/);
  assert.match(xml, /الغنايم · كابينة 1-1 · بكس 5/);
  assert.equal((xml.match(/<p:pic>/g) || []).length, 3 + 2);   // ٣ صور + لوجوهين الفوتر
});
