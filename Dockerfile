# HuntMap — the web app + the Django map library in one container.
#
# Build:  docker build -t huntmap .
# Run:    docker run -d -p 8443:8443 -v huntmap-data:/data huntmap
# Docs:   README.md -> "Deploy with Docker / Portainer"
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HUNTMAP_DB=/data/db.sqlite3 \
    HUNTMAP_MEDIA=/data/media \
    HUNTMAP_CERT_DIR=/data/certs \
    HUNTMAP_HTTPS=1 \
    HUNTMAP_PORT=8443 \
    HUNTMAP_ADMIN_USER=admin

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/huntmap

# Python deps first, so code changes don't bust the layer cache.
COPY server/requirements.txt ./server/requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r server/requirements.txt

# The app (static PWA) and the Django project, side by side:
#   /srv/huntmap/index.html  + css/ js/ vendor/ icons/
#   /srv/huntmap/server/     (settings use APP_DIR = parent of server/)
COPY index.html manifest.webmanifest sw.js ./
COPY css ./css
COPY js ./js
COPY vendor ./vendor
COPY icons ./icons
COPY server ./server

RUN useradd --uid 10001 --user-group --create-home --shell /usr/sbin/nologin huntmap \
    && mkdir -p /data/media /data/certs \
    && chown -R huntmap:huntmap /data /srv/huntmap \
    && chmod +x /srv/huntmap/server/docker-entrypoint.sh

USER huntmap
WORKDIR /srv/huntmap/server

EXPOSE 8443 8000 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD ["python", "/srv/huntmap/server/healthcheck.py"]

ENTRYPOINT ["/srv/huntmap/server/docker-entrypoint.sh"]
