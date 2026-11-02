'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const products = require('../repositories/products');
const { describeLines } = require('../services/cart');
const { createOrder, OrderError } = require('../services/orders');
const { buildOrderUrl } = require('../services/whatsapp');
const { DbStore } = require('../services/rate-limit-store');
const { validateCheckout, parseCartLines } = require('../utils/validation');

const router = express.Router();
const isTest = process.env.NODE_ENV === 'test';

const limiter = (windowMs, max, message, store) => rateLimit({
  windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: () => isTest,
  ...(store ? { store, passOnStoreError: true } : {}),
  handler: (req, res) => res.status(429).json({ error: message }),
});

const readLimiter = limiter(60 * 1000, 120, 'Demasiadas consultas. Esperá un momento.');
// Los pedidos se limitan con un contador en la base (compartido entre todas las instancias de Vercel)
const orderLimiter = limiter(15 * 60 * 1000, 15, 'Hiciste muchos intentos de pedido. Probá de nuevo en unos minutos.', new DbStore('orders:'));

// Solo JSON: un formulario de otro sitio no puede enviar este tipo de contenido sin CORS.
router.use(express.json({ limit: '30kb' }));
router.use((req, res, next) => {
  if (req.method === 'POST' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json.' });
  }
  const origin = req.headers.origin;
  if (req.method === 'POST' && origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch { ok = false; }
    if (!ok) return res.status(403).json({ error: 'Origen no permitido.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/** Estado real (precio/stock) del carrito del navegador. */
router.post('/cart/validate', readLimiter, async (req, res) => {
  const parsed = parseCartLines(req.body && req.body.items, {
    maxLines: config.limits.maxLinesPerOrder, maxQty: config.limits.maxQtyPerLine,
  });
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  res.json(await describeLines(parsed.lines));
});

/** Stock por talle de un producto (para refrescar la ficha sin recargar). */
router.get('/products/:slug/stock', readLimiter, async (req, res) => {
  const p = await products.findBySlug(String(req.params.slug));
  if (!p) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json({
    soldOut: p.soldOut,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, stock: v.stock, soldOut: v.stock === 0 })),
  });
});

/**
 * Crea el pedido: valida todo en el servidor, descuenta stock por talle y devuelve
 * el enlace de WhatsApp con el mensaje armado desde lo guardado en la base.
 */
router.post('/orders', orderLimiter, async (req, res) => {
  const body = req.body || {};
  const check = validateCheckout(body);
  if (!check.ok) return res.status(422).json({ error: 'Revisá los datos marcados.', fields: check.errors });

  const parsed = parseCartLines(body.items, {
    maxLines: config.limits.maxLinesPerOrder, maxQty: config.limits.maxQtyPerLine,
  });
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const order = await createOrder(check.value, parsed.lines);
    res.status(201).json({
      code: order.code,
      total: order.total,
      whatsappUrl: await buildOrderUrl(order),
      redirect: `/pedido/${order.code}`,
    });
  } catch (err) {
    if (err instanceof OrderError) {
      return res.status(err.status).json({ error: err.message, problems: err.problems });
    }
    throw err;
  }
});

router.use((req, res) => res.status(404).json({ error: 'No encontrado.' }));

module.exports = router;
