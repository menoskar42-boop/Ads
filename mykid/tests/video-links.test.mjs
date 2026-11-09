import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { getActivityLessonVideo, getActivityLessonVideos } from "../js/data/activityLessonVideos.js";
import { ACTIVITIES } from "../js/data/activities.js";
import { getEnglishLetterLessonVideo } from "../js/data/englishLetterLessonVideos.js";
import { getArabicLetterLessonVideo } from "../js/data/arabicLetterLessonVideos.js";
import { getArabicLetterWritingVideo } from "../js/data/arabicLetterWritingVideos.js";
import { getNumberLessonVideo } from "../js/data/numberLessonVideos.js";
import { getDataset } from "../js/data/datasets.js";

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

const EXPECTED_ARABIC_LETTER_IDS = {
  "أ": "wi0BH6LiyRo",
  "ب": "nKM1yo-7Abc",
  "ت": "SbCoTT0bO5Q",
  "ث": "DcvV-McdEG4",
  "ج": "_fKC8sYdWD4",
  "ح": "zW2myzQO0TY",
  "خ": "UQbJq8UIWfE",
  "د": "b9-ve3ZWjEQ",
  "ذ": "pYEacceQed0",
  "ر": "4kRZInbEcq8",
  "ز": "4CRgJzkB8TI",
  "س": "wiChkzkBzUM",
  "ش": "IzALBAQvHt4",
  "ص": "KRqhl-9FiUQ",
  "ض": "FS-Ea_Uq6RE",
  "ط": "bjsVDvmVVUA",
  "ظ": "98_YXH1RjLo",
  "ع": "4K6HJF-2wg8",
  "غ": "N6pKoax5oPQ",
  "ف": "acb0O7-tDyo",
  "ق": "Zun1i013opM",
  "ك": "jM4kcmNdtUI",
  "ل": "ss8uW1UFpHw",
  "م": "3tBOIkN3ZSo",
  "ن": "jO6xvndk8EE",
  "ه": "DNvXZBK00tg",
  "و": "1ag78ymrmSA",
  "ي": "ouYxNGf8frU",
};

const EXPECTED_ARABIC_WRITING_IDS = {
  "أ": "DKihnmvn-YQ",
  "ب": "NFVJSYyYhl8",
  "ت": "OJQgshvXNh8",
  "ث": "syxBBbxHE0k",
  "ج": "Q3Qz3RpIk0g",
  "ح": "htG2Cew-MN0",
  "خ": "X60zWHPRlCI",
  "د": "hKNiOzhJ1og",
  "ذ": "nyvX-frwX9A",
  "ر": "apYtS2arnvc",
  "ز": "W9DGGDfg_X0",
  "س": "UK0ZZBzuMZk",
  "ش": "vlfgr7SqSfI",
  "ص": "f5uwhk6COEA",
  "ض": "QwkicCNfFzM",
  "ط": "YapcfKJj3pg",
  "ظ": "CMWYbeBMRMw",
  "ع": "qq20RdN0XCs",
  "غ": "tsM3EYBYRRQ",
  "ف": "qtGfHwZ7TMc",
  "ق": "ZIqIKGA4fk0",
  "ك": "bkhrAmbUXYw",
  "ل": "6y7dOBLqS1s",
  "م": "xeF6Zvun84M",
  "ن": "aWMR8QkYCyU",
  "ه": "bAYqYO7wxX8",
  "و": "gUp0ORkrxbs",
  "ي": "uBuOkgOqO3w",
};

const EXPECTED_ACTIVITY_VIDEO_IDS = {
  "colors:explore": ["gn81A7aJVic", "YoOxfoJhQm4"],
  "colors:coloring": ["f7IErJrxwPA"],
  "animals:explore": ["bJ3EWyZQyl0", "Lud5hiIvcfw"],
  "fish:explore": ["1t2m7Keo6JU", "wb1DPUKCZcI"],
  "shapes:explore": ["ldTkRB6Xbp4"],
  "fruits:explore": ["NK25HK_0I48", "G7QpNappaz4"],
  "weekdays:explore": ["DGxv3M2vog0", "whG2Cmojejs"],
  "months:explore": ["am65jdDs2Pk"],
  "family:explore": ["flyN1BahTR0", "4ALfbwkNb3g"],
  "body:explore": ["MeUWxyS5hF8"],
  "senses:explore": ["5Axm4E5qZqI"],
  "transport:explore": ["jEROtSzDv6I"],
  "birds:explore": ["IhnVsNo84vU"],
  "insects:explore": ["T1O-k06fY_c"],
  "weather:explore": [],
  "seasons:explore": [],
  "jobs:explore": [],
  "words:explore": ["LqA91IiEZEE"],
  "words:readMatch": ["aTy_6f2NKsc"],
};

const EXPECTED_ACTIVITY_VIDEO_TITLES = {
  "weekdays:explore": [
    "مس إلهام · نطق أيام الأسبوع للمبتدئين",
    "أبجد هوز · أغنية أيام الأسبوع بالعربي",
  ],
  "months:explore": ["أبجد هوز · أغنية تعليمية: أشهر السنة"],
  "family:explore": [
    "مس إلهام · معرفة أفراد العائلة بالبطاقات",
    "أبجد هوز · نطق أفراد العيلة للأطفال",
  ],
  "words:explore": ["أبجد هوز · الكلمات الأولى للطفل بالعامية المصرية"],
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

  const arabicLetters = Object.keys(EXPECTED_ARABIC_LETTER_IDS);
  for (const letter of arabicLetters) {
    const expectedVideoId = EXPECTED_ARABIC_LETTER_IDS[letter];
    const expectedWritingVideoId = EXPECTED_ARABIC_WRITING_IDS[letter];
    assert.equal(getArabicLetterLessonVideo(letter)?.videoId, expectedVideoId, `Wrong video mapped to Arabic letter ${letter}`);
    assert.equal(getArabicLetterWritingVideo(letter)?.videoId, expectedWritingVideoId, `Wrong writing video mapped to Arabic letter ${letter}`);
    mappedIds.push([`Arabic letter ${letter}`, expectedVideoId]);
    mappedIds.push([`Arabic letter writing ${letter}`, expectedWritingVideoId]);
  }
  assert.equal(getArabicLetterLessonVideo("?"), null, "Unknown Arabic letters must not inherit a video");
  assert.equal(getArabicLetterWritingVideo("?"), null, "Unknown Arabic letters must not inherit a writing video");

  for (const [key, expectedVideoIds] of Object.entries(EXPECTED_ACTIVITY_VIDEO_IDS)) {
    const [datasetKey, activityKey] = key.split(":");
    const videos = getActivityLessonVideos(datasetKey, activityKey);
    assert.equal(
      getActivityLessonVideo(datasetKey, activityKey)?.videoId,
      expectedVideoIds[0],
      `Wrong primary video mapped to ${datasetKey}/${activityKey}`
    );
    assert.deepEqual(
      videos.map((video) => video.videoId),
      expectedVideoIds,
      `Wrong video list mapped to ${datasetKey}/${activityKey}`
    );
    if (EXPECTED_ACTIVITY_VIDEO_TITLES[key]) {
      assert.deepEqual(
        videos.map((video) => video.title),
        EXPECTED_ACTIVITY_VIDEO_TITLES[key],
        `Video titles and sources must match the verified content for ${datasetKey}/${activityKey}`
      );
    }
    expectedVideoIds.forEach((videoId, index) => mappedIds.push([`${datasetKey}/${activityKey} video ${index + 1}`, videoId]));
  }
  assert.equal(getActivityLessonVideo("colors", "readMatch"), null, "Color videos must not be assigned to reading");
  assert.equal(getActivityLessonVideo("weekdays", "coloring"), null, "Weekday videos must not be assigned to coloring");
  assert.equal(getActivityLessonVideo("animals", "explore")?.videoId, "bJ3EWyZQyl0");

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

test("trace-from-lesson keeps focus on every tested number and letter", async () => {
  const cases = [
    {
      datasetKey: "numbers",
      includeZero: true,
      items: [
        { value: 0, arDigit: "٠", arName: "صفر" },
        ...getDataset("numbers").items.slice(0, 10),
      ],
    },
    {
      datasetKey: "englishNumbers",
      includeZero: true,
      items: [
        { value: 0, char: "0", name: "zero" },
        ...getDataset("englishNumbers").items,
      ],
    },
    { datasetKey: "arabic", includeZero: false, items: getDataset("arabic").items },
    { datasetKey: "english", includeZero: false, items: getDataset("english").items },
  ];
  const expected = cases.flatMap(({ datasetKey, includeZero, items }) => {
    const noun = getDataset(datasetKey).glyphKind === "number" ? "الرقم" : "الحرف";
    return items.map((item) => ({
      datasetKey,
      includeZero,
      focus: item.char || item.arDigit || item.name,
      heading: `تتبّع ${noun}: ${item.name || item.arName || ""}`,
    }));
  });

  const actual = await page.evaluate(async (traceCases) => {
    const { renderTrace } = await import("/js/games/trace.js");
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const headings = [];
      for (const traceCase of traceCases) {
        const screen = renderTrace({
          datasetKey: traceCase.datasetKey,
          focus: traceCase.focus,
          includeZero: traceCase.includeZero,
          returnLesson: true,
        });
        document.body.replaceChildren(screen);
        await new Promise((resolve) => setTimeout(resolve, 0));
        headings.push(screen.querySelector(".stage p")?.textContent || null);
      }
      return headings;
    } finally {
      Math.random = originalRandom;
    }
  }, expected);

  assert.deepEqual(actual, expected.map((traceCase) => traceCase.heading));
});

test("lesson picker jumps directly to every number and letter", async () => {
  const pickerCases = [
    {
      datasetKey: "numbers",
      includeZero: true,
      items: [{ value: 0, arDigit: "٠", arName: "صفر" }, ...getDataset("numbers").items],
      videoIds: [...EXPECTED_NUMBER_IDS, ...Array(10).fill(null)],
    },
    {
      datasetKey: "englishNumbers",
      includeZero: true,
      items: [{ value: 0, char: "0", name: "zero" }, ...getDataset("englishNumbers").items],
      videoIds: EXPECTED_NUMBER_IDS,
    },
    {
      datasetKey: "arabic",
      includeZero: false,
      items: getDataset("arabic").items,
      videoIds: Object.keys(EXPECTED_ARABIC_LETTER_IDS).map((letter) => [
        EXPECTED_ARABIC_LETTER_IDS[letter],
        EXPECTED_ARABIC_WRITING_IDS[letter],
      ]),
    },
    {
      datasetKey: "english",
      includeZero: false,
      items: getDataset("english").items,
      videoIds: Object.values(EXPECTED_LETTER_IDS),
    },
  ];
  const actual = await page.evaluate(async (cases) => {
    const { renderLesson } = await import("/js/games/lesson.js");
    const parseId = (url) => url?.match(/\/(?:vi|embed)\/([^/?]+)/)?.[1] || null;
    const results = [];
    for (const item of cases) {
      const screen = renderLesson({
        datasetKey: item.datasetKey,
        includeZero: item.includeZero,
        title: "Direct selection test",
      });
      document.body.replaceChildren(screen);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const buttons = [...screen.querySelectorAll(".lesson-item-picker-button")];
      const selections = [];
      for (const button of buttons) {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        selections.push({
          glyph: screen.querySelector(".lesson-glyph")?.textContent || null,
          activeGlyph: screen.querySelector(".lesson-item-picker-button.is-active")?.textContent || null,
          pressedCount: [...screen.querySelectorAll(".lesson-item-picker-button[aria-pressed='true']")].length,
          videoIds: [...screen.querySelectorAll(".lesson-video img")].map((img) => parseId(img.src)),
        });
      }
      results.push({ datasetKey: item.datasetKey, buttonCount: buttons.length, selections });
    }
    return results;
  }, pickerCases.map((item) => ({
    datasetKey: item.datasetKey,
    includeZero: item.includeZero,
  })));

  for (let caseIndex = 0; caseIndex < pickerCases.length; caseIndex += 1) {
    const expectedCase = pickerCases[caseIndex];
    const actualCase = actual[caseIndex];
    // الإنجليزى بيظهر كابيتال وصغير «Aa» (المالك ٢٠٢٦-١٠-١٠)
    const expectedGlyphs = expectedCase.items.map((item) => (item.lower ? item.char + item.lower : item.char || item.arDigit || item.name));
    assert.equal(actualCase.datasetKey, expectedCase.datasetKey);
    assert.equal(actualCase.buttonCount, expectedGlyphs.length, `${expectedCase.datasetKey} picker must include every item`);
    assert.deepEqual(actualCase.selections.map((item) => item.glyph), expectedGlyphs, `${expectedCase.datasetKey} must jump to the selected item`);
    assert.deepEqual(actualCase.selections.map((item) => item.activeGlyph), expectedGlyphs, `${expectedCase.datasetKey} must highlight the selected item`);
    assert.ok(actualCase.selections.every((item) => item.pressedCount === 1), `${expectedCase.datasetKey} must have exactly one selected button`);
    if (expectedCase.videoIds.length) {
      const expectedVideoIds = expectedCase.videoIds.map((ids) => Array.isArray(ids) ? ids : (ids ? [ids] : []));
      assert.deepEqual(actualCase.selections.map((item) => item.videoIds), expectedVideoIds, `${expectedCase.datasetKey} must update its videos with the selected item`);
    }
  }
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
      const cards = [...(videoSlot?.querySelectorAll(".kid-youtube-card") || [])];
      const thumbnailIds = cards.map((card) => parseId(card.querySelector(".kid-youtube-preview img")?.src));
      cards.forEach((card) => card.querySelector(".kid-youtube-preview")?.click());
      const iframeIds = cards.map((card) => parseId(card.querySelector("iframe")?.src));
      const iframeHosts = cards.map((card) => {
        const src = card.querySelector("iframe")?.src;
        return src ? new URL(src).hostname : null;
      });
      results.push({
        glyph: screen.querySelector(".lesson-glyph")?.textContent || null,
        bubble: screen.querySelector(".teacher-bubble")?.textContent || "",
        cardCount: cards.length,
        thumbnailIds,
        iframeIds,
        iframeHosts,
        videoTitles: cards.map((card) => card.querySelector(".kid-youtube-title")?.textContent || ""),
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
    results.map((result) => result.thumbnailIds),
    expectedIds.map((ids) => Array.isArray(ids) ? ids : (ids ? [ids] : [])),
    `${label} thumbnail is attached to the wrong lesson index`
  );
  assert.deepEqual(
    results.map((result) => result.iframeIds),
    expectedIds.map((ids) => Array.isArray(ids) ? ids : (ids ? [ids] : [])),
    `${label} click must embed the exact video for the current lesson`
  );
  for (const result of results) {
    const expectedCount = result.thumbnailIds.length;
    assert.equal(result.cardCount, expectedCount, `${label} lesson must show the expected number of videos`);
    assert.ok(result.iframeIds.every((id) => !!id), `${label} click must embed every mapped video`);
    assert.ok(result.iframeHosts.every((host) => host === "www.youtube-nocookie.com"), `${label} must use privacy-enhanced YouTube embeds`);
  }
}

test("Arabic letters and Arabic/English number lessons plus English letters render matching videos", async () => {
  const arabicLetters = Object.keys(EXPECTED_ARABIC_LETTER_IDS);
  const arabicLetterResults = await renderLessonSequence("arabic", false, arabicLetters.length);
  assertLessonSequence(
    arabicLetterResults,
    arabicLetters,
    arabicLetters.map((letter) => [
      EXPECTED_ARABIC_LETTER_IDS[letter],
      EXPECTED_ARABIC_WRITING_IDS[letter],
    ]),
    "Arabic letters"
  );
  assert.ok(
    arabicLetterResults.every((result) => result.videoTitles[0]?.startsWith("أبجد هوز · ")),
    "The first Arabic video must be labeled as Abgad Hawaz"
  );
  assert.ok(
    arabicLetterResults.every((result) => result.videoTitles[1]?.startsWith("مدرسة زاد الحروف · ")),
    "The second Arabic video must be labeled as the writing channel"
  );

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
  assertLessonSequence(letterResults, letters.map((l) => l + l.toLowerCase()), expectedLetterIds, "English letters Aa–Zz");
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
      ["animals", "explore", () => renderExplore({ datasetKey: "animals" })],
      ["fish", "explore", () => renderExplore({ datasetKey: "fish" })],
      ["shapes", "explore", () => renderExplore({ datasetKey: "shapes" })],
      ["fruits", "explore", () => renderExplore({ datasetKey: "fruits" })],
      ["body", "explore", () => renderExplore({ datasetKey: "body" })],
      ["senses", "explore", () => renderExplore({ datasetKey: "senses" })],
      ["transport", "explore", () => renderExplore({ datasetKey: "transport" })],
      ["birds", "explore", () => renderExplore({ datasetKey: "birds" })],
      ["insects", "explore", () => renderExplore({ datasetKey: "insects" })],
      ["weather", "explore", () => renderExplore({ datasetKey: "weather" })],
      ["seasons", "explore", () => renderExplore({ datasetKey: "seasons" })],
      ["jobs", "explore", () => renderExplore({ datasetKey: "jobs", sound: true })],
      ["weekdays", "explore", () => renderExplore({ datasetKey: "weekdays" })],
      ["months", "explore", () => renderExplore({ datasetKey: "months" })],
      ["family", "explore", () => renderExplore({ datasetKey: "family" })],
      ["words", "explore", () => renderExplore({ datasetKey: "words" })],
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
      const videoList = screen.querySelector(".explore-video-list");
      const grid = screen.querySelector(".regions-grid");
      output.push({
        datasetKey,
        activityKey,
        links,
        videosBeforeGrid: !!videoList && !!grid && videoList.parentElement === grid.parentElement &&
          [...videoList.parentElement.children].indexOf(videoList) < [...grid.parentElement.children].indexOf(grid),
      });
    }
    return output;
  });

  for (const result of results) {
    const key = `${result.datasetKey}:${result.activityKey}`;
    const expectedIds = EXPECTED_ACTIVITY_VIDEO_IDS[key] || [];
    assert.equal(
      result.links.length,
      expectedIds.length,
      `${key} must show exactly its mapped videos`
    );
    assert.deepEqual(
      result.links,
      expectedIds.map((videoId) => ({
        thumbnailId: videoId,
        iframeId: videoId,
        iframeHost: "www.youtube-nocookie.com",
      })),
      `${key} must embed only its mapped videos`
    );
    if (result.activityKey === "explore" && expectedIds.length) {
      assert.equal(result.videosBeforeGrid, true, `${key} videos must appear before the long content grid`);
    }
  }

  assert.deepEqual(pageErrors, [], "Activity rendering must not produce uncaught browser errors");
});
