---
name: dev-server
description: Make sure the ONE resound-fe dev server (port 5182, the same one the designer's "Resound Dev" Dock app starts) is running, and report the game and editor URLs. Use when the user says "start the dev server", "get resound ready", "spin up resound", or "/dev-server", and before any browser work on Resound.
---

# Resound Dev Server

There is exactly ONE dev server: Vite on **http://localhost:5182**, managed by
`scripts/dev-server.sh`. The designer's Dock app (`~/Applications/Resound
Dev.app`, built by `scripts/dev-app/build.sh`) starts it and opens the editor;
Claude develops against the SAME server.

**Project root:** `/Users/calebhugo/Development/personal dev work.nosync/resound-fe`

## Steps

1. **Install deps if needed** (`node_modules` missing, or `package.json` newer
   than `node_modules/.package-lock.json`): `npm install`.
2. **Start it if it isn't up** (idempotent — it never starts a second one):
   ```bash
   scripts/dev-server.sh start
   ```
3. Report: **Editor** http://localhost:5182/editor.html — **Game**
   http://localhost:5182/ — and surface anything unusual in `git status`.

## Rules

- **NEVER start a second Vite** (no `npm start`, no other port, no
  `preview_start` that launches one): `scripts/dev-server.sh start` reuses a
  running server. **NEVER stop it** unless the user asks
  (`scripts/dev-server.sh stop`) — the designer may have the app open.
- It serves the MAIN checkout, so code edits hot-reload the designer's open
  window. Agents working in a git worktree can't test their branch on it:
  merge first, or test in the main checkout.
- Browser pages Claude drives: a NEW page in an `isolatedContext` (its own
  storage, so the mute below never touches the designer's settings), loaded
  with the mute `initScript` from the memory note "Mute agent browsers"
  (zero-gain AudioContext destination + `resound-settings.muted = true`).
  Never navigate, reload or close the designer's own window.
- Log: `.dev-server/vite.log` (git-ignored). Status: `scripts/dev-server.sh status`.
