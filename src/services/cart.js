'use strict';
const db = require('../db');
const config = require('../config');
const settings = require('../repositories/settings');

/**
 * Recibe las líneas del carrito del navegador ({variantId, qty}) y devuelve el estado real:
 * nombre, talle, precio vigente, stock disponible y cantidad ajustada al stock.
 * El carrito del navegador es solo una "lista de deseos"; la verdad siempre está acá.
 */
async function describeLines(lines) {
  const maxQty = config.limits.maxQtyPerLine;
  const threshold = await settings.getInt('low_stock_threshold', 3);
  const ids = lines.map((l) => l.variantId);
  const rows = ids.length ? await db.all(`
    SELECT v.id AS variant_id, v.stock, p.id AS product_id, p.slug, p.name, p.price, p.active, s.name AS size,
           (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image,
           (SELECT alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_alt
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN sizes s ON s.id = v.size_id
    WHERE v.id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const byId = new Map(rows.map((r) => [r.variant_id, r]));

  const items = [];
  const removed = [];
  for (const { variantId, qty } of lines) {
    const r = byId.get(variantId);
    if (!r || !r.active) { removed.push(variantId); continue; }
    const limit = Math.max(0, Math.min(r.stock, maxQty));
    const adjustedQty = Math.min(qty, limit);
    items.push({
      variantId: r.variant_id,
      productId: r.product_id,
      slug: r.slug,
      name: r.name,
      size: r.size,
      price: r.price,
      image: r.image,
      imageAlt: r.image_alt || r.name,
      stock: r.stock,
      maxQty: limit,
      qty: adjustedQty,
      requestedQty: qty,
      available: r.stock > 0,
      lowStock: r.stock > 0 && r.stock <= threshold,
      subtotal: r.price * adjustedQty,
    });
  }
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  return { items, removed, total, count: items.reduce((sum, i) => sum + i.qty, 0) };
}

module.exports = { describeLines };
