// ===== نقطة بداية التطبيق =====
import { Router } from "./core/router.js";
import { Sfx, setOnWrong, setOnCorrect } from "./core/audio.js";
import { Speech, setAISpeech } from "./core/speech.js";
import { MIZO_OOPS, pick } from "./data/mizo.js";
import { checkAI, setAIEnabled } from "./core/ai.js";
import { mountAssistantButton, reactAssistant } from "./core/assistant.js";
import { REGIONS } from "./data/regions.js";
import { Store } from "./core/storage.js";
import { renderHome } from "./screens/home.js";
import { renderRegion } from "./screens/region.js";
import { renderRewards } from "./screens/rewards.js";
import { renderLearn } from "./games/learn.js";
import { renderFlashcards } from "./games/flashcards.js";
import { renderSequence } from "./games/sequence.js";
import { renderReview } from "./games/review.js";
import { renderCatch } from "./games/catch.js";
import { renderTrace } from "./games/trace.js";
import { renderCountLearn, renderFeed, renderCollect, renderBigNumbers, renderCountPick, renderAddition, renderSubtraction, renderCompare } from "./games/count.js";
import { renderHarakat } from "./games/harakat.js";
import { renderHarakatIntro } from "./games/harakatIntro.js";
import { renderLetterForms } from "./games/letterforms.js";
import { renderBoard } from "./games/board.js";
import { renderExplore } from "./games/explore.js";
import { renderShadowMatch, renderSoundMatch, renderFindIt } from "./games/match.js";
import { renderOppositesMatch } from "./games/opposites.js";
import { renderMemory } from "./games/memory.js";
import { renderColoring } from "./games/coloring.js";
import { renderPattern } from "./games/pattern.js";
import { renderSpotDiff } from "./games/spotdiff.js";
import { renderSeriation } from "./games/seriation.js";
import { renderMaze } from "./games/maze.js";
import { renderDotToDot } from "./games/dotdot.js";
import { renderEmotions } from "./games/emotions.js";
import { renderGenderPick } from "./games/grammarGender.js";
import { renderNumberPick } from "./games/grammarNumber.js";
import { renderAskWord } from "./games/grammarAsk.js";
import { renderFindWord } from "./games/grammarFindWord.js";
import { renderPronoun } from "./games/grammarPronoun.js";
import { renderRelative } from "./games/grammarRelative.js";
import { renderStyle } from "./games/grammarStyle.js";
import { renderSubject } from "./games/grammarSubject.js";
import { renderArticle } from "./games/grammarArticle.js";
import { renderPuzzle } from "./games/puzzle.js";
import { renderSort } from "./games/sort.js";
import { renderPhonics } from "./games/phonics.js";
import { renderLesson } from "./games/lesson.js";
import { renderGarden } from "./screens/garden.js";
import { renderParent } from "./screens/parent.js";
import { renderAR } from "./screens/ar.js";
import { renderVideos } from "./screens/videos.js";
import { renderStory } from "./screens/story.js";
import { renderProfile } from "./screens/profile.js";
import { renderDailyPlan } from "./screens/dailyPlan.js";
import { renderMizoSong } from "./screens/mizoSong.js";
import { renderShareCard } from "./screens/shareCard.js";
import { renderRuleLesson } from "./games/ruleLesson.js";
import { renderClassify } from "./games/classify.js";
import { renderWordBuild } from "./games/wordbuild.js";
import { renderSimilar } from "./games/similar.js";
import { renderTalkMizo } from "./games/talkMizo.js";
import { renderManners } from "./games/manners.js";
import { renderChatMizo } from "./games/chatMizo.js";
import { renderReadMatch } from "./games/readmatch.js";
import { renderFunHub } from "./screens/funHub.js";
import { renderSpinWheel } from "./screens/spinwheel.js";
import { renderBadges } from "./screens/badges.js";
import { renderChallenge } from "./games/challenge.js";
import { createCharacter } from "./games/character.js";

// تسجيل الشاشات
Router.register("home", renderHome);
Router.register("region", renderRegion);
Router.register("rewards", renderRewards);
Router.register("learn", renderLearn);
Router.register("flashcards", renderFlashcards);
Router.register("sequence", renderSequence);
Router.register("review", renderReview);
Router.register("catch", renderCatch);
Router.register("trace", renderTrace);
Router.register("countLearn", renderCountLearn);
Router.register("feed", renderFeed);
Router.register("collect", renderCollect);
Router.register("bigNumbers", renderBigNumbers);
Router.register("countPick", renderCountPick);
Router.register("addition", renderAddition);
Router.register("subtraction", renderSubtraction);
Router.register("compare", renderCompare);
Router.register("harakat", renderHarakat);
Router.register("harakatIntro", renderHarakatIntro);
Router.register("letterForms", renderLetterForms);
Router.register("board", renderBoard);
Router.register("explore", renderExplore);
Router.register("shadowMatch", renderShadowMatch);
Router.register("soundMatch", renderSoundMatch);
Router.register("findIt", renderFindIt);
Router.register("oppositesMatch", renderOppositesMatch);
Router.register("memory", renderMemory);
Router.register("coloring", renderColoring);
Router.register("pattern", renderPattern);
Router.register("spotDiff", renderSpotDiff);
Router.register("seriation", renderSeriation);
Router.register("maze", renderMaze);
Router.register("dotToDot", renderDotToDot);
Router.register("emotions", renderEmotions);
Router.register("genderPick", renderGenderPick);
Router.register("numberPick", renderNumberPick);
Router.register("askWord", renderAskWord);
Router.register("findWord", renderFindWord);
Router.register("pronoun", renderPronoun);
Router.register("relative", renderRelative);
Router.register("style", renderStyle);
Router.register("subject", renderSubject);
Router.register("article", renderArticle);
Router.register("puzzle", renderPuzzle);
Router.register("sort", renderSort);
Router.register("phonics", renderPhonics);
Router.register("lesson", renderLesson);
Router.register("garden", renderGarden);
Router.register("parent", renderParent);
Router.register("ar", renderAR);
Router.register("videos", renderVideos);

// تشجيع ميزو بالعامية عند أي خطأ في أي مغامرة (متنوّع وغير متكرّر، بلا إحباط)
let _lastOops = 0, _lastOopsLine = "";
setOnWrong(() => {
  const now = Date.now();
  if (now - _lastOops < 3000) return; // لا نُكثر الكلام لو غلط بسرعة
  _lastOops = now;
  let line = pick(MIZO_OOPS);
  if (line === _lastOopsLine) line = pick(MIZO_OOPS); // نوّع قدر الإمكان
  _lastOopsLine = line;
  reactAssistant("sad", 1200);
  Speech.mizo(line);
});

// ميزو يعمل علامة 👍 (إعجاب) عند أي إجابة صحيحة
setOnCorrect(() => reactAssistant("proud", 1200));
Router.register("story", renderStory);
Router.register("profile", renderProfile);
Router.register("dailyPlan", renderDailyPlan);
Router.register("mizoSong", renderMizoSong);
Router.register("shareCard", renderShareCard);
Router.register("ruleLesson", renderRuleLesson);
Router.register("classify", renderClassify);
Router.register("wordBuild", renderWordBuild);
Router.register("similar", renderSimilar);
Router.register("talkMizo", renderTalkMizo);
Router.register("manners", renderManners);
Router.register("chatMizo", renderChatMizo);
Router.register("readMatch", renderReadMatch);
Router.register("funHub", renderFunHub);
Router.register("spinWheel", renderSpinWheel);
Router.register("badges", renderBadges);
Router.register("challenge", renderChallenge);

// شاشة البداية
const splash = document.getElementById("splash");
const appEl = document.getElementById("app");
const startBtn = document.getElementById("startBtn");

// ميزو يرحّب في شاشة البداية (يلوّح) — بلا صوت قبل تفاعل المستخدم
const splashMizoSlot = document.getElementById("splashMizo");
if (splashMizoSlot) {
  const splashMizo = createCharacter();
  splashMizoSlot.appendChild(splashMizo.el);
  splashMizo.setMood("wave", 3000);
}

function startApp() {
  // فتح السياق الصوتي وتهيئة النطق بعد تفاعل المستخدم
  Sfx.unlock();

  // تحديث السلسلة اليومية (Streak) + ذاكرة صداقة ميزو
  Store.touchDaily();
  Store.touchFriendship();

  // تذكير وقت الشاشة (إن فعّله ولي الأمر): رسالة لطيفة بعد المدّة المحدّدة
  const stMin = Store.screenTimeMin;
  if (stMin > 0) {
    setTimeout(() => showScreenTimeReminder(), stMin * 60 * 1000);
  }

  // احترام إعداد ولي الأمر لتعطيل الميكروفون/الذكاء الاصطناعي
  setAIEnabled(Store.aiEnabled);

  // فحص توفّر خادم OpenAI: إن توفّر (ولم يُعطّله ولي الأمر) نستخدم نطق الـ AI، وإلا Web Speech
  checkAI().then((ready) => {
    const on = ready && Store.aiEnabled;
    setAISpeech(on);
    if (!on) Speech.say(" ", { lang: "ar-EG" }); // تنشيط Web Speech الصامت
    else mountAssistantButton(); // المساعد الصوتي يحتاج خادم OpenAI
  });

  splash.classList.add("hidden");
  appEl.classList.remove("hidden");

  // نبضة كل دقيقة لاحتساب وقت الاستخدام (للوحة ولي الأمر) — فقط والصفحة ظاهرة
  setInterval(() => { if (!document.hidden) Store.addUsageMinutes(1); }, 60000);

  // رابط عميق: ?region=arabic يفتح المنطقة مباشرة (قادم من صفحات SEO)
  const wanted = new URLSearchParams(location.search).get("region");
  const idx = wanted ? REGIONS.findIndex((r) => r.id === wanted) : -1;
  if (idx >= 0) Router.go("region", { id: REGIONS[idx].id, index: idx });
  else Router.go("home");
}

startBtn.addEventListener("click", startApp);

// رسالة تذكير لطيفة بانتهاء وقت اللعب (ليست قفلاً صارماً — تطبيق ويب)
function showScreenTimeReminder() {
  Speech.stop();
  const overlay = document.createElement("div");
  overlay.className = "cheer";
  overlay.innerHTML = `
    <div class="cheer-card">
      <img src="/assets/mizo/mizo-sleep.png" alt="ميزو" width="200" height="auto"
        style="max-width:60%;height:auto;margin:0 auto 4px" />
      <div class="cheer-text">حان وقت الراحة! 🌙</div>
      <p style="font-size:18px;font-weight:700;color:var(--c-ink);margin:.2em 0 1em">
        أحسنت اليوم يا بطل 🌟<br>لنأخذ استراحة قصيرة.</p>
      <button class="candy-btn" id="stOk">حسناً 👍</button>
    </div>`;
  document.body.appendChild(overlay);
  Speech.ar("حان وقت الراحة، أحسنت اليوم يا بطل");
  overlay.querySelector("#stOk").addEventListener("click", () => overlay.remove());
}

// تسجيل Service Worker للعمل دون اتصال + تحديث تلقائي عند توفّر نسخة جديدة
if ("serviceWorker" in navigator) {
  // إن كان هناك Service Worker مُتحكّم بالفعل، فأي تغيّر للمتحكّم = نسخة جديدة → نُعيد التحميل مرّة
  let reloaded = false;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // افحص وجود تحديث دورياً وطبّقه فوراً
      if (reg.update) setInterval(() => reg.update().catch(() => {}), 60000);
    }).catch(() => {});
  });
}
