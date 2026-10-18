/**
 * The clap ring: a flat white ring at clap range around the clapper that
 * fades out. Rings are recycled, never freed — freeing a faded ring's
 * material released its shader program, so every clap recompiled it — and a
 * recycled ring must look exactly like a fresh one.
 */
import * as THREE from 'three';
import ClapVisual from 'ui/ClapVisual';
import { CLAP_RANGE, CLAP_VISUAL_FADE_DURATION } from 'core/constants';
import { createGLStub } from '../__tests__/helpers/glStub';

const FADE_MS = CLAP_VISUAL_FADE_DURATION * 1000;

describe('Clap ring', () => {
  let scene;
  let visual;
  // Time passes on the fake clock (performance.now follows it); the game
  // loop updates the visual every frame
  const elapse = (ms) => {
    jest.advanceTimersByTime(ms);
    visual.update();
  };

  beforeEach(() => {
    scene = new THREE.Scene();
    visual = new ClapVisual(scene);
  });

  /** The ring a clap just put in the scene, checked against the fresh look. */
  function expectFreshRingAt(position) {
    expect(scene.children).toHaveLength(1);
    const [ring] = scene.children;
    expect(ring.position).toEqual(new THREE.Vector3(position.x, 0.1, position.z));
    expect(ring.rotation.x).toBe(-Math.PI / 2); // lying flat
    expect(ring.geometry.parameters).toEqual({
      innerRadius: CLAP_RANGE * 0.9,
      outerRadius: CLAP_RANGE,
      thetaSegments: 64,
    });
    expect(ring.scale).toEqual(new THREE.Vector3(1, 1, 1)); // its geometry's size
    expect(ring.material.color.getHex()).toBe(0xffffff);
    expect(ring.material.side).toBe(THREE.DoubleSide);
    expect(ring.material.forceSinglePass).toBe(true); // both sides, one pass
    expect(ring.material.transparent).toBe(true);
    expect(ring.material.depthWrite).toBe(true);
    expect(ring.material.blending).toBe(THREE.NormalBlending);
    expect(ring.material.opacity).toBe(0.6);
    return ring;
  }

  it('lies flat at clap range around the clapper and fades out over the fade duration', () => {
    visual.show({ x: 3, y: 1.8, z: 4 }, CLAP_RANGE);
    const ring = expectFreshRingAt({ x: 3, z: 4 });

    elapse(FADE_MS / 2);
    expect(ring.material.opacity).toBeCloseTo(0.3);

    elapse(FADE_MS / 2);
    expect(scene.children).toHaveLength(0);
  });

  it('every clap reuses the faded ring, freeing nothing, and looks exactly like the first', () => {
    visual.show({ x: 3, y: 1.8, z: 4 }, CLAP_RANGE);
    const first = scene.children[0];
    first.geometry.dispose = jest.fn();
    first.material.dispose = jest.fn();
    elapse(FADE_MS);

    visual.show({ x: -6, y: 1.8, z: 9 }, CLAP_RANGE);

    const second = expectFreshRingAt({ x: -6, z: 9 });
    expect(second.geometry).toBe(first.geometry);
    expect(second.material).toBe(first.material);
    expect(first.geometry.dispose).not.toHaveBeenCalled();
    expect(first.material.dispose).not.toHaveBeenCalled();
  });

  it('overlapping claps fade independently', () => {
    visual.show({ x: 0, y: 1.8, z: 0 }, CLAP_RANGE);
    elapse(FADE_MS / 2);
    visual.show({ x: 0, y: 1.8, z: 0 }, CLAP_RANGE);

    const [older, newer] = scene.children;
    expect(older.material).not.toBe(newer.material);
    expect(older.geometry).toBe(newer.geometry);
    expect(older.material.opacity).toBeCloseTo(0.3);
    expect(newer.material.opacity).toBe(0.6);

    elapse(FADE_MS / 2);
    expect(scene.children).toEqual([newer]);
  });

  it('clear() takes every ring away at once (exit to menu)', () => {
    visual.show({ x: 0, y: 1.8, z: 0 }, CLAP_RANGE);
    visual.show({ x: 3, y: 1.8, z: 0 }, CLAP_RANGE);

    visual.clear();

    expect(scene.children).toHaveLength(0);
    elapse(FADE_MS);
    expect(scene.children).toHaveLength(0);
  });
});

/**
 * The ring as three 0.153 draws it: its real WebGLRenderer, over a stub GL.
 * A transparent double-sided material is two passes there (renderObject:
 * back faces, then front, flagging the material for a new program before
 * each); the ring's is one, which draws the same picture because the ring
 * is flat.
 */
describe('Clap ring, as three draws it', () => {
  let REAL; // the real three (the tests above run on the mock)
  let RealClapVisual;

  beforeAll(() => {
    delete window.__THREE__; // three warns about a second copy
    jest.isolateModules(() => {
      jest.doMock('three', () => jest.requireActual('three/src/Three.js'));
      /* eslint-disable global-require */
      REAL = require('three');
      RealClapVisual = require('ui/ClapVisual').default;
      /* eslint-enable global-require */
    });
  });

  // Eyes all round a ring at (3, 0.1, 4): the player's, from high above,
  // low and far, from below (a door's mapped eye can be anywhere) and
  // nearly edge-on
  const EYES = [
    [3, 1.8, 14],
    [3, 20, 4.5],
    [-10, 0.5, 4],
    [3, -5, 10],
    [12, 0.11, 4],
  ];

  function showRing() {
    const scene = new REAL.Scene();
    new RealClapVisual(scene).show({ x: 3, y: 1.8, z: 4 }, CLAP_RANGE);
    scene.updateMatrixWorld();
    return { scene, ring: scene.children[0] };
  }

  it("is flat, every triangle facing up: from any eye one side's pass would draw none of it", () => {
    const { ring } = showRing();
    const position = ring.geometry.getAttribute('position');
    const index = ring.geometry.getIndex();
    const corner = (i) =>
      new REAL.Vector3()
        .fromBufferAttribute(position, index.getX(i))
        .applyMatrix4(ring.matrixWorld);
    const up = new REAL.Vector3(0, 1, 0);
    let offPlane = 0; // the furthest any corner is from the ring's plane
    let offUp = 0; // the furthest any triangle's facing is from straight up
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [corner(i), corner(i + 1), corner(i + 2)];
      offPlane = Math.max(offPlane, ...[a, b, c].map((p) => Math.abs(p.y - 0.1)));
      const facing = new REAL.Vector3().subVectors(b, a).cross(new REAL.Vector3().subVectors(c, a));
      offUp = Math.max(offUp, facing.normalize().distanceTo(up));
    }

    expect(index.count).toBe(64 * 2 * 3); // two triangles a segment
    expect(offPlane).toBeLessThan(1e-9);
    expect(offUp).toBeLessThan(1e-9);
  });

  it('draws once a pass, both sides at once, and derives its program only the first time', () => {
    const { scene, ring } = showRing();
    const { canvas, gl } = createGLStub(64, 64);
    const renderer = new REAL.WebGLRenderer({ canvas, context: gl });
    renderer.debug.checkShaderErrors = false;
    const camera = new REAL.PerspectiveCamera(75, 1, 0.1, 500);
    const drawnSides = []; // the side each of this pass's draws is drawn with
    const setMaterial = renderer.state.setMaterial.bind(renderer.state);
    jest.spyOn(renderer.state, 'setMaterial').mockImplementation((material, ...rest) => {
      drawnSides.push(material.side);
      return setMaterial(material, ...rest);
    });
    const derivations = jest.spyOn(ring.material, 'customProgramCacheKey');

    const passes = EYES.map((eye) => {
      camera.position.set(...eye);
      camera.lookAt(3, 0.1, 4);
      drawnSides.length = 0;
      derivations.mockClear();
      renderer.render(scene, camera);
      return { sides: [...drawnSides], derivations: derivations.mock.calls.length };
    });

    expect(passes).toEqual(
      EYES.map((eye, i) => ({ sides: [REAL.DoubleSide], derivations: i === 0 ? 1 : 0 }))
    );
  });
});
