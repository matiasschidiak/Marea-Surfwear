'use strict';
const crypto = require('crypto');
const { getDb } = require('../db');
const config = require('../config');
const ordersRepo = require('../repositories/orders');
const { STATUS_BY_VALUE } = require('../constants');

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin 0/O/1/I para evitar confusiones

/** Error de negocio: se devuelve al cliente con el HTTP status indicado. */
class OrderError extends Error {
  constructor(message, { status = 409, problems = [] } = {}) {
    super(message);
    this.name = 'OrderError';
    this.status = status;
    this.problems = problems;
  }
}

function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `MAR-${s}`;
}

/**
 * Crea un pedido de forma atómica:
 *  1. relee precios y stock desde la base (nunca confía en lo que manda el navegador),
 *  2. descuenta el stock por talle (UPDATE condicional: imposible quedar en negativo),
 *  3. guarda cliente, pedido y detalle.
 * Si cualquier línea no tiene stock, no se descuenta nada y se informa qué línea falló.
 */
function createOrder(checkout, lines) {
  const db = getDb();
  const { maxQtyPerLine } = config.limits;

  const run = db.transaction(() => {
    const getVariant = db.prepare(`
      SELECT v.id AS variant_id, v.stock, p.id AS product_id, p.name, p.price, p.active, s.name AS size
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      JOIN sizes s ON s.id = v.size_id
      WHERE v.id = ?`);

    const items = [];
    const problems = [];
    for (const { variantId, qty } of lines) {
      const v = getVariant.get(variantId);
      if (!v || !v.active) {
        problems.push({ variantId, code: 'unavailable', available: 0, message: 'Este producto ya no está disponible.' });
        continue;
      }
      const label = `${v.name} (talle ${v.size})`;
      if (v.stock <= 0) {
        problems.push({ variantId, code: 'out_of_stock', available: 0, message: `${label} está agotado.` });
      } else if (qty > v.stock) {
        problems.push({ variantId, code: 'insufficient_stock', available: v.stock,
          message: `De ${label} solo quedan ${v.stock} unidad${v.stock === 1 ? '' : 'es'}.` });
      } else if (qty > maxQtyPerLine) {
        problems.push({ variantId, code: 'max_qty', available: Math.min(v.stock, maxQtyPerLine),
          message: `Máximo ${maxQtyPerLine} unidades por producto y talle.` });
      } else {
        items.push({ ...v, qty });
      }
    }
    if (problems.length) throw new OrderError('Hay productos sin stock suficiente.', { problems });

    // Descuento atómico: si otro pedido se llevó el stock en el medio, el UPDATE no afecta filas.
    const decrement = db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const it of items) {
      if (decrement.run(it.qty, it.variant_id, it.qty).changes !== 1) {
        throw new OrderError('El stock cambió mientras confirmabas el pedido.', {
          problems: [{ variantId: it.variant_id, code: 'insufficient_stock', message: `${it.name} (talle ${it.size}) se quedó sin stock.` }],
        });
      }
    }

    const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);

    const customerId = db.prepare(`
      INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name,
                                       updated_at = datetime('now')
      RETURNING id`).get(checkout.firstName, checkout.lastName, checkout.phone).id;

    let orderId = null;
    let code = null;
    for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
      code = newCode();
      try {
        orderId = Number(db.prepare(`
          INSERT INTO orders (code, customer_id, customer_first_name, customer_last_name, customer_phone,
            delivery_method, payment_method, ship_street, ship_number, ship_city, ship_province, ship_postal_code,
            ship_notes, subtotal, shipping_cost, total)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`).run(
          code, customerId, checkout.firstName, checkout.lastName, checkout.phone,
          checkout.deliveryMethod, checkout.paymentMethod, checkout.street, checkout.streetNumber,
          checkout.city, checkout.province, checkout.postalCode, checkout.notes, subtotal, subtotal
        ).lastInsertRowid);
      } catch (err) {
        if (!String(err.code).startsWith('SQLITE_CONSTRAINT')) throw err; // código repetido: reintenta
      }
    }
    if (!orderId) throw new Error('No se pudo generar un código de pedido único.');

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, variant_id, product_id, product_name, size_name, unit_price, quantity, subtotal)
      VALUES (?,?,?,?,?,?,?,?)`);
    for (const it of items) {
      insertItem.run(orderId, it.variant_id, it.product_id, it.name, it.size, it.price, it.qty, it.price * it.qty);
    }
    db.prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(orderId, 'pendiente');

    return orderId;
  });

  return ordersRepo.findById(run.immediate());
}

/**
 * Cambia el estado de un pedido. Cancelar devuelve el stock; reactivar un pedido
 * cancelado vuelve a descontarlo (falla si ya no hay unidades).
 */
function changeStatus(orderId, newStatus, adminId = null) {
  if (!STATUS_BY_VALUE[newStatus]) throw new OrderError('Estado inválido.', { status: 400 });
  const db = getDb();

  db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) throw new OrderError('Pedido no encontrado.', { status: 404 });
    if (order.status === newStatus) return;

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    let stockReleased = order.stock_released;

    if (newStatus === 'cancelado' && !order.stock_released) {
      const restore = db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?');
      for (const it of items) if (it.variant_id) restore.run(it.quantity, it.variant_id);
      stockReleased = 1;
    } else if (order.status === 'cancelado' && newStatus !== 'cancelado' && order.stock_released) {
      const take = db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?');
      for (const it of items) {
        if (!it.variant_id || take.run(it.quantity, it.variant_id, it.quantity).changes !== 1) {
          throw new OrderError(
            `No se puede reactivar: no hay stock suficiente de ${it.product_name} (talle ${it.size_name}).`
          );
        }
      }
      stockReleased = 0;
    }

    db.prepare("UPDATE orders SET status = ?, stock_released = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newStatus, stockReleased, orderId);
    db.prepare('INSERT INTO order_status_history (order_id, status, admin_id) VALUES (?, ?, ?)')
      .run(orderId, newStatus, adminId);
  }).immediate();
}

function updateAdminNotes(orderId, notes) {
  getDb().prepare("UPDATE orders SET admin_notes = ?, updated_at = datetime('now') WHERE id = ?").run(notes, orderId);
}

module.exports = { createOrder, changeStatus, updateAdminNotes, OrderError };
