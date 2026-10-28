# RoadSafe Admin

React/Vite accident reporting management app with one Supabase report source shared with the Flutter client. Map, Dashboard, Reports, Officer Dispatch and Analytics read the same feed and use protected backend writes. There is no Demo/Shared selector or local report fallback. Missing backend configuration shows a setup message rather than fictional incidents.

## Run and verify

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for the same project used by mobile. VITE_CARTO_API_KEY optionally configures the basemap. Never put service-role keys in browser configuration. Report activity refreshes every 15 seconds.

## Vercel deployment

Import this repository with root directory `./`, the Vite preset, install command `npm ci`, build command `npm run build`, and output directory `dist`. Set the public configuration above in the Vercel project's environment variables before building; do not upload `.env`.

`api/stations.js` exposes the existing validated station gateway on Vercel. Its 150-second limit accommodates both provider attempts when needed. Nationwide requests use bundled OpenStreetMap geography in `server/station-snapshots/`, preserving each snapshot's real `savedAt`; snapshots older than seven days return an age notice. This avoids blocking maps on public-provider outages or relying on persistent serverless disk writes. Refresh those two snapshots from successful `.cache/stations/` downloads and redeploy to update hosted geography. If a bundled snapshot is unavailable, the gateway still tries its providers and returns JSON HTTP 503 on failure. Nearby queries and local dev, preview, and `npm start` retain their existing behavior.

After deployment, check `/api/stations?type=police&scope=philippines` and the equivalent `type=medical` URL for JSON `elements`, then verify both map layers. Deployment Protection may require Vercel sign-in before these checks.

## Testing dataset — 2026-10-28

The connected testing database was reset to ten ordinary Submitted reports around Bulacan. The records are synthetic testing data with realistic incident details; the UI does not badge them as demo records. Newly submitted mobile reports enter this same database/feed and follow the same workflow. Accounts and station geography were retained; old report evidence was removed. Report fixtures under src/data remain for automated tests and are not imported by the application entry point.

The one-off replacement SQL lives outside this repository at ../supabase/scripts/replace-report-test-data.sql. It deletes report data: do not rerun it during startup or deploy it as a migration. The rollback-only ../supabase/tests/single_report_source.sql proves a normal Public submission joins the ten seed records in the Admin feed. It assumes the reset dataset still has exactly ten reports.
## Current staff/account workflow — R01 (2026-10-19)

The current shared-backend build supports active Admin and Officer sign-in. Admin Account Management searches existing accounts and edits profile/role/access with reasons and version checks. Self-demotion/suspension and removing Officers with active cases are blocked. Officers have a dedicated unassigned verification queue plus their own active assignments; verification/progress are server-restricted. They cannot access Admin controls, reassign, reject, correct facts or manage duplicates/categories/accounts. Earlier prototype-only statements above are historical; use the vault Account Administration Policy and supabase/README.md for current permissions.

Suspension blocks new protected application requests for retained sessions; it does not delete Auth sessions/credentials. Already-issued signed evidence URLs retain their expiry (up to ten minutes). The web gate rechecks access every 15 seconds. Creation/deletion/password recovery/login-name editing remain separate. No demo account-management writes are offered.
