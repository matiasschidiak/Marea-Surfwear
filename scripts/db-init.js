'use strict';
// Crea la base de datos y aplica las migraciones pendientes.
const config = require('../src/config');
const { open, migrate } = require('../src/db');

const db = open();
const applied = migrate(db);
db.close();
console.log(`Base de datos lista en ${config.dbPath}`);
console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'No había migraciones pendientes.');
