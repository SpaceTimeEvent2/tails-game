#!/usr/bin/env bash
# Копирует веб-игру в assets/www (только то, что отдаёт сервер: *.html, *.css, src, assets, models, vendor/three нужные части)
set -euo pipefail
cd "$(dirname "$0")"; W=app/src/main/assets/www; rm -rf "$W"; mkdir -p "$W"
cp ../*.html ../*.css "$W"/; cp -r ../src ../assets ../models "$W"/
mkdir -p "$W/vendor/three/build" "$W/vendor/three/examples"
cp ../vendor/three/build/three.module.js "$W/vendor/three/build/"; cp -r ../vendor/three/examples/jsm "$W/vendor/three/examples/"
[ -f ../favicon.ico ] && cp ../favicon.ico "$W"/ || true
du -sh "$W"
