// index.js

require('dotenv').config();

const express = require('express');

const cors = require('cors');

const path = require('path');

const nodemailer = require('nodemailer');
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

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || (SMTP_USER || 'reservas@example.com');

let mailTransport = null;
let mailTransportInitPromise = null;

function resetMailTransport() {
  mailTransport = null;
  mailTransportInitPromise = null;
}

async function buildMailTransport() {
  if (!SMTP_HOST) return null;
  const transportConfig = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE
  };
  if (SMTP_USER) {
    let password = SMTP_PASS;
    if (!password) {
      try {
        const settings = await db.getSettings();
        if (settings && typeof settings.smtpPass === 'string' && settings.smtpPass) {
          password = settings.smtpPass;
        }
      } catch (err) {
        console.error('No se pudo cargar SMTP_PASS desde settings', err);
      }
    }
    transportConfig.auth = {
      user: SMTP_USER,
      pass: password || ''
    };
  }
  return nodemailer.createTransport(transportConfig);
}

async function getMailTransport() {
  if (!SMTP_HOST) return null;
  if (mailTransport) return mailTransport;
  if (!mailTransportInitPromise) {
    mailTransportInitPromise = buildMailTransport().catch(err => {
      console.error('No se pudo inicializar el transporte SMTP', err);
      return null;
    });
  }
  mailTransport = await mailTransportInitPromise;
  if (!mailTransport) {
    mailTransportInitPromise = null;
  }
  return mailTransport;
}

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

function isValidEmail(email) {

  if (typeof email !== 'string') return false;

  const trimmed = email.trim();

  if (!trimmed) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

}

function formatReservationWindow(reserva) {

  const startDate = new Date(reserva.start);

  const endDate = new Date(reserva.end);

  const dateFormatter = new Intl.DateTimeFormat('es-ES', {

    timeZone: FACILITY_TZ,

    year: 'numeric',

    month: '2-digit',

    day: '2-digit'

  });

  const timeFormatter = new Intl.DateTimeFormat('es-ES', {

    timeZone: FACILITY_TZ,

    hour: '2-digit',

    minute: '2-digit'

  });

  return {

    dateLabel: dateFormatter.format(startDate),

    startLabel: timeFormatter.format(startDate),

    endLabel: timeFormatter.format(endDate)

  };

}

async function sendReservationNotifications(reserva) {

  const transport = await getMailTransport();

  if (!transport) return;

  try {

    const [adminEmail, pistas] = await Promise.all([

      db.getAdminEmail(),

      db.getPistas()

    ]);

    const pista = pistas.find(p => p.id === reserva.pistaId);

    const pistaLabel = pista ? pista.nombre : reserva.pistaId;

    const { dateLabel, startLabel, endLabel } = formatReservationWindow(reserva);

    const serviceLabel = reserva.tipoCorte || reserva.servicioId || 'Reserva';

    const baseDetails = `Pista: ${pistaLabel}\nServicio: ${serviceLabel}\nFecha: ${dateLabel}\nHorario: ${startLabel} - ${endLabel}`;
    const highlightLine = `Tu reserva ha sido confirmada: ${dateLabel} ${startLabel} - ${endLabel}`;

    const messages = [];

    if (isValidEmail(reserva.email)) {

      const userText = [

        `Hola ${reserva.nombre},`,

        '',

        highlightLine,

        baseDetails,

        '',

        'Gracias por confiar en nosotros.'

      ].join('\n');

      const userHtml = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.5;">
          <p style="margin: 0 0 16px;">Hola ${reserva.nombre},</p>
          <h1 style="margin: 0 0 12px; font-size: 26px; color: #0b5394;">Tu reserva ha sido confirmada</h1>
          <p style="margin: 0 0 16px; font-size: 18px;">
            <strong>${dateLabel}</strong>
            <span style="margin: 0 8px;">·</span>
            <strong>${startLabel} - ${endLabel}</strong>
          </p>
          <p style="margin: 0 0 8px;"><strong>Pista:</strong> ${pistaLabel}</p>
          <p style="margin: 0 0 8px;"><strong>Servicio:</strong> ${serviceLabel}</p>
          <p style="margin: 0 0 8px;"><strong>Fecha:</strong> ${dateLabel}</p>
          <p style="margin: 0 0 16px;"><strong>Horario:</strong> ${startLabel} - ${endLabel}</p>
          <p style="margin: 0;">Gracias por confiar en nosotros.</p>
        </div>
      `;

      messages.push({

        to: reserva.email.trim(),

        subject: `Confirmacion de reserva - ${serviceLabel} (${dateLabel})`,

        text: userText,

        html: userHtml

      });

    }

    if (isValidEmail(adminEmail)) {

      const adminText = [

        'Nueva reserva registrada:',

        baseDetails,

        '',

        `Cliente: ${reserva.nombre}`,

        `Email: ${reserva.email || '-'}`,

        `Telefono: ${reserva.telefono || '-'}`

      ].join('\n');

      messages.push({

        to: adminEmail.trim(),

        subject: `Nueva reserva - ${serviceLabel} (${dateLabel} ${startLabel})`,

        text: adminText

      });

    }

    if (!messages.length) return;

    const sendOps = messages.map(msg => transport.sendMail({

      from: MAIL_FROM,

      ...msg

    }).catch(err => {

      console.error('Error enviando email a', msg.to, err);

    }));

    await Promise.all(sendOps);

  } catch (err) {

    console.error('Error preparando notificaciones de reserva', err);

  }

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

    const pistaIdValue = typeof pistaId === 'string' ? pistaId.trim() : pistaId;

    const dateValue = typeof date === 'string' ? date.trim() : date;

    const startTimeValue = typeof startTime === 'string' ? startTime.trim() : startTime;

    const nombreValue = typeof nombre === 'string' ? nombre.trim() : nombre;

    const telefonoValue = typeof telefono === 'string' ? telefono.trim() : telefono;

    const emailValue = typeof email === 'string' ? email.trim() : email;

    const servicioIdValue = typeof servicioId === 'string' ? servicioId.trim() : '';

    const tipoCorteValue = typeof tipoCorte === 'string' ? tipoCorte.trim() : '';

    if (!pistaIdValue || !dateValue || !startTimeValue || !nombreValue) {

      return res.status(400).json({ error: 'Falta campo requerido (pistaId/date/startTime/nombre).' });

    }

    if (!servicioIdValue) {

      return res.status(400).json({ error: 'Falta seleccionar el tipo de servicio.' });

    }

    if (!isValidDate(dateValue)) {

      return res.status(400).json({ error: 'Formato de fecha invalido (YYYY-MM-DD).' });

    }

    const todayIso = getTodayIsoDate(FACILITY_TZ);

    if (dateValue < todayIso) {

      return res.status(400).json({ error: 'La fecha debe ser igual o posterior a la fecha actual del centro.' });

    }

    if (!isValidTime(startTimeValue)) {

      return res.status(400).json({ error: 'Formato de hora invalido (HH:mm).' });

    }

    const duration = Number(durationMin);

    if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION || duration % DURATION_STEP !== 0) {

      return res.status(400).json({ error: `Duracion invalida (min ${MIN_DURATION}, max ${MAX_DURATION}, multiplos de ${DURATION_STEP}).` });

    }

    const start = zonedDateTimeToUtc(dateValue, startTimeValue, FACILITY_TZ);

    const end = new Date(start.getTime() + duration * 60000);

    if (start >= end) {

      return res.status(400).json({ error: 'Fechas invalidas (start >= end).' });

    }

    const reserva = await db.addReserva({

      pistaId: pistaIdValue,

      startISO: start.toISOString(),

      endISO: end.toISOString(),

      nombre: nombreValue,

      telefono: telefonoValue,

      email: emailValue,

      servicioId: servicioIdValue,

      tipoCorte: tipoCorteValue || servicioIdValue,

      date: dateValue,

      startTime: startTimeValue,

      durationMin: duration,

      timezone: FACILITY_TZ

    });

    res.status(201).json(reserva);
    sendReservationNotifications(reserva).catch(err => {
      console.error('No se pudieron enviar las notificaciones de reserva', err);
    });

  } catch (err) {

    if (err.code === 'CONFLICT') return res.status(409).json({ error: err.message });

    if (err.code === 'INVALID_PISTA') return res.status(400).json({ error: err.message });

    console.error(err);

    res.status(500).json({ error: 'Error interno al crear reserva.' });

  }

});

/* ---- RUTAS ADMIN (minimas) ---- */

app.use('/api/admin', requireAdminAuth);

app.get('/api/admin/settings', async (req, res) => {

  const settings = await db.getSettings();

  res.json(settings);

});

app.put('/api/admin/settings', async (req, res) => {

  const body = req.body || {};
  const hasAdminEmail = Object.prototype.hasOwnProperty.call(body, 'adminEmail');
  const hasSmtpPass = Object.prototype.hasOwnProperty.call(body, 'smtpPass');

  if (!hasAdminEmail && !hasSmtpPass) {
    return res.status(400).json({ error: 'No se proporcionaron ajustes para actualizar.' });
  }

  const payload = {};

  if (hasAdminEmail) {
    const normalizedEmail = typeof body.adminEmail === 'string' ? body.adminEmail.trim() : '';
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Email de administrador invalido.' });
    }
    payload.adminEmail = normalizedEmail;
  }

  if (hasSmtpPass) {
    payload.smtpPass = typeof body.smtpPass === 'string' ? body.smtpPass : '';
  }

  const settings = await db.setSettings(payload);

  if (hasSmtpPass) {
    resetMailTransport();
  }

  res.json(settings);

});

app.get('/api/admin/reservas', async (req, res) => {

  const reservas = await db.getReservas();

  res.json(reservas);

});

app.delete('/api/admin/reservas/pasadas', async (req, res) => {

  const todayIso = getTodayIsoDate(FACILITY_TZ);

  const result = await db.deleteReservasBeforeDate(todayIso, FACILITY_TZ);

  res.json(result);

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

function startServer(port = PORT) {

  const server = app.listen(port, () => {

    if (NODE_ENV === 'test') return;

    const address = server.address();

    const actualPort = typeof address === 'object' && address ? address.port : port;

    console.log(`Servidor arrancado en http://localhost:${actualPort}`);

    console.log('Cliente disponible en: http://localhost:' + actualPort + '/index.html');

  });

  return server;

}

if (require.main === module) {

  startServer();

}

module.exports = {

  app,

  startServer

};

