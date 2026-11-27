#!/usr/bin/env python3
"""
End-to-end test for the Django side of HuntMap:

  * Django serves the app and the map library API
  * the phone app lists the PC library and downloads a PDF + a TIFF
  * both are stored locally and the list shows them as saved
  * a georeference created on the phone is uploaded to the PC
  * with the network off (airplane mode), the app still opens, the maps still
    render and GPS still reports a fix
  * a second, fresh phone downloads the map and reuses the PC's georeference

Requirements: Django (server/requirements.txt), Playwright + Chromium.
Run: python3 tests/e2e_django.py
"""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, "server")
PORT = 8101
BASE = "http://localhost:%d" % PORT
DB = "/tmp/huntmap-e2e.sqlite3"
MEDIA = "/tmp/huntmap-e2e-media"
SHOTS = os.path.join(ROOT, "tests", "screenshots")
ENV = dict(os.environ, HUNTMAP_DB=DB, HUNTMAP_MEDIA=MEDIA)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)))
    print(("PASS  " if ok else "FAIL  ") + name + (("   -> " + str(detail)) if detail else ""))
    return bool(ok)


def manage(*args):
    subprocess.run([sys.executable, "manage.py"] + list(args), cwd=SERVER, env=ENV,
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)


def center_pixel(page):
    """Brightest of a few sample points (avoids landing on the GPS marker)."""
    return page.evaluate("""(() => {
        const c = document.getElementById('map');
        const ctx = c.getContext('2d');
        const spots = [[0.5, 0.3], [0.32, 0.42], [0.68, 0.62], [0.5, 0.72], [0.42, 0.24]];
        let best = [0, 0, 0];
        for (const [fx, fy] of spots) {
            const d = ctx.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
            if (d[0] + d[1] + d[2] > best[0] + best[1] + best[2]) best = [d[0], d[1], d[2]];
        }
        return best;
    })()""")


def main():
    from playwright.sync_api import sync_playwright

    os.makedirs(SHOTS, exist_ok=True)
    for path in (DB, DB + "-journal"):
        if os.path.exists(path):
            os.remove(path)
    shutil.rmtree(MEDIA, ignore_errors=True)

    manage("migrate", "--noinput")
    manage("addmap", os.path.join(ROOT, "tests", "sample-topo-map.pdf"), "--name", "PC Topo",
           "--state", "Vermont", "--county", "Rutland", "--city", "Killington")
    manage("addmap", os.path.join(ROOT, "tests", "sample-topo-map.tif"), "--name", "PC TIFF",
           "--state", "Maine", "--county", "Franklin", "--city", "Rangeley")

    server = subprocess.Popen(
        [sys.executable, "serve.py", "--http", "--port", str(PORT), "--bind", "127.0.0.1", "--no-migrate"],
        cwd=SERVER, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2.0)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--no-sandbox"])
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                device_scale_factor=2,
                geolocation={"latitude": 44.1234, "longitude": -71.5678, "accuracy": 8.0},
                permissions=["geolocation"])
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

            page.goto(BASE + "/", wait_until="load")
            page.wait_for_timeout(1800)
            check("Django serves the app", page.title().startswith("HuntMap"), page.title())
            check("no JS errors on load", not errors, errors[:2])

            page.click("#btnLocate")
            page.wait_for_function("window.Hunt.GPS.state.status === 'ok'", timeout=15000)

            page.click("#btnLayers")
            page.wait_for_function("!document.getElementById('syncSection').hidden", timeout=10000)
            listed = page.inner_text("#syncList")
            check("PC library is listed", "PC Topo" in listed and "PC TIFF" in listed,
                  page.inner_text("#syncStatus"))
            check("library rows show the place", "Vermont" in listed and "Rutland" in listed, listed[:120])

            # ---------------- filters, editing, accounts ----------------
            page.fill("#syncSearch", "maine")
            page.wait_for_timeout(450)
            check("search narrows the PC library",
                  page.evaluate("document.querySelectorAll('#syncList .item').length") == 1,
                  page.inner_text("#syncStatus"))
            page.fill("#syncSearch", "")
            page.wait_for_timeout(450)
            check("clearing the search restores the list",
                  page.evaluate("document.querySelectorAll('#syncList .item').length") == 2)

            page.select_option("#syncState", "Vermont")
            page.wait_for_timeout(450)
            check("state menu filters the library",
                  page.evaluate("document.querySelectorAll('#syncList .item').length") == 1,
                  page.evaluate("document.querySelectorAll('#syncList .item').length"))
            page.select_option("#syncState", "")
            page.wait_for_timeout(450)

            page.click("#syncList .item .mini-btn")      # first row's Edit
            page.wait_for_timeout(500)
            page.fill("#metaCity", "Stockbridge")
            page.click("#btnMetaSave")
            page.wait_for_timeout(1200)
            edited = page.evaluate("window.Hunt.Sync.state.maps.map(function (m) { return m.city; })")
            check("editing a map saves to the server", "Stockbridge" in edited, edited)

            # Tools → Account
            page.evaluate("document.getElementById('btnMenu').click()")
            page.wait_for_timeout(600)
            check("Tools shows the account card", page.is_visible("#accountBox"))
            check("account card starts signed out",
                  "Not signed in" in page.inner_text("#accountState"),
                  page.inner_text("#accountState"))
            sync_btn = page.evaluate("""(() => {
                const b = document.getElementById('btnAccountSync');
                return { exists: !!b, hidden: b ? b.hidden : null, text: b ? b.textContent : '',
                         title: b ? b.getAttribute('title') : '',
                         version: (document.getElementById('appVersion') || {}).textContent,
                         ver: (self.HUNTMAP_VERSION || {}).app };
            })()""")
            check("Sync spots is visible even when signed out",
                  bool(sync_btn["exists"] and sync_btn["hidden"] is False), sync_btn)
            check("the app shows its version in Tools",
                  bool(sync_btn["ver"]) and ("v" + str(sync_btn["ver"])) in (sync_btn["version"] or ""),
                  sync_btn)
            page.evaluate("document.getElementById('btnAccountSignIn').click()")
            page.wait_for_timeout(600)
            page.fill("#signUser", "scout")
            page.fill("#signPass", "huntmap-pass-1")
            page.evaluate("document.getElementById('btnSignUpGo').click()")
            page.wait_for_timeout(1800)
            account = page.evaluate("""(() => ({
                user: window.Hunt.Sync.state.user,
                card: document.getElementById('accountState').textContent,
                rows: (window.Hunt.Sync.state.maps || []).length
            }))()""")
            check("creating a local account signs in", account["user"] == "scout", account)
            check("Tools account card shows the user", "scout" in account["card"], account["card"])
            check("shared maps stay visible to the new account", account["rows"] == 2, account)
            page.evaluate("document.getElementById('scrim').click()")
            page.wait_for_timeout(400)

            page.evaluate("document.getElementById('btnAccountSignOut').click()")
            page.wait_for_timeout(1200)
            check("signing out clears the user",
                  page.evaluate("window.Hunt.Sync.state.user") is None,
                  page.evaluate("window.Hunt.Sync.state.user"))

            library_page = page.request.get(BASE + "/library/")
            check("server library page lists the maps with places",
                  library_page.ok and "Rutland" in library_page.text()
                  and "Franklin" in library_page.text(), library_page.status)
            filtered_page = page.request.get(BASE + "/library/?state=Maine")
            check("server library page filters by state",
                  filtered_page.ok and "PC TIFF" in filtered_page.text()
                  and "PC Topo" not in filtered_page.text(), filtered_page.status)

            page.evaluate("document.getElementById('btnSyncAll').click()")
            page.wait_for_function(
                "window.Hunt.Data.layers.filter(function (l) { return l.remoteId && l.img; }).length === 2",
                timeout=150000)
            layers = page.evaluate("""(() => window.Hunt.Data.layers.map(function (l) {
                return {name: l.name, kind: l.kind, remoteId: l.remoteId, imgW: l.imgW,
                        hasImg: !!l.img, calib: !!l.calib};
            }))()""")
            check("both maps downloaded and stored", len(layers) == 2 and
                  all(l["hasImg"] and l["remoteId"] for l in layers), layers)
            check("list shows everything as saved", "all saved" in page.inner_text("#syncStatus"),
                  page.inner_text("#syncStatus"))
            page.screenshot(path=os.path.join(SHOTS, "07-sync-from-pc.png"))

            # ---------------- georeference is shared back to the PC ----------------
            pushed = page.evaluate("""async () => {
                const H = window.Hunt, D = H.Data, PM = H.PDFMap;
                const layer = D.layers.find(function (l) { return l.kind === 'pdf'; });
                layer.calib = PM.calibFromMetersPerPixel(layer.imgW, layer.imgH, 2.4, 44.1234, -71.5678);
                await D.saveLayer(layer);
                const ok = await H.Sync.pushCalibration(layer);
                const json = await (await fetch('api/maps/')).json();
                const remote = json.maps.find(function (m) { return m.id === layer.remoteId; });
                return {ok: ok, calib: remote && remote.calib, w: layer.imgW};
            }""")
            check("phone georeference uploaded to the PC", pushed["ok"] and pushed["calib"] is not None,
                  pushed)

            # ---------------- airplane mode ----------------
            ctx.set_offline(True)
            page.reload(wait_until="load")
            page.wait_for_timeout(1800)
            check("app opens with the network off", page.title().startswith("HuntMap"), page.title())
            page.wait_for_function(
                "window.Hunt.Data && window.Hunt.Data.layers.length === 2 && " +
                "window.Hunt.Data.layers.every(function (l) { return !!l.img; })",
                timeout=15000)
            offline = page.evaluate("""(() => ({
                layers: window.Hunt.Data.layers.length,
                withImages: window.Hunt.Data.layers.filter(function (l) { return !!l.img; }).length,
                withCalib: window.Hunt.Data.layers.filter(function (l) { return !!l.calib; }).length
            }))()""")
            check("downloaded maps survive offline", offline["withImages"] == 2, offline)

            page.click("#btnLocate")
            page.wait_for_function("window.Hunt.GPS.state.status === 'ok'", timeout=15000)
            page.wait_for_timeout(600)
            fix = page.evaluate("JSON.stringify(window.Hunt.GPS.state)")
            check("GPS still works in airplane mode", '"status":"ok"' in fix and "44.12" in fix,
                  json.loads(fix).get("accuracy"))

            page.evaluate("""(() => {
                const H = window.Hunt, PM = H.PDFMap;
                const layer = H.Data.layers.find(function (l) { return l.calib; });
                H.App.map.follow = false;
                H.App.map.setOverlays(H.Data.layers);
                if (layer) H.App.map.fitBounds(PM.bounds(layer), 20);
            })()""")
            page.wait_for_timeout(1200)
            pixel = center_pixel(page)
            check("georeferenced map renders from storage", pixel[0] > 120, pixel)
            page.screenshot(path=os.path.join(SHOTS, "08-airplane-mode.png"))
            ctx.set_offline(False)

            # ---------------- a second phone reuses the PC georeference ----------------
            ctx2 = browser.new_context(
                viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                geolocation={"latitude": 44.1234, "longitude": -71.5678, "accuracy": 8.0},
                permissions=["geolocation"])
            page2 = ctx2.new_page()
            page2.goto(BASE + "/", wait_until="load")
            page2.wait_for_timeout(1500)
            second = page2.evaluate("""async () => {
                const H = window.Hunt;
                await H.Sync.probe();
                const remote = H.Sync.state.maps.find(function (m) { return m.kind === 'pdf'; });
                if (!remote) return {error: 'no remote pdf'};
                const layer = await H.Sync.download(remote);
                return {calib: !!(layer && layer.calib), s: layer && layer.calib ? layer.calib.s : null,
                        name: layer && layer.name};
            }""")
            check("fresh phone downloads the map", second.get("name") == "PC Topo", second)
            check("fresh phone reuses the PC georeference", second.get("calib") is True,
                  second.get("s"))
            ctx2.close()

            # ---------------- upload on one device, sign in on another ----------------
            page.evaluate("document.getElementById('btnMenu').click()")
            page.wait_for_timeout(500)
            page.evaluate("document.getElementById('btnAccountSignIn').click()")
            page.wait_for_timeout(600)
            page.fill("#signUser", "scout")
            page.fill("#signPass", "huntmap-pass-1")
            page.evaluate("document.getElementById('btnSignInGo').click()")
            page.wait_for_timeout(2000)

            upload = page.request.post(BASE + "/api/maps/", multipart={
                "file": {"name": "phone-upload.pdf", "mimeType": "application/pdf",
                         "buffer": Path(ROOT, "tests", "sample-topo-map.pdf").read_bytes()},
                "name": "Phone Upload",
                "state": "vermont",
                "county": "windsor",
                "city": "norwich",
            })
            uploaded = upload.json() if upload.ok else {}
            check("a signed-in device can add a map to the library",
                  upload.status == 201 and uploaded.get("owner") == "scout",
                  (upload.status, uploaded.get("owner")))
            check("the upload keeps its place",
                  uploaded.get("place") == "Vermont \u00b7 Windsor \u00b7 Norwich",
                  uploaded.get("place"))

            # every map on the device can be renamed / given a place
            opened = page.evaluate("""(() => {
                const rows = [...document.querySelectorAll('#overlayList .item')];
                const btn = rows.length ? rows[0].querySelector('.mini-btn') : null;
                if (!btn) return { rows: rows.length, edit: false };
                btn.click();
                const sheet = document.getElementById('sheetMapMeta');
                const out = {
                    rows: rows.length, edit: true,
                    open: sheet.getAttribute('aria-hidden') === 'false',
                    state: !!document.getElementById('metaState'),
                    county: !!document.getElementById('metaCounty'),
                    city: !!document.getElementById('metaCity')
                };
                document.getElementById('btnMetaCancel').click();
                return out;
            })()""")
            check("a device map has Edit with name / state / county / city",
                  bool(opened.get("edit") and opened.get("open") and opened.get("state")
                       and opened.get("county") and opened.get("city")), opened)

            made = page.evaluate("""async () => {
                const D = window.Hunt.Data, S = window.Hunt.Sync;
                const w = D.newWaypoint({ name: 'Sync Ridge', type: 'deer', lat: 44.31, lon: -71.41 });
                await D.saveWaypoint(w);
                const json = await S.syncNow(true);
                return { id: w.id, spots: json ? (json.spots || []).length : -1,
                         err: S.syncState.error, user: S.state.user };
            }""")
            check("a spot syncs to the account", made["spots"] >= 1 and not made["err"], made)

            # the "add map" form carries the place fields
            page.evaluate("document.getElementById('btnAddMap').click()")
            page.wait_for_timeout(600)
            fields = page.evaluate("""(() => ({
                name: !!document.getElementById('mapName'),
                state: !!document.getElementById('mapState'),
                county: !!document.getElementById('mapCounty'),
                city: !!document.getElementById('mapCity')
            }))()""")
            check("add-map form has name / state / county / city", all(fields.values()), fields)
            page.evaluate("document.getElementById('scrim').click()")
            page.wait_for_timeout(300)

            ctx3 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                                       has_touch=True, device_scale_factor=2,
                                       geolocation={"latitude": 44.12, "longitude": -71.56},
                                       permissions=["geolocation"])
            page2 = ctx3.new_page()
            page2.goto(BASE + "/", wait_until="load")
            page2.wait_for_timeout(1800)
            page2.evaluate("document.getElementById('btnMenu').click()")
            page2.wait_for_timeout(500)
            page2.evaluate("document.getElementById('btnAccountSignIn').click()")
            page2.wait_for_timeout(600)
            page2.fill("#signUser", "scout")
            page2.fill("#signPass", "huntmap-pass-1")
            page2.evaluate("document.getElementById('btnSignInGo').click()")
            page2.wait_for_timeout(2200)
            page2.evaluate("document.getElementById('btnLayers').click()")
            page2.wait_for_timeout(1800)
            seen = page2.inner_text("#syncList")
            check("another device sees the uploaded map after signing in",
                  "Phone Upload" in seen, seen[:200])
            check("the other device sees its place too", "Vermont" in seen, seen[:200])
            try:
                page2.wait_for_function(
                    "window.Hunt.Data.waypoints.some(function (w) { return w.name === 'Sync Ridge'; })",
                    timeout=12000)
                spot_seen = True
            except Exception:
                spot_seen = False
            check("another device receives the spots after signing in", spot_seen,
                  page2.evaluate("window.Hunt.Data.waypoints.map(function (w) { return w.name; })"))

            # deleting a synced spot must stick (it used to come straight back)
            deleted = page.evaluate("""async () => {
                const D = window.Hunt.Data, S = window.Hunt.Sync;
                const spot = D.waypoints.find(function (w) { return w.name === 'Sync Ridge'; });
                if (!spot) return { ok: false };
                await D.deleteWaypoint(spot.id);
                await S.markDeleted('spots', spot.id);
                const json = await S.syncNow(true);
                return {
                    ok: true, id: spot.id,
                    local: D.waypoints.some(function (w) { return w.id === spot.id; }),
                    aliveOnServer: (json ? json.spots : []).some(function (s) {
                        return s.id === spot.id && !s.deleted;
                    }),
                    err: S.syncState.error
                };
            }""")
            check("deleting a synced spot sticks on this device",
                  bool(deleted.get("ok")) and deleted.get("local") is False, deleted)
            check("the server applies the deletion",
                  deleted.get("aliveOnServer") is False and not deleted.get("err"), deleted)
            page2.evaluate("window.Hunt.Sync.syncNow(true)")
            page2.wait_for_timeout(1500)
            left = page2.evaluate("window.Hunt.Data.waypoints.map(function (w) { return w.name; })")
            check("the other device drops the deleted spot", "Sync Ridge" not in left, left)
            ctx3.close()

            check("no JS errors at the end", not errors, errors[:3])
            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except Exception:
            server.kill()

    failed = [r for r in results if not r[1]]
    print("\n%d checks, %d failed" % (len(results), len(failed)))
    for name, _, detail in failed:
        print("  FAILED:", name, detail)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

