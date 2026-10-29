'use strict';
/**
 * Genera las ilustraciones de demostración (mallas, hero, logo, favicon, imagen para redes).
 * Son ARCHIVOS TEMPORALES para ver la tienda armada: se reemplazan subiendo fotos reales
 * desde el panel de administración (Productos → Editar → Imágenes).
 *
 *   npm run art:generate
 */
const fs = require('fs');
const path = require('path');

const out = path.resolve(__dirname, '..', 'public', 'img');
const productsOut = path.join(out, 'products');
fs.mkdirSync(productsOut, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Siluetas
// ---------------------------------------------------------------------------------------------
const BODY = 'M215,250 Q400,222 585,250 L612,650 Q520,672 428,655 Q416,520 400,452 Q384,520 372,655 Q280,672 188,650 Z';
const WAIST = 'M215,250 Q400,222 585,250 L589,312 Q400,286 211,312 Z';

const wavy = (y, amp, step = 100, x0 = 100, x1 = 700) => {
  let d = `M${x0},${y} q${step / 4},${-amp} ${step / 2},0`;
  for (let x = x0 + step / 2; x < x1; x += step / 2) d += ` t${step / 2},0`;
  return d;
};

const PATTERNS = {
  waves: (c) => {
    let s = '';
    for (let i = 0, y = 270; y < 700; i++, y += 34) {
      s += `<path d="${wavy(y, 16, 90, 90 + (i % 2) * 45, 720)}" fill="none" stroke="${c.line}" stroke-width="7" stroke-linecap="round" opacity="${0.55 - (i % 3) * 0.12}"/>`;
    }
    return s;
  },
  blackwave: (c) => {
    let s = `<defs><linearGradient id="bw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.line}"/><stop offset="1" stop-color="${c.line2}"/></linearGradient></defs>`;
    for (let i = 0, y = 300; y < 700; i++, y += 52) {
      s += `<path d="${wavy(y, 30, 160, 60 + (i % 2) * 80, 760)}" fill="none" stroke="url(#bw)" stroke-width="${i % 2 ? 5 : 11}" stroke-linecap="round" opacity="${i % 2 ? 0.55 : 0.95}"/>`;
    }
    return s;
  },
  palm: (c) => {
    const leaf = 'M0,0 C22,-46 78,-68 138,-54 C92,-34 46,-12 0,0Z';
    const spots = [[250, 360, -20, 1], [520, 340, 160, 1.1], [330, 520, 40, 1.2], [560, 560, 200, 1], [230, 640, 300, 0.9], [470, 470, 100, 0.8]];
    let s = '';
    for (const [x, y, rot, sc] of spots) {
      for (let k = 0; k < 5; k++) {
        s += `<g transform="translate(${x} ${y}) rotate(${rot + k * 34 - 68}) scale(${sc})"><path d="${leaf}" fill="${c.line}" opacity="0.85"/></g>`;
      }
      s += `<circle cx="${x}" cy="${y}" r="8" fill="${c.line2}"/>`;
    }
    for (const [x, y] of [[300, 300], [450, 390], [380, 600], [530, 650], [250, 520], [600, 440]]) {
      s += `<circle cx="${x}" cy="${y}" r="9" fill="${c.line2}" opacity="0.9"/>`;
    }
    return s;
  },
  stripes: (c) => {
    let s = '';
    for (let i = 0; i < 12; i++) {
      const x = 120 + i * 62;
      s += `<path d="M${x},230 L${x + 140},230 L${x - 60},700 L${x - 200},700Z" fill="${i % 2 ? c.line : c.line2}" opacity="0.92"/>`;
    }
    return s;
  },
  dots: (c) => {
    let s = '';
    for (let row = 0, y = 270; y < 700; row++, y += 34) {
      for (let x = 130 + (row % 2) * 17; x < 700; x += 34) s += `<circle cx="${x}" cy="${y}" r="5" fill="${c.line}" opacity="0.8"/>`;
    }
    return s;
  },
  panel: (c) => `
    <path d="M190,230 L262,230 L276,700 L190,700Z" fill="${c.line}" opacity="0.95"/>
    <path d="M538,230 L610,230 L610,700 L524,700Z" fill="${c.line}" opacity="0.95"/>
    <path d="M262,230 L276,700 L290,700 L274,230Z" fill="${c.line2}" opacity="0.9"/>
    <path d="M510,230 L524,700 L510,700 L498,230Z" fill="${c.line2}" opacity="0.9"/>`,
};

function shorts(p, view) {
  const pattern = PATTERNS[p.pattern](p);
  const back = view === 'back';
  const front = `
    <path d="M400,452 L400,312" stroke="#000" stroke-opacity=".10" stroke-width="3"/>
    <path d="M388,300 C360,360 350,380 352,430" fill="none" stroke="${p.string}" stroke-width="7" stroke-linecap="round"/>
    <path d="M412,300 C440,355 452,385 448,438" fill="none" stroke="${p.string}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="352" cy="436" r="9" fill="${p.string}"/><circle cx="448" cy="444" r="9" fill="${p.string}"/>
    <circle cx="400" cy="296" r="13" fill="${p.waist}" stroke="${p.string}" stroke-width="5"/>
    <text x="458" y="606" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="26" letter-spacing="5" fill="#fff" fill-opacity=".92">MAREA</text>`;
  const rear = `
    <path d="M400,452 C404,400 396,350 400,312" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="3"/>
    <rect x="452" y="352" width="96" height="86" rx="10" fill="${p.waist}" fill-opacity=".92"/>
    <rect x="452" y="352" width="96" height="30" rx="10" fill="#000" fill-opacity=".14"/>
    <path d="M462,400 H538" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-dasharray="6 6"/>
    <text x="214" y="632" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="21" letter-spacing="5" fill="#fff" fill-opacity=".9">MAREA</text>`;
  return `
    <ellipse cx="400" cy="705" rx="250" ry="22" fill="#000" opacity=".10"/>
    <defs>
      <clipPath id="body"><path d="${BODY}"/></clipPath>
      <linearGradient id="base" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${p.base}"/><stop offset="1" stop-color="${p.base2}"/></linearGradient>
      <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
    </defs>
    <path d="${BODY}" fill="url(#base)"/>
    <g clip-path="url(#body)">${pattern}
      <rect x="150" y="220" width="500" height="480" fill="url(#shine)"/>
      <path d="M196,626 Q300,650 372,632 L376,672 L190,672Z M428,632 Q520,650 606,626 L612,672 L424,672Z" fill="#000" opacity=".12"/>
    </g>
    <path d="${BODY}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/>
    <path d="${WAIST}" fill="${p.waist}"/>
    <path d="M222,276 Q400,250 578,276" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3" stroke-dasharray="3 9"/>
    ${back ? rear : front}`;
}

function background(kind, p) {
  const bg = {
    sand: ['#f6ecdd', '#ead9c1'],
    sea: ['#dff1ef', '#bfe3df'],
    peach: ['#fbe4d6', '#f6cdb5'],
  }[kind];
  return `
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
    <rect width="800" height="1000" fill="url(#bg)"/>
    <circle cx="610" cy="210" r="120" fill="#fff" opacity=".45"/>
    <circle cx="610" cy="210" r="70" fill="${p.accent}" opacity=".35"/>
    <path d="M0,830 Q120,790 240,830 T480,830 T720,830 T960,830 V1000 H0Z" fill="${p.base}" opacity=".10"/>
    <path d="M0,880 Q120,850 240,880 T480,880 T720,880 T960,880 V1000 H0Z" fill="${p.base}" opacity=".14"/>`;
}

function productSvg(p, variant) {
  let inner;
  const zoom = (g) => `<g transform="translate(400 455) scale(1.3) translate(-400 -455)">${g}</g>`;
  if (variant === 1) inner = background('sand', p) + zoom(shorts(p, 'front'));
  else if (variant === 2) inner = background('sea', p) + zoom(shorts(p, 'back'));
  else {
    // Detalle de la estampa, ampliado
    inner = `<defs><clipPath id="c"><rect width="800" height="1000"/></clipPath></defs>
      <g clip-path="url(#c)"><g transform="translate(-380 -430) scale(2.1)">
        <rect x="100" y="200" width="620" height="540" fill="${p.base}"/>${PATTERNS[p.pattern](p)}
        <rect x="100" y="200" width="620" height="540" fill="url(#sh)"/></g></g>
      <defs><linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>
      <rect x="40" y="900" width="330" height="58" rx="29" fill="#fff" fill-opacity=".92"/>
      <text x="205" y="937" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="24" fill="#0b2a43">Detalle de la estampa</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000" role="img">${inner}</svg>\n`;
}

// ---------------------------------------------------------------------------------------------
// Productos de demostración (los usa scripts/db-seed.js)
// ---------------------------------------------------------------------------------------------
const PRODUCTS = [
  { slug: 'malla-ocean-blue', pattern: 'waves', base: '#1f6fb5', base2: '#0d3c6e', line: '#9fd3f5', waist: '#0a2f57', string: '#e8f3fb', accent: '#46b3e6' },
  { slug: 'malla-black-wave', pattern: 'blackwave', base: '#1a1f27', base2: '#0b0e13', line: '#3fd6c9', line2: '#7ee8ff', waist: '#050709', string: '#3fd6c9', accent: '#3fd6c9' },
  { slug: 'malla-sunset-palm', pattern: 'palm', base: '#f48a5f', base2: '#e2603f', line: '#0f6b66', line2: '#fde7c8', waist: '#b94426', string: '#fde7c8', accent: '#ffb347' },
  { slug: 'malla-coral-reef', pattern: 'stripes', base: '#f26b5b', base2: '#d9483a', line: '#fff3e2', line2: '#103a5c', waist: '#a52f26', string: '#fff3e2', accent: '#ff8f7e' },
  { slug: 'malla-salt-sage', pattern: 'panel', base: '#a9c0a4', base2: '#82a08a', line: '#f6efe3', line2: '#274c45', waist: '#4d6b5c', string: '#f6efe3', accent: '#8fbf9f' },
  { slug: 'malla-deep-teal', pattern: 'dots', base: '#13817a', base2: '#0a4f4d', line: '#f3e6cf', waist: '#073836', string: '#f3e6cf', accent: '#2ec4b6' },
];

for (const p of PRODUCTS) {
  [1, 2, 3].forEach((v) => fs.writeFileSync(path.join(productsOut, `${p.slug}-${v}.svg`), productSvg(p, v)));
}

// ---------------------------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------------------------
function wave(y, amp, len, phase, w = 1800) {
  let d = `M-100,${y}`;
  for (let x = -100; x <= w; x += len) {
    d += ` Q${x + len / 4},${y - amp * Math.sin(phase)} ${x + len / 2},${y} T${x + len},${y}`;
  }
  return d + ' V1000 H-100Z';
}
const hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Atardecer sobre el mar">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe9ee"/><stop offset=".45" stop-color="#fbe6d0"/><stop offset=".75" stop-color="#ffc59c"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#ff8a5c" stop-opacity=".9"/><stop offset="1" stop-color="#ff8a5c" stop-opacity="0"/></radialGradient>
    <linearGradient id="s1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb6b6"/><stop offset="1" stop-color="#1f8a95"/></linearGradient>
    <linearGradient id="s2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f7fa0"/><stop offset="1" stop-color="#134f78"/></linearGradient>
    <linearGradient id="s3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14537e"/><stop offset="1" stop-color="#0a2d4d"/></linearGradient>
    <linearGradient id="s4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c365a"/><stop offset="1" stop-color="#06182c"/></linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#sky)"/>
  <circle cx="1180" cy="520" r="360" fill="url(#glow)"/>
  <circle cx="1180" cy="520" r="132" fill="#ff7a52"/>
  <circle cx="1180" cy="520" r="132" fill="#ffd9a8" opacity=".35"/>
  <path d="M-100,600 H1800 V1000 H-100Z" fill="url(#s1)"/>
  <path d="${wave(640, 22, 380, 1)}" fill="url(#s1)"/>
  <path d="${wave(720, 34, 520, 1)}" fill="url(#s2)"/>
  <path d="M-100,742 Q150,700 360,742 T800,742 T1240,742 T1680,742" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>
  <path d="${wave(820, 48, 640, 1)}" fill="url(#s3)"/>
  <path d="M-100,846 Q220,790 540,846 T1180,846 T1820,846" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="7" stroke-linecap="round"/>
  <path d="${wave(920, 56, 760, 1)}" fill="url(#s4)"/>
  <path d="M-100,944 Q280,884 660,944 T1420,944 T2180,944" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="6" stroke-linecap="round"/>
</svg>\n`;
fs.writeFileSync(path.join(out, 'hero.svg'), hero);

// ---------------------------------------------------------------------------------------------
// Logo + favicon
// ---------------------------------------------------------------------------------------------
const mark = (stroke) => `<path d="M6 24 C 10 16, 16 16, 20 24 S 30 32, 34 24 S 44 16, 48 24" fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>
  <path d="M6 36 C 10 28, 16 28, 20 36 S 30 44, 34 36 S 44 28, 48 36" fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round" opacity=".55"/>`;
fs.writeFileSync(path.join(out, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 60"><rect width="54" height="60" rx="14" fill="#0b2a43"/><g transform="translate(0 -1)">${mark('#f6ecdd')}</g></svg>\n`);
fs.writeFileSync(path.join(out, 'logo-mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 60" fill="none">${mark('currentColor')}</svg>\n`);

// ---------------------------------------------------------------------------------------------
// Imagen para compartir en redes (Open Graph) 1200x630
// ---------------------------------------------------------------------------------------------
(async () => {
  try {
    const sharp = require('sharp');
    const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1600 840" preserveAspectRatio="xMidYMax slice">
      ${hero.replace(/<svg[^>]*>/, '').replace('</svg>', '')}
      <rect x="120" y="170" width="520" height="14" rx="7" fill="#0b2a43" opacity=".0"/>
    </svg>`;
    await sharp(Buffer.from(og)).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(out, 'og-default.jpg'));
    console.log('Ilustraciones generadas en public/img');
  } catch (err) {
    console.warn('No se pudo generar og-default.jpg:', err.message);
  }
})();
