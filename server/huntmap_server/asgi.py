"""ASGI entry point (optional; for daphne/uvicorn)."""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "huntmap_server.settings")

application = get_asgi_application()
