/**
 * runInIdleSlices — run a list of steps in the browser's idle time, a few
 * per task, so background work (a neighbor area building behind a doorway)
 * never lands on a frame as one long task.
 *
 * Each slice runs inside a requestIdleCallback and keeps going only while
 * both its idle deadline and IDLE_SLICE_MS leave room for another step as
 * long as the longest one so far — every slice runs AT LEAST one step, so
 * the work always finishes. A busy main thread that offers no idle time
 * still gets a slice every IDLE_TIMEOUT_MS. Where requestIdleCallback is
 * missing (Safari) each slice is a plain timer task with the same budget.
 */

// Longest a slice may run (ms), idle deadline or not: about half a 60 fps
// frame (one step longer than this still runs, alone in its slice)
const IDLE_SLICE_MS = 8;

// A slice runs within this long (ms) even if the browser never goes idle
const IDLE_TIMEOUT_MS = 100;

const TIMER_DEADLINE = { didTimeout: false, timeRemaining: () => IDLE_SLICE_MS };

function schedule(slice) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(slice, { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(() => slice(TIMER_DEADLINE), 0);
  }
}

/**
 * @param {Array<() => void>} steps - run in order, each in a single task
 * @param {() => boolean} [shouldContinue] - checked before every slice;
 *   false stops the run (the remaining steps never run)
 * @returns {Promise<boolean>} resolves — inside the task that ran the last
 *   step, so its `then` runs before any frame — true once every step ran,
 *   false if stopped; rejects if a step throws
 */
export default function runInIdleSlices(steps, shouldContinue = () => true) {
  return new Promise((resolve, reject) => {
    let next = 0;
    let longestStep = 0;
    const slice = (deadline) => {
      if (!shouldContinue()) {
        resolve(false);
        return;
      }
      const start = performance.now();
      const roomForAnother = () =>
        performance.now() - start + longestStep < IDLE_SLICE_MS &&
        deadline.timeRemaining() > longestStep;
      try {
        do {
          const stepStart = performance.now();
          steps[next]();
          next += 1;
          longestStep = Math.max(longestStep, performance.now() - stepStart);
        } while (next < steps.length && roomForAnother());
      } catch (error) {
        reject(error);
        return;
      }
      if (next < steps.length) schedule(slice);
      else resolve(true);
    };
    if (steps.length === 0) resolve(true);
    else schedule(slice);
  });
}
