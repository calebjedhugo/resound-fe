/**
 * AudioPrewarm — build ahead the audio that a first note would otherwise
 * build mid-frame (resound-sound builds it lazily):
 *  - the player's Piano. The first time the tape plays a pitch, the Piano
 *    renders that strike live AND builds its offline render (12 ms at 1x
 *    CPU, 32-45 ms at 4x, audited 2026-10-17); every later strike is one
 *    buffer source. The tape only ever holds what creatures sang, so the
 *    pitches it can play are the creatures': each area's are pre-rendered
 *    as the area is built (world entry, and every neighbor as it loads).
 *  - each creature's voice. A Random builds a pitch's wavetable on its first
 *    note of it (~1-1.5 ms at 44.1-48 kHz; above 88.2 kHz it builds none);
 *    `warm()` builds them ahead, one job per (creature, pitch).
 *
 * While the StartGate holds the world still (`hold`), jobs run back to back,
 * one per task: no frame shows anything worth protecting, and input is still
 * answered between jobs. Otherwise they run in idle callbacks (where there
 * are none, Safari, in timer slices of TIMER_SLICE_MS), each only when the
 * idle period has room for what that kind of job last cost, so no frame pays
 * for one (a Piano render may wait for the next gate: on a slow machine, and
 * in Safari). Only work that builds something is run and priced: a pitch the
 * audio already has (a note in play got there first) is dropped, and a Piano
 * render waits while the Piano's own render pool is full rather than queue
 * there, to be built whenever a slot frees. Nothing waits on this: a note
 * not warmed yet still plays, built lazily as before.
 */
import PlaybackManager from 'core/PlaybackManager';

// Main-thread ms a job of each kind cost last time; these first guesses are
// the audited 1x costs, rounded up
const cost = { voice: 2, piano: 12 };

// The longest idle period a browser grants (requestIdleCallback spec), so a
// one-off slow job can't price its kind out of ever running again
const MAX_IDLE_MS = 50;

// Without requestIdleCallback (Safari), idle jobs run in timer slices this
// far apart, each with this much room (as core/idleSlices' slices)
const TIMER_FALLBACK_MS = 50;
const TIMER_SLICE_MS = 8;

// How often a Piano render waiting on the Piano's full render pool looks again
const POOL_RETRY_MS = 50;

const voiceJobs = []; // { instrument, pitch }: one creature voice each
const pianoPitches = []; // pitches waiting for a render
const pianoQueued = new Set(); // every pitch ever queued (the cache keeps them)
let pianoBusy = false; // our render under way (one at a time), or a full pool
let held = false;
let scheduled = false;
let cancelRun = null; // withdraws the scheduled run, so hold() can replace it

/** Run a job that builds something, remembering what its kind costs. */
function timed(kind, job) {
  const started = performance.now();
  const result = job();
  cost[kind] = Math.min(performance.now() - started, MAX_IDLE_MS);
  return result;
}

/** Whether a job is waiting that a run with this much room (ms) may start. */
function hasWork(room) {
  return (
    (voiceJobs.length > 0 && cost.voice <= room) ||
    (!pianoBusy && pianoPitches.length > 0 && cost.piano <= room)
  );
}

function schedule() {
  const idleCallbacks = typeof window !== 'undefined' && window.requestIdleCallback;
  // A timer slice never has room for a job dearer than itself: that job
  // waits for the gate, rather than re-arm a timer that can never run it
  const room = held || idleCallbacks ? Infinity : TIMER_SLICE_MS;
  if (scheduled || !hasWork(room)) return;
  scheduled = true;
  /* eslint-disable no-use-before-define */
  if (held) {
    const handle = setTimeout(runOne, 0);
    cancelRun = () => clearTimeout(handle);
  } else if (idleCallbacks) {
    const handle = window.requestIdleCallback(runIdle);
    cancelRun = () => window.cancelIdleCallback(handle);
  } else {
    const handle = setTimeout(runTimerSlice, TIMER_FALLBACK_MS);
    cancelRun = () => clearTimeout(handle);
  }
  /* eslint-enable no-use-before-define */
}

/** The next creature voice, unless its creature has it already. */
function buildVoice() {
  const { instrument, pitch } = voiceJobs.shift();
  // It sang the pitch first (or builds no voices): nothing to build
  if (!instrument.isWarm([pitch])) timed('voice', () => instrument.warm([pitch]));
}

/** The next render the Piano doesn't have, if it can start one now. */
function renderPianoPitch() {
  const piano = PlaybackManager.getPlayerInstrument();
  // A strike in play rendered (or queued) it first: nothing to build
  while (pianoPitches.length > 0 && piano.isWarm([pianoPitches[0]])) pianoPitches.shift();
  if (pianoPitches.length === 0) return;

  pianoBusy = true;
  const done = () => {
    pianoBusy = false;
    schedule();
  };
  if (!piano.canRenderNow()) {
    // Strikes in play fill its pool: warm() would only queue the render,
    // to be built when a slot frees, in no idle period
    setTimeout(done, POOL_RETRY_MS);
    return;
  }
  // Its graph is built now; the render itself runs off the main thread
  const pitch = pianoPitches.shift();
  timed('piano', () => piano.warm([pitch]))
    .catch(() => {}) // unwarmed, it still plays: rendered live on its first strike
    .then(done);
}

/** Behind the StartGate: the next job, whatever it costs. */
function runOne() {
  scheduled = false;
  cancelRun = null;
  if (voiceJobs.length > 0) buildVoice();
  else if (!pianoBusy && pianoPitches.length > 0) renderPianoPitch();
  schedule();
}

/** In play: only the jobs this idle period has room for. */
function runIdle(deadline) {
  scheduled = false;
  cancelRun = null;
  while (voiceJobs.length > 0 && deadline.timeRemaining() >= cost.voice) buildVoice();
  if (!pianoBusy && pianoPitches.length > 0 && deadline.timeRemaining() >= cost.piano) {
    renderPianoPitch();
  }
  schedule();
}

/** Without requestIdleCallback: an idle period TIMER_SLICE_MS long, from now. */
function runTimerSlice() {
  const start = performance.now();
  runIdle({ timeRemaining: () => Math.max(0, start + TIMER_SLICE_MS - performance.now()) });
}

/** Every pitch a song sounds (notes and chord members). */
function songPitches(song) {
  const pitches = new Set();
  const visit = (element) => {
    if (Array.isArray(element)) element.forEach(visit);
    else if (element && element.pitch) pitches.add(element.pitch);
  };
  visit(song);
  return [...pitches];
}

const AudioPrewarm = {
  /**
   * Queue a newly built area's sounds: each creature's voice for its song,
   * and every pitch its creatures sing for the player's Piano.
   * @param {Area} area
   */
  warmArea(area) {
    for (const entity of area.entities) {
      if (entity.type === 'creature') {
        const pitches = songPitches(entity.song);
        const { instrument } = entity;
        for (const pitch of pitches) {
          // Instruments that can build their voices ahead (Random), a pitch
          // a job so that a job fits an idle period
          if (typeof instrument.warm === 'function') voiceJobs.push({ instrument, pitch });
          if (!pianoQueued.has(pitch)) {
            pianoQueued.add(pitch);
            pianoPitches.push(pitch);
          }
        }
      }
    }
    schedule();
  },

  /**
   * The world was torn down (PortalManager.reset): its creatures' queued
   * voices go, as their instruments did. The piano outlives every world, so
   * its queued pitches stay, and so does any run already scheduled for the
   * queue (it serves the next world's jobs, or finds nothing and stops).
   */
  reset() {
    voiceJobs.length = 0;
  },

  /**
   * The world is held still (the StartGate is up), or running again: held,
   * jobs stop waiting for idle time.
   * @param {boolean} isHeld
   */
  hold(isHeld) {
    held = isHeld;
    // A run already scheduled gives way to one of the new kind: held, jobs
    // stop waiting for idle time (areas are usually built, and queued, just
    // before the gate goes up); running again, none runs flat out any more
    if (cancelRun) {
      cancelRun();
      cancelRun = null;
      scheduled = false;
    }
    schedule();
  },
};

export default AudioPrewarm;
