// ===== «ألعاب ميزو» للحروف والأرقام — الشاشات =====
//
// المالك ٢٠٢٦-١٠-١٦: «ألعاب تعلّم الحروف العربى والإنجليزى والأرقام، مبتكرة وجذابة للأطفال».
// خمس ألعاب، كل واحدة بتاخد kind = arabic | english | numbers:
//   frog (🐸 نطّة الضفدع) · flashlight (🔦 الكشّاف) · piano (🎹 بيانو ميزو)
//   rocket (🚀 صاروخ الترتيب) · eggs (🥚 بيض المفاجآت)
// الجولات والبيانات فى data/funGames.js (صافية ومتقاسة فى node)، والكلام فى FUN_SAY.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { femAdapt } from "../data/mizo.js";
import { gameTopbar, finishActivity, diffCount } from "./common.js";
import { FUN_SAY } from "../data/writingPhrases.js";
import {
  funItems, frogRounds, FROG_HOPS, flashRounds, pianoKeys, pianoLengths, pianoTune,
  rocketRounds, eggRounds, EGG_TAPS, hatchOf,
} from "../data/funGames.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** الجملة العربى وبعدها اسم الحرف/الرقم بلغته. */
function say(ar, item) {
  const seq = [{ text: fem(ar), lang: "ar-EG" }];
  if (item) seq.push({ text: item.say, lang: item.lang });
  Speech.sequence(seq, 200);
}
/** ينطق الحرف/الرقم وبعدها يكمّل (ولو الصوت مارجعش، يكمّل بعد شوية برضه). */
function sayThen(item, cb, max = 1700) {
  let fired = false;
  const go = () => { if (!fired) { fired = true; cb(); } };
  Speech.say(item.say, { lang: item.lang, onend: () => setTimeout(go, 180) });
  setTimeout(go, max);
}
/** الإنجليزى: الحرف يظهر كابيتال أو صغير (نفس الحرف) — عشان العين تعرف الشكلين. */
const shown = (item, small) => (small && item.alt ? item.alt : item.glyph);

/** الهيكل المشترك: شريط فوق + فقاعة ميزو (لمسة عليها تعيد الكلام) + تقدّم + المسرح. */
function shell({ regionId, regionIndex, title, scene }) {
  const screen = el("div", `region-screen fg-screen fg-scene-${scene}`);
  let alive = true;
  const back = () => { alive = false; Speech.stop(); Router.go("region", { id: regionId, index: regionIndex }); };
  screen.appendChild(gameTopbar(title, back));
  const bubble = el("button", "fg-bubble");
  bubble.type = "button";
  bubble.innerHTML = `<img class="fg-mizo" src="/assets/mizo/mizo-teach.webp" alt="" width="56" height="56"><span class="fg-say"></span><b class="fg-target" dir="auto"></b>`;
  bubble.setAttribute("aria-label", "ميزو: اسمع تانى");
  let last = null;
  bubble.addEventListener("click", () => { Sfx.tap(); if (last) say(last.text, last.item); });
  const track = el("div", "fg-track");
  const stage = el("div", "fg-stage");
  screen.append(bubble, track, stage);
  return {
    screen, stage, back,
    get alive() { return alive && screen.isConnected; },
    tell(text, item = null, glyph = null) {
      last = { text, item };
      bubble.querySelector(".fg-say").textContent = fem(text);
      bubble.querySelector(".fg-target").textContent = glyph || "";
      say(text, item);
    },
    /** كلام مكتوب بس (من غير صوت) — وقت ما ميزو بيعزف. */
    show(text) {
      bubble.querySelector(".fg-say").textContent = fem(text);
      bubble.querySelector(".fg-target").textContent = "";
    },
    cheer() {
      const img = bubble.querySelector(".fg-mizo");
      img.src = "/assets/mizo/mizo-cheer.webp";
      setTimeout(() => { img.src = "/assets/mizo/mizo-teach.webp"; }, 1400);
    },
    progress(done, total) {
      track.replaceChildren(...Array.from({ length: total }, (_, i) => el("span", "fg-dot" + (i < done ? " on" : ""))));
    },
    finish() {
      alive = false;
      finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    },
  };
}
const wiggle = (node) => { node.classList.remove("fg-wiggle"); void node.offsetWidth; node.classList.add("fg-wiggle"); };
function stepWin(g) {
  Sfx.correct();
  awardStars(1);
  g.cheer();
}

// ===================== 🐸 نطّة الضفدع =====================
export function renderFrog({ regionId, regionIndex, kind = "arabic" }) {
  const items = funItems(kind);
  const g = shell({ regionId, regionIndex, title: "🐸 نطّة الضفدع", scene: "frog" });
  const rounds = frogRounds(items, Math.random, diffCount(2, 3));
  let r = 0;
  const pond = el("div", "fg-pond");
  const home = el("div", "fg-home", "🏡");
  const pads = el("div", "fg-pads");
  const frog = el("div", "fg-frog", "🐸");
  frog.setAttribute("aria-hidden", "true");
  pond.append(home, pads, frog);
  g.stage.appendChild(pond);

  function round() {
    const R = rounds[r];
    g.progress(r, FROG_HOPS);
    pads.replaceChildren();
    let locked = false;
    R.pads.forEach((it, i) => {
      const b = el("button", "fg-pad");
      b.type = "button";
      b.style.setProperty("--d", `${i * 0.08}s`);
      b.innerHTML = `<span class="fg-glyph" dir="auto">${shown(it, kind === "english" && Math.random() < 0.4)}</span>`;
      if (it === R.target) b.dataset.good = "1";
      b.addEventListener("click", async () => {
        if (locked || !g.alive) return;
        if (it !== R.target) {
          Sfx.wrong();
          wiggle(b);
          b.classList.add("fg-sink");
          setTimeout(() => b.classList.remove("fg-sink"), 700);
          return g.tell(FUN_SAY.frogWrong, R.target);
        }
        locked = true;
        // الضفدع بينطّ على الورقة
        const br = b.getBoundingClientRect(), fr = frog.getBoundingClientRect();
        frog.style.setProperty("--tx", `${br.left + br.width / 2 - (fr.left + fr.width / 2)}px`);
        frog.style.setProperty("--ty", `${br.top + br.height / 2 - (fr.top + fr.height / 2)}px`);
        frog.classList.add("fg-jump");
        b.classList.add("fg-landed");
        stepWin(g);
        Speech.say(it.say, { lang: it.lang });
        await wait(1000);
        if (!g.alive) return;
        frog.classList.remove("fg-jump");
        frog.style.removeProperty("--tx");
        frog.style.removeProperty("--ty");
        if (++r >= rounds.length) {
          g.progress(FROG_HOPS, FROG_HOPS);
          frog.classList.add("fg-home-jump");
          g.tell(FUN_SAY.frogHome);
          return setTimeout(() => g.alive && g.finish(), 1800);
        }
        round();
      });
      pads.appendChild(b);
    });
    g.tell(r === 0 ? FUN_SAY.frogIntro : FUN_SAY.frogAgain, R.target, shown(R.target, false));
  }
  setTimeout(round, 50);
  return g.screen;
}

// ===================== 🔦 الكشّاف =====================
export function renderFlashlight({ regionId, regionIndex, kind = "arabic" }) {
  const items = funItems(kind);
  const g = shell({ regionId, regionIndex, title: "🔦 الكشّاف", scene: "flash" });
  const rounds = flashRounds(items, Math.random, diffCount(4, 6));
  let r = 0;
  const night = el("div", "fg-night");
  const field = el("div", "fg-field");
  const shade = el("div", "fg-shade");
  shade.setAttribute("aria-hidden", "true");
  night.append(field, shade);
  g.stage.appendChild(night);
  const aim = (e) => {
    const rc = night.getBoundingClientRect();
    night.style.setProperty("--x", `${e.clientX - rc.left}px`);
    night.style.setProperty("--y", `${e.clientY - rc.top}px`);
  };
  night.addEventListener("pointermove", aim);
  night.addEventListener("pointerdown", aim);

  function round() {
    const R = rounds[r];
    g.progress(r, rounds.length);
    night.classList.remove("fg-lit");
    night.style.setProperty("--x", "50%");
    night.style.setProperty("--y", "55%");
    field.replaceChildren();
    let locked = false;
    R.spots.forEach((s) => {
      const b = el("button", "fg-spot");
      b.type = "button";
      b.style.left = s.x + "%";
      b.style.top = s.y + "%";
      b.innerHTML = `<span class="fg-glyph" dir="auto">${shown(s.item, kind === "english" && Math.random() < 0.4)}</span>`;
      if (s.item === R.target) b.dataset.good = "1";
      b.addEventListener("click", async (e) => {
        aim(e);
        if (locked || !g.alive) return;
        if (s.item !== R.target) {
          Sfx.wrong();
          wiggle(b);
          return g.tell(FUN_SAY.flashWrong, R.target);
        }
        locked = true;
        b.classList.add("fg-found");
        night.classList.add("fg-lit");          // النور يغرّق الجنينة كلها
        stepWin(g);
        Speech.sequence([{ text: fem(FUN_SAY.flashFound), lang: "ar-EG" }, { text: s.item.say, lang: s.item.lang }], 150);
        await wait(1700);
        if (!g.alive) return;
        if (++r >= rounds.length) return g.finish();
        round();
      });
      field.appendChild(b);
    });
    g.tell(FUN_SAY.flashIntro, R.target, shown(R.target, false));
  }
  setTimeout(round, 50);
  return g.screen;
}

// ===================== 🎹 بيانو ميزو =====================
const KEY_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"];
export function renderPiano({ regionId, regionIndex, kind = "arabic" }) {
  const items = funItems(kind);
  const g = shell({ regionId, regionIndex, title: "🎹 بيانو ميزو", scene: "piano" });
  const keys = pianoKeys(items);
  const lengths = pianoLengths(Store.ageBand !== "small");
  let r = 0;
  let tune = [];
  let pos = 0;
  let listening = false;
  const board = el("div", "fg-piano");
  const notes = el("div", "fg-notes");
  const btns = keys.map((it, k) => {
    const b = el("button", "fg-key");
    b.type = "button";
    b.style.setProperty("--k", KEY_COLORS[k]);
    b.innerHTML = `<span class="fg-glyph" dir="auto">${shown(it, false)}</span>`;
    b.addEventListener("click", () => press(k));
    board.appendChild(b);
    return b;
  });
  g.stage.append(notes, board);

  const light = (k, ms = 520) => {
    btns[k].classList.add("on");
    const n = el("span", "fg-note", ["♪", "♫", "♩", "♬"][k]);
    n.style.left = 12 + k * 25 + "%";
    n.style.color = KEY_COLORS[k];
    notes.appendChild(n);
    setTimeout(() => n.remove(), 1200);
    setTimeout(() => btns[k].classList.remove("on"), ms);
  };
  async function play() {
    listening = false;
    g.show("🎵 اسمع ميزو…");
    board.classList.add("fg-mizo-turn");
    for (const k of tune) {
      if (!g.alive) return;
      light(k, 650);
      await new Promise((res) => sayThen(keys[k], res, 1500));
      await wait(150);
    }
    board.classList.remove("fg-mizo-turn");
    if (!g.alive) return;
    pos = 0;
    listening = true;
    g.tell(FUN_SAY.pianoYourTurn);
  }
  function press(k) {
    if (!g.alive) return;
    light(k);
    Speech.say(keys[k].say, { lang: keys[k].lang });
    if (!listening) return;                      // وهو بيجرّب قبل دوره — صوت بس
    if (k !== tune[pos]) {
      listening = false;
      Sfx.wrong();
      wiggle(board);
      g.tell(FUN_SAY.pianoWrong);
      return setTimeout(play, 2300);
    }
    if (++pos < tune.length) return;
    listening = false;
    stepWin(g);
    if (++r >= lengths.length) {
      g.progress(lengths.length, lengths.length);
      return setTimeout(() => g.alive && g.finish(), 1200);
    }
    setTimeout(() => {
      if (!g.alive) return;
      const longer = lengths[r] > lengths[r - 1];
      if (longer) g.tell(FUN_SAY.pianoLonger);
      setTimeout(next, longer ? 2200 : 600);
    }, 900);
  }
  function next() {
    if (!g.alive) return;
    g.progress(r, lengths.length);
    tune = pianoTune(Math.random, keys.length, lengths[r]);
    play();
  }
  setTimeout(() => {
    g.progress(0, lengths.length);
    g.tell(FUN_SAY.pianoIntro);
    setTimeout(next, 3200);
  }, 50);
  return g.screen;
}

// ===================== 🚀 صاروخ الترتيب =====================
export function renderRocket({ regionId, regionIndex, kind = "arabic" }) {
  const items = funItems(kind);
  const g = shell({ regionId, regionIndex, title: "🚀 صاروخ الترتيب", scene: "rocket" });
  const rounds = rocketRounds(items, Math.random, diffCount(4, 5));
  let r = 0;
  const space = el("div", "fg-space");
  const sky = el("div", "fg-orbs");
  const pad = el("div", "fg-launch");
  const rocket = el("div", "fg-rocket", "🚀");
  const fuel = el("div", "fg-fuel");
  const line = el("div", "fg-line");
  line.setAttribute("dir", kind === "english" ? "ltr" : "rtl");
  pad.append(fuel, rocket);
  space.append(line, sky, pad);
  g.stage.appendChild(space);

  function round() {
    const R = rounds[r];
    g.progress(r, rounds.length);
    rocket.classList.remove("fg-fly");
    fuel.replaceChildren(...R.order.map(() => el("span", "fg-cell")));
    line.replaceChildren(...R.order.map(() => el("span", "fg-slot")));
    sky.replaceChildren();
    let k = 0;
    R.bubbles.forEach((it, i) => {
      const b = el("button", "fg-orb");
      b.type = "button";
      b.style.setProperty("--d", `${(i % 3) * 0.6}s`);
      b.innerHTML = `<span class="fg-glyph" dir="auto">${shown(it, false)}</span>`;
      b.addEventListener("click", async () => {
        if (!g.alive || b.dataset.on) return;
        const want = R.order[k];
        if (it !== want) {
          Sfx.wrong();
          wiggle(b);
          return g.tell(FUN_SAY.rocketWrong, want, shown(want, false));
        }
        b.dataset.on = "1";
        b.classList.add("fg-used");
        Sfx.pop();
        Speech.say(it.say, { lang: it.lang });
        fuel.children[k].classList.add("on");
        line.children[k].textContent = shown(it, false);
        line.children[k].classList.add("on");
        if (++k < R.order.length) return syncGood();
        stepWin(g);
        g.tell(FUN_SAY.rocketLaunch);
        await wait(2300);
        if (!g.alive) return;
        rocket.classList.add("fg-fly");
        await wait(1400);
        if (!g.alive) return;
        if (++r >= rounds.length) return g.finish();
        round();
      });
      sky.appendChild(b);
    });
    // الصباع/الاختبار: اللى عليه الدور بس data-good
    function syncGood() {
      [...sky.children].forEach((b, i) => { if (R.bubbles[i] === R.order[k] && !b.dataset.on) b.dataset.good = "1"; else delete b.dataset.good; });
    }
    syncGood();
    g.tell(FUN_SAY.rocketIntro, R.order[0], shown(R.order[0], false));
  }
  setTimeout(round, 50);
  return g.screen;
}

// ===================== 🥚 بيض المفاجآت =====================
export function renderEggs({ regionId, regionIndex, kind = "arabic" }) {
  const items = funItems(kind);
  const g = shell({ regionId, regionIndex, title: "🥚 بيض المفاجآت", scene: "eggs" });
  const rounds = eggRounds(items, Math.random, diffCount(2, 3));
  let r = 0;
  const nest = el("div", "fg-nest");
  const show = el("div", "fg-hatch");
  g.stage.append(nest, show);

  function round() {
    const R = rounds[r];
    g.progress(r, rounds.length);
    nest.replaceChildren();
    show.replaceChildren();
    show.classList.remove("on");
    let locked = false;
    R.eggs.forEach((it) => {
      const b = el("button", "fg-egg");
      b.type = "button";
      b.dataset.taps = "0";
      b.innerHTML = `<span class="fg-glyph" dir="auto">${shown(it, kind === "english" && Math.random() < 0.4)}</span><i class="fg-crack"></i>`;
      if (it === R.target) b.dataset.good = "1";
      b.addEventListener("click", async () => {
        if (locked || !g.alive) return;
        if (it !== R.target) {
          Sfx.wrong();
          wiggle(b);
          return g.tell(FUN_SAY.eggWrong, R.target, shown(R.target, false));
        }
        const n = Number(b.dataset.taps) + 1;
        b.dataset.taps = String(n);
        b.style.setProperty("--crack", String(n / EGG_TAPS));
        wiggle(b);
        Sfx.pop();
        if (n < EGG_TAPS) return n === 1 && say(FUN_SAY.eggMore);
        locked = true;
        b.classList.add("fg-open");
        stepWin(g);
        await hatch(it);
        if (!g.alive) return;
        if (++r >= rounds.length) return g.finish();
        round();
      });
      nest.appendChild(b);
    });
    g.tell(FUN_SAY.eggIntro, R.target, shown(R.target, false));
  }
  /** اللى بيطلع: صاحب الحرف (الكلمة بتتنطق) — وللأرقام كتاكيت بنعدّهم واحد واحد. */
  async function hatch(it) {
    show.classList.add("on");
    if (!it.value) {
      show.innerHTML = `<span class="fg-baby">${hatchOf(it)}</span><b class="fg-word" dir="auto">${it.word || ""}</b>`;
      Speech.sequence([{ text: fem(FUN_SAY.eggHatch), lang: "ar-EG" }, { text: it.word || it.say, lang: it.lang }], 150);
      return wait(2600);
    }
    const chicks = [...hatchOf(it)].filter((c) => c.trim());
    show.replaceChildren(...chicks.map(() => el("span", "fg-chick", "🐥")));
    say(FUN_SAY.eggCount);
    await wait(1600);
    const nums = funItems("numbers");
    for (let i = 0; i < chicks.length; i++) {
      if (!g.alive) return;
      show.children[i].classList.add("on");
      await new Promise((res) => sayThen(nums[i], res, 1100));
    }
    return wait(900);
  }
  setTimeout(round, 50);
  return g.screen;
}
