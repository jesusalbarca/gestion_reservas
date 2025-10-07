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

let reservaWriteQueue = Promise.resolve();

function withReservaWriteLock(task) {
  const run = reservaWriteQueue.then(() => task());
  reservaWriteQueue = run.catch(() => {});
  return run;
}

function makeId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

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

  async deletePista(id) {
    const db = await readDB();
    const before = (db.pistas || []).length;
    db.pistas = (db.pistas || []).filter(p => p.id !== id);
    if (before === db.pistas.length) {
      return false;
    }
    db.reservas = (db.reservas || []).filter(r => r.pistaId !== id);
    await writeDB(db);
    return true;
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
  async addReserva({ pistaId, startISO, endISO, nombre, telefono, email, servicioId, tipoCorte, date, startTime, durationMin, timezone }) {
    return withReservaWriteLock(async () => {
      const db = await readDB();
      db.reservas = db.reservas || [];
      db.pistas = db.pistas || [];

      if (!db.pistas.some(p => p.id === pistaId)) {
        const err = new Error('La pista indicada no existe.');
        err.code = 'INVALID_PISTA';
        throw err;
      }

      const newStart = startISO;
      const newEnd = endISO;
      const conflicts = db.reservas.filter(r => {
        if (r.pistaId !== pistaId) return false;
        if (r.date && date && r.date !== date) return false;
        return newStart < r.end && newEnd > r.start;
      });
      if (conflicts.length > 0) {
        const err = new Error('Conflicto de reserva (solapamiento) con otra reserva en la misma pista.');
        err.code = 'CONFLICT';
        throw err;
      }

      const reserva = {
        id: makeId('RES_'),
        pistaId,
        servicioId: servicioId || null,
        tipoCorte: tipoCorte || null,
        date,
        startTime,
        durationMin,
        start: newStart,
        end: newEnd,
        nombre,
        telefono,
        email,
        timezone: timezone || 'Europe/Madrid',
        createdAt: new Date().toISOString()
      };
      db.reservas.push(reserva);
      await writeDB(db);
      return reserva;
    });
  },
  async deleteReserva(id) {
    const db = await readDB();
    const before = (db.reservas || []).length;
    db.reservas = (db.reservas || []).filter(r => r.id !== id);
    await writeDB(db);
    return before !== db.reservas.length;
  },
  async getSettings() {
    const db = await readDB();
    const meta = db.meta || {};
    return {
      adminEmail: typeof meta.adminEmail === 'string' ? meta.adminEmail : '',
      smtpPass: typeof meta.smtpPass === 'string' ? meta.smtpPass : ''
    };
  },
  async getAdminEmail() {
    const settings = await this.getSettings();
    return settings.adminEmail;
  },
  async setSettings(partial = {}) {
    const db = await readDB();
    db.meta = db.meta || {};
    if (Object.prototype.hasOwnProperty.call(partial, 'adminEmail')) {
      db.meta.adminEmail = typeof partial.adminEmail === 'string'
        ? partial.adminEmail.trim()
        : '';
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'smtpPass')) {
      db.meta.smtpPass = typeof partial.smtpPass === 'string'
        ? partial.smtpPass
        : '';
    }
    await writeDB(db);
    return {
      adminEmail: typeof db.meta.adminEmail === 'string' ? db.meta.adminEmail : '',
      smtpPass: typeof db.meta.smtpPass === 'string' ? db.meta.smtpPass : ''
    };
  },
  async setAdminEmail(adminEmail) {
    return this.setSettings({ adminEmail });
  },
  async raw() {
    return await readDB();
  },
  async saveRaw(data) {
    await writeDB(data);
    return true;
  }
};


