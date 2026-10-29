'use strict';
/**
 * Arranque para plataformas como Render, donde no hay una consola para
 * preparar la base a mano antes del primer inicio.
 *
 *  1. Aplica las migraciones pendientes.
 *  2. Crea la categoría y los talles (y los productos demo solo si SEED_DEMO=1).
 *  3. Si todavía no hay ningún administrador y están ADMIN_EMAIL y
 *     ADMIN_PASSWORD, lo crea. Si ya existe alguno, no toca nada: la
 *     contraseña se sigue cambiando desde el panel.
 *  4. Inicia el servidor.
 *
 * Es seguro ejecutarlo en cada inicio.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const run = (script, args = []) =>
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });

run('db-init.js');
run('db-seed.js', process.env.SEED_DEMO === '1' ? [] : ['--no-demo']);

const auth = require('../src/services/auth');
const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;

if (auth.admins.count() === 0) {
  if (email && password) {
    const problem = auth.validatePasswordStrength(password);
    if (problem) {
      console.error(`No se creó el administrador: ${problem}`);
    } else {
      auth.admins.create({ email, name: 'Administrador', password });
      console.log(`Administrador creado: ${email.toLowerCase()}`);
    }
  } else {
    console.warn('Todavía no hay administrador. Definí ADMIN_EMAIL y ADMIN_PASSWORD y reiniciá el servicio.');
  }
}

require('../server');
