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

## World / editor (settled)

- **Ground floor (elevation 0) is implicit everywhere.** Floor regions exist
  for raised storeys (E1+) only and may not overlap at the same elevation.
  The editor rejects E0 regions with an explanatory toast.
- **Perimeter walls auto-generate OUTSIDE the grid** (rows/cols −1 and
  gridSize). Designers never place border walls; every grid cell is playable.

## Deferred features (wanted, not yet built)

- **Shapeable ground floor**: letting designers cut holes/shape E0 like other
  elevations (requires a void/unwalkable cell concept in the game).

## Open design calls — ask the designer before changing

- (none currently — match strictness was ruled exact-per-phrase, see above)

## Related docs

- Playtest-agent briefing, control map, and iteration log:
  `.claude/playtest-game-rules.md`
- Puzzle JSON schema: `puzzles/schema.md`
