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

  function api(path, opts) {
    return fetch(SY.base + path, Object.assign({
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin'
    }, opts || {})).then(function (res) {
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
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

  /** Sign in with a local account on the server (session cookie). */
  SY.login = function (username, password) {
    return postJson('login/', { username: username, password: password })
      .then(function (json) {
        SY.state.user = json.user || null;
        return SY.probe().then(function () { return json; });
      });
  };

  SY.register = function (username, password) {
    return postJson('register/', { username: username, password: password })
      .then(function (json) {
        SY.state.user = json.user || null;
        return SY.probe().then(function () { return json; });
      });
  };

  SY.logout = function () {
    return postJson('logout/', {}).then(function () {
      SY.state.user = null;
      return SY.probe();
    });
  };

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
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
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
  };

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
    return fetch(remote.file_url, { cache: 'no-store' })
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

