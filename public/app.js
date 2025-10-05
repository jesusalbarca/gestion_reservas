// public/app.js
// Client and admin behaviour for the booking prototype
const API_BASE = '/api';
const FACILITY_TZ = 'Europe/Madrid';
const facilityDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FACILITY_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
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

function getFacilityDateParts(date) {
  const parts = facilityDateFormatter.formatToParts(date);
  const result = { year: '0000', month: '00', day: '00' };
  for (const part of parts) {
    if (part.type === 'year') result.year = part.value;
    if (part.type === 'month') result.month = part.value;
    if (part.type === 'day') result.day = part.value;
  }
  return result;
}

function startOfDay(date) {
  const { year, month, day } = getFacilityDateParts(date);
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function toISODate(date) {
  const { year, month, day } = getFacilityDateParts(date);
  return `${year}-${month}-${day}`;
}

function facilityStartOfDay(date) {
  const isoDate = toISODate(date);
  return zonedDateTimeToUtc(isoDate, '00:00', FACILITY_TZ);
}

function isSameDay(a, b) {
  return toISODate(a) === toISODate(b);
}

/* ----------------- CLIENT ----------------- */
async function initClient() {
  const pistaSelect = document.getElementById('pistaSelect');
  const dateInput = document.getElementById('dateInput');
  const btnLoad = document.getElementById('btnLoad');
  const dayStrip = document.getElementById('dayStrip');
  const btnPrevDays = document.getElementById('btnPrevDays');
  const btnNextDays = document.getElementById('btnNextDays');
  const onlyAvailableToggle = document.getElementById('onlyAvailableToggle');
  const hoursGrid = document.getElementById('hoursGrid');
  const calendarTitle = document.getElementById('calendarTitle');
  const calendarSubtitle = document.getElementById('calendarSubtitle');
  const reserveForm = document.getElementById('reserveForm');
  const resPista = document.getElementById('resPista');
  const resStartSelect = document.getElementById('resStart');
  const selectedHourDisplay = document.getElementById('selectedHourDisplay');
  const formMsg = document.getElementById('formMsg');

  const weekdayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: FACILITY_TZ });
  const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: FACILITY_TZ });
  const titleFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: FACILITY_TZ });

  const today = facilityStartOfDay(new Date());
  const todayIso = toISODate(today);
  const hourDisplayDefault = selectedHourDisplay ? selectedHourDisplay.textContent : '';
  let stripStartDate = today;
  let selectedDate = today;
  let selectedHour = '';

  populateStartOptions(resStartSelect);
  resStartSelect.selectedIndex = -1;

  setDateInputMin();

  const pistas = await fetch(API_BASE + '/pistas').then(r => r.json());
  pistaSelect.innerHTML = '';
  pistas.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nombre;
    pistaSelect.appendChild(opt);
  });

  if (pistas.length > 0) {
    pistaSelect.value = pistas[0].id;
    resPista.value = pistas[0].id;
  }

  syncDateInput();

  function clampToToday(date) {
    return date < today ? today : date;
  }

  function setDateInputMin() {
    if (dateInput) {
      dateInput.min = todayIso;
    }
  }

  function syncDateInput() {
    if (!dateInput) return '';
    const iso = toISODate(selectedDate);
    if (dateInput.value !== iso) {
      dateInput.value = iso;
    }
    return iso;
  }

  function adoptDateInputValue() {
    if (!dateInput || !dateInput.value) return false;
    const parsed = new Date(dateInput.value + 'T00:00:00');
    if (Number.isNaN(parsed.valueOf())) return false;
    selectedDate = clampToToday(facilityStartOfDay(parsed));
    if (selectedDate < stripStartDate || selectedDate > addDays(stripStartDate, 6)) {
      stripStartDate = selectedDate;
    }
    stripStartDate = clampToToday(stripStartDate);
    syncDateInput();
    return true;
  }

  pistaSelect.addEventListener('change', () => {
    resPista.value = pistaSelect.value;
    clearSelectedHour();
    loadCalendar();
  });
  btnLoad.addEventListener('click', () => {
    if (adoptDateInputValue()) {
      renderDayStrip();
      clearSelectedHour();
    }
    loadCalendar();
  });
  dateInput.addEventListener('change', () => {
    if (adoptDateInputValue()) {
      renderDayStrip();
      clearSelectedHour();
      loadCalendar();
    }
  });
  onlyAvailableToggle?.addEventListener('change', () => loadCalendar());
  resStartSelect.addEventListener('change', () => {
    const value = resStartSelect.value;
    if (!value) {
      clearSelectedHour();
      return;
    }
    const option = resStartSelect.selectedOptions[0];
    if (option?.disabled) {
      resStartSelect.selectedIndex = -1;
      clearSelectedHour();
      return;
    }
    selectedHour = value;
    updateSelectedHourDisplay();
    updateSelectedHourHighlight();
  });

  btnPrevDays?.addEventListener('click', () => {
    stripStartDate = clampToToday(facilityStartOfDay(addDays(stripStartDate, -7)));
    selectedDate = clampToToday(facilityStartOfDay(addDays(selectedDate, -7)));
    if (selectedDate < stripStartDate) {
      selectedDate = stripStartDate;
    }
    syncDateInput();
    renderDayStrip();
    clearSelectedHour();
    loadCalendar();
  });
  btnNextDays?.addEventListener('click', () => {
    stripStartDate = facilityStartOfDay(addDays(stripStartDate, 7));
    selectedDate = facilityStartOfDay(addDays(selectedDate, 7));
    if (selectedDate < stripStartDate) {
      selectedDate = stripStartDate;
    }
    syncDateInput();
    renderDayStrip();
    clearSelectedHour();
    loadCalendar();
  });

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
        resStartSelect.selectedIndex = -1;
        selectedHour = '';
        setDateInputMin();
        syncDateInput();
        updateSelectedHourDisplay();
        updateSelectedHourHighlight();
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

  function updateSelectedHourDisplay() {
    if (!selectedHourDisplay) return;
    if (selectedHour) {
      selectedHourDisplay.textContent = `Hora seleccionada: ${selectedHour}`;
      selectedHourDisplay.classList.add('is-active');
    } else {
      selectedHourDisplay.textContent = hourDisplayDefault;
      selectedHourDisplay.classList.remove('is-active');
    }
  }

  function updateSelectedHourHighlight() {
    if (!hoursGrid) return;
    const buttons = hoursGrid.querySelectorAll('.slot-btn');
    buttons.forEach(btn => {
      if (btn.dataset.time === selectedHour) {
        btn.classList.add('is-selected');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('is-selected');
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  function clearSelectedHour() {
    selectedHour = '';
    resStartSelect.selectedIndex = -1;
    updateSelectedHourDisplay();
    updateSelectedHourHighlight();
  }

  function renderDayStrip() {
    if (!dayStrip) return;
    dayStrip.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const dayDate = addDays(stripStartDate, i);
      if (dayDate < today) continue;
      const parts = getFacilityDateParts(dayDate);
      const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-pill';
      btn.dataset.date = isoDate;
      const dow = weekdayFormatter.format(dayDate).replace('.', '').toUpperCase();
      const month = monthFormatter.format(dayDate).replace('.', '');
      btn.innerHTML = `<span class="day-pill__dow">${dow}</span><span class="day-pill__day">${parts.day}</span><span class="day-pill__month">${month}</span>`;
      if (isSameDay(dayDate, selectedDate)) {
        btn.classList.add('is-active');
      }
      btn.addEventListener('click', () => {
        selectedDate = facilityStartOfDay(dayDate);
        syncDateInput();
        renderDayStrip();
        clearSelectedHour();
        loadCalendar();
      });
      dayStrip.appendChild(btn);
    }
    if (btnPrevDays) {
      btnPrevDays.disabled = stripStartDate <= today;
    }
  }

  async function loadCalendar() {
    if (!hoursGrid) return;
    const pistaId = pistaSelect.value;
    const date = syncDateInput();
    if (!pistaId || !date) {
      hoursGrid.innerHTML = '<div class="hours-grid__empty">Selecciona una pista para ver la disponibilidad</div>';
      return;
    }

    hoursGrid.innerHTML = '<div class="hours-grid__empty">Cargando disponibilidad...</div>';
    const pistaName = pistaSelect.options[pistaSelect.selectedIndex]?.text || '';
    const titleText = titleFormatter.format(selectedDate).replace(',', '');
    if (calendarTitle) {
      calendarTitle.textContent = titleText.charAt(0).toUpperCase() + titleText.slice(1);
    }
    if (calendarSubtitle) {
      calendarSubtitle.textContent = pistaName ? `Pista seleccionada: ${pistaName}` : '';
    }

    try {
      const reservas = await fetch(`${API_BASE}/reservas?pistaId=${encodeURIComponent(pistaId)}&date=${date}`).then(r => r.json());
      hoursGrid.innerHTML = '';
      const onlyAvailable = onlyAvailableToggle?.checked;
      const availableTimes = new Set();
      const reservedTimes = new Set();

      for (let h = START_HOUR; h < END_HOUR; h++) {
        const hourLabel = String(h).padStart(2, '0');
        const slotStartDate = zonedDateTimeToUtc(date, `${hourLabel}:00`, FACILITY_TZ);
        const slotEndDate = zonedDateTimeToUtc(date, `${hourLabel}:00`, FACILITY_TZ);
        slotEndDate.setHours(slotEndDate.getHours() + 1);
        const slotIsoStart = slotStartDate.toISOString();
        const slotIsoEnd = slotEndDate.toISOString();

        const overlapping = reservas.filter(r => !(slotIsoEnd <= r.start || slotIsoStart >= r.end));
        const isReserved = overlapping.length > 0;
        if (isReserved) {
          reservedTimes.add(`${hourLabel}:00`);
        }
        if (isReserved && onlyAvailable) {
          continue;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot-btn';
        btn.dataset.time = `${hourLabel}:00`;
        btn.textContent = `${hourLabel}:00`;

        if (isReserved) {
          btn.disabled = true;
          btn.classList.add('is-reserved');
          btn.title = overlapping.map(r => `${r.nombre} (${formatFacilityTime(r.start)} - ${formatFacilityTime(r.end)})`).join('\n');
        } else {
          availableTimes.add(btn.dataset.time);
          btn.addEventListener('click', () => {
            selectedHour = btn.dataset.time;
            resStartSelect.value = selectedHour;
            updateSelectedHourDisplay();
            updateSelectedHourHighlight();
          });
        }

        hoursGrid.appendChild(btn);
      }

      if (!hoursGrid.children.length) {
        hoursGrid.innerHTML = '<div class="hours-grid__empty">No hay horarios disponibles para este día</div>';
      }

      updateStartSelectAvailability(resStartSelect, availableTimes, reservedTimes);

      if (selectedHour && !availableTimes.has(selectedHour)) {
        clearSelectedHour();
      } else {
        updateSelectedHourHighlight();
        updateSelectedHourDisplay();
      }
    } catch (err) {
      console.error(err);
      hoursGrid.innerHTML = '<div class="hours-grid__empty">No se pudo cargar la disponibilidad</div>';
    }
  }

  renderDayStrip();
  updateSelectedHourDisplay();
  await loadCalendar();
}

function updateStartSelectAvailability(selectEl, availableTimes, reservedTimes) {
  if (!selectEl) return;
  Array.from(selectEl.options).forEach(opt => {
    if (!opt.value) return;
    if (reservedTimes.has(opt.value)) {
      opt.disabled = true;
      opt.classList.add('is-reserved');
    } else {
      opt.disabled = false;
      opt.classList.remove('is-reserved');
    }
  });
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



