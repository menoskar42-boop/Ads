import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("inspection follow-up handles nullable PostgreSQL rowCount without changing the branch", async () => {
  const source = await readFile(
    new URL("./inspection-followup.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(\(initialized\.rowCount \?\? 0\) >= 0\)/);
  assert.match(source, /if \(\(cached\.rowCount \?\? 0\) >= 0 \|\| targetVersion\)/);
  const isNonnegative = (rowCount: number | null) => (rowCount ?? 0) >= 0;
  assert.equal(isNonnegative(null), true);
  assert.equal(isNonnegative(0), true);
  assert.equal(isNonnegative(1), true);
  assert.equal(isNonnegative(-1), false);
});
