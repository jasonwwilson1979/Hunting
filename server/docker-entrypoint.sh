#!/bin/sh
# HuntMap container entrypoint: prepare /data, migrate, create the admin user,
# then run gunicorn (HTTPS by default, because iOS needs it for GPS).
set -eu
cd "$(dirname "$0")"

DATA_DIR="${HUNTMAP_DATA_DIR:-/data}"
export HUNTMAP_DB="${HUNTMAP_DB:-$DATA_DIR/db.sqlite3}"
export HUNTMAP_MEDIA="${HUNTMAP_MEDIA:-$DATA_DIR/media}"
CERT_DIR="${HUNTMAP_CERT_DIR:-$DATA_DIR/certs}"
USE_TLS="${HUNTMAP_HTTPS:-1}"
PORT="${HUNTMAP_PORT:-$([ "$USE_TLS" = "1" ] && echo 8443 || echo 8000)}"
export HUNTMAP_PORT="$PORT"

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

mkdir -p "$HUNTMAP_MEDIA" "$CERT_DIR" 2>/dev/null || true
if [ ! -w "$DATA_DIR" ]; then
  log "ERROR: $DATA_DIR is not writable by uid $(id -u)."
  log "       With a bind mount, run on the host: sudo chown -R 10001:10001 <folder>"
  exit 1
fi

case "${HUNTMAP_SECRET_KEY:-}" in
  ""|"dev-only-insecure-key-change-me-please"|"change-me-to-a-long-random-string")
    log "WARNING: HUNTMAP_SECRET_KEY is not set to a strong random value."
    ;;
esac

log "Applying database migrations"
python manage.py migrate --noinput

if [ -n "${HUNTMAP_ADMIN_PASSWORD:-}" ]; then
  export HUNTMAP_ADMIN_USER="${HUNTMAP_ADMIN_USER:-admin}"
  python manage.py ensureadmin
else
  log "No admin password set: /upload/ and /admin/ stay closed."
  log "  Set HUNTMAP_ADMIN_PASSWORD, or create one later with:"
  log "  docker exec -it <container> python manage.py createsuperuser"
fi

WORKERS="${HUNTMAP_WORKERS:-1}"
THREADS="${HUNTMAP_THREADS:-8}"
TIMEOUT="${HUNTMAP_TIMEOUT:-180}"
BIND="${HUNTMAP_BIND:-0.0.0.0}"

if [ "$USE_TLS" = "1" ]; then
  if [ ! -s "$CERT_DIR/cert.pem" ] || [ ! -s "$CERT_DIR/key.pem" ]; then
    SAN="DNS:localhost,IP:127.0.0.1"
    if [ -n "${HUNTMAP_CERT_SAN:-}" ]; then SAN="$SAN,$HUNTMAP_CERT_SAN"; fi
    log "Generating a self-signed certificate in $CERT_DIR"
    openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
      -subj "/CN=huntmap.local" -addext "subjectAltName=$SAN" >/dev/null 2>&1
  fi
  log "HuntMap HTTPS on $BIND:$PORT"
  exec gunicorn huntmap_server.wsgi:application \
    --bind "$BIND:$PORT" \
    --workers "$WORKERS" --threads "$THREADS" --timeout "$TIMEOUT" \
    --access-logfile - --error-logfile - \
    --certfile "$CERT_DIR/cert.pem" --keyfile "$CERT_DIR/key.pem"
fi

log "HuntMap HTTP on $BIND:$PORT (put a TLS proxy in front for iPhone GPS)"
exec gunicorn huntmap_server.wsgi:application \
  --bind "$BIND:$PORT" \
  --workers "$WORKERS" --threads "$THREADS" --timeout "$TIMEOUT" \
  --access-logfile - --error-logfile -
