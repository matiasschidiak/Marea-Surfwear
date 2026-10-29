'use strict';
const settings = require('../repositories/settings');
const { money } = require('../utils/format');
const { DELIVERY_BY_VALUE, PAYMENT_BY_VALUE } = require('../constants');

/** Arma el texto del pedido, con el formato acordado. Siempre a partir de lo guardado en la base. */
function buildOrderMessage(order) {
  const delivery = DELIVERY_BY_VALUE[order.delivery_method];
  const payment = PAYMENT_BY_VALUE[order.payment_method];
  const needsAddress = !!(delivery && delivery.requiresAddress);

  const lines = [];
  lines.push('NUEVO PEDIDO');
  lines.push(`Código: ${order.code}`);
  lines.push('');
  lines.push('Cliente:');
  lines.push(`Nombre: ${order.customer_first_name}`);
  lines.push(`Apellido: ${order.customer_last_name}`);
  lines.push(`Teléfono: ${order.customer_phone}`);
  lines.push('');
  lines.push('Dirección:');
  if (needsAddress) {
    lines.push(`${order.ship_street} ${order.ship_number}`);
    lines.push(`${order.ship_city}, ${order.ship_province}`);
    lines.push(`CP: ${order.ship_postal_code}`);
  } else {
    lines.push('No aplica (retiro en persona)');
  }
  lines.push('');
  lines.push('Entrega:');
  lines.push(delivery ? delivery.label : order.delivery_method);
  lines.push('');
  lines.push('Productos:');
  order.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.product_name}`);
    lines.push(`Talle: ${it.size_name}`);
    lines.push(`Cantidad: ${it.quantity}`);
    lines.push(`Precio: ${money(it.unit_price)}`);
    lines.push(`Subtotal: ${money(it.subtotal)}`);
  });
  lines.push('');
  lines.push(`TOTAL: ${money(order.total)}`);
  lines.push('');
  lines.push('Método de pago:');
  lines.push(payment ? payment.label : order.payment_method);
  if (order.ship_notes) {
    lines.push('');
    lines.push('Comentarios:');
    lines.push(order.ship_notes);
  }
  return lines.join('\n');
}

function whatsappNumber() {
  return String(settings.get('whatsapp_number')).replace(/\D/g, '');
}

function buildUrl(text, number = whatsappNumber()) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function buildOrderUrl(order) {
  return buildUrl(buildOrderMessage(order));
}

module.exports = { buildOrderMessage, buildOrderUrl, buildUrl, whatsappNumber };
