/**
 * AudioPrewarm — build ahead the audio that a first note would otherwise
 * build mid-frame (resound-sound builds it lazily):
 *  - each creature's voice. A Random builds a pitch's wavetable on its first
 *    note of it (~1-1.5 ms at 44.1-48 kHz; above 88.2 kHz it builds none);
 *    `warm()` builds them ahead, one job per (creature, pitch).
 *  - each creature's next song. Every note starts on audio nodes of its own
 *    (~0.1 ms of building at 1x, Chrome 152), and a world's creatures share
 *    their onsets: The Star's start 10-11 notes in one frame (4.3/6.9 ms
 *    mean/max at 1x, 10.7/16.6 at 4x, measured 2026-10-17). A creature asks
 *    for its next song as one ends (`prepareSong`, Random.prepare): one job
 *    per creature, with a deadline before that song starts.
 * (The player's tape Piano was pre-rendered here too until the tape stopped
 * playing, 2026-11-23: the pole holds creatures now, which sing themselves.)
 *
 * While the StartGate holds the world still (`hold`), jobs run back to back,
 * one per task: no frame shows anything worth protecting, and input is still
 * answered between jobs. Otherwise they run in idle callbacks (where there
 * are none, Safari, in timer slices of TIMER_SLICE_MS), each only when the
 * idle period has room for what that kind of job last cost, so no frame pays
 * for one. The one exception is a song's notes come their deadline: built
 * whatever the room (a frame that has no idle time, e.g. at 4x CPU with
 * doors open, still gets them before the song starts), one job per task, so
 * synchronised songs spread over tasks between frames. Only work that builds
 * something is run and priced: a pitch the audio already has (a note in play
 * got there first) is dropped. Nothing waits on this: a note not built ahead
 * still plays, built as it starts, as before.
 */

// Main-thread ms a job of each kind cost last time; these first guesses are
// the audited 1x costs, rounded up (notes: one creature's next song)
const cost = { voice: 2, notes: 1 };

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

const noteJobs = new Map(); // instrument -> { pitches, dueAt }: a creature's next song
const voiceJobs = []; // { instrument, pitch }: one creature voice each
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
    (voiceJobs.length > 0 && cost.voice <= room)
  );
}

function schedule() {
  const idleCallbacks = typeof window !== 'undefined' && window.requestIdleCallback;
  // No idle period has room for a job dearer than the longest a browser
  // grants, nor a timer slice for one dearer than itself: that job waits
  // for the gate, rather than re-arm a callback that can never run it
  let room = Infinity;
  if (!held) room = idleCallbacks ? MAX_IDLE_MS : TIMER_SLICE_MS;
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

/** Behind the StartGate: the next job, whatever it costs (voices before songs). */
function runOne() {
  scheduled = false;
  cancelRun = null;
  if (voiceJobs.length > 0) buildVoice();
  else if (noteJobs.size > 0) buildNotes(nextNoteJob().instrument);
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
   * Queue a newly built area's sounds: each creature's voice for its song.
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
   * Build a creature's voice and next song NOW, whatever it costs — for the
   * one moment that cannot wait: a creature let out of the pole sings on the
   * beat of the press, at most a beat away, on a fresh instrument with no
   * voice built (core/AbsorbManager). Paid on the key press, not in a frame.
   * Its waiting song request, if any, is done with. Not priced: it builds
   * several voices at once, and the idle-time prices are one job's.
   * @param {Instrument} instrument
   * @param {Array} song - notes and chords
   */
  prepareNow(instrument, song) {
    noteJobs.delete(instrument);
    const pitches = songPitches(song);
    if (typeof instrument.warm === 'function' && !instrument.isWarm(pitches)) {
      instrument.warm(pitches);
    }
    const notes = notePitches(song);
    if (typeof instrument.prepare === 'function' && !instrument.isPrepared(notes)) {
      instrument.prepare(notes);
    }
  },

  /**
   * The world was torn down (PortalManager.reset): its creatures' queued
   * voices and songs go, as their instruments did. A run already scheduled
   * stays (it serves the next world's jobs, or finds nothing and stops).
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
