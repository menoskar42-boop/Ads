import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("home and groups use one FlatList as their scroll owner", () => {
  const home = read("../app/index.tsx");
  const groups = read("../app/groups/index.tsx");
  for (const source of [home, groups]) {
    assert.match(source, /<Screen>[\s\S]*?<FlatList/);
    assert.doesNotMatch(source, /<ScrollView/);
    assert.equal((source.match(/<FlatList/g) ?? []).length, 1);
  }
  assert.match(home, /ListHeaderComponent/);
  assert.match(groups, /ListHeaderComponent/);
});

test("statuses use one keyboard-aware scroll container without a nested list", () => {
  const statuses = read("../app/statuses.tsx");
  assert.match(statuses, /<KeyboardAwareScrollViewCompat/);
  assert.doesNotMatch(statuses, /<FlatList|<ScrollView/);
});

test("direct messages, group messages, and incoming calls use high urgency with 24-hour TTL", () => {
  const push = read("../../api-server/src/lib/messenger-web-push.ts");
  assert.match(push, /const NORMAL_PUSH_OPTIONS = \{ urgency: "normal" \}/);
  assert.match(push, /const HIGH_URGENCY_PUSH_OPTIONS = \{ urgency: "high", TTL: 86_400 \}/);
  assert.match(push, /deliveryOptions: PushDeliveryOptions = NORMAL_PUSH_OPTIONS/);
  assert.match(push, /notifyConversationMessage[\s\S]*?HIGH_URGENCY_PUSH_OPTIONS/);
  assert.match(push, /notifyMessengerIncomingCall[\s\S]*?HIGH_URGENCY_PUSH_OPTIONS/);
  assert.match(push, /notifyGroupMessage[\s\S]*?HIGH_URGENCY_PUSH_OPTIONS/);
  assert.match(push, /deliverPushSubscriptions\(pool, subscriptions, payload, undefined, deliveryOptions\)/);
});

test("PWA refresh checks on foreground and pageshow, then defers one reload while activity is busy", () => {
  const coordinator = read("../lib/pwa-update-activity.tsx");
  const controller = read("../components/WebCallController.tsx");
  assert.match(coordinator, /await currentRegistration\.update\(\)/);
  assert.match(coordinator, /document\.addEventListener\("visibilitychange"/);
  assert.match(coordinator, /AppState\.addEventListener\(\s*"change"/);
  assert.match(coordinator, /window\.addEventListener\("pageshow"/);
  assert.match(coordinator, /!pendingReload \|\| busyRef\.current \|\| reloadStarted/);
  assert.match(coordinator, /sessionStorage\.setItem\(RELOAD_MARKER, "1"\)/);
  assert.match(controller, /usePwaUpdateActivity/);
  assert.match(controller, /"web-call"/);
  assert.match(controller, /call\.state !== "ended"/);
});

test("the service worker shell cache version is bumped", () => {
  const worker = read("../public/sw.js");
  assert.match(worker, /oscar-messenger-shell-v4/);
});
