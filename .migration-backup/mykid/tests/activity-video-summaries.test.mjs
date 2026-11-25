import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { getActivityLessonVideo } from "../js/data/activityLessonVideos.js";

test("birds and insects lesson cards name only species listed in their video descriptions", async () => {
  const birds = getActivityLessonVideo("birds", "explore");
  const insects = getActivityLessonVideo("insects", "explore");
  assert.equal(
    birds.summary,
    "تعلّم: الحمامة، الببغاء، الطاووس، الديك، الغراب، والنسر."
  );
  assert.equal(
    insects.summary,
    "تعلّم: الفراشة، النحلة، الدعسوقة، البعوضة، النملة، الخنفساء، العنكبوت، الذبابة، الجرادة، والصرصار."
  );
  const exploreSource = await readFile(new URL("../js/games/explore.js", import.meta.url), "utf8");
  assert.match(exploreSource, /if \(video\.summary\)/);
  assert.match(exploreSource, /summary\.textContent = video\.summary/);
});
