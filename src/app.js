'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const { getDb } = require('./db');
const settings = require('./repositories/settings');
const images = require('./services/images');
const whatsapp = require('./services/whatsapp');
const fmt = require('./utils/format');
const constants = require('./constants');

const publicDir = path.join(config.root, 'public');
const assetVersions = new Map();

const jsDir = path.join(publicDir, 'js');

/** Versión de TODO el JavaScript de la tienda: cambia apenas se modifica cualquier archivo de /public/js. */
function jsVersion() {
  let max = 0;
  try {
    for (const f of fs.readdirSync(jsDir)) max = Math.max(max, Math.floor(fs.statSync(path.join(jsDir, f)).mtimeMs));
  } catch { /* sin carpeta */ }
  return max.toString(36);
}
let jsVersionCache = null;
const currentJsVersion = () => (config.isProduction ? (jsVersionCache ||= jsVersion()) : jsVersion());

/** /css/main.css -> /css/main.css?v=<mtime>  (cache largo + invalidación al cambiar el archivo) */
function asset(urlPath) {
  if (urlPath.startsWith('/js/')) return `${urlPath}?v=${currentJsVersion()}`;
  if (!assetVersions.has(urlPath)) {
    let v = '1';
    try { v = Math.floor(fs.statSync(path.join(publicDir, urlPath)).mtimeMs).toString(36); } catch { /* sin archivo */ }
    assetVersions.set(urlPath, v);
  }
  return `${urlPath}?v=${assetVersions.get(urlPath)}`;
}

/** <img> responsive: usa srcset para fotos subidas desde el panel y la ruta directa para archivos estáticos. */
function renderImg(image, { sizes = '100vw', cls = '', loading = 'lazy', priority = false } = {}) {
  const ss = images.srcset(image.url);
  const attrs = [
    cls ? `class="${cls}"` : '',
    `src="${fmt.escapeHtml(image.url)}"`,
    ss ? `srcset="${ss}" sizes="${sizes}"` : '',
    `alt="${fmt.escapeHtml(image.alt || '')}"`,
    'width="800" height="1000"',
    `loading="${priority ? 'eager' : loading}"`,
    priority ? 'fetchpriority="high"' : '',
    'decoding="async"',
  ].filter(Boolean).join(' ');
  return `<img ${attrs}>`;
}

function productImg(product, index = 0, opts = {}) {
  const image = product.images[index];
  if (!image) return '<div class="img-fallback" role="img" aria-label="Sin foto"></div>';
  return renderImg({ url: image.url, alt: image.alt || product.name }, opts);
}

function createApp() {
  getDb(); // abre la base y aplica migraciones pendientes

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('view cache', config.isProduction);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: config.isProduction,
  }));
  app.use(compression());

  // Fotos subidas desde el panel (la carpeta puede estar fuera de /public, p. ej. un disco persistente)
  app.use(config.uploadsUrl, express.static(config.uploadsDir, { maxAge: config.isProduction ? '365d' : 0, immutable: config.isProduction, index: false }));

  // JavaScript: los import entre módulos llevan ?v=<versión>, así el navegador nunca mezcla archivos viejos y nuevos.
  // Con ?v= se guarda un año (cambia solo si cambia el código); sin ?v= se revalida siempre.
  app.get('/js/:file', (req, res, next) => {
    const file = req.params.file;
    if (!/^[\w-]+\.js$/.test(file)) return next();
    fs.readFile(path.join(jsDir, file), 'utf8', (err, code) => {
      if (err) return next();
      const v = currentJsVersion();
      const body = code
        .replace(/(from\s+['"]\.\/[\w-]+\.js)(['"])/g, `$1?v=${v}$2`)
        .replace(/(import\(\s*['"]\.\/[\w-]+\.js)(['"]\s*\))/g, `$1?v=${v}$2`);
      res.type('application/javascript');
      res.setHeader('Cache-Control', req.query.v === v ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.send(body);
    });
  });

  // CSS e imágenes: caché largo (el CSS lleva ?v=mtime). Los módulos JS se importan sin versión: se revalidan en cada visita (304 si no cambiaron).
  app.use(express.static(publicDir, {
    maxAge: config.isProduction ? '30d' : 0,
    etag: true,
    setHeaders(res, filePath) {
      if (/[\\/]js[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'no-cache'); // se revalida con ETag: siempre la versión nueva, 304 si no cambió
    },
  }));

  // Variables disponibles en todas las vistas
  app.use((req, res, next) => {
    const store = settings.all();
    Object.assign(res.locals, {
      store,
      siteUrl: config.siteUrl,
      path: req.path,
      asset,
      srcset: images.srcset,
      money: fmt.money,
      dateTime: fmt.dateTime,
      phonePretty: fmt.phonePretty,
      whatsappPretty: fmt.whatsappPretty,
      statuses: constants.ORDER_STATUSES,
      statusLabel: (s) => (constants.STATUS_BY_VALUE[s] || { label: s }).label,
      deliveryLabel: (v) => (constants.DELIVERY_BY_VALUE[v] || { label: v }).label,
      paymentLabel: (v) => (constants.PAYMENT_BY_VALUE[v] || { label: v }).label,
      waNumber: whatsapp.whatsappNumber(),
      waLink: (text) => whatsapp.buildUrl(text || 'Hola! Quiero hacer una consulta.'),
      limits: config.limits,
      faq: require('./content/faq'),
      /** Enlace de WhatsApp hacia un cliente (teléfonos argentinos de 10 dígitos llevan el prefijo 549). */
      customerWa: (phone, text) => {
        const d = String(phone || '').replace(/\D/g, '');
        const n = d.length === 10 ? `549${d}` : d;
        return `https://wa.me/${n}?text=${encodeURIComponent(text || '')}`;
      },
      icon: (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`,
      img: renderImg,
      productImg,
      jsonLd: (obj) => JSON.stringify(obj).replace(/</g, '\u003c'),
      meta: {},
    });
    next();
  });

  app.use('/api', require('./routes/api'));
  app.use('/admin', require('./routes/admin'));
  app.use('/', require('./routes/public'));

  app.use((req, res) => {
    res.status(404).render('pages/404', {
      meta: { title: 'Página no encontrada', description: '', noindex: true },
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande.' });
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
    res.status(500).render('pages/500', { meta: { title: 'Error', description: '', noindex: true } });
  });

  return app;
}

module.exports = { createApp };
