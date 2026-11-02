'use strict';
// Entrada de Vercel: toda petición que no sea un archivo estático de /public llega acá (ver vercel.json).
// Express es una función (req, res), así que se exporta directamente.
const { createApp } = require('../src/app');

module.exports = createApp();
