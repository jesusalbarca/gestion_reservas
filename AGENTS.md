# Repository Guidelines

## Project Structure & Module Organization
The Node/Express backend lives in index.js, orchestrating API routes for courts and reservations. Data access helpers are grouped in db.js, which reads and writes the local store in data/db.json. Run-time seeding logic sits in db_init.js; adjust the JSON fixtures there when you need fresh demo content. The static client that surfaces booking and admin flows resides in public/ (index.html, dmin.html, pp.js, styles.css). Keep assets modular: reusable client utilities belong in public/app.js, while server-only helpers stay close to db.js.

## Build, Test, and Development Commands
- 
pm install — resolve Node dependencies before any run.
- 
pm run init-db — regenerate data/db.json using the seeding script; safe to run before demos.
- 
pm start — launch the Express server on the configured PORT (defaults to 3000) and serve the static client.
Use NODE_ENV=development when you need verbose logging.

## Coding Style & Naming Conventions
Follow the existing 2-space indentation and camelCase for variables, functions, and route handlers (getPistas, ddReserva). Reserve UPPER_SNAKE_CASE for shared constants such as FACILITY_TZ. Favor small, pure helpers when adding validation or date logic; place them above the route definitions to keep index.js readable. On the client side, namespace DOM selectors and event handlers with a ui prefix to avoid collisions (e.g., uiReservationForm).

## Testing Guidelines
There is no automated test suite yet; validate changes by running key booking flows in both public/index.html and public/admin.html. When adding tests, prefer lightweight HTTP-level checks with supertest and name files <feature>.spec.js in a future 	ests/ folder. Record repro steps for bugs in 
otas.txt until we formalize regression coverage.

## Commit & Pull Request Guidelines
Commit messages should be imperative and scoped (Add overlap guard for reservas). Keep commits focused on one feature or fix, and include both server and client updates when the behavior spans layers. Pull requests should describe the user impact, list touched endpoints or views, and link any tracking tickets. Attach screenshots or GIFs for UI adjustments and note whether 
pm run init-db is required after merging.

## Environment & Data Notes
Set PORT, FACILITY_TZ, or other overrides via process env vars in your shell or a .env file (not committed). Remember the JSON-backed store under data/ is single-user; avoid deploying it as-is to multi-user environments, and add locking or move to a real database if concurrent writes become an issue.

## Dominio funcional
- Por un lado está la app cliente, en index.hmtl.
esta app es para que los usuarios puedan seleccionar distintas pistas para revervar. Una vez en la pista seleccionada, podrán elegir una hora y completar sus datos para reservar.
- Por otro lado, la app admin es para gestionar las pistas y las reservas, pudiendo eliminarlas

## Notas de navegación de días (Cliente)
- El cliente utiliza `renderDayStrip` para pintar tiras de 7 días consecutivos a partir de `stripStartDate`. El rango visible se mantiene entre `stripStartDate` y `stripStartDate + 6` días.
- La función auxiliar `getDayNavigationStep()` (declarada dentro de `initClient` en `public/app.js`) decide cómo avanzan los botones de navegación:
  - Devuelve `1` cuando `window.matchMedia('(max-width: 600px)')` es verdadero para que, en móviles, los botones avancen o retrocedan día a día manteniendo la continuidad visual.
  - Devuelve `7` en caso contrario para conservar los saltos semanales en viewport amplios.
- Los controladores `btnPrevDays` y `btnNextDays` actualizan `stripStartDate` y `selectedDate` usando el paso dinámico, claman las fechas con `clampToToday`, y ajustan `selectedDate` al rango visible (`stripStartDate` a `stripStartDate + 6`). Después de mover el rango se invocan `renderDayStrip`, `clearSelectedHour` y `loadCalendar` para refrescar la UI.

## Análisis técnico del código

### Arquitectura general
El proyecto combina un servidor Express minimalista con un cliente estático en vanilla JS. El servidor habilita CORS, parsea JSON y publica la carpeta `public/`, mientras reutiliza constantes compartidas para controlar la duración y zona horaria de las reservas.

### Backend Express
`index.js` centraliza los endpoints REST. Expone rutas públicas para listar pistas y reservas con filtros opcionales, valida los payloads de creación (formato de fecha/hora, duración dentro de los límites y no-reserva en el pasado), transforma las horas locales a UTC y propaga códigos de error semánticos (`CONFLICT`, `INVALID_PISTA`). También ofrece un subconjunto de rutas administrativas para CRUD básico de pistas y borrado de reservas, además de un health-check y un manejador catch-all 404.

El archivo define utilidades puras para calcular offsets horarios y convertir combinaciones fecha/hora a UTC, lógica que se alinea con la del cliente para mantener consistencia de zona horaria.

### Acceso a datos y modelo persistente
`db.js` encapsula el acceso a un JSON local (`data/db.json`). Implementa `readDB`/`writeDB` asíncronos, un generador de IDs prefijados y operaciones CRUD para pistas, usuarios y reservas. `addReserva` valida la existencia de la pista, comprueba solapamientos antes de guardar y persiste los campos normalizados (`start`, `end`, `date`, `startTime`, `durationMin`, contacto y `timezone`). `deletePista` cascada las reservas asociadas. Existen métodos `raw`/`saveRaw` para trabajar con la estructura completa cuando sea necesario.

El script `db_init.js` crea la carpeta de datos, genera un dataset de ejemplo con metadatos de zona horaria, pistas demo, un usuario y un array vacío de reservas, útil para reseeding manual.

### Cliente web (JavaScript)
`public/app.js` detecta la página actual y activa `initClient` o `initAdmin`. Comparte utilidades de zona horaria con el backend para formateos y cálculos. `initClient` monta toda la interacción del flujo de reservas: inicializa selectores y formateadores, controla un carrusel de 7 días con paso adaptable (1 día en pantallas estrechas, 7 en anchas), sincroniza un `input` de fecha mínimo en “hoy”, pinta disponibilidad por hora solicitando `/api/reservas`, distingue slots reservados vs. disponibles y mantiene estado de la hora seleccionada. El envío del formulario construye el payload alineado con lo que espera la API y refresca la vista tras reservar.

`updateStartSelectAvailability` sincroniza la lista desplegable de horas con los botones del calendario. `initAdmin` alimenta la vista administrativa: formulario de creación de pistas, listados renderizados dinámicamente con botones para borrar pistas (con confirmación) y reservas, actualizados a través de las rutas `/api/admin`.

### Vistas HTML estáticas
`public/index.html` arma la landing del cliente con cabecera hero, controles para pista/fecha, tira de días navegable, toggle de “solo disponibles” y formulario de reserva con campos ocultos sincronizados por JavaScript. Se carga `app.js` al final para enlazar la lógica dinámica.

`public/admin.html` provee una versión administrativa sencilla con formularios y listados en contenedores tipo tarjeta, reutilizando los estilos y el script compartido.

### Dependencias y scripts
El `package.json` declara únicamente `express` y `cors`, con scripts de arranque (`node index.js`) y resiembra (`node db_init.js`), reflejando la ausencia de herramientas de build o testing automatizado en el estado actual del prototipo.

### Testing
⚠️ No se ejecutaron pruebas (revisión estática)
