// ===== شرح الحركات القصيرة: شاشة تمهيدية للفتحة والضمة والكسرة =====
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, finishActivity } from "./common.js";

const CARDS = [
  {
    key: "fatha", mark: "َ", name: "الفَتْحَة",
    rule: "يُنطق الحرف مفتوحاً، وتوضع فوقه",
    color: "#ff5d5d",
    examples: [["زَ", "زَرَعَ"], ["دَ", "دَرَسَ"]],
    speak: "الفتحة: ينطق الحرف مفتوحاً، مثل زَ، دَ",
  },
  {
    key: "damma", mark: "ُ", name: "الضَّمَّة",
    rule: "يُنطق الحرف مضموماً، وتوضع فوقه",
    color: "#ff924c",
    examples: [["نُ", "نُفِخَ"], ["مُ", "مُدِحَ"]],
    speak: "الضمة: ينطق الحرف مضموماً، مثل نُ، مُ",
  },
  {
    key: "kasra", mark: "ِ", name: "الكَسْرَة",
    rule: "يُنطق الحرف مكسوراً، وتوضع تحته",
    color: "#34d399",
    examples: [["ضِ", "ضَحِكَ"], ["وِ", "وَسِعَ"]],
    speak: "الكسرة: ينطق الحرف مكسوراً، مثل ضِ، وِ",
  },
];

export function renderHarakatIntro({ regionId, regionIndex }) {
  let i = 0;
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#cfe9ff,#9bbcff)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("ﹷ الحركات القصيرة", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function render() {
    const c = CARDS[i];
    stage.innerHTML = "";

    // النقاط
    const dots = document.createElement("div");
    dots.className = "progress-dots";
    for (let k = 0; k < CARDS.length; k++) {
      const d = document.createElement("span");
      d.className = "dot" + (k <= i ? " active" : "");
      dots.appendChild(d);
    }
    stage.appendChild(dots);

    const big = document.createElement("div");
    big.style.cssText = `font-size:clamp(90px,30vw,180px);font-weight:800;color:${c.color};line-height:1;text-shadow:0 6px 0 rgba(0,0,0,.12)`;
    big.textContent = "ب" + c.mark;
    stage.appendChild(big);

    const name = document.createElement("p");
    name.style.cssText = `font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(22px,6vw,32px);margin:4px 0`;
    name.textContent = c.name;
    stage.appendChild(name);

    const rule = document.createElement("p");
    rule.style.cssText = "font-weight:700;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.18);font-size:clamp(15px,4.2vw,20px);max-width:520px";
    rule.textContent = c.rule;
    stage.appendChild(rule);

    // أمثلة
    const ex = document.createElement("div");
    ex.className = "choice-row";
    c.examples.forEach(([syl, word]) => {
      const card = document.createElement("button");
      card.className = "choice";
      card.style.flexDirection = "column";
      card.innerHTML = `<div style="font-weight:800;color:${c.color}">${syl}</div><div style="font-size:.4em;font-weight:800;color:var(--c-ink)">${word}</div>`;
      card.addEventListener("click", () => { Sfx.pop(); Speech.ar(word); });
      ex.appendChild(card);
    });
    stage.appendChild(ex);

    const nav = document.createElement("div");
    nav.style.cssText = "display:flex;gap:12px;justify-content:center;margin-top:18px";
    const say = document.createElement("button");
    say.className = "candy-btn"; say.style.background = "linear-gradient(180deg,#34d399,#16a34a)"; say.textContent = "🔊 اسمع";
    say.addEventListener("click", () => { Sfx.tap(); Speech.ar(c.speak); });
    const next = document.createElement("button");
    next.className = "candy-btn";
    next.textContent = i >= CARDS.length - 1 ? "أنهيت ✅" : "التالي ›";
    next.addEventListener("click", () => {
      Sfx.whoosh();
      if (i >= CARDS.length - 1) finishActivity({ regionId, regionIndex, stars: 4, onDone: back });
      else { i++; render(); }
    });
    nav.append(say, next);
    stage.appendChild(nav);

    Speech.ar(c.speak);
  }

  setTimeout(render, 0);
  return screen;
}
