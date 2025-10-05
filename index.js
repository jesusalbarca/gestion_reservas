// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

// Servir cliente estático desde /public
app.use(express.static(path.join(__dirname, 'public')));

/* ---- RUTAS PÚBLICAS (cliente) ---- */

// Listar pistas
app.get('/api/pistas', async (req, res) => {
  const pistas = await db.getPistas();
  res.json(pistas);
});

// Obtener reservas (opcional filter por pistaId o date)
app.get('/api/reservas', async (req, res) => {
  const { pistaId, date } = req.query;
  let reservas = await db.getReservas();

  if (pistaId) reservas = reservas.filter(r => r.pistaId === pistaId);

  if (date) {
    // Filtrar reservas que caen en la fecha (date 'YYYY-MM-DD' en zona local del servidor)
    reservas = reservas.filter(r => {
      const s = new Date(r.start);
      const y = s.getFullYear();
      const m = ('' + (s.getMonth() + 1)).padStart(2, '0');
      const d = ('' + s.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}` === date;
    });
  }

  res.json(reservas);
});

// Crear reserva (cliente)
app.post('/api/reservas', async (req, res) => {
  try {
    const { pistaId, start, end, nombre, telefono, email } = req.body;
    if (!pistaId || !start || !end || !nombre) {
      return res.status(400).json({ error: 'Falta campo requerido (pistaId/start/end/nombre).' });
    }

    // Validación básica de fechas
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s >= e) {
      return res.status(400).json({ error: 'Fechas inválidas (start >= end o formato incorrecto).' });
    }

    // Aquí se podría comprobar duración mínima/máxima; por defecto no.
    const reserva = await db.addReserva({ pistaId, startISO: s.toISOString(), endISO: e.toISOString(), nombre, telefono, email });
    res.status(201).json(reserva);
  } catch (err) {
    if (err.code === 'CONFLICT') return res.status(409).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Error interno al crear reserva.' });
  }
});

/* ---- RUTAS ADMIN (mínimas) ---- */

// Listar todas las reservas (admin)
app.get('/api/admin/reservas', async (req, res) => {
  const reservas = await db.getReservas();
  res.json(reservas);
});

// Crear pista (admin)
app.post('/api/admin/pistas', async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const pista = await db.addPista({ nombre, descripcion });
  res.status(201).json(pista);
});

// Borrar reserva (admin)
app.delete('/api/admin/reservas/:id', async (req, res) => {
  const ok = await db.deleteReserva(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Reserva no encontrada' });
  res.status(204).send();
});

// Endpoint simple para chequear estado
app.get('/api/status', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'dev', timezone: 'Europe/Madrid' });
});

/* ---- fallback: SPA index (opcional) ---- */
app.get('*', (req, res, next) => {
  // Si ya intentamos servir archivos estáticos, dejamos pasar.
  res.status(404).json({ error: 'Ruta no encontrada' });
});

/* ---- arrancar servidor ---- */
app.listen(PORT, () => {
  console.log(`Servidor arrancado en http://localhost:${PORT}`);
  console.log('Cliente disponible en: http://localhost:' + PORT + '/index.html');
});
