'use strict';
// Categorías y talles: tablas de apoyo del catálogo.
const { getDb } = require('../db');
const { slugify } = require('../utils/format');

const DEFAULT_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'ÚNICO', 'UNICO'];

const categories = {
  list({ onlyActive = false } = {}) {
    const where = onlyActive ? 'WHERE active = 1' : '';
    return getDb().prepare(`SELECT * FROM categories ${where} ORDER BY sort_order, name`).all();
  },
  findById(id) {
    return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
  },
  findBySlug(slug) {
    return getDb().prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  },
  findOrCreate(name) {
    const db = getDb();
    const clean = String(name).trim().slice(0, 60);
    const slug = slugify(clean);
    if (!slug) return null;
    const found = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
    if (found) return found;
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM categories').get().m;
    const info = db.prepare('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)').run(clean, slug, max + 1);
    return categories.findById(info.lastInsertRowid);
  },
};

const sizes = {
  list() {
    return getDb().prepare('SELECT * FROM sizes ORDER BY sort_order, name').all();
  },
  findByName(name) {
    return getDb().prepare('SELECT * FROM sizes WHERE name = ? COLLATE NOCASE').get(String(name).trim());
  },
  findOrCreate(name) {
    const clean = String(name).trim().toUpperCase().slice(0, 12);
    if (!clean) return null;
    const found = sizes.findByName(clean);
    if (found) return found;
    const db = getDb();
    const known = DEFAULT_SIZE_ORDER.indexOf(clean);
    const order = known >= 0 ? known * 10 : db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM sizes').get().m + 10;
    const info = db.prepare('INSERT INTO sizes (name, sort_order) VALUES (?, ?)').run(clean, order);
    return db.prepare('SELECT * FROM sizes WHERE id = ?').get(info.lastInsertRowid);
  },
  /** Talles que tienen stock en algún producto activo (para el filtro público). */
  inStockNames() {
    return getDb().prepare(`
      SELECT DISTINCT s.name FROM sizes s
      JOIN product_variants v ON v.size_id = s.id
      JOIN products p ON p.id = v.product_id
      WHERE p.active = 1
      ORDER BY s.sort_order, s.name`).all().map((r) => r.name);
  },
};

module.exports = { categories, sizes };
