// Adapte l'application Express (server.js) au format "fonction serverless"
// attendu par Netlify. Toutes les routes /api/* définies dans server.js
// sont exposées via /.netlify/functions/api/* (redirigé en /api/* par
// netlify.toml).
const serverless = require('serverless-http');
const app = require('../../server');

exports.handler = serverless(app);
