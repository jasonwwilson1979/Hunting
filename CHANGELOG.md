# Changelog

All notable changes to **HuntMap**. The version you are running is shown in
**Tools → About** (`HuntMap v1.10.0`) and reported to the phone by the server as
`server v4`; **Tools → Account → Check server** prints both. Each release bumps
`js/version.js` (`app` + `shell`, so the service worker's cache is replaced) and is
tagged in git (`v1.10.0`).

Format: [Keep a Changelog](https://keepachangelog.com/), versions
[SemVer](https://semver.org/): `MAJOR` = data/API breaks, `MINOR` = new features,
`PATCH` = fixes.

## [1.15.1] — 2026-11-27

### Fixed
- **GPS in airplane mode said "Not supported" and stopped.** Error code 2
  (`POSITION_UNAVAILABLE`) is exactly what iOS/Android report while the chip is still
  acquiring with no network to help, but it was mapped to the `unavailable` status,
  whose label was "Not supported". Worse, the first timeout downgraded the watch to
  network-only positioning — which cannot work offline — so the app then sat on a
  hopeless mode until it was restarted.
  - code 2/3 now mean **"waiting"**, with an honest message ("Waiting for satellites
    (airplane mode: no network to help, this can take a minute)"); `unavailable` is
    reserved for a browser with no geolocation API at all ("No GPS in this browser").
  - **never downgrade while offline**, and the high-accuracy watch is patient
    (90 s timeout instead of 45 s).
  - a **retry loop** re-issues the watch with backoff (5 s → 10 s → … → 30 s) until a
    fix arrives, so a cold start under open sky gets there on its own.
  - when the network returns after an automatic downgrade, the app switches back to
    satellites (a deliberate *Fast Wi-Fi fix* is left alone).
  - new **GPS → Satellites only** button for airplane mode, and the panel explains
    that 30–120 s under open sky is normal.

### Tests
- `tests/e2e.py` (126 checks): simulates the airplane-mode failure (offline + error 2)
  and asserts the status stays "waiting", the message is about satellites, the watch
  stays high-accuracy with a 90 s timeout, it retries by itself, and going online
  restores the satellite watch.

## [1.15.0] — 2026-11-27

### Changed
- **Every spot symbol redrawn with the details that make it readable at map size.**
  Treestand: platform, seat rail, ladder with rungs and the tree trunk it leans on.
  Ground blind: dome with a door arch, two windows and brush at its feet. Cabin: pitched
  roof, chimney, door and two windows. Deer: branched antlers, muzzle, eye, tail, four
  legs. Bear: shoulder hump, round ears with inner detail, snout, short clawed legs.
  Turkey: a five-feather fan, wattle and beard. Trail camera: body, lens ring, PIR
  window, IR lamps, strap and antenna. Food plot: three leaves with a soil line. Sign /
  scrape: two staggered cloven hoof prints with dewclaws (a trail). Track / rub: trunk
  with bark wounds and a broken branch. Kill site: target rings with a crosshair.
  Vehicle: a car with windows and two wheels (the old pickup read as a sofa). Water, camp,
  hazard and the plain waypoint pin were already clear and stay as they were.
- **Spot symbols legend**: the ⓘ button in the Spots header lists all 16 symbols with
  their names, so nothing has to be guessed.
- The type chips on the Mark sheet keep the thin line icons, which stay legible at 15 px.

### Tests
- `tests/e2e.py` (121 checks): the legend lists all 16 drawings and opens from the Spots
  panel; the existing silhouette/rasterise checks still cover every type.

## [1.14.0] — 2026-11-27

### Added
- **The native app is offline *and* synced.** The Capacitor shell is a different origin
  (`capacitor://localhost` / `https://localhost`), so it cannot use the web session
  cookie. It now signs in with a **bearer token** instead:
  - `POST /api/token/` (user name + password + device label) issues a 43-character
    token, returned once; only its SHA-256 is stored (`ApiToken`, migration 0004).
  - `Authorization: Bearer …` authenticates every `/api/` call — maps, files,
    calibration, sync, `diag`, `account` — for anyone, with no cookie.
  - `DELETE /api/token/` revokes just that device; *Sign out* in the app does this.
  - Tokens expire after `HUNTMAP_TOKEN_DAYS` (default 365, `0` = never) and can be
    seen/revoked in the Django admin (read-only: they are never created by hand).
- **CORS limited to the native origins**: `huntmap_server/native.py` answers preflights
  for `/api/` only, for the origins in `HUNTMAP_NATIVE_ORIGINS` (default
  `capacitor://localhost`, `ionic://localhost`, `https://localhost`,
  `http://localhost`), echoes the exact origin, allows `Authorization`, and grants
  nothing to other websites. A token is never accepted on `/admin/`.
- **Server address in the app**: *Tools → Account → Server address* (native only) saves
  `https://your.host`, after which sign-in, the map library, spot/track sync, map-file
  downloads and **Export my data** all run over the token. With no address the app is a
  pure offline app, and says so.
- Android works with the same code: `capacitor.config.json` uses
  `androidScheme: "https"`, whose origin (`https://localhost`) is in the default list.

### Changed
- `js/sync.js` now keeps its base URL and token in IndexedDB, sends the token on every
  request and on file downloads (`SY.authFetch`), and revokes it on sign-out.
- Export/delete in the native app go through the token (the web keeps its
  browser-download and session behaviour).

### Tests
- Server (57, up from 49): token issue, bearer auth without a cookie, wrong password,
  revocation, expiry, tokens not opening `/admin/`, preflight allowed for the native
  origins, no grant for other origins, CORS absent outside `/api/`.
- `tests/e2e_django.py` (47, up from 39): the real app in the browser pretending to be
  the shell — wrong password refused, token issued, `/api/me/` and a map file fetched
  with it, export works, sign-out revokes + forgets the token, and the CORS preflight
  grant is visible to the browser while another origin gets none.

## [1.13.0] — 2026-11-27

### Added
- **Geofences ("Fences").** Draw a circle on the ground, get told when you walk into
  it or out of it. *Tools → Fences → +* takes the map centre; the editor sets name,
  radius (15 m – 5 km), "alert when entering", "alert when leaving" and whether it is
  watching. Fences are drawn as a dashed circle with their name, listed with their
  live state (`INSIDE` / `outside`), and alerted with a banner, two tones (rising in,
  falling out), a vibration pattern and — in the native shell — a local notification.
  Alerts have hysteresis (12 m of slack) so a wobbling fix does not flap, adopt the
  state silently on the first fix, and respect a 20 s cooldown. Stored in IndexedDB
  (new `zones` store, DB v2 with a non-destructive upgrade) and included in
  Backup / Restore.
- **Capacitor shell for iPhone/iPad (and Android).** `package.json`,
  `capacitor.config.json` and `scripts/build-native.sh` (copies the runtime into
  `www/`, 2.2 MB, verified) plus `docs/ios-app.md`: exact commands, the Info.plist
  location strings, the privacy manifest keys App Store uploads now require, and the
  App Store notes (4.2 "minimum functionality", 5.1.1 location claims, in-app purchase
  vs. selling on your website). `js/native.js` bridges local notifications, exposes the
  shell in *Tools → About* ("iOS app · offline") and the app **skips the service
  worker** there, since the files ship inside the app.

### Changed
- **Markers are much bigger and more detailed**: map pins 46 px (58 px selected,
  up from 33/40), spot labels 12 px bold, list icons 36 px, and the silhouettes gained
  the detail that reads at that size — a deer eye, ear and hock marks, bear inner ears
  and claws, a turkey wing and beard, a trail-cam lens ring and IR dots, a treestand
  tree trunk, two blind windows with brush, cabin window mullions.
- Fence alerts are on by default; sound, vibration and "show fences" can be turned off
  in the Fences panel.

### Notes
- iOS/Android builds need macOS + Xcode (or Android Studio); they cannot be produced or
  tested on the Linux box this repo was written on. The scaffolding and the copy step
  are verified, the first Xcode build is a device test.
- In the native shell the server features (accounts, library, sync) are web-only for
  now: they rely on a same-origin session cookie, and `capacitor://localhost` is a
  different origin. `docs/ios-app.md` gives both workarounds (load the server URL, or
  add token auth — the natural next step).

### Tests
- `tests/e2e.py` (119 checks): fence state adoption, edge slack, enter/exit, cooldown,
  disabled fences, add-a-fence-through-the-panel (stored, drawn, listed, deleted), and
  the native shell being detected with no service worker and no JS errors.

## [1.12.0] — 2026-11-27

### Added
- **Self-hosted base maps.** The server can serve your own raster tiles at
  `/tiles/{z}/{x}/{y}.png` from a folder (`HUNTMAP_TILES_DIR`), from a raster
  `.mbtiles` archive (`HUNTMAP_TILES_MBTILES`), or delegate to a tile server you run
  (`HUNTMAP_TILE_URL`). Week-long cache headers, `404` for a miss so the app can fall
  back, and `manage.py tiles_info` to see what is configured.
- **"This server / Local" base map** in the app: default when tiles exist, credited
  with the required “© OpenStreetMap contributors” line.
- **`HUNTMAP_COMMERCIAL=1`** (paid-site mode): the picker only offers your own tiles,
  USGS (public domain) and “no base map”; Esri and the community OSM/OpenTopoMap
  servers are hidden, listed as withheld, and a stored choice of one is replaced at
  start-up so an old setting cannot keep breaking the licence.
- **Licence notice**: `/licences/` page on the server, **Tools → Licences** in the
  app, `THIRD_PARTY_LICENSES.md`, and a map credit that is now a real link to
  <https://www.openstreetmap.org/copyright> (ODbL safe harbour — visible, not behind a
  menu).
- **Data rights**: `GET /api/account/` exports the account (maps, places,
  georeferences, spots, tracks) as JSON and `DELETE /api/account/` erases the account,
  its files, spots and tracks — with **Export my data** / **Delete my account**
  buttons in *Tools → Account*. This is what makes a privacy policy honest.
- `LEGAL.md` (checklist for charging money: ToS, privacy, refunds, tax, takedown,
  attribution duties), `docs/terms-of-service.md` and `docs/privacy-policy.md`
  templates.

### Changed
- Tiles served by a public community server are marked in the picker with their
  licence, so it is obvious which choices are not for paid use.
- Default base map order: your tiles → USGS → OSM (or “no base map” in commercial mode).

### Tests
- Server: tiles from a folder, 404 on a miss, MBTiles (with the TMS row flip), `/api/meta/`
  with and without tiles, the injected app config, the licences page, account export
  and erasure (49 tests, up from 40).
- `tests/e2e.py`: commercial mode hides the right sources, self-hosted tiles become the
  default, the credit is a link, the Licences sheet lists sources and withholdings, and a
  stored forbidden base map is replaced on load (105 checks, up from 95).

## [1.11.0] — 2026-11-27

### Added
- **Shaped map markers.** The pin is now the *thing* — a deer silhouette with
  antlers, a bear, a fanned turkey, a treestand with a ladder, a dome blind, a cabin,
  a trail camera, a water droplet, a food-plot sprout, hoof prints, a rub trunk, an
  impact star, a tent, a pickup, a hazard triangle and the classic pin for a plain
  waypoint — each in its type colour with a white halo so it reads over dark forest,
  standing on a short stem with a dot at the exact coordinate. No more circle badge.
- **Delete several spots at once.** In *Spots*, the new **select** button (top left
  of the sheet, check-in-a-square) turns the list into tick boxes with a bar:
  `2 of 6 selected · All · None · Delete 2`. Rows highlight, *All* takes everything
  that passes the current search, and the delete asks once before removing them.
  Bulk deletes queue their tombstones together, so they stay deleted after a sync.

### Changed
- Spot rows and the spot sheet's title use the same silhouettes (the small type
  chips keep the thin line icons, which stay legible at 15 px).
- Ticking a row updates it in place instead of re-rendering the list, so a quick
  second tap is never lost.

### Tests
- `tests/e2e.py` now checks every type has a silhouette, that all of them rasterise
  for the canvas, that the deer marker carries a halo, and the whole select-then-
  delete flow (two of three deleted, gone from IndexedDB, select mode ends).

## [1.10.1] — 2026-11-27

### Fixed
- **Deleted spots came straight back** when signed in. The app sends a deletion as
  `{id, deleted: true, updatedAt}` with no coordinates, and the server skipped any
  spot without `lat`/`lon` — so the tombstone was dropped, the phone forgot it, and
  the next pull re-added the spot. The server now handles deletions *before* the
  coordinate check.
- **A deletion now always wins**, even from a device whose clock is behind, and a
  deleted spot stays deleted (a stale phone pushing its old copy cannot resurrect
  it).
- The phone keeps a deletion until the **server confirms** it (it used to clear it
  blindly), and it no longer re-adds a record it has a pending deletion for — so
  deleting works locally even against an older server, which is reported as
  *"N deletions not applied by the server — it is an older build"*.
- Two quick deletions in a row could lose one tombstone (read-modify-write race on
  the pending list); the writes are now serialised.

### Tests
- Server: coordinate-less tombstone, delete-beats-slow-clock, unknown-id tombstone,
  and "deleted stays deleted" (40 tests, up from 37).
- `tests/e2e_django.py`: delete a synced spot on device A → it is gone from the
  server and from device B after signing in.

### Changed
- The server reports **v4** (`app v1.10.1 · server v4` on *Check server*), so the
  container that has the deletion fix is identifiable at a glance.

## [1.10.0] — 2026-11-27

### Added
- **Version in the UI.** *Tools → About* shows `HuntMap v1.10.0 · date`, the
  diagnostics line leads with it, and *Check server* prints `app v1.10.1 · server v4`.
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
