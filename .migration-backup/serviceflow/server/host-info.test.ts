// «قياس السيرفر» (المالك ٢٠٢٦-١٠-٢٠) — قراية بس، للسوبر أدمن، ومابيصحّيش القاعدة
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hostInfo } from "./host-info";

const src = readFileSync(new URL("./host-info.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("المسار للسوبر أدمن، ومابيكلّمش القاعدة، ومابيشغّلش غير --version", () => {
  assert.match(routes, /app\.get\("\/api\/admin\/host-info", requireAuth, requireSuperAdmin/);
  assert.doesNotMatch(src, /\bpool\b|\.query\(|from "\.\/db"/);
  assert.equal((src.match(/execFile\(/g) || []).length, 1);
  assert.match(src, /execFile\(bin, \["--version"\]/);
});

test("بيرجّع الذاكرة والقرص وحالة برامج Postgres", async () => {
  const h = await hostInfo();
  assert.ok(h.machine.totalMb && h.machine.totalMb > 0);
  assert.ok(h.disks.length === 3);
  assert.deepEqual(Object.keys(h.postgres), ["postgres", "initdb", "pg_ctl", "pg_dump", "pg_basebackup"]);
});
