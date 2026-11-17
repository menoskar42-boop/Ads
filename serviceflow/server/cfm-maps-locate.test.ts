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
  assert.match(ticket, /<MeasurementMapHint cabinet=\{ticket\.cabinet\} box=\{ticket\.box\} distance=\{m\.distance\} direction=\{m\.direction\} \/>/);
  // «cable» فى برنامج الكوابل = «من البوكس»
  assert.match(ph2, /direction === "cable" \? "box" : "cabinet"/);
  const { describeFault } = await import("../shared/cfm-maps/types");
  const lines = describeFault(locateFault(M, "23", 200, "box")!);
  assert.ok(lines.some((l) => l.includes("يمكن القياس من الكابينة لأنها أقرب") && l.includes("43 م")));
  assert.ok(lines.some((l) => l.includes("بين الكابينة ووصلة 10") && l.includes("43 م من الكابينة") && l.includes("105 م من وصلة 10")));
});
