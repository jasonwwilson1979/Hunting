"""Extra request handling for the native (Capacitor) clients.

The iOS/Android build serves the app from ``capacitor://localhost``, so it is a
different origin to this server: it needs CORS to call ``/api/`` at all, and it
cannot use the web app's session cookie. Both are solved here:

* a bearer token (issued by ``POST /api/token/``) authenticates API calls, and
* only the native origins listed in ``HUNTMAP_NATIVE_ORIGINS`` are allowed to make
  cross-origin calls (plus any you add), so this does not open the API to random
  websites.
"""
import hashlib
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

ALLOWED_HEADERS = "Authorization, Content-Type, Accept, X-HuntMap-Token, X-Requested-With"
ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
TOUCH_AFTER = timedelta(hours=1)


def _origins():
    raw = getattr(settings, "HUNTMAP_NATIVE_ORIGINS", "") or ""
    if isinstance(raw, (list, tuple)):
        return [o.strip() for o in raw if o and o.strip()]
    return [o.strip() for o in raw.split(",") if o.strip()]


def token_hash(raw):
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class NativeApiMiddleware:
    """CORS + bearer-token authentication, scoped to /api/ only."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ""
        if not path.startswith("/api/"):
            # Everything else (the app shell, tiles, admin, licence page) keeps the
            # normal cookie/session behaviour; a token must never reach /admin/.
            return self.get_response(request)

        origin = request.headers.get("Origin", "")
        allowed = origin and origin in _origins()
        if allowed:
            request._huntmap_cors = origin

        if request.method == "OPTIONS":
            # Preflight: answer here, without touching a view.
            response = self._preflight()
        else:
            self._authenticate(request)
            response = self.get_response(request)

        if allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Headers"] = ALLOWED_HEADERS
            response["Access-Control-Allow-Methods"] = ALLOWED_METHODS
            response["Access-Control-Max-Age"] = "600"
            response["Vary"] = "Origin"
        return response

    def _preflight(self):
        from django.http import HttpResponse
        return HttpResponse(status=204)

    def _authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.lower().startswith("bearer "):
            return
        raw = header[7:].strip()
        if len(raw) < 20:
            return
        from maps.models import ApiToken      # import here: apps are ready by now
        now = timezone.now()
        try:
            token = ApiToken.objects.select_related("owner").get(key_hash=token_hash(raw))
        except ApiToken.DoesNotExist:
            return
        if not token.is_valid(now) or not token.owner.is_active:
            return
        request.user = token.owner
        request._huntmap_token = token
        if not token.last_used_at or now - token.last_used_at > TOUCH_AFTER:
            ApiToken.objects.filter(pk=token.pk).update(last_used_at=now)
