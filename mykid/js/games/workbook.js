// ===== «كراسة الأرقام»: صفحة الرقم زى الكتاب — يكتب شوية ويلعب شوية =====
//
// المالك ٢٠٢٦-١٠-١٢ (كتاب «Little Mathematics – Level One»): نفس تمارين الكتاب جوّه mykid،
// والطفل «مش بيتعلم الكتابه انما يكتب شويه و يلعب شويه كل فى نفس التاب».
// الخطوات والإجابات من `data/workbook.js` (صافى ومتقاس)؛ هنا العرض واللمس بس.
// الكتابة بنفس لوحة «ارسم الرقم» (writeBoard): نقطة البداية والأسهم والصباع اللى بيوريه.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { femAdapt } from "../data/mizo.js";
import { NUMBERS } from "../data/numbers.js";
import { strokesFor } from "../data/strokes.js";
import { workbookPage, WB_COLORS, WB_AR, WB_NUMBERS, colorPairOf, isWriteStep } from "../data/workbook.js";
import { WB_SAY, CHOOSER_TITLES, writeIntro } from "../data/writingPhrases.js";
import { gameTopbar, finishActivity, glyphChooser } from "./common.js";
import { mountWriteBoard } from "./writeBoard.js";
import { showGripCard, whenGripClosed, penBoardOptions } from "./grip.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const enName = (n) => (NUMBERS.find((x) => x.value === n) || {}).enName || String(n);
const col = (key) => WB_COLORS[key];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function button(cls, text, onClick) {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
const flash = (node, cls, ms = 450) => { node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };

/** نقط العدد زى الزهر/الدومينو (لحد ٦)، وبعد كده صفّين. */
function dotsFor(v) {
  const box = el("span", "wbk-dots" + (v > 6 ? " wbk-dots-rows" : ""));
  const DICE = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  if (v <= 6) {
    for (let i = 0; i < 9; i++) box.appendChild(el("i", DICE[v].includes(i) ? "on" : ""));
  } else {
    for (let i = 0; i < v; i++) box.appendChild(el("i", "on"));
  }
  box.setAttribute("aria-label", `${v} نقط`);
  return box;
}
/** مجموعة حاجات متعدّة (🦆🦆🦆). */
function groupOf(thing, count, cls = "wbk-group") {
  const g = el("span", cls);
  for (let i = 0; i < count; i++) g.appendChild(el("span", "wbk-thing", thing));
  g.setAttribute("aria-label", `${count} ${thing}`);
  return g;
}

export function renderWorkbook({ regionId, regionIndex, n: startN }) {
  const screen = el("div", "region-screen wbk-screen");
  let n = 0;
  let steps = [];
  let idx = 0;
  let cleanup = () => {};
  const toRegion = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("📒 كراسة الأرقام", () => {
    Speech.stop();
    if (n) showChooser();
    else toRegion();
  }));
  const stage = el("div", "stage wbk-stage");
  screen.appendChild(stage);

  // ===== اختيار الرقم (والنجمة على اللى خلصت صفحته) =====
  const chooser = glyphChooser({
    items: WB_NUMBERS,
    shownOf: (v) => (Store.workbookDone[v] ? `${v}⭐` : String(v)),
    ariaOf: (v) => `صفحة الرقم ${v}`,
    title: CHOOSER_TITLES[1],
    dir: "ltr",
    onPick: (i) => openPage(WB_NUMBERS[i]),
  });

  function showChooser() {
    cleanup();
    n = 0;
    stage.replaceChildren();
    const intro = el("p", "wbk-intro", fem("كل صفحة: نكتب الرقم شوية، ونلعب بيه شوية — زى الكراسة"));
    stage.append(intro, chooser.el);
    // الأزرار بتتكتب وقت الإنشاء — نحدّث النجوم كل مرة
    chooser.el.querySelectorAll(".lesson-chooser-btn").forEach((b, i) => {
      const v = WB_NUMBERS[i];
      b.textContent = Store.workbookDone[v] ? `${v}⭐` : String(v);
    });
    const next = WB_NUMBERS.find((v) => !Store.workbookDone[v]) || 1;
    chooser.show(next - 1);
  }

  function openPage(num) {
    n = num;
    steps = workbookPage(n);
    idx = 0;
    const [c1, c2] = colorPairOf(n);
    screen.style.setProperty("--wbk-c1", col(c1).hex);
    screen.style.setProperty("--wbk-c2", col(c2).hex);
    renderStep();
  }

  // ===== رأس الصفحة: «4 four» + شريط الخطوات (✏️ كتابة · 🎲 لعب) =====
  function header() {
    const head = el("div", "wbk-head");
    const title = el("button", "wbk-title");
    title.type = "button";
    title.innerHTML = `<b dir="ltr">${n}</b><span dir="ltr">${enName(n)}</span>`;
    title.setAttribute("aria-label", `اسمع الرقم ${n}`);
    title.addEventListener("click", () => { Sfx.pop(); sayNumber(n); });
    const track = el("div", "wbk-track");
    steps.forEach((s, i) => {
      const chip = el("span", "wbk-chip" + (i < idx ? " done" : i === idx ? " now" : ""), isWriteStep(s) ? "✏️" : "🎲");
      track.appendChild(chip);
    });
    track.setAttribute("aria-label", `خطوة ${idx + 1} من ${steps.length}`);
    head.append(title, track);
    return head;
  }

  const sayNumber = (v) => Speech.sequence([{ text: enName(v), lang: "en-US" }, { text: WB_AR[v], lang: "ar-EG" }]);

  /** سطر التعليمات: بيتكتب ويتنطق (بصيغة البنت للبنت) — وزرار 🔊 يعيده. */
  function prompt(text) {
    const row = el("div", "wbk-prompt");
    const t = el("p", "wbk-say", fem(text));
    const again = button("wbk-again", "🔊", () => { Sfx.tap(); Speech.ar(fem(text)); });
    again.setAttribute("aria-label", "اسمع تانى");
    row.append(again, t);
    Speech.ar(fem(text));
    return row;
  }
  /** جملة سريعة فى نفس السطر (غلط/تلميح) من غير ما تمسح التعليمات. */
  function hintLine() {
    const h = el("p", "wbk-hint");
    let timer = 0;
    h.show = (text) => {
      const t = fem(text);
      h.textContent = t;
      Speech.ar(t);
      clearTimeout(timer);
      timer = setTimeout(() => { h.textContent = ""; }, 3600);
    };
    return h;
  }

  function nextStep() {
    cleanup();
    cleanup = () => {};
    idx++;
    if (idx >= steps.length) return finishPage();
    renderStep();
  }
  function stepDone(delay = 900) {
    Sfx.correct();
    awardStars(1);
    setTimeout(() => { if (n) nextStep(); }, delay);
  }

  function finishPage() {
    Store.markWorkbookDone(n);
    finishActivity({ regionId, regionIndex, stars: 5, onDone: showChooser });
  }

  function renderStep() {
    cleanup();
    cleanup = () => {};
    stage.replaceChildren(header());
    const s = steps[idx];
    const body = el("section", "wbk-body wbk-step-" + s.kind);
    stage.appendChild(body);
    const skip = button("wbk-skip", "⏭", () => { Sfx.tap(); Speech.stop(); nextStep(); });
    skip.setAttribute("aria-label", "الخطوة اللى بعدها");
    stage.appendChild(skip);
    STEP[s.kind](body, s);
  }

  // ===== الخطوات =====
  const STEP = {
    // ١) اعرف الرقم: الرقم كبير، والدواير فى الشريط — الطفل يلمسها ويعدّ
    meet(body, s) {
      body.appendChild(prompt(WB_SAY.meet(WB_AR[s.n])));
      const big = button("wbk-big", "", () => { Sfx.pop(); sayNumber(s.n); });
      big.innerHTML = `<b dir="ltr">${s.n}</b><small dir="ltr">${enName(s.n)}</small>`;
      const frame = el("div", "wbk-frame" + (s.frame === 10 ? " ten" : ""));
      frame.dir = "ltr";
      let counted = 0;
      for (let i = 0; i < s.frame; i++) {
        const cell = el("span", "wbk-cell");
        if (i < s.n) {
          const dot = button("wbk-ball", "", () => {
            if (dot.classList.contains("on")) return;
            dot.classList.add("on");
            counted++;
            Sfx.pop();
            Speech.ar(WB_AR[counted]);
            if (counted === s.n) setTimeout(() => { sayNumber(s.n); stepDone(1500); }, 700);
          });
          dot.setAttribute("aria-label", "دايرة");
          cell.appendChild(dot);
        }
        frame.appendChild(cell);
      }
      body.append(big, frame);
    },

    // ✏️ الكتابة: على الخط ← على النقط (والـ«لوحده» جوّه الرقم الناقص)
    write(body, s) {
      writeBoard(body, s.n, s.level, s.level === 1 ? writeIntro("الرقم", WB_AR[s.n]) : WB_SAY.againDots, () => stepDone(700));
    },

    // «Color four of the dresses» — بلون الكتاب من علبة الألوان
    colorN(body, s) {
      const c = col(s.color);
      body.appendChild(prompt(WB_SAY.colorN(WB_AR[s.n], c.al)));
      const hint = hintLine();
      let crayon = null;
      const pal = palette(s.palette, (k) => { crayon = k; });
      const grid = el("div", "wbk-color-grid");
      const tiles = [];
      for (let i = 0; i < s.total; i++) {
        const t = button("wbk-tile", s.thing, () => {
          if (t.dataset.on) {
            delete t.dataset.on;
            t.style.removeProperty("--fill");
            Sfx.tap();
            return;
          }
          if (crayon !== s.color) {
            Sfx.wrong();
            flash(pal, "wbk-wiggle");
            return hint.show(WB_SAY.pickColor(c.al));
          }
          t.dataset.on = "1";
          t.style.setProperty("--fill", c.hex);
          Sfx.pop();
        });
        tiles.push(t);
        grid.appendChild(t);
      }
      const done = button("candy-btn wbk-done", fem("✓ خلّصت"), () => {
        const k = tiles.filter((t) => t.dataset.on).length;
        if (k === s.n) {
          done.disabled = true;
          sayNumber(s.n);
          return stepDone(1400);
        }
        Sfx.wrong();
        hint.show(k > s.n ? WB_SAY.tooMany(WB_AR[s.n]) : WB_SAY.tooFew(WB_AR[s.n]));
      });
      body.append(pal, grid, hint, done);
    },

    // «Count and choose the correct number»
    countChoose(body, s) {
      body.appendChild(prompt(WB_SAY.countChoose));
      const row = el("div", "wbk-cards");
      let left = s.cards.length;
      s.cards.forEach((card) => {
        const box = el("div", "wbk-card");
        box.appendChild(groupOf(card.thing, card.count));
        const opts = el("div", "wbk-opts");
        opts.dir = "ltr";
        card.options.forEach((v) => {
          const b = button("wbk-opt", String(v), () => {
            if (box.dataset.ok) return;
            if (v !== card.count) { Sfx.wrong(); flash(b, "wrong"); return; }
            box.dataset.ok = "1";
            b.classList.add("correct");
            Sfx.correct();
            Speech.ar(WB_AR[v]);
            if (--left === 0) stepDone(1000);
          });
          opts.appendChild(b);
        });
        box.appendChild(opts);
        row.appendChild(box);
      });
      body.appendChild(row);
    },

    // «Count, then match» — المس المجموعة وبعدين رقمها، وخط بيوصّلهم
    match(body, s) {
      body.appendChild(prompt(WB_SAY.match));
      const area = el("div", "wbk-match");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "wbk-lines");
      const groups = el("div", "wbk-mcol");
      const nums = el("div", "wbk-mcol");
      area.append(groups, nums, svg);
      let sel = null; // { node, value, side }
      let left = s.groups.length;
      const select = (node, value, side) => {
        if (node.dataset.ok) return;
        if (!sel || sel.side === side) {
          if (sel) sel.node.classList.remove("sel");
          sel = { node, value, side };
          node.classList.add("sel");
          Sfx.tap();
          return;
        }
        const other = sel;
        sel = null;
        other.node.classList.remove("sel");
        if (other.value !== value) { Sfx.wrong(); flash(node, "wrong"); flash(other.node, "wrong"); return; }
        node.dataset.ok = other.node.dataset.ok = "1";
        node.classList.add("ok");
        other.node.classList.add("ok");
        drawLine(area, svg, other.node, node);
        Sfx.correct();
        Speech.ar(WB_AR[value]);
        if (--left === 0) stepDone(1100);
      };
      s.groups.forEach((g) => {
        const b = button("wbk-mgroup", "", () => select(b, g.count, "g"));
        b.appendChild(groupOf(g.thing, g.count));
        groups.appendChild(b);
      });
      s.numbers.forEach((v) => {
        const b = button("wbk-mnum", String(v), () => select(b, v, "n"));
        nums.appendChild(b);
      });
      body.appendChild(area);
    },

    // «Color the octopus that has the number 1» — لوّن كل الدواير اللى فيها الرقم
    find(body, s) {
      body.appendChild(prompt(WB_SAY.find(WB_AR[s.n])));
      const grid = el("div", "wbk-find");
      grid.dir = "ltr";
      let left = s.cells.filter((v) => v === s.n).length;
      s.cells.forEach((v) => {
        const b = button("wbk-bubble", String(v), () => {
          if (b.dataset.on) return;
          if (v !== s.n) { Sfx.wrong(); flash(b, "wrong"); return; }
          b.dataset.on = "1";
          b.style.setProperty("--fill", col(s.color).hex);
          Sfx.pop();
          if (--left === 0) stepDone(900);
        });
        grid.appendChild(b);
      });
      body.appendChild(grid);
    },

    // مكوّنات الرقم: «2 and 1 = 3» بالصور
    parts(body, s) {
      body.appendChild(prompt(WB_SAY.parts(WB_AR[s.a], WB_AR[s.b])));
      const eq = el("div", "wbk-eq");
      eq.dir = "ltr";
      const ans = el("span", "wbk-ans", "?");
      eq.append(groupOf(s.thing, s.a, "wbk-group wbk-part"), el("span", "wbk-op", "+"),
        groupOf(s.thing, s.b, "wbk-group wbk-part"), el("span", "wbk-op", "="), ans);
      const nums = el("div", "wbk-eq wbk-eq-n");
      nums.dir = "ltr";
      nums.innerHTML = `<b>${s.a}</b><span class="wbk-op">and</span><b>${s.b}</b><span class="wbk-op">=</span><b class="wbk-q">?</b>`;
      const opts = el("div", "wbk-opts");
      opts.dir = "ltr";
      let done = false;
      s.options.forEach((v) => {
        const b = button("wbk-opt", String(v), () => {
          if (done) return;
          if (v !== s.n) { Sfx.wrong(); flash(b, "wrong"); return; }
          done = true;
          b.classList.add("correct");
          ans.textContent = String(v);
          nums.querySelector(".wbk-q").textContent = String(v);
          sayNumber(v);
          stepDone(1400);
        });
        opts.appendChild(b);
      });
      body.append(eq, nums, opts);
    },

    // «Complete the missing numbers»: يلاقى الناقص، وبعدين يكتبه لوحده
    missing(body, s) {
      body.appendChild(prompt(WB_SAY.missing));
      const row = el("div", "wbk-snow");
      row.dir = "ltr";
      const slots = s.seq.map((v, i) => {
        const m = el("div", "wbk-snowman");
        m.innerHTML = `<span class="wbk-snow-face">⛄</span>`;
        const num = el("span", "wbk-snow-num" + (i === s.blank ? " blank" : ""), i === s.blank ? "" : String(v));
        m.appendChild(num);
        row.appendChild(m);
        return num;
      });
      body.appendChild(row);
      const opts = el("div", "wbk-opts");
      opts.dir = "ltr";
s.options.forEach((v) => {
        const b = button("wbk-opt", String(v), () => {
          if (opts.dataset.ok) return;
          if (v !== s.n) { Sfx.wrong(); flash(b, "wrong"); return; }
          opts.dataset.ok = "1";
          b.classList.add("correct");
          Sfx.correct();
          slots[s.blank].classList.add("found");
          setTimeout(() => {
            opts.remove();
            writeBoard(body, s.n, s.level, null, (fails) => {
              slots[s.blank].textContent = String(s.n);
              slots[s.blank].classList.remove("blank");
              Store.recordWrite("g:" + s.n, fails, 3);
              stepDone(900);
            });
          }, 700);
        });
        opts.appendChild(b);
      });
      body.appendChild(opts);
    },

    // «Color number 1 pink and number 2 yellow»: الرقم ونقطه وحاجاته — كل واحد بلونه
    paint(body, s) {
      const [p, q] = s.pairs;
      body.appendChild(prompt(WB_SAY.paint(WB_AR[p.value], col(p.color).ar, WB_AR[q.value], col(q.color).ar)));
      const hint = hintLine();
      const legend = el("div", "wbk-legend");
      legend.dir = "ltr";
      s.pairs.forEach((x) => {
        const chip = el("span", "wbk-key");
        chip.innerHTML = `<b>${x.value}</b><i style="background:${col(x.color).hex}"></i>`;
        chip.title = col(x.color).ar;
        legend.appendChild(chip);
      });
      let crayon = null;
      const pal = palette(s.pairs.map((x) => x.color), (k) => { crayon = k; });
      const grid = el("div", "wbk-paint");
      let left = s.tiles.length;
      s.tiles.forEach((t) => {
        const want = s.pairs.find((x) => x.value === t.value).color;
        const b = button("wbk-ptile", "", () => {
          if (b.dataset.on) return;
          if (!crayon) { Sfx.wrong(); flash(pal, "wbk-wiggle"); return hint.show(WB_SAY.pickColor(col(want).al)); }
          if (crayon !== want) { Sfx.wrong(); flash(b, "wrong"); return hint.show(WB_SAY.paintWrong); }
          b.dataset.on = "1";
          b.style.setProperty("--fill", col(want).hex);
          Sfx.pop();
          if (--left === 0) stepDone(1000);
        });
        if (t.rep === "digit") b.appendChild(el("span", "wbk-pdigit", String(t.value)));
        else if (t.rep === "dots") b.appendChild(dotsFor(t.value));
        else b.appendChild(groupOf(t.thing, t.value, "wbk-group wbk-mini"));
        b.setAttribute("aria-label", `العدد ${t.value}`);
        grid.appendChild(b);
      });
      body.append(legend, pal, grid, hint);
    },
  };

  /** علبة ألوان (أقلام) — اختيار واحد. */
  function palette(keys, onPick) {
    const box = el("div", "wbk-palette");
    keys.forEach((k) => {
      const c = col(k);
      const b = button("wbk-crayon", c.ar, () => {
        box.querySelectorAll(".wbk-crayon").forEach((x) => x.classList.toggle("is-on", x === b));
        Sfx.tap();
        Speech.ar(c.ar);
        onPick(k);
      });
      b.style.setProperty("--crayon", c.hex);
      b.setAttribute("aria-label", "لون " + c.ar);
      box.appendChild(b);
    });
    return box;
  }

  /** لوحة الكتابة للرقم v بمستوى المساعدة ده. done(fails). */
  function writeBoard(host, v, level, intro, done) {
    const strokes = strokesFor(String(v));
    const hint = hintLine();
    const wrap = el("div", "wbk-write");
    host.appendChild(wrap);
    if (intro) host.insertBefore(prompt(intro), wrap);
    const board = mountWriteBoard(wrap, {
      ...penBoardOptions((text) => hint.show(text)),
      strokes,
      level,
      onHint: (text) => { Sfx.wrong(); hint.show(text); },
      onDone: ({ fails }) => {
        board.el.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 450 });
        Speech.en(enName(v));
        done(fails);
      },
    });
    const tools = el("div", "wbk-tools");
    tools.append(
      button("candy-btn", fem("👀 شوف إزاى"), () => { Sfx.tap(); board.demo(); }),
      button("candy-btn", "🔁", () => { Sfx.tap(); board.reset(); }),
    );
    host.append(hint, tools);
    cleanup = () => board.destroy();
    // أول كتابة فى اليوم: كارت مسكة القلم. والصباع بيوريه إزاى كل مرة اللوحة تتفتح —
    // كل المستويات (المالك ٢٠٢٦-١٠-١٠: «عاوزها تظهر فى كل مرة»)
    showGripCard();
    whenGripClosed(() => setTimeout(() => board.demo(), 1400));
  }

  setTimeout(() => {
    if (startN && WB_NUMBERS.includes(+startN)) openPage(+startN);
    else showChooser();
  }, 0);
  return screen;
}

/** خط بين مجموعة ورقمها جوّه منطقة التوصيل (بيترسم بعد ما الاتنين يتوصّلوا). */
function drawLine(area, svg, a, b) {
  const r = area.getBoundingClientRect();
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const left = ra.left < rb.left ? ra : rb;
  const right = ra.left < rb.left ? rb : ra;
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(left.right - r.left));
  line.setAttribute("y1", String(left.top + left.height / 2 - r.top));
  line.setAttribute("x2", String(right.left - r.left));
  line.setAttribute("y2", String(right.top + right.height / 2 - r.top));
  svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  svg.appendChild(line);
}
