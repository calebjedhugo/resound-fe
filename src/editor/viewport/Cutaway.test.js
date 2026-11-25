/**
 * @jest-environment jsdom
 */

/**
 * The editor's see-inside view (editor/viewport/Cutaway): its three modes,
 * remembered per browser, the cut it works out from the storey, the cursor
 * and the camera (into the shared uniforms the floor and walls read), and
 * the editor scene telling it when the storey or the cursor moves.
 */
import * as THREE from 'three';
import Cutaway, { CUT_LABELS } from 'editor/viewport/Cutaway';
import EditorScene from 'editor/viewport/EditorScene';
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import { CUT_UNIFORMS, clearCut } from 'entities/CutawayLook';
import { gridToWorld } from 'editor/viewport/gridUtils';

const cameraAt = (x, y, z) => ({ position: new THREE.Vector3(x, y, z) });

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  clearCut();
  jest.restoreAllMocks();
});

describe('the view toggle', () => {
  it('opens in the cutaway, and steps full → storey cut → cutaway', () => {
    const cutaway = new Cutaway();
    expect(cutaway.mode).toBe('cutaway');
    expect(cutaway.label).toBe(CUT_LABELS.cutaway);
    expect(cutaway.cycle()).toBe('full');
    expect(cutaway.cycle()).toBe('storey');
    expect(cutaway.cycle()).toBe('cutaway');
  });

  it('is remembered per browser', () => {
    new Cutaway().setMode('storey');
    expect(localStorage.getItem('resound-editor-cut')).toBe('storey');
    expect(new Cutaway().mode).toBe('storey');
  });

  it('ignores what it does not know, in storage or asked for', () => {
    localStorage.setItem('resound-editor-cut', 'sideways');
    const cutaway = new Cutaway();
    expect(cutaway.mode).toBe('cutaway');
    cutaway.setMode('sideways');
    expect(cutaway.mode).toBe('cutaway');
  });

  it('still works when storage is blocked (the default, switchable this visit)', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const cutaway = new Cutaway();
    expect(cutaway.mode).toBe('cutaway');
    cutaway.cycle();
    expect(cutaway.mode).toBe('full');
  });
});

describe('the cut each frame', () => {
  it('points the shared uniforms at the storey, the cursor and the way to the camera', () => {
    const cutaway = new Cutaway();
    const at = gridToWorld(4, -2);
    cutaway.update({ storey: 2, cursor: { x: 4, z: -2 }, camera: cameraAt(at.x, 30, at.z + 20) });
    expect(CUT_UNIFORMS.uCutMode.value).toBe(2);
    expect(CUT_UNIFORMS.uCutStorey.value).toBe(2);
    expect(CUT_UNIFORMS.uCutCentre.value).toEqual([4, -2]);
    expect(CUT_UNIFORMS.uCutView.value[0]).toBeCloseTo(0);
    expect(CUT_UNIFORMS.uCutView.value[1]).toBeCloseTo(1);

    // The orbit turns: the near side turns with it
    cutaway.update({ storey: 2, cursor: { x: 4, z: -2 }, camera: cameraAt(at.x - 20, 30, at.z) });
    expect(CUT_UNIFORMS.uCutView.value[0]).toBeCloseTo(-1);
    expect(CUT_UNIFORMS.uCutView.value[1]).toBeCloseTo(0);
  });

  it('with the camera straight overhead there is no near side', () => {
    const cutaway = new Cutaway();
    const at = gridToWorld(0, 0);
    cutaway.update({ storey: 0, cursor: { x: 0, z: 0 }, camera: cameraAt(at.x, 40, at.z) });
    expect(CUT_UNIFORMS.uCutView.value).toEqual([0, 0]);
  });

  it('answers for entities by the same rule (what picking and the looks use)', () => {
    const cutaway = new Cutaway();
    const at = gridToWorld(2, 2);
    cutaway.update({ storey: 0, cursor: { x: 2, z: 2 }, camera: cameraAt(at.x, 30, at.z + 30) });
    expect(cutaway.ghosts({ type: 'wall', x: 2, y: 0, z: 4 })).toBe(true); // in front
    expect(cutaway.ghosts({ type: 'wall', x: 2, y: 0, z: 0 })).toBe(false); // behind
    expect(cutaway.ghosts({ type: 'creature', x: 2, y: 0, z: 3 })).toBe(false); // inside
    expect(cutaway.ghosts({ type: 'creature', x: 2, y: 1, z: 0 })).toBe(true); // above

    cutaway.setMode('storey');
    cutaway.update({ storey: 0, cursor: { x: 2, z: 2 }, camera: cameraAt(at.x, 30, at.z + 30) });
    expect(cutaway.ghosts({ type: 'wall', x: 2, y: 0, z: 4 })).toBe(false);
    expect(cutaway.ghosts({ type: 'wall', x: 2, y: 1, z: 4 })).toBe(true);

    cutaway.setMode('full');
    cutaway.update({ storey: 0, cursor: { x: 2, z: 2 }, camera: cameraAt(at.x, 30, at.z + 30) });
    expect(CUT_UNIFORMS.uCutMode.value).toBe(0);
    expect(cutaway.ghosts({ type: 'wall', x: 2, y: 1, z: 4 })).toBe(false);
  });

  it('suspended (Play), everything is whole until it resumes', () => {
    const cutaway = new Cutaway();
    const view = { storey: 0, cursor: { x: 0, z: 0 }, camera: cameraAt(30, 30, 30) };
    cutaway.update(view);
    cutaway.suspend();
    expect(CUT_UNIFORMS.uCutMode.value).toBe(0);
    cutaway.update(view);
    expect(CUT_UNIFORMS.uCutMode.value).toBe(0);
    expect(cutaway.ghosts({ type: 'wall', x: 0, y: 3, z: 0 })).toBe(false);

    cutaway.resume();
    cutaway.update(view);
    expect(CUT_UNIFORMS.uCutMode.value).toBe(2);
  });
});

describe('the editor scene says when the storey or the cursor moves', () => {
  let scene;
  let changed;
  beforeEach(() => {
    scene = new EditorScene(new THREE.Scene(), new EditorPuzzleModel());
    changed = jest.fn();
    scene.onViewChange = changed;
  });

  it('a storey change', () => {
    scene.activeElevation = 2;
    expect(changed).toHaveBeenCalledTimes(1);
    scene.activeElevation = 2; // the same storey: nothing moved
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('a cursor step or jump', () => {
    scene.moveCursor(1, 0);
    expect(changed).toHaveBeenCalledTimes(1);
    scene.setCursor({ x: 5, z: -3 });
    expect(changed).toHaveBeenCalledTimes(2);
    scene.setCursor({ x: 5, z: -3 }); // already there
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
