// ===== لعبة "وصّل النقاط": اربط الأرقام بالترتيب لتظهر الصورة =====
// تنمّي ترتيب الأرقام + التركيز + المهارة الحركية الدقيقة. هادئة ومريحة
// (ممتازة لكل الأطفال وخاصّة مفرطي الحركة). ميزو يوجّه ويحتفل.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Confetti } from "../core/confetti.js";
import { gameTopbar, shuffle, finishActivity, diffCount } from "./common.js";
import { createCharacter } from "./character.js";

// أشكال مغلقة: النقاط بترتيب يرسم حدّ الشكل (إحداثيات 0..100)
const FIGURES = [
  { name: "مثلث", emoji: "🔺", dots: [[50, 16], [84, 82], [16, 82]] },
  { name: "مربّع", emoji: "🟦", dots: [[24, 24], [76, 24], [76, 76], [24, 76]] },
  { name: "ماسة", emoji: "💎", dots: [[50, 12], [86, 50], [50, 88], [14, 50]] },
  { name: "بيت", emoji: "🏠", dots: [[50, 10], [86, 42], [80, 86], [20, 86], [14, 42]] },
  { name: "قلب", emoji: "❤️", dots: [[50, 32], [68, 16], [86, 34], [50, 84], [14, 34], [32, 16]] },
  { name: "سمكة", emoji: "🐟", dots: [[18, 50], [44, 30], [74, 34], [88, 50], [74, 66], [44, 70]] },
  { name: "نجمة", emoji: "⭐", dots: [[50, 10], [61, 38], [90, 38], [66, 57], [76, 88], [50, 69], [24, 88], [34, 57], [10, 38], [39, 38]] },
];
const SVGNS = "http://www.w3.org/2000/svg";

export function renderDotToDot({ regionId, regionIndex, title, bg }) {
  let round = 0;
  const ROUNDS = 4;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#cfe9ff,#9ec9f5)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🔢 وصّل النقاط", back));

  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble"></div>`;
  screen.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);
  const bubble = teacher.querySelector(".teacher-bubble");

  const wrap = document.createElement("div");
  wrap.className = "dot-wrap";
  screen.appendChild(wrap);

  const say = (t, ms) => { mizo.startTalking(ms || t.length * 90 + 900); Speech.mizo(t); };

  function render() {
    wrap.innerHTML = "";
    mizo.setMood("happy");
    // اختيار شكل حسب العمر (الصغار: نقاط أقل)
    const maxDots = diffCount(5, 10);
    const pool = FIGURES.filter((f) => f.dots.length <= maxDots);
    const fig = shuffle(pool)[0];
    const n = fig.dots.length;
    const prompt = "اضغط الأرقام بالترتيب من ١ لـ" + n + " وشوف الصورة!";
    bubble.textContent = prompt;
    setTimeout(() => say(prompt), 150);

    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "dot-svg");
    const lines = document.createElementNS(SVGNS, "g");
    svg.appendChild(lines);
    // الصورة الناتجة (تظهر بعد الاكتمال)
    const reveal = document.createElementNS(SVGNS, "text");
    reveal.setAttribute("x", "50"); reveal.setAttribute("y", "56");
    reveal.setAttribute("text-anchor", "middle"); reveal.setAttribute("font-size", "40");
    reveal.setAttribute("opacity", "0"); reveal.textContent = fig.emoji;
    svg.appendChild(reveal);

    let expected = 0;
    const dotEls = [];
    fig.dots.forEach(([x, y], i) => {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "dot-node" + (i === 0 ? " next" : ""));
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", "6.5");
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y + 2.6);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "7");
      t.textContent = i + 1;
      g.appendChild(c); g.appendChild(t);
      g.addEventListener("click", () => onTap(i));
      svg.appendChild(g);
      dotEls.push(g);
    });

    function onTap(i) {
      if (i !== expected) { Sfx.wrong(); say("دوّر على رقم " + (expected + 1), 1100); return; }
      Sfx.pop();
      dotEls[i].classList.remove("next");
      dotEls[i].classList.add("done");
      if (i > 0) drawLine(fig.dots[i - 1], fig.dots[i]);
      expected++;
      if (expected < fig.dots.length) {
        dotEls[expected].classList.add("next");
      } else {
        drawLine(fig.dots[fig.dots.length - 1], fig.dots[0]); // إغلاق الشكل
        reveal.setAttribute("opacity", "1");
        reveal.setAttribute("class", "dot-reveal");
        Sfx.correct(); Confetti.burst();
        mizo.setMood("cheer", 1600);
        say("برافو! طلعت " + fig.name + " " + fig.emoji, 1700);
        round++;
        if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1500);
        else setTimeout(render, 1700);
      }
    }
    function drawLine(a, b) {
      const ln = document.createElementNS(SVGNS, "line");
      ln.setAttribute("x1", a[0]); ln.setAttribute("y1", a[1]);
      ln.setAttribute("x2", b[0]); ln.setAttribute("y2", b[1]);
      ln.setAttribute("class", "dot-line");
      lines.appendChild(ln);
    }
    wrap.appendChild(svg);
  }

  setTimeout(render, 0);
  return screen;
}
