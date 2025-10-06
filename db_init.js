// db_init.js
// Ejecuta: node db_init.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const now = new Date().toISOString();
const sample = {
  meta: {
    timezone: 'Europe/Madrid',
    createdAt: now,
    adminEmail: 'admin@demo.local'
  },
  pistas: [
    { id: 'PISTA_01', nombre: 'Pista Futbol Sala', descripcion: 'Pabellon principal', createdAt: now },
    { id: 'PISTA_02', nombre: 'Pista Padel 1', descripcion: 'Exterior', createdAt: now }
  ],
  usuarios: [
    { id: 'USR_1', nombre: 'Admin Demo', email: 'admin@demo.local' }
  ],
  reservas: []
};

fs.writeFileSync(dbFile, JSON.stringify(sample, null, 2), 'utf8');
console.log('DB inicializada en', dbFile);
