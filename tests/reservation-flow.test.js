process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

const db = require('../db');
const { startServer } = require('../index');

function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

test('reserva API persiste email admin y crea reservas', async (t) => {
  const originalDb = cloneDeep(await db.raw());
  const server = startServer(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.saveRaw(originalDb);
  });

  const settingsRes = await fetch(`${baseUrl}/api/admin/settings`);
  assert.strictEqual(settingsRes.status, 200);
  const settingsBody = await settingsRes.json();
  assert.ok(settingsBody);
  assert.ok(Object.prototype.hasOwnProperty.call(settingsBody, 'adminEmail'));
  assert.ok(Object.prototype.hasOwnProperty.call(settingsBody, 'smtpPass'));
  assert.strictEqual(settingsBody.smtpPass, '');

  const testAdminEmail = 'admin+test@example.com';
  const testSmtpPass = 'smtp-test-secret';
  const updateRes = await fetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      adminEmail: testAdminEmail,
      smtpPass: testSmtpPass
    })
  });
  assert.strictEqual(updateRes.status, 200);
  const updateBody = await updateRes.json();
  assert.strictEqual(updateBody.adminEmail, testAdminEmail);
  assert.strictEqual(updateBody.smtpPass, testSmtpPass);

  const persistedSettings = await db.getSettings();
  assert.strictEqual(persistedSettings.smtpPass, testSmtpPass);

  let pistaId;
  const pistas = await db.getPistas();
  if (pistas.length === 0) {
    const nuevaPista = await db.addPista({ nombre: 'Pista Test', descripcion: 'Temporal' });
    pistaId = nuevaPista.id;
  } else {
    pistaId = pistas[0].id;
  }
  assert.ok(pistaId, 'Debe existir alguna pista para crear reservas');

  const reservaPayload = {
    pistaId,
    date: '2099-12-31',
    startTime: '10:00',
    durationMin: 60,
    nombre: 'Test User',
    telefono: '600000000',
    email: 'user@example.com',
    servicioId: 'test-service'
  };
  const reservaRes = await fetch(`${baseUrl}/api/reservas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reservaPayload)
  });
  assert.strictEqual(reservaRes.status, 201);
  const reservaBody = await reservaRes.json();
  assert.strictEqual(reservaBody.nombre, reservaPayload.nombre);
  assert.strictEqual(reservaBody.servicioId, reservaPayload.servicioId);
  assert.strictEqual(reservaBody.tipoCorte, reservaPayload.servicioId);

  const reservasRes = await fetch(`${baseUrl}/api/admin/reservas`);
  assert.strictEqual(reservasRes.status, 200);
  const reservasBody = await reservasRes.json();
  assert.ok(Array.isArray(reservasBody));
  assert.ok(reservasBody.some(r => r.id === reservaBody.id));
});
