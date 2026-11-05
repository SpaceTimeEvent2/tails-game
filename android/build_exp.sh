#!/usr/bin/env bash
# Экспериментальная сборка: карта «Арена» с галочкой friendly fire. ./build_exp.sh КОД ИМЯ → dist/tails-exp-КОД.aab и .apk
# Основная сборка (build.sh) остаётся без неё. Пакет тот же: загружать только на дорожку внутреннего тестирования.
set -euo pipefail
cd "$(dirname "$0")"
CODE=${1:?код версии}; NAME=${2:?имя версии}
cp version.properties version.properties.keep
trap 'mv version.properties.keep version.properties; ./sync_web.sh >/dev/null' EXIT
printf 'CODE=%s\nNAME=%s\n' "$CODE" "$NAME" > version.properties
./sync_web.sh
sed -i 's/export const EXP_BUILD = false;/export const EXP_BUILD = true;/' app/src/main/assets/www/src/flags.js
G=${GRADLE:-$(ls ~/.gradle/wrapper/dists/gradle-8.14.3-all/*/gradle-8.14.3/bin/gradle | head -1)}
"$G" --no-daemon -q :app:bundleRelease :app:assembleRelease
mkdir -p dist
cp app/build/outputs/bundle/release/app-release.aab "dist/tails-exp-$CODE.aab"
cp app/build/outputs/apk/release/app-release.apk "dist/tails-exp-$CODE.apk"
echo "готово: dist/tails-exp-$CODE.aab (v$NAME, code $CODE)"
