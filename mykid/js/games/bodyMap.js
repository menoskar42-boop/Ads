// ===== جسمي بالإنجليزي: صورة طفل، والطفل يلمس الجزء (٢٠٢٦-١٠-٢٦) =====
// ثلاث طرق على نفس الصورة (mode):
//   learn → دوس على أى جزء: ميزو يقوله بالإنجليزى وبعدين بالعربى
//   find  → «Where is your knee?» والطفل يلمس الركبة (٨ أسئلة)
//   song  → Head, Shoulders, Knees and Toes: كلمة كلمة والطفل يلمسها
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { awardStars } from "../core/rewards.js";
import { gameTopbar, finishActivity } from "./common.js";
import { pick, MIZO_PRAISE } from "../data/mizo.js";
import {
  BODY_MAP_PARTS, bodyPart, isInside, findPlan, SONG_STEPS, SONG_LINES, SONG_END,
} from "../data/bodyMap.js";

const SKIN = "#f8c9a0", SKIN_D = "#e3a77a", HAIR = "#5b3a1e", SHIRT = "#ff7a59", SHORTS = "#3f7fd8", CHEEK = "#ff9db0";
const W = 300;
const mx = (x) => W - x; // نفس الجزء على الناحية التانية

// ── الرسمة (مابتستقبلش لمس) ─────────────────────────────────────────────────
function artSvg() {
  const side = (f) => f((x) => x) + f(mx);
  return `
  <g pointer-events="none">
    ${side((X) => `<path d="M${X(78)},262 L${X(70)},330" stroke="${SKIN}" stroke-width="22" stroke-linecap="round" fill="none"/>
      <path d="M${X(100)},182 L${X(78)},262" stroke="${SHIRT}" stroke-width="26" stroke-linecap="round" fill="none"/>
      <circle cx="${X(68)}" cy="346" r="17" fill="${SKIN}"/>
      ${[-9, -3, 3, 9].map((d) => `<ellipse cx="${X(68 + d)}" cy="364" rx="3.6" ry="7" fill="${SKIN}"/>`).join("")}`)}
    ${side((X) => `<path d="M${X(128)},356 L${X(126)},430 L${X(124)},498" stroke="${SKIN}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="${X(126)}" cy="430" r="7" fill="${SKIN_D}" opacity=".55"/>
      <ellipse cx="${X(116)}" cy="508" rx="25" ry="13" fill="${SKIN}"/>
      ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${X(102 + i * 7)}" cy="${517 - (i === 0 ? 1 : 0)}" r="${i === 0 ? 4.6 : 3.6}" fill="${SKIN}" stroke="${SKIN_D}" stroke-width="1.4"/>`).join("")}`)}
    <rect x="102" y="312" width="96" height="52" rx="14" fill="${SHORTS}"/>
    <path d="M100,186 Q150,168 200,186 L206,318 Q150,330 94,318 Z" fill="${SHIRT}"/>
    <circle cx="150" cy="276" r="3" fill="#c4503a"/>
    <rect x="136" y="150" width="28" height="30" rx="8" fill="${SKIN}"/>
    ${side((X) => `<ellipse cx="${X(87)}" cy="100" rx="12" ry="18" fill="${SKIN}"/><ellipse cx="${X(88)}" cy="100" rx="5" ry="9" fill="${SKIN_D}"/>`)}
    <circle cx="150" cy="96" r="62" fill="${SKIN}"/>
    <path d="M88,104 Q86,30 150,28 Q214,30 212,104 Q204,66 176,60 Q160,74 132,64 Q100,70 88,104 Z" fill="${HAIR}"/>
    ${side((X) => `<path d="M${X(116)},82 Q${X(129)},74 ${X(142)},82" stroke="${HAIR}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <circle cx="${X(129)}" cy="99" r="9" fill="#fff"/><circle cx="${X(130)}" cy="100" r="5" fill="#2b2b2b"/>
      <circle cx="${X(113)}" cy="124" r="10" fill="${CHEEK}" opacity=".7"/>`)}
    <path d="M150,104 Q144,118 150,121 Q154,121 156,118" stroke="${SKIN_D}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M134,132 Q150,146 166,132" stroke="#c4503a" stroke-width="5" stroke-linecap="round" fill="#fff"/>
  </g>`;
}

// ── مناطق اللمس: الكبير الأول والصغير فوقه (اللى فوق هو اللى بيتلمس) ─────────────
function hotSvg() {
  const both = (f) => f((x) => x) + f(mx);
  const hot = (id, shape) => shape.replace(/^<(\w+)/, `<$1 data-part="${id}"`);
  const area = (id, tag, attrs) => hot(id, `<${tag} ${attrs} fill="transparent" pointer-events="all"/>`);
  const line = (id, d, w) => hot(id, `<path d="${d}" stroke="transparent" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none" pointer-events="stroke"/>`);
  return `
  <g>
    ${area("head", "circle", `cx="150" cy="96" r="64"`)}
    ${area("neck", "rect", `x="132" y="150" width="36" height="32" rx="8"`)}
    ${area("chest", "path", `d="M100,186 Q150,168 200,186 L203,246 L97,246 Z"`)}
    ${area("tummy", "path", `d="M97,246 L203,246 L206,318 Q150,330 94,318 Z"`)}
    ${both((X) => line("arm", `M${X(100)},182 L${X(78)},262 L${X(70)},330`, 36))}
    ${both((X) => line("leg", `M${X(128)},356 L${X(126)},430 L${X(124)},498`, 38))}
    ${both((X) => area("shoulder", "circle", `cx="${X(110)}" cy="188" r="17"`))}
    ${both((X) => area("hand", "circle", `cx="${X(68)}" cy="346" r="20"`))}
    ${both((X) => area("foot", "ellipse", `cx="${X(116)}" cy="506" rx="28" ry="16"`))}
    ${area("face", "ellipse", `cx="150" cy="110" rx="52" ry="48"`)}
    ${both((X) => area("ear", "ellipse", `cx="${X(86)}" cy="100" rx="15" ry="21"`))}
    ${area("hair", "path", `d="M88,104 Q86,30 150,28 Q214,30 212,104 Q204,66 176,60 Q160,74 132,64 Q100,70 88,104 Z"`)}
    ${both((X) => area("eyebrow", "rect", `x="${Math.min(X(112), X(146))}" y="72" width="34" height="16" rx="6"`))}
    ${both((X) => area("eye", "circle", `cx="${X(129)}" cy="99" r="13"`))}
    ${both((X) => area("cheek", "circle", `cx="${X(112)}" cy="126" r="13"`))}
    ${area("nose", "ellipse", `cx="150" cy="114" rx="11" ry="12"`)}
    ${area("mouth", "rect", `x="130" y="127" width="40" height="18" rx="8"`)}
    ${area("chin", "ellipse", `cx="150" cy="151" rx="20" ry="8"`)}
    ${both((X) => area("elbow", "circle", `cx="${X(78)}" cy="262" r="16"`))}
    ${both((X) => area("finger", "rect", `x="${Math.min(X(52), X(84))}" y="356" width="32" height="20" rx="8"`))}
    ${both((X) => area("knee", "circle", `cx="${X(126)}" cy="430" r="17"`))}
    ${both((X) => area("toes", "ellipse", `cx="${X(116)}" cy="518" rx="24" ry="9"`))}
  </g>`;
}

/** الصورة + منطقة الاسم فوقها. onTap(id) لما الطفل يلمس جزء. */
function figure(onTap, reserve = 260) {
  const wrap = document.createElement("div");
  // الصورة كلها تبان من غير سكرول (الأغنية بتطلب الرأس والصوابع ورا بعض): العرض = الارتفاع المتاح × نسبة الصورة
  wrap.style.cssText = `position:relative;width:min(92vw,360px,calc((100dvh - ${reserve}px) * 300 / 530));min-width:200px;margin:6px auto 0`;
  wrap.innerHTML = `<svg viewBox="0 0 300 530" role="img" aria-label="Body" style="width:100%;height:auto;display:block;touch-action:manipulation;-webkit-tap-highlight-color:transparent">${artSvg()}${hotSvg()}</svg>`;
  const svg = wrap.firstElementChild;
  svg.addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-part]");
    if (el) onTap(el.getAttribute("data-part"), e);
  });
  return {
    el: wrap,
    /** يلوّن الجزء (كل نسخه: الشمال واليمين) لحظة */
    flash(id, color = "rgba(255,230,60,.6)", ms = 900) {
      svg.querySelectorAll(`[data-part="${id}"]`).forEach((n) => {
        const isLine = n.getAttribute("pointer-events") === "stroke";
        const prop = isLine ? "stroke" : "fill";
        n.setAttribute(prop, color);
        setTimeout(() => n.setAttribute(prop, "transparent"), ms);
      });
    },
  };
}

function bubble() {
  const b = document.createElement("div");
  b.style.cssText = "min-height:64px;margin:8px auto 0;padding:8px 14px;max-width:min(92vw,420px);border-radius:18px;background:rgba(255,255,255,.9);text-align:center;box-shadow:0 3px 0 rgba(0,0,0,.08)";
  b.set = (en, ar) => {
    b.innerHTML = `<div dir="ltr" style="font-weight:900;font-size:clamp(22px,6.5vw,32px);color:#3a2a6b">${en}</div>`
      + (ar ? `<div style="font-weight:800;font-size:clamp(15px,4.4vw,19px);color:#7a5a8a">${ar}</div>` : "");
  };
  return b;
}

export function renderBodyMap({ regionId, regionIndex, mode = "learn", title, bg }) {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#ffc2d2,#ff5f8d)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🧒 My Body", back));

  const say = (p) => Speech.sequence([{ text: p.en, lang: "en-US" }, { text: p.ar, lang: "ar-EG" }]);
  const label = bubble();

  if (mode === "learn") {
    const seen = new Set();
    label.set("👆 Touch!", "المس أى جزء واسمع اسمه بالإنجليزى");
    const fig = figure((id) => {
      const p = bodyPart(id);
      Sfx.pop();
      fig.flash(id);
      label.set(p.en, p.ar);
      say(p);
      if (!seen.has(id)) { seen.add(id); awardStars(1); }
    });
    screen.append(label, fig.el);

    // كل الأجزاء كأزرار تحت (الرأس والكتف مثلاً سهل يتلمسوا من هنا كمان)
    const chips = document.createElement("div");
    chips.dir = "ltr";
    chips.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px auto;max-width:min(94vw,560px)";
    BODY_MAP_PARTS.forEach((p) => {
      const c = document.createElement("button");
      c.className = "candy-btn";
      c.style.cssText = "padding:6px 12px;font-size:16px;min-height:0";
      c.textContent = p.en;
      c.addEventListener("click", () => { Sfx.pop(); fig.flash(p.id, undefined, 1400); label.set(p.en, p.ar); say(p); });
      chips.appendChild(c);
    });
    screen.appendChild(chips);

    const done = document.createElement("button");
    done.className = "candy-btn";
    done.style.cssText = "display:block;margin:6px auto 30px";
    done.textContent = "أنهيت ✅";
    done.addEventListener("click", () => finishActivity({ regionId, regionIndex, stars: 5, onDone: back }));
    screen.appendChild(done);
    return screen;
  }

  if (mode === "find") {
    const plan = findPlan();
    let i = 0, wrongs = 0, busy = false;
    const ask = () => {
      const p = bodyPart(plan[i]);
      wrongs = 0;
      label.set(p.ask, `${i + 1} من ${plan.length}`);
      Speech.en(p.ask);
    };
    const fig = figure((id) => {
      if (busy) return;
      const target = bodyPart(plan[i]);
      if (isInside(id, target.id)) {
        busy = true;
        Sfx.correct();
        fig.flash(target.id, "rgba(80,220,120,.6)");
        awardStars(1);
        label.set(`✅ ${target.en}`, target.ar);
        Speech.sequence([{ text: target.en, lang: "en-US" }, { text: target.ar, lang: "ar-EG" }]);
        i++;
        setTimeout(() => {
          busy = false;
          if (i >= plan.length) {
            Speech.mizo(pick(MIZO_PRAISE));
            finishActivity({ regionId, regionIndex, stars: 7, onDone: back });
          } else ask();
        }, 1700);
      } else {
        Sfx.wrong();
        wrongs++;
        const tapped = bodyPart(id);
        // بيتعلّم من الغلط كمان: ده اسمه إيه
        fig.flash(id, "rgba(255,90,90,.45)", 600);
        Speech.en(tapped.en);
        if (wrongs >= 2) setTimeout(() => fig.flash(target.id, "rgba(255,230,60,.7)", 1500), 700); // تلميح
      }
    });
    const again = document.createElement("button");
    again.className = "candy-btn";
    again.style.cssText = "display:block;margin:10px auto 30px";
    again.textContent = "🔊 Again";
    again.addEventListener("click", () => Speech.en(bodyPart(plan[i])?.ask || ""));
    screen.append(label, fig.el, again);
    setTimeout(ask, 400);
    return screen;
  }

  // ── song ──
  let step = 0, busy = false;
  const lyric = document.createElement("div");
  lyric.dir = "ltr";
  lyric.style.cssText = "margin:6px auto 0;max-width:min(94vw,520px);text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(13px,3.6vw,17px);line-height:1.5";
  const drawLyric = () => {
    // كل كلمة فى الأغنية بترتيبها — الحالية مظلّلة واللى خلصت عليها ✓
    let k = 0;
    lyric.innerHTML = SONG_LINES.map((line) => line.replace(/\b(Head|shoulders|knees|toes|eyes|ears|mouth|nose)\b/gi, (w) => {
      const idx = k++;
      const st = idx < step ? "opacity:.65" : idx === step ? "background:#ffe23c;color:#3a2a6b;border-radius:8px;padding:0 4px;text-shadow:none" : "";
      return `<span style="${st}">${w}</span>`;
    })).join("<br>");
  };
  const next = () => {
    const s = SONG_STEPS[step];
    drawLyric();
    label.set(`🎵 ${s.word}`, bodyPart(s.part).ar);
    Speech.en(s.word);
  };
  const fig = figure((id) => {
    if (busy) return;
    const s = SONG_STEPS[step];
    if (isInside(id, s.part)) {
      busy = true;
      Sfx.correct();
      fig.flash(s.part, "rgba(80,220,120,.6)", 600);
      step++;
      if (step % 4 === 0 || step === SONG_STEPS.length) awardStars(1);
      setTimeout(() => {
        busy = false;
        if (step >= SONG_STEPS.length) {
          drawLyric();
          label.set("🎉 Great job!", "برافو!");
          Speech.en(SONG_END, { onend: () => finishActivity({ regionId, regionIndex, stars: 8, onDone: back }) });
        } else next();
      }, 650);
    } else {
      Sfx.wrong();
      fig.flash(s.part, "rgba(255,230,60,.7)", 1100); // ده المطلوب
    }
  });
  screen.append(lyric, label, fig.el);
  fig.el.style.width = `min(92vw,360px,calc((100dvh - 330px) * 300 / 530))`;
  setTimeout(next, 400);
  return screen;
}
