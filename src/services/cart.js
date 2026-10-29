'use strict';
const { getDb } = require('../db');
const config = require('../config');
const settings = require('../repositories/settings');

/**
 * Recibe las líneas del carrito del navegador ({variantId, qty}) y devuelve el estado real:
 * nombre, talle, precio vigente, stock disponible y cantidad ajustada al stock.
 * El carrito del navegador es solo una "lista de deseos"; la verdad siempre está acá.
 */
function describeLines(lines) {
  const db = getDb();
  const maxQty = config.limits.maxQtyPerLine;
  const threshold = settings.getInt('low_stock_threshold', 3);
  const get = db.prepare(`
    SELECT v.id AS variantId, v.stock, p.id AS productId, p.slug, p.name, p.price, p.active, s.name AS size,
           (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image,
           (SELECT alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS imageAlt
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN sizes s ON s.id = v.size_id
    WHERE v.id = ?`);

  const items = [];
  const removed = [];
  for (const { variantId, qty } of lines) {
    const r = get.get(variantId);
    if (!r || !r.active) { removed.push(variantId); continue; }
    const limit = Math.max(0, Math.min(r.stock, maxQty));
    const adjustedQty = Math.min(qty, limit);
    items.push({
      variantId: r.variantId,
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      size: r.size,
      price: r.price,
      image: r.image,
      imageAlt: r.imageAlt || r.name,
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
