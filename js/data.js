/* HuntMap — data.js
   Waypoints, tracks, map layers and settings: in-memory state + persistence,
   GPX import/export and JSON backup/restore. */
(function () {
  'use strict';
  const H = window.Hunt;
  const D = H.Data = {};
  const U = H.Util, G = H.Geo, DB = H.DB;

  D.TYPES = {
    stand: { label: 'Treestand', code: 'ST', color: '#e2801f', icon: 'stand' },
    blind: { label: 'Ground blind', code: 'BL', color: '#c9a227', icon: 'blind' },
    building: { label: 'Building / cabin', code: 'BD', color: '#8fa1b0', icon: 'building' },
    deer: { label: 'Deer', code: 'DR', color: '#c98a3f', icon: 'deer' },
    bear: { label: 'Bear', code: 'BR', color: '#6f5a45', icon: 'bear' },
    turkey: { label: 'Turkey', code: 'TY', color: '#a8562f', icon: 'turkey' },
    cam: { label: 'Trail camera', code: 'CM', color: '#8ec46a', icon: 'cam' },
    water: { label: 'Water', code: 'H2O', color: '#4aa3d8', icon: 'water' },
    food: { label: 'Food plot', code: 'FD', color: '#9fae4a', icon: 'food' },
    sign: { label: 'Sign / scrape', code: 'SG', color: '#c58f2a', icon: 'sign' },
    track: { label: 'Track / rub', code: 'TR', color: '#b07a52', icon: 'track' },
    kill: { label: 'Kill site', code: 'K', color: '#d9534f', icon: 'kill' },
    camp: { label: 'Camp', code: 'CP', color: '#9b8bc4', icon: 'camp' },
    park: { label: 'Vehicle', code: 'V', color: '#7f8c8d', icon: 'park' },
    hazard: { label: 'Hazard', code: '!', color: '#e2513f', icon: 'hazard' },
    wp: { label: 'Waypoint', code: 'WP', color: '#e2801f', icon: 'pin' }
  };
  D.TYPE_ORDER = ['stand', 'blind', 'building', 'deer', 'bear', 'turkey', 'cam', 'water',
    'food', 'sign', 'track', 'kill', 'camp', 'park', 'hazard', 'wp'];

  /* Line-art icons, 24x24, drawn as SVG. They are used three times: inside the
     map pins (rasterised), on the type chips, and in the spot list. */
  D.ICON_PATHS = {
    stand: '<path d="M8.5 20.5V7.5h7v13"/><path d="M6.5 7.5h11"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h7"/>',
    blind: '<path d="M3.5 19.5a8.5 8.5 0 0 1 17 0z"/><path d="M9.5 19.5V16h5v3.5"/><path d="M12 4.5V7"/>',
    building: '<path d="M3.5 20V10L12 4l8.5 6v10z"/><path d="M9.5 20v-6h5v6"/>',
    deer: '<path d="M12 13.6a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z"/><path d="M9.4 14.2 6.8 11M14.6 14.2 17.2 11"/><path d="M6.8 11 4 10.2M6.8 11l.6-2.6M17.2 11l2.8-.8M17.2 11l-.6-2.6"/>',
    bear: '<path d="M12 11a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 12 11z"/><path d="M6.6 8.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/><path d="M17.4 8.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/><path d="M12 16.4v.01"/>',
    turkey: '<path d="M9.5 13.5a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z"/><path d="M13.1 15.4 20 8.5M17 4.5l3.5 3.5-3.5 3.5"/><path d="M7.2 17.1h-3M7.6 14.6 5.2 12.6"/>',
    cam: '<rect x="3.5" y="7.5" width="17" height="10" rx="2"/><path d="M12 10.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"/><path d="M6.4 10.2v.01"/>',
    water: '<path d="M12 3.5c3.4 4 5.8 6.9 5.8 9.4a5.8 5.8 0 1 1-11.6 0c0-2.5 2.4-5.4 5.8-9.4z"/>',
    food: '<path d="M12 20.5v-7.7"/><path d="M12 12.8C8.4 12.8 6 10.6 6 7.2c3.6 0 6 2.2 6 5.6z"/><path d="M12 12.8c3.6 0 6-2.2 6-5.6-3.6 0-6 2.2-6 5.6z"/>',
    sign: '<path d="M8.4 4.5c1.5 0 2.3 1.4 2.3 2.8 0 1.8-1.1 3-2.3 4.9-1.2-1.9-2.3-3.1-2.3-4.9 0-1.4.8-2.8 2.3-2.8z"/><path d="M15.6 9.5c1.5 0 2.3 1.4 2.3 2.8 0 1.8-1.1 3-2.3 4.9-1.2-1.9-2.3-3.1-2.3-4.9 0-1.4.8-2.8 2.3-2.8z"/>',
    track: '<path d="M5 19c2.5 0 3.5-2 5-4s3-3.5 5-3.5"/><path d="M8.2 6.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"/><path d="M15.4 14.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"/>',
    kill: '<path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/><path d="m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8"/>',
    camp: '<path d="M3 19.5 12 4.5l9 15z"/><path d="M12 19.5v-4.8"/><path d="M3.5 19.5h17"/>',
    park: '<path d="M3.5 16.5v-4h9l2.8 3H21v4"/><path d="M3.5 16.5h17"/><path d="M6.8 18.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/><path d="M17.2 18.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>',
    hazard: '<path d="M12 3.5 22 20.5H2z"/><path d="M12 9.5v5M12 17.4v.01"/>',
    pin: '<path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z"/><path d="M12 12.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z"/>'
  };

  /** Inline SVG icon for a waypoint type (chips, spot list, headers). */
  D.iconFor = function (type, cls) {
    const info = D.TYPES[type] || D.TYPES.wp;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', cls || 'wp-ic');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = D.ICON_PATHS[info.icon] || D.ICON_PATHS.pin;
    return svg;
  };

  /* Map pins need pixels, not DOM nodes: rasterise each icon once from an SVG
     data URL and cache it. Until it is ready the pin shows its letter code. */
  const pinIcons = {};
  D.pinIcon = function (type) {
    const info = D.TYPES[type] || D.TYPES.wp;
    const key = info.icon;
    if (Object.prototype.hasOwnProperty.call(pinIcons, key)) return pinIcons[key] || null;
    pinIcons[key] = null;
    const path = D.ICON_PATHS[key] || D.ICON_PATHS.pin;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="60" height="60">' +
      '<g fill="none" stroke="#0d1108" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      path + '</g></svg>';
    const img = new Image();
    img.onload = function () {
      pinIcons[key] = img;
      if (D.onPinIconLoad) { try { D.onPinIconLoad(); } catch (e) { /* ignore */ } }
    };
    img.onerror = function () { pinIcons[key] = false; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return null;
  };

  D.DEFAULT_SETTINGS = {
    units: 'imperial', coordFormat: 'dd', night: false, awake: true, highAccuracy: true,
    labels: true, grid: false, trail: true,
    provider: null,          // null = choose a sensible default for the location on first run
    tiles: true,
    lastView: null, targetId: null, selectedLayerId: null, helpSeen: false
  };

  D.waypoints = [];
  D.tracks = [];
  D.layers = [];
  D.settings = Object.assign({}, D.DEFAULT_SETTINGS);
  D.activeTrack = null;

  const TRACK_COLORS = ['#53c2d6', '#e2801f', '#8ec46a', '#c9a227', '#b07ad0', '#e2513f', '#4aa3d8'];

  /* ------------------------------- load ------------------------------- */
  D.load = function () {
    return DB.kvGet('settings', null).then(function (saved) {
      if (saved && typeof saved === 'object') D.settings = Object.assign({}, D.DEFAULT_SETTINGS, saved);
      return Promise.all([DB.getAll('waypoints'), DB.getAll('tracks'), DB.getAll('layers')]);
    }).then(function (res) {
      D.waypoints = (res[0] || []).filter(function (w) { return w && isFinite(w.lat) && isFinite(w.lon); });
      D.tracks = (res[1] || []).filter(function (t) { return t && t.points; });
      // Keep every stored map layer: a downloaded map that has not been
      // georeferenced yet must still be there after a reload (it is drawn only
      // once it has a calibration).
      D.layers = (res[2] || []).filter(function (l) { return l && l.id; });
      D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      D.tracks.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
      return true;
    }).catch(function (e) {
      console.error('data load failed', e);
      return false;
    });
  };

  D.saveSettings = U.debounce(function () {
    DB.kvSet('settings', D.settings).catch(function () {});
  }, 400);
  D.saveSettingsNow = function () {
    return DB.kvSet('settings', D.settings).catch(function () {});
  };

  /* ----------------------------- waypoints ----------------------------- */
  D.newWaypoint = function (o) {
    o = o || {};
    return {
      id: U.uid('wp'),
      name: o.name || 'Spot',
      type: D.TYPES[o.type] ? o.type : 'wp',
      notes: o.notes || '',
      lat: o.lat, lon: o.lon,
      alt: o.alt == null ? null : o.alt,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  };

  D.saveWaypoint = function (w) {
    w.updatedAt = Date.now();
    const i = D.waypoints.findIndex(function (x) { return x.id === w.id; });
    if (i >= 0) D.waypoints[i] = w; else D.waypoints.push(w);
    D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return DB.put('waypoints', w).then(function () { return w; });
  };

  D.deleteWaypoint = function (id) {
    D.waypoints = D.waypoints.filter(function (w) { return w.id !== id; });
    if (D.settings.targetId === id) { D.settings.targetId = null; D.saveSettings(); }
    return DB.del('waypoints', id);
  };

  D.getWaypoint = function (id) { return D.waypoints.find(function (w) { return w.id === id; }) || null; };

  D.suggestName = function (type) {
    const info = D.TYPES[type] || D.TYPES.wp;
    const base = info.label.replace(/\s*\/.*$/, '');
    let n = 1;
    const used = D.waypoints.map(function (w) { return (w.name || '').toLowerCase(); });
    while (used.indexOf((base + ' ' + n).toLowerCase()) >= 0) n++;
    return base + ' ' + n;
  };

  D.sortedWaypoints = function (fromLat, fromLon, filter) {
    let list = D.waypoints.slice();
    if (filter) {
      const f = filter.toLowerCase();
      list = list.filter(function (w) {
        return (w.name || '').toLowerCase().indexOf(f) >= 0 ||
          (w.notes || '').toLowerCase().indexOf(f) >= 0 ||
          ((D.TYPES[w.type] || {}).label || '').toLowerCase().indexOf(f) >= 0;
      });
    }
    if (fromLat != null) {
      list.sort(function (a, b) {
        return G.distance(fromLat, fromLon, a.lat, a.lon) - G.distance(fromLat, fromLon, b.lat, b.lon);
      });
    }
    return list;
  };
  /* ------------------------------ tracks ------------------------------ */
  D.startTrack = function (name) {
    const now = new Date();
    const trk = {
      id: U.uid('trk'),
      name: name || ('Track ' + U.fmtDate(now) + ' ' + U.fmtTime(now)),
      color: TRACK_COLORS[D.tracks.length % TRACK_COLORS.length],
      startedAt: Date.now(),
      endedAt: null,
      points: [],
      active: true
    };
    D.tracks.unshift(trk);
    D.activeTrack = trk;
    return trk;
  };

  D.addTrackPoint = function (lat, lon, extra) {
    const trk = D.activeTrack;
    if (!trk) return false;
    const pts = trk.points;
    if (pts.length) {
      const last = pts[pts.length - 1];
      const d = G.distance(last.lat, last.lon, lat, lon);
      const dt = Date.now() - (last.t || 0);
      // Drop jitter while standing still; keep at least one point every 30 s.
      if (d < 2.5 && dt < 30000) return false;
    }
    pts.push({
      lat: lat, lon: lon, t: Date.now(),
      acc: extra && extra.accuracy != null ? Math.round(extra.accuracy) : null,
      alt: extra && extra.altitude != null ? Math.round(extra.altitude) : null
    });
    return true;
  };

  D.stopTrack = function () {
    const trk = D.activeTrack;
    if (!trk) return Promise.resolve(null);
    trk.active = false;
    trk.endedAt = Date.now();
    D.activeTrack = null;
    return DB.put('tracks', JSON.parse(JSON.stringify(trk))).then(function () { return trk; });
  };

  D.saveTrack = U.debounce(function (trk) {
    if (!trk) return;
    DB.put('tracks', JSON.parse(JSON.stringify(trk))).catch(function () {});
  }, 3000);

  D.deleteTrack = function (id) {
    D.tracks = D.tracks.filter(function (t) { return t.id !== id; });
    if (D.activeTrack && D.activeTrack.id === id) D.activeTrack = null;
    return DB.del('tracks', id);
  };

  D.trackStats = function (trk) {
    const pts = (trk && trk.points) || [];
    let distance = 0, gain = 0, loss = 0;
    let maxAlt = -Infinity, minAlt = Infinity;
    for (let i = 1; i < pts.length; i++) {
      distance += G.distance(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      if (pts[i].alt != null && pts[i - 1].alt != null) {
        const dz = pts[i].alt - pts[i - 1].alt;
        if (dz > 0) gain += dz; else loss -= dz;
        maxAlt = Math.max(maxAlt, pts[i].alt);
        minAlt = Math.min(minAlt, pts[i].alt);
      }
    }
    const start = trk.startedAt || (pts[0] && pts[0].t) || Date.now();
    const end = trk.endedAt || (pts.length ? pts[pts.length - 1].t : start);
    const duration = Math.max(0, end - start);
    return {
      distance: distance, duration: duration, gain: gain, loss: loss,
      maxAlt: isFinite(maxAlt) ? maxAlt : null, minAlt: isFinite(minAlt) ? minAlt : null,
      avgSpeed: duration > 0 ? distance / (duration / 1000) : 0,
      points: pts.length, start: start, end: end
    };
  };

  /* ------------------------------- layers ------------------------------- */
  D.newLayer = function (o) {
    return Object.assign({
      id: U.uid('map'),
      name: 'Map',
      kind: 'pdf',
      page: 1,
      imgW: 0, imgH: 0,
      calib: null,
      opacity: 0.92,
      visible: true,
      createdAt: Date.now()
    }, o || {});
  };

  D.saveLayer = function (layer) {
    const i = D.layers.findIndex(function (l) { return l.id === layer.id; });
    if (i >= 0) D.layers[i] = layer; else D.layers.push(layer);
    const plain = Object.assign({}, layer);
    delete plain.img;
    delete plain._loading;
    return DB.put('layers', plain).then(function () { return layer; });
  };

  D.deleteLayer = function (id) {
    D.layers = D.layers.filter(function (l) { return l.id !== id; });
    DB.del('layers', id).catch(function () {});
    DB.blobDel('mapimg:' + id).catch(function () {});
    DB.blobDel('mapfile:' + id).catch(function () {});
    if (D.settings.selectedLayerId === id) { D.settings.selectedLayerId = null; D.saveSettings(); }
  };

  D.visibleLayers = function () { return D.layers.filter(function (l) { return l.visible; }); };
  /* -------------------------------- GPX -------------------------------- */
  D.gpxOf = function (waypoints, tracks, name) {
    const esc = U.escapeHtml;
    const out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="HuntMap" xmlns="http://www.topografix.com/GPX/1/1">'];
    if (name) out.push('<metadata><name>' + esc(name) + '</name><time>' + new Date().toISOString() + '</time></metadata>');
    (waypoints || []).forEach(function (w) {
      out.push('<wpt lat="' + Number(w.lat).toFixed(7) + '" lon="' + Number(w.lon).toFixed(7) + '">' +
        '<name>' + esc(w.name || 'Waypoint') + '</name>' +
        (w.alt != null ? '<ele>' + Number(w.alt).toFixed(1) + '</ele>' : '') +
        (w.notes ? '<desc>' + esc(w.notes) + '</desc>' : '') +
        '<sym>' + esc((D.TYPES[w.type] || {}).label || 'Waypoint') + '</sym>' +
        '<time>' + new Date(w.createdAt || Date.now()).toISOString() + '</time></wpt>');
    });
    (tracks || []).forEach(function (t) {
      out.push('<trk><name>' + esc(t.name || 'Track') + '</name><trkseg>');
      (t.points || []).forEach(function (p) {
        out.push('<trkpt lat="' + Number(p.lat).toFixed(7) + '" lon="' + Number(p.lon).toFixed(7) + '">' +
          (p.alt != null ? '<ele>' + Number(p.alt).toFixed(1) + '</ele>' : '') +
          (p.t ? '<time>' + new Date(p.t).toISOString() + '</time>' : '') + '</trkpt>');
      });
      out.push('</trkseg></trk>');
    });
    out.push('</gpx>');
    return out.join('\n');
  };

  function textOf(el, tag) {
    const n = el.getElementsByTagName(tag)[0];
    return n ? (n.textContent || '').trim() : '';
  }
  function numOf(el, tag) {
    const v = parseFloat(textOf(el, tag));
    return isFinite(v) ? v : null;
  }

  D.parseGpx = function (text) {
    if (!text || text.indexOf('<gpx') < 0) throw new Error('This file is not a GPX file');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('GPX file could not be parsed');
    const result = { waypoints: [], tracks: [] };

    const wpts = doc.getElementsByTagName('wpt');
    for (let i = 0; i < wpts.length; i++) {
      const el = wpts[i];
      const lat = parseFloat(el.getAttribute('lat')), lon = parseFloat(el.getAttribute('lon'));
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const sym = textOf(el, 'sym');
      let type = 'wp';
      Object.keys(D.TYPES).forEach(function (k) {
        if (D.TYPES[k].label.toLowerCase() === sym.toLowerCase()) type = k;
      });
      result.waypoints.push(D.newWaypoint({
        name: textOf(el, 'name') || 'Imported waypoint',
        notes: [textOf(el, 'desc'), textOf(el, 'cmt')].filter(Boolean).join(' — '),
        lat: lat, lon: lon, alt: numOf(el, 'ele'), type: type
      }));
    }

    const trks = doc.getElementsByTagName('trk');
    for (let i = 0; i < trks.length; i++) {
      const trkEl = trks[i];
      const pts = [];
      const ptsEls = trkEl.getElementsByTagName('trkpt');
      for (let j = 0; j < ptsEls.length; j++) {
        const p = ptsEls[j];
        const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const t = Date.parse(textOf(p, 'time'));
        pts.push({ lat: lat, lon: lon, t: isFinite(t) ? t : Date.now(), alt: numOf(p, 'ele') });
      }
      if (pts.length > 1) {
        result.tracks.push({
          id: U.uid('trk'),
          name: textOf(trkEl, 'name') || 'Imported track',
          color: TRACK_COLORS[result.tracks.length % TRACK_COLORS.length],
          startedAt: pts[0].t,
          endedAt: pts[pts.length - 1].t,
          points: pts,
          active: false
        });
      }
    }

    if (!result.waypoints.length && !result.tracks.length) {
      // routes → single track fallback
      const rte = doc.getElementsByTagName('rte')[0];
      if (rte) {
        const pts = [];
        const rtepts = rte.getElementsByTagName('rtept');
        for (let i = 0; i < rtepts.length; i++) {
          const lat = parseFloat(rtepts[i].getAttribute('lat'));
          const lon = parseFloat(rtepts[i].getAttribute('lon'));
          if (isFinite(lat) && isFinite(lon)) pts.push({ lat: lat, lon: lon, t: Date.now() });
        }
        if (pts.length > 1) {
          result.tracks.push({ id: U.uid('trk'), name: textOf(rte, 'name') || 'Imported route',
            color: TRACK_COLORS[0], startedAt: pts[0].t, endedAt: pts[pts.length - 1].t,
            points: pts, active: false });
        }
      }
    }
    return result;
  };

  D.importGpx = function (parsed) {
    const jobs = [];
    parsed.waypoints.forEach(function (w) {
      D.waypoints.push(w);
      jobs.push(DB.put('waypoints', w));
    });
    parsed.tracks.forEach(function (t) {
      D.tracks.unshift(t);
      jobs.push(DB.put('tracks', t));
    });
    D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return Promise.all(jobs).then(function () { return parsed; });
  };
  /* ---------------------------- backup / restore ---------------------------- */
  D.backup = function () {
    return {
      app: 'HuntMap',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: D.settings,
      waypoints: D.waypoints,
      tracks: D.tracks,
      layers: D.layers.map(function (l) {
        return {
          id: l.id, name: l.name, kind: l.kind, page: l.page,
          imgW: l.imgW, imgH: l.imgH, calib: l.calib,
          opacity: l.opacity, visible: l.visible, createdAt: l.createdAt
        };
      })
    };
  };

  D.restore = function (obj, mode) {
    if (!obj || obj.app !== 'HuntMap' || !Array.isArray(obj.waypoints)) {
      throw new Error('Not a HuntMap backup file');
    }
    const replace = mode === 'replace';
    if (replace) {
      D.waypoints = [];
      D.tracks = [];
      D.layers = [];
    }
    const jobs = [];

    (obj.waypoints || []).forEach(function (w) {
      if (!w || !isFinite(w.lat) || !isFinite(w.lon)) return;
      const wp = D.newWaypoint({
        name: w.name, type: w.type, notes: w.notes,
        lat: w.lat, lon: w.lon, alt: w.alt
      });
      wp.createdAt = w.createdAt || Date.now();
      D.waypoints.push(wp);
      jobs.push(wp);
    });

    const newTracks = [];
    (obj.tracks || []).forEach(function (t) {
      if (!t || !Array.isArray(t.points) || t.points.length < 2) return;
      const trk = {
        id: U.uid('trk'),
        name: t.name || 'Track',
        color: t.color || TRACK_COLORS[0],
        startedAt: t.startedAt || Date.now(),
        endedAt: t.endedAt || null,
        active: false,
        points: t.points.filter(function (p) { return p && isFinite(p.lat) && isFinite(p.lon); })
      };
      if (trk.points.length < 2) return;
      D.tracks.push(trk);
      newTracks.push(trk);
    });

    const newLayers = [];
    (obj.layers || []).forEach(function (l) {
      if (!l || !l.calib) return;
      const layer = D.newLayer({
        id: l.id || U.uid('map'), name: l.name || 'Map', kind: l.kind || 'pdf',
        page: l.page || 1, imgW: l.imgW, imgH: l.imgH,
        calib: l.calib, opacity: l.opacity, visible: false
      });
      D.layers.push(layer);
      newLayers.push(layer);
    });

    if (obj.settings && typeof obj.settings === 'object') {
      D.settings = Object.assign({}, D.settings, obj.settings);
    }
    D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

    // Clear first, then write — separate transactions must not interleave.
    const clears = replace
      ? Promise.all([DB.clear('waypoints'), DB.clear('tracks'), DB.clear('layers')])
      : Promise.resolve();

    return clears.then(function () {
      const writes = jobs.map(function (w) { return DB.put('waypoints', w); })
        .concat(newTracks.map(function (t) { return DB.put('tracks', t); }))
        .concat(newLayers.map(function (l) {
          const plain = Object.assign({}, l);
          delete plain.img;
          return DB.put('layers', plain);
        }))
        .concat([D.saveSettingsNow()]);
      return Promise.all(writes).then(function () {
        return { waypoints: jobs.length, tracks: newTracks.length, layers: newLayers.length };
      });
    });
  };
})();




