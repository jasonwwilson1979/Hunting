"""Import map files from the command line (great for a whole folder of maps).

    python3 manage.py addmap ~/Maps/*.pdf
    python3 manage.py addmap scan.tif --name "Elm Ridge 1:24000" --page 2
"""
import hashlib
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from maps.models import ALLOWED_EXTS, MapDocument


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Command(BaseCommand):
    help = "Add PDF/TIFF/image maps to the HuntMap library"

    def add_arguments(self, parser):
        parser.add_argument("paths", nargs="+", help="Files to import")
        parser.add_argument("--name", help="Name to show on the phone (single file only)")
        parser.add_argument("--page", type=int, default=1, help="PDF page to use (default 1)")
        parser.add_argument("--notes", default="", help="Notes for the map")
        parser.add_argument("--force", action="store_true",
                            help="Import even if an identical file is already stored")

    def handle(self, *args, **options):
        paths = [Path(p).expanduser() for p in options["paths"]]
        if options["name"] and len(paths) > 1:
            raise CommandError("--name only works with a single file")

        added = skipped = failed = 0
        for path in paths:
            if not path.is_file():
                self.stderr.write("missing file: %s" % path)
                failed += 1
                continue
            ext = path.suffix.lower()
            if ext not in ALLOWED_EXTS:
                self.stderr.write("unsupported type %s: %s" % (ext or "(none)", path.name))
                failed += 1
                continue

            digest = file_sha256(path)
            if not options["force"]:
                existing = MapDocument.objects.filter(sha256=digest).first()
                if existing:
                    self.stdout.write(self.style.WARNING(
                        'skipped "%s" (identical file already stored as #%s)'
                        % (path.name, existing.pk)))
                    skipped += 1
                    continue

            name = (options["name"] or path.stem)[:190]
            doc = MapDocument(name=name, page=max(1, options["page"]), notes=options["notes"])
            with path.open("rb") as handle:
                doc.file.save(path.name, File(handle), save=False)
            doc.rehash()
            doc.save()
            self.stdout.write(self.style.SUCCESS(
                'added "%s" (%s, %.1f MB) as #%s'
                % (doc.name, doc.kind, doc.size / 1048576, doc.pk)))
            added += 1

        self.stdout.write("done: %d added, %d skipped, %d failed" % (added, skipped, failed))
