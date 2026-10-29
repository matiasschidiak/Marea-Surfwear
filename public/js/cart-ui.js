// Panel del carrito (hoja inferior en celulares, panel lateral en escritorio).
import { cart, money } from './cart.js';
import { esc, toast, bumpCart } from './ui.js';

const drawer = document.getElementById('cart-drawer');
const body = drawer.querySelector('[data-cart-body]');
const foot = drawer.querySelector('[data-cart-foot]');
const totalEl = drawer.querySelector('[data-cart-total]');
const panel = drawer.querySelector('.drawer__panel');
const checkoutLink = drawer.querySelector('[data-cart-checkout]');
const clearWrap = drawer.querySelector('[data-cart-clear-wrap]');

let lastTrigger = null;
let notes = [];
let confirmingId = null;
let confirmingClear = false;

function lineHtml(line) {
  const i = line.info;
  const img = i.image
    ? `<img src="${esc(i.image)}" alt="${esc(i.imageAlt || i.name)}" width="76" height="95" loading="lazy">`
    : '';
  const max = Math.max(1, Math.min(10, i.maxQty ?? 10));
  if (confirmingId === line.variantId) {
    return `<li class="cart-line" data-line="${line.variantId}">
      <a class="cart-line__img" href="/producto/${esc(i.slug)}">${img}</a>
      <div><a class="cart-line__name" href="/producto/${esc(i.slug)}">${esc(i.name)}</a><p class="cart-line__meta">Talle ${esc(i.size)}</p></div>
      <div class="cart-line__confirm"><span>¿Quitar del carrito?</span>
        <div><button type="button" class="btn btn--sm btn--ghost" data-line-cancel>No</button>
        <button type="button" class="btn btn--sm btn--primary" data-line-confirm="${line.variantId}">Sí, quitar</button></div></div>
    </li>`;
  }
  const warn = line.soldOut
    ? '<p class="cart-line__warn">Agotado: quitalo para continuar</p>'
    : (line.qty >= max ? `<p class="cart-line__warn">Máximo disponible: ${max}</p>` : '');
  return `<li class="cart-line" data-line="${line.variantId}">
    <a class="cart-line__img" href="/producto/${esc(i.slug)}">${img}</a>
    <div>
      <div class="cart-line__top">
        <div><a class="cart-line__name" href="/producto/${esc(i.slug)}">${esc(i.name)}</a>
        <p class="cart-line__meta">Talle ${esc(i.size)} · ${money(i.price)} c/u</p></div>
        <button type="button" class="icon-btn cart-line__remove" aria-label="Quitar ${esc(i.name)} talle ${esc(i.size)}" data-line-remove="${line.variantId}"><svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>
      </div>
      ${warn}
      <div class="cart-line__bottom">
        ${line.soldOut ? '<span></span>' : `<div class="qty qty--sm">
          <button type="button" aria-label="Menos" data-line-minus="${line.variantId}" ${line.qty <= 1 ? 'disabled' : ''}><svg class="icon" aria-hidden="true"><use href="#i-minus"/></svg></button>
          <input type="text" value="${line.qty}" readonly aria-label="Cantidad">
          <button type="button" aria-label="Más" data-line-plus="${line.variantId}" ${line.qty >= max ? 'disabled' : ''}><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></button>
        </div>`}
        <strong class="cart-line__sub">${line.soldOut ? '—' : money(line.qty * i.price)}</strong>
      </div>
    </div>
  </li>`;
}

function render() {
  const lines = cart.lines();
  if (!lines.length) {
    body.innerHTML = `<div class="cart-empty">
      <svg class="icon" aria-hidden="true"><use href="#i-bag"/></svg>
      <h3>Tu carrito está vacío</h3><p>Sumá alguna malla y armá tu pedido.</p>
      <a class="btn btn--primary" href="/#catalogo" data-cart-close>Ver mallas</a></div>`;
    foot.hidden = true;
    return;
  }
  const noteHtml = notes.length
    ? `<div class="cart-notes" role="status">${notes.map((n) => `<div>${esc(n)}</div>`).join('')}</div>` : '';
  body.innerHTML = `${noteHtml}<ul>${lines.map(lineHtml).join('')}</ul>`;
  totalEl.textContent = money(cart.total());
  foot.hidden = false;
  const blocked = cart.hasSoldOut();
  checkoutLink.toggleAttribute('aria-disabled', blocked);
  checkoutLink.classList.toggle('is-blocked', blocked);

  if (confirmingClear) {
    clearWrap.innerHTML = `<span class="cart-clear-confirm">¿Vaciar todo?
      <button type="button" class="link-btn" data-clear-no>No</button>
      <button type="button" class="link-btn link-btn--danger" data-clear-yes>Sí, vaciar</button></span>`;
  } else {
    clearWrap.innerHTML = '<button type="button" class="link-btn link-btn--danger" data-cart-clear>Vaciar carrito</button>';
  }
}

async function open(trigger) {
  lastTrigger = trigger || document.activeElement;
  drawer.hidden = false;
  document.body.classList.add('is-locked');
  confirmingId = null; confirmingClear = false; notes = [];
  render();
  requestAnimationFrame(() => { drawer.classList.add('is-open'); panel.focus({ preventScroll: true }); });
  const result = await cart.sync(); // trae precios y stock reales
  if (result && result.notes.length) { notes = result.notes; render(); }
}

function close() {
  if (drawer.hidden) return;
  drawer.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  setTimeout(() => { drawer.hidden = true; }, 350);
  lastTrigger?.focus?.({ preventScroll: true });
}

export function initCartUI() {
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-cart-open]');
    if (openBtn) { e.preventDefault(); open(openBtn); return; }
    if (e.target.closest('[data-cart-close]')) { close(); return; }
  });
  document.addEventListener('cart:open', () => open());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Enfoque atrapado dentro del panel mientras está abierto
  drawer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('a[href], button:not([disabled])')].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  drawer.addEventListener('click', (e) => {
    const t = e.target;
    const plus = t.closest('[data-line-plus]');
    const minus = t.closest('[data-line-minus]');
    if (plus || minus) {
      const id = Number((plus || minus).dataset.linePlus || (plus || minus).dataset.lineMinus);
      const line = cart.lines().find((l) => l.variantId === id);
      if (!line) return;
      const r = cart.setQty(id, line.qty + (plus ? 1 : -1));
      if (r && r.capped) toast(`Máximo disponible: ${r.max} unidad${r.max === 1 ? '' : 'es'}.`, { type: 'warn' });
      return;
    }
    const rm = t.closest('[data-line-remove]');
    if (rm) { confirmingId = Number(rm.dataset.lineRemove); render(); return; }
    if (t.closest('[data-line-cancel]')) { confirmingId = null; render(); return; }
    const yes = t.closest('[data-line-confirm]');
    if (yes) { confirmingId = null; cart.remove(Number(yes.dataset.lineConfirm)); toast('Producto quitado del carrito'); return; }
    if (t.closest('[data-cart-clear]')) { confirmingClear = true; render(); return; }
    if (t.closest('[data-clear-no]')) { confirmingClear = false; render(); return; }
    if (t.closest('[data-clear-yes]')) { confirmingClear = false; cart.clear(); toast('Carrito vaciado'); return; }
    if (t.closest('[data-cart-checkout]') && checkoutLink.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      toast('Quitá del carrito los productos agotados para continuar.', { type: 'warn' });
    }
  });

  cart.subscribe((ev) => {
    if (ev.type === 'add') bumpCart();
    if (!drawer.hidden) render();
  });
}
