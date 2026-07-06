// ===== نشيد ميزو: هتاف قصير محبوب (صوت مخزَّن + لحن بسيط بـ Web Audio) =====
// بلا أصول صوتية مملوكة: الكلمات تُنطق من الكاش، واللحن نُولّده بنغمات بسيطة.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar } from "../games/common.js";
import { createCharacter } from "../games/character.js";
import { MIZO_SONG } from "../data/mizo.js";

function playMelody() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = [523, 587, 659, 523, 659, 698, 784, 659];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.3;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.32);
    });
  } catch (e) {}
}

export function renderMizoSong() {
  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = "linear-gradient(180deg,#ffd86f,#fc6076)";
  screen.appendChild(gameTopbar("🎶 نشيد ميزو", () => Router.go("home")));

  const wrap = document.createElement("div");
  wrap.className = "lesson";
  screen.appendChild(wrap);

  const stage = document.createElement("div");
  stage.style.cssText = "display:grid;place-items:center;margin:6px";
  const mizo = createCharacter();
  stage.appendChild(mizo.el);
  wrap.appendChild(stage);

  const lyric = document.createElement("p");
  lyric.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2);font-size:clamp(20px,6vw,30px);min-height:2.4em;margin:10px";
  wrap.appendChild(lyric);

  function play() {
    Sfx.tap();
    mizo.setMood("cheer", MIZO_SONG.length * 1700);
    playMelody();
    let i = 0;
    const step = () => {
      if (i >= MIZO_SONG.length) { lyric.textContent = "🎵 🎵 🎵"; return; }
      const line = MIZO_SONG[i++];
      lyric.textContent = line;
      mizo.startTalking(line.length * 95 + 600);
      Speech.mizo(line, { onend: () => setTimeout(step, 250) });
    };
    step();
  }

  const ctrl = document.createElement("div");
  ctrl.className = "lesson-controls";
  const playBtn = document.createElement("button");
  playBtn.className = "candy-btn";
  playBtn.style.background = "linear-gradient(180deg,#34d399,#10b981)";
  playBtn.textContent = "🎶 غنِّ يا ميزو";
  playBtn.addEventListener("click", play);
  ctrl.appendChild(playBtn);
  wrap.appendChild(ctrl);

  setTimeout(play, 300);
  return screen;
}
