// المرحلة ٢ من خرايط الكوابل (المالك ٢٠٢٦-١١-١٦): كل كابل عليه إيه، ومكان العطل من القياس.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GHANAYEM_6_7 } from "../shared/cfm-maps/ghanayem-6-7";
import { cableRoutes, locateFault, pathToNode, cabinetKey, distancesFromCabinet } from "../shared/cfm-maps/types";

const M = GHANAYEM_6_7;

test("path to box 23: cabinet ← J10 (148) ← J11 (85) ← box 23 (10) = 243 m", () => {
  const p = pathToNode(M, "B23")!;
  assert.deepEqual(p.map((s) => s.node), ["CAB", "J10", "J11", "B23"]);
  assert.equal(p[p.length - 1].dist, 243);
});

test("owner's example: box 23 at 243 m, measured 200 m from the box ⇒ 43 m from the cabinet, between cabinet and J10", () => {
  const f = locateFault(M, "23", 200, "box")!;
  assert.equal(f.boxDistM, 243);
  assert.equal(f.fromCabinetM, 43);
  assert.equal(f.cabinetCloser, true);
  assert.deepEqual(f.between, { a: "CAB", b: "J10", fromA: 43, fromB: 105 });
});

test("measured from the cabinet: the same distance along the box's path", () => {
  const f = locateFault(M, "23", 200, "cabinet")!;
  assert.equal(f.fromCabinetM, 200);
  assert.equal(f.cabinetCloser, false);
  assert.deepEqual(f.between, { a: "J10", b: "J11", fromA: 52, fromB: 33 });
});

test("a measurement longer than the path is flagged, not placed", () => {
  const f = locateFault(M, "23", 300, "box")!;
  assert.equal(f.beyond, true);
  assert.equal(f.between, null);
  assert.equal(locateFault(M, "999", 10, "box"), null);
});

test("every box and joint is on exactly one cable from the cabinet, with its distance", () => {
  const routes = cableRoutes(M);
  const d = distancesFromCabinet(M);
  const boxes = routes.flatMap((r) => r.boxes.map((b) => b.node));
  assert.equal(new Set(boxes).size, boxes.length);
  assert.equal(boxes.length, M.boxes.length);
  for (const r of routes) for (const b of r.boxes) assert.equal(b.dist, d[b.node]);
  const r23 = routes.find((r) => r.boxes.some((b) => b.node === "B23"))!;
  assert.ok(r23.joints.some((j) => j.node === "J10") && r23.joints.some((j) => j.node === "J11"));
});

test("cabinet numbers match regardless of order/separator", () => {
  assert.equal(cabinetKey("6.7"), cabinetKey("7-6"));
  assert.equal(cabinetKey("٦/٧"), "6-7");
  assert.notEqual(cabinetKey("6.7"), cabinetKey("6.8"));
});

test("the map screen and the ticket screen use the same fault wording", async () => {
  const { readFileSync } = await import("node:fs");
  const maps = readFileSync(new URL("../client/src/cfm/pages/maps.tsx", import.meta.url), "utf8");
  const ticket = readFileSync(new URL("../client/src/cfm/pages/tickets/detail.tsx", import.meta.url), "utf8");
  const ph2 = readFileSync(new URL("../client/src/cfm/components/MapPhase2.tsx", import.meta.url), "utf8");
  assert.match(maps, /<TabsTrigger value="routes">كل كابل عليه إيه<\/TabsTrigger>/);
  assert.match(maps, /<TabsTrigger value="fault">مكان العطل<\/TabsTrigger>/);
  assert.match(ticket, /<MeasurementMapHint cabinet=\{ticket\.cabinet\} box=\{ticket\.box\} distance=\{m\.distance\} direction=\{m\.direction\} central=\{central\?\.name\} \/>/);
  // «cable» فى برنامج الكوابل = «من البوكس»
  assert.match(ph2, /direction === "cable" \? "box" : "cabinet"/);
  const { describeFault } = await import("../shared/cfm-maps/types");
  const lines = describeFault(locateFault(M, "23", 200, "box")!);
  assert.ok(lines.some((l) => l.includes("يمكن القياس من الكابينة لأنها أقرب") && l.includes("43 م")));
  assert.ok(lines.some((l) => l.includes("بين الكابينة ووصلة 10") && l.includes("43 م من الكابينة") && l.includes("105 م من وصلة 10")));
});

test("owner's screenshot (2026-11-17): box 11, 50 m from the box ⇒ 241 m; box 13 is on the same cable and nearer (27 m)", async () => {
  const { describeFault } = await import("../shared/cfm-maps/types");
  const f = locateFault(M, "11", 50, "box")!;
  assert.equal(f.fromCabinetM, 241);
  assert.deepEqual(f.between, { a: "J1", b: "J3", fromA: 31, fromB: 7 });
  // بكس 13 مساره معدّى على القطعة J1→J3 (العطل على سلكه) وأقرب من بكس 11 (50 م)
  assert.deepEqual(f.nearerBox, { box: "B13", distM: 27, boxDistM: 268 });
  const q = pathToNode(M, "B13")!.map((x) => x.node);
  assert.equal(q[q.indexOf("J3") - 1], "J1");
  assert.ok(describeFault(f).some((l) => l.includes("فيه بكس أقرب للعطل على نفس الكابل: بكس 13") && l.includes("27 م")));
});

test("nearer box: only boxes whose path crosses the faulty piece, and only if nearer than the measured box", () => {
  for (const [box, d, dir] of [["11", 50, "box"], ["23", 200, "box"], ["23", 200, "cabinet"], ["13", 5, "box"]] as const) {
    const f = locateFault(M, box, d, dir)!;
    if (!f.nearerBox) continue;
    const p = f.fromCabinetM!;
    const q = pathToNode(M, f.nearerBox.box)!;
    const i = q.findIndex((x) => x.node === f.between!.b);
    assert.ok(i > 0 && q[i - 1].node === f.between!.a, `${f.nearerBox.box} مش على القطعة اللى فيها العطل`);
    assert.ok(f.nearerBox.distM < f.boxDistM - p);
    assert.equal(f.nearerBox.distM, Math.round((f.nearerBox.boxDistM - p) * 10) / 10);
  }
  // العطل لازق فى البكس المقاس ⇒ مفيش أقرب
  assert.equal(locateFault(M, "13", 1, "box")!.nearerBox, null);
  // قياس أطول من المسار ⇒ مفيش مكان ولا بكس أقرب
  assert.equal(locateFault(M, "23", 300, "box")!.nearerBox, null);
});

test("2026-11-19: a ticket picks the map of its own exchange; image-only maps (no cables) are skipped", async () => {
  const { pickCabinetMap } = await import("../shared/cfm-maps/types");
  const maps = [
    { id: 1, cabinet: "6.7", central: "الغنايم", segments: 72 },
    { id: 2, cabinet: "1.1", central: "دير الجنادلة", segments: 0 },
    { id: 3, cabinet: "1.1", central: "الغنايم", segments: 40 },
    { id: 4, cabinet: "2.1", central: "دير الجنادلة", segments: 30 },
    { id: 5, cabinet: "2.1", central: "الغنايم", segments: 25 },
  ];
  assert.equal(pickCabinetMap(maps, "7-6", "الغنايم")?.id, 1);
  assert.equal(pickCabinetMap(maps, "6.7")?.id, 1, "خريطة واحدة بالرقم ده ⇒ هى من غير ما نبص للسنترال");
  assert.equal(pickCabinetMap(maps, "1-1", "دير الجنادله")?.id, 3, "خريطة دير الجنادلة 1.1 صورة بس ⇒ مش بتتحسب");
  assert.equal(pickCabinetMap(maps, "2-1", "الغنايم-دير الجنادله")?.id, 4, "اسم السنترال فى التكت فيه «دير الجنادله»");
  assert.equal(pickCabinetMap(maps, "2-1", "الغنايم")?.id, 5);
  assert.equal(pickCabinetMap(maps, "2-1"), undefined, "رقمين بنفس الكابينة ومفيش سنترال ⇒ مانخمّنش");
  // المالك: «لا تعتمد بدون كابينة وبكسيات»
  assert.equal(pickCabinetMap([{ id: 9, cabinet: "4.4", central: "الغنايم", segments: 10, boxes: 0 }], "4.4", "الغنايم"), undefined, "مفيش بكسيات ⇒ مش كهربية");
  assert.equal(pickCabinetMap([{ id: 9, cabinet: "الشبكة الابتدائية (مرجع)", segments: 5, boxes: 0 }], ""), undefined, "من غير رقم كابينة ⇒ لأ");
});

test("2026-11-19: every DWG map image in the seed list exists and is a WebP", async () => {
  const { readFileSync } = await import("node:fs");
  const { DWG_SEED_MAPS } = await import("./cfm/maps-seed-list");
  for (const m of DWG_SEED_MAPS) for (const img of m.images) {
    const b = readFileSync(new URL("./cfm/maps-seed/" + img.file, import.meta.url));
    assert.equal(b.subarray(8, 12).toString(), "WEBP", img.file);
  }
  assert.equal(new Set(DWG_SEED_MAPS.map((m) => m.key)).size, DWG_SEED_MAPS.length, "map_key مايتكررش");
});

test("2026-11-19: the maps list has a central → cabinet search filter (like the with-account report)", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../client/src/cfm/pages/maps.tsx", import.meta.url), "utf8");
  const srv = readFileSync(new URL("./cfm/maps.ts", import.meta.url), "utf8");
  assert.match(page, /data-testid="maps-filter"/);
  // فلتر البكس اتشال بعد كده (commit 9e7b78b على حساب المالك) — السنترال والكابينة بس
  for (const p of ["كل السنترالات", "كل الكباين"]) assert.ok(page.includes(p), p);
  void srv;
});

test("2026-11-19: DWG map images go to R2 through a token-only import (the repo is public); 6.7 J22→B27 = 12 m", async () => {
  const { readFileSync } = await import("node:fs");
  const srv = readFileSync(new URL("./cfm/maps.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(srv, /app\.post\("\/api\/cfm\/maps\/import"/);
  assert.match(srv, /CFM_MAP_IMPORT_TOKEN/);
  assert.match(srv, /want\.length < 24 \|\| got\.length !== want\.length \|\| !timingSafeEqual/, "من غير السرّ ⇒ ٤٠٤");
  assert.match(srv, /storage_key/);
  assert.match(db, /ALTER TABLE cfm_map_images ADD COLUMN IF NOT EXISTS storage_key text/);
  assert.match(db, /ALTER TABLE cfm_map_images ALTER COLUMN bytes DROP NOT NULL/);
  const seg = M.segments.find((s) => s.from === "J22" && s.to === "B27");
  assert.equal(seg?.lengthM, 12);
});

test("2026-11-19: the import also carries the cabinet + boxes read from the AutoCAD text, only onto a map nobody transcribed", async () => {
  const { readFileSync } = await import("node:fs");
  const srv = readFileSync(new URL("./cfm/maps.ts", import.meta.url), "utf8");
  assert.match(srv, /if \(!segs && \(auto \|\| !curBoxes\)\)/, "خريطة فيها كابلات اتفرّغت بإيد مابتتلمسش");
  const { createRequire } = await import("node:module");
  const { extractBoxes } = createRequire(import.meta.url)("../scripts/dwg-maps/boxes.cjs");
  // صندوق البكس: البلوك فوق الفرعات، ورقم البكس يمينها (نفس شكل خريطة 6.7)
  const t = (s: string, x: number, y: number, h: number) => ({ type: "TEXT", layer: "P_DP_TXT-S-A", text: s, startPoint: { x, y }, textHeight: h });
  const db = { entities: [t("6", 7.04, 1.65, 0.35), t("71-90", 6.78, 1.22, 0.2), t("46", 7.91, 1.42, 0.35), t("6", 7.09, 4.07, 0.35), t("91-100", 6.80, 3.64, 0.2), t("47", 7.95, 3.84, 0.35)] };
  const b = (extractBoxes as any)(db, /P_DP_TXT/).map((x: any) => `${x.box}|${x.block}|${x.pairs}`).sort();
  assert.deepEqual(b, ["46|6|71-90", "47|6|91-100"]);
});

test("2026-11-19: the AutoCAD import also traces the cables (both drawing styles), oriented away from the cabinet", async () => {
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const net = req("../scripts/dwg-maps/cables.cjs");
  assert.equal(typeof net.extractNetwork, "function");
  assert.ok(net.GHANAYEM && net.DERGNDLA, "إعداد خرايط الغنايم ودير الجنادلة");
  const { readFileSync } = await import("node:fs");
  const man = readFileSync(new URL("../scripts/dwg-maps/build-manifest.js", import.meta.url), "utf8");
  assert.match(man, /GHANAYEM\)/); assert.match(man, /DERGNDLA\)/);
  assert.match(man, /مالقيناش خطها/, "النص اللى مالقيناش خطه بيتكتب فى الملاحظات");
});
