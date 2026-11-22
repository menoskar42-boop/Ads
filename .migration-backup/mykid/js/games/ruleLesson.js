// ===== درس قاعدة قراءة: شرح + كلمات مثال تُنطق =====
import { getRule } from "../data/readingRules.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, finishActivity } from "./common.js";
import { createCharacter } from "./character.js";

export function renderRuleLesson({ regionId, regionIndex, ruleId, title }) {
  const rule = getRule(ruleId);
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#dcecff,#a9c6ff)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || `📖 ${rule.title}`, back));

  const wrap = document.createElement("div");
  wrap.className = "lesson";
  screen.appendChild(wrap);

  // المعلّم ميزو يشرح
  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble">${rule.explain}</div>`;
  wrap.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);

  function speak(text, ms) { mizo.startTalking(ms || text.length * 80 + 1400); Speech.ar(text); }

  // كلمات الأمثلة (اضغط لتسمع)
  const grid = document.createElement("div");
  grid.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:18px 10px";
  rule.examples.forEach((ex) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.style.cssText = "flex-direction:column;gap:4px;min-width:110px;padding:14px 16px";
    b.innerHTML = `<span style="font-size:clamp(26px,7vw,40px);font-weight:800;color:var(--c-purple)">${ex.word}</span>
      <span style="font-size:13px;color:#7a6ca8;font-weight:700">${ex.note || ""}</span>`;
    b.addEventListener("click", () => { Sfx.pop(); mizo.startTalking(1600); Speech.ar(ex.word); });
    grid.appendChild(b);
  });
  wrap.appendChild(grid);

  const ctrl = document.createElement("div");
  ctrl.className = "lesson-controls";
  const playBtn = document.createElement("button");
  playBtn.className = "candy-btn";
  playBtn.textContent = "🔊 أعد الشرح";
  playBtn.addEventListener("click", () => speak(rule.explain));
  const doneBtn = document.createElement("button");
  doneBtn.className = "candy-btn";
  doneBtn.style.background = "linear-gradient(180deg,#34d399,#10b981)";
  doneBtn.textContent = "✓ فهمت";
  doneBtn.addEventListener("click", () => finishActivity({ regionId, regionIndex, stars: 5, onDone: back }));
  ctrl.append(playBtn, doneBtn);
  wrap.appendChild(ctrl);

  setTimeout(() => speak(rule.explain), 200);
  return screen;
}
