'use strict';
const path = require('path');
require('dotenv').config({ quiet: true });

const root = path.resolve(__dirname, '..');
const env = process.env;

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const isProduction = env.NODE_ENV === 'production';

const config = {
  root,
  isProduction,
  port: int(env.PORT, 3000),
  siteUrl: (env.SITE_URL || `http://localhost:${int(env.PORT, 3000)}`).replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',

  dbPath: path.resolve(root, env.DATABASE_PATH || 'data/marea.db'),
  uploadsDir: path.resolve(root, env.UPLOADS_DIR || 'public/uploads'),
  uploadsUrl: '/uploads',

  // Defaults de la tienda. Todos se pueden pisar desde Admin → Configuración (tabla `settings`).
  storeDefaults: {
    brand_name: 'MAREA',
    brand_tagline: 'Surfwear',
    whatsapp_number: env.WHATSAPP_NUMBER || '542994154002',
    contact_email: env.CONTACT_EMAIL || '',
    store_address: env.STORE_ADDRESS || 'Neuquén Capital, Argentina',
    instagram_url: env.INSTAGRAM_URL || '',
    tiktok_url: env.TIKTOK_URL || '',
    facebook_url: env.FACEBOOK_URL || '',
    low_stock_threshold: String(int(env.LOW_STOCK_THRESHOLD, 3)),
    announcement: 'Envíos a todo el país · Pedí por WhatsApp',
  },

  session: {
    cookieName: 'marea_admin',
    ttlHours: int(env.ADMIN_SESSION_HOURS, 12),
  },

  limits: {
    maxQtyPerLine: 10,
    maxLinesPerOrder: 20,
    maxImagesPerProduct: 8,
    maxUploadBytes: 8 * 1024 * 1024,
  },
};

module.exports = config;
