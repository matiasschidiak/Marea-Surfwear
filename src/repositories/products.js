'use strict';
const db = require('../db');
const settings = require('./settings');
const { slugify } = require('../utils/format');

const SORTS = {
  destacados: 'p.featured DESC, p.created_at DESC, p.id DESC',
  nuevos: 'p.created_at DESC, p.id DESC',
  'precio-asc': 'p.price ASC, p.id ASC',
  'precio-desc': 'p.price DESC, p.id DESC',
  nombre: 'lower(p.name) ASC, p.id ASC',
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
async function hydrate(rows) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [images, variants, threshold] = await Promise.all([
    db.all(
      `SELECT id, product_id, url, alt, sort_order FROM product_images
       WHERE product_id IN (${placeholders(ids)}) ORDER BY sort_order, id`, ids),
    db.all(
      `SELECT v.id, v.product_id, v.size_id, s.name AS size, v.stock, v.sku
       FROM product_variants v JOIN sizes s ON s.id = v.size_id
       WHERE v.product_id IN (${placeholders(ids)}) ORDER BY s.sort_order, s.name`, ids),
    settings.getInt('low_stock_threshold', 3),
  ]);

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
      updatedAt: r.updated_at,
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
async function listPublic({ q, sizes, colors, min, max, sort, category, inStock, featuredOnly, limit } = {}) {
  const where = ['p.active = 1'];
  const params = [];
  if (q) {
    where.push(`(p.name ILIKE ? ESCAPE '\\' OR p.short_description ILIKE ? ESCAPE '\\' OR p.description ILIKE ? ESCAPE '\\'
                 OR p.material ILIKE ? ESCAPE '\\' OR p.color ILIKE ? ESCAPE '\\')`);
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like, like, like);
  }
  // Varios talles o colores significan "alguno de ellos". Un talle solo cuenta si tiene stock.
  if (sizes && sizes.length) {
    where.push(`EXISTS (SELECT 1 FROM product_variants v JOIN sizes s ON s.id = v.size_id
                        WHERE v.product_id = p.id AND v.stock > 0 AND lower(s.name) IN (${placeholders(sizes)}))`);
    params.push(...sizes.map((s) => s.toLowerCase()));
  }
  if (colors && colors.length) {
    where.push(`lower(p.color) IN (${placeholders(colors)})`);
    params.push(...colors.map((c) => c.toLowerCase()));
  }
  if (inStock) where.push('EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock > 0)');
  if (Number.isInteger(min)) { where.push('p.price >= ?'); params.push(min); }
  if (Number.isInteger(max)) { where.push('p.price <= ?'); params.push(max); }
  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (featuredOnly) where.push('p.featured = 1');
  const order = SORTS[sort] || SORTS.destacados;
  const limitSql = Number.isInteger(limit) ? `LIMIT ${limit}` : '';
  const rows = await db.all(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} ${limitSql}`, params);
  return hydrate(rows);
}

/** Opciones del filtro con su cantidad de productos: colores y talles (con stock) de productos activos. */
async function facets() {
  const [colors, sizes] = await Promise.all([
    db.all(`SELECT MIN(color) AS name, COUNT(*)::int AS count FROM products
            WHERE active = 1 AND color != '' GROUP BY lower(color) ORDER BY count DESC, name`),
    db.all(`SELECT s.name AS name, COUNT(DISTINCT p.id)::int AS count FROM sizes s
            JOIN product_variants v ON v.size_id = s.id AND v.stock > 0
            JOIN products p ON p.id = v.product_id AND p.active = 1
            GROUP BY s.id ORDER BY s.sort_order, s.name`),
  ]);
  return { colors, sizes };
}

/** Colores ya usados, para sugerirlos en el panel. */
async function allColors() {
  const rows = await db.all("SELECT MIN(color) AS color FROM products WHERE color != '' GROUP BY lower(color) ORDER BY lower(MIN(color))");
  return rows.map((r) => r.color);
}

async function findBySlug(slug, { includeInactive = false } = {}) {
  const row = await db.get(`${BASE_SELECT} WHERE p.slug = ? ${includeInactive ? '' : 'AND p.active = 1'}`, [slug]);
  return row ? (await hydrate([row]))[0] : null;
}

async function findById(id) {
  const row = await db.get(`${BASE_SELECT} WHERE p.id = ?`, [id]);
  return row ? (await hydrate([row]))[0] : null;
}

async function listAdmin() {
  return hydrate(await db.all(`${BASE_SELECT} ORDER BY p.created_at DESC, p.id DESC`));
}

async function related(product, limit = 4) {
  let rows = await db.all(
    `${BASE_SELECT} WHERE p.active = 1 AND p.id != ? AND p.category_id IS NOT DISTINCT FROM ?
     ORDER BY p.featured DESC, p.created_at DESC LIMIT ?`,
    [product.id, product.categoryId, limit]
  );
  if (rows.length < limit) {
    const have = [product.id, ...rows.map((r) => r.id)];
    const more = await db.all(
      `${BASE_SELECT} WHERE p.active = 1 AND p.id NOT IN (${placeholders(have)})
       ORDER BY p.featured DESC, p.created_at DESC LIMIT ?`,
      [...have, limit - rows.length]
    );
    rows = rows.concat(more);
  }
  return hydrate(rows);
}

async function uniqueSlug(name, ignoreId = null) {
  const base = slugify(name) || 'producto';
  let slug = base;
  let n = 2;
  // id IS DISTINCT FROM NULL es verdadero para toda fila: sin id a ignorar se compara contra todos
  while (await db.get('SELECT id FROM products WHERE slug = ? AND id IS DISTINCT FROM ?', [slug, ignoreId])) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

/** Crea o actualiza un producto (campos de la tabla `products`, sin imágenes ni variantes). */
async function save(data, id = null) {
  const features = JSON.stringify(data.features || []);
  if (id) {
    const slug = await uniqueSlug(data.slug || data.name, id);
    await db.run(
      `UPDATE products SET category_id=?, slug=?, name=?, short_description=?, description=?, material=?, color=?,
              features=?, price=?, compare_at_price=?, active=?, featured=?, updated_at=now() WHERE id=?`,
      [data.categoryId, slug, data.name, data.shortDescription, data.description, data.material, data.color || '',
        features, data.price, data.comparePrice, data.active ? 1 : 0, data.featured ? 1 : 0, id]
    );
    return id;
  }
  const slug = await uniqueSlug(data.slug || data.name);
  const row = await db.get(
    `INSERT INTO products (category_id, slug, name, short_description, description, material, color,
            features, price, compare_at_price, active, featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    [data.categoryId, slug, data.name, data.shortDescription, data.description, data.material, data.color || '',
      features, data.price, data.comparePrice, data.active ? 1 : 0, data.featured ? 1 : 0]
  );
  return row.id;
}

/** Borra el producto y devuelve las URLs de sus imágenes (para eliminar los archivos). */
async function remove(id) {
  const images = await db.all('SELECT url FROM product_images WHERE product_id = ?', [id]);
  await db.run('DELETE FROM products WHERE id = ?', [id]);
  return images.map((i) => i.url);
}

async function setFlag(id, field, value) {
  if (!['active', 'featured'].includes(field)) throw new Error('Campo inválido');
  await db.run(`UPDATE products SET ${field} = ?, updated_at = now() WHERE id = ?`, [value ? 1 : 0, id]);
}

/**
 * Define los talles ofrecidos y su stock. `entries` = [{ sizeId, stock }].
 * Los talles que no estén en la lista se quitan del producto.
 */
async function setVariants(productId, entries) {
  await db.tx(async (t) => {
    const keep = entries.map((e) => e.sizeId);
    const existing = await t.all('SELECT id, size_id FROM product_variants WHERE product_id = ?', [productId]);
    for (const row of existing) {
      if (!keep.includes(row.size_id)) await t.run('DELETE FROM product_variants WHERE id = ?', [row.id]);
    }
    for (const e of entries) {
      await t.run(
        `INSERT INTO product_variants (product_id, size_id, stock) VALUES (?, ?, ?)
         ON CONFLICT (product_id, size_id) DO UPDATE SET stock = EXCLUDED.stock`,
        [productId, e.sizeId, e.stock]
      );
    }
  });
}

async function updateVariantStock(variantId, stock) {
  return (await db.run('UPDATE product_variants SET stock = ? WHERE id = ?', [stock, variantId])).changes;
}

async function addImage(productId, url, alt = '') {
  const row = await db.get(
    `INSERT INTO product_images (product_id, url, alt, sort_order)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_images WHERE product_id = ?))
     RETURNING id`,
    [productId, url, alt, productId]
  );
  return row.id;
}

async function updateImage(imageId, productId, { alt, sortOrder }) {
  await db.run('UPDATE product_images SET alt = ?, sort_order = ? WHERE id = ? AND product_id = ?',
    [alt, sortOrder, imageId, productId]);
}

async function removeImage(imageId, productId) {
  const row = await db.get('SELECT url FROM product_images WHERE id = ? AND product_id = ?', [imageId, productId]);
  if (!row) return null;
  await db.run('DELETE FROM product_images WHERE id = ?', [imageId]);
  return row.url;
}

async function countImages(productId) {
  return (await db.get('SELECT COUNT(*)::int AS c FROM product_images WHERE product_id = ?', [productId])).c;
}

/** Variantes agotadas o con poco stock (<= umbral). */
async function lowStockVariants() {
  const threshold = await settings.getInt('low_stock_threshold', 3);
  return db.all(`
    SELECT v.id AS variant_id, v.stock, s.name AS size, p.id AS product_id, p.name AS product_name, p.active
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN sizes s ON s.id = v.size_id
    WHERE v.stock <= ? ORDER BY v.stock ASC, p.name, s.sort_order`, [threshold]);
}

async function countAll() {
  const row = await db.get('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active = 1)::int AS active FROM products');
  return { total: row.total, active: row.active };
}

function allForSitemap() {
  return db.all('SELECT slug, updated_at FROM products WHERE active = 1 ORDER BY id');
}

module.exports = {
  SORTS, listPublic, facets, allColors, findBySlug, findById, listAdmin, related, save, remove, setFlag, setVariants,
  updateVariantStock, addImage, updateImage, removeImage, countImages, lowStockVariants, countAll, allForSitemap,
};
