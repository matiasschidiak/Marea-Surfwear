'use strict';
const crypto = require('crypto');
const sharp = require('sharp');
const storage = require('./storage');

// Cada imagen subida se guarda en 3 tamaños WebP; la URL guardada en la base apunta al más grande
// y el helper `srcset()` deriva los demás (carga rápida en celulares).
const WIDTHS = [480, 800, 1400];
const SUFFIX = `-${WIDTHS[WIDTHS.length - 1]}.webp`;
const NAME_RE = /^[a-f0-9]{20}$/;

/** Procesa un archivo subido (Buffer). Valida que sea una imagen real, la rota según EXIF y la comprime. */
async function saveUpload(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new Error('El archivo no es una imagen válida.');
  }
  if (!['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(meta.format)) {
    throw new Error('Formato no permitido. Usá JPG, PNG o WebP.');
  }
  const base = crypto.randomBytes(10).toString('hex');
  const urls = await Promise.all(WIDTHS.map(async (w) => {
    const out = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return storage.put(`${base}-${w}.webp`, out, 'image/webp');
  }));
  return urls[urls.length - 1];
}

function baseOf(url) {
  if (!url || !url.endsWith(SUFFIX)) return null;
  const file = url.slice(url.lastIndexOf('/') + 1, -SUFFIX.length);
  return NAME_RE.test(file) ? { file, prefix: url.slice(0, url.lastIndexOf('/') + 1) } : null;
}

/** Borra los archivos de una imagen subida desde el panel. Ignora las imágenes estáticas de /img. */
async function deleteFiles(url) {
  const base = baseOf(url);
  if (!base || storage.keyFromUrl(url) === null) return;
  await storage.remove(WIDTHS.map((w) => `${base.file}-${w}.webp`));
}

/** Atributo srcset de una imagen subida, o '' si es un archivo estático (SVG, etc.). */
function srcset(url) {
  const base = baseOf(url);
  if (!base) return '';
  return WIDTHS.map((w) => `${base.prefix}${base.file}-${w}.webp ${w}w`).join(', ');
}

module.exports = { saveUpload, deleteFiles, srcset, WIDTHS };
