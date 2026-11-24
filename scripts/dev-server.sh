#!/bin/bash
# The ONE Resound dev server (Vite, http://localhost:5182). The Resound Dev
# app in the Dock starts it, and Claude develops against the same one.
#
#   scripts/dev-server.sh start         start it if it isn't answering (idempotent)
#   scripts/dev-server.sh stop          stop it
#   scripts/dev-server.sh status        is it up?
#   scripts/dev-server.sh open [game]   start it, then open the editor (or the game)
#                                       in a Chrome app window
#
# Runs detached: closing the window leaves the server up for the next launch.
# Log: .dev-server/vite.log (git-ignored).

PORT=5182
URL="http://localhost:${PORT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/.dev-server"
PIDFILE="$STATE/vite.pid"
LOG="$STATE/vite.log"

# A Dock launch (AppleScript) has a bare PATH: find the nvm node
if ! command -v node > /dev/null 2>&1; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2> /dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && PATH="$NODE_BIN:$PATH"
fi
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

up() { curl -s -o /dev/null --max-time 1 "$URL/editor.html"; }

start() {
  if up; then
    echo "Resound dev server already up at $URL"
    return 0
  fi
  mkdir -p "$STATE"
  cd "$ROOT" || exit 1
  nohup npx vite --config vite.config.js --port "$PORT" --strictPort > "$LOG" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"
  for _ in $(seq 1 60); do
    if up; then
      echo "Resound dev server up at $URL (log: $LOG)"
      return 0
    fi
    sleep 0.25
  done
  echo "Resound dev server did not come up; see $LOG" >&2
  return 1
}

stop() {
  local pids
  pids="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2> /dev/null)"
  [ -f "$PIDFILE" ] && pids="$pids $(cat "$PIDFILE")"
  for pid in $pids; do kill "$pid" 2> /dev/null; done
  rm -f "$PIDFILE"
  for _ in $(seq 1 20); do
    up || { echo "Resound dev server stopped"; return 0; }
    sleep 0.25
  done
  echo "Resound dev server still answering on $PORT" >&2
  return 1
}

open_window() {
  local page="/editor.html"
  [ "$1" = "game" ] && page="/"
  start > /dev/null || exit 1
  local chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ -x "$chrome" ]; then
    nohup "$chrome" --app="$URL$page" > /dev/null 2>&1 < /dev/null &
  else
    open "$URL$page"
  fi
}

case "$1" in
  start) start ;;
  stop) stop ;;
  status) if up; then echo "up: $URL"; else echo "down"; exit 1; fi ;;
  open) open_window "$2" ;;
  *) echo "usage: $0 start|stop|status|open [game]" >&2; exit 2 ;;
esac
