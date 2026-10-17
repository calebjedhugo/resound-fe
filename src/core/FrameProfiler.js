/**
 * FrameProfiler — dev-only, on-demand frame timing
 * (`await window.__resoundDebug.profile(frames)`).
 *
 * A run wraps a list of methods (the game loop's update/render, each
 * subsystem's update or render pass) plus renderer.render itself, so every
 * call is timed, and removes every wrapper when it ends: outside a run the
 * game pays nothing. Each timed call is keyed by its label AND the label of
 * the timed call it ran inside ("three.render < doors.mirrorSweep"), so one
 * function reached from several places reports each place apart. Every key
 * reports INCLUSIVE time (the call and everything under it) and SELF time
 * (minus the timed calls nested inside it): self times add up to the whole
 * frame, and an unwrapped cost shows up as its caller's self time.
 *
 * Per frame it also records the rAF interval, draw calls and triangles over
 * EVERY renderer.render of the frame (three's info normally resets per call,
 * so outside a run it only ever shows the main view), shader-program
 * re-derivations (core/passContext), and — where the browser exposes
 * EXT_disjoint_timer_query_webgl2 — GPU time per pass: one query around each
 * renderer.render, reported per caller key and summed per frame (GPU work
 * outside a render call, e.g. a texture upload, is not counted).
 *
 * The rAF callback is all a frame record sees. Work that runs elsewhere
 * (setTimeout note scheduling, fetch-then-build of a neighbor area) shows up
 * only in `longAnimationFrames` — the browser's own attribution of frames
 * over 50 ms, where supported.
 */
import * as THREE from 'three';

const FRAME_BUDGET_MS = 1000 / 60;
const GPU_SETTLE_FRAMES = 30;
const LONG_FRAMES_REPORTED = 10;

const round = (value) => Math.round(value * 100) / 100;

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const sum = sorted.reduce((total, v) => total + v, 0);
  return {
    mean: round(sum / sorted.length),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[sorted.length - 1]),
  };
}

/**
 * GPU time per pass: a TIME_ELAPSED query around each renderer.render
 * (passes run one after another; a nested one rides in its parent's query).
 * Results resolve a few frames late; a disjoint event voids the frames whose
 * results it overlapped.
 */
function createGpuTimer(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pending = []; // { query, key, frame }
  const byKey = new Map(); // caller key -> ms over valid frames
  const byFrame = new Map(); // frame -> { ms, waiting, void }
  let open = null;
  return {
    byKey,
    byFrame,
    /** @returns {boolean} whether this call opened a query (end it after) */
    begin(key, frame) {
      if (open) return false;
      open = { query: gl.createQuery(), key, frame };
      gl.beginQuery(ext.TIME_ELAPSED_EXT, open.query);
      const slot = byFrame.get(frame) || { ms: 0, waiting: 0, void: false };
      slot.waiting += 1;
      byFrame.set(frame, slot);
      return true;
    },
    end() {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(open);
      open = null;
    },
    poll() {
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (
        pending.length > 0 &&
        gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)
      ) {
        const { query, key, frame } = pending.shift();
        const slot = byFrame.get(frame);
        slot.waiting -= 1;
        if (disjoint) slot.void = true;
        else {
          const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          slot.ms += ms;
          byKey.set(key, (byKey.get(key) || 0) + ms);
        }
        gl.deleteQuery(query);
      }
      return pending.length;
    },
    discard() {
      pending.forEach(({ query }) => gl.deleteQuery(query));
      pending.length = 0;
    },
  };
}

/** Browser-attributed frames over 50 ms (Long Animation Frames), if supported. */
function observeLongAnimationFrames() {
  const supported =
    typeof PerformanceObserver !== 'undefined' &&
    (PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame');
  if (!supported) return null;
  const entries = [];
  const observer = new PerformanceObserver((list) => entries.push(...list.getEntries()));
  observer.observe({ type: 'long-animation-frame' });
  return {
    stop() {
      entries.push(...observer.takeRecords());
      observer.disconnect();
      return entries
        .sort((a, b) => b.duration - a.duration)
        .slice(0, LONG_FRAMES_REPORTED)
        .map((entry) => ({
          durationMs: round(entry.duration),
          blockingMs: round(entry.blockingDuration),
          scripts: [...entry.scripts]
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 3)
            .map((s) => ({
              invoker: s.invoker,
              fn: s.sourceFunctionName,
              durationMs: round(s.duration),
            })),
        }));
    },
  };
}

/**
 * Profile the next `frames` frames.
 * @param {object} options
 * @param {THREE.WebGLRenderer} options.renderer - its render() is always
 *   timed (label "three.render"), with GPU time per pass
 * @param {{loop: Function}} options.gameLoop - its `loop` marks frame bounds
 * @param {Array<[object, string, string]>} options.targets - [owner, method,
 *   label]: owner[method] is timed under label (prototypes time every
 *   instance; a missing owner or method is skipped)
 * @param {number} [options.frames]
 * @returns {Promise<object>} the summary (see summarize below)
 */
export default function profileFrames({ renderer, gameLoop, targets, frames = 300 }) {
  const stack = []; // open timed calls: { key, start, child, gpu }
  const keys = new Map(); // parent key -> label -> "label < parent"
  const totals = new Map(); // key -> { self, incl, calls, maxIncl }
  const frameIncl = new Map(); // key -> inclusive ms this frame
  const restores = [];
  const records = [];
  const derivations = { count: 0 };
  let lastStart = null;
  let finished = false;

  const keyFor = (label) => {
    const parent = stack.length > 0 ? stack[stack.length - 1].key : '';
    let byLabel = keys.get(parent);
    if (!byLabel) {
      byLabel = new Map();
      keys.set(parent, byLabel);
    }
    let key = byLabel.get(label);
    if (!key) {
      key = parent ? `${label} < ${parent.split(' < ')[0]}` : label;
      byLabel.set(label, key);
    }
    return key;
  };

  const close = (entry) => {
    const incl = performance.now() - entry.start;
    let total = totals.get(entry.key);
    if (!total) {
      total = { self: 0, incl: 0, calls: 0, maxIncl: 0 };
      totals.set(entry.key, total);
    }
    total.self += incl - entry.child;
    total.incl += incl;
    total.calls += 1;
    frameIncl.set(entry.key, (frameIncl.get(entry.key) || 0) + incl);
    if (stack.length > 0) stack[stack.length - 1].child += incl;
  };

  const wrap = (owner, method, label, around = null) => {
    if (!owner || typeof owner[method] !== 'function') return;
    const original = owner[method];
    const own = Object.prototype.hasOwnProperty.call(owner, method);
    // eslint-disable-next-line func-names
    owner[method] = function () {
      if (finished) return original.apply(this, arguments); // eslint-disable-line prefer-rest-params
      const entry = { key: keyFor(label), start: 0, child: 0, gpu: false };
      if (around) around.before(entry);
      stack.push(entry);
      entry.start = performance.now();
      try {
        // `arguments` forwarded straight to apply allocates nothing (a rest
        // array would, on every timed call)
        return original.apply(this, arguments); // eslint-disable-line prefer-rest-params
      } finally {
        stack.pop();
        close(entry);
        if (around) around.after(entry);
      }
    };
    restores.push(() => {
      if (own) owner[method] = original;
      else delete owner[method];
    });
  };

  const { info } = renderer;
  const { autoReset } = info;
  info.autoReset = false;
  const gpu = createGpuTimer(renderer);
  const longAnimationFrames = observeLongAnimationFrames();

  const materialProto = THREE.Material.prototype;
  const cacheKey = materialProto.customProgramCacheKey;
  materialProto.customProgramCacheKey = function counted() {
    derivations.count += 1;
    return cacheKey.call(this);
  };
  restores.push(() => {
    materialProto.customProgramCacheKey = cacheKey;
  });

  const heapAt = () =>
    performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : null;
  const heapStart = heapAt();

  return new Promise((resolve) => {
    let derivationsAtFrame = 0;

    const summarize = () => {
      // Frames whose every pass resolved, with no disjoint event
      const gpuFrames = gpu
        ? records
            .map((r) => gpu.byFrame.get(r.frame))
            .filter((slot) => slot && slot.waiting === 0 && !slot.void)
            .map((slot) => slot.ms)
        : [];
      const phases = [...totals.entries()]
        .map(([key, t]) => {
          const phase = {
            key,
            selfMs: round(t.self / records.length),
            inclMs: round(t.incl / records.length),
            callsPerFrame: round(t.calls / records.length),
            maxInclMs: round(t.maxIncl),
          };
          if (gpu && gpu.byKey.has(key) && gpuFrames.length > 0) {
            phase.gpuMs = round(gpu.byKey.get(key) / gpuFrames.length);
          }
          return phase;
        })
        .sort((a, b) => b.selfMs - a.selfMs);
      const work = records.map((r) => r.workMs);
      const heapEnd = heapAt();
      return {
        frames: records.length,
        workMs: stats(work), // CPU time inside the rAF callback
        intervalMs: stats(records.slice(1).map((r) => r.intervalMs)),
        overBudget: work.filter((ms) => ms > FRAME_BUDGET_MS).length,
        gpuMs: gpu ? stats(gpuFrames) : null, // sum of the frame's passes
        drawCalls: stats(records.map((r) => r.calls)),
        triangles: stats(records.map((r) => r.triangles)),
        derivationsPerFrame: round(derivations.count / records.length),
        programs: info.programs ? info.programs.length : null,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        heapStartMB: heapStart === null ? null : round(heapStart),
        heapEndMB: heapEnd === null ? null : round(heapEnd),
        phases,
        // The worst over-budget frames, worst first
        longFrames: records
          .filter((r) => r.workMs > FRAME_BUDGET_MS)
          .sort((a, b) => b.workMs - a.workMs)
          .slice(0, LONG_FRAMES_REPORTED)
          .map((r) => ({ frame: r.frame, workMs: r.workMs, top: r.top })),
        longAnimationFrames: longAnimationFrames ? longAnimationFrames.stop() : null,
      };
    };

    const finish = () => {
      finished = true;
      restores.reverse().forEach((restore) => restore());
      info.autoReset = autoReset;
      if (!gpu) {
        resolve(summarize());
        return;
      }
      // Query results land a few frames late; wait (bounded) for the rest
      let settle = GPU_SETTLE_FRAMES;
      const drain = () => {
        if (gpu.poll() > 0 && settle > 0) {
          settle -= 1;
          requestAnimationFrame(drain);
          return;
        }
        gpu.discard();
        resolve(summarize());
      };
      requestAnimationFrame(drain);
    };

    wrap(gameLoop, 'loop', 'frame', {
      before() {
        frameIncl.clear();
        info.reset();
        derivationsAtFrame = derivations.count;
        if (gpu) gpu.poll();
      },
      after(entry) {
        const now = entry.start;
        const top = [];
        frameIncl.forEach((ms, key) => {
          const total = totals.get(key);
          if (ms > total.maxIncl) total.maxIncl = ms;
          if (key !== 'frame') top.push([key, round(ms)]);
        });
        top.sort((a, b) => b[1] - a[1]);
        records.push({
          frame: records.length,
          workMs: round(performance.now() - entry.start),
          intervalMs: lastStart === null ? 0 : round(now - lastStart),
          calls: info.render.calls,
          triangles: info.render.triangles,
          derivations: derivations.count - derivationsAtFrame,
          top: top.slice(0, 5),
        });
        lastStart = now;
        if (records.length >= frames && !finished) finish();
      },
    });
    wrap(
      renderer,
      'render',
      'three.render',
      gpu && {
        before(entry) {
          // eslint-disable-next-line no-param-reassign -- the entry is ours
          entry.gpu = gpu.begin(entry.key, records.length);
        },
        after(entry) {
          if (entry.gpu) gpu.end();
        },
      }
    );
    targets.forEach(([owner, method, label]) => wrap(owner, method, label));
  });
}
