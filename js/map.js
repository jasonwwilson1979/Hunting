/* HuntMap — map.js
   Dependency-free slippy map on canvas: cached raster tiles, georeferenced
   raster overlays (PDF pages / scans), tracks, waypoints, live GPS marker,
   measuring tool and a lat/lon graticule. */
(function () {
  'use strict';
  const H = window.Hunt;
  const G = H.Geo, U = H.Util, T = H.Tiles;

  function MapView(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.center = { x: 128, y: G.latToY(44) };
    this.zoom = 13;
    this.minZoom = 2;
    this.maxZoom = 20;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    this.tilesEnabled = true;
    this.provider = 'osm';
    this.overlays = [];
    this.waypoints = [];
    this.tracks = [];
    this.measure = [];
    this.measureOn = false;
    this.target = null;
    this.position = null;        // {lat, lon, accuracy, heading, speed, alt}
    this.showLabels = true;
    this.showGrid = false;
    this.pinMode = false;        // crosshair at the map centre; taps drop a waypoint
    this.follow = true;
    this.calibrateLayer = null;  // overlay being aligned by gesture
    this._dirty = false;
    this._raf = 0;
    this._tileMisses = 0;
    this._tileHits = 0;
    this._lastScaleText = '';
    this._drag = null;

    this._bindEvents();
    this.resize();
    const self = this;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self.resize(); });
      this._ro.observe(canvas);
    } else {
      window.addEventListener('resize', function () { self.resize(); });
    }
    this.invalidate();
  }
  H.MapView = MapView;
  const P = MapView.prototype;

  /* ------------------------------ geometry ------------------------------ */
  P.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.invalidate();
  };

  P.worldToScreen = function (wx, wy) {
    const k = Math.pow(2, this.zoom);
    return { x: (wx - this.center.x) * k + this.width / 2,
      y: (wy - this.center.y) * k + this.height / 2 };
  };
  P.screenToWorld = function (sx, sy) {
    const k = Math.pow(2, this.zoom);
    return { x: this.center.x + (sx - this.width / 2) / k,
      y: this.center.y + (sy - this.height / 2) / k };
  };
  P.latLonToScreen = function (lat, lon) {
    return this.worldToScreen(G.lonToX(lon), G.latToY(lat));
  };
  P.screenToLatLon = function (sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { lat: G.yToLat(w.y), lon: G.xToLon(w.x) };
  };
  P.getCenterLatLon = function () { return G.toLatLon(this.center.x, this.center.y); };

  P.setView = function (lat, lon, zoom) {
    this.center = { x: G.lonToX(lon), y: G.latToY(lat) };
    if (zoom != null) this.zoom = U.clamp(zoom, this.minZoom, this.maxZoom);
    this.clampCenter();
    this.emitMove();
    this.invalidate();
  };
  P.clampCenter = function () {
    this.center.x = U.clamp(this.center.x, 0, 256);
    this.center.y = U.clamp(this.center.y, G.latToY(85.05112878) + 0.0001,
      G.latToY(-85.05112878) - 0.0001);
  };
  P.panBy = function (dx, dy) {
    const k = Math.pow(2, this.zoom);
    this.center.x -= dx / k;
    this.center.y -= dy / k;
    this.clampCenter();
    this.emitMove();
    this.invalidate();
  };
  P.zoomAround = function (newZoom, sx, sy) {
    const z = U.clamp(newZoom, this.minZoom, this.maxZoom);
    if (Math.abs(z - this.zoom) < 0.0001) return;
    const before = this.screenToWorld(sx, sy);
    this.zoom = z;
    const after = this.screenToWorld(sx, sy);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
    this.clampCenter();
    this.emitMove();
    this.invalidate();
  };
  P.zoomIn = function () { this.zoomAround(this.zoom + 1, this.width / 2, this.height / 2); };
  P.zoomOut = function () { this.zoomAround(this.zoom - 1, this.width / 2, this.height / 2); };
  P.emitMove = function () { if (this.opts.onMove) this.opts.onMove(this); };

  P.visibleBounds = function () {
    const nw = this.screenToLatLon(0, 0);
    const se = this.screenToLatLon(this.width, this.height);
    return { north: nw.lat, west: nw.lon, south: se.lat, east: se.lon };
  };

  P.fitBounds = function (b, pad) {
    const p = pad || 40;
    const x0 = G.lonToX(b.west), x1 = G.lonToX(b.east);
    const y0 = G.latToY(b.north), y1 = G.latToY(b.south);
    const wWorld = Math.abs(x1 - x0) || 1e-9;
    const hWorld = Math.abs(y1 - y0) || 1e-9;
    // World px are zoom-0 units, so screen px = world px * 2^zoom.
    const zx = Math.log(Math.max(1, this.width - p * 2) / wWorld) / Math.LN2;
    const zy = Math.log(Math.max(1, this.height - p * 2) / hWorld) / Math.LN2;
    this.zoom = U.clamp(Math.min(zx, zy), this.minZoom, this.maxZoom);
    this.center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    this.clampCenter();
    this.invalidate();
  };
  /* ------------------------------ render loop ------------------------------ */
  P.invalidate = function () {
    if (this._raf) return;
    const self = this;
    this._raf = requestAnimationFrame(function () {
      self._raf = 0;
      try { self.draw(); } catch (e) { console.error('map draw failed', e); }
    });
  };

  P.draw = function () {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = U.cssVar('--map-bg', '#0f140c');
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    this._tileHits = 0;
    this._tileMisses = 0;
    if (this.tilesEnabled) this.drawTiles();
    this.drawOverlays();
    if (this.showGrid) this.drawGrid();
    this.drawTracks();
    this.drawMeasure();
    this.drawZones();
    this.drawWaypoints();
    this.drawTarget();
    this.drawPosition();
    this.drawCrosshair();
    if (this.tilesEnabled && this._tileHits === 0 && this._tileMisses > 0) {
      this.drawNoTilesNotice();
    }
    this.updateScaleBar();
    this.updateAttribution();
  };

  P.drawTiles = function () {
    const prov = T.provider(this.provider);
    if (!prov.url) return;
    const zt = U.clamp(Math.round(this.zoom), this.minZoom, Math.min(prov.maxZoom, this.maxZoom));
    const n = Math.pow(2, zt);
    const scale = Math.pow(2, this.zoom - zt);
    const tileSize = 256 * scale;
    const b = this.screenToWorld(0, 0);
    const e = this.screenToWorld(this.width, this.height);
    const minTx = Math.floor(b.x * n / 256);
    const maxTx = Math.floor(e.x * n / 256);
    const minTy = Math.max(0, Math.floor(b.y * n / 256));
    const maxTy = Math.min(n - 1, Math.floor(e.y * n / 256));
    const ctx = this.ctx;
    const self = this;

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const wx = ((tx % n) + n) % n;
        const sx = (tx * (256 / n) - this.center.x) * Math.pow(2, this.zoom) + this.width / 2;
        const sy = (ty * (256 / n) - this.center.y) * Math.pow(2, this.zoom) + this.height / 2;
        const img = this.tileImage(this.provider, zt, wx, ty);
        if (img) {
          this._tileHits++;
          try { ctx.drawImage(img, sx, sy, tileSize + 0.6, tileSize + 0.6); } catch (err) {}
        } else {
          this._tileMisses++;
          T.get(this.provider, zt, wx, ty).then(function () { self.invalidate(); }).catch(function () {});
        }
      }
    }
  };

  /* Synchronous tile lookup from the tile module's memory cache. */
  P.tileImage = function (provider, z, x, y) {
    if (!T.memLookup) return null;
    return T.memLookup(T.tileUrl(provider, z, x, y));
  };

  P.drawNoTilesNotice = function () {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = U.cssVar('--map-text', '#e9e4d4');
    ctx.globalAlpha = 0.62;
    ctx.font = '600 13px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const err = T.lastError && T.lastError.provider === this.provider ? T.lastError : null;
    let msg, sub = '';
    if (err) {
      msg = 'Base map refused the tiles (HTTP ' + err.status + ')';
      sub = 'Open Maps and pick another provider, or add your own PDF map.';
    } else if (navigator.onLine === false) {
      msg = 'Offline \u2014 no cached tiles here';
      sub = 'Add a PDF map or download tiles while online.';
    } else {
      msg = 'Loading map tiles\u2026';
    }
    ctx.fillText(msg, this.width / 2, this.height * 0.42);
    if (sub) {
      ctx.font = '12px -apple-system, system-ui, sans-serif';
      ctx.fillText(sub, this.width / 2, this.height * 0.42 + 20);
    }
    ctx.restore();
  };
  /* ------------------------------ overlays ------------------------------ */
  P.setOverlays = function (layers) {
    this.overlays = layers || [];
    const self = this;
    this.overlays.forEach(function (l) { self.loadOverlayImage(l); });
    this.invalidate();
  };

  P.loadOverlayImage = function (layer) {
    if (!layer || layer.img || layer._loading) return;
    layer._loading = true;
    const self = this;
    H.DB.blobGet('mapimg:' + layer.id).then(function (blob) {
      if (!blob) { layer._loading = false; return; }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () { layer.img = img; layer._loading = false; self.invalidate(); };
      img.onerror = function () { layer._loading = false; };
      img.src = url;
    }).catch(function () { layer._loading = false; });
  };

  P.overlayWorldCorners = function (layer) {
    const c = layer.calib;
    if (!c || !layer.img) return null;
    const hw = layer.img.width / 2, hh = layer.img.height / 2;
    const cos = Math.cos(c.theta), sin = Math.sin(c.theta);
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) {
      return { x: c.cx + c.s * (p[0] * cos - p[1] * sin),
        y: c.cy + c.s * (p[0] * sin + p[1] * cos) };
    });
  };

  P.drawOverlays = function () {
    const ctx = this.ctx;
    const self = this;
    const k0 = Math.pow(2, this.zoom);
    const view = { x0: this.center.x - this.width / 2 / k0, x1: this.center.x + this.width / 2 / k0,
      y0: this.center.y - this.height / 2 / k0, y1: this.center.y + this.height / 2 / k0 };

    this.overlays.forEach(function (layer) {
      if (!layer.visible || !layer.img || !layer.calib) return;
      const corners = self.overlayWorldCorners(layer);
      if (!corners) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      corners.forEach(function (p) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
      if (maxX < view.x0 || minX > view.x1 || maxY < view.y0 || minY > view.y1) return;

      const c = layer.calib;
      const center = self.worldToScreen(c.cx, c.cy);
      const k = c.s * k0;
      ctx.save();
      ctx.globalAlpha = layer.opacity == null ? 0.9 : layer.opacity;
      ctx.translate(center.x, center.y);
      ctx.rotate(c.theta);
      ctx.scale(k, k);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      try { ctx.drawImage(layer.img, -layer.img.width / 2, -layer.img.height / 2); } catch (e) {}
      ctx.restore();
    });
  };

  /* ------------------------------ graticule ------------------------------ */
  P.drawGrid = function () {
    const ctx = this.ctx;
    const b = this.visibleBounds();
    const span = Math.max(Math.abs(b.north - b.south), Math.abs(b.east - b.west));
    const steps = [30, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
    let step = steps[steps.length - 1];
    for (let i = 0; i < steps.length; i++) {
      if (span / steps[i] >= 2.5) { step = steps[i]; break; }
    }
    ctx.save();
    ctx.strokeStyle = U.cssVar('--map-grid', 'rgba(236,231,216,.14)');
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    const startLat = Math.ceil(b.south / step) * step;
    for (let lat = startLat; lat <= b.north; lat += step) {
      const y = this.latLonToScreen(lat, b.west).y;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
      ctx.fillText(fmtGrid(lat, true, step), 6, y - 3);
    }
    const startLon = Math.ceil(b.west / step) * step;
    for (let lon = startLon; lon <= b.east; lon += step) {
      const x = this.latLonToScreen(b.north, lon).x;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
      ctx.fillText(fmtGrid(lon, false, step), x + 4, this.height - 76);
    }
    ctx.restore();
  };

  function fmtGrid(v, isLat, step) {
    const dec = step < 0.01 ? 4 : step < 0.1 ? 3 : step < 1 ? 2 : 0;
    const dir = isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
    return Math.abs(v).toFixed(dec) + '\u00b0' + dir;
  }
  /* ------------------------------ tracks ------------------------------ */
  P.setTracks = function (tracks) { this.tracks = tracks || []; this.invalidate(); };

  P.drawTracks = function () {
    if (!this.tracks.length) return;
    const ctx = this.ctx;
    const self = this;
    this.tracks.forEach(function (trk) {
      if (trk.hidden) return;
      const pts = trk.points || [];
      if (pts.length < 2) return;
      ctx.save();
      ctx.beginPath();
      let started = false, lastX = 0, lastY = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = self.latLonToScreen(pts[i].lat, pts[i].lon);
        if (!started) { ctx.moveTo(p.x, p.y); started = true; lastX = p.x; lastY = p.y; continue; }
        if (Math.abs(p.x - lastX) < 1.2 && Math.abs(p.y - lastY) < 1.2) continue;   // simplify
        ctx.lineTo(p.x, p.y); lastX = p.x; lastY = p.y;
      }
      ctx.lineWidth = trk.active ? 4 : 2.5;
      ctx.strokeStyle = trk.color || U.cssVar('--map-track', '#53c2d6');
      ctx.globalAlpha = trk.active ? 0.95 : 0.7;
      ctx.stroke();
      ctx.restore();
    });
  };

  /* ------------------------------ measure ------------------------------ */
  P.drawMeasure = function () {
    const pts = this.measure;
    if (!pts || pts.length === 0) return;
    const ctx = this.ctx;
    const acc = U.cssVar('--accent', '#e2801f');
    ctx.save();
    ctx.strokeStyle = acc;
    ctx.fillStyle = acc;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    let total = 0;
    pts.forEach(function (pt, i) {
      const p = this.latLonToScreen(pt.lat, pt.lon);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      if (i > 0) total += G.distance(pts[i - 1].lat, pts[i - 1].lon, pt.lat, pt.lon);
    }, this);
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach(function (pt) {
      const p = this.latLonToScreen(pt.lat, pt.lon);
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10140c'; ctx.lineWidth = 1.5; ctx.stroke();
    }, this);
    // segment labels
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.fillStyle = acc;
    for (let i = 1; i < pts.length; i++) {
      const a = this.latLonToScreen(pts[i - 1].lat, pts[i - 1].lon);
      const b = this.latLonToScreen(pts[i].lat, pts[i].lon);
      const d = G.distance(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      if (d < 8) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 8;
      const label = U.fmtDistShort(d);
      ctx.strokeText(label, mx, my);
      ctx.fillText(label, mx, my);
    }
    ctx.restore();
  };

  /* ------------------------------ waypoints ------------------------------ */
  function typeInfo(w) {
    const types = (H.Data && H.Data.TYPES) || null;
    if (types && types[w.type]) return types[w.type];
    return { code: 'WP', color: '#e2801f', label: 'Spot' };
  }
  P.typeInfo = typeInfo;

  P.setWaypoints = function (list) { this.waypoints = list || []; this.invalidate(); };

  /* -------------------------------- geofences -------------------------------- */
  P.setZones = function (list) { this.zones = list || []; this.invalidate(); };

  /** Fence circles: a soft fill, a dashed edge and the name at the top. */
  P.drawZones = function () {
    if (!this.zones || !this.zones.length) return;
    const ctx = this.ctx;
    const self = this;
    this.zones.forEach(function (z) {
      if (!z.enabled) return;
      const c = self.latLonToScreen(z.lat, z.lon);
      // radius in pixels: convert metres to degrees of longitude at this latitude
      const dLon = z.radius / (111320 * Math.max(0.15, Math.cos(z.lat * Math.PI / 180)));
      const edge = self.latLonToScreen(z.lat, z.lon + dLon);
      const r = Math.abs(edge.x - c.x);
      if (!isFinite(r) || r < 3) return;
      if (c.x + r < -30 || c.x - r > self.width + 30 ||
          c.y + r < -30 || c.y - r > self.height + 30) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = z.color || '#e2513f';
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([9, 7]);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = z.color || '#e2513f';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (self.showLabels && z.name) {
        ctx.font = '700 11px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.fillStyle = z.color || '#e2513f';
        const labelY = Math.max(14, c.y - r - 3);
        ctx.strokeText(z.name, c.x, labelY);
        ctx.fillText(z.name, c.x, labelY);
      }
      ctx.restore();
    });
  };

  /**
   * A shaped marker: the type's silhouette standing on a short stem, with the
   * exact spot marked by a dot. No circle - the shape *is* the pin. Sized for a
   * phone at arm's length in the woods, not for a desktop.
   */
  P.drawPin = function (x, y, color, code, selected, type) {
    const ctx = this.ctx;
    const modern = !(H.Data && H.Data.settings && H.Data.settings.pinStyle === 'classic');

    if (modern) {
      /* Modern marker: rounded pin with a gradient, a white glyph and a soft shadow.
         The tail tip (22.7 of 24 units) sits on the coordinate. */
      const size = selected ? 50 : 42;
      const bottom = y + size * 0.055;          // tail tip exactly on the point
      const img = (type && H.Data && H.Data.pinBadge) ? H.Data.pinBadge(type) : null;
      ctx.save();
      if (selected) {
        ctx.beginPath();
        ctx.arc(x, y - size * 0.42, size * 0.62, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226,128,31,.20)';
        ctx.fill();
      }
      ctx.shadowColor = 'rgba(0,0,0,.40)';
      ctx.shadowBlur = selected ? 11 : 8;
      ctx.shadowOffsetY = 2.5;
      if (img) {
        ctx.drawImage(img, x - size / 2, bottom - size, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(x, y - size * 0.45, size * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#fff';
        ctx.font = '800 13px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(code, x, y - size * 0.45);
      }
      ctx.restore();
      return;
    }
    const size = selected ? 58 : 46;
    const stem = selected ? 12 : 10;
    const bottom = y - stem;          // silhouette sits on the stem
    ctx.save();

    // stem: white under-stroke first so it survives dark map areas
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, y); ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, y); ctx.stroke();

    // the exact coordinate
    ctx.beginPath();
    ctx.arc(x, y, selected ? 4.6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = selected ? 2 : 1.8;
    ctx.stroke();

    if (selected) {
      // soft halo behind the shape for the active spot
      ctx.beginPath();
      ctx.arc(x, bottom - size / 2, size * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fill();
    }

    const icon = (type && H.Data && H.Data.pinIcon) ? H.Data.pinIcon(type) : null;
    if (icon) {
      ctx.drawImage(icon, x - size / 2, bottom - size, size, size);
    } else {
      // code, shown until the silhouette bitmap is ready (or if it cannot load)
      ctx.font = '800 ' + (selected ? 11 : 10) + 'px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.strokeText(code, x, bottom - size / 2);
      ctx.fillStyle = color;
      ctx.fillText(code, x, bottom - size / 2);
    }
    ctx.restore();
  };

  P.drawWaypoints = function () {
    const ctx = this.ctx;
    const self = this;
    this.waypoints.forEach(function (w) {
      const p = self.latLonToScreen(w.lat, w.lon);
      if (p.x < -80 || p.x > self.width + 80 || p.y < -120 || p.y > self.height + 80) return;
      const info = typeInfo(w);
      self.drawPin(p.x, p.y, info.color, info.code, self.selectedId === w.id, w.type);
      if (self.showLabels && w.name) {
        ctx.save();
        ctx.font = '700 12px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(0,0,0,.78)';
        ctx.fillStyle = U.cssVar('--map-text', '#e9e4d4');
        ctx.strokeText(w.name, p.x, p.y + 6);
        ctx.fillText(w.name, p.x, p.y + 6);
        ctx.restore();
      }
    });
  };

  P.hitTest = function (sx, sy) {
    let best = null, bestD = 34;
    for (let i = 0; i < this.waypoints.length; i++) {
      const w = this.waypoints[i];
      const p = this.latLonToScreen(w.lat, w.lon);
      const cy = p.y - 30;          // centre of the silhouette above the anchor
      const d = Math.hypot(p.x - sx, cy - sy);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  };
  /* ------------------------------ target line ------------------------------ */
  P.drawTarget = function () {
    const t = this.target;
    if (!t) return;
    const tp = this.latLonToScreen(t.lat, t.lon);
    const from = this.position || this.getCenterLatLon();
    const fp = this.position ? this.latLonToScreen(this.position.lat, this.position.lon) : null;
    const dist = G.distance(from.lat, from.lon, t.lat, t.lon);
    if (fp && dist > 12) {
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = U.cssVar('--accent', '#e2801f');
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
      ctx.beginPath(); ctx.moveTo(fp.x, fp.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.font = '600 11px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2 - 6;
      const label = U.fmtDistShort(dist);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(label, mx, my);
      ctx.fillStyle = U.cssVar('--accent', '#e2801f');
      ctx.fillText(label, mx, my);
      ctx.restore();
    }
    // ring around the target
    const ctx2 = this.ctx;
    ctx2.save();
    ctx2.strokeStyle = U.cssVar('--accent', '#e2801f');
    ctx2.lineWidth = 2;
    ctx2.globalAlpha = 0.85;
    ctx2.beginPath();
    ctx2.arc(tp.x, tp.y, 17, 0, Math.PI * 2);
    ctx2.stroke();
    ctx2.restore();
  };

  /* ------------------------------ position ------------------------------ */
  P.setPosition = function (pos) {
    const prev = this.position;
    this.position = pos;
    if (pos && this.follow) {
      const k = Math.pow(2, this.zoom);
      const targetX = G.lonToX(pos.lon), targetY = G.latToY(pos.lat);
      // Smoothly recentre only if the fix moved off-centre.
      if (!prev) { this.center.x = targetX; this.center.y = targetY; this.clampCenter(); }
      else {
        const sx = (targetX - this.center.x) * k, sy = (targetY - this.center.y) * k;
        if (Math.hypot(sx, sy) > Math.min(this.width, this.height) * 0.22) {
          this.center.x = targetX; this.center.y = targetY; this.clampCenter();
        }
      }
    }
    this.invalidate();
  };

  P.drawPosition = function () {
    const pos = this.position;
    if (!pos) return;
    const ctx = this.ctx;
    const p = this.latLonToScreen(pos.lat, pos.lon);
    const accPx = pos.accuracy ? pos.accuracy * G.pixelsPerMeter(pos.lat, this.zoom) : 0;
    const color = U.cssVar('--map-accuracy', '#3f8fd6');
    const accent = U.cssVar('--accent', '#e2801f');

    if (accPx > 6) {
      const r = Math.min(accPx, 900);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    // direction of view: a wide, bright wedge with an outlined edge and an arrow head
    if (pos.heading != null && isFinite(pos.heading)) {
      const len = 78, half = 0.46;                 // ~53 degrees total
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(pos.heading * Math.PI / 180);
      const grad = ctx.createLinearGradient(0, 0, 0, -len);
      grad.addColorStop(0, 'rgba(47,143,255,.62)');
      grad.addColorStop(0.55, 'rgba(47,143,255,.26)');
      grad.addColorStop(1, 'rgba(47,143,255,0)');
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, len, -Math.PI / 2 - half, -Math.PI / 2 + half);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(47,143,255,.55)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // arrow head at the far edge so the "uphill" end is unmistakable
      ctx.beginPath();
      ctx.moveTo(0, -len - 7);
      ctx.lineTo(-5.5, -len + 2);
      ctx.lineTo(5.5, -len + 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(47,143,255,.85)';
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#161a10';
    ctx.fill();
    ctx.restore();
  };

  /* ------------------------------ crosshair ------------------------------ */
  /** Position the crosshair marks: the map centre. */
  P.pinLatLon = function () { return this.getCenterLatLon(); };

  P.drawCrosshair = function () {
    if (!this.pinMode) return;
    const ctx = this.ctx;
    const x = this.width / 2, y = this.height / 2;
    const accent = U.cssVar('--accent', '#e2801f');
    ctx.save();

    // soft shadow so the crosshair reads on both light paper maps and dark tiles
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 3;

    // gap cross: four arms pulled back from the centre
    const inner = 9, outer = 26;
    ctx.lineCap = 'butt';
    const arms = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.4;
    arms.forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(x + a[0] * inner, y + a[1] * inner);
      ctx.lineTo(x + a[0] * outer, y + a[1] * outer);
      ctx.stroke();
    });
    ctx.strokeStyle = '#14180f';
    ctx.lineWidth = 1.6;
    arms.forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(x + a[0] * inner, y + a[1] * inner);
      ctx.lineTo(x + a[0] * outer, y + a[1] * outer);
      ctx.stroke();
    });

    // ring
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // centre dot
    ctx.beginPath();
    ctx.arc(x, y, 1.7, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();
  };

  /* ------------------------------ map furniture ------------------------------ */
  P.updateScaleBar = function () {
    const lineEl = document.getElementById('scaleLine');
    const textEl = document.getElementById('scaleText');
    if (!lineEl || !textEl) return;
    const lat = G.yToLat(this.center.y);
    const mpp = G.metersPerPixel(lat, this.zoom);
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
    let best = nice[0];
    for (let i = 0; i < nice.length; i++) { if (nice[i] / mpp <= 120) best = nice[i]; }
    const px = Math.max(26, Math.round(best / mpp));
    lineEl.style.width = px + 'px';
    const label = U.fmtDistShort(best);
    if (label !== this._lastScaleText) {
      textEl.textContent = label;
      this._lastScaleText = label;
    }
  };

  P.updateAttribution = function () {
    const el = document.getElementById('attribution');
    if (!el) return;
    const att = this.tilesEnabled ? T.attribution(this.provider) : 'Base map off';
    const url = this.tilesEnabled ? T.attributionUrl(this.provider) : '';
    const zoom = 'z' + this.zoom.toFixed(1) +
      (this.overlays.some(function (l) { return l.visible && l.calib; }) ? ' \u00b7 +map' : '');
    // ODbL safe harbour: the credit must be visible without interaction and link
    // to openstreetmap.org/copyright, so render a real link rather than plain text.
    if (url && att) {
      let link = el.querySelector('a.att-link');
      if (!link) {
        el.innerHTML = '';
        link = document.createElement('a');
        link.className = 'att-link';
        link.target = '_blank';
        link.rel = 'noopener';
        el.appendChild(link);
        el.appendChild(document.createTextNode(' \u00b7 '));
        const z = document.createElement('span');
        z.className = 'att-zoom';
        el.appendChild(z);
      }
      link.href = url;
      if (link.textContent !== att) link.textContent = att;
      const z = el.querySelector('.att-zoom');
      if (z && z.textContent !== zoom) z.textContent = zoom;
      return;
    }
    const txt = (att ? att + ' \u00b7 ' : '') + zoom;
    if (el.textContent !== txt) el.textContent = txt;
  };

  /* --------------------------- overlay transforms --------------------------- */
  P.worldToImage = function (layer, wx, wy) {
    const c = layer.calib, img = layer.img;
    if (!c || !img) return null;
    const cos = Math.cos(c.theta), sin = Math.sin(c.theta);
    const dx = wx - c.cx, dy = wy - c.cy;
    return { u: img.width / 2 + (dx * cos + dy * sin) / c.s,
      v: img.height / 2 + (-dx * sin + dy * cos) / c.s };
  };

  P.imageToWorld = function (layer, u, v) {
    const c = layer.calib, img = layer.img;
    if (!c || !img) return null;
    const cos = Math.cos(c.theta), sin = Math.sin(c.theta);
    const du = u - img.width / 2, dv = v - img.height / 2;
    return { x: c.cx + c.s * (du * cos - dv * sin),
      y: c.cy + c.s * (du * sin + dv * cos) };
  };
  /* ------------------------------ input ------------------------------ */
  function cloneCalib(c) { return { cx: c.cx, cy: c.cy, s: c.s, theta: c.theta }; }

  P._bindEvents = function () {
    const canvas = this.canvas, self = this;
    const pointers = new Map();
    let gesture = null;
    let tap = null;
    let longPressTimer = 0;
    let lastTap = null;

    function localPos(ev) {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    function cancelLongPress() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = 0; }
    }
    function twoPoints() {
      const pts = Array.from(pointers.values());
      return {
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        ang: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)
      };
    }

    function onDown(ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(ev.pointerId); } catch (e) {} }
      const p = localPos(ev);
      pointers.set(ev.pointerId, p);
      canvas.classList.add('dragging');

      if (pointers.size === 1) {
        tap = { x: p.x, y: p.y, t: Date.now(), moved: 0 };
        if (self.calibrateLayer) {
          gesture = { mode: 'calib-pan', layer: self.calibrateLayer,
            start: cloneCalib(self.calibrateLayer.calib), p0: p };
        } else {
          gesture = { mode: 'pan', p0: p };
        }
        if (self.opts.onUserPan) self.opts.onUserPan();
        if (!self.measureOn && !self.calibrateLayer) {
          cancelLongPress();
          longPressTimer = setTimeout(function () {
            longPressTimer = 0;
            if (!tap || tap.moved > 9) return;
            U.vibrate(25);
            if (self.opts.onLongPress) self.opts.onLongPress(self.screenToLatLon(p.x, p.y));
          }, 650);
        }
      } else if (pointers.size === 2) {
        cancelLongPress();
        tap = null;
        const tp = twoPoints();
        if (self.calibrateLayer) {
          const layer = self.calibrateLayer;
          const w = self.screenToWorld(tp.mid.x, tp.mid.y);
          gesture = { mode: 'calib-pinch', layer: layer, start: cloneCalib(layer.calib),
            dist: tp.dist, ang: tp.ang, anchor: self.worldToImage(layer, w.x, w.y) };
        } else {
          gesture = { mode: 'pinch', zoom: self.zoom, dist: tp.dist,
            anchor: self.screenToWorld(tp.mid.x, tp.mid.y) };
        }
      }
    }
    function onMove(ev) {
      if (!pointers.has(ev.pointerId)) return;
      const p = localPos(ev);
      const prev = pointers.get(ev.pointerId);
      pointers.set(ev.pointerId, p);
      if (tap) {
        tap.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
        if (tap.moved > 9) cancelLongPress();
      }
      if (!gesture) return;

      if (gesture.mode === 'pan') {
        self.panBy(p.x - prev.x, p.y - prev.y);
      } else if (gesture.mode === 'pinch') {
        if (pointers.size < 2) return;
        const tp = twoPoints();
        self.zoom = U.clamp(gesture.zoom + Math.log(tp.dist / gesture.dist) / Math.LN2,
          self.minZoom, self.maxZoom);
        const k = Math.pow(2, self.zoom);
        self.center.x = gesture.anchor.x - (tp.mid.x - self.width / 2) / k;
        self.center.y = gesture.anchor.y - (tp.mid.y - self.height / 2) / k;
        self.clampCenter();
        self.emitMove();
        self.invalidate();
      } else if (gesture.mode === 'calib-pan') {
        const k = Math.pow(2, self.zoom);
        gesture.layer.calib.cx = gesture.start.cx + (p.x - gesture.p0.x) / k;
        gesture.layer.calib.cy = gesture.start.cy + (p.y - gesture.p0.y) / k;
        self.invalidate();
      } else if (gesture.mode === 'calib-pinch') {
        if (pointers.size < 2) return;
        const tp = twoPoints();
        const layer = gesture.layer, img = layer.img, st = gesture.start;
        if (!img) return;
        const s = Math.max(1e-12, st.s * (tp.dist / gesture.dist));
        const theta = st.theta + (tp.ang - gesture.ang);
        const world = self.screenToWorld(tp.mid.x, tp.mid.y);
        const u = gesture.anchor ? gesture.anchor.u : img.width / 2;
        const v = gesture.anchor ? gesture.anchor.v : img.height / 2;
        const du = u - img.width / 2, dv = v - img.height / 2;
        const ct = Math.cos(theta), sn = Math.sin(theta);
        layer.calib.s = s;
        layer.calib.theta = theta;
        layer.calib.cx = world.x - s * (du * ct - dv * sn);
        layer.calib.cy = world.y - s * (du * sn + dv * ct);
        self.invalidate();
      }
    }

    function onUp(ev) {
      if (pointers.has(ev.pointerId)) pointers.delete(ev.pointerId);
      if (canvas.releasePointerCapture) { try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {} }
      if (pointers.size === 0) {
        canvas.classList.remove('dragging');
        const done = gesture;
        gesture = null;
        cancelLongPress();
        if (tap && tap.moved < 9 && Date.now() - tap.t < 700) {
          const now = Date.now();
          const ll = self.screenToLatLon(tap.x, tap.y);
          const isDouble = lastTap && now - lastTap.t < 330 &&
            Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 34;
          if (isDouble && !self.measureOn && !self.calibrateLayer) {
            self.zoomAround(self.zoom + 1, tap.x, tap.y);
            lastTap = null;
          } else {
            lastTap = { x: tap.x, y: tap.y, t: now };
            if (self.measureOn) {
              self.measure.push(ll);
              self.invalidate();
              if (self.opts.onMeasure) self.opts.onMeasure(self.measureTotal());
            } else if (self.calibrateLayer) {
              if (self.opts.onTap) self.opts.onTap(ll, null);
            } else {
              const wp = self.hitTest(tap.x, tap.y);
              if (!wp && self.pinMode && self.opts.onPinTap) {
                U.vibrate(12);
                self.opts.onPinTap(ll);
              } else if (self.opts.onTap) {
                self.opts.onTap(ll, wp);
              }
            }
          }
        }
        tap = null;
        if (done && done.mode && done.mode.indexOf('calib-') === 0 && self.opts.onCalibChange) {
          self.opts.onCalibChange(self.calibrateLayer);
        }
      } else if (pointers.size === 1) {
        const p = Array.from(pointers.values())[0];
        gesture = self.calibrateLayer
          ? { mode: 'calib-pan', layer: self.calibrateLayer, start: cloneCalib(self.calibrateLayer.calib), p0: p }
          : { mode: 'pan', p0: p };
      }
    }

    function onWheel(ev) {
      ev.preventDefault();
      const r = canvas.getBoundingClientRect();
      const factor = Math.exp(-ev.deltaY * 0.0016);
      self.zoomAround(self.zoom + Math.log(factor) / Math.LN2, ev.clientX - r.left, ev.clientY - r.top);
    }

    canvas.addEventListener('pointerdown', onDown, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerup', onUp, { passive: true });
    canvas.addEventListener('pointercancel', onUp, { passive: true });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  P.measureTotal = function () {
    let total = 0;
    for (let i = 1; i < this.measure.length; i++) {
      total += G.distance(this.measure[i - 1].lat, this.measure[i - 1].lon,
        this.measure[i].lat, this.measure[i].lon);
    }
    return total;
  };
})();





