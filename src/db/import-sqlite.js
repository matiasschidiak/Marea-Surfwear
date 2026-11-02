'use strict';
/**
 * Importa una base SQLite vieja (data/marea.db) a la base actual (Postgres/Supabase o PGlite local):
 * categorías, talles, productos, imágenes, stock, clientes, pedidos, administradores y configuración,
 * conservando los mismos números de id (los pedidos siguen apuntando a sus productos).
 * Si el almacenamiento es Supabase Storage, también sube las fotos de public/uploads y corrige sus URLs.
 *
 * `better-sqlite3` es una dependencia de desarrollo: solo hace falta en tu computadora, no en Vercel.
 */
const fs = require('fs');
const path = require('path');
const db = require('./index');
const config = require('../config');
const storage = require('../services/storage');

const WIDTHS = [480, 800, 1400];

// tabla -> columnas (en el orden en que se deben cargar por las claves foráneas)
const TABLES = [
  ['categories', ['id', 'name', 'slug', 'sort_order', 'active']],
  ['sizes', ['id', 'name', 'sort_order']],
  ['products', ['id', 'category_id', 'slug', 'name', 'short_description', 'description', 'material', 'color', 'features',
    'price', 'compare_at_price', 'active', 'featured', 'created_at', 'updated_at']],
  ['product_images', ['id', 'product_id', 'url', 'alt', 'sort_order']],
  ['product_variants', ['id', 'product_id', 'size_id', 'sku', 'stock']],
  ['customers', ['id', 'first_name', 'last_name', 'phone', 'email', 'created_at', 'updated_at']],
  ['orders', ['id', 'code', 'customer_id', 'status', 'customer_first_name', 'customer_last_name', 'customer_phone',
    'delivery_method', 'payment_method', 'ship_street', 'ship_number', 'ship_city', 'ship_province', 'ship_postal_code',
    'ship_notes', 'subtotal', 'shipping_cost', 'total', 'stock_released', 'admin_notes', 'created_at', 'updated_at']],
  ['order_items', ['id', 'order_id', 'variant_id', 'product_id', 'product_name', 'size_name', 'unit_price', 'quantity', 'subtotal']],
  ['order_status_history', ['id', 'order_id', 'status', 'admin_id', 'created_at']],
  ['admins', ['id', 'email', 'name', 'password_hash', 'active', 'created_at', 'last_login_at']],
  ['settings', ['key', 'value']],
];
const TIME_COLUMNS = new Set(['created_at', 'updated_at', 'last_login_at']);

/** "2026-10-06 02:01:48" (UTC, formato SQLite) -> ISO para Postgres */
const toTimestamp = (v) => (v ? `${String(v).replace(' ', 'T')}Z` : null);

async function uploadLegacyImage(url, log) {
  const m = /^\/uploads\/([a-f0-9]{20})-1400\.webp$/.exec(url || '');
  if (!m || !storage.useSupabase) return url; // ilustraciones /img o almacenamiento local: la URL sirve tal cual
  let newUrl = url;
  for (const w of WIDTHS) {
    const file = path.join(config.uploadsDir, `${m[1]}-${w}.webp`);
    if (!fs.existsSync(file)) { log(`  ! falta el archivo ${path.basename(file)}`); continue; }
    const uploaded = await storage.put(`${m[1]}-${w}.webp`, fs.readFileSync(file), 'image/webp');
    if (w === 1400) newUrl = uploaded;
  }
  return newUrl;
}

async function importFromSqlite({ file = config.legacySqlitePath, force = false, log = console.log } = {}) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    throw new Error('Falta better-sqlite3 (dependencia de desarrollo). Ejecutá "npm install" en tu computadora.');
  }
  if (!fs.existsSync(file)) throw new Error(`No existe la base vieja: ${file}`);
  await db.init();

  const counts = await db.get(`SELECT (SELECT COUNT(*)::int FROM products) AS products,
    (SELECT COUNT(*)::int FROM orders) AS orders, (SELECT COUNT(*)::int FROM admins) AS admins`);
  if (!force && (counts.products || counts.orders || counts.admins)) {
    return { skipped: true, reason: 'La base de destino ya tiene datos. Usá --force para importar igual (los duplicados fallarán).' };
  }

  const src = new Database(file, { readonly: true });
  try {
    const have = (table) => new Set(src.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    const data = {};
    for (const [table, cols] of TABLES) {
      const present = have(table);
      const use = cols.filter((c) => present.has(c));
      data[table] = { cols: use, rows: src.prepare(`SELECT ${use.join(', ')} FROM ${table}`).all() };
    }

    // Fotos: se suben antes de abrir la transacción
    const imageUrls = new Map();
    for (const row of data.product_images.rows) {
      if (!imageUrls.has(row.url)) imageUrls.set(row.url, await uploadLegacyImage(row.url, log));
    }

    await db.tx(async (t) => {
      if (!counts.products && !counts.orders && !counts.admins) {
        // Quita lo que creó el arranque automático (categoría y talles básicos) para no chocar con los ids importados
        await t.run('DELETE FROM sizes');
        await t.run('DELETE FROM categories');
        await t.run('DELETE FROM settings');
      }
      for (const [table] of TABLES) {
        const { cols, rows } = data[table];
        for (const row of rows) {
          const values = cols.map((c) => {
            if (table === 'product_images' && c === 'url') return imageUrls.get(row.url);
            if (TIME_COLUMNS.has(c)) return toTimestamp(row[c]);
            return row[c];
          });
          await t.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, values);
        }
        log(`  ${table}: ${rows.length}`);
      }
      // Los contadores automáticos (id) siguen desde el mayor id importado
      for (const [table, cols] of TABLES) {
        if (!cols.includes('id')) continue;
        await t.run(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${table}`);
      }
    });
    return { skipped: false, products: data.products.rows.length, orders: data.orders.rows.length };
  } finally {
    src.close();
  }
}

module.exports = { importFromSqlite };
