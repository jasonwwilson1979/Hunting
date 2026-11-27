"""Self-hosted raster tiles.

For a paid/public site you must not lean on community tile servers, so the app
can read tiles from this server instead:

* a plain directory of ``z/x/y.png`` files (render once, rsync, done), or
* an ``.mbtiles`` archive (SQLite, the usual output of tile pipelines), or
* an external template in ``HUNTMAP_TILE_URL`` if you run a separate tile server.

Tiles rendered from OpenStreetMap data are a "Produced Work" under the ODbL: they
must carry "© OpenStreetMap contributors" and a link to
https://www.openstreetmap.org/copyright wherever the map is shown. ``meta()``
reports that string so the app can put it on screen.
"""
import os
import sqlite3
from pathlib import Path

from django.conf import settings

TILE_EXTS = ((".png", "image/png"), (".jpg", "image/jpeg"), (".webp", "image/webp"))
DEFAULT_ATTRIBUTION = "\u00a9 OpenStreetMap contributors"
DEFAULT_ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright"


def tiles_dir():
    return Path(getattr(settings, "HUNTMAP_TILES_DIR", "") or "").expanduser()


def mbtiles_path():
    raw = getattr(settings, "HUNTMAP_TILES_MBTILES", "") or ""
    return Path(raw).expanduser() if raw else None


def _looks_like_coords(z, x, y):
    try:
        z, x, y = int(z), int(x), int(y)
    except (TypeError, ValueError):
        return None
    if not (0 <= z <= 24):
        return None
    if not (0 <= x < (1 << z) and 0 <= y < (1 << z)):
        return None
    return z, x, y


def read_dir_tile(z, x, y):
    """Tile bytes from HUNTMAP_TILES_DIR, or (None, None)."""
    base = tiles_dir()
    if not base or not base.is_dir():
        return None, None
    for ext, ctype in TILE_EXTS:
        candidate = base / str(z) / str(x) / (str(y) + ext)
        try:
            if candidate.is_file():
                return candidate.read_bytes(), ctype
        except OSError:
            return None, None
    return None, None


def read_mbtiles_tile(z, x, y):
    """Tile bytes out of an .mbtiles archive (MBTiles stores y flipped: TMS)."""
    path = mbtiles_path()
    if not path or not path.is_file():
        return None, None
    row = (1 << z) - 1 - y
    uri = "file:%s?mode=ro" % path
    try:
        con = sqlite3.connect(uri, uri=True, timeout=5)
    except sqlite3.Error:
        return None, None
    try:
        cur = con.execute(
            "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
            (z, x, row))
        found = cur.fetchone()
    except sqlite3.Error:
        found = None
    finally:
        con.close()
    if not found:
        return None, None
    ctype = "image/png"
    try:
        con = sqlite3.connect(uri, uri=True, timeout=5)
        blob = con.execute("SELECT value FROM metadata WHERE name='format'").fetchone()
        con.close()
        if blob and blob[0]:
            fmt = str(blob[0]).lower()
            ctype = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                     "webp": "image/webp"}.get(fmt, "image/png")
    except sqlite3.Error:
        pass
    return found[0], ctype


def read_tile(z, x, y):
    """(bytes, content-type) for one tile, from the configured source."""
    coords = _looks_like_coords(z, x, y)
    if not coords:
        return None, None
    z, x, y = coords
    if mbtiles_path():
        data, ctype = read_mbtiles_tile(z, x, y)
        if data:
            return data, ctype
    return read_dir_tile(z, x, y)


def metadata():
    """What the app needs to know about the configured tile source."""
    info = {}
    path = mbtiles_path()
    if path and path.is_file():
        try:
            con = sqlite3.connect("file:%s?mode=ro" % path, uri=True, timeout=5)
            rows = con.execute("SELECT name, value FROM metadata").fetchall()
            con.close()
            info = {str(k): str(v) for k, v in rows}
        except sqlite3.Error:
            info = {}
    attribution = (getattr(settings, "HUNTMAP_TILE_ATTRIBUTION", "") or
                   info.get("attribution") or DEFAULT_ATTRIBUTION)
    return {
        "attribution": attribution,
        "attribution_url": getattr(settings, "HUNTMAP_ATTRIBUTION_URL",
                                   DEFAULT_ATTRIBUTION_URL),
        "minzoom": int(info.get("minzoom") or 0),
        "maxzoom": int(info.get("maxzoom") or getattr(settings, "HUNTMAP_TILE_MAXZOOM", 16)),
        "mbtiles": bool(path and path.is_file()),
        "dir": str(tiles_dir()) if tiles_dir() else "",
        "name": info.get("name") or "Self-hosted tiles",
        "format": info.get("format") or "png",
    }


def has_local_tiles():
    """True when this server can actually answer /tiles/ (or delegates elsewhere)."""
    if getattr(settings, "HUNTMAP_TILE_URL", ""):
        return True
    path = mbtiles_path()
    if path and path.is_file():
        return True
    base = tiles_dir()
    return bool(base and base.is_dir() and any(base.iterdir()))


def count_tiles():
    """(files, zooms) for the tiles directory - used by the tiles_info command."""
    base = tiles_dir()
    files = 0
    zooms = []
    if base and base.is_dir():
        for zdir in sorted(base.iterdir()):
            if not zdir.is_dir() or not zdir.name.isdigit():
                continue
            n = sum(len([f for f in sub.iterdir() if f.suffix.lower() in
                         (ext for ext, _ in TILE_EXTS)])
                    for sub in zdir.iterdir() if sub.is_dir())
            if n:
                zooms.append(int(zdir.name))
                files += n
    return files, zooms


def tile_url_template():
    """Where the app should fetch tiles from."""
    override = getattr(settings, "HUNTMAP_TILE_URL", "") or ""
    if override:
        return override
    return "/tiles/{z}/{x}/{y}.png"
