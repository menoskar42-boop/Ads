import assert from "node:assert/strict";
import { test } from "node:test";
import { listActivityLessonVideos } from "../js/data/activityLessonVideos.js";
import { checkActivityVideoLinks } from "../scripts/check-activity-video-links.mjs";

test("the health check covers only the activity video catalogue, including birds and insects", () => {
  const lessons = listActivityLessonVideos();
  assert.ok(lessons.some((lesson) => lesson.datasetKey === "birds" && lesson.videoId === "IhnVsNo84vU"));
  assert.ok(lessons.some((lesson) => lesson.datasetKey === "insects" && lesson.videoId === "T1O-k06fY_c"));
  assert.ok(lessons.every((lesson) => lesson.datasetKey && lesson.activityKey && lesson.videoId));
  assert.ok(lessons.every((lesson) => !lesson.datasetKey.includes("letter") && !lesson.datasetKey.includes("number")));
});

test("available, unavailable and temporary network failures are reported as distinct outcomes", async () => {
  const lessons = [
    { datasetKey: "birds", activityKey: "explore", title: "Birds", videoId: "IhnVsNo84vU" },
    { datasetKey: "insects", activityKey: "explore", title: "Insects", videoId: "T1O-k06fY_c" },
    { datasetKey: "animals", activityKey: "explore", title: "Animals", videoId: "bJ3EWyZQyl0" },
  ];
  const fakeFetch = async (url) => {
    const videoId = new URL(url.searchParams.get("url")).searchParams.get("v");
    if (videoId === "IhnVsNo84vU") return { ok: true, status: 200, json: async () => ({ title: "أنشودة الطيور" }) };
    if (videoId === "T1O-k06fY_c") return { ok: false, status: 404 };
    throw new TypeError("network unavailable");
  };
  const results = await checkActivityVideoLinks(lessons, fakeFetch);
  assert.deepEqual(results.map((result) => result.state), ["available", "unavailable", "inconclusive"]);
  assert.match(results[1].reason, /404/);
  assert.match(results[2].reason, /could not be reached/);
});
