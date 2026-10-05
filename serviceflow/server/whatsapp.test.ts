import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import test from "node:test";
import { buildFollowupSms, followupTemplate, waRecipient } from "../shared/sms-message";

// واتساب (قرار المالك ٢٠٢٦-١٠-٠٥): نفس رسالة الـSMS بالحرف، بالقوالب الأربعة المعتمدة عند Meta.
const doc = readFileSync(new URL("../../docs/WHATSAPP_API_SETUP_PROMPT.md", import.meta.url), "utf8");
const block = doc.match(/```\n([\s\S]*?)\n```/)![1].split("\n").map((l) => l.replace(/^ {3}/, "")).join("\n");
const tplBody = (name: string) => {
  const lines = block.slice(block.indexOf("الاسم: " + name + "\n")).split("\n").slice(1);
  return lines.slice(0, lines.findIndex((l) => l.startsWith("أمثلة:"))).join("\n");
};
const fill = (body: string, params: string[]) => body.replace(/\{\{(\d)\}\}/g, (_, n) => params[Number(n) - 1]);

const at = "2026-09-29T10:30:00.000Z";   // وقت حائط القاهرة متسجّل UTC — زى «بحث برقم التليفون»
const cases = [
  { phone: "882821905", lastComplaintAt: at, techName: "حسن عبد الفتاح حموده", techMobile: "01012345678" },
  { phone: "882821905", lastComplaintAt: at, techName: "حسن", techMobile: null },
  { phone: "882821905", lastComplaintAt: null, techName: "محمد عبدالعزيز طه", techMobile: "+201112223334" },
  { phone: "882821905", lastComplaintAt: null, techName: null, techMobile: null },
];

test("each case picks its template, and the filled template == the SMS text, letter for letter", () => {
  const names = cases.map((c) => followupTemplate(c).name);
  assert.deepEqual(names, ["ghanayem_followup_complaint_tech", "ghanayem_followup_complaint", "ghanayem_followup_tech", "ghanayem_followup"]);
  for (const c of cases) {
    const t = followupTemplate(c);
    assert.equal(fill(tplBody(t.name), t.params), buildFollowupSms(c), t.name);
    assert.ok(t.params.every((p) => p.trim() !== ""), "Meta بترفض قيمة فاضية");
  }
});

test("a tech mobile without a name falls back to the no-tech template (no empty value)", () => {
  assert.equal(followupTemplate({ phone: "1", lastComplaintAt: null, techName: "", techMobile: "01012345678" }).name, "ghanayem_followup");
});

test("recipient in WhatsApp format", () => {
  assert.equal(waRecipient("01012345678"), "201012345678");
  assert.equal(waRecipient("+20 101 234 5678"), "201012345678");
  assert.equal(waRecipient("0882650500"), null);   // أرضى مش محمول
});

test("server: send / register / status against a fake Graph API — token only in the header", async () => {
  const seen: any[] = [];
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      res.setHeader("Content-Type", "application/json");
      if (req.url!.includes("/messages")) return res.end(JSON.stringify({ messages: [{ id: "wamid.X" }] }));
      if (req.url!.includes("/register")) {
        const pin = JSON.parse(body).pin;
        if (pin !== "123456") { res.statusCode = 400; return res.end(JSON.stringify({ error: { code: 133005, message: "PIN mismatch" } })); }
        return res.end(JSON.stringify({ success: true }));
      }
      if (req.url!.includes("message_templates")) return res.end(JSON.stringify({ data: [{ name: "ghanayem_followup", status: "PENDING" }, { name: "other", status: "APPROVED" }] }));
      return res.end(JSON.stringify({ display_phone_number: "+20 88 2650500", status: "PENDING" }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, r));
  process.env.WHATSAPP_GRAPH_BASE = `http://127.0.0.1:${(srv.address() as any).port}`;
  process.env.WHATSAPP_ACCESS_TOKEN = "TEST_TOKEN";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "1388059521053031";
  process.env.WHATSAPP_WABA_ID = "2203880213837668";
  const wa = await import("./whatsapp");
  try {
    const t = followupTemplate(cases[0]);
    assert.equal(await wa.sendTemplate("201012345678", t.name, t.params), "wamid.X");
    const m = seen.find((s) => s.url.includes("/messages"));
    assert.equal(m.url, "/v23.0/1388059521053031/messages");
    assert.equal(m.auth, "Bearer TEST_TOKEN");
    assert.deepEqual(m.body.template.language, { code: "ar" });
    assert.deepEqual(m.body.template.components[0].parameters.map((p: any) => p.text), t.params);
    assert.equal(JSON.stringify(m.body).includes("TEST_TOKEN"), false);

    await assert.rejects(wa.registerNumber("12345"), /٦ أرقام/);
    await assert.rejects(wa.registerNumber("654321"), (e: any) => e.code === 133005 && /الـPIN غلط/.test(e.message));
    await wa.registerNumber("123456");
    assert.equal(seen.filter((s) => s.url.endsWith("/register")).at(-1).body.messaging_product, "whatsapp");

    const st = await wa.whatsappStatus();
    assert.equal(st.phone.status, "PENDING");
    assert.deepEqual(st.templates.map((x: any) => x.name), ["ghanayem_followup"]);   // بس قوالبنا
  } finally { srv.close(); }
});

test("routes: super-admin only, PIN never stored, the send is logged as whatsapp", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  for (const r of ["/api/whatsapp/enabled", "/api/whatsapp/status", "/api/whatsapp/register", "/api/whatsapp/followup"]) {
    assert.match(routes, new RegExp(`app\\.(get|post)\\("${r.replace(/\//g, "\\/")}", requireAuth, requireSuperAdmin`), r);
  }
  const reg = routes.slice(routes.indexOf('app.post("/api/whatsapp/register"'), routes.indexOf('app.post("/api/whatsapp/followup"'));
  assert.doesNotMatch(reg, /pool\.query|console\.log/);
  assert.match(routes, /INSERT INTO customer_sms_logs \(full_phone, mobile, sent_by_id, sent_by_name, channel, wa_message_id\)\s*VALUES \(\$1, \$2, \$3, \$4, 'whatsapp', \$5\)/);
  assert.match(routes, /CASE WHEN s\.channel = 'whatsapp' THEN 'whatsapp_sent' ELSE 'sms_sent' END/);
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(db, /ALTER TABLE customer_sms_logs ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms'/);
  assert.match(schema, /channel: text\("channel"\)\.notNull\(\)\.default\("sms"\)/);
  assert.match(schema, /waMessageId: text\("wa_message_id"\)/);
});

test("Meta's real reason (error_data.details) shows up in the message", async () => {
  const srv = http.createServer((req, res) => {
    res.statusCode = 400; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { code: 100, message: "(#100) Invalid parameter", error_subcode: 2388001,
      error_data: { details: "Phone number is not eligible for registration" } } }));
  });
  await new Promise<void>((r) => srv.listen(0, r));
  process.env.WHATSAPP_GRAPH_BASE = `http://127.0.0.1:${(srv.address() as any).port}`;
  const wa = await import("./whatsapp");
  try {
    await assert.rejects(wa.registerNumber("123456"), (e: any) =>
      /Invalid parameter/.test(e.message) && /not eligible for registration/.test(e.message) && /subcode 2388001/.test(e.message));
  } finally { srv.close(); }
});
