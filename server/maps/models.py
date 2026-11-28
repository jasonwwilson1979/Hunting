"""The map library: one row per map file, plus the georeference shared with phones."""
import hashlib
import mimetypes
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone

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


class SyncedSpot(models.Model):
    """A spot copied from a phone so every signed-in device sees it.

    ``remote_id`` is the id the app generated; ``updated_ms`` is the phone's
    ``updatedAt`` (epoch ms) and is what decides which copy wins.
    """

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="huntmap_spots")
    remote_id = models.CharField(max_length=64)
    name = models.CharField(max_length=190, blank=True)
    type = models.CharField(max_length=24, blank=True)
    notes = models.TextField(blank=True)
    lat = models.FloatField()
    lon = models.FloatField()
    alt = models.FloatField(null=True, blank=True)
    created_ms = models.BigIntegerField(default=0)
    updated_ms = models.BigIntegerField(default=0, db_index=True)
    deleted = models.BooleanField(default=False)

    class Meta:
        unique_together = [("owner", "remote_id")]
        ordering = ["name", "remote_id"]

    def __str__(self):
        return "%s (%s)" % (self.name or self.remote_id, self.type)


class SyncedTrack(models.Model):
    """A recorded track, same rules as SyncedSpot."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="huntmap_tracks")
    remote_id = models.CharField(max_length=64)
    name = models.CharField(max_length=190, blank=True)
    points = models.JSONField(default=list, blank=True)
    created_ms = models.BigIntegerField(default=0)
    updated_ms = models.BigIntegerField(default=0, db_index=True)
    deleted = models.BooleanField(default=False)

    class Meta:
        unique_together = [("owner", "remote_id")]
        ordering = ["name", "remote_id"]

    def __str__(self):
        return self.name or self.remote_id


class ApiToken(models.Model):
    """A long-lived token for a phone/tablet app.

    The web app uses a session cookie, which a native shell cannot share (it is a
    different origin: capacitor://localhost). A bearer token lets the iOS/Android
    build keep its bundled offline files *and* talk to this server.

    Only the SHA-256 of the key is stored, so a database copy cannot be replayed.
    """

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="huntmap_tokens")
    prefix = models.CharField(max_length=12, db_index=True, help_text="First characters, for the UI")
    key_hash = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=60, blank=True, help_text="e.g. iPhone 15")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Empty = no expiry")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return "%s (%s)" % (self.label or self.prefix, self.owner)

    def is_valid(self, now=None):
        now = now or timezone.now()
        return self.expires_at is None or self.expires_at > now


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

    # Where the map is, so a big library can be filtered by place.
    state = models.CharField(max_length=90, blank=True, db_index=True,
                             help_text="State / province, e.g. Vermont")
    county = models.CharField(max_length=90, blank=True, db_index=True,
                              help_text="County, e.g. Rutland")
    city = models.CharField(max_length=90, blank=True,
                            help_text="Town / city the map covers")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                              on_delete=models.SET_NULL, related_name="huntmap_documents",
                              help_text="Empty = shared with every account")

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

    @property
    def place(self):
        """'Vermont · Rutland · Killington' — only the parts that are filled in."""
        return " \u00b7 ".join(part for part in (self.state, self.county, self.city) if part)

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
