/* HuntMap — sync.js
   Bridge to the optional HuntMap Django server.

   Maps uploaded on the PC appear under Maps -> "From your PC". Downloading one
   runs the normal local pipeline (PDF page -> raster, TIFF -> raster), stores it
   in IndexedDB and keeps it there, so it works with no signal — which is what
   lets GPS stay useful in airplane mode.

   If the app is served by a plain static server there is no /api/maps/, the
   probe fails quietly and the whole section stays hidden. */
(function () {
  'use strict';
  const H = window.Hunt;
  const SY = H.Sync = {};
  const U = H.Util, D = H.Data, DB = H.DB, PM = H.PDFMap;

  SY.base = 'api/';
  SY.state = {
    enabled: false, maps: [], places: { states: [], counties: [], cities: [] },
    user: null, requireAuth: false, serverVersion: 0, error: null, busy: {}, lastCheck: 0,
    q: '', stateFilter: '', countyFilter: ''
  };
  SY.onChange = null;

  function notify() {
    if (SY.onChange) { try { SY.onChange(); } catch (e) { console.error(e); } }
  }

  /** Turn a failed response into an Error that carries the server's message. */
  function httpError(res) {
    const err = new Error('HTTP ' + res.status);
    err.status = res.status;
    return res.text().then(function (text) {
      try {
        const body = JSON.parse(text);
        if (body && body.error) { err.message = body.error; err.code = body.code; }
      } catch (e) {
        // An HTML page here almost always means a proxy or Cloudflare Access
        // intercepted the request instead of the HuntMap server.
        if (text && text.trim().charAt(0) === '<') {
          err.message = 'The server answered with a web page, not JSON (proxy login?)';
          err.code = 'html-response';
        }
      }
      throw err;
    });
  }

  /* -------- where the server is, and how we prove who we are (web vs app) --------
     Web: same origin, session cookie, SY.base = 'api/'.
     Native (Capacitor): the app is served from capacitor://localhost, so the API is
     a different origin. The user enters the server address once; requests carry
     'Authorization: Bearer <token>' and no cookies. */
  SY.isNative = function () { return !!(H.Native && H.Native.available); };
  SY.token = null;
  SY.serverUrl = '';
  let configLoaded = null;

  function normaliseServer(url) {
    let s = String(url || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s.replace(/\/+$/, '');
  }

  SY.loadConfig = function () {
    if (configLoaded) return configLoaded;
    configLoaded = Promise.all([DB.kvGet('serverUrl', ''), DB.kvGet('apiToken', null)])
      .then(function (res) {
        SY.serverUrl = res[0] || '';
        SY.token = res[1] && res[1].token ? res[1].token : null;
        if (res[1] && res[1].user && !SY.state.user) SY.state.user = res[1].user;
        SY.base = SY.isNative() ? (SY.serverUrl ? SY.serverUrl + '/api/' : '') : 'api/';
        return true;
      }).catch(function () { return false; });
    return configLoaded;
  };

  SY.setServerUrl = function (url) {
    SY.serverUrl = normaliseServer(url);
    SY.token = null;
    SY.state.user = null;
    SY.state.maps = [];
    SY.base = SY.isNative() ? (SY.serverUrl ? SY.serverUrl + '/api/' : '') : 'api/';
    return Promise.all([
      DB.kvSet('serverUrl', SY.serverUrl),
      DB.kvSet('apiToken', null)
    ]).catch(function () {}).then(function () { return SY.probe(); });
  };

  SY.saveToken = function (json) {
    SY.token = json.token;
    SY.state.user = json.user || null;
    return DB.kvSet('apiToken', {
      token: json.token, user: json.user || null, expiresAt: json.expires_at || null
    }).catch(function () {});
  };

  SY.clearToken = function () {
    SY.token = null;
    SY.state.user = null;
    return DB.kvSet('apiToken', null).catch(function () {});
  };

  /** Absolute URL for something the server told us about (a map file). */
  SY.url = function (pathOrUrl) {
    if (!pathOrUrl) return pathOrUrl;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (!SY.isNative() || !SY.serverUrl) return pathOrUrl;
    return SY.serverUrl + (pathOrUrl.charAt(0) === '/' ? '' : '/') + pathOrUrl;
  };

  /** fetch() with the bearer token when this is the native app. */
  SY.authFetch = function (url, opts) {
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({}, o.headers || {});
    if (SY.token) o.headers.Authorization = 'Bearer ' + SY.token;
    o.credentials = SY.isNative() ? 'omit' : 'same-origin';
    if (!o.cache) o.cache = 'no-store';
    return fetch(SY.url(url), o);
  };

  function api(path, opts) {
    if (SY.isNative() && !SY.serverUrl) {
      const err = new Error('No server address set');
      err.code = 'no-server';
      return Promise.reject(err);
    }
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({ Accept: 'application/json' }, o.headers || {});
    if (SY.token) o.headers.Authorization = 'Bearer ' + SY.token;
    o.credentials = SY.isNative() ? 'omit' : 'same-origin';
    o.cache = 'no-store';
    return fetch((SY.base || 'api/') + path, o).then(function (res) {
      if (!res.ok) return httpError(res);
      return res.json();
    });
  }

  function postJson(path, payload) {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload || {})
    });
  }

  /**
   * Sign in. On the web this is the server session; in the native app it exchanges
   * the password for a long-lived bearer token, which is what lets the app keep its
   * bundled files (offline start) and still reach the server.
   */
  SY.login = function (username, password) {
    const call = SY.isNative()
      ? postJson('token/', { username: username, password: password, label: nativeLabel() })
        .then(function (json) { return SY.saveToken(json).then(function () { return json; }); })
      : postJson('login/', { username: username, password: password })
        .then(function (json) { SY.state.user = json.user || null; return json; });
    return call.then(function (json) {
      return SY.probe().then(function () {
        return SY.syncNow(true).then(function () { return json; });
      });
    });
  };

  SY.register = function (username, password) {
    return postJson('register/', { username: username, password: password })
      .then(function (json) {
        if (SY.isNative()) {
          // The account exists now; exchange the password for a token.
          return postJson('token/', { username: username, password: password,
            label: nativeLabel() }).then(function (tok) {
            return SY.saveToken(tok).then(function () { return json; });
          });
        }
        SY.state.user = json.user || null;
        return json;
      })
      .then(function (json) {
        return SY.probe().then(function () {
          return SY.syncNow(true).then(function () { return json; });
        });
      });
  };

  SY.logout = function () {
    if (SY.isNative()) {
      // Revoke this device's token; other phones keep theirs.
      const done = SY.token
        ? api('token/', { method: 'DELETE' }).catch(function () {})
        : Promise.resolve();
      return done.then(function () {
        return SY.clearToken().then(function () { return SY.probe(); });
      });
    }
    return postJson('logout/', {}).then(function () {
      SY.state.user = null;
      return SY.probe();
    });
  };

  function nativeLabel() {
    const p = (H.Native && H.Native.platform) || 'app';
    return (p === 'ios' ? 'iPhone/iPad' : p === 'android' ? 'Android' : p) + ' app';
  }


  /** Edit a map's metadata on the server (name, page, notes, place). */
  SY.updateMeta = function (id, fields) {
    return api('maps/' + id + '/', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(fields || {})
    }).then(function (json) {
      const i = SY.state.maps.findIndex(function (m) { return m.id === json.id; });
      if (i >= 0) SY.state.maps[i] = json;
      // Keep the phone's own copy in step with the new name.
      const layer = SY.localLayer(json.id);
      if (layer) {
        layer.name = json.name;
        D.saveLayer(layer);
      }
      notify();
      return json;
    });
  };

  /** Upload a map file from the phone into the server library. */
  SY.upload = function (file, meta) {
    meta = meta || {};
    const form = new FormData();
    form.append('file', file, file.name || 'map.pdf');
    form.append('name', meta.name || (file.name || 'Map').replace(/\.[^.]+$/, ''));
    if (meta.page) form.append('page', String(meta.page));
    ['state', 'county', 'city', 'notes'].forEach(function (key) {
      if (meta[key]) form.append(key, meta[key]);
    });
    return fetch(SY.base + 'maps/', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) return httpError(res);
      return res.json();
    });
  };

  /** Ask the server what it knows: accounts, version, maps. */
  SY.diag = function () {
    return api('diag/');
  };

  /** Everything the server holds about this account, as JSON (data export). */
  SY.exportAccount = function () {
    return api('account/');
  };

  /** Erase the account, its files, spots and tracks (token or session auth). */
  SY.deleteAccount = function () {
    return api('account/', { method: 'DELETE' }).then(function (json) {
      SY.state.user = null;
      SY.state.maps = [];
      if (SY.isNative()) return SY.clearToken().then(function () { return json; });
      return json;
    });
  };

  /* ---------------------- spots and tracks (per account) ---------------------- */
  SY.syncState = { at: 0, spots: 0, tracks: 0, error: null, busy: false, signedOut: false };
  /** Called by app.js after a merge so the map/lists can redraw. */
  SY.onMerged = null;

  function spotPayload() {
    return D.waypoints.map(function (w) {
      return {
        id: w.id, name: w.name, type: w.type, notes: w.notes,
        lat: w.lat, lon: w.lon, alt: w.alt == null ? null : w.alt,
        createdAt: w.createdAt, updatedAt: w.updatedAt
      };
    });
  }

  function trackPayload() {
    return D.tracks.map(function (t) {
      return {
        id: t.id, name: t.name, points: t.points || [],
        createdAt: t.createdAt, updatedAt: t.updatedAt
      };
    });
  }

  /** Remember that something was deleted, so the server removes it too. */
  SY._delQueue = Promise.resolve();
  SY.markDeleted = function (kind, id) {
    // Serialised: two quick deletes must not read-modify-write the same list and
    // lose one of the tombstones (the lost spot would come back on the next pull).
    SY._delQueue = SY._delQueue.then(function () {
      return DB.kvGet('syncDeleted', null).then(function (state) {
        state = state || { spots: [], tracks: [] };
        const list = state[kind === 'tracks' ? 'tracks' : 'spots'];
        if (!list.some(function (d) { return d.id === id; })) {
          list.push({ id: id, updatedAt: Date.now() });
        }
        return DB.kvSet('syncDeleted', state);
      });
    }).catch(function () {});
    return SY._delQueue;
  };

  /**
   * Forget a deletion only when the server reports the record as deleted.
   * Returns how many tombstones had to be kept (i.e. the server ignored them).
   */
  function dropConfirmedTombstones(json) {
    const alive = {};
    (json.spots || []).forEach(function (s) { if (!s.deleted) alive[s.id] = 1; });
    (json.tracks || []).forEach(function (t) { if (!t.deleted) alive[t.id] = 1; });
    return DB.kvGet('syncDeleted', null).then(function (del) {
      del = del || { spots: [], tracks: [] };
      const keep = {
        spots: (del.spots || []).filter(function (d) { return alive[d.id]; }),
        tracks: (del.tracks || []).filter(function (d) { return alive[d.id]; })
      };
      return DB.kvSet('syncDeleted', keep).then(function () {
        return keep.spots.length + keep.tracks.length;
      });
    }).catch(function () { return 0; });
  }

  /** Debounced push after a change (offline-safe: it simply fails quietly). */
  SY.queueSync = function () {
    if (!SY.state.enabled || !SY.state.user) return;
    if (SY._syncTimer) clearTimeout(SY._syncTimer);
    SY._syncTimer = setTimeout(function () {
      SY._syncTimer = 0;
      SY.syncNow(true);
    }, 1200);
  };

  /**
   * Push every local spot/track, then take back the merged set.
   * Newest updatedAt wins per record; deletions travel as tombstones.
   */
  SY.syncNow = function (quiet) {
    if (!SY.state.enabled) return Promise.resolve(null);
    if (!SY.state.user) {
      SY.syncState.signedOut = true;
      return Promise.resolve(null);
    }
    if (SY.syncState.busy) return Promise.resolve(null);
    SY.syncState.busy = true;
    SY.syncState.signedOut = false;

    let pending = { spots: [], tracks: [] };
    return DB.kvGet('syncDeleted', null).then(function (deleted) {
      pending = deleted || { spots: [], tracks: [] };
      const body = {
        spots: spotPayload().concat((pending.spots || []).map(function (d) {
          return { id: d.id, deleted: true, updatedAt: d.updatedAt };
        })),
        tracks: trackPayload().concat((pending.tracks || []).map(function (d) {
          return { id: d.id, deleted: true, updatedAt: d.updatedAt };
        }))
      };
      return api('sync/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }).then(function (json) {
      return SY._applyRemote(json, pending).then(function () {
        return dropConfirmedTombstones(json);
      }).then(function (kept) {
        SY.syncState.at = Date.now();
        SY.syncState.spots = (json.spots || []).filter(function (s) { return !s.deleted; }).length;
        SY.syncState.tracks = (json.tracks || []).filter(function (t) { return !t.deleted; }).length;
        SY.syncState.error = kept
          ? kept + ' deletion' + (kept === 1 ? '' : 's') +
            ' not applied by the server \u2014 it is an older build; update the container.'
          : null;
        SY.syncState.busy = false;
        if (SY.onMerged) { try { SY.onMerged(json); } catch (e) { console.error(e); } }
        if (!quiet) notify();
        return json;
      });
    }).catch(function (err) {
      SY.syncState.busy = false;
      SY.syncState.error = (err && err.code === 'auth-required')
        ? 'sign in to sync' : ((err && err.message) || String(err));
      if (!quiet) notify();
      return null;
    });
  };

  /** Merge the server's set into the local one (newest updatedAt wins). */
  SY._applyRemote = function (json, pending) {
    const jobs = [];
    const localSpots = {};
    const localTracks = {};
    const gone = {};
    ((pending && pending.spots) || []).forEach(function (d) { gone['s:' + d.id] = 1; });
    ((pending && pending.tracks) || []).forEach(function (d) { gone['t:' + d.id] = 1; });
    D.waypoints.forEach(function (w) { localSpots[w.id] = w; });
    D.tracks.forEach(function (t) { localTracks[t.id] = t; });

    (json.spots || []).forEach(function (r) {
      const local = localSpots[r.id];
      if (r.deleted || gone['s:' + r.id]) {
        // Deleted here (or on another device): stay deleted even if this server
        // has not applied the tombstone yet.
        if (local) {
          D.waypoints = D.waypoints.filter(function (w) { return w.id !== r.id; });
          if (D.settings.targetId === r.id) { D.settings.targetId = null; D.saveSettings(); }
          jobs.push(DB.del('waypoints', r.id));
        }
        return;
      }
      if (local && (r.updatedAt || 0) <= (local.updatedAt || 0)) return;
      const spot = {
        id: r.id, name: r.name || 'Spot', type: (D.TYPES[r.type] ? r.type : 'wp'),
        notes: r.notes || '', lat: r.lat, lon: r.lon, alt: r.alt == null ? null : r.alt,
        createdAt: r.createdAt || Date.now(), updatedAt: r.updatedAt || Date.now()
      };
      D.waypoints = D.waypoints.filter(function (w) { return w.id !== r.id; });
      D.waypoints.push(spot);
      jobs.push(DB.put('waypoints', spot));
    });

    (json.tracks || []).forEach(function (r) {
      const local = localTracks[r.id];
      if (r.deleted || gone['t:' + r.id]) {
        if (local) {
          D.tracks = D.tracks.filter(function (t) { return t.id !== r.id; });
          if (D.activeTrack && D.activeTrack.id === r.id) D.activeTrack = null;
          jobs.push(DB.del('tracks', r.id));
        }
        return;
      }
      if (local && (r.updatedAt || 0) <= (local.updatedAt || 0)) return;
      const track = {
        id: r.id, name: r.name || 'Track', points: r.points || [],
        createdAt: r.createdAt || Date.now(), updatedAt: r.updatedAt || Date.now()
      };
      D.tracks = D.tracks.filter(function (t) { return t.id !== r.id; });
      D.tracks.push(track);
      jobs.push(DB.put('tracks', JSON.parse(JSON.stringify(track))));
    });

    D.waypoints.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return Promise.all(jobs).catch(function () {});
  };

  /** The maps that pass the panel's search / state / county filters. */
  SY.filtered = function () {
    const q = (SY.state.q || '').trim().toLowerCase();
    const state = (SY.state.stateFilter || '').toLowerCase();
    const county = (SY.state.countyFilter || '').toLowerCase();
    return (SY.state.maps || []).filter(function (m) {
      if (state && String(m.state || '').toLowerCase() !== state) return false;
      if (county && String(m.county || '').toLowerCase() !== county) return false;
      if (!q) return true;
      return [m.name, m.notes, m.state, m.county, m.city, m.place]
        .some(function (v) { return String(v || '').toLowerCase().indexOf(q) >= 0; });
    });
  };

  /** True when the page was served by the HuntMap Django server. */
  SY.available = function () {
    return !!(typeof window !== 'undefined' && window.__HUNTMAP_SERVER__);
  };

  /** Ask the server for the library. Resolves true when a HuntMap server answers. */
  SY.probe = function () {
    if (location.protocol === 'file:' || !navigator.onLine) return Promise.resolve(false);
    return SY.loadConfig().then(function () {
      if (SY.isNative() && !SY.serverUrl) {
        // The app works offline with no server; say so instead of failing silently.
        SY.state.enabled = false;
        SY.state.maps = [];
        SY.state.error = 'no-server-address';
        notify();
        return false;
      }
      return probeNow();
    });
  };

  function probeNow() {
    if (!SY.available()) {
      // Static hosting (no Django): stay hidden, never ask for /api/.
      SY.state.enabled = false;
      SY.state.maps = [];
      notify();
      return Promise.resolve(false);
    }
    return api('maps/').then(function (json) {
      SY.state.enabled = true;
      SY.state.maps = (json && json.maps) || [];
      SY.state.places = (json && json.places) || { states: [], counties: [], cities: [] };
      SY.state.user = (json && json.user) || null;
      SY.state.requireAuth = !!(json && json.require_auth);
      SY.state.serverVersion = (json && json.version) || 1;
      SY.state.error = null;
      SY.state.lastCheck = Date.now();
      notify();
      return true;
    }).catch(function (err) {
      SY.state.enabled = false;
      SY.state.maps = [];
      SY.state.error = err.status === 404 ? 'no-server'
        : err.status === 403 ? 'sign-in required'
        : (err.message || String(err));
      notify();
      return false;
    });
  }

  SY.localLayer = function (remoteId) {
    for (let i = 0; i < D.layers.length; i++) {
      if (D.layers[i].remoteId === remoteId) return D.layers[i];
    }
    return null;
  };

  /** 'new' | 'update' | 'synced' */
  SY.statusFor = function (remote) {
    const layer = SY.localLayer(remote.id);
    if (!layer) return 'new';
    if (layer.remoteUpdated && layer.remoteUpdated !== remote.updated) return 'update';
    return 'synced';
  };

  SY.pending = function () {
    return SY.state.maps.filter(function (m) { return SY.statusFor(m) !== 'synced'; });
  };

  SY.humanSize = function (bytes) {
    if (!bytes) return '--';
    const mb = bytes / 1048576;
    return mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
  };
  /** Download a remote map, rasterise it locally and save the layer. */
  SY.download = function (remote, opts) {
    opts = opts || {};
    if (!remote || SY.state.busy[remote.id]) return Promise.resolve(null);
    SY.state.busy[remote.id] = 'downloading';
    SY.state.error = null;
    notify();

    const maxPx = opts.maxPx || 3000;
    return SY.authFetch(remote.file_url)
      .then(function (res) {
        if (!res.ok) {
          const err = new Error('Download failed (HTTP ' + res.status + ')');
          err.status = res.status;
          throw err;
        }
        return res.blob();
      })
      .then(function (blob) {
        const name = (remote.name || 'map') + (remote.ext || '');
        const file = new File([blob], name, {
          type: blob.type || (remote.kind === 'pdf' ? 'application/pdf' : '')
        });
        if (remote.kind === 'pdf') {
          if (!PM.available()) throw new Error('PDF engine is not loaded');
          return PM.open(file).then(function (opened) {
            return PM.renderPage(opened.doc, remote.page || 1, maxPx);
          });
        }
        return PM.imageFromFile(file, maxPx);
      })
      .then(function (result) { return SY._store(remote, result); })
      .then(function (layer) {
        SY.state.busy[remote.id] = null;
        notify();
        return layer;
      })
      .catch(function (err) {
        SY.state.busy[remote.id] = null;
        SY.state.error = (err && err.message) || String(err);
        notify();
        throw err;
      });
  };

  SY._store = function (remote, result) {
    let layer = SY.localLayer(remote.id);
    if (!layer) {
      layer = D.newLayer({ name: remote.name, kind: remote.kind, page: remote.page || 1 });
    }
    layer.name = remote.name || layer.name;
    layer.kind = remote.kind || layer.kind;
    layer.page = remote.page || 1;
    layer.remoteId = remote.id;
    layer.remoteUpdated = remote.updated;
    layer.remoteSha = remote.sha256 || '';
    layer.imgW = result.width;
    layer.imgH = result.height;
    layer.visible = true;
    if (layer.opacity == null) layer.opacity = 0.92;

    // Use the server's georeference when it is newer than anything local.
    const remoteNewer = remote.calib &&
      (!layer.calib || !layer.calibAt || String(remote.calib_at || '') > String(layer.calibAt));
    if (remoteNewer) {
      layer.calib = remote.calib;
      layer.calibAt = remote.calib_at || new Date().toISOString();
      if (remote.img_w) layer.calibImgW = remote.img_w;
    }
    if (D.layers.indexOf(layer) < 0) D.layers.push(layer);

    return DB.blobSet('mapimg:' + layer.id, result.blob)
      .then(function () { return PM.decodeImage(result.blob); })
      .then(function (decoded) {
        layer.img = decoded.img;
        URL.revokeObjectURL(decoded.url);
        return D.saveLayer(layer);
      })
      .then(function () {
        if (layer.calib && H.App && H.App.map) {
          const bounds = PM.bounds(layer);
          if (bounds) H.App.map.fitBounds(bounds, 30);
        }
        return layer;
      });
  };

  /** Send a calibration to the server so the PC / other phones reuse it. */
  SY.pushCalibration = function (layer) {
    if (!layer || !layer.remoteId || !SY.state.enabled || !layer.calib) {
      return Promise.resolve(false);
    }
    const body = JSON.stringify({
      calib: layer.calib,
      img_w: layer.imgW,
      img_h: layer.imgH,
      page: layer.page || 1
    });
    return fetch(SY.base + 'maps/' + layer.remoteId + '/calibration', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      layer.calibAt = json.calib_at || new Date().toISOString();
      return D.saveLayer(layer).then(function () { return true; });
    }).catch(function (err) {
      console.info('calibration not uploaded:', err && err.message);
      return false;
    });
  };

  SY.forget = function (layer) {
    if (!layer) return Promise.resolve(false);
    D.deleteLayer(layer.id);
    notify();
    return Promise.resolve(true);
  };
})();

