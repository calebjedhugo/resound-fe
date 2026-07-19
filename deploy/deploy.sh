#!/usr/bin/env bash
#
# Deploy the POC build of Resound to https://resound.calebhugo.com
#
#   1. Production build (Vite)                -> dist/
#   2. Stage POC-only artifact                -> deploy/dist-poc/
#   3. rsync to the Pi web root, served by nginx behind the calebhugo tunnel
#
# One-time infrastructure (nginx vhost, tunnel ingress, DNS) is documented in
# deploy/README.md and only needs to run once. This script is the repeatable
# content deploy.
#
# Usage:  ./deploy/deploy.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_HOST="chugo@hugopi"
WEBROOT="/var/www/resound.calebhugo.com/"

cd "$REPO"

echo "==> Building production bundle"
npm run build

echo "==> Staging POC-only artifact"
node deploy/build-poc.mjs

echo "==> Deploying to ${PI_HOST}:${WEBROOT}"
rsync -avz --delete deploy/dist-poc/ "${PI_HOST}:${WEBROOT}"

echo "==> Done. Live at https://resound.calebhugo.com"
