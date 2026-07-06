// ===== لعبة التلوين: لوّن الصور باختيار الألوان =====
// تظهر صورة بخطوط فارغة، يختار الطفل لوناً ويضغط على أي جزء ليملأه.
// رسومات SVG بسيطة قابلة للتلوين (كل جزء مستقل). تنتقل بين عدة صور.
import { Router } from "../core/router.js";
import { Sfx } from "../core/audio.js";
import { Speech } from "../core/speech.js";
import { gameTopbar, finishActivity, shuffle, showCheer } from "./common.js";
import { awardStars } from "../core/rewards.js";

const PALETTE = [
  "#ff5d5d", "#ff924c", "#ffd23f", "#34d399",
  "#38bdf8", "#7c5fe6", "#ff6fb5", "#8b5e34", "#2b2b2b", "#ffffff",
];

// كل صورة: اسم عربي + أجزاء SVG قابلة للتلوين (class="cl")
const PICTURES = [
  {
    name: "تُفّاحة",
    svg: `
      <rect class="cl" x="96" y="38" width="9" height="26" rx="4"/>
      <ellipse class="cl" cx="122" cy="48" rx="18" ry="9" transform="rotate(-25 122 48)"/>
      <path class="cl" d="M100 62 C70 42 40 64 46 102 C50 142 80 166 100 166 C120 166 150 142 154 102 C160 64 130 42 100 62 Z"/>`,
  },
  {
    name: "سمكة",
    svg: `
      <polygon class="cl" points="150,100 192,68 192,132"/>
      <ellipse class="cl" cx="95" cy="100" rx="62" ry="40"/>
      <polygon class="cl" points="95,60 122,38 128,72"/>
      <circle class="cl" cx="62" cy="88" r="10"/>`,
  },
  {
    name: "منزل",
    svg: `
      <polygon class="cl" points="38,102 100,48 162,102"/>
      <rect class="cl" x="50" y="102" width="100" height="80"/>
      <rect class="cl" x="86" y="135" width="30" height="47"/>
      <rect class="cl" x="60" y="116" width="22" height="22"/>
      <rect class="cl" x="118" y="116" width="22" height="22"/>`,
  },
  {
    name: "فَراشة",
    svg: `
      <ellipse class="cl" cx="72" cy="78" rx="30" ry="24"/>
      <ellipse class="cl" cx="128" cy="78" rx="30" ry="24"/>
      <ellipse class="cl" cx="74" cy="126" rx="25" ry="19"/>
      <ellipse class="cl" cx="126" cy="126" rx="25" ry="19"/>
      <ellipse class="cl" cx="100" cy="100" rx="9" ry="42"/>`,
  },
  {
    name: "بالون",
    svg: `
      <line x1="100" y1="148" x2="100" y2="186" stroke="#3a2c66" stroke-width="3"/>
      <ellipse class="cl" cx="100" cy="82" rx="50" ry="60"/>
      <polygon class="cl" points="92,140 108,140 100,154"/>`,
  },
  {
    name: "زَهرة",
    svg: `
      <rect class="cl" x="96" y="100" width="8" height="76"/>
      <ellipse class="cl" cx="128" cy="150" rx="22" ry="11"/>
      <circle class="cl" cx="100" cy="56" r="22"/>
      <circle class="cl" cx="68" cy="80" r="22"/>
      <circle class="cl" cx="132" cy="80" r="22"/>
      <circle class="cl" cx="80" cy="116" r="22"/>
      <circle class="cl" cx="120" cy="116" r="22"/>
      <circle class="cl" cx="100" cy="90" r="20"/>`,
  },
  {
    name: "سيّارة",
    svg: `
      <path class="cl" d="M68 96 L84 64 L134 64 L152 96 Z"/>
      <rect class="cl" x="34" y="96" width="132" height="42" rx="12"/>
      <circle class="cl" cx="70" cy="142" r="18"/>
      <circle class="cl" cx="132" cy="142" r="18"/>`,
  },
  {
    name: "شجرة",
    svg: `
      <rect class="cl" x="91" y="120" width="18" height="58" rx="4"/>
      <circle class="cl" cx="70" cy="100" r="30"/>
      <circle class="cl" cx="130" cy="100" r="30"/>
      <circle class="cl" cx="100" cy="74" r="38"/>`,
  },
  {
    name: "آيس كريم",
    svg: `
      <polygon class="cl" points="76,112 124,112 100,182"/>
      <circle class="cl" cx="80" cy="84" r="20"/>
      <circle class="cl" cx="120" cy="84" r="20"/>
      <circle class="cl" cx="100" cy="68" r="24"/>`,
  },
  {
    name: "قارب",
    svg: `
      <rect class="cl" x="22" y="142" width="156" height="34" rx="10"/>
      <path class="cl" d="M52 112 L148 112 L130 144 L70 144 Z"/>
      <polygon class="cl" points="104,40 104,108 152,108"/>
      <polygon class="cl" points="96,40 96,108 52,108"/>`,
  },
  {
    name: "شمس",
    svg: `
      <polygon class="cl" points="92,52 108,52 100,16"/>
      <polygon class="cl" points="92,148 108,148 100,184"/>
      <polygon class="cl" points="52,92 52,108 16,100"/>
      <polygon class="cl" points="148,92 148,108 184,100"/>
      <circle class="cl" cx="100" cy="100" r="42"/>`,
  },
  {
    name: "قطّة",
    svg: `
      <polygon class="cl" points="55,72 72,32 96,74"/>
      <polygon class="cl" points="145,72 128,32 104,74"/>
      <circle class="cl" cx="100" cy="108" r="54"/>
      <polygon class="cl" points="93,118 107,118 100,130"/>`,
  },
  {
    name: "فِطر",
    svg: `
      <rect class="cl" x="82" y="100" width="36" height="72" rx="10"/>
      <path class="cl" d="M36 102 C36 58 164 58 164 102 Z"/>
      <circle class="cl" cx="74" cy="86" r="11"/>
      <circle class="cl" cx="122" cy="80" r="13"/>`,
  },
  {
    name: "مظلّة",
    svg: `
      <rect class="cl" x="96" y="98" width="8" height="64" rx="3"/>
      <path class="cl" d="M28 100 C28 54 172 54 172 100 Z"/>
      <polygon class="cl" points="28,100 50,120 72,100"/>
      <polygon class="cl" points="128,100 150,120 172,100"/>`,
  },
  {
    name: "طائرة ورقية",
    svg: `
      <polygon class="cl" points="100,28 52,100 100,100"/>
      <polygon class="cl" points="100,28 148,100 100,100"/>
      <polygon class="cl" points="100,152 52,100 100,100"/>
      <polygon class="cl" points="100,152 148,100 100,100"/>`,
  },
  {
    name: "دبدوب",
    svg: `
      <circle class="cl" cx="62" cy="64" r="20"/>
      <circle class="cl" cx="138" cy="64" r="20"/>
      <circle class="cl" cx="100" cy="108" r="50"/>
      <ellipse class="cl" cx="100" cy="122" rx="26" ry="20"/>
      <circle class="cl" cx="100" cy="112" r="8"/>`,
  },
  {
    name: "بطّة",
    svg: `
      <ellipse class="cl" cx="92" cy="122" rx="52" ry="36"/>
      <ellipse class="cl" cx="88" cy="120" rx="26" ry="18"/>
      <circle class="cl" cx="136" cy="80" r="26"/>
      <polygon class="cl" points="158,76 194,86 158,98"/>`,
  },
  {
    name: "قطار",
    svg: `
      <rect class="cl" x="48" y="58" width="20" height="34"/>
      <rect class="cl" x="30" y="90" width="92" height="50" rx="8"/>
      <rect class="cl" x="122" y="62" width="46" height="78" rx="6"/>
      <circle class="cl" cx="58" cy="150" r="16"/>
      <circle class="cl" cx="118" cy="150" r="16"/>`,
  },
  {
    name: "أصيص ورد",
    svg: `
      <rect class="cl" x="94" y="72" width="8" height="50"/>
      <polygon class="cl" points="70,122 130,122 122,172 78,172"/>
      <circle class="cl" cx="100" cy="44" r="16"/>
      <circle class="cl" cx="74" cy="60" r="16"/>
      <circle class="cl" cx="126" cy="60" r="16"/>
      <circle class="cl" cx="100" cy="58" r="15"/>`,
  },
  {
    name: "روبوت",
    svg: `
      <circle class="cl" cx="100" cy="28" r="9"/>
      <rect class="cl" x="68" y="42" width="64" height="50" rx="10"/>
      <circle class="cl" cx="86" cy="66" r="8"/>
      <circle class="cl" cx="114" cy="66" r="8"/>
      <rect class="cl" x="60" y="98" width="80" height="66" rx="10"/>`,
  },
  {
    name: "كعكة",
    svg: `
      <ellipse class="cl" cx="100" cy="168" rx="72" ry="12"/>
      <rect class="cl" x="50" y="110" width="100" height="52" rx="8"/>
      <rect class="cl" x="62" y="80" width="76" height="34" rx="8"/>
      <rect class="cl" x="96" y="58" width="8" height="22"/>
      <circle class="cl" cx="100" cy="52" r="8"/>`,
  },
  {
    name: "بطريق",
    svg: `
      <ellipse class="cl" cx="100" cy="112" rx="48" ry="60"/>
      <ellipse class="cl" cx="100" cy="122" rx="28" ry="44"/>
      <polygon class="cl" points="100,80 120,92 100,102"/>
      <ellipse class="cl" cx="82" cy="170" rx="15" ry="8"/>
      <ellipse class="cl" cx="118" cy="170" rx="15" ry="8"/>`,
  },
  {
    name: "فيل",
    svg: `
      <ellipse class="cl" cx="108" cy="108" rx="54" ry="42"/>
      <circle class="cl" cx="66" cy="96" r="34"/>
      <circle class="cl" cx="70" cy="92" r="18"/>
      <rect class="cl" x="40" y="98" width="15" height="48" rx="7"/>
      <rect class="cl" x="92" y="142" width="16" height="28" rx="5"/>
      <rect class="cl" x="128" y="142" width="16" height="28" rx="5"/>`,
  },
  {
    name: "سلحفاة",
    svg: `
      <ellipse class="cl" cx="98" cy="104" rx="56" ry="40"/>
      <circle class="cl" cx="98" cy="104" r="22"/>
      <circle class="cl" cx="152" cy="100" r="16"/>
      <ellipse class="cl" cx="64" cy="146" rx="16" ry="9"/>
      <ellipse class="cl" cx="132" cy="146" rx="16" ry="9"/>`,
  },
  {
    name: "نحلة",
    svg: `
      <ellipse class="cl" cx="78" cy="76" rx="20" ry="14"/>
      <ellipse class="cl" cx="122" cy="76" rx="20" ry="14"/>
      <ellipse class="cl" cx="100" cy="112" rx="44" ry="34"/>
      <rect class="cl" x="86" y="82" width="14" height="60" rx="3"/>
      <rect class="cl" x="106" y="82" width="14" height="60" rx="3"/>`,
  },
  {
    name: "زهرة التوليب",
    svg: `
      <rect class="cl" x="96" y="95" width="8" height="72"/>
      <ellipse class="cl" cx="72" cy="134" rx="22" ry="10" transform="rotate(-25 72 134)"/>
      <ellipse class="cl" cx="128" cy="134" rx="22" ry="10" transform="rotate(25 128 134)"/>
      <path class="cl" d="M72 75 Q72 45 100 50 Q128 45 128 75 L128 96 Q100 112 72 96 Z"/>`,
  },
  {
    name: "سحابة ومطر",
    svg: `
      <circle class="cl" cx="78" cy="78" r="24"/>
      <circle class="cl" cx="122" cy="78" r="28"/>
      <circle class="cl" cx="100" cy="64" r="28"/>
      <rect class="cl" x="62" y="78" width="76" height="24" rx="12"/>
      <ellipse class="cl" cx="82" cy="138" rx="8" ry="14"/>
      <ellipse class="cl" cx="118" cy="138" rx="8" ry="14"/>`,
  },
  {
    name: "شمعة",
    svg: `
      <ellipse class="cl" cx="100" cy="58" rx="11" ry="18"/>
      <rect class="cl" x="78" y="82" width="44" height="72" rx="6"/>
      <rect class="cl" x="68" y="154" width="64" height="14" rx="6"/>`,
  },
  {
    name: "عَلَم",
    svg: `
      <rect class="cl" x="48" y="46" width="7" height="124" rx="3"/>
      <rect class="cl" x="55" y="50" width="92" height="26"/>
      <rect class="cl" x="55" y="76" width="92" height="26"/>
      <rect class="cl" x="55" y="102" width="92" height="26"/>`,
  },
];

export function renderColoring({ regionId, regionIndex, title, bg }) {
  const pics = shuffle(PICTURES);
  let index = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#fff3d6,#ffd6ec)";

  const back = () => Router.go(regionId ? "region" : "home", regionId ? { id: regionId, index: regionIndex } : {});
  screen.appendChild(gameTopbar(title || "🎨 التلوين", back));

  const wrap = document.createElement("div");
  wrap.style.cssText = "max-width:560px;margin:0 auto;padding:6px 14px 30px";
  screen.appendChild(wrap);

  const name = document.createElement("p");
  name.style.cssText = "text-align:center;font-weight:800;color:#5b3fb5;font-size:clamp(18px,5vw,26px);margin:6px 0 10px";
  wrap.appendChild(name);

  const stage = document.createElement("div");
  stage.className = "color-stage";
  wrap.appendChild(stage);

  let color = PALETTE[0];

  function loadPicture() {
    const pic = pics[index];
    name.textContent = `لوّن: ${pic.name} 🖌️`;
    stage.innerHTML =
      `<svg viewBox="0 0 200 200" class="color-svg" preserveAspectRatio="xMidYMid meet">${pic.svg}</svg>`;
    const svg = stage.querySelector("svg");
    svg.querySelectorAll(".cl").forEach((part) => {
      part.setAttribute("fill", "#ffffff");
      part.setAttribute("stroke", "#3a2c66");
      part.setAttribute("stroke-width", "2.5");
      part.style.cursor = "pointer";
      part.addEventListener("click", () => {
        part.setAttribute("fill", color);
        Sfx.pop();
      });
    });
    Speech.ar(`لوّن ${pic.name}`);
  }

  // شريط الألوان
  const palette = document.createElement("div");
  palette.style.cssText = "display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px";
  PALETTE.forEach((col, idx) => {
    const b = document.createElement("button");
    b.style.cssText =
      `width:38px;height:38px;border-radius:50%;border:4px solid ${idx === 0 ? "#5b3fb5" : "#fff"};` +
      `background:${col};box-shadow:var(--shadow-card);transition:transform .12s ease`;
    b.addEventListener("click", () => {
      color = col; Sfx.tap();
      palette.querySelectorAll("button").forEach((x) => (x.style.border = "4px solid #fff"));
      b.style.border = "4px solid #5b3fb5";
      b.style.transform = "scale(1.15)";
      setTimeout(() => (b.style.transform = ""), 150);
    });
    palette.appendChild(b);
  });
  wrap.appendChild(palette);

  // الأزرار: التالي / تم
  const ctrl = document.createElement("div");
  ctrl.style.cssText = "display:flex;gap:12px;justify-content:center;margin-top:16px;flex-wrap:wrap";
  const nextBtn = document.createElement("button");
  nextBtn.className = "candy-btn";
  nextBtn.textContent = "صورة أخرى 🔄";
  nextBtn.addEventListener("click", () => {
    Sfx.tap();
    index = (index + 1) % pics.length;
    loadPicture();
  });
  const doneBtn = document.createElement("button");
  doneBtn.className = "candy-btn";
  doneBtn.style.background = "linear-gradient(180deg,#34d399,#10b981)";
  doneBtn.textContent = "✓ انتهيت";
  doneBtn.addEventListener("click", () => {
    if (regionId) {
      finishActivity({ regionId, regionIndex, stars: 5, onDone: back });
    } else {
      // وصول سريع من الشاشة الرئيسية: مكافأة بسيطة بلا تقدّم منطقة
      awardStars(3);
      showCheer("🎨", "لوحة رائعة!", back);
    }
  });
  ctrl.append(nextBtn, doneBtn);
  wrap.appendChild(ctrl);

  setTimeout(loadPicture, 30);
  return screen;
}
