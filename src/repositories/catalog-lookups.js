'use strict';
// Categorías y talles: tablas de apoyo del catálogo.
const db = require('../db');
const { slugify } = require('../utils/format');

const DEFAULT_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'ÚNICO', 'UNICO'];

const categories = {
  list({ onlyActive = false } = {}) {
    const where = onlyActive ? 'WHERE active = 1' : '';
    return db.all(`SELECT * FROM categories ${where} ORDER BY sort_order, name`);
  },
  findById(id) {
    return db.get('SELECT * FROM categories WHERE id = ?', [id]);
  },
  findBySlug(slug) {
    return db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
  },
  async findOrCreate(name) {
    const clean = String(name).trim().slice(0, 60);
    const slug = slugify(clean);
    if (!slug) return null;
    const found = await db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
    if (found) return found;
    const { m } = await db.get('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories');
    // ON CONFLICT: si dos personas la crean a la vez, gana la primera y la otra la lee
    const row = await db.get(
      'INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?) ON CONFLICT (slug) DO NOTHING RETURNING *',
      [clean, slug, m + 1]
    );
    return row || categories.findBySlug(slug);
  },
};

const sizes = {
  list() {
    return db.all('SELECT * FROM sizes ORDER BY sort_order, name');
  },
  findByName(name) {
    return db.get('SELECT * FROM sizes WHERE lower(name) = lower(?)', [String(name).trim()]);
  },
  async findOrCreate(name) {
    const clean = String(name).trim().toUpperCase().slice(0, 12);
    if (!clean) return null;
    const found = await sizes.findByName(clean);
    if (found) return found;
    const known = DEFAULT_SIZE_ORDER.indexOf(clean);
    let order;
    if (known >= 0) order = known * 10;
    else order = (await db.get('SELECT COALESCE(MAX(sort_order), 0) AS m FROM sizes')).m + 10;
    const row = await db.get(
      'INSERT INTO sizes (name, sort_order) VALUES (?, ?) ON CONFLICT (lower(name)) DO NOTHING RETURNING *',
      [clean, order]
    );
    return row || sizes.findByName(clean);
  },
};

module.exports = { categories, sizes };
