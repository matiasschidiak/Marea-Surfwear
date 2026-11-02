'use strict';
// Arranca la aplicación real contra una base PostgreSQL en memoria (PGlite), para pruebas de punta a punta.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';

async function startTestServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marea-test-'));
  // Con TEST_DATABASE_URL las pruebas corren contra un Postgres real (por ejemplo uno de prueba en Supabase).
  // ¡Se BORRA el esquema "public" de esa base! Sin la variable se usa un Postgres embebido en memoria.
  const testUrl = process.env.TEST_DATABASE_URL || '';
  Object.assign(process.env, {
    DATABASE_URL: testUrl,            // vacío: Postgres embebido en memoria
    PGLITE_DIR: 'memory://',
    UPLOADS_DIR: path.join(dir, 'uploads'),
    SITE_URL: 'http://localhost',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    ...extraEnv,
  });

  if (testUrl) {
    const { Client } = require('pg');
    const url = new URL(testUrl);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    const client = new Client({ connectionString: testUrl, ssl: local ? false : { rejectUnauthorized: false } });
    await client.connect();
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await client.end();
  }

  // Se limpian los módulos para que tomen las variables de entorno nuevas
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}`)) delete require.cache[key];
  }
  const db = require('../src/db');
  const { createApp } = require('../src/app');
  const { ensureReady } = require('../src/bootstrap');
  const { categories, sizes } = require('../src/repositories/catalog-lookups');
  const products = require('../src/repositories/products');
  const auth = require('../src/services/auth');

  await ensureReady(); // migraciones + categoría "Mallas" + talles básicos
  const cat = await categories.findOrCreate('Mallas');

  async function addProduct(name, price, stock, extra = {}) {
    const id = await products.save({
      name, shortDescription: '', description: 'Desc', material: 'Poliéster', features: ['A', 'B'], price,
      comparePrice: null, categoryId: cat.id, active: true, featured: false, ...extra,
    });
    const variants = [];
    for (const [n, st] of Object.entries(stock)) variants.push({ sizeId: (await sizes.findByName(n)).id, stock: st });
    await products.setVariants(id, variants);
    return products.findById(id);
  }

  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const variantId = (product, size) => product.variants.find((v) => v.size === size).id;
  const stockOf = async (id) => (await db.get('SELECT stock FROM product_variants WHERE id = ?', [id])).stock;

  async function post(url, body, headers = {}) {
    const res = await fetch(base + url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* sin JSON */ }
    return { status: res.status, json };
  }

  async function close() {
    await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
    await db.close();
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows puede retener archivos un instante: la carpeta es temporal */ }
  }

  return { base, db, addProduct, variantId, stockOf, post, close, auth, products, sizes, categories, dir };
}

const validCustomer = (over = {}) => ({
  firstName: 'Juan', lastName: 'Pérez', phone: '2991234567',
  deliveryMethod: 'envio', paymentMethod: 'transferencia',
  street: 'Av. Argentina', streetNumber: '123', city: 'Neuquén', province: 'Neuquén', postalCode: '8300',
  notes: 'Entregar por la tarde.', ...over,
});

module.exports = { startTestServer, validCustomer };
