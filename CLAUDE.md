# Resound - CLAUDE.md

## Project Overview

**Resound** is a first-person musical puzzle game built with Three.js and Web Audio API. Players record melodies from singing creatures and play them back to unlock gates and activate fountains by matching specific musical harmonies.

**Tech Stack:** Vanilla JavaScript (ES2021), Three.js, Web Audio API, Vite

**Roadmap:** See `ROADMAP.md` for project status and planned features.

---

## Common Commands

```bash
npm start          # Dev server (port 5173) - game at /, editor at /editor.html
npm test           # Jest tests (watch mode)
npm run build      # Production build
npm run lint       # ESLint
```

---

## Testing

**Read [`TESTING.md`](TESTING.md)** before writing or modifying tests.

Tests are integration-style: test behaviors through public APIs, mock only browser APIs.

---

## Code Style

- ESLint (Airbnb base) + Prettier, Husky runs lint-staged on commit
- Use absolute imports: `import GameState from 'core/GameState'` (not relative paths)
- Classes: PascalCase. Files: PascalCase for classes, camelCase for utilities
- Constants: UPPER_SNAKE_CASE in `src/core/constants.js`

---

## Architecture Notes

### IMPORTANT: Package boundaries

`audio` and `notation` are extracted to the published packages `resound-sound`
and `resound-notation`; the game consumes them from the **registry** (no local
copies — never hand-copy `dist/` into `node_modules`). `resound-notation` is a
pure renderer; the game does not hand-draw notation.

- Game UI imports from `resound-sound` and `resound-notation` (not `audio/` / `notation/`, which no longer exist)
- The **staff editor is local game code** (`src/editor/ui/NotationEditor.js` + `model/SongModel.js` + `ui/RhythmPalette.js` + `ui/staffCoords.js`) built on the published renderer's public API (`render()` + `components/*` + `lib/*`). `SongEditorModal.js` wires it to the entity model (`onChange` → `undoManager`) and injects a `resound-sound` `Synth` for playback. See `src/editor/CLAUDE.md`.

### Puzzle Editor (`src/editor/`)
- Separate Vite entry point: `editor.html` (access at `/editor.html` during dev)
- **EditorPuzzleModel** is the central mutable data model; **UndoManager** wraps it
- Serialization handles type-specific JSON format differences (creature `data.song` vs gate root `song`)
- The notation editor is local code on top of published `resound-notation` — see `src/editor/CLAUDE.md`

### Entity System
- All entities extend `Entity.js` base class
- Implement `update(deltaTime)` and `render()` methods
- EntityManager handles lifecycle (add/remove/update/render)

---

## Puzzles

- **Schema:** `puzzles/schema.md`
- **Files:** `public/puzzles/*.json`
- **Manifest:** `public/puzzles/manifest.json`

To create a puzzle: add JSON file following schema, then add entry to manifest.

---

## Key Gotchas

### Web Audio
- AudioContext must be resumed on user interaction (handled in main.js)
- Don't create oscillators until needed (memory leak if not stopped)

### Musical Timing
- **NEVER use `Date.now()` or `performance.now()` for music** - always use MusicalClock
- Quantization happens to nearest 16th note
- 50ms beat tolerance for playback matching

### Creatures
- Only move during rest beats (not while singing)
- Perfect intervals (unison, octave) don't affect movement

### Notation Coordinate System
- All notation *rendering* (engraving) lives in the published `resound-notation` package — the editor here consumes it — see that repo's docs for the coordinate model
- **When engraving looks wrong**: fix it in `resound-notation`, publish a new version, then bump this repo's dependency and `npm install`. Do **not** hand-copy `dist/` into `node_modules` (see `src/editor/CLAUDE.md`)

### Recording
- Can only record within creature's `audibleRange × 0.5`
- 5-slot limit (keys 0-4)

---

## Development

- **Dev server:** Port 5173 (Vite)
- **Deployment:** Planned for Raspberry Pi (static files via nginx)
- Puzzle JSON changes require manual refresh (no HMR)

---

*Last Updated: 2026-05-08*
