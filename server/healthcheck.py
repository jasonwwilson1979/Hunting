#!/usr/bin/env python3
"""Container health probe: GET /api/health/ on localhost.

Tries the scheme/port from the environment first, then the HTTP and HTTPS
defaults, so a mismatched HUNTMAP_PORT (for example when TLS is terminated by a
Cloudflare Tunnel or another proxy) cannot make a working container look sick.
"""
import os
import ssl
import sys
import urllib.request

tls = os.environ.get("HUNTMAP_HTTPS", "1") == "1"
port = os.environ.get("HUNTMAP_PORT") or ("8443" if tls else "8000")

candidates = ["%s://127.0.0.1:%s/api/health/" % ("https" if tls else "http", port)]
for scheme, default_port in (("https", "8443"), ("http", "8000")):
    candidate = "%s://127.0.0.1:%s/api/health/" % (scheme, default_port)
    if candidate not in candidates:
        candidates.append(candidate)

for url in candidates:
    context = ssl._create_unverified_context() if url.startswith("https") else None
    try:
        with urllib.request.urlopen(url, timeout=6, context=context) as response:
            if response.status == 200:
                sys.exit(0)
    except Exception:
        continue

sys.exit(1)

