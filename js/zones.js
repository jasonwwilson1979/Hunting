/* HuntMap — zones.js
   Geofences: a circle on the ground, an alert when you walk into it (or out of it).
   Local to the device, like the map files; included in the JSON backup. */
(function () {
  'use strict';
  const H = window.Hunt;
  const Z = H.Zones = {};
  const U = H.Util, G = H.Geo, DB = H.DB;

  Z.MIN_R = 15;          // metres
  Z.MAX_R = 5000;
  Z.HYSTERESIS = 12;     // metres of slack so a wobbling fix does not flap
  Z.COOLDOWN = 20000;    // ms before the same zone can fire again

  Z.list = [];
  /** Per-zone runtime state (not persisted): inside?, last event time. */
  const state = {};

  Z.COLORS = ['#e2513f', '#4aa3d8', '#8ec46a', '#c9a227', '#9b8bc4'];

  Z.newZone = function (o) {
    o = o || {};
    const now = Date.now();
    return {
      id: U.uid('zone'),
      name: o.name || 'Fence',
      lat: o.lat,
      lon: o.lon,
      radius: U.clamp(Math.round(o.radius || 150), Z.MIN_R, Z.MAX_R),
      color: o.color || Z.COLORS[Z.list.length % Z.COLORS.length],
      onEnter: o.onEnter !== false,
      onExit: !!o.onExit,
      enabled: o.enabled !== false,
      notes: o.notes || '',
      createdAt: now,
      updatedAt: now
    };
  };

  Z.load = function () {
    return DB.getAll('zones').then(function (rows) {
      Z.list = (rows || []).filter(function (z) {
        return z && z.id && isFinite(z.lat) && isFinite(z.lon);
      });
      Z.list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      return Z.list;
    }).catch(function () { Z.list = []; return Z.list; });
  };

  Z.save = function (zone) {
    zone.updatedAt = Date.now();
    const i = Z.list.findIndex(function (z) { return z.id === zone.id; });
    if (i >= 0) Z.list[i] = zone; else Z.list.push(zone);
    Z.list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return DB.put('zones', JSON.parse(JSON.stringify(zone))).then(function () { return zone; });
  };

  Z.remove = function (id) {
    Z.list = Z.list.filter(function (z) { return z.id !== id; });
    delete state[id];
    return DB.del('zones', id);
  };

  Z.get = function (id) { return Z.list.find(function (z) { return z.id === id; }) || null; };

  Z.enabled = function () { return Z.list.filter(function (z) { return z.enabled; }); };

  /** Is a position inside a zone? (metres, sphere) */
  Z.inside = function (zone, lat, lon) {
    return G.distance(lat, lon, zone.lat, zone.lon) <= zone.radius;
  };

  Z.stateFor = function (id) {
    if (!state[id]) state[id] = { inside: null, lastAt: 0 };
    return state[id];
  };

  /**
   * Feed a position in; get back the alerts that should be shown.
   * Pure apart from the per-zone state, which makes it easy to test.
   *   [{zone, type: 'enter'|'exit', at}]
   */
  Z.check = function (lat, lon, now) {
    if (lat == null || lon == null) return [];
    now = now || Date.now();
    const events = [];
    Z.list.forEach(function (zone) {
      if (!zone.enabled) return;
      const st = Z.stateFor(zone.id);
      const dist = G.distance(lat, lon, zone.lat, zone.lon);
      const enterAt = zone.radius;
      const exitAt = zone.radius + Z.HYSTERESIS;
      if (st.inside === null) {
        // First fix after opening the app: adopt the state silently, otherwise
        // standing still inside a fence would fire an "entered" alert every launch.
        st.inside = dist <= enterAt;
        return;
      }
      if (!st.inside && dist <= enterAt) {
        st.inside = true;
        if (zone.onEnter && now - st.lastAt > Z.COOLDOWN) {
          st.lastAt = now;
          events.push({ zone: zone, type: 'enter', distance: dist, at: now });
        }
      } else if (st.inside && dist > exitAt) {
        st.inside = false;
        if (zone.onExit && now - st.lastAt > Z.COOLDOWN) {
          st.lastAt = now;
          events.push({ zone: zone, type: 'exit', distance: dist, at: now });
        }
      }
    });
    return events;
  };

  /** Forget the cached inside/outside state (after editing a fence). */
  Z.resetState = function (id) {
    if (id) delete state[id]; else Object.keys(state).forEach(function (k) { delete state[k]; });
  };

  /** Zones that pass a name filter, with their current state, for the list. */
  Z.rows = function () {
    return Z.list.map(function (z) {
      const st = Z.stateFor(z.id);
      return { zone: z, inside: st.inside, watching: !!z.enabled };
    });
  };

  Z.export = function () {
    return JSON.parse(JSON.stringify(Z.list));
  };

  Z.restore = function (rows, replace) {
    if (replace) Z.list = [];
    const jobs = [];
    (rows || []).forEach(function (z) {
      if (!z || !z.id || !isFinite(z.lat) || !isFinite(z.lon)) return;
      const clean = Z.newZone(z);
      clean.id = z.id;
      clean.createdAt = z.createdAt || clean.createdAt;
      jobs.push(Z.save(clean));
    });
    Z.resetState();
    return Promise.all(jobs);
  };
})();
