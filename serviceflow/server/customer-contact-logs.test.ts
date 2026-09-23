import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const dialog = readFileSync(
  new URL("../client/src/components/LineDetailsDialog.tsx", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../client/src/components/CustomerContactActions.tsx", import.meta.url),
  "utf8",
);
const mobileLookup = readFileSync(
  new URL("../client/src/lib/mobile-lookup.tsx", import.meta.url),
  "utf8",
);
const omRejections = readFileSync(
  new URL("../client/src/components/OmRejectionsReport.tsx", import.meta.url),
  "utf8",
);
const omOrderMatch = readFileSync(
  new URL("../client/src/components/OmOrderMatchReport.tsx", import.meta.url),
  "utf8",
);

test("customer contact logs are stored with an outcome and server timestamp", () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS customer_contact_logs/);
  assert.match(db, /outcome text NOT NULL CHECK \(outcome IN \('answered', 'no_answer'\)\)/);
  assert.match(db, /ADD COLUMN IF NOT EXISTS notes text/);
  assert.match(routes, /app\.post\("\/api\/customer-contact-logs", requireAuth/);
  assert.match(routes, /INSERT INTO customer_contact_logs/);
  assert.match(routes, /notes/);
  assert.match(routes, /contacted_by_id, contacted_by_name/);
});

test("the line details dialog owns the contact actions and exposes full history", () => {
  assert.match(dialog, /<CustomerContactActions phone=\{phone\} \/>/);
  assert.match(dialog, /<MobileValue mobile=\{l\.mobile\} \/>/);
  assert.match(mobileLookup, /href=\{`tel:\$\{dial\}`\}/);
  assert.match(mobileLookup, /md:hidden/);
  assert.match(actions, /تم الاتصال والعميل رد/);
  assert.match(actions, /تم الاتصال ولم يرد العميل/);
  assert.match(actions, /ملاحظات/);
  assert.match(actions, /nextNotes/);
  assert.match(actions, /\/api\/customer-contact-logs\?phone=/);
  assert.match(actions, /invalidateQueries\(\{ queryKey: \["\/api\/phone-lines\/account-complaints"\] \}\)/);
});

test("OM report mobile cells use the shared mobile-only call control", () => {
  assert.match(omRejections, /import \{ MobileValue \} from "@\/lib\/mobile-lookup";/);
  assert.match(omRejections, /return <MobileValue mobile=\{r\.customerMobile\} \/>;/);
  assert.match(omRejections, /<MobileValue mobile=\{r\.customerMobile\} \/>/);
  assert.match(omOrderMatch, /import \{ MobileValue \} from "@\/lib\/mobile-lookup";/);
  assert.match(omOrderMatch, /<MobileValue mobile=\{p\.order\.mobile\} \/>/);
  assert.match(omOrderMatch, /<MobileValue mobile=\{p\.om\?\.mobile\} \/>/);
});