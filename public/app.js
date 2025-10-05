// public/app.js
// Client and admin behaviour for the booking prototype
const API_BASE = '/api';
const FACILITY_TZ = 'Europe/Madrid';
const START_HOUR = 8;
const END_HOUR = 21;

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.id;
  if (page === 'page-client') initClient();
  if (page === 'page-admin') initAdmin();
});

/* --------- time helpers --------- */
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

function formatFacilityTime(iso) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: FACILITY_TZ,
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

function formatFacilityDateTime(iso) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: FACILITY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

function populateStartOptions(select) {
  select.innerHTML = '';
  for (let h = START_HOUR; h < END_HOUR; h++) {
    const value = String(h).padStart(2, '0') + ':00';
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

/* ----------------- CLIENT ----------------- */
async function initClient() {
  const pistaSelect = document.getElementById('pistaSelect');
  const dateInput = document.getElementById('dateInput');
  const btnLoad = document.getElementById('btnLoad');
  const calendarSection = document.getElementById('calendarSection');
  const reserveForm = document.getElementById('reserveForm');
  const resPista = document.getElementById('resPista');
  const resStartSelect = document.getElementById('resStart');
  const formMsg = document.getElementById('formMsg');

  populateStartOptions(resStartSelect);
  if (resStartSelect.options.length > 0) {
    resStartSelect.value = resStartSelect.options[0].value;
  }

  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);

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

  pistaSelect.addEventListener('change', () => {
    resPista.value = pistaSelect.value;
    loadCalendar();
  });
  dateInput.addEventListener('change', () => loadCalendar());
  btnLoad.addEventListener('click', () => loadCalendar());

  reserveForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    formMsg.textContent = '';
    formMsg.style.color = 'crimson';

    const pistaId = resPista.value;
    const name = document.getElementById('resName').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const startTime = resStartSelect.value;
    const durationMin = Number(document.getElementById('resDuration').value);
    const date = dateInput.value;

    if (!pistaId || !name || !startTime || !date) {
      formMsg.textContent = 'Rellena los campos obligatorios';
      return;
    }

    const payload = {
      pistaId,
      date,
      startTime,
      durationMin,
      nombre: name,
      telefono: phone,
      email
    };

    try {
      const resp = await fetch(API_BASE + '/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.status === 201) {
        formMsg.style.color = 'green';
        formMsg.textContent = 'Reserva creada correctamente';
        reserveForm.reset();
        resPista.value = pistaSelect.value;
        if (resStartSelect.options.length > 0) {
          resStartSelect.value = resStartSelect.options[0].value;
        }
        loadCalendar();
      } else {
        const err = await resp.json();
        formMsg.textContent = err.error || 'Error creando reserva';
      }
    } catch (err) {
      console.error(err);
      formMsg.textContent = 'Error de conexion';
    }
  });

  async function loadCalendar() {
    calendarSection.innerHTML = 'Cargando...';
    const pistaId = pistaSelect.value;
    const date = dateInput.value;
    const reservas = await fetch(`${API_BASE}/reservas?pistaId=${encodeURIComponent(pistaId)}&date=${date}`).then(r => r.json());
    calendarSection.innerHTML = '';

    const title = document.createElement('h2');
    const pistaName = pistaSelect.options[pistaSelect.selectedIndex]?.text || '';
    title.textContent = `Pista: ${pistaName} - ${date}`;
    calendarSection.appendChild(title);

    for (let h = START_HOUR; h < END_HOUR; h++) {
      const hourLabel = String(h).padStart(2, '0');
      const slotStartDate = zonedDateTimeToUtc(date, `${hourLabel}:00`, FACILITY_TZ);
      const slotEndDate = zonedDateTimeToUtc(date, `${hourLabel}:00`, FACILITY_TZ);
      slotEndDate.setHours(slotEndDate.getHours() + 1);
      const slotIsoStart = slotStartDate.toISOString();
      const slotIsoEnd = slotEndDate.toISOString();

      const overlapping = reservas.filter(r => !(slotIsoEnd <= r.start || slotIsoStart >= r.end));
      const div = document.createElement('div');
      div.className = 'slot ' + (overlapping.length ? 'reserved' : 'available');
      const timeLabel = document.createElement('div');
      timeLabel.textContent = `${hourLabel}:00 - ${String(h + 1).padStart(2, '0')}:00`;
      div.appendChild(timeLabel);

      if (overlapping.length) {
        const info = document.createElement('div');
        info.innerHTML = overlapping.map(r => `<div><strong>${r.nombre}</strong> (${formatFacilityTime(r.start)} - ${formatFacilityTime(r.end)})</div>`).join('');
        div.appendChild(info);
      } else {
        const info = document.createElement('div');
        info.textContent = 'Libre';
        div.appendChild(info);
      }
      calendarSection.appendChild(div);
    }
  }

  loadCalendar();
}

/* ----------------- ADMIN ----------------- */
async function initAdmin() {
  const pistasForm = document.getElementById('pistaForm');
  const pistaMsg = document.getElementById('pistaMsg');
  const pistasList = document.getElementById('pistasList');
  const reservasList = document.getElementById('reservasList');

  pistasForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    pistaMsg.textContent = '';
    pistaMsg.style.color = 'crimson';
    const nombre = document.getElementById('pistaNombre').value.trim();
    const desc = document.getElementById('pistaDesc').value.trim();
    if (!nombre) {
      pistaMsg.textContent = 'Nombre requerido';
      return;
    }
    try {
      const resp = await fetch(API_BASE + '/admin/pistas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, descripcion: desc })
      });
      if (resp.status === 201) {
        pistaMsg.style.color = 'green';
        pistaMsg.textContent = 'Pista creada';
        document.getElementById('pistaNombre').value = '';
        document.getElementById('pistaDesc').value = '';
        loadPistas();
        loadReservas();
      } else {
        const e = await resp.json();
        pistaMsg.textContent = e.error || 'Error creando pista';
      }
    } catch (err) {
      pistaMsg.textContent = 'Error de conexion';
    }
  });

  async function loadPistas() {
    pistasList.textContent = 'Cargando...';
    const pistas = await fetch(API_BASE + '/admin/pistas').then(r => r.json());
    if (!pistas.length) {
      pistasList.innerHTML = '<div>No hay pistas</div>';
      return;
    }
    const container = document.createElement('div');
    container.innerHTML = pistas.map(p => `<div class="card" style="margin-bottom:8px;">
      <div><strong>${p.nombre}</strong></div>
      <div>${p.descripcion || '-'}</div>
      <div style="margin-top:6px;"><button data-id="${p.id}" class="delPistaBtn">Eliminar</button></div>
    </div>`).join('');
    pistasList.innerHTML = '';
    pistasList.appendChild(container);

    pistasList.querySelectorAll('.delPistaBtn').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if (!confirm('Eliminar pista? Esto tambien elimina sus reservas.')) return;
        const resp = await fetch(API_BASE + '/admin/pistas/' + id, { method: 'DELETE' });
        if (resp.status === 204) {
          loadPistas();
          loadReservas();
        } else {
          alert('No se pudo eliminar la pista');
        }
      });
    });
  }

  async function loadReservas() {
    reservasList.textContent = 'Cargando...';
    const reservas = await fetch(API_BASE + '/admin/reservas').then(r => r.json());
    if (!reservas.length) {
      reservasList.innerHTML = '<div>No hay reservas</div>';
      return;
    }
    const container = document.createElement('div');
    container.innerHTML = reservas.map(r => `<div class="card" style="margin-bottom:8px;">
      <div><strong>${r.nombre}</strong> - ${r.pistaId}</div>
      <div>${formatFacilityDateTime(r.start)} - ${formatFacilityDateTime(r.end)}</div>
      <div>Email: ${r.email || '-'} Tel: ${r.telefono || '-'}</div>
      <div style="margin-top:6px;"><button data-id="${r.id}" class="delBtn">Eliminar</button></div>
    </div>`).join('');
    reservasList.innerHTML = '';
    reservasList.appendChild(container);

    reservasList.querySelectorAll('.delBtn').forEach(btn => {
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

  loadPistas();
  loadReservas();
}



