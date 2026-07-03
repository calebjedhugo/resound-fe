# Resound — Code-Blind Playtest Briefing

Context given to code-blind playtest agents. Agents get these rules "for free"
so testing isn't blocked on discovery; **real players should discover them in
the game** — if an agent reports a rule here as undiscoverable in-app, that's a
valid finding, not a contradiction. Seed material for a future `/playtest`
skill.

## The game in one paragraph

Resound is a first-person 3D musical puzzle game (Three.js + Web Audio).
Creatures sing melodies on a musical clock. The player records a creature's
melody and plays it back near gates and fountains; matching a target's song
unlocks/activates it. Activating fountains completes the puzzle.

## Game rules agents get for free

- **No aiming, ever.** There is no crosshair or facing requirement. Sound is
  omnidirectional; recording and playback are proximity-based only.
- **Sound carries by its SOURCE's audible range.** A creature's song reaches a
  gate/fountain if the distance is ≤ the *creature's* `audibleRange`. Playback
  inherits the `audibleRange` of the creature it was recorded from.
- **Creatures can activate targets themselves — by design.** A creature in
  range singing a target's exact song will solve it with no player input. The
  editor warns about this layout ("the puzzle will solve itself").
- **Play back while the creature is quiet.** Targets capture ALL notes they
  hear into one stream; notes interleaved DURING your playback corrupt the
  sequence. (Stale notes heard BEFORE your playback no longer spoil it —
  matching looks for the target as a contiguous run within everything heard
  in the last ~30 seconds.)
- **Recording range is half the audible range** (`audibleRange × 0.5`). You
  must be close.
- **Recording timing is a core puzzle skill — BY DESIGN.** Recording captures
  exactly what sounds between R-press and R-release: start mid-song and you
  get a rotated phrase; leave it running and you get repeats. Neither is a
  bug, and the game must NOT auto-trim/auto-align (an auto-stop was tried in
  R4 and reverted by the designer). In later puzzles, clap-displacing creature
  songs and timing the recording window IS the solution. The live hint shows
  a running captured-note count ("Recording — N notes captured… press R to
  stop") so the player can learn the timing skill.
- **Matching is exact, per phrase**: everything a target hears is segmented
  into silence-delimited phrases (gap = 1 beat beyond the previous note);
  a COMPLETED phrase must equal the target note-for-note (pitch + duration,
  quantized to 16ths). Rotated takes fail; over-long takes fail; a phrase is
  judged only once silence follows it. Stale earlier sounds are separate
  phrases and don't interfere. Targets display their required notes as
  floating notation above them.
- **Mismatch feedback is visual**: a completed wrong phrase flashes the
  gate/fountain RED for ~600ms. Animations are hard to catch in single
  screenshots — use the F3 debug panel, which mirrors the last judged phrase
  in text ("↳ heard N-note phrase — NO MATCH (Xs ago)"). That line is the
  sanctioned animation proxy for testers. A failed playback also still toasts
  (out-of-range with distances vs heard-but-not-recognized).
- **Other wordless cues to watch for** (design philosophy: placement, color,
  iconography, animation over words): slot "pops" (scale flash) when a
  recording lands; occupied slots show a persistent note count; the mic badge
  reads "×N" (creatures in earshot); creatures pulse while singing.
- **The world freezes while the start/help overlay is up** (H): no singing,
  no clock, no creature movement. Self-solving layouts complete after you
  dismiss it — visibly and audibly, with the completion screen on top.
- **Pause (Esc) titles**: "Paused" mid-game; "Puzzle Complete!" only when
  every fountain in the CURRENT session is activated.
- **Claps (C)** nudge creature song timing; harmonies attract (consonant) or
  repel (dissonant) creatures while they sing; perfect intervals do nothing.
  Creatures only move during their rests.
- **Perimeter walls are auto-generated just OUTSIDE the grid** — every grid
  cell is playable; designers never place border walls.
- **Ground floor (elevation 0) is implicit everywhere.** Floor regions are
  only for raised storeys (E1+); regions at the same elevation cannot overlap.
  (Shapeable/holed ground floor is a deferred feature.)

## Controls (game)

| Key | Action |
|---|---|
| WASD / Shift | Move / run |
| Mouse | Look (offset-from-center style, no pointer lock) |
| M | Toggle mouse-look off/on (toast + persistent badge when off) |
| I/J/K/L | Keyboard look (up/left/down/right) |
| R | Recording toggle (tap on/tap off); long-hold = hold-to-record |
| Space | Play back active slot |
| ←/→ or 1–5 | Select inventory slot (5 slots, 1-based) |
| C | Clap |
| N | Metronome |
| F3 | Debug info overlay (hidden by default) |
| H | Controls/objective overlay |
| Esc | Pause |

- **Discrete key taps work**: each tap guarantees ~0.35 world-units of
  movement or 7.5° of camera rotation, so automation that can't hold keys can
  still navigate. Held keys move/turn continuously.
- Recommended agent camera technique: press M once (kills mouse-look), then
  steer with I/J/K/L taps between screenshots.

## Editor facts

- Editor at `/editor.html`; game at `/`. Autosaves to the repo once the puzzle
  has a name (id = slugified name, locked after first save). "Test in game"
  opens `/?puzzle=<id>`.
- Song editor entry points: double-click an entity, "Edit Song..." in the
  properties panel, clicking song-related validation messages, or right-click.
- Validation panel items naming an entity (`id=N`) are clickable (select /
  open song editor).
- Placement: armed tool is highlighted + shown in the viewport HUD; rejected
  and successful placements both toast.

## Agent tooling ("ears" + constraints)

- Agents are code-blind: chrome-devtools MCP browser tools only; no Read/
  Grep/Bash/WebFetch on the project, no page source, no console.
- `evaluate_script` is allowed ONLY for the two ears snippets (install +
  poll). The install snippet hooks `OscillatorNode.start/stop` and
  `AudioParam.setValueAtTime` to log `{t, kind, note, freq}` events —
  re-install after every page load. Poll with
  `JSON.stringify((window.__ears||[]).splice(0))`.
- Ears usage: verify editor preview matches composed notation; identify
  creature melodies; confirm playback pitches; correlate unlock fanfares.
- **Tab hygiene (standing rule):** work in ONE tab, navigating it between
  /editor.html and / (reinstall ears after each navigation). Every extra tab
  runs a live WebGL + audio loop and strains the machine. Close stray tabs
  immediately (close_page), and before the final report close everything
  opened, leaving at most one tab on about:blank.

## Iteration log (for the future skill)

- R1 (2026-07-01): editor+game blockers — silent puzzle-load failure,
  right-click-only song editor, zero onboarding, undiscoverable recording.
  All fixed.
- R2 (2026-07-01): verified R1 fixes; found range-semantics contradiction,
  walls-on-edge trap, stale-hover placement, no-hold-keys accessibility gap.
  Fixed 2026-07-02 (source-range semantics chosen by the user; walls moved
  outside grid; click-coord placement; tap impulses).
- R3 (2026-07-02): three blockers, all traced and fixed the same day:
  (1) "black world on keyboard start" = mouse position initialized to [0,0]
  aiming the camera at the sky until the first mousemove — now starts
  centered, pitch clamped; (2) "floorless puzzles render nothing" = same
  bug; (3) "playback never matches" = targets hard-wiped their heard-notes
  buffer every 10s (splitting playbacks) + demanded the whole buffer equal
  the target — now a 30s sliding window + containment matching
  (SongMatcher.songContains). Also: world freezes under the help overlay,
  session-based pause title, diagnostic miss toasts, recording auto-stop,
  debug panel shows player + creatures. F3/H/M/toasts verified by agent.
- R4 (2026-07-02, salvaged from an outage-interrupted run): verified keyboard
  cold start, legit solve, pause titles, self-solve warning flow. New finds,
  all fixed same day: (1) Vite full-reloaded every tab whenever the editor
  autosaved into public/puzzles/ — THE cause of "song modal closes by
  itself", "editor reopens last puzzle", and repeated mid-game ejections to
  the menu (fixed: watcher ignores public/puzzles/**; needed a dev-server
  restart); (2) slot digit keys were documented but unbound (now 1–5);
  (3) recording auto-stop/auto-align was added, then REVERTED — the designer
  confirmed recording timing is intentional gameplay (see rule above); a live
  captured-note count replaced it; (4) impulses drained one per frame —
  crawled in throttled background tabs (now drain fully each frame); (5) menu
  checkmark rendered before the name, reading as the previous row's (moved
  after the name).
- R5 (2026-07-02): convergence round — all R4 fixes held; found the recording
  callback leak (creatures leaving range mid-recording kept their capture
  wrapper forever → stale/duplicated takes; fixed via wrapped-creature
  snapshot), WASD dead when pitched steeply down (movement now flattened to
  the ground plane), unreliable tap sizes (impulses now queue on key
  RELEASE for <250ms taps — deterministic step per tap), mic badge reading
  as a slot number (now "×N"), debug [ACTIVE]→[LISTENING]. Designer rulings:
  matching = exact-per-phrase; toasts are a crutch — communicate visually
  (see DESIGN.md "Design philosophy"). Added: mismatch red flash + debug
  phrase line, slot pop animation, per-slot note counts.
- Testing tip: the dev build exposes `window.__resoundDebug` ({gameState,
  scene, entityManager, PlaybackManager, ListeningManager}) — for
  coordinator/diagnostic use, NOT for code-blind agents.
- STATUS (paused 2026-07-02): R4 verification round was in flight when the
  session paused — if no R4 report exists, relaunch it (verify: keyboard-only
  cold start, legit solve of playtest-r3, self-solve visibility/freeze, pause
  titles, convergence verdict). All work is uncommitted in the working tree;
  all 558 tests pass. Puzzles playtest-r1 (intentionally broken), r2, r3 are
  test artifacts in public/puzzles/.
