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
 *    note of it (~1 ms); `warm()` builds them ahead.
 *
 * While the StartGate holds the world still (`hold`), jobs run back to back,
 * one per task: no frame shows anything worth protecting, and input is still
 * answered between jobs. Otherwise they run in idle callbacks, each only
 * when the idle period has room for what that kind of job last cost, so no
 * frame pays for one (on a slow machine a Piano render may wait for the next
 * gate). Nothing waits on this: a note not warmed yet still plays, built
 * lazily as before.
 */
import PlaybackManager from 'core/PlaybackManager';

// Main-thread ms a job of each kind cost last time; these first guesses are
// the audited 1x costs, rounded up
const cost = { voice: 2, piano: 12 };

// The longest idle period a browser grants (requestIdleCallback spec), so a
// one-off slow job can't price its kind out of ever running again
const MAX_IDLE_MS = 50;

// Without requestIdleCallback (Safari), idle jobs run on timers this far apart
const TIMER_FALLBACK_MS = 50;

const voiceJobs = []; // () => void
const pianoPitches = []; // pitches waiting for a render
const pianoQueued = new Set(); // every pitch ever queued (the cache keeps them)
let pianoRendering = false; // one render at a time
let held = false;
let scheduled = false;
let cancelIdle = null; // withdraws a scheduled idle run, so hold() can cut in

/** Run a job, remembering what its kind costs. */
function timed(kind, job) {
  const started = performance.now();
  const result = job();
  cost[kind] = Math.min(performance.now() - started, MAX_IDLE_MS);
  return result;
}

function hasWork() {
  return voiceJobs.length > 0 || (!pianoRendering && pianoPitches.length > 0);
}

function schedule() {
  if (scheduled || !hasWork()) return;
  scheduled = true;
  /* eslint-disable no-use-before-define */
  if (held) {
    setTimeout(runOne, 0);
  } else if (typeof window !== 'undefined' && window.requestIdleCallback) {
    const handle = window.requestIdleCallback(runIdle);
    cancelIdle = () => window.cancelIdleCallback(handle);
  } else {
    const handle = setTimeout(() => runIdle({ timeRemaining: () => Infinity }), TIMER_FALLBACK_MS);
    cancelIdle = () => clearTimeout(handle);
  }
  /* eslint-enable no-use-before-define */
}

function renderPianoPitch() {
  const pitch = pianoPitches.shift();
  pianoRendering = true;
  // Its graph is built now; the render itself runs off the main thread
  timed('piano', () => PlaybackManager.getPlayerInstrument().warm([pitch]))
    .catch(() => {}) // unwarmed, it still plays: rendered live on its first strike
    .then(() => {
      pianoRendering = false;
      schedule();
    });
}

/** Behind the StartGate: the next job, whatever it costs. */
function runOne() {
  scheduled = false;
  if (voiceJobs.length > 0) timed('voice', voiceJobs.shift());
  else if (!pianoRendering && pianoPitches.length > 0) renderPianoPitch();
  schedule();
}

/** In play: only the jobs this idle period has room for. */
function runIdle(deadline) {
  scheduled = false;
  cancelIdle = null;
  while (voiceJobs.length > 0 && deadline.timeRemaining() >= cost.voice) {
    timed('voice', voiceJobs.shift());
  }
  if (!pianoRendering && pianoPitches.length > 0 && deadline.timeRemaining() >= cost.piano) {
    renderPianoPitch();
  }
  schedule();
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
        // Instruments that can build their voices ahead (Random)
        if (typeof instrument.warm === 'function') {
          voiceJobs.push(() => instrument.warm(pitches));
        }
        for (const pitch of pitches) {
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
    if (held && cancelIdle) {
      // Areas are usually built (and queued) just before the gate goes up
      cancelIdle();
      cancelIdle = null;
      scheduled = false;
    }
    schedule();
  },
};

export default AudioPrewarm;
