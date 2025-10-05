// db_init.js
// Ejecuta: node db_init.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sample = {
  meta: {
    timezone: "Europe/Madrid",
    createdAt: new Date().toISOString()
  },
  pistas: [
    { id: "PISTA_01", nombre: "Pista Fútbol Sala", descripcion: "Pabellón principal", createdAt: new Date().toISOString() },
    { id: "PISTA_02", nombre: "Pista Pádel 1", descripcion: "Exterior", createdAt: new Date().toISOString() }
  ],
  usuarios: [
    { id: "USR_1", nombre: "Admin Demo", email: "admin@demo.local" }
  ],
  reservas: [
    // Un ejemplo: PISTA_02 reservado hoy 1 hora (ajusta en cliente)
  ]
};

fs.writeFileSync(dbFile, JSON.stringify(sample, null, 2), 'utf8');
console.log('DB inicializada en', dbFile);
