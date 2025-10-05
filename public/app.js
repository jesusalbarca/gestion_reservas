// public/app.js
// Comportamiento doble: client (id=page-client) y admin (id=page-admin)
const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.id;
  if (page === 'page-client') initClient();
  if (page === 'page-admin') initAdmin();
});

/* ----------------- CLIENT ----------------- */
async function initClient() {
  const pistaSelect = document.getElementById('pistaSelect');
  const dateInput = document.getElementById('dateInput');
  const btnLoad = document.getElementById('btnLoad');
  const calendarSection = document.getElementById('calendarSection');
  const reserveForm = document.getElementById('reserveForm');
  const resPista = document.getElementById('resPista');
  const formMsg = document.getElementById('formMsg');

  // Set default date: hoy
  const hoy = new Date();
  dateInput.value = hoy.toISOString().slice(0,10);

  // Load pistas
  const pistas = await fetch(API_BASE + '/pistas').then(r => r.json());
  pistaSelect.innerHTML = '';
  pistas.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nombre;
    pistaSelect.appendChild(opt);
  });

  if (pistas.length > 0) {
    resPista.value = pistas[0].id;
  }

  pistaSelect.addEventListener('change', () => resPista.value = pistaSelect.value);
  btnLoad.addEventListener('click', () => loadCalendar());

  // Form submit - crear reserva
  reserveForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    formMsg.textContent = '';
    const pistaId = resPista.value;
    const name = document.getElementById('resName').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const startTime = document.getElementById('resStart').value;
    const durationMin = parseInt(document.getElementById('resDuration').value, 10);
    const date = document.getElementById('dateInput').value;
    if (!pistaId || !name || !startTime || !date) {
      formMsg.textContent = 'Rellena los campos obligatorios';
      return;
    }
    const startISO = new Date(date + 'T' + startTime).toISOString();
    const endDate = new Date(new Date(startISO).getTime() + durationMin * 60000);
    const endISO = endDate.toISOString();

    try {
      const resp = await fetch(API_BASE + '/reservas', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ pistaId, start: startISO, end: endISO, nombre: name, telefono: phone, email })
      });
      if (resp.status === 201) {
        formMsg.style.color = 'green';
        formMsg.textContent = 'Reserva creada correctamente';
        reserveForm.reset();
        loadCalendar();
      } else {
        const err = await resp.json();
        formMsg.style.color = 'crimson';
        formMsg.textContent = err.error || 'Error creando reserva';
      }
    } catch (err) {
      formMsg.style.color = 'crimson';
      formMsg.textContent = 'Error de conexión';
      console.error(err);
    }
  });

  // Render calendar: simple lista de slots (8:00 - 21:00)
  async function loadCalendar() {
    calendarSection.innerHTML = 'Cargando...';
    const pistaId = pistaSelect.value;
    const date = dateInput.value;
    const reservas = await fetch(`${API_BASE}/reservas?pistaId=${encodeURIComponent(pistaId)}&date=${date}`).then(r => r.json());
    calendarSection.innerHTML = '';

    const title = document.createElement('h2');
    title.textContent = `Pista: ${pistaSelect.options[pistaSelect.selectedIndex].text} — ${date}`;
    calendarSection.appendChild(title);

    const startHour = 8, endHour = 21;
    for (let h = startHour; h < endHour; h++) {
      const slotStart = new Date(date + 'T' + String(h).padStart(2,'0') + ':00:00');
      const slotEnd = new Date(slotStart.getTime() + 60*60000);

      // find reservations that overlap this slot
      const overlapping = reservas.filter(r => !(slotEnd.toISOString() <= r.start || slotStart.toISOString() >= r.end));
      const div = document.createElement('div');
      div.className = 'slot ' + (overlapping.length ? 'reserved' : 'available');
      const timeLabel = document.createElement('div');
      timeLabel.textContent = `${String(h).padStart(2,'0')}:00 - ${String(h+1).padStart(2,'0')}:00`;
      div.appendChild(timeLabel);

      if (overlapping.length) {
        const info = document.createElement('div');
        info.innerHTML = overlapping.map(r => `<div><strong>${r.nombre}</strong> (${new Date(r.start).toLocaleTimeString()} - ${new Date(r.end).toLocaleTimeString()})</div>`).join('');
        div.appendChild(info);
      } else {
        const info = document.createElement('div');
        info.textContent = 'Libre';
        div.appendChild(info);
      }
      calendarSection.appendChild(div);
    }
  }

  // initial load
  loadCalendar();
}

/* ----------------- ADMIN ----------------- */
async function initAdmin() {
  const pistasForm = document.getElementById('pistaForm');
  const pistaMsg = document.getElementById('pistaMsg');
  const reservasList = document.getElementById('reservasList');

  pistasForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    pistaMsg.textContent = '';
    const nombre = document.getElementById('pistaNombre').value.trim();
    const desc = document.getElementById('pistaDesc').value.trim();
    if (!nombre) { pistaMsg.textContent = 'Nombre requerido'; return; }
    try {
      const resp = await fetch(API_BASE + '/admin/pistas', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ nombre, descripcion: desc })
      });
      if (resp.status === 201) {
        pistaMsg.style.color = 'green';
        pistaMsg.textContent = 'Pista creada';
        document.getElementById('pistaNombre').value = '';
        document.getElementById('pistaDesc').value = '';
        loadReservas();
      } else {
        const e = await resp.json();
        pistaMsg.style.color = 'crimson';
        pistaMsg.textContent = e.error || 'Error creando pista';
      }
    } catch (err) {
      pistaMsg.style.color = 'crimson';
      pistaMsg.textContent = 'Error de conexión';
    }
  });

  async function loadReservas() {
    reservasList.textContent = 'Cargando...';
    const reservas = await fetch(API_BASE + '/admin/reservas').then(r => r.json());
    if (!reservas.length) {
      reservasList.innerHTML = '<div>No hay reservas</div>';
      return;
    }
    const table = document.createElement('div');
    table.innerHTML = reservas.map(r => `<div class="card" style="margin-bottom:8px;">
      <div><strong>${r.nombre}</strong> — ${r.pistaId}</div>
      <div>${new Date(r.start).toLocaleString()} → ${new Date(r.end).toLocaleString()}</div>
      <div>Email: ${r.email || '-'} Tel: ${r.telefono || '-'}</div>
      <div style="margin-top:6px;"><button data-id="${r.id}" class="delBtn">Eliminar</button></div>
    </div>`).join('');
    reservasList.innerHTML = '';
    reservasList.appendChild(table);

    document.querySelectorAll('.delBtn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if (!confirm('Eliminar reserva?')) return;
        const resp = await fetch(API_BASE + '/admin/reservas/' + id, { method: 'DELETE' });
        if (resp.status === 204) {
          loadReservas();
        } else {
          alert('No se pudo eliminar');
        }
      });
    });
  }

  loadReservas();
}
