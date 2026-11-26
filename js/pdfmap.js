/* HuntMap — pdfmap.js
   Turn a PDF page (or photo/scan) into a georeferenced raster overlay:
   pdf.js rendering, image downscaling and 2-point similarity calibration. */
(function () {
  'use strict';
  const H = window.Hunt;
  const PM = H.PDFMap = {};
  const G = H.Geo, U = H.Util;

  PM.available = function () { return !!(window.pdfjsLib); };

  /** Point pdf.js at the worker (inline blob in the single-file build). */
  PM.setupWorker = function () {
    if (!window.pdfjsLib) return false;
    const inline = document.getElementById('pdfjs-worker-src');
    try {
      if (inline && inline.textContent && inline.textContent.length > 1000) {
        const blob = new Blob([inline.textContent], { type: 'text/javascript' });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      } else if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
      }
      return true;
    } catch (e) {
      console.warn('pdf worker setup failed', e);
      return false;
    }
  };

  PM.open = function (file) {
    if (!PM.available()) return Promise.reject(new Error('PDF engine is not loaded'));
    PM.setupWorker();
    return U.readFileBuffer(file).then(function (buf) {
      return window.pdfjsLib.getDocument({
        data: new Uint8Array(buf),
        isEvalSupported: false,
        disableAutoFetch: true,
        disableStream: true
      }).promise;
    }).then(function (doc) {
      return { doc: doc, pageCount: doc.numPages };
    });
  };

  /** Render one page to a PNG blob. maxPx = longest edge in pixels. */
  PM.renderPage = function (doc, pageNum, maxPx) {
    return doc.getPage(pageNum).then(function (page) {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(maxPx / Math.max(base.width, base.height), 8);
      const vp = page.getViewport({ scale: scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (!blob) { reject(new Error('Could not create the map image')); return; }
            resolve({ blob: blob, width: canvas.width, height: canvas.height,
              pageWidthPt: base.width, pageHeightPt: base.height });
          }, 'image/png');
        });
      });
    });
  };

  PM.decodeImage = function (blob) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That image could not be read')); };
      img.src = url;
    });
  };

  /* ------------------------------- TIFF ------------------------------- */
  PM.tiffAvailable = function () { return !!window.UTIF; };

  PM.isTiff = function (file) {
    const name = String((file && file.name) || '').toLowerCase();
    const type = String((file && file.type) || '').toLowerCase();
    return /\.tiff?$/.test(name) || type === 'image/tiff' || type === 'image/tif';
  };

  /**
   * Decode a TIFF (first page of a multi-page file) into a canvas.
   * Handles uncompressed, LZW, PackBits, JPEG and Deflate TIFFs (pako).
   */
  PM.tiffToCanvas = function (file, maxPx) {
    if (!window.UTIF) return Promise.reject(new Error('TIFF decoder not loaded'));
    return U.readFileBuffer(file).then(function (buf) {
      const ifds = window.UTIF.decode(buf);
      if (!ifds || !ifds.length) throw new Error('No images found inside this TIFF');
      const ifd = ifds[0];
      window.UTIF.decodeImage(buf, ifd);
      const w = ifd.width, h = ifd.height;
      if (!(w > 0) || !(h > 0)) throw new Error('This TIFF has no readable image data');
      if (w * h > 70e6) {
        throw new Error('This TIFF is ' + w + ' \u00d7 ' + h + ' px \u2014 too big for a phone. ' +
          'Resize it to about 3000 px first.');
      }
      const rgba = window.UTIF.toRGBA8 ? window.UTIF.toRGBA8(ifd) : window.UTIF.toRGBA(ifd);
      if (!rgba || !rgba.length) throw new Error('Could not decode the pixels in this TIFF');

      const full = document.createElement('canvas');
      full.width = w;
      full.height = h;
      const fctx = full.getContext('2d');
      const data = fctx.createImageData(w, h);
      data.data.set(rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba));
      fctx.putImageData(data, 0, 0);

      let dpi = 96;
      try {
        const xr = ifd['282'];                       // XResolution rational
        if (xr && xr.length >= 2 && xr[1]) {
          const v = xr[0] / xr[1];
          if (v > 20 && v < 2400) dpi = v;
        }
      } catch (e) { /* keep the 96 dpi default */ }

      const cap = maxPx || 3000;
      const scale = Math.min(1, cap / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      let out = full;
      if (scale < 0.999) {
        out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        const octx = out.getContext('2d');
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(full, 0, 0, cw, ch);
      }
      return {
        canvas: out, width: cw, height: ch,
        pageWidthPt: (w / dpi) * 72, pageHeightPt: (h / dpi) * 72
      };
    });
  };

  /** Decode any supported raster file to an Image or a canvas. */
  PM.decodeAny = function (file, maxPx) {
    if (PM.isTiff(file) && PM.tiffAvailable()) return PM.tiffToCanvas(file, maxPx);
    return PM.decodeImage(file).then(function (res) {
      return { img: res.img, url: res.url };
    }).catch(function (err) {
      // A TIFF with a wrong extension/type, or a browser that cannot show TIFF.
      if (PM.tiffAvailable()) return PM.tiffToCanvas(file, maxPx);
      throw err;
    });
  };

  /** Read any image/TIFF file, downscaling to maxPx, returning a JPEG blob. */
  PM.imageFromFile = function (file, maxPx) {
    const cap = maxPx || 3000;
    return PM.decodeAny(file, cap).then(function (res) {
      const src = res.img || res.canvas;
      const sw = src.width, sh = src.height;
      const scale = Math.min(1, cap / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, w, h);
      if (res.url) URL.revokeObjectURL(res.url);
      const pageWidthPt = res.pageWidthPt || (sw * 0.75);
      const pageHeightPt = res.pageHeightPt || (sh * 0.75);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Could not convert the image')); return; }
          resolve({ blob: blob, width: w, height: h,
            pageWidthPt: pageWidthPt, pageHeightPt: pageHeightPt });
        }, 'image/jpeg', 0.92);
      });
    });
  };

  /** Rotate a raster blob by any angle (90/180/270 are lossless-ish). */
  PM.rotateBlob = function (blob, degrees) {
    const deg = ((degrees % 360) + 360) % 360;
    return PM.decodeImage(blob).then(function (res) {
      const img = res.img;
      const rad = deg * Math.PI / 180;
      const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
      const w = Math.max(1, Math.round(img.width * cos + img.height * sin));
      const h = Math.max(1, Math.round(img.width * sin + img.height * cos));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rad);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      URL.revokeObjectURL(res.url);
      const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) {
          if (!b) { reject(new Error('Could not rotate the image')); return; }
          resolve({ blob: b, width: w, height: h, rotation: deg });
        }, type, 0.94);
      });
    });
  };
  /* ------------------------------ calibration ------------------------------ */
  function normAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  }
  PM.normAngle = normAngle;

  /**
   * Similarity transform from two image points with known lat/lon.
   * Returns {cx, cy, s, theta}: image centre in world px (zoom 0),
   * world px per image px, and rotation in radians.
   * opts.northUp keeps rotation at 0 (correct for nearly all paper maps);
   * opts.rotation (radians) adds a fine skew correction.
   */
  PM.calibrate2Points = function (imgW, imgH, p1, p2, opts) {
    const northUp = !!(opts && opts.northUp);
    const extra = (opts && isFinite(opts.rotation)) ? opts.rotation : 0;
    const w1 = G.toWorld(p1.lat, p1.lon);
    const w2 = G.toWorld(p2.lat, p2.lon);
    const du = p2.u - p1.u, dv = p2.v - p1.v;
    const dx = w2.x - w1.x, dy = w2.y - w1.y;
    const imgLen = Math.hypot(du, dv);
    const worldLen = Math.hypot(dx, dy);
    if (!(imgLen > 1) || !(worldLen > 1e-9)) return null;
    const s = worldLen / imgLen;
    const theta = normAngle((northUp ? 0 : Math.atan2(dy, dx) - Math.atan2(dv, du)) + extra);
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const du0 = p1.u - imgW / 2, dv0 = p1.v - imgH / 2;
    return {
      cx: w1.x - s * (du0 * cos - dv0 * sin),
      cy: w1.y - s * (du0 * sin + dv0 * cos),
      s: s,
      theta: theta
    };
  };

  /** Ground metres per image pixel for a calibration. */
  PM.metersPerPixel = function (calib) {
    if (!calib) return null;
    const lat = G.yToLat(calib.cy);
    return calib.s * (G.C * Math.cos(lat * G.DEG)) / G.WORLD;
  };

  PM.calibFromMetersPerPixel = function (imgW, imgH, mpp, lat, lon) {
    const world = G.toWorld(lat, lon);
    const groundPerWorldPx = (G.C * Math.cos(lat * G.DEG)) / G.WORLD;
    return { cx: world.x, cy: world.y, s: mpp / groundPerWorldPx, theta: 0 };
  };

  /** Calibration centred on a lat/lon using a paper scale such as 24000. */
  PM.calibFromPaperScale = function (imgW, imgH, paperScale, pageWidthPt, lat, lon) {
    const widthInches = (pageWidthPt || (imgW * 0.75)) / 72;
    const groundWidth = paperScale * widthInches * 0.0254;      // metres across the page
    return PM.calibFromMetersPerPixel(imgW, imgH, groundWidth / Math.max(1, imgW), lat, lon);
  };

  /** Rough placement so a freshly added map appears immediately. */
  PM.guessCalib = function (layer, lat, lon, paperScale, pageWidthPt) {
    const img = layer.img;
    if (!img) return null;
    if (paperScale) {
      return PM.calibFromPaperScale(img.width, img.height, paperScale, pageWidthPt, lat, lon);
    }
    // Unknown scale: assume the image spans about 6 km, easy to adjust by eye.
    return PM.calibFromMetersPerPixel(img.width, img.height, 6000 / Math.max(1, img.width), lat, lon);
  };

  /** Geographic bounding box of a calibrated overlay. */
  PM.bounds = function (layer) {
    const c = layer.calib, img = layer.img;
    if (!c || !img) return null;
    const cos = Math.cos(c.theta), sin = Math.sin(c.theta);
    const hw = img.width / 2, hh = img.height / 2;
    let north = -90, south = 90, east = -180, west = 180;
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(function (p) {
      const wx = c.cx + c.s * (p[0] * cos - p[1] * sin);
      const wy = c.cy + c.s * (p[0] * sin + p[1] * cos);
      const ll = G.toLatLon(wx, wy);
      north = Math.max(north, ll.lat); south = Math.min(south, ll.lat);
      east = Math.max(east, ll.lon); west = Math.min(west, ll.lon);
    });
    return { north: north, south: south, east: east, west: west };
  };

  /** Is a lat/lon inside the overlay image? */
  PM.contains = function (layer, lat, lon) {
    const img = layer.img, c = layer.calib;
    if (!img || !c) return false;
    const w = G.toWorld(lat, lon);
    const cos = Math.cos(c.theta), sin = Math.sin(c.theta);
    const dx = w.x - c.cx, dy = w.y - c.cy;
    const u = img.width / 2 + (dx * cos + dy * sin) / c.s;
    const v = img.height / 2 + (-dx * sin + dy * cos) / c.s;
    return u >= 0 && v >= 0 && u <= img.width && v <= img.height;
  };

  PM.describe = function (layer) {
    if (!layer || !layer.calib) return 'Not georeferenced';
    const mpp = PM.metersPerPixel(layer.calib);
    const lat = G.yToLat(layer.calib.cy), lon = G.xToLon(layer.calib.cx);
    const rot = layer.calib.theta * 180 / Math.PI;
    return U.fmtDistShort(mpp * 1000) + ' / 1000 px \u00b7 rot ' + rot.toFixed(1) + '\u00b0' +
      ' \u00b7 centre ' + G.fmtDD(lat, lon, 5);
  };
})();

