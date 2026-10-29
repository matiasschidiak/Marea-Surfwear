'use strict';
const crypto = require('crypto');
const { getDb } = require('../db');
const config = require('../config');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Hash con scrypt (incluido en Node, sin dependencias). Formato: scrypt$salt$hash */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}

// Hash "falso" para que el tiempo de respuesta no revele si el email existe.
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Usá letras y números en la contraseña.';
  return null;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const admins = {
  findByEmail(email) {
    return getDb().prepare('SELECT * FROM admins WHERE email = ? COLLATE NOCASE').get(String(email || '').trim());
  },
  create({ email, name, password }) {
    const err = validatePasswordStrength(password);
    if (err) throw new Error(err);
    const info = getDb().prepare('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)')
      .run(String(email).trim().toLowerCase(), name || '', hashPassword(password));
    return Number(info.lastInsertRowid);
  },
  setPassword(id, password) {
    const err = validatePasswordStrength(password);
    if (err) throw new Error(err);
    getDb().prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
    getDb().prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(id);
  },
  count() {
    return getDb().prepare('SELECT COUNT(*) c FROM admins').get().c;
  },
};

/** Devuelve el admin si las credenciales son correctas; si no, null. */
function authenticate(email, password) {
  const admin = admins.findByEmail(email);
  const ok = verifyPassword(String(password || ''), admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !admin.active || !ok) return null;
  getDb().prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
  return admin;
}

const sessions = {
  create(adminId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const csrf = crypto.randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + config.session.ttlHours * 3600 * 1000);
    getDb().prepare('INSERT INTO admin_sessions (token_hash, admin_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), adminId, csrf, expires.toISOString());
    getDb().prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(new Date().toISOString());
    return { token, expires };
  },
  find(token) {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const row = getDb().prepare(`
      SELECT s.csrf_token, s.expires_at, a.id AS admin_id, a.email, a.name, a.active
      FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash = ?`).get(sha256(token));
    if (!row || !row.active || row.expires_at < new Date().toISOString()) return null;
    return { csrf: row.csrf_token, admin: { id: row.admin_id, email: row.email, name: row.name } };
  },
  destroy(token) {
    if (token) getDb().prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
  },
};

module.exports = { hashPassword, verifyPassword, validatePasswordStrength, authenticate, admins, sessions };
