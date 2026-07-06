// ===== ألعاب الأرقام والعدّ =====
import { NUMBERS, NUMBERS_10, COUNT_EMOJIS } from "../data/numbers.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, progressDots, shuffle, showCheer, finishActivity, diffCount } from "./common.js";
import { Store } from "../core/storage.js";

const rand = (arr) => arr[(Math.random() * arr.length) | 0];
// تدرّج الصعوبة حسب عمر الطفل: ٣–٤ سنوات أعداد أصغر
const isSmall = () => Store.ageBand === "small";

function speakBoth(num) {
  Speech.sequence([
    { text: num.arName, lang: "ar-EG" },
    { text: num.enName, lang: "en-US" },
  ]);
}

function baseScreen(title, regionId, regionIndex) {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe29a,#ffb86c)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title, back));
  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);
  return { screen, stage, back };
}

// ===== لعبة ١: تعرّف على الأرقام والعدّ =====
export function renderCountLearn({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("🔢 تعرّف على الأرقام", regionId, regionIndex);
  let i = 0;

  function render() {
    const num = NUMBERS_10[i];
    const emoji = rand(COUNT_EMOJIS);
    stage.innerHTML = "";
    stage.appendChild(progressDots(NUMBERS_10.length, i - 1));

    const glyph = document.createElement("div");
    glyph.className = "hero-glyph";
    glyph.innerHTML = `${num.arDigit} <span style="font-size:.6em;opacity:.85">(${num.value})</span>`;
    glyph.style.cursor = "pointer";
    glyph.addEventListener("click", () => { Sfx.pop(); speakBoth(num); });
    stage.appendChild(glyph);

    const hint = document.createElement("p");
    hint.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(16px,4.5vw,22px)";
    hint.textContent = `المسهم وعُدّهم! (${num.value})`;
    stage.appendChild(hint);

    const row = document.createElement("div");
    row.className = "choice-row";
    let counted = 0;
    for (let k = 0; k < num.value; k++) {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = emoji;
      b.addEventListener("click", () => {
        if (b.disabled) return;
        b.disabled = true;
        b.style.opacity = ".4";
        counted++;
        Sfx.pop();
        Speech.ar(String(counted));
        if (counted === num.value) {
          Sfx.correct();
          awardStars(1);
          setTimeout(() => { speakBoth(num); setTimeout(next, 1100); }, 500);
        }
      });
      row.appendChild(b);
    }
    stage.appendChild(row);
    speakBoth(num);
  }

  function next() {
    i++;
    if (i >= NUMBERS_10.length) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}

// ===== لعبة: تعرّف على الأرقام الكبيرة ١١–٢٠ (استمع ثم اختر الرقم) =====
export function renderBigNumbers({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("🔢 الأرقام حتى ٢٠", regionId, regionIndex);
  // نركّز على ١١–٢٠ مع مراجعة بعض الأصغر
  const pool = NUMBERS.slice(10); // 11..20
  const rounds = shuffle(pool);
  let r = 0;

  function render() {
    const target = rounds[r];
    stage.innerHTML = "";
    stage.appendChild(progressDots(rounds.length, r - 1));

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(18px,5vw,24px)";
    ask.textContent = "أين هذا الرقم؟ 🔊";
    stage.appendChild(ask);

    const listen = document.createElement("button");
    listen.className = "candy-btn";
    listen.style.fontSize = "clamp(20px,6vw,28px)";
    listen.textContent = "🔊 استمع";
    listen.addEventListener("click", () => { Sfx.tap(); speakBoth(target); });
    stage.appendChild(listen);

    // خيارات: الرقم الصحيح + جاران مشتّتان
    const others = shuffle(pool.filter((n) => n.value !== target.value)).slice(0, diffCount(1, 2));
    const choices = shuffle([target, ...others]);

    const row = document.createElement("div");
    row.className = "choice-row";
    choices.forEach((n) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.style.fontWeight = "800";
      b.textContent = n.arDigit;
      b.addEventListener("click", () => {
        if (n.value === target.value) {
          Sfx.correct();
          b.classList.add("correct");
          awardStars(1);
          speakBoth(target);
          r++;
          if (r >= rounds.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 8, onDone: back }), 900);
          else setTimeout(render, 1000);
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);

    setTimeout(() => speakBoth(target), 300);
  }

  setTimeout(render, 0);
  return screen;
}

// ===== لعبة ٢: أطعم الحيوان عدداً معيّناً =====
export function renderFeed({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("🍌 أطعم الصديق", regionId, regionIndex);
  const animals = ["🐵", "🐰", "🐶", "🐱", "🐼", "🦁"];
  const foods = ["🍌", "🍎", "🥕", "🍪", "🐟"];
  const ROUNDS = 5;
  let round = 0;

  function render() {
    const target = 1 + ((Math.random() * 6) | 0); // 1..6
    const animal = rand(animals);
    const food = rand(foods);
    let delivered = 0;
    stage.innerHTML = "";

    const head = document.createElement("div");
    head.innerHTML = `<div style="font-size:clamp(70px,20vw,120px)">${animal}</div>`;
    stage.appendChild(head);

    const bubble = document.createElement("p");
    bubble.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,24px)";
    bubble.textContent = `أطعمني ${target} من ${food}`;
    stage.appendChild(bubble);
    Speech.ar(`أطعمني ${target}`);

    const tray = document.createElement("div");
    tray.className = "choice-row";
    const count = target + 2;
    for (let k = 0; k < count; k++) {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = food;
      b.addEventListener("click", () => {
        if (b.disabled || delivered >= target) return;
        b.disabled = true;
        b.style.transform = "scale(0)";
        delivered++;
        Sfx.pop();
        Speech.ar(String(delivered));
        if (delivered === target) {
          Sfx.correct();
          awardStars(1);
          head.querySelector("div").textContent = "😋";
          setTimeout(nextRound, 1100);
        }
      });
      tray.appendChild(b);
    }
    stage.appendChild(tray);
  }

  function nextRound() {
    round++;
    if (round >= ROUNDS) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}

// ===== لعبة ٣: اجمع الكنوز (نجوم) =====
export function renderCollect({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("⭐ اجمع الكنوز", regionId, regionIndex);
  const goals = shuffle([5, 7, 10]);
  let round = 0;

  function render() {
    const target = goals[round];
    let collected = 0;
    stage.innerHTML = "";

    const head = document.createElement("p");
    head.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,26px)";
    head.textContent = `اجمع ${target} نجوم ⭐`;
    stage.appendChild(head);
    Speech.ar(`اجمع ${target} نجوم`);

    const counter = document.createElement("div");
    counter.style.cssText = "font-size:clamp(30px,9vw,48px);font-weight:800;color:#fff";
    counter.textContent = `0 / ${target}`;
    stage.appendChild(counter);

    const field = document.createElement("div");
    field.style.cssText =
      "position:relative;width:min(90vw,460px);height:46vh;margin:12px auto;background:rgba(255,255,255,.18);border-radius:24px;overflow:hidden";
    stage.appendChild(field);

    setTimeout(() => {
      const W = field.clientWidth, H = field.clientHeight;
      for (let k = 0; k < target; k++) {
        const s = document.createElement("button");
        s.className = "choice";
        s.textContent = "⭐";
        s.style.cssText =
          `position:absolute;background:transparent;box-shadow:none;` +
          `left:${10 + Math.random() * (W - 80)}px;top:${10 + Math.random() * (H - 80)}px`;
        s.addEventListener("click", () => {
          if (s.disabled) return;
          s.disabled = true;
          s.style.transform = "scale(0)";
          collected++;
          Sfx.star();
          counter.textContent = `${collected} / ${target}`;
          Speech.ar(String(collected));
          if (collected === target) {
            Sfx.correct();
            awardStars(2);
            setTimeout(nextRound, 1000);
          }
        });
        field.appendChild(s);
      }
    }, 30);
  }

  function nextRound() {
    round++;
    if (round >= goals.length) {
      showCheer("💎", "جمعت كل الكنوز!", () =>
        finishActivity({ regionId, regionIndex, stars: 8, onDone: back })
      );
    } else render();
  }

  setTimeout(render, 0);
  return screen;
}

// ===== لعبة ٥: الجمع البسيط =====
// مجموعتان من العناصر، يجمعها الطفل ويختار المجموع الصحيح من ثلاثة.
export function renderAddition({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("➕ الجمع البسيط", regionId, regionIndex);
  const ROUNDS = 6;
  let round = 0;

  function render() {
    const top = isSmall() ? 3 : 4;
    const a = 1 + ((Math.random() * top) | 0);
    const b = 1 + ((Math.random() * top) | 0);
    const sum = a + b;
    const emoji = rand(COUNT_EMOJIS);
    stage.innerHTML = "";

    const group = (n) => {
      const g = document.createElement("div");
      g.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:40vw;font-size:clamp(26px,7vw,40px)";
      for (let k = 0; k < n; k++) { const s = document.createElement("span"); s.textContent = emoji; g.appendChild(s); }
      return g;
    };

    const eq = document.createElement("div");
    eq.style.cssText = "display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:14px auto";
    const plus = document.createElement("span");
    plus.textContent = "➕";
    plus.style.cssText = "font-size:clamp(26px,7vw,40px)";
    eq.append(group(a), plus, group(b));
    stage.appendChild(eq);

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,26px);margin:6px 0";
    ask.textContent = `${a} ➕ ${b} = ؟`;
    stage.appendChild(ask);
    Speech.ar(`كم يساوي ${a} زائد ${b}؟`);

    const opts = new Set([sum]);
    while (opts.size < 3) {
      const d = sum + (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 2) | 0));
      if (d >= 1 && d <= 10) opts.add(d);
    }
    const row = document.createElement("div");
    row.className = "choice-row";
    shuffle([...opts]).forEach((val) => {
      const num = NUMBERS_10[val - 1];
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.style.fontWeight = "800";
      btn.textContent = num.arDigit;
      btn.addEventListener("click", () => {
        if (val === sum) {
          btn.classList.add("correct");
          Sfx.correct();
          speakBoth(num);
          awardStars(1);
          setTimeout(nextRound, 1100);
        } else {
          btn.classList.add("wrong");
          Sfx.wrong();
          setTimeout(() => btn.classList.remove("wrong"), 500);
        }
      });
      row.appendChild(btn);
    });
    stage.appendChild(row);
  }

  function nextRound() {
    round++;
    if (round >= ROUNDS) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}

// ===== لعبة ٧: أيهما أكثر؟ (المقارنة) =====
// مجموعتان بأعداد مختلفة، يضغط الطفل على الأكثر — يبني الحسّ العددي.
export function renderCompare({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("⚖️ أيهما أكثر؟", regionId, regionIndex);
  const ROUNDS = 6;
  let round = 0;

  function render() {
    const cap = isSmall() ? 5 : 9;
    let a = 1 + ((Math.random() * cap) | 0);
    let b = 1 + ((Math.random() * cap) | 0);
    while (b === a) b = 1 + ((Math.random() * cap) | 0);
    const emoji = rand(COUNT_EMOJIS);
    stage.innerHTML = "";

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,26px);margin:6px 0";
    ask.textContent = "اضغط على المجموعة الأكثر 👆";
    stage.appendChild(ask);
    Speech.mizo("فين العدد الأكبر يا بطل؟");

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:14px;justify-content:center;align-items:stretch;flex-wrap:wrap;margin:10px auto";

    const makeGroup = (n) => {
      const g = document.createElement("button");
      g.className = "compare-box";
      g.innerHTML = `<div class="compare-items">${(emoji + " ").repeat(n)}</div>`;
      g.addEventListener("click", () => {
        const isMore = n === Math.max(a, b);
        if (isMore) {
          g.classList.add("correct");
          Sfx.correct();
          Speech.ar(`نعم، ${n} أكثر`);
          awardStars(1);
          setTimeout(nextRound, 1100);
        } else {
          g.classList.add("wrong");
          Sfx.wrong();
          setTimeout(() => g.classList.remove("wrong"), 500);
        }
      });
      return g;
    };

    wrap.append(makeGroup(a), makeGroup(b));
    stage.appendChild(wrap);
  }

  function nextRound() {
    round++;
    if (round >= ROUNDS) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}

// ===== لعبة ٦: الطرح البسيط =====
// تبدأ بعناصر، يُشطب بعضها، يختار الطفل كم بقي.
export function renderSubtraction({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("➖ الطرح البسيط", regionId, regionIndex);
  const ROUNDS = 6;
  let round = 0;

  function render() {
    const a = (isSmall() ? 2 : 3) + ((Math.random() * (isSmall() ? 4 : 6)) | 0);
    const b = 1 + ((Math.random() * (a - 1)) | 0); // 1..a-1
    const rest = a - b;
    const emoji = rand(COUNT_EMOJIS);
    stage.innerHTML = "";

    const items = document.createElement("div");
    items.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:min(90vw,420px);margin:10px auto;font-size:clamp(30px,8vw,46px)";
    for (let k = 0; k < a; k++) {
      const s = document.createElement("span");
      s.textContent = emoji;
      s.style.transition = "opacity .3s ease, filter .3s ease";
      if (k >= rest) {
        // العناصر المطروحة تُشطب بعد لحظة
        setTimeout(() => { s.style.opacity = ".25"; s.style.filter = "grayscale(1)"; s.textContent = "❌"; }, 700);
      }
      items.appendChild(s);
    }
    stage.appendChild(items);

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,26px);margin:6px 0";
    ask.textContent = `${a} ➖ ${b} = ؟`;
    stage.appendChild(ask);
    Speech.ar(`${a} ناقص ${b}، كم بقي؟`);

    const opts = new Set([rest]);
    while (opts.size < 3) {
      const d = rest + (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 2) | 0));
      if (d >= 1 && d <= 10) opts.add(d);
    }
    const row = document.createElement("div");
    row.className = "choice-row";
    shuffle([...opts]).forEach((val) => {
      const num = NUMBERS_10[val - 1];
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.style.fontWeight = "800";
      btn.textContent = num.arDigit;
      btn.addEventListener("click", () => {
        if (val === rest) {
          btn.classList.add("correct");
          Sfx.correct();
          speakBoth(num);
          awardStars(1);
          setTimeout(nextRound, 1100);
        } else {
          btn.classList.add("wrong");
          Sfx.wrong();
          setTimeout(() => btn.classList.remove("wrong"), 500);
        }
      });
      row.appendChild(btn);
    });
    stage.appendChild(row);
  }

  function nextRound() {
    round++;
    if (round >= ROUNDS) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}

// ===== لعبة ٤: عُدّ واختر الرقم =====
// تظهر مجموعة عناصر، يعدّها الطفل ويختار الرقم الصحيح من بين ثلاثة.
export function renderCountPick({ regionId, regionIndex }) {
  const { screen, stage, back } = baseScreen("🔢 عُدّ واختر", regionId, regionIndex);
  const ROUNDS = 6;
  let round = 0;

  function render() {
    const target = 1 + ((Math.random() * (isSmall() ? 5 : 9)) | 0); // 1..5 أو 1..9
    const emoji = rand(COUNT_EMOJIS);
    stage.innerHTML = "";

    const ask = document.createElement("p");
    ask.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,26px);margin:4px 0";
    ask.textContent = "كم عددها؟ 🤔";
    stage.appendChild(ask);
    Speech.ar("كم عددها؟");

    // العناصر المعدودة
    const items = document.createElement("div");
    items.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:min(90vw,420px);margin:10px auto;font-size:clamp(34px,9vw,52px)";
    for (let k = 0; k < target; k++) {
      const s = document.createElement("span");
      s.textContent = emoji;
      s.style.animation = "pop-in .3s ease both";
      s.style.animationDelay = `${k * 0.08}s`;
      items.appendChild(s);
    }
    stage.appendChild(items);

    // خيارات الأرقام (الصحيح + اثنان قريبان)
    const opts = new Set([target]);
    while (opts.size < 3) {
      const d = target + (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 2) | 0));
      if (d >= 1 && d <= 10) opts.add(d);
    }
    const choices = shuffle([...opts]);

    const row = document.createElement("div");
    row.className = "choice-row";
    choices.forEach((val) => {
      const num = NUMBERS_10[val - 1];
      const b = document.createElement("button");
      b.className = "choice";
      b.style.fontWeight = "800";
      b.textContent = num.arDigit;
      b.addEventListener("click", () => {
        if (val === target) {
          b.classList.add("correct");
          Sfx.correct();
          speakBoth(num);
          awardStars(1);
          setTimeout(nextRound, 1100);
        } else {
          b.classList.add("wrong");
          Sfx.wrong();
          setTimeout(() => b.classList.remove("wrong"), 500);
        }
      });
      row.appendChild(b);
    });
    stage.appendChild(row);
  }

  function nextRound() {
    round++;
    if (round >= ROUNDS) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    else render();
  }

  setTimeout(render, 0);
  return screen;
}
