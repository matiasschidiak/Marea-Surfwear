'use strict';
const express = require('express');
const products = require('../repositories/products');
const ordersRepo = require('../repositories/orders');
const { categories } = require('../repositories/catalog-lookups');
const { toInt } = require('../utils/validation');
const { PROVINCES, DELIVERY_METHODS, PAYMENT_METHODS } = require('../constants');
const { buildUrl } = require('../services/whatsapp');
const config = require('../config');

const router = express.Router();

const stripTags = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function absoluteImage(url) {
  if (!url) return `${config.siteUrl}/img/og-default.jpg`;
  return /^https?:/.test(url) ? url : config.siteUrl + url;
}

/** ?talle=S&talle=M -> ['S','M'] (sin repetidos; máx. 12 valores de hasta 20 caracteres) */
function listParam(value) {
  const arr = Array.isArray(value) ? value : (value ? [value] : []);
  return [...new Set(arr.map((v) => stripTags(v).slice(0, 20)).filter(Boolean))].slice(0, 12);
}

router.get('/', (req, res) => {
  const q = stripTags(req.query.q).slice(0, 60);
  const sizes = listParam(req.query.talle).map((s) => s.toUpperCase());
  const colors = listParam(req.query.color);
  const min = toInt(req.query.min, { min: 0, max: 99999999 });
  const max = toInt(req.query.max, { min: 0, max: 99999999 });
  const sort = Object.hasOwn(products.SORTS, req.query.orden) ? req.query.orden : 'destacados';
  const inStock = req.query.stock === '1';
  const filtered = !!(q || sizes.length || colors.length || min !== null || max !== null || inStock);

  const list = products.listPublic({
    q, sizes, colors, min: min ?? undefined, max: max ?? undefined, sort, inStock,
  });
  const featured = (filtered || sort !== 'destacados') ? [] : products.listPublic({ featuredOnly: true, limit: 4 })
    .filter((p) => !p.soldOut);

  res.render('pages/home', {
    meta: {
      title: 'MAREA Surfwear · Mallas de surf y ropa de playa en Argentina',
      description: 'Mallas de surf pensadas para el agua y la playa. Elegí tu talle, armá tu pedido y confirmalo por WhatsApp. Envíos a todo el país desde Neuquén.',
      image: absoluteImage(list[0] && list[0].images[0] && list[0].images[0].url),
      canonicalPath: '/',
    },
    products: list,
    featured,
    filters: { q, sizes, colors, min, max, sort, inStock, active: filtered },
    facets: products.facets(),
    categories: categories.list({ onlyActive: true }),
  });
});

router.get('/producto/:slug', (req, res, next) => {
  const product = products.findBySlug(String(req.params.slug));
  if (!product) return next();
  const desc = truncate(stripTags(product.shortDescription || product.description), 155);
  res.render('pages/product', {
    meta: {
      title: `${product.name} · MAREA Surfwear`,
      description: desc || `${product.name} - MAREA Surfwear`,
      image: absoluteImage(product.images[0] && product.images[0].url),
      type: 'product',
      canonicalPath: `/producto/${product.slug}`,
      product,
    },
    product,
    related: products.related(product, 4),
  });
});

router.get('/checkout', (req, res) => {
  res.render('pages/checkout', {
    meta: { title: 'Finalizar compra · MAREA Surfwear', description: 'Completá tus datos y confirmá el pedido por WhatsApp.', noindex: true },
    provinces: PROVINCES,
    deliveryMethods: DELIVERY_METHODS,
    paymentMethods: PAYMENT_METHODS,
  });
});

router.get('/pedido/:code', (req, res, next) => {
  const code = String(req.params.code).toUpperCase();
  if (!/^MAR-[A-Z0-9]{6}$/.test(code)) return next();
  const order = ordersRepo.findByCode(code);
  if (!order) return next();
  // No se muestran datos personales: solo código, productos y total.
  res.render('pages/order-done', {
    meta: { title: `Pedido ${order.code} · MAREA Surfwear`, description: '', noindex: true },
    order,
    fallbackWaUrl: buildUrl(`Hola! Hice el pedido ${order.code} en la web y quiero confirmarlo.`),
  });
});

const STATIC_PAGES = [
  { path: '/envios', view: 'pages/shipping', title: 'Envíos y formas de pago', description: 'Cómo enviamos tus mallas a todo el país, plazos, retiro en persona y medios de pago.' },
  { path: '/preguntas-frecuentes', view: 'pages/faq', title: 'Preguntas frecuentes', description: 'Talles, stock, envíos, pagos y cambios: respondemos las dudas más comunes sobre tu compra en MAREA.' },
  { path: '/cambios-y-devoluciones', view: 'pages/returns', title: 'Cambios y devoluciones', description: 'Política de cambios y devoluciones de MAREA Surfwear.' },
  { path: '/terminos-y-condiciones', view: 'pages/terms', title: 'Términos y condiciones', description: 'Términos y condiciones de uso y compra en MAREA Surfwear.' },
  { path: '/contacto', view: 'pages/contact', title: 'Contacto', description: 'Escribinos por WhatsApp o redes sociales. Respondemos consultas sobre talles, stock y pedidos.' },
];
for (const p of STATIC_PAGES) {
  router.get(p.path, (req, res) => {
    res.render(p.view, {
      meta: { title: `${p.title} · MAREA Surfwear`, description: p.description, canonicalPath: p.path },
    });
  });
}

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /checkout',
    'Disallow: /pedido/',
    'Allow: /',
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    '',
  ].join('\n'));
});

router.get('/sitemap.xml', (req, res) => {
  const urls = [
    { loc: '/', priority: '1.0' },
    ...STATIC_PAGES.map((p) => ({ loc: p.path, priority: '0.5' })),
    ...products.allForSitemap().map((p) => ({
      loc: `/producto/${p.slug}`, priority: '0.8', lastmod: p.updated_at.slice(0, 10),
    })),
  ];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${config.siteUrl}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')
    + '\n</urlset>\n';
  res.type('application/xml').send(xml);
});

module.exports = router;
