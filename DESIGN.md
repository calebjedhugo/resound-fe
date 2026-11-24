# Resound — Design Intent

Designer-confirmed behaviors that can look like bugs or UX gaps but are the
game. **Do not "fix" these.** When playtesting or reviewing surfaces one of
them, the correct action is to document, not change code.

## Design philosophy

**Any design that requires words to be comprehensible is not a good design.**
Communicate through placement, color, iconography, and animation — not toasts
and labels. Examples of the pattern: the mismatch red flash on a gate/fountain
that heard a wrong phrase, the slot "pop" when a creature lands in it, the glow of
a singing creature, floating target notation above gates/fountains. Prefer
adding/refining a visual channel over adding text. (The debug panel, F3, is a
dev tool and exempt — it also mirrors transient animations in text so
automated playtesters can observe them.)

## Core mechanics (settled)

- **The inventory holds CREATURES: R absorbs one with a pole, Space releases
  it** (ruled 2026-11-23 — the designer: "Instead of recording, the creature
  is put into inventory. Instead of playback, the selected creature is
  deployed." SUPERSEDES recording, tape playback, the playback etiquette and
  red-miss rules below, each marked). The controls and UI are the old ones,
  reused:
  - **R / Square absorbs** a creature the pole reaches — the old recording
    rule (active area, real distance ≤ `audibleRange × 0.5`, never through a
    door) AND, since the rulings below, only one IN FRONT of the player and
    IN SIGHT; of those, the best centred, then the nearest — into the CURSOR
    slot. If the cursor slot already holds
    a creature, it goes into a NEW slot at the end of the strip and the
    cursor follows ("If there is already a creature in the slot, simply make
    a new one"; an empty last slot is reused). Refused with the grey slot
    flash when nothing is in reach or the strip is full (16). Plain presses:
    no tap/hold.
  - **Space / Cross releases** the cursor slot's creature 2.5 units ahead
    along the effective camera heading, on walkable floor of the player's
    own storey where its body fits — never in or over a wall, gate,
    fountain, waystone, ramp, cliff edge or off the grid, nor into another
    body, nor anywhere the player can't SEE it land (past a wall's corner,
    a closed gate or a door: the same sightline as absorbing). Bad spot or
    empty slot: grey flash. The slot is empty after.
  - **One pole action at a time**; R and Space during one are ignored.
  - **Absorbed = silent at once**: the creature stops singing the moment the
    tip touches it (no partial song reaches a gate after that) and stops
    moving; its body leaves the world once drawn in. **Released = the same
    creature**: same song, timing, range, body, speed and VOICE (the
    theremin voice it rolled: "Creature voice") — but its schedule starts again on the beat it is let out
    (ruling below; it used to keep its old phase). It stays still and out of
    reach until the pole is back.
  - **Nothing duplicates or vanishes across area pruning**: a puzzle's own
    creature, once absorbed, never respawns when the area is rebuilt from
    its JSON; a released creature lives on in its area, where it stood (and
    since the ruling below, so does everything else that happened there).
  - **The look** (the designer: "poking the creature with a pole, and the
    creature is absorbed into it … not just get smaller, but deformed toward
    the end of the pole and back out again"): a first-person telescoping
    pole, dark rod and pale softly glowing tip, from a hand at the lower
    right of view (main view only, hidden at rest). Absorb (~1.1 s): the
    pole extends until its tip touches the creature's near flank (the side
    toward the hand, so the pull is seen from the side) → the body is drawn
    into the tip, the side nearest it first and the far side last, a
    twisting funnel narrowing to a point — never a uniform shrink; its halo
    and light fade with it → the tip flares in the creature's colour → the
    pole retracts. Release is the exact reverse: extend, flare, the creature
    pours out of the tip and reforms, retract, alive. The slot shows the
    held creature as a small glowing orb in its colour with its song's note
    count; the old mic badge is the REACH mark (a pale ring, ×N creatures in
    reach) and pulses red during an absorb. Key hints: R floats over the
    creature R would take (retires on the first absorb), a small spacebar
    floats low over the release spot while a creature is held (retires on
    the first release). The tape's grow hint is gone (nothing is ever
    overwritten).
  - **The cleanser is the WAYSTONE** (ruled 2026-11-23, after the interim
    "it no longer clears the inventory" — the designer: fine, it's the
    waystone now). It cleans nothing; it stays as a game element: stepping
    on one makes it the ACTIVE (gold) waystone, and the G gate takes the
    player back to the last one they stepped on. Entity `waystone`
    (`entities/Waystone.js`, `entities/WaystoneGatePad.js`, "the waystone
    gate"); puzzle JSON that says `cleanser` still loads as a waystone
    (the POC files keep it), and the editor writes `waystone`.
  - **Absorb only what you face** (ruled 2026-11-23, SUPERSEDING "No
    aiming… no facing checks — ever" for absorbing): a creature is in reach
    only while some part of its body lies within **40°** either side of the
    EFFECTIVE camera heading (mouse offset included — the heading a release
    aims along), horizontally. 40° keeps the cone well inside the view
    (a 16:9 view is ~53° either side; at the cone's edge the body still
    shows at the screen's edge — judged in-game), so the pole never takes
    what the player can't see. The reach mark (×N), the R hint and R share
    the one rule (`core/poleReach`; Creature `isAbsorbable`), so neither
    ever promises an absorb R would refuse. Among those in reach R takes
    the best centred, then the nearest (off-centre share of the cone plus
    distance share of the reach, lowest wins).
  - **Walls block absorbing** (ruled 2026-11-23): the sightline from the
    eye to the creature's floating centre must be clear — of walls (their
    2.5-high boxes: from a storey above you can look over one), closed
    gates, and ANY door (an open linked gate shows another place, never
    this area behind it; an open plain gate is an empty doorway and lets
    the sight through), of a storey's slab wherever the sightline crosses
    its height (a creature up on a platform is out of sight from beneath,
    and one below a ledge from the middle of it), and of a ramp's wedge.
    The sightline walks every grid cell it crosses — both cells where it
    passes exactly through a corner, so it never squeezes between two
    walls meeting corner to corner. A release must land where that same
    sightline reaches (the release spot's old two-sample path check missed
    a corner squeeze; the sightline catches it).
  - **The world forgets nothing** (ruled 2026-11-23, superseding "their
    state resets on the next visit"): an area pruned beyond link-depth 1
    comes back, when it is rebuilt from its JSON, as it was left. At the
    prune each of its puzzle entities' state is snapshotted
    (`core/WorldMemory`, grown out of CreatureRegistry) and handed back as
    the area is built again: a creature where it was pushed or lured, on
    its layer, drifting as it was, in its own voice (its rolled timbre),
    singing on its own phase — its next sing beat from the ONE world clock,
    never from the rebuild; a gate open or closed, a close waiting on a
    performer, its openings count (no new storm strike) and its last
    completion; a fountain activated (latched and lit, its song not played
    again). The active waystone was already remembered by place
    (`gameState.activeWaystone`). What is NOT kept: what a gate was hearing
    mid-performance (a performance doesn't outlive its listener's area).
    A deployed waystone gate now keeps its own area live while it stands
    (it used to die with a pruned area). Measured in the POC chain
    (2026-11-23, dev build): a prune's snapshot 0.03-0.18 ms per area
    (57-177 entities), a rebuild's lookups 0.12 ms in all, the rebuild
    itself ~4.6 ms as before — no measurable cost. The only real cost is a
    deployed gate's area simulating while it stands.
  - **A released creature sings its FIRST NOTE ON THE BEAT IT IS LET OUT,
    and this REPLACES CLAPPING** (ruled 2026-11-23). The press is quantized
    as the tape's playback start was: within `RELEASE_LATE_GRACE_BEATS`
    (0.1 beat) past a beat it IS that beat — the first note sounds at once
    and the rest of that song is drawn back onto the grid — else the next
    beat. Its schedule restarts there (next sing beat = that beat, then +=
    interval), whatever phase it sang on before. The pole's reach-out,
    flare and pour (0.87 s at rest) are compressed to finish just before
    that beat, never quicker than 0.25 s (`RELEASE_MIN_EMERGE_S`); with the
    beat closer than that it starts singing while still pouring out of the
    tip — singing, but still and out of reach until the pole is back. Its
    voice and first song are built at the press (`AudioPrewarm.prepareNow`,
    ~1.4 ms on the key press, measured), so the beat it sings on builds no
    audio node. Like every creature song its onset lands on the first frame
    at or after the beat (measured in-game: 157.02 and 202.001 for beats
    157 and 202). **Clapping is gone**: the C key does nothing in the
    world, the pad's Circle only backs out of menus, and the clap hint, the
    clap ring, the creature's white clap flash and `clapDisplacement` went
    with it (old puzzle JSON that has the field still loads; the field is
    ignored and the editor no longer writes it). Retiming a creature is
    now: take it, and let it out on the beat you want.
  See `core/AbsorbManager.js`, `core/WorldMemory.js`, `core/poleReach.js`,
  `entities/PoleLook.js`, `CreatureLook` `setSuck`.

- **(SUPERSEDED 2026-11-23 — there is no recording.) Recording timing is a puzzle skill.** A recording is exactly what sounds
  between R-press and R-release — rotated phrases and repeats are valid
  takes. **Never add auto-trim/auto-stop/auto-align** (tried once during
  playtest iteration, reverted by the designer). Feedback that helps players
  *learn* the timing (live note count in the hint, note-count toast) is
  welcome; automation of the timing itself is not. Future puzzles combine
  this skill with clap displacement: shifting creature song timing (C key /
  `clapDisplacement`) to line recordings up with targets is intended
  solution space. (Clapping was removed too, 2026-11-23: a creature is
  retimed by releasing it on the beat.)
- **Creatures can activate gates/fountains themselves.** A creature in range
  singing a target's exact song solves it with no player input. Self-solving
  layouts are legal; the editor's job is to WARN about them (it does), not
  prevent them.
- **No aiming at targets.** Sound is omnidirectional and proximity-based. No
  crosshair, no facing checks at gates or fountains. (The POLE is the one
  exception, ruled 2026-11-23: it absorbs only a creature in front of the
  player and in sight — see "Absorb only what you face" above — and a
  release lands where the view points. Still no crosshair.)
- **Creatures collide with the player's body, symmetrically** (fixed
  2026-07-11): a lured creature parks at contact distance (creature radius
  0.9 + player radius 0.4 = 1.3) instead of entering the player's space —
  overlapping bodies wedged the player unrecoverably (every escape move
  still collided). Active-area only (coordinates are per-area).
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
  range. (Decided 2026-07-02; the editor validator uses the same semantics.
  The playback half — a tape carrying its creature's range — went with
  playback, 2026-11-23.)
- **(SUPERSEDED 2026-11-23 — the player no longer plays.) Playback etiquette:** targets hear everything at once — notes interleaved
  during a playback corrupt the match. "Play while other sounds are quiet"
  is intended gameplay, not a bug.
- **Matching: the gate must hear its song EXACTLY — and how that happens
  does not matter** (ruled 2026-07-11, superseding the 2026-07-02 "the
  performance must BE the target" silence margins; the original design
  spirit, reclaimed). The target is a rhythm timeline of pitched onsets at
  real beat offsets (`SongMatcher.targetTimeline`), with **rests as
  expected gaps**; a performance matches when, for some anchor, every
  target onset has a matching heard note (pitch AND duration) at the right
  relative beat and NOTHING ELSE sounds INSIDE the aligned window
  (`core/phraseMatching.js`). Sounds before or after the window are none
  of the gate's business: a target embedded in a longer performance
  MATCHES (the whole tape plays on Space — every door whose song occurs
  cleanly within it opens), over-long takes match, and completion fires
  the moment the target's last note ends (no trailing-silence beat). What
  still fails: rotated takes, prefixes, and any foreign note DURING the
  window — a chord where a single note is due, a sound during a target
  rest. **In-window exclusivity is load-bearing**: it is why a continuous
  singer beside a door jams it forever (poc-jam/poc-pull) and why the
  "premature open when a longer song contains the gate's song" worry is
  handled by puzzle design (octave-exact pitches, duration typing), not by
  mechanics. Polyphonic targets (chords, multi-voice) keep their true
  rhythm. A failed utterance flashes the target red (wordless feedback)
  and is logged in the F3 panel.
  - **Ties and dots match as they SOUND (ruled 2026-11-24):** a tied pair
    is ONE held note (one onset lasting both values: a quarter tied to a
    quarter matches a held half note, never two struck quarters); ties are
    per note, so in a chord only the tied tone holds. A dot lasts x1.5, a
    double dot (`dotted: 2`) x1.75 (`core/noteBeats`). A heard note's length
    is its `durationBeats` when the source reports one, else its `length`
    + `dotted`; a reported tie continuation is held, not struck.
  - **Onset-boundary grace (2026-07-11, round 4):** between one note's end
    and the next onset of a correct take, the due note arrives a few frames
    "late" (scheduling jitter inside the matcher's own tolerance). A due
    onset with NO note yet is judged *pending* (still in-progress) until
    `now` is conclusively past it — so the gate's fade never snaps opaque
    between the notes of a correct performance. A WRONG note at the onset
    still fails instantly; Gate's fade also RESUMES from its current level
    rather than restarting at opaque after any momentary judgment gap.
  - **Wrong notes are judged IMMEDIATELY (ruled 2026-07-16, superseding
    judge-at-utterance-end):** the red flash lands on the offending note
    itself, whatever its source — player OR creature. (The old rule waited
    for the utterance to end plus a beat of silence, so a continuous singer
    near a gate never flashed it; only poc-clap's gapped singers did.) The
    one grace: a beat-group whose grid slot is still within tolerance may
    be a chord mid-assembly, so judgment holds until its slot passes
    (`TOL_BEATS`, ~a 16th).
  - **Wrong-note LOCKOUT on gates (ruled 2026-07-16):** a mismatch voids
    everything the gate has heard AND deafens it for a short window
    (`Gate.MISMATCH_LOCKOUT_MS`) — notes played during the lockout are not
    captured at all. Consequence: the target can no longer ride in behind
    wrong notes — **a performance must START with the target's first note**
    (pre-window surplus is dead; post-window surplus is still fine, since
    completion fires the instant the target's own span elapses). The red
    flash decays over exactly the lockout window, doubling as the wordless
    "gate is resetting — wait" signifier. Fountains keep the old
    no-lockout capture (flash is immediate there too).
- **Gates open on the COMPLETED song, LATCH, and close when you walk
  through** (ruled 2026-07-10, superseding the 2026-07-05 play-to-pass grace
  and its multi-note caveat). The full rule:
  - **Open**: only when the whole song lands (`phraseMatching` returns
    `true` — since the 2026-07-11 matching ruling, that is the INSTANT the
    song's final note completes; no trailing-silence beat, so the old
    briefly-invisible-but-solid moment is gone). A valid in-progress
    performance never opens a gate — instead the closed shell **FADES from
    opaque to FULLY transparent in step with the song's own progress**
    (designer's calls, 2026-07-10: transparency is the game's vocabulary
    for "open", so the fade literally previews the state being earned; and
    the fade rate follows the song's length, reaching full transparency as
    the song ends). A wrong note snaps it back to solid with the red
    flash. For LINKED doors, the portal views render DURING the fade
    (designer's call, 2026-07-11): the destination materializes through
    the dissolving shell — the fade previews the real other side, not the
    dead space behind the gate box. This kills the prefix exploit for
    multi-note doors and unifies single- and multi-note behavior.
  - **Stay open**: indefinitely. There is NO timer — an open gate waits.
  - **Close**: when the player walks through (body fully clear of the cell;
    for linked doors this means stepping out of the DESTINATION face —
    PortalManager consumes the crossing; backing out of a refused commit
    consumes nothing). A door can therefore never close on an occupant, and
    the old "occupied overtime" state is gone.
  - **Held open by performers**: if a correct performance is in progress or
    a completion just landed (`Gate.HELD_AFTER_COMPLETION_BEATS`) at exit
    time, the close is DEFERRED until the hold lapses — a parked creature
    singing the song keeps the door open behind you for as long as it
    stands there (its in-progress + just-completed windows chain into a
    continuous hold; verified live: a door with the poc-push pusher parked
    beside it stays open 100% of the time).
  - **An open gate has NO shell at all — no green tint** (ruled 2026-07-11,
    round 4): transparency is the game's vocabulary for "open", for linked
    doors and plain gates alike, so `isOpen` drives collision + full
    transparency. The red mismatch flash still lands on the CLOSED look.
    (2026-11-22, designer request: an open gate glows "in motion, like a
    rippling portal" — doors only (a plain gate stays an empty opening),
    only around the portal's silhouette from the eye, in the main view,
    the way through completely clear; 2026-11-23 that glow became a soft
    seam where the door's view and the world blend. See "Entity look".)
  - The notation **stays displayed forever**; there is still no permanent
    `isActivated` on gates.
    Fountains are unchanged (latch on the exact full match). Re-crossing a
    consumed door costs a fresh performance, so "songs as keys you carry"
    is intact.
  - **Puzzle leverage gained**: open a door, then do something else — herd a
    creature through the gap, set up a second performance — and only your
    own crossing consumes it. Timed sprint-under-pressure gates were
    deliberately traded away; if wanted later, a visually distinct
    "sustain gate" (open only while its song sounds) can return as a rare
    vocabulary element.

- **(SUPERSEDED 2026-11-23 by "The inventory holds CREATURES" above: the
  strip, its cursor and → growth stand; R records, Space performs the tape
  and the cleanser's wipe do not. Kept for history.) The inventory is a
  TAPE, and Space performs all of it** (ruled
  2026-07-11, superseding the 2026-07-10 queue-on-Space chaining — its
  intent, effortless multi-slot sequencing, is now automatic). The slot
  strip is a growable tape (boot = ONE slot, cap `TAPE_SLOT_CAP`):
  - **←/→ move the cursor**; → on a FILLED last slot appends a fresh empty
    one (progressive disclosure — new slots exist only once the previous
    is filled). Digit keys are gone.
  - **R records into the cursor slot, in place** — re-recording a middle
    slot is how a wrong note gets fixed without rebuilding the tape.
  - **Space plays the WHOLE tape**, every filled slot in order,
    concatenated into one song. Takes are stored dense (notes with
    lengths, no gaps — recording captures content, not silence), so
    concatenation is seamless on the musical grid; a Space during a
    playback is ignored (one performance at a time). Combined with the
    matching ruling above, a door opens whenever its song occurs cleanly
    anywhere in the tape — the tape is a key ring that plays itself.
  - **Clearing the tape is a CleansingTile, not a key** (ruled 2026-07-12,
    replacing the hold-to-delete verb). There is NO per-slot delete: a
    playtester who knew nothing about the game refused to use delete for
    fear of stranding himself, so "reset my recordings" became a place in
    the world instead. A `cleanser` entity (`entities/CleansingTile.js`) is
    a gently pulsing walkable floor tile; stepping onto it empties the whole
    tape to one blank slot (edge-triggered on entry, active-area only). It
    reads as safe because you walk to it on purpose. Clearing is never
    REQUIRED by a puzzle — it's tape hygiene (long tapes take long to
    perform and spray notes near force puzzles) — but because a cleanser can
    leave you with an empty tape, the POC generator still asserts every
    reachable pocket is escapable from an EMPTY tape (see gen-poc.js). The
    first cleanser ships in `poc-two-keys`, mid-corridor at the entry so
    the player walks through it on the way in (trial placement — 2026-07-12).
  - **The ACTIVE cleanser + the deployable cleanser gate** (ruled
    2026-07-18; since 2026-11-23 the cleanser is the WAYSTONE and this is
    the waystone gate — names below as they were). Stepping on a cleanser
    makes it the ACTIVE one — it turns
    GOLD (the rest stay pale; one active tile world-wide) and becomes the
    destination of the player's deployable gate. "G" cycles: aim (a phantom
    cleanser two tiles ahead along the EFFECTIVE camera heading — mouse
    offset included, so it answers the look as well as the body; free
    placement on walkable ground, NOT grid-quantized, red over invalid
    spots) → deploy → remove. A deployed gate looks JUST LIKE any other
    activated gate: a full box of see-through portal panels (one per
    face, self-culling like a door's window box) showing the live view
    of the active cleanser's cell and the room beyond — the GOLD tile is
    visible THROUGH the gate, so the deployed gate draws no cleanser
    disc of its own. Its area is retained live while the gate exists,
    and the views retarget if a new cleanser is claimed. While a gate is
    deployed the G hint wears a 🚫 badge: G now means cancel.
    Walking into the gate teleports the player to the active cleanser and
    CONSUMES the pad — strictly one-way, one use, one pad at a time, and
    the gate can lead anywhere (cross-area; the destination loads on
    demand). Arrival lands ON the cleanser, which fires as usual — escape
    always costs the tape (part of the point: a free, songless teleport
    must not cheapen earned gates). World state does NOT reset (moved
    creatures, opened gates persist) — that persistence is what makes it a
    puzzle piece, not just an escape hatch, and because the exit is a place
    the player has already stood, it can never skip content forward. Also
    the mechanical never-soft-lock guarantee. Aiming requires an active
    cleanser (no touched drain, no gate); the lesson is taught in IX ("The
    Star", `teaches: ["deploy"]`) where the player steps on a cleanser on
    the way in. Cancel (interim ruling 2026-07-18): "g again to cancel" —
    a deployed gate is removed by the third G, and the G hint teaches the
    WHOLE cycle (it retires only when a deployed pad is removed or walked
    through, not on deploy). Aiming itself still can't be exited without
    deploying — revisit after play. See `core/DeployManager.js`,
    `entities/WaystoneGatePad.js`, `PortalManager.teleportToWaystone`.
  Solo starts keep the beat grid with the late grace expressed in BEATS
  (`PLAYBACK_LATE_GRACE_BEATS`, kept under the matcher tolerance so a
  grace-path onset still matches). See `PlaybackManager`, `core/Tape.js`.
- **Harmony forces act on a SINGING listener, gated by ITS OWN range**
  (documented 2026-07-10 — earlier docs had this backwards): a creature is
  pushed/pulled only WHILE it sings and another note sounds within the
  creature's own `audibleRange` (unlike gate/recording audibility, which
  carries by the SOURCE's range). Creature-to-creature forces exist and are
  the basis of the dance diorama; equal-and-opposite simultaneous sources
  cancel exactly (forces are unit-direction × strength), which is why the
  dance's anchors ALTERNATE.
- **Wordless failure feedback is the SLOT FLASH language** (ruled
  2026-07-10, replacing the gameplay toasts; the R7 red-slot proposal
  shipped; since 2026-11-23 only the GREY pulse remains — R or Space found
  nothing to do — the red one went with playback): RED pulse on the active slot = a performance was judged and
  MISSED, fired at JUDGMENT time and only for phrases inside the player's
  own playback window (ambient creature noise never flashes it); GREY pulse
  = nothing heard you / nothing there (playback out of every target's range,
  Space on an empty slot, R with no creature close, an empty take). The
  target itself still red-flashes on a heard-but-wrong phrase. The recording
  note-count sentence is gone — the live count ticks up on the active slot.
  Remaining words (mouse-look toggle, sound on/off, metronome, puzzle-load errors) are
  settings/dev feedback, not gameplay.
- **Mouse-position camera is intended** (ruled 2026-07-03): the cursor's
  offset from screen center steers the view, and a cursor resting outside
  the center zone keeps turning the camera. This is the designed feel — do
  not replace it with pointer-lock or add dead-man's gating. (Designer is
  mulling a possible refinement: gradual turn slow-down after the mouse
  stops moving. Idea only; ask before building.) Keyboard look (M + IJKL)
  remains the alternative.
- **A game controller plays too** (mapping approved 2026-10-18; PS4
  DualShock 4 or any "standard"-layout pad, `core/Gamepad.js`, game only).
  Left stick walks/strafes at its tilt (full tilt = walking speed); holding
  L2 runs, and clicking L3 runs until the stick comes back to rest; right
  stick looks, its tilt squared so a small tilt aims finely (full tilt ~1.5x the keyboard's look
  speed). Buttons ARE keys (each press goes out once as its key, no
  auto-repeat): Cross = Space (release), Square = R (absorb; since
  2026-11-23 — it used to record, tap toggling), Circle = C (which only
  backs out of menus since clapping went, 2026-11-23), Triangle = G,
  L1/R1 and d-pad ←/→ = the tape cursor,
  Options = Esc, Share = P (sound on/off); any other button is an unbound
  key (it still wakes the start gate and dismisses the ending card). A held key drives its axis
  alone (stick + key never doubles the speed).
  **Menus** (pause, main; 2026-11-22) play the same way, through keys: the
  d-pad's ↑/↓ (keys ↑/↓) move a visible focus between the entries,
  wrapping around at the ends, and the left stick steps it too (repeating
  after 0.4 s held, then every 0.15 s); Cross (Space, Enter) chooses, Circle
  (C) backs out (resumes from pause), Options (Esc) still toggles pause.
  The focus starts on the first entry each time a menu opens and follows
  the mouse. Nothing in the world answers while a menu is up (no pole or
  tape-cursor move behind it). The ending card's link stays mouse-only:
  a pad press can't open a tab. Browsers don't count a pad
  press (or Esc) as the gesture that unlocks audio, so either wakes the
  start gate only into a world with sound; on a fresh page the gate stays up and
  shows its one line, "press a key or click to start sound" — settings
  feedback like the mouse-look toast, not gameplay words.
  **The key hints follow the device in hand** (asked for 2026-11-22: "if
  using a controller let's switch the hints to be that of the controller.
  Bonus if we can detect the type of controller and adapt the hint to the
  controller."): the last MEANINGFUL input decides — a pad button going
  down or a stick leaving its dead zone switches to the pad's glyphs; a
  real key, a mouse button or the mouse travelling ~24 px switches back
  (and a pad leaving, none left). A pad merely connected, a stick at rest,
  or a stick held over while the mouse moves switches nothing, so nothing
  flickers. Hints on screen swap their glyph in place. The family comes
  from the pad's id (vendor id where the browser gives one, else its
  name): **PlayStation** (Square / Cross / Circle / Triangle drawn as
  shapes, L/R sticks, R1, Share — Create on a DualSense), **Xbox** (X / A /
  B / Y, LS/RS, RB, View), **Switch** (Y / B / A / X: the standard layout
  is positional, so the bottom button is "B"; L/R, R, Minus), **generic**
  (the four-button diamond with the button's position lit; RB, Select).
  Glyphs stay in the hints' one style — dark cap, white rim, GOLD mark —
  with no button colours (red over a creature would read as the wrong
  note's red). The move cluster becomes the left and right sticks; the
  tape's grow hint its right shoulder; the G hint the top face button. The
  sound toast names the pressed button ("Sound off — View to turn it on").
  The keyboard-look badge (I/J/K/L, mouse look off) stands down while a pad
  is in hand. The start gate's line stays "press a key or click to start
  sound" (a pad press can't unlock audio). `core/InputDevice`,
  `core/inputGlyphs`, `ui/glyphCanvas`.
- **Invert Look** (pause menu, 2026-10-18): pushing the right stick or the
  mouse up looks down. The I/K keys keep their named directions. Remembered
  across visits (`core/Settings`, localStorage `resound-settings`).
- **Sound on/off** (asked for 2026-11-22: "a way to toggle the mute on and
  off", for playing silently beside other listening): the pause menu's
  "Sound: On/Off" entry (under Invert Look; Cross / Enter / Space flips it,
  the focus stays), the **P** key, or a controller's **Share**, in play and
  while paused alike. The key shows a brief toast ("Sound off — P to turn it
  on" / "Sound on"; a pad's names its own button: Share, Create, View...),
  settings feedback like the mouse-look toast. Off is silence ONLY: it fades resound-sound's master
  output to 0 in 20 ms, and the audio context keeps running, so the musical
  clock, the creatures' songs, recording, listening and judgments go on
  exactly as with sound on. Remembered across visits (`core/Settings`
  `muted`, in force as the game loads, before anything sounds). Behind the
  start gate P / Share only wake the gate (the gate swallows every key), and
  a muted game still needs the gate's key or click to unlock audio. (N stays
  the metronome; M is mouse-look.) `core/Sound`.

## Creature look (ruled 2026-10-02; colour reworked 2026-10-17)

Creatures are **ball lightning**, after Cixin Liu's *Ball Lightning*
(`entities/CreatureLook.js`). Visual only — physics, collision radius,
forces, matching and audio are untouched. (Since 2026-11-23 the body also
deforms into the pole's tip as it is absorbed: "The inventory holds
CREATURES".)

- **Silent = a subtle bubble** (Liu's unexcited macro-electron): mostly
  transparent, Fresnel rim, faint thin-film shimmer, slow surface wobble.
  Still findable in lit rooms (creatures are always visible — plinth pens
  depend on it), but quiet.
- **Lit while ANY of its notes sounds**: a glowing core with swirling
  internal filaments + a soft additive halo. Each note ONSET flares, the
  glow settles to a sustain while the note holds, and it fades back to the
  bubble when the creature goes silent (rests inside a song included).
  (The clap's white flash went with clapping, 2026-11-23.) Onset = the instrument's note callback; end = onset
  beat + notated length on the musical clock (or the instrument stopping).
- **It floats**: the rendered body hovers `CREATURE_HOVER_HEIGHT` above its
  floor with a gentle bob; the physics position stays on the floor.
- **Colour is Messiaen's, from the harmony AROUND it** — Messiaen coloured
  chords, never single notes (`core/messiaenColour.js`: table, rules and
  sources cited there; reworked from the sources 2026-10-17 — the designer
  delegated the colour scheme). The sounding set = the creature's own
  sounding notes + every note audible TO IT by the harmony-force rule (its
  OWN `audibleRange`, doorways included).
  - **Main** = the major/minor triad covering the most notes; ties → rooted
    on a SOUNDING note (A+C is A minor, never a rootless F major), then on
    the BASS (A2 under C-E-G is Am7), then major. The colour belongs to the
    CHORD: a creature's own note never outranks it, so every voice in one
    chord glows alike (ruled 2026-10-02).
  - **Reflections**: each dissonant added note shows the light of the OTHER
    triad it forms inside the chord — of the triads holding it, the one
    sharing most of the chord's own tones, then the one rooted on the added
    note, then the main ranking. This reproduces both of Messiaen's own
    examples over A major (Traité V/1 p. 354): G# "adds a little gold"
    (C# minor, black-gold) and a high F "adds pale green" (F major). D
    against C-E-G is white with G major's yellow reflecting. The 2026-10-02
    rule (each leftover note's own major colour) had no source and
    contradicted those examples. Reflections stay subordinate (capped) —
    the triad keeps one dominant hue.
  - **Dissonance flickers**: added notes also flare the painter's complement
    (red/green, yellow/violet, blue/orange — Messiaen's pairs) as a pale,
    intermittent fringe at the limb — his afterimage. Stronger with more
    added notes; a consonant triad has none. On a hueless light (C major's
    white, a grey) it is the complement of the added colour (red on white
    flares green). The added SIXTH on a major triad is no dissonance: it
    deepens the triad's own colour.
  - **A lone note is all but uncoloured** (Messiaen: single notes have no
    colour; colour is the chord's): a milky, opaline glow with only a faint
    tint of its own major triad — that tint is a GAME CONVENTION (the note's
    overtones) so a lone singer still hints at its pitch. An interval is
    nearly full colour. So a creature singing alone glows pearl and BLOOMS
    into its colour (flecks, F#'s sparkle) when another note — another
    creature, the player's playback — joins it. Colours fade in OKLab
    (lightness held), never toward a muddy grey.
  - **Register = lightness, never hue**: an octave up is graded toward
    white, an octave down pulled toward black (Messiaen) — neutral at E4,
    the middle of where creatures sing.
  - **Rendering the names**: two-colour names render as two colours
    ("black-gold": a dense black body, gold filaments, a dim gold glow;
    "grey with red"); dark and grey bodies are dense (smoke, pewter — not
    glass) with their light lifted so they still read as lit; the onset's
    hot heart heats toward the creature's own light, not white. Sparse
    FLECKS carry the second colour of Messiaen's own chord descriptions
    (C "white and gold", E red and gold, B "brown with gold stars", A
    sapphire with violet, Ab turquoise with mauve…); F# major — his
    "sparkling of all possible colours" — shimmers rainbow over its gold.
    The swirl rushes at each onset (colours move with the sound). Colour
    changes lerp briefly, never snap mid-glow.
  - **The table is Håkon Austbø's** reconstruction, corrected where
    Messiaen's own chord descriptions (Traité VII) disagree: SAPPHIRE is
    A major's and Ab major is TURQUOISE blue (Austbø's table swaps them);
    Eb leads with rose. Messiaen himself named only C white, E red, G
    yellow, A blue, F# all colours; the minor column is Austbø's alone.
    Disputed entries are marked in the module. Dev puzzles `colour-gallery`
    (all 24 triads, voiced at neutral register, plus the closest pairs side
    by side) and `colour-harmony` (added notes, Austbø's chord examples,
    register, lone notes and duets on the dark keys, a lone scale, a
    cadence) are the visual check for any change here.
- No per-creature lights and no bloom/post-processing: areas re-render
  through portal passes, so the glow is shaders + an additive billboard
  that honour portal clipping planes. Every creature draws with ONE shared
  body and ONE shared halo material (each mesh's onBeforeRender writes its
  creature's uniforms in); the silent bubble skips the lightning shader
  outright (half the GPU cost close up). Their programs — and the portal-pass
  variants of each loaded scene's materials — compile while the StartGate
  is up (`core/ShaderPrewarm`), so the first note and the first open door
  no longer stall on shader compiles (perf pass 2026-10-12).

## Creature voice (2026-11-24: a theremin with electricity crackle)

The designer: "resemble a high-quality Theremin with electricity crackle".
resound-sound's `Theremin` (in the library since 2026-11-24, null-tested
bit-identical to the approved resound-fe class; the game's part, rolling a
creature's voice, is `core/creatureVoice`) (replaces resound-sound's `Random`, whose rolled
oscillator type + lowpass made some creatures square-wave buzzers).

- **Tone**: one near-sine wavetable (2nd harmonic -19 dB, 3rd -24, falling
  fast; a faint buzz of partials 8-16 at -50 dB and below). Notes are played
  on a continuous LINE per voice part, so they JOIN like a theremin's:
  legato notes glide there (exponential, ~9 ms time constant: -25 cents at
  30 ms, on pitch by ~60 ms) with a short loudness dip that re-articulates
  (-8 dB moving, -18 dB on a repeated pitch, so repeated notes stay
  countable); a note after silence scoops up 20 cents (on pitch by ~50 ms).
- **Vibrato develops after the onset**: none for 160 ms, a 350 ms swell to
  ~±8-14 cents at 5-6 Hz, jittered a little per note. The pitch at a note's
  centre is within ~1 cent.
- **Attack** soft but defined (20-32 ms); the onset's halfway point is
  13 ms after the beat from silence, ~20 ms on a legato note (the old voice:
  13-49 ms). No clicks: the worst broadband transient is as low as the old
  sine voice's (-78 dB re peak; the old sawtooth rolls were -51).
- **Crackle**: sparse band-passed noise bursts (2.5-7.5 kHz, a few ms; one
  in ten a longer falling "zap"): a crack on every attack, a cluster around
  it, then ~3.5 a second while a note holds. Quiet overall (RMS -35 dB re
  the tone), but each spike peaks near the tone's peak (~-6 dB): heard as
  sparks, not hiss.
- **Each creature rolls its voice** (warmth, vibrato rate/depth, attack,
  glide, spark = crackle rate), carried across the pole (`toSpec` `voice`).
  An old Random-shaped voice is ignored (that creature keeps its roll).
- **Level**: matched to the old voice's typical roll (RMS 0.37 vs a 0.36
  median), with far more headroom (peak ~0.8 vs ~1.4).
- **Cost**: a line is 9 nodes (oscillator, vibrato LFO + depth, envelope,
  looping shared noise, crackle gate + band-pass), built ahead per song
  (`AudioPrewarm`), stopped 1.5 s after it falls silent; a note builds no
  node. Six creatures singing near-continuously (one in triads) render at
  3.7% of real time offline, the old voice 3.8%; ten simultaneous onsets
  schedule in 0.55 ms (old 0.46). The wavetable is shared by every
  creature of a warmth (13 steps).
- The editor's audition (A, Play Song) and the song editor's Play sing in
  the same voice (`Theremin.DEFAULT_VOICE`, the middle of every range,
  crackle on), tied notes held and dots read as a creature sings them.
- **Several creatures never clip**: resound-sound's master output runs
  through a limiter (-3 dBFS, transparent below it): three creatures in a
  triad peaked 1.73, now 0.84; a lone voice is unchanged (2026-11-24).

## Environment look (APPROVED direction 2026-11-22)

The designer delegated it ("something that complements the creatures"),
reviewed the first pass and approved the direction: **the overall darkness
is confirmed and the creature glow is approved** ("We're heading in the
right direction overall"). Later work stays inside it
(`entities/EnvironmentLook.js`; the entities: "Entity look" below). Visual
only — collision, elevation, puzzles and audio are untouched. Items still
DRAFT are marked.

**Concept: the storm the ball lightning was born in, at night.** The
creatures are the light; the world is the dark around them.

- **Sky**: a slow-turning storm deck (drifting in toward a clear eye
  overhead) over a cold, luminous horizon band; below the horizon (seen
  from high storeys) a dark abyss. Now and then soft sheet lightning
  flickers inside the clouds (1-3 quick pulses every ~9-22 s, cool and
  low-chroma — atmosphere, never an event). *(DRAFT: whether the lightning
  stays, or follows the world's tempo.)*
- **The storm answers a gate being solved** (designer request 2026-11-22:
  "The sky should have some sort of interaction with the world. Let's try
  an interaction when a gate is being solved"; and "The sky interacting
  with the portals should match the color of the harmony being played at
  any given moment"). *(DRAFT, for review.)*
  - **Trigger**: a correct performance under way at a gate in the player's
    area (`Gate.solveProgress`: the shell's fade, 0..1). The gate that is
    furthest along drives it, nearer counting more (full within 12 units,
    down to a third at 36+).
  - **What it does**: as the song progresses the deck gathers (more of
    it, heavier) and turns and drifts in faster, the clear eye overhead
    closes, and sheet lightning comes more often. The deck's thin parts,
    the rim of the closing eye, the zenith and the horizon glow in the
    LIGHT of the harmony the gate hears at that moment — its own ear
    (`Gate.soundingHeardInto`: the notes it captured, by the source's
    range and through doors, still within their notated length), coloured
    by `core/messiaenColour` exactly as a creature singing that chord
    glows (`CreatureLook.harmonyLightInto`: chroma faded in OKLab, a lone
    note lifted toward pearl). It follows chord changes at the creatures'
    pace (`HARMONY_COLOUR_TAU`), a first light snapping in as theirs does,
    and fades back to the neutral storm when the music stops (a rest
    included). The gate's OPENING strikes: three quick pulses and an
    afterglow of lightning in that light (a third neutral flash, so a pale
    lone note still reads) over the sky, the walls' faces, the floor's
    sheen and glass; then the storm settles. A wrong note ends the
    performance, so the storm simply settles.
  - **The one hue exception**: here the sky IS the chord's colour, echoing
    the music — the same light as the singing creatures, never a competing
    one. Nothing else in the environment takes a hue.
  - **Through doors**: one response for the whole world (shared
    uniforms), so the main view, every door pass, door-in-a-door views and
    the waystone gate all show the same storm, continuous across every
    seam. Everything it does is about the zenith, the horizon or the whole
    deck — still a function of view direction (4-fold symmetric). A gate
    in a neighbour area drives it only through its face in the player's
    area (a door's faces share ears). A world entry calms it at once.
  - **Cost**: four uniforms and a few lines in shaders that already run
    (sky, walls, floor, gates); no pass, light or texture.
- **Walls**: dark layered stone, darker at the foot, a lighter cap and a
  thin pale RIM along every top edge — walls silhouette against the
  horizon glow, so walls vs openings read at a glance.
- **Floor**: polished dark slate, faintly mottled, catching the horizon
  glow at grazing angles. No cell grid (removed 2026-11-22, designer: "let's
  get rid of the grid on the floor"). Raised storeys are a shade lighter;
  every CLIFF edge (a storey edge nothing walkable continues past — not
  where storeys meet, not a ramp's ends, not a wall's foot) carries a pale
  line.
- **Creature light** (approved): a singing creature lights the floor,
  walls, gates and ramps around it in its own glow colour, flaring with
  each onset (shader-side, up to 8 per area, the brightest; no three.js
  lights, no shadows).
- **Staff halo**: a staff's ink sits on a soft pale halo of itself, wide
  and dense enough (2026-11-22) that on a gate's dark glass the staff
  reads as lit from behind, and it reads over an open door's dark view.
  The designer: "The notation halo works if we fix that too" (the gates,
  now dark).

Rules (keep any later work coherent):

- **Creatures own colour.** Environment surfaces stay near-neutral,
  low-chroma (cool greys), DARK; the scene reads by value, never hue. No
  environment hue that could pass for a Messiaen chord colour (no warm
  accents, no saturated blue/green/turquoise), and nothing as bright as a
  lit creature except thin rim/edge lines and the brief lightning. The
  one exception is the storm answering a gate, which shows the chord's
  own light (above).
- **Entities follow the same rules** ("Entity look"): colour only where it
  means something.
- **The sky is a function of view direction only** — its height, and its
  azimuth taken FOUR times round. Every door and the waystone gate turn the
  view by quarter turns, so this is what keeps a door's sky continuous with
  the sky beside it. Never give the sky a feature that is not 90-degree
  symmetric, nor one that differs between areas.
- **Cost**: the world redraws through every door pass, so: one draw for
  the sky, one per area for all its walls (instanced), one for its whole
  floor; unlit shaders written in display values (no per-pixel output
  encode); precomputed textures over per-pixel noise; every program has a
  ShaderPrewarm stand-in.

Ruled 2026-11-22: the storm's colour washing the whole deck near a song's
end is fine — keep it; gates the creatures solve on their own stir the sky
too — keep it.

Open questions for the designer: whether sheet lightning stays (or follows
the world's tempo); whether the levels should drift along the tempo
gradient (calmer sky early, a stormier deck later).

## Entity look (2026-11-22 — reviewed; rulings below)

The entities brought into the approved environment
(`entities/EntityLook.js`). Designer: "The sealed gates need the same dark
theme too … I think the next step is probably just to work on the other
entities." The levels are throwaway test levels, so these are rules for
entity TYPES, not for any level. Visual only.

- **Gates: dark glass with electric edges.** A sealed gate is a slab of
  near-black glass (darker at the foot, faint veils deep inside that shift
  with the eye, glossier than the walls: the horizon on its faces at a
  glance), its edges drawn in pale electric light with a slow shimmer, a
  faint engraved border inset where the staff sits. Walls have only a top
  rim, so a gate never reads as wall. Lit by its area's singing creatures
  like the walls. Its edges, then its states:
  - **Normal corners while closed** (designer, 2026-11-22: "There should
    be the silhouette when the portal is open and normal corners when it's
    closed"): every edge of every face toward the eye lights — off a
    corner, the line between the two faces seen too; back edges never show
    (back faces are culled). Glow, charge, lockout red and flash ride
    those edges in every closed state, never thinner than about a pixel.
    The engraved border stays on every face: it is the staff's inset, a
    surface mark. (The silhouette belongs to the open portal, below —
    never to a closed gate.)
  - **Being sung toward**: the slab fades with the song (ruled
    2026-07-10, unchanged) while its edges CHARGE from the floor up with
    the song's progress — dim above the charge, bright below, a hot front
    riding it — the edges holding on until the song ends.
  - **Wrong note (lockout)**: slab and edges flood red, decaying over the
    lockout (`Gate.lockoutGlow`). Red is the gate's own meaning; it shows
    only on the closed look.
  - **Open: the portal's outline is a soft seam** (2026-11-23, replacing
    the rippling glow; designer: "Instead of a vivid white line, I think I
    actually just want the line to be a blur effect. So the outline of the
    portal should be quite subtle, fading from one view to the other").
    No slab and no shell at all: the door's view panels (at the back of
    the cell) do it. Where the eye's sight of a panel enters the door's box
    within a thin band (~0.22 world units, wider on a face seen aslant so
    it looks about as wide) of the open portal's OUTLINE, the panel's
    picture blurs (a few taps of its own target, widest at the outline)
    and fades out, so what stands behind the doorway in THIS world shows
    through: the jamb beside a door in a wall, the room behind a
    freestanding one. No glow, no ripple, no motion. Past the band the
    panel is exactly its picture, fully opaque ("Direct view into the
    portal should be completely unobstructed"). The outline is the
    aggregate visible outline of the door's box (designer, 2026-11-22:
    "only the outline of the aggregate visible outline should be visible.
    So I should see a square only when facing a panel directly. When
    looking at a corner, that corner line should not be visible"): an edge
    is on it where one of its two faces turns toward the eye and the other
    away — head-on the near face's four edges, off a corner the outer
    hexagon with no corner line, from above not the edge between the top
    and the face seen. An edge's seam fades out as the face across it
    turns toward edge-on and is GONE by the time that face is edge-on,
    before the emerging side of the box can show (designer, 2026-11-23:
    "Let's have the line fade a little sooner so that it's completely gone
    by the time you can see the emerging side of the cube"; smooth, never
    popping). (`EntityLook.outlineAt` / `portalBandAt` / `portalSeamAt`,
    twins of the GLSL.) At a door in a wall the side face beyond an edge
    is buried in the wall, so seen well off to the side that edge's seam
    is gone too: the edge stays crisp there. In the main view only ("Any
    part of the gate seen through the gate should not have the border
    around it"): a panel wears its seam material only while the main view
    draws (`passContext.wearInMainView`), so a door seen inside a door
    view, a door-in-a-door or the waystone gate's view shows plain,
    opaque panels — as every door pass always drew them. The seam
    material is transparent (so the fade shows the world behind) but
    drawn first among transparent things and writing depth, so everything
    translucent sorts against it as against an opaque panel. On DOORS
    only: an open plain gate draws nothing (ruled 2026-11-22, below).
    (The glow it replaced: 2026-11-22, a pale rippling band on the door's
    shell just inside the outline, faded over a few degrees PAST edge-on;
    before that a frame on the NEAR face alone, which off a corner poked
    over a wall as a stray triangle.)
  - **Linked vs plain**: identical while closed ("A closed linked gate
    looks like any closed gate", ruled 2026-07-06, reaffirmed 2026-11-22);
    open, a door shows its view, softly seamed into the world at its
    outline, a plain gate is an empty opening.
  - **The deployed waystone gate**: the same seam — it is a portal, so
    the same outline rule — leaning faintly GOLD toward the outline, so
    it stays the gate to the gold tile at a glance (main view only;
    PortalManager gives its panels `seamTint`). It has no frame mesh.
- **Ramps**: a wedge of the storeys' slate (one shared geometry, posts
  included: one draw a ramp). Chevrons point UP the slope and crawl slowly
  that way (the way up at a glance); pale lines along its sides (drops,
  like a storey's cliff edge); pale posts mark its top edge from up on the
  ledge.
- **Waystones** (the cleansers, renamed 2026-11-23): a dark glass disc lit
  by a pale breathing ring (rim ring, a fainter inner one); the ACTIVE
  one's ring burns GOLD (replacing cyan/gold, 2026-11-22). The aiming
  phantom is the same disc, translucent, red over an invalid spot. Gold is
  the only accent kept besides the wrong note's red; it is reserved for
  the active waystone and the gate that leads to it.
- **Fountains** (likely to be cut): only what keeps them in the theme —
  dark stone, pale and lit from within once activated (was blue/cyan).
- **Unchanged**: the wordless key hint sprites (`ui/KeyHints.js`, out of
  scope here — their gold labels share the active waystone's gold). (The
  clap ring went with clapping, 2026-11-23.)
- **Rules**: low-chroma and value-led; colour only for meaning (red =
  wrong note, gold = your waystone and its gate); never a saturated hue a
  chord could own on a surface. Unlit ShaderMaterials in display values,
  honouring the clip planes, each with a ShaderPrewarm stand-in; an open
  door draws no shell, and its seam is its panels' own, in the main view
  only.

Rulings (designer, 2026-11-22):

- **Only doors ripple.** An open PLAIN gate has no frame and no glow: an
  empty opening, its floating staff the only cue (no other cue added — the
  missing slab and the clear cell read as open). Doors keep the ripple
  (now on their silhouette); the deployed cleanser gate keeps its gold
  frame (it is a portal: silhouette too). (2026-11-23: the ripple became
  the soft seam above; the cleanser gate's seam leans gold.)
- **Cleansers are pale, the active one gold** (replacing "the rest stay
  cyan") — fine.
- **The cleanser's gold matching the key hints' gold labels** — fine.
- **Linked doors look like plain gates while closed** — keep them the same
  (2026-07-06 ruling stands).

## World / editor (settled)

- **The designer builds every floor tile and wall** (ruled 2026-11-24,
  replacing the implicit ground and perimeter): a new room has no floor and
  no walls; the editor's cursor goes anywhere (negative cells too). ✕ /
  Enter on a cell with no floor at the active storey builds it (held and
  moved: the rectangle from where it went down, previewed, built on
  release as ONE undo step); on bare floor it places the chosen type; on an
  entity it selects / opens its menu. Anything placed or moved (or carried
  to another storey) onto a cell with no floor brings its tile, in the same
  undo step. □ / Delete takes the entity, then (again) the floor under it.
  The old floor-draft tool (F, L2+□, "an empty storey starts a floor") is
  gone. In the game the **edge of built floor stops a mover like a storey's
  cliff edge** (no tile = no walkable level: `canTraverse` blocks it, a
  pale cliff line marks it). Files: `tiles` (`puzzles/schema.md` "Floor
  tiles").
- **Older levels (no `tiles`) still play as they did**: elevation 0 over
  the whole `gridSize` square, raised `floors` regions (E1+) on top, and
  perimeter walls auto-generated OUTSIDE the grid (rows/cols −1 and
  gridSize). The editor opens one as tiles + those perimeter walls as
  ordinary walls, and saves it in the new shape.
- **Elevated floors are raised platforms you can walk UNDER** (2026-07-05).
  A cell under an E1 slab is walkable at BOTH level 0 (beneath) and level 1
  (on top); `ElevationGrid.levels[z][x]` tracks the set, and movers carry
  their current layer (`getFloorY`/`getEffectiveElevation`/`canTraverse` take
  a `priorLevel`). You change layers only via a ramp; stepping off a
  platform edge onto a cell that lacks your level is blocked (cliff). Floors
  render as thin **slabs** (visible undersides + edge faces), and ramps are
  double-sided + glow with **marker posts** at the top edge so they read from
  every angle, including when hunting for the way down.

- **The editor draws the game's look** (2026-11-23; the designer asked for
  "the updated look for the creatures" in the editor): the level as the game
  draws it, by the game's own modules, with editor cues (cursor, selection,
  links, ranges) drawn over it; V switches to the coloured schematic. A song
  heard in the editor lights its creature as in game. Play is one tab
  (asked for 2026-11-23: "a single tab experience for the preview"): the
  camera glides to the player's eye at the spawn and the game takes over
  from that very frame; the pause menu's Back to Editor glides back to
  exactly where the editor was. The editor plays from a
  controller too ("make it easy to use with the PlayStation controller"):
  `src/editor/CLAUDE.md` has the mapping.
  Preview rulings (2026-11-23): the game keeps its own render resolution
  inside the editor ("frame rate is more important"), so it reads a little
  softer after the cross-fade; a controller Play skips the start gate when
  the browser already allows sound; the glide waits for the game's code to
  load so it runs smooth; mouse-look turning toward the pointer on the
  first move, and the creatures' unsynced wobble at the cross-fade, are
  fine as they are.

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
- **…and the pair SHARES ITS EARS (ruled 2026-07-11, round 4 — "That's a
  bug, I should not have been able to solve that gate"):** a sound within
  source-range of EITHER face corrupts (and can complete) the door's
  matching, with NO leak penalty between the two faces of the same door.
  The jam therefore holds from the far side (round 4's jammed door was
  openable from the next area because the corruption paid the leak), and
  the clap pair's song re-opens their door from the far side (a player who
  exited the "wrong" way is never trapped). Implemented as listener-aware
  seam routing (`PortalManager._routeThroughDoor`) plus a partner-ear
  minimum in `Gate.onNoteCaptured` for same-area pairs.
- **Tempo gradient (ruled 2026-07-07):** the single world clock runs at the
  ACTIVE area's tempo but blends toward a mismatched neighbor's tempo as the
  player nears its door (reaching the midpoint AT the doorway, symmetric on
  both sides), so tempo is continuous through a crossing. Beat position is
  never reset by a crossing.
- **Crossing preserves the neighbor's state.** What you saw through the door
  is exactly what you walk into — crossing swaps areas, never rebuilds them.
  Areas beyond link-depth 1 unload — and since 2026-11-23 come back as they
  were left (core/WorldMemory; "The world forgets nothing" above).
- **Links are bidirectional and auto-synced.** Linking A→B writes B→A into
  the target file; clearing/renaming/deleting keeps the partner in sync
  (`editor/io/portalLinks.js`). Never hand-author a one-way link. The world
  graph is DERIVED by scanning puzzle files — there is no world.json.
- **Linked gates follow the same latch rule as any gate** (complete the
  song → opens → closes when you walk out of the destination face); the
  link only changes what's on the other side. Your recordings come with
  you — areas are one world, so "gate songs as keys you carry" works
  across seams.
- **Crossing commits ON ENTRY (ruled 2026-07-09; supersedes the 2026-07-08
  "shared space / only exiting commits" ruling).** Stepping into an open
  linked gate teleports AT ONCE: the two linked cells are one room with two
  addresses, and going in means you now stand at the DESTINATION address —
  same offset (pure translation — CLAMPED by up to ~0.15 units so the
  player's body lands fully inside the destination cell: the commit fires
  with the body's trailing edge still outside the cell, and a wall flush
  behind the partner — e.g. a door on a grid-edge row against the
  perimeter — would otherwise wedge the player unrecoverably, since the
  per-frame walk step is smaller than the overlap; found & fixed
  2026-07-10), heading untouched. Every perspective
  looks out of the gate you teleported to, behind you included, and every
  exit — backing out the way you came included — is plain walking against
  the destination's REAL geometry: what you see is what blocks you, and
  backing out means you exited the destination gate (you still teleported;
  the way home is one more step through). The commit zone is inset
  (`DOORWAY_COMMIT_DEPTH`) and re-arms only after a full step out, so
  cell-edge jitter never flickers the world. The doorway view is drawn on
  the FAR plane of the cell (the inside of the opposite panel, facing back
  at the viewer), so an entering camera commits ~2.7 units before it could
  ever touch the view surface — the threshold has no dead frame. The view
  pass clips ONE CELL behind the window plane (round-4 fix): the partner's
  own doorway cell — floor, frame walls, and its NOTATION (front-facing
  planes only) — paints into the view, so the floor flows continuously
  through an open door and the arrival staff is visible BEFORE stepping in
  (nothing pops in on entry). Deeper near-side content still clips (double
  world / sliced-creature hazard). During a pass the partner's BOX and
  every portal surface of BOTH ends hide (a same-area pair painting its own
  stale textures was round 4's hall-of-mirrors "display got weird"), AND the
  neighbor's OUTER-SHELL wall one cell BEHIND the arrival cell hides too
  (2026-07-12). The clip reaches a hair past the arrival floor's far edge to
  paint it seamlessly, which also grazes the near face of that perimeter wall
  — it leaked in as a thin dark strip beside the opening at oblique angles
  ("the rectangle that shouldn't be there"). It is never part of what you see
  THROUGH the door, so hide it for the pass (restored after — it reappears
  normally on crossing). The frame walls the door SITS IN stay put: those read
  as the room's enclosure and are wanted (Caleb's ruling: keep the walls, drop
  the strip). Hiding the mesh — rather than trimming the clip short of the wall
  — avoids a matching gap in the floor/frame at the far corner (the floor's far
  edge and the wall's near face coincide, so any clip back-off gaps the floor).
  A reverted earlier attempt hid the FRAME walls instead, which are the ones to
  keep.
  Portal render targets are AT MOST half-resolution — a doorway panel covers a
  fraction of the screen, and full-res targets made open doors cost several
  fullscreen renders per frame (the round-4 fan spin). Below that cap each
  pass's target follows its panel's size ON SCREEN (2026-10-17), at twice
  the texels it covers (2026-10-18: drawn 1:1, a staff seen through a far
  door came out visibly softer than half-res drew it) — and where a staff's
  lines are about a pixel tall (a 32-64 px panel) four times across and
  eight up (2026-10-18: twice drew them lighter or broken; this keeps them
  level with half-res): a distant door draws a target 32-256 px across, a
  door filling the screen keeps half-res. A
  straight-on warm-up's picture shows only through other doors, far
  smaller than its stand-in eye sees it, so it draws at half that eye's
  texels. A door's panels
  (approach + oblique side windows) all share ONE clip plane — the plane of
  the APPROACH panel along the gate's FACING axis (the wall the door sits
  in; the eye only picks which side). Each panel clipping along its own
  facing axis made a side window show a full-height cross-slice of the
  neighbour that popped its apparent geometry (e.g. a wall's height) as the
  eye moved; one shared doorway plane keeps every window consistent, so side
  panels appear/vanish seamlessly (edge-on at the threshold). The axis MUST
  come from `facing`, not the panel the eye is most in front of — standing
  off to the SIDE of a door and looking back would otherwise clip sideways
  through the wall. `facing` is therefore load-bearing now: `gen-poc.js`
  emits it per gate from wall adjacency (a vertical-wall door like The
  Star's east entry gets an x-axis facing; free-standing gates default to
  north).
- **A door never closes on its occupant — body included, and a closed box
  is OPEN FROM WITHIN (round-4 fix, 2026-07-11).** Gates latch, so a door
  can no longer close around a body — but a ONE-WAY crossing (through an
  alwaysOpen face) legally lands the player INSIDE the CLOSED partner
  face, and a box solid to its own occupant wedged them forever (Caleb got
  stuck in the warm-up door). A closed gate therefore never blocks the
  player while their body already overlaps its box (CollisionDetector's
  occupant-escape, keyed on the mover's pre-move position): solid from
  outside, open from within. The exception never lets anyone IN, and
  creatures are still always blocked.
- **A linked pair shares ONE song** (ruled 2026-07-07; "for now, I might
  change my mind later"). The pair mirrors its open state at runtime, so
  differing songs are ill-defined. Linking unifies: the INITIATING gate's
  song wins; a song-less side adopts the other's; replacing a real song on
  the target requires an explicit confirm (declining cancels the link). The
  validator errors on a same-puzzle pair whose songs drift apart after
  linking (relink to re-unify).
- **A closed linked gate looks like any closed gate.** The door reveals
  itself only when opened.
- **Permanently-open faces: `alwaysOpen` (ruled 2026-07-10, built for
  later use).** A gate side marked `alwaysOpen: true` is passable forever —
  it never closes and needs no performance. Its partner face can still be
  song-locked, making a ONE-WAY door: unlock the way in once, and the way
  back is always open (escape hatches that un-trap a player who entered a
  room unprepared; one-way shortcuts home). Both faces `alwaysOpen` = a
  plain standing doorway. Pairs containing an alwaysOpen face are exempt
  from open-state mirroring (the faces are independent by design); crossing
  still requires the face you ENTER to be open. Schema field on the gate
  entity; round-trips through the editor. Not yet used in the POC world.
- **Doors are omnidirectional (ruled 2026-07-07):** every side of a linked
  gate can be walked through, and EVERY face the player can see shows the
  view through the door (two at a corner — a working open door never shows
  a shell from any angle; unlinked and dangling gates are an empty
  opening once open). Applies to ALL links — same-puzzle teleports and
  cross-puzzle doors are one mechanism. `facing` still exists in the schema
  (default "north") but the editor's Facing dropdown is PARKED (commented
  in PropertyPanel); Caleb may bring it back.
- **Entry face → opposite exit face (ruled 2026-07-07):** looking into the
  north end of a door shows out the SOUTH end of its partner (and so on for
  every direction) — the pair maps by pure translation, no mirror flip —
  and walking straight through matches. There is no arrival reroute: a
  blocked side of the destination simply blocks, visibly, like any wall.
  The no-soft-lock rule moved to the commit: a partner walled in on EVERY
  side refuses to commit (never teleport into a trap) — the cell stays
  plain walkable space and the player backs out the way they came.
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
  key hints (`ui/KeyHints.js`): bare keycap glyphs that appear when a
  situation calls for an action. **Hints are PUZZLE-DRIVEN (ruled
  2026-07-11, round 4, superseding the permanent localStorage
  retirement):** each puzzle declares what it teaches (`teaches:
  ["move", ...]` in its JSON — see puzzles/schema.md) and only those hints
  are live there. **Each lesson happens ONCE (ruled 2026-07-16,
  superseding per-visit re-arming):** performing the action retires the
  hint for the rest of the PLAYTHROUGH — doorway crossings never re-show
  a performed hint; a fresh world entry (menu / deep link) resets the
  slate (`core/HintMemory.js`, in-memory only — no browser storage). A
  puzzle with no `teaches` keeps every hint eligible (dev/legacy levels);
  `teaches: []` shows none — and the editor round-trips the field
  (a 2026-07-16 editor save used to drop it, which un-gated every hint on
  the hand-edited POC areas). In the POC chain `slots` is taught only at
  the duet (III) and `clap` only at the clap (VIII). (The `clap` lesson has
  no hint since clapping went, 2026-11-23; the id is left in the POC JSON,
  harmless.)
  Hints: WASD cluster (idle at spawn), floating "R" over the creature the
  pole would absorb (lesson id `record`), a small spacebar low over the
  release spot while a creature is held (lesson id `playback`; both renamed
  in play 2026-11-23, the ids are puzzle vocabulary), and (until clapping
  was removed, 2026-11-23) a floating "C" over the nearest
  clap-range creature (3D reach — the clap pair sits on plinths), shown
  steadily whenever a clap could land (designer's change, committed
  2026-11-22: gating it on two creatures singing at once was flaky). On a
  controller every hint shows that pad's own button instead (see "A game
  controller plays too").
- **Boot straight into the world, not the menu.** The first manifest entry
  is the intro level and the game's front door; the menu is reachable via
  Esc → Main Menu. The `?puzzle=<id>` editor deep link wins over the default.
  As of 2026-07-10 the front door is `poc-threshold`, area I of the POC
  world (below); `awakening` and `the-lure` remain in the manifest.
- **The POC world (added 2026-07-10; v5 restructure after the designer's
  round-4 playtest, 2026-07-11)** is a chain of NINE small portal-linked
  areas teaching every element except fountains, wordlessly and non-stuck.
  `poc-climb` was CUT ("if the puzzle doesn't NEED a ramp, there should be
  no ramp"); elevation survives as VISIBLE plinth pens (no creature is ever
  sealed inside opaque walls — designer's rule). The chain:
  I `poc-threshold` (move/record/play/first door — and a locked FINALE
  PORTAL standing mid-room, wanting the corrected Twinkle couplet whose
  elements nothing before area IX can perform; every player red-flashes it
  in minute one and finally emerges FROM it at the end), II `poc-two-keys`
  (slots: two single-note doors in series; room 2 holds an E4 ECHO of the
  inner door's note, so even a fully deleted tape can always leave), III
  `poc-duet` (ordering: a two-note door [E5,G5] — record them in tape
  order and Space performs both), IV `poc-jam` (a CONTINUOUS B5 singer —
  interval == song length, no silence window EVER — jams a door forever:
  two identical [A3] doors, the jammer on a 1-cell ELEVATION-2 PLINTH
  directly over the west door's approach — visible, cliff-penned,
  unrecordable even from directly beneath (4.2 > range/2 = 4) — and the
  player literally walks under the singing jammer to red-flash the door
  that can never open; both doors land in area V as separate entries, and
  the both-ears rule keeps the jammed door's FAR face jammed too), V
  `poc-dance` (the movable jam — the DESIGNER'S OWN tension-and-release
  design: two creatures parked before the exit sing the test-003 duet,
  B3→C4 and F4→E4 in halves, synced and continuous — tritone REPELS them
  apart, major third PULLS them back, a breathing oscillation around a
  fixed centroid that CORRUPTS the door forever; the tool and the door are
  both a plain F4 whole: tritone-then-perfect against one dancer,
  unison-then-minor-second against the other — NET REPULSION, nothing
  attracts — so performing F4 between the pair and the door a few times
  shoves the duet out of earshot and then opens it), VI `poc-pull` (the
  jam weaponized and solved: a free continuous C5 jammer beside the only
  exit; the local A4 is consonant — playback PULLS it out of earshot,
  then the door hears you), VII `poc-push` (dissonance repels: the E5
  tool pushes the Bb5 pusher up its corridor until its own song opens the
  exit — creatures activate gates; unused flanks walled off), VIII
  `poc-clap` (the D4/A4 pair on VISIBLE elevation-1 plinths flanking the
  exit, singing single QUARTERS on a 2-beat interval IN PHASE — a chord,
  corruption; one clap (displacement 1/4 = one beat) shifts one creature
  and the chord becomes the alternating melody [D4,A4,D4,A4] the door
  wants — it self-opens, forever; plinth-penning keeps the pair in door
  range so the empty-tape escape guarantee needs no exception), IX
  `poc-return` — **"The Star"**, the finale: the ENTRY sits in a SIDE
  wall, forcing a turn inside the doorframe (the look-back moment the
  designer liked in the cut climb, preserved by orientation); a warm-up
  vestibule teaches quarter notes and repetition (one F4 voice singing a
  single quarter; the door wants [F4,F4] — record the same voice twice;
  its hall face is the one-way alwaysOpen escape hatch), then a concert
  hall of SEVEN more single-note voices — with the vestibule's F, the
  EIGHT ELEMENTS of the corrected Twinkle (quarter C D E F G A, HALF G,
  HALF C: each phrase ends on a half note), one voice per element, placed
  in SONG ORDER along the hall walls — and a central portal wanting the
  full couplet, linked to area I's mid-room finale gate (`ending: true` →
  the thanks-for-playing overlay, the demo's one sanctioned use of words).
  **Strict ELEMENT economy (matching is pitch- AND duration-exact)**:
  every exit door is performable with elements from its own area or
  earlier and NEVER from earlier areas alone; the finale's six FRESH
  elements exist only in area IX (D4|1/4 and A4|1/4 carried from the clap
  are fine — six others gate it), and F4|1/4 exists ONLY in area IX (the
  named lock; F4|1/1 is area V's tool, F4|1/2 the dance duet's).
  **Relaxed guards (v5, forced):** with the dance pair recordable, the
  carried pitch classes {C,E,F,G,A,B} leave NO pitch class dissonant-free
  or consonant-free (checked exhaustively by the generator), so the old
  absolute pull/push guards are unsatisfiable. The pull room is instead an
  OPEN RECTANGLE (a pushed jammer is always recoverable by the A4 pull),
  and the pusher is Bb5 — the unique pitch whose only carried consonant
  class is G (the oldest note, smallest pull-back surface). Both
  relaxations await the designer's ruling. All geometry is generated +
  self-checked (480+ asserts, including the tension-release contract, jam
  audibility margins with plinth drift, the both-ears seam model, and the
  empty-tape pocket-escape rule that keeps DELETE from ever stranding a
  player) by `puzzles/gen-poc.js`; edit the generator and rerun, never
  the JSONs.
- **The start gate replaces the overlay's freeze role.** Each level starts
  behind a dark scrim with a pulsing ring; any key/click wakes the world.
  While it's up, the clock and creatures hold still (self-solve protection)
  and the waking gesture satisfies the browser audio-interaction rule. The
  scrim goes up when the level starts LOADING, so it is the first thing
  painted (perf pass 2026-10-17); input wakes it only once the world is
  built.
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

- **Open world**: `awakening` is the seed — after the controls are learned it
  should open into an explorable world rather than a puzzle list.

## Open design calls — ask the designer before changing

- **The pole (2026-11-23), for the designer to rule on after play.**
  RESOLVED the same day: (1) the cleanser no longer clears — fine, it is
  the WAYSTONE now; (2) absorbing a creature you face away from — no: the
  pole takes only what you face (40°); (3) a pole through a wall — no:
  walls block absorbing; (4) walking while the pole is out — fine, as is;
  (5) moved creatures resetting on a rebuild — no: the world forgets
  nothing. Still open: (6) the POC levels were built around recording
  (and VIII around clapping), so their solutions no longer hold (they are
  being replaced) — the designer confirmed 2026-11-23 that this is
  expected. The editor's validator was reworded the same day (creatures
  are the only singers).
- **New with the 2026-11-23 rulings, for the designer:** (a) the sightline
  runs to the creature's CENTRE: a creature half hidden by a wall's corner
  (its centre behind it) is refused even though half its body shows —
  conservative, never promises a reach through a wall; (b) at 120 bpm a
  release's way out is compressed from 0.87 s to the time left before the
  beat (0.25 s at the least), so most releases look brisk, and a press in
  the last ~half of a beat sings while still pouring out; (c) a deployed
  waystone gate keeps its area live wherever the player goes (one extra
  simulated area at most). RESOLVED 2026-11-23: the designer accepted all
  three as built — (a) centre sightline stays, (b) singing while still
  pouring out is fine, (c) the waystone gate keeping its area live is fine.
- **Cleanser placement beyond area II (2026-07-12).** RESOLVED 2026-11-23:
  nothing clears the strip any more (the cleanser is the waystone), so
  there is nothing to place for tape hygiene.
- (gameplay word-toasts were RESOLVED 2026-07-10: replaced by the slot-flash
  language. Mouse-look toggle, sound on/off, metronome, and puzzle-load-error
  toasts remain as settings/dev feedback.)

## Related docs

- Playtest-agent briefing, control map, and iteration log:
  `.claude/playtest-game-rules.md`
- Puzzle JSON schema: `puzzles/schema.md`
