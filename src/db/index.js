'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db = null;

function open(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  return conn;
}

/** Aplica, en orden, las migraciones .sql que todavía no se corrieron. */
function migrate(conn) {
  conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied = new Set(conn.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const done = [];
  for (const file of files) {
    const version = parseInt(file, 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    conn.transaction(() => {
      conn.exec(sql);
      conn.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, file);
    })();
    done.push(file);
  }
  return done;
}

/** Conexión compartida. Corre migraciones pendientes la primera vez. */
function getDb() {
  if (!db) {
    db = open();
    migrate(db);
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb, open, migrate };
