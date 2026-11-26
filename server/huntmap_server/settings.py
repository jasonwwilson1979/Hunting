"""
Django settings for the HuntMap server.

The server does two jobs:
  * serves the HuntMap web app (the folder above this one) at "/"
  * stores map files (PDF / TIFF / images) in a library the phone can download

Environment variables (all optional):
  HUNTMAP_SECRET_KEY   secret key (a dev default is used if unset)
  HUNTMAP_DEBUG=1      Django debug mode (off by default)
  HUNTMAP_HOSTS        comma separated allowed hosts (default *)
  HUNTMAP_DB           sqlite file path (default server/db.sqlite3)
  HUNTMAP_MEDIA        folder for uploaded map files (default server/media)
  HUNTMAP_TZ           timezone name (default UTC)
  HUNTMAP_TOKEN        if set, uploads / calibration writes need X-HuntMap-Token
  HUNTMAP_ORIGINS      extra CSRF trusted origins (comma separated)
  HUNTMAP_PROXY_SSL=1  trust X-Forwarded-Proto (behind nginx/caddy)
  HUNTMAP_FORWARDED_HOST=1  trust X-Forwarded-Host (behind a reverse proxy)
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # .../Hunting/server
APP_DIR = BASE_DIR.parent                                  # .../Hunting  (the web app)


def env(name, default=None):
    return os.environ.get(name, default)


def env_list(name, default=()):
    raw = os.environ.get(name, "")
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return values or list(default)


SECRET_KEY = env("HUNTMAP_SECRET_KEY", "dev-only-insecure-key-change-me-please")
DEBUG = env("HUNTMAP_DEBUG", "0") == "1"
ALLOWED_HOSTS = env_list("HUNTMAP_HOSTS", ["*"])
# Local probes (Docker HEALTHCHECK, uptime monitors) connect to 127.0.0.1, which is
# not the public host name when HUNTMAP_HOSTS is pinned behind a proxy or tunnel.
for _local_host in ("127.0.0.1", "localhost"):
    if _local_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_local_host)
HUNTMAP_TOKEN = env("HUNTMAP_TOKEN", "")
# 1 = only signed-in accounts see the library (each user sees their own maps plus
# shared ones); 0 = the LAN / single-user behaviour (everything visible).
HUNTMAP_REQUIRE_AUTH = env("HUNTMAP_REQUIRE_AUTH", "0") == "1"
HUNTMAP_APP_DIR = str(APP_DIR)
HUNTMAP_MAX_UPLOAD = int(env("HUNTMAP_MAX_UPLOAD", str(300 * 1024 * 1024)))

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "maps",
]

MIDDLEWARE = [
    # First: a local proxy/tunnel may terminate TLS (X-Forwarded-Proto/Host), and
    # everything below (CSRF, sessions, absolute URLs) must see the real scheme.
    "huntmap_server.middleware.TrustLocalProxyMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "huntmap_server.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "huntmap_server.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": env("HUNTMAP_DB", str(BASE_DIR / "db.sqlite3")),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = env("HUNTMAP_TZ", "UTC")
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "media/"
MEDIA_ROOT = Path(env("HUNTMAP_MEDIA", str(BASE_DIR / "media")))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/library/"
LOGOUT_REDIRECT_URL = "/accounts/login/"
X_FRAME_OPTIONS = "SAMEORIGIN"

# Big scanned maps: the request body can be large, files stream to disk.
FILE_UPLOAD_MAX_MEMORY_SIZE = 4 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = HUNTMAP_MAX_UPLOAD
DATA_UPLOAD_MAX_NUMBER_FILES = 40
CSRF_TRUSTED_ORIGINS = env_list("HUNTMAP_ORIGINS", [])

if env("HUNTMAP_PROXY_SSL") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = env("HUNTMAP_FORWARDED_HOST", "1") == "1"
if env("HUNTMAP_FORWARDED_HOST") == "1":
    USE_X_FORWARDED_HOST = True

# Read-only API is fine on a home LAN; keep cookies off it.
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
