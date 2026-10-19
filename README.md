# RoadSafe Admin

React/Vite web admin prototype for the road accident reporting project. The map, report table, dashboard, officer assignments and report modal share one API-shaped dataset in `src/data/reports.js`.

## Run and verify

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

The test runner uses Node's built-in test API (Node 24 was used during development). Build output is `dist/`.

## Data and configuration

- `src/models/report.js`: the eight report statuses, Public/Admin/Officer roles, accident categories, full report shape, validation and presentation adapters.
- `src/data/reports.js`: one deterministic demo response, including referenced users/personnel.
- `src/App.jsx`: shared state, optional API read and session-only modal edits.
- [Reports API contract](../2nd%20brain%20RoadSafe/Projects/RoadSafe%20Admin/Reports%20API%20Contract.md): response example, field rules and integration boundaries in the second brain.

Optional `.env` names: `VITE_CARTO_API_KEY` for the basemap; `VITE_REPORTS_API_URL` for a contract-v1 JSON response. Without a reports URL, the app uses demo data. An unavailable/incompatible endpoint shows a demo fallback message. Values prefixed VITE_ are exposed to browser code; do not use server secrets.

MapLibre displays accident categories, clusters and severity heatmaps. Police/medical station locations come from Overpass with a browser cache. Station requests are browser-local simulations. Report edits last for the session and do not dispatch personnel or update a backend. Role definitions exist, but login/role enforcement, real reporting/evidence upload, notifications, audit and exports remain future work.

Stack: React 18, Vite 5, Tailwind 3, MapLibre, Chart.js/react-chartjs-2 and Font Awesome. Flutter is outside this web work scope.

## Current staff/account workflow — R01 (2026-10-19)

The current shared-backend build supports active Admin and Officer sign-in. Admin Account Management searches existing accounts and edits profile/role/access with reasons and version checks. Self-demotion/suspension and removing Officers with active cases are blocked. Officers have a dedicated unassigned verification queue plus their own active assignments; verification/progress are server-restricted. They cannot access Admin controls, reassign, reject, correct facts or manage duplicates/categories/accounts. Earlier prototype-only statements above are historical; use the vault Account Administration Policy and supabase/README.md for current permissions.

Suspension blocks new protected application requests for retained sessions; it does not delete Auth sessions/credentials. Already-issued signed evidence URLs retain their expiry (up to ten minutes). The web gate rechecks access every 15 seconds. Creation/deletion/password recovery/login-name editing remain separate. No demo account-management writes are offered.
