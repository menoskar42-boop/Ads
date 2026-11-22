// ===== فنّ القصص: خلفيات SVG متحرّكة احترافية + فقاعة حوار =====
// خلفيات مشهدية قابلة لإعادة الاستخدام (غابة/مزرعة/ليل/بحر/سماء/بيت/شارع)،
// مرسومة متجهيّاً مع حركات لطيفة (SMIL) — خفيفة وتعمل دون اتصال وبلا صور.

const grad = (id, stops) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`;

// عناصر زينة قابلة لإعادة الاستخدام
const sun = (x, y, r = 34, c = "#ffd23f") => `
  <g transform="translate(${x} ${y})">
    <g>${Array.from({ length: 12 }).map((_, i) => `<rect x="-2" y="${-(r + 14)}" width="4" height="12" rx="2" fill="${c}" transform="rotate(${i * 30})"/>`).join("")}
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="22s" repeatCount="indefinite"/></g>
    <circle r="${r}" fill="${c}"/></g>`;

const moon = (x, y, r = 30) => `
  <g transform="translate(${x} ${y})"><circle r="${r}" fill="#fff6c9"/>
    <circle cx="${r * 0.4}" cy="${-r * 0.3}" r="${r * 0.8}" fill="#cfe3ff" opacity=".25"/></g>`;

const cloud = (x, y, s = 1, dur = 26) => `
  <g transform="translate(${x} ${y}) scale(${s})" opacity=".95">
    <g><animateTransform attributeName="transform" type="translate" values="0 0; 26 0; 0 0" dur="${dur}s" repeatCount="indefinite"/>
    <ellipse cx="0" cy="0" rx="34" ry="20" fill="#fff"/><ellipse cx="26" cy="6" rx="26" ry="16" fill="#fff"/><ellipse cx="-24" cy="6" rx="22" ry="14" fill="#fff"/></g></g>`;

const star = (x, y, r, d) => `
  <g transform="translate(${x} ${y})"><circle r="${r}" fill="#fff">
    <animate attributeName="opacity" values=".3;1;.3" dur="${d}s" repeatCount="indefinite"/></circle></g>`;

const tree = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-7" y="0" width="14" height="40" rx="6" fill="#9b6b3a"/>
    <g><animateTransform attributeName="transform" type="rotate" values="-2 0 0;2 0 0;-2 0 0" dur="5s" repeatCount="indefinite"/>
    <circle cx="0" cy="-22" r="34" fill="#4caf50"/><circle cx="-22" cy="-6" r="24" fill="#5cb85c"/><circle cx="22" cy="-6" r="24" fill="#43a047"/></g></g>`;

const hill = (y, c, op = 1) => `<path d="M0 ${y} Q200 ${y - 70} 400 ${y} L400 300 L0 300 Z" fill="${c}" opacity="${op}"/>`;
const wave = (y, c, dur) => `<path d="M-40 ${y} q40 -16 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 L520 300 L-40 300 Z" fill="${c}">
  <animateTransform attributeName="transform" type="translate" values="0 0;-80 0;0 0" dur="${dur}s" repeatCount="indefinite"/></path>`;

// خريطة الخلفيات → SVG كامل (viewBox 0 0 400 300)
const BACKDROPS = {
  sky: () => `${grad("g", `<stop offset="0" stop-color="#bfe9ff"/><stop offset="1" stop-color="#eaf7ff"/>`)}
    <rect width="400" height="300" fill="url(#g)"/>${sun(320, 60)}${cloud(110, 70, 1, 30)}${cloud(260, 120, .7, 38)}${hill(230, "#a8e063")}${hill(255, "#7cc242")}`,
  meadow: () => `${grad("g", `<stop offset="0" stop-color="#cdeffd"/><stop offset="1" stop-color="#eafff0"/>`)}
    <rect width="400" height="300" fill="url(#g)"/>${sun(60, 56, 28)}${cloud(250, 60, .9, 34)}${hill(215, "#9be15d")}${hill(245, "#6fcf3f")}${tree(70, 175, 1)}${tree(340, 185, .85)}`,
  forest: () => `${grad("g", `<stop offset="0" stop-color="#bdeacf"/><stop offset="1" stop-color="#e7f8ee"/>`)}
    <rect width="400" height="300" fill="url(#g)"/>${cloud(300, 56, .7, 40)}${hill(210, "#7cc242")}${tree(60, 150, 1.2)}${tree(170, 165, 1)}${tree(300, 150, 1.25)}${hill(265, "#5aa92f", .9)}`,
  farm: () => `${grad("g", `<stop offset="0" stop-color="#ffe7a8"/><stop offset="1" stop-color="#fff6e0"/>`)}
    <rect width="400" height="300" fill="url(#g)"/>${sun(330, 54)}${cloud(120, 70, .9, 32)}${hill(235, "#d6b34a")}${hill(258, "#c79a2e")}
    <g transform="translate(60 150)"><rect x="0" y="20" width="80" height="60" fill="#c0392b"/><polygon points="-8,20 40,-14 88,20" fill="#7d2620"/><rect x="30" y="46" width="22" height="34" fill="#7d4a2a"/></g>`,
  night: () => `${grad("g", `<stop offset="0" stop-color="#1b2a5e"/><stop offset="1" stop-color="#3a4a8c"/>`)}
    <rect width="400" height="300" fill="url(#g)"/>${moon(320, 60)}${star(60, 50, 2.5, 2.2)}${star(120, 90, 2, 3)}${star(200, 50, 3, 2.6)}${star(250, 100, 2, 3.4)}${star(160, 130, 2.2, 2)}${star(350, 130, 2.5, 2.8)}${hill(250, "#2c3a73")}`,
  sea: () => `${grad("g", `<stop offset="0" stop-color="#bfeaff"/><stop offset="1" stop-color="#7fd0f0"/>`)}
    <rect width="400" height="300" fill="url(#g)"/>${sun(70, 56, 26)}${cloud(280, 70, .9, 34)}${wave(190, "#4fb8e6", 7)}${wave(215, "#2f9fd6", 9)}${wave(245, "#1f86bf", 11)}`,
  home: () => `${grad("g", `<stop offset="0" stop-color="#ffe9d6"/><stop offset="1" stop-color="#ffd9c2"/>`)}
    <rect width="400" height="300" fill="url(#g)"/><rect y="210" width="400" height="90" fill="#e0a87e"/>
    <rect x="40" y="70" width="120" height="90" rx="8" fill="#bfe3ff" stroke="#fff" stroke-width="6"/><line x1="100" y1="70" x2="100" y2="160" stroke="#fff" stroke-width="4"/><line x1="40" y1="115" x2="160" y2="115" stroke="#fff" stroke-width="4"/>`,
  street: () => `${grad("g", `<stop offset="0" stop-color="#cdeafd"/><stop offset="1" stop-color="#eaf6ff"/>`)}
    <rect width="400" height="300" fill="url(#g)"/>${sun(330, 50, 26)}${cloud(120, 64, .8, 30)}<rect y="225" width="400" height="75" fill="#9aa3ad"/><rect y="248" width="400" height="6" fill="#fff" opacity=".7"/>
    <g transform="translate(60 120)"><rect width="70" height="105" fill="#ffb86c"/><rect x="10" y="14" width="20" height="20" fill="#bfe3ff"/><rect x="40" y="14" width="20" height="20" fill="#bfe3ff"/></g>
    <g transform="translate(280 110)"><rect width="80" height="115" fill="#8fd3c0"/><rect x="12" y="16" width="22" height="22" fill="#bfe3ff"/><rect x="46" y="16" width="22" height="22" fill="#bfe3ff"/></g>`,
  clinic: () => `${grad("g", `<stop offset="0" stop-color="#eef8fc"/><stop offset="1" stop-color="#dceff7"/>`)}
    <rect width="400" height="300" fill="url(#g)"/><rect y="226" width="400" height="74" fill="#cfe6f0"/>
    <rect x="34" y="38" width="56" height="56" rx="9" fill="#fff" stroke="#e3eef4" stroke-width="2"/><rect x="55" y="46" width="14" height="40" rx="3" fill="#e8413a"/><rect x="42" y="59" width="40" height="14" rx="3" fill="#e8413a"/>
    <rect x="300" y="116" width="72" height="110" fill="#bfe0ee"/><rect x="300" y="148" width="72" height="4" fill="#fff"/><rect x="300" y="184" width="72" height="4" fill="#fff"/>
    <rect x="120" y="186" width="180" height="20" rx="6" fill="#7aa7d8"/><rect x="120" y="164" width="44" height="42" rx="8" fill="#9cc0e6"/>`,
  room: () => `${grad("g", `<stop offset="0" stop-color="#ffe9d6"/><stop offset="1" stop-color="#ffdcc4"/>`)}
    <rect width="400" height="300" fill="url(#g)"/><rect y="220" width="400" height="80" fill="#d8a878"/>
    <rect x="250" y="48" width="104" height="82" rx="6" fill="#bfe3ff" stroke="#fff" stroke-width="6"/><line x1="302" y1="48" x2="302" y2="130" stroke="#fff" stroke-width="4"/><line x1="250" y1="89" x2="354" y2="89" stroke="#fff" stroke-width="4"/>
    <rect x="36" y="150" width="150" height="70" rx="10" fill="#9a7cf0"/><rect x="36" y="150" width="46" height="70" rx="10" fill="#b9a3f5"/>
    <rect x="120" y="58" width="52" height="40" rx="4" fill="#fff" stroke="#e0c0a0" stroke-width="3"/>`,
};

/** يُرجع SVG خلفية المشهد (نصّ HTML) */
export function sceneBackdrop(bg) {
  const fn = BACKDROPS[bg] || BACKDROPS.sky;
  return `<svg class="story-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${fn()}</svg>`;
}

export const STORY_BACKDROPS = Object.keys(BACKDROPS);

// ===== عناصر مشهدية (props) تُجسّد نصّ القصة — طبقة أمامية فوق الشخصيات =====
// إحداثيات المشهد 0..400 ×0..300 (أسفل الكادر للأشياء الأمامية كالطاولة).
const PROPS = {
  "table-plates": `<rect x="116" y="234" width="174" height="15" rx="5" fill="#b07a45"/><rect x="130" y="249" width="12" height="44" fill="#8a5a2e"/><rect x="264" y="249" width="12" height="44" fill="#8a5a2e"/><ellipse cx="158" cy="234" rx="22" ry="7" fill="#fff" stroke="#e0e6ee" stroke-width="2"/><ellipse cx="203" cy="232" rx="22" ry="7" fill="#fff" stroke="#e0e6ee" stroke-width="2"/><ellipse cx="248" cy="234" rx="22" ry="7" fill="#fff" stroke="#e0e6ee" stroke-width="2"/>`,
  table: `<rect x="120" y="236" width="170" height="15" rx="5" fill="#b07a45"/><rect x="132" y="251" width="12" height="42" fill="#8a5a2e"/><rect x="266" y="251" width="12" height="42" fill="#8a5a2e"/>`,
  pot: `<rect x="250" y="252" width="92" height="40" rx="6" fill="#9aa3ad"/><rect x="262" y="232" width="66" height="22" rx="6" fill="#6b6f76"/><rect x="256" y="228" width="78" height="6" rx="3" fill="#555"/><ellipse cx="295" cy="228" rx="9" ry="4" fill="#ffe08a" opacity=".7"><animate attributeName="cy" values="228;220;228" dur="2.2s" repeatCount="indefinite"/></ellipse>`,
  toys: `<rect x="48" y="262" width="26" height="26" rx="4" fill="#e8413a"/><rect x="86" y="268" width="22" height="22" rx="4" fill="#2f9fd6"/><circle cx="330" cy="278" r="14" fill="#ffd23f"/><polygon points="296,292 310,264 324,292" fill="#4caf50"/>`,
  basket: `<path d="M250 250 h70 l-8 38 h-54 z" fill="#e07b39"/><path d="M250 250 h70" stroke="#a85a24" stroke-width="4"/><path d="M258 250 q27 -26 54 0" fill="none" stroke="#a85a24" stroke-width="4"/>`,
  flowers: `${[40, 120, 300, 360].map((x, i) => `<g transform="translate(${x} ${280 - (i % 2) * 8})"><rect x="-2" y="0" width="4" height="14" fill="#4caf50"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-6" rx="3.5" ry="6" fill="${["#ff7eb6", "#ffd23f", "#a06cd5"][i % 3]}" transform="rotate(${a})"/>`).join("")}<circle r="3" fill="#fff"/></g>`).join("")}`,
};

/** طبقة عناصر مشهدية (SVG) تُجسّد أحداث النصّ */
export function sceneProps(list) {
  if (!list || !list.length) return "";
  const inner = list.map((k) => PROPS[k] || "").join("");
  return `<svg class="story-svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
