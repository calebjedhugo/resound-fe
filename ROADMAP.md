# Resound Roadmap

Update this checklist when completing features. Mark items ✅ when done, ⚠️ when in-progress, ❌ when not started.

## Onboarding & Open-World Direction (designer intent, 2026-07-05)

Strategy: **onboarding is a sequence of small, wordless puzzles, each
introducing ONE element.** Keep them non-stuck (a player can never soft-lock)
and wordless (teach by placement/necessity, not text). See DESIGN.md.

Elements taught so far:
- ✅ **Gate unlocking** — perform a gate's song to pass (play-to-pass). (in
  `awakening`)
- ✅ **Sequencing two songs** — hold two recordings and play them as a melody
  at a fountain (forces two slots + slot-switching, by timing). (in `awakening`)
- ✅ **The lure** — harmony moves creatures, and it's RELATIONAL. Its own level
  `the-lure` (`puzzles/gen-lure.js`): one recorded note (A4) PULLS the creature
  it's consonant with (C5 blocker, out of a corridor) and PUSHES the creature
  it's dissonant with (G4 pusher, into a sealed fountain). Single voice, both
  effects. Finish is hardened — you can never reach the fountain to play its
  note; only the pushed creature's own song activates it. Non-stuck: one note
  ever needed, always re-recordable. See DESIGN.md.

- ✅ **The POC world (2026-07-10; restructured same day on designer feedback;
  redesigned 2026-07-11 across rounds 2–4)** — the playable proof of
  concept and the boot entry: NINE small portal-linked areas as of v5
  (`poc-threshold` → `poc-two-keys` → `poc-duet` → `poc-jam` → `poc-dance`
  → `poc-pull` → `poc-push` → `poc-clap` → `poc-return`), ONE
  concept each — core loop, slots, sequencing, a creatures-move-creatures
  spectacle (the dance), the jam (a continuous singer beside a door blocks
  it forever — taught with a caged jammer and two identical doors), the
  pull (the jam, now free-standing and movable: consonant playback leashes
  it away), push + creature-opens-gate, clap timing, elevation/walk-under,
  and a finale whose exit is the locked mystery door beside area I's spawn
  (the world loops closed). No fountains. Generated + self-checked (380+
  asserts) by `puzzles/gen-poc.js`; every area verified in-browser.
  Shipped with it: multi-note gates commit only on the completed song
  (Gate.js), playback chaining quantized to the song's largest unit
  (PlaybackManager), the slot-flash feedback language replacing gameplay
  toasts (RecordingUI), and a wordless clap "C" key hint (KeyHints).
  Designer feedback round 1 addressed: tighter rooms, humane duet timing,
  fewer words, creature motion taught before it's required. Round 2
  addressed: STRICT pitch economy (no carried note opens a later door —
  duet is E5/G5, dance voice is C5, all skip-guard exemptions removed) and
  the moving creature is now PART of the puzzle (the jam→pull pair).
  Round 3 (same day) addressed: matching reclaimed its original spirit
  (the gate must hear its song exactly, surroundings ignored — silence
  margins removed, in-window exclusivity kept), the inventory became a
  growable TAPE (cursor, in-place re-record, hold-to-delete, Space plays
  all — chaining and digit keys retired), and the demo got its ENDING:
  area X is now "The Star" (warm-up vestibule + a concert hall holding the
  ELEMENTS of Twinkle in quarter notes), whose central portal loops to a
  mid-room finale gate in area I and rolls a dismissible
  thanks-for-playing → calebhugo.com card. The checker grew to 480+
  asserts, including an empty-tape pocket-escape rule (delete can never
  strand a player). Round 4 (v5, 2026-07-11) restructured to NINE areas:
  `poc-climb` CUT (no ramp without necessity), jam moved before the dance,
  the dance REDESIGNED to the designer's tension-and-release pair (B3→C4 /
  F4→E4 synced halves parked at the exit — the movable jam, swept by a
  net-repelling F4), the clap REDESIGNED (visible plinth pair, in-phase
  quarters; one clap resolves the chord into the door's melody), The Star
  grew to EIGHT element voices for the corrected Twinkle rhythm
  (phrase-ending halves), the entry door moved to a side wall (turn-around
  moment), and pens became visible plinths. Shipped with it: ONE DOOR TWO
  EARS (a pair shares heard-note state — the far-side jam bypass is dead),
  the one-way-arrival occupant escape (Caleb's stuck-in-the-warm-up-gate),
  onset-boundary fade grace, no-green open gates, puzzle-driven key hints
  (`teaches`), doorway views that paint the arrival cell + staff,
  half-res portal targets, and multi-measure gate staves. Two guard
  relaxations flagged for a ruling (see DESIGN.md "Onboarding").

Planned onboarding pieces (one element each):
- ✅ **Creatures activating gates/fountains** — foregrounded by `poc-push`
  (the pushed creature's own song opens the exit door); first tasted in
  `the-lure`'s hardened finish.
- ✅ **Creatures moving each other** — `poc-dance` (v5): the
  tension-and-release duet parked at the exit — witnessed AND solved.
- ✅ **Clap timing** — `poc-clap`. **Elevation** — demoted to scenery
  (plinth pens) when `poc-climb` was cut in v5.

Bigger architectural ideas (exploratory, likely the backbone of the game):
- ✅ **Gates link to matching gates (portals)** — a gate opens a portal to
  another gate elsewhere. This doubles as the **open-world + CPU strategy**:
  only areas adjacent to linked gates need to be loaded, so the world stays
  seamless without loading everything at once. Also shapes how the editor
  models the world (a graph of gate-linked areas).
  Design ruled 2026-07-06 (see DESIGN.md "Gate links"). Staged build:
  - ✅ Stage 0 — editor modeling: stable gate ids + `facing` + `link` in the
    schema, PropertyPanel portal UI, bidirectional file sync
    (`editor/io/portalLinks.js`), violet viewport badge
  - ✅ Stage 1 — runtime crossing: walking through an OPEN linked gate swaps
    to the linked puzzle at the partner gate, recordings persist
    (`core/PortalManager.js`)
  - ✅ Stage 2 — see-through: while a linked gate is open, its doorway face
    (the `facing` side) shows the neighbor area, rendered live to texture
    from a portal-transformed off-axis camera (`core/PortalView.js`; pass
    runs only while open)
  - ✅ Stage 3 — live neighbor: the multi-area refactor (`core/Area.js`; one
    world of live areas orchestrated by `core/PortalManager.js`). Neighbor
    areas simulate every frame and are audible through the doorway
    (player→gate + partner-gate→source; closed doors leak faintly), linked
    pairs act as ONE door (shared song, mirrored open state, completable
    from both sides), crossing preserves neighbor state + the world clock,
    and tempo blends near mismatched doors. Open-world streaming beyond
    link-depth 1 sits on this.
  - ✅ Editor world-overview view over the derived gate-link graph: "World
    Map" modal (`editor/ui/WorldOverview.js` + `editor/io/worldGraph.js`) —
    puzzles as nodes, links as edges, one-way/dangling links flagged,
    orphaned areas dimmed, click a node to open that puzzle. Same-puzzle
    doors draw as loops on their node
  - ✅ Same-puzzle doors (in-level teleporters): two gates of one puzzle
    link to each other — editor offers "(this puzzle)" as a link target
    (both sides edited in the model, fully undoable), runtime reuses the
    door machinery unchanged, see-through renders the main scene. A gate
    can't link to itself. See DESIGN.md "Gate links" ruling 2026-07-07
  - ✅ Final doorway model (ruled 2026-07-09, shipped 2026-07-10 — target
    hit): crossing commits ON ENTRY — stepping into an open linked gate
    teleports at once, backing out exits the DESTINATION, every exit is
    plain walking against the destination's real geometry (a fully
    walled-in partner refuses to commit; a door never closes on its
    occupant's body). View panels sit on the cell's FAR planes (no dead
    frame at the threshold), clip at the window, and never pop with eye
    position. See DESIGN.md "Gate links / portals"
  - ✅ Gate latch rule (ruled 2026-07-10, superseding play-to-pass grace):
    gates open on the COMPLETED song, fade toward transparency while a
    correct performance is underway (bounded — still solid), LATCH open
    with no timer, and close when the player walks through — deferred
    while a parked performer holds them.
    Occupied-overtime state removed. Plus `alwaysOpen` faces (one-way /
    permanently-open doors — escape hatches; built, not yet used in POC).
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
