// المالك ٢٠٢٦-١١-١٠: سكربتات Tampermonkey بتتحدّث لوحدها من السيرفر (زى finance.oscardevs.com).
// بنتأكد إن اللينكات بتتحط فى الهيدر، وإن السكربت نفسه مابيتغيّرش غير السطرين دول، وإن كل سكربت فى المشروع ليه @version.
import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { readHeader, withUpdateUrls, metaOnly, listScripts, readScript, linksFor, DEPRECATED, FILE_RE } from "./userscripts";

const DIR = join(import.meta.dirname, "..");
const SRC = `// ==UserScript==
// @name         Test
// @namespace    sf
// @version      1.2.3
// @updateURL    https://old.example/x.meta.js
// @match        https://example.com/*
// ==/UserScript==
(function () { console.log('body'); })();
`;

test("update links go right after @version and old ones are dropped; the body is untouched", () => {
  const l = linksFor("https://oscardevs.com/serviceflow/", "a".repeat(32), "test.user.js");
  assert.equal(l.user, `https://oscardevs.com/serviceflow/userscripts/${"a".repeat(32)}/test.user.js`);
  assert.equal(l.meta, `https://oscardevs.com/serviceflow/userscripts/${"a".repeat(32)}/test.meta.js`);
  const out = withUpdateUrls(SRC, l.user, l.meta);
  const lines = out.split("\n");
  const v = lines.findIndex((x) => x.includes("@version"));
  assert.match(lines[v + 1], /@updateURL\s+https:\/\/oscardevs\.com\/serviceflow\/userscripts\/a+\/test\.meta\.js$/);
  assert.match(lines[v + 2], /@downloadURL\s+https:\/\/oscardevs\.com\/serviceflow\/userscripts\/a+\/test\.user\.js$/);
  assert.equal((out.match(/@updateURL/g) || []).length, 1);
  assert.ok(!out.includes("old.example"));
  assert.ok(out.endsWith("(function () { console.log('body'); })();\n"));
  assert.deepEqual(readHeader(out), { name: "Test", version: "1.2.3", namespace: "sf" });
  const meta = metaOnly(out);
  assert.ok(meta.startsWith("// ==UserScript==") && meta.includes("@downloadURL") && !meta.includes("body"));
});

test("every project script has a header with a version (Tampermonkey updates only when @version goes up)", () => {
  const files = listScripts(DIR);
  assert.ok(files.length >= 10, files.join(","));
  for (const f of files) {
    const h = readHeader(readScript(f, DIR) || "");
    assert.ok(h && h.name && /^\d+(\.\d+)+$/.test(h.version), f + " " + JSON.stringify(h));
  }
  assert.ok(files.includes("sf-bridge.user.js") && files.includes("dzs-expresse-v10.user.js"));
  assert.ok(Object.keys(DEPRECATED).every((f) => files.includes(f)));
  assert.equal(readScript("../package.json", DIR), null);       // مفيش خروج من الفولدر
  assert.equal(FILE_RE.test("x/../y.user.js"), false);
});
