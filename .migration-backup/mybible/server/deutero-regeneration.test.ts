import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  APPROVED_DEUTERO_BOOK_NAMES,
  buildPerBookFiles,
} from "../script/sync-deutero-books";

const DATA_DIR = path.join(process.cwd(), "data", "deutero");

test("the approved snapshot deterministically rebuilds all seven local book files byte-for-byte", () => {
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "sttakla-1877.json"), "utf8"),
  );
  const generatedFiles = buildPerBookFiles(snapshot);

  assert.deepEqual(
    [...generatedFiles.keys()],
    APPROVED_DEUTERO_BOOK_NAMES.map((name) => `${name}.json`),
  );
  for (const [fileName, contents] of generatedFiles) {
    assert.equal(
      contents,
      fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"),
      `${fileName} must remain byte-for-byte identical to the approved snapshot export`,
    );
  }
});

test("regeneration refuses an incomplete or reordered approved book set", () => {
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "sttakla-1877.json"), "utf8"),
  );
  assert.throws(
    () => buildPerBookFiles({ ...snapshot, books: snapshot.books.slice(1) }),
    /seven books in their approved order/,
  );
});
