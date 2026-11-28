/* HuntMap — app.js
   UI wiring: HUD, sheets, waypoints, tracks, maps, PDF calibration, offline
   tiles, sun/moon, compass, backup and settings. */
(function () {
  'use strict';
  const H = window.Hunt;
  const U = H.Util, G = H.Geo, D = H.Data, GPS = H.GPS, T = H.Tiles, DB = H.DB, PM = H.PDFMap, Sun = H.Sun;
  const App = H.App = {};

  let map = null;
  const el = {};
  const S = {
    sheet: null,
    editingWp: null,
    pendingMark: null,
    follow: true,
    measureOn: false,
    pinMode: false,         // crosshair at the map centre; taps drop a waypoint
    pending: null,          // map being added
    calibPts: [],
    calibLayer: null,
    calibrating: false,
    downloading: false,
    lastFixSave: 0,
    defaultView: false,     // true until the user (or a GPS fix) chooses a view
    calibS0: 0,             // overlay scale when the align sheet opened (slider base)
    wpSelectMode: false,    // Spots panel: tap rows to tick them, then delete in bulk
    wpSelected: [],         // ids ticked in that mode
    zoneLog: []             // recent fence alerts, newest first
  };

  /* ------------------------------- boot ------------------------------- */
  const EL_IDS = ['map', 'gpsChip', 'gpsDot', 'gpsText', 'coordChip', 'coordText', 'coordSub',
    'btnSun', 'btnMenu', 'navTargetBar', 'navTargetArrow', 'navTargetName', 'navTargetDist',
    'btnNavClear', 'trackHud', 'trackDist', 'trackTime', 'trackPts', 'btnZoomIn', 'btnZoomOut',
    'btnLocate', 'btnCompass', 'btnMeasure', 'scaleLine', 'scaleText', 'attribution',
    'btnPin', 'pinHud', 'pinCoords', 'pinFromYou', 'btnPinDrop', 'btnPinDone',
    'measureHud', 'measureTotal', 'btnMeasureUndo', 'btnMeasureClear', 'btnMeasureDone',
    'calibHud', 'btnCalibLeft', 'btnCalibRight', 'calibScale', 'calibScaleVal',
    'calibRotate', 'calibRotateVal', 'calibMeta', 'calibOpacityVal',
    'btnCalibCenter', 'btnCalibCancel', 'btnCalibDone', 'calibOpacity', 'calibNorthUp', 'gpsWarn',
    'btnMark', 'btnRec', 'btnRecLabel', 'btnWaypoints', 'wpBadge', 'btnTools', 'btnLayers',
    'scrim', 'sheetMark', 'markCoords', 'markName', 'markTypes', 'markNotes', 'btnMarkSave',
    'btnMarkCancel', 'sheetWaypoints', 'wpCount', 'btnWpExport', 'btnWpImport', 'wpSearch',
    'wpList', 'sheetWpt', 'wptTitle', 'btnWptGo', 'btnWptShare', 'btnWptDelete', 'wptName',
    'wptTypes', 'wptNotes', 'wptCoords', 'btnWptSave', 'btnWptMove', 'sheetTracks',
    'btnTrackExport', 'btnTrackToggle', 'trackList', 'sheetLayers', 'providerList',
    'toggleTiles', 'overlayList', 'btnAddMap', 'btnRecalibrate', 'dlZoomMin', 'dlZoomMax',
    'syncSection', 'syncCount', 'syncStatus', 'syncList', 'btnSyncRefresh', 'btnSyncAll',
    'syncSearch', 'syncState', 'syncCounty', 'syncUser', 'btnAccountSignIn', 'btnAccountSignOut',
    'accountState', 'accountNote', 'signServer', 'btnAccountCheck', 'accountDiag',
    'btnAccountSync', 'accountAdminLink', 'btnAccountExport', 'btnAccountDelete', 'accountServerRow', 'accountServer',
    'btnAccountServerSave', 'mapName', 'mapState', 'mapCounty', 'mapCity',
    'btnLayerUpload', 'metaDeviceNote', 'metaFoot', 'appVersion', 'btnAppUpdate',
    'btnWpSelect', 'wpSelectBar', 'wpSelectCount', 'btnWpSelectAll', 'btnWpSelectNone',
    'btnWpSelectDelete', 'btnWpLegend', 'legendGrid', 'providerNote', 'providerLicence', 'licenceList', 'btnOpenLicences',
    'licencePageLink', 'zoneList', 'zoneCount', 'zoneStatus',
    'btnZoneAdd', 'btnOpenZones', 'setZoneSound', 'setZoneVibrate', 'setZoneShow',
    'mapUploadBox', 'mapUploadChk', 'mapUploadNote',
    'sheetMapMeta', 'metaSub', 'metaName', 'metaState', 'metaCounty', 'metaCity', 'metaPage',
    'metaNotes', 'btnMetaSave', 'btnMetaCancel',
    'sheetSignIn', 'signUser', 'signPass', 'btnSignInGo', 'btnSignUpGo', 'signNote',
    'btnDlEstimate', 'dlEstimate', 'btnDlStart', 'btnDlCancel', 'dlProgressWrap', 'dlBar',
    'dlStatus', 'btnDlStats', 'btnDlClear', 'dlStats', 'sheetTools', 'btnOpenSun',
    'btnOpenCompass', 'btnOpenTracks', 'btnOpenGoTo', 'btnOpenGps', 'btnOpenBackup',
    'btnOpenHelp', 'btnOpenInstall', 'setUnits', 'setCoordFormat', 'setNight', 'setAwake',
    'setHighAcc', 'setLabels', 'setGrid', 'setModernPins', 'setCompassRose',
    'miniCompass', 'mcNeedle', 'setTrail', 'diagInfo', 'btnSelfTest',
    'btnClearAll', 'testOut', 'sheetSun', 'sunBody', 'sheetCompass', 'compassCanvas',
    'compassRead', 'compassMsg', 'btnCompassEnable', 'sheetHelp', 'sheetAddMap', 'btnPickMap',
    'fileMap', 'mapFileName', 'mapPageRow', 'mapPage', 'mapPageCount', 'mapQuality',
    'mapScale', 'btnMapRender', 'mapProgressWrap', 'mapBar', 'mapStatus', 'mapCalibStep',
    'btnCalibPoints', 'btnCalibDrag', 'calibInfo', 'sheetCalibPoints', 'btnCalibResetPts',
    'calibPtHint', 'calibCanvas', 'calibPts', 'btnCalibApply', 'calibRot', 'calibRotVal',
    'mapRotateRow', 'mapRotValue', 'btnRotLeft', 'btnRotRight', 'btnRot180',
    'sheetGps', 'gpsDetails', 'btnGpsRestart', 'btnGpsFast', 'btnGpsSat', 'sheetBackup', 'btnBackupExport',
    'btnBackupImport', 'fileBackup',
    'btnExportWpGpx', 'btnExportTracksGpx', 'btnImportGpx', 'fileGpx', 'storageInfo',
    'btnPersist'];

  function cacheEls() {
    EL_IDS.forEach(function (id) { el[id] = document.getElementById(id); });
  }

  App.init = function () {
    cacheEls();
    applySettings();
    renderVersion();
    bindGlobal();
    map = new H.MapView(el.map, {
      onTap: onMapTap,
      onLongPress: onMapLongPress,
      onPinTap: function (ll) { openMarkSheet(ll, 'tap'); },
      onUserPan: function () { S.defaultView = false; setFollow(false); },
      onCalibChange: function () { updateCalibReadout(); },
      onMeasure: onMeasureUpdate,
      onMove: onMapMove
    });
    App.map = map;
    App.state = S;
    map.provider = D.settings.provider;
    map.tilesEnabled = D.settings.tiles;
    map.showLabels = D.settings.labels;
    map.showGrid = D.settings.grid;

    D.load().then(function () {
      if (!D.settings.provider) {
        const v = D.settings.lastView;
        D.settings.provider = T.defaultProviderFor(v ? v.lat : 44, v ? v.lon : -71.5);
        D.saveSettings();
      }
      if (!T.allowed(D.settings.provider)) {
        // e.g. an older build left "osm" set and this server is in commercial
        // mode: never keep a base map the licence does not cover.
        const v = D.settings.lastView;
        D.settings.provider = T.defaultProviderFor(v ? v.lat : 44, v ? v.lon : -71.5);
        D.saveSettings();
      }
      T.onError = onTileError;
      D.onPinIconLoad = function () { if (map) map.invalidate(); };
      syncMap();
      renderAll();
      restoreView();
      var target = D.settings.targetId ? D.getWaypoint(D.settings.targetId) : null;
      if (target) setTarget(target);
      updateGpsHud(GPS.state);
      renderCompassRose();
      if (H.Sync) {
        H.Sync.onChange = onSyncChange;
        H.Sync.onMerged = onSpotsMerged;
        H.Sync.probe().then(function (ok) {
          if (ok && H.Sync.state.user) H.Sync.syncNow(true);
        });
      }
      if (H.Zones) {
        H.Zones.load().then(function () {
          renderZones();
          if (map) map.setZones(D.settings.zoneShow === false ? [] : H.Zones.list);
          el.setZoneSound.checked = D.settings.zoneSound !== false;
          el.setZoneVibrate.checked = D.settings.zoneVibrate !== false;
          el.setZoneShow.checked = D.settings.zoneShow !== false;
        });
      }
    });

    GPS.onUpdate(handleGps);
    U.on(el.btnSun, 'click', function () { openSheet('sheetSun'); renderSun(); });
    U.on(el.btnMenu, 'click', function () { openSheet('sheetTools'); refreshDiag(); });

    // Auto-start GPS only after permission has been granted once on this device.
    DB.kvGet('gpsGranted', false).then(function (granted) {
      if (granted) startGps();
      else updateGpsHud(GPS.state);
    });

    registerServiceWorker();
    setInterval(tick, 1000);
  };

  function restoreView() {
    const lv = D.settings.lastView;
    if (lv && isFinite(lv.lat) && isFinite(lv.lon)) {
      map.setView(lv.lat, lv.lon, lv.zoom || 13);
      return;
    }
    DB.kvGet('lastpos', null).then(function (pos) {
      if (pos && isFinite(pos.lat)) {
        S.defaultView = true;
        map.setView(pos.lat, pos.lon, 15);
        return;
      }
      if (D.layers.length) {
        const b = PM.bounds(D.layers[0]);
        if (b) { map.fitBounds(b); return; }
      }
      S.defaultView = true;
      map.setView(44, -71.5, 6);
    });
  }
  /* ---------------------------- settings / UI ---------------------------- */
  function applySettings() {
    const s = D.settings;
    U.setUnits(s.units);
    document.body.classList.toggle('night', !!s.night);
    el.setUnits.value = s.units;
    el.setCoordFormat.value = s.coordFormat;
    el.setNight.checked = !!s.night;
    el.setAwake.checked = !!s.awake;
    el.setHighAcc.checked = !!s.highAccuracy;
    el.setLabels.checked = !!s.labels;
    el.setGrid.checked = !!s.grid;
    el.setTrail.checked = !!s.trail;
    el.toggleTiles.checked = !!s.tiles;
    if (GPS.setWantAwake) GPS.setWantAwake(s.awake);
  }

  function syncMap() {
    map.provider = D.settings.provider;
    map.tilesEnabled = D.settings.tiles;
    map.showLabels = D.settings.labels;
    map.showGrid = D.settings.grid;
    map.setWaypoints(D.waypoints);
    map.setOverlays(D.layers);
    map.setTracks(tracksForMap());
    map.invalidate();
  }
  function tracksForMap() {
    return D.settings.trail ? D.tracks : (D.activeTrack ? [D.activeTrack] : []);
  }

  function renderAll() {
    renderWaypoints();
    renderTracks();
    renderProviders();
    renderOverlays();
    renderSync();
    updateWpBadge();
  }

  /* --------------------------- maps from the PC --------------------------- */
  function onSyncChange() {
    if (map) {
      map.setOverlays(D.layers);
      map.invalidate();
    }
    renderSync();
    if (S.sheet === 'sheetLayers') renderOverlays();
    updateWpBadge();
  }

  function renderSync() {
    if (!el.syncSection || !H.Sync) return;
    const sync = H.Sync;
    renderAccount();
    el.syncSection.hidden = !sync.state.enabled;
    if (!sync.state.enabled) return;

    const maps = sync.state.maps || [];
    const shown = sync.filtered();

    if (el.syncUser) {
      el.syncUser.textContent = sync.state.user
        ? 'Signed in as ' + sync.state.user
        : sync.state.requireAuth ? 'Sign in (Tools → Account) to see your maps'
        : 'Not signed in \u2014 showing the shared library';
    }

    fillPlaceSelect(el.syncState, 'Any state', sync.state.places.states || [], sync.state.stateFilter);
    const counties = (sync.state.stateFilter &&
      (sync.state.places.counties_by_state || {})[sync.state.stateFilter]) ||
      sync.state.places.counties || [];
    fillPlaceSelect(el.syncCounty, 'Any county', counties, sync.state.countyFilter);
    if (el.syncSearch && document.activeElement !== el.syncSearch &&
        el.syncSearch.value !== sync.state.q) {
      el.syncSearch.value = sync.state.q || '';
    }

    el.syncCount.textContent = maps.length ? '(' + maps.length + ')' : '';

    const busyIds = Object.keys(sync.state.busy).filter(function (k) { return sync.state.busy[k]; });
    const oldServer = sync.state.enabled && sync.state.serverVersion < 2;
    let status;
    if (oldServer) {
      status = 'This server is older than the app \u2014 rebuild/redeploy it to get place fields, ' +
        'search and accounts.';
    } else if (sync.state.error) {
      status = sync.state.error === 'sign-in required'
        ? 'Sign in to list the maps on the server.'
        : 'Server problem: ' + sync.state.error;
    } else if (busyIds.length) {
      status = 'Downloading ' + busyIds.length + ' map' + (busyIds.length === 1 ? '' : 's') + '\u2026';
    } else if (!maps.length) {
      status = sync.state.user
        ? 'Your library is empty \u2014 maps you add with \u201cCopy to my PC library\u201d ticked land here.'
        : 'No maps on the server yet.';
    } else {
      const pending = sync.pending().length;
      status = maps.length + ' map' + (maps.length === 1 ? '' : 's') + ' on the PC' +
        (pending ? ' \u00b7 ' + pending + ' to download' : ' \u00b7 all saved on this phone');
      if (shown.length !== maps.length) status += ' \u00b7 ' + shown.length + ' shown';
      if (sync.state.lastCheck) status += ' \u00b7 checked ' + U.fmtAge(Date.now() - sync.state.lastCheck);
    }
    if (el.syncStatus.textContent !== status) el.syncStatus.textContent = status;

    el.syncList.innerHTML = '';
    if (!shown.length) {
      if (maps.length) {
        el.syncList.appendChild(U.el('div', { class: 'empty', text: 'No maps match those filters.' }));
      } else if (sync.state.user) {
        el.syncList.appendChild(U.el('div', { class: 'empty',
          text: 'Nothing here yet. Add a map on this phone (Maps \u2192 Add PDF or image) and leave ' +
            '\u201cCopy to my PC library\u201d ticked, or upload one at /upload/. Then come back and ' +
            'press Refresh.' }));
      }
      return;
    }

    shown.forEach(function (m) {
      const state = sync.statusFor(m);
      const layer = sync.localLayer(m.id);
      const isBusy = !!sync.state.busy[m.id];
      const row = U.el('div', { class: 'item' });
      const code = m.kind === 'pdf' ? 'PDF' : m.kind === 'tiff' ? 'TIF' : 'IMG';
      row.appendChild(U.el('span', {
        class: 'pin-mini',
        style: 'background:' + (state === 'synced' ? '#8ec46a' : state === 'update' ? '#e7b73c' : '#4aa3d8'),
        text: code
      }));

      const main = U.el('div', { class: 'item-main' });
      main.appendChild(U.el('div', { class: 'item-title', text: m.name }));
      const bits = [];
      if (m.place) bits.push(m.place);
      bits.push(sync.humanSize(m.size));
      if (m.kind === 'pdf' && m.page > 1) bits.push('page ' + m.page);
      bits.push(state === 'synced' ? 'on this phone' : state === 'update' ? 'update available' : 'not downloaded');
      if (m.calib) bits.push('georeferenced');
      if (isBusy) bits.unshift('downloading\u2026');
      main.appendChild(U.el('div', { class: 'item-sub', text: bits.join(' \u00b7 ') }));
      row.appendChild(main);

      const edit = U.el('button', { class: 'mini-btn', type: 'button', text: 'Edit',
        title: 'Rename, or set the state / county / city' });
      edit.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openMapMeta(m);
      });
      row.appendChild(edit);

      const btn = U.el('button', {
        class: 'mini-btn' + (state === 'new' ? ' primary' : ''),
        type: 'button',
        text: isBusy ? '\u2026' : state === 'new' ? 'Download' : state === 'update' ? 'Update' : 'Saved'
      });
      btn.disabled = isBusy || state === 'synced';
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        downloadRemote(m);
      });
      row.appendChild(btn);

      if (layer) {
        const del = U.el('button', { class: 'icon-btn small', type: 'button',
          title: 'Remove the local copy' });
        del.innerHTML = '<svg class="i"><use href="#i-trash"/></svg>';
        del.addEventListener('click', function (ev) {
          ev.stopPropagation();
          U.confirm('Remove from this phone?',
            'Delete the local copy of <b>' + U.escapeHtml(m.name) + '</b>. ' +
            'You can download it again while on Wi-Fi.', 'Remove').then(function (ok) {
              if (!ok) return;
              H.Sync.forget(layer);
            });
        });
        row.appendChild(del);
        row.addEventListener('click', function () {
          if (layer.calib && layer.img) {
            const b = PM.bounds(layer);
            if (b) map.fitBounds(b, 30);
            S.defaultView = false;
            closeSheets();
          }
        });
      }
      el.syncList.appendChild(row);
    });
  }

  /** Tools → Account card: who is signed in, and the buttons that apply. */
  function openSignInSheet() {
    el.signNote.textContent = 'A new account needs a password of at least 8 characters. ' +
      'The library keeps your maps separate; maps without an owner stay shared.';
    try {
      el.signServer.textContent = new URL('api/login/', location.href).href;
    } catch (e) {
      el.signServer.textContent = 'api/login/';
    }
    openSheet('sheetSignIn');
    el.signUser.focus();
  }

  /** Tools → Account → "Check server": show what the server actually reports. */
  function checkServer() {
    if (!H.Sync) return;
    el.accountDiag.hidden = false;
    el.accountDiag.textContent = 'Checking\u2026';
    H.Sync.diag().then(function (d) {
      const bits = [
        'app v' + VERSION.app,
        'server v' + d.version,
        d.users + ' account' + (d.users === 1 ? '' : 's'),
        d.staff ? (d.staff + ' admin') : 'NO admin',
        d.maps + ' map' + (d.maps === 1 ? '' : 's') + ' in the library'
      ];
      if (d.signed_in) bits.push('signed in as ' + d.signed_in);
      if (d.signed_in && d.spots != null) {
        bits.push(d.spots + ' spot' + (d.spots === 1 ? '' : 's'));
        bits.push(d.tracks + ' track' + (d.tracks === 1 ? '' : 's'));
      }
      if (d.require_auth) bits.push('library locked');
      el.accountDiag.textContent = bits.join(' \u00b7 ') + (d.hint ? '\n' + d.hint : '');
      el.accountAdminLink.hidden = !d.signed_in || !d.staff;
      if (!d.accounts_ready) {
        el.accountNote.textContent = 'No administrator yet. Use Create account: the first ' +
          'account becomes the admin, or set HUNTMAP_ADMIN_PASSWORD and restart.';
      }
    }).catch(function (err) {
      el.accountDiag.textContent = (err && err.status === 404)
        ? 'No /api/diag/ on this server \u2014 it is an older build. Rebuild/redeploy the container.'
        : 'Server check failed: ' + ((err && err.message) || err);
    });
  }

  function renderAccount() {
    if (!el.accountState) return;
    const sync = H.Sync || { state: {} };
    const user = sync.state.user;
    const hasServer = !!(sync.state && sync.state.enabled);
    el.accountState.textContent = user
      ? 'Signed in as ' + user
      : hasServer ? 'Not signed in' : 'No HuntMap server on this address';
    el.btnAccountSignIn.hidden = !!user;
    el.btnAccountSignOut.hidden = !user;
    el.btnAccountExport.hidden = !user;
    el.btnAccountDelete.hidden = !user;
    if (el.accountServerRow) {
      const native = H.Sync && H.Sync.isNative && H.Sync.isNative();
      el.accountServerRow.hidden = !native;
      if (native && !el.accountServer.value) el.accountServer.value = H.Sync.serverUrl || '';
    }
    el.accountNote.textContent = user
      ? 'Your uploads and your spots/tracks belong to this account: sign in on another phone or PC ' +
        'and they come along.'
      : (H.Sync && H.Sync.isNative && H.Sync.isNative() && !H.Sync.serverUrl)
        ? 'This app works offline with everything on the phone. Add your server address above to '
          + 'sign in and sync spots, tracks and the map library between devices.'
      : hasServer
        ? 'Sign in to sync spots and tracks between devices and to keep your maps in your own ' +
          'library. Right now ' + D.waypoints.length + ' spot' + (D.waypoints.length === 1 ? '' : 's') +
          ' and ' + D.tracks.length + ' track' + (D.tracks.length === 1 ? '' : 's') +
          ' live on this phone only. You can also create an account here.'
        : 'Accounts live on the HuntMap server. Open the app from your server address (or the tunnel hostname) to sign in.';
    if (el.btnAccountSync) {
      // Always visible once a server is known: a missing button is worse than a
      // button that explains why it cannot do anything yet.
      el.btnAccountSync.hidden = !hasServer;
      const s = (sync && sync.syncState) || {};
      el.btnAccountSync.textContent = s.busy ? 'Syncing\u2026' : 'Sync spots';
      el.btnAccountSync.title = user
        ? 'Push your spots and tracks, then take back anything new from your other devices'
        : 'Sign in to sync your spots and tracks between devices';
      if (user && s.at && !el.accountDiag.hidden) {
        // keep the last result visible when the panel is open
        el.accountDiag.textContent = 'Last sync ' + U.fmtAge(Date.now() - s.at) +
          ' \u00b7 ' + s.spots + ' spot' + (s.spots === 1 ? '' : 's') +
          ' \u00b7 ' + s.tracks + ' track' + (s.tracks === 1 ? '' : 's');
      }
    }
  }

  function fillPlaceSelect(select, anyLabel, values, current) {
    if (!select) return;
    const wanted = current || '';
    const signature = anyLabel + '|' + wanted + '|' + values.join(',');
    if (select.dataset.sig === signature) return;
    select.dataset.sig = signature;
    select.innerHTML = '';
    select.appendChild(U.el('option', { value: '', text: anyLabel }));
    values.forEach(function (v) {
      const opt = U.el('option', { value: v, text: v });
      if (v.toLowerCase() === wanted.toLowerCase()) opt.selected = true;
      select.appendChild(opt);
    });
  }

  /** Edit a map that lives on this device (name / place), linked to the server if it has one. */
  function openLayerMeta(layer) {
    S.metaLayer = layer;
    S.metaTarget = null;
    const signedIn = !!(H.Sync && H.Sync.state.user);
    el.metaSub.textContent = (layer.kind === 'pdf' ? 'PDF' : 'Image') +
      (layer.remoteId ? ' \u00b7 in your library' : ' \u00b7 on this device only');
    el.metaName.value = layer.name || '';
    el.metaState.value = layer.state || '';
    el.metaCounty.value = layer.county || '';
    el.metaCity.value = layer.city || '';
    el.metaPage.value = layer.page || 1;
    el.metaNotes.value = layer.notes || '';
    const canUpload = !layer.remoteId && signedIn;
    el.btnLayerUpload.hidden = !canUpload;
    el.metaDeviceNote.hidden = !!layer.remoteId;
    el.metaDeviceNote.textContent = signedIn
      ? 'This map lives on this device only. Copy it to your library so your other devices can get it.'
      : 'This map lives on this device only. Sign in to keep a copy on your server.';
    el.metaFoot.hidden = !layer.remoteId;
    openSheet('sheetMapMeta');
  }

  /** Copy a map that is only on this device up to the account's library. */
  function uploadLayer() {
    const layer = S.metaLayer;
    if (!layer || !H.Sync) return;
    if (!H.Sync.state.user) { U.toast('Sign in first', 'err'); return; }
    el.btnLayerUpload.disabled = true;
    el.btnLayerUpload.textContent = 'Uploading\u2026';
    DB.blobGet('mapimg:' + layer.id).then(function (blob) {
      if (!blob) throw new Error('the page image is no longer stored');
      const ext = (blob.type === 'image/jpeg') ? 'jpg' : 'png';
      const file = new File([blob], (layer.name || 'map').replace(/[^\w.-]+/g, '-') + '.' + ext,
        { type: blob.type || 'image/png' });
      return H.Sync.upload(file, {
        name: el.metaName.value.trim() || layer.name,
        page: 1,
        state: el.metaState.value.trim(),
        county: el.metaCounty.value.trim(),
        city: el.metaCity.value.trim(),
        notes: (el.metaNotes.value.trim() || '') +
          (layer.kind === 'pdf' ? ' (page ' + (layer.page || 1) + ' as an image)' : '')
      });
    }).then(function (json) {
      layer.remoteId = json.id;
      layer.state = json.state || el.metaState.value.trim();
      layer.county = json.county || el.metaCounty.value.trim();
      layer.city = json.city || el.metaCity.value.trim();
      return D.saveLayer(layer).then(function () {
        if (layer.calib && H.Sync.pushCalibration) H.Sync.pushCalibration(layer);
        el.btnLayerUpload.disabled = false;
        el.btnLayerUpload.textContent = 'Copy to my PC library';
        closeSheets();
        renderOverlays();
        U.toast('Uploaded to your library', 'ok');
        H.Sync.probe();
      });
    }).catch(function (err) {
      el.btnLayerUpload.disabled = false;
      el.btnLayerUpload.textContent = 'Copy to my PC library';
      U.toast('Upload failed: ' + ((err && err.message) || err), 'err', 4200);
    });
  }

  function openMapMeta(remote) {
    S.metaTarget = remote;
    S.metaLayer = null;
    el.metaSub.textContent = (remote.kind || 'map').toUpperCase() +
      (remote.size ? ' \u00b7 ' + H.Sync.humanSize(remote.size) : '') +
      (remote.owner ? ' \u00b7 ' + remote.owner : '');
    el.metaName.value = remote.name || '';
    el.metaState.value = remote.state || '';
    el.metaCounty.value = remote.county || '';
    el.metaCity.value = remote.city || '';
    el.metaPage.value = remote.page || 1;
    el.metaNotes.value = remote.notes || '';
    el.btnLayerUpload.hidden = true;
    el.metaDeviceNote.hidden = true;
    el.metaFoot.hidden = false;
    openSheet('sheetMapMeta');
  }

  function saveMapMeta() {
    const target = S.metaTarget;
    const layer = S.metaLayer;
    const name = el.metaName.value.trim();
    if (!name) { U.toast('Give the map a name', 'err'); return; }
    const fields = {
      name: name,
      page: Math.max(1, parseInt(el.metaPage.value, 10) || 1),
      state: el.metaState.value.trim(),
      county: el.metaCounty.value.trim(),
      city: el.metaCity.value.trim(),
      notes: el.metaNotes.value.trim()
    };

    if (layer) {
      // Local map: save here, and push the same details if it is in the library.
      layer.name = fields.name;
      layer.page = fields.page;
      layer.state = fields.state;
      layer.county = fields.county;
      layer.city = fields.city;
      layer.notes = fields.notes;
      D.saveLayer(layer).then(function () {
        renderOverlays();
        map.setOverlays(D.layers);
        closeSheets();
        U.toast('Saved "' + fields.name + '"', 'ok');
        if (layer.remoteId && H.Sync && H.Sync.state.user) {
          H.Sync.updateMeta(layer.remoteId, fields).catch(function () {});
        }
      });
      return;
    }

    if (!target || !H.Sync) return;
    el.btnMetaSave.disabled = true;
    H.Sync.updateMeta(target.id, fields).then(function (json) {
      el.btnMetaSave.disabled = false;
      closeSheets();
      U.toast('Saved "' + json.name + '"', 'ok');
      H.Sync.probe();
    }).catch(function (err) {
      el.btnMetaSave.disabled = false;
      U.toast(err && err.status === 403
        ? 'Sign in as the owner to edit this map'
        : 'Could not save: ' + ((err && err.message) || err), 'err', 4200);
    });
  }

  function submitSignIn(mode) {
    if (!H.Sync) return;
    const user = el.signUser.value.trim();
    const pass = el.signPass.value;
    if (!user || !pass) { U.toast('User name and password, please', 'err'); return; }
    if (!H.Sync.state.enabled && !H.Sync.available()) {
      el.signNote.textContent = 'Accounts live on the HuntMap server \u2014 this page was not ' +
        'served by it. Open the app from your server address (or tunnel hostname) instead.';
      U.toast('No HuntMap server on this address', 'err', 4200);
      return;
    }
    el.btnSignInGo.disabled = true;
    el.btnSignUpGo.disabled = true;
    const call = mode === 'register' ? H.Sync.register(user, pass) : H.Sync.login(user, pass);
    call.then(function (json) {
      el.btnSignInGo.disabled = false;
      el.btnSignUpGo.disabled = false;
      el.signPass.value = '';
      el.signNote.textContent = 'Signed in. Maps you add can be copied to your library.';
      closeSheets();
      U.toast((mode === 'register' ? 'Account created \u2014 signed in as ' : 'Signed in as ') +
        (json.user || user), 'ok', 3000);
      renderSync();
    }).catch(function (err) {
      el.btnSignInGo.disabled = false;
      el.btnSignUpGo.disabled = false;
      const status = err && err.status;
      const code = err && err.code;
      let msg;
      if (code === 'bad-credentials' || status === 401) {
        msg = (err && err.message) || 'Wrong user name or password.';
      } else if (status === 404) {
        msg = 'This server is too old for accounts (no /api/login/). ' +
          'Rebuild or redeploy the container, then reload the app.';
      } else if (code === 'html-response') {
        msg = 'The server replied with a web page instead of JSON \u2014 a proxy or ' +
          'Cloudflare Access is intercepting it. Sign in there first, or exclude /api/.';
      } else if (!navigator.onLine) {
        msg = 'No network connection.';
      } else {
        msg = 'Could not sign in: ' + ((err && err.message) || err) +
          (status ? ' (HTTP ' + status + ')' : '');
      }
      el.signNote.textContent = msg;
      U.toast(msg, 'err', 6000);
    });
  }

  function downloadRemote(remote, quiet) {
    const sync = H.Sync;
    if (!sync || sync.state.busy[remote.id]) return Promise.resolve(null);
    if (!navigator.onLine) {
      if (!quiet) U.toast('No connection \u2014 download maps while on Wi-Fi', 'err');
      return Promise.resolve(null);
    }
    if (!quiet) U.toast('Downloading "' + remote.name + '\u2026', 'ok', 2000);
    return sync.download(remote).then(function (layer) {
      if (!layer) return null;
      map.setOverlays(D.layers);
      renderOverlays();
      if (!quiet) U.toast('"' + layer.name + '" is on this phone now', 'ok', 2600);
      return layer;
    }).catch(function (err) {
      U.toast('Download failed: ' + ((err && err.message) || err), 'err', 4200);
      return null;
    });
  }

  function downloadAllRemote() {
    const sync = H.Sync;
    if (!sync) return;
    const todo = sync.pending();
    if (!todo.length) { U.toast('Everything is already on this phone', 'ok'); return; }
    let done = 0, failed = 0;
    U.toast('Downloading ' + todo.length + ' map' + (todo.length === 1 ? '' : 's') + '\u2026', 'ok', 2200);
    (function next() {
      const remote = todo.shift();
      if (!remote) {
        U.toast(failed
          ? ('Downloaded ' + done + ', ' + failed + ' failed \u2014 check the connection')
          : ('Downloaded ' + done + ' map' + (done === 1 ? '' : 's') + ' \u2014 ready for airplane mode'),
          failed ? 'err' : 'ok', 3400);
        return;
      }
      downloadRemote(remote, true).then(function (layer) {
        if (layer) done++; else failed++;
        setTimeout(next, 250);
      });
    })();
  }

  /* ------------------------------- sheets ------------------------------- */
  function openSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    if (S.sheet && S.sheet !== id) {
      const prev = document.getElementById(S.sheet);
      if (prev) { prev.classList.remove('open'); prev.setAttribute('aria-hidden', 'true'); }
    }
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    S.sheet = id;
    el.scrim.classList.add('on');
    if (id === 'sheetLayers') { renderOverlays(); renderProviders(); renderSync(); refreshTileStats(); }
    if (id === 'sheetWaypoints') renderWaypoints();
    if (id === 'sheetTracks') renderTracks();
    if (id === 'sheetSun') renderSun();
    if (id === 'sheetGps') renderGpsDetails();
    if (id === 'sheetTools') { refreshDiag(); renderAccount(); }
    if (id === 'sheetZones') renderZones();
  }
  App.openSheet = openSheet;

  function closeSheets() {
    U.$$('.sheet.open').forEach(function (s) {
      s.classList.remove('open');
      s.setAttribute('aria-hidden', 'true');
    });
    S.sheet = null;
    el.scrim.classList.remove('on');
    if (S.wpSelectMode) {          // leaving the Spots panel ends select mode
      S.wpSelectMode = false;
      S.wpSelected = [];
      if (el.btnWpSelect) el.btnWpSelect.classList.remove('on');
    }
    bindMeasureButtons();
  }
  App.closeSheets = closeSheets;

  function bindSheetClosers() {
    U.$$('[data-close]').forEach(function (b) { U.on(b, 'click', closeSheets); });
    U.on(el.scrim, 'click', closeSheets);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeSheets(); });
  }
  function bindMeasureButtons() {}

  /* ---------------------------- global events ---------------------------- */
  function bindGlobal() {
    bindSheetClosers();
    U.on(el.btnZoomIn, 'click', function () { map.zoomIn(); });
    U.on(el.btnZoomOut, 'click', function () { map.zoomOut(); });
    U.on(el.btnLocate, 'click', function () {
      if (GPS.state.lat == null) {
        startGps();
        U.toast('Getting a GPS fix\u2026', 'ok');
        return;
      }
      setFollow(true);
      map.setView(GPS.state.lat, GPS.state.lon, Math.max(map.zoom, 16));
      U.toast('Centred on your position', 'ok');
    });
    U.on(el.btnCompass, 'click', function () { openSheet('sheetCompass'); openCompass(); });
    U.on(el.btnMeasure, 'click', function () { toggleMeasure(); });
    U.on(el.gpsChip, 'click', function () {
      if (GPS.state.lat == null && GPS.state.status !== 'waiting') {
        startGps();
        U.toast('Starting GPS\u2026', 'ok');
      }
      openSheet('sheetGps');
      renderGpsDetails();
    });
    U.on(el.coordChip, 'click', function () { cycleCoordFormat(); });

    U.on(el.btnMark, 'click', function () {
      if (S.pinMode) { openMarkSheet(null, 'crosshair'); return; }
      openMarkSheet(null);
    });
    U.on(el.btnPin, 'click', function () { togglePinMode(); });
    U.on(el.btnPinDrop, 'click', function () { openMarkSheet(map.pinLatLon(), 'crosshair'); });
    U.on(el.btnPinDone, 'click', function () { togglePinMode(false); });
    U.on(el.btnRec, 'click', function () { toggleRecording(); });
    U.on(el.btnWaypoints, 'click', function () { openSheet('sheetWaypoints'); });
    U.on(el.btnTools, 'click', function () { openSheet('sheetTools'); });
    U.on(el.btnLayers, 'click', function () { openSheet('sheetLayers'); });
    U.on(el.btnNavClear, 'click', function () { setTarget(null); });

    U.on(window, 'online', function () {
      U.toast('Back online', 'ok');
      map.invalidate();
      if (H.Sync) H.Sync.probe();
    });
    U.on(window, 'offline', function () { U.toast('Offline \u2014 GPS and saved maps still work', 'ok', 3200); map.invalidate(); });
    U.on(window, 'resize', function () { if (S.calibrating) liftToastsAboveHud(); });
  }

  function startGps() {
    GPS.start({ highAccuracy: D.settings.highAccuracy });
  }

  function setFollow(on) {
    S.follow = on;
    map.follow = on;
    if (on) S.defaultView = false;
    el.btnLocate.classList.toggle('on', on);
  }

  /* ------------------------------ clock tick ------------------------------ */
  function tick() {
    updateGpsHud(GPS.state, true);
    if (D.activeTrack) updateTrackHud();
    if (S.sheet === 'sheetSun') renderSun();
    if (S.sheet === 'sheetCompass') drawCompass();
    if (S.sheet === 'sheetGps') renderGpsDetails();
    if (S.sheet === 'sheetTools') refreshDiag();
  }

  function onMapMove() {
    if (!S.defaultView) saveViewSoon();
    updateCoordHud();
    updateTargetBar();
    renderCompassRose();
    if (S.pinMode) updatePinHud();
  }
  const saveViewSoon = U.debounce(function () {
    const c = map.getCenterLatLon();
    D.settings.lastView = { lat: c.lat, lon: c.lon, zoom: map.zoom };
    D.saveSettings();
  }, 1200);
  /* -------------------------------- GPS -------------------------------- */
  let gpsSeen = false;

  /* --------------------------- heading / compass rose --------------------------- */
  const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  /** 0-360 -> "NNE 24°" (the way a compass reads). */
  function headingText(deg) {
    if (deg == null || !isFinite(deg)) return '';
    const d = ((deg % 360) + 360) % 360;
    return CARDINALS[Math.round(d / 22.5) % 16] + ' ' + Math.round(d) + '°';
  }

  /** The little compass: needle = where the phone is pointing. */
  function renderCompassRose() {
    if (!el.miniCompass) return;
    el.miniCompass.hidden = D.settings.compassRose === false;
    if (el.miniCompass.hidden) return;
    const head = GPS.displayHeading();
    el.miniCompass.classList.toggle('mc-off', head == null);
    if (el.mcNeedle) {
      el.mcNeedle.style.transform = 'rotate(' + (head == null ? 0 : head) + 'deg)';
    }
    el.miniCompass.title = head == null
      ? 'No compass heading yet — tap to switch the sensor on'
      : 'Pointing ' + headingText(head) + ' — tap for the compass panel';
  }

  function enableHeading() {
    return GPS.enableCompass().then(function (ok) {
      renderCompassRose();
      if (!ok) {
        U.toast('This device did not give a compass heading (permission or sensor)', 'err', 4200);
      } else {
        U.toast('Compass on — the cone follows your phone', 'ok', 2600);
      }
      return ok;
    });
  }

  function handleGps(st) {
    updateGpsHud(st);
    if (S.pinMode) updatePinHud();
    if (st.lat != null) {
      const firstFix = !gpsSeen;
      gpsSeen = true;
      map.setPosition({
        lat: st.lat, lon: st.lon, accuracy: st.accuracy,
        heading: GPS.displayHeading(), speed: st.speed, alt: st.altitude
      });
      if (S.follow) map.follow = true;
      // On a first run with no saved view, zoom in to a useful hunting scale.
      if (firstFix && S.defaultView) {
        S.defaultView = false;
        map.setView(st.lat, st.lon, 15);
      }
      DB.kvSet('gpsGranted', true).catch(function () {});
      const now = Date.now();
      if (now - S.lastFixSave > 20000) {
        S.lastFixSave = now;
        DB.kvSet('lastpos', { lat: st.lat, lon: st.lon, t: now }).catch(function () {});
      }
      if (H.Zones && D.settings.zoneAlerts !== false) {
        H.Zones.check(st.lat, st.lon).forEach(zoneAlert);
      }
      if (D.activeTrack && !GPS.isStale(25000)) {
        if (D.addTrackPoint(st.lat, st.lon, { accuracy: st.accuracy, altitude: st.altitude })) {
          updateTrackHud();
          D.saveTrack(D.activeTrack);
          map.setTracks(tracksForMap());
        }
      }
    } else if (st.status === 'off' || st.status === 'denied') {
      map.setPosition(null);
    }
    updateCoordHud();
    updateTargetBar();
    renderCompassRose();
  }

  function updateGpsHud(st, ticking) {
    if (!el.gpsDot) return;
    const dot = el.gpsDot, txt = el.gpsText;
    let cls = 'off', label = 'GPS off';
    if (st.status === 'ok' && st.lat != null) {
      const age = GPS.age();
      const stale = age != null && age > 45000;
      const poor = st.accuracy != null && st.accuracy > 35;
      const net = st.source === 'network';
      cls = stale || poor ? 'warn' : 'ok';
      label = st.accuracy != null ? '\u00b1' + Math.round(st.accuracy) + ' m' : 'GPS fix';
      if (net && (st.accuracy == null || st.accuracy > 100)) label += ' \u00b7 Wi-Fi';
      if (stale) label += ' \u00b7 ' + U.fmtAge(age);
      else if (poor && !net) label += ' \u00b7 weak';
    } else if (st.status === 'waiting') {
      cls = 'wait';
      label = st.lat != null ? 'GPS \u00b1' + Math.round(st.accuracy) + ' m' : 'Searching\u2026';
      if (st.slow && st.lat == null) {
        const secs = st.startedAt ? Math.round((Date.now() - st.startedAt) / 1000) : 0;
        label = 'No fix \u00b7 ' + secs + ' s';
      }
    } else if (st.status === 'denied') {
      cls = 'err'; label = 'GPS blocked';
    } else if (st.status === 'insecure') {
      cls = 'err'; label = 'GPS needs HTTPS';
    } else if (st.status === 'unavailable') {
      cls = 'err'; label = 'No GPS support';
    } else if (st.status === 'error') {
      cls = 'err'; label = 'GPS error';
    }
    const head = GPS.displayHeading();
    if (head != null && st.status === 'ok') label += ' \u00b7 ' + headingText(head);
    if (dot.className !== 'gps-dot ' + cls) dot.className = 'gps-dot ' + cls;
    if (txt.textContent !== label) txt.textContent = label;
    el.btnLocate.classList.toggle('on', !!S.follow);

    let warn = '';
    if (st.status === 'insecure') {
      warn = 'GPS needs a secure page \u2014 open the app from its https:// address';
    } else if (st.status === 'denied') {
      warn = 'Location permission denied \u2014 allow it in your browser settings';
    } else if (st.status === 'waiting' && st.slow && st.lat == null) {
      warn = 'No location yet. Wi-Fi location needs the phone/PC location service on;' +
        ' satellites need open sky. Tap the GPS chip for details.';
    }
    el.gpsWarn.hidden = !warn;
    if (warn && el.gpsWarn.textContent !== warn) el.gpsWarn.textContent = warn;
    if (!ticking && st.status === 'ok' && st.accuracy != null && st.accuracy > 60 && st.source !== 'network') {
      U.toast('Weak GPS (\u00b1' + Math.round(st.accuracy) + ' m). Move to open sky.', 'err', 3000);
    }
  }

  function updateCoordHud() {
    if (!el.coordText) return;
    const st = GPS.state;
    let lat = st.lat, lon = st.lon, prefix = '';
    if (lat == null || GPS.isStale(120000)) {
      const c = map.getCenterLatLon();
      lat = c.lat; lon = c.lon;
      prefix = 'map \u00b7 ';
    }
    const fmt = D.settings.coordFormat;
    const main = G.formatCoord(lat, lon, fmt);
    if (el.coordText.textContent !== main) el.coordText.textContent = main;
    const sub = prefix + G.formatAlt(lat, lon, fmt);
    if (el.coordSub.textContent !== sub) el.coordSub.textContent = sub;
  }
  App.updateCoordHud = updateCoordHud;

  function cycleCoordFormat() {
    const order = ['dd', 'dms', 'utm'];
    const i = order.indexOf(D.settings.coordFormat);
    D.settings.coordFormat = order[(i + 1) % order.length];
    el.setCoordFormat.value = D.settings.coordFormat;
    D.saveSettings();
    updateCoordHud();
    U.toast('Coordinates: ' + ({ dd: 'decimal degrees', dms: 'deg/min/sec', utm: 'UTM' })[D.settings.coordFormat], 'ok', 1600);
  }
  /* ------------------------------- target ------------------------------- */
  function setTarget(wp) {
    if (!wp) {
      map.target = null;
      map.selectedId = null;
      D.settings.targetId = null;
      D.saveSettings();
      el.navTargetBar.hidden = true;
      map.invalidate();
      return;
    }
    map.target = { lat: wp.lat, lon: wp.lon, name: wp.name, id: wp.id };
    map.selectedId = wp.id;
    D.settings.targetId = wp.id;
    D.saveSettings();
    updateTargetBar();
    map.invalidate();
  }
  App.setTarget = setTarget;

  function updateTargetBar() {
    const t = map && map.target;
    if (!t) { el.navTargetBar.hidden = true; return; }
    el.navTargetBar.hidden = false;
    if (el.navTargetName.textContent !== (t.name || 'Target')) {
      el.navTargetName.textContent = t.name || 'Target';
    }
    const st = GPS.state;
    const from = (st.lat != null && !GPS.isStale(120000)) ? { lat: st.lat, lon: st.lon } : map.getCenterLatLon();
    const d = G.distance(from.lat, from.lon, t.lat, t.lon);
    const brg = G.bearing(from.lat, from.lon, t.lat, t.lon);
    el.navTargetArrow.style.transform = 'rotate(' + brg.toFixed(1) + 'deg)';
    el.navTargetDist.textContent = U.fmtDist(d) + ' \u00b7 ' + Math.round(brg) + '\u00b0 ' + G.compassPoint(brg);
  }

  /* ------------------------------ recording ------------------------------ */
  function toggleRecording() {
    if (D.activeTrack) { stopRecording(); return; }
    if (GPS.state.lat == null) {
      startGps();
      U.toast('Waiting for GPS before recording\u2026', 'ok');
      setTimeout(function () {
        if (!D.activeTrack) {
          if (GPS.state.lat != null) beginRecording();
          else U.toast('Still no GPS fix \u2014 try again under open sky', 'err');
        }
      }, 8000);
      return;
    }
    beginRecording();
  }

  function beginRecording() {
    const trk = D.startTrack();
    D.addTrackPoint(GPS.state.lat, GPS.state.lon,
      { accuracy: GPS.state.accuracy, altitude: GPS.state.altitude });
    D.saveTrack(trk);
    map.setTracks(tracksForMap());
    updateTrackHud();
    U.vibrate(30);
    U.toast('Recording track \u2014 keep the app open', 'ok');
  }

  function stopRecording() {
    const stats = D.activeTrack ? D.trackStats(D.activeTrack) : null;
    const name = D.activeTrack ? D.activeTrack.name : '';
    D.stopTrack();
    updateTrackHud();
    map.setTracks(tracksForMap());
    renderTracks();
    U.toast('Saved "' + name + '" \u00b7 ' + (stats ? U.fmtDist(stats.distance) : ''), 'ok');
  }

  function updateTrackHud() {
    const trk = D.activeTrack;
    document.body.classList.toggle('recording', !!trk);
    el.btnRec.classList.toggle('on', !!trk);
    el.btnRecLabel.textContent = trk ? 'Stop' : 'Record';
    if (!trk) { el.trackHud.hidden = true; return; }
    el.trackHud.hidden = false;
    const stats = D.trackStats(trk);
    el.trackDist.textContent = U.fmtDist(stats.distance);
    el.trackTime.textContent = U.fmtClock(stats.duration / 1000);
    el.trackPts.textContent = stats.points + ' pts';
  }

  /* ------------------------------- measure ------------------------------- */
  function toggleMeasure(force) {
    S.measureOn = force == null ? !S.measureOn : !!force;
    if (S.measureOn && S.pinMode) togglePinMode(false);
    map.measureOn = S.measureOn;
    if (!S.measureOn) map.measure = [];
    el.btnMeasure.classList.toggle('on', S.measureOn);
    el.measureHud.hidden = !S.measureOn;
    el.measureTotal.textContent = U.fmtDist(map.measureTotal());
    map.invalidate();
    if (S.measureOn) U.toast('Tap the map to drop measuring points', 'ok', 2200);
  }

  function onMeasureUpdate(total) {
    el.measureTotal.textContent = U.fmtDist(total);
  }

  /* ------------------------------- map taps ------------------------------- */
  function onMapTap(ll, wp) {
    if (wp) { openWptSheet(wp); return; }
    map.selectedId = null;
    map.invalidate();
  }

  function onMapLongPress(ll) {
    openMarkSheet(ll, 'tap');
  }

  /* ------------------------------- versions ------------------------------- */
  const VERSION = (self.HUNTMAP_VERSION || { app: 'dev', date: '', shell: 'huntmap-shell-dev' });

  function renderVersion() {
    if (!el.appVersion) return;
    const native = H.Native && H.Native.describe ? H.Native.describe() : '';
    el.appVersion.textContent = 'HuntMap v' + VERSION.app +
      (VERSION.date ? ' \u00b7 ' + VERSION.date : '') + (native ? ' \u00b7 ' + native : '');
  }

  /** Throw away the cached shell and take the newest files from the server. */
  function updateApp() {
    const done = function () { location.reload(); };
    const jobs = [];
    if (self.caches) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('huntmap-shell-') === 0; })
          .map(function (k) { return caches.delete(k); }));
      }).catch(function () {}));
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }).catch(function () {}));
    }
    U.toast('Fetching the newest version\u2026', 'ok', 2500);
    Promise.all(jobs).then(done, done);
  }

  /* -------------------------------- geofences -------------------------------- */
  let audioCtx = null;

  /** Two short tones; iOS may block audio until the user has touched the app. */
  function beep(freq, dur, when) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!audioCtx) audioCtx = new Ctor();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
      const t0 = audioCtx.currentTime + (when || 0);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* autoplay policy, or no audio device */ }
  }

  /** Fire the announcement for a fence event: banner, sound, buzz, notification. */
  function zoneAlert(ev) {
    const z = ev.zone;
    const inside = ev.type === 'enter';
    const msg = (inside ? 'Entered ' : 'Left ') + (z.name || 'fence') +
      ' \u00b7 ' + U.fmtDist(ev.distance);
    U.toast(msg, inside ? 'ok' : '', 4200);
    if (D.settings.zoneSound) {
      if (inside) { beep(760, 0.12); beep(1040, 0.14, 0.15); }
      else { beep(520, 0.16); beep(390, 0.2, 0.18); }
    }
    if (D.settings.zoneVibrate && navigator.vibrate) {
      try { navigator.vibrate(inside ? [90, 70, 90] : [240]); } catch (e) { /* ignore */ }
    }
    if (H.Native && H.Native.notify) H.Native.notify('HuntMap fence', msg);
    S.zoneLog.unshift({ at: Date.now(), type: ev.type, name: z.name, dist: ev.distance });
    S.zoneLog = S.zoneLog.slice(0, 20);
    if (S.sheet === 'sheetZones') renderZones();
    if (map) map.invalidate();
  }

  function renderZones() {
    if (!el.zoneList) return;
    const rows = (H.Zones ? H.Zones.rows() : []);
    if (el.zoneCount) el.zoneCount.textContent = rows.length ? '(' + rows.length + ')' : '';
    el.zoneList.innerHTML = '';
    if (!rows.length) {
      el.zoneList.appendChild(U.el('div', { class: 'empty',
        text: 'No fences yet. Move the map to the area you care about, tap + and set a radius.' }));
    }
    rows.forEach(function (row) {
      const z = row.zone;
      const item = U.el('div', { class: 'item item-split', 'data-zone': z.id });
      const dot = U.el('span', { class: 'fence-mini', style: 'border-color:' + z.color });
      item.appendChild(dot);
      const main = U.el('div', { class: 'item-main' });
      main.appendChild(U.el('div', { class: 'item-title', text: z.name }));
      const bits = [U.fmtDist(z.radius) + ' radius',
        row.inside === null ? 'waiting for a fix' : row.inside ? 'INSIDE' : 'outside',
        z.onEnter ? 'enter' : '', z.onExit ? 'exit' : '', z.enabled ? '' : 'off'];
      main.appendChild(U.el('div', { class: 'item-sub',
        text: bits.filter(Boolean).join(' \u00b7 ') }));
      item.appendChild(main);
      const go = U.el('button', { class: 'mini-btn', type: 'button', text: 'Map' });
      go.addEventListener('click', function () {
        map.setView(z.lat, z.lon, Math.max(map.zoom, 15));
        closeSheets();
      });
      const edit = U.el('button', { class: 'mini-btn', type: 'button', text: 'Edit' });
      edit.addEventListener('click', function () { editZone(z); });
      const del = U.el('button', { class: 'mini-btn', type: 'button', text: 'Delete' });
      del.addEventListener('click', function () {
        U.confirm('Delete "' + U.escapeHtml(z.name) + '"?',
          'Its alerts stop immediately.', 'Delete').then(function (ok) {
          if (!ok) return;
          H.Zones.remove(z.id).then(function () {
            renderZones();
            if (map) map.invalidate();
            U.toast('Fence deleted', 'ok');
          });
        });
      });
      item.appendChild(go);
      item.appendChild(edit);
      item.appendChild(del);
      el.zoneList.appendChild(item);
    });
    if (el.zoneStatus) {
      const live = rows.filter(function (r) { return r.watching; }).length;
      el.zoneStatus.textContent = live
        ? live + ' fence' + (live === 1 ? '' : 's') + ' watching \u00b7 last alert: ' +
          (S.zoneLog[0] ? U.fmtAge(Date.now() - S.zoneLog[0].at) + ' ago' : 'none yet')
        : 'No fence is being watched. Turn one on to get alerts.';
    }
    if (map && H.Zones) map.setZones(D.settings.zoneShow === false ? [] : H.Zones.list);
  }

  function addZone() {
    if (!H.Zones) return;
    const center = map.getCenterLatLon();
    editZone(H.Zones.newZone({ lat: center.lat, lon: center.lon, radius: 150,
      name: 'Fence ' + (H.Zones.list.length + 1) }), true);
  }

  /** One editor for new and existing fences (a modal keeps it to a few taps). */
  function editZone(zone, isNew) {
    const html =
      '<label class="field"><span>Name</span><input type="text" id="zoneName" value="' +
        U.escapeHtml(zone.name || '') + '"></label>' +
      '<label class="field"><span>Radius (metres)</span>' +
        '<input type="number" id="zoneRadius" min="' + H.Zones.MIN_R + '" max="' +
        H.Zones.MAX_R + '" step="5" value="' + zone.radius + '"></label>' +
      '<label class="switch-row"><span>Alert when entering</span>' +
        '<input type="checkbox" id="zoneEnter"' + (zone.onEnter ? ' checked' : '') + '></label>' +
      '<label class="switch-row"><span>Alert when leaving</span>' +
        '<input type="checkbox" id="zoneExit"' + (zone.onExit ? ' checked' : '') + '></label>' +
      '<label class="switch-row"><span>Watching</span>' +
        '<input type="checkbox" id="zoneOn"' + (zone.enabled ? ' checked' : '') + '></label>';
    U.modal({
      title: isNew ? 'New fence' : 'Edit fence',
      html: html,
      okText: isNew ? 'Add fence' : 'Save',
      onOk: function (body) {
        const name = (body.querySelector('#zoneName').value || '').trim() || 'Fence';
        const radius = U.clamp(parseInt(body.querySelector('#zoneRadius').value, 10) || 150,
          H.Zones.MIN_R, H.Zones.MAX_R);
        zone.name = name;
        zone.radius = radius;
        zone.onEnter = body.querySelector('#zoneEnter').checked;
        zone.onExit = body.querySelector('#zoneExit').checked;
        zone.enabled = body.querySelector('#zoneOn').checked;
        H.Zones.resetState(zone.id);
        H.Zones.save(zone).then(function () {
          renderZones();
          if (map) map.invalidate();
          U.toast((isNew ? 'Fence added: ' : 'Saved: ') + name, 'ok');
        });
      }
    });
  }

  /* ------------------------------- licences ------------------------------- */
  function renderLicences() {
    if (!el.licenceList) return;
    el.licenceList.innerHTML = '';
    T.visibleIds().forEach(function (id) {
      const p = T.PROVIDERS[id];
      const row = U.el('div', { class: 'item' });
      const main = U.el('div', { class: 'item-main' });
      main.appendChild(U.el('div', { class: 'item-title', text: p.name }));
      main.appendChild(U.el('div', { class: 'item-sub',
        text: [p.licence, p.attribution].filter(Boolean).join(' \u00b7 ') }));
      row.appendChild(main);
      if (p.attribution_url) {
        const link = U.el('a', { class: 'mini-btn', href: p.attribution_url,
          target: '_blank', rel: 'noopener', text: 'Source' });
        row.appendChild(link);
      }
      el.licenceList.appendChild(row);
    });
    const hidden = Object.keys(T.PROVIDERS).filter(function (id) {
      return T.visibleIds().indexOf(id) < 0;
    });
    if (hidden.length) {
      el.licenceList.appendChild(U.el('div', { class: 'empty',
        text: 'Not offered on this server: ' +
          hidden.map(function (id) { return T.PROVIDERS[id].name; }).join(', ') +
          ' \u2014 their terms do not allow this kind of use.' }));
    }
    if (el.providerLicence) {
      el.providerLicence.textContent = 'Base map: ' + T.provider(D.settings.provider).name +
        (T.licenceFor(D.settings.provider) ? ' \u00b7 ' + T.licenceFor(D.settings.provider) : '');
    }
    if (el.licencePageLink) {
      const cfg = window.__HUNTMAP_SERVER__;
      el.licencePageLink.href = (cfg && cfg.licences_url) || '/licences/';
      el.licencePageLink.hidden = !cfg;
    }
  }

  /** Spots or tracks arrived from another device: redraw everything using them. */
  function onSpotsMerged() {
    if (!map) return;
    map.setWaypoints(D.waypoints);
    map.setTracks(tracksForMap());
    map.invalidate();
    renderWaypoints();
    renderTracks();
    updateWpBadge();
    updateTrackHud();
    const target = D.settings.targetId ? D.getWaypoint(D.settings.targetId) : null;
    if (target) setTarget(target);
  }

  /* ---------------------------- crosshair placement ---------------------------- */
  function togglePinMode(force) {
    S.pinMode = force == null ? !S.pinMode : !!force;
    map.pinMode = S.pinMode;
    document.body.classList.toggle('pinning', S.pinMode);
    el.btnPin.classList.toggle('on', S.pinMode);
    el.pinHud.hidden = !S.pinMode;
    if (S.pinMode) {
      setFollow(false);
      updatePinHud();
      U.toast('Drag the map to aim. Tap the map or press Drop waypoint.', 'ok', 3200);
    }
    map.invalidate();
  }

  function updatePinHud() {
    if (!S.pinMode || !el.pinCoords) return;
    const ll = map.pinLatLon();
    el.pinCoords.textContent = G.formatCoord(ll.lat, ll.lon, D.settings.coordFormat);
    const st = GPS.state;
    if (st.lat != null && !GPS.isStale(180000)) {
      const d = G.distance(st.lat, st.lon, ll.lat, ll.lon);
      const brg = G.bearing(st.lat, st.lon, ll.lat, ll.lon);
      el.pinFromYou.textContent = U.fmtDist(d) + ' \u00b7 ' + Math.round(brg) + '\u00b0 ' +
        G.compassPoint(brg) + ' of you';
    } else {
      el.pinFromYou.textContent = 'no GPS fix yet';
    }
  }

  /* Tiles refused by a provider (policy, key, quota): say so once per provider. */
  const tileWarned = {};
  function onTileError(providerId, status, blocked) {
    const key = status + (blocked ? ':blocked' : '');
    if (tileWarned[providerId] === key) return;
    tileWarned[providerId] = key;
    const name = T.provider(providerId).name;
    if (blocked) {
      U.toast(name + ' blocked this network (tile usage policy). Switch to USGS Topo or Esri in Maps, or try again later.', 'err', 8000);
    } else {
      U.toast(name + ' refused the map tiles (HTTP ' + status + '). Choose another base map in Maps.', 'err', 5200);
    }
    if (map) map.invalidate();
  }
  /* ------------------------------ waypoints UI ------------------------------ */
  function paintTypeChips(container, current, onPick) {
    container.innerHTML = '';
    D.TYPE_ORDER.forEach(function (id) {
      const info = D.TYPES[id];
      const b = U.el('button', {
        class: 'chip-btn' + (id === current ? ' on' : ''),
        type: 'button', 'data-type': id, title: info.label
      });
      const badge = U.el('span', { class: 'chip-ic', style: 'background:' + info.color });
      badge.appendChild(D.iconFor(id));
      b.appendChild(badge);
      b.appendChild(document.createTextNode(info.label));
      b.addEventListener('click', function () {
        U.$$('.chip-btn', container).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onPick(id);
      });
      container.appendChild(b);
    });
  }

  function openMarkSheet(ll, source) {
    const st = GPS.state;
    const hasFix = st.lat != null && !GPS.isStale(120000);
    let lat, lon, how;
    if (ll) {
      lat = ll.lat; lon = ll.lon;
      how = source === 'crosshair' ? 'at the crosshair' : 'at the tapped point';
    } else if (source === 'crosshair' || (S.pinMode && !hasFix)) {
      const c = map.pinLatLon();
      lat = c.lat; lon = c.lon;
      how = 'at the crosshair (map centre)';
    } else if (hasFix) {
      lat = st.lat; lon = st.lon; how = 'at your GPS position';
    } else {
      const c = map.getCenterLatLon();
      lat = c.lat; lon = c.lon; how = 'at the map centre (no GPS fix yet)';
    }
    // Say how far the pin is from you whenever it is not your own position.
    if (hasFix && (Math.abs(lat - st.lat) > 1e-9 || Math.abs(lon - st.lon) > 1e-9)) {
      const d = G.distance(st.lat, st.lon, lat, lon);
      const brg = G.bearing(st.lat, st.lon, lat, lon);
      how += ' \u00b7 ' + U.fmtDist(d) + ' ' + G.compassPoint(brg) + ' of you';
    }
    S.pendingMark = { lat: lat, lon: lon, accuracy: st.accuracy, how: how };
    S.markType = S.markType || 'stand';
    el.markCoords.textContent = G.formatAll(lat, lon) + '\n' + how;
    el.markName.value = D.suggestName(S.markType);
    el.markNotes.value = '';
    paintTypeChips(el.markTypes, S.markType, function (t) {
      S.markType = t;
      el.markName.value = D.suggestName(t);
    });
    openSheet('sheetMark');
  }

  function saveMark() {
    if (!S.pendingMark) return;
    const name = el.markName.value.trim() || D.suggestName(S.markType);
    const w = D.newWaypoint({
      name: name, type: S.markType, notes: el.markNotes.value.trim(),
      lat: S.pendingMark.lat, lon: S.pendingMark.lon,
      alt: GPS.state.lat != null && !GPS.isStale(60000) ? GPS.state.altitude : null
    });
    D.saveWaypoint(w).then(function () {
      map.setWaypoints(D.waypoints);
      renderWaypoints();
      updateWpBadge();
      closeSheets();
      U.vibrate(20);
      U.toast('Saved "' + name + '"', 'ok');
      S.pendingMark = null;
      if (S.pinMode) updatePinHud();
    });
  }

  /** Plain-language legend: every type as it is drawn, with its name. */
  function renderLegend() {
    if (!el.legendGrid) return;
    el.legendGrid.innerHTML = '';
    D.TYPE_ORDER.forEach(function (type) {
      const info = D.TYPES[type];
      const item = U.el('div', { class: 'legend-item', 'data-type': type });
      const modernPins = D.settings.pinStyle !== 'classic';
      const icon = U.el('span', { style: modernPins ? '' : 'color:' + info.color });
      icon.appendChild(modernPins ? D.badgeFor(type, 'wp-badge') : D.shapeFor(type, 'wp-shape'));
      item.appendChild(icon);
      item.appendChild(U.el('span', { text: info.label }));
      el.legendGrid.appendChild(item);
    });
  }

  /** Spots that pass the search box, nearest first. */
  function visibleWaypoints() {
    const st = GPS.state;
    const filter = (el.wpSearch.value || '').trim();
    return D.sortedWaypoints(st.lat, st.lon, filter);
  }

  function renderWpSelectBar(shown) {
    if (!el.wpSelectBar) return;
    const selecting = !!S.wpSelectMode;
    el.wpSelectBar.hidden = !selecting;
    el.btnWpSelect.classList.toggle('on', selecting);
    el.btnWpSelect.title = selecting ? 'Done selecting' : 'Select spots to delete';
    if (!selecting) return;
    const live = {};
    D.waypoints.forEach(function (w) { live[w.id] = 1; });
    S.wpSelected = S.wpSelected.filter(function (id) { return live[id]; });
    const n = S.wpSelected.length;
    el.wpSelectCount.textContent = n + ' of ' + shown.length + ' selected';
    el.btnWpSelectDelete.disabled = n === 0;
    el.btnWpSelectDelete.textContent = n ? 'Delete ' + n : 'Delete';
  }

  function setWpSelectMode(on) {
    S.wpSelectMode = !!on;
    S.wpSelected = [];
    renderWaypoints();
  }

  function toggleWpSelect(id) {
    const i = S.wpSelected.indexOf(id);
    if (i >= 0) S.wpSelected.splice(i, 1); else S.wpSelected.push(id);
    const on = S.wpSelected.indexOf(id) >= 0;
    // Update the row in place: re-rendering the list here would swallow a second
    // tap that is already on its way.
    U.$$('#wpList .item').forEach(function (row) {
      if (row.getAttribute('data-wp') !== id) return;
      row.classList.toggle('sel', on);
      const box = row.querySelector('.item-check');
      if (box) box.checked = on;
    });
    renderWpSelectBar(visibleWaypoints());
  }

  function deleteSelectedSpots() {
    const ids = S.wpSelected.slice();
    if (!ids.length) return;
    const names = ids.map(function (id) { const w = D.getWaypoint(id); return w ? w.name : ''; })
      .filter(Boolean);
    const what = names.length > 3
      ? U.escapeHtml(names.slice(0, 3).join(', ')) + ' and ' + (names.length - 3) + ' more'
      : U.escapeHtml(names.join(', ') || 'these spots');
    U.confirm('Delete ' + ids.length + ' spot' + (ids.length === 1 ? '' : 's') + '?',
      what + '<br>This cannot be undone.', 'Delete').then(function (ok) {
      if (!ok) return;
      D.deleteWaypoints(ids).then(function (n) {
        S.wpSelectMode = false;
        S.wpSelected = [];
        map.setWaypoints(D.waypoints);
        if (map.target && ids.indexOf(map.target.id) >= 0) setTarget(null);
        renderWaypoints();
        updateWpBadge();
        U.toast('Deleted ' + n + ' spot' + (n === 1 ? '' : 's'), 'ok');
      });
    });
  }

  function renderWaypoints() {
    if (!el.wpList) return;
    const st = GPS.state;
    const list = visibleWaypoints();
    const selecting = !!S.wpSelectMode;
    el.wpCount.textContent = D.waypoints.length ? '(' + D.waypoints.length + ')' : '';
    renderWpSelectBar(list);
    el.wpList.innerHTML = '';
    if (!list.length) {
      el.wpList.appendChild(U.el('div', { class: 'empty',
        text: D.waypoints.length ? 'No spots match that search.' :
          'No spots yet. Tap MARK to save a stand, blind, cabin, deer, water or kill site.' }));
      return;
    }
    list.forEach(function (w) {
      const info = D.TYPES[w.type] || D.TYPES.wp;
      const modernPins = D.settings.pinStyle !== 'classic';
      const pin = U.el('span', {
        class: 'pin-mini' + (modernPins ? ' pin-modern' : ''),
        style: modernPins ? '' : 'color:' + info.color, title: info.label });
      pin.appendChild(modernPins ? D.badgeFor(w.type, 'wp-badge') : D.shapeFor(w.type, 'wp-shape'));
      const main = U.el('div', { class: 'item-main' });
      main.appendChild(U.el('div', { class: 'item-title', text: w.name || 'Spot' }));
      const bits = [info.label, G.formatCoord(w.lat, w.lon, D.settings.coordFormat)];
      if (w.notes) bits.push(w.notes);
      main.appendChild(U.el('div', { class: 'item-sub', text: bits.join(' \u00b7 ') }));
      const right = st.lat != null
        ? U.el('div', { class: 'item-right', text: U.fmtDist(G.distance(st.lat, st.lon, w.lat, w.lon)) +
          '\n' + Math.round(G.bearing(st.lat, st.lon, w.lat, w.lon)) + '\u00b0' })
        : null;

      if (selecting) {
        // Whole row is a label, so tapping anywhere ticks the spot.
        const checked = S.wpSelected.indexOf(w.id) >= 0;
        const row = U.el('label', { class: 'item item-split' + (checked ? ' sel' : ''),
          'data-wp': w.id });
        const box = U.el('input', { class: 'item-check', type: 'checkbox' });
        box.checked = checked;
        box.addEventListener('change', function () { toggleWpSelect(w.id); });
        row.appendChild(box);
        row.appendChild(pin);
        row.appendChild(main);
        if (right) row.appendChild(right);
        el.wpList.appendChild(row);
        return;
      }

      const row = U.el('div', { class: 'item item-split' });
      const hit = U.el('button', { class: 'item-hit', type: 'button',
        title: 'Show ' + (w.name || 'this spot') + ' on the map' });
      hit.appendChild(pin);
      hit.appendChild(main);
      if (right) hit.appendChild(right);
      // Tapping the row flies the map to the spot; the Edit button opens the sheet.
      hit.addEventListener('click', function () { goToSpot(w); });
      row.appendChild(hit);
      const edit = U.el('button', { class: 'mini-btn', type: 'button', text: 'Edit' });
      edit.addEventListener('click', function () { openWptSheet(w); });
      row.appendChild(edit);
      el.wpList.appendChild(row);
    });
  }

  /** Centre the map on a spot (used by the list and by tap-to-go). */
  function goToSpot(w) {
    setFollow(false);
    map.selectedId = w.id;
    const z = Math.max(map.zoom, 16);
    map.setView(w.lat, w.lon, z);
    map.invalidate();
    closeSheets();
    const st = GPS.state;
    const d = st.lat != null ? G.distance(st.lat, st.lon, w.lat, w.lon) : null;
    U.toast((w.name || 'Spot') + (d != null ? ' \u00b7 ' + U.fmtDist(d) + ' away' : '') +
      ' \u2014 tap the pin to edit', 'ok', 2600);
  }

  function updateWpBadge() {
    const n = D.waypoints.length;
    el.wpBadge.hidden = n === 0;
    el.wpBadge.textContent = n > 99 ? '99+' : String(n);
  }

  function openWptSheet(w) {
    S.editingWp = w;
    S.wptType = w.type;
    map.selectedId = w.id;
    map.invalidate();
    const info = D.TYPES[w.type] || D.TYPES.wp;
    el.wptTitle.innerHTML = '';
    const badge = U.el('span', { class: 'title-ic shape-ic', style: 'color:' + info.color });
    badge.appendChild(D.shapeFor(w.type, 'wp-shape'));
    el.wptTitle.appendChild(badge);
    el.wptTitle.appendChild(document.createTextNode(w.name || 'Spot'));
    el.wptName.value = w.name || '';
    el.wptNotes.value = w.notes || '';
    el.wptCoords.textContent = G.formatAll(w.lat, w.lon);
    paintTypeChips(el.wptTypes, S.wptType, function (t) { S.wptType = t; });
    openSheet('sheetWpt');
  }

  function saveWptEdits() {
    const w = S.editingWp;
    if (!w) return;
    w.name = el.wptName.value.trim() || w.name || 'Spot';
    w.type = S.wptType || w.type;
    w.notes = el.wptNotes.value.trim();
    D.saveWaypoint(w).then(function () {
      map.setWaypoints(D.waypoints);
      renderWaypoints();
      if (map.target && map.target.id === w.id) setTarget(w);
      closeSheets();
      U.toast('Saved', 'ok');
    });
  }

  function deleteWpt() {
    const w = S.editingWp;
    if (!w) return;
    U.confirm('Delete spot?', 'Delete <b>' + U.escapeHtml(w.name) + '</b>? This cannot be undone.', 'Delete')
      .then(function (ok) {
        if (!ok) return;
        D.deleteWaypoint(w.id).then(function () {
          map.setWaypoints(D.waypoints);
          if (map.target && map.target.id === w.id) setTarget(null);
          renderWaypoints();
          updateWpBadge();
          closeSheets();
          U.toast('Deleted', 'ok');
        });
      });
  }

  function shareWpt(w) {
    if (!w) return;
    const lines = [
      w.name,
      G.fmtDD(w.lat, w.lon, 6),
      G.fmtDMS(w.lat, w.lon),
      G.fmtUTM(w.lat, w.lon),
      G.googleMapsUrl(w.lat, w.lon)
    ];
    const text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ title: w.name, text: text }).catch(function () {});
      return;
    }
    U.copy(text).then(function (ok) {
      U.toast(ok ? 'Coordinates copied' : 'Copy not available', ok ? 'ok' : 'err');
    });
  }
  /* ------------------------------- tracks UI ------------------------------- */
  function renderTracks() {
    if (!el.trackList) return;
    el.trackList.innerHTML = '';
    el.btnTrackToggle.innerHTML = '<svg class="i"><use href="#i-' + (D.activeTrack ? 'stop' : 'record') + '"/></svg> ' +
      (D.activeTrack ? 'Stop recording' : 'Start recording');
    el.btnTrackToggle.classList.toggle('danger', !!D.activeTrack);
    if (!D.tracks.length) {
      el.trackList.appendChild(U.el('div', { class: 'empty',
        text: 'No tracks yet. Press Record before you walk in, and keep the app open.' }));
      return;
    }
    D.tracks.forEach(function (t) {
      const stats = D.trackStats(t);
      const row = U.el('div', { class: 'item' });
      row.appendChild(U.el('span', { class: 'pin-mini', style: 'background:' + (t.color || '#53c2d6'), text: 'TR' }));
      const main = U.el('div', { class: 'item-main' });
      main.appendChild(U.el('div', { class: 'item-title', text: t.name + (t.active ? ' \u00b7 recording' : '') }));
      main.appendChild(U.el('div', { class: 'item-sub',
        text: U.fmtDate(stats.start) + ' \u00b7 ' + U.fmtDuration(stats.duration) + ' \u00b7 ' +
          stats.points + ' pts' + (stats.gain > 3 ? ' \u00b7 +' + U.fmtElev(stats.gain) : '') }));
      row.appendChild(main);
      row.appendChild(U.el('div', { class: 'item-right',
        text: U.fmtDist(stats.distance) + '\n' + U.fmtSpeed(stats.avgSpeed) }));
      const del = U.el('button', { class: 'icon-btn small', type: 'button', title: 'Delete track' });
      del.innerHTML = '<svg class="i"><use href="#i-trash"/></svg>';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        U.confirm('Delete track?', 'Delete <b>' + U.escapeHtml(t.name) + '</b>?', 'Delete').then(function (ok) {
          if (!ok) return;
          D.deleteTrack(t.id).then(function () {
            map.setTracks(tracksForMap());
            renderTracks();
            updateTrackHud();
          });
        });
      });
      row.appendChild(del);
      row.addEventListener('click', function () {
        const b = trackBounds(t);
        if (b) map.fitBounds(b, 60);
        S.defaultView = false;
        closeSheets();
        U.toast(U.fmtDist(stats.distance) + ' \u00b7 ' + U.fmtDuration(stats.duration), 'ok', 2600);
      });
      el.trackList.appendChild(row);
    });
  }

  function trackBounds(trk) {
    if (!trk.points || !trk.points.length) return null;
    let north = -90, south = 90, east = -180, west = 180;
    trk.points.forEach(function (p) {
      north = Math.max(north, p.lat); south = Math.min(south, p.lat);
      east = Math.max(east, p.lon); west = Math.min(west, p.lon);
    });
    return { north: north, south: south, east: east, west: west };
  }

  /* ------------------------------- layers UI ------------------------------- */
  function renderProviders() {
    if (!el.providerList) return;
    el.providerList.innerHTML = '';
    T.visibleIds().forEach(function (id) {
      const p = T.PROVIDERS[id];
      const label = U.el('label', { class: 'prov' });
      const radio = U.el('input', { type: 'radio', name: 'provider', value: id });
      radio.checked = D.settings.provider === id;
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        D.settings.provider = id;
        D.settings.tiles = true;
        el.toggleTiles.checked = true;
        map.provider = id;
        map.tilesEnabled = true;
        T.lastError = null;
        T.clearBlock();
        tileWarned[id] = null;
        map.invalidate();
        D.saveSettings();
        refreshTileStats();
        U.toast(p.url ? 'Base map: ' + p.name : 'Base map off', 'ok', 1800);
      });
      label.appendChild(radio);
      const main = U.el('div', { class: 'prov-main' });
      main.appendChild(U.el('div', { text: p.name }));
      if (p.sub) main.appendChild(U.el('div', { class: 'prov-sub', text: p.sub }));
      if (p.licence) main.appendChild(U.el('div', { class: 'prov-sub', text: p.licence }));
      label.appendChild(main);
      el.providerList.appendChild(label);
    });
    if (el.providerNote) {
      const hidden = Object.keys(T.PROVIDERS).filter(function (id) {
        return T.visibleIds().indexOf(id) < 0;
      }).length;
      el.providerNote.hidden = !T.COMMERCIAL;
      el.providerNote.textContent = T.COMMERCIAL
        ? 'This server runs in commercial mode, so ' + hidden + ' base map' +
          (hidden === 1 ? '' : 's') + ' that may not be used in a paid service (Esri, the ' +
          'community OSM/OpenTopoMap tile servers) are hidden. See Licences for details.'
        : '';
    }
    if (el.providerLicence) {
      const cur = T.provider(D.settings.provider);
      el.providerLicence.textContent = 'Base map: ' + cur.name +
        (T.licenceFor(D.settings.provider) ? ' \u00b7 ' + T.licenceFor(D.settings.provider) : '');
    }
  }
  function renderOverlays() {
    if (!el.overlayList) return;
    el.overlayList.innerHTML = '';
    if (!D.layers.length) {
      el.overlayList.appendChild(U.el('div', { class: 'empty',
        text: 'No PDF or image maps yet. Add a topo, aerial photo or your club map.' }));
      el.btnRecalibrate.disabled = true;
      return;
    }
    el.btnRecalibrate.disabled = false;
    D.layers.forEach(function (layer) {
      const row = U.el('div', { class: 'item' });
      const eye = U.el('button', { class: 'icon-btn small', type: 'button', title: 'Show / hide' });
      eye.innerHTML = '<svg class="i"><use href="#' + (layer.visible ? 'i-eye' : 'i-eye-off') + '"/></svg>';
      eye.addEventListener('click', function (ev) {
        ev.stopPropagation();
        layer.visible = !layer.visible;
        D.saveLayer(layer);
        map.setOverlays(D.layers);
        renderOverlays();
      });
      row.appendChild(eye);
      const main = U.el('div', { class: 'item-main' });
      main.appendChild(U.el('div', { class: 'item-title', text: layer.name }));
      const placeBits = [layer.state, layer.county, layer.city].filter(Boolean).join(' \u00b7 ');
      main.appendChild(U.el('div', { class: 'item-sub',
        text: (placeBits ? placeBits + ' \u00b7 ' : '') +
          (layer.kind === 'pdf' ? 'PDF' : 'Image') + (layer.page ? ' p' + layer.page : '') +
          ' \u00b7 ' + Math.round((layer.opacity == null ? 0.92 : layer.opacity) * 100) + '% \u00b7 ' +
          (layer.calib ? 'georeferenced' : 'needs calibration') }));
      row.appendChild(main);
      const edit = U.el('button', { class: 'mini-btn', type: 'button', text: 'Edit',
        title: 'Name, state, county, town' });
      edit.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openLayerMeta(layer);
      });
      row.appendChild(edit);
      const del = U.el('button', { class: 'icon-btn small', type: 'button', title: 'Remove map' });
      del.innerHTML = '<svg class="i"><use href="#i-trash"/></svg>';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        U.confirm('Remove map?', 'Remove <b>' + U.escapeHtml(layer.name) + '</b> from this device?', 'Remove')
          .then(function (ok) {
            if (!ok) return;
            D.deleteLayer(layer.id);
            map.setOverlays(D.layers);
            renderOverlays();
          });
      });
      row.appendChild(del);
      row.addEventListener('click', function () {
        D.settings.selectedLayerId = layer.id;
        D.saveSettings();
        if (layer.calib && layer.img) {
          const b = PM.bounds(layer);
          if (b) map.fitBounds(b, 30);
          closeSheets();
        } else {
          U.toast('Use "Recalibrate selected" to place this map', 'ok');
        }
      });
      const slider = U.el('input', { type: 'range', min: '20', max: '100',
        value: String(Math.round((layer.opacity == null ? 0.92 : layer.opacity) * 100)) });
      slider.style.margin = '6px 0 10px';
      slider.addEventListener('input', function () {
        layer.opacity = parseInt(slider.value, 10) / 100;
        map.setOverlays(D.layers);
      });
      slider.addEventListener('change', function () { D.saveLayer(layer); });
      const wrap = U.el('div');
      wrap.appendChild(row);
      wrap.appendChild(slider);
      el.overlayList.appendChild(wrap);
    });
  }

  /* ---------------------------- offline tiles ---------------------------- */
  function refreshTileStats() {
    T.cachedCount().then(function (n) {
      el.dlStats.textContent = n + ' tiles cached on this device' +
        (n === 0 ? ' \u2014 download some before you lose signal.' : '.');
    });
  }

  function estimateTiles() {
    const b = map.visibleBounds();
    const zmin = U.clamp(parseInt(el.dlZoomMin.value, 10) || 12, 2, 19);
    const zmax = U.clamp(parseInt(el.dlZoomMax.value, 10) || 15, zmin, 19);
    const est = T.estimate(b, zmin, zmax);
    const limit = T.maxDownloadFor(D.settings.provider);
    const osmNote = (D.settings.provider === 'osm' || D.settings.provider === 'topo')
      ? ' \u00b7 OpenStreetMap blocks bulk downloads, keep it small' : '';
    el.dlEstimate.textContent = est.count + ' tiles \u2248 ' + est.approxMB.toFixed(1) + ' MB' +
      (est.count > limit
        ? ' \u2014 over the ' + limit + ' tile limit, lower the zoom range' : osmNote);
    return { bounds: b, zmin: zmin, zmax: zmax, est: est, limit: limit };
  }
  function downloadTiles() {
    if (S.downloading) return;
    const info = estimateTiles();
    if (!info.est.count) { U.toast('Nothing to download in this view', 'err'); return; }
    if (info.est.count > info.limit) {
      U.toast('Too many tiles \u2014 shrink the view or lower the zoom range', 'err');
      return;
    }
    const prov = T.provider(D.settings.provider);
    if (!prov.url) { U.toast('Choose a base map first', 'err'); return; }
    U.confirm('Download ' + info.est.count + ' tiles?',
      'Roughly ' + info.est.approxMB.toFixed(1) + ' MB from ' + U.escapeHtml(prov.name) +
      '. Keep offline downloads small and respect the provider\'s tile usage policy.', 'Download')
      .then(function (ok) {
        if (!ok) return;
        S.downloading = true;
        el.btnDlStart.disabled = true;
        el.btnDlCancel.hidden = false;
        el.dlProgressWrap.hidden = false;
        el.dlBar.style.width = '0%';
        T.download({
          provider: D.settings.provider,
          bounds: info.bounds,
          minZoom: info.zmin,
          maxZoom: info.zmax,
          onProgress: function (p) {
            el.dlBar.style.width = (p.total ? (p.done / p.total) * 100 : 0).toFixed(1) + '%';
            el.dlStatus.textContent = p.done + ' / ' + p.total + ' tiles' +
              (p.failed ? ' \u00b7 ' + p.failed + ' failed' : '') +
              (p.cached ? ' \u00b7 ' + p.cached + ' already saved' : '');
          }
        }).then(function (res) {
          S.downloading = false;
          el.btnDlStart.disabled = false;
          el.btnDlCancel.hidden = true;
          if (res.blocked) {
            el.dlStatus.textContent = 'Stopped after ' + res.done + ' of ' + res.total +
              ' tiles: the provider blocked this network. Switch to USGS Topo or Esri.';
            U.toast('Provider blocked the download \u2014 switch base map', 'err', 7000);
          } else {
            el.dlStatus.textContent = res.cancelled
              ? 'Stopped after ' + res.done + ' of ' + res.total + ' tiles.'
              : 'Done: ' + res.done + ' tiles saved' + (res.failed ? ', ' + res.failed + ' failed' : '') + '.';
            U.toast(res.cancelled ? 'Download stopped' : 'Offline tiles saved', res.cancelled ? '' : 'ok');
          }
          refreshTileStats();
          map.invalidate();
        }).catch(function (e) {
          S.downloading = false;
          el.btnDlStart.disabled = false;
          el.btnDlCancel.hidden = true;
          el.dlStatus.textContent = 'Download failed: ' + (e.message || e);
          U.toast('Download failed', 'err');
        });
      });
  }

  /* ------------------------- add PDF / image map ------------------------- */
  function openAddMap() {
    S.pending = null;
    el.mapFileName.textContent = 'No file chosen';
    el.mapPageRow.hidden = true;
    el.mapCalibStep.hidden = true;
    el.mapRotateRow.hidden = true;
    el.mapRotValue.textContent = '0\u00b0';
    el.calibRot.value = '0';
    el.calibRotVal.textContent = '0.0\u00b0';
    el.mapStatus.textContent = '';
    el.mapProgressWrap.hidden = true;
    el.btnMapRender.disabled = true;
    el.fileMap.value = '';
    el.mapName.value = '';
    el.mapState.value = '';
    el.mapCounty.value = '';
    el.mapCity.value = '';
    el.mapUploadChk.checked = false;
    const sync = H.Sync;
    const signedIn = !!(sync && sync.state.enabled && sync.state.user);
    el.mapUploadChk.checked = signedIn;      // signed in: keep a copy on the server by default
    el.mapUploadBox.hidden = !signedIn;
    if (signedIn) {
      el.mapUploadNote.textContent = 'Signed in as ' + sync.state.user +
        '. The original file is uploaded so your other devices can download it from From your PC.';
    }
    openSheet('sheetAddMap');
  }

  function pickMapFile(file) {
    if (!file) return;
    S.pending = { file: file, kind: /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? 'pdf' : 'image' };
    el.mapFileName.textContent = file.name + ' \u00b7 ' + Math.max(1, Math.round(file.size / 1024)) + ' KB';
    el.btnMapRender.disabled = true;
    el.mapCalibStep.hidden = true;
    el.mapStatus.textContent = '';
    if (S.pending.kind === 'pdf') {
      if (!PM.available()) {
        el.mapStatus.textContent = 'PDF engine did not load. Check vendor/pdfjs/ or reload.';
        return;
      }
      el.mapStatus.textContent = 'Reading PDF\u2026';
      PM.open(file).then(function (res) {
        if (!S.pending || S.pending.file !== file) return;
        S.pending.doc = res.doc;
        S.pending.pageCount = res.pageCount;
        el.mapPageRow.hidden = false;
        el.mapPage.value = '1';
        el.mapPage.max = String(res.pageCount);
        el.mapPageCount.textContent = 'of ' + res.pageCount;
        el.mapStatus.textContent = 'PDF ready \u2014 pick a page and press Load map.';
        el.btnMapRender.disabled = false;
      }).catch(function (e) {
        el.mapStatus.textContent = 'Could not open PDF: ' + (e.message || e);
      });
    } else {
      const isTiff = PM.isTiff(file);
      if (isTiff && !PM.tiffAvailable()) {
        el.mapStatus.textContent = 'TIFF decoder missing (vendor/utif/UTIF.js). ' +
          'Try loading anyway, or convert the file to PNG/JPEG.';
      } else {
        el.mapStatus.textContent = (isTiff ? 'TIFF ready' : 'Image ready') + ' \u2014 press Load map.';
      }
      el.btnMapRender.disabled = false;
    }
  }

  function renderMapPage() {
    const p = S.pending;
    if (!p) return;
    if (p.kind === 'pdf' && !p.doc) {
      el.mapStatus.textContent = 'The PDF is still loading \u2014 try again in a moment.';
      return;
    }
    const quality = parseInt(el.mapQuality.value, 10) || 3000;
    el.btnMapRender.disabled = true;
    el.mapProgressWrap.hidden = false;
    el.mapBar.style.width = '15%';
    el.mapStatus.textContent = 'Preparing image\u2026';
    let job;
    try {
      job = p.kind === 'pdf'
        ? PM.renderPage(p.doc, U.clamp(parseInt(el.mapPage.value, 10) || 1, 1, p.pageCount || 1), quality)
        : PM.imageFromFile(p.file, quality);
    } catch (e) {
      el.mapProgressWrap.hidden = true;
      el.btnMapRender.disabled = false;
      el.mapStatus.textContent = 'Failed: ' + (e.message || e);
      return;
    }
    job.then(function (res) {
      el.mapBar.style.width = '60%';
      p.blob = res.blob;
      p.width = res.width;
      p.height = res.height;
      p.pageWidthPt = res.pageWidthPt;
      p.baseBlob = res.blob;
      p.baseWidth = res.width;
      p.baseHeight = res.height;
      p.rotation = 0;
      const layer = D.newLayer({
        name: (el.mapName.value || '').trim() ||
          (p.file.name || 'Map').replace(/\.(pdf|jpe?g|png|heic|tiff?)$/i, ''),
        kind: p.kind,
        page: p.kind === 'pdf' ? parseInt(el.mapPage.value, 10) || 1 : 1,
        imgW: res.width, imgH: res.height
      });
      layer.state = (el.mapState.value || '').trim();
      layer.county = (el.mapCounty.value || '').trim();
      layer.city = (el.mapCity.value || '').trim();
      p.uploadRequested = !el.mapUploadBox.hidden && el.mapUploadChk.checked;
      return DB.blobSet('mapimg:' + layer.id, res.blob).then(function () { return layer; });
    }).then(function (layer) {
      p.layer = layer;
      return PM.decodeImage(p.blob).then(function (d) {
        layer.img = d.img;
        URL.revokeObjectURL(d.url);
        return layer;
      });
    }).then(function (layer) {
      el.mapBar.style.width = '100%';
      el.mapProgressWrap.hidden = true;
      el.btnMapRender.disabled = false;
      el.mapStatus.textContent = 'Map image ready (' + layer.imgW + ' \u00d7 ' + layer.imgH + ' px).';
      el.mapCalibStep.hidden = false;
      el.mapRotateRow.hidden = false;
      el.mapRotValue.textContent = (p.rotation || 0) + '\u00b0';
      el.calibInfo.textContent = '';
      S.pending = p;
    }).catch(function (e) {
      el.mapProgressWrap.hidden = true;
      el.btnMapRender.disabled = false;
      let msg = (e && e.message) || String(e);
      if (p && PM.isTiff(p.file) && !PM.tiffAvailable()) {
        msg += ' \u2014 the TIFF decoder is not loaded, convert the file to PNG/JPEG.';
      }
      el.mapStatus.textContent = 'Failed: ' + msg;
    });
  }
  /**
   * Rotate the pending map image (90/180/270) before georeferencing.
   * Always rotates from the untouched base render, so repeated clicks
   * never lose quality, and re-stores the layer image + dimensions.
   */
  function setPendingRotation(delta) {
    const p = S.pending;
    if (!p || !p.layer || !p.baseBlob) { U.toast('Load a map image first', 'err'); return; }
    if (S.calibrating) { U.toast('Finish the alignment first', 'err'); return; }
    p.rotation = ((p.rotation || 0) + delta + 360) % 360;
    el.mapRotValue.textContent = p.rotation + '\u00b0';
    el.btnMapRender.disabled = true;
    el.mapStatus.textContent = 'Rotating map\u2026';
    PM.rotateBlob(p.baseBlob, p.rotation).then(function (res) {
      p.blob = res.blob;
      p.width = res.width;
      p.height = res.height;
      const layer = p.layer;
      layer.imgW = res.width;
      layer.imgH = res.height;
      return DB.blobSet('mapimg:' + layer.id, res.blob).then(function () {
        return PM.decodeImage(res.blob);
      }).then(function (d) {
        layer.img = d.img;
        URL.revokeObjectURL(d.url);
        if (D.layers.indexOf(layer) >= 0) {
          D.saveLayer(layer);
          map.setOverlays(D.layers);
        }
        // Existing control points belong to the old orientation.
        if (S.calibPts.length) {
          S.calibPts = [];
          if (S.sheet === 'sheetCalibPoints') { drawCalibCanvas(); updateCalibPtsUI(); }
        }
        el.mapStatus.textContent = 'Image rotated ' + p.rotation + '\u00b0 \u00b7 ' +
          res.width + ' \u00d7 ' + res.height + ' px.';
        el.btnMapRender.disabled = false;
      });
    }).catch(function (e) {
      el.mapStatus.textContent = 'Rotate failed: ' + ((e && e.message) || e);
      el.btnMapRender.disabled = false;
    });
  }

  function updateCalibReadout(skip) {
    const layer = map && map.calibrateLayer;
    if (!layer || !layer.calib) return;
    if (!(S.calibS0 > 0)) S.calibS0 = layer.calib.s;

    // Size slider: a log scale from 0.2x to 5x, relative to the size it had
    // when the sheet opened. Pinching past the ends rebases so it stays useful.
    let factor = layer.calib.s / S.calibS0;
    if (factor < CALIB_SCALE_MIN || factor > CALIB_SCALE_MAX) {
      S.calibS0 = layer.calib.s;
      factor = 1;
    }
    if (skip !== 'scale' && el.calibScale) {
      el.calibScale.value = String(scaleFactorToSlider(factor));
    }
    if (el.calibScaleVal) el.calibScaleVal.textContent = '\u00d7' + factor.toFixed(2);

    let deg = layer.calib.theta * 180 / Math.PI;
    deg = ((deg + 540) % 360) - 180;
    if (skip !== 'rotate' && el.calibRotate) {
      el.calibRotate.value = String(Math.round(deg * 10) / 10);
    }
    if (el.calibRotateVal) el.calibRotateVal.textContent = deg.toFixed(1) + '\u00b0';

    const op = Math.round((layer.opacity == null ? 0.92 : layer.opacity) * 100);
    if (el.calibOpacity) el.calibOpacity.value = String(op);
    if (el.calibOpacityVal) el.calibOpacityVal.textContent = op + '%';
    updateCalibMeta();
  }

  function updateCalibMeta() {
    const layer = map && map.calibrateLayer;
    if (!layer || !layer.calib || !layer.img || !el.calibMeta) return;
    const mpp = PM.metersPerPixel(layer.calib);
    const width = layer.img.width * mpp;
    const perPx = U.isMetric()
      ? mpp.toFixed(mpp < 10 ? 2 : 1) + ' m/px'
      : (mpp / 0.3048).toFixed(1) + ' ft/px';
    el.calibMeta.textContent = U.fmtDistShort(width) + ' wide \u00b7 ' + perPx;
  }

  /* --------------------------- calibration: drag --------------------------- */
  const CALIB_SCALE_MIN = 0.2, CALIB_SCALE_MAX = 5;

  /** Slider position (0..1000) → size multiplier, logarithmic so small
   *  corrections near 1x are as easy as big changes. */
  function sliderToScaleFactor(v) {
    const t = U.clamp(v / 1000, 0, 1);
    const lo = Math.log(CALIB_SCALE_MIN), hi = Math.log(CALIB_SCALE_MAX);
    return Math.exp(lo + t * (hi - lo));
  }
  function scaleFactorToSlider(f) {
    const lo = Math.log(CALIB_SCALE_MIN), hi = Math.log(CALIB_SCALE_MAX);
    const t = (Math.log(U.clamp(f, CALIB_SCALE_MIN, CALIB_SCALE_MAX)) - lo) / (hi - lo);
    return Math.round(t * 1000);
  }

  function calibrateLayerOnMap(layer, isNew) {
    const paperScale = parseInt(el.mapScale.value, 10) || 0;
    const c = map.getCenterLatLon();
    if (!layer.calib) {
      layer.calib = PM.guessCalib(layer, c.lat, c.lon, paperScale, S.pending ? S.pending.pageWidthPt : 0);
    }
    if (!layer.calib) { U.toast('Map image is not ready', 'err'); return; }
    S.preCalib = { cx: layer.calib.cx, cy: layer.calib.cy, s: layer.calib.s, theta: layer.calib.theta };
    S.calibIsNew = !!isNew;
    S.calibS0 = layer.calib.s;
    layer.visible = true;
    layer.opacity = 0.72;
    if (D.layers.indexOf(layer) < 0) D.layers.push(layer);
    map.setOverlays(D.layers);
    map.calibrateLayer = layer;
    S.calibrating = true;
    el.calibHud.hidden = false;
    document.body.classList.add('calibrating');
    liftToastsAboveHud();
    closeSheets();
    const b = PM.bounds(layer);
    if (b && isNew) map.fitBounds(b, 40);
    updateCalibReadout();
  }

  /** Keep toasts above the align bar instead of covering its controls. */
  function liftToastsAboveHud() {
    const h = el.calibHud ? el.calibHud.offsetHeight : 0;
    document.documentElement.style.setProperty('--toast-lift', (h ? h + 10 : 0) + 'px');
  }

  function calibNudge(fn) {
    const layer = map.calibrateLayer;
    if (!layer || !layer.calib) return;
    fn(layer.calib);
    updateCalibReadout();
    map.invalidate();
  }

  function finishCalibration(save) {
    const layer = map.calibrateLayer;
    map.calibrateLayer = null;
    S.calibrating = false;
    el.calibHud.hidden = true;
    document.body.classList.remove('calibrating');
    document.documentElement.style.setProperty('--toast-lift', '0px');
    if (!layer) return;
    if (!save) {
      if (S.calibIsNew) {
        D.deleteLayer(layer.id);
        map.setOverlays(D.layers);
      } else if (S.preCalib) {
        layer.calib = S.preCalib;
        map.setOverlays(D.layers);
      }
      renderOverlays();
      U.toast('Calibration cancelled', '', 1800);
      return;
    }
    layer.opacity = 0.92;
    D.saveLayer(layer).then(function () {
      map.setOverlays(D.layers);
      renderOverlays();
      el.calibInfo.textContent = PM.describe(layer);
      U.toast('Map georeferenced', 'ok', 2600);
      S.pending = null;
      if (H.Sync) H.Sync.pushCalibration(layer);
    });
  }

  /* ---------------------- calibration: two control points ---------------------- */
  function openControlPoints(layer) {
    S.calibLayer = layer;
    S.calibPts = [];
    el.calibPtHint.textContent = 'Tap point 1 on the image below.';
    el.calibPts.innerHTML = '';
    el.btnCalibApply.disabled = true;
    openSheet('sheetCalibPoints');
    setTimeout(drawCalibCanvas, 340);
  }

  function drawCalibCanvas() {
    const layer = S.calibLayer;
    if (!layer || !layer.img || !el.calibCanvas) return;
    const img = layer.img;
    const canvas = el.calibCanvas;
    const maxW = (canvas.parentElement && canvas.parentElement.clientWidth) || 320;
    const maxH = Math.min(window.innerHeight * 0.4, 380);
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = Math.max(40, Math.round(img.width * scale));
    const h = Math.max(40, Math.round(img.height * scale));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    S.calibView = { scale: scale, w: w, h: h };

    S.calibPts.forEach(function (p, i) {
      const x = p.u * scale, y = p.v * scale;
      ctx.save();
      ctx.strokeStyle = '#e2801f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y);
      ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 15);
      ctx.stroke();
      ctx.fillStyle = '#e2801f';
      ctx.beginPath();
      ctx.arc(x + 16, y - 16, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10140c';
      ctx.font = '800 11px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x + 16, y - 15.5);
      ctx.restore();
    });
  }
  function calibTap(ev) {
    if (!S.calibView || !S.calibLayer) return;
    if (S.calibPts.length >= 2) { U.toast('Both points are set \u2014 press Reset to redo', '', 2000); return; }
    const r = el.calibCanvas.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    const u = x / S.calibView.scale, v = y / S.calibView.scale;
    const n = S.calibPts.length + 1;
    U.prompt('Point ' + n + ' coordinates', {
      label: 'Lat, lon or UTM',
      placeholder: '44.1234, -71.5678',
      hint: 'Also accepts 44 07 24 N 71 33 12 W or 19T 294554 4888785.',
      validate: function (val) { return G.parseLatLon(val) ? null : 'Could not read those coordinates.'; }
    }).then(function (val) {
      if (!val) return;
      const ll = G.parseLatLon(val);
      if (!ll) return;
      S.calibPts.push({ u: u, v: v, lat: ll.lat, lon: ll.lon, text: val });
      drawCalibCanvas();
      updateCalibPtsUI();
    });
  }

  function updateCalibPtsUI() {
    const pts = S.calibPts;
    el.calibPts.innerHTML = '';
    pts.forEach(function (p, i) {
      const row = U.el('div', { class: 'calib-pt' });
      row.appendChild(U.el('span', { class: 'num', text: String(i + 1) }));
      const txt = U.el('div', { class: 'txt' });
      txt.appendChild(U.el('b', { text: G.fmtDD(p.lat, p.lon, 6) }));
      txt.appendChild(U.el('span', { text: 'px ' + Math.round(p.u) + ', ' + Math.round(p.v) +
        ' \u00b7 ' + G.fmtUTM(p.lat, p.lon) }));
      row.appendChild(txt);
      el.calibPts.appendChild(row);
    });
    if (pts.length === 2) {
      const d = G.distance(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon);
      el.calibPtHint.textContent = 'Points are ' + U.fmtDist(d) + ' apart \u2014 press Apply.';
      el.btnCalibApply.disabled = false;
    } else {
      el.calibPtHint.textContent = 'Tap point ' + (pts.length + 1) + ' on the image below.';
      el.btnCalibApply.disabled = true;
    }
  }

  function applyControlPoints() {
    const layer = S.calibLayer;
    if (!layer || !layer.img || S.calibPts.length < 2) return;
    const fineDeg = parseFloat(el.calibRot.value) || 0;
    const calib = PM.calibrate2Points(layer.img.width, layer.img.height,
      S.calibPts[0], S.calibPts[1], {
        northUp: !!(el.calibNorthUp && el.calibNorthUp.checked),
        rotation: fineDeg * Math.PI / 180
      });
    if (!calib) { U.toast('Those points are too close together \u2014 pick points further apart', 'err'); return; }
    layer.calib = calib;
    layer.visible = true;
    layer.opacity = 0.92;
    if (D.layers.indexOf(layer) < 0) D.layers.push(layer);
    D.saveLayer(layer).then(function () {
      map.setOverlays(D.layers);
      const b = PM.bounds(layer);
      if (b) map.fitBounds(b, 30);
      closeSheets();
      renderOverlays();
      const p = S.pending;
      S.pending = null;
      if (H.Sync) {
        if (p && p.uploadRequested) {
          // The user asked to keep a copy on the server: upload the original file
          // first, then share the georeference, so other devices get both.
          H.Sync.upload(p.file, {
            name: layer.name,
            page: layer.page,
            state: layer.state,
            county: layer.county,
            city: layer.city
          }).then(function (json) {
            layer.remoteId = json.id;
            layer.remoteUpdated = json.updated;
            layer.remoteSha = json.sha256 || '';
            layer.state = json.state || layer.state;
            layer.county = json.county || layer.county;
            layer.city = json.city || layer.city;
            return D.saveLayer(layer);
          }).then(function () {
            U.toast('Copied to your library on the PC', 'ok', 2600);
            H.Sync.pushCalibration(layer);
            H.Sync.probe();
          }).catch(function (err) {
            U.toast(err && err.status === 401 || err && err.status === 403
              ? 'Sign in (Tools \u2192 Account) to upload to your library'
              : 'Upload to the library failed: ' + ((err && err.message) || err), 'err', 4200);
          });
        } else {
          H.Sync.pushCalibration(layer);
        }
      }
      U.toast('Map georeferenced \u00b7 ' + U.fmtDist(PM.metersPerPixel(layer.calib) * 1000) + '/1000 px', 'ok', 3200);
    });
  }
  /* ------------------------------- sun & moon ------------------------------- */
  function renderSun() {
    const st = GPS.state;
    const here = (st.lat != null && !GPS.isStale(300000)) ? { lat: st.lat, lon: st.lon } : map.getCenterLatLon();
    const now = new Date();
    const solar = Sun.solar(now, here.lat, here.lon);
    const moon = Sun.moon(now);
    const light = Sun.huntingLight(now, solar);
    const rows = [];

    rows.push('<div class="sun-hero"><span class="big">' + sunIcon(light.state) + '</span><div>' +
      '<div style="font-weight:700">' + U.fmtTime(now) + ' \u00b7 ' + U.escapeHtml(light.text) + '</div>' +
      '<div class="small muted">' + U.fmtDate(now) + ' \u00b7 ' + G.fmtDD(here.lat, here.lon, 4) + '</div></div></div>');

    if (solar && !solar.polar) {
      rows.push('<div class="sun-grid">' +
        sunCell('First light', U.fmtTime(solar.dawn)) +
        sunCell('Sunrise', U.fmtTime(solar.sunrise)) +
        sunCell('Solar noon', U.fmtTime(solar.solarNoon)) +
        sunCell('Sunset', U.fmtTime(solar.sunset)) +
        sunCell('Last light', U.fmtTime(solar.dusk)) +
        sunCell('Day length', U.fmtDuration(solar.dayLength)) + '</div>');
      rows.push(dayBar(solar, now));
      rows.push('<div class="legal-light">Legal shooting light is commonly 30 minutes before sunrise to ' +
        '30 minutes after sunset \u2014 check your regulations. Today that is about <b>' +
        U.fmtTime(new Date(solar.sunrise.getTime() - 1800000)) + '</b> to <b>' +
        U.fmtTime(new Date(solar.sunset.getTime() + 1800000)) + '</b>.</div>');
    } else if (solar) {
      rows.push('<div class="sun-grid">' + sunCell('Solar noon', U.fmtTime(solar.solarNoon)) +
        sunCell('Sun', solar.polar === 'day' ? 'Up all day' : 'Down all day') + '</div>');
    } else {
      rows.push('<p class="muted small">No sun data for this position.</p>');
    }

    rows.push('<h3 class="group-title">Moon</h3>');
    rows.push('<div class="moon-row"><div class="moon-disc">' + moonDisc(moon) + '</div><div>' +
      '<div style="font-weight:600">' + moon.name + ' \u00b7 ' +
      Math.round(moon.illumination * 100) + '% lit</div>' +
      '<div class="small muted">' + (moon.waxing ? 'Waxing' : 'Waning') + ' \u00b7 ' +
      moon.age.toFixed(1) + ' days into the cycle</div></div></div>');
    rows.push('<p class="note small">Bright moon = more night movement and a slower morning. ' +
      'Overcast, windy or wet evenings often beat clear calm ones.</p>');

    el.sunBody.innerHTML = rows.join('');
  }

  function sunCell(k, v) {
    return '<div class="sun-cell"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }
  function sunIcon(state) {
    return state === 'day' ? '\u2600\ufe0f' : state === 'twilight' ? '\ud83c\udf05' : '\ud83c\udf19';
  }
  function moonDisc(moon) {
    const p = moon.phase;
    let left = 0, width = 50;
    if (p < 0.5) width = p * 100;
    else { left = 100 - (1 - p) * 100; width = (1 - p) * 100; }
    return '<div class="lit" style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"></div>';
  }
  function dayBar(solar, now) {
    const t0 = solar.dawn.getTime(), t1 = solar.dusk.getTime();
    const pct = U.clamp(((now.getTime() - t0) / Math.max(1, t1 - t0)) * 100, 0, 100);
    return '<div class="daybar"><div class="now" style="left:' + pct.toFixed(1) + '%"></div></div>' +
      '<div class="daybar-labels"><span>' + U.fmtTime(solar.dawn) + '</span><span>' +
      U.fmtTime(solar.solarNoon) + '</span><span>' + U.fmtTime(solar.dusk) + '</span></div>';
  }
  /* -------------------------------- compass -------------------------------- */
  function openCompass() {
    if (GPS.state.lat == null) GPS.start();
    if (!GPS.compass.enabled) {
      el.compassMsg.textContent = 'Tap "Enable compass" for the magnetometer. ' +
        'Without it the needle follows your GPS course while you walk.';
    }
    drawCompass();
    setTimeout(drawCompass, 300);
  }

  function drawCompass() {
    const canvas = el.compassCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(140, Math.min(rect.width || 240, 300));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, R = size * 0.44;
    const head = GPS.compass.enabled && GPS.compass.heading != null
      ? GPS.compass.heading
      : (GPS.state.satHeading != null ? GPS.state.satHeading : 0);
    const accent = U.cssVar('--accent', '#e2801f');
    const text = U.cssVar('--map-text', '#ece7d8');
    const dim = U.cssVar('--dim', '#a3ab96');

    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.strokeStyle = dim; ctx.lineWidth = 1.5; ctx.stroke();
    for (let a = 0; a < 360; a += 15) {
      const rad = (a - head) * Math.PI / 180;
      const major = a % 45 === 0;
      const r1 = R * (major ? 0.82 : 0.9), r2 = R * 0.97;
      ctx.beginPath();
      ctx.moveTo(Math.sin(rad) * r1, -Math.cos(rad) * r1);
      ctx.lineTo(Math.sin(rad) * r2, -Math.cos(rad) * r2);
      ctx.strokeStyle = major ? text : dim;
      ctx.lineWidth = major ? 2 : 1;
      ctx.stroke();
    }
    ctx.font = '700 ' + Math.round(size * 0.075) + 'px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(function (p) {
      const rad = (p[1] - head) * Math.PI / 180;
      ctx.fillStyle = p[0] === 'N' ? accent : text;
      ctx.fillText(p[0], Math.sin(rad) * R * 0.68, -Math.cos(rad) * R * 0.68);
    });

    const t = map.target;
    let targetBrg = null, targetDist = null;
    if (t) {
      const st = GPS.state;
      const from = st.lat != null ? { lat: st.lat, lon: st.lon } : map.getCenterLatLon();
      targetBrg = G.bearing(from.lat, from.lon, t.lat, t.lon);
      targetDist = G.distance(from.lat, from.lon, t.lat, t.lon);
      const rad = (targetBrg - head) * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(Math.sin(rad) * R * 0.88, -Math.cos(rad) * R * 0.88, size * 0.028, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.font = '600 ' + Math.round(size * 0.05) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = text;
      ctx.fillText(U.fmtDistShort(targetDist), 0, R * 0.5);
    }

    ctx.rotate(head * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.62); ctx.lineTo(R * 0.14, 0); ctx.lineTo(-R * 0.14, 0);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, R * 0.62); ctx.lineTo(R * 0.14, 0); ctx.lineTo(-R * 0.14, 0);
    ctx.closePath();
    ctx.fillStyle = dim;
    ctx.fill();
    ctx.restore();

    const shown = GPS.compass.enabled && GPS.compass.heading != null;
    el.compassRead.textContent = head.toFixed(0) + '\u00b0 ' + G.compassPoint(head) +
      (targetBrg != null ? ' \u00b7 target ' + Math.round(targetBrg) + '\u00b0 ' + G.compassPoint(targetBrg) : '');
    el.btnCompassEnable.hidden = shown;
    if (shown) el.compassMsg.textContent = 'Compass live' + (GPS.compass.absolute ? '' : ' (relative to the phone)') + '.';
  }
  /* ------------------------------ go to coords ------------------------------ */
  function openGoTo() {
    U.modal({
      title: 'Go to coordinates',
      html: '<label class="field"><span>Lat, lon or UTM</span>' +
        '<input id="gotoInput" type="text" placeholder="44.1234, -71.5678" autocapitalize="characters"></label>' +
        '<p class="small">Decimal degrees, deg/min/sec or UTM all work, e.g. <span class="mono">19T 294554 4888785</span>.</p>' +
        '<label class="switch-row"><span>Also save as a spot</span><input type="checkbox" id="gotoSave"></label>',
      okText: 'Go there',
      validate: function (body) {
        const v = body.querySelector('#gotoInput').value.trim();
        if (!v) return 'Enter coordinates first';
        if (!G.parseLatLon(v)) return 'Could not read those coordinates';
        return null;
      },
      onOk: function (body) {
        const ll = G.parseLatLon(body.querySelector('#gotoInput').value.trim());
        const save = body.querySelector('#gotoSave').checked;
        if (!ll) return;
        setFollow(false);
        map.setView(ll.lat, ll.lon, Math.max(map.zoom, 15));
        closeSheets();
        if (save) {
          const w = D.newWaypoint({ name: D.suggestName('wp'), type: 'wp', lat: ll.lat, lon: ll.lon });
          D.saveWaypoint(w).then(function () {
            map.setWaypoints(D.waypoints);
            renderWaypoints();
            updateWpBadge();
            setTarget(w);
            U.toast('Saved "' + w.name + '"', 'ok');
          });
        } else {
          U.toast('Centred on ' + G.fmtDD(ll.lat, ll.lon, 5), 'ok');
        }
      }
    });
  }

  /* ------------------------------- GPS panel ------------------------------- */
  function gpsStatusText(st) {
    return ({
      off: 'Off', waiting: 'Waiting for a fix', ok: 'Fixed', denied: 'Permission denied',
      unavailable: 'No GPS in this browser', insecure: 'Needs HTTPS', error: 'Error'
    })[st.status] || st.status;
  }

  function renderGpsDetails() {
    const st = GPS.state;
    const rows = [
      ['Status', gpsStatusText(st)],
      ['Source', st.lat == null ? '--' :
        (st.source === 'network' ? 'Network / Wi-Fi (coarse)' : 'Satellite GPS')],
      ['Mode', st.highAccuracy ? 'High accuracy' : 'Fast / network'],
      ['Heading', GPS.displayHeading() == null ? '--' :
        headingText(GPS.displayHeading()) +
        (GPS.compass.enabled && GPS.compass.heading != null ? ' (compass)' : ' (course)')],
      ['Accuracy', st.accuracy != null ? '\u00b1' + st.accuracy.toFixed(1) + ' m (' + U.fmtDist(st.accuracy) + ')' : '--'],
      ['Searching', (st.status === 'waiting' && st.startedAt)
        ? Math.round((Date.now() - st.startedAt) / 1000) + ' s' : '--'],
      ['Latitude', st.lat != null ? G.fmtDMSlat(st.lat) : '--'],
      ['Longitude', st.lon != null ? G.fmtDMSlon(st.lon) : '--'],
      ['Decimal', st.lat != null ? G.fmtDD(st.lat, st.lon, 6) : '--'],
      ['UTM', st.lat != null ? G.fmtUTM(st.lat, st.lon) : '--'],
      ['Altitude', st.altitude != null ? U.fmtElev(st.altitude) : '--'],
      ['Speed', st.speed != null ? U.fmtSpeed(st.speed) : '--'],
      ['GPS course', st.satHeading != null ? Math.round(st.satHeading) + '\u00b0 ' + G.compassPoint(st.satHeading) : '--'],
      ['Compass', GPS.compass.heading != null ? Math.round(GPS.compass.heading) + '\u00b0' : 'off'],
      ['Last fix', st.timestamp ? U.fmtAge(Date.now() - st.timestamp) : '--'],
      ['Fixes', String(st.fixes)]
    ];
    el.gpsDetails.innerHTML = rows.map(function (r) {
      return '<div class="kv"><div class="k">' + r[0] + '</div><div class="v">' + U.escapeHtml(r[1]) + '</div></div>';
    }).join('');
    if (st.error) {
      el.gpsDetails.innerHTML += '<div class="kv" style="grid-column:1/-1"><div class="k">Message</div>' +
        '<div class="v">' + U.escapeHtml(st.error) + '</div></div>';
    }
  }

  /* ------------------------------- diagnostics ------------------------------- */
  function refreshDiag() {
    const bits = [
      'HuntMap v' + VERSION.app,
      (location.protocol === 'https:' ? 'https' : location.protocol.replace(':', '')) + ' \u00b7 ' +
        (U.isSecure() ? 'secure' : 'NOT secure'),
      navigator.onLine ? 'online' : 'offline',
      'GPS ' + gpsStatusText(GPS.state),
      'spots ' + D.waypoints.length + ' \u00b7 tracks ' + D.tracks.length + ' \u00b7 maps ' + D.layers.length,
      'PDF ' + (PM.available() ? 'ready' : 'missing'),
      'SW ' + ('serviceWorker' in navigator ? 'yes' : 'no')
    ];
    if (el.diagInfo) el.diagInfo.textContent = bits.join(' \u00b7 ');
    renderVersion();
  }

  function refreshStorage() {
    DB.estimate().then(function (est) {
      const mb = function (v) { return (v / 1048576).toFixed(v > 10485760 ? 0 : 1) + ' MB'; };
      let txt = 'Spots ' + D.waypoints.length + ' \u00b7 tracks ' + D.tracks.length +
        ' \u00b7 maps ' + D.layers.length + '\n';
      if (est && est.usage != null) {
        txt += 'Storage used ' + mb(est.usage) + ' of quota ' + mb(est.quota || 0);
        if (est.quota && est.usage / est.quota > 0.85) txt += ' \u2014 nearly full, remove some maps.';
      } else {
        txt += 'Storage usage is not reported by this browser.';
      }
      el.storageInfo.textContent = txt;
    });
    T.cachedCount().then(function (n) {
      el.dlStats.textContent = n + ' tiles cached on this device.';
    });
  }
  /* ------------------------------- self test ------------------------------- */
  function runSelfTest() {
    const out = [];
    let pass = 0, fail = 0;
    function check(name, ok, detail) {
      out.push((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : ''));
      if (ok) pass++; else fail++;
    }
    try {
      check('Mercator round-trip', Math.abs(G.yToLat(G.latToY(44.5)) - 44.5) < 1e-9);
      check('Mercator y at 85.05\u00b0', Math.abs(G.latToY(85.05112878)) < 0.01,
        G.latToY(85.05112878).toFixed(4));
      const u = G.toUTM(44.1234, -71.5678);
      check('UTM zone/band', u.zone === 19 && u.band === 'T', u.zone + u.band);
      check('UTM easting/northing', Math.abs(u.easting - 294554) < 2 && Math.abs(u.northing - 4888785) < 2,
        Math.round(u.easting) + ' ' + Math.round(u.northing));
      const back = G.utmToLatLon(u.zone, u.band, u.easting, u.northing);
      check('UTM inverse', back && G.distance(44.1234, -71.5678, back.lat, back.lon) < 0.5,
        back ? G.distance(44.1234, -71.5678, back.lat, back.lon).toFixed(3) + ' m' : 'null');
      const d1 = G.distance(0, 0, 0, 1);
      check('Haversine 1\u00b0 at equator', Math.abs(d1 - 111195) < 5, d1.toFixed(0) + ' m');
      check('Bearing due east', Math.abs(G.bearing(0, 0, 0, 1) - 90) < 1e-6);
      const dest = G.destination(44.1, -71.5, 1000, 90);
      check('Destination 1 km', Math.abs(G.distance(44.1, -71.5, dest.lat, dest.lon) - 1000) < 1);
      const parsed = G.parseLatLon('44 07 24 N 71 33 12 W');
      check('Parse deg/min/sec', !!parsed && Math.abs(parsed.lat - 44.1233) < 0.001 &&
        Math.abs(parsed.lon + 71.5533) < 0.001, parsed ? G.fmtDD(parsed.lat, parsed.lon, 4) : 'null');
      check('Parse UTM text', !!G.parseLatLon('19T 294554 4888785'));
      const calib = PM.calibrate2Points(1000, 1000,
        { u: 100, v: 100, lat: 44.2, lon: -71.6 },
        { u: 900, v: 900, lat: 44.1, lon: -71.4 });
      check('Map calibration solves', !!calib && calib.s > 0 && isFinite(calib.theta),
        calib ? 's=' + calib.s.toExponential(2) : 'null');
      const range = T.tileRange({ west: -71.6, east: -71.4, south: 44.1, north: 44.2 }, 12);
      check('Tile range math', range.cols > 0 && range.rows > 0, range.cols + '\u00d7' + range.rows);
      const solar = Sun.solar(new Date(2026, 5, 21, 12), 44.2, -71.5);
      check('Sunrise before sunset', !!solar && solar.sunrise < solar.sunset);
      check('June day length 14-16 h', !!solar && solar.dayLength / 3600000 > 14 &&
        solar.dayLength / 3600000 < 16, solar ? (solar.dayLength / 3600000).toFixed(2) + ' h' : 'null');
      const moon = Sun.moon(new Date());
      check('Moon illumination 0-1', moon.illumination >= 0 && moon.illumination <= 1,
        Math.round(moon.illumination * 100) + '%');
      const gpx = D.gpxOf([{ lat: 44.1, lon: -71.5, name: 'Test', type: 'stand' }], []);
      const gpxBack = D.parseGpx(gpx);
      check('GPX round-trip', gpxBack.waypoints.length === 1 &&
        Math.abs(gpxBack.waypoints[0].lat - 44.1) < 1e-4);
      check('Secure context for GPS', U.isSecure(), location.protocol);
      check('Service worker support', 'serviceWorker' in navigator);
      check('IndexedDB support', DB.available);
      check('PDF renderer loaded', PM.available());
      check('TIFF decoder loaded', PM.tiffAvailable());
      const skewed = PM.calibrate2Points(1000, 1000,
        { u: 0, v: 0, lat: 44.2, lon: -71.6 },
        { u: 1000, v: 1000, lat: 44.1, lon: -71.4 },
        { northUp: true, rotation: Math.PI / 12 });
      check('Fine rotation applied to calibration',
        !!skewed && Math.abs(skewed.theta - Math.PI / 12) < 1e-9,
        skewed ? (skewed.theta * 180 / Math.PI).toFixed(2) + '\u00b0' : 'null');
    } catch (e) {
      check('Unexpected error', false, String((e && e.message) || e));
    }
    el.testOut.hidden = false;
    el.testOut.textContent = out.join('\n') + '\n\n' + pass + ' passed, ' + fail + ' failed' +
      '\n' + new Date().toLocaleString();
  }

  /* -------------------------------- erase -------------------------------- */
  function eraseAll() {
    U.confirm('Erase all app data?',
      'This deletes every spot, track, map calibration and cached tile on this device. ' +
      'Export a backup first if you may want them back.', 'Erase everything')
      .then(function (ok) {
        if (!ok) return;
        Promise.all([
          DB.clear('waypoints'), DB.clear('tracks'), DB.clear('layers'),
          DB.clear('kv'), DB.clear('settings'), T.clearCache()
        ]).then(function () {
          U.toast('Erased \u2014 reloading', 'ok');
          setTimeout(function () { location.reload(); }, 700);
        }).catch(function () { location.reload(); });
      });
  }
  /* ---------------------------- backup / import ---------------------------- */
  function exportBackup() {
    const data = JSON.stringify(D.backup(), null, 1);
    const stamp = new Date().toISOString().slice(0, 10);
    if (U.download('huntmap-backup-' + stamp + '.json', data, 'application/json')) {
      U.toast('Backup downloaded', 'ok');
    }
  }

  function importBackup(file) {
    U.readFileText(file).then(function (text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON'); }
      const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString() : 'unknown date';
      return U.confirm('Restore backup?',
        'Spots, tracks and map calibration on this device will be replaced by the backup from ' +
        U.escapeHtml(when) + '.', 'Restore').then(function (ok) {
          return ok ? D.restore(obj, 'replace') : null;
        });
    }).then(function (res) {
      if (!res) return;
      syncMap();
      renderAll();
      closeSheets();
      U.toast('Restored ' + res.waypoints + ' spots and ' + res.tracks + ' tracks', 'ok', 3200);
    }).catch(function (e) {
      U.toast('Restore failed: ' + (e.message || e), 'err');
    });
  }

  function exportWpGpx() {
    if (!D.waypoints.length) { U.toast('No spots to export yet', 'err'); return; }
    U.download('huntmap-spots.gpx', D.gpxOf(D.waypoints, [], 'HuntMap spots'), 'application/gpx+xml');
    U.toast('Spots exported as GPX', 'ok');
  }

  function exportTracksGpx() {
    if (!D.tracks.length) { U.toast('No tracks to export yet', 'err'); return; }
    U.download('huntmap-tracks.gpx', D.gpxOf([], D.tracks, 'HuntMap tracks'), 'application/gpx+xml');
    U.toast('Tracks exported as GPX', 'ok');
  }

  function importGpxFile(file) {
    U.readFileText(file).then(function (text) {
      const parsed = D.parseGpx(text);
      if (!parsed.waypoints.length && !parsed.tracks.length) {
        throw new Error('No waypoints or tracks found in that file');
      }
      return D.importGpx(parsed);
    }).then(function (parsed) {
      syncMap();
      renderAll();
      closeSheets();
      U.toast('Imported ' + parsed.waypoints.length + ' spots and ' +
        parsed.tracks.length + ' tracks', 'ok', 3200);
    }).catch(function (e) {
      U.toast('GPX import failed: ' + (e.message || e), 'err');
    });
  }

  /* -------------------------------- install -------------------------------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
  });

  function openInstall() {
    if (deferredInstall) {
      try { deferredInstall.prompt(); } catch (e) {}
      deferredInstall = null;
      return;
    }
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone;
    let html;
    if (standalone) {
      html = '<p>This app is already installed and running full screen. Maps, PDF overlays and GPS work offline from here.</p>';
    } else if (isIOS) {
      html = '<p><b>Add to Home Screen on iPhone / iPad</b></p>' +
        '<ol><li>Open this page in <b>Safari</b>.</li>' +
        '<li>Tap the <b>Share</b> button (square with an arrow).</li>' +
        '<li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>' +
        '<li>Launch HuntMap from the home screen \u2014 it runs full screen and keeps its offline cache.</li></ol>' +
        '<p>Location needs an <b>https://</b> address. After one online visit the app opens with no signal.</p>';
    } else {
      html = '<p>Use the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. ' +
        'Chrome and Edge also show an install icon in the address bar.</p>' +
        '<p>The app must be served over <b>https://</b> (or localhost) for GPS and offline caching.</p>';
    }
    U.modal({ title: 'Install HuntMap', html: html, hideCancel: true, okText: 'Got it' });
  }

  /* ----------------------------- service worker ----------------------------- */
  function registerServiceWorker() {
    // The native shell ships the files inside the app; a service worker is neither
    // needed nor supported on capacitor://, so skip it there.
    if (H.Native && H.Native.available) return;
    if (!('serviceWorker' in navigator)) return;
    const host = location.hostname;
    if (!(location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1')) return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      reg.update().catch(function () {});
      if (reg.waiting) U.toast('A new version is ready \u2014 reopen the app to update', 'ok', 4000);
      reg.addEventListener('updatefound', function () {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            U.toast('Update downloaded \u2014 it will apply next time you open the app', 'ok', 4000);
          }
        });
      });
    }).catch(function (e) { console.warn('Service worker failed', e); });
    DB.persist().then(function (ok) {
      if (!ok) console.info('Persistent storage not granted; data may be evicted if space runs low.');
    });
  }
  /* ------------------------------- bindings ------------------------------- */
  function bindLate() {
    // Spots
    U.on(el.btnMarkSave, 'click', saveMark);
    U.on(el.btnMarkCancel, 'click', closeSheets);
    U.on(el.wpSearch, 'input', U.debounce(renderWaypoints, 160));
    U.on(el.btnWpSelect, 'click', function () { setWpSelectMode(!S.wpSelectMode); });
    U.on(el.btnWpSelectAll, 'click', function () {
      S.wpSelected = visibleWaypoints().map(function (w) { return w.id; });
      renderWaypoints();
    });
    U.on(el.btnWpSelectNone, 'click', function () {
      S.wpSelected = [];
      renderWaypoints();
    });
    U.on(el.btnWpSelectDelete, 'click', deleteSelectedSpots);
    U.on(el.btnWpLegend, 'click', function () {
      renderLegend();
      openSheet('sheetLegend');
    });
    U.on(el.btnWpExport, 'click', exportWpGpx);
    U.on(el.btnWpImport, 'click', function () { el.fileGpx.click(); });
    U.on(el.btnWptSave, 'click', saveWptEdits);
    U.on(el.btnWptDelete, 'click', deleteWpt);
    U.on(el.btnWptShare, 'click', function () { shareWpt(S.editingWp); });
    U.on(el.btnWptGo, 'click', function () {
      const w = S.editingWp;
      if (!w) return;
      setTarget(w);
      setFollow(false);
      map.setView(w.lat, w.lon, Math.max(map.zoom, 15));
      closeSheets();
      U.toast('Navigating to ' + w.name, 'ok');
    });
    U.on(el.btnWptMove, 'click', function () {
      const w = S.editingWp;
      if (!w) return;
      if (GPS.state.lat == null) { startGps(); U.toast('Waiting for a GPS fix\u2026', 'err'); return; }
      w.lat = GPS.state.lat;
      w.lon = GPS.state.lon;
      el.wptCoords.textContent = G.formatAll(w.lat, w.lon);
      D.saveWaypoint(w).then(function () {
        map.setWaypoints(D.waypoints);
        renderWaypoints();
        U.toast('Moved to current position', 'ok');
      });
    });
    U.on(el.wptCoords, 'click', function () {
      if (!S.editingWp) return;
      U.copy(G.formatAll(S.editingWp.lat, S.editingWp.lon)).then(function (ok) {
        U.toast(ok ? 'Coordinates copied' : 'Copy unavailable', ok ? 'ok' : 'err');
      });
    });

    // Tracks
    U.on(el.btnTrackToggle, 'click', toggleRecording);
    U.on(el.btnTrackExport, 'click', exportTracksGpx);

    // Maps
    U.on(el.btnAddMap, 'click', openAddMap);
    U.on(el.btnSyncRefresh, 'click', function () {
      if (!H.Sync) return;
      U.toast('Checking the PC library\u2026', '', 1500);
      H.Sync.probe().then(function (ok) {
        if (!ok) U.toast('PC server not reachable', 'err');
        else renderSync();
      });
    });
    U.on(el.btnSyncAll, 'click', downloadAllRemote);
    U.on(el.syncSearch, 'input', U.debounce(function () {
      if (!H.Sync) return;
      H.Sync.state.q = el.syncSearch.value || '';
      renderSync();
    }, 160));
    U.on(el.syncState, 'change', function () {
      if (!H.Sync) return;
      H.Sync.state.stateFilter = el.syncState.value || '';
      H.Sync.state.countyFilter = '';
      el.syncCounty.dataset.sig = '';
      renderSync();
    });
    U.on(el.syncCounty, 'change', function () {
      if (!H.Sync) return;
      H.Sync.state.countyFilter = el.syncCounty.value || '';
      renderSync();
    });
    U.on(el.btnAccountSignIn, 'click', openSignInSheet);
    U.on(el.btnAccountCheck, 'click', checkServer);
    U.on(el.btnLayerUpload, 'click', uploadLayer);
    U.on(el.btnOpenZones, 'click', function () {
      if (!H.Zones) return;
      renderZones();
      openSheet('sheetZones');
    });
    U.on(el.btnZoneAdd, 'click', addZone);
    U.on(el.setModernPins, 'change', function () {
      D.settings.pinStyle = el.setModernPins.checked ? 'modern' : 'classic';
      D.saveSettings();
      if (map) { map.setWaypoints(D.waypoints); map.invalidate(); }
      renderWaypoints();
      U.toast(D.settings.pinStyle === 'modern' ? 'Modern map pins' : 'Silhouette pins', 'ok', 1800);
    });
    U.on(el.setCompassRose, 'change', function () {
      D.settings.compassRose = el.setCompassRose.checked;
      D.saveSettings();
      renderCompassRose();
    });
    if (el.miniCompass) {
      U.on(el.miniCompass, 'click', function () {
        if (GPS.compass.enabled && GPS.compass.heading != null) {
          openSheet('sheetCompass');
          return;
        }
        enableHeading();
      });
    }
    U.on(el.setZoneSound, 'change', function () {
      D.settings.zoneSound = el.setZoneSound.checked; D.saveSettings();
    });
    U.on(el.setZoneVibrate, 'change', function () {
      D.settings.zoneVibrate = el.setZoneVibrate.checked; D.saveSettings();
    });
    U.on(el.setZoneShow, 'change', function () {
      D.settings.zoneShow = el.setZoneShow.checked;
      D.saveSettings();
      if (map) { map.setZones(D.settings.zoneShow ? H.Zones.list : []); map.invalidate(); }
    });
    U.on(el.btnAppUpdate, 'click', updateApp);
    U.on(el.btnAccountExport, 'click', function () {
      if (!H.Sync) return;
      if (!H.Sync.isNative()) {
        // Web: the browser handles the JSON download (session cookie included).
        window.open(H.Sync.base + 'account/', '_blank', 'noopener');
        return;
      }
      // Native: the token has to travel in the request, so fetch it and show it.
      H.Sync.exportAccount().then(function (json) {
        const text = JSON.stringify(json, null, 2);
        U.modal({ title: 'Your data', okText: 'Done', hideCancel: true,
          html: '<p class="muted small">Everything the server holds for this account. ' +
            'Select all and copy if you want to keep it.</p>' +
            '<textarea readonly rows="12" id="exportJson">' + U.escapeHtml(text) + '</textarea>' });
      }).catch(function (err) {
        U.toast('Export failed: ' + ((err && err.message) || err), 'err', 4200);
      });
    });
    U.on(el.btnAccountServerSave, 'click', function () {
      if (!H.Sync) return;
      const url = (el.accountServer.value || '').trim();
      el.btnAccountServerSave.disabled = true;
      H.Sync.setServerUrl(url).then(function () {
        el.btnAccountServerSave.disabled = false;
        renderAccount();
        U.toast(url ? 'Server set — sign in to sync' : 'Server cleared (offline only)', 'ok', 3200);
      });
    });
    U.on(el.btnAccountDelete, 'click', function () {
      if (!H.Sync || !H.Sync.state.user) return;
      U.confirm('Delete your account?',
        'This removes <b>' + U.escapeHtml(H.Sync.state.user) + '</b>, your uploaded maps, ' +
        'waypoints and tracks from the server. Spots on this phone stay until you delete them. ' +
        'This cannot be undone.', 'Delete account').then(function (ok) {
        if (!ok) return;
        H.Sync.deleteAccount().then(function () {
          renderAccount();
          renderSync();
          U.toast('Account deleted', 'ok', 3200);
        }).catch(function (err) {
          U.toast('Could not delete the account: ' + ((err && err.message) || err), 'err', 4200);
        });
      });
    });
    U.on(el.btnOpenLicences, 'click', function () {
      renderLicences();
      openSheet('sheetLicences');
    });
    U.on(el.btnAccountSync, 'click', function () {
      if (!H.Sync) return;
      if (!H.Sync.state.user) {
        el.accountDiag.hidden = false;
        el.accountDiag.textContent = 'Spots and tracks sync through your account \u2014 sign in first.';
        openSheet('sheetSignIn');
        return;
      }
      el.accountDiag.hidden = false;
      el.accountDiag.textContent = 'Syncing spots and tracks\u2026';
      H.Sync.syncNow(false).then(function (json) {
        if (!json) {
          el.accountDiag.textContent = 'Sync failed: ' + (H.Sync.syncState.error || 'see the maps panel');
          return;
        }
        const s = H.Sync.syncState;
        el.accountDiag.textContent = 'Synced: ' + s.spots + ' spot' + (s.spots === 1 ? '' : 's') +
          ' \u00b7 ' + s.tracks + ' track' + (s.tracks === 1 ? '' : 's');
        U.toast('Spots and tracks synced', 'ok');
        renderAccount();
      });
    });
    U.on(el.btnAccountSignOut, 'click', function () {
      if (!H.Sync) return;
      H.Sync.logout().then(function () {
        U.toast('Signed out', 'ok');
        renderSync();
      });
    });
    U.on(el.btnSignInGo, 'click', function () { submitSignIn('login'); });
    U.on(el.btnSignUpGo, 'click', function () { submitSignIn('register'); });
    U.on(el.signPass, 'keydown', function (ev) {
      if (ev.key === 'Enter') submitSignIn('login');
    });
    U.on(el.btnMetaSave, 'click', saveMapMeta);
    U.on(el.toggleTiles, 'change', function () {
      D.settings.tiles = el.toggleTiles.checked;
      map.tilesEnabled = D.settings.tiles;
      map.invalidate();
      D.saveSettings();
    });
    U.on(el.btnRecalibrate, 'click', function () {
      const sel = D.layers.filter(function (l) { return l.id === D.settings.selectedLayerId; })[0];
      const layer = sel || D.layers[D.layers.length - 1];
      if (!layer) { U.toast('Add a PDF or image map first', 'err'); return; }
      if (!layer.img) { U.toast('That map is still loading \u2014 try again in a moment', 'err'); return; }
      calibrateLayerOnMap(layer, false);
    });
    U.on(el.btnDlEstimate, 'click', estimateTiles);
    U.on(el.btnDlStart, 'click', downloadTiles);
    U.on(el.btnDlCancel, 'click', function () { T.cancelDownload(); });
    U.on(el.btnDlStats, 'click', function () { refreshTileStats(); refreshStorage(); });
    U.on(el.btnDlClear, 'click', function () {
      U.confirm('Clear cached tiles?', 'Downloaded and browsed map tiles will be removed. PDF maps are kept.', 'Clear')
        .then(function (ok) {
          if (!ok) return;
          T.clearCache().then(function () {
            refreshTileStats();
            map.invalidate();
            U.toast('Tile cache cleared', 'ok');
          });
        });
    });

    // Add-map sheet
    U.on(el.btnPickMap, 'click', function () { el.fileMap.click(); });
    U.on(el.fileMap, 'change', function (ev) { pickMapFile(ev.target.files && ev.target.files[0]); });
    U.on(el.btnMapRender, 'click', renderMapPage);
    U.on(el.btnRotLeft, 'click', function () { setPendingRotation(-90); });
    U.on(el.btnRotRight, 'click', function () { setPendingRotation(90); });
    U.on(el.btnRot180, 'click', function () { setPendingRotation(180); });
    U.on(el.calibRot, 'input', function () {
      const v = parseFloat(el.calibRot.value) || 0;
      el.calibRotVal.textContent = v.toFixed(1) + '\u00b0';
    });
    U.on(el.btnCalibPoints, 'click', function () {
      if (S.pending && S.pending.layer) openControlPoints(S.pending.layer);
      else U.toast('Load the map image first', 'err');
    });
    U.on(el.btnCalibDrag, 'click', function () {
      if (S.pending && S.pending.layer) calibrateLayerOnMap(S.pending.layer, true);
      else U.toast('Load the map image first', 'err');
    });

    // Control points
    U.on(el.calibCanvas, 'click', calibTap);
    U.on(el.btnCalibResetPts, 'click', function () {
      S.calibPts = [];
      drawCalibCanvas();
      updateCalibPtsUI();
    });
    U.on(el.btnCalibApply, 'click', applyControlPoints);

    // Live calibration bar: sliders are relative to the size when it opened
    U.on(el.btnCalibLeft, 'click', function () { calibNudge(function (c) { c.theta -= Math.PI / 2; }); });
    U.on(el.btnCalibRight, 'click', function () { calibNudge(function (c) { c.theta += Math.PI / 2; }); });
    U.on(el.calibScale, 'input', function () {
      const layer = map.calibrateLayer;
      if (!layer || !layer.calib) return;
      if (!(S.calibS0 > 0)) S.calibS0 = layer.calib.s;
      const factor = sliderToScaleFactor(parseFloat(el.calibScale.value));
      layer.calib.s = S.calibS0 * factor;
      updateCalibReadout('scale');
      map.invalidate();
    });
    U.on(el.calibRotate, 'input', function () {
      const layer = map.calibrateLayer;
      if (!layer || !layer.calib) return;
      const deg = parseFloat(el.calibRotate.value) || 0;
      layer.calib.theta = deg * Math.PI / 180;
      updateCalibReadout('rotate');
      map.invalidate();
    });
    U.on(el.calibOpacity, 'input', function () {
      const l = map.calibrateLayer;
      if (!l) return;
      l.opacity = U.clamp(parseInt(el.calibOpacity.value, 10) / 100, 0.1, 1);
      if (el.calibOpacityVal) el.calibOpacityVal.textContent = el.calibOpacity.value + '%';
      map.invalidate();
    });
    U.on(el.btnCalibCenter, 'click', function () {
      calibNudge(function (c) {
        const ll = map.getCenterLatLon();
        const w = G.toWorld(ll.lat, ll.lon);
        c.cx = w.x; c.cy = w.y;
      });
    });
    U.on(el.btnCalibDone, 'click', function () { finishCalibration(true); });
    U.on(el.btnCalibCancel, 'click', function () { finishCalibration(false); });

    // Measure bar
    U.on(el.btnMeasureUndo, 'click', function () {
      map.measure.pop();
      map.invalidate();
      onMeasureUpdate(map.measureTotal());
    });
    U.on(el.btnMeasureClear, 'click', function () {
      map.measure = [];
      map.invalidate();
      onMeasureUpdate(map.measureTotal());
    });
    U.on(el.btnMeasureDone, 'click', function () { toggleMeasure(false); });
    bindToolsAndSettings();
    updateTrackHud();
    updateWpBadge();
    refreshStorage();
  }
  function bindToolsAndSettings() {
    U.on(el.btnOpenSun, 'click', function () { openSheet('sheetSun'); });
    U.on(el.btnOpenCompass, 'click', function () { openSheet('sheetCompass'); openCompass(); });
    U.on(el.btnOpenTracks, 'click', function () { openSheet('sheetTracks'); });
    U.on(el.btnOpenGoTo, 'click', openGoTo);
    U.on(el.btnOpenGps, 'click', function () { openSheet('sheetGps'); });
    U.on(el.btnOpenBackup, 'click', function () { openSheet('sheetBackup'); refreshStorage(); });
    U.on(el.btnOpenHelp, 'click', function () { openSheet('sheetHelp'); });
    U.on(el.btnOpenInstall, 'click', openInstall);
    U.on(el.btnCompassEnable, 'click', function () {
      GPS.enableCompass(function () { drawCompass(); }).then(function (ok) {
        if (ok) { U.toast('Compass enabled', 'ok'); drawCompass(); }
        else U.toast('Compass not available \u2014 using GPS course instead', 'err');
      });
    });
    U.on(el.btnGpsRestart, 'click', function () {
      GPS.restart({ highAccuracy: D.settings.highAccuracy });
      U.toast('Restarting GPS\u2026', 'ok');
    });
    U.on(el.btnGpsSat, 'click', function () {
      // Airplane mode: satellites are the only source, so stop asking the network
      // and let the chip work. The watch keeps retrying on its own.
      D.settings.highAccuracy = true;
      if (el.setHighAcc) el.setHighAcc.checked = true;
      D.saveSettings();
      GPS.forceSatellites();
      U.toast('Satellites only — give it a minute under open sky', 'ok', 3600);
    });

    U.on(el.btnGpsFast, 'click', function () {
      // Quick network/Wi-Fi fix: no satellite wait (the usual answer indoors).
      D.settings.highAccuracy = false;
      if (el.setHighAcc) el.setHighAcc.checked = false;
      D.saveSettings();
      GPS.restart({ highAccuracy: false });
      U.toast('Fast mode: using Wi-Fi / network location', 'ok', 3200);
      renderGpsDetails();
    });

    U.on(el.setUnits, 'change', function () {
      D.settings.units = el.setUnits.value;
      U.setUnits(D.settings.units);
      D.saveSettings();
      renderWaypoints();
      renderTracks();
      updateCoordHud();
      updateTargetBar();
      updateTrackHud();
      map.invalidate();
    });
    U.on(el.setCoordFormat, 'change', function () {
      D.settings.coordFormat = el.setCoordFormat.value;
      D.saveSettings();
      updateCoordHud();
      renderWaypoints();
    });
    U.on(el.setNight, 'change', function () {
      D.settings.night = el.setNight.checked;
      document.body.classList.toggle('night', D.settings.night);
      D.saveSettings();
      map.invalidate();
    });
    U.on(el.setAwake, 'change', function () {
      D.settings.awake = el.setAwake.checked;
      D.saveSettings();
      if (GPS.setWantAwake) GPS.setWantAwake(D.settings.awake);
    });
    U.on(el.setHighAcc, 'change', function () {
      D.settings.highAccuracy = el.setHighAcc.checked;
      D.saveSettings();
      if (GPS.state.active) GPS.restart({ highAccuracy: D.settings.highAccuracy });
    });
    U.on(el.setLabels, 'change', function () {
      D.settings.labels = el.setLabels.checked;
      map.showLabels = D.settings.labels;
      map.invalidate();
      D.saveSettings();
    });
    U.on(el.setGrid, 'change', function () {
      D.settings.grid = el.setGrid.checked;
      map.showGrid = D.settings.grid;
      map.invalidate();
      D.saveSettings();
    });
    U.on(el.setTrail, 'change', function () {
      D.settings.trail = el.setTrail.checked;
      map.setTracks(tracksForMap());
      D.saveSettings();
    });
    U.on(el.btnSelfTest, 'click', runSelfTest);
    U.on(el.btnClearAll, 'click', eraseAll);

    U.on(el.btnBackupExport, 'click', exportBackup);
    U.on(el.btnBackupImport, 'click', function () { el.fileBackup.click(); });
    U.on(el.fileBackup, 'change', function (ev) {
      const f = ev.target.files && ev.target.files[0];
      if (f) importBackup(f);
      el.fileBackup.value = '';
    });
    U.on(el.btnExportWpGpx, 'click', exportWpGpx);
    U.on(el.btnExportTracksGpx, 'click', exportTracksGpx);
    U.on(el.btnImportGpx, 'click', function () { el.fileGpx.click(); });
    U.on(el.fileGpx, 'change', function (ev) {
      const f = ev.target.files && ev.target.files[0];
      if (f) importGpxFile(f);
      el.fileGpx.value = '';
    });
    U.on(el.btnPersist, 'click', function () {
      DB.persist().then(function (ok) {
        U.toast(ok ? 'Persistent storage granted' : 'Browser did not grant persistent storage',
          ok ? 'ok' : 'err');
      });
    });
  }

  /* --------------------------------- boot --------------------------------- */
  function boot() {
    App.init();
    bindLate();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
















