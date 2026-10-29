'use strict';
const { DELIVERY_BY_VALUE, PAYMENT_BY_VALUE, PROVINCES } = require('../constants');

/** Texto de una sola línea: sin saltos ni caracteres de control, recortado. */
function cleanLine(value, max = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Texto multilínea: conserva saltos de línea pero elimina caracteres de control. */
function cleanText(value, max = 1000) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Entero positivo estricto (rechaza "3.5", "1e3", "", null...). */
function toInt(value, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return null;
  } else if (typeof value === 'string') {
    if (!/^-?\d{1,9}$/.test(value.trim())) return null;
  } else {
    return null;
  }
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;

function validatePhone(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function validatePostalCode(raw) {
  const v = cleanLine(raw, 10).toUpperCase().replace(/\s+/g, '');
  return /^([A-Z]\d{4}[A-Z]{3}|\d{4})$/.test(v) ? v : null;
}

/**
 * Valida los datos del checkout. Devuelve { ok, errors: {campo: mensaje}, value }.
 * Es la validación autoritativa: el frontend solo la replica para dar feedback rápido.
 */
function validateCheckout(body = {}) {
  const errors = {};
  const v = {};

  v.firstName = cleanLine(body.firstName, 60);
  if (v.firstName.length < 2 || !NAME_RE.test(v.firstName)) errors.firstName = 'Ingresá tu nombre.';

  v.lastName = cleanLine(body.lastName, 60);
  if (v.lastName.length < 2 || !NAME_RE.test(v.lastName)) errors.lastName = 'Ingresá tu apellido.';

  v.phone = validatePhone(body.phone);
  if (!v.phone) errors.phone = 'Ingresá un teléfono válido (solo números, con código de área).';

  const delivery = DELIVERY_BY_VALUE[cleanLine(body.deliveryMethod, 20)];
  if (!delivery) errors.deliveryMethod = 'Elegí un método de entrega.';
  v.deliveryMethod = delivery ? delivery.value : '';

  const payment = PAYMENT_BY_VALUE[cleanLine(body.paymentMethod, 20)];
  if (!payment) errors.paymentMethod = 'Elegí un método de pago.';
  v.paymentMethod = payment ? payment.value : '';

  if (delivery && payment && payment.value === 'efectivo' && delivery.value !== 'retiro') {
    errors.paymentMethod = 'El pago en efectivo solo está disponible con retiro en persona.';
  }

  const needsAddress = !!(delivery && delivery.requiresAddress);
  v.street = cleanLine(body.street, 120);
  v.streetNumber = cleanLine(body.streetNumber, 12);
  v.city = cleanLine(body.city, 80);
  v.province = cleanLine(body.province, 60);
  v.postalCode = cleanLine(body.postalCode, 10).toUpperCase().replace(/\s+/g, '');
  v.notes = cleanText(body.notes, 500);

  if (needsAddress) {
    if (v.street.length < 3) errors.street = 'Ingresá la calle.';
    if (!/^[\p{L}\p{N}][\p{L}\p{N}\s./\-]{0,11}$/u.test(v.streetNumber)) errors.streetNumber = 'Ingresá el número (o "S/N").';
    if (v.city.length < 2) errors.city = 'Ingresá la ciudad.';
    if (!PROVINCES.includes(v.province)) errors.province = 'Elegí una provincia.';
    const cp = validatePostalCode(v.postalCode);
    if (!cp) errors.postalCode = 'Código postal inválido (ej: 8300).';
    else v.postalCode = cp;
  } else {
    // Retiro: se ignoran los datos de domicilio aunque lleguen.
    v.street = v.streetNumber = v.city = v.province = v.postalCode = '';
  }

  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

/** Normaliza y valida las líneas del carrito que llegan del cliente. */
function parseCartLines(raw, { maxLines, maxQty }) {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'El carrito está vacío.' };
  if (raw.length > maxLines) return { ok: false, error: 'Demasiados productos en el carrito.' };
  const merged = new Map();
  for (const line of raw) {
    const variantId = toInt(line && line.variantId, { min: 1 });
    const qty = toInt(line && line.qty, { min: 1, max: maxQty * 10 });
    if (variantId === null || qty === null) return { ok: false, error: 'El carrito contiene datos inválidos.' };
    merged.set(variantId, (merged.get(variantId) || 0) + qty);
  }
  return { ok: true, lines: [...merged].map(([variantId, qty]) => ({ variantId, qty })) };
}

module.exports = { cleanLine, cleanText, toInt, validatePhone, validatePostalCode, validateCheckout, parseCartLines };
