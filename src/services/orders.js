'use strict';
const crypto = require('crypto');
const db = require('../db');
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
 * Crea un pedido de forma atómica (una transacción):
 *  1. relee precios y stock desde la base (nunca confía en lo que manda el navegador),
 *  2. descuenta el stock por talle (UPDATE condicional: imposible quedar en negativo,
 *     aunque dos pedidos lleguen al mismo tiempo desde instancias distintas),
 *  3. guarda cliente, pedido y detalle.
 * Si cualquier línea no tiene stock, no se descuenta nada y se informa qué línea falló.
 */
async function createOrder(checkout, lines) {
  const { maxQtyPerLine } = config.limits;

  const orderId = await db.tx(async (t) => {
    const items = [];
    const problems = [];
    for (const { variantId, qty } of lines) {
      const v = await t.get(`
        SELECT v.id AS variant_id, v.stock, p.id AS product_id, p.name, p.price, p.active, s.name AS size
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        JOIN sizes s ON s.id = v.size_id
        WHERE v.id = ?`, [variantId]);
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
    for (const it of items) {
      const r = await t.run('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?',
        [it.qty, it.variant_id, it.qty]);
      if (r.changes !== 1) {
        throw new OrderError('El stock cambió mientras confirmabas el pedido.', {
          problems: [{ variantId: it.variant_id, code: 'insufficient_stock', message: `${it.name} (talle ${it.size}) se quedó sin stock.` }],
        });
      }
    }

    const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);

    const customer = await t.get(`
      INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?)
      ON CONFLICT (phone) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
                                        updated_at = now()
      RETURNING id`, [checkout.firstName, checkout.lastName, checkout.phone]);

    // ON CONFLICT DO NOTHING: si el código ya existe no se devuelve fila y se prueba con otro
    // (en Postgres un error dentro de la transacción la anularía entera).
    let order = null;
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      order = await t.get(`
        INSERT INTO orders (code, customer_id, customer_first_name, customer_last_name, customer_phone,
          delivery_method, payment_method, ship_street, ship_number, ship_city, ship_province, ship_postal_code,
          ship_notes, subtotal, shipping_cost, total)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)
        ON CONFLICT (code) DO NOTHING RETURNING id`, [
        newCode(), customer.id, checkout.firstName, checkout.lastName, checkout.phone,
        checkout.deliveryMethod, checkout.paymentMethod, checkout.street, checkout.streetNumber,
        checkout.city, checkout.province, checkout.postalCode, checkout.notes, subtotal, subtotal,
      ]);
    }
    if (!order) throw new Error('No se pudo generar un código de pedido único.');

    for (const it of items) {
      await t.run(`
        INSERT INTO order_items (order_id, variant_id, product_id, product_name, size_name, unit_price, quantity, subtotal)
        VALUES (?,?,?,?,?,?,?,?)`,
      [order.id, it.variant_id, it.product_id, it.name, it.size, it.price, it.qty, it.price * it.qty]);
    }
    await t.run('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)', [order.id, 'pendiente']);

    return order.id;
  });

  return ordersRepo.findById(orderId);
}

/**
 * Cambia el estado de un pedido. Cancelar devuelve el stock; reactivar un pedido
 * cancelado vuelve a descontarlo (falla si ya no hay unidades).
 */
async function changeStatus(orderId, newStatus, adminId = null) {
  if (!STATUS_BY_VALUE[newStatus]) throw new OrderError('Estado inválido.', { status: 400 });

  await db.tx(async (t) => {
    // FOR UPDATE: si dos personas tocan el mismo pedido a la vez, una espera a la otra
    const order = await t.get('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw new OrderError('Pedido no encontrado.', { status: 404 });
    if (order.status === newStatus) return;

    const items = await t.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    let stockReleased = order.stock_released;

    if (newStatus === 'cancelado' && !order.stock_released) {
      for (const it of items) {
        if (it.variant_id) await t.run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [it.quantity, it.variant_id]);
      }
      stockReleased = 1;
    } else if (order.status === 'cancelado' && newStatus !== 'cancelado' && order.stock_released) {
      for (const it of items) {
        const ok = it.variant_id
          && (await t.run('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?',
            [it.quantity, it.variant_id, it.quantity])).changes === 1;
        if (!ok) {
          throw new OrderError(
            `No se puede reactivar: no hay stock suficiente de ${it.product_name} (talle ${it.size_name}).`
          );
        }
      }
      stockReleased = 0;
    }

    await t.run('UPDATE orders SET status = ?, stock_released = ?, updated_at = now() WHERE id = ?',
      [newStatus, stockReleased, orderId]);
    await t.run('INSERT INTO order_status_history (order_id, status, admin_id) VALUES (?, ?, ?)',
      [orderId, newStatus, adminId]);
  });
}

async function updateAdminNotes(orderId, notes) {
  await db.run('UPDATE orders SET admin_notes = ?, updated_at = now() WHERE id = ?', [notes, orderId]);
}

module.exports = { createOrder, changeStatus, updateAdminNotes, OrderError };
