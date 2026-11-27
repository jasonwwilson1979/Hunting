# Charging for access: what has to be true

**This is a checklist, not legal advice.** Consumer law, tax and data-protection
rules depend on where you and your customers are. Have a lawyer review your terms
before you take money.

## 1. Base map: self-host, and credit it

- [ ] Generate your own raster tiles from OpenStreetMap data (see “Self-hosted base
      maps” in `README.md`) and serve them from this server
      (`HUNTMAP_TILES_DIR`, `HUNTMAP_TILES_MBTILES` or `HUNTMAP_TILE_URL`).
- [ ] **Do not** use `tile.openstreetmap.org` or `tile.opentopomap.org` for a paid or
      high-volume service. The OSMF policy says access may be withdrawn at any time
      and prohibits prefetch/offline; OpenTopoMap runs on donated hardware.
- [ ] **Do not** use the Esri public basemap endpoints unless you have an Esri
      agreement that covers your use. They are proprietary and not redistributable.
- [ ] Turn on `HUNTMAP_COMMERCIAL=1`. It hides every base map whose terms do not fit
      a paid service and replaces a stored choice that no longer qualifies.
- [ ] Keep the credit visible: “© OpenStreetMap contributors” linked to
      <https://www.openstreetmap.org/copyright> (the app does this in the map footer
      whenever a self-hosted layer is showing). Do not move it behind a menu.
- [ ] Publish `/licences/` (already built) and link it from your site footer.
- [ ] USGS layers: include “Map services and data available from U.S. Geological
      Survey, National Geospatial Program.” (public domain, acknowledgement requested).

## 2. Your users' content

- [ ] Terms of service: what the service is, what you promise (there is **no**
      emergency/SOS function and GPS accuracy is limited), acceptable use, that
      uploaded maps must not infringe someone else's copyright, account termination.
- [ ] Price, billing period, cancellation and **refund** policy, stated before
      purchase. EU/UK consumers have a 14-day withdrawal right for digital services
      unless they expressly waive it and start using the service — get this checked.
- [ ] Taxes: sales tax / VAT registration and invoices for the jurisdictions you sell
      into.
- [ ] Privacy policy: what you collect (account name, e-mail, hashed password,
      session cookie, uploaded maps, waypoints/tracks, IP and access logs), why, how
      long you keep it, who processes it (hosting provider, Cloudflare if you use the
      tunnel), and how to exercise access/export/erasure.
- [ ] Give people the rights the policy promises: **export** their data and **delete
      their account** without e-mailing you. (Both endpoints exist; see
      `/api/me/export/` and `DELETE /api/me/`.)
- [ ] If you serve the EU/UK, decide whether you are a controller/processor and
      whether you need a data-processing agreement with your host.
- [ ] Backups: say that you take them and how long you keep them; deleting an account
      has to remove the live data and age out of backups within the stated window.

## 3. The map library you host for customers

- [ ] Users may only upload maps they have the right to use. Put that in the terms and
      act on reports (takedown contact, e-mail address in the footer/imprint).
- [ ] Do not pre-load commercial map products (purchased topo/imagery, other apps'
      exports) into a library you offer to the public.
- [ ] The ODbL does **not** reach your users' waypoints or their uploaded files.

## 4. Operational

- [ ] A contact address and, where required (e.g. Germany), an imprint.
- [ ] Uptime/support expectations: the app is offline-first, but say what you support.
- [ ] Security: change `HUNTMAP_SECRET_KEY`, keep the admin password out of chat,
      `HUNTMAP_REQUIRE_AUTH=1` for a public site, and keep Django and the image patched.
- [ ] Logs: keep access logs long enough to debug, short enough to defend.
