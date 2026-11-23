# Resound — Code-Blind Playtest Briefing

Context given to code-blind playtest agents. Agents get these rules "for free"
so testing isn't blocked on discovery; **real players should discover them in
the game** — if an agent reports a rule here as undiscoverable in-app, that's a
valid finding, not a contradiction. Seed material for a future `/playtest`
skill.

## The game in one paragraph

Resound is a first-person 3D musical puzzle game (Three.js + Web Audio).
Creatures sing melodies on a musical clock. A gate or fountain that hears its
song sung exactly unlocks/activates. The player carries CREATURES: R pokes a
nearby creature with a telescoping pole and absorbs it into the slot strip;
Space lets the selected creature out again a few steps ahead, where it sings
its song as before — its first note on the beat Space was pressed on (or the
next one) (since 2026-11-23 — the player no longer records or plays
anything back). Activating fountains completes the puzzle.

## Game rules agents get for free

- **No aiming at targets, but the pole needs you to FACE the creature.**
  There is no crosshair. Sound is omnidirectional. Absorbing (R) takes a
  creature in reach that is in front of you (its body within ~40° of where
  you look, mouse offset included) and that you can SEE (no wall, closed
  gate, door, raised floor or ramp in between) — the best centred, then the
  nearest; the reach mark "×N" and the R hint count exactly those. Releasing
  puts the creature ~2.5 units ahead along your view, on walkable floor of
  your own storey where its body fits and you can see it land (not in
  walls, gates, fountains, waystones, ramps, over a cliff edge, past a wall's
  corner or off the grid) — else a grey slot flash and nothing happens. A
  released creature sings its first note on the beat you pressed Space on
  (just past a beat counts as that beat), then every `interval` beats from
  there.
- **Sound carries by its SOURCE's audible range.** A creature's song reaches a
  gate/fountain if the distance is ≤ the *creature's* `audibleRange`.
- **Creatures can activate targets themselves — by design.** A creature in
  range singing a target's exact song will solve it with no player input. The
  editor warns about this layout ("the puzzle will solve itself").
- **Targets hear everything at once.** They capture ALL notes they hear into
  one stream; another creature's notes interleaved inside a song corrupt it.
- **Absorb range is half the audible range** (`audibleRange × 0.5`, real
  distance in your own area — never through a door). You must be close.
- **Absorbing (R):** the pole extends, the creature is drawn into its tip and
  goes SILENT the moment the tip touches it; it lands in the cursor slot, or —
  if that slot already holds a creature — in a new slot at the end of the
  strip (the cursor follows). Nothing in reach, or a full strip (16): grey
  flash. **Releasing (Space):** the creature pours out of the tip and comes
  alive when the pole is back, singing on its old beat with its old voice;
  the slot empties. An empty slot or a bad spot: grey flash. One pole action
  at a time (R/Space during one are ignored). A creature you took from a
  level does not reappear when you come back; one you let out stays where
  you left it.
- **Matching: the gate must hear its song EXACTLY — surroundings don't
  matter** (2026-07-11): the target is a rhythm timeline (pitch + duration
  + relative beat position, quantized to 16ths), with rests as expected
  gaps. A performance matches when every target note sounds at the right
  relative beat and nothing else sounds INSIDE the aligned window. Sounds
  before/after the window are ignored — a door opens whenever its song
  occurs cleanly anywhere in a longer performance. Rotated phrases fail; notes
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
- **The inventory is a strip of creature slots** (2026-07-11 tape, holding
  creatures since 2026-11-23): boots with ONE slot; ←/→ move the cursor and
  → on a filled last slot appends a new empty one (up to 16). A slot shows
  the held creature as a small glowing orb and its song's note count. There
  is no delete. A **waystone** (a gently pulsing floor pad; it was the
  "cleanser" until 2026-11-23) clears nothing: stepping on it makes it the
  gold one, where the G gate leads back to.
- **The world remembers.** An area you leave far behind is unloaded and
  rebuilt when you come back — exactly as you left it (creatures where you
  moved them, gates open, fountains activated).
- **Mismatch feedback is visual**: a completed wrong phrase flashes the
  gate/fountain RED for ~600ms. Animations are hard to catch in single
  screenshots — use the F3 debug panel, which mirrors the last judged phrase
  in text ("↳ heard N-note phrase — NO MATCH (Xs ago)"). That line is the
  sanctioned animation proxy for testers.
- **Other wordless cues to watch for** (design philosophy: placement, color,
  iconography, animation over words): a slot "pops" (scale flash) when a
  creature lands in it; a grey slot flash means R/Space did nothing; the
  reach mark over the cursor slot (a pale ring, badge "×N") shows while a
  creature is in the pole's reach and pulses red while one is drawn in;
  creatures glow while singing.
- **The world freezes while the start/help overlay is up** (H): no singing,
  no clock, no creature movement. Self-solving layouts complete after you
  dismiss it — visibly and audibly, with the completion screen on top.
- **Pause (Esc) titles**: "Paused" mid-game; "Puzzle Complete!" only when
  every fountain in the CURRENT session is activated.
- **No clapping** (removed 2026-11-23): to retime a creature, absorb it and
  release it on the beat you want. Harmonies attract (consonant) or
  repel (dissonant) creatures while they sing; perfect intervals do nothing.
  Forces apply only WHILE a creature sings and hears another note within its
  OWN audibleRange (the listener's range — unlike gate audibility, which
  uses the source's). The player sings nothing, so only creatures (and
  fountains) push and pull creatures now.
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
| R | Absorb the creature you face, in reach and in sight, into the cursor slot (or a new slot at the end if that one is full) |
| Space | Release the cursor slot's creature ~2.5 ahead |
| ←/→ | Move the slot cursor (→ on a filled last slot adds a new one) |
| ↑/↓, Enter or Space, C | In a menu (pause, main): move the focus (wraps), choose, back out (resume). The pause menu has Invert Look and Sound On/Off entries |
| N | Metronome |
| P | Sound on/off (toast; works paused too; time keeps running while off) |
| F3 | Debug info overlay (hidden by default) |
| H | Controls/objective overlay |
| Esc | Pause |

A game controller (PS4 DualShock 4, or any pad the browser maps to the
"standard" layout) plays too; an agent has none, so this is for reference:

| Button | Action |
|---|---|
| Left stick | Walk / strafe (speed follows the tilt) |
| L2 (hold) | Run |
| L3 (click) | Run, until the left stick returns to rest |
| Right stick | Look (fine near center) |
| Cross | Release a creature (Space) |
| Square | Absorb a creature (R) |
| Circle | Back out of a menu (C); nothing in the world |
| Triangle | Waystone gate (G) |
| L1 / R1, d-pad ←/→ | Slot cursor (←/→) |
| Options | Pause / resume (Esc) |
| Share | Sound on/off (P) |
| D-pad ↑/↓, left stick ↑/↓ | In a menu: move the focus (↑/↓; the stick repeats while held) |
| Cross / Circle in a menu | Choose (Space) / back out, resume from pause (C) |

Any button wakes the start gate, but only into a world with sound: on a
fresh page a pad press (or Esc) can't unlock audio, so the gate stays up and
asks for a key or a click.

The key hints follow the device in hand: a pad button or a stick leaving its
dead zone switches them to that pad's buttons (PlayStation shapes, Xbox
X/A/B/Y, Switch Y/B/A/X, or a generic pad's lit diamond position; the move
cluster becomes the two sticks), a real key or the mouse switches back. To
see them without a pad, override `navigator.getGamepads` with a fake pad
whose `id` names the family (e.g. "Xbox Wireless Controller (STANDARD
GAMEPAD Vendor: 045e Product: 0b13)") and dispatch `gamepadconnected`.

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
  confirmed recording timing is intentional gameplay (rule retired with recording, 2026-11-23); a live
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
  scene, AbsorbManager, ListeningManager, ...}; `setPoleSlowmo(n)` slows the
  pole's animations) — for coordinator/diagnostic use, NOT for code-blind
  agents.
