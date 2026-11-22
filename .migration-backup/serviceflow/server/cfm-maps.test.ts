// خريطة الشبكة الثانوية (الغنايم 6.7): التفريغ متماسك — كل بكس ليه كابل من وصلته، وكل مكان ليه مسار من الكابينة،
// وأرقام البلوكات والأزواج مابتتكررش. (المالك ٢٠٢٦-١١-١٢)
import { test } from "node:test";
import assert from "node:assert/strict";
import { GHANAYEM_6_7 } from "../shared/cfm-maps/ghanayem-6-7";
import { distancesFromCabinet, nodeLabel } from "../shared/cfm-maps/types";

const M = GHANAYEM_6_7;

test("every box has its own cable from the joint it hangs on", () => {
  assert.equal(M.boxes.length, 47);
  for (const b of M.boxes) {
    const s = M.segments.find((x) => x.to === "B" + b.box);
    assert.ok(s, `بكس ${b.box} مالوش كابل`);
    assert.equal(s!.from, b.joint, `بكس ${b.box}: الوصلة ${b.joint} ≠ ${s!.from}`);
  }
});

test("every place is reachable from the cabinet with a full length (box 21 = 6.7 path)", () => {
  const d = distancesFromCabinet(M);
  for (const b of M.boxes) assert.ok(d["B" + b.box] != null, `بكس ${b.box} مالوش مسار من الكابينة`);
  // الكابينة ← 10 (148) ← 11 (85) ← بكس 23 (10)
  assert.equal(d.J11, 148 + 85);
  assert.equal(d.B23, 148 + 85 + 10);
  assert.equal(nodeLabel("J10"), "وصلة 10");
});

test("block pair ranges don't overlap between boxes and spares", () => {
  const used: Record<string, string> = {};
  const add = (block: string, range: string, who: string) => {
    const [a, b] = range.split("-").map(Number);
    for (let i = a; i <= b; i++) {
      const k = block + ":" + i;
      assert.ok(!used[k], `بلوك ${block} زوج ${i}: ${used[k]} و${who}`);
      used[k] = who;
    }
  };
  for (const b of M.boxes) add(b.block, b.pairs, "بكس " + b.box);
  for (const s of M.spares) add(s.block, s.pairs, "اسبير " + s.joint);
});
