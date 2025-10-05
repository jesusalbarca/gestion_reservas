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
const defaultClientConfig = {
  startMinutes: 16 * 60,
  endMinutes: 22 * 60,
  slotMinutes: 30,
  services: [
    { id: 'barba', name: 'Barba', durationMin: 30 },
    { id: 'corte', name: 'Corte', durationMin: 60 },
    { id: 'barba-corte', name: 'Barba y corte', durationMin: 90 }
  ]
};
const rawClientConfig = typeof window !== 'undefined' ? window.__PELUQUERIA_CONFIG__ : undefined;
const CLIENT_CONFIG = buildClientConfig(rawClientConfig);
const CLIENT_TIME_SLOTS = buildTimeSlots(CLIENT_CONFIG);
const CLIENT_SLOT_INDEX = new Map(CLIENT_TIME_SLOTS.map((slot, index) => [slot.value, index]));

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

function buildClientConfig(rawConfig = {}) {
  const parsedStart = Number(rawConfig.startMinutes);
  const parsedEnd = Number(rawConfig.endMinutes);
  const parsedSlot = Number(rawConfig.slotMinutes);
  const config = {
    startMinutes: Number.isFinite(parsedStart) ? parsedStart : defaultClientConfig.startMinutes,
    endMinutes: Number.isFinite(parsedEnd) ? parsedEnd : defaultClientConfig.endMinutes,
    slotMinutes: Number.isFinite(parsedSlot) ? parsedSlot : defaultClientConfig.slotMinutes,
    services: defaultClientConfig.services.map(service => ({
      id: service.id,
      name: service.name,
      durationMin: service.durationMin,
      label: `${service.name} (${service.durationMin} min)`
    }))
  };

  if (Array.isArray(rawConfig.services) && rawConfig.services.length) {
    const normalized = rawConfig.services
      .map(service => normalizeServiceConfig(service, config.slotMinutes))
      .filter(Boolean);
    if (normalized.length) {
      config.services = normalized;
    }
  }

  return config;
}

function normalizeServiceConfig(service, fallbackSlotMinutes) {
  if (!service || typeof service !== 'object') return null;
  const id = typeof service.id === 'string' && service.id
    ? service.id
    : typeof service.key === 'string' && service.key
      ? service.key
      : typeof service.name === 'string' && service.name
        ? service.name.toLowerCase().replace(/\s+/g, '-')
        : null;
  if (!id) return null;
  const duration = Number(service.durationMin ?? service.duration ?? service.minutes ?? fallbackSlotMinutes);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : fallbackSlotMinutes;
  const name = typeof service.name === 'string' && service.name.trim().length
    ? service.name.trim()
    : (typeof service.label === 'string' && service.label.trim().length
      ? service.label.trim()
      : id);
  const label = typeof service.label === 'string' && service.label.trim().length
    ? service.label.trim()
    : `${name} (${safeDuration} min)`;

  return { id, name, label, durationMin: safeDuration };
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function buildTimeSlots(config) {
  const slots = [];
  for (let minutes = config.startMinutes; minutes < config.endMinutes; minutes += config.slotMinutes) {
    slots.push({ value: minutesToTime(minutes), minutes });
  }
  return slots;
}

function getServiceById(serviceId) {
  return CLIENT_CONFIG.services.find(service => service.id === serviceId) || null;
}

function getServiceDuration(serviceId) {
  const service = getServiceById(serviceId);
  return service ? service.durationMin : CLIENT_CONFIG.slotMinutes;
}

function getServiceLabel(serviceId) {
  const service = getServiceById(serviceId);
  return service ? service.name : '';
}

function getRequiredSlotCount(durationMin) {
  return Math.max(1, Math.ceil(durationMin / CLIENT_CONFIG.slotMinutes));
}

function isStartTimeAvailableForService(startTime, slotAvailability, serviceId) {
  const durationMin = getServiceDuration(serviceId);
  const requiredSlots = getRequiredSlotCount(durationMin);
  const startIndex = CLIENT_SLOT_INDEX.get(startTime);
  if (startIndex === undefined) return false;
  for (let i = 0; i < requiredSlots; i++) {
    const slot = CLIENT_TIME_SLOTS[startIndex + i];
    if (!slot) return false;
    if (!slotAvailability[slot.value]) return false;
  }
  return true;
}

function populateServiceOptions(select) {
  if (!select) return;
  select.innerHTML = '';
  CLIENT_CONFIG.services.forEach(service => {
    const opt = document.createElement('option');
    opt.value = service.id;
    opt.textContent = service.label;
    opt.dataset.durationMin = service.durationMin;
    select.appendChild(opt);
  });
}

function populateStartOptions(select) {
  select.innerHTML = '';
  CLIENT_TIME_SLOTS.forEach(slot => {
    const opt = document.createElement('option');
    opt.value = slot.value;
    opt.textContent = slot.value;
    select.appendChild(opt);
  });
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
  const resServiceSelect = document.getElementById('resService');
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
  let latestSlotAvailability = {};

  function getDayNavigationStep() {
    return window.matchMedia('(max-width: 600px)').matches ? 1 : 7;
  }

  populateStartOptions(resStartSelect);
  populateServiceOptions(resServiceSelect);
  resStartSelect.selectedIndex = -1;
  if (resServiceSelect && resServiceSelect.options.length) {
    resServiceSelect.value = resServiceSelect.options[0].value;
  }

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

  resServiceSelect?.addEventListener('change', () => {
    if (resServiceSelect.value && Object.keys(latestSlotAvailability).length) {
      updateStartSelectAvailability(resStartSelect, latestSlotAvailability, resServiceSelect.value);
      if (selectedHour && !isStartTimeAvailableForService(selectedHour, latestSlotAvailability, resServiceSelect.value)) {
        clearSelectedHour();
      } else {
        updateSelectedHourHighlight();
      }
    }
    loadCalendar();
  });

  btnPrevDays?.addEventListener('click', () => {
    const step = getDayNavigationStep();
    stripStartDate = clampToToday(facilityStartOfDay(addDays(stripStartDate, -step)));
    selectedDate = facilityStartOfDay(addDays(selectedDate, -step));
    selectedDate = clampToToday(selectedDate);
    const rangeEnd = addDays(stripStartDate, 6);
    if (selectedDate < stripStartDate) {
      selectedDate = stripStartDate;
    } else if (selectedDate > rangeEnd) {
      selectedDate = rangeEnd;
    }
    syncDateInput();
    renderDayStrip();
    clearSelectedHour();
    loadCalendar();
  });
  btnNextDays?.addEventListener('click', () => {
    const step = getDayNavigationStep();
    stripStartDate = clampToToday(facilityStartOfDay(addDays(stripStartDate, step)));
    selectedDate = facilityStartOfDay(addDays(selectedDate, step));
    selectedDate = clampToToday(selectedDate);
    const rangeEnd = addDays(stripStartDate, 6);
    if (selectedDate > rangeEnd) {
      selectedDate = rangeEnd;
    } else if (selectedDate < stripStartDate) {
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
    const serviceId = resServiceSelect?.value || '';
    const durationMin = getServiceDuration(serviceId);
    const tipoCorte = getServiceLabel(serviceId);
    const date = dateInput.value;

    if (!pistaId || !name || !startTime || !date || !serviceId || !Number.isFinite(durationMin)) {
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
      email,
      tipoCorte: tipoCorte || serviceId,
      servicioId: serviceId
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
        if (resServiceSelect && resServiceSelect.options.length) {
          resServiceSelect.value = resServiceSelect.options[0].value;
        }
        selectedHour = '';
        setDateInputMin();
        syncDateInput();
        updateSelectedHourDisplay();
        updateSelectedHourHighlight();
        if (Object.keys(latestSlotAvailability).length && resServiceSelect) {
          updateStartSelectAvailability(resStartSelect, latestSlotAvailability, resServiceSelect.value);
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
      hoursGrid.innerHTML = '<div class="hours-grid__empty">Selecciona la peluquería para ver la disponibilidad</div>';
      return;
    }

    hoursGrid.innerHTML = '<div class="hours-grid__empty">Cargando disponibilidad...</div>';
    const pistaName = pistaSelect.options[pistaSelect.selectedIndex]?.text || '';
    const titleText = titleFormatter.format(selectedDate).replace(',', '');
    if (calendarTitle) {
      calendarTitle.textContent = titleText.charAt(0).toUpperCase() + titleText.slice(1);
    }
    if (calendarSubtitle) {
      calendarSubtitle.textContent = pistaName ? `Peluquería seleccionada: ${pistaName}` : '';
    }

    try {
      const reservas = await fetch(`${API_BASE}/reservas?pistaId=${encodeURIComponent(pistaId)}&date=${date}`).then(r => r.json());
      hoursGrid.innerHTML = '';
      const onlyAvailable = onlyAvailableToggle?.checked;
      const slotAvailability = {};
      const slotDetails = CLIENT_TIME_SLOTS.map(slot => {
        const slotStartDate = zonedDateTimeToUtc(date, slot.value, FACILITY_TZ);
        const slotEndDate = new Date(slotStartDate.getTime() + CLIENT_CONFIG.slotMinutes * 60000);
        const slotIsoStart = slotStartDate.toISOString();
        const slotIsoEnd = slotEndDate.toISOString();
        const overlapping = reservas.filter(r => !(slotIsoEnd <= r.start || slotIsoStart >= r.end));
        const isReserved = overlapping.length > 0;
        slotAvailability[slot.value] = !isReserved;
        return { slot, isReserved, overlapping };
      });

      const currentServiceId = resServiceSelect?.value || CLIENT_CONFIG.services[0]?.id || '';

      slotDetails.forEach(({ slot, isReserved, overlapping }) => {
        const startTime = slot.value;
        const canBook = !isReserved && currentServiceId
          ? isStartTimeAvailableForService(startTime, slotAvailability, currentServiceId)
          : !isReserved;

        if (onlyAvailable && !canBook) {
          return;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slot-btn';
        btn.dataset.time = startTime;
        btn.textContent = startTime;

        if (!canBook) {
          btn.disabled = true;
          if (isReserved) {
            btn.classList.add('is-reserved');
            btn.title = overlapping.map(r => `${r.nombre} (${formatFacilityTime(r.start)} - ${formatFacilityTime(r.end)})`).join('\n');
          } else {
            btn.classList.add('is-unavailable');
            btn.title = 'No hay tiempo suficiente para el servicio seleccionado';
          }
        } else {
          btn.addEventListener('click', () => {
            selectedHour = btn.dataset.time;
            resStartSelect.value = selectedHour;
            updateSelectedHourDisplay();
            updateSelectedHourHighlight();
          });
        }

        hoursGrid.appendChild(btn);
      });

      if (!hoursGrid.children.length) {
        hoursGrid.innerHTML = '<div class="hours-grid__empty">No hay horarios disponibles para este día</div>';
      }

      latestSlotAvailability = slotAvailability;
      if (resServiceSelect) {
        updateStartSelectAvailability(resStartSelect, slotAvailability, currentServiceId);
      }

      if (selectedHour && !isStartTimeAvailableForService(selectedHour, slotAvailability, currentServiceId)) {
        clearSelectedHour();
      } else {
        updateSelectedHourHighlight();
        updateSelectedHourDisplay();
      }
    } catch (err) {
      console.error(err);
      latestSlotAvailability = {};
      hoursGrid.innerHTML = '<div class="hours-grid__empty">No se pudo cargar la disponibilidad</div>';
    }
  }

  renderDayStrip();
  updateSelectedHourDisplay();
  await loadCalendar();
}

function updateStartSelectAvailability(selectEl, slotAvailability, serviceId) {
  if (!selectEl) return;
  const availability = slotAvailability || {};
  Array.from(selectEl.options).forEach(opt => {
    if (!opt.value) return;
    const baseAvailable = Boolean(availability[opt.value]);
    const canBook = serviceId
      ? isStartTimeAvailableForService(opt.value, availability, serviceId)
      : baseAvailable;

    if (canBook) {
      opt.disabled = false;
      opt.classList.remove('is-reserved', 'is-unavailable');
    } else {
      opt.disabled = true;
      if (!baseAvailable) {
        opt.classList.add('is-reserved');
        opt.classList.remove('is-unavailable');
      } else {
        opt.classList.add('is-unavailable');
        opt.classList.remove('is-reserved');
      }
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



