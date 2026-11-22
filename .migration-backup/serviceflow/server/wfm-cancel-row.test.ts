import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// المالك ٢٠٢٦-١٠-٢٦: «إلغاء الاسناد» جنب الرقم فى التركيبات الحالية، وجنب المسلسل فى المعاينات الحالية
const dash = readFileSync(new URL("../client/src/pages/dashboard.tsx", import.meta.url), "utf8");
const inst = readFileSync(new URL("../client/src/components/InstallationsReport.tsx", import.meta.url), "utf8");
const btn = readFileSync(new URL("../client/src/components/WfmCancelButton.tsx", import.meta.url), "utf8");

test("the button is on the current installations and current surveys only", () => {
  for (const f of ["current-installations", "current-surveys"]) {
    const block = dash.slice(dash.indexOf(`fileName="${f}"`), dash.indexOf("/>", dash.indexOf(`fileName="${f}"`)));
    assert.match(block, /wfmCancel/, f);
  }
  for (const f of ["regularized-installations", "regularized-surveys"]) {
    const block = dash.slice(dash.indexOf(`fileName="${f}"`), dash.indexOf("/>", dash.indexOf(`fileName="${f}"`)));
    assert.doesNotMatch(block, /wfmCancel/, f);
  }
  assert.match(inst, /<WfmCancelButton phone=\{o\.phoneNumber\} isSerial=\{phoneLabel === "المسلسل"\}/);
});

test("it runs the same WFM cancel as phone search (queue first, then the site)", () => {
  assert.match(btn, /dispatchSpeedTool\("wfmcancel", \[sid\], isSuper, \{ params \}\)/);
  assert.match(btn, /openOpSite\("wfmcancel", sid, params\)/);
  assert.match(btn, /mode: "reassign", worker, workerName: tech/);
});

test("the serial goes to WFM as written; a phone loses its 88", async () => {
  const src = btn.match(/export function wfmServiceId[\s\S]*?\n\}/)![0]
    .replace(/: string \| null \| undefined/, "").replace(/: boolean\): string/, ")");
  const wfmServiceId = new Function(`${src.replace("export ", "")}; return wfmServiceId;`)();
  assert.equal(wfmServiceId("26102611502945814096", true), "26102611502945814096");
  assert.equal(wfmServiceId("882823758", false), "2823758");
  assert.equal(wfmServiceId("2823758", false), "2823758");
});
