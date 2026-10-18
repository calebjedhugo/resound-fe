#!/usr/bin/env bash
#
# Upload a staged build (deploy/build-poc.mjs output) to the web root without
# breaking a page that is mid-load or holding the previous index.html: every
# file it names is still there.
#
#   1. New hashed assets, deleting nothing.
#   2. New and changed unhashed files (the puzzles), except index.html(.gz).
#   3. Record the previous deploy's assets and this one's (.deploy-assets) on
#      the server: from here either build's page may be live, so a deploy
#      that stops short of 5 leaves both for the next one to keep.
#   4. index.html: page loads use the new build from here on. Only then do
#      stale unhashed files go.
#   5. Record this deploy's asset list alone.
#   6. Prune the assets of deploys older than the previous one: keep this
#      deploy's and those the list recorded last time names.
#
# Plain rsync throughout (filter rules, no remote shell), and re-running is
# safe: an interrupted deploy just runs again (or a newer build does), and
# re-uploading the live build prunes nothing. Unhashed files are compared by
# content (--checksum: without -t the size+mtime quick check can skip a
# same-size file written in the same second) and keep their times when
# unchanged, so their ETags, and a returning player's 304s, survive a deploy
# that didn't touch them.
#
# Usage: deploy/upload.sh <staged-dir> <dest>   (dest: host:/path or a local path)
set -euo pipefail

STAGE="${1%/}"
DEST="${2%/}"
LIST=.deploy-assets

PREVIOUS="$(mktemp)"
BOTH="$(mktemp)"
trap 'rm -f "$PREVIOUS" "$BOTH"' EXIT

# None yet (the first deploy onto this root): nothing gets pruned
rsync -q --checksum "${DEST}/${LIST}" "$PREVIOUS" 2>/dev/null || : >"$PREVIOUS"

echo "==> 1/6 New hashed assets"
rsync -rlpvz --ignore-existing "${STAGE}/assets/" "${DEST}/assets/"

echo "==> 2/6 Unhashed files"
rsync -rlpvz --checksum --exclude=/assets/ --exclude="/${LIST}" --exclude='/index.html*' \
  "${STAGE}/" "${DEST}/"

echo "==> 3/6 Record the previous deploy's assets and this one's"
# No record yet: write none, so if this deploy stops, the next one prunes
# nothing, like a first deploy
if [ -s "$PREVIOUS" ]; then
  sort -u "$PREVIOUS" "${STAGE}/${LIST}" >"$BOTH"
  rsync -q --checksum "$BOTH" "${DEST}/${LIST}"
fi

echo "==> 4/6 index.html, then stale unhashed files"
rsync -rlpvz --checksum --delete-after --exclude=/assets/ --exclude="/${LIST}" \
  "${STAGE}/" "${DEST}/"

echo "==> 5/6 Record this deploy's assets"
rsync -q --checksum "${STAGE}/${LIST}" "${DEST}/${LIST}"

echo "==> 6/6 Prune assets older than the previous deploy"
if [ -s "$PREVIOUS" ] && ! cmp -s "$PREVIOUS" "${STAGE}/${LIST}"; then
  # Transfers nothing (--existing + --ignore-existing), only deletes:
  # excluded names (the previous deploy's) are protected
  rsync -rv --delete --existing --ignore-existing --exclude-from="$PREVIOUS" \
    "${STAGE}/assets/" "${DEST}/assets/"
else
  echo "    nothing to prune"
fi
