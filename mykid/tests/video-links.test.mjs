import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { getActivityLessonVideo } from "../js/data/activityLessonVideos.js";
import { ACTIVITIES } from "../js/data/activities.js";
import { getEnglishLetterLessonVideo } from "../js/data/englishLetterLessonVideos.js";
import { getNumberLessonVideo } from "../js/data/numberLessonVideos.js";

const EXPECTED_NUMBER_IDS = [
  "DQNbBA9UKyY",
  "A_Ovz5hLbeU",
  "qO96SvRAG5w",
  "Vf5BV38-9ak",
  "Bl4RESdgoio",
  "O-H6QBnNeLA",
  "JVTR94HSXRY",
  "-loCJzBjIZM",
  "DLe_1ElfsA4",
  "BtT55VMemPE",
  "MhPRkdfz-WQ",
];

const EXPECTED_LETTER_IDS = {
  A: "3_icknhN4_k",
  B: "zDp6dgfSz64",
  C: "gTZ4pvyDvQo",
  D: "PLYt_9mLZNo",
  E: "81Zhgz2xCQc",
  F: "g47ND6zgNko",
  G: "HWlE4ZUJCnE",
  H: "g6MlfKU2Y0I",
  I: "Me9ZgFfg_jI",
  J: "o3gr1O5MOBg",
  K: null,
  L: null,
  M: "PD9b7T0je_Q",
  N: "OuV6mk9d9tU",
  O: "7OUgqgHxoB0",
  P: "4u2h9ak6_zE",
  Q: "ofCsEBjU7jw",
  R: "5lbee4V0TTA",
  S: "ZyKoT5HsdDI",
  T: "BCTE_aDfOb0",
  U: "VBNX2KGnEGc",
  V: "SmPXiHbXhwU",
  W: "7XdgmLZEPwY",
  X: "wNeM7xZXqYM",
  Y: "rAwJrvmcY2o",
  Z: "u8VmrIe2PWc",
};

const EXPECTED_ACTIVITY_IDS = {
  "colors:explore": "gn81A7aJVic",
  "colors:coloring": "f7IErJrxwPA",
  "weekdays:explore": "DGxv3M2vog0",
  "family:explore": "flyN1BahTR0",
  "words:readMatch": "aTy_6f2NKsc",
};

const MYKID_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HARNESS_HTML = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><canvas id=\"fx\"></canvas></body></html>";
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

let server;
let browser;
let page;
let baseUrl;
const pageErrors = [];

function sendFile(requestPath, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    response.writeHead(400).end("Bad path");
    return;
  }

  const filePath = path.resolve(MYKID_ROOT, `.${decodedPath}`);
  if (!filePath.startsWith(`${MYKID_ROOT}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  const stream = createReadStream(filePath);
  stream.once("error", () => response.writeHead(404).end("Not found"));
  response.setHeader("Content-Type", MIME_TYPES[path.extname(filePath)] || "application/octet-stream");
  stream.pipe(response);
}

before(async () => {
  server = createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(HARNESS_HTML);
      return;
    }
    sendFile(pathname, response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (error) {
    throw new Error(
      `Could not launch Playwright Chromium. Install/configure Chromium before running npm run test:mykid:videos. ${error.message}`
    );
  }

  page = await browser.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.abort());
  await page.goto(baseUrl);
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

function assertUniqueValidVideoIds(entries) {
  const firstUse = new Map();
  for (const [lesson, videoId] of entries) {
    assert.match(videoId, /^[A-Za-z0-9_-]{11}$/, `${lesson} must use a valid YouTube video ID`);
    const priorLesson = firstUse.get(videoId);
    assert.equal(priorLesson, undefined, `Duplicate YouTube video ID ${videoId}: ${priorLesson} and ${lesson}`);
    firstUse.set(videoId, lesson);
  }
}

test("number, letter, and activity mappings match their intended lessons without duplicate links", () => {
  const mappedIds = [];

  assert.equal(EXPECTED_NUMBER_IDS.length, 11, "The expected number sequence must cover 0 through 10");
  EXPECTED_NUMBER_IDS.forEach((videoId, value) => {
    assert.equal(getNumberLessonVideo(value)?.videoId, videoId, `Wrong video mapped to number ${value}`);
    assert.equal(getNumberLessonVideo(String(value))?.videoId, videoId, `String number ${value} must resolve identically`);
    mappedIds.push([`number ${value}`, videoId]);
  });
  assert.equal(getNumberLessonVideo(-1), null, "Negative numbers must not inherit a video");
  assert.equal(getNumberLessonVideo(11), null, "Unmapped numbers must not inherit another lesson's video");

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  assert.equal(Object.keys(EXPECTED_LETTER_IDS).length, alphabet.length, "Expected entries must cover the full alphabet");
  for (const letter of alphabet) {
    const expectedVideoId = EXPECTED_LETTER_IDS[letter];
    assert.equal(
      getEnglishLetterLessonVideo(letter)?.videoId || null,
      expectedVideoId,
      `Wrong video mapped to English letter ${letter}`
    );
    assert.equal(
      getEnglishLetterLessonVideo(letter.toLowerCase())?.videoId || null,
      expectedVideoId,
      `Lowercase ${letter} must resolve to the same lesson video`
    );
    if (expectedVideoId) mappedIds.push([`letter ${letter}`, expectedVideoId]);
  }
  assert.equal(getEnglishLetterLessonVideo("K"), null, "Unverified K story must stay excluded");
  assert.equal(getEnglishLetterLessonVideo("L"), null, "Religious L video must stay excluded");
  assert.equal(getEnglishLetterLessonVideo("?"), null, "Unknown letters must not inherit a video");

  for (const [key, expectedVideoId] of Object.entries(EXPECTED_ACTIVITY_IDS)) {
    const [datasetKey, activityKey] = key.split(":");
    assert.equal(
      getActivityLessonVideo(datasetKey, activityKey)?.videoId,
      expectedVideoId,
      `Wrong video mapped to ${datasetKey}/${activityKey}`
    );
    mappedIds.push([`${datasetKey}/${activityKey}`, expectedVideoId]);
  }
  assert.equal(getActivityLessonVideo("colors", "readMatch"), null, "Color videos must not be assigned to reading");
  assert.equal(getActivityLessonVideo("weekdays", "coloring"), null, "Weekday videos must not be assigned to coloring");
  assert.equal(getActivityLessonVideo("words", "explore"), null, "Reading videos must not be assigned to explore");

  assertUniqueValidVideoIds(mappedIds);
});

test("Numbers City offers the English number lesson with zero and matching videos", () => {
  const activity = ACTIVITIES.numbers.find(
    (item) => item.params?.datasetKey === "englishNumbers"
  );
  assert.ok(activity, "Numbers City must include an English number teacher activity");
  assert.equal(activity.screen, "lesson");
  assert.equal(activity.params.includeZero, true, "The English lesson must start with zero");
});

async function renderLessonSequence(datasetKey, includeZero = false, length = 26) {
  return page.evaluate(async ({ datasetKey, includeZero, length }) => {
    const { renderLesson } = await import("/js/games/lesson.js");
    const screen = renderLesson({
      datasetKey,
      lang: datasetKey === "english" || datasetKey === "englishNumbers" ? "en-US" : "ar-EG",
      title: "Video link test",
      includeZero,
    });
    document.body.replaceChildren(screen);
    await new Promise((resolve) => setTimeout(resolve, 70));

    const parseId = (url) => url?.match(/\/(?:vi|embed)\/([^/?]+)/)?.[1] || null;
    const results = [];
    for (let index = 0; index < length; index += 1) {
      const videoSlot = screen.querySelector(".lesson-video");
      const card = videoSlot?.querySelector(".kid-youtube-card");
      const thumbnail = card?.querySelector(".kid-youtube-preview img");
      const preview = card?.querySelector(".kid-youtube-preview");
      const thumbnailId = parseId(thumbnail?.src);

      preview?.click();
      const iframe = card?.querySelector("iframe");
      results.push({
        glyph: screen.querySelector(".lesson-glyph")?.textContent || null,
        bubble: screen.querySelector(".teacher-bubble")?.textContent || "",
        cardCount: videoSlot?.querySelectorAll(".kid-youtube-card").length || 0,
        thumbnailId,
        iframeId: parseId(iframe?.src),
        iframeHost: iframe ? new URL(iframe.src).hostname : null,
      });

      if (index < length - 1) {
        const next = screen.querySelector("#lsNext");
        if (!next) throw new Error(`Missing next button at lesson index ${index}`);
        next.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    return results;
  }, { datasetKey, includeZero, length });
}

function assertLessonSequence(results, expectedGlyphs, expectedIds, label) {
  assert.deepEqual(
    results.map((result) => result.glyph),
    expectedGlyphs,
    `${label} lesson order changed`
  );
  assert.deepEqual(
    results.map((result) => result.thumbnailId),
    expectedIds,
    `${label} thumbnail is attached to the wrong lesson index`
  );
  assert.deepEqual(
    results.map((result) => result.iframeId),
    expectedIds,
    `${label} click must embed the exact video for the current lesson`
  );
  for (const result of results) {
    assert.equal(result.cardCount, result.thumbnailId ? 1 : 0, `${label} lesson must show at most one video`);
    if (result.iframeId) {
      assert.equal(result.iframeHost, "www.youtube-nocookie.com", `${label} must use the privacy-enhanced YouTube embed`);
    }
  }
}

test("Arabic and English number lessons plus English letters render matching videos", async () => {
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠"];
  const numberResults = await renderLessonSequence("numbers", true, 11);
  assertLessonSequence(
    numberResults,
    arabicDigits,
    EXPECTED_NUMBER_IDS,
    "Numbers 0–10"
  );

  const englishDigits = Array.from({ length: 11 }, (_, value) => String(value));
  const englishNumberResults = await renderLessonSequence("englishNumbers", true, 11);
  assertLessonSequence(
    englishNumberResults,
    englishDigits,
    EXPECTED_NUMBER_IDS,
    "English numbers 0–10"
  );
  assert.match(englishNumberResults[0].bubble, /This is number zero/i);
  assert.match(englishNumberResults[10].bubble, /This is number ten/i);

  const letters = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const expectedLetterIds = letters.map((letter) => EXPECTED_LETTER_IDS[letter]);
  const letterResults = await renderLessonSequence("english", false, letters.length);
  assertLessonSequence(letterResults, letters, expectedLetterIds, "English letters A–Z");
  assert.equal(letterResults[10].cardCount, 0, "K must not render a video card");
  assert.equal(letterResults[11].cardCount, 0, "L must not render a video card");

  assert.deepEqual(pageErrors, [], "Lesson rendering must not produce uncaught browser errors");
});

test("activity videos appear only in their mapped activity and embed the mapped link", async () => {
  const results = await page.evaluate(async () => {
    const [
      { renderExplore },
      { renderColoring },
      { renderReadMatch },
    ] = await Promise.all([
      import("/js/games/explore.js"),
      import("/js/games/coloring.js"),
      import("/js/games/readmatch.js"),
    ]);
    const cases = [
      ["colors", "explore", () => renderExplore({ datasetKey: "colors" })],
      ["weekdays", "explore", () => renderExplore({ datasetKey: "weekdays" })],
      ["family", "explore", () => renderExplore({ datasetKey: "family" })],
      ["colors", "coloring", () => renderColoring({})],
      ["words", "readMatch", () => renderReadMatch({ datasetKey: "words" })],
      ["numbers", "explore", () => renderExplore({ datasetKey: "numbers" })],
      ["animals", "readMatch", () => renderReadMatch({ datasetKey: "animals" })],
    ];
    const parseId = (url) => url?.match(/\/(?:vi|embed)\/([^/?]+)/)?.[1] || null;
    const output = [];

    for (const [datasetKey, activityKey, build] of cases) {
      const screen = build();
      document.body.replaceChildren(screen);
      await new Promise((resolve) => setTimeout(resolve, 70));
      const cards = [...screen.querySelectorAll(".kid-youtube-card")];
      const links = cards.map((card) => {
        const preview = card.querySelector(".kid-youtube-preview");
        const thumbnailId = parseId(card.querySelector("img")?.src);
        preview?.click();
        const iframe = card.querySelector("iframe");
        return {
          thumbnailId,
          iframeId: parseId(iframe?.src),
          iframeHost: iframe ? new URL(iframe.src).hostname : null,
        };
      });
      output.push({ datasetKey, activityKey, links });
    }
    return output;
  });

  for (const result of results) {
    const key = `${result.datasetKey}:${result.activityKey}`;
    const expectedId = EXPECTED_ACTIVITY_IDS[key] || null;
    assert.equal(
      result.links.length,
      expectedId ? 1 : 0,
      `${key} must show ${expectedId ? "exactly one matching video" : "no unrelated video"}`
    );
    if (expectedId) {
      assert.deepEqual(
        result.links[0],
        {
          thumbnailId: expectedId,
          iframeId: expectedId,
          iframeHost: "www.youtube-nocookie.com",
        },
        `${key} must embed its own mapped video`
      );
    }
  }

  assert.deepEqual(pageErrors, [], "Activity rendering must not produce uncaught browser errors");
});
