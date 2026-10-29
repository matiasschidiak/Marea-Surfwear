'use strict';
const { getDb } = require('../db');
const settings = require('./settings');
const { slugify } = require('../utils/format');

const SORTS = {
  destacados: 'p.featured DESC, p.created_at DESC, p.id DESC',
  nuevos: 'p.created_at DESC, p.id DESC',
  'precio-asc': 'p.price ASC, p.id ASC',
  'precio-desc': 'p.price DESC, p.id DESC',
  nombre: 'p.name COLLATE NOCASE ASC',
};

const placeholders = (arr) => arr.map(() => '?').join(',');

function parseFeatures(json) {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

/** Agrega imágenes, variantes (talle + stock) y flags de stock a un lote de filas de `products`. */
function hydrate(rows) {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const images = db.prepare(
    `SELECT id, product_id, url, alt, sort_order FROM product_images
     WHERE product_id IN (${placeholders(ids)}) ORDER BY sort_order, id`
  ).all(...ids);
  const variants = db.prepare(
    `SELECT v.id, v.product_id, v.size_id, s.name AS size, v.stock, v.sku
     FROM product_variants v JOIN sizes s ON s.id = v.size_id
     WHERE v.product_id IN (${placeholders(ids)}) ORDER BY s.sort_order, s.name`
  ).all(...ids);
  const threshold = settings.getInt('low_stock_threshold', 3);

  const imgBy = new Map();
  const varBy = new Map();
  for (const i of images) (imgBy.get(i.product_id) || imgBy.set(i.product_id, []).get(i.product_id)).push(i);
  for (const v of variants) (varBy.get(v.product_id) || varBy.set(v.product_id, []).get(v.product_id)).push(v);

  return rows.map((r) => {
    const vs = varBy.get(r.id) || [];
    const totalStock = vs.reduce((sum, v) => sum + v.stock, 0);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      shortDescription: r.short_description,
      description: r.description,
      material: r.material,
      color: r.color || '',
      features: parseFeatures(r.features),
      price: r.price,
      comparePrice: r.compare_at_price,
      active: !!r.active,
      featured: !!r.featured,
      categoryId: r.category_id,
      categoryName: r.category_name || null,
      categorySlug: r.category_slug || null,
      createdAt: r.created_at,
      images: imgBy.get(r.id) || [],
      variants: vs,
      totalStock,
      soldOut: totalStock === 0,
      lowStock: totalStock > 0 && totalStock <= threshold,
    };
  });
}

const BASE_SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

/** Catálogo público (solo productos activos), con búsqueda, filtros y orden. */
function listPublic({ q, sizes, colors, min, max, sort, category, inStock, featuredOnly, limit } = {}) {
  const where = ['p.active = 1'];
  const params = [];
  if (q) {
    where.push(`(p.name LIKE ? ESCAPE '\\' OR p.short_description LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR p.material LIKE ? ESCAPE '\\' OR p.color LIKE ? ESCAPE '\\')`);
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like, like, like);
  }
  // Varios talles o colores significan "alguno de ellos". Un talle solo cuenta si tiene stock.
  if (sizes && sizes.length) {
    where.push(`EXISTS (SELECT 1 FROM product_variants v JOIN sizes s ON s.id = v.size_id
                        WHERE v.product_id = p.id AND v.stock > 0 AND s.name COLLATE NOCASE IN (${placeholders(sizes)}))`);
    params.push(...sizes);
  }
  if (colors && colors.length) {
    where.push(`p.color COLLATE NOCASE IN (${placeholders(colors)})`);
    params.push(...colors);
  }
  if (inStock) where.push('EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock > 0)');
  if (Number.isInteger(min)) { where.push('p.price >= ?'); params.push(min); }
  if (Number.isInteger(max)) { where.push('p.price <= ?'); params.push(max); }
  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (featuredOnly) where.push('p.featured = 1');
  const order = SORTS[sort] || SORTS.destacados;
  const limitSql = Number.isInteger(limit) ? `LIMIT ${limit}` : '';
  const rows = getDb().prepare(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} ${limitSql}`).all(...params);
  return hydrate(rows);
}

/** Opciones del filtro con su cantidad de productos: colores y talles (con stock) de productos activos. */
function facets() {
  const db = getDb();
  const colors = db.prepare(`SELECT MIN(color) AS name, COUNT(*) AS count FROM products
    WHERE active = 1 AND color != '' GROUP BY color COLLATE NOCASE ORDER BY count DESC, name`).all();
  const sizes = db.prepare(`SELECT s.name AS name, COUNT(DISTINCT p.id) AS count FROM sizes s
    JOIN product_variants v ON v.size_id = s.id AND v.stock > 0
    JOIN products p ON p.id = v.product_id AND p.active = 1
    GROUP BY s.id ORDER BY s.sort_order, s.name`).all();
  return { colors, sizes };
}

/** Colores ya usados, para sugerirlos en el panel. */
function allColors() {
  return getDb().prepare("SELECT MIN(color) AS color FROM products WHERE color != '' GROUP BY color COLLATE NOCASE ORDER BY color COLLATE NOCASE")
    .all().map((r) => r.color);
}

function findBySlug(slug, { includeInactive = false } = {}) {
  const row = getDb().prepare(`${BASE_SELECT} WHERE p.slug = ? ${includeInactive ? '' : 'AND p.active = 1'}`).get(slug);
  return row ? hydrate([row])[0] : null;
}

function findById(id) {
  const row = getDb().prepare(`${BASE_SELECT} WHERE p.id = ?`).get(id);
  return row ? hydrate([row])[0] : null;
}

function listAdmin() {
  return hydrate(getDb().prepare(`${BASE_SELECT} ORDER BY p.created_at DESC, p.id DESC`).all());
}

function related(product, limit = 4) {
  const db = getDb();
  let rows = db.prepare(
    `${BASE_SELECT} WHERE p.active = 1 AND p.id != ? AND p.category_id IS ?
     ORDER BY p.featured DESC, p.created_at DESC LIMIT ?`
  ).all(product.id, product.categoryId, limit);
  if (rows.length < limit) {
    const have = [product.id, ...rows.map((r) => r.id)];
    const more = db.prepare(
      `${BASE_SELECT} WHERE p.active = 1 AND p.id NOT IN (${placeholders(have)})
       ORDER BY p.featured DESC, p.created_at DESC LIMIT ?`
    ).all(...have, limit - rows.length);
    rows = rows.concat(more);
  }
  return hydrate(rows);
}

function uniqueSlug(name, ignoreId = null) {
  const db = getDb();
  const base = slugify(name) || 'producto';
  let slug = base;
  let n = 2;
  while (db.prepare('SELECT id FROM products WHERE slug = ? AND id IS NOT ?').get(slug, ignoreId)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

/** Crea o actualiza un producto (campos de la tabla `products`, sin imágenes ni variantes). */
function save(data, id = null) {
  const db = getDb();
  const features = JSON.stringify(data.features || []);
  if (id) {
    const slug = data.slug ? uniqueSlug(data.slug, id) : uniqueSlug(data.name, id);
    db.prepare(`UPDATE products SET category_id=?, slug=?, name=?, short_description=?, description=?, material=?, color=?,
                features=?, price=?, compare_at_price=?, active=?, featured=?, updated_at=datetime('now') WHERE id=?`)
      .run(data.categoryId, slug, data.name, data.shortDescription, data.description, data.material, data.color || '',
        features, data.price, data.comparePrice, data.active ? 1 : 0, data.featured ? 1 : 0, id);
    return id;
  }
  const slug = uniqueSlug(data.slug || data.name);
  const info = db.prepare(`INSERT INTO products (category_id, slug, name, short_description, description, material, color,
                features, price, compare_at_price, active, featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(data.categoryId, slug, data.name, data.shortDescription, data.description, data.material, data.color || '',
      features, data.price, data.comparePrice, data.active ? 1 : 0, data.featured ? 1 : 0);
  return Number(info.lastInsertRowid);
}

function remove(id) {
  const images = getDb().prepare('SELECT url FROM product_images WHERE product_id = ?').all(id);
  getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
  return images.map((i) => i.url);
}

function setFlag(id, field, value) {
  if (!['active', 'featured'].includes(field)) throw new Error('Campo inválido');
  getDb().prepare(`UPDATE products SET ${field} = ?, updated_at = datetime('now') WHERE id = ?`).run(value ? 1 : 0, id);
}

/**
 * Define los talles ofrecidos y su stock. `entries` = [{ sizeId, stock }].
 * Los talles que no estén en la lista se quitan del producto.
 */
function setVariants(productId, entries) {
  const db = getDb();
  db.transaction(() => {
    const keep = entries.map((e) => e.sizeId);
    const existing = db.prepare('SELECT id, size_id FROM product_variants WHERE product_id = ?').all(productId);
    for (const row of existing) {
      if (!keep.includes(row.size_id)) db.prepare('DELETE FROM product_variants WHERE id = ?').run(row.id);
    }
    const upsert = db.prepare(`INSERT INTO product_variants (product_id, size_id, stock) VALUES (?, ?, ?)
      ON CONFLICT(product_id, size_id) DO UPDATE SET stock = excluded.stock`);
    for (const e of entries) upsert.run(productId, e.sizeId, e.stock);
  })();
}

function updateVariantStock(variantId, stock) {
  return getDb().prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(stock, variantId).changes;
}

function addImage(productId, url, alt = '') {
  const db = getDb();
  const next = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM product_images WHERE product_id = ?').get(productId).n;
  return Number(db.prepare('INSERT INTO product_images (product_id, url, alt, sort_order) VALUES (?, ?, ?, ?)')
    .run(productId, url, alt, next).lastInsertRowid);
}

function updateImage(imageId, productId, { alt, sortOrder }) {
  getDb().prepare('UPDATE product_images SET alt = ?, sort_order = ? WHERE id = ? AND product_id = ?')
    .run(alt, sortOrder, imageId, productId);
}

function removeImage(imageId, productId) {
  const db = getDb();
  const row = db.prepare('SELECT url FROM product_images WHERE id = ? AND product_id = ?').get(imageId, productId);
  if (!row) return null;
  db.prepare('DELETE FROM product_images WHERE id = ?').run(imageId);
  return row.url;
}

function countImages(productId) {
  return getDb().prepare('SELECT COUNT(*) c FROM product_images WHERE product_id = ?').get(productId).c;
}

/** Variantes con poco stock (> 0 y <= umbral) de productos activos, o agotadas. */
function lowStockVariants() {
  const threshold = settings.getInt('low_stock_threshold', 3);
  return getDb().prepare(`
    SELECT v.id AS variant_id, v.stock, s.name AS size, p.id AS product_id, p.name AS product_name, p.active
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN sizes s ON s.id = v.size_id
    WHERE v.stock <= ? ORDER BY v.stock ASC, p.name, s.sort_order`).all(threshold);
}

function countAll() {
  const db = getDb();
  return {
    total: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    active: db.prepare('SELECT COUNT(*) c FROM products WHERE active = 1').get().c,
  };
}

function allForSitemap() {
  return getDb().prepare('SELECT slug, updated_at FROM products WHERE active = 1 ORDER BY id').all();
}

module.exports = {
  SORTS, listPublic, facets, allColors, findBySlug, findById, listAdmin, related, save, remove, setFlag, setVariants,
  updateVariantStock, addImage, updateImage, removeImage, countImages, lowStockVariants, countAll, allForSitemap,
};
