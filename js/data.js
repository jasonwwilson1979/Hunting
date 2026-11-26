/* HuntMap — data.js
   Waypoints, tracks, map layers and settings: in-memory state + persistence,
   GPX import/export and JSON backup/restore. */
(function () {
  'use strict';
  const H = window.Hunt;
  const D = H.Data = {};
  const U = H.Util, G = H.Geo, DB = H.DB;

  D.TYPES = {
    stand: { label: 'Treestand', code: 'ST', color: '#e2801f' },
    blind: { label: 'Ground blind', code: 'BL', color: '#c9a227' },
    cam: { label: 'Trail camera', code: 'CM', color: '#8ec46a' },
    water: { label: 'Water', code: 'H2O', color: '#4aa3d8' },
    food: { label: 'Food plot', code: 'FD', color: '#9fae4a' },
    sign: { label: 'Sign / scrape', code: 'SG', color: '#c58f2a' },
    track: { label: 'Track / rub', code: 'TR', color: '#b07a52' },
    kill: { label: 'Kill site', code: 'K', color: '#d9534f' },
    camp: { label: 'Camp', code: 'CP', color: '#9b8bc4' },
    park: { label: 'Vehicle', code: 'V', color: '#7f8c8d' },
    hazard: { label: 'Hazard', code: '!', color: '#e2513f' },
    wp: { label: 'Waypoint', code: 'WP', color: '#e2801f' }
  };
  D.TYPE_ORDER = ['stand', 'blind', 'cam', 'water', 'food', 'sign', 'track', 'kill', 'camp', 'park', 'hazard', 'wp'];

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




