'use strict';

const moneyFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** 45000 -> "$45.000" */
function money(value) {
  return '$' + moneyFmt.format(Number(value) || 0);
}

/** "Malla Ocean Blue!" -> "malla-ocean-blue" */
function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Las fechas se guardan en UTC (datetime('now')); se muestran en hora de Argentina. */
function parseDbDate(value) {
  if (!value) return null;
  return new Date(String(value).replace(' ', 'T') + 'Z');
}

function dateTime(value) {
  const d = parseDbDate(value);
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Muestra 2994154002 -> "299 415-4002" (solo para teléfonos de 10 dígitos). */
function phonePretty(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
  return String(raw || '');
}

/** "542994154002" -> "+54 299 415-4002" */
function whatsappPretty(number) {
  const d = String(number || '').replace(/\D/g, '');
  const m = d.match(/^54(9?)(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+54 ${m[1] ? '9 ' : ''}${m[2]} ${m[3]}-${m[4]}`;
  return d ? '+' + d : '';
}

module.exports = { money, slugify, dateTime, parseDbDate, escapeHtml, phonePretty, whatsappPretty };
