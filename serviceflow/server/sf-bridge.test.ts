// جسر Service-Flow (serviceflow/sf-bridge.user.js — المالك ٢٠٢٦-١٠-٢٩): بيشتغل مكان جهاز التنفيذ لباتشات
// القياس «بدون Real» العادية. الاختبار ده بيشغّل منطق الجسر نفسه (مقصوص من السكربت) على سيرفر وDZS
// وهميين: حجز الشغل، «أبدأ؟/استنى»، حتّة ورا حتّة، خط وقف، السيرفر وقع، وتابين قادة مع بعض.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const src = readFileSync(new URL("../sf-bridge.user.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const core = src.slice(src.indexOf("// ── bridge-core-start"), src.indexOf("// ── bridge-core-end"));

type Call = { path: string; body: any };
function world(opts: { reachable?: boolean; realChunk?: boolean; server?: (path: string, body: any) => any } = {}) {
  const store = new Map<string, any>();
  let clock = 1_000_000;
  const calls: Call[] = [], reports: any[] = [], opened: string[] = [], handles: any[] = [];
  let leased = false;   // زى السيرفر الحقيقى: المحجوز مابيرجعش تانى
  const server = opts.server || ((path: string, body: any) => {
    if (path.endsWith("/lease")) {
      const jobs = leased ? [] : Array.from({ length: 23 }, (_, i) => ({ id: 100 + i, accounts: ["acc" + i] }));
      leased = true;
      return { status: 200, json: { jobs } };
    }
    if (path.endsWith("/start")) return { status: 200, json: { ok: true, marker: body.ids[0], drop: [] } };
    return { status: 200, json: { ok: true } };
  });
  const env = {
    now: () => clock,
    get: (k: string, d: any) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d),
    set: (k: string, v: any) => store.set(k, v),
    live: async (path: string, body: any) => { calls.push({ path, body }); return server(path, body); },
    report: (b: any) => reports.push(b),
    openTab: (u: string) => { opened.push(u); const h = { url: u, closed: false, close() { h.closed = true; } }; handles.push(h); return h; },
    dzsReachable: async () => opts.reachable !== false,
    device: () => "PC-test", tabId: "tabA", token: () => "tok",
  };
  const ctx: any = { console, Date, JSON, Math, Set, Object, Array, Number, String, Promise, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(core + "\n;globalThis.__b = { makeBridge, bridgeHarvest, bridgeLaneUrl, bridgeLane, BRIDGE };", ctx);
  const B = ctx.__b;
  // الاختبارات القديمة مكتوبة على حتت ١٠ خطوط — المنطق نفسه؛ والافتراضى (خط لكل تاب) ليه اختبار لوحده تحت
  if (!opts.realChunk) B.BRIDGE.CHUNK = 10;
  return { B, bridge: B.makeBridge(env), env, store, calls, reports, opened, handles, tick: (ms: number) => { clock += ms; } };
}
/** تاب القياس خلّص الخطوط دى (زى ما سكربت القياس بيحفظها فى DZS_RESULTS_L90) والجسر نقلها. */
function measure(w: ReturnType<typeof world>, accs: string[], lane = "90") {
  const chunk = (w.store.get("sfb_chunks") || []).find((c: any) => c.lane === lane) || null;
  const results = accs.map((a) => ({ lineId: a, timestamp: new Date(1_700_000_000_000).toISOString() }));
  const next = w.B.bridgeHarvest(chunk, results, w.store.get("sfb_got_L" + lane) || {}, 1);
  if (next) w.store.set("sfb_got_L" + lane, next);
}
/** الحتّة الشغّالة رقم i (الترتيب اللى اتفتحت بيه) */
const chunkOf = (w: ReturnType<typeof world>, i = 0) => (w.store.get("sfb_chunks") || [])[i] ?? null;

test("leases, then measures in chunks of 10 on its own lane, and reports each chunk", async () => {
  const w = world();
  await w.bridge.tick();
  assert.equal(w.store.get("sfb_jobs").length, 23, "اتحجز الشغل");
  assert.equal(w.opened.length, 1);
  assert.match(w.opened[0], /^https:\/\/10\.42\.187\.101:8080\/expresse\/#sf_accounts=acc0%2Cacc1%2C.*acc9&sf_mode=noreal&sf_lane=90&sf_bridge=1$/);
  const chunk = chunkOf(w);
  assert.deepEqual(Array.from(chunk.ids), [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  assert.equal(chunk.marker, 100);
  measure(w, chunk.accs.slice(0, 4));
  w.tick(5000); await w.bridge.tick();
  assert.equal(chunkOf(w).doneN, 4);
  assert.equal(w.reports.length, 0, "لسه ماخلصتش");
  measure(w, chunk.accs);
  w.tick(5000); await w.bridge.tick();
  assert.equal(w.reports.length, 1);
  assert.ok(w.reports[0].done.every((d: any) => d.result === "done") && w.reports[0].done.length === 10);
  assert.equal(w.store.get("sfb_jobs").length, 13);
  w.tick(5000); await w.bridge.tick();
  assert.equal(w.opened.length, 2, "الحتّة التانية بدأت");
  assert.match(w.opened[1], /acc10%2C/);
});

test("server says wait (Real/raise ahead on DZS) → no tab, asks again after a minute", async () => {
  let wait = true;
  const w = world({ server: (path, body) => {
    if (path.endsWith("/lease")) return { status: 200, json: { jobs: [{ id: 1, accounts: ["a1"] }, { id: 2, accounts: ["a2"] }] } };
    if (path.endsWith("/start")) return wait ? { status: 200, json: { ok: false, wait: true, drop: [] } } : { status: 200, json: { ok: true, marker: 1, drop: [] } };
    return { status: 200, json: {} };
  } });
  await w.bridge.tick();
  assert.equal(w.opened.length, 0);
  assert.match(w.store.get("sfb_status").text, /مستنى — فيه Real أو رفع سرعة/);
  w.tick(30_000); await w.bridge.tick();
  assert.equal(w.calls.filter((c) => c.path.endsWith("/start")).length, 1, "مابيسألش قبل الدقيقة");
  wait = false; w.tick(31_000); await w.bridge.tick();
  assert.equal(w.opened.length, 1);
});

test("canceled jobs (drop) are removed; server down → continues on its own", async () => {
  const w = world({ server: (path, body) => {
    if (path.endsWith("/lease")) return { status: 200, json: { jobs: [{ id: 1, accounts: ["a1"] }, { id: 2, accounts: ["a2"] }, { id: 3, accounts: ["a3"] }] } };
    if (path.endsWith("/start")) return { status: 200, json: { ok: true, marker: 2, drop: [1] } };
    return { status: 200, json: {} };
  } });
  await w.bridge.tick();
  assert.deepEqual(Array.from(chunkOf(w).ids), [2, 3]);
  assert.ok(!w.store.get("sfb_jobs").some((j: any) => j.id === 1));

  const off = world({ server: (path) => (path.endsWith("/lease") ? { status: 200, json: { jobs: [{ id: 7, accounts: ["x"] }] } } : null) });
  await off.bridge.tick();
  const c = chunkOf(off);
  assert.equal(c.offline, true);
  assert.equal(c.marker, null);
  assert.equal(off.opened.length, 1, "مفيش باب رادّ ⇒ جهاز التنفيذ نفسه واقف، فالجسر يكمّل");
});

test("DZS not reachable (Wi-Fi) → keeps the jobs and waits; nothing opened", async () => {
  const w = world({ reachable: false });
  await w.bridge.tick();
  assert.equal(w.store.get("sfb_jobs").length, 23, "اتحجز وهو على الواى فاى");
  assert.equal(w.opened.length, 0);
  assert.match(w.store.get("sfb_status").text, /مستنى DZS يفتح/);
  await w.bridge.tick(true);
  assert.equal(w.opened.length, 1, "«ابدأ دلوقتى» بيتخطّى فحص DZS");
});

test("a stuck chunk ends as timeout; the marker is kept alive by /progress", async () => {
  const w = world();
  await w.bridge.tick();
  const chunk = chunkOf(w);
  measure(w, chunk.accs.slice(0, 3));
  for (let i = 0; i < 5; i++) { w.tick(60_000); await w.bridge.tick(); }
  assert.ok(w.calls.filter((c) => c.path.endsWith("/progress")).length >= 1, "لسه شغّال");
  assert.equal(w.reports.length, 1, "٣ دقايق من غير خط جديد ⇒ الحتّة خلصت");
  const res = w.reports[0].done.map((d: any) => d.result);
  assert.deepEqual(res.slice(0, 3), ["done", "done", "done"]);
  assert.ok(res.slice(3).every((r: string) => r === "timeout"));
});

test("only one leader tab acts; release returns everything to the executor", async () => {
  const w = world();
  w.store.set("sfb_lead", { id: "otherTab", at: 1_000_000 });
  await w.bridge.tick();
  assert.equal(w.calls.length, 0, "تاب تانى هو القائد");
  w.tick(151_000); await w.bridge.tick();
  assert.equal(w.opened.length, 1, "القائد سكت أكتر من ١٥٠ ثانية ⇒ ده ياخد مكانه");
  const n = w.bridge.releaseAll();
  assert.equal(n, 23);
  assert.deepEqual(Array.from(w.reports.at(-1).release).slice(0, 2), [100, 101]);
  assert.equal(w.store.get("sfb_chunks").length, 0);
});

test("harvest only picks the chunk's own accounts", () => {
  const w = world();
  const got = w.B.bridgeHarvest({ accs: ["a", "b"] }, [{ lineId: "a", timestamp: "2026-10-29T10:00:00Z" }, { lineId: "zz" }], {}, 5);
  assert.deepEqual(Object.keys(got), ["a"]);
  assert.equal(w.B.bridgeHarvest({ accs: ["a"] }, [{ lineId: "a" }], { a: 1 }, 5), null, "مفيش جديد");
});

test("script wiring: pages, permissions, and the server rules it depends on", () => {
  for (const m of ["https://www.google.com/*", "*://10.42.187.101:8080/expresse/*", "https://oscardevs.com/serviceflow*"]) {
    assert.ok(src.includes("// @match        " + m), m);
  }
  for (const g of ["GM_getValue", "GM_setValue", "GM_xmlhttpRequest", "GM_openInTab"]) assert.match(src, new RegExp("^// @grant\\s+" + g + "$", "m"));
  assert.match(src, /^\/\/ @run-at\s+document-start$/m, "ينقل نتيجة الحتّة قبل ما سكربت القياس يصفّرها");
  // الأسئلة اللحظية مابتتخزّنش، والتقارير بتتخزّن
  assert.match(src, /const keep = !queued && !opts\.sfNoQueue && method !== "GET"/);
  assert.match(src, /method: "POST", url: sfBase\(\) \+ path, sfNoQueue: true/);
  // السيرفر: الجسر ياخد «بدون Real» أولوية 0 من غير متابعة، وجهاز التنفيذ مايسحبش المحجوز
  assert.match(routes, /const bridgeable = \(a: string\) => `\(\$\{a\}\.type = 'measure' AND \$\{a\}\.priority = 0 AND \$\{isNoRealJob\(a\)\}/);
  assert.match(routes, /AND \(h\.bridge_lease_until IS NULL OR h\.bridge_lease_until < now\(\)\)\n(\s+--.*\n)?\s+AND NOT \$\{lanes\.bridge \? bridgeable\("h"\) : "FALSE"\}\n\s+AND COALESCE\(h\.site/);
  assert.match(routes, /AND \(bridge_lease_until IS NULL OR bridge_lease_until < now\(\)\)\n\s+AND NOT \$\{lanes\.bridge \? bridgeable\("exec_jobs"\) : "FALSE"\}\n\s+AND \$\{siteFreeFor\("exec_jobs", "\$3", lanes, "\$4::timestamptz"\)\}/);
  // ومابيبدأش لو Real/رفع سرعة مستنى قدّامه (اتلقطت على Postgres حقيقى)
  assert.match(routes, /AND NOT \$\{sharedGroup\("x"\)\}\n\s+AND \$\{queueRank\("x"\)\} < \$\{queueRank\("exec_jobs"\)\}\)/);
  assert.match(routes, /app\.post\("\/api\/exec-queue\/bridge\/token", requireAuth, requireSuperAdmin/);
  for (const p of ["lease", "start", "alive", "report"]) assert.match(routes, new RegExp(`app\\.post\\("/api/exec-queue/bridge/${p}", requireBridge`));
});

test("a long chunk that keeps moving keeps its marker alive (< 4 min apart) and is not cut", async () => {
  const w = world();
  await w.bridge.tick();
  const chunk = chunkOf(w);
  const aliveAt: number[] = [];
  for (let i = 1; i <= 10; i++) {
    w.tick(60_000);
    measure(w, chunk.accs.slice(0, i));   // خط كل دقيقة
    const before = w.calls.length;
    await w.bridge.tick();
    if (w.calls.slice(before).some((c) => c.path.endsWith("/progress"))) aliveAt.push(i);
  }
  assert.ok(aliveAt.length >= 3, "دقيقتين بدقيقتين: " + aliveAt.join(","));
  for (let k = 1; k < aliveAt.length; k++) assert.ok(aliveAt[k] - aliveAt[k - 1] < 4, "مفيش فجوة ٤ دقايق");
  assert.equal(w.reports.length, 1);
  assert.ok(w.reports[0].done.every((d: any) => d.result === "done"));
});

// زرار «جسر Tampermonkey» فى الإعدادات (المالك ٢٠٢٦-١٠-٢٩): «الباتشات المؤجّلة تروح للتمبر منكى… جهاز
// التنفيذ وصفحته لو الباتش عاجل فقط… وحط فى الإعدادات زر يشغّل أو يوقف الـAPI ده».
test("settings switch: off by default, super-admin key, lease/start refuse while off", () => {
  assert.match(routes, /const BRIDGE_ON_KEY = "exec_lanes_bridge";/, "بادئة exec_lanes_ = تعديله سوبر أدمن بس");
  assert.match(routes, /bridge: false \};/, "مقفول افتراضياً — ميزة اختيارية");
  assert.match(routes, /if \(r\.key === BRIDGE_ON_KEY\) out\.bridge = String\(r\.value\) === "1";/);
  assert.match(routes, /if \(!lanes\.bridge\) return res\.json\(\{ jobs: \[\], disabled: true \}\);/);
  assert.match(routes, /if \(!\(await readExecLanes\(pool\)\)\.bridge\) return res\.json\(\{ ok: false, disabled: true, drop: held \}\);/);
  // اتقفل ⇒ المحجوز المستنى يرجع لجهاز التنفيذ على طول (والحتّة الشغّالة تكمّل وترفع)
  assert.match(routes, /if \(body\.bridge === false\) \{\n\s+await pool\.query\(`UPDATE exec_jobs SET bridge_lease_until = NULL WHERE status = 'pending' AND bridge_lease_until IS NOT NULL`\);/);
  assert.match(routes, /bridgeSeenSec: bridgeSeen \?/);
  const ui = readFileSync(new URL("../client/src/components/ExecLanesSettingsButton.tsx", import.meta.url), "utf8");
  assert.match(ui, /measureStaleDays: \+staleDays, nightPause: night, bridge \}/);
  assert.match(ui, /<Switch checked=\{bridge\} onCheckedChange=\{setBridge\}/);
});

test("bridge switched off: drops what it holds (keeps a running chunk) and says so", async () => {
  let disabled = false;
  const w = world({ server: (path, body) => {
    if (path.endsWith("/lease")) return disabled ? { status: 200, json: { jobs: [], disabled: true } }
      : { status: 200, json: { jobs: Array.from({ length: 15 }, (_, i) => ({ id: 1 + i, accounts: ["a" + i] })) } };
    if (path.endsWith("/start")) return disabled ? { status: 200, json: { ok: false, disabled: true, drop: body.ids } }
      : { status: 200, json: { ok: true, marker: body.ids[0], drop: [] } };
    return { status: 200, json: { ok: true } };
  } });
  await w.bridge.tick();
  assert.equal(w.opened.length, 1);
  disabled = true;
  await w.bridge.lease();   // زرار «اسحب» وسط الحتّة
  assert.deepEqual(w.store.get("sfb_jobs").map((j: any) => j.id), Array.from(chunkOf(w).ids), "الحتّة الشغّالة بس");
  measure(w, chunkOf(w).accs);
  w.tick(5000); await w.bridge.tick();
  assert.equal(w.reports.length, 1, "الحتّة كمّلت ورفعت نتايجها");
  w.tick(5000); await w.bridge.tick();
  assert.equal(w.opened.length, 1, "مفيش حتّة جديدة");
  assert.match(w.store.get("sfb_status").text, /مقفول من إعدادات Service Flow/);

  // وسكربت فاتته رسالة lease (معاه أكتر من ١٠٠ خط) ⇒ start بيشيل الخطوط
  const w2 = world({ server: (path, body) => (path.endsWith("/start") ? { status: 200, json: { ok: false, disabled: true, drop: body.ids } } : { status: 200, json: {} }) });
  w2.store.set("sfb_jobs", Array.from({ length: 120 }, (_, i) => ({ id: i + 1, acc: "x" + i })));
  await w2.bridge.tick();
  assert.equal(w2.opened.length, 0);
  assert.equal(w2.store.get("sfb_jobs").length, 0);
  assert.match(w2.store.get("sfb_status").text, /مقفول/);
});

// المالك ٢٠٢٦-١٠-٢٩: «لو عاوز أعمل إيقاف أو تغيير فى تنفيذ الباتشات هينفع بعد سحب الشغل؟»
test("pause / cancel / reorder after the bridge pulled the work: it lets go of everything affected", async () => {
  // السيرفر: الإيقاف والترتيب بيفكّوا الحجز، وstart بيفحص كل اللى الجسر شايله
  assert.match(routes, /SET paused_at = now\(\), bridge_lease_until = CASE WHEN status = 'pending' THEN NULL ELSE bridge_lease_until END\n\s+WHERE batch_id = \$1/);
  assert.match(routes, /SET paused_at = now\(\), bridge_lease_until = CASE WHEN status = 'pending' THEN NULL ELSE bridge_lease_until END\n\s+WHERE status IN \('pending','claimed'\) AND paused_at IS NULL`\);/);
  assert.match(routes, /WHERE e\.batch_id = v\.batch_id AND e\.priority = 0`,[\s\S]{0,400}UPDATE exec_jobs SET bridge_lease_until = NULL WHERE status = 'pending' AND bridge_lease_until IS NOT NULL/);
  assert.match(routes, /const held = \[\.\.\.new Set\(\[\.\.\.ids, \.\.\.toJobIds\(req\.body\?\.held\)\]\)\];/);
  assert.match(routes, /AND NOT COALESCE\(status IN \('pending', 'claimed'\) AND paused_at IS NULL AND bridge_lease_until > now\(\), false\)`, \[held\]\);/, "الحجز الفاضى (NULL) لازم يتشال — اتلقطت على Postgres");

  // السكربت: بيبعت كل اللى معاه، وبيشيل كل اللى السيرفر قال عليه مرة واحدة
  let paused = new Set<number>(), leased = false;
  const w = world({ server: (path, body) => {
    if (path.endsWith("/lease")) {
      const jobs = leased ? [] : Array.from({ length: 30 }, (_, i) => ({ id: 1 + i, accounts: ["a" + i] }));
      leased = true;
      return { status: 200, json: { jobs } };
    }
    if (path.endsWith("/start")) {
      const drop = body.held.filter((id: number) => paused.has(id));
      return { status: 200, json: { ok: true, marker: body.ids.find((i: number) => !paused.has(i)), drop } };
    }
    return { status: 200, json: { ok: true } };
  } });
  await w.bridge.tick();
  const startCall = w.calls.find((c) => c.path.endsWith("/start"))!;
  assert.equal(startCall.body.held.length, 30, "بيبعت الـ٣٠ مش الـ١٠ بس");
  paused = new Set(Array.from({ length: 15 }, (_, i) => 11 + i));   // باتش اتوقّف: ١١…٢٥ وهى بتقيس
  measure(w, chunkOf(w).accs);
  w.tick(5000); await w.bridge.tick();          // الحتّة خلصت، والجاية كلها موقّفة
  const left = w.store.get("sfb_jobs").map((j: any) => j.id);
  assert.ok(!left.some((id: number) => paused.has(id)), "كل الموقّف اتشال مرة واحدة: " + left);
  assert.equal(w.opened.length, 2, "الحتّة اللى كانت جاية كلها موقّفة ⇒ اتشالت والجسر فتح اللى بعدها فى نفس الدورة");
  assert.deepEqual(Array.from(chunkOf(w).ids), [26, 27, 28, 29, 30]);
});

// المالك ٢٠٢٦-١٠-٢٩: «القياس والإيقاف ليهم عدد تابات لا يتخطّوها — فإيه العمل؟»
test("several tabs at once, up to the «بدون Real» count, and the server can say «full»", async () => {
  let full = false, starts = 0;
  const w = world({ server: (path, body) => {
    if (path.endsWith("/lease")) return { status: 200, json: starts ? { jobs: [], lanes: 3 } : { jobs: Array.from({ length: 60 }, (_, i) => ({ id: 1 + i, accounts: ["a" + i] })), lanes: 3 } };
    if (path.endsWith("/start")) { starts++; return full ? { status: 200, json: { ok: false, wait: true, drop: [] } } : { status: 200, json: { ok: true, marker: body.ids[0], drop: [] } }; }
    return { status: 200, json: { ok: true } };
  } });
  for (let i = 0; i < 5; i++) { await w.bridge.tick(); w.tick(5000); }
  assert.equal(w.opened.length, 3, "لحد ٣ بس (العدد فى الإعدادات)");
  assert.deepEqual(w.opened.map((u) => (u.match(/sf_lane=(\d+)/) || [])[1]), ["90", "91", "92"]);
  const ids = w.store.get("sfb_chunks").map((c: any) => Array.from(c.ids));
  assert.deepEqual(Array.from(ids.map((x: number[]) => x[0])), [1, 11, 21], "كل تاب حتّة مختلفة");

  // تاب 91 خلص ⇒ رقمه بيرجع لحتّة جديدة، والتانيين مكمّلين
  measure(w, w.store.get("sfb_chunks")[1].accs, "91");
  await w.bridge.tick();
  assert.equal(w.reports.length, 1);
  assert.deepEqual(Array.from(w.reports[0].done.map((d: any) => d.id)).slice(0, 2), [11, 12]);
  assert.equal(w.opened.length, 4);
  assert.match(w.opened[3], /sf_lane=91&/);
  assert.deepEqual(Array.from(w.store.get("sfb_chunks").map((c: any) => c.lane)).sort(), ["90", "91", "92"]);

  // السيرفر قال «مليانة» (تابات جهاز التنفيذ واخدة الباقى) ⇒ مابيفتحش، وبيسأل بعد دقيقة
  measure(w, w.store.get("sfb_chunks")[0].accs, "90");
  full = true;
  w.tick(5000); await w.bridge.tick();
  assert.equal(w.opened.length, 4);
  assert.match(w.store.get("sfb_status").text, /العدد المسموح فى الإعدادات اتملى/);
  w.tick(30_000); const s1 = starts; await w.bridge.tick();
  assert.equal(starts, s1, "مابيسألش قبل الدقيقة");
  full = false; w.tick(31_000); await w.bridge.tick();
  assert.equal(w.opened.length, 5);
  assert.match(w.opened[4], /sf_lane=90&/);
});

test("a chunk running under 1.2 (sfb_chunk) carries over to tab 90", async () => {
  const w = world();
  w.store.set("sfb_jobs", [{ id: 5, acc: "x5" }, { id: 6, acc: "x6" }]);
  w.store.set("sfb_chunk", { ids: [5, 6], accs: ["x5", "x6"], marker: 5, startedAt: 1_000_000, lastAt: 1_000_000, doneN: 0 });
  w.store.set("sfb_got", { x5: 1 });
  await w.bridge.tick();
  assert.equal(w.store.get("sfb_chunk"), null);
  assert.equal(chunkOf(w).lane, "90");
  measure(w, ["x6"], "90");
  w.tick(5000); await w.bridge.tick();
  assert.deepEqual(Array.from(w.reports[0].done.map((d: any) => d.result)), ["done", "done"]);
});

test("server sends the «بدون Real» tab count with the lease", () => {
  assert.match(routes, /res\.json\(\{ jobs: rows, leaseHours: BRIDGE_LEASE_HOURS, lanes: lanes\.noreal \}\);/);
});

// المالك ٢٠٢٦-١٠-٢٩: «شغّال على 4 تاب (0 من 40 خط)» والتابات قاست فعلاً — تاب DZS بيتقفل بعد الخط بثانيتين
// فنتيجته ممكن تفوت. الجسر بقى يسأل السيرفر (سكربت القياس بيرفع كل خط لـcase_138).
test("progress comes from the server (case_138), even if no DZS tab result is ever seen", async () => {
  let measured: number[] = [];
  const w = world({ server: (path, body) => {
    if (path.endsWith("/lease")) return { status: 200, json: { jobs: Array.from({ length: 10 }, (_, i) => ({ id: 1 + i, accounts: ["a" + i] })) } };
    if (path.endsWith("/start")) return { status: 200, json: { ok: true, marker: body.ids[0], drop: [], now: "2026-10-29T17:30:00.000Z" } };
    if (path.endsWith("/progress")) return { status: 200, json: { ok: true, measured } };
    return { status: 200, json: { ok: true } };
  } });
  await w.bridge.tick();
  assert.equal(chunkOf(w).since, "2026-10-29T17:30:00.000Z", "ساعة السيرفر");
  measured = [1, 2, 3];
  w.tick(31_000); await w.bridge.tick();
  const pr = w.calls.filter((c) => c.path.endsWith("/progress")).at(-1)!;
  assert.deepEqual(Array.from(pr.body.chunks[0].ids).slice(0, 2), [1, 2]);
  assert.equal(pr.body.chunks[0].marker, 1);
  assert.equal(chunkOf(w).doneN, 3);
  w.tick(10_000); await w.bridge.tick();
  assert.equal(w.calls.filter((c) => c.path.endsWith("/progress")).length, 1, "كل نص دقيقة بس");
  measured = Array.from({ length: 10 }, (_, i) => 1 + i);
  w.tick(31_000); await w.bridge.tick();
  assert.equal(w.reports.length, 1);
  assert.ok(w.reports[0].done.every((d: any) => d.result === "done"));
});

test("harvest ignores an older result for the same line; server keeps urgent shared jobs first", () => {
  const w = world();
  const chunk = { accs: ["a"], startedAt: Date.parse("2026-10-29T17:30:00Z") };
  assert.equal(w.B.bridgeHarvest(chunk, [{ lineId: "a", timestamp: "2026-10-29T16:00:00Z" }], {}, 5), null, "قياس امبارح/من ساعة");
  assert.ok(w.B.bridgeHarvest(chunk, [{ lineId: "a", timestamp: "2026-10-29T17:31:00Z" }], {}, 5));
  assert.match(src, /\/\^DZS_RESULTS\(_L\\d\+\)\?\$\/\.test\(k\)/, "كل مفاتيح النتايج");
  assert.match(routes, /app\.post\("\/api\/exec-queue\/bridge\/progress", requireBridge/);
  assert.match(routes, /WHERE c\.account_no = e\.accounts->>0 AND c\.source = 'dzs' AND c\.uploaded_at >= d\.since/);
  assert.match(routes, /AND \$\{sharedGroup\("x"\)\} AND NOT \$\{bridgeable\("x"\)\}\n[\s\S]{0,400}< \$\{laneCap\("x", lanes\)\}\)/);
  assert.match(routes, /res\.json\(\{ \.\.\.out, now: new Date\(\)\.toISOString\(\) \}\);/);
});

// المالك ٢٠٢٦-١٠-٢٩: «بيفتح تابات فى نوافذ مش فى نفس النافذة» — ١٠ خطوط فى التاب خلّت سكربت القياس يفتح كل
// خط فى نافذة (وضعه اليدوى). دلوقتى خط لكل تاب زى جهاز التنفيذ، والجسر بيقفل التاب لما خطه يخلص.
test("one line per tab (like the executor), up to 3 new tabs per cycle, and the finished tab is closed", async () => {
  let measured: number[] = [];
  const w = world({ realChunk: true, server: (path, body) => {
    if (path.endsWith("/lease")) return { status: 200, json: { jobs: Array.from({ length: 8 }, (_, i) => ({ id: 1 + i, accounts: ["a" + i] })), lanes: 5 } };
    if (path.endsWith("/start")) return { status: 200, json: { ok: true, marker: body.ids[0], drop: [], now: "2026-10-29T17:30:00.000Z" } };
    if (path.endsWith("/progress")) return { status: 200, json: { ok: true, measured } };
    return { status: 200, json: { ok: true } };
  } });
  assert.equal(w.B.BRIDGE.CHUNK, 1);
  await w.bridge.tick();
  assert.equal(w.opened.length, 3, "٣ فى الدورة الأولى");
  for (const u of w.opened) assert.match(u, /#sf_accounts=a\d&sf_mode=noreal&sf_lane=9\d&sf_bridge=1$/, "خط واحد فى كل تاب");
  w.tick(5000); await w.bridge.tick();
  assert.equal(w.opened.length, 5, "لحد العدد (٥)");
  measured = [1];
  w.tick(11_000); await w.bridge.tick();
  assert.equal(w.reports.length, 1);
  assert.equal(w.handles[0].closed, true, "تاب الخط اللى خلص اتقفل");
  assert.equal(w.handles[1].closed, false);
  assert.equal(w.opened.length, 6, "والتاب اتفتح لخط جديد");
  assert.match(w.opened[5], /sf_lane=90&/, "على نفس الرقم اللى فضى");
  assert.match(src, /^\/\/ @grant\s+window\.close$/m, "تاب الجسر بيقفل نفسه");
  assert.match(src, /sessionStorage\.setItem\("SFB_TAB"/);
});
