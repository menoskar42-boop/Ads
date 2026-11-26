import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("home and groups lists own their scrolling content", () => {
  const home = read("../app/index.tsx");
  const groups = read("../app/groups/index.tsx");

  assert.match(home, /<FlatList[\s\S]*?ListHeaderComponent=/);
  assert.doesNotMatch(home, /<ScrollView/);
  assert.match(home, /ListFooterComponent=/);
  assert.match(groups, /<FlatList[\s\S]*?ListHeaderComponent=/);
  assert.doesNotMatch(groups, /<ScrollView/);
});

test("statuses keep one keyboard-aware scroll container instead of nesting a list", () => {
  const statuses = read("../app/statuses.tsx");
  assert.match(statuses, /<KeyboardAwareScrollViewCompat/);
  assert.doesNotMatch(statuses, /<FlatList|<ScrollView/);
});

test("PWA updates check on foreground and reload only when activities are idle", () => {
  const coordinator = read("../lib/pwa-update-activity.tsx");
  const root = read("../app/_layout.tsx");
  const serviceWorker = read("../public/sw.js");

  assert.match(root, /PwaUpdateActivityProvider/);
  assert.match(root, /PwaUpdateCoordinator/);
  assert.match(coordinator, /currentRegistration\.update\(\)/);
  assert.match(coordinator, /document\.addEventListener\("visibilitychange"/);
  assert.match(coordinator, /AppState\.addEventListener\(/);
  assert.match(coordinator, /"controllerchange"/);
  assert.match(coordinator, /\.waiting/);
  assert.match(coordinator, /busyRef\.current/);
  assert.match(coordinator, /sessionStorage\.setItem\(RELOAD_MARKER/);
  assert.match(serviceWorker, /CACHE_NAME = "oscar-messenger-shell-v3"/);
});

test("message composition, uploads, and calls hold the PWA reload guard", () => {
  const composer = read("../components/MessageComposer.tsx");
  const group = read("../app/groups/[groupId]/index.tsx");
  const call = read("../components/WebCallController.tsx");

  assert.match(composer, /usePwaUpdateActivity\([\s\S]*value\.length[\s\S]*mediaBusy/);
  assert.match(group, /usePwaUpdateActivity\([\s\S]*body\.length[\s\S]*voiceBusy[\s\S]*mediaBusy/);
  assert.match(call, /usePwaUpdateActivity\([\s\S]*isWebCallSupported[\s\S]*call\.state/);
});
