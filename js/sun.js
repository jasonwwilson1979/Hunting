/* HuntMap — sun.js
   NOAA sunrise/sunset/twilight (accurate to ~1 min) and moon phase/illumination.
   Everything is computed offline from the device clock and position. */
(function () {
  'use strict';
  const H = window.Hunt;
  const S = H.Sun = {};
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const mod = (a, n) => ((a % n) + n) % n;

  function julian(date) { return date.getTime() / 86400000 + 2440587.5; }

  function solarPosition(date) {
    const T = (julian(date) - 2451545.0) / 36525;
    const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = Math.sin(M * D2R) * (1.914602 - T * (0.004817 + 0.000014 * T))
      + Math.sin(2 * M * D2R) * (0.019993 - 0.000101 * T)
      + Math.sin(3 * M * D2R) * 0.000289;
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * T;
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
    const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R)) * R2D;
    const y = Math.pow(Math.tan(eps * D2R / 2), 2);
    const eqTime = 4 * R2D * (
      y * Math.sin(2 * L0 * D2R)
      - 2 * e * Math.sin(M * D2R)
      + 4 * e * y * Math.sin(M * D2R) * Math.cos(2 * L0 * D2R)
      - 0.5 * y * y * Math.sin(4 * L0 * D2R)
      - 1.25 * e * e * Math.sin(2 * M * D2R));
    return { decl: decl, eqTime: eqTime, lambda: lambda };
  }

  function hourAngle(lat, decl, zenith) {
    const cosH = (Math.cos(zenith * D2R) - Math.sin(lat * D2R) * Math.sin(decl * D2R)) /
      (Math.cos(lat * D2R) * Math.cos(decl * D2R));
    if (cosH > 1) return { polar: 'night' };
    if (cosH < -1) return { polar: 'day' };
    return { ha: Math.acos(cosH) * R2D };
  }

  function atMinutes(baseUtc, minutes) {
    return new Date(baseUtc + minutes * 60000);
  }

  /**
   * Sun times for the local calendar day of `date` at lat/lon.
   * zenith 90.833° = official sunrise/sunset (refraction + solar disc),
   * 96° = civil twilight (dawn/dusk).
   */
  S.solar = function (date, lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) return null;
    const d = date instanceof Date ? date : new Date(date);
    const sp = solarPosition(d);
    const baseUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const noonMin = 720 - 4 * lon - sp.eqTime;
    const rise = hourAngle(lat, sp.decl, 90.833);
    const twilight = hourAngle(lat, sp.decl, 96);
    const out = {
      solarNoon: atMinutes(baseUtc, noonMin),
      declination: sp.decl,
      eqTime: sp.eqTime,
      polar: rise.polar || null,
      sunrise: rise.polar ? null : atMinutes(baseUtc, noonMin - 4 * rise.ha),
      sunset: rise.polar ? null : atMinutes(baseUtc, noonMin + 4 * rise.ha),
      dawn: twilight.polar ? null : atMinutes(baseUtc, noonMin - 4 * twilight.ha),
      dusk: twilight.polar ? null : atMinutes(baseUtc, noonMin + 4 * twilight.ha)
    };
    out.dayLength = (out.sunrise && out.sunset) ? out.sunset - out.sunrise : null;
    return out;
  };

  /** Sun altitude (deg) right now: positive = above the horizon. */
  S.altitude = function (date, lat, lon) {
    const sp = solarPosition(date);
    const minutesUtc = (date.getTime() % 86400000) / 60000;
    const trueSolarTime = mod(minutesUtc + sp.eqTime + 4 * lon, 1440);
    let ha = trueSolarTime / 4 - 180;
    if (ha < -180) ha += 360;
    const cosZ = Math.sin(lat * D2R) * Math.sin(sp.decl * D2R) +
      Math.cos(lat * D2R) * Math.cos(sp.decl * D2R) * Math.cos(ha * D2R);
    return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) * R2D;
  };

  /* ------------------------------- moon ------------------------------- */
  const SYNODIC = 29.530588853;

  S.moon = function (date) {
    const d = date instanceof Date ? date : new Date(date);
    const T = (julian(d) - 2451545.0) / 36525;
    const sin = (deg) => Math.sin(deg * D2R);
    const Lp = mod(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T +
      Math.pow(T, 3) / 538841 - Math.pow(T, 4) / 65194000, 360);
    const D = mod(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T +
      Math.pow(T, 3) / 545868 - Math.pow(T, 4) / 113065000, 360);
    const M = mod(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T +
      Math.pow(T, 3) / 24490000, 360);
    const Mp = mod(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T +
      Math.pow(T, 3) / 69699 - Math.pow(T, 4) / 14712000, 360);
    const F = mod(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T -
      Math.pow(T, 3) / 3526000 + Math.pow(T, 4) / 863310000, 360);

    // Geocentric ecliptic longitude of the Moon (main periodic terms).
    const moonLon = mod(Lp
      + 6.289 * sin(Mp) + 1.274 * sin(2 * D - Mp) + 0.658 * sin(2 * D)
      + 0.214 * sin(2 * Mp) - 0.186 * sin(M) - 0.114 * sin(2 * F)
      + 0.059 * sin(2 * D - 2 * Mp) + 0.057 * sin(2 * D - M - Mp)
      + 0.053 * sin(2 * D + Mp) + 0.046 * sin(2 * D - M)
      + 0.041 * sin(M - Mp) - 0.035 * sin(D) - 0.031 * sin(M + Mp)
      - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(2 * D - 4 * Mp), 360);

    const sunLon = solarPosition(d).lambda;
    const elong = mod(moonLon - sunLon, 360);         // 0 = new, 180 = full
    const phase = elong / 360;
    const illumination = (1 - Math.cos(elong * D2R)) / 2;
    const waxing = elong < 180;
    return {
      phase: phase,
      age: phase * SYNODIC,
      illumination: illumination,
      elongation: elong,
      name: phaseName(phase, illumination, waxing),
      waxing: waxing
    };
  };

  function phaseName(phase, illumination, waxing) {
    if (illumination < 0.03) return 'New moon';
    if (illumination > 0.97) return 'Full moon';
    if (Math.abs(phase - 0.25) < 0.035) return 'First quarter';
    if (Math.abs(phase - 0.75) < 0.035) return 'Last quarter';
    if (waxing) return illumination < 0.5 ? 'Waxing crescent' : 'Waxing gibbous';
    return illumination < 0.5 ? 'Waning crescent' : 'Waning gibbous';
  }

  /** Simple solunar-style quality hint (moon overhead/underfoot approximations). */
  S.huntingLight = function (now, solar) {
    if (!solar) return { state: 'unknown', text: 'No sun data' };
    if (solar.polar === 'day') return { state: 'day', text: 'Midnight sun — daylight all day' };
    if (solar.polar === 'night') return { state: 'night', text: 'Polar night — no sunrise today' };
    const t = now.getTime();
    if (t < solar.dawn.getTime()) return { state: 'night', text: 'Night (nautical dark)' };
    if (t < solar.sunrise.getTime()) return { state: 'twilight', text: 'Civil twilight (pre-dawn)' };
    if (t > solar.dusk.getTime()) return { state: 'night', text: 'Night (after dusk)' };
    if (t > solar.sunset.getTime()) return { state: 'twilight', text: 'Civil twilight (after sunset)' };
    return { state: 'day', text: 'Daylight' };
  };
})();
