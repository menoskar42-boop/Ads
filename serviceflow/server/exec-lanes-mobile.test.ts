// «إعدادات التنفيذ والتحديث» على الموبايل — المالك ٢٠٢٦-١٠-١٠: «بتنهج ومش بقدر أعدّل منها حاجة».
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dlg = readFileSync(new URL("../client/src/components/ExecLanesSettingsButton.tsx", import.meta.url), "utf8");
const ws = readFileSync(new URL("../client/src/hooks/use-websocket.ts", import.meta.url), "utf8");

test("the dialog copies server values once per opening — a refetch doesn't wipe what was typed", () => {
  assert.match(dlg, /if \(open && data && !filled\.current\) \{\s*filled\.current = true;/);
  assert.match(dlg, /useEffect\(\(\) => \{ if \(!open\) filled\.current = false; \}, \[open\]\);/);
});

test("numbers change with − / + buttons (no keyboard needed) and plain numeric text inputs", () => {
  assert.match(dlg, /aria-label=\{`\$\{label\} −`\}/);
  assert.match(dlg, /aria-label=\{`\$\{label\} \+`\}/);
  assert.doesNotMatch(dlg, /type="number"/, "iOS number inputs are the fiddly ones");
  assert.match(dlg, /inputMode="numeric" pattern="\[0-9\]\*"/);
  // التلات قيم بالـstepper: جوّه row (بدون Real + إيقاف PO) + دقايق التحديث
  assert.match(dlg, /\{stepper\(id, v, set, 1, max, 1, valid\(v\), label\)\}/);
  assert.match(dlg, /\{stepper\("refresh-minutes", refresh, setRefresh, rMin, rMax, 5, validRefresh, "دقايق التحديث"\)\}/);
});

test("on phones the dialog sits at the top and scrolls instead of jumping with the keyboard", () => {
  assert.match(dlg, /max-h-\[90dvh\] overflow-y-auto top-\[4dvh\] translate-y-0 sm:top-\[50%\] sm:translate-y-\[-50%\]/);
});

test("a failed load shows a message and «حاول تانى» instead of an endless spinner", () => {
  assert.match(dlg, /isError && !data \?/);
  assert.match(dlg, /onClick=\{\(\) => refetch\(\)\}/);
});

test("back-to-back uploads refetch the page once, with a cap so a steady stream still refreshes", () => {
  const branch = ws.slice(ws.indexOf("if (message.type === WS_EVENTS.DATA_IMPORT)"));
  assert.doesNotMatch(branch.slice(0, 600), /queryClient\.invalidateQueries\(\);/, "no immediate refetch per upload");
  assert.match(branch, /setTimeout\(flushImports, IMPORT_SETTLE_MS\)/);
  assert.match(branch, /Date\.now\(\) - firstPendingAt >= IMPORT_MAX_WAIT_MS/);
  assert.match(ws, /const flushImports = \(\) => \{[\s\S]*?queryClient\.invalidateQueries\(\);/);
  assert.match(ws, /if \(importTimer\) clearTimeout\(importTimer\);\s*\n\s*wsRef\.current\?\.close\(\);/, "timer cleared on unmount");
});
