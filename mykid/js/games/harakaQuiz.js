// ===== «اسمع واعرف الحركة»: لعبة الحركات من الصوت (المالك ٢٠٢٦-١٠-١٩) =====
// ميزو بيقول الحرف بحركة (بُ) أو كلمة (بُرتقال)، والطفل يلمس الحركة الصح من ٤ كروت
// (كل كارت بإشارة إيد الكتاب 🙋 ✊ 👇 ✋). كل إجابة صح بتنوّر نجمة فوق؛ والغلط مابيقولش
// «غلط»: «قرّب! اسمع تانى»، وبعد مرتين الكارت الصح بينوّر — والجولة دى بترجع فى الآخر
// لحد ما تتجاوب صح (اللعبة ماتخلصش غير لما كل الحركات تتعرف).
// بتتركّب فى «ارسم الحرف» (games/trace.js) وفى «كراسة الحروف» (games/letterbook.js).
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { HQ_SAY } from "../data/writingPhrases.js";
import { harakaQuizRounds, hqOptions } from "../data/harakaQuiz.js";
import { splitAt } from "../data/letterbook.js";

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * host: العنصر اللى اللعبة بتترسم جوّاه. fem: تأنيث كلام ميزو للبنت.
 * onDone({ mistakes }) لما كل الجولات تتجاوب صح.
 */
export function mountHarakaQuiz(host, { ch, fem = (t) => t, rnd = Math.random, onDone }) {
  const queue = harakaQuizRounds(ch, rnd);
  const total = queue.length;
  const opts = hqOptions(ch);
  let solved = 0, mistakes = 0, alive = true;

  const wrap = el("div", "hq");
  const say = el("p", "hq-say", fem(HQ_SAY.intro));
  const stars = el("div", "hq-stars");
  stars.setAttribute("aria-label", "النجوم");
  const card = el("button", "hq-card");
  card.type = "button";
  card.setAttribute("aria-label", "اسمع تانى");
  const row = el("div", "hq-opts");
  wrap.append(say, stars, card, row);
  host.appendChild(wrap);

  const paintStars = () => stars.replaceChildren(...Array.from({ length: total }, (_, i) => el("span", "hq-star" + (i < solved ? " on" : ""), "⭐")));
  const tell = (t) => { say.textContent = fem(t); Speech.ar(fem(t)); };

  function round() {
    if (!alive || !wrap.isConnected) return;
    const R = queue.shift();
    let wrongs = 0, locked = false;
    paintStars();
    // الكلمة من غير تشكيل (التشكيل هو السؤال) والحرف ملوّن جوّاها — أو الحرف لوحده بعلامة استفهام
    if (R.w) {
      const { before, letter, after } = splitAt(R.w, ch);
      card.innerHTML = `<span class="hq-emoji">${R.e}</span><b class="hq-word">${before}<span class="hq-hl">${letter}</span>${after}</b><small>🔊</small>`;
    } else {
      card.innerHTML = `<b class="hq-letter">${ch}</b><span class="hq-q">؟</span><small>🔊</small>`;
    }
    const hear = () => Speech.ar(R.say);
    card.onclick = () => { Sfx.tap(); hear(); };
    row.replaceChildren();
    opts.forEach((o) => {
      const b = el("button", "hq-opt");
      b.type = "button";
      b.innerHTML = `<b>${o.s}</b><span class="hq-hand">${o.hand}</span><small>${o.ar}</small>`;
      if (o.h === R.h) b.dataset.good = "1";
      b.addEventListener("click", () => {
        if (locked || !alive) return;
        if (o.h !== R.h) {
          Sfx.wrong();
          mistakes++;
          b.classList.remove("hq-shake"); void b.offsetWidth; b.classList.add("hq-shake");
          if (++wrongs >= 2) {
            // بعد مرتين: الصح بينوّر، وميزو بيقوله — والجولة دى بترجع فى الآخر
            locked = true;
            row.querySelector('[data-good="1"]').classList.add("reveal-hint");
            tell(HQ_SAY.reveal);
            setTimeout(() => Speech.ar(R.say), 1600);
            queue.push(R);
            return setTimeout(round, 3600);
          }
          tell(HQ_SAY.wrong);
          return setTimeout(hear, 1400);
        }
        locked = true;
        b.classList.add("hq-pop");
        Sfx.correct();
        awardStars(1);
        solved++;
        paintStars();
        Speech.sequence([{ text: R.s, lang: "ar-EG" }, { text: fem(HQ_SAY.right[R.h]), lang: "ar-EG" }], 150);
        say.textContent = fem(HQ_SAY.right[R.h]);
        setTimeout(() => {
          if (!alive) return;
          if (queue.length) return round();
          alive = false;
          tell(HQ_SAY.done);
          setTimeout(() => onDone && onDone({ mistakes }), 1800);
        }, 1700);
      });
      row.appendChild(b);
    });
    setTimeout(hear, solved || wrongs ? 300 : 3200); // أول مرة بعد ما ميزو يشرح
  }
  Speech.ar(fem(HQ_SAY.intro));
  setTimeout(round, 60);
  return { el: wrap, destroy() { alive = false; wrap.remove(); } };
}
