# Testing Philosophy

Integration tests that describe **what the system does**, not how it does it.

---

## Core Principles

**Test behaviors, not implementations.** Tests should survive any refactoring that preserves behavior.

- Test through public APIs only
- Mock external dependencies (Web Audio, Three.js, localStorage)
- Never mock internal modules - let them run together
- Describe tests in terms of user actions and expected outcomes

---

## Running Tests

```bash
npm test              # Watch mode
npm test -- --ci      # Single run (CI)
```

---

## Test Structure

Tests are **colocated** with the code they test:

```
setupMocks.js              # Browser API mocks (runs first)
setupTests.js              # Global ctx setup (beforeEach/afterEach)
src/
  __tests__/
    helpers/
      testUtils.js         # createTestContext and test utilities
      mocks.js             # Mock implementations
    fixtures/
      puzzles/             # Test puzzle JSON files
  core/
    MusicalClock.js
    MusicalClock.test.js         # Timing tests
    RecordingManager.js
    RecordingManager.test.js     # Recording tests
```

---

## Writing a Test

A global `ctx` (test context) is automatically created before each test and cleaned up after. Tests are **async** because `tick()` uses fake timers to handle instrument playback.

```javascript
describe('Recording a creature song', () => {
  it('captures notes into inventory when player records nearby creature', async () => {
    // Arrange: load a test puzzle with creature in recording range
    ctx.loadPuzzle('recording-basic');
    await ctx.tick(16); // Update creature state

    // Act: hold R to record, advance time, release R
    ctx.holdKey('r');
    await ctx.advanceBeats(4);
    ctx.releaseKey('r');

    // Assert
    const recorded = ctx.getInventorySlot(0);
    expect(recorded).not.toBeNull();
    expect(recorded[0].pitch).toBe('C4');
  });
});
```

Test puzzles live in `src/__tests__/fixtures/puzzles/` and are registered in `testUtils.js`.

---

## Test Context API

All tests use `createTestContext()` from `helpers/testUtils.js`. This provides:

| Method | Purpose |
|--------|---------|
| **Puzzle Loading** | |
| `ctx.loadPuzzle(id)` | Load a test puzzle fixture |
| **Time Control** (async) | |
| `await ctx.tick(ms)` | Advance game loop by milliseconds |
| `await ctx.advanceBeats(n)` | Advance time by n beats |
| `await ctx.advanceMs(n)` | Advance time by milliseconds |
| `ctx.getCurrentBeat()` | Get current beat |
| **Input Simulation** | |
| `ctx.holdKey(key)` | Press and hold a key (w/a/s/d/r/space/c/shift) |
| `ctx.releaseKey(key)` | Release a held key |
| `ctx.pressKey(key)` | Press and immediately release |
| **Player State** | |
| `ctx.setPlayerPosition(pos)` | Set player position directly |
| `ctx.getPlayerPosition()` | Get player position |
| **Inventory** | |
| `ctx.getInventorySlot(n)` | Get song from inventory slot |
| `ctx.setInventorySlot(n, song)` | Set inventory slot directly |
| `ctx.setActiveSlot(n)` | Set active inventory slot |
| **Entities** | |
| `ctx.getCreatures()` | Get all creatures |
| `ctx.getGates()` | Get all gates |
| `ctx.isGateOpen(gate)` | Check if gate is open |
| `ctx.isFountainActive(fountain)` | Check if fountain is active |
| **Recording** | |
| `ctx.isRecording()` | Check if recording is active |
| `ctx.getEmittedNotes()` | Get all notes emitted during test |

---

## What Gets Mocked

**Mocked (external browser APIs):**
- `AudioContext`, `OscillatorNode`, `GainNode` - Web Audio API
- `localStorage` - persistence
- Three.js scene/mesh creation - rendering

**Not mocked (tested as integrated units):**
- GameState
- MusicalClock
- RecordingManager, PlaybackManager
- ListeningManager
- SongMatcher, HarmonyAnalyzer
- Entity classes (Creature, Gate, Fountain)
- All utility functions

---

## Test Suites

| File | Behavior Tested |
|------|-----------------|
| `src/core/MusicalClock.test.js` | Beat calculation, quantization, tempo conversions |
| `src/core/RecordingManager.test.js` | Capturing creature notes into inventory |
| `src/core/PlaybackManager.test.js` | Playing recorded songs, note emission timing |
| `src/core/ListeningManager.test.js` | Gates/Fountains recognizing correct songs |
| `src/entities/Creature.test.js` | Creature movement from consonance/dissonance; ball-lightning look (lit/flare/colour, lone-note paleness, dissonance fringe, register, shared materials) |
| `src/core/messiaenColour.test.js` | Creature colour from the surrounding harmony (triad fit, reflections by triad, added sixth, lone-note paleness, painter's complement + dissonance, register lightness; memoized path = reference) |
| `src/core/ShaderPrewarm.test.js` | Shader programs drawn behind the StartGate, in the ONE pass context the main view and every door pass share |
| `src/core/FrameProfiler.test.js` | Dev profiler times each call by caller (self excludes timed children), counts draw calls and GPU time per pass, reports the worst frames first, and unwraps everything after a run |
| `src/core/passContext.test.js` | Main view binds no-op clip planes; door targets render in the canvas colour space; panels never encode twice |
| `src/core/doorViews.test.js` | Door views over their lifetime: the frame a door opens shows the eye's own perspective, each new face is written once, no pass samples an unwritten panel; crossings keep views (same-area teleport, round trip) and an unloading area takes its panels with it |
| `src/core/ClapManager.test.js` | Clap displacing creature timing |
| `src/core/GameLoop.test.js` | A frame that throws (the first one included) costs that frame, not the game |
| `src/core/windowSize.test.js` | Booting in a 0x0 window (hidden pane): straight-ahead view; camera, canvas and screen center follow resizes |

---

## IMPORTANT Rules

- **NEVER use `Date.now()` or `performance.now()`** - use `ctx.advanceBeats()` or `ctx.advanceMs()`
- **NEVER mock internal classes** - if a test requires mocking GameState or MusicalClock, the test is wrong
- **NEVER test implementation details** - don't assert on private state, only observable behavior
- **One behavior per test** - each `it()` block tests exactly one thing

---

## Key Constants for Tests

| Constant | Value | Used In |
|----------|-------|---------|
| Recording range | `audibleRange × 0.5` | RecordingManager tests |
| Note quantization | 16th notes | Recording tests |
| Playback late grace | 0.1 beats (tempo-relative) | Playback tests |
| Playback chaining | queues on the song's largest-unit boundary | Playback tests |
| Clap range | 7.5 units | ClapManager tests |
| Clap displacement | 1/16 note | ClapManager tests |

---

## Debugging Tips

```javascript
// Print current state
console.log(ctx.debug());

// Check emitted notes
const notes = ctx.getEmittedNotes();
console.log(notes);

// Get specific creature
const creatures = ctx.getCreatures();
console.log(creatures[0].position);
```
