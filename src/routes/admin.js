'use strict';
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const products = require('../repositories/products');
const ordersRepo = require('../repositories/orders');
const settings = require('../repositories/settings');
const { sizes, categories } = require('../repositories/catalog-lookups');
const images = require('../services/images');
const auth = require('../services/auth');
const { changeStatus, updateAdminNotes, OrderError } = require('../services/orders');
const { STATUS_BY_VALUE } = require('../constants');
const { cleanLine, cleanText, toInt, validatePhone } = require('../utils/validation');
const { loadSession, requireAdmin, verifyCsrf, setSessionCookie, clearSessionCookie } = require('../middleware/admin-auth');

const router = express.Router();
const isTest = process.env.NODE_ENV === 'test';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxUploadBytes, files: config.limits.maxImagesPerProduct, fields: 120 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => isTest,
  handler: (req, res) => res.status(429).render('admin/login', {
    title: 'Ingresar', error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
    email: '', next: '/admin', loginCsrf: '',
  }),
});

// ---- Middleware base del panel -------------------------------------------------------------------
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.locals.meta = { title: 'Panel', description: '', noindex: true };
  res.locals.adminNav = req.path;
  next();
});
router.use(express.urlencoded({ extended: false, limit: '200kb' }));
router.use(loadSession);

// Mensajes "flash" (se guardan en una cookie corta y se muestran una sola vez)
router.use((req, res, next) => {
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('marea_flash='));
  res.locals.flash = null;
  if (raw) {
    try { res.locals.flash = JSON.parse(decodeURIComponent(raw.slice('marea_flash='.length))); } catch { /* ignorar */ }
    res.clearCookie('marea_flash', { path: '/admin' });
  }
  next();
});
function flash(res, type, text) {
  res.cookie('marea_flash', encodeURIComponent(JSON.stringify({ type, text })),
    { path: '/admin', httpOnly: true, sameSite: 'lax', secure: config.isProduction, maxAge: 60 * 1000 });
}

const safeNext = (n) => (typeof n === 'string' && /^\/admin(\/[\w\-/?=&%.]*)?$/.test(n) ? n : '/admin');

// ---- Login / logout -------------------------------------------------------------------------------
const LOGIN_COOKIE = 'marea_login';
function issueLoginToken(res) {
  const t = crypto.randomBytes(24).toString('base64url');
  res.cookie(LOGIN_COOKIE, t, { path: '/admin', httpOnly: true, sameSite: 'strict', secure: config.isProduction, maxAge: 30 * 60 * 1000 });
  return t;
}
const loginCookie = (req) => (req.headers.cookie || '').split(';').map((s) => s.trim())
  .find((s) => s.startsWith(LOGIN_COOKIE + '='))?.slice(LOGIN_COOKIE.length + 1) || '';

router.get('/login', (req, res) => {
  if (req.admin) return res.redirect('/admin');
  res.render('admin/login', {
    title: 'Ingresar', error: null, email: '', next: safeNext(req.query.next), loginCsrf: issueLoginToken(res),
  });
});

router.post('/login', loginLimiter, (req, res) => {
  const email = cleanLine(req.body.email, 120);
  const sent = String(req.body._lcsrf || '');
  const have = loginCookie(req);
  const tokenOk = sent && have && sent.length === have.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(have));
  const fail = (error, status = 401) => res.status(status).render('admin/login', {
    title: 'Ingresar', error, email, next: safeNext(req.body.next), loginCsrf: issueLoginToken(res),
  });
  if (!tokenOk) return fail('La página venció. Intentá de nuevo.', 403);
  const admin = auth.authenticate(email, String(req.body.password || '').slice(0, 200));
  if (!admin) return fail('Email o contraseña incorrectos.');
  const { token, expires } = auth.sessions.create(admin.id);
  setSessionCookie(res, token, expires);
  res.clearCookie(LOGIN_COOKIE, { path: '/admin' });
  res.redirect(safeNext(req.body.next));
});

router.post('/logout', requireAdmin, verifyCsrf, (req, res) => {
  auth.sessions.destroy(req.sessionToken);
  clearSessionCookie(res);
  res.redirect('/admin/login');
});

// ---- Todo lo que sigue exige sesión de administrador --------------------------------------------
router.use(requireAdmin);

router.get('/', (req, res) => {
  const stats = ordersRepo.stats();
  const counts = products.countAll();
  res.render('admin/dashboard', {
    title: 'Resumen',
    stats: { ...stats, products: counts },
    lowStock: products.lowStockVariants(),
    recent: ordersRepo.list({ limit: 6 }).rows,
    threshold: settings.getInt('low_stock_threshold', 3),
  });
});

// ---- Productos ------------------------------------------------------------------------------------
router.get('/productos', (req, res) => {
  res.render('admin/products', { title: 'Productos', list: products.listAdmin() });
});

function sizeRowsFor(product, submitted) {
  const all = sizes.list();
  const byId = new Map((product ? product.variants : []).map((v) => [v.size_id, v]));
  return all.map((s) => {
    if (submitted) {
      const offered = submitted[`offer_${s.id}`] === '1';
      return { id: s.id, name: s.name, offered, stock: submitted[`stock_${s.id}`] ?? '' };
    }
    const v = byId.get(s.id);
    return { id: s.id, name: s.name, offered: !!v, stock: v ? v.stock : '' };
  });
}

function renderForm(res, { product = null, submitted = null, errors = {}, status = 200 }) {
  const form = submitted
    ? {
      name: submitted.name || '', shortDescription: submitted.shortDescription || '', description: submitted.description || '',
      material: submitted.material || '', color: submitted.color || '', features: submitted.features || '', price: submitted.price || '',
      comparePrice: submitted.comparePrice || '', categoryId: submitted.categoryId || '',
      active: submitted.active === '1', featured: submitted.featured === '1', newCategory: submitted.newCategory || '',
      newSizes: submitted.newSizes || '',
    }
    : product
      ? {
        name: product.name, shortDescription: product.shortDescription, description: product.description,
        material: product.material, features: product.features.join('\n'), price: product.price,
        comparePrice: product.comparePrice ?? '', categoryId: product.categoryId ?? '',
        active: product.active, featured: product.featured, newCategory: '', newSizes: '',
      }
      : {
        name: '', shortDescription: '', description: '', material: '', color: '', features: '', price: '', comparePrice: '',
        categoryId: (categories.list()[0] || {}).id || '', active: true, featured: false, newCategory: '', newSizes: '',
      };
  res.status(status).render('admin/product-form', {
    title: product ? `Editar ${product.name}` : 'Nuevo producto',
    product, form, errors,
    sizeRows: sizeRowsFor(product, submitted),
    categories: categories.list(),
    colorSuggestions: products.allColors(),
  });
}

router.get('/productos/nuevo', (req, res) => renderForm(res, {}));

router.get('/productos/:id', (req, res, next) => {
  const id = toInt(req.params.id, { min: 1 });
  const product = id && products.findById(id);
  if (!product) return next();
  renderForm(res, { product });
});

/** Valida el formulario de producto. Devuelve { errors, data, variants }. */
function parseProductForm(body) {
  const errors = {};
  const data = {};
  data.name = cleanLine(body.name, 120);
  if (data.name.length < 2) errors.name = 'Ingresá el nombre del producto.';
  data.shortDescription = cleanLine(body.shortDescription, 200);
  data.description = cleanText(body.description, 4000);
  data.material = cleanLine(body.material, 200);
  data.color = cleanLine(body.color, 30).replace(/^./, (c) => c.toUpperCase());
  data.features = cleanText(body.features, 3000).split('\n').map((l) => cleanLine(l, 160)).filter(Boolean).slice(0, 15);

  data.price = toInt(body.price, { min: 0, max: 99999999 });
  if (data.price === null) errors.price = 'Ingresá un precio válido (número entero, en pesos).';
  const cmp = String(body.comparePrice || '').trim();
  data.comparePrice = null;
  if (cmp) {
    data.comparePrice = toInt(cmp, { min: 0, max: 99999999 });
    if (data.comparePrice === null) errors.comparePrice = 'Precio anterior inválido.';
    else if (data.price !== null && data.comparePrice <= data.price) errors.comparePrice = 'El precio anterior debe ser mayor al actual.';
  }
  data.active = body.active === '1';
  data.featured = body.featured === '1';

  const newCat = cleanLine(body.newCategory, 60);
  if (newCat) {
    data.categoryId = (categories.findOrCreate(newCat) || {}).id || null;
  } else {
    const cid = toInt(body.categoryId, { min: 1 });
    data.categoryId = cid && categories.findById(cid) ? cid : null;
  }

  const variants = [];
  for (const s of sizes.list()) {
    if (body[`offer_${s.id}`] !== '1') continue;
    const stock = toInt(String(body[`stock_${s.id}`] ?? '').trim() === '' ? 0 : body[`stock_${s.id}`], { min: 0, max: 100000 });
    if (stock === null) errors[`stock_${s.id}`] = `Stock inválido para el talle ${s.name}.`;
    else variants.push({ sizeId: s.id, stock });
  }
  const extra = cleanLine(body.newSizes, 80).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  return { errors, data, variants, extraSizes: extra };
}

async function applyImages(productId, productName, body, files) {
  const problems = [];
  const existing = (products.findById(productId) || { images: [] }).images;
  for (const img of existing) {
    if (body[`img_delete_${img.id}`] === '1') {
      const url = products.removeImage(img.id, productId);
      images.deleteFiles(url);
    } else {
      const order = toInt(body[`img_order_${img.id}`], { min: 0, max: 999 });
      products.updateImage(img.id, productId, {
        alt: cleanLine(body[`img_alt_${img.id}`], 160), sortOrder: order ?? img.sort_order,
      });
    }
  }
  let count = products.countImages(productId);
  for (const file of files || []) {
    if (count >= config.limits.maxImagesPerProduct) { problems.push('Se alcanzó el máximo de imágenes por producto.'); break; }
    try {
      const url = await images.saveUpload(file.buffer);
      products.addImage(productId, url, productName);
      count++;
    } catch (err) {
      problems.push(`${file.originalname}: ${err.message}`);
    }
  }
  return problems;
}

function handleUpload(req, res, next) {
  upload.array('images', config.limits.maxImagesPerProduct)(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Una de las imágenes supera los 8 MB.' : 'No se pudieron procesar los archivos.';
    flash(res, 'error', msg);
    res.redirect(req.originalUrl);
  });
}

async function saveProduct(req, res, id) {
  const { errors, data, variants, extraSizes } = parseProductForm(req.body);
  const product = id ? products.findById(id) : null;
  if (Object.keys(errors).length) {
    return renderForm(res, { product, submitted: req.body, errors, status: 422 });
  }
  for (const name of extraSizes) {
    const s = sizes.findOrCreate(name);
    if (s && !variants.some((v) => v.sizeId === s.id)) variants.push({ sizeId: s.id, stock: 0 });
  }
  const productId = products.save(data, id);
  products.setVariants(productId, variants);
  const problems = await applyImages(productId, data.name, req.body, req.files);
  flash(res, problems.length ? 'error' : 'ok',
    problems.length ? `Producto guardado, pero: ${problems.join(' ')}` : 'Producto guardado correctamente.');
  res.redirect(`/admin/productos/${productId}`);
}

router.post('/productos', handleUpload, verifyCsrf, (req, res) => saveProduct(req, res, null));

router.post('/productos/:id', handleUpload, verifyCsrf, (req, res, next) => {
  const id = toInt(req.params.id, { min: 1 });
  if (!id || !products.findById(id)) return next();
  return saveProduct(req, res, id);
});

router.post('/productos/:id/toggle', verifyCsrf, (req, res, next) => {
  const id = toInt(req.params.id, { min: 1 });
  const field = req.body.field;
  if (!id || !products.findById(id) || !['active', 'featured'].includes(field)) return next();
  products.setFlag(id, field, req.body.value === '1');
  flash(res, 'ok', field === 'active'
    ? (req.body.value === '1' ? 'Producto activado: ya se ve en la tienda.' : 'Producto desactivado: ya no se muestra en la tienda.')
    : (req.body.value === '1' ? 'Producto marcado como destacado.' : 'Producto quitado de destacados.'));
  res.redirect('/admin/productos');
});

router.post('/productos/:id/eliminar', verifyCsrf, (req, res, next) => {
  const id = toInt(req.params.id, { min: 1 });
  if (!id || !products.findById(id)) return next();
  for (const url of products.remove(id)) images.deleteFiles(url);
  flash(res, 'ok', 'Producto eliminado. Los pedidos anteriores conservan su detalle.');
  res.redirect('/admin/productos');
});

// ---- Stock rápido ---------------------------------------------------------------------------------
router.get('/stock', (req, res) => {
  res.render('admin/stock', {
    title: 'Stock', list: products.listAdmin(), threshold: settings.getInt('low_stock_threshold', 3),
  });
});

router.post('/stock', verifyCsrf, (req, res) => {
  let changed = 0;
  const bad = [];
  const current = new Map();
  for (const p of products.listAdmin()) for (const v of p.variants) current.set(v.id, v.stock);
  for (const [key, raw] of Object.entries(req.body)) {
    const m = /^stock_(\d+)$/.exec(key);
    if (!m) continue;
    const variantId = Number(m[1]);
    if (!current.has(variantId)) continue;
    const stock = toInt(String(raw).trim(), { min: 0, max: 100000 });
    if (stock === null) { bad.push(variantId); continue; }
    if (stock !== current.get(variantId)) { products.updateVariantStock(variantId, stock); changed++; }
  }
  if (bad.length) flash(res, 'error', 'Algunos valores no eran válidos y se ignoraron (usá números enteros, 0 o más).');
  else flash(res, 'ok', changed ? `Stock actualizado (${changed} cambio${changed === 1 ? '' : 's'}).` : 'No había cambios para guardar.');
  res.redirect('/admin/stock');
});

// ---- Pedidos --------------------------------------------------------------------------------------
router.get('/pedidos', (req, res) => {
  const status = STATUS_BY_VALUE[req.query.estado] ? req.query.estado : '';
  const q = cleanLine(req.query.q, 60);
  const page = toInt(req.query.p, { min: 1, max: 10000 }) || 1;
  const pageSize = 25;
  const { rows, total } = ordersRepo.list({ status, q, limit: pageSize, offset: (page - 1) * pageSize });
  res.render('admin/orders', {
    title: 'Pedidos', rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)),
    status, q, counts: ordersRepo.countsByStatus(),
  });
});

router.get('/pedidos/:id', (req, res, next) => {
  const id = toInt(req.params.id, { min: 1 });
  const order = id && ordersRepo.findById(id);
  if (!order) return next();
  res.render('admin/order', { title: `Pedido ${order.code}`, order, history: ordersRepo.history(order.id) });
});

router.post('/pedidos/:id/estado', verifyCsrf, (req, res, next) => {
  const id = toInt(req.params.id, { min: 1 });
  if (!id || !ordersRepo.findById(id)) return next();
  try {
    changeStatus(id, String(req.body.status), req.admin.id);
    flash(res, 'ok', 'Estado actualizado.');
  } catch (err) {
    if (!(err instanceof OrderError)) throw err;
    flash(res, 'error', err.message);
  }
  res.redirect(`/admin/pedidos/${id}`);
});

router.post('/pedidos/:id/notas', verifyCsrf, (req, res, next) => {
  const id = toInt(req.params.id, { min: 1 });
  if (!id || !ordersRepo.findById(id)) return next();
  updateAdminNotes(id, cleanText(req.body.notes, 1000));
  flash(res, 'ok', 'Notas guardadas.');
  res.redirect(`/admin/pedidos/${id}`);
});

// ---- Configuración de la tienda -------------------------------------------------------------------
router.get('/configuracion', (req, res) => {
  res.render('admin/settings', { title: 'Configuración', values: settings.all(), errors: {} });
});

router.post('/configuracion', verifyCsrf, (req, res) => {
  const b = req.body;
  const errors = {};
  const values = {
    whatsapp_number: String(b.whatsapp_number || '').replace(/\D/g, ''),
    contact_email: cleanLine(b.contact_email, 120),
    store_address: cleanLine(b.store_address, 160),
    instagram_url: cleanLine(b.instagram_url, 200),
    tiktok_url: cleanLine(b.tiktok_url, 200),
    facebook_url: cleanLine(b.facebook_url, 200),
    announcement: cleanLine(b.announcement, 140),
    low_stock_threshold: String(toInt(b.low_stock_threshold, { min: 0, max: 100 }) ?? ''),
  };
  if (!validatePhone(values.whatsapp_number)) errors.whatsapp_number = 'Ingresá el número con código de país, solo dígitos (ej: 542994154002).';
  if (values.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email)) errors.contact_email = 'Email inválido.';
  for (const k of ['instagram_url', 'tiktok_url', 'facebook_url']) {
    if (values[k] && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(values[k])) errors[k] = 'Ingresá una URL completa que empiece con https://';
  }
  if (values.low_stock_threshold === '') errors.low_stock_threshold = 'Ingresá un número entre 0 y 100.';
  if (Object.keys(errors).length) {
    return res.status(422).render('admin/settings', { title: 'Configuración', values: { ...settings.all(), ...values }, errors });
  }
  settings.setMany(values);
  flash(res, 'ok', 'Configuración guardada.');
  res.redirect('/admin/configuracion');
});

// ---- Cuenta ---------------------------------------------------------------------------------------
router.get('/cuenta', (req, res) => res.render('admin/account', { title: 'Mi cuenta', error: null }));

router.post('/cuenta', verifyCsrf, (req, res) => {
  const admin = auth.admins.findByEmail(req.admin.email);
  const fail = (error) => res.status(422).render('admin/account', { title: 'Mi cuenta', error });
  if (!auth.verifyPassword(String(req.body.current || ''), admin.password_hash)) return fail('La contraseña actual no es correcta.');
  if (req.body.password !== req.body.confirm) return fail('Las contraseñas nuevas no coinciden.');
  try {
    auth.admins.setPassword(admin.id, String(req.body.password));
  } catch (err) {
    return fail(err.message);
  }
  const { token, expires } = auth.sessions.create(admin.id); // setPassword cierra todas las sesiones
  setSessionCookie(res, token, expires);
  flash(res, 'ok', 'Contraseña actualizada.');
  res.redirect('/admin/cuenta');
});

router.use((req, res) => {
  res.status(404).render('pages/404', { meta: { title: 'No encontrado', description: '', noindex: true } });
});

module.exports = router;
