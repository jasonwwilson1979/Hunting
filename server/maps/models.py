"""The map library: one row per map file, plus the georeference shared with phones."""
import hashlib
import mimetypes
from pathlib import Path

from django.db import models

ALLOWED_EXTS = {".pdf", ".tif", ".tiff", ".png", ".jpg", ".jpeg", ".webp"}
KIND_BY_EXT = {".pdf": "pdf", ".tif": "tiff", ".tiff": "tiff"}
CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def guess_kind(filename):
    return KIND_BY_EXT.get(Path(filename).suffix.lower(), "image")


def content_type_for(filename):
    ext = Path(filename).suffix.lower()
    return CONTENT_TYPES.get(ext) or mimetypes.guess_type(filename)[0] or "application/octet-stream"


class MapDocument(models.Model):
    """A map file (PDF, TIFF or image) kept on the PC for the phone to download."""

    KIND_CHOICES = [
        ("pdf", "PDF"),
        ("tiff", "TIFF"),
        ("image", "Image"),
    ]

    name = models.CharField(max_length=190, help_text="Shown on the phone")
    file = models.FileField(upload_to="maps/%Y/%m/")
    kind = models.CharField(max_length=8, choices=KIND_CHOICES, default="pdf", editable=False)
    ext = models.CharField(max_length=8, blank=True, editable=False)
    page = models.PositiveIntegerField(default=1, help_text="Page to use for multi-page PDFs")
    notes = models.TextField(blank=True)
    sha256 = models.CharField(max_length=64, blank=True, db_index=True, editable=False)
    size = models.BigIntegerField(default=0, editable=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Georeference, shared between devices (done once, used everywhere).
    calib = models.JSONField(null=True, blank=True, editable=False)
    calib_img_w = models.PositiveIntegerField(null=True, blank=True, editable=False)
    calib_img_h = models.PositiveIntegerField(null=True, blank=True, editable=False)
    calib_page = models.PositiveIntegerField(null=True, blank=True, editable=False)
    calib_updated_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self):
        return self.name

    @property
    def content_type(self):
        return content_type_for(self.file.name or self.ext)

    @property
    def download_name(self):
        stem = "".join(ch for ch in self.name if ch.isalnum() or ch in " ._-").strip() or "map"
        return stem + (self.ext or "")

    @property
    def size_mb(self):
        return round(self.size / 1048576, 1)

    def rehash(self):
        """Fill in kind/ext/size/sha256 from the uploaded file."""
        if not self.file:
            return
        try:
            self.file.open("rb")
        except Exception:
            pass
        digest = hashlib.sha256()
        size = 0
        for chunk in self.file.chunks():
            digest.update(chunk)
            size += len(chunk)
        try:
            self.file.close()
        except Exception:
            pass
        self.sha256 = digest.hexdigest()
        self.size = size
        self.kind = guess_kind(self.file.name)
        self.ext = Path(self.file.name).suffix.lower()

    def set_calibration(self, calib, img_w=None, img_h=None, page=None):
        self.calib = calib
        self.calib_img_w = img_w or None
        self.calib_img_h = img_h or None
        self.calib_page = page or None
        from django.utils import timezone

        self.calib_updated_at = timezone.now()
