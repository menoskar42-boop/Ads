// ===== لعبة "المتاهة": وجّه ميزو إلى الكنز =====
// تنمّي التخطيط والاتجاهات وحلّ المشكلات. ميزو المستكشف يمشي في المتاهة،
// والطفل يوجّهه بالأسهم حتى يصل للنجمة — مغامرة ممتعة تشدّ الطفل.
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { Confetti } from "../core/confetti.js";
import { gameTopbar, finishActivity, diffCount } from "./common.js";

// مولّد متاهة (Recursive Backtracker). الجدران: [أعلى، يمين، أسفل، يسار]
function genMaze(N) {
  const g = Array.from({ length: N }, (_, r) =>
    Array.from({ length: N }, (_, c) => ({ r, c, walls: [true, true, true, true], vis: false }))
  );
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
  const stack = [g[0][0]];
  g[0][0].vis = true;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const nbrs = [];
    for (let d = 0; d < 4; d++) {
      const nr = cur.r + DR[d], nc = cur.c + DC[d];
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && !g[nr][nc].vis) nbrs.push([d, g[nr][nc]]);
    }
    if (nbrs.length) {
      const [d, next] = nbrs[(Math.random() * nbrs.length) | 0];
      cur.walls[d] = false;
      next.walls[(d + 2) % 4] = false;
      next.vis = true;
      stack.push(next);
    } else stack.pop();
  }
  return g;
}

export function renderMaze({ regionId, regionIndex, title, bg }) {
  const N = diffCount(4, 5); // الصغار ٤×٤، الكبار ٥×٥
  let g, pos, won;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#d7c3ff,#9a7cf0)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🧭 متاهة ميزو", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(15px,4.2vw,20px);margin:10px";
  hint.textContent = "وصّل ميزو للنجمة ⭐ بالأسهم!";
  screen.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "maze-grid";
  grid.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
  screen.appendChild(grid);

  const cells = [];
  function buildGrid() {
    grid.innerHTML = "";
    cells.length = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement("div");
        cell.className = "maze-cell";
        const w = g[r][c].walls;
        if (w[0]) cell.classList.add("wt");
        if (w[1]) cell.classList.add("wr");
        if (w[2]) cell.classList.add("wb");
        if (w[3]) cell.classList.add("wl");
        if (r === N - 1 && c === N - 1) cell.innerHTML = `<span class="maze-goal">⭐</span>`;
        grid.appendChild(cell);
        cells.push(cell);
      }
    }
  }
  const at = (r, c) => cells[r * N + c];
  const mizoImg = document.createElement("img");
  mizoImg.className = "maze-mizo";
  mizoImg.src = "/assets/mizo/mizo-explore.png";
  mizoImg.alt = "ميزو";

  function placeMizo() {
    at(pos.r, pos.c).appendChild(mizoImg);
  }

  function move(d) {
    if (won) return;
    if (g[pos.r][pos.c].walls[d]) { Sfx.wrong(); return; } // جدار
    const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
    pos = { r: pos.r + DR[d], c: pos.c + DC[d] };
    Sfx.pop();
    placeMizo();
    if (pos.r === N - 1 && pos.c === N - 1) winRound();
  }

  function winRound() {
    won = true;
    Sfx.win();
    Confetti.burst();
    Speech.mizo("هووورا! وصلنا للكنز يا بطل 🎉");
    setTimeout(() => finishActivity({ regionId, regionIndex, stars: 6, onDone: back }), 1400);
  }

  function newMaze() {
    g = genMaze(N);
    pos = { r: 0, c: 0 };
    won = false;
    buildGrid();
    placeMizo();
  }

  // أزرار الاتجاهات (تخطيط +)
  const pad = document.createElement("div");
  pad.className = "maze-pad";
  const mk = (label, d, cls) => {
    const b = document.createElement("button");
    b.className = "maze-arrow " + cls;
    b.textContent = label;
    b.addEventListener("click", () => move(d));
    return b;
  };
  pad.appendChild(mk("⬆️", 0, "up"));
  pad.appendChild(mk("⬅️", 3, "left"));
  pad.appendChild(mk("➡️", 1, "right"));
  pad.appendChild(mk("⬇️", 2, "down"));
  screen.appendChild(pad);

  newMaze();
  Speech.mizo("يلا نطلع من المتاهة سوا!");
  return screen;
}
