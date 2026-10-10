// ===== لعبة "اصطياد الحروف": اضغط ما يبدأ بحرف معيّن وهو يتساقط =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount } from "./common.js";

const ROUNDS = 5;

export function renderCatch({ regionId, regionIndex, datasetKey, lang }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang;
  const items = ds.items;

  const targets = shuffle(items).slice(0, ROUNDS);
  // الإنجليزى: جولات «اصطاد الحرف الصغير/الكابيتال» وسط حروف بالحالتين — والفخ هو نفس
  // الحرف بالحالة التانية (b وسطها B). بيعلّم الفرق (المالك ٢٠٢٦-١٠-١٠).
  const caseMode = !!(items[0] && items[0].lower && items[0].lower !== items[0].char);
  const KINDS = ["word", "small", "capital", "small", "word"];
  let round = 0;
  let running = true;
  let fallers = []; // { el, x, y, speed, item }

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#a0e9ff,#7c9cff)";

  const back = () => { running = false; Router.go("region", { id: regionId, index: regionIndex }); };
  screen.appendChild(gameTopbar("🎯 اصطياد الحروف", back));

  const prompt = document.createElement("p");
  prompt.style.cssText = "text-align:center;font-weight:800;font-size:clamp(18px,5vw,26px);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);margin:10px";
  screen.appendChild(prompt);

  const sky = document.createElement("div");
  sky.className = "sky";
  sky.style.background = "linear-gradient(180deg,rgba(255,255,255,.25),rgba(255,255,255,.05))";
  screen.appendChild(sky);

  function clearFallers() {
    fallers.forEach((f) => f.el.remove());
    fallers = [];
  }

  function spawnRound() {
    clearFallers();
    const target = targets[round];
    const kind = caseMode ? KINDS[round % KINDS.length] : "word";
    if (kind !== "word") return spawnLetters(target, kind);
    prompt.innerHTML = `اصطد ما يبدأ بحرف <b style="font-size:1.4em" dir="ltr">${caseMode ? target.char + target.lower : target.char}</b>`;
    Speech.ar(`اصطد ما يبدأ بحرف ${target.name}`);

    const others = shuffle(items.filter((x) => x.char !== target.char)).slice(0, diffCount(3, 5));
    const pool = shuffle([target, ...others]);
    const W = sky.clientWidth || 320;
    const H = sky.clientHeight || 400;

    pool.forEach((item, idx) => {
      const el = document.createElement("div");
      el.className = "falling";
      el.textContent = item.emoji;
      sky.appendChild(el);
      const f = {
        el,
        x: 10 + Math.random() * (W - 70),
        // وزّع العناصر داخل المساحة المرئية فوراً حتى لا تبدو الشاشة فارغة
        y: 20 + (idx / pool.length) * (H - 130) + Math.random() * 24,
        speed: 1.3 + Math.random() * 1.4,
        item,
      };
      el.style.transform = `translate(${f.x}px, ${f.y}px)`;
      el.addEventListener("click", () => handleTap(f, target));
      fallers.push(f);
    });
  }

  /** جولة حروف: المطلوب بحالة واحدة (صغير أو كابيتال)، ومعاه نفس الحرف بالحالة التانية + حروف تانية. */
  function spawnLetters(target, kind) {
    const want = kind === "small" ? target.lower : target.char;
    const twin = kind === "small" ? target.char : target.lower;
    prompt.innerHTML = kind === "small"
      ? `اصطد الحرف <b>الصغير</b> <b style="font-size:1.4em" dir="ltr">${want}</b>`
      : `اصطد الحرف <b>الكابيتال</b> <b style="font-size:1.4em" dir="ltr">${want}</b>`;
    Speech.sequence([
      { text: kind === "small" ? "اصطد الحرف الصغير" : "اصطد الحرف الكابيتال", lang: "ar-EG" },
      { text: `${kind} ${want}`, lang: "en-US" },
    ]);
    const others = shuffle(items.filter((x) => x.char !== target.char)).slice(0, diffCount(3, 4))
      .map((x) => (Math.random() < 0.5 ? x.char : x.lower));
    const letters = shuffle([want, twin, ...others]);
    const W = sky.clientWidth || 320;
    const H = sky.clientHeight || 400;
    letters.forEach((ch, idx) => {
      const el = document.createElement("div");
      el.className = "falling falling-letter";
      el.textContent = ch;
      el.dir = "ltr";
      sky.appendChild(el);
      const f = {
        el,
        x: 10 + Math.random() * (W - 70),
        y: 20 + (idx / letters.length) * (H - 130) + Math.random() * 24,
        speed: 1.1 + Math.random() * 1.1,
        item: { ch },
      };
      el.style.transform = `translate(${f.x}px, ${f.y}px)`;
      el.addEventListener("click", () => {
        if (ch === want) {
          Sfx.correct();
          awardStars(1);
          Speech.say(`${kind} ${want}`, { lang: "en-US" });
          el.classList.add("correct");
          el.style.pointerEvents = "none";
          nextRound();
        } else {
          Sfx.wrong();
          el.classList.add("wrong");
          setTimeout(() => el.classList.remove("wrong"), 400);
          // الفخ: نفس الحرف بالحالة التانية — نقول الفرق بدل «غلط» بس
          if (ch === twin) {
            prompt.innerHTML = kind === "small"
              ? `ده <b dir="ltr">${twin}</b> الكابيتال — عايزين الصغير <b dir="ltr">${want}</b>`
              : `ده <b dir="ltr">${twin}</b> الصغير — عايزين الكابيتال <b dir="ltr">${want}</b>`;
          }
        }
      });
      fallers.push(f);
    });
  }

  function handleTap(f, target) {
    if (f.item.char === target.char) {
      Sfx.correct();
      awardStars(1);
      Speech.say(f.item.word, { lang: speakLang });
      f.el.classList.add("correct");
      f.el.style.pointerEvents = "none";
      nextRound();
    } else {
      Sfx.wrong();
      f.el.classList.add("wrong");
      setTimeout(() => f.el.classList.remove("wrong"), 400);
    }
  }

  function nextRound() {
    round++;
    if (round >= ROUNDS) {
      running = false;
      clearFallers();
      finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    } else {
      setTimeout(spawnRound, 700);
    }
  }

  function loop() {
    if (!running || !screen.isConnected) return;
    const H = sky.clientHeight || 400;
    const W = sky.clientWidth || 320;
    fallers.forEach((f) => {
      f.y += f.speed;
      if (f.y > H + 20) {
        f.y = -60;
        f.x = 10 + Math.random() * (W - 70);
      }
      f.el.style.transform = `translate(${f.x}px, ${f.y}px)`;
    });
    requestAnimationFrame(loop);
  }

  setTimeout(() => {
    spawnRound();
    requestAnimationFrame(loop);
  }, 60);

  return screen;
}
