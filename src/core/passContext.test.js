/**
 * The pass context every scene draw shares (core/passContext). three keys a
 * material's shader program by the clip-plane COUNT and the output colour
 * space of the pass; a material drawn under two contexts re-derives its
 * program at every switch between them. So the main view binds no-op planes,
 * every render target that draws world scenes renders in the canvas's colour
 * space, and a material showing such a target never encodes its texels twice.
 * (ShaderPrewarm.test drives the main view + real door passes + the prewarm
 * and asserts ONE context across all of them; DeployManager.test does the
 * waystone-gate pad passes.)
 */
import * as THREE from 'three';
import PortalManager from 'core/PortalManager';
import { WORLD_SCALE } from 'core/constants';
import { CLIP_PLANE_COUNT, renderMainView } from 'core/passContext';

const OUTPUT_ENCODE = '#include <encodings_fragment>';

describe('The main view', () => {
  it('binds CLIP_PLANE_COUNT planes that clip nothing anywhere in the world, then restores', () => {
    const before = [];
    const renderer = {
      clippingPlanes: before,
      render() {
        this.bound = this.clippingPlanes;
      },
    };

    renderMainView(renderer, new THREE.Scene(), {});

    expect(renderer.bound).toHaveLength(CLIP_PLANE_COUNT);
    // three discards a fragment where normal·p + constant < 0: far beyond
    // every corner of any level, above and below, nothing is discarded
    for (const plane of renderer.bound) {
      for (const x of [-1000, 1000]) {
        for (const y of [-1000, 1000]) {
          for (const z of [-1000, 1000]) {
            const { normal, constant } = plane;
            expect(normal.x * x + normal.y * y + normal.z * z + constant).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(renderer.clippingPlanes).toBe(before);
  });
});

describe('Door passes render in the canvas colour space', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, statusText: 'Not Found' }));
    ctx.loadPuzzle('portal-two-pairs');
    for (const gate of ctx.getGates()) gate.open();
  });

  afterEach(() => {
    PortalManager.reset();
    delete global.fetch;
  });

  /** Drive real door passes; collect every target drawn into. */
  function drawnTargets() {
    const targets = new Set();
    let target = null;
    const renderer = {
      clippingPlanes: [],
      setRenderTarget(next) {
        target = next;
      },
      render() {
        targets.add(target);
      },
      getDrawingBufferSize: (size) => size.set(800, 600),
    };
    for (const x of [5 * WORLD_SCALE, 5 * WORLD_SCALE + 3.1]) {
      PortalManager.renderPortals(renderer, { position: { x, y: 1.8, z: 7 * WORLD_SCALE } });
      PortalManager.renderPortals(renderer, { position: { x, y: 1.8, z: 7 * WORLD_SCALE } });
    }
    return [...targets];
  }

  const doorwaySurfaces = () =>
    ctx.getGates().flatMap((gate) => gate.mesh.children.filter((child) => child._isPortalSurface));

  it('every target a door pass draws into stores canvas-space colour (sRGB-keyed, plain RGBA8)', () => {
    const targets = drawnTargets();

    expect(targets.length).toBeGreaterThan(1);
    for (const target of targets) {
      // three 0.153 outputs in texture.colorSpace only for a target flagged
      // isXRRenderTarget; RGBA8 so the hardware never encodes a second time
      expect(target.isXRRenderTarget).toBe(true);
      expect(target.texture.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(target.texture.internalFormat).toBe('RGBA8');
    }
  });

  it('every doorway surface shows the stored texels without encoding them again', () => {
    drawnTargets(); // materialize every face of every door
    const surfaces = doorwaySurfaces();
    expect(surfaces.length).toBeGreaterThan(0);

    for (const { material } of surfaces) {
      const shader = { fragmentShader: `void main() {\n  ${OUTPUT_ENCODE}\n}` };
      material.onBeforeCompile(shader);
      expect(shader.fragmentShader).not.toContain(OUTPUT_ENCODE);
    }
    // ONE shared hook: three's program cache key is the hook's source, so
    // every doorway surface keeps compiling to the same program
    expect(new Set(surfaces.map(({ material }) => material.onBeforeCompile)).size).toBe(1);
  });
});
