'use strict';
const db = require('../db');
const config = require('../config');

// En Vercel puede haber varias instancias a la vez: la caché vence a los pocos segundos
// para que un cambio hecho desde el panel llegue a todas.
const TTL_MS = 10_000;
let cache = null;
let loadedAt = 0;

async function load() {
  const rows = await db.all('SELECT key, value FROM settings');
  const values = { ...config.storeDefaults };
  for (const r of rows) values[r.key] = r.value;
  cache = values;
  loadedAt = Date.now();
  return cache;
}

/** Todas las configuraciones (defaults del .env + lo guardado desde el admin). */
async function all() {
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  return load();
}

async function get(key) {
  return (await all())[key] ?? '';
}

async function getInt(key, fallback = 0) {
  const n = parseInt(await get(key), 10);
  return Number.isFinite(n) ? n : fallback;
}

async function setMany(values) {
  await db.tx(async (t) => {
    for (const [k, v] of Object.entries(values)) {
      if (k in config.storeDefaults) {
        await t.run(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [k, String(v ?? '')]
        );
      }
    }
  });
  cache = null;
}

function invalidate() {
  cache = null;
}

module.exports = { all, get, getInt, setMany, invalidate };
