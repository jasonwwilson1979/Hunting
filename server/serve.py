#!/usr/bin/env python3
"""
Run the HuntMap Django server on your LAN.

    python3 server/serve.py                 # https://<lan-ip>:8443  (what the iPhone needs)
    python3 server/serve.py --http          # http://<lan-ip>:8000   (PC only)
    python3 server/serve.py --port 9443

iOS only gives web pages GPS and service workers over HTTPS, so HTTPS is the
default here. A self-signed certificate is created in server/.certs on first
run; accept it once on the phone (Safari: Show Details -> visit this website).

This uses wsgiref + ssl from the standard library, so no gunicorn/nginx is
needed for a handful of devices at home.
"""
import argparse
import os
import socket
import ssl
import subprocess
import sys
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "huntmap_server.settings")

import django  # noqa: E402

django.setup()

from django.core.management import call_command  # noqa: E402
from django.core.wsgi import get_wsgi_application  # noqa: E402

CERT_DIR = os.path.join(HERE, ".certs")


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True
    allow_reuse_address = True


class QuietHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (self.address_string(), fmt % args))


def lan_ip():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def make_cert(ip):
    os.makedirs(CERT_DIR, exist_ok=True)
    cert = os.path.join(CERT_DIR, "cert.pem")
    key = os.path.join(CERT_DIR, "key.pem")
    if os.path.exists(cert) and os.path.exists(key):
        return cert, key
    print("Creating a self-signed certificate in server/.certs ...")
    command = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", key, "-out", cert, "-days", "825",
        "-subj", "/CN=huntmap.local",
        "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:%s" % ip,
    ]
    try:
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        sys.exit("Could not create a certificate with openssl: %s" % exc)
    return cert, key


def main():
    parser = argparse.ArgumentParser(description="Serve HuntMap (Django) on the LAN")
    parser.add_argument("--port", type=int, default=None, help="default 8443 (https) / 8000 (http)")
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--http", action="store_true", help="plain HTTP (no GPS on iOS)")
    parser.add_argument("--no-migrate", action="store_true", help="skip the migrate step")
    args = parser.parse_args()

    if not args.no_migrate:
        call_command("migrate", interactive=False, verbosity=0)

    scheme = "http" if args.http else "https"
    port = args.port or (8000 if args.http else 8443)
    ip = lan_ip()

    application = get_wsgi_application()
    httpd = make_server(args.bind, port, application,
                        server_class=ThreadingWSGIServer, handler_class=QuietHandler)

    if not args.http:
        cert, key = make_cert(ip)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    print()
    print("HuntMap server is running")
    print("  this PC : %s://localhost:%d/" % (scheme, port))
    if args.bind in ("0.0.0.0", ""):
        print("  phone   : %s://%s:%d/" % (scheme, ip, port))
    print("  library : %s://%s:%d/upload/  (log in as a staff user)" % (scheme, ip, port))
    if not args.http:
        print()
        print("Self-signed certificate: the phone warns once.")
        print("  Safari: 'Show Details' -> 'visit this website' -> Continue.")
        print("  Trust it permanently by installing server/.certs/cert.pem under")
        print("  Settings > General > About > Certificate Trust Settings.")
    else:
        print()
        print("Note: iOS blocks GPS and service workers on http:// LAN addresses.")
        print("Run without --http (default) when you use the phone.")
    print()
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
