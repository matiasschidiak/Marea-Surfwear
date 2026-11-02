'use strict';
const db = require('../db');

const TZ = 'America/Argentina/Buenos_Aires';

async function attachItems(order) {
  if (!order) return null;
  order.items = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [order.id]);
  return order;
}

async function findById(id) {
  return attachItems(await db.get('SELECT * FROM orders WHERE id = ?', [id]));
}

async function findByCode(code) {
  return attachItems(await db.get('SELECT * FROM orders WHERE code = ?', [code]));
}

function history(orderId) {
  return db.all(`
    SELECT h.status, h.created_at, a.name AS admin_name, a.email AS admin_email
    FROM order_status_history h LEFT JOIN admins a ON a.id = h.admin_id
    WHERE h.order_id = ? ORDER BY h.id`, [orderId]);
}

/** Lista paginada con filtros por estado y búsqueda (código, nombre, teléfono). */
async function list({ status, q, limit = 25, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    where.push(`(o.code ILIKE ? ESCAPE '\\' OR o.customer_first_name ILIKE ? ESCAPE '\\'
                 OR o.customer_last_name ILIKE ? ESCAPE '\\' OR o.customer_phone ILIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.get(`SELECT COUNT(*)::int AS c FROM orders o ${w}`, params)).c;
  const rows = await db.all(`
    SELECT o.*, (SELECT COALESCE(SUM(quantity), 0)::int FROM order_items i WHERE i.order_id = o.id) AS units
    FROM orders o ${w} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { rows, total };
}

async function countsByStatus() {
  const rows = await db.all('SELECT status, COUNT(*)::int AS c FROM orders GROUP BY status');
  return Object.fromEntries(rows.map((r) => [r.status, r.c]));
}

async function stats() {
  const row = await db.get(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pendiente')::int AS pending,
      COUNT(*) FILTER (WHERE created_at >= (date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'))::int AS today,
      COALESCE(SUM(total) FILTER (WHERE status <> 'cancelado' AND created_at >= now() - interval '30 days'), 0)::int AS revenue30d
    FROM orders`);
  return { pending: row.pending, today: row.today, revenue30d: row.revenue30d };
}

module.exports = { findById, findByCode, history, list, countsByStatus, stats };
