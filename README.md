# HuntMap — offline GPS hunting map

A self-contained web app (HTML + JavaScript, no build step) for scouting and hunting with your
phone. It runs fully offline on the device; the optional Django server in `server/` adds a map
library on your computer, local accounts, and spots/tracks that follow the account between
devices:

- **Live GPS** with accuracy circle, heading and a big "where am I" readout —
  phone GPS works in **airplane mode** because it only listens to satellites.
- **Your own maps**: load any **PDF**, **TIFF** scan or photo of a paper map, rotate it if the scan is
  sideways, georeference it with two control points, and use it as a map layer over the base map.
- **Maps from your PC** (optional): a small Django server keeps a map library on your computer;
  the phone lists it under *Maps → From your PC* and copies what it needs for offline use.
- **OpenStreetMap** and other raster base maps (USGS topo, USGS imagery, OpenTopoMap,
  Esri), cached for **offline** use.
  *OpenStreetMap's public servers block networks that bulk-download tiles; the app sends a proper
  Referer, fetches OSM tiles one at a time, stops when the server says no and points you at
  USGS/Esri (which is why USGS Topo is the default in North America).*
- **Spots** (treestand, blind, building/cabin, deer, bear, turkey, trail cam, water, food plot,
  sign, kill site, camp, vehicle, hazard) with notes, bearings and distances — each with its own
  icon on the map, in the list and on the type chips.
- **Track recording** with distance, time, elevation gain and GPX export.
- **Sun & moon**: sunrise, sunset, civil twilight, legal-light window, moon phase, % lit.
- **Compass**, **distance measuring**, **go to coordinates**, UTM / DMS / decimal formats.
- **Works offline**: the app shell is cached by a service worker, PDFs and spots live in
  IndexedDB, map tiles you look at (or pre-download) are cached too.
- **Red night mode** for walking in before first light, plus a wake lock to keep the screen on.

Everything stays on the device unless you choose to use the server: the app has no telemetry and
uploads nothing on its own. With a server, your maps, spots and tracks go only to that server, under
your own account.

**Version.** The app shows `HuntMap v1.10.1 · 2026-11-27` in **Tools → About** (and the same number
leads the diagnostics line); the server reports `server v4` in `/api/health/`, `/api/maps/` and
`/api/diag/`. **Tools → Account → Check server** prints both side by side, so "which build am I
talking to?" is never a guess. Every release is listed in [CHANGELOG.md](CHANGELOG.md) and tagged
(`git tag v1.10.1`); to cut a new one, bump `js/version.js` (`app` **and** `shell`) — the shell name is
the service-worker cache, so bumping it is what makes phones replace their cached copy.

![HuntMap running on a phone with USGS topo, waypoint and GPS fix](tests/screenshots/01-map.png)

![Georeferenced PDF overlay on top of the base map](tests/screenshots/03-pdf-overlay.png)

---

## 1. Run it

The supported way to run HuntMap is the **Django server** — either in Docker/Portainer (section 2)
or directly on a machine. It serves the app *and* the map library; nothing else is needed.

### On a computer, without Docker

```bash
cd server
python3 -m pip install -r requirements.txt
python3 manage.py migrate
python3 serve.py                 # https://<your-lan-ip>:8443, self-signed cert
```

Open the printed address. On the PC itself `http://localhost:8443` is not used here — `serve.py`
speaks HTTPS so the phone gets a secure context (GPS + offline). Accept the certificate once.

> `tests/static_server.py` is a **test-only** helper: it serves the app with no Django, which
> `tests/e2e.py` uses to check the offline/service-worker behaviour. You do not need it to run the
> app, and it is not part of the container image.

### On an iPhone / Android over your Wi-Fi

1. Start the server as above and open the printed `https://192.168.x.x:8443` address in **Safari**.
2. Accept the certificate warning (**Show Details → visit this website → Continue**).
   To silence it permanently, AirDrop/email `server/.certs/cert.pem` to the phone, install the
   profile, then enable it under *Settings → General → About → Certificate Trust Settings*.
3. Tap **Share → Add to Home Screen**. Launch HuntMap from the home screen from now on.
4. Tap the crosshair button and allow location.

The phone must be on the same Wi-Fi as the computer while the server runs.

### Docker / Portainer

For real use, run the container from section 2 — it is the only deployment target this repo is set
up for (real HTTPS via your proxy or a Cloudflare Tunnel, automatic migrations, a shared map
library, local accounts). Static hosting is not needed and is not supported by the server
features (library, accounts, calibration sync).

---

## 2. Maps from your PC (optional Django server)

The `server/` folder is a small **Django** project that serves this web app *and* keeps a
library of map files on the PC. On the phone they appear under **Maps → From your PC**, and one
tap copies them onto the phone. After that they live in the phone's storage, so they work with
no signal — which is what makes GPS useful in airplane mode.

![Maps from the PC, downloaded onto the phone](tests/screenshots/07-sync-from-pc.png)

### Set it up once

```bash
cd server
python3 -m pip install -r requirements.txt
python3 manage.py migrate
python3 manage.py createsuperuser     # login for /upload/ and /admin/
python3 serve.py                      # https://<your-lan-ip>:8443
```

`server/serve.py` serves **HTTPS** with a self-signed certificate from `server/.certs` (iOS only
allows GPS on https pages). Open the printed address on the phone, accept the certificate once,
then *Add to Home Screen*.

### Put maps on the PC

- **Web page** — open `https://<lan-ip>:8443/library/` (or `/upload/` to add one), log in, pick a
  PDF/TIFF/image and fill in name, state, county and town. The library page searches and filters by
  place and links each map's *edit* form.
- **Command line**, including whole folders:

  ```bash
  cd server
  python3 manage.py addmap ~/Maps/*.pdf
  python3 manage.py addmap ~/Maps/quad.tif --name "Elm Ridge 1:24000"
  ```

  Identical files are skipped, so re-running is safe.
- **Django admin** (`/admin/`) for renaming, replacing or deleting entries.

### Get them onto the phone

1. Phone on the same Wi-Fi as the PC.
2. **Maps → From your PC → Refresh** (it also loads when you open the Maps panel).
3. **Download** one, or **Download all**. Each map is rasterised on the phone (PDF page at up
   to 3000 px, TIFF decoded directly) and saved to IndexedDB.
4. The row turns green: *on this phone*. Changed files show *update available*; the trash
   button removes the local copy to free space.

**Georeference once, reuse everywhere:** align a downloaded map on the phone and the
calibration is uploaded to the PC (`PUT /api/maps/<id>/calibration`), so the next device that
downloads it arrives already placed. Georeferencing on the PC browser with a mouse works too
and is the easiest way to do it once.

### Airplane mode

| What the phone needs | Where it lives after a download |
| --- | --- |
| App, PDF engine, TIFF decoder | Service-worker cache (after the first visit) |
| Map image + georeference | IndexedDB on the phone |
| GPS | Satellite receiver — no network involved |

Routine: download the maps while on Wi-Fi → switch to airplane mode. The app opens, the maps
draw and the GPS dot moves (the first fix can take 30–120 s without network assistance).

![Working in airplane mode with a downloaded, georeferenced map](tests/screenshots/08-airplane-mode.png)

### Server options and API

`server/serve.py` flags: `--http` (PC only — iOS blocks GPS on http LAN), `--port`, `--bind`,
`--no-migrate`. The port, bind address and TLS mode can also come from `HUNTMAP_PORT`,
`HUNTMAP_BIND` and `HUNTMAP_HTTPS` (flags win), so the same settings work with and without Docker.

| Environment variable | Meaning |
| --- | --- |
| `HUNTMAP_SECRET_KEY` | Django secret key (set it for anything permanent) |
| `HUNTMAP_HOSTS` | Allowed hosts, comma separated (default `*`) |
| `HUNTMAP_TOKEN` | If set, uploads and calibration writes require `X-HuntMap-Token` |
| `HUNTMAP_DB` | sqlite file (default `server/db.sqlite3`) |
| `HUNTMAP_MEDIA` | upload folder (default `server/media`) |
| `HUNTMAP_PROXY_SSL=1` | trust `X-Forwarded-Proto` behind nginx/caddy |
| `HUNTMAP_ORIGINS` | extra CSRF trusted origins |

API: `GET /api/maps/` (library; add `?q=`, `?state=`, `?county=`), `POST /api/maps/` (multipart
`file`, `name`, `page`, `state`, `county`, `city`), `GET /api/maps/<id>/`, `PATCH /api/maps/<id>/`
(rename / fix the place), `GET /api/maps/<id>/file`, `PUT /api/maps/<id>/calibration`,
`GET|POST /api/sync/` (your spots and tracks — `POST` sends the device's set and returns the merged
one, needs a signed-in session), plus `GET /api/me/`, `POST /api/login/`, `POST /api/logout/`,
`POST /api/register/`.

The app is served from the same origin, so there is no CORS. Read endpoints are open to your
LAN — fine at home, not for the public internet; set `HUNTMAP_TOKEN` if you want writes
protected, or turn on accounts (below). Uploaded files stay in `server/media/`, outside the web
app folder.

### Library page: search, places, edit

`/library/` is the PC-side browser for the map library (the phone uses *Maps → From your PC*):

- **Search** matches the name, notes, state, county and city.
- **Filter** by state and county from menus built from what is actually in the library; the county
  menu narrows to the chosen state.
- Each row links to the file (**open** in the browser), shows type, size, whether it is
  georeferenced, and who owns it.
- **edit** (owner or staff) changes the name, PDF page, notes and **state / county / town-city**
  without touching the file. Place names are capitalised automatically so `rutland` and `Rutland`
  are the same filter.

`/upload/` (staff) adds a map and takes the same place fields, and so does the CLI:

```bash
python3 manage.py addmap ~/Maps/elm-ridge.pdf --name "Elm Ridge 1:24000" \
    --state Vermont --county Rutland --city Killington
```

### Local accounts (sign up / sign in)

Accounts live in this server's database — no external service, no email confirmation.

**If sign-in fails, the app now says why** (the sheet also prints the exact URL it posts to, e.g.
`https://huntmap.example.com/api/login/`):

| Message | Meaning / fix |
| --- | --- |
| *No HuntMap server on this address* | The page came from a static server (or an old bookmark). Open the app from your server/tunnel URL. |
| *This server is too old for accounts (no /api/login/)* | The container is out of date → **Pull and redeploy** (or `docker compose up -d --build`). |
| *This server has no accounts yet* | No users exist: set `HUNTMAP_ADMIN_PASSWORD` and restart, or open `/accounts/register/`. |
| *Wrong user name or password* | Case-insensitive and whitespace-tolerant now; the admin password is `HUNTMAP_ADMIN_PASSWORD`. Change it with `docker exec -it huntmap python manage.py changepassword admin`. |
| *The server replied with a web page instead of JSON* | Something in front (Cloudflare **Access**, an auth proxy, a captive portal) intercepted `/api/`. Sign in there first, or bypass `/api/*` for that app. |
| *Could not reach the server* | Wrong host/port, or the container is down. Check `curl -sk https://<host>:8443/api/me/`. |
| *I don't see a button the docs mention* (Sync spots, Edit on a map, state/county fields) | The phone is running a cached copy of the app. **Tools → About** shows `HuntMap v…` — compare it with `js/version.js`. Press **Tools → About → Update app** (clears the cache, unregisters the service worker, reloads); your data is kept. Then **Tools → Account → Check server**: `app v1.10.1 · server v4 …` proves both ends are current. |
| *Deleted spots come back after a sync* | Fixed in **v1.10.1**: the app sent a deletion without coordinates and the server skipped it. Redeploy the container **and** press **Tools → About → Update app** on the phone (both sides carry the fix). If the account sheet says *"N deletions not applied by the server — it is an older build"*, the container is still the old image. |
| *Check server says `0 maps in the library`* | The library really is empty: it only holds maps you uploaded. Add a map on the phone with **Copy to my PC library** ticked (it is ticked by default when signed in), use **Maps → Your maps → Edit → Copy to my PC library** for a map already on the phone, or drop files in `/upload/`. |
| **CSRF verification failed. Request aborted.** | TLS ended at a proxy/Cloudflare but Django thought it was http. Now handled automatically when the request comes from a local proxy (see below). If you front it with a proxy on *another* machine, set `HUNTMAP_PROXY_SSL=1`, `HUNTMAP_FORWARDED_HOST=1` and `HUNTMAP_ORIGINS=https://your.hostname`. |

**Why the CSRF error happened.** The browser posts `Origin: https://hunting.wilsonnet.dev`, but if
TLS terminates at Cloudflare/nginx and Django is reached over plain HTTP, Django computes
`http://hunting.wilsonnet.dev` and rejects the mismatch — admin login, `/accounts/login/` and the
upload form all fail with *"CSRF verification failed. Request aborted."* The server now trusts
`X-Forwarded-Proto` / `X-Forwarded-Host` **when the immediate peer is loopback or a private address**
(127.0.0.1, 172.17.0.1, 192.168.x.x — i.e. a tunnel sidecar or a proxy on the same host), so this
works out of the box. Headers from public addresses are ignored, so the protection is unchanged for
direct internet traffic.

Quick CLI check of the server side (should print JSON, `"user": null` when signed out):

```bash
curl -sk https://<docker-host>:8443/api/me/; echo
curl -sk https://<docker-host>:8443/api/diag/; echo      # accounts, admin, maps
curl -sk -X POST -H 'Content-Type: application/json' \
     -d '{"username":"admin","password":"YOUR-PASSWORD"}' \
     https://<docker-host>:8443/api/login/
```

**"Nobody can log in at all" — there is no administrator yet.** This is the most common first-run
problem (forgotten `HUNTMAP_ADMIN_PASSWORD`, or a compose file where it was blanked). You can see it
three ways:

- `docker logs <container> | grep -i admin` → `WARNING: this server has NO administrator account.`
- In the app: **Tools → Account → Check server** → `server v4 · 0 accounts · NO admin · 0 maps`.
  The version number is the quickest way to tell whether the container you are talking to is the
  image you just built: v4 fixed deletions, v3 added spot/track sync, v2 added the account/place features.
- `curl -sk https://<host>:8443/api/diag/` → `"staff": 0, "accounts_ready": false`.

Three ways out, all without editing the database by hand:

1. **From the app or a browser:** *Create account* (or open `/accounts/register/`). **The first
   account on the server automatically becomes the administrator**, so it can open `/admin/` and
   `/upload/` straight away.
2. Set `HUNTMAP_ADMIN_PASSWORD` in the stack and restart: the entrypoint creates/refreshes the
   `admin` superuser from it.
3. `docker exec -it <container> python manage.py createsuperuser`.

Once one admin exists, new accounts are ordinary users (their own maps plus the shared ones).

- **On the PC:** `/accounts/register/` to create one, `/accounts/login/` to sign in,
  `/library/` shows *Signed in as …* and a **Sign out** button.
- **On the phone:** open **Tools → Account** (top of the Tools sheet) → **Sign in**, or **Create
  account** in the same sheet. The session cookie is stored by the browser, so the app stays signed
  in and *From your PC* shows your maps.
- **Ownership:** a map uploaded while signed in belongs to that account; the API only lists your
  own maps plus **shared** ones (uploaded by the admin or via `addmap`, i.e. no owner). Downloading
  someone else's file returns 404, and editing it returns 403.
- **Locking it down:** `HUNTMAP_REQUIRE_AUTH=1` makes the library invisible to anonymous visitors
  (the app's PC panel then says *Sign in to see your maps*). Leave it `0` for a trusted home LAN
  where you just want everything visible.
- The **admin** account created from `HUNTMAP_ADMIN_PASSWORD` is a superuser: it sees and edits
  everything, including other people's maps.

**Spots and tracks follow the account.** Signing in doesn't just unlock the map library: your
**waypoints and recorded tracks are synced to the server** (`/api/sync/`) and come back on any other
device you sign into.

- It happens automatically: right after signing in, when you save/move/delete a spot, when a track
  stops, and once at start-up if you are already signed in. **Tools → Account → Sync spots** forces
  it and reports `Synced: 12 spots · 3 tracks`; *Check server* shows how many the server holds for
  you.
- Conflicts are per record: the copy with the newer `updatedAt` wins, so two phones editing the same
  spot don't overwrite each other's *other* spots.
- Deletions travel as tombstones, so a spot you delete on the phone is removed on the PC too (not
  resurrected by the next pull).
- Offline is unaffected: everything stays in the phone's database and the queue is flushed the next
  time you are online and signed in. Nothing is sent when you are signed out.

The server stores them in `SyncedSpot` / `SyncedTrack` (Django admin → *Maps* → those two models);
`/api/sync/` is `GET` (list) and `POST` (push the local set, receive the merged set) and requires a
signed-in session.

### Deploy with Docker / Portainer

The repo ships a `Dockerfile`, `docker-compose.yml` and a GitHub Actions workflow, so Portainer
can build it straight from your GitHub repo.

**Portainer → Stacks → Add stack → Repository**

| Field | Value |
| --- | --- |
| Repository URL | `https://github.com/<you>/<repo>` |
| Compose path | `docker-compose.yml` |
| Environment variables | `HUNTMAP_SECRET_KEY`, `HUNTMAP_ADMIN_PASSWORD` (see below) |

All variables and their defaults are in `.env.example`; copy it to `.env` next to the compose file
(or paste the keys into Portainer) and edit what you need.

Press **Deploy the stack**. Portainer clones the repo, builds the image and starts one
container. Open `https://<docker-host>:8443/` — the certificate is self-signed, so accept it
once on each device, then *Add to Home Screen*.

| Variable | Default | Notes |
| --- | --- | --- |
| `HUNTMAP_SECRET_KEY` | placeholder | **Change it.** Any long random string. |
| `HUNTMAP_ADMIN_USER` / `HUNTMAP_ADMIN_PASSWORD` | `admin` / `huntmap` | Created on first start; `/upload/` and `/admin/` login. |
| `HUNTMAP_CERT_SAN` | `DNS:localhost,IP:127.0.0.1` | Add your address, e.g. `IP:192.168.1.50`. |
| `HUNTMAP_HOSTS` | `*` | Django `ALLOWED_HOSTS`, comma separated. Loopback stays allowed for health probes. |
| `HUNTMAP_PUBLISH_PORT` | `8443` | Port on the Docker host you open in the browser. |
| `HUNTMAP_PORT` | `8443` (`8000` when `HUNTMAP_HTTPS=0`) | Port inside the container. The compose mapping and the healthcheck follow it. |
| `HUNTMAP_BIND` | `0.0.0.0` | Interface gunicorn/`serve.py` binds. Leave it unless a local proxy needs `127.0.0.1`. |
| `HUNTMAP_LAN_PORT` | unset | Tunnel stack only: host port for optional LAN access (see below). |
| `HUNTMAP_REDIRECT_PORT` / `HUNTMAP_PUBLISH_HTTP_PORT` | `8080` / `8080` | Plain-HTTP listener that redirects to HTTPS (fixes "typed ip:8443 without https://"). `0` disables. |
| `HUNTMAP_PUBLIC_PORT` | `HUNTMAP_PUBLISH_PORT` | Port the redirect points at (compose sets it for you). |
| `HUNTMAP_HTTPS` | `1` | `0` = plain HTTP (use behind your own TLS proxy or Cloudflare Tunnel). |
| `HUNTMAP_PROXY_SSL` / `HUNTMAP_FORWARDED_HOST` | off | Set to `1` behind Caddy/NPM/Traefik/Cloudflare. |
| `HUNTMAP_MAX_UPLOAD` | `314572800` (300 MB) | Largest accepted map file; Cloudflare allows 100 MB. |
| `HUNTMAP_TOKEN` | empty | If set, uploads and calibration writes need `X-HuntMap-Token`. |
| `HUNTMAP_REQUIRE_AUTH` | `0` | `1` = only signed-in accounts see the library (own + shared maps). |
| `HUNTMAP_WORKERS` / `HUNTMAP_THREADS` | `1` / `8` | One worker keeps SQLite happy; threads handle concurrency. |

Data lives in the named volume **`huntmap-data`** (`/data` inside the container; Portainer prefixes
it with the stack name, e.g. `huntmap_huntmap-data`): `db.sqlite3`, uploaded maps in `media/`, and
the TLS certificate in `certs/`. Portainer can browse, back up and restore that volume from
*Volumes*.

**What is actually inside the container.** The image is the app plus the Django project, nothing
else — no test suites, no screenshots, no dev scripts, no git history:

```
/srv/huntmap/index.html, manifest.webmanifest, sw.js, css/, js/, vendor/, icons/
/srv/huntmap/server/            (Django project, migrations, templates, entrypoint)
/data/                          (volume: db.sqlite3, media/, certs/)
```

`tests/` (Playwright suites, sample maps, screenshots, `static_server.py`), `.github/`, the
compose files, `README.md` and `.env.example` stay in the repository for development; `.dockerignore`
keeps them out of the build context and the image. So there is only one thing to set up for
Portainer: build the repo (or use the GHCR image) and mount the volume.


**Changing ports.** `.env.example` lists every variable; copy it to `.env` next to
`docker-compose.yml` (git ignores `.env`) or paste the keys into Portainer's environment editor.

```bash
# One variable moves both sides: host 595 -> container 595
HUNTMAP_PORT=595

# Only the host port (container stays 8443) — e.g. something else owns 8443
HUNTMAP_PUBLISH_PORT=9443

# Plain HTTP on 595, no TLS inside (reverse proxy / tunnel / LAN-only testing)
HUNTMAP_HTTPS=0
HUNTMAP_PORT=595
```

| Variable | Meaning | Must match |
| --- | --- | --- |
| `HUNTMAP_PORT` | server port inside the container **and**, unless set separately, the published host port | the URL you open, the tunnel's Public Hostname, any reverse-proxy upstream |
| `HUNTMAP_PUBLISH_PORT` | host port only (overrides the left side of the mapping) | the URL you open |
| `HUNTMAP_BIND` | interface inside the container | leave `0.0.0.0`; `127.0.0.1` makes the published port and the tunnel unreachable |

`HUNTMAP_PORT` also drives the healthcheck, so a custom port is still reported correctly. Ports
below 1024 work inside Docker (Docker allows unprivileged binding); on a bare host you need root or
a port above 1024. The "one variable, both sides" default uses nested substitution and needs Compose
v2 (standard in Docker Desktop, `docker compose`, and Portainer 2.x); on an older parser set
`HUNTMAP_PUBLISH_PORT` explicitly as well. Outside Docker the same variables drive the dev servers:

```bash
HUNTMAP_PORT=9443 HUNTMAP_HTTPS=1 python3 server/serve.py
```

**Your own domain / existing reverse proxy** (Caddy, Nginx Proxy Manager, Traefik, Cloudflare
Tunnel). Put TLS in the proxy, not in the container, and tell Django to trust its headers:

```dotenv
HUNTMAP_HTTPS=0                 # container serves plain HTTP
HUNTMAP_PORT=8000
HUNTMAP_PUBLISH_PORT=8000       # publish on loopback only if the proxy is on this host
HUNTMAP_PROXY_SSL=1             # trust X-Forwarded-Proto: https
HUNTMAP_FORWARDED_HOST=1        # trust X-Forwarded-Host
HUNTMAP_HOSTS=hunting.wilsonnet.dev
HUNTMAP_ORIGINS=https://hunting.wilsonnet.dev
```

`HUNTMAP_HOSTS` and `HUNTMAP_ORIGINS` are the only "allow the domain" settings this app needs: the
first accepts the `Host` header, the second lets the `/upload/` form post over https. Point the
proxy's upstream at `http://<docker-host>:8000` (or `http://huntmap:8000` on a shared Docker
network). With `HUNTMAP_HOSTS=*` (the default) any name is accepted, which is fine on a private LAN
but not on the internet.

**Automatic updates (optional).** Push the repo to GitHub and the workflow in
`.github/workflows/docker.yml` builds a multi-arch image and publishes it to
`ghcr.io/<owner>/<repo>:latest`. Then:

1. In Portainer, add `docker-compose.ghcr.yml` as the stack instead, with
   `HUNTMAP_IMAGE=ghcr.io/<owner>/<repo>:latest` (make the GHCR package public, or add
   `ghcr.io` as a registry in Portainer).
2. In the stack, enable **GitOps updates → Webhook**, copy the URL, and add it to the GitHub
   repo as a webhook (Settings → Webhooks). Every push then redeploys the stack.
   Optionally set **Polling** instead of a webhook.

**Certificate reality check.** Self-signed HTTPS is fine for opening the app and using GPS, but
**service workers (offline mode) need a certificate the browser trusts**. With a self-signed
cert that you only clicked through, Chrome may refuse to register it and iOS behaves
inconsistently. For dependable offline use, do one of these:

- use a proxy with a real certificate (Caddy, Nginx Proxy Manager, Traefik) and run the
  container with `HUNTMAP_HTTPS=0` + `HUNTMAP_PROXY_SSL=1` + `HUNTMAP_FORWARDED_HOST=1` on
  port 8000, or
- install the self-signed certificate as trusted on the phone
  (*Settings → General → About → Certificate Trust Settings*), or
- import your own certificate into the volume at `/data/certs/cert.pem` + `key.pem`
  (e.g. from your internal CA) and restart the container.

#### Behind a Cloudflare Tunnel (real certificate, no warnings)

A tunnel is the cleanest way to get a *trusted* certificate: Cloudflare terminates TLS, so the
service worker registers normally, the phone shows no warning, and the library is reachable even
when you are not at home. The repo ships `docker-compose.cloudflare.yml`, which runs the app plus
a `cloudflared` sidecar on an internal network — no ports are published.

1. **Cloudflare → Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared → Docker** and
   copy the token from the shown command.
2. **Public hostname** for that tunnel (the port must equal `HUNTMAP_PORT`, default `8000`):

   | Field | Value |
   | --- | --- |
   | Subdomain / Domain | `huntmap` / `example.com` |
   | Service | `HTTP` → `huntmap:8000` |

3. **Portainer → Stacks → Add stack → Repository**, compose path `docker-compose.cloudflare.yml`,
   environment:

   ```
   CLOUDFLARE_TUNNEL_TOKEN=<token from step 1>
   HUNTMAP_SECRET_KEY=<long random string>
   HUNTMAP_ADMIN_PASSWORD=<your login>
   HUNTMAP_HOSTS=huntmap.example.com
   HUNTMAP_ORIGINS=https://huntmap.example.com
   ```

4. Open `https://huntmap.example.com/` — padlock, no click-through, then *Add to Home Screen*.

Already running `cloudflared` in another stack? Put both containers on a shared network and point
the public hostname at `http://huntmap:8000`:

```bash
docker network create huntmap-net      # add it to the huntmap and cloudflared services
```

**Keeping the LAN stack and pointing your existing tunnel at it.** The container must speak *plain
HTTP* to the tunnel, exactly like your other apps. Two ways:

| Tunnel origin | Container settings | Notes |
| --- | --- | --- |
| `HTTP` → `http://<host-or-service>:595` | `HUNTMAP_HTTPS=0`, `HUNTMAP_PORT=595`, plus the proxy headers below | same pattern as your other apps; publish 595 and the tunnel reaches it |
| `HTTPS` → `https://huntmap:8443` + **No TLS Verify** | keep `HUNTMAP_HTTPS=1` | Cloudflare accepts the self-signed cert; LAN keeps real TLS |

Either way add `HUNTMAP_PROXY_SSL=1`, `HUNTMAP_FORWARDED_HOST=1`,
`HUNTMAP_HOSTS=hunting.wilsonnet.dev` and `HUNTMAP_ORIGINS=https://hunting.wilsonnet.dev`.
`huntmap` is the compose service name as seen *inside* the Docker network; from `cloudflared`
running on the host use `localhost:<published port>`, from another container use the container name
or the host's LAN address — inside a container `localhost` means the tunnel container itself.

**Nothing listens on port 80.** The container has exactly two listeners: `HUNTMAP_PORT` (TLS by
default) and `HUNTMAP_REDIRECT_PORT` (8080, plain HTTP → 308 to HTTPS). Publishing host port 80
(`HUNTMAP_PUBLISH_HTTP_PORT=80`) exposes only the *redirect*, so a tunnel pointed there would follow
the 308 to the LAN address and fail — point the tunnel straight at the HTTP listener instead.

The stack sets what a TLS-terminating proxy needs:

| Setting | Value | Why |
| --- | --- | --- |
| `HUNTMAP_HTTPS` | `0` | Cloudflare does TLS; gunicorn speaks plain HTTP. |
| `HUNTMAP_PORT` | `8000` | Port gunicorn binds; must match the tunnel's Public Hostname. |
| `HUNTMAP_PROXY_SSL` | `1` | Trust `X-Forwarded-Proto: https`, else Django thinks the request is http. |
| `HUNTMAP_FORWARDED_HOST` | `1` | Trust `X-Forwarded-Host`, so `file_url` in the API carries the public name. |
| `HUNTMAP_HOSTS` | `huntmap.example.com` | Pins `ALLOWED_HOSTS`; `127.0.0.1`/`localhost` stay allowed for the healthcheck. |
| `HUNTMAP_MAX_UPLOAD` | `95000000` | Cloudflare accepts at most 100 MB per request (Free/Pro/Business). |

Cloudflare dashboard settings that matter:

- **Always Use HTTPS: on.** The zone's SSL/TLS mode does not apply — with a tunnel, Cloudflare
  never connects to your origin directly.
- **Rocket Loader: off** — it rewrites scripts and can break the app.
- **Bot Fight Mode: off** for this hostname (or a WAF skip rule) — browser challenges make the
  app's `fetch()` calls fail instead of returning data.
- **Cache rule: bypass for `/api/*` and `/sw.js`** so downloads and app updates are never stale.
- **Cloudflare Access (recommended).** `GET /api/maps/` and the file downloads are unauthenticated
  — anyone with the hostname can pull your maps. Access puts an email/SSO login in front of the
  whole thing. Trade-off: when the Access session expires, the installed app's sync requests get
  the login page instead of data (offline use and GPS are unaffected). Use a long session
  (*Access → Applications → Session duration*, e.g. 1 month), or skip Access and rely on
  `HUNTMAP_TOKEN` for writes plus an unguessable hostname for reads.
- **Uploads over 100 MB** are rejected by Cloudflare. Uncomment the `ports:` block in
  `docker-compose.cloudflare.yml`, set `HUNTMAP_LAN_PORT=8000`, redeploy, and upload from a machine
  on your LAN (`http://<docker-host>:8000/upload/`); or export a smaller scan.

**Command line equivalent**

```bash
docker compose up -d --build          # build from this folder
docker logs -f huntmap                # watch migrate + gunicorn
docker exec -it huntmap python manage.py changepassword admin
docker cp ~/Maps/quad.tif huntmap:/tmp/quad.tif
docker exec -it huntmap python manage.py addmap /tmp/quad.tif --name "Elm Ridge 1:24000"
```

`GET /api/health/` is a small JSON probe (used by the container healthcheck).

**"I can't connect" — the https:// trap.** Typing `192.168.1.50:8443` (no scheme) or opening an
old `http://` bookmark sends **plain HTTP to the TLS port**. The browser shows a connection error
and the container log fills with:

```
[WARNING] Invalid request from ip=192.168.1.50: [SSL: HTTP_REQUEST] http request (_ssl.c:1011)
```

Nothing is broken — the server wants TLS on that port. Fixes:

1. Open **`https://192.168.1.50:8443/`** (type the `https://` yourself) and accept the certificate.
2. Or open **`http://192.168.1.50:8080/`** — a plain-HTTP listener (enabled by default in the LAN
   stack) answers with a `308` to the right HTTPS URL, preserving path and query.
   Set `HUNTMAP_PUBLISH_HTTP_PORT=80` to make the bare IP work in a browser.
3. If a reverse proxy or tunnel sits in front, it must speak **https** to `8443`, or point at
   `http://huntmap:8000` with the tunnel stack (which serves plain HTTP inside).

Related log lines and what they mean:

| Log | Meaning |
| --- | --- |
| `[SSL: HTTP_REQUEST] http request` | plain HTTP hit the TLS port (see above) |
| `Invalid HTTP request received` + binary junk | https hit a plain-HTTP port (`HUNTMAP_HTTPS=0` mismatch) |
| `DisallowedHost: Invalid HTTP_HOST header` | `HUNTMAP_HOSTS` doesn't include the name you used |
| `403 CSRF verification failed` | behind a proxy without `HUNTMAP_PROXY_SSL=1` / `HUNTMAP_ORIGINS` |

---

## 3. First five minutes in the woods

| Button | What it does |
| --- | --- |
| **Mark** | Save a spot: at your GPS position, or at the crosshair while placement mode is on. |
| **Record** | Start/stop a GPS track. Keep the app open while recording. |
| **Spots** | List, search, edit, navigate to, share, GPX export/import. |
| **Tools** | Sun & moon, compass, tracks, go-to coordinates, GPS details, backup, settings. |
| **Maps** | Base map choice, your PDF maps, offline tile download. |

**Spot types and their icons.** Every type has its own line-art icon, drawn inside the map pin, on
the type chips and in the spot list: **treestand**, **ground blind**, **building / cabin**,
**deer**, **bear**, **turkey**, **trail camera**, **water**, **food plot**, **sign / scrape**,
**track / rub**, **kill site**, **camp**, **vehicle**, **hazard**, **waypoint**. The icon is what
you see at a glance on the map; the label is in the list and in the pin tooltip.

**Going to a spot.** Open **Spots** and tap a row: the map jumps to that spot (zooming in if you
were far out), the pin is highlighted and the list closes — the toast tells you how far it is and
that the pin opens the editor. The **Edit** button at the end of each row opens the full sheet
(type, notes, go-to, share, delete) instead of moving the map.

Other gestures:

- **Tap the map** → coordinates under your finger appear in the top chip; tapping a pin
  opens that spot.
- **Long-press the map** → drop a new spot exactly there (handy for a rub or scrape seen on
  a photo map).
- **◎ Crosshair** (map controls) → placement mode: a crosshair sits in the middle of the map,
  the panel shows its coordinates and your distance/bearing to it, and you **drag the map** to
  aim. Press **Drop waypoint**, or just tap the map, to place it there. The Mark button also
  drops at the crosshair while the mode is on. **Done** leaves the mode.
- **Pinch / drag** → zoom and pan. **Double-tap** zooms in.
- **Tap the coordinate chip** → cycle decimal ↔ deg/min/sec ↔ UTM.
- **Tap the GPS chip** → GPS details and a restart button.

![Crosshair placement mode: coordinates, distance from you, and a Drop button](tests/screenshots/09-crosshair.png)

![Spot list and map pins carrying their type icons](tests/screenshots/10-spot-icons.png)

---

## 4. Adding a PDF, TIFF or paper map (the useful part)

### 4a. Get the file onto the phone

Put the file in **Files** (AirDrop, iCloud, email, download). Supported:

| Format | Notes |
| --- | --- |
| **PDF** | Multi-page: pick the page. Rendered by pdf.js on the device. |
| **TIFF / TIF** | Any compression (uncompressed, LZW, PackBits, JPEG, Deflate). Multi-page TIFF uses the first page. Decoded by UTIF on the device. |
| JPEG / PNG / HEIC / WebP | Photos of maps, phone screenshots, exported images. |

Nothing is uploaded — everything is converted on the device.

### 4b. Load it

**Maps → Add PDF or image → Choose file** → pick the page (PDF only) and resolution → **Load map**.

Before loading you can fill in **Name**, **State** (autocomplete for US states and Canadian
provinces), **County** and **Town / city**. When you are signed in there is also **Copy to my PC
library** (ticked by default): the original file is uploaded to your library, so a second PC or phone
that signs in as you can download it from *From your PC* — the georeference you place here is pushed
to the server too. Untick it to keep the map on this device only.

Every map already on the device — including ones added before this existed — can be named and given a
place later: **Maps → Your maps → Edit** (name, state, county, town, PDF page). If the map is only on
this device the same sheet offers **Copy to my PC library**: the page image the app already has is
uploaded, the georeference is pushed with it, and from then on the map is in *From your PC* on every
device you sign into (no need to find the original PDF again).

Resolution: 2000 px is fast, 3000 px is the default and fine for most 1:24,000 quads,
4000 px is sharpest but slower and uses more memory.

Very large TIFFs (over ~70 megapixels) are refused — resize them to about 3000 px first
(Preview/Photos export, or `magick big.tif -resize 3000x3000\> map.jpg`). Converting a TIFF to
PNG/JPEG is also a good idea if you want to save storage space.

### 4c. Rotate it if the scan is sideways

After the image loads you get a **Rotate image** row:

- **↺ 90° / ↻ 90°** — turn a landscape scan into portrait, or fix a scan that came in sideways.
- **180°** — upside-down scan.
- The current angle is shown next to the buttons; every click re-renders from the original, so
  rotating back and forth never degrades the image.

Then, when georeferencing, two more rotation tools are available:

- **Fine rotation** slider (±15°, 0.5° steps) in the control-point sheet — fixes a scan that is
  a few degrees crooked, without needing to redraw it.
- **±90°** buttons (and two-finger **twist**) for a quick quarter turn, plus **Size**, **Rotate** and
  **Fade** sliders in the *align on map* view. The sliders are logarithmic, so a nudge near ×1.00
  moves the overlay by a few pixels, and the line under them reads out the overlay's real width
  and scale (`4.2 mi wide · 12.3 ft/px`) — handy for matching a paper map exactly.

![Align bar with size, rotation and fade sliders](tests/screenshots/06-align-sliders.png)

![A TIFF scan rotated 90° and skewed 5°, georeferenced over the base map](tests/screenshots/05-tiff-rotated.png)

### 4d. Georeference it — two ways

**A. Two control points (most accurate)**

1. Tap **Enter 2 control points**.
2. Tap a landmark on the image (a section corner, road junction, summit, lake point).
3. Type its real coordinates — anything readable works:
   `44.1234, -71.5678` · `44 07 24 N 71 33 12 W` · `19T 294554 4888785`
4. Repeat for a second landmark **far away** from the first — the further apart, the better.
5. Leave **North-up map** on (paper maps usually are), add **Fine rotation** if the scan is
   skewed, then press **Apply georeference**.

**B. Place & align on the map**

1. Tap **Place & align on map**. The overlay appears at the current map view.
2. Drag with one finger, pinch/twist with two to line it up with roads, ridges and water.
3. Use *Bigger / Smaller / ±90° / ±1° / ±10°* and the opacity slider to fine-tune, then
   **Lock it in**.

If you know the **paper scale** (1:24,000, 1:50,000 …), choose it before loading — the overlay
starts at the right size, which makes aligning much faster. For TIFFs the app reads the scan
resolution (DPI) tag when present, so 1:24,000 scans also come in at the right size.

After calibration a layer can be toggled, faded, re-aligned or removed in **Maps**. Its
position is stored with the layer, so it loads in the right place next time.

### Accuracy tips

- Two points 1–3 km apart give a good result; 100 m apart will be noticeably off.
- Phone GPS is typically 3–10 m, sometimes 30 m under canopy. Do not use this for property
  boundaries or legal descriptions.
- An already-georeferenced **GeoPDF** still has to be calibrated this way — the app reads the
  printed image, not the embedded projection.

---

## 5. Offline use

| Data | Where it lives | Works in airplane mode |
| --- | --- | --- |
| App (HTML/JS/CSS/PDF engine) | Service worker cache | Yes, after one online load |
| Spots, tracks, settings, map calibration | IndexedDB | Yes |
| PDF/page images | IndexedDB (as PNG/JPEG) | Yes |
| Base map tiles | Cache API | Only tiles already viewed or downloaded |

**Before you lose signal:** open **Maps**, zoom to the area you will hunt, set the zoom range
(e.g. 12 → 16) and press **Download view**. The app estimates the tile count first and refuses
huge jobs. A 4 × 6 km area at z12–16 is roughly 400 tiles / 10 MB.

**Airplane-mode reality check:** GPS keeps working, but the first fix can take 30–120 seconds
because the phone cannot use network assistance. Hold it under open sky. Compass heading comes
from the magnetometer and is independent of the network.

**If the fix takes forever.** The app asks for two things at once: a **quick Wi-Fi/network fix**
(`enableHighAccuracy: false`, usually answered in a second or two at 20–500 m) and a **satellite
watch** that refines it to 3–10 m. That is why you get a position on the map almost immediately and
a better one a moment later. When nothing arrives:

1. **Indoors / on a laptop** there is no satellite signal — only network positioning. Chrome/Safari
   need the **OS location service** switched on (*Windows: Settings → Privacy → Location*,
   *macOS: Privacy & Security → Location Services*), and the network fix needs internet.
2. **Tap the GPS chip → Fast Wi-Fi fix** to skip the satellite wait (it clears *Settings →
   High-accuracy GPS*). Turn that setting back on outdoors for metre-level accuracy.
3. **On the phone outdoors**, give it up to 2 minutes under open sky the first time; after that
   fixes are instant because the almanac is cached.
4. If the chip shows **No fix · 25 s**, the app is telling you nothing came back — check permission
   (the chip would say *GPS blocked*) and the location service, then *Restart GPS*.

**Keep the screen on:** *Tools → Keep screen awake* uses the Wake Lock API where supported
(iOS 16.4+, Chrome). If it is unavailable, raise *Settings → Display → Auto-Lock* instead.

---

## 6. Tile providers and their rules

| Provider | Notes |
| --- | --- |
| **USGS Topo / Imagery (US)** | Public domain. Default in North America. Best choice for offline hunting use in the US. |
| **OpenStreetMap** | Community servers. Fine for normal viewing; **bulk downloading is against their tile usage policy** (see below). |
| **OpenTopoMap** | Community, CC-BY-SA, contour lines, max zoom 17. Same policy as OSM. |
| **Esri World Imagery / Topo** | Free for light use; check Esri's terms before caching large areas. |

The app sends a normal browser request **with a Referer** (OSM's policy rejects requests without
one), shows the required attribution, and keeps downloads small: one request at a time for
OSM/OpenTopoMap (600-tile cap), up to 4 parallel for USGS/Esri (2,500-tile cap). If a provider
refuses a request the app says so instead of drawing the error image.

**"Access blocked" from OpenStreetMap** means their servers have blocked your *network* (usually
after a large offline download — the policy forbids bulk use). It is per IP, not per device, and it
lifts after a while. What to do:

1. Switch the base map to **USGS Topo** (US, public domain) or **Esri World Topo/Imagery** — no
   block, and USGS is the better hunting base map anyway.
2. Map tiles you already viewed or downloaded keep working (the cache is checked before the block
   is honoured).
3. Don't retry in a loop: the app stops asking that provider for 10 minutes and tells you why.

The app cannot and should not bypass a provider block (that is what proxies and VPNs for tile
scraping are, and they get blocked too). For big offline areas the right answer is **your own PDF
maps** (unlimited, precise, no policy issues) — that is why the PDF workflow exists.

---

## 7. Backup, import and moving data

- **Tools → Backup → Download backup (JSON)** — spots, tracks, map calibration and settings.
  The images themselves are not included; keep the original PDF/TIFF files.
- **Restore backup** replaces the data on the device.
- **GPX export/import** — spots and tracks interoperate with Garmin, onX, Gaia, CalTopo, etc.
- **Erase app data** wipes everything, including cached tiles.

---

## 8. Settings worth knowing

| Setting | Effect |
| --- | --- |
| Units | Feet/miles or metres/km everywhere (distances, elevations, speeds). |
| Coordinates | Decimal degrees, deg/min/sec or UTM in the HUD and lists. |
| Red night mode | Black/red UI and dimmed map — preserves night vision. |
| Keep screen awake | Wake lock while the app is open. |
| High-accuracy GPS | Uses the precise GPS chip rather than coarse/network fixes. |
| Waypoint labels | Names next to pins on the map. |
| Lat/lon grid | Graticule with degree labels. |
| Show tracks on map | Hide old tracks for a cleaner map. |

---

## 9. Project layout

```
index.html                 app shell, panels, icon sprite
manifest.webmanifest       PWA metadata (name, icons, standalone)
sw.js                      service worker: app-shell offline cache
CHANGELOG.md               release notes, one section per version
css/app.css                theme, sheets, night mode, touch layout
js/version.js              the version number (app + service-worker cache name)
js/util.js                 DOM helpers, formatting, toasts, modal dialogs
js/geo.js                  Mercator projection, haversine, UTM, coordinate parsing
js/sun.js                  NOAA sunrise/sunset/twilight, Meeus moon phase
js/db.js                   IndexedDB wrapper (+ in-memory fallback)
js/tiles.js                tile providers, Cache-API tile store, area downloader
js/map.js                  canvas map renderer, gestures, overlays, tracks, pins
js/gps.js                  geolocation watch, smoothing, compass, wake lock
js/data.js                 spots, tracks, layers, GPX, backup/restore
js/pdfmap.js               pdf.js/TIFF rendering, image rotation, calibration math
js/sync.js                 optional bridge to the Django server (PC map library)
js/app.js                  all UI wiring
vendor/pdfjs/              pdf.js 3.11.174 (legacy UMD build, Apache-2.0)
vendor/utif/               UTIF 3.1.0 TIFF decoder (MIT)
vendor/pako/               pako 2.1.0 zlib for Deflate TIFFs (MIT)
Dockerfile                 container image: app + Django, HTTPS, healthcheck
.env.example               every environment variable (ports, TLS, secrets) with defaults
docker-compose.yml         Portainer/compose stack (builds from this repo)
docker-compose.ghcr.yml    stack for the prebuilt GHCR image
docker-compose.cloudflare.yml  stack for Cloudflare Tunnel (app + cloudflared, no TLS inside)
.github/workflows/docker.yml  builds + publishes the image on push
server/                    the Django server: library, accounts, upload page, sync API
  manage.py                migrate, createsuperuser, addmap, ensureadmin, runserver
  serve.py                 HTTPS runner for the LAN (self-signed cert)
  docker-entrypoint.sh     migrate + admin + gunicorn (TLS) on container start
  healthcheck.py           container health probe
  huntmap_server/          settings, urls, middleware (local-proxy header trust)
  maps/                    model, admin, API views, /library/ and /upload/ pages
tests/e2e.py               Playwright: standalone app (no server)
tests/static_server.py     static server used only by that test (not in the image)
tests/e2e_django.py        Playwright: PC sync + airplane mode
tests/sample-topo-map.pdf  sample PDF map for trying the import workflow
tests/sample-topo-map.tif  sample TIFF map (LZW compressed)
```

Debug handles on `window.Hunt`: `Geo`, `Sun`, `DB`, `Tiles`, `MapView`, `GPS`, `Data`,
`PDFMap`, `Sync`, `App` (and `Hunt.App.map`, the live map instance).

---

## 10. Tests

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/e2e.py            # standalone app
python3 tests/e2e_django.py     # Django server: download + airplane mode
python3 tests/e2e_docker.sh     # the built container: health, ports, upload, volume restart
python3 tests/check_compose.py  # compose port/env resolution, no containers started

cd server && python3 manage.py test maps    # server/API unit tests
```

`tests/e2e.py` (86 checks): load without errors, the version in *Tools → About* matching
`js/version.js` with the service-worker cache named after it, GPS fix (two-phase: a quick network/Wi-Fi request
then a high-accuracy watch, source recorded, watchdog armed, and the **Fast Wi-Fi fix** button
switching the watch to network mode), HUD coordinates/UTM, base map default and
tile loading, tile-policy handling (Referer, OSM throttling/600-tile cap, an HTML "Access blocked"
page is never drawn and marks the provider blocked), the 16 spot types and their icons (rasterised
for the canvas, shown on the chips and in the list), waypoint save + persistence, navigation bar,
sun/moon panel, the built-in self-test, PDF open/rasterise, adding
a PDF through the real UI (file picker → rasterise → tap two control points → apply), north-up
georeferencing, overlay pixels on the canvas, **crosshair placement** (mode, canvas drawing,
HUD readout, panning moves the target, Drop button and tap both place a waypoint away from the GPS
dot), **tapping a spot row** (map centres on it, list closes, pin selected), track recording while
moving, GPX round-trip, reload persistence, service worker, a full **offline reload**, a **TIFF**
map loaded through the UI, rotated 90°, georeferenced with a 5° fine rotation, and the align-bar
sliders.

`tests/e2e_django.py` (39 checks): Django serves the app, the PC library is listed with its place,
**search / state filters**, **editing a map's details on the server**, the **Tools → Account** card
(create account, shows the user, sign out), **Sync spots visible while signed out**, the app version
in *Tools → About*, the `/library/` page and its state filter, PDF + TIFF
downloaded and stored, the phone's georeference uploaded to the PC, then with the network **off**:
the app opens, both maps survive with their images, GPS reports a fix and the georeferenced map
renders from storage. A second, fresh phone downloads the map and starts with the PC's
georeference, a **map uploaded by one signed-in device shows up on another**, and so do **spots**:
a waypoint made on the first device is synced to the account (`/api/sync/`) and is there after the
second device signs in, **deleting it sticks** (gone locally, gone on the server, gone on the other
device before it syncs again). Also checks that the add-map form and the per-map **Edit** sheet both
carry name / state / county / city.

`server/maps/tests.py` (40 tests): app files served and private files hidden, health endpoint
(including loopback probes with a pinned host name), upload/list/download, MIME types, sha256,
calibration validation, token protection, login requirement, the upload form, `addmap` idempotency
and `--state/--county/--city`, place filters + the `/library/` page and edit form, metadata editing
(owner yes, stranger 403), account registration/login/logout, **the first account becoming the
administrator**, `/api/diag/`, **CSRF behind a TLS-terminating proxy** (trusted for local peers,
ignored for the internet), ownership scoping, `HUNTMAP_REQUIRE_AUTH`, and **spot/track sync**:
sign-in required, newest `updatedAt` wins, **coordinate-less tombstones**, a deletion beating a slow
clock, unknown-id tombstones, a second device receiving the same account's spots, and accounts being
kept apart.

`tests/e2e_docker.sh` (32 checks, three container modes): builds the image, starts the HTTPS
container, waits for Docker's healthcheck, verifies the app shell + `/api/health/` + static assets,
that private files are hidden and `/upload/` needs a login, that plain `http://` gets a 308 to the
published HTTPS port (and following it works), uploads a map through the API, downloads it again,
restarts and confirms map + admin survived the volume; then starts a second container in
"TLS terminated upstream" mode (pinned host name, `X-Forwarded-Proto/Host`) and checks it goes
healthy, serves plain HTTP, accepts an upload, returns `file_url` on the public origin, and that the
admin login POST passes CSRF from the https origin; finally starts a third container on a custom
port (`HUNTMAP_PORT=9443`, published as 19443) and checks gunicorn binds it and the healthcheck
still passes.

`tests/check_compose.py` (20 checks) renders each stack with different variables and asserts what
would be published: `HUNTMAP_PORT` alone moves both sides, `HUNTMAP_PUBLISH_PORT` moves only the host
side, the redirect target follows the published port, the tunnel stack publishes nothing and speaks
plain HTTP on 8000 with proxy headers trusted, and `cloudflared` receives its token.

There is also an in-app self-test: **Tools → Run self-test** (geometry, UTM, sun, GPX,
storage, PDF engine, TIFF decoder, calibration rotation).

---

## 11. Known limitations

- iOS pauses web pages in the background; tracks only record while the app is open and the
  screen is on. There is no background GPS for web apps.
- Phone GPS accuracy is 3–30 m and can be much worse under heavy canopy or in canyons.
- Two-point calibration assumes a locally uniform scale and (optionally) north-up; very large
  or oblique scans may need the drag-align method plus manual rotation.
- TIFF: only the first page of a multi-page file is used, files above ~70 megapixels are refused
  (resize first), and decoding a big TIFF takes a few seconds on older phones.
- No property boundaries, no legal descriptions, no emergency/SOS service. Carry a compass
  and paper map as backup, and follow your local hunting regulations.
- PDF rendering needs pdf.js from `vendor/pdfjs/` and TIFF needs `vendor/utif/` (+ `vendor/pako/`
  for Deflate). If one is missing only that format is disabled; everything else still works.
- Tile providers can refuse traffic (403) or change URLs at any time; the app reports it.
- Sync needs the server to be reachable: spots and tracks queue up offline and go out on the next
  successful sync, but a device that never signs in keeps them local. Conflicts are resolved per
  record with **last write wins** — there is no point-level merge of two tracks recorded at once on
  two phones.
- Downloaded maps are stored per browser origin. If you switch from `http://localhost` to
  `https://192.168.x.x`, the phone starts with an empty library until you download again.
- Offline mode needs a **trusted** certificate (service workers refuse untrusted origins).
  The container's self-signed cert works for GPS and the app, but for reliable offline caching
  put it behind a proxy with a real certificate, or install the cert on the phone.

---

## 12. Credits

- Map data © OpenStreetMap contributors (ODbL), OpenTopoMap (CC-BY-SA), USGS The National Map
  (public domain), Esri (see Esri terms).
- PDF rendering: Mozilla **pdf.js** 3.11.174, Apache-2.0 (`vendor/pdfjs/LICENSE`).
- TIFF decoding: **UTIF.js** 3.1.0, MIT (`vendor/utif/LICENSE`); Deflate support via
  **pako** 2.1.0, MIT (`vendor/pako/LICENSE`).
- Sun/moon algorithms: NOAA solar position equations and Meeus lunar longitude terms.
- Server: **Django** (BSD licence). `server/serve.py` only uses Python's standard library.
- Icons are generated locally; the UI has no external fonts or scripts.


