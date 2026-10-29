'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, validCustomer } = require('./helpers');

let t;
let ocean; // producto con stock por talle
let items;

before(async () => {
  t = await startTestServer();
  ocean = t.addProduct('Malla Ocean Blue', 45000, { XS: 2, S: 5, M: 7, L: 3, XL: 0 }, { featured: true });
  items = (size, qty) => [{ variantId: t.variantId(ocean, size), qty }];
});
after(async () => { await t.close(); });

// ------------------------------------------------------------------------------------------------
test('el catálogo público muestra productos y talles agotados', async () => {
  const html = await (await fetch(t.base + '/')).text();
  assert.match(html, /Malla Ocean Blue/);
  assert.match(html, /\$45\.000/);
  const page = await (await fetch(`${t.base}/producto/${ocean.slug}`)).text();
  assert.match(page, /Agotado/, 'el talle XL (stock 0) debe figurar como Agotado');
  assert.match(page, /<input type="radio" name="variant" value="\d+" data-size="XL" data-stock="0" disabled>/, 'XL no se puede seleccionar');
  assert.match(page, /Quedan 2/, 'XS tiene 2 unidades');
});

test('un pedido válido descuenta el stock del talle y usa precios del servidor', async () => {
  const before = t.stockOf(t.variantId(ocean, 'M'));
  const r = await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: t.variantId(ocean, 'M'), qty: 2, price: 1 }] });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.total, 90000, 'el total sale de la base, no de lo que manda el navegador');
  assert.equal(t.stockOf(t.variantId(ocean, 'M')), before - 2);
  assert.match(r.json.code, /^MAR-[A-Z0-9]{6}$/);
  const order = t.db.prepare('SELECT * FROM orders WHERE code = ?').get(r.json.code);
  assert.equal(order.status, 'pendiente');
  const it = t.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  assert.equal(it.length, 1);
  assert.deepEqual([it[0].product_name, it[0].size_name, it[0].quantity, it[0].unit_price, it[0].subtotal], ['Malla Ocean Blue', 'M', 2, 45000, 90000]);
  assert.equal(t.db.prepare('SELECT COUNT(*) c FROM customers').get().c >= 1, true);
});

test('el mensaje de WhatsApp va al +54 299 415-4002 con el pedido completo', async () => {
  const r = await t.post('/api/orders', { ...validCustomer(), items: items('L', 1) });
  assert.equal(r.status, 201);
  const url = new URL(r.json.whatsappUrl);
  assert.equal(url.origin + url.pathname, 'https://wa.me/542994154002');
  const text = url.searchParams.get('text');
  for (const piece of ['NUEVO PEDIDO', 'Nombre: Juan', 'Apellido: Pérez', 'Teléfono: 2991234567', 'Av. Argentina 123',
    'Neuquén, Neuquén', 'CP: 8300', 'Envío a domicilio', '1. Malla Ocean Blue', 'Talle: L', 'Cantidad: 1',
    'Precio: $45.000', 'Subtotal: $45.000', 'TOTAL: $45.000', 'Método de pago:', 'Transferencia bancaria',
    'Comentarios:', 'Entregar por la tarde.', r.json.code]) {
    assert.ok(text.includes(piece), `falta "${piece}" en el mensaje:\n${text}`);
  }
});

test('no se puede comprar más que el stock ni un talle agotado', async () => {
  const xl = t.variantId(ocean, 'XL');
  const l = t.variantId(ocean, 'L');
  const stockL = t.stockOf(l);

  let r = await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: xl, qty: 1 }] });
  assert.equal(r.status, 409);
  assert.equal(r.json.problems[0].code, 'out_of_stock');

  r = await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: l, qty: stockL + 1 }] });
  assert.equal(r.status, 409);
  assert.equal(r.json.problems[0].code, 'insufficient_stock');
  assert.equal(r.json.problems[0].available, stockL);
  assert.equal(t.stockOf(l), stockL, 'el stock no cambia si el pedido falla');
});

test('si una línea falla no se descuenta nada de las otras (atómico)', async () => {
  const s = t.variantId(ocean, 'S');
  const xl = t.variantId(ocean, 'XL');
  const before = t.stockOf(s);
  const r = await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: s, qty: 1 }, { variantId: xl, qty: 1 }] });
  assert.equal(r.status, 409);
  assert.equal(t.stockOf(s), before);
});

test('pedidos simultáneos por la última unidad: solo uno se confirma', async () => {
  const p = t.addProduct('Malla Última', 30000, { M: 1 });
  const v = t.variantId(p, 'M');
  const results = await Promise.all(Array.from({ length: 8 }, () => t.post('/api/orders', { ...validCustomer(), items: [{ variantId: v, qty: 1 }] })));
  const ok = results.filter((r) => r.status === 201).length;
  assert.equal(ok, 1);
  assert.equal(t.stockOf(v), 0);
  assert.equal(t.db.prepare("SELECT COALESCE(SUM(quantity),0) q FROM order_items WHERE variant_id = ?").get(v).q, 1);
});

test('rechaza cantidades y carritos inválidos', async () => {
  const m = t.variantId(ocean, 'M');
  for (const bad of [0, -1, 1.5, '2abc', null, 1e9]) {
    const r = await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: m, qty: bad }] });
    assert.ok([400, 409].includes(r.status), `qty ${bad} -> ${r.status}`);
  }
  assert.equal((await t.post('/api/orders', { ...validCustomer(), items: [] })).status, 400);
  assert.equal((await t.post('/api/orders', { ...validCustomer() })).status, 400);
  assert.equal((await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: 999999, qty: 1 }] })).status, 409);
  const big = t.addProduct('Malla Mucho Stock', 1000, { M: 500 });
  const r = await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: t.variantId(big, 'M'), qty: 11 }] });
  assert.equal(r.status, 409);
  assert.equal(r.json.problems[0].code, 'max_qty');
});

test('el checkout valida los datos del cliente en el servidor', async () => {
  const m = t.variantId(ocean, 'M');
  const cases = {
    firstName: { firstName: '' }, lastName: { lastName: '1' }, phone: { phone: '12' },
    street: { street: '' }, streetNumber: { streetNumber: '' }, city: { city: '' },
    province: { province: 'Narnia' }, postalCode: { postalCode: '83' },
    deliveryMethod: { deliveryMethod: 'dron' }, paymentMethod: { paymentMethod: 'bitcoin' },
  };
  for (const [field, over] of Object.entries(cases)) {
    const r = await t.post('/api/orders', { ...validCustomer(over), items: [{ variantId: m, qty: 1 }] });
    assert.equal(r.status, 422, `${field} debería ser inválido`);
    assert.ok(r.json.fields[field], `falta el error de ${field}: ${JSON.stringify(r.json.fields)}`);
  }
  // Efectivo solo con retiro
  let r = await t.post('/api/orders', { ...validCustomer({ paymentMethod: 'efectivo' }), items: [{ variantId: m, qty: 1 }] });
  assert.equal(r.status, 422);
  // Retiro: no hace falta dirección
  r = await t.post('/api/orders', {
    firstName: 'Ana', lastName: 'Gómez', phone: '299 415 4002', deliveryMethod: 'retiro', paymentMethod: 'efectivo',
    items: [{ variantId: m, qty: 1 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(decodeURIComponent(new URL(r.json.whatsappUrl).searchParams.get('text')), /No aplica \(retiro en persona\)/);
});

test('/api/orders solo acepta JSON del mismo origen', async () => {
  const m = t.variantId(ocean, 'M');
  let res = await fetch(t.base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
  res = await fetch(t.base + '/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ ...validCustomer(), items: [{ variantId: m, qty: 1 }] }),
  });
  assert.equal(res.status, 403);
});

test('cancelar un pedido devuelve el stock y reactivarlo lo vuelve a descontar', async () => {
  const { changeStatus } = require('../src/services/orders');
  const p = t.addProduct('Malla Cancelable', 20000, { S: 4 });
  const v = t.variantId(p, 'S');
  const r = await t.post('/api/orders', { ...validCustomer(), items: [{ variantId: v, qty: 3 }] });
  assert.equal(t.stockOf(v), 1);
  const id = t.db.prepare('SELECT id FROM orders WHERE code = ?').get(r.json.code).id;
  changeStatus(id, 'cancelado');
  assert.equal(t.stockOf(v), 4);
  changeStatus(id, 'cancelado'); // idempotente
  assert.equal(t.stockOf(v), 4);
  changeStatus(id, 'confirmado');
  assert.equal(t.stockOf(v), 1);
  changeStatus(id, 'enviado');
  assert.equal(t.stockOf(v), 1);
});

test('/api/cart/validate ajusta cantidades al stock y quita productos desactivados', async () => {
  const p = t.addProduct('Malla Carrito', 10000, { M: 2, L: 0 });
  const r = await t.post('/api/cart/validate', { items: [{ variantId: t.variantId(p, 'M'), qty: 5 }, { variantId: t.variantId(p, 'L'), qty: 1 }] });
  assert.equal(r.status, 200);
  const m = r.json.items.find((i) => i.size === 'M');
  const l = r.json.items.find((i) => i.size === 'L');
  assert.equal(m.qty, 2);
  assert.equal(m.subtotal, 20000);
  assert.equal(l.maxQty, 0);
  t.products.setFlag(p.id, 'active', false);
  const r2 = await t.post('/api/cart/validate', { items: [{ variantId: t.variantId(p, 'M'), qty: 1 }] });
  assert.deepEqual(r2.json.items, []);
});

test('un producto sin stock se muestra "Sin stock" y los inactivos no son públicos', async () => {
  const p = t.addProduct('Malla Agotada', 10000, { M: 0, L: 0 });
  const html = await (await fetch(`${t.base}/producto/${p.slug}`)).text();
  assert.match(html, /Sin stock/);
  assert.match(html, /Avisame cuando vuelva/);
  t.products.setFlag(p.id, 'active', false);
  assert.equal((await fetch(`${t.base}/producto/${p.slug}`)).status, 404);
  const sitemap = await (await fetch(t.base + '/sitemap.xml')).text();
  assert.ok(!sitemap.includes(p.slug));
  assert.ok(sitemap.includes(ocean.slug));
});

test('SEO: título único, meta description, Open Graph, JSON-LD y robots', async () => {
  const html = await (await fetch(`${t.base}/producto/${ocean.slug}`)).text();
  assert.match(html, /<title>Malla Ocean Blue · MAREA Surfwear<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /<meta property="og:title" content="Malla Ocean Blue/);
  assert.match(html, /<meta property="og:image" content="http/);
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /<h1>Malla Ocean Blue<\/h1>/);
  const robots = await (await fetch(t.base + '/robots.txt')).text();
  assert.match(robots, /Disallow: \/admin/);
});

test('headers de seguridad y página 404', async () => {
  const res = await fetch(t.base + '/');
  assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"));
  assert.equal(res.headers.get('x-powered-by'), null);
  const nf = await fetch(t.base + '/no-existe');
  assert.equal(nf.status, 404);
});

test('filtros del catálogo: casillas de color y talle (varios a la vez), cantidades y tarjeta clickeable', async () => {
  t.addProduct('Malla Filtro Roja', 11111, { S: 2, M: 0 }, { color: 'Rojo' });
  t.addProduct('Malla Filtro Azul', 22222, { M: 3, L: 1 }, { color: 'Azul' });
  t.addProduct('Malla Filtro Negra', 33333, { L: 4 }, { color: 'Negro' });
  const names = async (qs) => {
    const html = await (await fetch(`${t.base}/?${qs}`)).text();
    return [...html.matchAll(/class="card__link" href="\/producto\/[^"]+">([^<]+)</g)].map((m) => m[1]);
  };
  assert.deepEqual(await names('color=Rojo'), ['Malla Filtro Roja']);
  assert.deepEqual((await names('color=Rojo&color=Azul')).sort(), ['Malla Filtro Azul', 'Malla Filtro Roja']);
  assert.deepEqual((await names('color=rojo')), ['Malla Filtro Roja'], 'el color no distingue mayúsculas');
  // Talle: "alguno de", y solo cuenta si hay stock (la roja tiene M agotado)
  assert.deepEqual((await names('talle=M&color=Rojo')), []);
  assert.deepEqual((await names('talle=S&talle=L&color=Rojo&color=Negro')).sort(), ['Malla Filtro Negra', 'Malla Filtro Roja']);
  assert.deepEqual(await names('min=20000&max=25000&color=Azul'), ['Malla Filtro Azul']);

  const html = await (await fetch(t.base + '/')).text();
  assert.match(html, /Filtrar por:/);
  assert.match(html, /name="color" value="Rojo"[^>]*>\s*<span>Rojo <small>\(1\)<\/small>/, 'casilla de color con cantidad');
  assert.match(html, /name="talle" value="L"/);
  assert.ok(!html.includes('data-quick-toggle'), 'ya no existe el botón "+" en las tarjetas');
  assert.match(html, /Ver producto/, 'se conserva el botón Ver producto');
  // valores raros no rompen nada
  assert.equal((await fetch(`${t.base}/?color=%27%3B--&talle[]=x&color=${'a'.repeat(500)}`)).status, 200);
});

test('JavaScript versionado: los import llevan ?v= y el navegador nunca mezcla archivos viejos y nuevos', async () => {
  const html = await (await fetch(t.base + '/')).text();
  const url = /\/js\/app\.js\?v=(\w+)/.exec(html);
  assert.ok(url, 'app.js lleva versión');
  const res = await fetch(t.base + url[0]);
  assert.ok((await res.clone().text()).includes(`from './ui.js?v=${url[1]}'`), 'los import llevan la misma versión');
  assert.match(res.headers.get('cache-control'), /immutable/);
  const bare = await fetch(t.base + '/js/ui.js');
  assert.equal(bare.headers.get('cache-control'), 'no-cache');
  assert.match(await bare.text(), /from '\.\/cart\.js\?v=\w+'/);
  assert.equal((await fetch(t.base + '/js/..%2fconfig.js')).status, 404);
});
