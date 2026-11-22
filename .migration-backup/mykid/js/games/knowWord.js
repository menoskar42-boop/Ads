// ===== «أعرف الكلمة» — الشاشة (خطة ١٣/١٤/١٨، موافقة المالك ٢٠٢٦-١١-١٧) =====
// ٨ جولات على كلمات حروف النجمة: 👂 اسمع واختار الصورة · 🖼️ شوف واختار اسمها بالسماعات · 🧩 ركّب الكلمة.
// الحساب والترتيب فى data/knowWord.js. أول محاولة فى كل جولة بس هى اللى بتتسجّل.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Store } from "../core/storage.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity, mizoBuddy } from "./common.js";
import { femAdapt } from "../data/mizo.js";
import { starredLetters } from "../data/letterRecall.js";
import { wordPool, allPictures, planRounds, recordAnswer, kwKey, lettersOf } from "../data/knowWord.js";

const fem = (t) => (Store.childGender === "girl" ? femAdapt(t) : t);
const el = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; };
const SAY_CSS = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(17px,4.8vw,24px);margin:10px 12px";

export const KW_SAY = {
  hear: "اسمع ميزو واختار الصورة",
  see: "دى اسمها إيه؟ اسمع الأصوات واختار",
  build: "ركّب الكلمة",
  noStars: "خلّص أول حرف فى الكراسة الأول، وتعالى نعرف الكلمات",
  bravo: "برافو!",
};

function picture(p, size) {
  if (!p.img) return el("span", `font-size:${size};line-height:1.1;text-align:center;display:block`, p.e);
  const img = el("img", `width:${size};height:${size};object-fit:contain;display:block;margin:0 auto`);
  img.src = `/assets/${p.img}`;
  img.alt = "";
  img.draggable = false;
  return img;
}

export function renderKnowWord({ regionId, regionIndex, lang = "ar", bg, back: backTo }) {
  const isAr = lang === "ar";
  const voice = isAr ? "ar-EG" : "en-US";
  const starred = starredLetters(lang, isAr ? Store.letterbookDone : Store.englishbookDone);
  const screen = el("div");
  screen.className = "region-screen";
  screen.style.background = bg || (isAr ? "linear-gradient(180deg,#5fb87a,#2f8a5c)" : "linear-gradient(180deg,#6f9fe8,#3f6fc6)");
  const back = () => (backTo ? Router.go(backTo, { regionId, regionIndex }) : Router.go("region", { id: regionId, index: regionIndex }));
  screen.appendChild(gameTopbar("💡 أعرف الكلمة", back));
  const stage = el("div");
  stage.dataset.kw = "stage";
  screen.appendChild(stage);
  const sayAr = (t) => Speech.ar(fem(t));
  const sayWord = (w) => Speech.say(w, { lang: voice });

  const pool = wordPool(lang, starred);
  if (!pool.length) {
    stage.append(el("p", SAY_CSS, fem(KW_SAY.noStars)));
    const go = el("button", "display:block;margin:12px auto", isAr ? "📗 افتح كراسة الحروف" : "📘 افتح كتاب الإنجليزى");
    go.className = "candy-btn";
    go.addEventListener("click", () => { Sfx.tap(); Router.go(isAr ? "letterbook" : "englishbook", { regionId, regionIndex }); });
    stage.append(go);
    setTimeout(() => sayAr(KW_SAY.noStars), 200);
    return screen;
  }

  const rounds = planRounds(lang, pool, Store.knowWords, Math.random, undefined, allPictures(lang));
  const buddy = mizoBuddy();
  let i = 0;

  const record = (r, ok) => {
    const key = kwKey(lang, r.target.w);
    Store.setKnowWord(key, recordAnswer(Store.knowWords[key], r.kind, ok, Store.today()));
  };

  function next() {
    if (i >= rounds.length) return finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
    const r = rounds[i];
    stage.replaceChildren();
    stage.dataset.kind = r.kind;
    let first = true;
    const answer = (ok, btn) => {
      if (first) { record(r, ok); first = false; }
      if (!ok) {
        if (btn) { btn.classList.add("wrong"); setTimeout(() => btn.classList.remove("wrong"), 450); }
        Sfx.wrong();
        buddy.lose();
        if (r.kind !== "see") setTimeout(() => sayWord(r.target.w), 400);
        return;
      }
      if (btn) btn.classList.add("correct");
      Sfx.correct();
      buddy.win();
      awardStars(1);
      // بعد الإجابة الصح: الصورة + الكلمة مكتوبة + بتتقال
      const done = el("div", "display:flex;flex-direction:column;align-items:center;gap:4px;margin:8px auto");
      done.dataset.kw = "done";
      done.append(picture(r.target, "clamp(70px,22vw,110px)"), el("p", SAY_CSS + `;font-size:clamp(28px,8vw,40px);margin:0;direction:${isAr ? "rtl" : "ltr"}`, r.target.w));
      stage.append(done);
      Speech.sequence([{ text: fem(KW_SAY.bravo), lang: "ar-EG" }, { text: r.target.w, lang: voice }], 150);
      i++;
      setTimeout(next, 2200);
    };

    stage.append(el("p", SAY_CSS + ";opacity:.85;font-size:15px", `${i + 1} من ${rounds.length}`));
    const listen = el("button", SAY_CSS + ";display:block;margin:6px auto;background:rgba(255,255,255,.22);border:0;border-radius:16px;padding:8px 16px;cursor:pointer", "🔊");
    listen.dataset.kw = "listen";
    listen.addEventListener("click", () => { Sfx.tap(); sayWord(r.target.w); });

    if (r.kind === "hear") {
      listen.textContent = fem(`🔊 ${KW_SAY.hear}`);
      stage.append(listen, buddy.el);
      const grid = el("div", "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:min(92vw,420px);margin:8px auto");
      for (const o of r.options) {
        const b = el("button", "padding:10px;min-height:110px;display:flex;align-items:center;justify-content:center");
        b.className = "choice choice-img";
        if (o === r.target) b.dataset.good = "1";
        b.append(picture(o, "clamp(70px,22vw,96px)"));
        b.addEventListener("click", () => answer(o === r.target, b));
        grid.append(b);
      }
      stage.append(grid);
      setTimeout(() => Speech.sequence([{ text: fem(KW_SAY.hear), lang: "ar-EG" }, { text: r.target.w, lang: voice }], 200), 250);
    } else if (r.kind === "see") {
      const big = el("div", "margin:4px auto");
      big.append(picture(r.target, "clamp(100px,30vw,160px)"));
      stage.append(big, el("p", SAY_CSS, fem(KW_SAY.see)), buddy.el);
      // كل اختيار: زرار يسمّع الكلمة + زرار «دى» يختارها — من غير ما الكلمة تتكتب
      const row = el("div", "display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:8px auto");
      r.options.forEach((o, k) => {
        const card = el("div", "display:flex;flex-direction:column;gap:6px;align-items:center");
        const hearBtn = el("button", "font-size:34px;min-width:84px;min-height:70px", `🔊${k + 1}`);
        hearBtn.className = "choice";
        hearBtn.addEventListener("click", () => { Sfx.tap(); sayWord(o.w); });
        const pick = el("button", "font-size:18px;padding:6px 14px", fem("✔ دى"));
        pick.className = "candy-btn";
        if (o === r.target) pick.dataset.good = "1";
        pick.addEventListener("click", () => answer(o === r.target, hearBtn));
        card.append(hearBtn, pick);
        row.append(card);
      });
      stage.append(row);
      setTimeout(() => sayAr(KW_SAY.see), 250);
    } else {
      const big = el("div", "margin:4px auto");
      big.append(picture(r.target, "clamp(90px,26vw,140px)"));
      listen.textContent = fem(`🔊 ${KW_SAY.build}`);
      stage.append(big, listen, buddy.el);
      const letters = lettersOf(r.target.w);
      const slots = el("div", `display:flex;gap:6px;justify-content:center;margin:8px auto;direction:${isAr ? "rtl" : "ltr"}`);
      slots.dataset.kw = "slots";
      const cells = letters.map(() => {
        const c = el("span", "min-width:46px;height:56px;border-radius:12px;background:rgba(255,255,255,.85);display:inline-flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;color:#334");
        slots.append(c);
        return c;
      });
      const tiles = el("div", `display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px auto;direction:${isAr ? "rtl" : "ltr"}`);
      let pos = 0;
      for (const ch of r.tiles) {
        const t = el("button", "font-size:30px;font-weight:900;min-width:56px", ch);
        t.className = "choice kw-tile";
        t.addEventListener("click", () => {
          if (t.disabled) return;
          if (ch !== letters[pos]) return answer(false, t);
          Sfx.tap();
          t.disabled = true;
          t.style.opacity = ".35";
          cells[pos].textContent = ch;
          pos++;
          if (pos === letters.length) { slots.replaceChildren(el("span", SAY_CSS + ";font-size:clamp(30px,8vw,42px);margin:0", r.target.w)); answer(true, null); }
        });
        tiles.append(t);
      }
      stage.append(slots, tiles);
      setTimeout(() => Speech.sequence([{ text: fem(KW_SAY.build), lang: "ar-EG" }, { text: r.target.w, lang: voice }], 200), 250);
    }
  }
  next();
  return screen;
}
