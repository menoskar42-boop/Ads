// ===== لعبة "ارسم الحرف": يتتبّع الطفل الحرف بإصبعه فيضيء =====
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, shuffle, showCheer, finishActivity, examplePhrase } from "./common.js";
import { judge, hintFor } from "./traceJudge.js";

const TRACE_COUNT = 6;
const RES = 300; // دقّة داخلية ثابتة
// الحكم على «كتب الحرف صح» في `traceJudge.js` — مفصول عشان الحارس يشغّله
// بنفسه بأرقام حقيقية بدل ما يقرا الملف ويفترض إنه بيعمل اللي مكتوب فيه.

export function renderTrace({ regionId, regionIndex, datasetKey, lang, title, focus, returnLesson, lessonTitle }) {
  const ds = getDataset(datasetKey);
  const speakLang = lang || ds.lang;
  const noun = ds.glyphKind === "number" ? "الرقم" : "الحرف";
  let letters = shuffle(ds.items).slice(0, TRACE_COUNT);
  // إن طُلب حرف/رقم محدّد (من معلّم الحروف) نجعله أول ما يُكتب
  if (focus) {
    const f = ds.items.find((x) => (x.char || x.arDigit || x.name) === focus);
    // قادم من معلّم الحرف: حرف واحد فقط ثم نعود للدرس برسالة محفّزة
    if (f && returnLesson) letters = [f];
    else if (f) letters = [f, ...shuffle(ds.items.filter((x) => x !== f)).slice(0, TRACE_COUNT - 1)];
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
    const glyph = it.char || it.arDigit || it.name;
    const label = it.name || it.arName || "";
    const sayDone = it.word ? examplePhrase(it, speakLang) : label;
    stage.innerHTML = "";

    const titleEl = document.createElement("p");
    titleEl.style.cssText = "font-weight:800;font-size:clamp(18px,5vw,24px);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18)";
    titleEl.textContent = `تتبّع ${noun}: ${label}`;
    stage.appendChild(titleEl);

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

  function next() {
    idx++;
    if (idx >= letters.length) {
      if (returnLesson) {
        // قادم من معلّم الحرف: نعود للدرس برسالة محفّزة من ميزو (لا ننتقل لحرف آخر)
        showCheer("✍️", "برافو! كتبت الحرف صح، يلا نكمّل!", () =>
          Router.go("lesson", { regionId, regionIndex, datasetKey, lang, title: lessonTitle, startChar: focus, motivate: true })
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
