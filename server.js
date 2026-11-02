'use strict';
// Arranque local / servidores tradicionales (Render, VPS). En Vercel se usa api/index.js.
const config = require('./src/config');
const { createApp } = require('./src/app');
const { ensureReady } = require('./src/bootstrap');
const db = require('./src/db');

(async () => {
  await ensureReady(); // migraciones, datos básicos, administrador inicial; falla acá si la base no responde
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`MAREA Surfwear lista. Abrí http://localhost:${config.port}  (panel: http://localhost:${config.port}/admin)`);
    console.log(config.databaseUrl ? 'Base de datos: PostgreSQL (DATABASE_URL)' : `Base de datos local: ${config.pgliteDir}`);
    if (config.isProduction) console.log(`Modo producción. URL pública configurada: ${config.siteUrl}`);
  });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((err) => {
  console.error('No se pudo iniciar la tienda:', err.message);
  process.exit(1);
});
