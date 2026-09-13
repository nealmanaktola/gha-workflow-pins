#!/usr/bin/env bash
# Build the upload zips for addons.mozilla.org and the Chrome Web Store.
# The same files serve both stores, so one archive is enough for each.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

version="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
out="dist"
mkdir -p "$out"
rm -f "$out"/*.zip

zip -qr "$out/gha-workflow-pins-$version.zip" \
  manifest.json src icons \
  -x '*.DS_Store'

cp "$out/gha-workflow-pins-$version.zip" "$out/gha-workflow-pins-$version-chrome.zip"

echo "Firefox (AMO): $out/gha-workflow-pins-$version.zip"
echo "Chrome Web Store: $out/gha-workflow-pins-$version-chrome.zip"
