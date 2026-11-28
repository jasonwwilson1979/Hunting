/* HuntMap — gps.js
   Geolocation watch, smoothed fixes, device compass, wake lock.
   Works with no network: a phone GPS is receive-only. */
(function () {
  'use strict';
  const H = window.Hunt;
  const U = H.Util;
  const GPS = H.GPS = {};

  const state = GPS.state = {
    active: false,
    status: 'off',            // off | waiting | ok | denied | unavailable | insecure | error
    lat: null, lon: null,
    accuracy: null, altitude: null, altitudeAccuracy: null,
    speed: null, heading: null, satHeading: null,
    timestamp: 0, error: null, fixes: 0,
    source: 'none',           // gps | network (Wi-Fi / cell / IP)
    highAccuracy: true,       // requested mode
    slow: false,              // no fix yet after the watchdog delay
    startedAt: 0, downgraded: false
  };
  GPS.compass = { enabled: false, heading: null, absolute: false };

  let watchId = null;
  let listeners = [];
  const history = [];
  let wakeLock = null;
  let slowTimer = 0;
  let retryTimer = 0;          // pending "ask again" after a no-fix error
  let retryDelay = 0;          // backoff for that retry (5 s, 10 s ... 30 s)
  /** How long to wait for anything before telling the user it is slow. */
  GPS.SLOW_AFTER_MS = 12000;

  GPS.onUpdate = function (cb) {
    listeners.push(cb);
    return function () { listeners = listeners.filter(function (l) { return l !== cb; }); };
  };
  function emit() {
    listeners.slice().forEach(function (cb) { try { cb(state); } catch (e) { console.error(e); } });
  }
  GPS.emit = emit;

  function applyFix(geo, source, keepHistory) {
    const c = geo.coords;
    state.lat = c.latitude;
    state.lon = c.longitude;
    state.accuracy = c.accuracy;
    state.altitude = (c.altitude == null || !isFinite(c.altitude)) ? null : c.altitude;
    state.altitudeAccuracy = (c.altitudeAccuracy == null || !isFinite(c.altitudeAccuracy)) ? null : c.altitudeAccuracy;
    state.speed = (c.speed == null || !isFinite(c.speed) || c.speed < 0) ? null : c.speed;
    state.satHeading = (c.heading == null || !isFinite(c.heading) || c.heading < 0) ? null : c.heading;
    state.timestamp = geo.timestamp || Date.now();
    // A coarse answer is almost always network/Wi-Fi positioning, not satellites.
    state.source = source || ((c.accuracy != null && c.accuracy > 100) ? 'network' : 'gps');
    state.status = 'ok';
    state.error = null;
    state.slow = false;
    state.fixes++;
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = 0; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = 0; }
    retryDelay = 0;
    if (keepHistory) {
      history.push({ lat: state.lat, lon: state.lon, accuracy: state.accuracy, t: state.timestamp });
      if (history.length > 8) history.shift();
    }
    emit();
  }

  function onPosition(geo) { applyFix(geo, null, true); }

  function startWatch(high) {
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} watchId = null; }
    try {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: !!high,
        maximumAge: 5000,
        // A cold satellite fix in airplane mode legitimately takes 30-120 s, so the
        // high-accuracy watch is patient; the browser keeps it alive either way.
        timeout: high ? 90000 : 20000
      });
    } catch (e) {
      state.status = 'error';
      state.error = String((e && e.message) || e);
      emit();
    }
  }

  /**
   * Ask again after "no position yet". Airplane mode is the normal case here: the
   * phone GPS is receive-only but needs clear sky and time, and there is no network
   * to fall back on, so we retry with a growing delay instead of giving up.
   */
  function retryWatch(reason) {
    if (!state.active) return;
    retryDelay = Math.min(30000, retryDelay ? retryDelay * 2 : 5000);
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      retryTimer = 0;
      if (!state.active) return;
      state.error = reason;
      emit();
      startWatch(!!state.highAccuracy);
    }, retryDelay);
  }

  function onError(err) {
    const code = err && err.code;
    state.error = err && err.message ? err.message : 'Location error';
    if (code === 1) {
      state.status = 'denied';
      state.active = false;
      if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} watchId = null; }
      emit();
      return;
    }
    if (code === 2 || code === 3) {
      // POSITION_UNAVAILABLE / TIMEOUT. Both mean "no fix yet", not "no GPS":
      // they are exactly what an iPhone reports in airplane mode while the chip
      // is still acquiring. Never call this unsupported and never stop watching.
      const offline = navigator.onLine === false;
      state.status = 'waiting';
      state.slow = true;
      if (!offline && code === 3 && state.highAccuracy && !state.downgraded) {
        // Online, and the satellite watch timed out: a coarse Wi-Fi fix beats
        // nothing, so try network positioning once (the "Fast Wi-Fi fix" mode).
        state.downgraded = true;
        state.highAccuracy = false;
        state.error = 'No satellite fix yet \u2014 trying Wi-Fi / network location';
        emit();
        startWatch(false);
        return;
      }
      if (!offline && !state.highAccuracy) {
        state.error = 'No position yet \u2014 retrying';
      } else {
        state.error = offline
          ? 'Waiting for satellites (airplane mode: no network to help, this can take a minute)'
          : 'Waiting for satellites\u2026';
      }
      emit();
      retryWatch(state.error);
      return;
    }
    state.status = 'error';
    emit();
  }

  /** Back to satellites only - the first aid for airplane mode. */
  GPS.forceSatellites = function () {
    state.highAccuracy = true;
    state.downgraded = false;
    state.error = null;
    state.slow = false;
    state.status = state.lat == null ? 'waiting' : 'ok';
    state.startedAt = Date.now();
    retryDelay = 0;
    emit();
    if (!state.active) { GPS.start({ highAccuracy: true }); return true; }
    startWatch(true);
    return true;
  };


  /** Start watching the GPS. Safe to call repeatedly. */
  GPS.start = function (opts) {
    opts = opts || {};
    if (!navigator.geolocation) {
      state.status = 'unavailable';
      state.error = 'This browser has no Geolocation support';
      emit();
      return;
    }
    if (!U.isSecure()) {
      state.status = 'insecure';
      state.error = 'GPS needs HTTPS (or localhost). Open the app from its https:// address.';
      emit();
      return;
    }
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} watchId = null; }
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = 0; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = 0; }
    retryDelay = 0;
    state.active = true;
    state.status = state.lat == null ? 'waiting' : 'ok';
    state.error = null;
    state.slow = false;
    state.downgraded = false;
    state.highAccuracy = opts.highAccuracy !== false;
    state.startedAt = Date.now();
    emit();

    // Phase 1 — a quick network fix. Browsers answer this from Wi-Fi/cell/IP in
    // about a second, where a cold satellite fix can take 30-60 s indoors. The
    // map and the coordinate HUD are usable immediately; it is refined below.
    try {
      navigator.geolocation.getCurrentPosition(
        function (geo) { applyFix(geo, 'network', false); },
        function () { /* the watch reports the real error */ },
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
      );
    } catch (e) { /* ignore, the watch is the source of truth */ }

    // Phase 2 — the live, accurate watch.
    startWatch(state.highAccuracy);

    // Phase 3 — say "still searching" instead of hanging silently.
    slowTimer = setTimeout(function () {
      slowTimer = 0;
      if (state.active && state.lat == null) { state.slow = true; emit(); }
    }, GPS.SLOW_AFTER_MS);
  };

  GPS.stop = function () {
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) {} }
    watchId = null;
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = 0; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = 0; }
    retryDelay = 0;
    state.active = false;
    state.status = 'off';
    state.slow = false;
    emit();
  };

  GPS.restart = function (opts) { GPS.stop(); GPS.start(opts || {}); };

  /* Leaving airplane mode (or getting Wi-Fi back): if we fell back to network
     positioning automatically, go back to satellites. A deliberate
     "Fast Wi-Fi fix" (highAccuracy=false, downgraded=false) is left alone. */
  window.addEventListener('online', function () {
    if (!state.active || !state.downgraded) return;
    state.downgraded = false;
    state.highAccuracy = true;
    state.status = state.lat == null ? 'waiting' : 'ok';
    state.error = 'Network is back \u2014 refining with satellites';
    retryDelay = 0;
    emit();
    startWatch(true);
  });

  GPS.age = function () { return state.timestamp ? Date.now() - state.timestamp : null; };
  GPS.isStale = function (ms) { return !state.timestamp || (Date.now() - state.timestamp) > (ms || 45000); };

  /** Smoothed best position (weighted by reported accuracy). */
  GPS.smoothed = function () {
    if (state.lat == null) return null;
    if (history.length < 3) return { lat: state.lat, lon: state.lon, accuracy: state.accuracy };
    let wsum = 0, lat = 0, lon = 0, acc = 0;
    history.forEach(function (h) {
      const w = 1 / Math.max(3, h.accuracy || 20);
      wsum += w; lat += h.lat * w; lon += h.lon * w; acc += (h.accuracy || 20) * w;
    });
    return { lat: lat / wsum, lon: lon / wsum, accuracy: acc / wsum };
  };

  /** Heading to draw: compass if available, else GPS course. */
  GPS.displayHeading = function () {
    if (GPS.compass.enabled && GPS.compass.heading != null) return GPS.compass.heading;
    if (state.satHeading != null && state.speed != null && state.speed > 0.6) return state.satHeading;
    return null;
  };
  /* ------------------------------ compass ------------------------------ */
  function onOrientation(ev) {
    let h = null, absolute = false;
    if (ev.webkitCompassHeading != null && isFinite(ev.webkitCompassHeading)) {
      h = ev.webkitCompassHeading;            // iOS: already clockwise from north
      absolute = true;
    } else if (ev.alpha != null && isFinite(ev.alpha)) {
      h = (360 - ev.alpha) % 360;             // alpha is counter-clockwise from north
      absolute = !!ev.absolute;
    }
    if (h == null) return;
    GPS.compass.heading = h;
    GPS.compass.absolute = absolute;
    if (GPS._compassCb) GPS._compassCb(h, absolute);
    emit();
  }

  GPS.enableCompass = function (cb) {
    GPS._compassCb = cb || GPS._compassCb;
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return Promise.resolve(false);
    function attach() {
      window.addEventListener('deviceorientationabsolute', onOrientation, true);
      window.addEventListener('deviceorientation', onOrientation, true);
      GPS.compass.enabled = true;
      setTimeout(emit, 300);
      return true;
    }
    if (typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().then(function (res) {
        return res === 'granted' ? attach() : false;
      }).catch(function () { return false; });
    }
    return Promise.resolve(attach());
  };

  /* ------------------------------ wake lock ------------------------------ */
  GPS.keepAwake = function (on) {
    if (!('wakeLock' in navigator)) return Promise.resolve(false);
    if (!on) {
      if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
      return Promise.resolve(false);
    }
    if (wakeLock) return Promise.resolve(true);
    return navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
      return true;
    }).catch(function () { return false; });
  };
  GPS.setWantAwake = function (want) {
    GPS._wantAwake = !!want;
    return GPS.keepAwake(!!want);
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && GPS._wantAwake) GPS.keepAwake(true);
  });
})();

