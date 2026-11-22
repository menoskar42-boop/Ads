// أبواب Service-Flow فى سكربتات التمبر منكى (المالك ٢٠٢٦-١٠-٢٩): تأمين شبكة الشركة حظر ريبليت،
// فكل سكربت بقى عنده قايمة أبواب لنفس Service-Flow بيجرّبها بالترتيب ويثبت على اللى يرد. وكل نتيجة
// بتتكتب فى الطابور **قبل** ما تتبعت، وبتتمسح بس لما السيرفر يستلمها، ورقمها (?sf_eid=…) بيمنع إنها
// تتسجّل مرتين (server/ingest-dedupe.ts). الاختبار ده بيشغّل كود الأبواب نفسه (مقصوص من السكربتات)
// على شبكة وهمية: باب مقفول، صفحة حظر HTML، كله واقع وبعدين رجع، سيرفر واقع، ورابط مش Service-Flow.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const ACTIVE = [
  "customer360-account-grabber.user.js", "dzs-expresse-v10.user.js", "dzs-profile-optimization.user.js",
  "provisioning-portal.user.js", "te-fcc-wfm-oss-subinfo.user.js", "we-oas-131-cabinet.user.js",
  "we-oas-bi-login.user.js", "wfm-voice-installation-raw.user.js",
];
const APEX = "https://oscardevs.com/serviceflow";
const REPLIT = "https://sf-menoskar42.replit.app/serviceflow";
const SUB = "https://serviceflow.oscardevs.com/serviceflow";
const noEid = (u: string) => u.replace(/[?&]sf_eid=[a-z0-9]+$/, "");
const eidOf = (u: string) => (u.match(/[?&]sf_eid=([a-z0-9]+)$/) || [])[1];

/** كود الأبواب من السكربت: من «أبواب Service-Flow» لحد آخر sfSendQueued. */
function doorsOf(src: string, from = 0): string {
  const a = src.indexOf("// ── أبواب Service-Flow", from);
  const b = src.indexOf("function sfSendQueued", a);
  const end = src.indexOf("\n  }\n", b);
  assert.ok(a > 0 && b > a && end > b, "كود الأبواب مش موجود");
  return src.slice(a, end + 4);
}

function sandbox(code: string, net: { fetch?: any; gm?: any }) {
  const store = new Map<string, string>();
  const ctx: any = {
    console: { log() {}, warn() {} },
    localStorage: { getItem: (k: string) => (store.has(k) ? store.get(k)! : null), setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k) },
    setTimeout: (fn: any, ms: number) => (ms >= 1000 ? 0 : setTimeout(fn, ms)), clearTimeout,
    setInterval: () => 0, AbortController, Response, URL, JSON, Promise, String, Number, Date, Math, Array, TypeError,
    fetch: net.fetch, GM_xmlhttpRequest: net.gm,
  };
  vm.createContext(ctx);
  vm.runInContext(code + "\n;globalThis.__d = { sfBases, sfBase, sfApiPath, sfOutbox, sfFlush, sfStore, " + (net.gm ? "sfGmx" : "sfFetch") + " };", ctx);
  return { d: ctx.__d, store };
}
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const html = (status = 403) => new Response("<html>blocked</html>", { status, headers: { "Content-Type": "text/html" } });
const post = (body = '{"a":1}') => ({ method: "POST", headers: { "Content-Type": "application/json" }, body });

test("every live script: three doors in order, all calls go through them", () => {
  for (const f of ACTIVE) {
    const src = read(f);
    assert.match(src, /const SF_DEFAULT_BASE = "https:\/\/oscardevs\.com\/serviceflow";/, f);
    assert.match(src, /const SF_BASES = \[SF_DEFAULT_BASE, "https:\/\/sf-menoskar42\.replit\.app\/serviceflow", "https:\/\/serviceflow\.oscardevs\.com\/serviceflow"\];/, f);
    assert.match(src, /^\/\/\s*@connect\s+oscardevs\.com\s*$/m, `${f}: @connect oscardevs.com`);
    assert.doesNotMatch(src, /window\.fetch\(\s*(SF_API_BASE|sfBase\(\))/, `${f}: fetch مباشر لـService-Flow`);
    assert.doesNotMatch(src, /(?<![\w.])fetch\(SF_API_BASE/, `${f}: fetch مباشر لـSF_API_BASE`);
    // GM_xmlhttpRequest مباشر مسموح بس جوّه sfGmx نفسها
    const outside = src.replace(/function sfGmx\(opts\) \{[\s\S]*?\n  \}\n/g, "").replace(/^\/\/ @grant.*$/gm, "");
    assert.doesNotMatch(outside, /(?<![\w.])GM_xmlhttpRequest\(/, `${f}: GM_xmlhttpRequest من غير الأبواب`);
    // كل السكربتات على نسخة الأبواب التانية (الكتابة قبل الإرسال + الرقم + العلامة)
    assert.match(src, /function sfBadge\(\)/, `${f}: العلامة البرتقانى`);
    assert.match(src, /const sfDelivered = /, `${f}: «وصلت فعلاً؟»`);
  }
  // الموديولين اللى بيتحقنوا فى صفحة WFM ليهم أبوابهم جوّاهم (مابيشوفوش باقى السكربت)
  assert.equal(read("te-fcc-wfm-oss-subinfo.user.js").match(/async function sfFetch\(/g)?.length, 2);
});

test("fetch doors: blocked → firewall page → the third answers, and it is remembered", async () => {
  const tried: string[] = [];
  const net = { fetch: async (url: string) => {
    tried.push(noEid(url));
    if (url.startsWith(APEX)) throw new TypeError("Failed to fetch");
    if (url.startsWith(REPLIT)) return html();
    return json({ ok: true });
  } };
  const { d, store } = sandbox(doorsOf(read("dzs-profile-optimization.user.js")), net);
  assert.deepEqual(Array.from(d.sfBases()), [APEX, REPLIT, SUB]);
  const r = await d.sfFetch(APEX + "/api/po-events/ingest", post());
  assert.equal(r.status, 200);
  assert.deepEqual(tried, [APEX, REPLIT, SUB].map((b) => b + "/api/po-events/ingest"));
  assert.equal(store.get("sf_base_ok"), SUB);
  assert.equal(d.sfBases()[0], SUB, "الباب اللى ردّ بيتجرّب الأول المرة الجاية");
  assert.equal(d.sfOutbox().length, 0, "وصلت ⇒ اتشالت من الطابور");
});

test("fetch doors: the result is written to the queue BEFORE it is sent, with its number", async () => {
  let seen: any = null;
  const { d } = sandbox(doorsOf(read("dzs-expresse-v10.user.js")), { fetch: async (url: string) => {
    seen = { queued: d.sfOutbox().length, eid: eidOf(url), storedId: d.sfOutbox()[0]?.id };
    return json({ ok: true });
  } });
  await d.sfFetch(APEX + "/api/case-138/measurements", post('{"items":[1]}'));
  assert.equal(seen.queued, 1, "كانت فى الطابور وهى بتتبعت (لو التاب اتقفل هنا ماتضيعش)");
  assert.ok(seen.eid && seen.eid === seen.storedId, "الرقم اللى رايح للسيرفر = رقمها فى الطابور");
  assert.equal(d.sfOutbox().length, 0);
});

test("fetch doors: all down → kept and sent later with the SAME number", async () => {
  let up = false; const got: any[] = [];
  const net = { fetch: async (url: string, o: any) => {
    if (!up) throw new TypeError("Failed to fetch");
    got.push({ url: noEid(url), eid: eidOf(url), body: o.body }); return json({ ok: true });
  } };
  const { d } = sandbox(doorsOf(read("dzs-expresse-v10.user.js")), net);
  const r = await d.sfFetch(APEX + "/api/case-138/measurements", post('{"items":[1]}'));
  assert.equal(r.status, 202);
  assert.deepEqual(await r.json(), { ok: true, queued: true });
  const id = d.sfOutbox()[0].id;
  await assert.rejects(d.sfFetch(APEX + "/api/x", {}), "GET مابيتخزّنش");
  assert.equal(d.sfOutbox().length, 1);
  up = true;
  await d.sfFlush();
  assert.equal(d.sfOutbox().length, 0);
  assert.deepEqual(got, [{ url: APEX + "/api/case-138/measurements", eid: id, body: '{"items":[1]}' }]);
});

test("fetch doors: server answered but not saved (5xx / 425) → stays queued; 4xx → dropped", async () => {
  let status = 503;
  const { d } = sandbox(doorsOf(read("customer360-account-grabber.user.js")), { fetch: async () => json({ message: "x" }, status) });
  const r = await d.sfFetch(APEX + "/api/line-accounts/ingest", post());
  assert.equal(r.status, 503, "المُنادى بيشوف رد السيرفر الحقيقى");
  assert.equal(d.sfOutbox().length, 1, "السيرفر واقع ⇒ تفضل وتتبعت تانى");
  status = 425; await d.sfFlush();
  assert.equal(d.sfOutbox().length, 1);
  assert.equal(d.sfOutbox()[0].tries, 1);
  status = 200; d.sfStore.set("sf_outbox_lock", "0"); await d.sfFlush();
  assert.equal(d.sfOutbox().length, 0);
  status = 400;
  await d.sfFetch(APEX + "/api/line-accounts/ingest", post());
  assert.equal(d.sfOutbox().length, 0, "السيرفر رفضها (بيانات غلط) ⇒ مابتتعادش للأبد");
});

test("fetch doors: other sites' requests pass through untouched", async () => {
  const seen: string[] = [];
  const { d } = sandbox(doorsOf(read("provisioning-portal.user.js")), { fetch: async (u: string) => { seen.push(u); return json({}); } });
  await d.sfFetch("https://provisioningportal.te.eg/provisioningPortal/api/x", post());
  assert.deepEqual(seen, ["https://provisioningportal.te.eg/provisioningPortal/api/x"]);
  assert.equal(d.sfOutbox().length, 0, "طلبات المواقع التانية مابتدخلش الطابور");
  assert.equal(d.sfApiPath("https://sf-menoskar42.replit.app/serviceflow/api/a?b=1"), "/api/a?b=1");
  assert.equal(d.sfApiPath("https://evil.example/serviceflow/api/a"), null);
});

test("GM doors: same order, callbacks unchanged, write-ahead + same number on resend", async () => {
  let up = false; const tried: string[] = []; const eids: string[] = [];
  const gm = (o: any) => setTimeout(() => {
    tried.push(noEid(o.url)); if (eidOf(o.url)) eids.push(eidOf(o.url)!);
    if (!up && !o.url.startsWith(SUB)) return o.onerror({ status: 0 });
    if (!up) return o.onload({ status: 200, responseHeaders: "content-type: text/html\r\n", responseText: "<html>" });
    o.onload({ status: 200, responseHeaders: "Content-Type: application/json; charset=utf-8\r\n", responseText: '{"ok":true}' });
  }, 1);
  const { d } = sandbox(doorsOf(read("we-oas-131-cabinet.user.js")), { gm });
  const res: any = await new Promise((resolve) => d.sfGmx({ method: "POST", url: APEX + "/api/phone-lines/ingest", data: '{"x":1}', onload: resolve, onerror: () => resolve("err") }));
  assert.equal(res.status, 202, "كله مقفول ⇒ اتخزّن");
  assert.deepEqual(tried, [APEX, REPLIT, SUB].map((b) => b + "/api/phone-lines/ingest"));
  assert.equal(d.sfOutbox().length, 1);
  const id = d.sfOutbox()[0].id;
  up = true; tried.length = 0;
  await d.sfFlush();
  assert.equal(d.sfOutbox().length, 0);
  assert.deepEqual(tried, [APEX + "/api/phone-lines/ingest"]);
  assert.ok(eids.every((e) => e === id), "كل المحاولات بنفس الرقم");
  // رابط مش Service-Flow بيروح لـGM_xmlhttpRequest زى ما هو
  tried.length = 0;
  await new Promise((resolve) => d.sfGmx({ method: "GET", url: "https://we-oas.te.eg/analytics/x", onload: resolve }));
  assert.deepEqual(tried, ["https://we-oas.te.eg/analytics/x"]);
});
