// ===== لعبة "رتّب حسب الحجم": من الأصغر للأكبر =====
// مهارة التسلسل (Seriation) المهمّة لمرحلة ما قبل المدرسة. ميزو يوجّه الطفل
// ويشجّعه، ويأشّر للأصغر عند التعثّر — تجربة دافئة تربط الطفل باللعبة.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, shuffle, finishActivity, diffCount } from "./common.js";
import { glyphMarkup } from "./glyph.js";
import { createCharacter } from "./character.js";

const ROUNDS = 5;
const SIZES = { 3: [0.58, 0.84, 1.12], 4: [0.5, 0.72, 0.94, 1.18] };

export function renderSeriation({ regionId, regionIndex, datasetKey, title, bg }) {
  const ds = getDataset(datasetKey || "fruits");
  let round = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#cdeffd,#7fc8f0)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "📏 رتّب حسب الحجم", back));

  const teacher = document.createElement("div");
  teacher.className = "lesson-teacher";
  teacher.innerHTML = `<div class="miz-slot"></div><div class="teacher-bubble"></div>`;
  screen.appendChild(teacher);
  const mizo = createCharacter();
  teacher.querySelector(".miz-slot").appendChild(mizo.el);
  const bubble = teacher.querySelector(".teacher-bubble");

  const tray = document.createElement("div");
  tray.className = "seri-tray";
  screen.appendChild(tray);

  const say = (t, ms) => { mizo.startTalking(ms || t.length * 90 + 900); Speech.mizo(t); };

  function render() {
    tray.innerHTML = "";
    mizo.setMood("happy");
    const n = diffCount(3, 4); // الصغار ٣ أحجام، الكبار ٤
    const sizes = SIZES[n];
    const item = shuffle(ds.items)[0]; // نفس العنصر بأحجام مختلفة
    const prompt = "رتّب من الأصغر للأكبر! اضغط الأصغر الأوّل 👇";
    bubble.textContent = prompt;
    setTimeout(() => say(prompt), 150);

    let expected = 0; // الرتبة المنتظَرة (٠ = الأصغر)
    // أزرار بترتيب عشوائي، كلٌّ يحمل رتبته الحقيقية
    shuffle(sizes.map((s, rank) => ({ s, rank }))).forEach(({ s, rank }) => {
      const b = document.createElement("button");
      b.className = "choice seri-cell";
      b.style.transform = `scale(${s})`;
      b.innerHTML = glyphMarkup(item, "seri-glyph");
      b.addEventListener("click", () => {
        if (b.classList.contains("done")) return;
        if (rank === expected) {
          b.classList.add("done", "correct");
          Sfx.pop();
          expected++;
          if (expected >= n) {
            Sfx.correct();
            mizo.setMood("cheer", 1500);
            awardStars(1);
            say("برافو! رتّبتهم صح من الأصغر للأكبر 👏", 1600);
            round++;
            if (round >= ROUNDS) setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1300);
            else setTimeout(render, 1400);
          }
        } else {
          Sfx.wrong();
          b.classList.add("wrong");
          setTimeout(() => b.classList.remove("wrong"), 450);
          // تلميح: ميزو يأشّر للأصغر المتبقّي
          mizo.setMood("point", 1400);
          // الأصغر بين المتبقّين = أقلّ scale
          const remaining = [...tray.children].filter((c) => !c.classList.contains("done"));
          remaining.sort((a, z) => parseFloat(a.style.transform.match(/[\d.]+/)) - parseFloat(z.style.transform.match(/[\d.]+/)));
          remaining[0].classList.add("reveal-hint");
          setTimeout(() => remaining[0].classList.remove("reveal-hint"), 1400);
          say("لأ، دوّر على الأصغر!", 1300);
        }
      });
      tray.appendChild(b);
    });
  }

  setTimeout(render, 0);
  return screen;
}
