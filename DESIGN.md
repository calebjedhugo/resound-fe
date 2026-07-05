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
- **`awakening` teaches by geometry**: creature → walled gate → ramp → ridge
  → second creature/gate → the **duet fountain** finale. Self-solve margins:
  every keyed creature ≥ 18 world units from its gate (range 15).
- **The duet fountain HARD-forces slot use** (settled 2026-07-05, after the
  designer showed the first draft was single-slot solvable by backtracking):
  - The fountain wants the chord **C4+C5 sounding together**. Playback is
    single-channel, so the C5 must come from creature B singing live in
    fountain earshot.
  - B is lurable only by consonance: E4 (the ridge creature's song, also the
    gate-2 key). C4↔C5 is an octave ⇒ 'perfect' ⇒ the C4 recording exerts
    no pull — it can't double as the lure.
  - Three penned **sentinels** ("guardian stones", F♯4 = tritone vs C5,
    interval 16, audibleRange 8) ring the fountain 120° apart. Their push
    discs jointly cover the fountain's entire audible disc, so B can never
    PARK in earshot — one sentinel alone always leaves a safe crescent on
    its far side (verified empirically; don't reduce to one). audibleRange
    8 < their 9–10.8 distance keeps the fountain deaf to them.
  - Net effect: lured progress decays in seconds-to-a-minute, far faster
    than any walk-back-and-re-record round trip ⇒ the player must hold the
    lure (E4) AND the duet voice (C4) in slots at the same time.
  - **Accepted depth**: clapping B desyncs it from the sentinels' shared
    beat grid, weakening eviction — a legal advanced shortcut (clap
    displacement is intended solution space), not a bug.
  - The fountain still exists only to close the completion loop until the
    open-world conversion lands.

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
