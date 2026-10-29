'use strict';

const ORDER_STATUSES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'preparando', label: 'Preparando' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'cancelado', label: 'Cancelado' },
];

// requiresAddress: si es false, no se piden los datos de domicilio.
const DELIVERY_METHODS = [
  { value: 'envio', label: 'Envío a domicilio', requiresAddress: true, hint: 'Costo y plazo a coordinar por WhatsApp' },
  { value: 'retiro', label: 'Retiro en persona (Neuquén)', requiresAddress: false, hint: 'Sin costo. Coordinamos punto y horario' },
];

const PAYMENT_METHODS = [
  { value: 'transferencia', label: 'Transferencia bancaria', hint: 'Te pasamos el alias por WhatsApp' },
  { value: 'efectivo', label: 'Efectivo', hint: 'Solo con retiro en persona' },
  { value: 'mercadopago', label: 'Mercado Pago', hint: 'Te enviamos el link de pago' },
];

const PROVINCES = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones',
  'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
  'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
];

const byValue = (list) => Object.fromEntries(list.map((x) => [x.value, x]));

module.exports = {
  ORDER_STATUSES,
  DELIVERY_METHODS,
  PAYMENT_METHODS,
  PROVINCES,
  STATUS_BY_VALUE: byValue(ORDER_STATUSES),
  DELIVERY_BY_VALUE: byValue(DELIVERY_METHODS),
  PAYMENT_BY_VALUE: byValue(PAYMENT_METHODS),
};
