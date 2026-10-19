// ===== لعبة "ارسم الحرف": يتتبّع الطفل الحرف بإصبعه فيضيء =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, shuffle, showCheer, finishActivity, examplePhrase, glyphPicker } from "./common.js";
import { judge, hintFor } from "./traceJudge.js";
import { strokesFor, PREWRITING, harakaStrokes, harakaGlyph, HARAKAT_ORDER } from "../data/strokes.js";
import { mountWriteBoard, LEVEL_LABELS, NO_START_LABEL } from "./writeBoard.js";
import { Store } from "../core/storage.js";
import { femAdapt } from "../data/mizo.js";
import { writeStatus, practiceOrder } from "./writeProgress.js";
import { openWorksheet } from "./worksheet.js";
import { ROUND_MSG, writeIntro, ALONE_TARGET, SHOW_BELOW, aloneAgainMsg, fixMsg, harakaMsg, DOTS_TARGET, DOTS_PASS, dotsAgainMsg } from "../data/writingPhrases.js";
import { mountHarakaQuiz } from "./harakaQuiz.js";
import { SCORE_PASS } from "./strokeJudge.js";
import { showGripCard, whenGripClosed, gripButton, penBoardOptions } from "./grip.js";

// كل حرف بيتكتب كذا مرة (نقط ← نقط ← لوحده)، فالجلسة ٤ حروف بدل ٦ (الإنجليزى: زوجين A/a)
const TRACE_COUNT = 4;
const RES = 300; // دقّة داخلية ثابتة
// الحكم على «كتب الحرف صح» في `traceJudge.js` — مفصول عشان الحارس يشغّله
// بنفسه بأرقام حقيقية بدل ما يقرا الملف ويفترض إنه بيعمل اللي مكتوب فيه.
//
// ولو الحرف/الرقم ليه خطوط فى `strokes.js` (كلهم دلوقتى) بتظهر «لوحة الكتابة»
// (`writeBoard.js`): نقطة البداية والاتجاه وترتيب الخطوط، والمساعدة بتقلّ بالتدريج.
// الطريقة القديمة (التغطية) فاضلة لأى رمز مالوش خطوط.

/** كلام ميزو للطفل — بصيغة البنت لو الطفلة بنت. */
/** ١٠ مرات صح ورا بعض لوحده — الاختبارات بس بتقصّرها (__MYKID_ALONE_TARGET__). */
const aloneTarget = () => {
  const t = Number(globalThis.__MYKID_ALONE_TARGET__);
  return Number.isInteger(t) && t > 0 ? t : ALONE_TARGET;
};
/** على النقط: ٣ مرات عالية ورا بعض (والحرف اللى اتقنه قبل كده: مرة) — الاختبارات بتقصّرها. */
const dotsTarget = (mastered) => {
  if (mastered) return 1;
  const t = Number(globalThis.__MYKID_DOTS_TARGET__);
  return Number.isInteger(t) && t > 0 ? t : DOTS_TARGET;
};

function tell(text) {
  let t = text;
  try { if (Store.childGender === "girl") t = femAdapt(text); } catch (e) {}
  Speech.ar(t);
  return t;
}

export function renderTrace({ regionId, regionIndex, datasetKey, lang, title, focus, returnLesson, lessonTitle, includeZero = false }) {
  // «تمارين قبل الكتابة»: خط واقف، نايم، دايرة… بالترتيب (من الأسهل للأصعب)
  const isPre = datasetKey === "prewriting";
  const ds = isPre ? { lang: "ar-EG", glyphKind: "stroke", items: PREWRITING } : getDataset(datasetKey);
  const speakLang = lang || ds.lang;
  const noun = isPre ? "الشكل" : ds.glyphKind === "number" ? "الرقم" : "الحرف";
  const isEnglishNumber = datasetKey === "englishNumbers";
  const zeroItem = isEnglishNumber
    ? { value: 0, char: "0", name: "zero", enName: "zero" }
    : { value: 0, arDigit: "٠", arName: "صفر", enName: "zero" };
  // الإنجليزى: الكابيتال والصغير (small) الاتنين بيتكتبوا — كل واحد ليه خطوطه ومستواه
  const smallOf = (it) => ({ ...it, char: it.lower, name: `small ${it.lower}`, small: true });
  const traceItems = includeZero && ds.glyphKind === "number"
    ? [zeroItem, ...ds.items]
    : datasetKey === "english" ? [...ds.items, ...ds.items.map(smallOf)] : ds.items;
  const glyphOf = (x) => (isPre ? x.id : x.char || x.arDigit || x.name);
  const keyOf = (x) => (isPre ? "pre:" : "g:") + glyphOf(x);
  // الحروف الصعبة الأول (والجديدة بعدها) بدل اختيار عشوائى — المتقن بييجى آخر حاجة
  const statusOf = (x) => writeStatus(Store.writeStats[keyOf(x)], Store.getWriteLevel(keyOf(x)));
  let letters = isPre ? traceItems.slice() : practiceOrder(traceItems, statusOf).slice(0, TRACE_COUNT);
  // الإنجليزى: كل حرف بيتكتب كابيتال وبعده الصغير بتاعه (A ثم a) — من غيرها جلسة كاملة
  // ممكن تطلع كابيتال بس والصغير مايتكتبش (المالك ٢٠٢٦-١٠-١٠). الأصعب من الاتنين بيحدّد الترتيب.
  if (datasetKey === "english") {
    const worse = (it) => {
      const a = statusOf(it), b = statusOf(smallOf(it));
      return [a, b].includes("weak") ? "weak" : [a, b].includes("new") ? "new" : a === "mastered" && b === "mastered" ? "mastered" : "learning";
    };
    letters = practiceOrder(ds.items, worse).slice(0, TRACE_COUNT / 2).flatMap((it) => [it, smallOf(it)]);
  }
  // إن طُلب حرف/رقم محدّد (من معلّم الحروف) نجعله أول ما يُكتب
  if (focus) {
    const f = traceItems.find((x) => (x.char || x.arDigit || x.name) === focus);
    // قادم من معلّم الحرف: حرف واحد فقط ثم نعود للدرس برسالة محفّزة
    if (f && returnLesson) letters = f.lower && !f.small ? [f, smallOf(f)] : [f];
    else if (f) letters = [f, ...shuffle(traceItems.filter((x) => x !== f)).slice(0, TRACE_COUNT - 1)];
  }
  let idx = 0;
  // خطة الحرف الحالى (renderBoard): المستوى لكل جولة + الجولة الحالية
  let plan = null, step = 0, planFor = null, extraLoops = 0, aloneOk = 0, showNext = false;
  let dotsOk = 0, dotsLow = 0, dotsNeed = DOTS_TARGET;
  // الحرف بالحركات بعد ما يتقن الحرف لوحده (العربى بس): الحركة الحالية والباقى
  let haraka = null, harakaQ = [];
  const withHarakat = datasetKey === "arabic";
  const HARAKA_MARKS = { a: "\u064E", u: "\u064F", i: "\u0650", o: "\u0652" };
  const HARAKA_AR = { a: "بالفتحة", u: "بالضمة", i: "بالكسرة", o: "بالسكون" };
  // رسالة ميزو فى آخر الجولة بتفضل ظاهرة فى أول الجولة اللى بعدها (الشاشة بتتبنى من جديد)
  let carryMsg = "";

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#d9c2ff,#9a7bff)";

  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "✏️ ارسم الحرف", back));

  const stage = document.createElement("div");
  stage.className = "stage";
  screen.appendChild(stage);

  function makeCanvas(z, pointer) {
    const c = document.createElement("canvas");
    c.width = c.height = RES;
    c.style.cssText =
      `position:absolute;inset:0;width:100%;height:100%;border-radius:24px;` +
      (pointer ? "touch-action:none;" : "pointer-events:none;");
    c.style.zIndex = z;
    return c;
  }

  function render() {
    const it = letters[idx];
    // مرونة: يدعم الحروف (char/name) والأرقام (arDigit/arName) وغيرها
    const glyph = isPre ? it.id : it.char || it.arDigit || it.name;
    const label = it.name || it.arName || "";
    const sayDone = isPre ? "برافو" : it.word ? examplePhrase(it, speakLang) : label;
    stage.innerHTML = "";

    const titleEl = document.createElement("p");
    titleEl.style.cssText = "font-weight:800;font-size:clamp(18px,5vw,24px);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18)";
    titleEl.textContent = isPre ? `${it.emoji} ${label}` : `تتبّع ${noun}: ${label}`;
    stage.appendChild(titleEl);

    // الإنجليزى: زرارين ينقلوا على طول بين الكابيتال والصغير لنفس الحرف (المالك ٢٠٢٦-١٠-١٤)
    if (datasetKey === "english" && !haraka) stage.appendChild(caseSwitch(it));

    const hGlyph = haraka ? harakaGlyph(glyph, haraka) : glyph;
    if (haraka) titleEl.textContent = `اكتب ${hGlyph}${HARAKA_MARKS[haraka]} — ${label} ${HARAKA_AR[haraka]}`;
    const strokes = isPre ? it.strokes : haraka ? harakaStrokes(hGlyph, haraka) : strokesFor(glyph);
    if (strokes) return renderBoard({ it, glyph, label, sayDone, strokes });

    const box = document.createElement("div");
    box.style.cssText =
      "position:relative;width:min(72vw,300px);aspect-ratio:1;background:#fff;border-radius:24px;box-shadow:var(--shadow-card);margin:10px auto";
    stage.appendChild(box);

    const guide = makeCanvas(0, false);
    const draw = makeCanvas(1, true);
    box.appendChild(guide);
    box.appendChild(draw);

    const gctx = guide.getContext("2d");
    const dctx = draw.getContext("2d");

    // رسم الحرف الإرشادي
    function paintGuide(color) {
      gctx.clearRect(0, 0, RES, RES);
      gctx.fillStyle = color;
      gctx.font = `bold ${RES * 0.6}px "Baloo Bhaijaan 2", sans-serif`;
      gctx.textAlign = "center";
      gctx.textBaseline = "middle";
      gctx.fillText(glyph, RES / 2, RES / 2 + RES * 0.06);
    }
    paintGuide("#d9d0f0");

    // قناع الحرف لحساب التغطية
    const mask = document.createElement("canvas");
    mask.width = mask.height = RES;
    const mctx = mask.getContext("2d");
    mctx.fillStyle = "#000";
    mctx.font = `bold ${RES * 0.6}px "Baloo Bhaijaan 2", sans-serif`;
    mctx.textAlign = "center";
    mctx.textBaseline = "middle";
    mctx.fillText(glyph, RES / 2, RES / 2 + RES * 0.06);
    const maskData = mctx.getImageData(0, 0, RES, RES).data;
    let maskTotal = 0;
    for (let p = 3; p < maskData.length; p += 4) if (maskData[p] > 40) maskTotal++;

    // إعداد قلم الرسم (فرشاة أنحف ليكون التتبّع أدقّ ويشمل النقطة)
    dctx.lineCap = dctx.lineJoin = "round";
    dctx.lineWidth = 26;
    dctx.strokeStyle = "#ff6fb5";

    let drawing = false;
    let done = false;
    let last = null;

    function pos(e) {
      const r = draw.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return {
        x: (t.clientX - r.left) * (RES / r.width),
        y: (t.clientY - r.top) * (RES / r.height),
      };
    }
    // ارسم نقطة دائرية عند الإحداثي (لتعمل الضغطة الواحدة دون سحب)
    function dot(p) {
      dctx.beginPath();
      dctx.arc(p.x, p.y, dctx.lineWidth / 2, 0, Math.PI * 2);
      dctx.fill();
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      last = pos(e);
      dctx.fillStyle = dctx.strokeStyle;
      dot(last); // أثر فوري عند مجرّد اللمس
      Sfx.pop();
      // الحكم مابيتاخدش والإيد لسه على الشاشة.
      //
      // كانت بتتنادى هنا كمان، فالحرف بيتحكم عليه «صح» وسط أول ضغطة قبل ما
      // الطفل يخلّص شكله أصلاً — والنتيجة إن الطفل بيتعلّم إن نصّ الحرف كفاية.
      // (النقطة بتاعة ذ/خ لسه شغّالة: بتتحكم في `end` بعد رفع الإصبع مباشرةً.)
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      dctx.beginPath();
      dctx.moveTo(last.x, last.y);
      dctx.lineTo(p.x, p.y);
      dctx.stroke();
      last = p;
    }
    function end() {
      if (!drawing) return;
      drawing = false;
      checkCoverage();
      if (!done) hintAfterStroke();
    }

    /**
     * تلات إجابات مش اتنين.
     *
     * قبل كده كان فيه «صح» وسكوت. والسكوت أسوأ إجابة للطفل: هو رسم حاجة،
     * والتطبيق ماردّش، فمش عارف يكمّل ولا يمسح ولا إيه المشكلة. والأهم إن
     * اللي شخبط والّي لسه مكمّلش كانوا بياخدوا نفس السكوت — وهما محتاجين
     * كلام مختلف تماماً.
     */
    function hintAfterStroke() {
      const msg = hintFor(measure());
      if (msg) showHint(msg);
    }

    /** مسحة واحدة بتطلّع الرقمين، والحكم بيتاخد في `traceJudge.js`. */
    function measure() {
      const dData = dctx.getImageData(0, 0, RES, RES).data;
      let covered = 0, drawn = 0;
      for (let p = 3; p < dData.length; p += 4) {
        if (dData[p] <= 40) continue;       // بكسل الطفل ماحطّش عليه حبر
        drawn++;
        if (maskData[p] > 40) covered++;    // ووقع جوّه الحرف
      }
      return judge(covered, drawn, maskTotal);
    }

    function checkCoverage() {
      if (done || maskTotal === 0) return;
      const m = measure();
      if (m.ok) {
        done = true;
        paintGuide("#34d399");
        Sfx.correct();
        Speech.say(sayDone, { lang: speakLang });
        box.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
          { duration: 500 }
        );
        setTimeout(next, 1100);
      }
    }

    draw.addEventListener("pointerdown", start);
    draw.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    draw.addEventListener("touchstart", start, { passive: false });
    draw.addEventListener("touchmove", move, { passive: false });
    draw.addEventListener("touchend", end);

    // سطر بيتكلّم مع الطفل وهو بيرسم (بيفضل فاضي لحد ما يكون فيه حاجة تتقال).
    const hint = document.createElement("div");
    hint.style.cssText = "min-height:26px;margin-top:10px;text-align:center;font-weight:800;color:#6d28d9";
    stage.appendChild(hint);
    let hintTimer = null;
    function showHint(text) {
      hint.textContent = text;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint.textContent = ""; }, 3500);
    }

    // أدوات
    const tools = document.createElement("div");
    tools.style.cssText = "margin-top:14px;display:flex;gap:12px;justify-content:center";
    const clearBtn = document.createElement("button");
    clearBtn.className = "candy-btn";
    clearBtn.textContent = "🧽 امسح";
    clearBtn.addEventListener("click", () => { Sfx.tap(); dctx.clearRect(0, 0, RES, RES); hint.textContent = ""; });
    const sayBtn = document.createElement("button");
    sayBtn.className = "candy-btn";
    sayBtn.textContent = `🔊 ${noun}`;
    sayBtn.addEventListener("click", () => { Sfx.tap(); Speech.say(label, { lang: speakLang }); });
    tools.append(sayBtn, clearBtn);
    stage.appendChild(tools);

    Speech.ar(`ارسم ${noun} ${label}`);
  }

  /** لوحة الكتابة: الخطوط بالترتيب من نقطتها الخضرا، والمساعدة حسب مستوى الحرف ده. */
  function renderBoard({ it, glyph, label, sayDone, strokes }) {
    const levelKey = keyOf(it);
    // خطة الحرف ده (المالك ٢٠٢٦-١٠-١٠): «فى الأول نقط وتوضّحلها الاتجاه وتكتب عليها أكتر
    // من مرة… وبعدين لوحدها من غير نقط». الجولات: نقط ← نقط ← لوحده (واللى اتقنه قبل
    // كده: نقط ← لوحده). الخطة بتتعمل أول ما الحرف يتفتح وبتتعدّل حسب الغلط.
    if (planFor !== it) {
      planFor = it;
      // الحروف والأرقام (المالك ٢٠٢٦-١٠-١٤): النقط بتتحسب بنسبة، والجولات بتتضاف واحدة واحدة —
      // مايروحش «لوحده» غير بعد نسبة عالية على النقط كذا مرة ورا بعض
      const mastered = Store.getWriteLevel(levelKey) >= 3;
      plan = isPre ? [2, 3] : [2];
      step = 0;
      extraLoops = 0;
      aloneOk = 0;
      dotsOk = 0;
      dotsLow = 0;
      dotsNeed = dotsTarget(mastered);
      showNext = false;
      haraka = null;
      harakaQ = [];
    }
    const level = plan[step];

    // الجولة ظاهرة (نقط/لوحده + رقمها). لمسة بتغيّر مساعدة الجولة دى بس (ولى الأمر
    // لو شايفها محتاجة الخط العريض دلوقتى)
    const lvlBtn = document.createElement("button");
    lvlBtn.className = "wb-level";
    lvlBtn.type = "button";
    // الحروف والأرقام: «لوحدك» بيتعدّ المرات الصح ورا بعض لحد ١٠؛ قبلها (النقط) رقم الجولة
    const drill = !isPre && !haraka && level >= 2;
    const [got, need] = level === 3 ? [aloneOk, aloneTarget()] : [dotsOk, dotsNeed];
    // المالك ٢٠٢٦-١٠-١٦: النقط ← النقطة الخضرا بس ← ولا حاجة. نص «لوحده» التانى من غير النقطة
    // (والغلطة بترجّع العدّ صفر، فالنقطة بترجع معاه)
    const noStart = drill && level === 3 && aloneOk >= Math.ceil(aloneTarget() / 2);
    const lvlLabel = noStart ? NO_START_LABEL : LEVEL_LABELS[level];
    lvlBtn.textContent = drill ? `${lvlLabel} · ✓ ${got}/${need}` : `${lvlLabel} · ${step + 1}/${plan.length}`;
    lvlBtn.setAttribute("aria-label", drill
      ? `${LEVEL_LABELS[level]}: ${got} مرة صح ورا بعض من ${need} — اضغط لتغيير المساعدة`
      : `الجولة ${step + 1} من ${plan.length}: ${LEVEL_LABELS[level]} — اضغط لتغيير المساعدة`);
    lvlBtn.addEventListener("click", () => {
      Sfx.tap();
      plan[step] = level >= 3 ? 1 : level + 1;
      render();
    });
    stage.appendChild(lvlBtn);

    const hint = document.createElement("div");
    hint.style.cssText = "min-height:26px;margin-top:6px;text-align:center;font-weight:800;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.2)";
    let hintTimer = null;
    const showHint = (text) => {
      hint.textContent = text;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint.textContent = ""; }, 3500);
    };

    const board = mountWriteBoard(stage, {
      ...penBoardOptions((text) => showHint(tell(text))),
      strokes,
      level,
      // الحروف والأرقام على النقط ولوحده: من غير وقفة فى النص، والحكم بنسبة فى الآخر
      // (الحركات والخط العريض بيفضلوا خط بخط)
      // والحركات كمان (المالك ٢٠٢٦-١٠-١٩): على النقط وبعدين لوحده، بنسبة
      free: !isPre && level >= 2,
      noStart,
      from: it.from,
      to: it.to,
      // من غير صوت «غلط» ولا «نجاح» (المالك ٢٠٢٦-١٠-١٤): صوت ميزو وكلامه بس
      onHint: (text) => showHint(tell(text)),
      onDone: ({ fails, score, result }) => {
        board.el.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }],
          { duration: 500 }
        );
        const say = (msg, then, wait = 1900) => { carryMsg = tell(msg); showHint(carryMsg); setTimeout(then, wait); };
        const nextRound = () => { step++; render(); };
        const sayPct = (msg, then, wait) => {
          carryMsg = `${score}٪ · ${tell(msg)}`;
          showHint(carryMsg);
          setTimeout(then, wait);
        };
        // جولات الحركات (بَ بُ بِ بْ) — المالك ٢٠٢٦-١٠-١٩: كل حركة على النقط وبعدين لوحده، والنسبة
        // الواطية بتعيد نفس الجولة؛ وبعد الأربعة لعبة «اسمع واعرف الحركة» لحد ما يعرفها من الصوت
        if (haraka) {
          const pass = level >= 3 ? SCORE_PASS : DOTS_PASS;
          if (score != null && score < pass) {
            if (score < SHOW_BELOW) showNext = true;
            plan.push(level);
            return sayPct(fixMsg(result && result.issue), nextRound, 2600);
          }
          Speech.ar(harakaGlyph(glyph, haraka) + HARAKA_MARKS[haraka]);
          if (level < 3) {
            plan.push(3);
            return setTimeout(() => sayPct(ROUND_MSG.harakaAlone, nextRound, 2000), 900);
          }
          if (harakaQ.length) {
            haraka = harakaQ.shift();
            plan.push(2);
            return setTimeout(() => say(harakaMsg(haraka), nextRound, 2400), 900);
          }
          haraka = null;
          return setTimeout(() => say(ROUND_MSG.harakatDone, () => harakaQuiz(glyph, sayDone), 2400), 900);
        }
        // على النقط (الحروف والأرقام): نسبة عالية ⇒ تتعدّ؛ أقل ⇒ العدّ يرجع صفر ومرة كمان على النقط
        if (!isPre && level === 2 && score != null) {
          const ok = score >= DOTS_PASS;
          dotsOk = ok ? dotsOk + 1 : 0;
          dotsLow = score < SHOW_BELOW ? dotsLow + 1 : 0;
          if (dotsOk >= dotsNeed) {
            plan.push(3);
            return sayPct(ROUND_MSG.toAlone, nextRound, 2000);
          }
          // اتلخبط جامد مرتين ورا بعض ⇒ جولة على الخط العريض وبعدين النقط تانى
          if (dotsLow >= 2 && !plan.includes(1)) {
            dotsLow = 0;
            plan.push(1, 2);
            return sayPct(ROUND_MSG.toRoad, nextRound, 2600);
          }
          plan.push(2);
          if (ok) return sayPct(dotsAgainMsg(dotsOk, dotsNeed), nextRound, 1600);
          if (score < SHOW_BELOW) showNext = true;
          return sayPct(fixMsg(result && result.issue, true), nextRound, 2600);
        }
        if (level < 3) {
          // جولة بمساعدة: لو اتلخبط جامد على النقط، جولة على الخط العريض قبل اللى بعدها
          if (level === 2 && fails >= 4 && !plan.includes(1)) {
            plan.splice(step + 1, 0, 1);
            return say(ROUND_MSG.toRoad, nextRound);
          }
          if (plan[step + 1] == null) plan.push(isPre ? 3 : 2);
          return say(plan[step + 1] === 3 ? ROUND_MSG.toAlone : ROUND_MSG.againDots, nextRound);
        }
        // جولة «لوحده» — الحروف والأرقام (المالك ٢٠٢٦-١٠-١٣): الحرف اتكتب كله واتحكم عليه بنسبة.
        // نسبة عالية ⇒ تتعدّ؛ أقل ⇒ العدّ يرجع صفر (لازم ١٠ ورا بعض). وفى الحالتين بيكتبه تانى.
        if (!isPre) {
          const ok = score >= SCORE_PASS;
          Store.recordWrite(levelKey, ok ? 0 : 3, 3);
          aloneOk = ok ? aloneOk + 1 : 0;
          if (aloneOk >= aloneTarget()) {
            Store.setWriteLevel(levelKey, 3);
            // العربى: بعد ما يتقن الحرف، يكتبه بالفتحة والضمة والكسرة والسكون زى كتاب العربى (المالك ٢٠٢٦-١٠-١٤)
            if (withHarakat && harakaStrokes(harakaGlyph(glyph, "a"), "a")) {
              harakaQ = HARAKAT_ORDER.slice();
              haraka = harakaQ.shift();
              plan.push(2);
              return sayPct(ROUND_MSG.doneAloneAll, () => say(harakaMsg(haraka), nextRound, 2600), 2200);
            }
            Speech.say(sayDone, { lang: speakLang });
            return sayPct(ROUND_MSG.doneAloneAll, next, 2200);
          }
          plan.push(3);
          if (ok) return sayPct(aloneOk === Math.ceil(aloneTarget() / 2) ? ROUND_MSG.noDot : aloneAgainMsg(aloneOk), nextRound, 1600);
          // النسبة قليلة ⇒ ميزو بيقول السبب بلطف (المالك ٢٠٢٦-١٠-١٤)، وتحت ٥٠٪ الصباع يوريه كمان
          if (score < SHOW_BELOW) showNext = true;
          return sayPct(fixMsg(result && result.issue), nextRound, 2600);
        }
        if (fails <= 2) {
          Store.recordWrite(levelKey, fails, 3);
          Store.setWriteLevel(levelKey, 3);
          Speech.say(sayDone, { lang: speakLang });
          return say(isPre ? ROUND_MSG.doneAloneShape : ROUND_MSG.doneAlone, next, 2000);
        }
        if (extraLoops < 2) {
          // غلط وهو لوحده ⇒ نرجع للنقط مرة ونجرّب لوحده تانى
          extraLoops++;
          plan.splice(step + 1, 0, 2, 3);
          return say(ROUND_MSG.backToDots, nextRound);
        }
        Store.recordWrite(levelKey, fails, 3);
        Store.setWriteLevel(levelKey, 2);
        Speech.say(sayDone, { lang: speakLang });
        return say(ROUND_MSG.practiceLater, next, 2000);
      },
    });
    stage.appendChild(hint);
    if (carryMsg) { showHint(carryMsg); carryMsg = ""; }

    const tools = document.createElement("div");
    tools.style.cssText = "margin-top:10px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap";
    const btn = (text, fn) => {
      const b = document.createElement("button");
      b.className = "candy-btn";
      b.type = "button";
      b.textContent = text;
      b.addEventListener("click", () => { Sfx.tap(); fn(); });
      tools.appendChild(b);
      return b;
    };
    btn("👀 شوف إزاى", () => board.demo());
    if (!isPre) btn(`🔊 ${noun}`, () => Speech.say(label, { lang: speakLang }));
    btn("🔁 من الأول", () => board.reset());
    tools.appendChild(gripButton());
    btn("🖨️ اطبع ورقة", () => openWorksheet({
      title: isPre ? `✍️ تمرين: ${label}` : `✍️ اكتب ${noun} ${glyph}`,
      glyphs: [{ label: glyph, strokes }],
    }));
    stage.appendChild(tools);

    // كل الحروف قدّامه: يختار اللى عايز يكتبه على طول (مش لازم يستنى دوره)
    if (!returnLesson) {
      stage.appendChild(glyphPicker({
        items: traceItems,
        glyphOf: (x) => (isPre ? x.emoji : glyphOf(x)),
        label: isPre ? "اختار الشكل مباشرة" : `اختار ${noun} مباشرة`,
        dir: speakLang.startsWith("en") ? "ltr" : "rtl",
        current: traceItems.indexOf(it),
        onPick: (k, x) => { letters[idx] = x; render(); },
      }));
    }

    // كارت مسكة القلم (مرة كل يوم) — والكلام والعرض بيستنّوه يتقفل
    showGripCard();
    whenGripClosed(() => {
      // الصباع بيوريه إزاى يتكتب كل مرة يفتح الحرف/الرقم — مش فى المستوى الأول بس.
      // المالك ٢٠٢٦-١٠-١٠: «بتظهر أول مرة بس… عاوزها تظهر فى كل مرة». المساعدة
      // اللى بتقلّ مع المستوى هى الخط تحت إيده (كامل ← نقط ← فاضى)، مش العرض.
      // أول جولة للحرف: الكلام + الصباع بيشرح الاتجاه. الجولات اللى بعدها ميزو قال
      // رسالتها فى آخر الجولة اللى قبلها، والشرح بيرجع لوحده مع أى غلطة (writeBoard).
      if (step === 0) {
        if (isPre) tell(it.say);
        else tell(writeIntro(noun, label));
        setTimeout(() => board.demo(), 1400);
      } else if (showNext) {
        // على طول — قبل ما يلحق يبدأ يكتب (العرض بيمسح اللوحة)
        showNext = false;
        board.demo();
      }
    });
  }

  /** «A كابيتال» / «a صغير»: لو الاتنين فى الجلسة بنروح للى فيها، وإلا بيتبدّل الحرف الحالى. */
  function caseSwitch(it) {
    const cap = it.small ? ds.items.find((x) => x.lower === it.lower) : it;
    if (!cap) return document.createTextNode("");
    const row = document.createElement("div");
    row.className = "tr-case";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "كابيتال ولا صغير");
    for (const [target, text, on] of [[cap, `${cap.char} كابيتال`, !it.small], [smallOf(cap), `${cap.lower} صغير`, !!it.small]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tr-case-btn" + (on ? " is-on" : "");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.innerHTML = `<b dir="ltr">${text.split(" ")[0]}</b> ${text.split(" ")[1]}`;
      b.addEventListener("click", () => {
        if (on) return;
        Sfx.tap();
        Speech.stop();
        const j = letters.findIndex((x) => glyphOf(x) === glyphOf(target));
        if (j >= 0) idx = j;
        else letters[idx] = target;
        render();
      });
      row.appendChild(b);
    }
    return row;
  }

  /** «اسمع واعرف الحركة» بعد كتابة الحركات الأربعة — والحرف بيخلص لما الطفل يعرفها كلها من الصوت. */
  function harakaQuiz(glyph, sayDone) {
    stage.innerHTML = "";
    const t = document.createElement("p");
    t.style.cssText = "font-weight:800;font-size:clamp(18px,5vw,24px);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18)";
    t.textContent = "👂 اسمع واعرف الحركة";
    const box = document.createElement("div");
    box.className = "hq-host";
    stage.append(t, box);
    mountHarakaQuiz(box, {
      ch: glyph,
      fem: (x) => (Store.childGender === "girl" ? femAdapt(x) : x),
      onDone: () => { Speech.say(sayDone, { lang: speakLang }); setTimeout(next, 1600); },
    });
  }

  function next() {
    idx++;
    if (idx >= letters.length) {
      if (returnLesson) {
        // قادم من معلّم الحرف: نعود للدرس برسالة محفّزة من ميزو (لا ننتقل لحرف آخر)
        showCheer("✍️", "برافو! كتبت الحرف صح، يلا نكمّل!", () =>
          Router.go("lesson", { regionId, regionIndex, datasetKey, lang, title: lessonTitle, startChar: focus, motivate: true, includeZero })
        );
      } else {
        showCheer("🌟", "أحسنت! أكملت الرسم", () =>
          finishActivity({ regionId, regionIndex, stars: 6, onDone: back })
        );
      }
    } else {
      render();
    }
  }

  setTimeout(render, 0);
  return screen;
}
