'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const config = require('../config');

// Cada imagen subida se guarda en 3 tamaños WebP; la URL guardada en la base apunta al más grande
// y el helper `srcset()` deriva los demás (carga rápida en celulares).
const WIDTHS = [480, 800, 1400];
const SUFFIX = `-${WIDTHS[WIDTHS.length - 1]}.webp`;

function ensureDir() {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

/** Procesa un archivo subido (Buffer). Valida que sea una imagen real, la rota según EXIF y la comprime. */
async function saveUpload(buffer) {
  ensureDir();
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
  for (const w of WIDTHS) {
    await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(config.uploadsDir, `${base}-${w}.webp`));
  }
  return `${config.uploadsUrl}/${base}${SUFFIX}`;
}

/** Borra los archivos de una imagen subida (si la URL es de /uploads). Ignora imágenes de /img. */
function deleteFiles(url) {
  if (!url || !url.startsWith(config.uploadsUrl + '/') || !url.endsWith(SUFFIX)) return;
  const base = path.basename(url, SUFFIX);
  if (!/^[a-f0-9]{20}$/.test(base)) return;
  for (const w of WIDTHS) {
    fs.rm(path.join(config.uploadsDir, `${base}-${w}.webp`), { force: true }, () => {});
  }
}

/** Devuelve el atributo srcset para una imagen subida, o '' si es un archivo estático (SVG, etc.). */
function srcset(url) {
  if (!url || !url.startsWith(config.uploadsUrl + '/') || !url.endsWith(SUFFIX)) return '';
  const base = url.slice(0, -SUFFIX.length);
  return WIDTHS.map((w) => `${base}-${w}.webp ${w}w`).join(', ');
}

module.exports = { saveUpload, deleteFiles, srcset, WIDTHS };
