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
import { lightningLevel } from 'entities/EnvironmentLook';
import { messiaenColour } from 'core/messiaenColour';
import { cellsOfRects } from 'core/floorTiles';

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
  model.setMetadata({ tempo: 120 });
  // A built 6x6 room (cells 0..5) at the ground storey
  model.addTiles(cellsOfRects([{ elevation: 0, x1: 0, z1: 0, x2: 5, z2: 5 }]));
  undo = new UndoManager(model);
  scene = new THREE.Scene();
  layer = new GameLookLayer(scene);
});

afterEach(() => layer.dispose());

describe('Drawing the level as the game does', () => {
  it('draws every wall placed (there is no perimeter) as ONE batch with the game wall material', () => {
    undo.addEntity('wall', 2, 0, 2, {});
    undo.addEntity('wall', 3, 0, 2, {});
    layer.sync(undo);

    const batches = wallBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0].geometry).toBe(Wall.GEOMETRY);
    expect(batches[0].count).toBe(2);
  });

  it('draws the floor only where it is built, and again when a tile comes or goes', () => {
    const floorMesh = () => drawn().find((n) => n.geometry && n.geometry.attributes?.aEdge);
    layer.sync(undo);
    const first = floorMesh();
    expect(first.visible).toBe(true);
    // 36 tiles: a top and a bottom each, side faces only round the room's edge
    const triangles = first.geometry.attributes.position.array.length / 9;
    expect(triangles).toBe(36 * 4 + 24 * 2 + 24 * 4);

    undo.removeTile(0, 0, 0);
    layer.sync(undo);
    expect(floorMesh()).not.toBe(first);

    // Nothing built: nothing drawn, no walls either
    const empty = new UndoManager(new EditorPuzzleModel());
    layer.sync(empty);
    expect(floorMesh().visible).toBe(false);
    expect(wallBatches()).toHaveLength(0);
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

  it('is lively exactly while lightning flashes (else only slow drifts move)', () => {
    layer.sync(undo);
    let flashes = 0;
    // A strike comes every 9-22 s
    for (let t = 0; t < 45; t += 0.05) {
      layer.update(0.05);
      expect(layer.lively).toBe(lightningLevel() > 0);
      if (layer.lively) flashes += 1;
    }
    expect(flashes).toBeGreaterThan(0);
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

  it('is lively (drawn every frame) while a note sounds and while it fades, then calm', () => {
    // The storm's lightning strikes at random and is lively too: compare
    // against it, so a strike landing mid-test can't fail it
    layer.update(0.016);
    expect(layer.lively).toBe(lightningLevel() > 0); // a silent bubble: only slow drifts move

    layer.noteOn(id, 'E4', 0.5);
    expect(layer.lively).toBe(true);
    for (let t = 0; t < 0.6; t += 0.05) layer.update(0.05);
    expect(layer.previewing).toBe(false); // the note is over...
    expect(layer.lively).toBe(true); // ...but the light is still fading

    for (let t = 0; t < 3; t += 0.05) layer.update(0.05);
    expect(layer.lively).toBe(lightningLevel() > 0);
  });

  it('is never lively while hidden (the schematic look draws on demand)', () => {
    layer.noteOn(id, 'E4', 2);
    layer.visible = false;
    expect(layer.lively).toBe(false);
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
    undo.addEntity('wall', 3, 0, 2, {});
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
