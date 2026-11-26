/* HuntMap — tiles.js
   Raster base maps: provider list, memory LRU, Cache-API storage for offline use,
   and a polite area downloader. */
(function () {
  'use strict';
  const H = window.Hunt;
  const T = H.Tiles = {};
  const G = H.Geo;

  T.PROVIDERS = {
    osm: {
      name: 'OpenStreetMap', short: 'OSM', sub: 'Community map \u00b7 public servers, limited use',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19,
      attribution: '\u00a9 OpenStreetMap contributors'
    },
    topo: {
      name: 'OpenTopoMap', short: 'Topo', sub: 'Contours and relief',
      url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png', maxZoom: 17,
      attribution: '\u00a9 OpenStreetMap, SRTM \u00b7 \u00a9 OpenTopoMap (CC-BY-SA)'
    },
    usgs_topo: {
      name: 'USGS Topo (US)', short: 'USGS', sub: 'Official US topo, public domain',
      url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 16, attribution: 'USGS The National Map'
    },
    usgs_img: {
      name: 'USGS Imagery (US)', short: 'Aerial', sub: 'Aerial imagery, public domain',
      url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 16, attribution: 'USGS The National Map'
    },
    esri_img: {
      name: 'Esri World Imagery', short: 'Sat', sub: 'Satellite, worldwide',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics'
    },
    esri_topo: {
      name: 'Esri World Topo', short: 'Topo', sub: 'Topo, worldwide',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 19, attribution: 'Esri, HERE, Garmin, USGS'
    },
    none: { name: 'None (PDF maps only)', short: 'Off', sub: 'Use only your own maps', url: null, maxZoom: 0, attribution: '' }
  };

  T.provider = function (id) { return T.PROVIDERS[id] || T.PROVIDERS.osm; };

  /** HTTP failure of the last tile request (403 = provider refused, see policy). */
  T.lastError = null;

  /**
   * Sensible default base map for a location. USGS topo is public domain and
   * caching-friendly, so prefer it in North America; OSM elsewhere.
   */
  T.defaultProviderFor = function (lat, lon) {
    if (lat != null && lon != null && lat > 14 && lat < 73 && lon > -170 && lon < -50) return 'usgs_topo';
    return 'osm';
  };

  T.tileUrl = function (providerId, z, x, y) {
    const p = T.provider(providerId);
    if (!p.url) return null;
    return p.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  };

  /* ------------------------------ cache ------------------------------ */
  const CACHE_NAME = 'huntmap-tiles-v1';
  let cachePromise = null;
  function getCache() {
    if (!('caches' in window)) return Promise.resolve(null);
    if (!cachePromise) cachePromise = caches.open(CACHE_NAME).catch(function () { return null; });
    return cachePromise;
  }

  /* ------------------------------ memory LRU ------------------------------ */
  const MEM_LIMIT = 480;
  const mem = new Map();          // url -> HTMLImageElement
  const pending = new Set();      // urls being fetched
  T.stats = { hits: 0, misses: 0, errors: 0 };

  function memGet(url) {
    const img = mem.get(url);
    if (!img) return null;
    mem.delete(url);
    mem.set(url, img);              // refresh recency
    return img;
  }
  function memSet(url, img) {
    if (mem.size >= MEM_LIMIT) {
      const first = mem.keys().next().value;
      mem.delete(first);
    }
    mem.set(url, img);
  }

  function loadImage(blob) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = 'async';
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode-failed')); };
      img.src = url;
    });
  }
  T.loadImage = loadImage;

  function loadImageDirect(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('img-failed')); };
      img.src = url;
    });
  }

  /**
   * Get a tile image. Resolves with an HTMLImageElement or null.
   * Order: memory → Cache API → network (and store in Cache API).
   */
  T.get = function (providerId, z, x, y) {
    const url = T.tileUrl(providerId, z, x, y);
    if (!url) return Promise.resolve(null);
    const hit = memGet(url);
    if (hit) { T.stats.hits++; return Promise.resolve(hit); }
    if (pending.has(url)) return Promise.resolve(null);

    return getCache().then(function (cache) {
      const cached = cache ? cache.match(url) : Promise.resolve(null);
      return cached;
    }).then(function (res) {
      if (res && res.ok) {
        return res.blob().then(loadImage).then(function (img) {
          memSet(url, img);
          T.stats.hits++;
          return img;
        });
      }
      if (navigator.onLine === false) { T.stats.misses++; return null; }
      return fetchTile(url).then(function (blob) {
        if (!blob) return null;
        return getCache().then(function (cache) {
          if (cache) {
            try { cache.put(url, new Response(blob, { headers: { 'Content-Type': 'image/png' } })); }
            catch (e) { /* quota */ }
          }
          return loadImage(blob).then(function (img) { memSet(url, img); return img; });
        });
      }).catch(function (err) {
        // HTTP refusals (403/404/429) must never be drawn: many tile servers
        // answer with an HTML "blocked" image, which looks like map data.
        if (err && err.status) {
          T.lastError = { provider: providerId, status: err.status, at: Date.now() };
          T.stats.errors++;
          if (T.onError) { try { T.onError(providerId, err.status); } catch (e) {} }
          return null;
        }
        // CORS-less providers: render directly, uncached.
        return loadImageDirect(url).then(function (img) { memSet(url, img); return img; })
          .catch(function () { T.stats.errors++; T.stats.misses++; return null; });
      });
    });
  };

  function fetchTile(url) {
    pending.add(url);
    return fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) {
        if (!r.ok) {
          const err = new Error('http-' + r.status);
          err.status = r.status;
          throw err;
        }
        return r.blob();
      })
      .then(function (blob) { pending.delete(url); return blob; })
      .catch(function (e) { pending.delete(url); throw e; });
  }
  /* -------------------------- tile enumeration -------------------------- */
  /** {x0, x1, y0, y1, cols, rows} for a geographic bounds at zoom z. */
  T.tileRange = function (bounds, z) {
    const n = Math.pow(2, z);
    const tx = function (lon) { return Math.floor(G.lonToX(G.wrapLon(lon)) * n / 256); };
    const ty = function (lat) { return Math.floor(G.latToY(lat) * n / 256); };
    let x0 = tx(bounds.west);
    let x1 = tx(bounds.east);
    if (bounds.east < bounds.west) x1 += n;          // antimeridian crossing
    x1 = Math.max(x1, x0);
    let y0 = Math.min(ty(bounds.north), ty(bounds.south));
    let y1 = Math.max(ty(bounds.north), ty(bounds.south));
    x0 = ((x0 % n) + n) % n;
    y0 = Math.max(0, Math.min(n - 1, y0));
    y1 = Math.max(0, Math.min(n - 1, y1));
    return { x0: x0, x1: x1, y0: y0, y1: y1, cols: x1 - x0 + 1, rows: y1 - y0 + 1, n: n };
  };

  T.estimate = function (bounds, minZoom, maxZoom) {
    let count = 0;
    const byZoom = [];
    for (let z = Math.max(2, minZoom | 0); z <= maxZoom; z++) {
      const r = T.tileRange(bounds, z);
      const c = r.cols * r.rows;
      byZoom.push({ zoom: z, count: c });
      count += c;
    }
    return { count: count, byZoom: byZoom, approxMB: count * 0.022 };
  };

  function buildList(bounds, minZoom, maxZoom, maxZoomLimit) {
    const list = [];
    for (let z = Math.max(2, minZoom | 0); z <= maxZoom; z++) {
      if (maxZoomLimit && z > maxZoomLimit) continue;
      const r = T.tileRange(bounds, z);
      for (let iy = 0; iy < r.rows; iy++) {
        for (let ix = 0; ix < r.cols; ix++) {
          list.push({ z: z, x: (r.x0 + ix) % r.n, y: r.y0 + iy });
        }
      }
    }
    return list;
  }

  T.MAX_DOWNLOAD = 2500;
  T._cancel = false;

  /**
   * Download tiles for a bounds/zoom range into the Cache API.
   * opts: {provider, bounds, minZoom, maxZoom, onProgress, onDone}
   */
  T.download = function (opts) {
    const prov = T.provider(opts.provider);
    if (!prov.url) return Promise.reject(new Error('No base map provider selected'));
    const list = buildList(opts.bounds, opts.minZoom, opts.maxZoom, prov.maxZoom);
    if (!list.length) return Promise.reject(new Error('No tiles in this area'));
    if (list.length > T.MAX_DOWNLOAD) list.length = T.MAX_DOWNLOAD;

    T._cancel = false;
    const total = list.length;
    let done = 0, failed = 0, cached = 0, idx = 0;
    const CONCURRENCY = 4;
    const progress = opts.onProgress || function () {};

    return getCache().then(function (cache) {
      return new Promise(function (resolve) {
        function next() {
          if (T._cancel) { resolve({ total: total, done: done, failed: failed, cached: cached, cancelled: true }); return; }
          if (idx >= list.length) {
            if (done >= total) resolve({ total: total, done: done, failed: failed, cached: cached, cancelled: false });
            return;
          }
          const t = list[idx++];
          const url = T.tileUrl(opts.provider, t.z, t.x, t.y);
          const skip = cache ? cache.match(url) : Promise.resolve(null);
          skip.then(function (hit) {
            if (hit) { cached++; done++; progress({ done: done, total: total, cached: cached, failed: failed }); next(); return; }
            return fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
              .then(function (r) {
                if (!r.ok) throw new Error('http-' + r.status);
                return r.blob().then(function (blob) {
                  if (cache) {
                    try { cache.put(url, new Response(blob, { headers: { 'Content-Type': 'image/png' } })); }
                    catch (e) { /* quota exceeded */ }
                  }
                });
              })
              .then(function () { done++; })
              .catch(function () { failed++; done++; })
              .then(function () {
                progress({ done: done, total: total, cached: cached, failed: failed });
                setTimeout(next, 30);           // be polite to the tile server
              });
          }).catch(function () { failed++; done++; next(); });
        }
        for (let i = 0; i < CONCURRENCY; i++) next();
      });
    });
  };

  T.cancelDownload = function () { T._cancel = true; };

  T.cachedCount = function () {
    return getCache().then(function (cache) {
      if (!cache) return 0;
      return cache.keys().then(function (keys) {
        return keys.filter(function (r) { return /\/\d+\/\d+\/\d+/.test(r.url); }).length;
      });
    }).catch(function () { return 0; });
  };

  T.clearCache = function () {
    mem.clear();
    if (!('caches' in window)) return Promise.resolve(false);
    return caches.delete(CACHE_NAME).then(function () { cachePromise = null; return true; }).catch(function () { return false; });
  };

  T.attribution = function (providerId) { return T.provider(providerId).attribution || ''; };
  /** Synchronous memory-cache lookup used by the map renderer. */
  T.memLookup = function (url) { return url ? memGet(url) : null; };
})();
