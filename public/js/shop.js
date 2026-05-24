(function () {
  // Scroll reveal
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

  // Hero card slideshows (auto-rotate when more than one image)
  document.querySelectorAll('[data-slides]').forEach(box => {
    const slides = box.querySelectorAll('.hero-slide');
    if (slides.length < 2) return;
    let i = 0;
    setInterval(() => {
      slides[i].classList.remove('active');
      i = (i + 1) % slides.length;
      slides[i].classList.add('active');
    }, 4000);
  });

  // Toast
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  function showToast(msg, isErr) {
    if (!toast) return;
    toastMsg.textContent = msg;
    toast.classList.toggle('err', !!isErr);
    toast.classList.add('show');
    clearTimeout(window.__tt);
    window.__tt = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  const cartBadge = document.getElementById('cartBadge');
  function setCart(count) {
    if (!cartBadge) return;
    cartBadge.textContent = count;
    cartBadge.style.display = count > 0 ? 'flex' : 'none';
    cartBadge.style.animation = 'none';
    void cartBadge.offsetWidth;
    cartBadge.style.animation = 'bump 0.4s ease';
  }

  // AJAX add-to-cart — keeps the real server-side cart in sync
  const slug = window.SHOP_SLUG;
  document.querySelectorAll('.pc-add[data-product]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const productId = btn.dataset.product;
      const name = btn.dataset.name || '';
      btn.disabled = true;
      try {
        const r = await fetch(`/shop/${slug}/cart/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
          },
          body: `product_id=${encodeURIComponent(productId)}&quantity=1`,
        });
        const data = await r.json();
        if (data.ok) {
          setCart(data.cartCount);
          showToast(name ? `أضيف ${name} للسلة 🛍` : 'تمت الإضافة للسلة 🛍');
        } else {
          showToast(data.error || 'تعذّرت الإضافة للسلة', true);
        }
      } catch (err) {
        showToast('تعذّر الاتصال بالخادم', true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Favorites toggle (visual only)
  document.querySelectorAll('.pc-fav').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.toggle('active');
      if (btn.classList.contains('active')) showToast('أضيف للمفضلة ❤');
    });
  });

  // Decorative flash-sale countdown
  const hEl = document.getElementById('cd-h');
  const mEl = document.getElementById('cd-m');
  const sEl = document.getElementById('cd-s');
  if (hEl && mEl && sEl) {
    let total = 12 * 3600 + 34 * 60 + 56;
    setInterval(() => {
      if (total <= 0) total = 86400;
      total--;
      hEl.textContent = String(Math.floor(total / 3600)).padStart(2, '0');
      mEl.textContent = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      sEl.textContent = String(total % 60).padStart(2, '0');
    }, 1000);
  }
})();
