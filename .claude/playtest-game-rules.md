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
  performance. (Stale notes heard BEFORE your playback don't spoil it — see
  the exact-matching rule below.)
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
- **Matching: the gate must hear its song EXACTLY — surroundings don't
  matter** (2026-07-11): the target is a rhythm timeline (pitch + duration
  + relative beat position, quantized to 16ths), with rests as expected
  gaps. A performance matches when every target note sounds at the right
  relative beat and nothing else sounds INSIDE the aligned window. Sounds
  before/after the window are ignored — a door opens whenever its song
  occurs cleanly anywhere in a longer performance (so playing the whole
  tape opens every door you've earned in range). Rotated takes fail; notes
  during a target's rests fail; a foreign note during the window corrupts
  (a continuous singer beside a door jams it forever). Judgment fires the
  instant the target's last note completes. Polyphonic targets
  (chords/voices) keep their rhythm. Targets display their required notes
  as floating notation.
- **Gates open on the COMPLETED song, LATCH open (no timer), and close when
  the player walks through** (2026-07-10). A correct performance in progress
  FADES the closed gate from opaque to fully transparent in step with the
  song's progress (rate follows song length; the shell stays SOLID until
  completion); a wrong note snaps it back to opaque. A
  parked creature performing the song keeps a door open behind the player.
  `alwaysOpen: true` faces are permanently passable (one-way doors). A gate
  flagged `ending: true` rolls a dismissible "Thanks for playing" overlay
  when the player ARRIVES through it (the demo's closing card).
- **The inventory is a TAPE** (2026-07-11): boots with ONE slot; ←/→ move
  the cursor and → on a filled last slot appends a new empty one (up to
  16); R records into the cursor slot in place; Space performs the WHOLE
  tape concatenated. Digit keys no longer select slots. There is NO
  per-slot delete (retired 2026-07-12): to clear the tape you walk over a
  **cleansing tile** — a gently pulsing floor pad (first one is in the
  entry corridor of area II, "Two Keys") that empties the whole tape when
  you step onto it.
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
  Forces apply only WHILE a creature sings and hears another note within its
  OWN audibleRange (the listener's range — unlike gate/recording audibility,
  which uses the source's).
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
| R | Recording toggle (tap on/tap off); long-hold = hold-to-record; records into the cursor slot |
| Space | Perform the whole tape (all filled slots, in order) |
| ←/→ | Move the tape cursor (→ on a filled last slot adds a new one) |
| (clear the tape) | Walk over a pulsing **cleansing tile** — empties the whole tape (no delete key) |
| C | Clap |
| N | Metronome |
| F3 | Debug info overlay (hidden by default) |
| H | Controls/objective overlay |
| Esc | Pause |

- **Movement/look are HELD-KEY for players** (2026-07-12): the camera
  moves/turns every frame a key is DOWN and stops exactly on release — no
  post-release lurch. You are a code-blind, human-like tester, so drive input
  the way a human does: HOLD keys across several frames (keydown, wait/act for
  a beat, then keyup), not instantaneous taps. An instantaneous down+up that
  resolves within one animation frame produces ZERO movement — "a tap didn't
  move me" is an agent-environment artifact, not a game bug. (A dev tap-impulse
  affordance exists but is off-limits to you — it lives behind
  `window.__resoundDebug`, which you must not touch.)
- Recommended agent camera technique: press M once (kills mouse-look), then
  steer by HOLDING I/J/K/L (keydown, brief wait, keyup) between screenshots —
  not instantaneous taps.

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
- `evaluate_script` is allowed ONLY for the two ears snippets below (install
  + poll). Re-install after every page load/navigation.

SNIPPET 1 (install):

```js
(() => {
  if (window.__ears) return 'ears already installed';
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const toNote=f=>{ if(!f||f<=0) return null; const n=Math.round(12*Math.log2(f/440))+69; return names[((n%12)+12)%12]+(Math.floor(n/12)-1); };
  window.__ears=[];
  const t0=performance.now();
  const logEv=(kind,f)=>{ window.__ears.push({t:+((performance.now()-t0)/1000).toFixed(2), kind, note:toNote(f), freq:Math.round(f*10)/10}); if(window.__ears.length>800) window.__ears.splice(0, window.__ears.length-800); };
  const os=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(...a){ this.__f=this.frequency.value; logEv('noteOn',this.frequency.value); return os.apply(this,a); };
  const ost=OscillatorNode.prototype.stop;
  OscillatorNode.prototype.stop=function(...a){ logEv('noteOff',this.__f??this.frequency.value); return ost.apply(this,a); };
  const svat=AudioParam.prototype.setValueAtTime;
  AudioParam.prototype.setValueAtTime=function(v,t){ if(v>=20) logEv('pitchChange',v); return svat.call(this,v,t); };
  return 'ears installed';
})()
```

SNIPPET 2 (listen — returns and clears events since the last poll):

```js
JSON.stringify((window.__ears||[]).splice(0))
```
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
- R6 (2026-07-02/03): agent session was environmentally degraded (dead ears,
  inflated counts — disproven by live coordinator verification), but its one
  real blocker was gold: replaying a wrong take completed the puzzle. Root
  cause: the retention window's trimming manufactured phantom leading
  silence around cycle-aligned remnants. Fixed with a trim horizon (trimmed
  history is unknowable, not silent). Also fixed: rapid look-taps swallowed
  by impulse clearing; debug cosmetics. Designer rulings: rests in targets
  must be matchable with exactness kept → anchored rhythm-timeline matching
  (SongMatcher.targetTimeline + core/phraseMatching.js, polyphony-safe);
  mouse-position camera is intended (see DESIGN.md).
- R7 (2026-07-03, first /playtest skill run): CONVERGED on correctness.
  Clean 3-note take activated the fountain (fanfare + [DONE] + completion
  overlay); 6-note over-long and 5-note rotated takes correctly rejected
  with accurate phrase-length reporting; repeated wrong playbacks + >45s
  idle never falsely completed (trim-horizon regression HOLDS). Recording
  timing behaved per design (takes start at whatever sounds after R-press,
  no auto-trim). Open follow-ups for a narrow future round, NO rulings yet:
  menu isn't keyboard-navigable; F3 slot listing ellipsizes unconditionally;
  failure toast timing vs judgment unverified; exactly-3 rotated take
  unverified; mismatch feedback invisible when facing away from the target
  (proposal: red slot flash, mirrors the green record pop); persistent ✓
  with no progress-reset affordance (designer call); fresh-eyes sweep
  skipped.
- Testing tip: the dev build exposes `window.__resoundDebug` ({gameState,
  scene, entityManager, PlaybackManager, ListeningManager}) — for
  coordinator/diagnostic use, NOT for code-blind agents.
