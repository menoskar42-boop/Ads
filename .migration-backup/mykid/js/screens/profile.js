// ===== ملف الطفل: الاسم + اختيار الأفاتار من الكنوز المجموعة =====
import { COLLECTIBLES } from "../core/rewards.js";
import { Store } from "../core/storage.js";
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { createCharacter } from "../games/character.js";

const GUIDE = "🐨"; // الأفاتار الافتراضي

export function avatarEmoji() {
  const id = Store.avatarId;
  const item = COLLECTIBLES.find((c) => c.id === id);
  return item ? item.emoji : GUIDE;
}

export function renderProfile() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#d7f5ff,#a0c8ff)";

  const topbar = document.createElement("div");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-btn" id="backBtn" title="رجوع">🏠</button>
    <h2>👤 ملفّي</h2>
    <span style="width:48px"></span>`;
  screen.appendChild(topbar);

  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:620px;margin:0 auto;padding:18px 16px 40px;text-align:center";

  // الأفاتار الحالي
  const current = document.createElement("div");
  current.style.cssText = "font-size:clamp(80px,24vw,140px);filter:drop-shadow(0 8px 8px rgba(0,0,0,.2))";
  current.textContent = avatarEmoji();
  wrap.appendChild(current);

  // الاسم
  const nameLabel = document.createElement("p");
  nameLabel.style.cssText = "font-weight:800;color:var(--c-purple);font-size:clamp(16px,4.5vw,20px);margin:6px 0";
  nameLabel.textContent = "اسمي:";
  wrap.appendChild(nameLabel);

  const nameInput = document.createElement("input");
  nameInput.value = Store.childName;
  nameInput.placeholder = "اكتب اسمك";
  nameInput.maxLength = 20;
  nameInput.style.cssText =
    "font-size:22px;font-weight:800;text-align:center;width:min(80vw,280px);padding:10px;border-radius:16px;border:3px solid var(--c-purple);font-family:inherit";
  nameInput.addEventListener("input", () => Store.setChildName(nameInput.value));
  wrap.appendChild(nameInput);

  // الفئة العمرية (تُكيّف صعوبة الألعاب)
  const ageLabel = document.createElement("p");
  ageLabel.style.cssText = "font-weight:800;color:var(--c-ink);margin:22px 0 8px;font-size:clamp(16px,4.5vw,20px)";
  ageLabel.textContent = "عمر الطفل (لضبط الصعوبة)";
  wrap.appendChild(ageLabel);

  const ageRow = document.createElement("div");
  ageRow.style.cssText = "display:flex;gap:12px;justify-content:center;flex-wrap:wrap";
  [["small", "٣ – ٤ سنوات", "🧒"], ["big", "٥ – ٦ سنوات", "👦"]].forEach(([band, txt, emo]) => {
    const b = document.createElement("button");
    b.className = "candy-btn";
    b.textContent = `${emo} ${txt}`;
    const paint = () => {
      b.style.background = Store.ageBand === band
        ? "linear-gradient(180deg,#34d399,#10b981)"
        : "linear-gradient(180deg,#9aa7ff,#6b7cff)";
    };
    paint();
    b.addEventListener("click", () => {
      Sfx.tap();
      Store.setAgeBand(Store.ageBand === band ? "" : band);
      ageRow.querySelectorAll("button").forEach((x) => x.dispatchEvent(new Event("repaint")));
    });
    b.addEventListener("repaint", paint);
    ageRow.appendChild(b);
  });
  wrap.appendChild(ageRow);

  // فتح ألعاب القواعد المتقدّمة (للأطفال الأكبر من ٦ سنوات)
  const advLabel = document.createElement("p");
  advLabel.style.cssText = "font-weight:800;color:var(--c-ink);margin:18px 0 8px;font-size:clamp(14px,4vw,17px)";
  advLabel.textContent = "🧑‍🎓 ألعاب القواعد المتقدّمة (أكبر من ٦ سنوات)";
  wrap.appendChild(advLabel);

  const advBtn = document.createElement("button");
  advBtn.className = "candy-btn";
  const paintAdv = () => {
    advBtn.textContent = Store.advancedUnlocked ? "✅ مفتوحة" : "🔒 مقفولة";
    advBtn.style.background = Store.advancedUnlocked
      ? "linear-gradient(180deg,#34d399,#10b981)"
      : "linear-gradient(180deg,#9aa7ff,#6b7cff)";
  };
  paintAdv();
  advBtn.addEventListener("click", () => {
    Sfx.tap();
    Store.setAdvancedUnlocked(!Store.advancedUnlocked);
    paintAdv();
  });
  wrap.appendChild(advBtn);

  // ===== صداقة ميزو + تخصيصه =====
  const fLevel = Store.friendLevel;
  const fTitle = document.createElement("p");
  fTitle.style.cssText = "font-weight:800;color:var(--c-ink);margin:24px 0 6px;font-size:clamp(16px,4.5vw,20px)";
  fTitle.textContent = `صداقتك مع ميزو: المستوى ${fLevel} 💛`;
  wrap.appendChild(fTitle);

  // رحلة الصداقة المرئية: شريط تقدّم + كم باقٍ للمستوى/الإكسسوار التالي
  const xp = Store.friendship.xp || 0;
  const inLvl = xp % 12;
  const toNext = 12 - inLvl;
  const UNLOCKS = { 2: "🎀 فيونكة", 3: "🎩 قبعة", 4: "👑 تاج", 5: "⭐ نجمة" };
  const nextAcc = UNLOCKS[fLevel + 1];
  const journey = document.createElement("div");
  journey.style.cssText = "max-width:340px;margin:0 auto 10px";
  journey.innerHTML = `
    <div class="fr-bar"><div class="fr-fill" style="width:${Math.round((inLvl / 12) * 100)}%"></div></div>
    <p style="font-size:13px;color:#7a6ca8;text-align:center;margin:6px 0">
      باقي ${toNext} خطوات ويكبر مستوى صداقتنا${nextAcc ? ` — ويفتح ${nextAcc}` : ""} 💛
    </p>`;
  wrap.appendChild(journey);

  const preview = document.createElement("div");
  preview.style.cssText = "display:grid;place-items:center;margin:4px 0";
  const previewMizo = createCharacter();
  preview.appendChild(previewMizo.el);
  wrap.appendChild(preview);

  const accHint = document.createElement("p");
  accHint.style.cssText = "font-size:13px;color:#7a6ca8;text-align:center;margin:2px 0 8px";
  accHint.textContent = "كل إكسسوار = إنجاز! اكسبه بالتعلّم ثمّ زيّن به ميزو 🎁";
  wrap.appendChild(accHint);

  // إكسسوارات مرتبطة بإنجازات مُسمّاة (تُفتح من اللعب الطبيعي)
  const mastered = (ds) => Object.keys(Store.mastery).filter((k) => k.startsWith(ds + ":")).length;
  const ACCS = [
    { acc: "", name: "بلا إكسسوار", how: "", earned: () => true },
    { acc: "🧢", name: "قبعة المستكشف", how: "أكمل ٥ أنشطة", earned: () => (Store.friendship.xp || 0) >= 5 },
    { acc: "🎀", name: "فيونكة الصداقة", how: "مستوى صداقة ٣", earned: () => Store.friendLevel >= 3 },
    { acc: "📖", name: "نجمة القراءة", how: "أتقن ٣ عناصر", earned: () => Object.values(Store.mastery).filter((v) => v >= 2).length >= 3 },
    { acc: "🔢", name: "تاج الأرقام", how: "أتقن أرقامًا", earned: () => mastered("numbers") >= 3 },
    { acc: "🎩", name: "قبعة المثابرة", how: "العب ٣ أيام متتالية", earned: () => Store.streak >= 3 },
    { acc: "👑", name: "تاج النجوم", how: "اجمع ١٥٠ نجمة", earned: () => Store.stars >= 150 },
    { acc: "⭐", name: "نجمة الأبطال", how: "مستوى صداقة ٦", earned: () => Store.friendLevel >= 6 },
  ];

  const accRow = document.createElement("div");
  accRow.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap";
  ACCS.forEach(({ acc, name, how, earned }) => {
    const got = earned();
    const b = document.createElement("button");
    b.className = "wb-tile";
    b.style.cssText = "position:relative;width:auto;min-width:64px;height:auto;padding:8px 10px;flex-direction:column;gap:2px;font-size:26px";
    b.innerHTML = `<span>${got ? (acc || "🚫") : "🔒"}</span><span style="font-size:10px;font-weight:700;color:#7a6ca8;white-space:nowrap">${got ? name : how}</span>`;
    b.disabled = !got;
    b.style.opacity = got ? "1" : ".55";
    if (got && Store.mizoAccessory === acc) b.style.outline = "4px solid var(--c-green)";
    b.addEventListener("click", () => {
      if (!got) { Sfx.tap(); Speech.mizo(`لتفتح ${name}: ${how}`); return; }
      Sfx.tap();
      Store.setMizoAccessory(acc);
      const fresh = createCharacter();
      previewMizo.el.replaceWith(fresh.el);
      previewMizo.el = fresh.el;
      fresh.setMood("cheer", 1200);
      accRow.querySelectorAll("button").forEach((x) => (x.style.outline = "none"));
      b.style.outline = "4px solid var(--c-green)";
    });
    accRow.appendChild(b);
  });
  wrap.appendChild(accRow);

  // كرت إنجاز قابل للمشاركة (بلا بيانات شخصية)
  const shareBtn = document.createElement("button");
  shareBtn.className = "candy-btn";
  shareBtn.style.cssText = "display:block;margin:20px auto 0;background:linear-gradient(180deg,#34d399,#10b981)";
  shareBtn.textContent = "📤 شارك إنجازك مع ميزو";
  shareBtn.addEventListener("click", () => { Sfx.tap(); Router.go("shareCard"); });
  wrap.appendChild(shareBtn);

  // اختيار الأفاتار
  const h = document.createElement("p");
  h.style.cssText = "font-weight:800;color:var(--c-ink);margin:22px 0 10px;font-size:clamp(16px,4.5vw,20px)";
  h.textContent = "اختر صورتك من كنوزك 🎁";
  wrap.appendChild(h);

  const grid = document.createElement("div");
  grid.className = "regions-grid";

  // خيار المرشد الافتراضي + الكنوز المملوكة
  const owned = COLLECTIBLES.filter((c) => Store.hasCollected(c.id));
  const choices = [{ id: "", emoji: GUIDE, name: "المرشد" }, ...owned];

  choices.forEach((c) => {
    const card = document.createElement("button");
    card.className = "region-card";
    const isSel = Store.avatarId === c.id;
    card.style.cssText = `background:${isSel ? "linear-gradient(160deg,#ffd23f,#ff924c)" : "#cdbfe6"}`;
    card.innerHTML = `<span class="region-emoji">${c.emoji}</span><span class="region-name">${c.name}</span>`;
    card.addEventListener("click", () => {
      Sfx.pop();
      Store.setAvatar(c.id);
      current.textContent = c.emoji;
      grid.querySelectorAll(".region-card").forEach((x) => (x.style.background = "#cdbfe6"));
      card.style.background = "linear-gradient(160deg,#ffd23f,#ff924c)";
      Speech.mizo("غيّرت صورتك، حلوة أوي!");
    });
    grid.appendChild(card);
  });

  if (owned.length === 0) {
    const hint = document.createElement("p");
    hint.style.cssText = "color:#7a6ca8;font-weight:700;margin-top:8px";
    hint.textContent = "تعلّم واجمع الكنوز لتفتح صوراً جديدة!";
    wrap.appendChild(grid);
    wrap.appendChild(hint);
  } else {
    wrap.appendChild(grid);
  }

  screen.appendChild(wrap);

  setTimeout(() => {
    screen.querySelector("#backBtn").addEventListener("click", () => { Sfx.tap(); Router.go("home"); });
  }, 0);

  return screen;
}
