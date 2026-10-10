// ===== «اكتب اسمك»: الطفل بيكتب حروف اسمه واحد ورا التانى على لوحة الكتابة =====
//
// المالك ٢٠٢٦-١٠-١٠: اسم الطفل أكتر حاجة بتشجّعه يكتب فى السن ده. الاسم متخزّن
// أصلاً (ميزو بيناديه بيه). كل حرف بيتكتب بشكله المنفصل على نفس لوحة «ارسم الحرف»
// (نقطة البداية والاتجاه والمستويات) — وفوق اللوحة الاسم كله متّصل زى ما بيتكتب،
// والحرف اللى عليه الدور منوّر. ولو مفيش اسم، ولى الأمر بيكتبه هنا.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { gameTopbar, showCheer, finishActivity } from "./common.js";
import { strokesFor, nameLetters } from "../data/strokes.js";
import { mountWriteBoard, LEVEL_LABELS } from "./writeBoard.js";
import { openWorksheet } from "./worksheet.js";
import { femAdapt } from "../data/mizo.js";
import { showGripCard, whenGripClosed, gripButton, penBoardOptions } from "./grip.js";

function tell(text) {
  let t = text;
  try { if (Store.childGender === "girl") t = femAdapt(text); } catch (e) {}
  Speech.ar(t);
  return t;
}

export function renderNameWrite({ regionId, regionIndex }) {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffd6e8,#b48cff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("✍️ اكتب اسمك", back));
  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  let name = "";
  let letters = [];
  let idx = 0;

  function askName() {
    stage.innerHTML = "";
    const box = document.createElement("div");
    box.className = "nw-ask";
    box.innerHTML = `<p class="nw-ask-title">اكتب اسم طفلك عشان يتعلّم يكتبه</p>
      <input class="nw-input" type="text" maxlength="20" placeholder="مثلاً: مريم" aria-label="اسم الطفل" />
      <button class="candy-btn nw-go" type="button">يلا نكتب ✍️</button>
      <p class="nw-hint" hidden>الاسم ده مافيهوش حروف نعرف نكتبها — اكتبه بالعربى أو بالإنجليزى.</p>`;
    stage.appendChild(box);
    const input = box.querySelector(".nw-input");
    const err = box.querySelector(".nw-hint");
    input.value = Store.childName || "";
    box.querySelector(".nw-go").addEventListener("click", () => {
      const v = input.value.trim();
      if (!nameLetters(v).length) { err.hidden = false; input.focus(); return; }
      Sfx.tap();
      Store.setChildName(v);
      start(v);
    });
  }

  function start(n) {
    name = n;
    letters = nameLetters(n);
    idx = 0;
    if (!letters.length) return askName();
    render();
  }

  function render() {
    stage.innerHTML = "";
    const ch = letters[idx];
    const isLatin = /[A-Z]/.test(ch);

    // الاسم كله فوق: متّصل زى ما بيتكتب، وتحته الحروف منفصلة والحالى منوّر
    const whole = document.createElement("div");
    whole.className = "nw-whole";
    whole.textContent = name;
    whole.dir = isLatin ? "ltr" : "rtl";
    stage.appendChild(whole);

    const tiles = document.createElement("div");
    tiles.className = "nw-tiles";
    tiles.dir = isLatin ? "ltr" : "rtl";
    letters.forEach((c, i) => {
      const t = document.createElement("span");
      t.className = "nw-tile" + (i < idx ? " is-done" : i === idx ? " is-now" : "");
      t.textContent = c;
      tiles.appendChild(t);
    });
    stage.appendChild(tiles);

    const levelKey = "g:" + ch;
    const level = Store.getWriteLevel(levelKey);
    const lvlBtn = document.createElement("button");
    lvlBtn.className = "wb-level";
    lvlBtn.type = "button";
    lvlBtn.textContent = LEVEL_LABELS[level];
    lvlBtn.setAttribute("aria-label", "مستوى المساعدة: " + LEVEL_LABELS[level] + " — اضغط للتغيير");
    lvlBtn.addEventListener("click", () => { Sfx.tap(); Store.setWriteLevel(levelKey, level >= 3 ? 1 : level + 1); render(); });
    stage.appendChild(lvlBtn);

    const hint = document.createElement("div");
    hint.className = "nw-msg";
    let hintTimer = null;
    const showHint = (text) => {
      hint.textContent = text;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint.textContent = ""; }, 3500);
    };

    const strokes = strokesFor(ch);
    const board = mountWriteBoard(stage, {
      ...penBoardOptions((text) => showHint(tell(text))),
      strokes,
      level,
      onHint: (text) => { Sfx.wrong(); showHint(tell(text)); },
      onDone: ({ fails }) => {
        Store.recordWrite(levelKey, fails, level);
        if (fails <= 2 && level < 3) Store.setWriteLevel(levelKey, level + 1);
        else if (fails >= 6 && level > 1) Store.setWriteLevel(levelKey, level - 1);
        Sfx.correct();
        idx++;
        if (idx >= letters.length) return finish();
        setTimeout(render, 700);
      },
    });
    stage.appendChild(hint);

    const tools = document.createElement("div");
    tools.className = "nw-tools";
    const btn = (text, fn) => {
      const b = document.createElement("button");
      b.className = "candy-btn";
      b.type = "button";
      b.textContent = text;
      b.addEventListener("click", () => { Sfx.tap(); fn(); });
      tools.appendChild(b);
    };
    btn("👀 شوف إزاى", () => board.demo());
    tools.appendChild(gripButton());
    btn("🖨️ اطبع اسمى", printName);
    btn("✏️ غيّر الاسم", askName);
    stage.appendChild(tools);

    if (idx === 0) showGripCard();
    whenGripClosed(() => {
      if (idx === 0) tell(`يلا نكتب اسمك. أول حرف ${ch}. ابدأ من النقطة الخضرا`);
      else tell(`الحرف اللى بعده ${ch}`);
      if (level === 1) setTimeout(() => board.demo(), 1400);
    });
  }

  function printName() {
    const uniq = [...new Set(letters)];
    openWorksheet({
      title: `✍️ اكتب اسمك: ${name}`,
      name,
      glyphs: uniq.map((c) => ({ label: c, strokes: strokesFor(c) })),
    });
  }

  function finish() {
    Speech.say(name, { lang: /[A-Za-z]/.test(name) ? "en-US" : "ar-EG" });
    const msg = Store.childGender === "girl" ? `برافو! كتبتي اسمك ${name}` : `برافو! كتبت اسمك ${name}`;
    setTimeout(() => showCheer("✍️", msg, () => finishActivity({ regionId, regionIndex, stars: 6, onDone: back })), 600);
  }

  setTimeout(() => (Store.childName && nameLetters(Store.childName).length ? start(Store.childName.trim()) : askName()), 0);
  return screen;
}
