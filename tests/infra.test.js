'use strict';
// Piezas de infraestructura para Vercel + Supabase: almacenamiento de fotos, límites compartidos e importación.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer } = require('./helpers');

let t;
let mock;
const files = new Map();      // lo que "guardó" el Storage simulado
const calls = [];             // pedidos que recibió
const KEY = 'service-role-test-key';

function startMockSupabase() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, apikey: req.headers.apikey });
      const send = (status, json = {}) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { message: 'no autorizado' });
      if (req.method === 'GET' && req.url === '/storage/v1/bucket/productos') return send(files.has('__bucket') ? 200 : 404, { message: 'Bucket not found' });
      if (req.method === 'POST' && req.url === '/storage/v1/bucket') { files.set('__bucket', true); return send(200, JSON.parse(body)); }
      const put = /^\/storage\/v1\/object\/productos\/(.+)$/.exec(req.url);
      if (req.method === 'POST' && put) { files.set(decodeURIComponent(put[1]), { type: req.headers['content-type'], size: body.length }); return send(200, { Key: put[1] }); }
      if (req.method === 'DELETE' && req.url === '/storage/v1/object/productos') {
        for (const k of JSON.parse(body).prefixes) files.delete(k);
        return send(200, []);
      }
      return send(404, { message: 'ruta no simulada' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

after(async () => {
  if (t) await t.close();
  if (mock) await new Promise((r) => mock.close(r));
});

test('Supabase Storage: crea el bucket, sube 3 tamaños WebP, deriva el srcset y borra los archivos', async () => {
  mock = await startMockSupabase();
  const url = `http://127.0.0.1:${mock.address().port}`;
  t = await startTestServer({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: KEY });
  const sharp = require('sharp');
  const images = require('../src/services/images');
  const png = await sharp({ create: { width: 1600, height: 2000, channels: 3, background: '#d94' } }).png().toBuffer();

  const imageUrl = await images.saveUpload(png);
  assert.match(imageUrl, new RegExp(`^${url}/storage/v1/object/public/productos/[a-f0-9]{20}-1400\\.webp$`));
  const keys = [...files.keys()].filter((k) => k !== '__bucket');
  assert.equal(keys.length, 3);
  assert.ok(keys.every((k) => files.get(k).type === 'image/webp'));
  assert.ok(calls.every((c) => c.auth === `Bearer ${KEY}` && c.apikey === KEY), 'todas las llamadas llevan la clave de servicio');
  assert.ok(calls.some((c) => c.method === 'POST' && c.url === '/storage/v1/bucket'), 'se creó el bucket');

  const srcset = images.srcset(imageUrl);
  assert.match(srcset, /-480\.webp 480w, .*-800\.webp 800w, .*-1400\.webp 1400w/);
  assert.ok(srcset.startsWith(url));

  await images.deleteFiles(imageUrl);
  assert.equal([...files.keys()].filter((k) => k !== '__bucket').length, 0, 'se borraron los 3 archivos');
  await images.deleteFiles('/img/products/algo.svg'); // las ilustraciones estáticas no se tocan

  await assert.rejects(images.saveUpload(Buffer.from('no soy una imagen')), /no es una imagen/);
});

test('Supabase Storage: la política de seguridad permite las imágenes del Storage y la tienda no sirve /uploads', async () => {
  const res = await fetch(t.base + '/');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, new RegExp(`img-src[^;]*http://127\\.0\\.0\\.1:${mock.address().port}`));
  assert.equal((await fetch(t.base + '/uploads/x.webp')).status, 404);
});

test('las fotos del Storage se muestran con srcset y absolutas en la ficha y en Open Graph', async () => {
  const images = require('../src/services/images');
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 900, height: 1100, channels: 3, background: '#3a7' } }).png().toBuffer();
  const imageUrl = await images.saveUpload(png);
  const p = await t.addProduct('Malla Storage', 40000, { M: 2 });
  await t.products.addImage(p.id, imageUrl, 'Malla Storage - frente');
  const html = await (await fetch(`${t.base}/producto/${p.slug}`)).text();
  assert.ok(html.includes(`srcset="${imageUrl.replace('-1400.webp', '-480.webp')} 480w`));
  assert.ok(html.includes(`<meta property="og:image" content="${imageUrl}">`));
});

test('límite de intentos compartido (en la base): cuenta, vence y se puede reiniciar', async () => {
  const { DbStore } = require('../src/services/rate-limit-store');
  const store = new DbStore('test:');
  store.init({ windowMs: 1000 });
  const a = await store.increment('1.2.3.4');
  const b = await store.increment('1.2.3.4');
  assert.deepEqual([a.totalHits, b.totalHits], [1, 2]);
  assert.equal((await store.increment('9.9.9.9')).totalHits, 1, 'cada IP cuenta aparte');
  await store.decrement('1.2.3.4');
  assert.equal((await store.increment('1.2.3.4')).totalHits, 2);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await store.increment('1.2.3.4')).totalHits, 1, 'al vencer la ventana vuelve a 1');
  await store.resetKey('1.2.3.4');
  assert.equal((await store.increment('1.2.3.4')).totalHits, 1);
});

test('importación desde SQLite: conserva ids, fechas y relaciones, y deja los contadores listos', async () => {
  const Database = require('better-sqlite3');
  const os = require('node:os');
  const file = path.join(t.dir, 'viejo.db');
  const sq = new Database(file);
  sq.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, slug TEXT, sort_order INTEGER, active INTEGER);
    CREATE TABLE sizes (id INTEGER PRIMARY KEY, name TEXT, sort_order INTEGER);
    CREATE TABLE products (id INTEGER PRIMARY KEY, category_id INTEGER, slug TEXT, name TEXT, short_description TEXT, description TEXT,
      material TEXT, features TEXT, price INTEGER, compare_at_price INTEGER, active INTEGER, featured INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE product_images (id INTEGER PRIMARY KEY, product_id INTEGER, url TEXT, alt TEXT, sort_order INTEGER);
    CREATE TABLE product_variants (id INTEGER PRIMARY KEY, product_id INTEGER, size_id INTEGER, sku TEXT, stock INTEGER);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, phone TEXT, email TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, code TEXT, customer_id INTEGER, status TEXT, customer_first_name TEXT, customer_last_name TEXT,
      customer_phone TEXT, delivery_method TEXT, payment_method TEXT, ship_street TEXT, ship_number TEXT, ship_city TEXT, ship_province TEXT,
      ship_postal_code TEXT, ship_notes TEXT, subtotal INTEGER, shipping_cost INTEGER, total INTEGER, stock_released INTEGER, admin_notes TEXT,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, variant_id INTEGER, product_id INTEGER, product_name TEXT, size_name TEXT,
      unit_price INTEGER, quantity INTEGER, subtotal INTEGER);
    CREATE TABLE order_status_history (id INTEGER PRIMARY KEY, order_id INTEGER, status TEXT, admin_id INTEGER, created_at TEXT);
    CREATE TABLE admins (id INTEGER PRIMARY KEY, email TEXT, name TEXT, password_hash TEXT, active INTEGER, created_at TEXT, last_login_at TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO categories VALUES (7, 'Mallas', 'mallas', 1, 1);
    INSERT INTO sizes VALUES (3, 'ÚNICO', 80);
    INSERT INTO products VALUES (41, 7, 'boardshort-uno', 'Boardshort Uno', 'corta', 'larga', '', '["a","b"]', 44000, NULL, 1, 1, '2026-10-06 02:01:48', '2026-10-06 02:01:48');
    INSERT INTO product_images VALUES (1, 41, '/img/products/x-1.svg', 'alt', 0);
    INSERT INTO product_variants VALUES (9, 41, 3, NULL, 1);
    INSERT INTO customers VALUES (5, 'Ana', 'Gómez', '2994154002', NULL, '2026-10-06 03:00:00', '2026-10-06 03:00:00');
    INSERT INTO orders VALUES (12, 'MAR-ABC234', 5, 'pendiente', 'Ana', 'Gómez', '2994154002', 'retiro', 'efectivo', '', '', '', '', '', '', 44000, 0, 44000, 0, '', '2026-10-06 03:00:00', '2026-10-06 03:00:00');
    INSERT INTO order_items VALUES (20, 12, 9, 41, 'Boardshort Uno', 'ÚNICO', 44000, 1, 44000);
    INSERT INTO order_status_history VALUES (30, 12, 'pendiente', NULL, '2026-10-06 03:00:00');
    INSERT INTO admins VALUES (2, 'Dueno@Marea.test', 'Dueño', 'scrypt$aa$bb', 1, '2026-10-06 02:00:00', NULL);
    INSERT INTO settings VALUES ('whatsapp_number', '5492994154002');
  `);
  sq.close();

  const { importFromSqlite } = require('../src/db/import-sqlite');
  const db = require('../src/db');
  // La base de pruebas ya tiene productos: se vacía para simular una base nueva
  await db.run('DELETE FROM rate_limits');
  const skipped = await importFromSqlite({ file, log: () => {} });
  assert.equal(skipped.skipped, true, 'no pisa una base que ya tiene datos');

  for (const tbl of ['order_status_history', 'order_items', 'orders', 'customers', 'product_images', 'product_variants', 'products', 'admins', 'settings']) {
    await db.run(`DELETE FROM ${tbl}`);
  }
  const r = await importFromSqlite({ file, log: () => {} });
  assert.deepEqual([r.skipped, r.products, r.orders], [false, 1, 1]);

  const p = await db.get('SELECT * FROM products WHERE id = 41');
  assert.equal(p.price, 44000);
  assert.equal(p.color, '');
  assert.equal(new Date(p.created_at).toISOString(), '2026-10-06T02:01:48.000Z');
  assert.equal((await db.get('SELECT product_id FROM product_variants WHERE id = 9')).product_id, 41);
  assert.equal((await db.get('SELECT variant_id FROM order_items WHERE id = 20')).variant_id, 9);
  assert.equal((await db.get("SELECT value FROM settings WHERE key = 'whatsapp_number'")).value, '5492994154002');
  assert.equal((await t.auth.admins.findByEmail('dueno@marea.test')).id, 2, 'el email no distingue mayúsculas');
  // Los id automáticos siguen después del mayor importado
  const next = await db.get("INSERT INTO products (slug, name, price) VALUES ('nuevo', 'Nuevo', 1) RETURNING id");
  assert.equal(next.id, 42);
});
