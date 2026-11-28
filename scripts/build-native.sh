#!/bin/sh
# Copy the web app into www/ for the Capacitor (iOS/Android) shell.
#
#   sh scripts/build-native.sh && npx cap sync
#
# Only the runtime files go in: no server/, no tests, no docs. The service worker
# is left out on purpose - the app detects the native shell and never registers it
# (capacitor:// has no service-worker support), because the files are already
# inside the app bundle.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WWW="$ROOT/www"

rm -rf "$WWW"
mkdir -p "$WWW"

for item in index.html manifest.webmanifest css js vendor icons; do
    cp -R "$ROOT/$item" "$WWW/"
done

# The native build needs the version file and no sw.js reference problems: keep
# js/version.js (copied with js/) and drop the worker registration is handled in
# app.js by H.Native.available.
printf 'HuntMap native bundle: %s\n' "$(date -u +%Y-%m-%dT%H:%MZ)" > "$WWW/BUILD.txt"

# A tiny sanity check, so a broken copy fails here rather than in Xcode.
for need in index.html js/app.js js/zones.js js/native.js css/app.css vendor/pdfjs/pdf.min.js; do
    if [ ! -e "$WWW/$need" ]; then
        echo "build-native: missing $need" >&2
        exit 1
    fi
done

echo "www/ ready ($(du -sh "$WWW" | cut -f1))"
