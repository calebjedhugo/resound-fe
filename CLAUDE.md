# Resound - CLAUDE.md

## Project Overview

**Resound** is a first-person musical puzzle game built with Three.js and Web Audio API. Players record melodies from singing creatures and play them back to unlock gates and activate fountains by matching specific musical harmonies.

**Tech Stack:** Vanilla JavaScript (ES2021), Three.js, Web Audio API, Vite

---

## Project Status

IMPORTANT: Update this checklist when completing features. Mark items ✅ when done, ⚠️ when in-progress, ❌ when not started.

### Core Gameplay
✅ First-person movement and camera
✅ Recording system (5-slot inventory)
✅ Playback with beat quantization
✅ Clap mechanic (displaces creature timing, quantized to 16th notes)
⚠️ Accidental overwrite prevention for recordings (basic, could improve)

### Audio Systems
✅ MusicalClock with BPM sync and metronome
✅ Web Audio synthesis (oscillators + envelopes)
✅ Multiple instrument types (Piano, Random, Fountain)
✅ Harmony analysis (consonance/dissonance detection)
✅ Spatial audio with distance falloff

### Entities
✅ Creatures with force-based movement (harmony attraction/repulsion)
✅ Gates that unlock when correct song played
✅ Fountains (puzzle completion targets)
✅ Walls (solid collision)
✅ Ramps with directional elevation

### Puzzle System
✅ JSON-based puzzle definitions
✅ 4 playable puzzles (2 easy, 2 medium)
✅ Progress tracking via localStorage
✅ Puzzle manifest system

### UI/Menus
✅ Main menu with puzzle selection
✅ Pause menu (ESC key)
✅ Progress indicators (green checkmarks)
✅ Recording UI indicator
✅ Debug UI (toggle with 'I' key)

### Development Tools
❌ Puzzle editor (dev-only) - currently manual JSON editing
❌ Notation editor for songs (considering Vexflow or custom SVG)
✅ Dev server setup (Vite)
❌ Automated deployment to Raspberry Pi

### Deployment
✅ Vite build configuration
❌ Production deployment pipeline
❌ Raspberry Pi hosting setup (planned)

### Future/Planned
❌ Extract `src/audio/` folder to standalone npm package (see Architecture Notes)
❌ Backend with authentication
❌ Cloud progress sync (currently localStorage only)
❌ Additional puzzles post-release

---

## Common Commands

```bash
# Start dev server (default port 5173)
npm start

# Run tests (Jest, watch mode)
npm test

# Install dependencies
npm install

# Lint code
npm run lint

# Build for production (planned: auto-deploy to Raspberry Pi)
npm run build
```

---

## Key Files Reference

### Entry Points
- `public/index.html` - HTML entry point
- `src/main.js` - JavaScript entry point, game initialization
- `public/styles/menu.css` - Menu UI styling

### Core Systems
- `src/core/GameState.js` - Global singleton for game state
- `src/core/StateMachine.js` - State management (MENU/PLAYING/PAUSED)
- `src/core/GameLoop.js` - Update/render loop
- `src/core/PuzzleLoader.js` - Load and parse puzzle JSON
- `src/core/constants.js` - Game constants (speeds, forces, ranges, etc.)

### Audio System
- `src/audio/lib/AudioContextManager.js` - Web Audio setup
- `src/audio/lib/MusicalClock.js` - Musical timing and metronome
- `src/audio/instruments/` - Synth implementations
- `src/audio/lib/noteFrequencies.js` - Pitch to frequency conversion

### Managers
- `src/core/RecordingManager.js` - Handle recording creature songs
- `src/core/PlaybackManager.js` - Play back recorded songs
- `src/core/ListeningManager.js` - Broadcast note events to entities
- `src/core/HarmonyAnalyzer.js` - Analyze musical intervals
- `src/core/SongMatcher.js` - Match songs for gates/fountains
- `src/core/ProgressManager.js` - Track puzzle completion (localStorage)

### Entities
- `src/entities/Entity.js` - Base entity class
- `src/entities/EntityManager.js` - Entity lifecycle management
- `src/entities/Creature.js` - Singing creatures with movement AI
- `src/entities/Gate.js` - Unlockable barriers
- `src/entities/Fountain.js` - Puzzle completion targets

### Puzzles
- `public/puzzles/manifest.json` - List of all puzzles
- `public/puzzles/*.json` - Individual puzzle definitions
- `puzzles/schema.md` - Puzzle JSON schema documentation

---

## Code Style & Conventions

### General
- Use ESLint (Airbnb base) + Prettier for formatting
- Husky runs lint-staged on commit
- Use absolute imports via path aliases (baseUrl: "src")
  ```javascript
  import GameState from 'core/GameState';  // ✅ Good
  import GameState from '../core/GameState';  // ❌ Avoid
  ```

### Entity Pattern
- All entities extend `Entity.js` base class
- Implement `update(deltaTime)` for game logic
- Implement `render()` for Three.js rendering
- EntityManager handles lifecycle (add/remove/update/render)

### State Management
- Use GameState singleton for global state (player, entities, puzzle data)
- State machine pattern for game states (MenuState, PlayingState, PausedState)
- Each state has `enter()`, `exit()`, `update()`, `render()` methods

### Audio Code
- Keep audio system modular and framework-agnostic
- Use MusicalClock for all timing (never `Date.now()` or `performance.now()` for music)
- All note pitches use scientific notation (C4, C#4, Db4)
- All durations use fractions (1/1, 1/2, 1/4, 1/8, 1/16)

### Naming
- Classes: PascalCase (`GameState`, `MusicalClock`)
- Files: PascalCase for classes (`Entity.js`), camelCase for utilities (`utils.js`)
- Constants: UPPER_SNAKE_CASE in `core/constants.js`

---

## Architecture Notes

### IMPORTANT: Audio System Independence

The `src/audio/` folder is **planned for extraction** into a standalone npm package for reuse in other projects. When working with audio code:

- ✅ Keep it independent of game-specific logic (no imports from `entities/`, `core/GameState`, etc.)
- ✅ Make it generic and reusable
- ✅ Document for external use
- ❌ Avoid creating dependencies FROM audio/ TO other game systems
- ❌ Don't add game-specific logic to audio classes

**Current coupling to be aware of:**
- `AudioContextManager` is standalone ✅
- `MusicalClock` is standalone ✅
- Instruments are generic ✅
- Check for any game-specific imports before extraction

### Entity System
- Entity base class provides common interface
- EntityManager handles lifecycle for all entities
- Each entity type responsible for its own behavior
- Collision detection happens in CollisionDetector (separate from entities)

### Musical Timing
- Everything syncs to MusicalClock (16th note subdivisions)
- 50ms beat tolerance for playback matching (Web Audio isn't perfectly deterministic)
- Creatures have deterministic singing schedules based on their `interval` property

---

## Puzzle Workflow

### Creating a New Puzzle

1. Create JSON file in `public/puzzles/` (e.g., `test-005.json`)
2. Follow schema in `puzzles/schema.md`
3. Add entry to `public/puzzles/manifest.json`
4. Test by selecting from main menu

### Puzzle JSON Structure

```json
{
  "id": "test-005",
  "name": "Puzzle Name",
  "difficulty": 1,  // 1=Easy, 2=Medium, 3=Hard
  "gridSize": 20,
  "tempo": 120,
  "playerStart": { "x": 10, "y": 0, "z": 10 },
  "entities": [
    {
      "type": "creature",
      "position": { "x": 5, "y": 0, "z": 5 },
      "data": {
        "song": [{ "pitch": "C4", "length": "1/4" }],
        "interval": 8,  // Beats between repetitions
        "audibleRange": 15
      }
    }
  ]
}
```

### Entity Types
- `creature` - Requires: song (array), interval (beats), audibleRange
- `gate` - Requires: song (array of chords), threshold (optional, default 0.8)
- `fountain` - Requires: song (array of chords)
- `wall` - Just position
- `ramp` - Requires: direction ("north" | "south" | "east" | "west")

### Note Format
- **Pitch**: Scientific notation (C4, C#4, Db4, D4, etc.)
- **Length**: Fraction strings ("1/1", "1/2", "1/4", "1/8", "1/16")
- **Chords**: Array of pitch strings `["C4", "E4", "G4"]`

---

## Important Constants

Located in `src/core/constants.js`. Commonly tweaked values:

```javascript
WORLD_SCALE: 3                           // Grid units to world units
RECORDING_RANGE_PERCENTAGE: 0.5          // 50% of audible range
PLAYBACK_BEAT_TOLERANCE: 50              // Milliseconds
DEFAULT_CREATURE_MAX_SPEED: 8.0          // Units per second
ATTRACTION_FORCE_STRENGTH: 15.0          // Consonant harmony pull
REPULSION_FORCE_STRENGTH: 15.0           // Dissonant harmony push
CREATURE_DECELERATION: 0.85              // Per-frame slowdown (0-1)
HARMONY_TIMING_SUBDIVISION: 16           // Sixteenth notes
```

To adjust difficulty:
- **Easier**: Increase audible ranges, decrease force strengths
- **Harder**: Tighter timing tolerances, smaller ranges, faster creatures

---

## Project Quirks & Gotchas

### Web Audio
- **AudioContext must be resumed** on user interaction (handled in main.js)
- Browser autoplay policies require user gesture before sound plays
- Don't create oscillators until needed (memory leak if not stopped properly)

### Musical Timing
- **Never use `Date.now()` or `performance.now()` for music** - always use MusicalClock
- Creature songs play on a schedule based on their `interval` property
- Quantization happens to nearest 16th note (HARMONY_TIMING_SUBDIVISION)
- 50ms tolerance exists because Web Audio timing isn't frame-perfect

### Creature Behavior
- Creatures **only move during rest beats** (not while singing)
- **Perfect intervals** (unison, octave) don't affect movement - only consonance/dissonance
- Force is applied during playback, not continuously
- Creatures need collision detection with walls/boundaries

### Recording System
- Can only record sounds **currently being heard** (within creature's audibleRange × 0.5)
- Recording multiple creatures simultaneously creates a chord
- Recordings are **automatically quantized** to beat grid
- 5-slot limit (keys 0-4)

### Gate/Fountain Matching
- Uses `SongMatcher.js` with threshold (default 0.8 = 80% match)
- Timing matters - notes must align with beat grid
- All notes must be played within listening range simultaneously

### Performance
- Each entity updates every frame - keep update() methods efficient
- Three.js geometries/materials should be reused when possible
- Limit active oscillators (stop when not audible)

---

## Testing

### Current Setup
- Jest configured but minimal tests currently
- Manual testing via dev server
- No E2E tests yet

### Testing Checklist When Adding Features
1. Test in main menu (puzzle selection, progress display)
2. Test in-game (movement, recording, playback)
3. Test pause menu (ESC to pause/resume)
4. Test puzzle completion (fountain activation)
5. Test progress persistence (localStorage)
6. Check browser console for errors
7. Test audio on first user interaction (autoplay policy)

### Manual Testing Tips
- Use debug UI ('I' key) to inspect state
- Use metronome ('M' key) to verify timing
- Test with different tempos in puzzle JSON
- Verify creature movement with different harmonies

---

## Development Environment

### Requirements
- Node.js (modern version supporting ES2021)
- Modern browser with Web Audio API support
- No backend required (static site)

### Ports (Planned)
- **Dev server**: Port 5173 (Vite default)
- **Puzzle editor**: Separate port TBD (not yet implemented)

### File Watching
- Vite HMR watches `src/` and `public/`
- Puzzle JSON changes require manual refresh
- CSS changes hot reload

---

## Deployment (Planned)

### Target Environment
- Raspberry Pi (local network)
- Static file server (nginx or similar)
- No domain needed (IP address access)

### Build Output
- `npm run build` → `dist/` directory
- Include `public/puzzles/` in build output
- Deploy script TBD (automated push to Pi)

---

## Future Considerations

### Puzzle Editor (Not Yet Implemented)
- React-based dev-only tool
- Visual grid editor for entity placement
- Notation editor for songs (Vexflow or custom SVG)
- Live preview of puzzle
- Separate dev server port

### Backend Architecture
- ProgressManager already uses localStorage
- Future: API for cloud save sync
- Authentication system placeholder
- Multi-device progress sync

---

**Last Updated:** 2025-12-29
