---
name: dev-server
description: Start the resound-fe dev server and get the project ready to work on. Ensures dependencies are installed, launches the Vite dev server in the background, and reports the game and editor URLs. Use when the user says "start the dev server", "get resound ready", "spin up resound", or "/dev-server".
---

# Resound Dev Server

Gets the resound-fe project ready to work on: installs deps if needed, starts the Vite dev server in the background, and confirms it's serving.

**Project root:** `/Users/calebhugo/Development/personal dev work.nosync/resound-fe`

## Steps

1. **Check if the server is already running** on port 5173. If it is, skip to step 4 and just report the URLs — don't start a second instance.
   ```bash
   lsof -i :5173
   ```

2. **Ensure dependencies are installed.** If `node_modules` is missing or `package.json` is newer than `node_modules/.package-lock.json`, run install:
   ```bash
   cd "/Users/calebhugo/Development/personal dev work.nosync/resound-fe" && npm install
   ```

3. **Start the dev server in the background** (it runs long-lived, so use `run_in_background: true` on the Bash tool):
   ```bash
   cd "/Users/calebhugo/Development/personal dev work.nosync/resound-fe" && npm start
   ```
   `npm start` runs `npx vite --config vite.config.js`.

4. **Confirm it's up** by polling the port until Vite responds, then report the URLs:
   ```bash
   curl -sf http://localhost:5173/ >/dev/null && echo "up"
   ```

## Report to the user

Once serving, tell them:
- **Game:** http://localhost:5173/
- **Puzzle editor:** http://localhost:5173/editor.html

Then note the project is ready to work on and, if `git status` shows anything unusual (uncommitted changes, detached HEAD, behind origin), surface it briefly.

## Notes

- Dev server port is **5173** (Vite default).
- Two entry points share the server: `index.html` (game) and `editor.html` (editor) — see `vite.config.js`.
- If the server exits immediately, check its background output for a port conflict or a Node version issue (project runs on Node 16 here).
- Don't run `npm test` — that's a separate watch-mode command and not part of "get ready to work."
