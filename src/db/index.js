'use strict';
/**
 * Acceso a PostgreSQL. Dos motores con la misma interfaz:
 *  - Supabase / cualquier Postgres  -> si hay DATABASE_URL (paquete `pg`)
 *  - PGlite (Postgres embebido)      -> si no hay DATABASE_URL: desarrollo local y pruebas
 *
 * Uso:   const db = require('../db');
 *        const rows = await db.all('SELECT * FROM products WHERE price > ?', [1000]);
 *        const one  = await db.get('SELECT * FROM products WHERE id = ?', [id]);
 *        const info = await db.run('UPDATE products SET active = ? WHERE id = ?', [1, id]);  // { changes, rows }
 *        await db.tx(async (t) => { await t.run(...); const x = await t.get(...); });
 *
 * Los parámetros se escriben con `?` (se convierten a $1, $2...). Todo es asíncrono.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_LOCK = 727274; // número cualquiera para el candado de migraciones

let driver = null;
let initPromise = null;

/** "a = ? AND b = ?" -> "a = $1 AND b = $2" */
function toPg(text) {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

// --- Motor 1: Postgres remoto (Supabase) ----------------------------------------------------------
function createPg(connectionString) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, (v) => parseInt(v, 10));   // bigint (COUNT, SUM) -> número
  types.setTypeParser(1700, (v) => parseFloat(v));   // numeric -> número

  const url = new URL(connectionString);
  const sslmode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const pool = new Pool({
    connectionString: url.toString(),
    max: config.pgPoolMax,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal || sslmode === 'disable' ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (err) => console.error('[db] error en conexión inactiva:', err.message));
  if (config.onVercel) {
    // Vercel "congela" la función entre visitas: esto cierra las conexiones inactivas antes de congelarla
    try { require('@vercel/functions').attachDatabasePool(pool); } catch (err) { console.warn('[db] attachDatabasePool:', err.message); }
  }

  const shape = (r) => ({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length });
  return {
    kind: 'pg',
    async query(text, params = []) {
      let client;
      try {
        client = await pool.connect();
      } catch {
        client = await pool.connect(); // un único reintento si no se pudo conectar (todavía no se envió nada)
      }
      try {
        return shape(await client.query(text, params));
      } finally {
        client.release();
      }
    },
    exec: (sql) => pool.query(sql).then(() => undefined),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (text, params = []) => client.query(text, params).then(shape),
          exec: (sql) => client.query(sql).then(() => undefined),
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* la conexión ya estaba rota */ }
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// --- Motor 2: PGlite (Postgres embebido, solo desarrollo y pruebas) ---------------------------------
function createPglite(dir) {
  // El nombre va en una variable para que Vercel no empaquete este módulo (solo se usa en local).
  const moduleName = '@electric-sql/pglite';
  const { PGlite, types } = require(moduleName);
  if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir, { parsers: { [types.INT8]: (v) => parseInt(v, 10) } });

  const shape = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
  return {
    kind: 'pglite',
    query: async (text, params = []) => shape(await db.query(text, params)),
    exec: async (sql) => { await db.exec(sql); },
    tx: (fn) => db.transaction((t) => fn({
      query: async (text, params = []) => shape(await t.query(text, params)),
      exec: async (sql) => { await t.exec(sql); },
    })),
    close: () => db.close(),
  };
}

function createDriver() {
  if (config.databaseUrl) return createPg(config.databaseUrl);
  if (config.onVercel) {
    throw new Error('Falta la variable DATABASE_URL (cadena de conexión de Supabase). Cargala en Vercel → Settings → Environment Variables.');
  }
  return createPglite(config.pgliteDir);
}

/** Aplica, en orden y una sola vez, las migraciones .sql pendientes. Seguro con varias instancias a la vez. */
async function migrate() {
  await driver.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const done = [];
  for (const file of files) {
    const version = parseInt(file, 10);
    await driver.tx(async (t) => {
      await t.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`);
      const applied = await t.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (applied.rows.length) return;
      await t.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await t.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, file]);
      done.push(file);
    });
  }
  return done;
}

/** Abre la conexión y migra el esquema (una sola vez por proceso). Devuelve las migraciones aplicadas. */
function init() {
  if (!initPromise) {
    initPromise = (async () => {
      driver = createDriver();
      return migrate();
    })();
    initPromise.catch(() => { initPromise = null; driver = null; }); // permite reintentar
  }
  return initPromise;
}

const handle = (q) => ({
  async all(text, params = []) { return (await q.query(toPg(text), params)).rows; },
  async get(text, params = []) { return (await q.query(toPg(text), params)).rows[0]; },
  async run(text, params = []) {
    const r = await q.query(toPg(text), params);
    return { changes: r.rowCount, rows: r.rows };
  },
  exec: (sql) => q.exec(sql),
});

const root = {
  async all(text, params) { await init(); return handle(driver).all(text, params); },
  async get(text, params) { await init(); return handle(driver).get(text, params); },
  async run(text, params) { await init(); return handle(driver).run(text, params); },
  async exec(sql) { await init(); return driver.exec(sql); },
  /** Transacción: si `fn` lanza un error se deshace todo. `t` tiene all/get/run/exec. */
  async tx(fn) { await init(); return driver.tx((t) => fn(handle(t))); },
  init,
  kind: () => (driver ? driver.kind : null),
  async close() {
    const d = driver;
    driver = null;
    initPromise = null;
    if (d) await d.close();
  },
};

module.exports = root;
