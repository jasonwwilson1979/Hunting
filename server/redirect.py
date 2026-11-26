#!/usr/bin/env python3
"""Plain-HTTP listener that redirects browsers to the HTTPS port.

Typing "192.168.1.50:8443" in a browser, or a bookmark saved with http://, makes
the browser speak plain HTTP to the TLS port. gunicorn then logs

    [WARNING] Invalid request from ip=...: [SSL: HTTP_REQUEST] http request

and the page never loads. This listener answers on HUNTMAP_REDIRECT_PORT
(default 8080) and sends a 308 to the same host on the public HTTPS port, so
http://<host>:8080/ lands on https://<host>:8443/.

Environment:
  HUNTMAP_REDIRECT_PORT  port to listen on here (0 disables, handled by the entrypoint)
  HUNTMAP_PUBLIC_PORT    port to put in the https:// URL (default HUNTMAP_PORT)
  HUNTMAP_BIND           interface to bind (default 0.0.0.0)
"""
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BIND = os.environ.get("HUNTMAP_BIND") or "0.0.0.0"
LISTEN_PORT = int(os.environ.get("HUNTMAP_REDIRECT_PORT") or 8080)
TARGET_PORT = (os.environ.get("HUNTMAP_PUBLIC_PORT")
               or os.environ.get("HUNTMAP_PORT")
               or "8443")


class RedirectHandler(BaseHTTPRequestHandler):
    server_version = "HuntMapRedirect"

    def redirect(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0] or "localhost"
        location = "https://%s:%s%s" % (host, TARGET_PORT, self.path)
        self.send_response(308)
        self.send_header("Location", location)
        self.send_header("Connection", "close")
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = redirect

    def log_message(self, fmt, *args):
        sys.stdout.write("redirect %s -> https:// port %s\n" % (self.address_string(), TARGET_PORT))


def main():
    server = ThreadingHTTPServer((BIND, LISTEN_PORT), RedirectHandler)
    server.daemon_threads = True
    print("redirect: http://%s:%d/ -> https://<host>:%s/ (Ctrl+C to stop)"
          % (BIND, LISTEN_PORT, TARGET_PORT), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
