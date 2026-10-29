'use strict';
const { getDb } = require('../db');

function attachItems(order) {
  if (!order) return null;
  order.items = getDb().prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  return order;
}

function findById(id) {
  return attachItems(getDb().prepare('SELECT * FROM orders WHERE id = ?').get(id));
}

function findByCode(code) {
  return attachItems(getDb().prepare('SELECT * FROM orders WHERE code = ?').get(code));
}

function history(orderId) {
  return getDb().prepare(`
    SELECT h.status, h.created_at, a.name AS admin_name, a.email AS admin_email
    FROM order_status_history h LEFT JOIN admins a ON a.id = h.admin_id
    WHERE h.order_id = ? ORDER BY h.id`).all(orderId);
}

/** Lista paginada con filtros por estado y búsqueda (código, nombre, teléfono). */
function list({ status, q, limit = 25, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    where.push(`(o.code LIKE ? ESCAPE '\\' OR o.customer_first_name LIKE ? ESCAPE '\\'
                 OR o.customer_last_name LIKE ? ESCAPE '\\' OR o.customer_phone LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) c FROM orders o ${w}`).get(...params).c;
  const rows = db.prepare(`
    SELECT o.*, (SELECT COALESCE(SUM(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS units
    FROM orders o ${w} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { rows, total };
}

function countsByStatus() {
  const rows = getDb().prepare('SELECT status, COUNT(*) c FROM orders GROUP BY status').all();
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}

function stats() {
  const db = getDb();
  return {
    pending: db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'pendiente'").get().c,
    today: db.prepare("SELECT COUNT(*) c FROM orders WHERE date(created_at) = date('now')").get().c,
    revenue30d: db.prepare(`SELECT COALESCE(SUM(total), 0) s FROM orders
                            WHERE status NOT IN ('cancelado') AND created_at >= datetime('now', '-30 days')`).get().s,
  };
}

module.exports = { findById, findByCode, history, list, countsByStatus, stats };
