#!/usr/bin/env bash
# Submit a build to addons.mozilla.org.
#
# Credentials come from the environment, never from a file in this repository
# and never from the command line, where they would land in shell history:
#
#   export AMO_API_KEY='user:12345678:123'
#   export AMO_API_SECRET='...'
#
# Get both from https://addons.mozilla.org/developers/addon/api/key/
#
#   ./tools/submit-firefox.sh            # listed: public on AMO after review
#   ./tools/submit-firefox.sh unlisted   # unlisted: signed .xpi, self-install only
#
# The first submission of a new add-on still needs the web form at
# https://addons.mozilla.org/developers/addon/submit/ , because the listing
# text, screenshots and categories cannot be set through the API. Use this for
# every version after that one.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

channel="${1:-listed}"
if [[ "$channel" != "listed" && "$channel" != "unlisted" ]]; then
  echo "error: channel must be 'listed' or 'unlisted', got '$channel'" >&2
  exit 2
fi

: "${AMO_API_KEY:?set AMO_API_KEY (see the comment at the top of this script)}"
: "${AMO_API_SECRET:?set AMO_API_SECRET (see the comment at the top of this script)}"

version="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
name="$(python3 -c 'import json;print(json.load(open("manifest.json"))["name"])')"

echo "Submitting ${name} ${version} to the ${channel} channel."
echo

# Never ship a build that has not passed its own checks.
echo "==> unit tests"
npm test
echo "==> lint"
npx --yes web-ext lint --source-dir . \
  --ignore-files 'dist/**' 'test/**' 'tools/**' 'docs/**' 'store/**' 'node_modules/**'

echo "==> submitting"
npx --yes web-ext sign \
  --source-dir . \
  --artifacts-dir dist \
  --channel "$channel" \
  --api-key "$AMO_API_KEY" \
  --api-secret "$AMO_API_SECRET" \
  --ignore-files 'dist/**' 'test/**' 'tools/**' 'docs/**' 'store/**' 'node_modules/**' \
                 '.github/**' '*.md' 'package.json' 'package-lock.json'

echo
echo "Done. A listed submission is queued for review; AMO emails the outcome."
