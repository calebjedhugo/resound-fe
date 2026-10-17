/**
 * The dev-only frame profiler (core/FrameProfiler, behind
 * window.__resoundDebug.profile): a run times every wrapped call by where it
 * ran, counts draw calls over EVERY pass of a frame, and leaves nothing
 * wrapped behind it.
 */
import * as THREE from 'three';
import profileFrames from 'core/FrameProfiler';

// Tests run on fake timers (setupTests), which drive performance.now too:
// a step "takes" exactly 1 ms
class Simulation {
  // eslint-disable-next-line class-methods-use-this
  step() {
    jest.advanceTimersByTime(1);
  }
}

function fakeRenderer() {
  const info = {
    autoReset: true,
    render: { calls: 0, triangles: 0 },
    memory: { geometries: 3, textures: 1 },
    programs: [],
    reset() {
      this.render.calls = 0;
      this.render.triangles = 0;
    },
  };
  return {
    info,
    getContext: () => ({}), // no timer-query extension: GPU time is null
    render() {
      if (info.autoReset) info.reset();
      info.render.calls += 1;
      info.render.triangles += 12;
      new THREE.Material().customProgramCacheKey(); // one re-derivation per pass
    },
  };
}

function fakeGame(renderer) {
  const sim = new Simulation();
  return {
    sim,
    gameLoop: {
      update() {
        sim.step();
      },
      render() {
        renderer.render(); // a door pass
        renderer.render(); // the main view
      },
      loop() {
        this.update(1 / 60);
        this.render();
      },
    },
  };
}

describe('FrameProfiler', () => {
  it('times each call by where it ran, with self time excluding timed children', async () => {
    const renderer = fakeRenderer();
    const { gameLoop } = fakeGame(renderer);
    const run = profileFrames({
      renderer,
      gameLoop,
      frames: 5,
      targets: [
        [gameLoop, 'update', 'update'],
        [gameLoop, 'render', 'render'],
        [Simulation.prototype, 'step', 'sim.step'],
        [null, 'update', 'missing.owner'], // skipped, not thrown
      ],
    });
    for (let i = 0; i < 5; i += 1) gameLoop.loop();
    const summary = await run;

    const phase = (key) => summary.phases.find((p) => p.key === key);
    expect(summary.frames).toBe(5);
    expect(phase('sim.step < update').callsPerFrame).toBe(1);
    expect(phase('sim.step < update').selfMs).toBeGreaterThanOrEqual(1);
    expect(phase('three.render < render').callsPerFrame).toBe(2);
    // update's own time excludes the simulation step it wrapped
    expect(phase('update < frame').inclMs).toBeGreaterThanOrEqual(1);
    expect(phase('update < frame').selfMs).toBeLessThan(1);
    // self times add up to the whole frame
    const selfTotal = summary.phases.reduce((total, p) => total + p.selfMs, 0);
    expect(selfTotal).toBeCloseTo(phase('frame').inclMs, 1);
  });

  it('counts draw calls and re-derivations over every pass of the frame', async () => {
    const renderer = fakeRenderer();
    const { gameLoop } = fakeGame(renderer);
    const run = profileFrames({ renderer, gameLoop, frames: 3, targets: [] });
    for (let i = 0; i < 3; i += 1) gameLoop.loop();
    const summary = await run;

    expect(summary.drawCalls.mean).toBe(2); // not just the last pass
    expect(summary.triangles.max).toBe(24);
    expect(summary.derivationsPerFrame).toBe(2);
    expect(summary.gpuMs).toBeNull();
    expect(summary.geometries).toBe(3);
  });

  it('times the GPU per pass, by caller, and sums each frame', async () => {
    const renderer = fakeRenderer();
    const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
    const gl = {
      QUERY_RESULT_AVAILABLE: 3,
      QUERY_RESULT: 4,
      openQueries: 0,
      getExtension: (name) => (name === 'EXT_disjoint_timer_query_webgl2' ? ext : null),
      createQuery: () => ({}),
      beginQuery() {
        this.openQueries += 1;
      },
      endQuery() {
        this.openQueries -= 1;
      },
      getParameter: () => false, // never disjoint
      getQueryParameter: (query, pname) => (pname === 3 ? true : 2e6), // 2 ms a pass
      deleteQuery() {},
    };
    renderer.getContext = () => gl;
    global.requestAnimationFrame = (callback) => setTimeout(callback, 16);
    try {
      const { gameLoop } = fakeGame(renderer);
      const run = profileFrames({
        renderer,
        gameLoop,
        frames: 3,
        targets: [[gameLoop, 'render', 'render']],
      });
      for (let i = 0; i < 3; i += 1) gameLoop.loop();
      jest.advanceTimersByTime(100); // the last results drain a frame later
      const summary = await run;

      expect(summary.gpuMs.mean).toBe(4); // a door pass + the main view
      const passes = summary.phases.find((p) => p.key === 'three.render < render');
      expect(passes.gpuMs).toBe(4);
      expect(gl.openQueries).toBe(0);
    } finally {
      delete global.requestAnimationFrame;
    }
  });

  it('reports the worst over-budget frames first', async () => {
    const renderer = fakeRenderer();
    const costs = [20, 1, 30, 25];
    let frame = 0;
    const gameLoop = {
      loop() {
        jest.advanceTimersByTime(costs[frame]);
        frame += 1;
      },
    };
    const run = profileFrames({ renderer, gameLoop, frames: costs.length, targets: [] });
    costs.forEach(() => gameLoop.loop());
    const summary = await run;

    expect(summary.overBudget).toBe(3);
    expect(summary.longFrames.map((f) => f.workMs)).toEqual([30, 25, 20]);
  });

  it('removes every wrapper and restores renderer state when the run ends', async () => {
    const renderer = fakeRenderer();
    const { gameLoop } = fakeGame(renderer);
    const { loop, update } = gameLoop;
    const { render } = renderer;
    const { step } = Simulation.prototype;
    const { customProgramCacheKey } = THREE.Material.prototype;
    const run = profileFrames({
      renderer,
      gameLoop,
      frames: 2,
      targets: [
        [gameLoop, 'update', 'update'],
        [Simulation.prototype, 'step', 'sim.step'],
      ],
    });
    expect(gameLoop.update).not.toBe(update);
    gameLoop.loop();
    gameLoop.loop();
    await run;

    expect(gameLoop.loop).toBe(loop);
    expect(gameLoop.update).toBe(update);
    expect(renderer.render).toBe(render);
    expect(Simulation.prototype.step).toBe(step);
    expect(THREE.Material.prototype.customProgramCacheKey).toBe(customProgramCacheKey);
    expect(renderer.info.autoReset).toBe(true);
    // An instance that only INHERITED the method gets no own copy left behind
    const sim = new Simulation();
    expect(Object.prototype.hasOwnProperty.call(sim, 'step')).toBe(false);
  });
});
