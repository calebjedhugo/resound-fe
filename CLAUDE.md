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

### IMPORTANT: Package Extraction Path

Three systems are planned for extraction into standalone npm packages. **Respect these dependency boundaries:**

```
audio (standalone)        ← game
notation (standalone)     ← game, notation-editor
notation-editor           ← game-editor
  (depends on notation)
```

- `src/audio/` — no imports from `entities/`, `core/`, `editor/`
- `src/notation/` — no imports from `audio/`, `entities/`, `core/`, `editor/`
- `src/editor/ui/` notation files — import only from `notation/`, never from game code

### Puzzle Editor (`src/editor/`)
- Separate Vite entry point: `editor.html` (access at `/editor.html` during dev)
- **EditorPuzzleModel** is the central mutable data model; **UndoManager** wraps it
- Serialization handles type-specific JSON format differences (creature `data.song` vs gate root `song`)
- See `src/editor/CLAUDE.md` for notation editor details and SVG sizing patterns

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
- **When notation doesn't fit visually**: fix SVG dimensions in the renderer code, NOT the CSS container (see `src/editor/CLAUDE.md`)

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
