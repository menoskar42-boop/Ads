// المالك ٢٠٢٦-١٠-٢٩: «ايقاف po واقف عند اللوجين» — تابات «إيقاف PO» الكتير كانت كلها بتدوس Log In كل ٠٫٨ث،
// وكل دخول جديد بيخلّص جلسة الباقى (الكوكى واحدة للمتصفح). سكربت PO 0.9.17 بيدخل بنفس قفل سكربت القياس
// (DZS_LOGIN_AT، ٢٠ث): تاب واحد بيسجّل دخول (ضغطة واحدة) والباقى بيستنوا ويرجعوا لصفحة الرقم بنفس الجلسة.
// 0.9.18: قبل الدخول بيجرّب صفحة الرقم بالجلسة الحالية (صفحة الدخول ممكن تكون قديمة والجلسة شغّالة).
// الاختبار بيشغّل السكربت نفسه فى كذا تاب بيشاركوا localStorage وجلسة واحدة: كل تنقّل = تحميل صفحة جديد
// فى نفس التاب (نفس sessionStorage) — صفحة الرقم لو الجلسة شغّالة، وصفحة الدخول لو لأ.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SRC = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");

function browser(opts: { session?: boolean; submitMoves?: boolean } = {}) {
  let clock = 1_000_000;
  let session = !!opts.session;                                  // كوكى الجلسة — واحدة للمتصفح كله
  const submitMoves = opts.submitMoves !== false;
  const shared = new Map<string, string>();
  const storage = (m: Map<string, string>) => ({
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; },
  });
  const tabs: any[] = [];
  function load(tab: any, hash: string) {
    // صفحة جديدة: مؤقتات جديدة، ونفس sessionStorage بتاع التاب
    const page: any = { intervals: [] as Function[], timers: [] as any[], gone: false };
    tab.page = page; tab.loads++;
    const el = (tag = "div"): any => ({ tag, style: {}, value: "", setAttribute() {}, appendChild() {}, remove() {}, addEventListener() {},
      getContext: () => null, click() {
        if (tag !== "button" || page.gone) return;
        tab.clicks++;
        if (submitMoves) { session = true; go("/expresse/profileOptimization?lineId=x"); }
      } });
    const user = el("input"), pass = el("input"), btn = el("button");
    const loc: any = { hash, pathname: "/expresse/login-page", search: "", origin: "https://10.42.187.101:8080",
      set href(v: string) { go(v); }, get href() { return loc.origin + loc.pathname + loc.search + loc.hash; }, reload() { go(loc.href); } };
    function go(url: string) {
      if (page.gone) return;
      page.gone = true; tab.nav.push(url);
      // صفحة الرقم بالجلسة الشغّالة ⇒ التاب وصل (مش بنكمّل محاكاة صفحة الـPO نفسها)
      if (session && /\/expresse\/profileOptimization/.test(url)) { tab.onPo = true; return; }
      load(tab, "");                                             // الجلسة خلصانة ⇒ السيرفر بيرجّعه لصفحة الدخول
    }
    const document: any = {
      hidden: false, body: { innerText: "Log In", appendChild() {} }, documentElement: { appendChild() {} },
      createElement: (t: string) => el(t), addEventListener() {},
      querySelector: (s: string) => (s.startsWith("#j_username") ? user : s === "#j_password" ? pass : /button/.test(s) ? btn : null),
      querySelectorAll: () => [],
    };
    class FakeDate extends Date { constructor(...a: any[]) { super(...((a.length ? a : [clock]) as [])); } static now() { return clock; } }
    const ctx: any = {
      console: { log() {}, warn() {} }, location: loc, document, navigator: {},
      history: { replaceState: () => { loc.hash = ""; } },
      window: { addEventListener() {}, close() { tab.closed = true; } },
      localStorage: storage(shared), sessionStorage: tab.ss,
      setInterval: (fn: Function) => (page.intervals.push(fn), page.intervals.length), clearInterval: (id: number) => { page.intervals[id - 1] = () => {}; },
      setTimeout: (fn: Function, ms: number) => (page.timers.push({ at: clock + (ms || 0), fn }), page.timers.length), clearTimeout() {},
      fetch: () => new Promise(() => {}), URL, URLSearchParams, JSON, Promise, String, Number, Math, Array, Object, RegExp, Date: FakeDate,
      encodeURIComponent, decodeURIComponent, parseInt, isNaN, Blob: class {},
    };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
  }
  function openTab(hash: string) {
    const tab: any = { clicks: 0, loads: 0, nav: [] as string[], ss: storage(new Map()), onPo: false };
    tabs.push(tab);
    load(tab, hash);
    return tab;
  }
  function advance(ms: number) {
    for (let t = 0; t < ms; t += 100) {
      clock += 100;
      for (const tab of tabs) {
        if (tab.onPo) continue;
        const page = tab.page;
        for (const x of page.timers.filter((x: any) => x.at <= clock && !x.done)) { if (page.gone) break; x.done = true; x.fn(); }
        if (!page.gone && clock % 800 === 0) page.intervals.slice().forEach((fn: Function) => { if (!page.gone && tab.page === page) fn(); });
      }
    }
  }
  return { openTab, advance, shared, now: () => clock, expire: () => { session = false; } };
}

const lanes = [1, 2, 3, 4, 5, 13];
const open = (b: ReturnType<typeof browser>) => lanes.map((lane) => b.openTab(`#sf_po=15907952${lane % 10}&sf_stop=1&sf_lane=${lane}`));

test("PO 0.9.17: many stop tabs, session expired — one logs in once, the rest wait and reach their line", () => {
  const b = browser();
  const tabs = open(b);
  b.advance(40_000);
  const clicks = tabs.map((t) => t.clicks);
  assert.equal(clicks.reduce((a, c) => a + c, 0), 1, `ضغطات الدخول: ${clicks}`);
  assert.ok(Number(b.shared.get("DZS_LOGIN_AT")) > 0, "القفل المشترك مع سكربت القياس اتكتب");
  for (const t of tabs) assert.ok(t.onPo, "كل تاب وصل لصفحة رقمه");
  for (const t of tabs) assert.match(t.nav[0] || "", /\/expresse\/profileOptimization\?lineId=15907952\d$/, "أول حاجة جرّب صفحة رقمه");
});

test("PO 0.9.18: a stale login page with a live session goes straight to the line — no login at all", () => {
  const b = browser({ session: true });                        // المالك فتح ClearView من غير ما يطلب دخول
  const tabs = open(b);
  b.advance(5_000);
  assert.equal(tabs.reduce((a, t) => a + t.clicks, 0), 0);
  for (const t of tabs) assert.ok(t.onPo);
});

test("PO 0.9.17: a login click that did not move the page is not repeated every tick", () => {
  const b = browser({ submitMoves: false });                    // السيرفر بطىء: الضغطة ماحرّكتش الصفحة
  const t = b.openTab("#sf_po=159079529&sf_stop=1&sf_lane=13");
  b.advance(15_000);
  assert.equal(t.clicks, 1);                                    // 0.9.16 كان بيضغط كل ٠٫٨ث
});

test("PO 0.9.17: respects a login that the measuring script (10.32) just made", () => {
  const b = browser();
  const t = b.openTab("#sf_po=159079529&sf_stop=1&sf_lane=2");
  b.shared.set("DZS_LOGIN_AT", String(b.now()));               // سكربت القياس لسه داخل
  b.advance(15_000);
  assert.equal(t.clicks, 0, "مستنى دخول القياس");
});
