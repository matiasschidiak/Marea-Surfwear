// Punto de entrada: carga solo lo necesario en cada página.
import { initUI } from './ui.js';
import { initCartUI } from './cart-ui.js';

initUI();
initCartUI();

const page = document.body.className;
if (page.includes('page-product')) import('./product.js').then((m) => m.initProduct());
if (page.includes('page-checkout')) import('./checkout.js').then((m) => m.initCheckout());
if (page.includes('page-done')) import('./order-done.js').then((m) => m.initOrderDone());
