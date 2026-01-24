# Resound - CLAUDE.md

## Project Overview

**Resound** is a first-person musical puzzle game built with Three.js and Web Audio API. Players record melodies from singing creatures and play them back to unlock gates and activate fountains by matching specific musical harmonies.

**Tech Stack:** Vanilla JavaScript (ES2021), Three.js, Web Audio API, Vite

**Roadmap:** See `ROADMAP.md` for project status and planned features.

---

## Common Commands

```bash
npm start          # Dev server (port 5173)
npm test           # Jest tests (watch mode)
npm run build      # Production build
npm run lint       # ESLint
```

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

### Recording
- Can only record within creature's `audibleRange × 0.5`
- 5-slot limit (keys 0-4)

---

## Development

- **Dev server:** Port 5173 (Vite)
- **Deployment:** Planned for Raspberry Pi (static files via nginx)
- Puzzle JSON changes require manual refresh (no HMR)

---

*Last Updated: 2025-01-24*
