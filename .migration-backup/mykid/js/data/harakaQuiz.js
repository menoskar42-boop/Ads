// ===== «اسمع واعرف الحركة» (المالك ٢٠٢٦-١٠-١٩) — صافى من غير صفحة، عشان يتقاس فى node =====
//
// «يعرفوا من النطق يجيبوا نوع التشكيل المطلوب… وتفضل مع الطفل لحد ما تتأكد من قدرته».
// كل حركة (فتحة · ضمة · كسرة · سكون) مرتين: مرة الحرف بالحركة لوحده (بَ) ومرة كلمة من
// كتاب الحرف بتبدأ بيه بالحركة دى (بَطة) — ولو مفيش كلمة، الحرف بالحركة تانى.
// اللى بيغلط فيه بيرجع فى الآخر (الشاشة بتعيده) لحد ما يتجاوب صح.
import { LB_LETTERS, LB_HARAKAT, LB_HARAKA_ORDER, syl, bare } from "./letterbook.js";

/** الحرف بالحركة — أ بالكسرة = إِ (زى الكتاب). */
export const hSyl = (ch, h) => syl(ch === "أ" && h === "i" ? "إ" : ch, h);

/** الاختيارات الأربعة: كل حركة بحرفها وإشارة الإيد واسمها. */
export const hqOptions = (ch) => LB_HARAKA_ORDER.map((h) => ({ h, s: hSyl(ch, h), hand: LB_HARAKAT[h].hand, ar: LB_HARAKAT[h].ar }));

function shuffle(rnd, a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** الجولات: { h, say (اللى بيتنطق), s (الحرف بالحركة), w?, bare?, e? } — مفيش حركتين زى بعض ورا بعض. */
export function harakaQuizRounds(ch, rnd = Math.random) {
  const L = LB_LETTERS[ch];
  const words = L ? Object.fromEntries(L.harakat.map((x) => [x.h, x])) : {};
  const rounds = [];
  for (const h of LB_HARAKA_ORDER) {
    const s = hSyl(ch, h);
    rounds.push({ h, say: s, s });
    const x = words[h];
    rounds.push(x ? { h, say: x.w, s, w: x.w, bare: bare(x.w), e: x.e } : { h, say: s, s });
  }
  let out = shuffle(rnd, rounds);
  for (let k = 0; k < 20 && out.some((r, i) => i && r.h === out[i - 1].h); k++) out = shuffle(rnd, rounds);
  return out;
}
