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

### IMPORTANT: Audio System Independence

The `src/audio/` folder is **planned for extraction** into a standalone npm package. When working with audio code:

- ✅ Keep it independent of game-specific logic
- ✅ No imports from `entities/`, `core/GameState`, etc.
- ❌ Don't add game-specific logic to audio classes

### Puzzle Editor (`src/editor/`)
- Separate Vite entry point: `editor.html` (access at `/editor.html` during dev)
- **EditorPuzzleModel** is the central mutable data model; **UndoManager** wraps it
- Serialization handles type-specific JSON format differences (creature `data.song` vs gate root `song`)
- `NotationEditor.js` has its own layout constants mirroring `NotationRenderer.js` — keep both in sync
- 132 tests covering model, serialization, validation, song editing, viewport, and I/O

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
- **Staff-group coords**: staff lines at y = 10, 30, 50, 70, 90 (spacing = 20, `STAFF_TOP_OFFSET = 10`)
- All notation components (clefs, notes, time sigs, bar lines) have this offset **baked into their coordinates**
- `STAFF_TOP_OFFSET` must ONLY be applied to the staff-lines element, **never to a parent group** — otherwise components get a double offset
- `NotationRenderer.js` is the reference implementation; the editor (`NotationEditor.js`) must match its approach

### Recording
- Can only record within creature's `audibleRange × 0.5`
- 5-slot limit (keys 0-4)

---

## Development

- **Dev server:** Port 5173 (Vite)
- **Deployment:** Planned for Raspberry Pi (static files via nginx)
- Puzzle JSON changes require manual refresh (no HMR)

---

*Last Updated: 2026-01-31*
