"""Trust X-Forwarded-* headers from a local proxy/tunnel.

TLS often ends *before* Django: a Cloudflare tunnel, nginx/caddy on the host, or
Portainer's proxy. The browser then sends ``Origin: https://example.com`` while
Django computes ``http://example.com`` and every POST fails with

    CSRF verification failed. Request aborted.

Trusting the headers unconditionally would let anyone claim to be https, so they
are only honoured when the immediate peer is a loopback or private address - which
is exactly what a local proxy or cloudflared sidecar looks like (127.0.0.1,
172.17.0.1, 192.168.x.x). Requests arriving straight from the internet are never
affected.
"""
import ipaddress


def _first(value):
    """'https, http' -> 'https' (proxies may append their own chain)."""
    if not value:
        return ""
    return value.split(",")[0].strip().lower()


def _is_local(address):
    try:
        ip = ipaddress.ip_address((address or "").split("%")[0])
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_link_local


class TrustLocalProxyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        meta = request.META
        if _is_local(meta.get("REMOTE_ADDR", "")):
            proto = _first(meta.get("HTTP_X_FORWARDED_PROTO"))
            if proto in ("http", "https"):
                meta["wsgi.url_scheme"] = proto

            host = _first(meta.get("HTTP_X_FORWARDED_HOST"))
            if host:
                port = _first(meta.get("HTTP_X_FORWARDED_PORT"))
                if port and ":" not in host:
                    if not (proto == "https" and port == "443") and not (proto == "http" and port == "80"):
                        host = "%s:%s" % (host, port)
                meta["HTTP_HOST"] = host
                name, _, number = host.partition(":")
                meta["SERVER_NAME"] = name
                if number.isdigit():
                    meta["SERVER_PORT"] = number
        return self.get_response(request)
