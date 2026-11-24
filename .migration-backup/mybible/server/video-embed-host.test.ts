import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test("client embeds do not use the cookie-less YouTube host", () => {
  const root = new URL("../client/src", import.meta.url).pathname;
  const offenders = walk(root).filter((path) =>
    readFileSync(path, "utf8").includes("youtube-nocookie.com/embed"),
  );
  assert.deepEqual(offenders, []);
});

test("VideoCard embeds use the standard YouTube host", () => {
  const videoCard = readFileSync(new URL("../client/src/components/VideoCard.tsx", import.meta.url), "utf8");
  assert.match(videoCard, /https:\/\/www\.youtube\.com\/embed\//);
});
