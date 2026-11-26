import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import { getActivityLessonVideo } from "../js/data/activityLessonVideos.js";

test("the current bird video mapping supplies its title and URL without contacting YouTube", async () => {
  const video = getActivityLessonVideo("birds", "explore");
  assert.equal(video.videoId, "IhnVsNo84vU");
  assert.equal(video.title, "قناة أسرتنا · أنشودة الطيور");
  const explore = await readFile(new URL("../js/games/explore.js", import.meta.url), "utf8");
  assert.match(explore, /createYouTubePlayer\(video/);
});

test("service worker install caches current activity files and activation removes the prior app cache", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const handlers = {};
  const stored = new Map();
  const deleted = [];
  const requested = [];
  let claimed = false;
  let skippedWaiting = false;
  class CacheRequest {
    constructor(url, options) {
      this.url = url;
      this.options = options;
    }
  }
  const context = {
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: () => { skippedWaiting = true; },
      clients: { claim: () => { claimed = true; } },
    },
    caches: {
      open: async (name) => {
        const cache = { assets: [], addAll: async (assets) => { cache.assets = assets; } };
        stored.set(name, cache);
        return cache;
      },
      keys: async () => ["safari-kids-v337", "safari-kids-v338", "other-cache"],
      delete: async (name) => { deleted.push(name); return true; },
      match: async () => null,
    },
    fetch: async (request) => {
      requested.push(request);
      return { json: async () => ({ assets: ["/js/data/activityLessonVideos.js", "/js/games/explore.js"] }) };
    },
    Request: CacheRequest,
    URL,
    Promise,
  };
  vm.runInNewContext(source, context, { filename: "sw.js" });

  let installPromise;
  handlers.install({ waitUntil: (promise) => { installPromise = promise; } });
  await installPromise;
  const cacheNames = [...stored.keys()];
  assert.deepEqual(cacheNames, ["safari-kids-v338"]);
  assert.ok(skippedWaiting);
  assert.equal(requested.length, 1);
  const assets = stored.get(cacheNames[0]).assets;
  assert.ok(assets.some((asset) => asset.url === "/js/data/activityLessonVideos.js"));
  assert.ok(assets.some((asset) => asset.url === "/js/games/explore.js"));
  assert.ok(assets.every((asset) => asset.options.cache === "reload"));

  let activatePromise;
  handlers.activate({ waitUntil: (promise) => { activatePromise = promise; } });
  await activatePromise;
  assert.deepEqual(deleted, ["safari-kids-v337", "other-cache"]);
  assert.ok(claimed);
});
