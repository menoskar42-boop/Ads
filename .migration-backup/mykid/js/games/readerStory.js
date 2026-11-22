// ===== «قصص الحروف» — الشاشة (البند ٢٦، موافقة المالك ٢٠٢٦-١١-١٧) =====
// اختار قصة ← صفحة صفحة: ميزو بيقرا كلمة كلمة والكلمة بتنوّر، والطفل يدوس على أى كلمة يسمعها ←
// 🎨 لوّن الكلمة (قال بالأحمر وقالت بالأخضر) ← 🗣️ صِف الصورة ← ❓ سؤالين فهم.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity, mizoBuddy } from "./common.js";
import { femAdapt } from "../data/mizo.js";
import { sceneArtSvg } from "./storychars.js";
import { LB_UNITS } from "../data/letterbook.js";
import { READER_STORIES, storyWords, bareWord } from "../data/readerStories.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const SAY_CSS = "text-align:center;font-weight:800;color:#3b2a6b;font-size:clamp(17px,4.8vw,22px);margin:8px 12px";
const PAPER = "background:#fffdf6;border-radius:22px;box-shadow:0 6px 0 rgba(0,0,0,.12);padding:12px 14px;margin:8px auto;max-width:min(94vw,560px)";

function art(page) {
  const box = el("div", "display:flex;justify-content:center;align-items:flex-end;gap:6px;min-height:130px");
  const main = el("div", "width:clamp(96px,28vw,140px)");
  main.innerHTML = sceneArtSvg(page.art) || `<span style="font-size:clamp(70px,20vw,100px);line-height:1">${page.art}</span>`;
  box.append(main);
  if (page.with) box.append(el("span", "font-size:clamp(46px,13vw,70px);line-height:1", page.with));
  return box;
}

/** الحروف اللى القصة محتاجاها خلصت فى الكراسة؟ (نجمة على كل صفحات حروف الوحدة) */
function unitStarred(unit) {
  const pages = (LB_UNITS[unit]?.pages || []).filter((p) => p.type === "letter");
  return pages.length > 0 && pages.every((p) => Store.letterbookDone[p.id]);
}

export function renderReaderStory({ regionId, regionIndex, story: startId, back: backTo }) {
  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffe9c7,#ffc98b)";
  const back = () => (backTo ? Router.go(backTo, { regionId, regionIndex }) : Router.go("region", { id: regionId, index: regionIndex }));
  screen.appendChild(gameTopbar("📚 قصص الحروف", back));
  const stage = el("div");
  stage.dataset.rs = "stage";
  screen.appendChild(stage);
  let alive = true;
  const sayAr = (t, onend) => Speech.ar(fem(t), { onend });

  function chooser() {
    stage.replaceChildren();
    stage.dataset.step = "choose";
    stage.append(el("p", SAY_CSS, fem("اختار قصة — كل كلماتها من حروف الكراسة")));
    const list = el("div", "display:grid;gap:10px;max-width:min(94vw,520px);margin:0 auto 24px");
    for (const s of READER_STORIES) {
      const b = el("button", "display:flex;align-items:center;gap:12px;padding:12px 14px;text-align:start;font-size:20px;font-weight:800");
      b.className = "choice";
      b.dataset.story = s.id;
      const icon = el("span", "font-size:40px", s.pages[0].art);
      const txt = el("span", "display:flex;flex-direction:column;gap:2px");
      txt.append(el("span", "", s.title), el("small", "font-size:13px;font-weight:700;opacity:.7",
        `الوحدة ${s.unit} · ${(LB_UNITS[s.unit]?.pages || []).filter((p) => p.type === "letter").map((p) => p.ch).join(" ")}${unitStarred(s.unit) ? " ⭐" : ""}`));
      b.append(icon, txt);
      b.addEventListener("click", () => { Sfx.tap(); play(s); });
      list.append(b);
    }
    stage.append(list);
    sayAr("اختار قصة");
  }

  function play(story) {
    const buddy = mizoBuddy();
    let i = 0;

    // ── القراءة ─────────────────────────────────────────────────
    function readPage() {
      stage.replaceChildren();
      stage.dataset.step = "read";
      const page = story.pages[i];
      const paper = el("div", PAPER);
      paper.append(el("p", "margin:0 0 4px;text-align:center;font-weight:800;color:#a16207", `${story.title} · ${i + 1} من ${story.pages.length}`), art(page));
      const line = el("p", "margin:10px 0 4px;text-align:center;font-size:clamp(30px,8.5vw,44px);line-height:1.9;font-weight:700;color:#1f2937");
      line.dir = "rtl";
      const spans = [];
      for (const raw of page.text.split(/\s+/)) {
        const w = el("span", "border-radius:10px;padding:0 4px;cursor:pointer;transition:background .2s", raw);
        w.dataset.word = storyWords(raw)[0] || raw;
        w.addEventListener("click", () => { Sfx.tap(); Speech.ar(w.dataset.word); });
        spans.push(w);
        line.append(w, document.createTextNode(" "));
      }
      paper.append(line);
      stage.append(paper, buddy.el);
      const nav = el("div", "display:flex;gap:10px;justify-content:center;margin:8px auto 20px");
      const again = el("button", "", "🔊 اقرا تانى");
      again.className = "candy-btn";
      const next = el("button", "", i + 1 < story.pages.length ? "التالى ⟵" : "يلا نلعب ⟵");
      next.className = "candy-btn";
      next.dataset.rs = "next";
      nav.append(again, next);
      stage.append(nav);
      // ميزو بيقرا كلمة كلمة والكلمة بتنوّر
      const readAloud = () => {
        let k = 0;
        const step = () => {
          if (!alive) return;
          spans.forEach((s, j) => { s.style.background = j === k ? "#fde68a" : ""; });
          if (k >= spans.length) return;
          Speech.ar(spans[k].dataset.word, { onend: () => { k++; setTimeout(step, 120); } });
        };
        step();
      };
      again.addEventListener("click", () => { Sfx.tap(); readAloud(); });
      next.addEventListener("click", () => { Sfx.tap(); Speech.stop(); i++; if (i < story.pages.length) readPage(); else colorStep(); });
      setTimeout(readAloud, 300);
    }

    // ── 🎨 لوّن الكلمة ──────────────────────────────────────────
    function colorStep() {
      stage.replaceChildren();
      stage.dataset.step = "color";
      const rules = [story.color, story.color.second].filter(Boolean);
      const want = (w) => rules.find((r) => r.words.some((x) => bareWord(x) === bareWord(w)));
      stage.append(el("p", SAY_CSS, fem(rules.map((r) => r.label).join(" "))));
      const paper = el("div", PAPER + ";direction:rtl;text-align:center;font-size:clamp(24px,6.5vw,32px);line-height:2;font-weight:700");
      let left = 0;
      for (const p of story.pages) {
        const row = el("p", "margin:2px 0");
        for (const raw of p.text.split(/\s+/)) {
          const w = storyWords(raw)[0] || raw;
          const rule = want(w);
          const b = el("span", "border-radius:10px;padding:0 4px;cursor:pointer", raw);
          if (rule) { left++; b.dataset.good = "1"; }
          b.addEventListener("click", () => {
            if (b.dataset.done) return;
            if (!rule) { Sfx.wrong(); buddy.lose(); b.style.background = "#e5e7eb"; setTimeout(() => { b.style.background = ""; }, 400); return; }
            b.dataset.done = "1";
            b.style.background = rule.hex;
            b.style.color = "#fff";
            Sfx.correct();
            Speech.ar(w);
            if (--left === 0) { buddy.win(); awardStars(1); setTimeout(describeStep, 1200); }
          });
          row.append(b, document.createTextNode(" "));
        }
        paper.append(row);
      }
      stage.append(paper, buddy.el);
      sayAr(rules.map((r) => r.label).join(" "));
    }

    // ── 🗣️ صِف الصورة ─────────────────────────────────────────
    function describeStep() {
      stage.replaceChildren();
      stage.dataset.step = "describe";
      const page = story.pages[Math.min(1, story.pages.length - 1)];
      const paper = el("div", PAPER);
      paper.append(art(page));
      stage.append(el("p", SAY_CSS, fem("صِف الصورة: قول بصوت عالى")), paper, buddy.el);
      const qs = el("div", "display:grid;gap:8px;max-width:min(94vw,520px);margin:6px auto");
      for (const q of story.describe) {
        const b = el("button", "font-size:19px;font-weight:800", `🔊 ${fem(q)}`);
        b.className = "choice";
        b.addEventListener("click", () => { Sfx.tap(); sayAr(q); });
        qs.append(b);
      }
      const done = el("button", "display:block;margin:12px auto 20px", fem("✔ قلت"));
      done.className = "candy-btn";
      done.dataset.rs = "next";
      done.addEventListener("click", () => { Sfx.tap(); Speech.stop(); awardStars(1); quizStep(0); });
      stage.append(qs, done);
      Speech.sequence([{ text: fem("صِف الصورة. قول بصوت عالى"), lang: "ar-EG" }, { text: fem(story.describe[0]), lang: "ar-EG" }], 400);
    }

    // ── ❓ سؤالين فهم ─────────────────────────────────────────
    function quizStep(qi) {
      if (qi >= story.quiz.length) return finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
      stage.replaceChildren();
      stage.dataset.step = "quiz";
      const q = story.quiz[qi];
      stage.append(el("p", SAY_CSS, `❓ ${fem(q.q)}`), buddy.el);
      const row = el("div", "display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:10px auto");
      q.options.forEach((o, k) => {
        const b = el("button", "display:flex;flex-direction:column;align-items:center;gap:4px;min-width:96px;font-size:18px;font-weight:800");
        b.className = "choice choice-img";
        if (k === q.answer) b.dataset.good = "1";
        b.append(el("span", "font-size:52px;line-height:1.1", o.e), el("span", "", o.t));
        b.addEventListener("click", () => {
          Speech.ar(o.t);
          if (k !== q.answer) { b.classList.add("wrong"); Sfx.wrong(); buddy.lose(); setTimeout(() => b.classList.remove("wrong"), 450); return; }
          b.classList.add("correct");
          Sfx.correct();
          buddy.win();
          awardStars(1);
          setTimeout(() => quizStep(qi + 1), 1300);
        });
        row.append(b);
      });
      stage.append(row);
      sayAr(q.q);
    }

    readPage();
  }

  const start = READER_STORIES.find((s) => s.id === startId);
  setTimeout(() => (start ? play(start) : chooser()), 0);
  return screen;
}
