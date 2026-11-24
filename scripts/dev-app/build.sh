#!/bin/bash
# Build "Resound Dev.app" (default: ~/Applications) — the Dock launcher for
# the dev experience. Clicking it runs `scripts/dev-server.sh open`: starts
# the one dev server if it isn't up and opens the editor in a Chrome app
# window. The app holds only the path to this checkout: rebuild it if the
# repo moves, or after changing icon.svg.
#
#   scripts/dev-app/build.sh [install-dir]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DEST_DIR="${1:-$HOME/Applications}"
APP="$DEST_DIR/Resound Dev.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The icon: icon.svg -> 1024 px PNG (Quick Look), rounded tile masked
# transparent (icon.png is kept in the repo so this step is optional)
if [ "$HERE/icon.svg" -nt "$HERE/icon.png" ]; then
  qlmanage -t -s 1024 -o "$WORK" "$HERE/icon.svg" > /dev/null 2>&1
  python3 - "$WORK/icon.svg.png" "$HERE/icon.png" << 'EOF'
import sys
from PIL import Image, ImageDraw
im = Image.open(sys.argv[1]).convert('RGBA').resize((1024, 1024))
mask = Image.new('L', (4096, 4096), 0)
ImageDraw.Draw(mask).rounded_rectangle((256, 256, 3840, 3840), radius=800, fill=255)
im.putalpha(mask.resize((1024, 1024), Image.LANCZOS))
im.save(sys.argv[2])
EOF
fi

ICONSET="$WORK/applet.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z $size $size "$HERE/icon.png" --out "$ICONSET/icon_${size}x${size}.png" > /dev/null
  sips -z $((size * 2)) $((size * 2)) "$HERE/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" > /dev/null
done
iconutil -c icns "$ICONSET" -o "$WORK/applet.icns"

mkdir -p "$DEST_DIR"
rm -rf "$APP"
osacompile -o "$APP" -e "do shell script quoted form of \"$ROOT/scripts/dev-server.sh\" & \" open\""
cp "$WORK/applet.icns" "$APP/Contents/Resources/applet.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleName Resound Dev" "$APP/Contents/Info.plist" 2> /dev/null || true
touch "$APP" # Finder/Dock pick up the new icon
echo "Built $APP"
