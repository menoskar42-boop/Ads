import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright-core";
import {
  DetailPanel,
  ExternalExecutionLocation,
  InstallationSummary,
} from "../client/src/components/InspectionFollowupReport";

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

test("OM follow-up keeps technician and external replies separate with three row actions", () => {
  assert.match(componentSource, /<TableHead[^>]*>رد الشئون الخارجية<\/TableHead>/);
  assert.match(componentSource, /label: "رد الفنى"/);
  assert.match(componentSource, /const formatOmCreationDate = \(value: unknown\)/);
  assert.match(componentSource, /field\.label === "تاريخ الإنشاء" \? <span dir="ltr" className="whitespace-nowrap font-mono text-\[11px\]">\{formatOmCreationDate\(value\)\}<\/span>/);
  assert.match(componentSource, /field\.label === "عنوان العميل" \? "w-\[440px\] min-w-\[440px\] max-w-\[440px\] whitespace-normal"/);
  assert.match(componentSource, /field\.label === "عنوان العميل" \? "w-\[440px\] min-w-\[440px\] max-w-\[440px\] break-words leading-5"/);
  assert.match(componentSource, /const technicianResponseStatus = \(data: SourceData\)/);
  assert.match(componentSource, /inline-flex max-w-\[220px\] flex-col items-start gap-0\.5 whitespace-normal text-right/);
  assert.match(componentSource, /isTechnicianResponse \? technicianResponseStatus\(data\)/);
  assert.match(componentSource, /isResponseReason \? "break-words leading-5" : ""/);
  assert.match(componentSource, /button-confirm-tech-response-\$\{row\.id\}/);
  assert.match(componentSource, /triggerLabel="يمكن التنفيذ"/);
  assert.match(componentSource, /triggerLabel="لا يمكن التنفيذ"/);
  assert.match(componentSource, /fetch\("\/api\/om-rejections\/external-response"/);

  const confirmHandlerStart = componentSource.indexOf("const confirmTechnicianResponse");
  const confirmHandlerEnd = componentSource.indexOf("const responseData", confirmHandlerStart);
  const confirmHandler = componentSource.slice(confirmHandlerStart, confirmHandlerEnd);
  assert.ok(confirmHandler.includes("omExternalResponse.mutate"));
  assert.ok(confirmHandler.includes("isFeasible: data.respIsFeasible"));
  assert.ok(componentSource.includes('data-testid={`external-reply-${row.id}`}'));
});

test("feasible external replies show a compact execution location that fits a narrow phone", async () => {
  const previousReact = (globalThis as any).React;
  (globalThis as any).React = React;
  let markup: string;
  let rejectedMarkup: string;
  try {
    markup = renderToStaticMarkup(createElement(ExternalExecutionLocation, {
      data: {
        respIsFeasibleExternal: true,
        respExternalCentralName: "سنترال الغنايم - الامتداد الشرقي",
        respExternalCabinNumber: "كابينة ١٢-٣٤",
        respExternalBoxNumber: "بوكس ١٢٣ - طرفية ٤٥",
      },
      rowId: 882,
      view: "mobile",
    }));
    rejectedMarkup = renderToStaticMarkup(createElement(ExternalExecutionLocation, {
      data: { respIsFeasibleExternal: false, respExternalBoxNumber: "بوكس ١٢٣" },
      rowId: 883,
      view: "mobile",
    }));
  } finally {
    if (previousReact === undefined) delete (globalThis as any).React;
    else (globalThis as any).React = previousReact;
  }

  assert.match(markup, /مكان التنفيذ:/);
  assert.match(markup, /السنترال:.*سنترال الغنايم/);
  assert.match(markup, /الكابينة:.*كابينة ١٢-٣٤/);
  assert.match(markup, /البوكس:.*بوكس ١٢٣/);
  assert.match(markup, /flex max-w-full flex-wrap/);
  assert.equal(rejectedMarkup, "", "external rejection rows should not show an execution location");
  assert.match(componentSource, /<ExternalExecutionLocation data=\{data\} rowId=\{row\.id\} view="mobile" \/>/);
  assert.match(componentSource, /<ExternalExecutionLocation data=\{data\} rowId=\{row\.id\} view="desktop" \/>/);

  const browserPath = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/opt/pw-browsers/chromium",
    "/repl/tools/bin/chromium",
  ].find((candidate) => candidate && existsSync(candidate));
  const browser = await chromium.launch({
    ...(browserPath ? { executablePath: browserPath } : {}),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; font-family: Arial, sans-serif; }
      #mobile-row { width: calc(100vw - 24px); margin: 12px; }
      #mobile-row [class~="flex"] { display: flex; }
      #mobile-row [class~="flex-wrap"] { flex-wrap: wrap; }
      #mobile-row [class~="max-w-full"] { max-width: 100%; }
      #mobile-row [class~="gap-x-2"] { column-gap: 8px; }
      #mobile-row [class~="gap-y-0.5"] { row-gap: 2px; }
      #mobile-row [class~="shrink-0"] { flex-shrink: 0; }
      #mobile-row [class~="min-w-0"] { min-width: 0; }
      #mobile-row [class~="break-words"] { overflow-wrap: anywhere; word-break: break-word; }
      #mobile-row [data-testid^="external-execution-location-"] { width: 100%; padding: 8px; border: 1px solid #d1fae5; }
    </style></head><body><div id="mobile-row">${markup}</div></body></html>`);
    const layout = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>("#mobile-row")!;
      const summary = row.querySelector<HTMLElement>('[data-testid^="external-execution-location-"]')!;
      const fields = [...summary.querySelectorAll<HTMLElement>("span")];
      return {
        viewportWidth: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        rowFits: row.scrollWidth <= row.clientWidth,
        summaryFits: summary.scrollWidth <= summary.clientWidth,
        fieldsFit: fields.every((field) => field.scrollWidth <= field.clientWidth),
        wrapped: summary.scrollHeight > summary.clientHeight,
      };
    });
    assert.equal(layout.viewportWidth, 320);
    assert.ok(layout.pageWidth <= layout.viewportWidth, "the location summary should not add page-level horizontal scrolling");
    assert.ok(layout.rowFits && layout.summaryFits && layout.fieldsFit, "all location fields should wrap inside the narrow card");
  } finally {
    await browser.close();
  }
});

test("installation rows show the seven requested customer and line fields on a phone", async () => {
  const data = {
    lineCentralName: "سنترال الغنايم",
    phoneNumber: "088-2657637",
    customerName: "محمد أحمد عبدالعال",
    address: "شارع المحطة بجوار مسجد النور - مركز الغنايم",
    customerMobile: "01012345678",
    lineCabinNumber: "كابينة ١٢-٣٤",
    lineBoxNumber: "بوكس ١٢٣",
  };
  const previousReact = (globalThis as any).React;
  (globalThis as any).React = React;
  let markup: string;
  try {
    markup = renderToStaticMarkup(createElement(InstallationSummary, {
      data,
      rowId: 884,
      view: "mobile",
    }));
  } finally {
    if (previousReact === undefined) delete (globalThis as any).React;
    else (globalThis as any).React = previousReact;
  }

  const expectedLabels = [
    "اسم السنترال", "رقم التليفون الأرضي", "الاسم", "العنوان",
    "رقم الموبايل", "رقم الكابينة", "رقم البكس",
  ];
  let lastPosition = -1;
  for (const label of expectedLabels) {
    const position = markup.indexOf(`${label}:`);
    assert.ok(position > lastPosition, `${label} should appear in the requested order`);
    lastPosition = position;
  }
  assert.match(markup, /href="tel:01012345678"/);
  assert.match(componentSource, /<InstallationSummary data=\{data\} rowId=\{row\.id\} view="mobile" \/>/);
  assert.match(componentSource, /INSTALLATION_SUMMARY_FIELDS\.map\(\(\[, label\]\)/);
  assert.match(componentSource, /INSTALLATION_SUMMARY_FIELDS\.map\(\(\[key\]\)/);
  assert.match(componentSource, /<TableHead[^>]*>اسم الفني<\/TableHead>/);
  assert.match(componentSource, /<TableHead[^>]*>الحالة<\/TableHead>/);
  assert.match(componentSource, /<TableHead[^>]*>مراجعة السلك<\/TableHead>/);
  assert.match(componentSource, /row\.isComplete \? "مكتمل" : "بانتظار المراجعة"/);
  assert.match(componentSource, /data-testid=\{`text-technician-name-row-\$\{row\.id\}`\}/);
  assert.match(markup, /break-words/);

  const browserPath = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/opt/pw-browsers/chromium",
    "/repl/tools/bin/chromium",
  ].find((candidate) => candidate && existsSync(candidate));
  const browser = await chromium.launch({
    ...(browserPath ? { executablePath: browserPath } : {}),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; font-family: Arial, sans-serif; }
      #mobile-row { width: calc(100vw - 24px); margin: 12px; }
      [class~="space-y-1"] > :not([hidden]) ~ :not([hidden]) { margin-top: 4px; }
      [class~="min-w-0"] { min-width: 0; }
      [class~="break-words"] { overflow-wrap: anywhere; word-break: break-word; }
      [data-testid^="installation-summary-"] { width: 100%; }
    </style></head><body><div id="mobile-row">${markup}</div></body></html>`);
    const layout = await page.evaluate(() => {
      const summary = document.querySelector<HTMLElement>('[data-testid^="installation-summary-"]')!;
      const fields = [...summary.querySelectorAll<HTMLElement>(":scope > div")];
      return {
        viewport: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        summaryFits: summary.scrollWidth <= summary.clientWidth,
        fields: fields.map((field) => ({
          label: field.textContent?.split(":")[0],
          fits: field.scrollWidth <= field.clientWidth,
        })),
      };
    });
    assert.equal(layout.viewport, 320);
    assert.ok(layout.pageWidth <= layout.viewport);
    assert.ok(layout.summaryFits, "the installation summary should fit the mobile card");
    assert.equal(layout.fields.length, expectedLabels.length);
    for (const field of layout.fields) assert.ok(field.fits, `${field.label} should wrap rather than overflow`);
  } finally {
    await browser.close();
  }
});

test("the full-details panel keeps Arabic external response fields readable on a phone", async () => {
  const longNotes = "ملاحظات رد الخارجية تحتاج إلى تمديد كابل إضافي ومراجعة المسار قبل التنفيذ ".repeat(5);
  const row = {
    id: 881,
    sourceKey: "OM-881",
    technicianName: "فني اختبار",
    sourceData: {
      respIsFeasibleExternal: false,
      respExternalName: "مسئول الشئون الخارجية",
      respExternalRejectionReason: "تعذر التنفيذ بسبب بُعد البوكس عن مسار الخدمة",
      respExternalCentralName: "سنترال الغنايم - قطاع الامتداد الشرقي",
      respExternalCabinNumber: "كابينة ١٢-٣٤ ناحية الشارع الرئيسي",
      respExternalBoxNumber: "بوكس ١٢٣ - طرفية ٤٥",
      respExternalNearestBoxDistance: "٢٦ متر تقريبًا من موقع العميل",
      respExternalAdditionalNotes: longNotes,
      respExternalResponseAt: "2026-11-15T12:00:00.000Z",
    },
    isManual: false,
    isComplete: true,
    wireDistanceMatch: null,
    customerWireMatch: null,
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
  };
  const previousReact = (globalThis as any).React;
  (globalThis as any).React = React;
  let markup: string;
  try {
    markup = renderToStaticMarkup(createElement(DetailPanel, { row, onClose: () => {} }));
  } finally {
    if (previousReact === undefined) delete (globalThis as any).React;
    else (globalThis as any).React = previousReact;
  }
  assert.match(markup, /class="[^"]*grid gap-2 sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(markup, /class="[^"]*min-w-0[^"]*"/);
  assert.match(markup, /class="[^"]*break-words[^"]*"/);

  const browserPath = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/opt/pw-browsers/chromium",
    "/repl/tools/bin/chromium",
  ].find((candidate) => candidate && existsSync(candidate));
  const browser = await chromium.launch({
    ...(browserPath ? { executablePath: browserPath } : {}),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; font-family: Arial, sans-serif; }
      [class~="fixed"] { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 12px; }
      [data-testid^="dialog-row-details-"] > section { width: 100%; max-width: 896px; max-height: 88vh; overflow: hidden; display: flex; flex-direction: column; }
      [data-testid^="dialog-row-details-"] > section > div:last-child { max-height: calc(88vh - 92px); overflow-y: auto; padding: 16px; }
      [class~="grid"] { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
      [class~="min-w-0"] { min-width: 0; }
      [class~="break-words"] { overflow-wrap: anywhere; word-break: break-word; }
      [data-testid^="detail-"] { min-width: 0; padding: 10px 12px; border: 1px solid #cbd5e1; }
      [data-testid^="detail-"] > div:last-child { font-size: 14px; line-height: 20px; }
      @media (min-width: 640px) { [class~="sm:grid-cols-2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style></head><body>${markup}</body></html>`);

    const result = await page.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('[data-testid="dialog-row-details-881"]')!;
      const cards = [...dialog.querySelectorAll<HTMLElement>('[data-testid^="detail-"]')];
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        cards: cards.map((card) => {
          const value = card.lastElementChild as HTMLElement;
          const rect = card.getBoundingClientRect();
          const valueStyle = getComputedStyle(value);
          return {
            label: card.firstElementChild?.textContent,
            value: value.textContent,
            insideViewport: rect.left >= 0 && rect.right <= window.innerWidth,
            noTextOverflow: value.scrollWidth <= value.clientWidth,
            wrapsLongText: value.scrollHeight > Number.parseFloat(valueStyle.lineHeight),
          };
        }),
      };
    });

    assert.equal(result.viewport, 390);
    assert.ok(result.documentWidth <= result.viewport, "the modal should not create horizontal page scrolling");
    assert.equal(result.cards.length, Object.keys(row.sourceData).length);
    for (const card of result.cards) {
      assert.ok(card.insideViewport, `${card.label} card should fit within the phone viewport`);
      assert.ok(card.noTextOverflow, `${card.label} value should wrap instead of clipping`);
    }
    const notes = result.cards.find((card) => card.label === "ملاحظات رد الشئون الخارجية");
    assert.ok(notes?.wrapsLongText, "long Arabic notes should wrap into readable lines");
    assert.ok(notes?.value?.includes("تمديد كابل إضافي"), "the full notes should remain in the rendered details");
  } finally {
    await browser.close();
  }
});
