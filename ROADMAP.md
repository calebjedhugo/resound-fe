# Resound Roadmap

Update this checklist when completing features. Mark items ✅ when done, ⚠️ when in-progress, ❌ when not started.

## Onboarding & Open-World Direction (designer intent, 2026-07-05)

Strategy: **onboarding is a sequence of small, wordless puzzles, each
introducing ONE element.** Keep them non-stuck (a player can never soft-lock)
and wordless (teach by placement/necessity, not text). See DESIGN.md.

Elements taught so far (both inside `awakening`, to be split into separate
levels as the sequence grows):
- ✅ **Gate unlocking** — perform a gate's song to pass (play-to-pass).
- ✅ **Sequencing two songs** — hold two recordings and play them as a melody
  at a fountain (forces two slots + slot-switching, by timing).

Planned onboarding pieces (one element each):
- ❌ **The lure** — consonance moves creatures (deferred from `awakening`).
- ❌ **Creatures activating gates/fountains** — position a singing creature so
  its song solves a target.
- ❌ **Creatures moving each other** — one creature's song displaces another.
- ❌ (later) clap timing, elevation puzzles, etc.

Bigger architectural ideas (exploratory, likely the backbone of the game):
- ❌ **Gates link to matching gates (portals)** — a gate opens a portal to
  another gate elsewhere. This doubles as the **open-world + CPU strategy**:
  only areas adjacent to linked gates need to be loaded, so the world stays
  seamless without loading everything at once. Also shapes how the editor
  models the world (a graph of gate-linked areas).
- ❌ **Fountains reroute gates** — a fountain becomes a **toggle** (it PERSISTS
  after the song finishes, unlike a gate, which is open only while performing)
  that changes where a gate leads. This finally gives fountains a real
  function beyond "level complete."

## Core Gameplay
- ✅ First-person movement and camera
- ✅ Recording system (5-slot inventory)
- ✅ Playback with beat quantization
- ✅ Clap mechanic (displaces creature timing, quantized to 16th notes)
- ⚠️ Accidental overwrite prevention for recordings (basic, could improve)

## Audio Systems
- ✅ MusicalClock with BPM sync and metronome
- ✅ Web Audio synthesis (oscillators + envelopes)
- ✅ Multiple instrument types (Piano, Random, Fountain)
- ✅ Harmony analysis (consonance/dissonance detection)
- ✅ Spatial audio with distance falloff

## Entities
- ✅ Creatures with force-based movement (harmony attraction/repulsion)
- ✅ Gates that unlock when correct song played
- ✅ Fountains (puzzle completion targets)
- ✅ Walls (solid collision)
- ✅ Ramps with directional elevation (wedge geometry, functional slope traversal)
- ✅ Elevation grid (discrete integer levels, floor regions, highest-wins overlap)
- ✅ Player elevation movement (smooth ramp traversal, boundary blocking)
- ✅ Elevation-aware collision (entities at different elevations don't block each other)
- ✅ Creature elevation support (ramp traversal, elevation blocking, 3D audio distance)
- ✅ Backward compatibility verified (all pre-elevation puzzles work identically)

## Puzzle System
- ✅ JSON-based puzzle definitions
- ✅ 5 playable puzzles (2 easy, 2 medium, 1 multi-elevation demo)
- ✅ Progress tracking via localStorage
- ✅ Puzzle manifest system

## UI/Menus
- ✅ Main menu with puzzle selection
- ✅ Pause menu (ESC key)
- ✅ Progress indicators (green checkmarks)
- ✅ Recording UI indicator
- ✅ Debug UI (toggle with 'I' key)

## Development Tools
- ❌ Puzzle editor (dev-only) - currently manual JSON editing
- ❌ Notation editor for songs (considering Vexflow or custom SVG)
- ✅ Dev server setup (Vite)
- ❌ Automated deployment to Raspberry Pi

## Deployment
- ✅ Vite build configuration
- ❌ Production deployment pipeline
- ❌ Raspberry Pi hosting setup (planned)

## Playtest Follow-ups (approved 2026-07-03, next session)
Designer-approved from playtest round R7 (context: `.claude/playtest-game-rules.md`
iteration log; design constraints: `DESIGN.md`). Run `/playtest` to verify after.
- ❌ Keyboard-navigable puzzle menu (focusable entries, arrows + Enter to launch)
- ❌ Red flash on the active slot when a performance fails to match — wordless
  failure feedback that works while facing away from the target (mirrors the
  green record pop; per DESIGN.md philosophy, favored over longer toasts)
- ❌ Playback-failure toast should fire at JUDGMENT time (after the trailing
  silence margin), not on a fixed delay after playback ends — verify, then fix
- ❌ F3 debug: only ellipsize slot listings when notes are actually omitted
- ❌ Progress-reset affordance (persistent ✓ has no reset; per-puzzle replay
  indicator or settings reset)
- ❌ Verification round for the above + items R7 skipped: exactly-3-note
  rotated take fails, red-flash visibility with target on screen, menu ✓
  transition on a fresh profile, fresh-eyes sweep
- 💡 Camera idea the designer is mulling (ASK before building): gradual
  turn slow-down after the mouse stops moving

## Future/Planned
- ❌ Extract `src/audio/` folder to standalone npm package
- ❌ Backend with authentication
- ❌ Cloud progress sync (currently localStorage only)
- ❌ Additional puzzles post-release

## Notation Library Implementation Order

Suggested build sequence to enable incremental testing. See [`src/notation/SPEC.md`](src/notation/SPEC.md) for full specification.

### Phase 1: Core Data Handling
- ✅ `lib/dataParser.js` - Normalize all input formats
- ✅ `lib/notePositions.js` - Pitch to staff position
- ✅ `lib/durationSymbols.js` - Length to note type
- ✅ `lib/clefInference.js` - Auto-detect clef
- ✅ `lib/keySignatures.js` - Key to accidentals

### Phase 2: Basic Rendering
- ✅ `lib/svgHelpers.js` - SVG utilities
- ✅ `components/Staff.js` - Five lines
- ✅ `components/Note.js` - Note heads and stems
- ✅ `NotationRenderer.js` - Basic single-voice rendering

**Milestone: Can render simple melodies**

### Phase 3: Musical Elements
- ✅ `components/Clef.js` - Clef symbols
- ✅ `components/Rest.js` - Rest symbols
- ✅ `components/LedgerLine.js` - Ledger lines
- ✅ `components/Accidental.js` - Sharps, flats, naturals

**Milestone: Can render any pitched melody with rests**

### Phase 4: Notation Features
- ✅ `components/KeySignature.js` - Key signature display
- ✅ `components/TimeSignature.js` - Time signature display
- ✅ `components/BarLine.js` - Measure dividers
- ✅ `lib/beaming.js` - Beam grouping logic
- ✅ `components/Beam.js` - Beam rendering
- ✅ Ties ([notation](src/notation/SPEC-ties.md) · [audio](src/audio/SPEC-ties.md)) - Tie arcs and duration merging

**Milestone: Fully metered notation with beaming and ties**

### Phase 5: Advanced Features
- ✅ Playback position (`setPlaybackPosition()` in NotationRenderer, `data-beat` attributes, `.note-active` class, cursor line)
- ✅ Multi-voice support in `NotationRenderer.js` (separate staves, independent clefs/key sigs/time sigs, voice-specific playback)
- ✅ Chord rendering (shared stem, stacked accidentals, ledger lines, ties, beam-compatible)
- ✅ Percussion clef and X noteheads (`position` 1-9 mapping, `.note-head-x` group)

**Milestone: Complete core feature set**

### Phase 6: Extended Notation Features
- ✅ Dynamics ([notation](src/notation/SPEC-dynamics.md) · [audio](src/audio/SPEC-dynamics.md)) - Dynamic markings and hairpins
- ✅ Articulations ([notation](src/notation/SPEC-articulations.md) · [audio](src/audio/SPEC-articulations.md)) - Staccato, accent, fermata, etc.
- ✅ Slurs ([notation](src/notation/SPEC-slurs.md) · [audio](src/audio/SPEC-slurs.md)) - Legato phrasing arcs
- ✅ Tuplets ([notation](src/notation/SPEC-tuplets.md) · [audio](src/audio/SPEC-tuplets.md)) - Triplets and irregular groupings
- ✅ Grace Notes ([notation](src/notation/SPEC-grace-notes.md) · [audio](src/audio/SPEC-grace-notes.md)) - Acciaccatura and appoggiatura
- ✅ Repeats ([notation](src/notation/SPEC-repeats.md) · [audio](src/audio/SPEC-repeats.md)) - Repeat barlines, voltas, DC/DS
- ✅ Text Annotations ([notation](src/notation/SPEC-text-annotations.md) · [audio](src/audio/SPEC-text-annotations.md)) - Tempo, expression, rehearsal marks, lyrics

**Milestone: Full notation feature set**
