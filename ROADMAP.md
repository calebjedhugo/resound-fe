# Resound Roadmap

Update this checklist when completing features. Mark items ✅ when done, ⚠️ when in-progress, ❌ when not started.

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
- ✅ Ramps with directional elevation

## Puzzle System
- ✅ JSON-based puzzle definitions
- ✅ 4 playable puzzles (2 easy, 2 medium)
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

## Future/Planned
- ❌ Extract `src/audio/` folder to standalone npm package
- ❌ Backend with authentication
- ❌ Cloud progress sync (currently localStorage only)
- ❌ Additional puzzles post-release

## Notation Library Implementation Order

Suggested build sequence to enable incremental testing. See [`src/notation/SPEC.md`](src/notation/SPEC.md) for full specification.

### Phase 1: Core Data Handling
- ❌ `lib/dataParser.js` - Normalize all input formats
- ❌ `lib/notePositions.js` - Pitch to staff position
- ❌ `lib/durationSymbols.js` - Length to note type
- ❌ `lib/clefInference.js` - Auto-detect clef
- ❌ `lib/keySignatures.js` - Key to accidentals

### Phase 2: Basic Rendering
- ❌ `lib/svgHelpers.js` - SVG utilities
- ❌ `components/Staff.js` - Five lines
- ❌ `components/Note.js` - Note heads and stems
- ❌ `NotationRenderer.js` - Basic single-voice rendering

**Milestone: Can render simple melodies**

### Phase 3: Musical Elements
- ❌ `components/Clef.js` - Clef symbols
- ❌ `components/Rest.js` - Rest symbols
- ❌ `components/LedgerLine.js` - Ledger lines
- ❌ `components/Accidental.js` - Sharps, flats, naturals

**Milestone: Can render any pitched melody with rests**

### Phase 4: Notation Features
- ❌ `components/KeySignature.js` - Key signature display
- ❌ `components/TimeSignature.js` - Time signature display
- ❌ `components/BarLine.js` - Measure dividers
- ❌ `lib/beaming.js` - Beam grouping logic
- ❌ `components/Beam.js` - Beam rendering
- ❌ Ties ([notation](src/notation/SPEC-ties.md) · [audio](src/audio/SPEC-ties.md)) - Tie arcs and duration merging

**Milestone: Fully metered notation with beaming and ties**

### Phase 5: Advanced Features
- ❌ `components/Cursor.js` - Playback position
- ❌ Multi-voice support in `NotationRenderer.js`
- ❌ Chord rendering
- ❌ Percussion clef and X noteheads

**Milestone: Complete core feature set**

### Phase 6: Extended Notation Features
- ❌ Dynamics ([notation](src/notation/SPEC-dynamics.md) · [audio](src/audio/SPEC-dynamics.md)) - Dynamic markings and hairpins
- ❌ Articulations ([notation](src/notation/SPEC-articulations.md) · [audio](src/audio/SPEC-articulations.md)) - Staccato, accent, fermata, etc.
- ❌ Slurs ([notation](src/notation/SPEC-slurs.md) · [audio](src/audio/SPEC-slurs.md)) - Legato phrasing arcs
- ❌ Tuplets ([notation](src/notation/SPEC-tuplets.md) · [audio](src/audio/SPEC-tuplets.md)) - Triplets and irregular groupings
- ❌ Grace Notes ([notation](src/notation/SPEC-grace-notes.md) · [audio](src/audio/SPEC-grace-notes.md)) - Acciaccatura and appoggiatura
- ❌ Repeats ([notation](src/notation/SPEC-repeats.md) · [audio](src/audio/SPEC-repeats.md)) - Repeat barlines, voltas, DC/DS
- ❌ Text Annotations ([notation](src/notation/SPEC-text-annotations.md) · [audio](src/audio/SPEC-text-annotations.md)) - Tempo, expression, rehearsal marks, lyrics

**Milestone: Full notation feature set**
