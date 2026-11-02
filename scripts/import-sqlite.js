'use strict';
/**
 * Pasa tu base SQLite anterior (data/marea.db) a la base nueva: productos, stock, pedidos, administradores
 * y configuración, con los mismos números. Si hay Supabase Storage configurado, sube también tus fotos.
 *
 *   npm run db:import-sqlite              -> importa data/marea.db a la base de DATABASE_URL (o a la local)
 *   npm run db:import-sqlite -- ruta.db   -> otro archivo
 *   npm run db:import-sqlite -- --force   -> importa aunque el destino ya tenga datos (fallan los duplicados)
 */
const db = require('../src/db');
const config = require('../src/config');
const { importFromSqlite } = require('../src/db/import-sqlite');

(async () => {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) || config.legacySqlitePath;
  const force = args.includes('--force');
  console.log(`Origen:  ${file}`);
  console.log(`Destino: ${config.databaseUrl ? 'PostgreSQL (DATABASE_URL)' : config.pgliteDir}`);
  console.log(`Fotos:   ${require('../src/services/storage').useSupabase ? 'Supabase Storage' : 'carpeta local (se dejan como están)'}`);
  const r = await importFromSqlite({ file, force });
  if (r.skipped) console.log(`\nNo se importó nada. ${r.reason}`);
  else console.log(`\nListo: ${r.products} productos y ${r.orders} pedidos importados.`);
  await db.close();
})().catch((err) => { console.error('Error:', err.message); process.exit(1); });
