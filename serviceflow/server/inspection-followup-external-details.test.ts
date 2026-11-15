import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);
const reportMonth = "2099-12";
const componentSource = readFileSync(
  new URL("../client/src/components/InspectionFollowupReport.tsx", import.meta.url),
  "utf8",
);

test("the refreshed OM follow-up report includes saved external feasibility and rejection details", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const [{ pool }, { registerRoutes }] = await Promise.all([
    import("./db"),
    import("./routes"),
  ]);
  const suffix = `${process.pid}_${Date.now()}`;
  const username = `followup-external-${suffix}`;
  const adminUsername = `followup-admin-${suffix}`;
  const serial = `followup-external-${suffix}`;
  const passwordText = "followup-external-test-password";
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  let baseUrl = "";

  const clean = async () => {
    await pool.query(
      `DELETE FROM inspection_followup_items
        WHERE report_month=$1 AND section='om' AND source_key=$2`,
      [reportMonth, serial],
    );
    await pool.query(
      `DELETE FROM inspection_followup_sections WHERE report_month=$1 AND section='om'`,
      [reportMonth],
    );
    await pool.query(`DELETE FROM om_responses WHERE serial_number=$1`, [serial]);
    await pool.query(`DELETE FROM users WHERE username=ANY($1::text[])`, [[username, adminUsername]]);
  };

  const addUser = async (name: string, role: string) => {
    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync(passwordText, salt, 64) as Buffer;
    const { rows } = await pool.query(
      `INSERT INTO users (username,password,role) VALUES ($1,$2,$3) RETURNING id`,
      [name, `${hash.toString("hex")}.${salt}`, role],
    );
    return Number(rows[0].id);
  };

  try {
    await clean();
    await addUser(username, "external");
    await addUser(adminUsername, "super_admin");
    await pool.query(
      `INSERT INTO om_responses (serial_number,status)
       VALUES ($1,'needs_external')`,
      [serial],
    );
    await pool.query(
      `INSERT INTO inspection_followup_items
         (report_month,section,source_key,technician_name,source_data)
       VALUES ($1,'om',$2,'Test technician',$3::jsonb)`,
      [reportMonth, serial, JSON.stringify({ serialNumber: serial, customerName: "Test customer" })],
    );
    await pool.query(
      `INSERT INTO inspection_followup_sections (report_month,section,sampling_version)
       VALUES ($1,'om',2)
       ON CONFLICT (report_month,section)
       DO UPDATE SET sampling_version=EXCLUDED.sampling_version`,
      [reportMonth],
    );

    await registerRoutes(httpServer, app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const login = async (name: string) => {
      const response = await fetch(`${baseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: name, password: passwordText }),
      });
      assert.equal(response.status, 200);
      const setCookie = response.headers.get("set-cookie");
      assert.ok(setCookie, `${name} should receive a session cookie`);
      return setCookie.split(";")[0];
    };
    const externalCookie = await login(username);
    const adminCookie = await login(adminUsername);
    const post = (path: string, cookie: string, body: unknown) => fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const refreshedReport = async () => {
      const response = await fetch(
        `${baseUrl}/api/inspection-followup?section=om&month=${reportMonth}`,
        { headers: { cookie: externalCookie } },
      );
      assert.equal(response.status, 200);
      const rows = await response.json() as Array<Record<string, any>>;
      const row = rows.find((item) => item.sourceKey === serial);
      assert.ok(row, "the sampled OM row should remain in the refreshed report");
      return row.sourceData as Record<string, any>;
    };

    const feasible = await post("/api/om-rejections/external-response", externalCookie, {
      serialNumber: serial,
      isFeasible: true,
      centralName: "Central Feasible",
      cabinNumber: "CAB-F",
      boxNumber: "BOX-F",
      nearestBoxDistance: "4m",
      additionalNotes: "feasible reply note",
    });
    assert.equal(feasible.status, 200, await feasible.text());
    let sourceData = await refreshedReport();
    assert.equal(sourceData.respIsFeasibleExternal, true);
    assert.equal(sourceData.respExternalCentralName, "Central Feasible");
    assert.equal(sourceData.respExternalCabinNumber, "CAB-F");
    assert.equal(sourceData.respExternalBoxNumber, "BOX-F");
    assert.ok(sourceData.respExternalResponseAt);

    const reroute = await post("/api/om-rejections/request-external", adminCookie, {
      serialNumber: serial,
    });
    assert.equal(reroute.status, 200, await reroute.text());
    const rejected = await post("/api/om-rejections/external-response", externalCookie, {
      serialNumber: serial,
      isFeasible: false,
      rejectionReason: "تعذر التنفيذ بسبب بُعد البوكس",
      centralName: "Central Rejected",
      cabinNumber: "CAB-R",
      boxNumber: "BOX-R",
      nearestBoxDistance: "26m",
      additionalNotes: "يحتاج مد كابل إضافي",
    });
    assert.equal(rejected.status, 200, await rejected.text());
    sourceData = await refreshedReport();
    assert.equal(sourceData.respIsFeasibleExternal, false);
    assert.equal(sourceData.respExternalRejectionReason, "تعذر التنفيذ بسبب بُعد البوكس");
    assert.equal(sourceData.respExternalCentralName, "Central Rejected");
    assert.equal(sourceData.respExternalCabinNumber, "CAB-R");
    assert.equal(sourceData.respExternalBoxNumber, "BOX-R");
    assert.equal(sourceData.respExternalNearestBoxDistance, "26m");
    assert.equal(sourceData.respExternalAdditionalNotes, "يحتاج مد كابل إضافي");
    assert.ok(sourceData.respExternalResponseAt);
  } finally {
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    await clean();
  }
});

test("external response details use Arabic labels in the report's full-details panel", () => {
  const labels = {
    respExternalName: "مسئول الشئون الخارجية",
    respIsFeasibleExternal: "إمكانية التنفيذ حسب رد الخارجية",
    respExternalRejectionReason: "سبب رد الشئون الخارجية",
    respExternalCentralName: "سنترال رد الشئون الخارجية",
    respExternalCabinNumber: "كابينة رد الشئون الخارجية",
    respExternalBoxNumber: "بوكس رد الشئون الخارجية",
    respExternalNearestBoxDistance: "المسافة لأقرب بوكس في رد الخارجية",
    respExternalAdditionalNotes: "ملاحظات رد الشئون الخارجية",
    respExternalResponseAt: "تاريخ رد الشئون الخارجية",
  };
  for (const [key, label] of Object.entries(labels)) {
    assert.ok(componentSource.includes(`${key}: "${label}"`), `${key} should have an Arabic display label`);
  }
  assert.match(componentSource, /Object\.entries\(row\.sourceData \|\| \{\}\)\.map/);
  assert.match(componentSource, /<div className="text-\[11px\] font-medium text-slate-500">\{valueLabel\(key\)\}<\/div>/);
});
