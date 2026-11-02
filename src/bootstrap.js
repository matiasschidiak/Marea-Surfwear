'use strict';
/**
 * Deja la base lista para usar. Se ejecuta una sola vez por proceso (en Vercel: una vez por instancia,
 * al recibir la primera visita) y es seguro repetirlo:
 *   1. aplica las migraciones pendientes,
 *   2. crea la categoría "Mallas" y los talles básicos si faltan,
 *   3. crea el administrador inicial si no hay ninguno y están ADMIN_EMAIL y ADMIN_PASSWORD,
 *   4. en tu computadora: si hay una base SQLite vieja (data/marea.db) y la nueva está vacía, la importa.
 */
const fs = require('fs');
const db = require('./db');
const config = require('./config');
const auth = require('./services/auth');
const { categories, sizes } = require('./repositories/catalog-lookups');

let promise = null;

async function seedBase() {
  const { c } = await db.get('SELECT COUNT(*)::int AS c FROM categories');
  if (c === 0) await categories.findOrCreate('Mallas');
  const { n } = await db.get('SELECT COUNT(*)::int AS n FROM sizes');
  if (n === 0) {
    for (const s of ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ÚNICO']) await sizes.findOrCreate(s);
  }
}

async function ensureAdminFromEnv() {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if ((await auth.admins.count()) > 0) return;
  if (!email || !password) return;
  const problem = auth.validatePasswordStrength(password);
  if (problem) {
    console.error(`No se creó el administrador inicial: ${problem}`);
    return;
  }
  await auth.admins.create({ email, name: 'Administrador', password });
  console.log(`Administrador inicial creado: ${email.toLowerCase()}`);
}

async function maybeImportLegacy() {
  if (config.databaseUrl || config.onVercel || config.pgliteDir === 'memory://') return;
  if (!fs.existsSync(config.legacySqlitePath)) return;
  const row = await db.get(`SELECT (SELECT COUNT(*)::int FROM products) AS p, (SELECT COUNT(*)::int FROM admins) AS a,
                                   (SELECT COUNT(*)::int FROM orders) AS o`);
  if (row.p || row.a || row.o) return;
  try {
    const { importFromSqlite } = require('./db/import-sqlite');
    console.log(`Se encontró la base anterior (${config.legacySqlitePath}). Importando tus productos y pedidos...`);
    const r = await importFromSqlite({ log: () => {} });
    if (!r.skipped) console.log(`Importación lista: ${r.products} productos, ${r.orders} pedidos.`);
  } catch (err) {
    console.warn(`No se pudo importar la base anterior: ${err.message}`);
  }
}

function ensureReady() {
  if (!promise) {
    promise = (async () => {
      await db.init();
      await seedBase();
      await ensureAdminFromEnv();
      await maybeImportLegacy();
    })();
    promise.catch(() => { promise = null; });
  }
  return promise;
}

module.exports = { ensureReady };
