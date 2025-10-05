// index.js

require('dotenv').config();

const express = require('express');

const cors = require('cors');

const path = require('path');

const db = require('./db');

const STATIC_DIR = path.join(__dirname, 'public');

const ADMIN_USER = process.env.ADMIN_USER || '';

const ADMIN_PASS = process.env.ADMIN_PASS || '';

const ADMIN_AUTH_REALM = process.env.ADMIN_AUTH_REALM || 'Reservas Admin';

const FORCE_ADMIN_AUTH = process.env.FORCE_ADMIN_AUTH === 'true';

const NODE_ENV = process.env.NODE_ENV || 'development';

const ADMIN_AUTH_ENABLED = Boolean(ADMIN_USER && ADMIN_PASS && (NODE_ENV === 'production' || FORCE_ADMIN_AUTH));

const PORT = process.env.PORT || 3000;

const FACILITY_TZ = 'Europe/Madrid';

const MIN_DURATION = 30;

const MAX_DURATION = 180;

const DURATION_STEP = 15;

function sendAdminAuthChallenge(res, message = 'Autenticacion requerida') {

  res.set('WWW-Authenticate', `Basic realm="${ADMIN_AUTH_REALM}", charset="UTF-8"`);

  return res.status(401).send(message);

}

function requireAdminAuth(req, res, next) {

  if (!ADMIN_AUTH_ENABLED) return next();

  const authHeader = req.headers.authorization || '';

  const [scheme, encoded] = authHeader.split(' ');

  if (scheme !== 'Basic' || !encoded) {

    return sendAdminAuthChallenge(res);

  }

  let decoded = '';

  try {

    decoded = Buffer.from(encoded, 'base64').toString('utf8');

  } catch (err) {

    return sendAdminAuthChallenge(res);

  }

  const separatorIndex = decoded.indexOf(':');

  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;

  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {

    return sendAdminAuthChallenge(res, 'Credenciales invalidas');

  }

  return next();

}

const app = express();

app.use(cors());

app.use(express.json());

app.get('/admin.html', requireAdminAuth, (req, res) => {

  res.sendFile(path.join(STATIC_DIR, 'admin.html'));

});

app.use(express.static(STATIC_DIR));

function getTimeZoneOffsetMinutes(date, timeZone) {

  const dtf = new Intl.DateTimeFormat('en-US', {

    timeZone,

    hourCycle: 'h23',

    year: 'numeric',

    month: '2-digit',

    day: '2-digit',

    hour: '2-digit',

    minute: '2-digit',

    second: '2-digit',

    timeZoneName: 'shortOffset'

  });

  const parts = dtf.formatToParts(date);

  const tzPart = parts.find(part => part.type === 'timeZoneName');

  if (!tzPart) return 0;

  const match = tzPart.value.match(/GMT([+-]\d{2})(?::?(\d{2}))?/);

  if (!match) return 0;

  const sign = match[1][0] === '-' ? -1 : 1;

  const hours = parseInt(match[1].slice(1), 10);

  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  return sign * (hours * 60 + minutes);

}

function zonedDateTimeToUtc(dateStr, timeStr, timeZone) {

  const [year, month, day] = dateStr.split('-').map(Number);

  const [hour, minute] = timeStr.split(':').map(Number);

  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);

  let offsetMinutes = getTimeZoneOffsetMinutes(new Date(naiveUtcMs), timeZone);

  let utcDate = new Date(naiveUtcMs - offsetMinutes * 60000);

  const adjustedOffset = getTimeZoneOffsetMinutes(utcDate, timeZone);

  if (adjustedOffset !== offsetMinutes) {

    offsetMinutes = adjustedOffset;

    utcDate = new Date(naiveUtcMs - offsetMinutes * 60000);

  }

  return utcDate;

}

function isValidDate(date) {

  return /^\d{4}-\d{2}-\d{2}$/.test(date);

}

function isValidTime(time) {

  return /^\d{2}:\d{2}$/.test(time);

}

function getTodayIsoDate(timeZone) {

  return new Intl.DateTimeFormat('en-CA', {

    timeZone,

    year: 'numeric',

    month: '2-digit',

    day: '2-digit'

  }).format(new Date());

}

/* ---- RUTAS PUBLICAS (cliente) ---- */

app.get('/api/pistas', async (req, res) => {

  const pistas = await db.getPistas();

  res.json(pistas);

});

app.get('/api/reservas', async (req, res) => {

  const { pistaId, date } = req.query;

  let reservas = await db.getReservas();

  if (pistaId) reservas = reservas.filter(r => r.pistaId === pistaId);

  if (date) {

    reservas = reservas.filter(r => {

      if (r.date) return r.date === date;

      const s = new Date(r.start);

      return s.toLocaleDateString('en-CA', { timeZone: FACILITY_TZ }) === date;

    });

  }

  res.json(reservas);

});

app.post('/api/reservas', async (req, res) => {

  try {

    const { pistaId, date, startTime, durationMin, nombre, telefono, email, servicioId, tipoCorte } = req.body;

    if (!pistaId || !date || !startTime || !nombre) {

      return res.status(400).json({ error: 'Falta campo requerido (pistaId/date/startTime/nombre).' });

    }

    if (!servicioId || typeof servicioId !== 'string' || !servicioId.trim()) {

      return res.status(400).json({ error: 'Falta seleccionar el tipo de servicio.' });

    }

    if (!isValidDate(date)) {

      return res.status(400).json({ error: 'Formato de fecha invalido (YYYY-MM-DD).' });

    }

    const todayIso = getTodayIsoDate(FACILITY_TZ);

    if (date < todayIso) {

      return res.status(400).json({ error: 'La fecha debe ser igual o posterior a la fecha actual del centro.' });

    }

    if (!isValidTime(startTime)) {

      return res.status(400).json({ error: 'Formato de hora invalido (HH:mm).' });

    }

    const duration = Number(durationMin);

    if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION || duration % DURATION_STEP !== 0) {

      return res.status(400).json({ error: `Duracion invalida (min ${MIN_DURATION}, max ${MAX_DURATION}, multiplos de ${DURATION_STEP}).` });

    }

    const start = zonedDateTimeToUtc(date, startTime, FACILITY_TZ);

    const end = new Date(start.getTime() + duration * 60000);

    if (start >= end) {

      return res.status(400).json({ error: 'Fechas invalidas (start >= end).' });

    }

    const reserva = await db.addReserva({

      pistaId,

      startISO: start.toISOString(),

      endISO: end.toISOString(),

      nombre,

      telefono,

      email,

      servicioId: servicioId.trim(),

      tipoCorte: typeof tipoCorte === 'string' && tipoCorte.trim() ? tipoCorte.trim() : servicioId.trim(),

      date,

      startTime,

      durationMin: duration,

      timezone: FACILITY_TZ

    });

    res.status(201).json(reserva);

  } catch (err) {

    if (err.code === 'CONFLICT') return res.status(409).json({ error: err.message });

    if (err.code === 'INVALID_PISTA') return res.status(400).json({ error: err.message });

    console.error(err);

    res.status(500).json({ error: 'Error interno al crear reserva.' });

  }

});

/* ---- RUTAS ADMIN (minimas) ---- */

app.use('/api/admin', requireAdminAuth);

app.get('/api/admin/reservas', async (req, res) => {

  const reservas = await db.getReservas();

  res.json(reservas);

});

app.get('/api/admin/pistas', async (req, res) => {

  const pistas = await db.getPistas();

  res.json(pistas);

});

app.post('/api/admin/pistas', async (req, res) => {

  const { nombre, descripcion } = req.body;

  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  const pista = await db.addPista({ nombre, descripcion });

  res.status(201).json(pista);

});

app.delete('/api/admin/pistas/:id', async (req, res) => {

  const ok = await db.deletePista(req.params.id);

  if (!ok) return res.status(404).json({ error: 'Pista no encontrada' });

  res.status(204).send();

});

app.delete('/api/admin/reservas/:id', async (req, res) => {

  const ok = await db.deleteReserva(req.params.id);

  if (!ok) return res.status(404).json({ error: 'Reserva no encontrada' });

  res.status(204).send();

});

app.get('/api/status', (req, res) => {

  res.json({ ok: true, env: NODE_ENV || 'dev', timezone: FACILITY_TZ });

});

app.get('*', (req, res) => {

  res.status(404).json({ error: 'Ruta no encontrada' });

});

app.listen(PORT, () => {

  console.log(`Servidor arrancado en http://localhost:${PORT}`);

  console.log('Cliente disponible en: http://localhost:' + PORT + '/index.html');

});

