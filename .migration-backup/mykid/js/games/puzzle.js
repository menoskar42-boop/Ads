// ===== لعبة التركيب (بازل): رتّب أجزاء الصورة =====
// تُقسَّم صورة (إيموجي كبير) إلى ٤ قطع مبعثرة، يبدّل الطفل القطع حتى تكتمل.
import { getDataset } from "../data/datasets.js";
import { Router } from "../core/router.js";
import { Speech } from "../core/speech.js";
import { Sfx } from "../core/audio.js";
import { gameTopbar, shuffle, finishActivity } from "./common.js";

const ROUNDS = 4; // عدد الصور

export function renderPuzzle({ regionId, regionIndex, datasetKey, title, bg }) {
  const ds = getDataset(datasetKey);
  const pics = shuffle(ds.items).slice(0, ROUNDS);
  let round = 0;

  const screen = document.createElement("div");
  screen.className = "region-screen";
  screen.style.background = bg || "linear-gradient(180deg,#ffe0b3,#ffb877)";
  const back = () => Router.go("region", { id: regionId, index: regionIndex });
  screen.appendChild(gameTopbar(title || "🧩 ركّب الصورة", back));

  const hint = document.createElement("p");
  hint.style.cssText = "text-align:center;font-weight:800;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.18);font-size:clamp(15px,4.2vw,20px);margin:12px";
  hint.textContent = "اضغط قطعتين لتبديلهما حتى تكتمل الصورة 🧩";
  screen.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "puz-grid";
  screen.appendChild(grid);

  let cells = [];   // ترتيب القطع الحالي في كل خانة
  let first = null; // الخانة المختارة أولاً
  let lock = false;

  function buildCell(item, quadrant) {
    // quadrant: 0=أعلى يسار 1=أعلى يمين 2=أسفل يسار 3=أسفل يمين
    const col = quadrant % 2, rowq = (quadrant / 2) | 0;
    const cell = document.createElement("button");
    cell.className = "puz-cell";
    if (item.img) {
      // قصّ الصورة الحقيقية لأربعة أرباع
      cell.innerHTML = `<span class="puz-img" style="background-image:url(/assets/${item.img});background-position:${col * 100}% ${rowq * 100}%"></span>`;
    } else {
      cell.innerHTML = `<span class="puz-emoji" style="transform:translate(${-col * 50}%,${-rowq * 50}%)">${item.emoji || "⭐"}</span>`;
    }
    return cell;
  }

  function render() {
    grid.innerHTML = "";
    first = null; lock = false;
    // ترتيب مبعثر مختلف عن الحلّ
    do { cells = shuffle([0, 1, 2, 3]); } while (cells.every((q, i) => q === i));

    cells.forEach((quad, slot) => {
      const cell = buildCell(pics[round], quad);
      cell.addEventListener("click", () => onTap(slot, cell));
      grid.appendChild(cell);
    });
    Speech.mizo(`كوّن صورة ${pics[round].name}`);
  }

  function onTap(slot, cell) {
    if (lock) return;
    if (first === null) {
      first = { slot, cell };
      cell.classList.add("sel");
      Sfx.tap();
      return;
    }
    if (first.slot === slot) { // إلغاء الاختيار
      cell.classList.remove("sel");
      first = null;
      return;
    }
    // تبديل القطعتين
    Sfx.pop();
    [cells[first.slot], cells[slot]] = [cells[slot], cells[first.slot]];
    first.cell.classList.remove("sel");
    first = null;
    redraw();
    checkSolved();
  }

  function redraw() {
    [...grid.children].forEach((cell, slot) => {
      const quad = cells[slot];
      const col = quad % 2, rowq = (quad / 2) | 0;
      const im = cell.querySelector(".puz-img");
      if (im) im.style.backgroundPosition = `${col * 100}% ${rowq * 100}%`;
      else cell.querySelector(".puz-emoji").style.transform = `translate(${-col * 50}%,${-rowq * 50}%)`;
    });
  }

  function checkSolved() {
    if (!cells.every((q, i) => q === i)) return;
    lock = true;
    Sfx.correct();
    Speech.ar(pics[round].name);
    [...grid.children].forEach((c) => c.classList.add("done"));
    setTimeout(() => {
      round++;
      if (round >= pics.length) finishActivity({ regionId, regionIndex, stars: 6, onDone: back });
      else render();
    }, 1100);
  }

  setTimeout(render, 0);
  return screen;
}
