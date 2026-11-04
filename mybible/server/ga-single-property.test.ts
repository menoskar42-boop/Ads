// عدّاد Google Analytics واحد (المالك ٢٠٢٦-١١-٠٤): الخاصية الأساسية G-DMRC5M7Z81 — اللى عليها Search Console والـKey events.
// كان G-R3VTW81D67 («Mybible friend») والزيارة بتتسجّل فى خاصيتين.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("index.html loads and configures only the main GA property", () => {
  const html = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  assert.match(html, /gtag\/js\?id=G-DMRC5M7Z81/);
  assert.match(html, /gtag\('config', 'G-DMRC5M7Z81'\);/);
  assert.equal((html.match(/gtag\('config'/g) || []).length, 1);
  assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ""), /G-R3VTW81D67/);
});
