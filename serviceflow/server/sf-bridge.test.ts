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
function world(opts: { reachable?: boolean; server?: (path: string, body: any) => any } = {}) {
  const store = new Map<string, any>();
  let clock = 1_000_000;
  const calls: Call[] = [], reports: any[] = [], opened: string[] = [];
  const server = opts.server || ((path: string, body: any) => {
    if (path.endsWith("/lease")) return { status: 200, json: { jobs: Array.from({ length: 23 }, (_, i) => ({ id: 100 + i, accounts: ["acc" + i] })) } };
    if (path.endsWith("/start")) return { status: 200, json: { ok: true, marker: body.ids[0], drop: [] } };
    return { status: 200, json: { ok: true } };
  });
  const env = {
    now: () => clock,
    get: (k: string, d: any) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d),
    set: (k: string, v: any) => store.set(k, v),
    live: async (path: string, body: any) => { calls.push({ path, body }); return server(path, body); },
    report: (b: any) => reports.push(b),
    openTab: (u: string) => opened.push(u),
    dzsReachable: async () => opts.reachable !== false,
    device: () => "PC-test", tabId: "tabA", token: () => "tok",
  };
  const ctx: any = { console, Date, JSON, Math, Set, Object, Array, Number, String, Promise, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(core + "\n;globalThis.__b = { makeBridge, bridgeHarvest, bridgeLaneUrl, BRIDGE };", ctx);
  const B = ctx.__b;
  return { B, bridge: B.makeBridge(env), env, store, calls, reports, opened, tick: (ms: number) => { clock += ms; } };
}
/** تاب القياس خلّص الخطوط دى (زى ما سكربت القياس بيحفظها فى DZS_RESULTS_L90) والجسر نقلها. */
function measure(w: ReturnType<typeof world>, accs: string[]) {
  const chunk = w.store.get("sfb_chunk");
  const results = accs.map((a) => ({ lineId: a, timestamp: new Date(1_700_000_000_000).toISOString() }));
  const next = w.B.bridgeHarvest(chunk, results, w.store.get("sfb_got") || {}, 1);
  if (next) w.store.set("sfb_got", next);
}

test("leases, then measures in chunks of 10 on its own lane, and reports each chunk", async () => {
  const w = world();
  await w.bridge.tick();
  assert.equal(w.store.get("sfb_jobs").length, 23, "اتحجز الشغل");
  assert.equal(w.opened.length, 1);
  assert.match(w.opened[0], /^https:\/\/10\.42\.187\.101:8080\/expresse\/#sf_accounts=acc0%2Cacc1%2C.*acc9&sf_mode=noreal&sf_lane=90&sf_bridge=1$/);
  const chunk = w.store.get("sfb_chunk");
  assert.deepEqual(Array.from(chunk.ids), [100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  assert.equal(chunk.marker, 100);
  measure(w, chunk.accs.slice(0, 4));
  w.tick(5000); await w.bridge.tick();
  assert.equal(w.store.get("sfb_chunk").doneN, 4);
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
  assert.deepEqual(Array.from(w.store.get("sfb_chunk").ids), [2, 3]);
  assert.ok(!w.store.get("sfb_jobs").some((j: any) => j.id === 1));

  const off = world({ server: (path) => (path.endsWith("/lease") ? { status: 200, json: { jobs: [{ id: 7, accounts: ["x"] }] } } : null) });
  await off.bridge.tick();
  const c = off.store.get("sfb_chunk");
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

test("a stuck chunk ends as timeout; the marker is kept alive every 2 minutes", async () => {
  const w = world();
  await w.bridge.tick();
  const chunk = w.store.get("sfb_chunk");
  measure(w, chunk.accs.slice(0, 3));
  for (let i = 0; i < 5; i++) { w.tick(60_000); await w.bridge.tick(); }
  assert.ok(w.calls.filter((c) => c.path.endsWith("/alive")).length >= 1, "لسه شغّال");
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
  assert.equal(w.store.get("sfb_chunk"), null);
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
  const chunk = w.store.get("sfb_chunk");
  const aliveAt: number[] = [];
  for (let i = 1; i <= 10; i++) {
    w.tick(60_000);
    measure(w, chunk.accs.slice(0, i));   // خط كل دقيقة
    const before = w.calls.length;
    await w.bridge.tick();
    if (w.calls.slice(before).some((c) => c.path.endsWith("/alive"))) aliveAt.push(i);
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
  assert.match(routes, /if \(!\(await readExecLanes\(pool\)\)\.bridge\) return res\.json\(\{ jobs: \[\], disabled: true \}\);/);
  assert.match(routes, /if \(!\(await readExecLanes\(pool\)\)\.bridge\) return res\.json\(\{ ok: false, disabled: true, drop: ids \}\);/);
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
  assert.deepEqual(w.store.get("sfb_jobs").map((j: any) => j.id), Array.from(w.store.get("sfb_chunk").ids), "الحتّة الشغّالة بس");
  measure(w, w.store.get("sfb_chunk").accs);
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
