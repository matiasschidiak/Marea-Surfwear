'use strict';
/**
 * Arma la imagen del banner con TODAS las mallas: fotos sueltas, apenas inclinadas, con marco blanco y sombra.
 * Usa la primera foto de cada producto activo (hasta 6) que esté cargada en la tienda.
 *
 *   npm run hero:build
 *
 * Genera:
 *   public/img/hero-collage.webp   (fondo transparente; se muestra sobre el atardecer del banner)
 *   public/img/og-default.jpg      (imagen al compartir la tienda en redes)
 * Volvé a correrlo cuando cambies las mallas o sus fotos principales.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../src/config');
const db = require('../src/db');

const OUT = path.join(config.root, 'public', 'img');
const MAX = 6;

const CARD_W = 360;
const CARD_H = 450;
const BORDER = 14;
// Posición (x, y del centro) y ángulo de cada foto sobre un lienzo de 1500 x 1130
const SLOTS = [
  { cx: 290, cy: 300, angle: -6 }, { cx: 750, cy: 270, angle: 4 }, { cx: 1210, cy: 305, angle: -4 },
  { cx: 300, cy: 830, angle: 5 }, { cx: 750, cy: 850, angle: -5 }, { cx: 1205, cy: 820, angle: 3 },
];
const W = 1500;
const H = 1130;

/** Devuelve el contenido de la foto: desde Supabase Storage (URL https), la carpeta local de fotos o /public. */
async function readPhoto(url) {
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo bajar ${url} (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  const file = url.startsWith(config.uploadsUrl + '/')
    ? path.join(config.uploadsDir, path.basename(url))
    : path.join(config.root, 'public', url);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

async function card(src, angle) {
  // Se acerca un poco (recorte central del 84 %) para que la malla se vea más grande dentro del marco
  src = await sharp(src).rotate().toBuffer();
  const { width, height } = await sharp(src).metadata();
  const cw = Math.round(width * 0.84);
  const ch = Math.round(height * 0.84);
  const inner = await sharp(src)
    .extract({ left: Math.round((width - cw) / 2), top: Math.round((height - ch) / 2), width: cw, height: ch })
    .resize(CARD_W, CARD_H, { fit: 'cover', position: 'attention' }).toBuffer();
  const framed = await sharp(inner)
    .extend({ top: BORDER, bottom: BORDER + 10, left: BORDER, right: BORDER, background: '#ffffff' })
    .png().toBuffer();
  const rotate = (buf) => sharp(buf).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const face = await rotate(framed);
  const meta = await sharp(face).metadata();
  const shadowBase = await sharp({
    create: { width: CARD_W + BORDER * 2, height: CARD_H + BORDER * 2 + 10, channels: 4, background: { r: 8, g: 30, b: 50, alpha: 0.55 } },
  }).png().toBuffer();
  const shadow = await sharp(await rotate(shadowBase)).blur(16).toBuffer();
  return { face, shadow, w: meta.width, h: meta.height };
}

(async () => {
  const rows = await db.all(`SELECT p.id, p.name FROM products p WHERE p.active = 1
    ORDER BY p.featured DESC, p.created_at DESC, p.id DESC LIMIT ?`, [MAX]);
  const photos = [];
  for (const r of rows) {
    const imgs = await db.all('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [r.id]);
    if (!imgs.length || /\.svg$/i.test(imgs[0].url)) continue; // las ilustraciones SVG no sirven para el collage
    const data = await readPhoto(imgs[0].url); // la foto principal que elegiste en el panel
    if (data) photos.push({ name: r.name, data });
  }
  await db.close();
  if (photos.length < 2) {
    console.error('Hacen falta al menos 2 productos activos con fotos reales. No se generó el banner.');
    process.exit(1);
  }

  const layers = [];
  for (let i = 0; i < photos.length; i++) {
    const slot = SLOTS[i];
    const c = await card(photos[i].data, slot.angle);
    const left = Math.round(slot.cx - c.w / 2);
    const top = Math.round(slot.cy - c.h / 2);
    layers.push({ input: c.shadow, left: left + 10, top: top + 18 });
    layers.push({ input: c.face, left, top });
  }
  const collage = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png().toBuffer();

  fs.mkdirSync(OUT, { recursive: true });
  await sharp(collage).trim().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80, alphaQuality: 85 }).toFile(path.join(OUT, 'hero-collage.webp'));
  const meta = await sharp(path.join(OUT, 'hero-collage.webp')).metadata();

  // Imagen para redes (1200x630): atardecer + collage
  const bg = await sharp(path.join(OUT, 'hero.svg')).resize(1200, 630, { fit: 'cover', position: 'bottom' }).png().toBuffer();
  const small = await sharp(path.join(OUT, 'hero-collage.webp')).resize({ height: 560 }).toBuffer();
  const sm = await sharp(small).metadata();
  await sharp(bg).composite([{ input: small, left: Math.round((1200 - sm.width) / 2), top: 35 }])
    .jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'og-default.jpg'));

  console.log(`Banner generado con ${photos.length} mallas: hero-collage.webp (${meta.width}x${meta.height}) y og-default.jpg`);
  photos.forEach((p) => console.log(' -', p.name));
})().catch((err) => { console.error('Error:', err.message); process.exit(1); });
