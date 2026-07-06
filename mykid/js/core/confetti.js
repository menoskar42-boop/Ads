// ===== مؤثرات بصرية: قصاصات ونجوم متطايرة =====
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");
let particles = [];
let running = false;

const COLORS = ["#ffd23f", "#ff6fb5", "#34d399", "#38bdf8", "#ff924c", "#fff"];

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

function loop() {
  if (!running) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.18; // جاذبية
    p.rot += p.vr;
    p.life -= 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    if (p.emoji) {
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = "center";
      ctx.fillText(p.emoji, 0, 0);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    }
    ctx.restore();
  });
  particles = particles.filter((p) => p.life > 0 && p.y < canvas.height + 40);
  if (particles.length === 0) {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  requestAnimationFrame(loop);
}

function spawn(count, emoji) {
  const cx = canvas.width / 2;
  for (let i = 0; i < count; i++) {
    const maxLife = 70 + Math.random() * 50;
    particles.push({
      x: cx + (Math.random() - 0.5) * canvas.width * 0.6,
      y: -20 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 2 + 1,
      vr: (Math.random() - 0.5) * 0.3,
      rot: Math.random() * Math.PI,
      size: emoji ? 26 + Math.random() * 18 : 8 + Math.random() * 8,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      emoji: emoji || null,
      life: maxLife,
      maxLife,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

export const Confetti = {
  burst() {
    spawn(80);
  },
  stars() {
    spawn(28, "⭐");
  },
  emoji(e, count = 24) {
    spawn(count, e);
  },
};
