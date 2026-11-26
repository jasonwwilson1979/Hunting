#!/usr/bin/env python3
"""
HuntMap development server.

GPS, service workers and offline caching need a "secure context":
https:// or http://localhost . To test on an iPhone over your local Wi-Fi,
run this with --https and accept the self-signed certificate once.

    python3 serve.py                  # http://localhost:8080 (desktop testing)
    python3 serve.py --https          # https on all interfaces, for the phone
    python3 serve.py --https --port 8443

Port, bind address and TLS can also come from the environment (same names the
container uses), and command line flags still win:

    HUNTMAP_PORT=9443 HUNTMAP_BIND=127.0.0.1 HUNTMAP_HTTPS=1 python3 serve.py

Self-signed certificates are created in .certs/ with openssl on first run.
"""
import argparse
import http.server
import os
import socket
import ssl
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
CERT_DIR = os.path.join(ROOT, ".certs")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".gpx": "application/gpx+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # No caching in development so edited files show up immediately.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def make_cert():
    os.makedirs(CERT_DIR, exist_ok=True)
    cert = os.path.join(CERT_DIR, "cert.pem")
    key = os.path.join(CERT_DIR, "key.pem")
    if os.path.exists(cert) and os.path.exists(key):
        return cert, key
    print("Creating a self-signed certificate in .certs/ ...")
    cmd = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", key, "-out", cert, "-days", "825",
        "-subj", "/CN=huntmap.local",
        "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:%s" % lan_ip(),
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        sys.exit("Could not create a certificate with openssl: %s" % exc)
    return cert, key


def main():
    ap = argparse.ArgumentParser(description="Serve HuntMap locally")
    ap.add_argument("--port", type=int, default=int(os.environ.get("HUNTMAP_PORT") or 0) or 8080,
                    help="default: $HUNTMAP_PORT, else 8080")
    ap.add_argument("--https", action="store_true", default=os.environ.get("HUNTMAP_HTTPS") == "1",
                    help="serve HTTPS (needed for phone GPS); also HUNTMAP_HTTPS=1")
    ap.add_argument("--http", dest="https", action="store_false", help="force plain HTTP")
    ap.add_argument("--bind", default=os.environ.get("HUNTMAP_BIND") or "0.0.0.0")
    args = ap.parse_args()

    server = http.server.ThreadingHTTPServer((args.bind, args.port), Handler)
    scheme = "http"
    if args.https:
        cert, key = make_cert()
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        server.socket = ctx.wrap_socket(server.socket, server_side=True)
        scheme = "https"

    ip = lan_ip()
    print()
    print("HuntMap is running")
    print("  desktop : %s://localhost:%d" % (scheme, args.port))
    if args.bind in ("0.0.0.0", ""):
        print("  iPhone  : %s://%s:%d" % (scheme, ip, args.port))
    if args.https:
        print()
        print("Self-signed certificate: the phone will warn once.")
        print("  Safari: 'Show Details' -> 'visit this website' -> Continue.")
        print("  (Or trust .certs/cert.pem in Settings > General > About >")
        print("   Certificate Trust Settings to silence the warning.)")
    else:
        print()
        print("Note: http:// on a LAN IP is NOT a secure context, so iPhone GPS and")
        print("service workers are blocked. Use --https when testing on the phone.")
    print()
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
