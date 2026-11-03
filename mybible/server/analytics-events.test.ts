// أحداث Google Analytics (المالك ٢٠٢٦-١١-٠٣): من غير أى بيانات شخصية، وكل حدث متوصّل بمكانه.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("track() drops anything that could identify a member", async () => {
  const sent: any[] = [];
  (globalThis as any).window = { gtag: (...a: any[]) => sent.push(a) };
  const { track } = await import("../client/src/lib/analytics");
  track("group_join", { method: "invite", group_id: "AZK3P", userName: "مينا", phone: "0100", memberKey: "k", message: "x" });
  assert.deepEqual(sent, [["event", "group_join", { method: "invite", group_id: "AZK3P" }]]);
  delete (globalThis as any).window.gtag;
  track("search", { search_term: "x" });   // من غير gtag مابيقعش
  assert.equal(sent.length, 1);
});

test("every event is wired where the action happens", () => {
  const src = (p: string) => readFileSync(new URL(`../client/src/${p}`, import.meta.url), "utf8");
  const wires: [string, RegExp][] = [
    ["pages/GroupInvite.tsx", /track\('group_join', \{ method: 'invite'/],
    ["pages/GroupJoin.tsx", /track\('group_join', \{ method: 'code'/],
    ["lib/reading-queue.ts", /track\('reading_log'/],
    ["pages/Plans.tsx", /track\('plan_start'/],
    ["pages/Plans.tsx", /track\('plan_complete'/],
    ["components/home/DailyVerse.tsx", /track\('verse_share', \{ source: 'daily_verse' \}\)/],
    ["components/home/DailyVerse.tsx", /track\('daily_verse_on'\)/],
    ["pages/Bible.tsx", /track\('verse_save'/],
    ["hooks/useOfflineSync.ts", /track\('offline_download'\)/],
    ["pages/Search.tsx", /track\('search', \{ search_term: term\.slice\(0, 50\) \}\)/],
  ];
  for (const [file, re] of wires) assert.match(src(file), re, file);
});
