// ===== لعبة "ارسم الحرف": يتتبّع الطفل الحرف بإصبعه فيضيء =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, shuffle, showCheer, finishActivity, examplePhrase, glyphPicker } from "./common.js";
import { judge, hintFor } from "./traceJudge.js";
import { strokesFor, PREWRITING } from "../data/strokes.js";
import { mountWriteBoard, LEVEL_LABELS } from "./writeBoard.js";
import { Store } from "../core/storage.js";
import { femAdapt } from "../data/mizo.js";
import { writeStatus, practiceOrder } from "./writeProgress.js";
import { openWorksheet } from "./worksheet.js";
import { showGripCard, whenGripClosed, gripButton, penBoardOptions } from "./grip.js";

const TRACE_COUNT = 6;
const RES = 300; // دقّة داخلية ثابتة
// الحكم على «كتب الحرف صح» في `traceJudge.js` — مفصول عشان الحارس يشغّله
// بنفسه بأرقام حقيقية بدل ما يقرا الملف ويفترض إنه بيعمل اللي مكتوب فيه.
//
// ولو الحرف/الرقم ليه خطوط فى `strokes.js` (كلهم دلوقتى) بتظهر «لوحة الكتابة»
// (`writeBoard.js`): نقطة البداية والاتجاه وترتيب الخطوط، والمساعدة بتقلّ بالتدريج.
// الطريقة القديمة (التغطية) فاضلة لأى رمز مالوش خطوط.

/** كلام ميزو للطفل — بصيغة البنت لو الطفلة بنت. */
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

    const strokes = isPre ? it.strokes : strokesFor(glyph);
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
    const level = Store.getWriteLevel(levelKey);

    // المستوى ظاهر وبيتغيّر بلمسة (لو ولى الأمر عايز يرجّعه للخط الكامل)
    const lvlBtn = document.createElement("button");
    lvlBtn.className = "wb-level";
    lvlBtn.type = "button";
    lvlBtn.textContent = LEVEL_LABELS[level];
    lvlBtn.setAttribute("aria-label", "مستوى المساعدة: " + LEVEL_LABELS[level] + " — اضغط للتغيير");
    lvlBtn.addEventListener("click", () => {
      Sfx.tap();
      Store.setWriteLevel(levelKey, level >= 3 ? 1 : level + 1);
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
      from: it.from,
      to: it.to,
      onHint: (text) => {
        Sfx.wrong();
        showHint(tell(text));
      },
      onDone: ({ fails }) => {
        Store.recordWrite(levelKey, fails, level);
        // المساعدة بتقلّ لما يكتبه صح من غير غلط كتير، وبترجع خطوة لو اتلخبط جامد
        let msg = "";
        if (fails <= 2 && level < 3) {
          Store.setWriteLevel(levelKey, level + 1);
          msg = level + 1 === 2 ? "المرة الجاية على النقط بس" : "المرة الجاية لوحدك";
        } else if (fails >= 6 && level > 1) {
          Store.setWriteLevel(levelKey, level - 1);
        }
        Sfx.correct();
        Speech.say(sayDone, { lang: speakLang });
        if (msg) setTimeout(() => showHint(tell(msg)), 300);
        board.el.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }],
          { duration: 500 }
        );
        setTimeout(next, msg ? 1900 : 1200);
      },
    });
    stage.appendChild(hint);

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
      // أول مرة على الخط الكامل: نوريه الأول وبعدين يكتب هو
      if (isPre) tell(it.say);
      else tell(level === 3 ? `اكتب ${noun} ${label} لوحدك` : `اكتب ${noun} ${label}. ابدأ من النقطة الخضرا`);
      if (level === 1) setTimeout(() => board.demo(), 1400);
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
