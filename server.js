'use strict';
const config = require('./src/config');
const { createApp } = require('./src/app');
const { closeDb } = require('./src/db');

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`MAREA Surfwear lista. Abrí http://localhost:${config.port}  (panel: http://localhost:${config.port}/admin)`);
  if (config.isProduction) console.log(`Modo producción. URL pública configurada: ${config.siteUrl}`);
});

function shutdown() {
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
