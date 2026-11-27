#!/usr/bin/env python3
"""
HuntMap end-to-end smoke test.

    python3 -m pip install playwright
    python3 -m playwright install chromium
    python3 tests/e2e.py

Starts the dev server on port 8099, runs Chromium with a mocked GPS fix and
exercises: load, GPS, marking a waypoint, persistence, sun/moon, the built-in
self-test, PDF rasterising + 2-point georeferencing + overlay drawing, and an
offline reload through the service worker.
Exit code 0 = all checks passed.
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8099
BASE = "http://localhost:%d" % PORT
SHOTS = os.path.join(ROOT, "tests", "screenshots")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), str(detail)))
    print(("PASS  " if ok else "FAIL  ") + name + (("   -> " + str(detail)) if detail else ""))
    return bool(ok)


def main():
    from playwright.sync_api import sync_playwright

    os.makedirs(SHOTS, exist_ok=True)
    server = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "tests", "static_server.py"), "--http", "--port", str(PORT), "--bind", "127.0.0.1"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--no-sandbox"])
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                is_mobile=True, has_touch=True, device_scale_factor=2,
                geolocation={"latitude": 44.1234, "longitude": -71.5678, "accuracy": 8.0},
                permissions=["geolocation"])
            page = ctx.new_page()
            page_errors = []
            console_errors = []
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

            page.goto(BASE + "/index.html", wait_until="load")
            page.wait_for_timeout(1800)

            check("app loaded", page.title().startswith("HuntMap"), page.title())
            check("map canvas has size", page.evaluate(
                "(() => { const c = document.getElementById('map');"
                " return c.width > 200 && c.height > 200; })()"))
            check("no uncaught JS errors on load", not page_errors, page_errors[:2])

            # ---------------- GPS ----------------
            page.evaluate("""(() => {
                const g = navigator.geolocation;
                window.__gpsCalls = { get: [], watch: [] };
                const og = g.getCurrentPosition.bind(g);
                const ow = g.watchPosition.bind(g);
                g.getCurrentPosition = (ok, err, opts) => { window.__gpsCalls.get.push(opts || {}); return og(ok, err, opts); };
                g.watchPosition = (ok, err, opts) => { window.__gpsCalls.watch.push(opts || {}); return ow(ok, err, opts); };
            })()""")
            page.click("#btnLocate")
            try:
                page.wait_for_function("window.Hunt.GPS.state.status === 'ok'", timeout=15000)
            except Exception as exc:
                check("GPS fix", False, str(exc)[:120])
            page.wait_for_timeout(800)
            gps = json.loads(page.evaluate("JSON.stringify(window.Hunt.GPS.state)"))
            check("GPS latitude received", abs((gps.get("lat") or 0) - 44.1234) < 0.01, gps.get("lat"))
            check("GPS chip shows accuracy", "\u00b1" in page.inner_text("#gpsText"), page.inner_text("#gpsText"))
            check("coordinate HUD filled", "44.12" in page.inner_text("#coordText"), page.inner_text("#coordText"))
            check("UTM alternate shown", "19T" in page.inner_text("#coordSub"), page.inner_text("#coordSub"))

            gps_calls = page.evaluate("JSON.stringify(window.__gpsCalls)")
            gps_calls = json.loads(gps_calls)
            check("quick network/Wi-Fi fix is requested first",
                  any(o.get("enableHighAccuracy") is False for o in gps_calls["get"]),
                  gps_calls["get"])
            check("live watch keeps high accuracy",
                  any(o.get("enableHighAccuracy") is True for o in gps_calls["watch"]),
                  gps_calls["watch"])
            check("fix records its source", gps.get("source") in ("gps", "network"), gps.get("source"))
            check("waiting watchdog is armed but not tripped", gps.get("slow") is False, gps.get("slow"))

            page.click("#gpsChip")
            page.wait_for_timeout(400)
            page.click("#btnGpsFast")
            page.wait_for_timeout(700)
            fast = page.evaluate("""(() => {
                const calls = window.__gpsCalls.watch;
                return {
                    state: window.Hunt.GPS.state.highAccuracy,
                    setting: window.Hunt.Data.settings.highAccuracy,
                    lastWatch: calls.length ? calls[calls.length - 1].enableHighAccuracy : null
                };
            })()""")
            check("Fast Wi-Fi fix switches the live watch to network mode",
                  fast["state"] is False and fast["setting"] is False and fast["lastWatch"] is False, fast)
            page.click("#sheetGps [data-close]")
            page.wait_for_timeout(300)
            check("canvas has drawn pixels", page.evaluate(
                "(() => { const c = document.getElementById('map'); const x = c.getContext('2d');"
                " const d = x.getImageData(Math.floor(c.width/2) - 3, Math.floor(c.height/2) - 3, 6, 6).data;"
                " return Array.from(d).some(v => v > 0); })()"))
            page.wait_for_timeout(2500)
            base = page.evaluate("""(() => ({
                provider: window.Hunt.Data.settings.provider,
                lastError: window.Hunt.Tiles.lastError,
                hits: window.Hunt.App.map._tileHits,
                misses: window.Hunt.App.map._tileMisses
            }))()""")
            check("picks USGS topo by default in North America", base["provider"] == "usgs_topo", base["provider"])
            check("base map tiles load without refusal", base["lastError"] is None and base["hits"] > 0,
                  "hits=%s misses=%s err=%s" % (base["hits"], base["misses"], base["lastError"]))
            page.screenshot(path=os.path.join(SHOTS, "01-map.png"))

            # ---------------- tile policy handling ----------------
            policy = page.evaluate("""(async () => {
                const T = window.Hunt.Tiles;
                const realFetch = window.fetch;
                const seen = [];
                window.fetch = (u, o) => { seen.push((o && o.referrerPolicy) || ''); return realFetch(u, o); };
                let got = null;
                try { got = await T.get('esri_topo', 17, 38630, 49380); } catch (e) { got = null; }
                window.fetch = realFetch;
                return {
                    referrers: seen,
                    gotTile: !!got,
                    osmParallel: T.policyFor('osm').parallel,
                    esriParallel: T.policyFor('esri_topo').parallel,
                    osmLimit: T.maxDownloadFor('osm'),
                    usgsLimit: T.maxDownloadFor('usgs_topo')
                };
            })()""")
            check("tile requests send a Referer (OSM policy rejects none)",
                  bool(policy["referrers"]) and all(r == "origin" for r in policy["referrers"]),
                  policy["referrers"])
            check("OSM downloads are throttled to one request", policy["osmParallel"] == 1, policy["osmParallel"])
            check("USGS/Esri downloads stay parallel", policy["esriParallel"] == 4, policy["esriParallel"])
            check("OSM offline area is capped lower than USGS",
                  policy["osmLimit"] < policy["usgsLimit"], (policy["osmLimit"], policy["usgsLimit"]))

            blocked = page.evaluate("""(async () => {
                const T = window.Hunt.Tiles;
                const calls = [];
                const realFetch = window.fetch;
                T.onError = (p, s, b) => calls.push([p, s, !!b]);
                window.fetch = (url, opts) => {
                    if (String(url).indexOf('tile.openstreetmap.org') !== -1) {
                        return Promise.resolve(new Response(
                            '<html><body>Access blocked</body></html>',
                            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
                    }
                    return realFetch(url, opts);
                };
                T.clearBlock();
                let img = null;
                try { img = await T.get('osm', 13, 2410, 3080); } catch (e) { img = 'threw'; }
                window.fetch = realFetch;
                const out = { img: img === null ? 'null' : String(img), calls, blocked: !!T.blocked,
                              isBlocked: T.isBlocked('osm'), lastError: T.lastError };
                T.clearBlock();
                T.onError = () => {};
                return out;
            })()""")
            check("blocked HTML page is not drawn as a tile", blocked["img"] == "null", blocked["img"])
            check("block page marks the provider blocked", blocked["isBlocked"] is True, blocked)
            check("block page reports the reason to the UI",
                  any(c[0] == "osm" and c[2] is True for c in blocked["calls"]), blocked["calls"])

            # ---------------- spot type icons ----------------
            icons = page.evaluate("""(async () => {
                const D = window.Hunt.Data;
                const missing = D.TYPE_ORDER.filter(t => !D.ICON_PATHS[D.TYPES[t].icon]);
                D.pinIcon('deer');
                await new Promise(r => setTimeout(r, 500));
                const img = D.pinIcon('deer');
                return {
                    count: D.TYPE_ORDER.length,
                    missing: missing,
                    deer: !!D.TYPES.deer, bear: !!D.TYPES.bear,
                    turkey: !!D.TYPES.turkey, building: !!D.TYPES.building,
                    raster: !!img && img.tagName === 'IMG' && img.naturalWidth > 0,
                    rasterW: img ? img.naturalWidth : 0
                };
            })()""")
            check("new spot types exist (deer, bear, turkey, building)",
                  all([icons["deer"], icons["bear"], icons["turkey"], icons["building"]]), icons)
            check("every spot type has an icon", icons["missing"] == [], icons["missing"])
            check("pin icons rasterise for the map canvas",
                  icons["raster"] is True and icons["rasterW"] >= 48, icons)

            # ---------------- waypoint ----------------
            page.click("#btnMark")
            page.wait_for_timeout(500)
            page.fill("#markName", "North Ridge Stand")
            page.fill("#markNotes", "wind NW, 200 yds to creek")
            page.click("#btnMarkSave")
            page.wait_for_timeout(900)
            check("waypoint saved", page.evaluate("window.Hunt.Data.waypoints.length") == 1,
                  page.evaluate("window.Hunt.Data.waypoints.length"))
            check("badge shows 1", page.inner_text("#wpBadge") == "1", page.inner_text("#wpBadge"))

            page.evaluate("window.Hunt.App.setTarget(window.Hunt.Data.waypoints[0])")
            page.wait_for_timeout(400)
            check("nav bar visible", page.is_visible("#navTargetBar"))
            nav = page.inner_text("#navTargetDist")
            check("nav bar shows distance/bearing", ("ft" in nav or "mi" in nav) and "\u00b0" in nav, nav)
            # ---------------- sun/moon ----------------
            page.click("#btnSun")
            page.wait_for_timeout(600)
            sun_text = page.inner_text("#sunBody")
            sun_low = sun_text.lower()
            check("sun panel shows sunrise/sunset", "sunrise" in sun_low and "sunset" in sun_low,
                  sun_text.splitlines()[3:6])
            check("moon phase shown", "% lit" in sun_low)
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)

            # ---------------- built-in self-test ----------------
            page.click("#btnTools")
            page.wait_for_timeout(500)
            page.click("#btnSelfTest")
            page.wait_for_timeout(900)
            out = page.inner_text("#testOut")
            fails = [ln for ln in out.splitlines() if ln.startswith("FAIL")]
            check("built-in self-test passes", not fails, fails[:3] or out.splitlines()[-1])
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)

            # ---------------- PDF pipeline (through the real UI) ----------------
            pdf = page.evaluate("""async () => {
                const r = await fetch('tests/sample-topo-map.pdf');
                const buf = await r.arrayBuffer();
                const file = new File([buf], 'sample-topo-map.pdf', {type: 'application/pdf'});
                const opened = await window.Hunt.PDFMap.open(file);
                const rendered = await window.Hunt.PDFMap.renderPage(opened.doc, 1, 1600);
                return {pages: opened.pageCount, w: rendered.width, h: rendered.height,
                        bytes: rendered.blob.size};
            }""")
            check("PDF opened with pdf.js", pdf["pages"] == 1, pdf["pages"])
            check("PDF page rasterised", pdf["w"] > 800 and pdf["bytes"] > 20000,
                  "%sx%s %sB" % (pdf["w"], pdf["h"], pdf["bytes"]))

            page.click("#btnLayers")
            page.wait_for_timeout(500)
            page.click("#btnAddMap")
            page.wait_for_timeout(500)
            page.set_input_files("#fileMap", os.path.join(ROOT, "tests", "sample-topo-map.pdf"))
            page.wait_for_function("!document.getElementById('btnMapRender').disabled", timeout=25000)
            page.click("#btnMapRender")
            page.wait_for_function("!document.getElementById('mapCalibStep').hidden", timeout=40000)
            check("map image loaded through UI", "Map image ready" in page.inner_text("#mapStatus"),
                  page.inner_text("#mapStatus"))
            page.click("#btnCalibPoints")
            page.wait_for_timeout(700)
            page.locator("#calibCanvas").scroll_into_view_if_needed()
            box = page.locator("#calibCanvas").bounding_box()
            page.mouse.click(box["x"] + box["width"] * 0.15, box["y"] + box["height"] * 0.2)
            page.wait_for_selector("#modalWrap:not([hidden])", timeout=5000)
            page.fill("#__promptInput", "44.1400, -71.6000")
            page.click("#modalOk")
            page.wait_for_timeout(500)
            page.mouse.click(box["x"] + box["width"] * 0.85, box["y"] + box["height"] * 0.8)
            page.wait_for_selector("#modalWrap:not([hidden])", timeout=5000)
            page.fill("#__promptInput", "44 06 00 N 71 33 00 W")
            page.click("#modalOk")
            page.wait_for_timeout(600)
            check("two control points accepted",
                  page.evaluate("window.Hunt.App.state.calibPts.length") == 2,
                  page.evaluate("window.Hunt.App.state.calibPts.length"))
            page.click("#btnCalibApply")
            page.wait_for_timeout(1600)
            lay = page.evaluate("""(() => {
                const D = window.Hunt.Data;
                const l = D.layers[D.layers.length - 1];
                return {n: D.layers.length, kind: l && l.kind, calib: !!(l && l.calib),
                        theta: l && l.calib ? l.calib.theta : null,
                        imgW: l && l.img ? l.img.width : 0};
            })()""")
            check("PDF map added through the UI", lay["n"] == 1 and lay["kind"] == "pdf", lay)
            check("north-up georeference (theta = 0)", lay["calib"] and abs(lay["theta"]) < 1e-9,
                  lay["theta"])

            overlay = page.evaluate("""(() => {
                const H = window.Hunt, PM = H.PDFMap, D = H.Data;
                const layer = D.layers[D.layers.length - 1];
                H.App.map.follow = false;
                H.App.map.setOverlays(D.layers);
                H.App.map.fitBounds(PM.bounds(layer), 20);
                return {mpp: PM.metersPerPixel(layer.calib), inside: PM.contains(layer, 44.12, -71.575)};
            })()""")
            page.wait_for_timeout(1200)
            check("calibration gives sane scale", 0.1 < overlay["mpp"] < 500, round(overlay["mpp"], 2))
            check("calibrated overlay contains its centre point", overlay["inside"] is True)
            light = page.evaluate("""(() => {
                const c = document.getElementById('map'); const x = c.getContext('2d');
                const d = x.getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data;
                return [d[0], d[1], d[2]];
            })()""")
            check("overlay pixels drawn (cream paper colour)", light[0] > 170 and light[1] > 160, light)
            page.screenshot(path=os.path.join(SHOTS, "03-pdf-overlay.png"))


            # ---------------- GPX round trip ----------------
            gpx = page.evaluate("""(() => {
                const D = window.Hunt.Data;
                const text = D.gpxOf(D.waypoints, [], 'test');
                const back = D.parseGpx(text);
                return {n: back.waypoints.length, name: back.waypoints[0] && back.waypoints[0].name,
                        hasWpt: text.indexOf('<wpt') > 0};
            })()""")
            check("GPX export/import round trip",
                  gpx["n"] == 1 and gpx["name"] == "North Ridge Stand", gpx)

            # ---------------- track recording (simulated movement) ----------------
            page.click("#btnRec")
            page.wait_for_timeout(900)
            check("recording starts", page.evaluate("!!window.Hunt.Data.activeTrack"))
            check("track HUD visible", page.is_visible("#trackHud"))
            for lon in (-71.5680, -71.5690, -71.5700, -71.5710):
                ctx.set_geolocation({"latitude": 44.1238, "longitude": lon, "accuracy": 6.0})
                page.wait_for_timeout(1100)
            page.click("#btnRec")
            page.wait_for_timeout(900)
            trk = page.evaluate("""(() => {
                const D = window.Hunt.Data;
                const t = D.tracks[0];
                const s = t ? D.trackStats(t) : null;
                return {n: D.tracks.length, pts: s ? s.points : 0, dist: s ? s.distance : 0,
                        active: !!D.activeTrack};
            })()""")
            check("track saved with points", trk["n"] == 1 and trk["pts"] >= 2, trk)
            check("track distance measured", trk["dist"] > 20, round(trk["dist"], 1))
            check("recording stopped", trk["active"] is False)
            page.screenshot(path=os.path.join(SHOTS, "02-track.png"))

            # ---------------- persistence ----------------
            page.reload(wait_until="load")
            page.wait_for_timeout(2400)
            check("waypoint survives reload", page.evaluate("window.Hunt.Data.waypoints.length") == 1)
            check("track survives reload", page.evaluate("window.Hunt.Data.tracks.length") == 1)
            check("map layer survives reload", page.evaluate("window.Hunt.Data.layers.length") == 1)
            check("layer image reloaded from IndexedDB", page.evaluate(
                "!!(window.Hunt.Data.layers[0] && window.Hunt.Data.layers[0].img)"))
            page.screenshot(path=os.path.join(SHOTS, "02-after-reload.png"))


            # ---------------- offline ----------------
            try:
                page.wait_for_function("!!navigator.serviceWorker.controller", timeout=12000)
                sw_ready = True
            except Exception:
                sw_ready = False
            check("service worker controls the page", sw_ready)
            ver = page.evaluate("""async () => {
                const v = self.HUNTMAP_VERSION || {};
                const keys = await caches.keys();
                return { app: v.app, shell: v.shell, keys: keys,
                         about: (document.getElementById('appVersion') || {}).textContent || '' };
            }""")
            check("the app knows its version",
                  bool(ver["app"]) and ("v" + str(ver["app"])) in ver["about"], ver)
            check("the cache name comes from version.js",
                  bool(ver["shell"]) and ver["shell"] in ver["keys"], ver)
            ctx.set_offline(True)
            page.reload(wait_until="load")
            page.wait_for_timeout(1800)
            check("app opens offline", page.title().startswith("HuntMap"), page.title())
            check("offline UI still works", page.is_visible("#btnMark"))
            offline_shot = page.screenshot(path=os.path.join(SHOTS, "03-offline.png"))
            check("offline screenshot captured", len(offline_shot) > 5000, "%d bytes" % len(offline_shot))
            ctx.set_offline(False)

            # ---------------- TIFF map + rotation + fine rotation ----------------
            check("TIFF decoder available", page.evaluate("window.Hunt.PDFMap.tiffAvailable()"))
            page.click("#btnLayers")
            page.wait_for_timeout(500)
            page.click("#btnAddMap")
            page.wait_for_timeout(500)
            page.set_input_files("#fileMap", os.path.join(ROOT, "tests", "sample-topo-map.tif"))
            page.wait_for_function("!document.getElementById('btnMapRender').disabled", timeout=25000)
            page.click("#btnMapRender")
            page.wait_for_function("!document.getElementById('mapCalibStep').hidden", timeout=40000)
            base_dims = page.evaluate("""(() => {
                const l = window.Hunt.Data.layers[window.Hunt.Data.layers.length - 1] ||
                          window.Hunt.App.state.pending.layer;
                const p = window.Hunt.App.state.pending;
                const layer = p && p.layer ? p.layer : l;
                return layer ? [layer.imgW, layer.imgH] : null;
            })()""")
            check("TIFF image loaded", base_dims and base_dims[0] > 500, base_dims)
            page.click("#btnRotRight")
            page.wait_for_function("document.getElementById('mapStatus').textContent.indexOf('rotated 90') >= 0",
                                   timeout=20000)
            rot = page.evaluate("""(() => {
                const p = window.Hunt.App.state.pending;
                return {rot: p.rotation, w: p.layer.imgW, h: p.layer.imgH,
                        stored: p.width + 'x' + p.height};
            })()""")
            check("rotate 90 swaps image dimensions",
                  rot["rot"] == 90 and rot["w"] == base_dims[1] and rot["h"] == base_dims[0], rot)

            page.click("#btnCalibPoints")
            page.wait_for_timeout(700)
            page.locator("#calibCanvas").scroll_into_view_if_needed()
            box = page.locator("#calibCanvas").bounding_box()
            page.mouse.click(box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.25)
            page.wait_for_selector("#modalWrap:not([hidden])", timeout=5000)
            page.fill("#__promptInput", "44.1400, -71.6000")
            page.click("#modalOk")
            page.wait_for_timeout(400)
            page.mouse.click(box["x"] + box["width"] * 0.8, box["y"] + box["height"] * 0.75)
            page.wait_for_selector("#modalWrap:not([hidden])", timeout=5000)
            page.fill("#__promptInput", "44.1000, -71.5500")
            page.click("#modalOk")
            page.wait_for_timeout(500)
            page.evaluate("""(() => {
                const r = document.getElementById('calibRot');
                r.value = '5';
                r.dispatchEvent(new Event('input'));
            })()""")
            check("fine-rotation readout updates",
                  "\u00b0" in page.inner_text("#calibRotVal"), page.inner_text("#calibRotVal"))
            page.click("#btnCalibApply")
            page.wait_for_timeout(1800)
            tiff_layer = page.evaluate("""(() => {
                const D = window.Hunt.Data;
                const l = D.layers[D.layers.length - 1];
                return {n: D.layers.length, theta: l && l.calib ? l.calib.theta : null,
                        deg: l && l.calib ? l.calib.theta * 180 / Math.PI : null,
                        w: l && l.imgW, h: l && l.imgH};
            })()""")
            check("TIFF map georeferenced", tiff_layer["n"] == 2 and tiff_layer["theta"] is not None, tiff_layer)
            check("fine rotation of 5\u00b0 applied", abs(tiff_layer["deg"] - 5.0) < 0.01,
                  round(tiff_layer["deg"] or 0, 3))
            page.screenshot(path=os.path.join(SHOTS, "05-tiff-rotated.png"))

            # ---------------- align-mode sliders (size / rotate / fade) ----------------
            page.click("#btnLayers")
            page.wait_for_timeout(500)
            page.click("#btnRecalibrate")
            page.wait_for_timeout(1000)
            check("align bar shows size slider",
                  page.is_visible("#calibHud") and page.is_visible("#calibScale"))
            before = page.evaluate("""(() => {
                const l = window.Hunt.App.map.calibrateLayer;
                return {s: l.calib.s, slider: document.getElementById('calibScale').value};
            })()""")
            page.evaluate("""(() => {
                const el = document.getElementById('calibScale');
                el.value = '740';
                el.dispatchEvent(new Event('input'));
            })()""")
            page.wait_for_timeout(400)
            scaled = page.evaluate("""(() => {
                const l = window.Hunt.App.map.calibrateLayer;
                return {s: l.calib.s,
                        readout: document.getElementById('calibScaleVal').textContent,
                        meta: document.getElementById('calibMeta').textContent};
            })()""")
            check("size slider scales the overlay", scaled["s"] > before["s"] * 1.4,
                  "%s -> %s" % (round(before["s"], 6), round(scaled["s"], 6)))
            check("size readout and map width shown",
                  "\u00d7" in scaled["readout"] and "wide" in scaled["meta"], scaled)

            page.evaluate("""(() => {
                const el = document.getElementById('calibRotate');
                el.value = '12';
                el.dispatchEvent(new Event('input'));
            })()""")
            page.wait_for_timeout(400)
            rotated = page.evaluate("""(() => {
                const l = window.Hunt.App.map.calibrateLayer;
                return {deg: l.calib.theta * 180 / Math.PI,
                        readout: document.getElementById('calibRotateVal').textContent};
            })()""")
            check("rotate slider sets the overlay angle", abs(rotated["deg"] - 12) < 0.01, rotated)

            page.evaluate("""(() => {
                const el = document.getElementById('calibOpacity');
                el.value = '45';
                el.dispatchEvent(new Event('input'));
            })()""")
            page.wait_for_timeout(300)
            faded = page.evaluate("""(() => ({
                op: window.Hunt.App.map.calibrateLayer.opacity,
                readout: document.getElementById('calibOpacityVal').textContent
            }))()""")
            check("fade slider changes opacity", abs(faded["op"] - 0.45) < 0.01, faded)
            page.screenshot(path=os.path.join(SHOTS, "06-align-sliders.png"))

            page.click("#btnCalibDone")
            page.wait_for_timeout(1000)
            saved = page.evaluate("""(() => {
                const D = window.Hunt.Data;
                const l = D.layers[D.layers.length - 1];
                return {s: l.calib.s, deg: l.calib.theta * 180 / Math.PI, op: l.opacity};
            })()""")
            check("slider adjustments are saved", abs(saved["deg"] - 12) < 0.01 and saved["op"] > 0.8, saved)

            # ---------------- tapping a spot moves the map ----------------
            page.evaluate("""async () => {
                const D = window.Hunt.Data;
                const w = D.newWaypoint({ name: 'Far Ridge', type: 'deer', lat: 44.2, lon: -71.4 });
                await D.saveWaypoint(w);
                window.Hunt.App.map.setWaypoints(D.waypoints);
            }""")
            page.click("#btnWaypoints")
            page.wait_for_timeout(500)
            page.click('#wpList .item-hit:has-text("Far Ridge")')
            page.wait_for_timeout(700)
            jumped = page.evaluate("""(() => {
                const m = window.Hunt.App.map;
                const c = m.getCenterLatLon();
                const w = window.Hunt.Data.waypoints.filter(function (x) { return x.name === 'Far Ridge'; })[0];
                return { lat: c.lat, lon: c.lon, wlat: w.lat, wlon: w.lon,
                         selected: m.selectedId === w.id,
                         sheetClosed: document.getElementById('sheetWaypoints').getAttribute('aria-hidden') === 'true',
                         zoom: m.zoom };
            })()""")
            check("tapping a spot centres the map on it",
                  abs(jumped["lat"] - jumped["wlat"]) < 1e-5 and abs(jumped["lon"] - jumped["wlon"]) < 1e-5,
                  jumped)
            check("spot tap closes the list, selects the pin and zooms in",
                  jumped["sheetClosed"] is True and jumped["selected"] is True and jumped["zoom"] >= 15, jumped)

            # ---------------- crosshair placement ----------------
            page.click("#btnPin")
            page.wait_for_timeout(400)
            pin = page.evaluate("""(() => {
                const c = document.getElementById('map');
                const ctx = c.getContext('2d');
                const dpr = window.Hunt.App.map.dpr;
                const cx = Math.round(c.width / 2), cy = Math.round(c.height / 2);
                const d = ctx.getImageData(cx - 20, cy - 20, 40, 40).data;
                let accentish = 0;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i] > 180 && d[i + 1] > 90 && d[i + 1] < 180 && d[i + 2] < 90) accentish++;
                }
                return {
                    mode: window.Hunt.App.state.pinMode,
                    mapMode: window.Hunt.App.map.pinMode,
                    hud: !document.getElementById('pinHud').hidden,
                    body: document.body.classList.contains('pinning'),
                    coords: document.getElementById('pinCoords').textContent,
                    from: document.getElementById('pinFromYou').textContent,
                    accentPixels: accentish,
                    dpr: dpr
                };
            })()""")
            check("crosshair mode turns on", pin["mode"] is True and pin["mapMode"] is True, pin)
            check("crosshair HUD is visible", pin["hud"] is True and pin["body"] is True, pin)
            check("crosshair HUD shows coordinates", any(ch.isdigit() for ch in pin["coords"]), pin["coords"])
            check("crosshair HUD shows your distance to it", "of you" in pin["from"], pin["from"])
            check("crosshair is drawn on the map centre", pin["accentPixels"] >= 3, pin["accentPixels"])
            page.screenshot(path=os.path.join(SHOTS, "09-crosshair.png"))

            before = page.evaluate("JSON.stringify(window.Hunt.App.map.pinLatLon())")
            page.mouse.move(170, 520)
            page.mouse.down()
            page.mouse.move(170, 360, steps=12)
            page.mouse.up()
            page.wait_for_timeout(350)
            after = page.evaluate("JSON.stringify(window.Hunt.App.map.pinLatLon())")
            check("panning moves the crosshair target", before != after, (before, after))
            hud_after = page.inner_text("#pinFromYou")
            check("HUD follows the pan", any(ch.isdigit() for ch in hud_after) or "no GPS" in hud_after, hud_after)

            page.click("#btnPinDrop")
            page.wait_for_timeout(400)
            sheet_text = page.inner_text("#markCoords")
            check("Drop opens the mark sheet at the crosshair",
                  "crosshair" in sheet_text.lower(), sheet_text.replace("\n", " | "))
            page.fill("#markName", "Crosshair Buck")
            page.click("#btnMarkSave")
            page.wait_for_timeout(700)
            dropped = page.evaluate("""(() => {
                const w = window.Hunt.Data.waypoints.filter(x => x.name === 'Crosshair Buck')[0];
                const st = window.Hunt.GPS.state;
                if (!w) return null;
                return {lat: w.lat, lon: w.lon,
                        dist: window.Hunt.Geo.distance(st.lat, st.lon, w.lat, w.lon)};
            })()""")
            check("waypoint lands where the crosshair was, not on the GPS dot",
                  bool(dropped) and dropped["dist"] > 50, dropped)

            # tap anywhere in crosshair mode drops at that point
            page.mouse.click(240, 360)
            page.wait_for_timeout(450)
            tap_text = page.inner_text("#markCoords")
            check("tapping the map opens the sheet at the tapped point",
                  "tapped" in tap_text.lower(), tap_text.replace("\n", " | "))
            page.click("#btnMarkCancel")
            page.wait_for_timeout(300)

            page.click("#btnPinDone")
            page.wait_for_timeout(300)
            off = page.evaluate("""(() => ({
                mode: window.Hunt.App.state.pinMode,
                hud: document.getElementById('pinHud').hidden,
                body: document.body.classList.contains('pinning')
            }))()""")
            check("crosshair mode turns off", off["mode"] is False and off["hud"] is True and off["body"] is False, off)

            # ---------------- icons in the UI (chips + spot list) ----------------
            page.click("#btnMark")
            page.wait_for_timeout(300)
            chip_icons = page.evaluate(
                "document.querySelectorAll('#markTypes .chip-ic svg.wp-ic').length")
            check("every type chip shows an icon", chip_icons >= 16, chip_icons)
            page.click('#markTypes .chip-btn[data-type="deer"]')
            page.fill("#markName", "Buck Ridge")
            page.fill("#markNotes", "rubbed cedar, morning")
            page.click("#btnMarkSave")
            page.wait_for_timeout(800)
            row = page.evaluate("""(() => {
                const rows = [...document.querySelectorAll('#wpList .item')];
                const r = rows.find(x => x.textContent.indexOf('Buck Ridge') >= 0);
                if (!r) return null;
                const svg = r.querySelector('.pin-mini svg.wp-shape');
                return {
                    icons: r.querySelectorAll('.pin-mini svg.wp-shape').length,
                    paths: svg ? svg.querySelectorAll('path').length : 0,
                    sub: (r.querySelector('.item-sub') || {}).textContent || ''
                };
            })()""")
            check("deer spot draws its icon in the list",
                  bool(row) and row["icons"] == 1 and row["paths"] >= 3, row)
            check("list row names the type", "Deer" in (row or {}).get("sub", ""), row)

            # ---------------- shaped map pins ----------------
            shapes = page.evaluate("""async () => {
                const D = window.Hunt.Data;
                const types = Object.keys(D.TYPES);
                const bad = types.filter(function (t) {
                    const s = D.SHAPES[(D.TYPES[t] || {}).icon];
                    return !s || !s.fill;
                });
                for (let i = 0; i < 40; i++) {
                    if (types.every(function (t) { return !!D.pinIcon(t); })) break;
                    await new Promise(function (r) { setTimeout(r, 100); });
                }
                const missing = types.filter(function (t) { return !D.pinIcon(t); });
                const deer = D.SHAPES.deer;
                return { bad: bad, missing: missing,
                         deerPaths: (deer.fill.match(/<path/g) || []).length,
                         svg: D.shapeSvg('deer', { size: 40, halo: true }),
                         dom: !!D.shapeFor('deer', 'wp-shape') };
            }""")
            check("every spot type has a silhouette", not shapes["bad"], shapes["bad"])
            check("every silhouette rasterises for the map",
                  not shapes["missing"], shapes["missing"])
            check("the deer marker is a deer shape with a white halo",
                  shapes["deerPaths"] >= 4 and 'stroke="#fff"' in shapes["svg"] and shapes["dom"],
                  {"paths": shapes["deerPaths"], "dom": shapes["dom"]})
            # ---------------- select several spots and delete them ----------------
            page.evaluate("""async () => {
                const D = window.Hunt.Data;
                const extra = [['deer', 'Bulk one'], ['bear', 'Bulk two'], ['turkey', 'Bulk three']];
                for (let i = 0; i < extra.length; i++) {
                    await D.saveWaypoint(D.newWaypoint({
                        type: extra[i][0], name: extra[i][1],
                        lat: 44.19 + i * 0.002, lon: -71.40 + i * 0.002
                    }));
                }
            }""")
            page.click("#btnWaypoints")
            page.wait_for_timeout(500)
            before = page.evaluate("window.Hunt.Data.waypoints.length")
            page.click("#btnWpSelect")
            page.wait_for_timeout(400)
            check("select mode shows the bulk bar", page.is_visible("#wpSelectBar"))
            picked = page.evaluate("""() => {
                const rows = [...document.querySelectorAll('#wpList .item')];
                const pick = rows.filter(r => /Bulk /.test(r.textContent)).slice(0, 2);
                pick.forEach(r => r.click());
                return {
                    clicked: pick.length,
                    checked: document.querySelectorAll('#wpList .item-check:checked').length,
                    label: document.getElementById('wpSelectCount').textContent,
                    btn: document.getElementById('btnWpSelectDelete').textContent
                };
            }""")
            check("ticking several spots updates the count and the button",
                  picked["clicked"] == 2 and picked["checked"] == 2 and
                  picked["label"].startswith("2 of ") and picked["btn"] == "Delete 2", picked)
            page.click("#btnWpSelectDelete")
            page.wait_for_timeout(500)
            check("deleting several asks first", page.is_visible("#modalOk"))
            page.click("#modalOk")
            page.wait_for_timeout(900)
            after = page.evaluate("""async () => {
                const D = window.Hunt.Data;
                const left = D.waypoints.filter(w => /Bulk /.test(w.name || '')).map(w => w.name);
                const all = await window.Hunt.DB.getAll('waypoints').catch(() => []);
                return { left: left, total: D.waypoints.length,
                         stored: all.filter(w => /Bulk /.test(w.name || '')).map(w => w.name),
                         bar: !document.getElementById('wpSelectBar').hidden };
            }""")
            check("two spots are deleted, the rest stay",
                  after["left"] == ["Bulk three"] and after["total"] == before - 2, after)
            check("bulk delete also clears them from storage",
                  after["stored"] == ["Bulk three"], after["stored"])
            check("select mode ends after deleting", after["bar"] is False, after["bar"])

            # the sheet is still open here: screenshot the list, then close it
            page.wait_for_timeout(400)
            page.screenshot(path=os.path.join(SHOTS, "10-spot-icons.png"))
            page.click("#sheetWaypoints [data-close]")
            page.wait_for_timeout(300)

            page.screenshot(path=os.path.join(SHOTS, "04-final.png"))
            check("no uncaught JS errors at end", not page_errors, page_errors[:3])
            if console_errors:
                print("console errors (informational):", console_errors[:4])
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


