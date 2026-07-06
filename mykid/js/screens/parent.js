// ===== متابعة ولي الأمر: تقدّم الطفل في كل منطقة =====
import { REGIONS } from "../data/regions.js";
import { COLLECTIBLES } from "../core/rewards.js";
import { getDataset } from "../data/datasets.js";
import { Store } from "../core/storage.js";
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { setAIEnabled } from "../core/ai.js";
import { updateStarCounter } from "../core/rewards.js";

export function renderParent() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#eef1ff,#dfe4ff)";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="backBtn" title="رجوع">🏠</button>
    <h2>👨‍👩‍👧 متابعة ولي الأمر</h2>
    <span style="width:48px"></span>`;
  screen.appendChild(topbar);

  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:620px;margin:0 auto;padding:16px 16px 40px";

  // ===== أطفالي: التبديل بين ملفات الأطفال (لكلٍّ اسمه وجنسه وإحصائياته) =====
  const profBox = document.createElement("div");
  profBox.style.cssText = "background:#fff;border-radius:18px;padding:14px;margin-bottom:18px;box-shadow:var(--shadow-card)";
  profBox.innerHTML = `<div style="font-weight:800;color:var(--c-ink);margin-bottom:4px">👨‍👩‍👧 أطفالي</div>
    <p style="font-size:12px;color:#7a6ca8;margin:0 0 10px">اختَر الطفل الذي يلعب الآن — لكلٍّ تقدّمه وإحصائياته المستقلّة.</p>
    <div class="prof-row" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center"></div>`;
  const profRow = profBox.querySelector(".prof-row");
  Store.profiles.forEach((p) => {
    const chip = document.createElement("div");
    chip.style.cssText =
      "position:relative;display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:14px;font-weight:800;cursor:pointer;color:var(--c-ink);border:2px solid " +
      (p.active ? "#10b981" : "#c7cdff") + ";background:" + (p.active ? "#e7fff6" : "#f3f4ff");
    const tag = document.createElement("span");
    tag.textContent = (p.gender === "girl" ? "👧 " : "👦 ") + (p.name || "طفل جديد");
    chip.appendChild(tag);
    chip.addEventListener("click", () => {
      if (p.active) return;
      Sfx.tap();
      Store.switchProfile(p.id);
      Router.go("parent"); // إعادة بناء اللوحة ببيانات الطفل المختار
    });
    if (Store.profiles.length > 1) {
      const del = document.createElement("button");
      del.textContent = "✕";
      del.title = "حذف هذا الطفل";
      del.style.cssText =
        "border:none;background:#ff6b8a;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;line-height:1;cursor:pointer;padding:0";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`حذف ملف «${p.name || "طفل"}» وكل تقدّمه؟`)) {
          Store.deleteProfile(p.id);
          Router.go("parent");
        }
      });
      chip.appendChild(del);
    }
    profRow.appendChild(chip);
  });
  const addProfBtn = document.createElement("button");
  addProfBtn.className = "candy-btn";
  addProfBtn.textContent = "➕ طفل جديد";
  addProfBtn.style.cssText = "padding:8px 14px;font-size:14px";
  addProfBtn.addEventListener("click", () => {
    Sfx.tap();
    // نطلب الاسم فوراً (أوضح لولي الأمر) — يُلغى بلا إنشاء إن ضغط إلغاء
    const name = window.prompt("اسم الطفل الجديد:", "");
    if (name === null) return; // ألغى ولي الأمر
    Store.createProfile(name.trim(), "boy"); // يصبح الفعّال؛ يضبط الجنس بالأسفل
    Router.go("parent");
  });
  profRow.appendChild(addProfBtn);
  wrap.appendChild(profBox);

  // ملخّص
  const collected = Store.state.collection.length;
  const doneCount = REGIONS.filter((r) => Store.regionProgress(r.id).completed).length;
  const summary = document.createElement("div");
  summary.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:18px";
  summary.innerHTML = `
    ${stat("⭐", Store.stars, "نجمة")}
    ${stat("🔥", Store.streak, "يوم متتالٍ")}
    ${stat("🗺️", `${doneCount}/${REGIONS.length}`, "مناطق")}
    ${stat("🎁", `${collected}/${COLLECTIBLES.length}`, "كنوز")}`;
  wrap.appendChild(summary);

  // ===== نشاط آخر ٧ أيام + إجمالي الأسبوع (رسم بسيط) =====
  const week = Store.last7Days();
  const DOW = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
  const maxActs = Math.max(1, ...week.map((d) => d.acts));
  const wkActs = week.reduce((s, d) => s + d.acts, 0);
  const wkMin = week.reduce((s, d) => s + d.min, 0);
  const wkBox = document.createElement("div");
  wkBox.style.cssText = "background:#fff;border-radius:18px;padding:14px;margin-bottom:18px;box-shadow:var(--shadow-card)";
  const bars = week
    .map((d) => {
      const h = Math.round((d.acts / maxActs) * 64) + (d.acts ? 6 : 2);
      const today = d.date === week[6].date;
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
        <span style="font-size:11px;color:#7a6ca8;font-weight:800">${d.acts || ""}</span>
        <div style="width:60%;height:${h}px;border-radius:6px;background:${d.acts ? "linear-gradient(180deg,#7c5cff,#5b3fb5)" : "#e7e3f6"}"></div>
        <span style="font-size:10px;color:${today ? "var(--c-purple)" : "#9b90c0"};font-weight:${today ? "800" : "600"}">${DOW[d.dow]}</span>
      </div>`;
    })
    .join("");
  wkBox.innerHTML = `
    <div style="font-weight:800;color:var(--c-ink);margin-bottom:10px">📅 نشاط آخر ٧ أيام</div>
    <div style="display:flex;align-items:flex-end;gap:6px;height:90px">${bars}</div>
    <div style="display:flex;justify-content:space-around;margin-top:12px;font-size:13px;color:#5a4e80;font-weight:700">
      <span>📚 ${wkActs} نشاط</span>
      <span>⏱️ ${wkMin} دقيقة</span>
    </div>
    <p style="font-size:11px;color:#9b90c0;margin:8px 0 0;text-align:center">إجمالي هذا الأسبوع — يُحفظ على هذا الجهاز فقط</p>`;
  wrap.appendChild(wkBox);

  // تقدّم الإتقان (تكرار متباعد): كم عنصراً أتقنه الطفل لكل مجموعة أساسية
  const mTitle = document.createElement("p");
  mTitle.style.cssText = "font-weight:800;color:var(--c-ink);text-align:center;margin:4px 0 10px;font-size:clamp(15px,4.2vw,19px)";
  mTitle.textContent = "🧠 الإتقان (إتقان = ٤ من ٥ فأكثر)";
  wrap.appendChild(mTitle);

  const mBox = document.createElement("div");
  mBox.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-bottom:18px";
  [["arabic", "الحروف العربية"], ["english", "الحروف الإنجليزية"], ["numbers", "الأرقام"]].forEach(([key, label]) => {
    mBox.appendChild(masteryBar(key, label));
  });
  wrap.appendChild(mBox);

  // تفصيل المناطق
  REGIONS.forEach((r) => {
    const p = Store.regionProgress(r.id);
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:12px;background:#fff;border-radius:18px;padding:12px 14px;margin-bottom:10px;box-shadow:var(--shadow-card)";
    row.innerHTML = `
      <span style="font-size:34px">${r.emoji}</span>
      <div style="flex:1">
        <div style="font-weight:800;color:var(--c-ink)">${r.name}</div>
        <div style="font-size:13px;color:#7a6ca8">${r.nameEn}</div>
      </div>
      <div style="text-align:center;font-weight:800;color:var(--c-purple)">
        ⭐ ${p.stars || 0}<br><span style="font-size:18px">${p.completed ? "✅" : "⏳"}</span>
      </div>`;
    wrap.appendChild(row);
  });

  // روابط الآباء: أدلة ومعلومات (صفحات المحتوى/الأرشفة)
  const guidesLink = document.createElement("a");
  guidesLink.className = "candy-btn";
  guidesLink.href = "/explore";
  guidesLink.style.cssText =
    "display:block;width:fit-content;margin:24px auto 0;text-decoration:none;text-align:center;background:linear-gradient(180deg,#7c5fe6,#5b3fb5)";
  guidesLink.textContent = "📖 أدلة ومعلومات للآباء";
  wrap.appendChild(guidesLink);

  // ===== جنس الطفل: ليخاطبه ميزو بالصيغة الصحيحة (افتراضي ولد) =====
  const gBox = document.createElement("div");
  gBox.style.cssText =
    "background:#fff;border-radius:18px;padding:14px;margin-top:18px;box-shadow:var(--shadow-card);text-align:center";
  gBox.innerHTML = `<div style="font-weight:800;color:var(--c-ink);margin-bottom:6px">👦👧 اسم الطفل ونوعه</div>
    <p style="font-size:12px;color:#7a6ca8;margin:0 0 10px">يخاطب ميزو الطفل بالصيغة الصحيحة وينادي باسمه.</p>
    <label style="display:block;font-size:13px;color:#7a6ca8;margin-bottom:4px">✏️ اسم الطفل (ليناديه ميزو)</label>
    <input class="name-input" type="text" maxlength="20" placeholder="اكتب اسم طفلك هنا"
      style="width:100%;max-width:280px;box-sizing:border-box;padding:10px 14px;border:2px solid #c7cdff;border-radius:14px;font-size:16px;text-align:center;margin-bottom:12px;outline:none" />
    <div class="gender-row" style="display:flex;gap:12px;justify-content:center"></div>`;
  const nameInput = gBox.querySelector(".name-input");
  nameInput.value = Store.childName;
  // عند تغيير الاسم نحفظه (ومقطعه الصوتي يُولَّد مرّة واحدة لاحقاً عبر nameclip)
  nameInput.addEventListener("input", () => Store.setChildName(nameInput.value));
  const gRow = gBox.querySelector(".gender-row");
  [["boy", "ولد 👦"], ["girl", "بنت 👧"]].forEach(([val, label]) => {
    const b = document.createElement("button");
    b.className = "candy-btn";
    b.textContent = label;
    const paint = () => {
      const on = Store.childGender === val;
      b.style.background = on ? "linear-gradient(180deg,#34d399,#10b981)" : "linear-gradient(180deg,#9aa7ff,#6b7cff)";
      b.style.opacity = on ? "1" : ".75";
    };
    paint();
    b.addEventListener("click", () => { Sfx.tap(); Store.setChildGender(val); gRow.querySelectorAll("button").forEach((x) => x.dispatchEvent(new Event("repaint"))); });
    b.addEventListener("repaint", paint);
    gRow.appendChild(b);
  });
  wrap.appendChild(gBox);

  // تذكير وقت الشاشة
  const stBox = document.createElement("div");
  stBox.style.cssText =
    "background:#fff;border-radius:18px;padding:14px;margin-top:18px;box-shadow:var(--shadow-card);text-align:center";
  const opts = [0, 10, 15, 20, 30];
  stBox.innerHTML = `<div style="font-weight:800;color:var(--c-ink);margin-bottom:10px">⏰ تذكير وقت اللعب</div>`;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
  opts.forEach((m) => {
    const b = document.createElement("button");
    b.className = "video-cat" + (Store.screenTimeMin === m ? " active" : "");
    b.textContent = m === 0 ? "بدون" : `${m} دقيقة`;
    b.addEventListener("click", () => {
      Sfx.tap();
      Store.setScreenTime(m);
      row.querySelectorAll(".video-cat").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    });
    row.appendChild(b);
  });
  stBox.appendChild(row);
  const stNote = document.createElement("p");
  stNote.style.cssText = "font-size:12px;color:#7a6ca8;margin:10px 0 0";
  stNote.textContent = "تذكير لطيف داخل التطبيق بعد المدّة (يُطبّق عند فتح التطبيق التالي).";
  stBox.appendChild(stNote);
  wrap.appendChild(stBox);

  // ===== الخصوصية والميكروفون =====
  const privBox = document.createElement("div");
  privBox.style.cssText = "background:#fff;border-radius:18px;padding:14px 16px;margin-top:16px;box-shadow:var(--shadow-card)";
  privBox.innerHTML = `
    <div style="font-weight:800;color:var(--c-ink);margin-bottom:8px">🔒 الخصوصية والميكروفون</div>
    <p style="font-size:13px;color:#5a4e80;line-height:1.7;margin:0 0 10px">
      • لا نجمع أيّ بيانات شخصية، وكلّ التقدّم يُحفظ على هذا الجهاز فقط.<br>
      • الميكروفون يعمل <b>فقط عند ضغط الطفل</b> على زرّ التحدّث، ولا يُسجَّل أو يُخزَّن.<br>
      • يُرسَل الصوت للمعالجة اللحظية فقط (نصّ) ولا يُستخدَم للتدريب، ويمكنك تعطيله أدناه.<br>
      • النطق المسموع مخزَّن كملفات صوت محلية بعد أوّل مرّة (توفيرٌ وخصوصية).
    </p>
    <button class="candy-btn" id="aiToggle" style="font-size:15px"></button>`;
  wrap.appendChild(privBox);
  const aiBtn = privBox.querySelector("#aiToggle");
  const paintAi = () => {
    const on = Store.aiEnabled;
    aiBtn.textContent = on ? "🎤 الميكروفون والذكاء الاصطناعي: مُفعّل" : "🔇 الميكروفون والذكاء الاصطناعي: مُعطّل";
    aiBtn.style.background = on ? "linear-gradient(180deg,#34d399,#10b981)" : "linear-gradient(180deg,#9aa7ff,#6b7cff)";
  };
  paintAi();
  aiBtn.addEventListener("click", () => {
    Sfx.tap();
    Store.setAiEnabled(!Store.aiEnabled);
    setAIEnabled(Store.aiEnabled);
    paintAi();
  });

  // إعادة ضبط
  const reset = document.createElement("button");
  reset.className = "candy-btn";
  reset.style.cssText = "display:block;margin:14px auto 0;background:linear-gradient(180deg,#ff8a8a,#ff5d5d)";
  reset.textContent = "🗑️ إعادة ضبط التقدّم";
  reset.addEventListener("click", () => {
    Sfx.tap();
    if (confirm("هل تريد محو كل تقدّم الطفل والبدء من جديد؟")) {
      Store.reset();
      updateStarCounter();
      Router.go("home");
    }
  });
  wrap.appendChild(reset);

  const note = document.createElement("p");
  note.style.cssText = "text-align:center;color:#7a6ca8;font-size:13px;margin-top:14px";
  note.textContent = "يُحفظ التقدّم على هذا الجهاز فقط.";
  wrap.appendChild(note);

  // رابط ظاهر لصفحة المحتوى (للآباء + يقوّي الربط الداخلي) — لا يراه الطفل في مساره
  const explore = document.createElement("a");
  explore.href = "/explore";
  explore.textContent = "📖 صفحة محتوى الموقع (للآباء)";
  explore.style.cssText = "display:block;text-align:center;color:var(--c-purple);font-weight:700;font-size:13px;margin-top:8px;text-decoration:underline";
  wrap.appendChild(explore);

  // ===== بوّابة الآباء: رقم سري من ٤ أرقام =====
  const gate = document.createElement("div");
  gate.className = "stage";
  const hasPin = !!Store.parentPin;
  // وضع الإعداد عند أول مرّة (لا يوجد رقم سري بعد)، وإلا وضع الإدخال
  let setupStep = hasPin ? null : 1; // 1=اكتب رقماً جديداً، 2=أكّده
  let firstPin = "";

  gate.innerHTML = `
    <div class="hero-emoji">🔒</div>
    <p style="font-weight:800;color:var(--c-purple);font-size:clamp(18px,5vw,24px)">للآباء فقط</p>
    <p id="gateMsg" style="font-weight:800;color:var(--c-ink);font-size:clamp(18px,5vw,24px)"></p>
    <input id="gateInput" type="password" inputmode="numeric" maxlength="4" autocomplete="off"
      style="font-size:34px;font-weight:800;text-align:center;letter-spacing:14px;width:160px;padding:10px;border-radius:16px;border:3px solid var(--c-purple)" />
    <div style="margin-top:14px"><button class="candy-btn" id="gateOk">تأكيد</button></div>
    <p id="gateErr" style="color:var(--c-red);font-weight:700;margin-top:8px;min-height:1.2em"></p>`;
  screen.appendChild(gate);

  setTimeout(() => {
    screen.querySelector("#backBtn").addEventListener("click", () => { Sfx.tap(); Router.go("home"); });
    const input = gate.querySelector("#gateInput");
    const msg = gate.querySelector("#gateMsg");
    const err = gate.querySelector("#gateErr");
    const refresh = () => {
      err.textContent = "";
      input.value = "";
      msg.textContent = !hasPin
        ? (setupStep === 1 ? "اختر رقماً سرياً جديداً (٤ أرقام)" : "أعد كتابة الرقم السري للتأكيد")
        : "أدخل الرقم السري";
      input.focus();
    };
    const unlock = () => { Sfx.correct(); gate.remove(); screen.appendChild(wrap); };

    const submit = () => {
      const v = (input.value || "").replace(/\D/g, "");
      if (v.length !== 4) { Sfx.wrong(); err.textContent = "اكتب ٤ أرقام"; return; }
      if (!hasPin) {
        // إعداد رقم جديد بخطوتين (كتابة + تأكيد)
        if (setupStep === 1) { firstPin = v; setupStep = 2; refresh(); return; }
        if (v !== firstPin) { Sfx.wrong(); err.textContent = "الرقمان غير متطابقين، أعد المحاولة"; setupStep = 1; refresh(); return; }
        Store.setParentPin(v);
        unlock();
      } else if (v === Store.parentPin) {
        unlock();
      } else {
        Sfx.wrong(); err.textContent = "رقم سري غير صحيح"; input.value = ""; input.focus();
      }
    };
    gate.querySelector("#gateOk").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    refresh();
  }, 0);

  return screen;
}

function stat(icon, value, label) {
  return `<div style="background:#fff;border-radius:18px;padding:12px 18px;text-align:center;box-shadow:var(--shadow-card);min-width:90px">
    <div style="font-size:28px">${icon}</div>
    <div style="font-weight:800;font-size:22px;color:var(--c-purple)">${value}</div>
    <div style="font-size:12px;color:#7a6ca8">${label}</div>
  </div>`;
}

// مفتاح العنصر (مطابق لِما في لعبة المراجعة)
function mKey(it) {
  return it.char ?? (it.value != null ? String(it.value) : it.name);
}
// شريط تقدّم الإتقان لمجموعة
function masteryBar(datasetKey, label) {
  const ds = getDataset(datasetKey);
  const total = ds.items.length;
  const mastered = ds.items.filter((it) => Store.getMastery(datasetKey, mKey(it)) >= 4).length;
  const pct = total ? Math.round((mastered / total) * 100) : 0;
  const el = document.createElement("div");
  el.style.cssText = "background:#fff;border-radius:16px;padding:10px 14px;box-shadow:var(--shadow-card)";
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-weight:800;color:var(--c-ink);font-size:14px;margin-bottom:6px">
      <span>${label}</span><span style="color:var(--c-purple)">${mastered}/${total}</span>
    </div>
    <div style="height:12px;background:#eee;border-radius:8px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#34d399,#10b981);border-radius:8px"></div>
    </div>`;
  return el;
}
