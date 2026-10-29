// المالك ٢٠٢٦-١٠-٢٩: «ايقاف po واقف عند اللوجين» — تابات «إيقاف PO» الكتير كانت كلها بتدوس Log In كل ٠٫٨ث،
// وكل دخول جديد بيخلّص جلسة الباقى (الكوكى واحدة للمتصفح). سكربت PO 0.9.17 بيدخل بنفس قفل سكربت القياس
// (DZS_LOGIN_AT، ٢٠ث): تاب واحد بيسجّل دخول (ضغطة واحدة) والباقى بيستنوا ويرجعوا لصفحة الرقم بنفس الجلسة.
// الاختبار بيشغّل السكربت نفسه على صفحة دخول وهمية فى كذا تاب بيشاركوا localStorage واحد.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SRC = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");

function browser(submitMoves = true) {
  let clock = 1_000_000;
  const shared = new Map<string, string>();
  const storage = (m: Map<string, string>) => ({
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; },
  });
  const tabs: any[] = [];
  function openTab(hash: string) {
    const intervals: Function[] = [], timers: { at: number; fn: Function }[] = [];
    const tab: any = { clicks: 0, nav: [] as string[], intervals, timers };
    const el = (tag = "div"): any => ({ tag, style: {}, value: "", setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {},
      getContext: () => null, click() { if (tag === "button") { tab.clicks++; if (submitMoves) tab.nav.push("submit"); } } });
    const user = el("input"), pass = el("input"), btn = el("button");
    const loc: any = { hash, pathname: "/expresse/login-page", search: "", origin: "https://10.42.187.101:8080",
      set href(v: string) { tab.nav.push(v); }, get href() { return loc.origin + loc.pathname + loc.search + loc.hash; }, reload() { tab.nav.push("reload"); } };
    const document: any = {
      hidden: false, body: { innerText: "Log In", appendChild() {} }, documentElement: { appendChild() {} },
      createElement: (t: string) => el(t), addEventListener() {},
      querySelector: (s: string) => (s.startsWith("#j_username") ? user : s === "#j_password" ? pass : /button/.test(s) ? btn : null),
      querySelectorAll: () => [],
    };
    class FakeDate extends Date { constructor(...a: any[]) { super(...((a.length ? a : [clock]) as [])); } static now() { return clock; } }
    const ctx: any = {
      console: { log() {}, warn() {} }, location: loc, document, navigator: {},
      history: { replaceState: (_s: any, _t: any, u: string) => { loc.hash = ""; void u; } },
      window: { addEventListener() {}, close() { tab.closed = true; } },
      localStorage: storage(shared), sessionStorage: storage(new Map()),
      setInterval: (fn: Function) => (intervals.push(fn), intervals.length), clearInterval: (id: number) => { intervals[id - 1] = () => {}; },
      setTimeout: (fn: Function, ms: number) => (timers.push({ at: clock + (ms || 0), fn }), timers.length), clearTimeout() {},
      fetch: () => new Promise(() => {}), URL, URLSearchParams, JSON, Promise, String, Number, Math, Array, Object, RegExp, Date: FakeDate,
      encodeURIComponent, decodeURIComponent, parseInt, isNaN, Blob: class {},
    };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    tabs.push(tab);
    return tab;
  }
  function advance(ms: number) {
    for (let t = 0; t < ms; t += 100) {
      clock += 100;
      for (const tab of tabs) {
        if (tab.nav.length) continue;                       // التاب اتنقل — صفحة تانية
        for (const x of tab.timers.filter((x: any) => x.at <= clock && !x.done)) { x.done = true; x.fn(); }
        if (clock % 800 === 0) tab.intervals.slice().forEach((fn: Function) => fn());
      }
    }
  }
  return { openTab, advance, shared, now: () => clock };
}

test("PO 0.9.17: many stop tabs on the login page — one logs in once, the rest wait and go back to their line", () => {
  const b = browser();
  const tabs = [1, 2, 3, 4, 5, 13].map((lane) => b.openTab(`#sf_po=15907952${lane % 10}&sf_stop=1&sf_lane=${lane}`));
  b.advance(15_000);
  const clicks = tabs.map((t) => t.clicks);
  assert.equal(clicks.reduce((a, c) => a + c, 0), 1, `ضغطات الدخول: ${clicks}`);
  assert.ok(Number(b.shared.get("DZS_LOGIN_AT")) > 0, "القفل المشترك مع سكربت القياس اتكتب");
  b.advance(10_000);
  const waiters = tabs.filter((t) => t.clicks === 0);
  assert.equal(waiters.length, 5);
  for (const t of waiters) assert.match(t.nav[0] || "", /\/expresse\/profileOptimization\?lineId=15907952\d$/, "رجع لصفحة رقمه");
  assert.equal(tabs.reduce((a, t) => a + t.clicks, 0), 1, "ولا تاب ضغط تانى وهو مستنى");
});

test("PO 0.9.17: a tab whose login did not move the page does not hammer Log In every tick", () => {
  const b = browser(false);                                  // الضغطة ماحرّكتش الصفحة (السيرفر بطىء)
  const t = b.openTab("#sf_po=159079529&sf_stop=1&sf_lane=13");
  b.advance(10_000);
  assert.equal(t.clicks, 1);                                 // 0.9.16 كان بيضغط ١٢ مرة فى العشر ثوانى دول
});

test("PO 0.9.17: respects a login that the measuring script (10.32) just made", () => {
  const b = browser();
  b.shared.set("DZS_LOGIN_AT", String(b.now()));
  const t = b.openTab("#sf_po=159079529&sf_stop=1&sf_lane=2");
  b.advance(25_000);
  assert.equal(t.clicks, 0);
  assert.match(t.nav[0] || "", /profileOptimization\?lineId=159079529$/);
});
