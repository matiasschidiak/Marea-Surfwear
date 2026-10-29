// Pantalla de pedido confirmado: abre WhatsApp con el mensaje armado por el servidor.
// El enlace con los datos personales solo vive en este navegador (sessionStorage), nunca en la URL.
export function initOrderDone() {
  const root = document.querySelector('[data-order-done]');
  if (!root) return;
  const btn = root.querySelector('[data-done-wa]');
  const hint = root.querySelector('[data-done-hint]');
  const code = root.dataset.code;

  let url = root.dataset.fallbackUrl;
  let hasFullMessage = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem('marea.lastOrder') || 'null');
    if (saved && saved.code === code && /^https:\/\/wa\.me\//.test(saved.url)) { url = saved.url; hasFullMessage = true; }
  } catch { /* usar el enlace genérico */ }
  btn.href = url;

  const params = new URLSearchParams(location.search);
  if (params.get('abrir') === '1' && hasFullMessage) {
    history.replaceState(null, '', location.pathname); // evita reabrir WhatsApp al recargar
    hint.textContent = 'Abriendo WhatsApp…';
    setTimeout(() => { location.href = url; }, 1200);
  } else if (!hasFullMessage) {
    hint.textContent = 'Escribinos por WhatsApp mencionando tu código de pedido para que lo encontremos.';
  }
}
