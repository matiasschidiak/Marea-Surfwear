// Carrito del navegador. Guarda solo qué variante (producto + talle) y cuántas unidades;
// el precio y el stock reales siempre se confirman con el servidor (sync) y en el checkout.
const KEY = 'marea.cart.v1';
const DEFAULT_MAX = Number(document.body.dataset.maxQty) || 10;
const listeners = new Set();

const moneyFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const money = (n) => '$' + moneyFmt.format(Number(n) || 0);

function sanitize(data) {
  const lines = [];
  for (const l of Array.isArray(data && data.lines) ? data.lines : []) {
    const variantId = Number(l && l.variantId);
    const qty = Number(l && l.qty);
    if (!Number.isInteger(variantId) || variantId < 1 || !Number.isInteger(qty) || qty < 1) continue;
    const info = l.info && typeof l.info === 'object' ? l.info : {};
    lines.push({ variantId, qty: Math.min(qty, DEFAULT_MAX), info, soldOut: !!l.soldOut });
  }
  return { lines };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch { /* storage bloqueado o dato corrupto: se empieza vacío */ }
  return { lines: [] };
}

let state = read();

function persist(event) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin storage: queda en memoria */ }
  listeners.forEach((fn) => fn(event || { type: 'change' }));
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) { state = read(); listeners.forEach((fn) => fn({ type: 'external' })); }
});

const maxFor = (line) => Math.max(1, Math.min(DEFAULT_MAX, line.info.maxQty ?? DEFAULT_MAX));

export const cart = {
  lines: () => state.lines,
  count: () => state.lines.reduce((s, l) => s + l.qty, 0),
  total: () => state.lines.reduce((s, l) => s + l.qty * (l.info.price || 0), 0),
  hasSoldOut: () => state.lines.some((l) => l.soldOut),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Suma unidades a una variante respetando el stock conocido. */
  add(variantId, qty, info) {
    const existing = state.lines.find((l) => l.variantId === variantId);
    const max = Math.max(1, Math.min(DEFAULT_MAX, info.maxQty ?? info.stock ?? DEFAULT_MAX));
    if (existing) {
      existing.info = { ...existing.info, ...info, maxQty: max };
      const wanted = existing.qty + qty;
      existing.qty = Math.min(wanted, max);
      existing.soldOut = false;
      persist({ type: 'add', variantId });
      return { qty: existing.qty, capped: wanted > max, max };
    }
    const finalQty = Math.min(qty, max);
    state.lines.push({ variantId, qty: finalQty, info: { ...info, maxQty: max }, soldOut: false });
    persist({ type: 'add', variantId });
    return { qty: finalQty, capped: qty > max, max };
  },

  setQty(variantId, qty) {
    const line = state.lines.find((l) => l.variantId === variantId);
    if (!line) return;
    const max = maxFor(line);
    line.qty = Math.max(1, Math.min(qty, max));
    persist({ type: 'qty', variantId, capped: qty > max });
    return { qty: line.qty, capped: qty > max, max };
  },

  remove(variantId) {
    state.lines = state.lines.filter((l) => l.variantId !== variantId);
    persist({ type: 'remove', variantId });
  },

  clear() {
    state.lines = [];
    persist({ type: 'clear' });
  },

  /**
   * Pide al servidor el estado real del carrito (precios, stock, productos desactivados).
   * Devuelve { notes: [...mensajes], data } o null si no hubo conexión.
   */
  async sync() {
    if (!state.lines.length) return { notes: [], data: { items: [], total: 0, count: 0 } };
    let data;
    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: state.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })) }),
      });
      if (!res.ok) return null;
      data = await res.json();
    } catch {
      return null;
    }
    const notes = [];
    const byId = new Map(data.items.map((i) => [i.variantId, i]));
    const next = [];
    for (const line of state.lines) {
      const s = byId.get(line.variantId);
      if (!s) {
        notes.push(`${line.info.name || 'Un producto'} ya no está disponible y se quitó del carrito.`);
        continue;
      }
      const info = {
        name: s.name, size: s.size, price: s.price, image: s.image, imageAlt: s.imageAlt, slug: s.slug,
        maxQty: Math.max(0, s.maxQty), stock: s.stock,
      };
      if (s.maxQty === 0) {
        next.push({ ...line, info, soldOut: true });
        notes.push(`${s.name} (talle ${s.size}) se agotó.`);
        continue;
      }
      let qty = line.qty;
      if (qty > s.maxQty) {
        qty = s.maxQty;
        notes.push(`Ajustamos ${s.name} (talle ${s.size}) a ${qty} unidad${qty === 1 ? '' : 'es'}: es el stock disponible.`);
      }
      next.push({ variantId: line.variantId, qty, info, soldOut: false });
    }
    state.lines = next;
    persist({ type: 'sync' });
    return { notes, data };
  },
};
