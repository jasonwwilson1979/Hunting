#!/usr/bin/env python3
"""Check the compose files' port/env plumbing without starting containers.

    python3 tests/check_compose.py

Renders each stack with `docker compose config --format json` under different
environment variables and asserts what would actually be published, mapped and
passed to the container. Needs Docker with the compose plugin; no network.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAN = "docker-compose.yml"
GHCR = "docker-compose.ghcr.yml"
TUNNEL = "docker-compose.cloudflare.yml"

failures = []


def render(compose_file, **env):
    """Return the resolved compose model for a file with extra env vars."""
    merged = {k: v for k, v in os.environ.items() if not k.startswith("HUNTMAP_")}
    merged.update({k: str(v) for k, v in env.items()})
    result = subprocess.run(
        ["docker", "compose", "-f", compose_file, "config", "--format", "json"],
        cwd=ROOT, env=merged, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError("%s failed:\n%s" % (compose_file, result.stderr.strip()))
    return json.loads(result.stdout)


def check(name, condition, detail=""):
    if condition:
        print("PASS  %s" % name)
    else:
        print("FAIL  %s %s" % (name, detail))
        failures.append(name)


def published(model, service="huntmap"):
    """[(published, target)] for a service."""
    return [(p.get("published"), p.get("target")) for p in model["services"][service].get("ports", [])]


def env_of(model, service="huntmap"):
    return model["services"][service].get("environment") or {}


def main():
    model = render(LAN)
    ports = published(model)
    check("lan defaults publish 8443 -> 8443", ports[0] == ("8443", 8443), ports)
    check("lan publishes the http->https redirect on 8080",
          ("8080", 8080) in ports, ports)
    check("lan redirect points at the published port",
          env_of(model)["HUNTMAP_PUBLIC_PORT"] == "8443", env_of(model).get("HUNTMAP_PUBLIC_PORT"))
    check("lan defaults to TLS inside", env_of(model)["HUNTMAP_HTTPS"] == "1")

    model = render(LAN, HUNTMAP_PORT="595")
    ports = published(model)
    check("HUNTMAP_PORT=595 moves both sides", ports[0] == ("595", 595), ports)
    check("HUNTMAP_PORT=595 carries through to the app",
          env_of(model)["HUNTMAP_PORT"] == "595", env_of(model).get("HUNTMAP_PORT"))
    check("HUNTMAP_PORT=595 redirect targets 595",
          env_of(model)["HUNTMAP_PUBLIC_PORT"] == "595", env_of(model).get("HUNTMAP_PUBLIC_PORT"))

    model = render(LAN, HUNTMAP_PUBLISH_PORT="9443")
    check("HUNTMAP_PUBLISH_PORT only moves the host side",
          published(model)[0] == ("9443", 8443), published(model))
    check("redirect follows the published port",
          env_of(model)["HUNTMAP_PUBLIC_PORT"] == "9443", env_of(model).get("HUNTMAP_PUBLIC_PORT"))

    model = render(LAN, HUNTMAP_PUBLISH_PORT="9443", HUNTMAP_PORT="9000")
    check("both ports set explicitly", published(model)[0] == ("9443", 9000), published(model))

    model = render(LAN, HUNTMAP_HTTPS="0", HUNTMAP_PORT="8000")
    check("plain-HTTP mode is passed through", env_of(model)["HUNTMAP_HTTPS"] == "0")

    model = render(GHCR)
    check("ghcr defaults publish 8443 -> 8443", published(model)[0] == ("8443", 8443), published(model))
    check("ghcr publishes the redirect port", ("8080", 8080) in published(model), published(model))

    model = render(TUNNEL, CLOUDFLARE_TUNNEL_TOKEN="dummy")
    check("tunnel stack publishes no ports", published(model) == [], published(model))
    tunnel_env = env_of(model)
    check("tunnel stack speaks plain HTTP on 8000",
          (tunnel_env["HUNTMAP_HTTPS"], tunnel_env["HUNTMAP_PORT"]) == ("0", "8000"), tunnel_env)
    check("tunnel stack trusts the proxy headers",
          (tunnel_env["HUNTMAP_PROXY_SSL"], tunnel_env["HUNTMAP_FORWARDED_HOST"]) == ("1", "1"), tunnel_env)
    check("tunnel stack disables the redirect listener",
          tunnel_env["HUNTMAP_REDIRECT_PORT"] == "0", tunnel_env.get("HUNTMAP_REDIRECT_PORT"))
    check("tunnel stack runs cloudflared",
          "cloudflared" in model["services"], list(model["services"]))
    check("cloudflared gets the token",
          env_of(model, "cloudflared")["TUNNEL_TOKEN"] == "dummy", env_of(model, "cloudflared"))

    model = render(TUNNEL, CLOUDFLARE_TUNNEL_TOKEN="dummy", HUNTMAP_PORT="9000")
    check("tunnel internal port is configurable",
          env_of(model)["HUNTMAP_PORT"] == "9000", env_of(model).get("HUNTMAP_PORT"))

    print()
    if failures:
        print("%d compose check(s) failed" % len(failures))
        return 1
    print("All compose checks passed (20 checks).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
