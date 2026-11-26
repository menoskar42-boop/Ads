import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAIN_BUNDLE_BUDGET_BYTES,
  mainBundleBudgetError,
} from "../script/main-bundle-budget";

function outputChunk(name: string, sizeBytes: number, isEntry = true) {
  return {
    type: "chunk",
    name,
    isEntry,
    code: "x".repeat(sizeBytes),
  };
}

test("main modern and legacy entry bundles stay within the one-MiB budget", () => {
  const error = mainBundleBudgetError({
    "index.js": outputChunk("index", 724_795),
    "index-legacy.js": outputChunk("index-legacy", 960_741),
  });

  assert.equal(error, null);
});

test("the build fails when either main entry exceeds the budget", () => {
  for (const name of ["index", "index-legacy"]) {
    const error = mainBundleBudgetError({
      "main.js": outputChunk(name, MAIN_BUNDLE_BUDGET_BYTES + 1),
    });
    assert.match(error ?? "", new RegExp(`Main client bundle ${name}`));
  }
});

test("large lazy route chunks do not count against the main entry budget", () => {
  const error = mainBundleBudgetError({
    "index.js": outputChunk("index", 724_795),
    "large-route.js": outputChunk("Orthodox", MAIN_BUNDLE_BUDGET_BYTES * 2, false),
  });

  assert.equal(error, null);
});

test("the build fails if the expected main entry is missing", () => {
  assert.match(
    mainBundleBudgetError({
      "route.js": outputChunk("Orthodox", 200_000),
    }) ?? "",
    /did not emit its expected main entry/,
  );
});
