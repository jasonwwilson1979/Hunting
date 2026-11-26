/* HuntMap — db.js
   Tiny IndexedDB wrapper (waypoints, tracks, map layers, blobs, settings).
   Falls back to in-memory storage if IndexedDB is unavailable. */
(function () {
  'use strict';
  const H = window.Hunt;
  const DB = H.DB = {};
  const NAME = 'huntmap';
  const VERSION = 1;
  const STORES = {
    waypoints: { keyPath: 'id' },
    tracks: { keyPath: 'id' },
    layers: { keyPath: 'id' },
    settings: { keyPath: 'id' },
    kv: { keyPath: null }
  };

  let dbPromise = null;
  let memory = null;
  DB.available = typeof indexedDB !== 'undefined';

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!DB.available) { reject(new Error('no-indexeddb')); return; }
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = function (ev) {
        const db = req.result;
        Object.keys(STORES).forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            const cfg = STORES[name];
            db.createObjectStore(name, cfg.keyPath ? { keyPath: cfg.keyPath } : { autoIncrement: false });
          }
        });
        if (ev.oldVersion === 0) {
          try {
            db.createObjectStore('__meta__', { keyPath: 'id' }).put({ id: 'init', at: Date.now() });
          } catch (e) { /* ignore */ }
        }
      };
      req.onsuccess = function () {
        const db = req.result;
        db.onversionchange = function () { try { db.close(); } catch (e) {} };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('idb-open-failed')); };
      req.onblocked = function () { /* other tab holding an old version */ };
    });
    return dbPromise;
  }

  function memoryStore() {
    if (memory) return memory;
    memory = {};
    Object.keys(STORES).forEach(function (n) { memory[n] = new Map(); });
    return memory;
  }

  function tx(storeName, mode) {
    return openDb().then(function (db) {
      return db.transaction(storeName, mode).objectStore(storeName);
    });
  }
  function reqAsPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  DB.get = function (store, key) {
    return tx(store, 'readonly').then(function (s) { return reqAsPromise(s.get(key)); })
      .catch(function () { return memoryStore()[store] ? memoryStore()[store].get(key) : undefined; });
  };
  DB.getAll = function (store) {
    return tx(store, 'readonly').then(function (s) { return reqAsPromise(s.getAll()); })
      .catch(function () { return memoryStore()[store] ? Array.from(memoryStore()[store].values()) : []; });
  };
  DB.put = function (store, value, key) {
    return tx(store, 'readwrite').then(function (s) {
      return reqAsPromise(key === undefined ? s.put(value) : s.put(value, key));
    }).catch(function () {
      const m = memoryStore()[store];
      if (m) m.set(key === undefined ? value.id : key, value);
      return value;
    });
  };
  DB.del = function (store, key) {
    return tx(store, 'readwrite').then(function (s) { return reqAsPromise(s.delete(key)); })
      .catch(function () { const m = memoryStore()[store]; if (m) m.delete(key); });
  };
  DB.clear = function (store) {
    return tx(store, 'readwrite').then(function (s) { return reqAsPromise(s.clear()); })
      .catch(function () { const m = memoryStore()[store]; if (m) m.clear(); });
  };

  DB.kvGet = function (key, dflt) {
    return DB.get('kv', key).then(function (v) { return v === undefined ? dflt : v; });
  };
  DB.kvSet = function (key, value) { return DB.put('kv', value, key); };
  DB.kvDel = function (key) { return DB.del('kv', key); };

  DB.blobGet = function (key) { return DB.kvGet('blob:' + key, null); };
  DB.blobSet = function (key, blob) { return DB.kvSet('blob:' + key, blob); };
  DB.blobDel = function (key) { return DB.kvDel('blob:' + key); };

  DB.ready = function () {
    return openDb().then(function () { return true; }).catch(function () { return false; });
  };

  DB.persist = function () {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persisted().then(function (already) {
        return already ? true : navigator.storage.persist();
      }).catch(function () { return false; });
    }
    return Promise.resolve(false);
  };

  DB.estimate = function () {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().catch(function () { return null; });
    }
    return Promise.resolve(null);
  };

  DB.memoryFallback = function () { return !!memory; };
})();
