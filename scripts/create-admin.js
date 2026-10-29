'use strict';
/**
 * Crea (o actualiza la contraseña de) un usuario administrador.
 *
 *   npm run admin:create                                  -> pregunta email y contraseña
 *   npm run admin:create -- tu@email.com "ClaveSegura123" -> sin preguntas
 *
 * La contraseña se guarda con scrypt (nunca en texto plano).
 */
const readline = require('readline');
const { getDb, closeDb } = require('../src/db');
const auth = require('../src/services/auth');

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write(''); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

(async () => {
  getDb();
  let [email, password] = process.argv.slice(2);
  if (!email) email = await ask('Email del administrador: ');
  if (!password) password = await ask('Contraseña (mínimo 10 caracteres, con letras y números): ', { hidden: true });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Email inválido.');
    process.exit(1);
  }
  const problem = auth.validatePasswordStrength(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  const existing = auth.admins.findByEmail(email);
  if (existing) {
    auth.admins.setPassword(existing.id, password);
    console.log(`Se actualizó la contraseña de ${existing.email}.`);
  } else {
    auth.admins.create({ email, name: 'Administrador', password });
    console.log(`Administrador creado: ${email.toLowerCase()}`);
  }
  closeDb();
})();
