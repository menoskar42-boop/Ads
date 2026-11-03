// المالك ٢٠٢٦-١١-٠٣: «خلى يتسجل تقرير بإيه اللى حصل فى الإيقاف بالظبط». السكربت الحقيقى (dzs-profile-optimization
// 0.9.24) بيشتغل فى Chromium على صفحة AXON وهمية: خط In Nightly PO وفى الصفحة نص «Real-time PO» قديم (السبب اللى
// اتصلّح فى 0.9.23) ⇒ لازم يوقّفه، ويبعت الإيقاف + سجل الخطوات لـService-Flow.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";

const script = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");

test("PO stop on a fake AXON page: stops a Nightly line despite old «Real-time PO» text, and ships the step log", async () => {
  const { chromium } = await import("playwright");
  const ACC = "128721940";
  let status = "In Nightly PO";
  const events: any[] = [], traces: any[] = [];
  const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    if (req.method === "POST" && url.pathname.startsWith("/serviceflow/api/")) {
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
        const j = JSON.parse(b || "{}");
        (url.pathname.endsWith("/po-traces/ingest") ? traces : url.pathname.endsWith("/po-events/ingest") ? events : []).push(...(j.items || []));
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ saved: (j.items || []).length }));
      });
      return;
    }
    if (url.pathname === "/expresse/stop") { setTimeout(() => { status = "Not Started"; }, 300); res.end("ok"); return; }
    if (url.pathname === "/expresse/profileOptimization") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(`
        <table><tr><th>Date</th><th>Status</th><th>Start Time</th></tr><tr><td>2026-10-25</td><td>Completed under Real-time PO</td><td>09:06</td></tr></table>
        <h3>Profile Optimization Control</h3>
        <table><tr><td>Status</td><td id="st">${status}</td></tr></table>
        <label>Choose Action</label>
        <select id="act" onchange="if (this.value === 'stop') document.getElementById('dlg').style.display = 'block'">
          <option value="">Choose Action</option><option value="start">Start Realtime PO</option><option value="stop">Stop Nightly PO</option>
        </select>
        <div id="dlg" class="ui-dialog" role="dialog" style="display:none">Confirm Action — Stop Nightly PO?
          <button type="button" onclick="fetch('/expresse/stop').then(() => { document.getElementById('dlg').style.display = 'none'; })">Yes</button>
          <button type="button">No</button>
        </div>`));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(({ code, sf }) => {
      try { localStorage.setItem("sf_base", sf); } catch (e) {}
      // نفس اللى Tampermonkey بيعمله: السكربت بيشتغل بعد ما الصفحة تتحمّل
      window.addEventListener("DOMContentLoaded", () => { try { new Function(code)(); } catch (e) { console.error("script error", e); } });
    }, { code: script, sf: `${base}/serviceflow` });
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await p.goto(`${base}/expresse/profileOptimization?lineId=${ACC}#sf_po=${ACC}&sf_stop=1&sf_lane=90&sf_bridge=1`);
    // زى جهاز التنفيذ: أول ما نتيجة الإيقاف توصل السيرفر بيقفل التاب (قبل advance بتاع السكربت) —
    // السجل لازم يكون اتبعت معاها (٠.٩.٢٤ كان بيبعته فى advance فبيتحبس فى التاب)
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !events.length) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    await p.close();
    const t2 = Date.now() + 5_000;
    while (Date.now() < t2 && !traces.length) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(errors, []);
    assert.equal(status, "Not Started", "الإيقاف اتداس فعلاً");
    assert.deepEqual(events.map((e) => [e.accountNo, e.event, e.result]), [[ACC, "stop", "stopped"]]);
    assert.equal(traces.length, 1, "سجل واحد للخط");
    const t = traces[0];
    assert.equal(t.accountNo, ACC);
    assert.equal(t.outcome, "stopped");
    assert.equal(t.mode, "stop");
    assert.equal(t.lane, "90");
    assert.equal(t.version, "0.9.25");
    const text = t.steps.map((x: any) => `[${x.s}] ${x.m}`).join("\n");
    assert.match(text, /الصفحة اتحمّلت: صفحة Profile Optimization/);
    assert.match(text, /\[In Nightly PO\] .*اختار «Stop Nightly PO» \(select مخفى\)/);
    assert.match(text, /داس Yes <button> جوّه نافذة التأكيد/);
    assert.match(text, /\[Not Started\] اتسجّلت النتيجة فى Service-Flow: اتوقف/);
    assert.ok(t.steps.every((x: any) => !Number.isNaN(Date.parse(x.t))));
  } finally {
    await browser.close();
    await new Promise((r) => server.close(() => r(null)));
  }
});

test("server: /api/po-traces/ingest needs the script token; the report is super-admin only", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ing = routes.slice(routes.indexOf('app.post("/api/po-traces/ingest"'), routes.indexOf('app.get("/api/po-traces"'));
  assert.match(ing, /req\.headers\["x-dzs-token"\] !== DZS_INGEST_TOKEN/);
  assert.match(ing, /interval '30 days'/);
  assert.match(routes, /app\.get\("\/api\/po-traces", requireAuth, requireSuperAdmin,/);
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(db, /CREATE TABLE IF NOT EXISTS po_traces/);
  assert.match(schema, /export const poTraces = pgTable\("po_traces"/);
  const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
  assert.match(dash, /reportTab === "po-traces" +&& isSuperAdmin && <PoTraceReport \/>/);
  const ui = readFileSync(new URL("../client/src/components/PoTraceReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /XLSX\.writeFile/);
  assert.match(ui, /printTablePDF\(/);
});

test("POST /api/po-traces/ingest ⇒ GET /api/po-traces (super admin) with steps and outcome counts", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const { promisify } = await import("node:util");
  const { randomBytes, scrypt } = await import("node:crypto");
  const express = (await import("express")).default;
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const sup = `pt-sup-${sfx}`, adm = `pt-adm-${sfx}`, pass = `pw-${sfx}`, acc = `9${String(Date.now()).slice(-8)}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM po_traces WHERE account_no = $1`, [acc]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1::text[])`, [[sup, adm]]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await promisify(scrypt)(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $3, 'super_admin'), ($2, $3, 'admin')`, [sup, adm, hash]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const body = JSON.stringify({ items: [{ accountNo: acc, mode: "stop", outcome: "gave_up", lastStatus: "In Nightly PO", lane: "90", version: "0.9.24",
      startedAt: "2026-11-03T08:00:00Z", endedAt: "2026-11-03T08:01:30Z",
      steps: [{ t: "2026-11-03T08:00:01Z", s: "In Nightly PO", m: "اختار «Stop Nightly PO» (select مخفى)" }, { t: "bad", s: null, m: "x".repeat(500) }] }] });
    const bad = await fetch(`${base}/api/po-traces/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-dzs-token": "nope" }, body });
    assert.equal(bad.status, 401);
    const ok = await fetch(`${base}/api/po-traces/ingest`, { method: "POST", headers: { "content-type": "application/json", "x-dzs-token": "sf-dzs-138-ingest-2026" }, body });
    assert.deepEqual(await ok.json(), { saved: 1 });
    const login = async (u: string) => (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    assert.equal((await fetch(`${base}/api/po-traces`, { headers: { cookie: await login(adm) } })).status, 403);
    const g: any = await (await fetch(`${base}/api/po-traces?account=${acc}&outcome=gave_up&mode=stop`, { headers: { cookie: await login(sup) } })).json();
    assert.equal(g.data.length, 1);
    const r = g.data[0];
    assert.deepEqual([r.accountNo, r.outcome, r.lastStatus, r.lane, r.version], [acc, "gave_up", "In Nightly PO", "90", "0.9.24"]);
    assert.equal(r.steps.length, 2);
    assert.equal(r.steps[1].t, null, "وقت غلط ⇒ فاضى");
    assert.equal(r.steps[1].m.length, 300, "الرسالة بتتقص");
    assert.equal(g.counts.gave_up, 1);
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
