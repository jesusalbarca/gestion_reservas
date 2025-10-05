// db.js
const fs = require('fs').promises;
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'db.json');

async function readDB() {
  try {
    const txt = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { meta: {}, pistas: [], usuarios: [], reservas: [] };
    }
    throw err;
  }
}

async function writeDB(data) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

// Util id simple
function makeId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* Exported API */
module.exports = {
  async getPistas() {
    const db = await readDB();
    return db.pistas || [];
  },
  async addPista({ nombre, descripcion }) {
    const db = await readDB();
    const pista = { id: makeId('PISTA_'), nombre, descripcion: descripcion || '', createdAt: new Date().toISOString() };
    db.pistas = db.pistas || [];
    db.pistas.push(pista);
    await writeDB(db);
    return pista;
  },
  async getUsuarios() {
    const db = await readDB();
    return db.usuarios || [];
  },
  async addUsuario({ nombre, email }) {
    const db = await readDB();
    const user = { id: makeId('USR_'), nombre, email, createdAt: new Date().toISOString() };
    db.usuarios = db.usuarios || [];
    db.usuarios.push(user);
    await writeDB(db);
    return user;
  },
  async getReservas() {
    const db = await readDB();
    return db.reservas || [];
  },
  async getReservasByPista(pistaId) {
    const db = await readDB();
    return (db.reservas || []).filter(r => r.pistaId === pistaId);
  },
  async addReserva({ pistaId, startISO, endISO, nombre, telefono, email }) {
    const db = await readDB();
    db.reservas = db.reservas || [];

    // Comprobación simple de solapamientos: same pista
    const newStart = new Date(startISO).toISOString();
    const newEnd = new Date(endISO).toISOString();
    const conflicts = db.reservas.filter(r => r.pistaId === pistaId && (newStart < r.end && newEnd > r.start));
    if (conflicts.length > 0) {
      const err = new Error('Conflicto de reserva (solapamiento) con otra reserva en la misma pista.');
      err.code = 'CONFLICT';
      throw err;
    }

    const reserva = {
      id: makeId('RES_'),
      pistaId,
      start: newStart,
      end: newEnd,
      nombre,
      telefono,
      email,
      createdAt: new Date().toISOString()
    };
    db.reservas.push(reserva);
    await writeDB(db);
    return reserva;
  },
  async deleteReserva(id) {
    const db = await readDB();
    const before = (db.reservas || []).length;
    db.reservas = (db.reservas || []).filter(r => r.id !== id);
    await writeDB(db);
    return before !== db.reservas.length;
  },
  // Exponer lectura/escritura bruta si hace falta
  async raw() {
    return await readDB();
  },
  async saveRaw(data) {
    await writeDB(data);
    return true;
  }
};
