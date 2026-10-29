'use strict';
const crypto = require('crypto');
const config = require('../config');
const { sessions } = require('../services/auth');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieOptions(expires) {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/admin', expires };
}

function setSessionCookie(res, token, expires) {
  res.cookie(config.session.cookieName, token, cookieOptions(expires));
}

function clearSessionCookie(res) {
  res.clearCookie(config.session.cookieName, cookieOptions());
}

/** Carga la sesión del admin (si existe) en req.admin / req.csrfToken. No bloquea. */
function loadSession(req, res, next) {
  const token = parseCookies(req.headers.cookie)[config.session.cookieName];
  const s = sessions.find(token);
  req.sessionToken = token || null;
  req.admin = s ? s.admin : null;
  req.csrfToken = s ? s.csrf : null;
  res.locals.admin = req.admin;
  res.locals.csrfToken = req.csrfToken;
  next();
}

/** Bloquea el acceso si no hay sesión de administrador. */
function requireAdmin(req, res, next) {
  if (req.admin) return next();
  if (req.method === 'GET') return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
  return res.redirect(303, '/admin/login');
}

/** Verifica el token CSRF en todo POST del panel (campo oculto _csrf o header x-csrf-token). */
function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  const expected = req.csrfToken;
  const ok = typeof sent === 'string' && expected && sent.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).send('Solicitud inválida (token CSRF). Volvé atrás, recargá la página e intentá de nuevo.');
  next();
}

module.exports = { loadSession, requireAdmin, verifyCsrf, setSessionCookie, clearSessionCookie };
