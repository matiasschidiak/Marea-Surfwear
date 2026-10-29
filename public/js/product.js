// Ficha de producto: galería con gestos, selector de talle y cantidad, agregar al carrito.
import { cart } from './cart.js';
import { toast, bumpCart } from './ui.js';

function initGallery(root) {
  const track = root.querySelector('[data-gallery-track]');
  if (!track) return;
  const slides = [...track.querySelectorAll('[data-slide]')];
  const thumbs = [...root.querySelectorAll('[data-thumb]')];
  const prev = root.querySelector('[data-gallery-prev]');
  const next = root.querySelector('[data-gallery-next]');
  const counter = root.querySelector('[data-gallery-index]');
  let current = 0;

  const goTo = (i) => {
    const idx = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: idx * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const setActive = (i) => {
    current = i;
    thumbs.forEach((t, n) => {
      t.classList.toggle('is-active', n === i);
      t.setAttribute('aria-selected', String(n === i));
    });
    if (counter) counter.textContent = String(i + 1);
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === slides.length - 1;
    thumbs[i]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };

  let raf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== current) setActive(i);
    });
  }, { passive: true });

  thumbs.forEach((t, i) => t.addEventListener('click', () => goTo(i)));
  prev?.addEventListener('click', () => goTo(current - 1));
  next?.addEventListener('click', () => goTo(current + 1));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
  });
  window.addEventListener('resize', () => goTo(current));
  setActive(0);
}

function initBuyBox(root) {
  const form = root.querySelector('[data-add-form]');
  if (!form) return;
  const radios = [...form.querySelectorAll('input[name="variant"]')];
  const note = form.querySelector('[data-stock-note]');
  const chosen = form.querySelector('[data-size-chosen]');
  const sizeError = form.querySelector('[data-size-error]');
  const fieldset = form.querySelector('.sizepick');
  const qtyInput = form.querySelector('[data-qty-input]');
  const minus = form.querySelector('[data-qty-minus]');
  const plus = form.querySelector('[data-qty-plus]');
  const addBtn = form.querySelector('[data-add-btn]');
  const addLabel = form.querySelector('[data-add-label]');
  const maxQty = Number(document.body.dataset.maxQty) || 10;
  let qty = 1;

  const selected = () => radios.find((r) => r.checked);
  const limitFor = (radio) => (radio ? Math.min(Number(radio.dataset.stock), maxQty) : 1);

  function refresh() {
    const r = selected();
    const limit = limitFor(r);
    qty = Math.max(1, Math.min(qty, limit));
    qtyInput.value = String(qty);
    qtyInput.max = String(limit);
    minus.disabled = qty <= 1;
    plus.disabled = !r || qty >= limit;
    if (!r) {
      chosen.textContent = '';
      note.textContent = 'Elegí un talle para ver el stock.';
      note.className = 'sizepick__stock';
      return;
    }
    const stock = Number(r.dataset.stock);
    chosen.textContent = `· ${r.dataset.size}`;
    sizeError.hidden = true;
    fieldset.classList.remove('has-error');
    if (stock <= 3) { note.textContent = `¡Últimas unidades! Quedan ${stock}.`; note.className = 'sizepick__stock is-low'; }
    else { note.textContent = `Stock disponible: ${stock} unidades.`; note.className = 'sizepick__stock is-ok'; }
  }

  radios.forEach((r) => r.addEventListener('change', () => { qty = 1; refresh(); }));
  minus.addEventListener('click', () => { qty -= 1; refresh(); });
  plus.addEventListener('click', () => {
    const limit = limitFor(selected());
    if (qty >= limit) { toast(`Máximo disponible: ${limit} unidad${limit === 1 ? '' : 'es'}.`, { type: 'warn' }); return; }
    qty += 1; refresh();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = selected();
    if (!r) {
      sizeError.hidden = false;
      fieldset.classList.add('has-error');
      radios.find((x) => !x.disabled)?.focus();
      toast('Elegí un talle para continuar.', { type: 'warn' });
      return;
    }
    const d = root.dataset;
    const stock = Number(r.dataset.stock);
    const res = cart.add(Number(r.value), qty, {
      name: d.name, size: r.dataset.size, price: Number(d.price), image: d.image, imageAlt: d.imageAlt, slug: d.productSlug,
      stock, maxQty: Math.min(stock, maxQty),
    });
    bumpCart();
    addBtn.classList.add('is-added');
    addLabel.textContent = '¡Agregado!';
    setTimeout(() => { addLabel.textContent = 'Agregar al carrito'; addBtn.classList.remove('is-added'); }, 1400);
    if (res.capped) {
      toast(`Tenés ${res.qty} en el carrito: es el máximo disponible de este talle.`, { type: 'warn' });
    } else {
      toast(`${d.name} (talle ${r.dataset.size}) agregada al carrito`, {
        action: { label: 'Ver carrito', onClick: () => document.dispatchEvent(new CustomEvent('cart:open')) },
      });
    }
  });

  // Si la página vuelve del historial (bfcache), el stock mostrado puede estar viejo: se refresca.
  window.addEventListener('pageshow', async (ev) => {
    if (!ev.persisted) return;
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(root.dataset.productSlug)}/stock`);
      if (!res.ok) return;
      const data = await res.json();
      for (const v of data.variants) {
        const radio = radios.find((x) => Number(x.value) === v.id);
        if (!radio) continue;
        radio.dataset.stock = String(v.stock);
        radio.disabled = v.stock === 0;
        if (v.stock === 0 && radio.checked) radio.checked = false;
        radio.closest('.sizepick__opt').classList.toggle('is-out', v.stock === 0);
      }
      refresh();
    } catch { /* sin conexión: se deja lo que hay */ }
  });

  refresh();
}

export function initProduct() {
  const root = document.querySelector('[data-product]');
  if (!root) return;
  initGallery(root.querySelector('[data-gallery]'));
  initBuyBox(root);
}
