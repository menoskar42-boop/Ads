// المالك ٢٠٢٦-١٠-١٤: «جالى إشعار إن رصيد سلك الصيانة بقى بالسالب، ودخلت الجدول ملقيتش اللى اتضاف
// لحد ما عملت ريفريش — عاوزه يتحدّث فورى زى الإشعار». أى كتابة على السلك/المخزن ⇒ حدث WebSocket.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("السيرفر: أى POST/PUT/PATCH/DELETE ناجح على cable-entries أو local-store بيبعت STORE_UPDATE", () => {
  const r = src("server/routes.ts");
  assert.match(r, /const STORE_WRITE_RE = \/\^\\\/api\\\/\(cable-entries\|local-store\)\(\\\/\|\$\)\/;/);
  assert.match(r, /if \(req\.method !== "GET" && STORE_WRITE_RE\.test\(req\.path\)\)[\s\S]{0,200}broadcast\(\{ type: WS_EVENTS\.STORE_UPDATE \}\)/);
  const re = /^\/api\/(cable-entries|local-store)(\/|$)/;
  for (const p of ["/api/cable-entries", "/api/cable-entries/12", "/api/cable-entries/12/date", "/api/local-store/moves", "/api/local-store/opening"]) assert.ok(re.test(p), p);
  assert.ok(!re.test("/api/cable-entriesX"));
  // الـmiddleware لازم يتسجّل قبل الراوتس (registerLocalStore وPOST /api/cable-entries)
  assert.ok(r.indexOf("STORE_WRITE_RE.test(req.path)") < r.indexOf('app.post("/api/cable-entries"'));
  assert.ok(r.indexOf("STORE_WRITE_RE.test(req.path)") < r.indexOf("registerLocalStore(app"));
});

test("المتصفح: STORE_UPDATE بيحدّث الأرصدة والإفادة والإشعارات فوراً", () => {
  const s = src("client/src/hooks/use-websocket.ts");
  assert.match(s, /message\.type === WS_EVENTS\.STORE_UPDATE\)[\s\S]{0,300}"\/api\/local-store"[\s\S]{0,120}"\/api\/cable-entries"[\s\S]{0,120}"\/api\/notifications"/);
  assert.match(src("shared/schema.ts"), /STORE_UPDATE: 'STORE_UPDATE'/);
});
