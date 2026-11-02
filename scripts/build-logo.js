'use strict';
/**
 * Genera el logo de MAREA Surfwear (todo dibujado con trazos: no depende de ninguna tipografía instalada).
 *
 *   npm run logo:build
 *
 * Idea: la M de MAREA tiene el sol "naciendo" en su V (el atardecer del banner) y debajo va la ola.
 *
 * Genera:
 *   public/img/logo/*.svg          logo horizontal (color, para fondo oscuro, 1 tinta ink y 1 tinta blanca), marca y ícono
 *   public/img/favicon.svg         ícono para la pestaña del navegador
 *   public/img/apple-touch-icon.png
 *   brand/*.png                    versiones listas para redes, impresión y WhatsApp/Instagram
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_SVG = path.join(ROOT, 'public', 'img', 'logo');
const OUT_IMG = path.join(ROOT, 'public', 'img');
const OUT_BRAND = path.join(ROOT, 'brand');

const C = { ink: '#0b2a43', aqua: '#2fb8b8', coral: '#ff6b4a', sand: '#f6efe4', white: '#ffffff' };

const r2 = (n) => +n.toFixed(2);
const compact = (d) => d.replace(/-?\d+\.\d+/g, (n) => r2(+n));
const svgWrap = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}" width="${r2(w)}" height="${r2(h)}">${bg ? `<rect width="${r2(w)}" height="${r2(h)}" fill="${bg}"/>` : ''}${body}</svg>\n`;
const strokeAttrs = (color, w) => `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

/** Sol que se esconde detrás de la M. Con `knockout` deja un hueco alrededor de la M (para versiones de una sola tinta). */
function sunBehindM({ id, sun, circle, mPath, strokeW, gap }) {
  // stroke="none": el sol va dentro del grupo de trazos de la palabra y, sin esto, heredaría su contorno
  const c = `<circle cx="${r2(circle.cx)}" cy="${r2(circle.cy)}" r="${r2(circle.r)}" fill="${sun}" stroke="none"`;
  if (!gap) return `${c}/>`;
  const transform = mPath.transform ? ` transform="${mPath.transform}"` : '';
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><rect x="-20" y="-20" width="140" height="140" fill="#fff"/><path d="${mPath.d}"${transform} ${strokeAttrs('#000', strokeW + gap)}/></mask>${c} mask="url(#${id})"/>`;
}

/** Línea de ola (cadena de cuadráticas) de `width` de ancho total, centrada en la altura `cy`. */
function waveLine({ color, width, cy, amp, stroke, half = 11 }) {
  const n = Math.max(2, Math.round((width - stroke) / half));
  const p = (width - stroke) / n;
  let d = `M${r2(stroke / 2)} ${r2(cy)}q${r2(p / 2)} ${r2(-amp * 2)} ${r2(p)} 0`;
  for (let i = 1; i < n; i++) d += `t${r2(p)} 0`;
  return `<path d="${d}" ${strokeAttrs(color, stroke)}/>`;
}

// ---------- Marca: M + sol + ola, en una caja de 64 x 64 con la tinta centrada ----------
const MARK = { stroke: 7.5, x0: 12, x1: 52, top: 8, bottom: 44, vee: 35.4, sun: { cx: 32, cy: 20.3, r: 8.8 }, wave: { cy: 55, amp: 2.3, stroke: 4 } };
MARK.ink = { x: MARK.x0 - MARK.stroke / 2, w: MARK.x1 - MARK.x0 + MARK.stroke };

function markInner({ m, sun, water, knockout }) {
  const d = `M${MARK.x0} ${MARK.bottom}V${MARK.top}L32 ${MARK.vee}L${MARK.x1} ${MARK.top}V${MARK.bottom}`;
  return [
    sunBehindM({ id: 'marea-gap', sun, circle: MARK.sun, mPath: { d, transform: '' }, strokeW: MARK.stroke, gap: knockout ? 3.4 : 0 }),
    `<path d="${d}" ${strokeAttrs(m, MARK.stroke)}/>`,
    `<g transform="translate(${r2(MARK.ink.x)} 0)">${waveLine({ color: water, width: MARK.ink.w, ...MARK.wave })}</g>`,
  ].join('');
}

const markSvg = (colors, { bg, rx = 0 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${bg ? `<rect width="64" height="64" rx="${rx}" fill="${bg}"/>` : ''}${markInner(colors)}</svg>\n`;

/** Ícono cuadrado: la marca dentro de un fondo, con margen de sobra para recortes circulares. */
function iconSvg(colors, { bg, rx, scale }) {
  const body = `<g transform="translate(50 50) scale(${scale}) translate(-32 -32)">${markInner(colors)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="${rx}" fill="${bg}"/>${body}</svg>\n`;
}

// ---------- Logotipo: letras de trazo uniforme (alto de letra H, línea superior en y=0 y base en y=H) ----------
const WORD = { H: 29, stroke: 6.2, gap: 7.5, vee: 0.74 };
const WORD_KERN = { 'M-A': -1.5, 'A-R': -2.5, 'R-E': 0, 'E-A': -2.5 };

function wordLetters(H) {
  const bowl = H * 0.26;
  return {
    M: { w: H * 1.05, d: `M0 ${H}V0L${H * 0.525} ${H * WORD.vee}L${H * 1.05} 0V${H}` },
    A: { w: H * 1.05, d: `M0 ${H}L${H * 0.525} 0L${H * 1.05} ${H}M${H * 0.17} ${H * 0.72}H${H * 0.88}` },
    R: { w: H * 0.95, d: `M0 ${H}V0H${H * 0.5}A${bowl} ${bowl} 0 0 1 ${H * 0.5} ${bowl * 2}H0M${H * 0.46} ${bowl * 2}L${H * 0.95} ${H}` },
    E: { w: H * 0.87, d: `M${H * 0.87} 0H0V${H}H${H * 0.87}M0 ${H / 2}H${H * 0.68}` },
  };
}

function wordmark({ color, sun, knockout }) {
  const { H, stroke, gap } = WORD;
  const L = wordLetters(H);
  const order = ['M', 'A', 'R', 'E', 'A'];
  let x = stroke / 2;
  let parts = '';
  order.forEach((k, i) => {
    const transform = `translate(${r2(x)} ${r2(stroke / 2)})`;
    if (k === 'M' && sun) {
      const circle = { cx: x + L.M.w / 2, cy: stroke / 2 + H * WORD.vee * 0.43, r: H * 0.255 };
      parts += sunBehindM({ id: 'marea-gap-word', sun, circle, mPath: { d: compact(L.M.d), transform }, strokeW: stroke, gap: knockout ? 2.6 : 0 });
    }
    parts += `<path transform="${transform}" d="${compact(L[k].d)}"/>`;
    x += L[k].w + stroke + gap + (WORD_KERN[`${k}-${order[i + 1]}`] || 0);
  });
  return { svg: `<g ${strokeAttrs(color, stroke)}>${parts}</g>`, width: r2(x - gap - stroke / 2), height: r2(H + stroke) };
}

// Bajada "SURFWEAR" en miniatura
const TAG_KERN = { 'R-F': -0.4, 'F-W': -1.4, 'W-E': -0.8, 'E-A': -0.6, 'A-R': -0.3 };

function tagline({ color, H = 8, stroke = 2.1, gap = 5.2 }) {
  const w = H * 0.64;
  const L = {
    S: { w, d: `M${w} ${H * 0.2}C${w} ${H * 0.08} ${w * 0.78} 0 ${w * 0.5} 0C${w * 0.22} 0 0 ${H * 0.1} 0 ${H * 0.27}C0 ${H * 0.43} ${w * 0.25} ${H * 0.47} ${w * 0.5} ${H * 0.5}C${w * 0.75} ${H * 0.53} ${w} ${H * 0.57} ${w} ${H * 0.73}C${w} ${H * 0.9} ${w * 0.78} ${H} ${w * 0.5} ${H}C${w * 0.22} ${H} 0 ${H * 0.92} 0 ${H * 0.8}` },
    U: { w, d: `M0 0V${H * 0.6}A${w / 2} ${w / 2} 0 0 0 ${w} ${H * 0.6}V0` },
    R: { w, d: `M0 ${H}V0H${w * 0.5}A${w * 0.5} ${H * 0.27} 0 0 1 ${w * 0.5} ${H * 0.54}H0M${w * 0.45} ${H * 0.54}L${w} ${H}` },
    F: { w: w * 0.9, d: `M${w * 0.9} 0H0V${H}M0 ${H * 0.46}H${w * 0.72}` },
    W: { w: w * 1.5, d: `M0 0L${w * 0.375} ${H}L${w * 0.75} ${H * 0.2}L${w * 1.125} ${H}L${w * 1.5} 0` },
    E: { w: w * 0.9, d: `M${w * 0.9} 0H0V${H}H${w * 0.9}M0 ${H / 2}H${w * 0.7}` },
    A: { w: w * 1.05, d: `M0 ${H}L${w * 0.525} 0L${w * 1.05} ${H}M${w * 0.17} ${H * 0.68}H${w * 0.88}` },
  };
  const order = ['S', 'U', 'R', 'F', 'W', 'E', 'A', 'R'];
  let x = stroke / 2;
  let parts = '';
  order.forEach((k, i) => {
    parts += `<path transform="translate(${r2(x)} ${r2(stroke / 2)})" d="${compact(L[k].d)}"/>`;
    x += L[k].w + stroke + gap + (TAG_KERN[`${k}-${order[i + 1]}`] || 0);
  });
  return { svg: `<g ${strokeAttrs(color, stroke)}>${parts}</g>`, width: r2(x - gap - stroke / 2), height: r2(H + stroke) };
}

/** Logo horizontal: MAREA (con el sol en la M) y debajo SURFWEAR seguido de una ola que llega hasta el borde de la A. */
function logoSvg({ word, sun, water, knockout, bg, pad = 0 }) {
  const wm = wordmark({ color: word, sun, knockout });
  const tg = tagline({ color: word });
  const rowY = wm.height + 6;
  const waveX = tg.width + 9;
  const wave = waveLine({ color: water, width: wm.width - waveX, cy: tg.height / 2, amp: 2.4, stroke: 2.8, half: 11 });
  const body = `<g transform="translate(${pad} ${pad})">${wm.svg}</g>
<g transform="translate(${pad} ${r2(pad + rowY)})">${tg.svg}</g>
<g transform="translate(${r2(pad + waveX)} ${r2(pad + rowY)})">${wave}</g>`;
  return svgWrap(wm.width + pad * 2, rowY + tg.height + pad * 2, body, bg);
}

// ---------- Salida ----------
const ink1 = { word: C.ink, sun: C.ink, water: C.ink, knockout: true };
const white1 = { word: C.white, sun: C.white, water: C.white, knockout: true };
const colorOnLight = { word: C.ink, sun: C.coral, water: C.aqua };
const colorOnDark = { word: C.sand, sun: C.coral, water: C.aqua };

const files = {
  'marea-logo.svg': logoSvg(colorOnLight),
  'marea-logo-sand.svg': logoSvg(colorOnDark),
  'marea-logo-ink.svg': logoSvg(ink1),
  'marea-logo-white.svg': logoSvg(white1),
  'marea-mark.svg': markSvg({ m: C.ink, sun: C.coral, water: C.aqua }),
  'marea-mark-sand.svg': markSvg({ m: C.sand, sun: C.coral, water: C.aqua }),
  'marea-mark-ink.svg': markSvg({ m: C.ink, sun: C.ink, water: C.ink, knockout: true }),
  'marea-mark-white.svg': markSvg({ m: C.white, sun: C.white, water: C.white, knockout: true }),
  'marea-icon.svg': iconSvg({ m: C.sand, sun: C.coral, water: C.aqua }, { bg: C.ink, rx: 22, scale: 1.12 }),
};

const png = (svg, width, opts = {}) => sharp(Buffer.from(svg), { density: 72 * Math.max(1, (width / 64) * 1.2) }).resize({ width, ...opts }).png();

async function main() {
  fs.mkdirSync(OUT_SVG, { recursive: true });
  fs.mkdirSync(OUT_BRAND, { recursive: true });
  for (const [name, svg] of Object.entries(files)) fs.writeFileSync(path.join(OUT_SVG, name), svg);
  fs.writeFileSync(path.join(OUT_IMG, 'favicon.svg'), files['marea-icon.svg']);

  const squareIcon = (rx) => iconSvg({ m: C.sand, sun: C.coral, water: C.aqua }, { bg: C.ink, rx, scale: 1.12 });
  await png(squareIcon(22), 180).toFile(path.join(OUT_IMG, 'apple-touch-icon.png'));
  // Avatar cuadrado y sin esquinas redondeadas: Instagram y WhatsApp lo recortan en círculo
  await png(squareIcon(0), 1024).toFile(path.join(OUT_BRAND, 'marea-avatar-1024.png'));
  await png(files['marea-logo.svg'], 2400).toFile(path.join(OUT_BRAND, 'marea-logo-color.png'));
  await png(files['marea-logo-sand.svg'], 2400).toFile(path.join(OUT_BRAND, 'marea-logo-fondo-oscuro.png'));
  await png(files['marea-logo-ink.svg'], 2400).toFile(path.join(OUT_BRAND, 'marea-logo-1-tinta-negro.png'));
  await png(files['marea-logo-white.svg'], 2400).toFile(path.join(OUT_BRAND, 'marea-logo-1-tinta-blanco.png'));
  await png(files['marea-mark.svg'], 1024).toFile(path.join(OUT_BRAND, 'marea-marca.png'));
  console.log('Logo generado en public/img/logo, public/img/favicon.svg y brand/');
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { C, logoSvg, markSvg, iconSvg, files };
