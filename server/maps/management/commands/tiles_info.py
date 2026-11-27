"""Report what base-map tiles this server can actually serve."""
from django.core.management.base import BaseCommand

from maps import tiles as tilelib


class Command(BaseCommand):
    help = "Show the self-hosted tile source: folder/MBTiles, zooms, tile count, credit."

    def handle(self, *args, **options):
        info = tilelib.metadata()
        local = tilelib.has_local_tiles()
        self.stdout.write("tiles url      : %s" % (tilelib.tile_url_template() if local else "(none)"))
        self.stdout.write("source         : %s" % (
            "external template" if tilelib_tile_url() else
            "mbtiles" if info["mbtiles"] else "directory" if local else "not configured"))
        if info["mbtiles"]:
            self.stdout.write("mbtiles        : %s" % tilelib.mbtiles_path())
        elif info["dir"]:
            files, zooms = tilelib.count_tiles()
            zoom_txt = ("z%d-%d" % (min(zooms), max(zooms))) if zooms else "no tiles yet"
            self.stdout.write("directory      : %s" % info["dir"])
            self.stdout.write("tile files     : %s (%s)" % (files, zoom_txt))
        self.stdout.write("max zoom       : %s" % info["maxzoom"])
        self.stdout.write("attribution    : %s" % info["attribution"])
        self.stdout.write("licence link   : %s" % info["attribution_url"])
        if not local:
            self.stdout.write(self.style.WARNING(
                "No tiles configured: the app will fall back to other base maps. "
                "Community tile servers must not carry paid traffic - see README."))


def tilelib_tile_url():
    from django.conf import settings
    return getattr(settings, "HUNTMAP_TILE_URL", "")
