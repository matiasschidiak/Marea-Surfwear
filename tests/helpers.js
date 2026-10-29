'use strict';
// Arranca la aplicación real contra una base de datos temporal, para pruebas de punta a punta.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';

async function startTestServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marea-test-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.UPLOADS_DIR = path.join(dir, 'uploads');
  process.env.SITE_URL = 'http://localhost';

  // Se limpian los módulos para que tomen las variables de entorno nuevas
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}`)) delete require.cache[key];
  }
  const { getDb, closeDb } = require('../src/db');
  const { createApp } = require('../src/app');
  const { categories, sizes } = require('../src/repositories/catalog-lookups');
  const products = require('../src/repositories/products');
  const auth = require('../src/services/auth');

  const db = getDb();
  const cat = categories.findOrCreate('Mallas');
  for (const s of ['XS', 'S', 'M', 'L', 'XL']) sizes.findOrCreate(s);

  function addProduct(name, price, stock, extra = {}) {
    const id = products.save({
      name, shortDescription: '', description: 'Desc', material: 'Poliéster', features: ['A', 'B'], price,
      comparePrice: null, categoryId: cat.id, active: true, featured: false, ...extra,
    });
    products.setVariants(id, Object.entries(stock).map(([n, st]) => ({ sizeId: sizes.findByName(n).id, stock: st })));
    return products.findById(id);
  }

  const app = createApp();
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const variantId = (product, size) => product.variants.find((v) => v.size === size).id;
  const stockOf = (id) => db.prepare('SELECT stock FROM product_variants WHERE id = ?').get(id).stock;

  async function post(url, body, headers = {}) {
    const res = await fetch(base + url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* sin JSON */ }
    return { status: res.status, json };
  }

  async function close() {
    await new Promise((r) => server.close(r));
    closeDb();
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows puede retener archivos un instante: la carpeta es temporal */ }
  }

  return { base, db, addProduct, variantId, stockOf, post, close, auth, products, sizes, categories };
}

const validCustomer = (over = {}) => ({
  firstName: 'Juan', lastName: 'Pérez', phone: '2991234567',
  deliveryMethod: 'envio', paymentMethod: 'transferencia',
  street: 'Av. Argentina', streetNumber: '123', city: 'Neuquén', province: 'Neuquén', postalCode: '8300',
  notes: 'Entregar por la tarde.', ...over,
});

module.exports = { startTestServer, validCustomer };
