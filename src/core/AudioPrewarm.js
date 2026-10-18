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
 *  - each creature's next song. Every note starts on audio nodes of its own
 *    (~0.1 ms of building at 1x, Chrome 152), and a world's creatures share
 *    their onsets: The Star's start 10-11 notes in one frame (4.3/6.9 ms
 *    mean/max at 1x, 10.7/16.6 at 4x, measured 2026-10-17). A creature asks
 *    for its next song as one ends (`prepareSong`, Random.prepare): one job
 *    per creature, with a deadline before that song starts.
 *
 * While the StartGate holds the world still (`hold`), jobs run back to back,
 * one per task: no frame shows anything worth protecting, and input is still
 * answered between jobs. Otherwise they run in idle callbacks (where there
 * are none, Safari, in timer slices of TIMER_SLICE_MS), each only when the
 * idle period has room for what that kind of job last cost, so no frame pays
 * for one (a Piano render may wait for the next gate: on a slow machine, and
 * in Safari). The one exception is a song's notes come their deadline: built
 * whatever the room (a frame that has no idle time, e.g. at 4x CPU with
 * doors open, still gets them before the song starts), one job per task, so
 * synchronised songs spread over tasks between frames. Only work that builds
 * something is run and priced: a pitch the audio already has (a note in play
 * got there first) is dropped, and a Piano render waits while the Piano's
 * own render pool is full rather than queue there, to be built whenever a
 * slot frees. Nothing waits on this: a note not built ahead still plays,
 * built as it starts, as before.
 */
import PlaybackManager from 'core/PlaybackManager';

// Main-thread ms a job of each kind cost last time; these first guesses are
// the audited 1x costs, rounded up (notes: one creature's next song)
const cost = { voice: 2, piano: 12, notes: 1 };

// A song's notes are built at least this long before it starts, idle time or
// not: a few frames' margin over the frame its onset lands in
const NOTES_LEAD_MS = 100;

// The longest idle period a browser grants (requestIdleCallback spec), so a
// one-off slow job can't price its kind out of ever running again
const MAX_IDLE_MS = 50;

// Without requestIdleCallback (Safari), idle jobs run in timer slices this
// far apart, each with this much room (as core/idleSlices' slices)
const TIMER_FALLBACK_MS = 50;
const TIMER_SLICE_MS = 8;

// How often a Piano render waiting on the Piano's full render pool looks again
const POOL_RETRY_MS = 50;

const noteJobs = new Map(); // instrument -> { pitches, dueAt }: a creature's next song
const voiceJobs = []; // { instrument, pitch }: one creature voice each
const pianoPitches = []; // pitches waiting for a render
const pianoQueued = new Set(); // every pitch ever queued (the cache keeps them)
let pianoBusy = false; // our render under way (one at a time), or a full pool
let held = false;
let scheduled = false;
let scheduledBy = Infinity; // the latest the scheduled run starts (performance.now ms)
let cancelRun = null; // withdraws the scheduled run, so hold() can replace it

/** Run a job that builds something, remembering what its kind costs. */
function timed(kind, job) {
  const started = performance.now();
  const result = job();
  cost[kind] = Math.min(performance.now() - started, MAX_IDLE_MS);
  return result;
}

/** The waiting song whose deadline comes first, if any. */
function nextNoteJob() {
  let next = null;
  noteJobs.forEach((job, instrument) => {
    if (!next || job.dueAt < next.dueAt) next = { instrument, dueAt: job.dueAt };
  });
  return next;
}

/** Whether a job is waiting that a run with this much room (ms) may start. */
function hasWork(room) {
  return (
    noteJobs.size > 0 || // built by its deadline whatever the room
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
  // The next run comes by the first song's deadline, idle time or not
  const now = performance.now();
  const next = nextNoteJob();
  const dueIn = next ? Math.max(0, next.dueAt - now) : Infinity;
  /* eslint-disable no-use-before-define */
  if (held) {
    const handle = setTimeout(runOne, 0);
    cancelRun = () => clearTimeout(handle);
    scheduledBy = now;
  } else if (idleCallbacks) {
    const handle = window.requestIdleCallback(runIdle, next ? { timeout: dueIn } : undefined);
    cancelRun = () => window.cancelIdleCallback(handle);
    scheduledBy = now + dueIn;
  } else {
    const delay = Math.min(TIMER_FALLBACK_MS, dueIn);
    const handle = setTimeout(runTimerSlice, delay);
    cancelRun = () => clearTimeout(handle);
    scheduledBy = now + delay;
  }
  /* eslint-enable no-use-before-define */
}

/** Withdraw the scheduled run, so the next schedule() can replace it. */
function unschedule() {
  if (!cancelRun) return;
  cancelRun();
  cancelRun = null;
  scheduled = false;
}

/**
 * A creature's next song, on the voices it has: a voice is a job of its own,
 * priced apart, so a song never builds one (a note whose voice isn't built
 * yet builds both as it starts, as before).
 */
function buildNotes(instrument) {
  const { pitches } = noteJobs.get(instrument);
  noteJobs.delete(instrument);
  const voiced = pitches.filter((pitch) => instrument.isWarm([pitch]));
  // Built already (or it builds none, or its creature is gone): nothing to build
  if (!instrument.isPrepared(voiced)) timed('notes', () => instrument.prepare(voiced));
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

/** Behind the StartGate: the next job, whatever it costs (voices before songs). */
function runOne() {
  scheduled = false;
  cancelRun = null;
  if (voiceJobs.length > 0) buildVoice();
  else if (noteJobs.size > 0) buildNotes(nextNoteJob().instrument);
  else if (!pianoBusy && pianoPitches.length > 0) renderPianoPitch();
  schedule();
}

/**
 * In play: a song come its deadline (one: synchronised songs each get a task
 * of their own), then only the jobs this idle period has room for, voices
 * before the songs that play on them. A timed-out idle callback has no room
 * at all, even for a job too quick to time.
 */
function runIdle(deadline) {
  scheduled = false;
  cancelRun = null;
  const due = nextNoteJob();
  if (due && due.dueAt <= performance.now()) buildNotes(due.instrument);
  const roomFor = (kind) => deadline.timeRemaining() > 0 && deadline.timeRemaining() >= cost[kind];
  while (voiceJobs.length > 0 && roomFor('voice')) buildVoice();
  while (noteJobs.size > 0 && roomFor('notes')) buildNotes(nextNoteJob().instrument);
  if (!pianoBusy && pianoPitches.length > 0 && roomFor('piano')) renderPianoPitch();
  schedule();
}

/** Without requestIdleCallback: an idle period TIMER_SLICE_MS long, from now. */
function runTimerSlice() {
  const start = performance.now();
  runIdle({ timeRemaining: () => Math.max(0, start + TIMER_SLICE_MS - performance.now()) });
}

/** The pitch of every note a song sounds, in order (chord members included). */
function notePitches(song) {
  const pitches = [];
  const visit = (element) => {
    if (Array.isArray(element)) element.forEach(visit);
    else if (element && element.pitch) pitches.push(element.pitch);
  };
  visit(song);
  return pitches;
}

/** Every pitch a song sounds, once. */
function songPitches(song) {
  return [...new Set(notePitches(song))];
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
   * Build a creature's next performance of its song ahead (Random.prepare:
   * every note's nodes, so its onset frame only schedules them): in idle
   * time, and NOTES_LEAD_MS before it starts at the latest, idle time or
   * not. Replaces the creature's waiting request, if any.
   * @param {Instrument} instrument - one that prepares notes (Random)
   * @param {Array} song - notes and chords
   * @param {number} startsInMs - when the song starts, from now
   */
  prepareSong(instrument, song, startsInMs) {
    if (typeof instrument.prepare !== 'function') return; // it builds as it plays
    const pitches = notePitches(song);
    if (instrument.isPrepared(pitches)) return; // nothing to build
    const dueAt = performance.now() + Math.max(0, startsInMs - NOTES_LEAD_MS);
    noteJobs.set(instrument, { pitches, dueAt });
    // A run already scheduled for later than that gives way to one by then
    if (scheduled && dueAt < scheduledBy) unschedule();
    schedule();
  },

  /**
   * The world was torn down (PortalManager.reset): its creatures' queued
   * voices and songs go, as their instruments did. The piano outlives every
   * world, so its queued pitches stay, and so does any run already scheduled
   * for the queue (it serves the next world's jobs, or finds nothing and
   * stops).
   */
  reset() {
    noteJobs.clear();
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
    unschedule();
    schedule();
  },
};

export default AudioPrewarm;
