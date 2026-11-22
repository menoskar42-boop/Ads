// ===== دردشة مع ميزو: محادثة قصيرة آمنة معدّة مسبقاً (بلا ذكاء اصطناعي) =====
// تبني صداقة الطفل مع ميزو عبر أسئلة بسيطة وردود دافئة ثابتة (صوت مخزَّن).
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";
import { createCharacter } from "./character.js";
import { MIZO_CHAT, adaptDisplay } from "../data/mizo.js";
import { Store } from "../core/storage.js";

export function renderChatMizo({ regionId, regionIndex, title }) {
  const steps = MIZO_CHAT;
  let i = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#d8f3ff,#9ad0ff)";
  const back = () => Router.go(regionId ? "region" : "home", regionId ? { id: regionId, index: regionIndex } : {});
  screen.appendChild(gameTopbar(title || "💬 دردشة مع ميزو", back));

  const wrap = document.createElement("div");
  wrap.className = "lesson";
  screen.appendChild(wrap);

  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble"></div>`;
  wrap.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);
  const bubble = teacher.querySelector(".teacher-bubble");

  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-direction:column;gap:12px;align-items:center;margin:16px 12px";
  wrap.appendChild(row);

  function say(text, ms) { mizo.startTalking(ms || text.length * 90 + 1200); Speech.mizo(text); }
  // النص المعروض يطابق المنطوق (تأنيث حسب الجنس + مناداة بالاسم)
  const disp = (t) => adaptDisplay(t, Store.childGender, Store.childName);

  function render() {
    const step = steps[i];
    bubble.textContent = disp(step.q);
    mizo.setMood("happy");
    row.innerHTML = "";
    setTimeout(() => say(step.q), 150);
    shuffle(step.opts).forEach((opt) => {
      const b = document.createElement("button");
      b.className = "candy-btn";
      b.style.cssText = "min-width:min(70vw,280px);font-size:clamp(16px,4.6vw,21px)";
      b.textContent = opt.t;
      b.addEventListener("click", () => {
        Sfx.pop();
        row.innerHTML = "";
        bubble.textContent = disp(opt.r);
        mizo.setMood("cheer", 1600);
        say(opt.r, opt.r.length * 90 + 1200);
        i++;
        if (i >= steps.length) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 5, onDone: back }), 1800);
        else setTimeout(render, 1900);
      });
      row.appendChild(b);
    });
  }

  setTimeout(render, 200);
  return screen;
}
