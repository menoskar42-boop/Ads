// ===== شخصيات وعناصر القصص: رسوم SVG كرتونية متحرّكة احترافية =====
// بديل احترافي للإيموجي: شخصيات (أولاد/بنات/أمّ/أب/طبيبة) وحيوانات وعناصر،
// بأسلوب كرتوني ودود متّسق مع ميزو، مع حركات لطيفة (SMIL: تمايل + رمش العين).

// رمشة عين مشتركة (تُلصق داخل الوجه)
const blink = (cx, cy, r = 3.4) => `
  <g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#3a2a20"/><circle cx="${cx + 1}" cy="${cy - 1}" r="1.1" fill="#fff"/>
  <animateTransform attributeName="transform" type="scale" additive="sum" values="1 1;1 1;1 0.1;1 1" keyTimes="0;0.92;0.96;1" dur="4.5s" repeatCount="indefinite"/></g>`;

// وجه ودود معبّر (حواجب + عيون كبيرة بلمعة ترمش + أنف + ابتسامة + خدّان)
const face = (cx, cy, skin, r = 26) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${skin}"/>
  <path d="M${cx - 15} ${cy - 9} q5 -4 11 -1.5" stroke="#6a4630" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M${cx + 4} ${cy - 10.5} q6 -2.5 11 1.5" stroke="#6a4630" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <g style="transform-box:fill-box;transform-origin:center">
    <ellipse cx="${cx - 8.5}" cy="${cy - 1}" rx="5" ry="6.4" fill="#fff"/><circle cx="${cx - 7.5}" cy="${cy + 0.4}" r="3.4" fill="#43332a"/><circle cx="${cx - 6.2}" cy="${cy - 1.4}" r="1.3" fill="#fff"/>
    <ellipse cx="${cx + 8.5}" cy="${cy - 1}" rx="5" ry="6.4" fill="#fff"/><circle cx="${cx + 9.5}" cy="${cy + 0.4}" r="3.4" fill="#43332a"/><circle cx="${cx + 10.8}" cy="${cy - 1.4}" r="1.3" fill="#fff"/>
    <animateTransform attributeName="transform" type="scale" additive="sum" values="1 1;1 1;1 0.1;1 1" keyTimes="0;0.9;0.95;1" dur="4.6s" repeatCount="indefinite"/>
  </g>
  <path d="M${cx - 1.5} ${cy + 3.5} q1.5 2.5 3 0" stroke="#d99a66" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M${cx - 8} ${cy + 9} q8 8 16 0" stroke="#a85a45" stroke-width="2.8" fill="none" stroke-linecap="round"/>
  <circle cx="${cx - 15.5}" cy="${cy + 6}" r="3.6" fill="#ff9d9d" opacity=".55"/>
  <circle cx="${cx + 15.5}" cy="${cy + 6}" r="3.6" fill="#ff9d9d" opacity=".55"/>`;

// تمايل لطيف للجسم كلّه
const bob = (inner, dur = 2.6) =>
  `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="${dur}s" repeatCount="indefinite"/>${inner}</g>`;

// طفل/شخص عام (قابل للتخصيص): شعر/قميص/بنطلون أو فستان — بأسلوب كرتوني فلات مصقول
function person({ skin = "#f1c191", hair = "#3a2a20", shirt = "#2f6fdb", pants = "#39507a", shoe = "#2746c9", dress = null, longHair = false, extra = "" } = {}) {
  const legs = `<rect x="50" y="116" width="9" height="22" rx="4" fill="${pants}"/><rect x="61" y="116" width="9" height="22" rx="4" fill="${pants}"/>
    <path d="M45 138 q0 -7 8 -7 h4 q3 0 3 4 v4 h-15z" fill="${shoe}"/><path d="M75 138 q0 -7 -8 -7 h-4 q-3 0 -3 4 v4 h15z" fill="${shoe}"/>
    <path d="M46 137 h13 M61 137 h13" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;
  const body = dress
    ? `<path d="M45 84 q15 -9 30 0 L86 128 L34 128 Z" fill="${dress}"/><path d="M45 84 q15 -9 30 0 v5 q-15 8 -30 0z" fill="rgba(0,0,0,.07)"/><ellipse cx="60" cy="103" rx="5" ry="5" fill="rgba(255,255,255,.3)"/>`
    : `${legs}<path d="M44 86 q16 -10 32 0 v26 q0 10 -10 10 h-12 q-10 0 -10 -10 z" fill="${shirt}"/><path d="M52 84 q8 7 16 0" stroke="rgba(255,255,255,.45)" stroke-width="2.2" fill="none"/>`;
  const arms = `<rect x="34" y="86" width="9" height="27" rx="4.5" fill="${dress || shirt}"/><rect x="77" y="86" width="9" height="27" rx="4.5" fill="${dress || shirt}"/>
    <circle cx="38" cy="115" r="5.6" fill="${skin}"/><circle cx="82" cy="115" r="5.6" fill="${skin}"/>`;
  const neck = `<rect x="55" y="74" width="10" height="12" rx="3" fill="${skin}"/>`;
  const hairSvg = longHair
    ? `<path d="M30 58 Q27 104 42 112 L48 70 Z" fill="${hair}"/><path d="M90 58 Q93 104 78 112 L72 70 Z" fill="${hair}"/><path d="M31 58 Q29 22 60 20 Q91 22 89 58 Q80 44 60 45 Q40 44 31 58 Z" fill="${hair}"/><path d="M44 32 Q60 25 76 32" stroke="rgba(255,255,255,.22)" stroke-width="3" fill="none"/>`
    : `<path d="M33 58 Q30 23 60 21 Q90 23 87 58 Q78 44 60 45 Q42 44 33 58 Z" fill="${hair}"/><path d="M44 33 Q60 26 76 33" stroke="rgba(255,255,255,.2)" stroke-width="3" fill="none"/>`;
  return bob(`${arms}${neck}${body}${hairSvg}${face(60, 52, skin)}${extra}`);
}

// شخصيات جاهزة
const CHARS = {
  boy: () => person({ shirt: "#2f6fdb", hair: "#2a1d16" }),
  girl: () => person({ dress: "#ff6f9c", hair: "#6a3b22", longHair: true, extra: `<circle cx="40" cy="40" r="5" fill="#ff3d7f"/>` }),
  child: () => person({ shirt: "#34c38f", hair: "#3a2a20", extra: `<polygon points="60,16 64,26 54,26" fill="#ffd23f"/>` }),
  woman: () => person({ dress: "#a06cd5", hair: "#3a241a", longHair: true }),
  man: () => person({ shirt: "#3a7d44", hair: "#241a14", extra: `<rect x="52" y="64" width="16" height="3" rx="1.5" fill="#3a241a"/>` }),
  doctor: () => person({ shirt: "#ffffff", hair: "#2a1d16", extra: `<rect x="42" y="84" width="36" height="40" rx="15" fill="#fff" stroke="#dfe6ef" stroke-width="1.5"/><circle cx="60" cy="30" r="9" fill="none" stroke="#cfd8e3" stroke-width="3"/><circle cx="60" cy="30" r="3" fill="#7aa7d8"/><path d="M54 96 q6 8 12 0" stroke="#6aa9e0" stroke-width="2" fill="none"/>` }),
};

// حيوانات
const ANIMALS = {
  lion: () => bob(`<g>${Array.from({ length: 14 }).map((_, i) => `<ellipse cx="60" cy="30" rx="9" ry="15" fill="#c97b1f" transform="rotate(${i * 360 / 14} 60 58)"/>`).join("")}</g><circle cx="60" cy="58" r="26" fill="#f0a93f"/>${face(60, 58, "#f7c87a", 23)}<ellipse cx="60" cy="66" rx="6" ry="4" fill="#7a4a35"/>`),
  mouse: () => bob(`<circle cx="44" cy="50" r="13" fill="#c9c3cf"/><circle cx="76" cy="50" r="13" fill="#c9c3cf"/><circle cx="44" cy="50" r="7" fill="#ffc0cb"/><circle cx="76" cy="50" r="7" fill="#ffc0cb"/>${face(60, 64, "#d7d2dd", 24)}<circle cx="60" cy="72" r="3.5" fill="#ff8fa3"/>`, 2.2),
  fish: () => bob(`<polygon points="86,68 104,52 104,84" fill="#1f86bf"/><ellipse cx="56" cy="68" rx="40" ry="28" fill="#2f9fd6"/><path d="M56 40 q14 8 0 16 z" fill="#1f86bf"/>${blink(46, 64, 4)}<path d="M40 76 q8 6 16 0" stroke="#0f5e8f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`, 2.4),
  bird: () => bob(`<ellipse cx="60" cy="70" rx="30" ry="26" fill="#ffd23f"/><circle cx="60" cy="46" r="20" fill="#ffd23f"/><polygon points="60,46 74,52 60,58" fill="#ff924c"/>${blink(56, 44, 3)}<path d="M70 70 q16 -6 18 8 q-12 4 -18 -8 z" fill="#ffb13f"><animateTransform attributeName="transform" type="rotate" values="0 76 72;-16 76 72;0 76 72" dur="0.9s" repeatCount="indefinite"/></path>`, 2),
  octopus: () => bob(`<circle cx="60" cy="56" r="28" fill="#ff7eb6"/>${blink(52, 52, 3.5)}${blink(68, 52, 3.5)}<path d="M52 60 q8 6 16 0" stroke="#c84d8a" stroke-width="2.5" fill="none" stroke-linecap="round"/>${[36, 48, 60, 72, 84].map((x, i) => `<path d="M${x} 82 q-4 18 ${i % 2 ? 6 : -6} 26" stroke="#ff7eb6" stroke-width="9" fill="none" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="${i % 2 ? 4 : -4} ${x} 82;${i % 2 ? -4 : 4} ${x} 82;${i % 2 ? 4 : -4} ${x} 82" dur="${2 + i * 0.2}s" repeatCount="indefinite"/></path>`).join("")}`, 2.4),
  turtle: () => bob(`<ellipse cx="40" cy="92" rx="9" ry="6" fill="#7cc242"/><ellipse cx="80" cy="92" rx="9" ry="6" fill="#7cc242"/><circle cx="90" cy="74" r="13" fill="#8fd35a"/>${blink(92, 72, 2.6)}<path d="M44 60 Q60 40 76 60 Q80 84 60 88 Q40 84 44 60 Z" fill="#5aa92f"/><path d="M52 64 h16 M60 58 v22" stroke="#3f8021" stroke-width="2.5"/>`, 3.4),
  rabbit: () => bob(`<ellipse cx="50" cy="34" rx="7" ry="20" fill="#f0e6ef"/><ellipse cx="70" cy="34" rx="7" ry="20" fill="#f0e6ef"/><ellipse cx="50" cy="36" rx="3" ry="13" fill="#ffc0cb"/><ellipse cx="70" cy="36" rx="3" ry="13" fill="#ffc0cb"/>${face(60, 66, "#f4ecf3", 24)}<circle cx="60" cy="74" r="3" fill="#ff8fa3"/>`, 2.2),
};

// عناصر/أشياء بسيطة
const OBJECTS = {
  apple: (c = "#e8413a") => bob(`<path d="M60 36 q4 -10 14 -10" stroke="#7a4a2a" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M62 34 q10 -8 18 0 q-8 8 -18 0z" fill="#4caf50"/><path d="M60 38 q-26 -6 -26 26 q0 30 26 36 q26 -6 26 -36 q0 -32 -26 -26z" fill="${c}"/><ellipse cx="50" cy="54" rx="6" ry="9" fill="#fff" opacity=".25"/>`),
  greenapple: () => OBJECTS.apple("#7cc242"),
  cookie: () => bob(`<circle cx="60" cy="64" r="34" fill="#e0b46a"/><circle cx="60" cy="64" r="34" fill="none" stroke="#c79a4e" stroke-width="3"/>${[[48, 52], [72, 54], [56, 74], [74, 78], [42, 70], [64, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="#5a3a22"/>`).join("")}`),
  cheese: () => bob(`<polygon points="30,80 90,80 90,52 40,52" fill="#ffcf3f"/><polygon points="30,80 40,52 40,72" fill="#f0b21f"/>${[[52, 66], [66, 60], [74, 72], [58, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#f0b21f"/>`).join("")}`),
  carrot: () => bob(`<path d="M48 44 q12 -22 24 0 z" fill="#4caf50"/><path d="M60 30 v16 M50 34 v12 M70 34 v12" stroke="#4caf50" stroke-width="4" stroke-linecap="round"/><polygon points="44,52 76,52 60,98" fill="#ff8c1a"/><path d="M52 64 h16 M55 76 h10" stroke="#e07712" stroke-width="2.5"/>`),
  tree: () => bob(`<rect x="54" y="78" width="12" height="40" rx="5" fill="#9b6b3a"/><circle cx="60" cy="58" r="30" fill="#4caf50"/><circle cx="40" cy="68" r="20" fill="#5cb85c"/><circle cx="80" cy="68" r="20" fill="#43a047"/>`, 3.2),
  sprout: () => bob(`<rect x="56" y="84" width="8" height="34" rx="4" fill="#5aa92f"/><path d="M60 88 q-22 -2 -22 -22 q22 -2 22 22z" fill="#7cc242"/><path d="M60 80 q22 -2 22 -22 q-22 -2 -22 22z" fill="#8fd35a"/>`, 3),
  flower: () => bob(`<rect x="57" y="78" width="6" height="40" rx="3" fill="#4caf50"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="60" cy="48" rx="9" ry="16" fill="#ff7eb6" transform="rotate(${a} 60 60)"/>`).join("")}<circle cx="60" cy="60" r="11" fill="#ffd23f"/>`, 3),
  star: () => bob(`<polygon points="60,28 70,54 98,54 75,72 84,98 60,82 36,98 45,72 22,54 50,54" fill="#ffd23f" stroke="#f4b400" stroke-width="2"><animateTransform attributeName="transform" type="rotate" values="-6 60 63;6 60 63;-6 60 63" dur="3s" repeatCount="indefinite"/></polygon>`),
  heart: () => `<g><animateTransform attributeName="transform" type="scale" additive="sum" values="1 1;1.08 1.08;1 1" dur="1.4s" repeatCount="indefinite" style="transform-box:fill-box;transform-origin:center"/><path d="M60 96 C20 66 30 36 50 40 C58 42 60 50 60 50 C60 50 62 42 70 40 C90 36 100 66 60 96 Z" fill="#ff4d6d"/></g>`,
  sun: () => `<g transform="translate(60 60)"><g>${Array.from({ length: 12 }).map((_, i) => `<rect x="-2.5" y="-50" width="5" height="14" rx="2.5" fill="#ffd23f" transform="rotate(${i * 30})"/>`).join("")}<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/></g><circle r="30" fill="#ffd23f"/>${blink(-9, -2)}${blink(9, -2)}<path d="M-9 10 q9 8 18 0" stroke="#e0a01f" stroke-width="3" fill="none" stroke-linecap="round"/></g>`,
  moon: () => bob(`<path d="M78 60 a30 30 0 1 1 -26 -29 a24 24 0 1 0 26 29 z" fill="#fff0b8"/>${blink(54, 56)}<path d="M48 64 q6 5 12 0" stroke="#d9b94a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`, 3),
  rainbow: () => bob(`${["#e8413a", "#ff924c", "#ffd23f", "#4caf50", "#2f9fd6", "#a06cd5"].map((c, i) => `<path d="M${22 + i * 6} 96 a${38 - i * 6} ${38 - i * 6} 0 0 1 ${(38 - i * 6) * 2} 0" fill="none" stroke="${c}" stroke-width="6"/>`).join("")}`, 3.4),
  cloud: () => bob(`<ellipse cx="60" cy="64" rx="34" ry="20" fill="#fff"/><ellipse cx="84" cy="70" rx="20" ry="14" fill="#fff"/><ellipse cx="36" cy="70" rx="18" ry="12" fill="#fff"/>`, 3),
  rain: () => bob(`<ellipse cx="60" cy="54" rx="34" ry="20" fill="#cfd8e3"/><ellipse cx="84" cy="60" rx="18" ry="13" fill="#cfd8e3"/><ellipse cx="38" cy="60" rx="16" ry="11" fill="#cfd8e3"/>${[44, 60, 76].map((x, i) => `<line x1="${x}" y1="78" x2="${x - 4}" y2="96" stroke="#4fb8e6" stroke-width="4" stroke-linecap="round"><animate attributeName="opacity" values="0;1;0" dur="1s" begin="${i * 0.3}s" repeatCount="indefinite"/></line>`).join("")}`, 3),
  car: () => bob(`<rect x="26" y="64" width="68" height="22" rx="8" fill="#e8413a"/><path d="M40 64 q6 -16 22 -16 h12 q10 0 16 16 z" fill="#e8413a"/><rect x="50" y="54" width="24" height="12" rx="3" fill="#bfe3ff"/><circle cx="42" cy="88" r="9" fill="#333"/><circle cx="42" cy="88" r="4" fill="#aaa"/><circle cx="80" cy="88" r="9" fill="#333"/><circle cx="80" cy="88" r="4" fill="#aaa"/>`, 1.8),
  mountain: () => `<g><polygon points="20,98 50,40 80,98" fill="#9b8b7a"/><polygon points="38,62 50,40 62,62 56,66 50,58 44,66" fill="#fff"/><polygon points="62,98 86,52 110,98" fill="#7a6b5a" opacity=".85"/></g>`,
  handshake: () => bob(`<rect x="22" y="64" width="34" height="14" rx="7" fill="#f1c191"/><rect x="64" y="64" width="34" height="14" rx="7" fill="#e0a96f"/><rect x="48" y="60" width="24" height="22" rx="8" fill="#f3c79b"/>`, 2.4),
  cap: () => OBJECTS.star(),
};

// خريطة الإيموجي → دالة SVG
const ART = {
  "🦁": ANIMALS.lion, "🐭": ANIMALS.mouse, "🐠": ANIMALS.fish, "🐦": ANIMALS.bird, "🕊️": ANIMALS.bird,
  "🐙": ANIMALS.octopus, "🐢": ANIMALS.turtle, "🐰": ANIMALS.rabbit,
  "👦": CHARS.boy, "👧": CHARS.girl, "🧒": CHARS.child, "🙋": CHARS.child, "👩": CHARS.woman, "👨": CHARS.man,
  "👩‍⚕️": CHARS.doctor, "🗣️": CHARS.boy, "🤗": CHARS.woman, "🤔": CHARS.child,
  "🍎": OBJECTS.apple, "🍏": OBJECTS.greenapple, "🍪": OBJECTS.cookie, "🧀": OBJECTS.cheese, "🥕": OBJECTS.carrot,
  "🌳": OBJECTS.tree, "🌱": OBJECTS.sprout, "🌻": OBJECTS.flower, "⭐": OBJECTS.star, "🌟": OBJECTS.star, "✨": OBJECTS.star,
  "❤️": OBJECTS.heart, "💛": OBJECTS.heart, "💨": OBJECTS.car, "🚗": OBJECTS.car, "⛰️": OBJECTS.mountain,
  "☀️": OBJECTS.sun, "🌙": OBJECTS.moon, "🌈": OBJECTS.rainbow, "☁️": OBJECTS.cloud, "🌧️": OBJECTS.rain,
  "🤝": OBJECTS.handshake,
};

// ===== تعبيرات وعناصر إضافية — لإزالة كل الإيموجي من القصص =====
const expr = {
  sleep: () => bob(`<circle cx="60" cy="64" r="34" fill="#f6c98e"/><path d="M44 60 q8 6 16 0 M64 60 q8 6 16 0" stroke="#7a4a35" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M52 78 q8 5 16 0" stroke="#7a4a35" stroke-width="3" fill="none" stroke-linecap="round"/><text x="84" y="44" font-size="15" fill="#7aa7d8" font-weight="bold">z<animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></text><text x="94" y="32" font-size="10" fill="#9fc0e0" font-weight="bold">z</text>`, 3),
  joy: () => bob(`<circle cx="60" cy="62" r="34" fill="#f6c98e"/>${blink(50, 56)}${blink(70, 56)}<path d="M46 72 q14 16 28 0" stroke="#7a4a35" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="42" cy="66" r="5" fill="#ff9d9d" opacity=".5"/><circle cx="78" cy="66" r="5" fill="#ff9d9d" opacity=".5"/>`),
  love: () => bob(`<circle cx="60" cy="62" r="34" fill="#f6c98e"/><path d="M50 52 l4 4 4 -4 a3 3 0 0 0 -8 0z" fill="#ff4d6d"/><path d="M66 52 l4 4 4 -4 a3 3 0 0 0 -8 0z" fill="#ff4d6d"/><path d="M48 74 q12 12 24 0" stroke="#7a4a35" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="42" cy="68" r="5" fill="#ff7aa0" opacity=".6"/><circle cx="78" cy="68" r="5" fill="#ff7aa0" opacity=".6"/>`),
  worried: () => bob(`<circle cx="60" cy="62" r="34" fill="#f6c98e"/>${blink(50, 58)}${blink(70, 58)}<path d="M44 50 q6 -3 12 0 M64 50 q6 -3 12 0" stroke="#7a4a35" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="60" cy="78" r="4" fill="none" stroke="#7a4a35" stroke-width="3"/>`, 3),
  sick: () => bob(`<circle cx="60" cy="62" r="34" fill="#e7d49c"/>${blink(50, 58, 3)}${blink(70, 58, 3)}<path d="M48 80 q12 -6 24 0" stroke="#7a4a35" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="42" cy="68" r="6" fill="#ff8a8a" opacity=".7"/><circle cx="78" cy="68" r="6" fill="#ff8a8a" opacity=".7"/><rect x="72" y="70" width="24" height="6" rx="3" fill="#fff" stroke="#bbb"/><rect x="90" y="70" width="6" height="6" rx="2" fill="#e8413a"/><rect x="40" y="34" width="16" height="6" rx="3" fill="#7ec8f0"/>`, 3),
};
const obj2 = {
  house: () => bob(`<rect x="36" y="68" width="48" height="50" fill="#ffb86c"/><polygon points="28,68 60,40 92,68" fill="#c0392b"/><rect x="54" y="92" width="16" height="26" fill="#7d4a2a"/><rect x="42" y="76" width="12" height="12" fill="#bfe3ff"/><rect x="66" y="76" width="12" height="12" fill="#bfe3ff"/>`, 3),
  tap: () => bob(`<rect x="40" y="44" width="10" height="28" rx="4" fill="#9aa3ad"/><rect x="40" y="44" width="34" height="9" rx="4" fill="#9aa3ad"/><rect x="68" y="50" width="9" height="14" rx="4" fill="#9aa3ad"/>${[0, 1, 2].map(i => `<ellipse cx="72" cy="76" rx="3" ry="5" fill="#4fb8e6"><animate attributeName="cy" values="72;104;72" dur="1.1s" begin="${i * 0.35}s" repeatCount="indefinite"/></ellipse>`).join("")}`, 3),
  plate: () => bob(`<rect x="22" y="62" width="3" height="28" rx="1.5" fill="#9aa3ad"/><rect x="96" y="62" width="3" height="28" rx="1.5" fill="#9aa3ad"/><ellipse cx="60" cy="84" rx="34" ry="10" fill="#cfd8e3"/><ellipse cx="60" cy="80" rx="34" ry="14" fill="#fff" stroke="#dfe6ef" stroke-width="2"/><ellipse cx="60" cy="78" rx="20" ry="8" fill="#eef2f7"/>`, 3),
  teddy: () => bob(`<circle cx="40" cy="44" r="9" fill="#a06f44"/><circle cx="80" cy="44" r="9" fill="#a06f44"/><circle cx="60" cy="56" r="24" fill="#c08a55"/>${blink(52, 52, 2.6)}${blink(68, 52, 2.6)}<circle cx="60" cy="60" r="4" fill="#6b4a2a"/><ellipse cx="60" cy="98" rx="22" ry="18" fill="#c08a55"/>`),
  timer: () => bob(`<circle cx="60" cy="68" r="30" fill="#fff" stroke="#6b4fb0" stroke-width="4"/><rect x="54" y="30" width="12" height="9" rx="2" fill="#6b4fb0"/><g><animateTransform attributeName="transform" type="rotate" from="0 60 68" to="360 60 68" dur="3s" repeatCount="indefinite"/><line x1="60" y1="68" x2="60" y2="48" stroke="#e8413a" stroke-width="3" stroke-linecap="round"/></g><circle cx="60" cy="68" r="3" fill="#6b4fb0"/>`, 2.5),
  stetho: () => bob(`<path d="M40 40 v22 a20 20 0 0 0 40 0 v-2" fill="none" stroke="#3a4a6b" stroke-width="5"/><circle cx="40" cy="38" r="4" fill="#3a4a6b"/><circle cx="80" cy="84" r="11" fill="#7aa7d8" stroke="#3a4a6b" stroke-width="3"/>`, 2.6),
  nest: () => bob(`<ellipse cx="60" cy="80" rx="38" ry="20" fill="#a9713e"/><ellipse cx="60" cy="74" rx="30" ry="13" fill="#7a4f28"/><circle cx="48" cy="70" r="8" fill="#bfe3ff"/><circle cx="60" cy="68" r="8" fill="#cfeaff"/><circle cx="72" cy="70" r="8" fill="#bfe3ff"/>`, 3),
  wave: () => bob(`<path d="M16 70 q15 -16 30 0 t30 0 t30 0 L106 104 L16 104 Z" fill="#2f9fd6"><animateTransform attributeName="transform" type="translate" values="0 0;-10 0;0 0" dur="2s" repeatCount="indefinite"/></path><path d="M16 82 q15 -12 30 0 t30 0 t30 0 L106 110 L16 110 Z" fill="#1f86bf"/>`, 2.4),
  wind: () => bob(`${[0, 1, 2].map(i => `<path d="M28 ${50 + i * 14} h${32 - i * 6} a7 7 0 1 0 -7 -7" fill="none" stroke="#9fb9d6" stroke-width="4" stroke-linecap="round"><animate attributeName="opacity" values=".4;1;.4" dur="1.6s" begin="${i * 0.2}s" repeatCount="indefinite"/></path>`).join("")}`, 2.5),
  hand: () => bob(`<rect x="48" y="58" width="24" height="36" rx="11" fill="#f3c79b"/>${[0, 1, 2, 3].map(i => `<rect x="${46 + i * 8}" y="${38 - (i === 1 || i === 2 ? 6 : 0)}" width="7" height="${26 + (i === 1 || i === 2 ? 8 : 0)}" rx="3.5" fill="#f3c79b"/>`).join("")}<rect x="38" y="62" width="14" height="7" rx="3.5" fill="#f1c191" transform="rotate(-32 44 65)"/>`, 2.4),
  give: () => bob(`<circle cx="60" cy="46" r="9" fill="#ffd23f"/><path d="M28 72 q32 22 64 0 q-7 15 -32 15 q-25 0 -32 -15z" fill="#f3c79b"/><circle cx="42" cy="70" r="4" fill="#f1c191"/><circle cx="78" cy="70" r="4" fill="#f1c191"/>`, 2.6),
  party: () => bob(`<polygon points="28,98 50,48 72,92" fill="#ffd23f"/><polygon points="34,86 50,48 46,88" fill="#ff924c"/>${[[60, 40, "#e8413a"], [78, 52, "#4caf50"], [86, 36, "#2f9fd6"], [70, 62, "#a06cd5"], [52, 34, "#ff924c"]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="4" fill="${c}"><animate attributeName="cy" values="${y};${y - 9};${y}" dur="1s" begin="${x % 5 * 0.1}s" repeatCount="indefinite"/></circle>`).join("")}`, 2),
  colorball: (c) => bob(`<circle cx="60" cy="64" r="30" fill="${c}"/><ellipse cx="50" cy="54" rx="9" ry="6" fill="#fff" opacity=".35"/>`),
};
Object.assign(ART, {
  "😴": expr.sleep, "😄": expr.joy, "😊": expr.joy, "😍": expr.love, "🥰": expr.love,
  "😟": expr.worried, "😳": expr.worried, "🤒": expr.sick,
  "🏡": obj2.house, "🚰": obj2.tap, "🍽️": obj2.plate, "🧸": obj2.teddy, "⏱️": obj2.timer,
  "🩺": obj2.stetho, "🪹": obj2.nest, "🌊": obj2.wave, "🌬️": obj2.wind, "🖐️": obj2.hand,
  "🤲": obj2.give, "🎉": obj2.party,
  "🔴": () => obj2.colorball("#e8413a"), "🟢": () => obj2.colorball("#4caf50"), "🟣": () => obj2.colorball("#a06cd5"),
});

/** هل لدينا رسم SVG لهذا الإيموجي؟ */
export function hasArt(emoji) { return Boolean(ART[emoji]); }
/** يُرجع رسم SVG كرتوني متحرّك للعنصر، أو null إن لم يوجد */
export function sceneArtSvg(emoji) {
  const fn = ART[emoji];
  if (!fn) return null;
  return `<svg class="story-char" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">${fn()}</svg>`;
}
