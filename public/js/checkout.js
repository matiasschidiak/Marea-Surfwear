// Checkout: formulario validado, resumen final y envío del pedido (el servidor valida todo otra vez).
import { cart, money } from './cart.js';
import { esc, toast } from './ui.js';

const CUSTOMER_KEY = 'marea.customer.v1';
const FIELDS = ['firstName', 'lastName', 'phone', 'street', 'streetNumber', 'city', 'province', 'postalCode', 'notes'];
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;

const $ = (sel, root = document) => root.querySelector(sel);

export function initCheckout() {
  const root = $('[data-checkout]');
  if (!root) return;

  const form = $('[data-checkout-form]');
  const review = $('[data-review]');
  const aside = $('[data-summary-aside]');
  const alertBox = $('[data-checkout-alert]');
  const emptyBox = $('[data-checkout-empty]');
  const loading = $('[data-checkout-loading]');
  const addressBox = $('[data-address-box]');
  const confirmBtn = $('[data-confirm]');
  const confirmLabel = $('[data-confirm-label]');
  let step = 1;
  let blocked = false;

  // ---- Utilidades de formulario ----
  const val = (name) => (form.elements[name] ? form.elements[name].value.trim() : '');
  const radio = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || '';
  const needsAddress = () => radio('deliveryMethod') !== 'retiro';

  function values() {
    const v = {};
    FIELDS.forEach((f) => { v[f] = val(f); });
    v.deliveryMethod = radio('deliveryMethod');
    v.paymentMethod = radio('paymentMethod');
    return v;
  }

  function validate(v) {
    const e = {};
    if (v.firstName.length < 2 || !NAME_RE.test(v.firstName)) e.firstName = 'Ingresá tu nombre.';
    if (v.lastName.length < 2 || !NAME_RE.test(v.lastName)) e.lastName = 'Ingresá tu apellido.';
    const digits = v.phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) e.phone = 'Ingresá un teléfono válido (solo números, con código de área).';
    if (!v.deliveryMethod) e.deliveryMethod = 'Elegí un método de entrega.';
    if (!v.paymentMethod) e.paymentMethod = 'Elegí un método de pago.';
    if (v.paymentMethod === 'efectivo' && v.deliveryMethod !== 'retiro') e.paymentMethod = 'El efectivo solo está disponible con retiro en persona.';
    if (needsAddress()) {
      if (v.street.length < 3) e.street = 'Ingresá la calle.';
      if (!/^[\p{L}\p{N}][\p{L}\p{N}\s./\-]{0,11}$/u.test(v.streetNumber)) e.streetNumber = 'Ingresá el número (o "S/N").';
      if (v.city.length < 2) e.city = 'Ingresá la ciudad.';
      if (!v.province) e.province = 'Elegí una provincia.';
      if (!/^([A-Za-z]\d{4}[A-Za-z]{3}|\d{4})$/.test(v.postalCode.replace(/\s+/g, ''))) e.postalCode = 'Código postal inválido (ej: 8300).';
    }
    return e;
  }

  function showErrors(errors) {
    form.querySelectorAll('[data-error-for]').forEach((el) => { el.hidden = true; el.textContent = ''; });
    form.querySelectorAll('.field.has-error').forEach((el) => el.classList.remove('has-error'));
    let first = null;
    for (const [name, msg] of Object.entries(errors)) {
      const p = form.querySelector(`[data-error-for="${name}"]`);
      if (p) { p.hidden = false; p.textContent = msg; }
      const input = form.elements[name];
      const field = input && input.closest ? input.closest('.field') : null;
      if (field) field.classList.add('has-error');
      if (!first) first = (input && input.focus ? input : p);
    }
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (first.focus) first.focus({ preventScroll: true });
    }
  }

  function banner(type, html) {
    alertBox.className = `alert alert--${type}`;
    alertBox.innerHTML = html;
    alertBox.hidden = false;
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const hideBanner = () => { alertBox.hidden = true; };

  function setStep(n) {
    step = n;
    form.hidden = n !== 1;
    review.hidden = n !== 2;
    aside.hidden = n !== 1;
    document.querySelectorAll('[data-step-ind]').forEach((li) => {
      const i = Number(li.dataset.stepInd);
      li.classList.toggle('is-active', i === n);
      li.classList.toggle('is-done', i < n);
    });
    const header = document.getElementById('site-header');
    const top = root.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 70) - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  // ---- Carrito → resumen ----
  function renderSummary() {
    const lines = cart.lines();
    const html = lines.map((l) => `<li class="line">
      ${l.info.image ? `<img src="${esc(l.info.image)}" alt="" width="52" height="65" loading="lazy">` : ''}
      <div class="line__info"><strong>${esc(l.info.name)}</strong><span>Talle ${esc(l.info.size)} · ${l.qty} × ${money(l.info.price)}</span></div>
      <span class="line__sub">${money(l.qty * l.info.price)}</span></li>`).join('');
    $('[data-summary-lines]').innerHTML = html;
    $('[data-summary-total]').textContent = money(cart.total());
  }

  function renderReview(v) {
    const lines = cart.lines();
    $('[data-review-lines]').innerHTML = lines.map((l) => `<li class="line">
      <div class="line__info"><strong>${esc(l.info.name)}</strong>
      <span>Talle ${esc(l.info.size)} · Cantidad ${l.qty} · ${money(l.info.price)} c/u</span></div>
      <span class="line__sub">${money(l.qty * l.info.price)}</span></li>`).join('');
    $('[data-review-total]').textContent = money(cart.total());
    const labelOf = (name, value) => {
      const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
      return input ? input.closest('.choice').querySelector('strong').textContent : value;
    };
    $('[data-review-customer]').innerHTML = `
      <dt>Nombre</dt><dd>${esc(v.firstName)}</dd><dt>Apellido</dt><dd>${esc(v.lastName)}</dd><dt>Teléfono</dt><dd>${esc(v.phone)}</dd>`;
    const address = needsAddress()
      ? `<dt>Dirección</dt><dd>${esc(v.street)} ${esc(v.streetNumber)}<br>${esc(v.city)}, ${esc(v.province)}<br>CP ${esc(v.postalCode.toUpperCase())}</dd>`
      : '<dt>Dirección</dt><dd>No aplica (retiro en persona)</dd>';
    $('[data-review-delivery]').innerHTML = `
      <dt>Método de entrega</dt><dd>${esc(labelOf('deliveryMethod', v.deliveryMethod))}</dd>${address}
      <dt>Método de pago</dt><dd>${esc(labelOf('paymentMethod', v.paymentMethod))}</dd>
      ${v.notes ? `<dt>Indicaciones</dt><dd>${esc(v.notes)}</dd>` : ''}`;
  }

  function applyDeliveryRules() {
    const addr = needsAddress();
    addressBox.hidden = !addr;
    const cash = form.querySelector('input[name="paymentMethod"][value="efectivo"]');
    if (cash) {
      cash.disabled = addr;
      cash.closest('.choice').title = addr ? 'Solo disponible con retiro en persona' : '';
      if (addr && cash.checked) form.querySelector('input[name="paymentMethod"][value="transferencia"]').checked = true;
    }
  }

  // ---- Carga inicial ----
  function showEmpty() {
    loading.hidden = true; root.hidden = true; emptyBox.hidden = false;
  }

  function stockBanner(notes) {
    if (!notes.length) return hideBanner();
    banner('warn', `<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg><div><strong>Actualizamos tu carrito</strong><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`);
  }

  function updateBlocked() {
    blocked = cart.hasSoldOut();
    form.querySelector('button[type="submit"]').disabled = blocked;
    confirmBtn.disabled = blocked;
    if (blocked) {
      banner('error', '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg><p>Hay productos agotados en tu carrito. Tocá <strong>Editar</strong> y quitalos para continuar.</p>');
    }
  }

  async function load() {
    if (!cart.lines().length) return showEmpty();
    const result = await cart.sync();
    loading.hidden = true;
    if (!cart.lines().length) return showEmpty();
    root.hidden = false;
    renderSummary();
    if (result) stockBanner(result.notes);
    updateBlocked();
  }

  // Prellenar con los datos de la compra anterior (solo en este dispositivo)
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null');
    if (saved) for (const f of FIELDS) if (f !== 'notes' && saved[f] && form.elements[f]) form.elements[f].value = saved[f];
    if (saved && saved.deliveryMethod) { const r = form.querySelector(`input[name="deliveryMethod"][value="${saved.deliveryMethod}"]`); if (r) r.checked = true; }
    if (saved && saved.paymentMethod) { const r = form.querySelector(`input[name="paymentMethod"][value="${saved.paymentMethod}"]`); if (r) r.checked = true; }
  } catch { /* ignorar */ }
  if (!form.elements.province.value) form.elements.province.value = 'Neuquén';
  applyDeliveryRules();

  form.querySelectorAll('input[name="deliveryMethod"]').forEach((r) => r.addEventListener('change', applyDeliveryRules));
  form.addEventListener('input', (e) => {
    const field = e.target.closest && e.target.closest('.field');
    if (field && field.classList.contains('has-error')) {
      field.classList.remove('has-error');
      const p = field.querySelector('[data-error-for]');
      if (p) p.hidden = true;
    }
  });

  cart.subscribe((ev) => {
    if (root.hidden && ev.type !== 'external') return;
    if (!cart.lines().length) { if (step === 1) showEmpty(); return; }
    renderSummary();
    if (step === 2) renderReview(values());
    if (alertBox.classList.contains('alert--error')) hideBanner();
    updateBlocked();
  });

  // ---- Paso 1 → 2 ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hideBanner();
    if (blocked) return;
    const v = values();
    const errors = validate(v);
    showErrors(errors);
    if (Object.keys(errors).length) { toast('Revisá los campos marcados.', { type: 'error' }); return; }
    renderReview(v);
    setStep(2);
  });

  $('[data-review-back]').addEventListener('click', () => { hideBanner(); setStep(1); });

  // ---- Confirmar ----
  confirmBtn.addEventListener('click', async () => {
    if (blocked || confirmBtn.classList.contains('is-loading')) return;
    hideBanner();
    const v = values();
    const errors = validate(v);
    if (Object.keys(errors).length) { setStep(1); showErrors(errors); return; }

    confirmBtn.classList.add('is-loading');
    confirmBtn.disabled = true;
    confirmLabel.textContent = 'Registrando pedido…';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, items: cart.lines().map((l) => ({ variantId: l.variantId, qty: l.qty })) }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 201) {
        try {
          sessionStorage.setItem('marea.lastOrder', JSON.stringify({ code: data.code, url: data.whatsappUrl }));
          const keep = { ...v }; delete keep.notes;
          localStorage.setItem(CUSTOMER_KEY, JSON.stringify(keep));
        } catch { /* sin storage: la página final usa un enlace genérico */ }
        cart.clear();
        location.href = `${data.redirect}?abrir=1`;
        return;
      }
      if (res.status === 422 && data.fields) {
        setStep(1); showErrors(data.fields); toast(data.error || 'Revisá los datos.', { type: 'error' });
      } else if (res.status === 409) {
        const result = await cart.sync();
        renderSummary(); renderReview(v); updateBlocked();
        const msgs = (data.problems || []).map((p) => p.message);
        banner('error', `<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg><div><strong>No pudimos confirmar tu pedido</strong><ul>${msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p>Ajustamos tu carrito con el stock actual. Revisalo y confirmá de nuevo.</p></div>`);
        if (result && !cart.lines().length) showEmpty();
      } else {
        banner('error', `<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg><p>${esc(data.error || 'No pudimos registrar el pedido. Probá de nuevo.')}</p>`);
      }
    } catch {
      banner('error', '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg><p>Sin conexión. Revisá tu internet y probá de nuevo.</p>');
    } finally {
      confirmBtn.classList.remove('is-loading');
      confirmBtn.disabled = cart.hasSoldOut();
      confirmLabel.textContent = 'Confirmar pedido por WhatsApp';
    }
  });

  load();
}
