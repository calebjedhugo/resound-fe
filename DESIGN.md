# Resound — Design Intent

Designer-confirmed behaviors that can look like bugs or UX gaps but are the
game. **Do not "fix" these.** When playtesting or reviewing surfaces one of
them, the correct action is to document, not change code.

## Design philosophy

**Any design that requires words to be comprehensible is not a good design.**
Communicate through placement, color, iconography, and animation — not toasts
and labels. Examples of the pattern: the mismatch red flash on a gate/fountain
that heard a wrong phrase, the slot "pop" when a recording lands, the pulse of
a singing creature, floating target notation above gates/fountains. Prefer
adding/refining a visual channel over adding text. (The debug panel, F3, is a
dev tool and exempt — it also mirrors transient animations in text so
automated playtesters can observe them.)

## Core mechanics (settled)

- **Recording timing is a puzzle skill.** A recording is exactly what sounds
  between R-press and R-release — rotated phrases and repeats are valid
  takes. **Never add auto-trim/auto-stop/auto-align** (tried once during
  playtest iteration, reverted by the designer). Feedback that helps players
  *learn* the timing (live note count in the hint, note-count toast) is
  welcome; automation of the timing itself is not. Future puzzles combine
  this skill with clap displacement: shifting creature song timing (C key /
  `clapDisplacement`) to line recordings up with targets is intended
  solution space.
- **Creatures can activate gates/fountains themselves.** A creature in range
  singing a target's exact song solves it with no player input. Self-solving
  layouts are legal; the editor's job is to WARN about them (it does), not
  prevent them.
- **No aiming.** Sound is omnidirectional and proximity-based. Recording and
  playback care only about distance. No crosshair, no facing checks — ever.
- **Creature movement integration runs TWO physics passes per frame**
  (`CREATURE_PHYSICS_PASSES`), each with the full frame deltaTime, forces
  recomputed between passes. This began as an accidental double entity-update
  in the game loop, but every playtested movement value
  (`DEFAULT_CREATURE_MAX_SPEED`, `CREATURE_DECELERATION`, force strengths)
  was tuned under it, so the cadence is now deliberate — kept inside
  `Creature.update` (documented 2026-07-07, when the duplicate game-loop call
  was removed). Halving the passes halves effective creature speed and
  weakens per-frame damping: don't "simplify" to one pass without a designer
  ruling and a constant retune.
- **Sound carries by the SOURCE's `audibleRange`** (not the listener's).
  A creature's song reaches a gate/fountain iff distance ≤ the creature's
  range; playback inherits the `audibleRange` of the recorded creature.
  (Decided 2026-07-02; the editor validator uses the same semantics.)
- **Playback etiquette:** targets hear everything at once — notes interleaved
  during a playback corrupt the match. "Play while other sounds are quiet"
  is intended gameplay, not a bug.
- **Matching is exact — the performance must BE the target** (ruled
  2026-07-02): the target is a rhythm timeline of pitched onsets at real
  beat offsets (`SongMatcher.targetTimeline`), with **rests as expected
  gaps**; a performance matches when every target onset has a matching
  heard note at the right relative beat and NOTHING ELSE sounds inside the
  aligned window or within one beat of silence on either side
  (`core/phraseMatching.js`). Rotated takes fail, over-long takes fail,
  notes during rests fail, prefixes can't match before the trailing silence
  elapses, and stale earlier sounds neither help nor hurt. Polyphonic
  targets (chords, multi-voice) keep their true rhythm. A failed utterance
  flashes the target red (wordless feedback) and is logged in the F3 panel.
- **Gates are PLAY-TO-PASS, not latching** (ruled 2026-07-05, designer's
  idea). A gate opens **AS its song is performed** — the moment the heard
  notes are a correct in-progress rendering of the target, not after a
  completed match — and holds open while the song keeps sounding, then closes
  after a short step-through grace (`Gate.OPEN_GRACE_BEATS`, ~3 beats). The
  notation **stays displayed forever** so the song is a permanent part of the
  world. You perform the gate's song every time you want to cross. `isOpen`
  is the transient state (drives collision + green tint); there is no
  permanent `isActivated` on gates any more. Mechanism: `phraseMatching`
  returns `'in-progress'` for a valid ongoing prefix, which `Gate` treats as
  open; `true` (full song + trailing silence) additionally consumes the
  performance. Fountains ignore `'in-progress'` and still latch on the exact
  full match (they're the goal). Design leverage: because crossing always
  costs the gate's song, a gate can gate *access to a recording* — see the
  awakening two-slot forcing below.
  - **Prefix caveat (future multi-note gates):** opening on a valid prefix
    means a *partial* performance briefly cracks a gate. The current level's
    only gate is single-note, so prefix = whole song (no exploit). If
    multi-note gates appear and a partial-then-walk-through feels cheap, add a
    "must complete before it commits to fully open" rule.

- **Mouse-position camera is intended** (ruled 2026-07-03): the cursor's
  offset from screen center steers the view, and a cursor resting outside
  the center zone keeps turning the camera. This is the designed feel — do
  not replace it with pointer-lock or add dead-man's gating. (Designer is
  mulling a possible refinement: gradual turn slow-down after the mouse
  stops moving. Idea only; ask before building.) Keyboard look (M + IJKL)
  remains the alternative.

## World / editor (settled)

- **Ground floor (elevation 0) is implicit everywhere.** Floor regions exist
  for raised storeys (E1+) only and may not overlap at the same elevation.
  The editor rejects E0 regions with an explanatory toast.
- **Perimeter walls auto-generate OUTSIDE the grid** (rows/cols −1 and
  gridSize). Designers never place border walls; every grid cell is playable.
- **Elevated floors are raised platforms you can walk UNDER** (2026-07-05).
  A cell under an E1 slab is walkable at BOTH level 0 (beneath) and level 1
  (on top); `ElevationGrid.levels[z][x]` tracks the set, and movers carry
  their current layer (`getFloorY`/`getEffectiveElevation`/`canTraverse` take
  a `priorLevel`). You change layers only via a ramp; stepping off a
  platform edge onto a cell that lacks your level is blocked (cliff). Floors
  render as thin **slabs** (visible undersides + edge faces), and ramps are
  double-sided + glow with **marker posts** at the top edge so they read from
  every angle, including when hunting for the way down.

## Gate links / portals (ruled 2026-07-06)

Cross-puzzle gate links are the open-world backbone (see ROADMAP). Designer
rulings, in the designer's words where it matters:

- **"It's a door, not a portal"** — meaning VISIBILITY: looking through an
  open linked gate must show what's going on in the target area. The chosen
  mechanism is true portal rendering (render the neighbor through the gate
  face), so gates keep **full placement freedom** — no edge-of-grid
  requirement, no connector corridors.
- **The neighbor area is FULLY LIVE** once loaded: creatures move, sing, and
  are audible through the doorway. One world, one clock — so linked puzzles
  should share tempo/key. The editor **warns** on mismatch (doesn't block).
- **Doorway sound model (ruled 2026-07-07):** sound crosses a seam with
  effective distance = listener→gate + partner-gate→source, respecting the
  SOURCE's audible range. Transmission is **symmetric** (you can open a
  neighbor gate by playing through the doorway). A **closed door leaks
  faintly** (`CLOSED_DOOR_LEAK_DISTANCE` extra effective units) — by design:
  completing a song by singing on BOTH sides of a closed door is a puzzle
  element. Harmony forces cross too, pulling/pushing **toward the doorway**.
  Recording stays strictly per-area: a neighbor creature is audible but
  never recordable through a door.
- **A linked pair is ONE door with two faces (ruled 2026-07-07):** the same
  song opens both sides, open state is mirrored across the pair, and each
  face hears both areas — a creature on one side and a player on the other
  can complete the song together.
- **Tempo gradient (ruled 2026-07-07):** the single world clock runs at the
  ACTIVE area's tempo but blends toward a mismatched neighbor's tempo as the
  player nears its door (reaching the midpoint AT the doorway, symmetric on
  both sides), so tempo is continuous through a crossing. Beat position is
  never reset by a crossing.
- **Crossing preserves the neighbor's state.** What you saw through the door
  is exactly what you walk into — crossing swaps areas, never rebuilds them.
  Areas beyond link-depth 1 unload (their state resets on the next visit;
  deeper streaming is a later stage).
- **Links are bidirectional and auto-synced.** Linking A→B writes B→A into
  the target file; clearing/renaming/deleting keeps the partner in sync
  (`editor/io/portalLinks.js`). Never hand-author a one-way link. The world
  graph is DERIVED by scanning puzzle files — there is no world.json.
- **Gates stay play-to-pass.** A linked gate opens exactly like any gate (by
  performing its song); the link only changes what's on the other side.
  Crossing = walking into the OPEN gate's cell. You arrive one cell outside
  the partner gate, facing away from it, and your recordings come with you —
  areas are one world, so "gate songs as keys you carry" works across seams.
- **A linked pair shares ONE song** (ruled 2026-07-07; "for now, I might
  change my mind later"). The pair mirrors its open state at runtime, so
  differing songs are ill-defined. Linking unifies: the INITIATING gate's
  song wins; a song-less side adopts the other's; replacing a real song on
  the target requires an explicit confirm (declining cancels the link). The
  validator errors on a same-puzzle pair whose songs drift apart after
  linking (relink to re-unify).
- **A closed linked gate looks like any closed gate.** The door reveals
  itself only when opened.
- **Doors are omnidirectional (ruled 2026-07-07):** every side of a linked
  gate can be walked through, and EVERY face the player can see shows the
  view through the door (two at a corner — a working open door never shows
  a green shell from any angle; only unlinked and dangling gates keep the
  open-gate green). Applies to ALL links — same-puzzle teleports and
  cross-puzzle doors are one mechanism. `facing` still exists in the schema
  (default "north") but the editor's Facing dropdown is PARKED (commented
  in PropertyPanel); Caleb may bring it back.
- **Entry face → opposite exit face (ruled 2026-07-07):** looking into the
  north end of a door shows out the SOUTH end of its partner (and so on for
  every direction) — the pair maps by pure translation, no mirror flip —
  and crossing matches: step in the north end, come out the partner's south
  end with your heading unchanged. If the matching exit cell is blocked,
  arrival falls back to the first clear side (never inside a wall — the
  no-soft-lock rule) and snaps the view to the rerouted direction.
- **A door is a sound shortcut, even within one puzzle:** sound takes the
  shortest path — direct or through a door (player→gate + partner→source,
  leak while closed). A creature far across the map is loud through an open
  in-level teleport door. Recording still takes REAL proximity, never a
  doorway.
- **Same-puzzle doors are allowed (ruled 2026-07-07):** two gates of ONE
  puzzle may link to each other — an in-level teleport door. All door rules
  apply unchanged (one door two faces, play-to-pass, see-through shows the
  destination, crossing exits the partner). Same-area sound stays DIRECT
  (the seam adds nothing — the room already hears itself), and tempo/key
  trivially match. A gate can never link to itself (validator error).
- **Editor-side caveat (dev tool):** cross-puzzle link edits touch TWO
  files; the local side is undoable, the partner file is not — use Clear
  Link, not undo, to unlink. (Same-puzzle links live entirely in the open
  model, so both sides ARE undoable — as two steps.) Listing a puzzle as a
  link target materializes ids/facing into its file on disk (write-on-read,
  by design).

## Onboarding (settled 2026-07-05)

- **No words, no controls overlay.** The full-screen help screen is gone
  (`ControlsOverlay` deleted). Teaching happens through wordless contextual
  key hints (`ui/KeyHints.js`): bare keycap glyphs that appear the first time
  a situation calls for an action and retire **permanently** once the player
  performs it (`core/HintMemory.js`, localStorage `resound-hints`). Hints:
  WASD cluster (idle at spawn), floating "R" over a creature in recording
  range, floating spacebar over a target in playback reach, slot arrows when
  recording would overwrite the active slot.
- **Boot straight into the world, not the menu.** The first manifest entry
  (`awakening`) is the intro level and the game's front door; the menu is
  reachable via Esc → Main Menu. The `?puzzle=<id>` editor deep link wins
  over the default.
- **The start gate replaces the overlay's freeze role.** Each level starts
  behind a dark scrim with a pulsing ring; any key/click wakes the world.
  While it's up, the clock and creatures hold still (self-solve protection)
  and the waking gesture satisfies the browser audio-interaction rule.
- **`awakening` teaches by geometry** (compact grid 18; rebuilt 2026-07-05):
  Creature A (C4) → Gate 1 (C4, play-to-pass) → Creature X (E4) on the ground
  + ramp UP to a platform where Creature Y (G4) lives → **melody fountain**
  wanting **[E4, G4]** played in sequence. The ramp is part of the *solution*
  (you must climb it to record G4). The whole geometry is generated +
  self-checked by `puzzles/gen-awakening.js` (18 interference / forcing /
  non-stuck / connectivity assertions).
- **Two-slot use is forced by TIMING, and CANNOT soft-lock** (settled
  2026-07-05):
  - The fountain wants the melody [E4, G4]: E4 from creature X, G4 from
    creature Y. X and Y are too far apart to capture in one recording (the
    generator asserts `dist(X,Y) > recordRange_X + recordRange_Y`), so each
    goes in its own slot. To solve, you play E4, switch slots (←/→), and play
    G4 — the two onsets must land in the SAME phrase. A one-slot player must
    re-record G4 between the notes; that walk is many beats of silence, so the
    fountain hears two separate phrases and never matches. Verified in-browser:
    two-slot solve lands first try; a 9-second re-record gap fails.
  - **No stuck state, by construction.** The gate's key (C4) is deliberately
    NOT one of the melody notes, so C4 is only ever needed to cross Gate 1 —
    never again. Overwrite any slot and just re-record; ramps are two-way;
    every creature stays reachable; there is no one-way trap. This *replaces*
    the earlier "C4 unrecoverable once north" forcing, which could soft-lock a
    player who overwrote their C4 recording (the designer's deal-breaker).
  - Whole-note melody: the fountain wants two whole notes because the playback
    lock holds the second note until the first (a whole note) finishes, so the
    onsets land ~4 beats apart on their own — "play E4, then play G4 when it
    lets you," no tight timing. A quarter-note target would demand a 1-beat
    gap the lock can't produce from whole-note recordings.
  - **Superseded designs (do not resurrect without solving their flaw):** (1)
    a duet fountain (chord C4+C5) with a lured live creature B and three
    dissonant "guardian" sentinels — the sentinels' equal force-radii left a
    dead annulus where B parked, and the whole duet forced slots only via
    fragile force-balance. (2) forcing via an unrecoverable C4 behind the gate
    — soft-locks. The melody approach forces slots through timing with zero
    force-tuning and zero lock risk.
  - **The lure/consonance-movement mechanic now has its OWN level** (`the-lure`,
    added 2026-07-05) — it was cut from this intro for scope, not as a
    regression. See the `the-lure` entry below.
  - The fountain still exists only to close the completion loop until the
    open-world conversion lands.
- **`the-lure` teaches the lure by necessity** (added 2026-07-05): the second
  onboarding piece, one element (harmony moves creatures) taught wordlessly. A
  1-wide corridor runs from the spawn room to a **sealed fountain** (wants G4)
  with two creatures in it — **P1 (C5)** blocks the south end, **P2 (G4)**
  stands north between P1 and the fountain. One recordable voice **V (A4)** in
  the spawn room is the only tool, and A4 is **relational**: consonant with C5
  (**PULL** P1 out of the corridor) and dissonant with G4 (**PUSH** P2 into the
  fountain's range, where P2's own song activates it). The *same* note does
  opposite things depending on the creature's pitch — that's the lesson.
  - **Both directions are forced by the note economy, not by tuning.** You are
    always south of each creature (blocked by its body), and no other useful
    note is reachable: A4 can only pull P1 (nothing dissonant-with-C5 is in
    reach) and can only push P2 (nothing consonant-with-G4 exists). So P1 leaves
    only southward and P2 only northward — into the fountain.
  - **The finish is hardened** (Caleb's call, 2026-07-05): P2 bodily blocks the
    1-wide corridor and the fountain is sealed, so you can NEVER reach it to
    play G4 yourself — the only G4 that reaches the fountain comes from P2's own
    throat, driven there by the push. A4's range is small enough that your
    playback never bleeds in to corrupt the match. This makes the puzzle
    unsolvable by "record a creature, play it at the target" — the anti-pattern
    the trivial fountain in `awakening` still allows.
  - **Non-stuck by construction:** you only ever need ONE note (A4), always
    re-recordable from V, so you cannot strand yourself by overwriting a slot;
    the corridor is two-way; no elevation, no one-way trap.
  - **Bleeds one extra element on purpose:** the hardened finish means P2's song
    activates the fountain — a first taste of "creatures activate targets" (a
    later planned piece). Accepted trade for a finish that resists
    record-and-play. Generated + self-checked by `puzzles/gen-lure.js` (25
    harmony / forcing / interference / non-stuck asserts).

## Deferred features (wanted, not yet built)

- **Shapeable ground floor**: letting designers cut holes/shape E0 like other
  elevations (requires a void/unwalkable cell concept in the game).
- **Open world**: `awakening` is the seed — after the controls are learned it
  should open into an explorable world rather than a puzzle list.

## Open design calls — ask the designer before changing

- (none currently — match strictness was ruled exact-per-phrase, see above)
- **Remaining word-toasts** (recording errors, "Recorded N notes…",
  mouse-look toggle, metronome): DESIGN.md blesses the note-count toast, but
  they're now the only words left in play. Keep, restyle wordlessly, or drop?

## Related docs

- Playtest-agent briefing, control map, and iteration log:
  `.claude/playtest-game-rules.md`
- Puzzle JSON schema: `puzzles/schema.md`
