import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// نوافذ الطباعة/PDF (ومنها خطاب ردود التكرار) كانت بتطلع بلوجو أوسكار ديفز — أيقونة جذر الدومين.
const icon = readFileSync(new URL("../client/src/lib/print-window-icon.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
const report = readFileSync(new URL("../client/src/components/RepeatReviewsReport.tsx", import.meta.url), "utf8");

test("every blank print window gets the Service Flow icon (with the base path), even after document.write", () => {
  assert.match(main, /import \{ installPrintWindowIcon \} from "\.\/lib\/print-window-icon";/);
  assert.match(main, /\ninstallPrintWindowIcon\(\);\n/);
  assert.match(icon, /new URL\(withBase\("\/favicon\.png"\), window\.location\.origin\)\.href/);
  assert.match(icon, /u === "" \|\| u === "about:blank"/);
  // document.write بيمسح الـhead — فالأيقونة بتتحط تانى بعد close
  assert.match(icon, /doc\.close = \(\) => \{ origClose\(\); addSfIcon\(w\.document\); \};/);
});

test("«ردود التكرار» opens on all months and all statuses (old replies were hidden)", () => {
  assert.match(report, /const \[from, setFrom\] = useState\(""\);/);
  assert.match(report, /const \[doneOnly, setDoneOnly\] = useState\(false\);/);
});
