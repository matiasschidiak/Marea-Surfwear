// Utilidades de interfaz compartidas: toasts, menú móvil, animaciones, filtros, agregado rápido.
import { cart } from './cart.js';

const ICONS = {
  ok: '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>',
  error: '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>',
  warn: '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>',
};

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Mensaje flotante. type: 'ok' | 'error' | 'warn'. action: { label, href } o { label, onClick } */
export function toast(message, { type = 'ok', action = null, duration = 3600 } = {}) {
  const host = document.querySelector('[data-toasts]');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${ICONS[type] || ICONS.ok}<span>${esc(message)}</span>`;
  if (action) {
    const a = document.createElement(action.href ? 'a' : 'button');
    a.textContent = action.label;
    if (action.href) a.href = action.href;
    else { a.type = 'button'; a.className = 'link-btn'; a.style.color = 'var(--sun)'; a.style.marginLeft = 'auto'; }
    a.addEventListener('click', () => { action.onClick?.(); el.remove(); });
    el.append(a);
  }
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 320);
  }, duration);
}

/** Pequeña animación del ícono y contador del carrito. */
export function bumpCart() {
  document.querySelectorAll('.cart-btn, [data-cart-count]').forEach((el) => {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  });
}

export function updateCartBadges() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  });
  document.querySelectorAll('[data-cart-open].cart-btn').forEach((el) => {
    el.setAttribute('aria-label', n ? `Ver carrito (${n} producto${n === 1 ? '' : 's'})` : 'Ver carrito');
  });
}

function initNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.getElementById('site-nav');
  const backdrop = document.querySelector('.nav-backdrop');
  if (!toggle || !nav) return;
  const set = (open) => {
    document.body.classList.toggle('nav-open', open);
    document.body.classList.toggle('is-locked', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (backdrop) backdrop.hidden = !open;
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  backdrop?.addEventListener('click', () => set(false));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

/** Aparición suave al hacer scroll. Lo que ya está en pantalla no se oculta (evita parpadeos). */
function initReveal() {
  const items = [...document.querySelectorAll('[data-reveal]')];
  if (!items.length || !('IntersectionObserver' in window)) return;
  const vh = window.innerHeight;
  const pending = [];
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.95 && r.bottom > 0) el.classList.add('is-visible');
    else pending.push(el);
  }
  document.documentElement.classList.add('reveal-on');
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  pending.forEach((el) => io.observe(el));
}

/**
 * Filtros del catálogo. En celulares son un panel a pantalla completa (botón "Filtrar"); en computadora,
 * una columna a la izquierda. En ambos casos TODO se aplica solo (casillas, precio, orden y búsqueda):
 * se pide la lista nueva al servidor y se reemplaza sin recargar la página.
 */
function initFilters() {
  const form = document.querySelector('[data-filters]');
  if (!form) return;
  const panel = form.querySelector('[data-filters-panel]');
  const openBtn = document.querySelector('[data-filters-open]');
  const area = document.querySelector('[data-results-area]');
  const wide = window.matchMedia('(min-width: 900px)');
  let lastFocus = null;
  let controller = null;
  let timer = null;

  const setOpen = (open) => {
    panel.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open && !wide.matches);
    openBtn?.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFocus = document.activeElement;
      setTimeout(() => panel.querySelector('input, button')?.focus({ preventScroll: true }), 50);
    } else {
      lastFocus?.focus?.({ preventScroll: true });
    }
  };

  openBtn?.addEventListener('click', () => setOpen(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false); });
  wide.addEventListener('change', () => { panel.classList.remove('is-open'); document.body.classList.remove('is-locked'); });

  // Cerrar panel: flecha, o el botón "Ver N productos" (los resultados ya están aplicados)
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-filters-close], .filters-panel__apply')) { e.preventDefault(); setOpen(false); }
  });

  /** Arma la dirección con lo elegido (sin campos vacíos ni el orden por defecto). */
  function buildUrl() {
    const params = new URLSearchParams();
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox' && !el.checked) continue;
      if (el.value === '' || (el.name === 'orden' && el.value === 'destacados')) continue;
      params.append(el.name, el.value);
    }
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  }

  async function apply() {
    const url = buildUrl();
    controller?.abort();
    controller = new AbortController();
    area.classList.add('is-loading');
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('http');
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const fresh = doc.querySelector('[data-results-area]');
      if (!fresh) throw new Error('markup');
      area.innerHTML = fresh.innerHTML;
      area.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'));
      // Contador del botón "Filtrar", pie del panel (cantidad y "Limpiar") y enlace de limpiar
      const btn = doc.querySelector('[data-filters-open]');
      if (btn && openBtn) openBtn.innerHTML = btn.innerHTML;
      const foot = doc.querySelector('.filters-panel__foot');
      if (foot) panel.querySelector('.filters-panel__foot').innerHTML = foot.innerHTML;
      history.replaceState(null, '', `${url}#catalogo`);
    } catch (err) {
      if (err.name === 'AbortError') return;
      location.href = `${url}#catalogo`; // sin JS moderno o con error: carga normal
    } finally {
      area.classList.remove('is-loading');
    }
  }
  const applySoon = (ms) => { clearTimeout(timer); timer = setTimeout(apply, ms); };

  form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); apply(); });
  form.addEventListener('change', (e) => { if (e.target.matches('input[type="checkbox"], input[type="number"]')) applySoon(0); });
  form.addEventListener('input', (e) => {
    if (e.target.matches('input[type="search"]')) applySoon(450);
    else if (e.target.matches('input[type="number"]')) applySoon(700);
  });
  document.querySelector('[data-sort]')?.addEventListener('change', () => applySoon(0));
}

/** Formulario de contacto: arma el mensaje y abre WhatsApp. */
function initContact() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const message = form.message.value.trim();
    let ok = true;
    for (const [field, val, msg] of [['name', name, 'Ingresá tu nombre.'], ['message', message, 'Escribí tu consulta.']]) {
      const err = form.querySelector(`[data-error-for="${field}"]`);
      const bad = val.length < 2;
      err.hidden = !bad; err.textContent = bad ? msg : '';
      form[field].closest('.field').classList.toggle('has-error', bad);
      if (bad) ok = false;
    }
    if (!ok) return;
    const text = `Hola! Soy ${name}.\n${message}`;
    window.open(`https://wa.me/${document.body.dataset.waNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
}

export function initUI() {
  initNav();
  initReveal();
  initFilters();
  initContact();
  updateCartBadges();
  cart.subscribe(updateCartBadges);
}
