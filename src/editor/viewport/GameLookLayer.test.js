/**
 * The editor's game look: the level drawn with the game's own looks (the
 * shared three mock stands in for WebGL). Built from the editor's real model
 * and undo manager; what it draws is read from the scene graph.
 */
import * as THREE from 'three';
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import GameLookLayer from 'editor/viewport/GameLookLayer';
import Wall from 'entities/Wall';
import { RAMP_MATERIAL } from 'entities/EntityLook';
import { messiaenColour } from 'core/messiaenColour';

const E_WHOLE = [{ pitch: 'E4', length: '1/1' }];
const G_HALF = [{ pitch: 'G4', length: '1/2' }];

let undo;
let scene;
let layer;

/** Everything under the layer's root, depth first. */
function drawn() {
  const out = [];
  const visit = (node) => {
    out.push(node);
    (node.children || []).forEach(visit);
  };
  visit(layer.root);
  return out;
}

const wallBatches = () => drawn().filter((n) => n.isInstancedMesh);

beforeEach(() => {
  const model = new EditorPuzzleModel();
  model.setMetadata({ gridSize: 6, tempo: 120 });
  undo = new UndoManager(model);
  scene = new THREE.Scene();
  layer = new GameLookLayer(scene);
});

afterEach(() => layer.dispose());

describe('Drawing the level as the game does', () => {
  it('draws every wall, the perimeter ring included, as ONE batch with the game wall material', () => {
    undo.addEntity('wall', 2, 0, 2, {});
    undo.addEntity('wall', 3, 0, 2, {});
    layer.sync(undo);

    const batches = wallBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0].geometry).toBe(Wall.GEOMETRY);
    expect(batches[0].count).toBe(Wall.perimeterPositions(6).length + 2);
  });

  it('builds one creature look per creature, floating over its cell in game coordinates', () => {
    const id = undo.addEntity('creature', 2, 0, 4, { song: E_WHOLE, interval: 8 });
    layer.sync(undo);

    const look = layer.lookOf(id);
    expect(look).not.toBeNull();
    // Game cell centres sit at x * 3; the root shifts them onto the editor's
    expect(look.object.position.x).toBe(6);
    expect(look.object.position.z).toBe(12);
    expect(layer.root.position).toMatchObject({ x: 1.5, z: 1.5 });
  });

  it('keeps a creature look (and its light) when the creature only moves', () => {
    const id = undo.addEntity('creature', 2, 0, 4, { song: E_WHOLE });
    layer.sync(undo);
    const look = layer.lookOf(id);

    undo.updateEntity(id, { x: 3 });
    layer.sync(undo);

    expect(layer.lookOf(id)).toBe(look);
    expect(look.object.position.x).toBe(9);
  });

  it("puts a gate's staff on its dark glass, and engraves it again when its song changes", () => {
    const id = undo.addEntity('gate', 1, 0, 1, { song: E_WHOLE, gateId: 'gate-1' });
    layer.sync(undo);
    const planes = () => drawn().filter((n) => n._isNotationMesh);
    const first = planes();
    expect(first.length).toBeGreaterThan(0);

    undo.updateEntity(id, { data: { ...undo.getEntity(id).data, song: G_HALF } });
    layer.sync(undo);

    expect(planes()).toHaveLength(first.length);
    expect(planes()[0]).not.toBe(first[0]);
  });

  it('draws ramps with the shared ramp look and drops what the model deletes', () => {
    const ramp = undo.addEntity('ramp', 2, 0, 2, { direction: 'east' });
    layer.sync(undo);
    expect(drawn().some((n) => n.material === RAMP_MATERIAL)).toBe(true);

    undo.removeEntity(ramp);
    layer.sync(undo);
    expect(drawn().some((n) => n.material === RAMP_MATERIAL)).toBe(false);
  });

  it('hides with the root (the schematic look)', () => {
    layer.visible = false;
    expect(layer.root.visible).toBe(false);
    expect(layer.animates).toBe(false);
  });
});

describe('A previewed song lights its creature, note by note', () => {
  let id;
  beforeEach(() => {
    id = undo.addEntity('creature', 2, 0, 2, { song: E_WHOLE });
    layer.sync(undo);
  });

  it('is a silent bubble until a note of it sounds', () => {
    layer.update(0.016);
    expect(layer.lookOf(id).glow).toBe(0);
  });

  it('lights in the colour the game gives that harmony while the note sounds', () => {
    layer.noteOn(id, 'E4', 2);
    layer.update(0.016);

    const look = layer.lookOf(id);
    expect(look.glow).toBeGreaterThan(0.5);
    expect(look.harmonyColour.main).toBe(messiaenColour({ ownNotes: [64] }).main);
    expect(layer.light.count).toBe(1); // ...and lights the floor around it
  });

  it('fades back to the bubble once the note has ended', () => {
    layer.noteOn(id, 'E4', 0.5);
    for (let t = 0; t < 3; t += 0.05) layer.update(0.05);
    expect(layer.lookOf(id).glow).toBe(0);
  });

  it('goes dark at once when the preview is stopped', () => {
    layer.noteOn(id, 'E4', 10);
    layer.update(0.016);
    layer.silence(id);
    for (let t = 0; t < 2; t += 0.05) layer.update(0.05);
    expect(layer.lookOf(id).glow).toBe(0);
    expect(layer.previewing).toBe(false);
  });
});

describe('Editor cues over the dark look', () => {
  it('outlines the selected entity and moves the outline with it', () => {
    const id = undo.addEntity('wall', 1, 0, 1, {});
    layer.sync(undo);
    layer.setSelected(id, undo);
    expect(layer.selectedId).toBe(id);

    undo.updateEntity(id, { x: 4 });
    layer.sync(undo);
    const outline = layer.root.children.find((c) => c !== layer.lookOf(id) && c.position.x === 12);
    expect(outline).toBeDefined();

    layer.setSelected(null, undo);
    expect(layer.selectedId).toBeNull();
  });

  it("Play hides the editor's marks (selection, linked-gate frame, spawn ghost), leaving the level as the game draws it", () => {
    const gate = undo.addEntity('gate', 2, 0, 2, {
      song: [],
      link: { puzzleId: 'b', gateId: 'gate-1' },
    });
    undo.setPlayerSpawn(1, 0, 1);
    layer.sync(undo);
    layer.setSelected(gate, undo);
    const before = drawn().filter((n) => n.visible !== false).length;

    layer.setCuesVisible(false);
    const hidden = drawn().filter((n) => n.visible === false);
    // the outline, the link frame and the spawn ghost: three marks, each one group
    expect(hidden).toHaveLength(3);
    expect(wallBatches()[0].visible).not.toBe(false);

    layer.setCuesVisible(true);
    expect(drawn().filter((n) => n.visible !== false)).toHaveLength(before);
  });
});
