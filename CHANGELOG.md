# Changelog

All notable changes to **HuntMap**. The version you are running is shown in
**Tools → About** (`HuntMap v1.10.0`) and reported to the phone by the server as
`server v3`; **Tools → Account → Check server** prints both. Each release bumps
`js/version.js` (`app` + `shell`, so the service worker's cache is replaced) and is
tagged in git (`v1.10.0`).

Format: [Keep a Changelog](https://keepachangelog.com/), versions
[SemVer](https://semver.org/): `MAJOR` = data/API breaks, `MINOR` = new features,
`PATCH` = fixes.

## [1.10.0] — 2026-11-27

### Added
- **Version in the UI.** *Tools → About* shows `HuntMap v1.10.0 · date`, the
  diagnostics line leads with it, and *Check server* prints `app v1.10.0 · server v3`.
  `js/version.js` is the single source for the page *and* the service worker
  (`importScripts`), so the cache name can never drift from the code again.
- **Tools → About → Update app.** Deletes the cached shell, unregisters the service
  worker and reloads, so a phone stuck on an old copy gets the new buttons. Data is
  untouched.
- `CHANGELOG.md` (this file) and git tags per release.

### Changed
- **Sync spots is always visible** once a server is detected, even when signed out.
  Pressing it then explains what is needed and opens the sign-in sheet, instead of
  the button silently not existing.
- Signed out, the account card says how many spots/tracks are currently *"on this
  phone only"*.
- The empty *From your PC* list now explains how maps get into the library (add one
  with **Copy to my PC library** ticked, or use `/upload/`).
- `/api/diag/` reports `maps_mine` next to `maps`.

## [1.9.0] — 2026-11-27

### Added
- **Spots and tracks sync with the account.** `SyncedSpot` / `SyncedTrack` models
  (migration `0003`), `GET|POST /api/sync/` (push the device's set, receive the
  merged set — newest `updatedAt` wins, deletions kept as tombstones), and the app
  side in `js/sync.js`: sync after sign-in, at start-up, on save/move/delete of a
  spot, when a track stops, and from *Tools → Account → Sync spots*.
- **Every map on the device can carry a place.** *Maps → Your maps → Edit* opens
  the name / state / county / town / page sheet for local maps; linked maps are
  pushed to the server too.
- **Copy to my PC library** for device-only maps: uploads the page image the app
  already stored and pushes the georeference with it.
- *Copy to my PC library* is ticked by default when signed in.

### Fixed
- Spots and tracks no longer stay stranded on one phone.

## [1.8.0] — 2026-11-26

### Fixed
- **"CSRF verification failed" behind a TLS-terminating proxy / Cloudflare Tunnel.**
  New `TrustLocalProxyMiddleware` honours `X-Forwarded-Proto/Host/Port` only when the
  peer is loopback or private, so the internet still cannot spoof them.

## [1.7.0] — 2026-11-25

### Added
- `server/redirect.py`: plain-HTTP listener answering `308` to the HTTPS port, which
  turns the "can't connect / `[SSL: HTTP_REQUEST]`" trap into a redirect.
- `server/healthcheck.py` falls back across `https:8443` / `http:8000`;
  `ALLOWED_HOSTS` always allows loopback.
- **No lockouts:** the first account registered on a fresh server becomes
  staff + superuser, the entrypoint warns when no admin exists, and `/api/diag/`
  reports `users`, `staff`, `accounts_ready` with a hint. *Tools → Account* gained
  **Check server** and **Open /admin/**.

## [1.6.0] — 2026-11-24

### Added
- Accounts on the server: `/accounts/register|login|logout`, `/api/login|logout|register|me/`,
  session cookies, per-owner map scoping (own + shared), `HUNTMAP_REQUIRE_AUTH`.
- Places on maps: `state` / `county` / `city` / `owner` (migration `0002`), `/library/`
  with search + state/county filters, `/library/<id>/edit/`, `addmap --state --county
  --city`, `PATCH /api/maps/<id>/`.
- App: *Tools → Account* card, place fields when adding a map, **Copy to my PC
  library** upload, search + state/county selects in *From your PC*.

## [1.5.0] — 2026-11-23

### Added
- Crosshair placement mode: aim with the map, HUD with coordinates and
  distance/bearing, **Drop**, **Mark** at the crosshair.
- 16 spot types with SVG icons (deer, bear, turkey, building, …) used on pins,
  chips, list rows and titles; spot rows split into *go to* (tap) and *Edit*.

## [1.4.0] — 2026-11-22

### Added
- Two-phase GPS: a quick network/Wi-Fi fix first, then a high-accuracy watch, with
  `source`, a 12 s *No fix* watchdog, automatic downgrade and **Fast Wi-Fi fix**.

### Fixed
- OpenStreetMap *Access blocked*: send a `Referer`, detect block pages, throttle to
  one request per 150 ms, and treat tile 404s as misses rather than refusals.

## [1.3.0] — 2026-11-21

### Added
- Docker/Portainer deployment: `Dockerfile` (Python 3.12-slim, non-root), compose
  stacks (HTTPS, GHCR, Cloudflare Tunnel), GHCR workflow, `.env.example`.
- `HUNTMAP_PORT`, `HUNTMAP_PUBLISH_PORT`, `HUNTMAP_BIND`, `HUNTMAP_PUBLIC_PORT`,
  `HUNTMAP_REDIRECT_PORT`, `HUNTMAP_PUBLISH_HTTP_PORT`, `HUNTMAP_LAN_PORT`.

## [1.0.0] — 2026-11-20

### Added
- First working app: offline PWA shell, OSM/USGS/Esri base maps with tile cache,
  PDF/TIFF/image overlays with two-point and drag-align georeferencing, waypoints
  and GPX, track recording, sun/compass/GPS panels, backup/restore, self-test, and
  the Django map library (`/upload/`, `/api/maps/`, calibration sync).
