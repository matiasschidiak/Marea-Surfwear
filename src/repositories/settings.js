'use strict';
const { getDb } = require('../db');
const config = require('../config');

let cache = null;

function load() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  cache = { ...config.storeDefaults };
  for (const r of rows) cache[r.key] = r.value;
  return cache;
}

/** Todas las configuraciones (defaults del .env + lo guardado desde el admin). */
function all() {
  return cache || load();
}

function get(key) {
  return all()[key] ?? '';
}

function getInt(key, fallback = 0) {
  const n = parseInt(get(key), 10);
  return Number.isFinite(n) ? n : fallback;
}

function setMany(values) {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(values)) {
      if (k in config.storeDefaults) stmt.run(k, String(v ?? ''));
    }
  })();
  cache = null;
}

function invalidate() {
  cache = null;
}

module.exports = { all, get, getInt, setMany, invalidate };
