/**
 * The clap ring: a flat white ring at clap range around the clapper that
 * fades out. Rings are recycled, never freed — freeing a faded ring's
 * material released its shader program, so every clap recompiled it — and a
 * recycled ring must look exactly like a fresh one.
 */
import * as THREE from 'three';
import ClapVisual from 'ui/ClapVisual';
import { CLAP_RANGE, CLAP_VISUAL_FADE_DURATION } from 'core/constants';

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
    expect(ring.material.color.getHex()).toBe(0xffffff);
    expect(ring.material.side).toBe(THREE.DoubleSide);
    expect(ring.material.transparent).toBe(true);
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
