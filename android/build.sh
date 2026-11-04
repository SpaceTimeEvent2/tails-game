#!/usr/bin/env bash
# AAB «Хвостов» для Play: ./build.sh → dist/tails-<CODE>.aab (+ apk для проверки на телефоне)
set -euo pipefail
cd "$(dirname "$0")"; . ./version.properties
./sync_web.sh
G=${GRADLE:-$(ls ~/.gradle/wrapper/dists/gradle-8.14.3-all/*/gradle-8.14.3/bin/gradle | head -1)}
"$G" --no-daemon -q :app:bundleRelease :app:assembleRelease
mkdir -p dist
cp app/build/outputs/bundle/release/app-release.aab "dist/tails-$CODE.aab"
cp app/build/outputs/apk/release/app-release.apk "dist/tails-$CODE.apk"
echo "готово: dist/tails-$CODE.aab (v$NAME, code $CODE)"
