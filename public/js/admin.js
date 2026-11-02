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

// Fotos livianas antes de subirlas. Vercel acepta pedidos de hasta 4,5 MB y una foto de celular pesa 3-6 MB:
// el navegador reduce cada foto (máx. 1600 px de lado, WebP) y recién ahí envía el formulario.
// El servidor igual genera sus 3 tamaños optimizados; esto solo evita que el envío falle por peso.
(function () {
  var form = document.querySelector('form[enctype="multipart/form-data"]');
  var input = document.querySelector('[data-preview-input]');
  if (!form || !input || !window.DataTransfer || !window.File) return;

  var MAX_SIDE = 1600;
  var SKIP_BELOW = 600 * 1024;
  var ready = false;
  var working = false;

  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < SKIP_BELOW) return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          var type = blob.type || 'image/webp';
          var name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg');
          resolve(new File([blob], name, { type: type }));
        }, 'image/webp', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  form.addEventListener('submit', function (e) {
    if (ready || !input.files || !input.files.length) return;
    e.preventDefault();
    if (working) return;
    working = true;
    var button = form.querySelector('button[type="submit"]');
    var label = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Preparando fotos…'; }
    Promise.all(Array.prototype.map.call(input.files, shrink)).then(function (files) {
      var dt = new DataTransfer();
      files.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;
    }).catch(function () { /* se envían las originales */ }).then(function () {
      ready = true;
      if (button) { button.disabled = false; button.textContent = label; }
      form.submit();
    });
  });
})();
