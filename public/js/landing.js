// Custom cursor
const cursor = document.getElementById('cursor');
const ring = document.getElementById('cursorRing');
let mx=0,my=0,rx=0,ry=0;

document.addEventListener('mousemove', e => {
  mx = e.clientX; my = e.clientY;
  cursor.style.left = mx-6+'px';
  cursor.style.top = my-6+'px';
});

function animRing() {
  rx += (mx - rx) * 0.12;
  ry += (my - ry) *.12;
  ring.style.left = rx-20+'px';
  ring.style.top = ry-20+'px';
  requestAnimationFrame(animRing);
}
animRing();

document.querySelectorAll('button, a').forEach(el => {
  el.addEventListener('mouseenter', () => {
    cursor.style.transform = 'scale(2)';
    ring.style.transform = 'scale(1.5)';
    ring.style.borderColor = 'rgba(0,245,212,0.8)';
  });
  el.addEventListener('mouseleave', () => {
    cursor.style.transform = 'scale(1)';
    ring.style.transform = 'scale(1)';
    ring.style.borderColor = 'rgba(0,245,212,0.4)';
  });
});

// Reveal on scroll
const revealEls = document.querySelectorAll('.reveal');
const steps = document.querySelectorAll('.step');

const obs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      obs.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

revealEls.forEach(el => obs.observe(el));

const stepObs = new IntersectionObserver(entries => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('visible'), i * 120);
      stepObs.unobserve(e.target);
    }
  });
}, { threshold: 0.2 });

steps.forEach(el => stepObs.observe(el));

// Counter animation
function animateCounter(el, target) {
  let current = 0;
  const duration = 2000;
  const start = performance.now();
  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    current = Math.round(ease * target);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

const statsObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      document.querySelectorAll('.stat-num span').forEach(span => {
        const val = parseInt(span.textContent);
        animateCounter(span, val);
      });
      statsObs.disconnect();
    }
  });
}, { threshold: 0.5 });

const statsBar = document.querySelector('.stats-bar');
if (statsBar) statsObs.observe(statsBar);
