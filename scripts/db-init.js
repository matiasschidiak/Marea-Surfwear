'use strict';
// Crea las tablas (o las actualiza) en la base configurada: Supabase si hay DATABASE_URL, si no la base local.
const config = require('../src/config');
const db = require('../src/db');

(async () => {
  const applied = await db.init();
  console.log(config.databaseUrl ? 'Base de datos: PostgreSQL (DATABASE_URL)' : `Base de datos local: ${config.pgliteDir}`);
  console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'No había migraciones pendientes.');
  await db.close();
})().catch((err) => { console.error('Error:', err.message); process.exit(1); });
