'use strict';
/**
 * Arranque para servidores tradicionales (Render, VPS) con Supabase. Hace lo mismo que `npm start`:
 * el servidor aplica las migraciones, crea los datos básicos y el administrador inicial
 * (si definís ADMIN_EMAIL y ADMIN_PASSWORD y todavía no hay ninguno) al iniciar.
 * Es seguro ejecutarlo en cada inicio. En Vercel no se usa: allí entra api/index.js.
 */
require('../server');
