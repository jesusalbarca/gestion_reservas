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
