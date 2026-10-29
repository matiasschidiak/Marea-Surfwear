// Panel de administración: confirmaciones, vista previa de imágenes y filas de talles.
(function () {
  // Confirmación antes de acciones destructivas: <form data-confirm="mensaje">
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // Activar/desactivar el campo de stock de cada talle
  document.querySelectorAll('[data-size-offer]').forEach(function (cb) {
    var input = cb.closest('.a-size-row').querySelector('[data-size-stock]');
    cb.addEventListener('change', function () {
      input.disabled = !cb.checked;
      if (cb.checked) { if (input.value === '') input.value = '0'; input.focus(); input.select(); }
    });
  });

  // Vista previa de las imágenes elegidas
  var fileInput = document.querySelector('[data-preview-input]');
  var previews = document.querySelector('[data-previews]');
  if (fileInput && previews) {
    fileInput.addEventListener('change', function () {
      previews.innerHTML = '';
      Array.prototype.slice.call(fileInput.files || []).slice(0, 8).forEach(function (file) {
        if (!/^image\//.test(file.type)) return;
        var img = document.createElement('img');
        img.alt = '';
        img.src = URL.createObjectURL(file);
        img.onload = function () { URL.revokeObjectURL(img.src); };
        previews.appendChild(img);
      });
    });
  }
})();
