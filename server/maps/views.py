"""Views: the web app files, the PC upload page, and the JSON API used by phones."""
import json
import math
import mimetypes
import time
from pathlib import Path

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.forms import UserCreationForm
from django.db import models
from django.db.models import Q
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods, require_POST, require_safe

from .forms import MapEditForm, MapUploadForm
from .models import ALLOWED_EXTS, MapDocument, SyncedSpot, SyncedTrack

APP_DIR = Path(settings.HUNTMAP_APP_DIR).resolve()
APP_SUBDIRS = {"css", "js", "icons", "vendor"}
APP_FILES = {"index.html", "manifest.webmanifest", "sw.js"}

CTYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
}


# --------------------------------------------------------------------------- app
@require_safe
def app_file(request, path=""):
    """Serve the HuntMap web app (index.html, js, css, vendor, icons)."""
    rel = (path or "index.html").strip("/")
    if not rel:
        rel = "index.html"
    parts = rel.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise Http404("Bad path")
    if parts[0] not in APP_SUBDIRS and rel not in APP_FILES:
        raise Http404("Not part of the app")

    full = (APP_DIR / rel).resolve()
    if full != APP_DIR and APP_DIR not in full.parents:
        raise Http404("Bad path")
    if not full.is_file():
        raise Http404("Missing file: %s" % rel)

    ctype = CTYPES.get(full.suffix.lower()) or mimetypes.guess_type(str(full))[0] or "application/octet-stream"

    if rel == "index.html":
        # Tell the app that a map server is present, so it never probes a
        # static host (which would log a 404).
        html = full.read_text(encoding="utf-8")
        marker = '<script>window.__HUNTMAP_SERVER__={upload:"/upload/"};</script>'
        if marker not in html:
            html = html.replace("</head>", marker + "\n</head>", 1)
        response = HttpResponse(html, content_type=ctype)
        response["Cache-Control"] = "no-cache"
        return response

    response = FileResponse(full.open("rb"), content_type=ctype)
    if rel == "sw.js":
        response["Service-Worker-Allowed"] = "/"
    if full.suffix.lower() in (".html", ".js", ".css", ".webmanifest"):
        response["Cache-Control"] = "no-cache"
    else:
        response["Cache-Control"] = "public, max-age=3600"
    return response


@require_safe
def favicon(request):
    return redirect("/icons/favicon-32.png", permanent=True)


# ------------------------------------------------------------------------ upload
staff_required = user_passes_test(
    lambda user: user.is_active and user.is_staff, login_url=None)


@staff_required
def upload_page(request):
    """Simple page for the PC: add maps and see what is in the library."""
    if request.method == "POST":
        form = MapUploadForm(request.POST, request.FILES)
        if form.is_valid():
            upload = form.cleaned_data["file"]
            doc = form.save(commit=False)
            # Store the file first, then hash it (rehash reads from storage).
            doc.file.save(Path(upload.name).name, upload, save=False)
            doc.rehash()
            doc.save()
            messages.success(request, 'Added "%s" (%s).' % (doc.name, doc.kind.upper()))
            return redirect("upload")
        messages.error(request, "Could not add that file \u2014 see the messages below.")
    else:
        form = MapUploadForm()

    docs = MapDocument.objects.all()
    return render(request, "maps/upload.html", {
        "form": form,
        "maps": docs,
        "total_mb": round(sum(d.size for d in docs) / 1048576, 1),
    })


# --------------------------------------------------------------------------- api
def _token_ok(request):
    token = getattr(settings, "HUNTMAP_TOKEN", "")
    if not token:
        return True
    return request.headers.get("X-HuntMap-Token") == token


def _num(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def map_json(request, doc):
    return {
        "id": doc.id,
        "name": doc.name,
        "kind": doc.kind,
        "ext": doc.ext,
        "page": doc.page,
        "size": doc.size,
        "notes": doc.notes,
        "state": doc.state,
        "county": doc.county,
        "city": doc.city,
        "place": doc.place,
        "owner": doc.owner.username if doc.owner else None,
        "sha256": doc.sha256,
        "updated": doc.updated_at.isoformat() if doc.updated_at else None,
        "file_url": request.build_absolute_uri(reverse("map-file", args=[doc.id])),
        "calib": doc.calib,
        "calib_at": doc.calib_updated_at.isoformat() if doc.calib_updated_at else None,
        "img_w": doc.calib_img_w,
        "img_h": doc.calib_img_h,
        "page_calibrated": doc.calib_page,
    }


# ------------------------------------------------------------------ accounts
def visible_maps(user):
    """Maps a request may see.

    * HUNTMAP_REQUIRE_AUTH=0 (default, home LAN): everything is visible.
    * signed in: shared maps (no owner) plus your own.
    * HUNTMAP_REQUIRE_AUTH=1 and anonymous: nothing.
    """
    if getattr(settings, "HUNTMAP_REQUIRE_AUTH", False):
        if not user.is_authenticated:
            return MapDocument.objects.none()
        return MapDocument.objects.filter(Q(owner__isnull=True) | Q(owner=user))
    if user.is_authenticated:
        return MapDocument.objects.filter(Q(owner__isnull=True) | Q(owner=user))
    return MapDocument.objects.all()


def can_edit(user, doc):
    if not user.is_authenticated:
        return False
    return user.is_staff or doc.owner_id == user.id


def _filtered(docs, query):
    """Apply the ?q= / ?state= / ?county= / ?city= filters from a request."""
    q = (query.get("q") or "").strip()
    if q:
        docs = docs.filter(
            Q(name__icontains=q) | Q(notes__icontains=q) | Q(city__icontains=q) |
            Q(county__icontains=q) | Q(state__icontains=q)
        )
    for field in ("state", "county", "city"):
        value = (query.get(field) or "").strip()
        if value:
            docs = docs.filter(**{field + "__iexact": value})
    return docs


def library_page(request):
    """Browse the library: search, filter by place, open or edit a map."""
    docs = _filtered(visible_maps(request.user), request.GET)
    states = (MapDocument.objects.exclude(state="")
              .values_list("state", flat=True).distinct().order_by("state"))
    counties = (MapDocument.objects.exclude(county="")
                .values_list("county", flat=True).distinct().order_by("county"))
    selected_state = (request.GET.get("state") or "").strip()
    county_pool = MapDocument.objects.exclude(county="")
    if selected_state:
        county_pool = county_pool.filter(state__iexact=selected_state)
    return render(request, "maps/library.html", {
        "maps": docs,
        "states": states,
        "counties": counties,
        "county_options": county_pool.values_list("county", flat=True).distinct().order_by("county"),
        "q": (request.GET.get("q") or "").strip(),
        "state": selected_state,
        "county": (request.GET.get("county") or "").strip(),
        "total_mb": round(sum(d.size for d in docs) / 1048576, 1),
        "require_auth": getattr(settings, "HUNTMAP_REQUIRE_AUTH", False),
    })


@login_required
def map_edit(request, pk):
    doc = get_object_or_404(MapDocument, pk=pk)
    if not can_edit(request.user, doc):
        return HttpResponse("This map belongs to another account.", status=403)
    if request.method == "POST":
        form = MapEditForm(request.POST, instance=doc)
        if form.is_valid():
            form.save()
            messages.success(request, 'Saved "%s".' % doc.name)
            return redirect("library")
    else:
        form = MapEditForm(instance=doc)
    return render(request, "maps/edit.html", {"form": form, "doc": doc})


def register(request):
    """Create a local account (no email confirmation, no external service)."""
    if request.method == "POST":
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            promoted = _bootstrap_admin(user)
            login(request, user)
            messages.success(request, "Welcome, %s. You are signed in.%s" % (
                user.username,
                " You are the first account, so this one is the administrator."
                if promoted else ""))
            return redirect("library")
    else:
        form = UserCreationForm()
    return render(request, "maps/register.html", {
        "form": form,
        "first_account": not _staff_exists(),
    })


def _staff_exists():
    User = get_user_model()
    return User.objects.filter(is_active=True, is_staff=True).exists()


def _bootstrap_admin(user):
    """The first account on a fresh server becomes the administrator.

    Without this, a deployment that forgot HUNTMAP_ADMIN_PASSWORD is a dead end:
    nobody can reach /admin/ or /upload/ and there is no way in from the UI.
    """
    if _staff_exists() and not user.is_staff:
        return False
    changed = False
    if not user.is_staff:
        user.is_staff = True
        changed = True
    if not user.is_superuser:
        user.is_superuser = True
        changed = True
    if changed:
        user.save(update_fields=["is_staff", "is_superuser"])
    return changed


# --------------------------------------------------------------------- upload


@require_GET
def api_health(request):
    """Lightweight health probe for Docker/Portainer (no auth, no writes)."""
    return JsonResponse({
        "ok": True,
        "server": "huntmap",
        "version": 3,
        "maps": MapDocument.objects.count(),
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_maps(request):
    """GET: the library list (supports ?q=&state=&county=). POST: upload a map."""
    if request.method == "POST":
        return _create_map(request)
    docs = _filtered(visible_maps(request.user), request.GET)
    return JsonResponse({
        "server": "huntmap",
        "version": 3,
        "user": request.user.username if request.user.is_authenticated else None,
        "require_auth": getattr(settings, "HUNTMAP_REQUIRE_AUTH", False),
        "maps": [map_json(request, doc) for doc in docs],
        "places": _places(),
    })


def _places():
    """State / county / city values that exist, for the app's filter menus."""
    def values(field):
        return sorted({value for value in
                       MapDocument.objects.exclude(**{field: ""}).values_list(field, flat=True)
                       if value})

    states = values("state")
    by_state = {}
    for state, county in (MapDocument.objects.exclude(county="")
                          .values_list("state", "county").distinct()):
        by_state.setdefault(state or "", set()).add(county)
    return {
        "states": states,
        "counties": values("county"),
        "cities": values("city"),
        "counties_by_state": {k: sorted(v) for k, v in by_state.items()},
    }


@csrf_exempt
@require_http_methods(["GET", "PATCH", "PUT", "POST"])
def api_map_detail(request, pk):
    """GET one map. PATCH/PUT/POST edit its metadata (name, page, place, notes)."""
    doc = get_object_or_404(MapDocument, pk=pk)
    if request.method == "GET":
        return JsonResponse(map_json(request, doc))
    if not (can_edit(request.user, doc) or
            (not request.user.is_authenticated and _token_ok(request))):
        return JsonResponse({"error": "Sign in as the owner to edit this map"}, status=403)
    try:
        payload = json.loads((request.body or b"{}").decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"error": "Body must be JSON"}, status=400)
    if not isinstance(payload, dict):
        return JsonResponse({"error": "Body must be a JSON object"}, status=400)

    def text(name, limit):
        value = payload.get(name)
        if value is None:
            return None
        return " ".join(str(value).split())[:limit]

    if "name" in payload:
        name = text("name", 190)
        if not name:
            return JsonResponse({"error": "name cannot be empty"}, status=400)
        doc.name = name
    if "page" in payload:
        try:
            doc.page = max(1, int(payload.get("page") or 1))
        except (TypeError, ValueError):
            return JsonResponse({"error": "page must be a number"}, status=400)
    if "notes" in payload:
        doc.notes = str(payload.get("notes") or "")[:5000]
    for field, limit in (("state", 90), ("county", 90), ("city", 90)):
        if field in payload:
            value = text(field, limit) or ""
            setattr(doc, field, " ".join(word.capitalize() for word in value.split()))
    doc.save()
    return JsonResponse(map_json(request, doc))


@csrf_exempt
@require_POST
def api_login(request):
    """Sign in from the app; the session cookie is what the rest of the API uses."""
    try:
        payload = json.loads((request.body or b"{}").decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError):
        payload = request.POST
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    User = get_user_model()

    user = authenticate(request, username=username, password=password)
    if user is None and username:
        # Be forgiving about "Admin" vs "admin" and about a stray trailing space
        # that a phone keyboard or a password manager can add.
        match = User.objects.filter(username__iexact=username).first()
        if match is not None:
            for candidate in {password, password.strip()}:
                user = authenticate(request, username=match.username, password=candidate)
                if user is not None:
                    break
    if user is None:
        if User.objects.filter(is_active=True).count() == 0:
            return JsonResponse({
                "error": "This server has no accounts yet. Create one, or set "
                         "HUNTMAP_ADMIN_PASSWORD and restart the container.",
                "code": "no-accounts",
            }, status=401)
        return JsonResponse({"error": "Wrong user name or password", "code": "bad-credentials"},
                            status=401)
    if not user.is_active:
        return JsonResponse({"error": "That account is disabled", "code": "inactive"}, status=401)
    login(request, user)
    return JsonResponse({"ok": True, "user": user.username,
                         "is_staff": user.is_staff,
                         "maps": visible_maps(user).count()})


@csrf_exempt
@require_POST
def api_logout(request):
    logout(request)
    return JsonResponse({"ok": True, "user": None})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_register(request):
    """Create an account from the app; signs the new user in."""
    try:
        payload = json.loads((request.body or b"{}").decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError):
        payload = request.POST
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    if len(password) < 8:
        return JsonResponse({"error": "Use at least 8 characters for the password"}, status=400)
    User = get_user_model()
    if not username or User.objects.filter(username__iexact=username).exists():
        return JsonResponse({"error": "That user name is taken"}, status=400)
    user = User.objects.create_user(username=username, password=password,
                                    email=(payload.get("email") or "").strip())
    promoted = _bootstrap_admin(user)
    login(request, user)
    return JsonResponse({"ok": True, "user": user.username, "is_staff": user.is_staff,
                         "first_account": promoted}, status=201)


def _ms(value, default=0):
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return default


def _spot_json(spot):
    return {
        "id": spot.remote_id, "name": spot.name, "type": spot.type, "notes": spot.notes,
        "lat": spot.lat, "lon": spot.lon, "alt": spot.alt,
        "createdAt": spot.created_ms, "updatedAt": spot.updated_ms, "deleted": spot.deleted,
    }


def _track_json(track):
    return {
        "id": track.remote_id, "name": track.name, "points": track.points or [],
        "createdAt": track.created_ms, "updatedAt": track.updated_ms, "deleted": track.deleted,
    }


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_sync(request):
    """Spots and tracks for the signed-in account.

    POST takes the phone's whole set and merges it (newest ``updatedAt`` wins,
    ``deleted: true`` removes), then answers with everything the account has - so
    a device only needs one round trip to push and pull.
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Sign in to sync spots and tracks",
                             "code": "auth-required"}, status=401)
    user = request.user

    if request.method == "POST":
        try:
            payload = json.loads((request.body or b"{}").decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            return JsonResponse({"error": "Body must be JSON"}, status=400)
        if not isinstance(payload, dict):
            return JsonResponse({"error": "Body must be a JSON object"}, status=400)

        for entry in payload.get("spots") or []:
            if not isinstance(entry, dict):
                continue
            remote_id = str(entry.get("id") or "").strip()[:64]
            lat, lon = _num(entry.get("lat")), _num(entry.get("lon"))
            if not remote_id or lat is None or lon is None:
                continue
            spot, created = SyncedSpot.objects.get_or_create(
                owner=user, remote_id=remote_id, defaults={"lat": lat, "lon": lon})
            updated = _ms(entry.get("updatedAt"))
            if not created and updated <= spot.updated_ms:
                continue                       # the copy on the server is newer
            spot.name = str(entry.get("name") or "")[:190]
            spot.type = str(entry.get("type") or "")[:24]
            spot.notes = str(entry.get("notes") or "")[:5000]
            spot.lat, spot.lon = lat, lon
            alt = _num(entry.get("alt"))
            spot.alt = alt
            spot.created_ms = _ms(entry.get("createdAt"), updated)
            spot.updated_ms = updated
            spot.deleted = bool(entry.get("deleted"))
            spot.save()

        for entry in payload.get("tracks") or []:
            if not isinstance(entry, dict):
                continue
            remote_id = str(entry.get("id") or "").strip()[:64]
            if not remote_id:
                continue
            points = entry.get("points") or []
            if not isinstance(points, list):
                points = []
            track, created_track = SyncedTrack.objects.get_or_create(
                owner=user, remote_id=remote_id)
            updated = _ms(entry.get("updatedAt"))
            if not created_track and updated <= track.updated_ms:
                continue
            track.name = str(entry.get("name") or "")[:190]
            track.points = points[:20000]
            track.created_ms = _ms(entry.get("createdAt"), updated)
            track.updated_ms = updated
            track.deleted = bool(entry.get("deleted"))
            track.save()

    return JsonResponse({
        "server_time": int(time.time() * 1000),
        "user": user.username,
        "spots": [_spot_json(s) for s in SyncedSpot.objects.filter(owner=user)],
        "tracks": [_track_json(t) for t in SyncedTrack.objects.filter(owner=user)],
    })


def _num(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


@require_GET
def api_diag(request):
    """What a deployment needs to know when a sign-in does not work."""
    User = get_user_model()
    staff = User.objects.filter(is_active=True, is_staff=True).count()
    users = User.objects.filter(is_active=True).count()
    return JsonResponse({
        "server": "huntmap",
        "version": 3,
        "users": users,
        "staff": staff,
        "accounts_ready": staff > 0,
        "hint": ("No administrator yet: open /accounts/register/ and the first account "
                 "becomes the admin, or set HUNTMAP_ADMIN_PASSWORD.") if staff == 0 else "",
        "require_auth": bool(getattr(settings, "HUNTMAP_REQUIRE_AUTH", False)),
        "maps": MapDocument.objects.count(),
        "maps_mine": (visible_maps(request.user).count()
                      if request.user.is_authenticated else None),
        "signed_in": request.user.username if request.user.is_authenticated else None,
        "session": request.session.session_key is not None,
        "spots": (SyncedSpot.objects.filter(owner=request.user, deleted=False).count()
                  if request.user.is_authenticated else None),
        "tracks": (SyncedTrack.objects.filter(owner=request.user, deleted=False).count()
                   if request.user.is_authenticated else None),
    })


@require_GET
def api_me(request):
    user = request.user
    return JsonResponse({
        "user": user.username if user.is_authenticated else None,
        "is_staff": bool(user.is_authenticated and user.is_staff),
        "require_auth": getattr(settings, "HUNTMAP_REQUIRE_AUTH", False),
        "maps": visible_maps(user).count() if user.is_authenticated else None,
    })


@require_GET
def api_map_file(request, pk):
    doc = get_object_or_404(visible_maps(request.user), pk=pk)
    try:
        handle = doc.file.open("rb")
    except (FileNotFoundError, OSError):
        raise Http404("The file for this map is missing on the server")
    response = FileResponse(handle, content_type=doc.content_type, filename=doc.download_name)
    response["Cache-Control"] = "private, max-age=0, must-revalidate"
    return response


def _create_map(request):
    if not _token_ok(request):
        return JsonResponse({"error": "Bad or missing token"}, status=403)
    upload = request.FILES.get("file")
    if not upload:
        return JsonResponse({"error": "Attach a file field named 'file'"}, status=400)
    ext = Path(upload.name).suffix.lower()
    if ext not in ALLOWED_EXTS:
        return JsonResponse({"error": "Use a PDF, TIFF, PNG, JPEG or WebP file"}, status=400)
    if upload.size > settings.HUNTMAP_MAX_UPLOAD:
        return JsonResponse({"error": "File too large"}, status=400)
    try:
        page = max(1, int(request.POST.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    doc = MapDocument(
        name=(request.POST.get("name") or Path(upload.name).stem)[:190],
        page=page,
        notes=request.POST.get("notes") or "",
        state=(request.POST.get("state") or "").strip()[:90],
        county=(request.POST.get("county") or "").strip()[:90],
        city=(request.POST.get("city") or "").strip()[:90],
        owner=request.user if request.user.is_authenticated else None,
    )
    for field in ("state", "county", "city"):
        setattr(doc, field, " ".join(word.capitalize() for word in getattr(doc, field).split()))
    # Store first, then hash — rehash() reads back from storage.
    doc.file.save(Path(upload.name).name, upload, save=False)
    doc.rehash()
    doc.save()
    return JsonResponse(map_json(request, doc), status=201)


@csrf_exempt
@require_http_methods(["PUT", "POST"])
def api_calibration(request, pk):
    """Store the georeference worked out on a phone, so every device reuses it."""
    if not _token_ok(request):
        return JsonResponse({"error": "Bad or missing token"}, status=403)
    doc = get_object_or_404(visible_maps(request.user), pk=pk)
    try:
        payload = json.loads((request.body or b"{}").decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"error": "Body must be JSON"}, status=400)

    calib = payload.get("calib")
    if not isinstance(calib, dict):
        return JsonResponse({"error": "calib object required"}, status=400)
    values = {key: _num(calib.get(key)) for key in ("cx", "cy", "s", "theta")}
    if any(value is None for value in values.values()):
        return JsonResponse({"error": "calib needs numeric cx, cy, s and theta"}, status=400)
    if values["s"] <= 0:
        return JsonResponse({"error": "calib.s must be positive"}, status=400)

    img_w = payload.get("img_w")
    img_h = payload.get("img_h")
    doc.set_calibration(
        {key: float(val) for key, val in values.items()},
        img_w=int(img_w) if isinstance(img_w, (int, float)) and img_w else None,
        img_h=int(img_h) if isinstance(img_h, (int, float)) and img_h else None,
        page=int(payload.get("page") or doc.page),
    )
    doc.save(update_fields=["calib", "calib_img_w", "calib_img_h", "calib_page",
                            "calib_updated_at", "updated_at"])
    return JsonResponse(map_json(request, doc))

