'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, validCustomer } = require('./helpers');

let t;
const PASSWORD = 'Clave-de-prueba-2026';
let cookie = '';
let csrf = '';

const form = (obj) => new URLSearchParams(obj).toString();
const call = (path, opts = {}) => fetch(t.base + path, { redirect: 'manual', ...opts, headers: { cookie, ...(opts.headers || {}) } });

function mergeCookies(res) {
  const set = res.headers.getSetCookie();
  const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
  for (const c of set) {
    const [kv] = c.split(';');
    const [k, v] = kv.split(/=(.*)/s);
    if (/expires=Thu, 01 Jan 1970/i.test(c) || v === '') delete jar[k]; else jar[k] = v;
  }
  cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function login(email = 'dueno@marea.test', password = PASSWORD) {
  cookie = '';
  const page = await call('/admin/login');
  mergeCookies(page);
  const html = await page.text();
  const lcsrf = /name="_lcsrf" value="([^"]+)"/.exec(html)[1];
  const res = await call('/admin/login', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ email, password, _lcsrf: lcsrf, next: '/admin' }),
  });
  mergeCookies(res);
  return res;
}

async function getCsrf(path = '/admin/productos/nuevo') {
  const html = await (await call(path)).text();
  csrf = /name="_csrf" value="([^"]+)"/.exec(html)[1];
  return csrf;
}

before(async () => {
  t = await startTestServer();
  t.auth.admins.create({ email: 'dueno@marea.test', name: 'Dueño', password: PASSWORD });
});
after(async () => { await t.close(); });

test('el panel no es accesible sin sesión', async () => {
  cookie = '';
  for (const path of ['/admin', '/admin/productos', '/admin/pedidos', '/admin/stock', '/admin/configuracion']) {
    const res = await call(path);
    assert.equal(res.status, 302, path);
    assert.match(res.headers.get('location'), /^\/admin\/login/);
  }
  const post = await call('/admin/stock', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ stock_1: '99' }) });
  assert.equal(post.status, 303);
});

test('login: rechaza credenciales incorrectas y token inválido; acepta las correctas', async () => {
  let res = await login('dueno@marea.test', 'incorrecta12345');
  assert.equal(res.status, 401);
  assert.equal((await call('/admin')).status, 302);

  // Sin token de login
  cookie = '';
  res = await call('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ email: 'dueno@marea.test', password: PASSWORD }) });
  assert.equal(res.status, 403);

  res = await login();
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/admin');
  const dash = await call('/admin');
  assert.equal(dash.status, 200);
  assert.match(await dash.text(), /Resumen/);
});

test('la contraseña se guarda hasheada (scrypt) y la cookie es httpOnly', async () => {
  const row = t.db.prepare('SELECT password_hash FROM admins').get();
  assert.match(row.password_hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.ok(!row.password_hash.includes(PASSWORD));
  cookie = '';
  const page = await call('/admin/login');
  mergeCookies(page);
  const lcsrf = /name="_lcsrf" value="([^"]+)"/.exec(await page.text())[1];
  const res = await call('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ email: 'dueno@marea.test', password: PASSWORD, _lcsrf: lcsrf }) });
  const sc = res.headers.getSetCookie().find((c) => c.startsWith('marea_admin='));
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
  mergeCookies(res);
});

test('las acciones del panel exigen token CSRF', async () => {
  await login();
  const res = await call('/admin/stock', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ stock_1: '5' }) });
  assert.equal(res.status, 403);
});

test('crear producto con talles, stock y editarlo desde el panel', async () => {
  await login();
  await getCsrf();
  const sizeId = (n) => t.sizes.findByName(n).id;
  const body = form({
    _csrf: csrf, name: 'Malla Panel Test', shortDescription: 'Corta', description: 'Larga', material: '100% poliéster',
    features: 'Uno\nDos\n\nTres', price: '52000', comparePrice: '60000', categoryId: String(t.categories.list()[0].id), active: '1', featured: '1',
    [`offer_${sizeId('S')}`]: '1', [`stock_${sizeId('S')}`]: '4', [`offer_${sizeId('M')}`]: '1', [`stock_${sizeId('M')}`]: '0',
    newSizes: 'XXL',
  });
  const res = await call('/admin/productos', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  // El formulario normal es multipart, pero urlencoded también debe aceptarse y validarse igual
  assert.equal(res.status, 302, await res.text());
  const created = t.db.prepare("SELECT * FROM products WHERE name = 'Malla Panel Test'").get();
  assert.ok(created);
  assert.equal(created.price, 52000);
  assert.deepEqual(JSON.parse(created.features), ['Uno', 'Dos', 'Tres']);
  assert.equal(created.featured, 1);
  const p = t.products.findById(created.id);
  assert.deepEqual(p.variants.map((v) => [v.size, v.stock]), [['S', 4], ['M', 0], ['XXL', 0]]);

  // Aparece en la tienda
  const home = await (await fetch(t.base + '/')).text();
  assert.match(home, /Malla Panel Test/);

  // Editar: nuevo precio y stock; quitar el talle M
  await getCsrf(`/admin/productos/${created.id}`);
  const edit = form({
    _csrf: csrf, name: 'Malla Panel Test', price: '55000', categoryId: String(created.category_id), active: '1',
    [`offer_${sizeId('S')}`]: '1', [`stock_${sizeId('S')}`]: '9', [`offer_${sizeId('XXL')}`]: '1', [`stock_${sizeId('XXL')}`]: '2',
  });
  const res2 = await call(`/admin/productos/${created.id}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: edit });
  assert.equal(res2.status, 302);
  const p2 = t.products.findById(created.id);
  assert.equal(p2.price, 55000);
  assert.deepEqual(p2.variants.map((v) => [v.size, v.stock]), [['S', 9], ['XXL', 2]]);
  assert.equal(p2.featured, false);
});

test('el panel valida los datos del producto', async () => {
  await login();
  await getCsrf();
  const res = await call('/admin/productos', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf, name: 'X', price: '-5' }) });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Ingresá el nombre/);
  assert.match(html, /precio válido/);
  const sizeId = t.sizes.findByName('S').id;
  const res2 = await call('/admin/productos', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ _csrf: csrf, name: 'Con stock malo', price: '1000', [`offer_${sizeId}`]: '1', [`stock_${sizeId}`]: '-3' }) });
  assert.equal(res2.status, 422);
});

test('stock rápido, activar/desactivar y destacar', async () => {
  await login();
  const p = t.addProduct('Malla Stock Rápido', 10000, { S: 1, M: 1 });
  await getCsrf('/admin/stock');
  let res = await call('/admin/stock', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ _csrf: csrf, [`stock_${t.variantId(p, 'S')}`]: '12', [`stock_${t.variantId(p, 'M')}`]: 'abc' }) });
  assert.equal(res.status, 302);
  assert.equal(t.stockOf(t.variantId(p, 'S')), 12);
  assert.equal(t.stockOf(t.variantId(p, 'M')), 1, 'valores inválidos se ignoran');

  res = await call(`/admin/productos/${p.id}/toggle`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf, field: 'active', value: '0' }) });
  assert.equal(res.status, 302);
  assert.equal((await fetch(`${t.base}/producto/${p.slug}`)).status, 404);
  await call(`/admin/productos/${p.id}/toggle`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf, field: 'featured', value: '1' }) });
  assert.equal(t.products.findById(p.id).featured, true);
  // campo no permitido
  res = await call(`/admin/productos/${p.id}/toggle`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf, field: 'price', value: '0' }) });
  assert.equal(res.status, 404);
});

test('pedidos: se ven en el panel y se puede cambiar el estado (cancelar devuelve stock)', async () => {
  await login();
  const p = t.addProduct('Malla Pedido Panel', 25000, { M: 5 });
  const v = t.variantId(p, 'M');
  const order = await t.post('/api/orders', { ...validCustomer({ firstName: 'Lucía', notes: 'Portón negro' }), items: [{ variantId: v, qty: 2 }] });
  assert.equal(t.stockOf(v), 3);
  const id = t.db.prepare('SELECT id FROM orders WHERE code = ?').get(order.json.code).id;

  const list = await (await call('/admin/pedidos')).text();
  assert.match(list, new RegExp(order.json.code));
  const detail = await (await call(`/admin/pedidos/${id}`)).text();
  assert.match(detail, /Lucía/);
  assert.match(detail, /Malla Pedido Panel/);
  assert.match(detail, /Portón negro/);
  assert.match(detail, /Pendiente/);

  await getCsrf(`/admin/pedidos/${id}`);
  const post = (status) => call(`/admin/pedidos/${id}/estado`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf, status }) });
  assert.equal((await post('preparando')).status, 302);
  assert.equal(t.db.prepare('SELECT status FROM orders WHERE id = ?').get(id).status, 'preparando');
  assert.equal((await post('cancelado')).status, 302);
  assert.equal(t.stockOf(v), 5);
  assert.equal(t.db.prepare('SELECT COUNT(*) c FROM order_status_history WHERE order_id = ?').get(id).c, 3);
  await post('estado-inventado');
  assert.equal(t.db.prepare('SELECT status FROM orders WHERE id = ?').get(id).status, 'cancelado');
});

test('configuración: el número de WhatsApp se valida y se usa en los pedidos', async () => {
  await login();
  await getCsrf('/admin/configuracion');
  const base = { _csrf: csrf, whatsapp_number: '542994154002', contact_email: '', store_address: 'Neuquén', announcement: 'Hola', low_stock_threshold: '3' };
  let res = await call('/admin/configuracion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...base, whatsapp_number: 'abc' }) });
  assert.equal(res.status, 422);
  res = await call('/admin/configuracion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...base, instagram_url: 'javascript:alert(1)' }) });
  assert.equal(res.status, 422);
  res = await call('/admin/configuracion', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ ...base, instagram_url: 'https://www.instagram.com/marea' }) });
  assert.equal(res.status, 302);
  const home = await (await fetch(t.base + '/')).text();
  assert.match(home, /href="https:\/\/www\.instagram\.com\/marea"/);
});

test('cerrar sesión invalida la cookie', async () => {
  await login();
  await getCsrf('/admin/cuenta');
  const res = await call('/admin/logout', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf }) });
  assert.equal(res.status, 302);
  const old = cookie;
  mergeCookies(res);
  cookie = old; // se reutiliza la cookie vieja a propósito
  assert.equal((await call('/admin')).status, 302);
});

test('subida de imágenes: se optimizan a WebP en varios tamaños y se rechazan archivos que no son imágenes', async () => {
  const sharp = require('sharp');
  const fs = require('fs');
  await login();
  await getCsrf();
  const png = await sharp({ create: { width: 1600, height: 2000, channels: 3, background: '#2f7fb8' } }).png().toBuffer();

  const fd = new FormData();
  fd.set('_csrf', csrf);
  fd.set('name', 'Malla Con Fotos');
  fd.set('price', '48000');
  fd.set('active', '1');
  fd.append('images', new Blob([png], { type: 'image/png' }), 'foto1.png');
  fd.append('images', new Blob(['esto no es una imagen'], { type: 'image/png' }), 'falso.png');
  const res = await call('/admin/productos', { method: 'POST', body: fd });
  assert.equal(res.status, 302, await res.text());

  const product = t.db.prepare("SELECT id, slug FROM products WHERE name = 'Malla Con Fotos'").get();
  const imgs = t.db.prepare('SELECT url FROM product_images WHERE product_id = ?').all(product.id);
  assert.equal(imgs.length, 1, 'solo la imagen válida se guarda');
  assert.match(imgs[0].url, /^\/uploads\/[a-f0-9]{20}-1400\.webp$/);

  const dir = process.env.UPLOADS_DIR;
  const base = imgs[0].url.replace('/uploads/', '').replace('-1400.webp', '');
  for (const w of [480, 800, 1400]) assert.ok(fs.existsSync(`${dir}/${base}-${w}.webp`), `falta el tamaño ${w}`);
  const meta = await sharp(`${dir}/${base}-480.webp`).metadata();
  assert.equal(meta.width, 480);
  assert.equal(meta.format, 'webp');

  const page = await (await fetch(`${t.base}/producto/${product.slug}`)).text();
  assert.match(page, /srcset="[^"]*-480\.webp 480w/);
  assert.match(page, /loading="eager"/);

  // Eliminar el producto borra también los archivos
  await getCsrf(`/admin/productos/${product.id}`);
  const del = await call(`/admin/productos/${product.id}/eliminar`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrf }) });
  assert.equal(del.status, 302);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!fs.existsSync(`${dir}/${base}-1400.webp`));
  assert.equal(t.db.prepare('SELECT COUNT(*) c FROM product_images WHERE product_id = ?').get(product.id).c, 0);
});
