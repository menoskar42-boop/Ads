// ===== لعبة "أشكال الحرف": الحرف في أول/وسط/آخر الكلمة =====
// يتصفّح الطفل الحروف ويرى كل حرف في مواضعه الثلاثة (متّصلاً)،
// مع النطق. نستخدم التطويل (ـ U+0640) لإظهار الأشكال المتّصلة.
import { ARABIC_LETTERS } from "../data/arabicLetters.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { gameTopbar, progressDots, finishActivity } from "./common.js";

const TATWEEL = "ـ"; // ـ
// حروف لا تتّصل بما بعدها (أحادية الاتصال) — لا نضع تطويلاً بعدها
const NON_CONNECTORS = new Set(["ا", "أ", "إ", "آ", "د", "ذ", "ر", "ز", "و"]);

export function renderLetterForms({ regionId, regionIndex }) {
  const items = ARABIC_LETTERS;
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#cfe9ff,#8fb6ff)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar("🔡 أشكال الحرف", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function forms(ch) {
    const connectsAfter = !NON_CONNECTORS.has(ch);
    return {
      start: connectsAfter ? ch + TATWEEL : ch,            // أول الكلمة
      middle: connectsAfter ? TATWEEL + ch + TATWEEL : TATWEEL + ch, // وسطها
      end: TATWEEL + ch,                                    // آخرها
    };
  }

  function card(label, glyph, it) {
    const c = document.createElement("button");
    c.className = "lf-card";
    c.innerHTML = `<div class="lf-label">${label}</div><div class="lf-glyph">${glyph}</div>`;
    c.addEventListener("click", () => {
      Sfx.pop();
      Speech.ar(`${it.name} في ${label}`);
    });
    return c;
  }

  function render() {
    const it = items[i];
    const f = forms(it.char);
    stage.innerHTML = "";
    stage.appendChild(progressDots(items.length, i - 1));

    const title = document.createElement("p");
    title.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(18px,5vw,26px)";
    title.textContent = `حرف ${it.name} في الكلمة`;
    stage.appendChild(title);

    const row = document.createElement("div");
    row.className = "lf-row";
    row.append(
      card("أول الكلمة", f.start, it),
      card("وسط الكلمة", f.middle, it),
      card("آخر الكلمة", f.end, it)
    );
    stage.appendChild(row);

    // مثال الكلمة
    const ex = document.createElement("p");
    ex.style.cssText = "font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(16px,4.5vw,22px);margin-top:6px";
    ex.textContent = `مثال: ${it.char} مثل ${it.word} ${it.emoji}`;
    stage.appendChild(ex);

    const nav = document.createElement("div");
    nav.style.cssText = "display:flex;gap:12px;justify-content:center;margin-top:18px";
    const prev = document.createElement("button");
    prev.className = "candy-btn"; prev.textContent = "‹ السابق"; prev.disabled = i === 0;
    prev.style.opacity = i === 0 ? ".4" : "1";
    prev.addEventListener("click", () => { if (i > 0) { i--; Sfx.tap(); render(); } });
    const say = document.createElement("button");
    say.className = "candy-btn"; say.style.background = "linear-gradient(180deg,#34d399,#16a34a)"; say.textContent = "🔊 اسمع";
    say.addEventListener("click", () => { Sfx.tap(); speakAll(it, f); });
    const next = document.createElement("button");
    next.className = "candy-btn"; next.textContent = i >= items.length - 1 ? "أنهيت ✅" : "التالي ›";
    next.addEventListener("click", () => {
      Sfx.whoosh();
      Store.markSeen("arabic", it.char);
      if (i >= items.length - 1) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
      else { i++; render(); }
    });
    nav.append(prev, say, next);
    stage.appendChild(nav);

    speakAll(it, f);
  }

  function speakAll(it, f) {
    Speech.sequence([
      { text: it.name, lang: "ar-EG" },
      { text: `في أول الكلمة ${f.start}`, lang: "ar-EG" },
      { text: `في وسط الكلمة ${f.middle}`, lang: "ar-EG" },
      { text: `في آخر الكلمة ${f.end}`, lang: "ar-EG" },
    ]);
  }

  setTimeout(render, 0);
  return screen;
}
