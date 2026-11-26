#!/usr/bin/env bash
# End-to-end check of the HuntMap container image.
# Requires Docker; does not need Playwright.
#
#   tests/e2e_docker.sh              build, run, test both modes, clean up
#   KEEP=1 tests/e2e_docker.sh       leave the containers running
#   PORT=18443 IMAGE=huntmap:test    override defaults
#
# Phase 1: HTTPS container (the default self-signed setup).
# Phase 2: TLS terminated upstream (Cloudflare Tunnel / reverse proxy):
#          plain HTTP inside, X-Forwarded-Proto/Host trusted, pinned host name.
# Phase 3: custom ports via HUNTMAP_PORT / HUNTMAP_PUBLISH_PORT.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-huntmap:test}"
NAME="${NAME:-huntmap-e2e}"
VOLUME="${NAME}-data"
PORT="${PORT:-18443}"
BASE="https://127.0.0.1:${PORT}"
PROXY_NAME="${NAME}-proxy"
PROXY_VOLUME="${PROXY_NAME}-data"
PROXY_PORT="${PROXY_PORT:-18444}"
PROXY_BASE="http://127.0.0.1:${PROXY_PORT}"
REDIRECT_PORT="${REDIRECT_PORT:-18080}"   # plain http -> https redirect listener
PROXY_HOST="hunt.example.com"
CUSTOM_NAME="${NAME}-ports"
CUSTOM_VOLUME="${CUSTOM_NAME}-data"
CUSTOM_PORT="${CUSTOM_PORT:-19443}"      # published on the host
CUSTOM_INNER="${CUSTOM_INNER:-9443}"     # HUNTMAP_PORT inside the container

failures=0
check() { if [ "$2" -eq 0 ]; then echo "PASS  $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi; }
api() { curl -sk --max-time 60 "$@"; }                 # phase 1: https
app() { curl -s --max-time 60 -H "Host: ${PROXY_HOST}" -H 'X-Forwarded-Proto: https' "$@"; }  # phase 2: behind proxy

cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then
    docker rm -f "$NAME" "$PROXY_NAME" "$CUSTOM_NAME" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME" "$PROXY_VOLUME" "$CUSTOM_VOLUME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_healthy() {
  local container="$1" status=unknown
  for _ in $(seq 1 45); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo missing)"
    [ "$status" = "healthy" ] && break
    [ "$status" = "unhealthy" ] && break
    sleep 2
  done
  echo "$status"
}

echo "== building $IMAGE"
docker build -q -t "$IMAGE" "$ROOT" >/dev/null
check "image builds" $?

cleanup_reset() {
  docker rm -f "$NAME" "$PROXY_NAME" "$CUSTOM_NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" "$PROXY_VOLUME" "$CUSTOM_VOLUME" >/dev/null 2>&1 || true
}
cleanup_reset

echo "== phase 1: HTTPS container"
docker run -d --name "$NAME" \
  -p "127.0.0.1:${PORT}:8443" \
  -p "127.0.0.1:${REDIRECT_PORT}:8080" \
  -e HUNTMAP_SECRET_KEY=e2e-secret-key \
  -e HUNTMAP_ADMIN_USER=admin \
  -e HUNTMAP_ADMIN_PASSWORD=e2e-password \
  -e 'HUNTMAP_HOSTS=*' \
  -e "HUNTMAP_PUBLIC_PORT=${PORT}" \
  -v "${VOLUME}:/data" \
  "$IMAGE" >/dev/null
check "container starts" $?

status="$(wait_healthy "$NAME")"
check "container reports healthy ($status)" "$([ "$status" = healthy ]; echo $?)"

check "health endpoint" "$(api -o /dev/null -w '%{http_code}' "$BASE/api/health/" | grep -qx 200; echo $?)"
check "app shell served" "$(api "$BASE/" | grep -q '__HUNTMAP_SERVER__'; echo $?)"
check "static asset served" "$(api -o /dev/null -w '%{http_code}' "$BASE/js/app.js" | grep -qx 200; echo $?)"
check "plain http:// is redirected, not dropped" \
  "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${REDIRECT_PORT}/" | grep -qx 308; echo $?)"
check "redirect points at the published https port" \
  "$(curl -s -o /dev/null -w '%{redirect_url}' "http://127.0.0.1:${REDIRECT_PORT}/api/health/" \
     | grep -qx "https://127.0.0.1:${PORT}/api/health/"; echo $?)"
check "following the redirect reaches the app" \
  "$(curl -skL -o /dev/null -w '%{http_code}' "http://127.0.0.1:${REDIRECT_PORT}/api/health/" | grep -qx 200; echo $?)"
check "upload page needs login" "$(api -o /dev/null -w '%{http_code}' "$BASE/upload/" | grep -qx 302; echo $?)"
check "private files hidden" "$(api -o /dev/null -w '%{http_code}' "$BASE/README.md" | grep -qx 404; echo $?)"

echo "== uploading a map through the API"
uploaded="$(api -F "file=@${ROOT}/tests/sample-topo-map.pdf" -F "name=E2E Topo" "$BASE/api/maps/")"
check "upload accepted" "$(printf '%s' "$uploaded" | grep -q '"name": "E2E Topo"'; echo $?)"

listing="$(api "$BASE/api/maps/")"
check "map listed" "$(printf '%s' "$listing" | grep -q 'E2E Topo'; echo $?)"
check "sha256 computed" "$(printf '%s' "$uploaded" | grep -q '"sha256": "[0-9a-f]\{64\}"'; echo $?)"

bytes="$(api -o /tmp/huntmap-e2e-download.pdf -w '%{size_download}' "$BASE/api/maps/1/file")"
check "file downloads (${bytes} bytes)" "$([ "${bytes:-0}" -gt 100000 ]; echo $?)"

echo "== restarting to check the volume"
docker restart "$NAME" >/dev/null
status="$(wait_healthy "$NAME")"
check "healthy after restart" "$([ "$status" = healthy ]; echo $?)"
check "map survived the restart" "$(api "$BASE/api/maps/" | grep -q 'E2E Topo'; echo $?)"
check "admin user created" "$(docker exec "$NAME" python manage.py shell -c \
  "from django.contrib.auth import get_user_model; print(int(get_user_model().objects.filter(username='admin', is_superuser=True).exists()))" \
  2>/dev/null | tail -1 | grep -qx 1; echo $?)"

echo "== phase 2: TLS terminated upstream (Cloudflare Tunnel / proxy)"
docker run -d --name "$PROXY_NAME" \
  -p "127.0.0.1:${PROXY_PORT}:8000" \
  -e HUNTMAP_SECRET_KEY=e2e-secret-key \
  -e HUNTMAP_ADMIN_PASSWORD=e2e-password \
  -e "HUNTMAP_HOSTS=${PROXY_HOST}" \
  -e "HUNTMAP_ORIGINS=https://${PROXY_HOST}" \
  -e HUNTMAP_HTTPS=0 -e HUNTMAP_PORT=8000 \
  -e HUNTMAP_PROXY_SSL=1 -e HUNTMAP_FORWARDED_HOST=1 \
  -v "${PROXY_VOLUME}:/data" \
  "$IMAGE" >/dev/null
check "proxy-mode container starts" $?

status="$(wait_healthy "$PROXY_NAME")"
check "healthy with a pinned host name ($status)" "$([ "$status" = healthy ]; echo $?)"
check "plain HTTP app shell" "$(app "$PROXY_BASE/" | grep -q '__HUNTMAP_SERVER__'; echo $?)"

proxied="$(app -F "file=@${ROOT}/tests/sample-topo-map.pdf" -F "name=Proxied Topo" "$PROXY_BASE/api/maps/")"
check "upload accepted behind the proxy" "$(printf '%s' "$proxied" | grep -q 'Proxied Topo'; echo $?)"
check "file_url uses the public https origin" \
  "$(app "$PROXY_BASE/api/maps/" | grep -q "\"file_url\": \"https://${PROXY_HOST}/api/maps/1/file\""; echo $?)"
check "upload page redirects to login" \
  "$(app -o /dev/null -w '%{redirect_url}' "$PROXY_BASE/upload/" | grep -q '/admin/login/?next=/upload/'; echo $?)"

echo "== logging in through the proxy (CSRF + https origin)"
JAR="$(mktemp)"
LOGIN_HTML="$(mktemp)"
app -c "$JAR" "$PROXY_BASE/admin/login/" > "$LOGIN_HTML"
TOKEN="$(grep -o 'name="csrfmiddlewaretoken" value="[^"]*"' "$LOGIN_HTML" | head -1 | sed 's/.*value="//;s/"$//')"
check "login form rendered with a CSRF token" "$([ -n "$TOKEN" ]; echo $?)"
LOGIN_STATUS="$(app -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code}' \
  -H "Origin: https://${PROXY_HOST}" -H "Referer: https://${PROXY_HOST}/admin/login/" \
  --data-urlencode "csrfmiddlewaretoken=${TOKEN}" \
  --data-urlencode "username=admin" --data-urlencode "password=e2e-password" \
  --data-urlencode "next=/upload/" "$PROXY_BASE/admin/login/")"
check "login POST accepted behind the proxy (${LOGIN_STATUS}, not 403)" \
  "$([ "$LOGIN_STATUS" = 302 ]; echo $?)"
check "upload page opens once logged in" \
  "$(app -b "$JAR" -o /dev/null -w '%{http_code}' "$PROXY_BASE/upload/" | grep -qx 200; echo $?)"
rm -f "$JAR" "$LOGIN_HTML"

echo "== phase 3: custom ports (HUNTMAP_PORT=$CUSTOM_INNER, host $CUSTOM_PORT)"
docker run -d --name "$CUSTOM_NAME" \
  -p "127.0.0.1:${CUSTOM_PORT}:${CUSTOM_INNER}" \
  -e HUNTMAP_SECRET_KEY=e2e-secret-key \
  -e HUNTMAP_ADMIN_PASSWORD=e2e-password \
  -e 'HUNTMAP_HOSTS=*' \
  -e HUNTMAP_HTTPS=1 \
  -e "HUNTMAP_PORT=${CUSTOM_INNER}" \
  -v "${CUSTOM_VOLUME}:/data" \
  "$IMAGE" >/dev/null
check "custom-port container starts" $?

status="$(wait_healthy "$CUSTOM_NAME")"
check "healthy on container port ${CUSTOM_INNER} ($status)" "$([ "$status" = healthy ]; echo $?)"
check "reachable on host port ${CUSTOM_PORT}" \
  "$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1:${CUSTOM_PORT}/api/health/" | grep -qx 200; echo $?)"
check "gunicorn bound to ${CUSTOM_INNER} (not the default)" \
  "$(docker logs "$CUSTOM_NAME" 2>&1 | grep -q "Listening at: https://0.0.0.0:${CUSTOM_INNER}"; echo $?)"

echo
if [ "$failures" -eq 0 ]; then
  echo "All container checks passed (32 checks)."
  [ "${KEEP:-0}" = "1" ] && echo "Containers left running: $BASE/, $PROXY_BASE/, https://127.0.0.1:${CUSTOM_PORT}/"
else
  echo "$failures container check(s) failed."
  docker logs "$NAME" 2>&1 | tail -15
  docker logs "$PROXY_NAME" 2>&1 | tail -15
  docker logs "$CUSTOM_NAME" 2>&1 | tail -15
fi
exit "$failures"

