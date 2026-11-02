'use strict';
/**
 * Almacén de contadores para express-rate-limit guardado en la base de datos.
 * En Vercel cada petición puede atenderla una instancia distinta: un contador en memoria no sirve
 * para frenar a quien prueba contraseñas o llena de pedidos falsos. Este sí se comparte.
 */
const db = require('../db');

class DbStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const k = this.prefix + key;
    const row = await db.get(`
      INSERT INTO rate_limits (key, hits, reset_at)
      VALUES (?, 1, now() + (?::int * interval '1 millisecond'))
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.hits + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + (?::int * interval '1 millisecond')
                        ELSE rate_limits.reset_at END
      RETURNING hits, reset_at`, [k, this.windowMs, this.windowMs]);
    if (Math.random() < 0.02) {
      db.run('DELETE FROM rate_limits WHERE reset_at < now() - interval \'1 hour\'').catch(() => {});
    }
    return { totalHits: row.hits, resetTime: row.reset_at };
  }

  async decrement(key) {
    await db.run('UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = ?', [this.prefix + key]);
  }

  async resetKey(key) {
    await db.run('DELETE FROM rate_limits WHERE key = ?', [this.prefix + key]);
  }
}

module.exports = { DbStore };
