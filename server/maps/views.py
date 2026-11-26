"""Views: the web app files, the PC upload page, and the JSON API used by phones."""
import json
import math
import mimetypes
from pathlib import Path

from django.conf import settings
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods, require_safe

from .forms import MapUploadForm
from .models import ALLOWED_EXTS, MapDocument

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
@staff_member_required
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
        "sha256": doc.sha256,
        "updated": doc.updated_at.isoformat() if doc.updated_at else None,
        "file_url": request.build_absolute_uri(reverse("map-file", args=[doc.id])),
        "calib": doc.calib,
        "calib_at": doc.calib_updated_at.isoformat() if doc.calib_updated_at else None,
        "img_w": doc.calib_img_w,
        "img_h": doc.calib_img_h,
        "page_calibrated": doc.calib_page,
    }


@require_GET
def api_health(request):
    """Lightweight health probe for Docker/Portainer (no auth, no writes)."""
    return JsonResponse({
        "ok": True,
        "server": "huntmap",
        "version": 1,
        "maps": MapDocument.objects.count(),
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def api_maps(request):
    """GET: the library list. POST: upload a map (file, name, page, notes)."""
    if request.method == "POST":
        return _create_map(request)
    docs = MapDocument.objects.all()
    return JsonResponse({
        "server": "huntmap",
        "version": 1,
        "maps": [map_json(request, doc) for doc in docs],
    })


@require_GET
def api_map_detail(request, pk):
    return JsonResponse(map_json(request, get_object_or_404(MapDocument, pk=pk)))


@require_GET
def api_map_file(request, pk):
    doc = get_object_or_404(MapDocument, pk=pk)
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
    )
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
    doc = get_object_or_404(MapDocument, pk=pk)
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

