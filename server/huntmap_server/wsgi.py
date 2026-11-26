"""WSGI entry point (used by server/serve.py and any WSGI host)."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "huntmap_server.settings")

application = get_wsgi_application()
