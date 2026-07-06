// ===== بطاقات التعرّف: يتصفّح الطفل العناصر ويعرف كلٌّ ما هو =====
// تصفّح حرّ (سابق/تالي) بلا اختبار: تعرض الحرف/الرقم/الشيء كبيراً + اسمه،
// وتنطقه تلقائياً وعند الضغط. تدعم كل المجموعات.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { gameTopbar } from "./common.js";

export function renderFlashcards({ regionId, regionIndex, datasetKey, lang, title }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang;
  const items = ds.items;
  const kind = ds.glyphKind; // "letter" أو "emoji"
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#cfe9ff,#9fb8ff)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "👀 شوف واعرف", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  // العنصر المعروض الكبير
  const card = document.createElement("div");
  card.style.cssText =
    "position:relative;width:min(80vw,340px);aspect-ratio:1;background:#fff;border-radius:32px;" +
    "box-shadow:var(--shadow-card);display:flex;align-items:center;justify-content:center;cursor:pointer;margin:6px auto";
  stage.appendChild(card);

  const nameEl = document.createElement("div");
  nameEl.style.cssText =
    "font-size:clamp(24px,7vw,38px);font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);margin-top:14px;text-align:center";
  stage.appendChild(nameEl);

  const subEl = document.createElement("div");
  subEl.style.cssText =
    "font-size:clamp(15px,4vw,20px);font-weight:700;color:#fff;opacity:.95;margin-top:4px;text-align:center";
  stage.appendChild(subEl);

  // أزرار التنقّل
  const nav = document.createElement("div");
  nav.style.cssText = "display:flex;gap:14px;justify-content:center;align-items:center;margin-top:20px";
  const prevBtn = document.createElement("button");
  prevBtn.className = "candy-btn";
  prevBtn.textContent = "‹ السابق";
  const sayBtn = document.createElement("button");
  sayBtn.className = "candy-btn";
  sayBtn.style.background = "linear-gradient(180deg,#34d399,#16a34a)";
  sayBtn.textContent = "🔊 اسمع";
  const nextBtn = document.createElement("button");
  nextBtn.className = "candy-btn";
  nextBtn.textContent = "التالي ›";
  nav.append(prevBtn, sayBtn, nextBtn);
  stage.appendChild(nav);

  function glyphHtml(it) {
    if (kind === "letter") {
      return `<span style="font-size:clamp(120px,40vw,230px);font-weight:800;color:var(--c-purple);line-height:1">${it.char}</span>`;
    }
    if (it.arDigit) {
      // أرقام: نعرض الرقم العربي والإنجليزي
      return `<span style="font-size:clamp(110px,36vw,210px);font-weight:800;color:var(--c-purple);line-height:1">${it.arDigit}<span style="font-size:.45em;opacity:.7"> (${it.value})</span></span>`;
    }
    return `<span style="font-size:clamp(120px,40vw,220px);line-height:1">${it.emoji}</span>`;
  }

  function speak(it) {
    if (kind === "letter") {
      // الحرف ثم مثاله
      const ex = speakLang.startsWith("en") ? `${it.name} for ${it.word}` : `${it.name} مثل ${it.word}`;
      Speech.sequence([
        { text: it.name, lang: speakLang },
        { text: ex, lang: speakLang },
      ]);
    } else if (it.arDigit) {
      Speech.sequence([
        { text: it.arName, lang: "ar-EG" },
        { text: it.enName, lang: "en-US" },
      ]);
    } else {
      Speech.sequence([
        { text: it.name, lang: "ar-EG" },
        { text: it.en, lang: "en-US" },
      ]);
    }
  }

  function render(auto = true) {
    const it = items[i];
    // سجّل أن الطفل رأى هذا العنصر (للمراجعة المتباعدة لاحقاً)
    Store.markSeen(datasetKey, it.char ?? (it.value != null ? String(it.value) : it.name));
    card.innerHTML = glyphHtml(it);
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "pop-in .3s ease";

    // الاسم والوصف
    if (kind === "letter") {
      nameEl.textContent = it.name;
      subEl.textContent = `${it.char} مثل ${it.word} ${it.emoji}`;
    } else if (it.arDigit) {
      nameEl.textContent = it.arName;
      subEl.textContent = it.enName;
    } else {
      nameEl.textContent = it.name;
      subEl.textContent = it.en;
    }

    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === items.length - 1;
    prevBtn.style.opacity = prevBtn.disabled ? ".4" : "1";
    nextBtn.style.opacity = nextBtn.disabled ? ".4" : "1";

    if (auto) speak(it);
  }

  card.addEventListener("click", () => { Sfx.pop(); speak(items[i]); });
  sayBtn.addEventListener("click", () => { Sfx.tap(); speak(items[i]); });
  prevBtn.addEventListener("click", () => {
    if (i > 0) { i--; Sfx.tap(); render(); }
  });
  nextBtn.addEventListener("click", () => {
    if (i < items.length - 1) { i++; Sfx.tap(); render(); }
  });

  setTimeout(() => render(true), 0);
  return screen;
}
