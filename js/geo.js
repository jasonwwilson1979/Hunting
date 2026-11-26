/* HuntMap — geo.js
   Web-Mercator world coordinates, spherical geodesy, UTM, coordinate parsing. */
(function () {
  'use strict';
  const H = window.Hunt;
  const G = H.Geo = {};
  const clamp = H.Util.clamp;

  const R = 6371008.8;                       // mean Earth radius (m)
  const C = 2 * Math.PI * R;                 // circumference (m)
  const WORLD = 256;                         // world pixel size at zoom 0
  const MAXLAT = 85.0511287798;

  G.R = R;
  G.C = C;
  G.WORLD = WORLD;
  G.MAXLAT = MAXLAT;
  G.DEG = Math.PI / 180;

  /* ------------------------- Web-Mercator world px ------------------------- */
  G.lonToX = function (lon) { return (lon + 180) / 360 * WORLD; };
  G.latToY = function (lat) {
    const s = Math.sin(clamp(lat, -MAXLAT, MAXLAT) * G.DEG);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD;
  };
  G.xToLon = function (x) { return x / WORLD * 360 - 180; };
  G.yToLat = function (y) {
    const n = Math.PI - 2 * Math.PI * y / WORLD;
    return Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) / G.DEG;
  };
  G.toWorld = function (lat, lon) { return { x: G.lonToX(lon), y: G.latToY(lat) }; };
  G.toLatLon = function (x, y) { return { lat: G.yToLat(y), lon: G.xToLon(x) }; };

  G.wrapLon = function (lon) {
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return lon;
  };

  /** Ground metres per screen pixel at a latitude and fractional zoom. */
  G.metersPerPixel = function (lat, zoom) {
    return C * Math.cos(clamp(lat, -MAXLAT, MAXLAT) * G.DEG) / (WORLD * Math.pow(2, zoom));
  };
  /** Screen pixels per ground metre (inverse of above). */
  G.pixelsPerMeter = function (lat, zoom) {
    return 1 / G.metersPerPixel(lat, zoom);
  };

  /* ------------------------------ geodesy ------------------------------ */
  function toRad(d) { return d * G.DEG; }
  function toDeg(r) { return r / G.DEG; }

  G.distance = function (lat1, lon1, lat2, lon2) {
    const p1 = toRad(lat1), p2 = toRad(lat2);
    const dPhi = p2 - p1, dLam = toRad(lon2 - lon1);
    const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dLam / 2) * Math.sin(dLam / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  };
  G.distPt = function (a, b) { return G.distance(a.lat, a.lon, b.lat, b.lon); };

  G.bearing = function (lat1, lon1, lat2, lon2) {
    const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2 - lon1);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return G.normalizeBearing(toDeg(Math.atan2(y, x)));
  };
  G.bearingPt = function (a, b) { return G.bearing(a.lat, a.lon, b.lat, b.lon); };

  /** Point at distance (m) and bearing (deg) from a start point. */
  G.destination = function (lat, lon, dist, brg) {
    const d = dist / R, t = toRad(brg), p1 = toRad(lat), l1 = toRad(lon);
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
    const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: toDeg(p2), lon: G.wrapLon(toDeg(l2)) };
  };

  G.midpoint = function (lat1, lon1, lat2, lon2) {
    const p1 = toRad(lat1), l1 = toRad(lon1), p2 = toRad(lat2), dl = toRad(lon2 - lon1);
    const bx = Math.cos(p2) * Math.cos(dl), by = Math.cos(p2) * Math.sin(dl);
    const p3 = Math.atan2(Math.sin(p1) + Math.sin(p2),
      Math.sqrt((Math.cos(p1) + bx) * (Math.cos(p1) + bx) + by * by));
    const l3 = l1 + Math.atan2(by, Math.cos(p1) + bx);
    return { lat: toDeg(p3), lon: G.wrapLon(toDeg(l3)) };
  };

  G.normalizeBearing = function (b) { b = b % 360; return b < 0 ? b + 360 : b; };
  G.angleDelta = function (a, b) {                    // signed shortest turn a→b
    let d = (b - a + 540) % 360 - 180;
    return d;
  };
  G.compassPoint = function (brg) {
    const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return pts[Math.round(G.normalizeBearing(brg) / 22.5) % 16];
  };
  G.compassPointAt = function (brg, list) {
    const names = list || ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return names[Math.round(G.normalizeBearing(brg) / 22.5) % 16];
  };

  /* --------------------------- formatting --------------------------- */
  G.fmtDD = function (lat, lon, digits) {
    const d = digits == null ? 6 : digits;
    return lat.toFixed(d) + ', ' + lon.toFixed(d);
  };
  G.fmtDMS = function (lat, lon) {
    return dms(lat, 'lat') + ' ' + dms(lon, 'lon');
  };
  function dms(value, kind) {
    const dir = kind === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    let mFloat = (abs - deg) * 60;
    let min = Math.floor(mFloat);
    let sec = (mFloat - min) * 60;
    sec = Math.round(sec * 10) / 10;
    if (sec >= 60) { sec -= 60; min += 1; }
    if (min >= 60) { min -= 60; deg += 1; }
    return deg + '\u00b0' + String(min).padStart(2, '0') + "'" +
      (sec < 10 ? '0' : '') + sec.toFixed(1) + '"' + dir;
  }
  G.fmtDMSlat = (lat) => dms(lat, 'lat');
  G.fmtDMSlon = (lon) => dms(lon, 'lon');
  /* --------------------------------- UTM --------------------------------- */
  const UTM_A = 6378137.0, UTM_F = 1 / 298.257223563;
  const UTM_E2 = UTM_F * (2 - UTM_F);
  const UTM_EP2 = UTM_E2 / (1 - UTM_E2);
  const UTM_K0 = 0.9996;
  const UTM_BANDS = 'CDEFGHJKLMNPQRSTUVWXX';

  G.utmBand = function (lat) {
    return UTM_BANDS[clamp(Math.floor((lat + 80) / 8), 0, 19)];
  };

  G.toUTM = function (lat, lon, zoneOverride) {
    lat = clamp(lat, -80, 84);
    let zone = zoneOverride || Math.floor((lon + 180) / 6) + 1;
    if (!zoneOverride) {
      // Standard UTM exceptions: Norway and Svalbard.
      if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
      if (lat >= 72 && lat < 84) {
        if (lon >= 0 && lon < 9) zone = 31;
        else if (lon >= 9 && lon < 21) zone = 33;
        else if (lon >= 21 && lon < 33) zone = 35;
        else if (lon >= 33 && lon < 42) zone = 37;
      }
    }
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const phi = lat * G.DEG, lam = (lon - lon0) * G.DEG;
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
    const N = UTM_A / Math.sqrt(1 - UTM_E2 * sinPhi * sinPhi);
    const T = tanPhi * tanPhi;
    const C1 = UTM_EP2 * cosPhi * cosPhi;
    const A1 = cosPhi * lam;
    const M = UTM_A * ((1 - UTM_E2 / 4 - 3 * UTM_E2 * UTM_E2 / 64 - 5 * Math.pow(UTM_E2, 3) / 256) * phi
      - (3 * UTM_E2 / 8 + 3 * UTM_E2 * UTM_E2 / 32 + 45 * Math.pow(UTM_E2, 3) / 1024) * Math.sin(2 * phi)
      + (15 * UTM_E2 * UTM_E2 / 256 + 45 * Math.pow(UTM_E2, 3) / 1024) * Math.sin(4 * phi)
      - (35 * Math.pow(UTM_E2, 3) / 3072) * Math.sin(6 * phi));
    const easting = UTM_K0 * N * (A1 + (1 - T + C1) * Math.pow(A1, 3) / 6 +
      (5 - 18 * T + T * T + 72 * C1 - 58 * UTM_EP2) * Math.pow(A1, 5) / 120) + 500000;
    let northing = UTM_K0 * (M + N * tanPhi * (A1 * A1 / 2 +
      (5 - T + 9 * C1 + 4 * C1 * C1) * Math.pow(A1, 4) / 24 +
      (61 - 58 * T + T * T + 600 * C1 - 330 * UTM_EP2) * Math.pow(A1, 6) / 720));
    if (lat < 0) northing += 10000000;
    return { zone: zone, band: G.utmBand(lat), easting: easting, northing: northing,
      zoneLetter: G.utmBand(lat) };
  };

  G.utmToLatLon = function (zone, band, easting, northing) {
    zone = Math.round(zone);
    if (!isFinite(zone) || zone < 1 || zone > 60) return null;
    if (!isFinite(easting) || !isFinite(northing)) return null;
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const x = easting - 500000;
    let y = northing;
    const bandLetter = String(band || 'N').toUpperCase();
    if (bandLetter >= 'C' && bandLetter <= 'M') y -= 10000000;
    const M = y / UTM_K0;
    const mu = M / (UTM_A * (1 - UTM_E2 / 4 - 3 * UTM_E2 * UTM_E2 / 64 - 5 * Math.pow(UTM_E2, 3) / 256));
    const e1 = (1 - Math.sqrt(1 - UTM_E2)) / (1 + Math.sqrt(1 - UTM_E2));
    const J1 = 3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32;
    const J2 = 21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32;
    const J3 = 151 * Math.pow(e1, 3) / 96;
    const J4 = 1097 * Math.pow(e1, 4) / 512;
    const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);
    const sinFp = Math.sin(fp), cosFp = Math.cos(fp), tanFp = Math.tan(fp);
    const C1 = UTM_EP2 * cosFp * cosFp;
    const T1 = tanFp * tanFp;
    const N1 = UTM_A / Math.sqrt(1 - UTM_E2 * sinFp * sinFp);
    const R1 = UTM_A * (1 - UTM_E2) / Math.pow(1 - UTM_E2 * sinFp * sinFp, 1.5);
    const D = x / (N1 * UTM_K0);
    const lat = fp - (N1 * tanFp / R1) * (D * D / 2 -
      (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * UTM_EP2) * Math.pow(D, 4) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * UTM_EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
    const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * UTM_EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / cosFp / G.DEG;
    return { lat: lat / G.DEG, lon: G.wrapLon(lon) };
  };

  G.fmtUTM = function (lat, lon, digits) {
    const u = G.toUTM(lat, lon);
    const e = digits === 0 ? Math.round(u.easting) : u.easting.toFixed(digits == null ? 0 : digits);
    const n = digits === 0 ? Math.round(u.northing) : u.northing.toFixed(digits == null ? 0 : digits);
    return u.zone + u.band + ' ' + e + ' ' + n;
  };

  G.parseUTM = function (str) {
    if (!str) return null;
    const s = String(str).toUpperCase().replace(/\s+/g, ' ').trim();
    const m = s.match(/^(\d{1,2})\s*([C-X])?\s+(\d{4,7}(?:\.\d+)?)\s*[, ]\s*(\d{4,8}(?:\.\d+)?)$/);
    if (!m) return null;
    return G.utmToLatLon(parseInt(m[1], 10), m[2] || (parseFloat(m[4]) > 5000000 ? 'N' : 'N'),
      parseFloat(m[3]), parseFloat(m[4]));
  };
  /* -------------------------- coordinate parsing -------------------------- */
  function parseHalf(text, kind) {
    if (!text) return null;
    const dirRe = kind === 'lat' ? /[NS]/i : /[EW]/i;
    const dirM = String(text).match(dirRe);
    const dir = dirM ? dirM[0].toUpperCase() : null;
    const beforeDir = String(text).split(/[NSEW]/i)[0];
    const negative = /-/.test(beforeDir);
    const nums = (String(text).replace(/[NSEW]/gi, ' ').match(/-?\d+(?:[.,]\d+)?/g) || [])
      .map(function (v) { return parseFloat(v.replace(',', '.')); });
    if (!nums.length) return null;
    if (Math.abs(nums[0]) >= 1000) return null;
    let v = Math.abs(nums[0]);
    if (nums.length > 1) v += Math.abs(nums[1]) / 60;
    if (nums.length > 2) v += Math.abs(nums[2]) / 3600;
    if (dir === 'S' || dir === 'W' || negative || nums[0] < 0) v = -v;
    return { value: v, dir: dir };
  }

  /** Split a "lat lon" string into two halves, tolerating many conventions. */
  function splitPair(raw) {
    const comma = raw.indexOf(',');
    if (comma > 0) return [raw.slice(0, comma), raw.slice(comma + 1)];
    // Split in front of the longitude hemisphere letter that has numbers after it.
    const candidates = [/[EW]/gi, /[NS]/gi];
    for (let c = 0; c < candidates.length; c++) {
      const re = new RegExp(candidates[c].source, 'gi');
      let m;
      while ((m = re.exec(raw)) !== null) {
        const i = m.index;
        if (i > 0 && /\d/.test(raw.slice(0, i)) && /\d/.test(raw.slice(i + 1))) {
          return [raw.slice(0, i), raw.slice(i)];
        }
      }
    }
    const two = raw.match(/^\s*([-+]?\d+(?:[.,]\d+)?)\s+([-+]?\d+(?:[.,]\d+)?)\s*$/);
    if (two) return [two[1], two[2]];
    const nums = raw.match(/[-+]?\d+(?:[.,]\d+)?/g) || [];
    if (nums.length >= 6) return [nums.slice(0, 3).join(' '), nums.slice(3, 6).join(' ')];
    return null;
  }

  G.parseLatLon = function (input) {
    if (input == null) return null;
    const raw = String(input).trim();
    if (!raw) return null;

    const utm = G.parseUTM(raw);
    if (utm && isFinite(utm.lat) && isFinite(utm.lon)) return utm;

    const parts = splitPair(raw);
    if (!parts) return null;


    const a = parseHalf(parts[0], 'lat');
    const b = parseHalf(parts[1], 'lon');
    if (!a || !b) return null;

    let lat = a.value, lon = b.value;
    const firstLooksLikeLon = a.dir === 'E' || a.dir === 'W' ||
      (Math.abs(a.value) > 90 && Math.abs(b.value) <= 90);
    if (firstLooksLikeLon && Math.abs(b.value) <= 90) {
      lat = b.value; lon = a.value;
    }
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat: lat, lon: lon };
  };

  G.validLatLon = function (lat, lon) {
    return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  };

  /* --------------------------- coordinate output --------------------------- */
  G.formatCoord = function (lat, lon, fmt) {
    if (!G.validLatLon(lat, lon)) return '--';
    if (fmt === 'utm') return G.fmtUTM(lat, lon);
    if (fmt === 'dms') return G.fmtDMS(lat, lon);
    return G.fmtDD(lat, lon, 6);
  };
  G.formatAlt = function (lat, lon, fmt) {
    if (!G.validLatLon(lat, lon)) return '';
    return fmt === 'utm' ? G.fmtDD(lat, lon, 5) : G.fmtUTM(lat, lon);
  };
  G.formatAll = function (lat, lon) {
    if (!G.validLatLon(lat, lon)) return '--';
    return 'DD  ' + G.fmtDD(lat, lon, 6) + '\nDMS ' + G.fmtDMS(lat, lon) + '\nUTM ' + G.fmtUTM(lat, lon);
  };
  G.googleMapsUrl = function (lat, lon) {
    return 'https://maps.google.com/?q=' + lat.toFixed(6) + ',' + lon.toFixed(6);
  };
})();


