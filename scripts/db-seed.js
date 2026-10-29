'use strict';
/**
 * Datos iniciales:
 *  - Categoría "Mallas" y talles XS–XXL (siempre, si no existen).
 *  - Productos de DEMOSTRACIÓN (solo si la tienda no tiene ningún producto).
 *    Borralos o editalos desde el panel de administración.
 *
 *  node scripts/db-seed.js            -> categoría, talles y demo (si no hay productos)
 *  node scripts/db-seed.js --no-demo  -> solo categoría y talles
 */
const { getDb, closeDb } = require('../src/db');
const products = require('../src/repositories/products');
const { categories, sizes } = require('../src/repositories/catalog-lookups');

const withDemo = !process.argv.includes('--no-demo');
const db = getDb();

const mallas = categories.findOrCreate('Mallas');
for (const s of ['XS', 'S', 'M', 'L', 'XL', 'XXL']) sizes.findOrCreate(s);

const DEMO = [
  {
    slug: 'malla-ocean-blue', color: 'Azul', name: 'Malla Ocean Blue', price: 45000, featured: true,
    short: 'Boardshort azul océano con estampa de olas. Secado rápido y calce cómodo.',
    desc: 'Pensada para pasar el día entero en el agua. La estampa Ocean Blue juega con distintos tonos de azul y no se desgasta con el sol ni la sal. Cintura elástica con cordón ajustable y bolsillo trasero con cierre de velcro.',
    material: '100% poliéster reciclado, tejido 4-way stretch',
    features: ['Secado ultra rápido', 'Cintura elástica con cordón', 'Bolsillo trasero con velcro', 'Costuras reforzadas', 'Protección UPF 50+'],
    stock: { XS: 2, S: 5, M: 7, L: 3, XL: 0 },
  },
  {
    slug: 'malla-black-wave', color: 'Negro', name: 'Malla Black Wave', price: 50000, featured: true,
    short: 'Negra con olas en verde agua. La favorita para surfear de la mañana a la tarde.',
    desc: 'Negra, liviana y con detalles reflectivos en verde agua. Su corte un poco más largo protege del roce con la tabla y la encerada. Ideal para olas grandes y días de viento.',
    material: '92% poliéster, 8% elastano',
    features: ['Corte largo anti-roce', 'Estampa en alta definición', 'Cierre de velcro y cordón', 'Secado rápido', 'Colores que no destiñen'],
    stock: { S: 4, M: 6, L: 2, XL: 5, XXL: 2 },
  },
  {
    slug: 'malla-sunset-palm', color: 'Coral', name: 'Malla Sunset Palm', price: 47000, featured: true,
    short: 'Coral atardecer con palmeras. Para la playa, el río o la pileta.',
    desc: 'Un diseño veraniego para los que prefieren estar un poco más en la arena. Tela suave, liviana y de secado rápido. Combina con todo.',
    material: '100% poliéster, tejido liviano',
    features: ['Estampa de palmeras', 'Bolsillos laterales con malla', 'Cintura elástica', 'Secado rápido'],
    stock: { XS: 1, S: 2, M: 1, L: 0, XL: 0 },
  },
  {
    slug: 'malla-coral-reef', color: 'Rojo', name: 'Malla Coral Reef', price: 46000, featured: false,
    short: 'Rayas coral y crema, aire retro de los 80.',
    desc: 'Un clásico de playa con rayas diagonales. Corte medio, cintura cómoda y tela resistente al cloro y a la sal.',
    material: '100% poliéster, resistente al cloro',
    features: ['Rayas diagonales', 'Resistente al cloro', 'Cordón ajustable', 'Bolsillo trasero'],
    stock: { S: 8, M: 10, L: 6, XL: 4 },
  },
  {
    slug: 'malla-salt-sage', color: 'Verde', name: 'Malla Salt & Sage', price: 44000, featured: false,
    short: 'Verde salvia con paneles laterales. Minimalista y versátil.',
    desc: 'Tono verde salvia con paneles laterales en crema. Para quienes buscan una malla lisa, elegante y fácil de combinar.',
    material: '88% poliéster reciclado, 12% elastano',
    features: ['Paneles laterales contrastantes', 'Tela elástica 4-way', 'Cintura con cordón', 'Secado rápido'],
    stock: { XS: 3, S: 5, M: 5, L: 5, XL: 2, XXL: 1 },
  },
  {
    slug: 'malla-deep-teal', color: 'Verde', name: 'Malla Deep Teal', price: 48000, featured: false,
    short: 'Verde profundo con puntos arena. Agotada por ahora.',
    desc: 'Verde profundo con pequeños puntos color arena. Una de las más pedidas de la temporada; ya estamos preparando la próxima tanda.',
    material: '100% poliéster, tejido 4-way stretch',
    features: ['Estampa de puntos', 'Cordón ajustable', 'Bolsillo trasero con velcro'],
    stock: { S: 0, M: 0, L: 0, XL: 0 },
  },
];

if (withDemo && products.countAll().total === 0) {
  DEMO.forEach((d, idx) => {
    const id = products.save({
      slug: d.slug, name: d.name, shortDescription: d.short, description: d.desc, material: d.material, color: d.color,
      features: d.features, price: d.price, comparePrice: null, categoryId: mallas.id, active: true, featured: d.featured,
    });
    // Los más nuevos primero: se escalonan las fechas de alta
    db.prepare("UPDATE products SET created_at = datetime('now', ?) WHERE id = ?").run(`-${idx} minutes`, id);
    products.setVariants(id, Object.entries(d.stock).map(([name, stock]) => ({ sizeId: sizes.findByName(name).id, stock })));
    const alts = ['vista frontal', 'vista trasera', 'detalle de la estampa'];
    [1, 2, 3].forEach((n, i) => products.addImage(id, `/img/products/${d.slug}-${n}.svg`, `${d.name} - ${alts[i]}`));
  });
  console.log(`Se cargaron ${DEMO.length} productos de demostración.`);
} else if (withDemo) {
  console.log('La tienda ya tiene productos: no se cargó la demostración.');
}
console.log('Categoría y talles listos.');
closeDb();
