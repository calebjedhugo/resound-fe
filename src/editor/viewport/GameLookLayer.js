/**
 * GameLookLayer — the level drawn in the editor's viewport the way the game
 * draws it (DESIGN.md "Environment look", "Entity look", "Creature look"):
 * the storm-night sky, the merged floor and the instanced walls of
 * entities/EnvironmentLook, dark-glass gates with their staff halo, slate
 * ramps with their crawling chevrons, pale waystones, the dark fountain
 * basin, and every creature as its soap-bubble / ball-lightning look.
 *
 * It builds with the GAME'S OWN builders (Floor, Wall.buildBatch, Ramp,
 * Gate.buildClosedMesh, Fountain's and Waystone's mesh builders, NotationDisplay, CreatureLook, createSky), so the
 * editor cannot drift from the game; it never forks a shader or touches a
 * shared material. Nothing here simulates: no listener, instrument, clock or
 * gameState is involved. A creature lights only while the editor previews
 * its song (noteOn: the song editor's Play, or a quick audition), coloured as
 * in game (core/messiaenColour over its sounding notes, Creature.updateLook's
 * rule), and its light falls on the floor and walls around it (AreaLight).
 *
 * Editor cues layered on top (drawn over the dark look, never part of it):
 * the selection's outline and a violet base on linked gates. The schematic
 * meshes (EntityPlacer) stay in the scene as the pick targets, invisible.
 *
 * Coordinates: the game puts a cell's CENTRE at x * WORLD_SCALE; the editor
 * at x * WORLD_SCALE + WORLD_SCALE / 2. Everything is built in game
 * coordinates under one root group offset by half a cell.
 */
import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT, DEFAULT_CREATURE_SIZE } from 'core/constants';
import { messiaenColourCached, midiOf, registerLuminosity } from 'core/messiaenColour';
import CreatureLook from 'entities/CreatureLook';
import { AreaLight, createSky, lightningLevel, tickEnvironment } from 'entities/EnvironmentLook';
import { bindAreaLight } from 'entities/EntityLook';
import Floor from 'entities/Floor';
import Wall from 'entities/Wall';
import Ramp from 'entities/Ramp';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import Waystone from 'entities/Waystone';
import NotationDisplay from 'ui/NotationDisplay';
import { createOutlineBox, createOutlineMaterial } from 'editor/viewport/outlineBox';
import { GAME_OFFSET } from 'editor/viewport/gridUtils';

// The editor's cues over the dark look
const SELECTION_COLOR = 0x7fe8ff;
const LINK_COLOR = 0xa57bff;
const SPAWN_COLOR = 0xdde6f7;

// The selection outline's box per type (world units: width, height, depth)
const OUTLINE_SIZES = {
  creature: [2.4, 2.8, 2.4],
  gate: [3, 3, 3],
  wall: [3, 2.5, 3],
  ramp: [3, 3, 3],
  waystone: [2.8, 0.25, 2.8],
  fountain: [3, 2.5, 3],
  player: [1.4, 2, 1.4],
};

// An always-open gate shows its shell this faint (in game it has none: the
// editor still has to show the gate is there)
const ALWAYS_OPEN_OPACITY = 0.3;
// A gate's box is a whole cell, this tall (Gate.GEOMETRY)
const GATE_HEIGHT = 3;

/** Free a mesh tree's own geometry/materials (shared ones are skipped). */
function freeTree(object) {
  const free = (resource) => {
    if (resource && !(resource.userData && resource.userData.shared)) resource.dispose();
  };
  const visit = (node) => {
    free(node.geometry);
    (Array.isArray(node.material) ? node.material : [node.material]).forEach(free);
    (node.children || []).forEach(visit);
  };
  visit(object);
}

export default class GameLookLayer {
  /**
   * @param {THREE.Scene} scene - the editor's scene
   */
  constructor(scene) {
    this._scene = scene;
    this.root = new THREE.Group();
    this.root.position.set(GAME_OFFSET, 0, GAME_OFFSET);
    this._scene.add(this.root);

    // The creature light the floor, walls, gates and ramps add up, as one
    // area's (Area.light): refreshed from the creature looks every frame
    this.light = new AreaLight();
    this._lightArea = { light: this.light }; // what a Ramp binds its light from
    this._creatureEntries = []; // [{type:'creature', look}] for AreaLight.update

    this.root.add(createSky());

    this._staticKey = null;
    this._floor = null;
    this._walls = null;
    this._wallMaterial = null;

    // entity id -> { type, sig, object, look?, notation?, notes? }
    this._entities = new Map();
    this._spawn = null;

    this._selectionMaterial = createOutlineMaterial(SELECTION_COLOR);
    this._linkMaterial = createOutlineMaterial(LINK_COLOR, 0.85);
    this._selection = null; // { id, object }

    this._time = 0; // seconds of editor time: the previewed notes' clock
  }

  get visible() {
    return this.root.visible;
  }

  set visible(value) {
    this.root.visible = value;
  }

  /** Whether it moves on its own now (the viewport keeps drawing): while shown. */
  get animates() {
    return this.root.visible;
  }

  /**
   * Whether something on it moves QUICKLY now: lightning, or a creature lit
   * by a previewed song (sounding, or still fading back to the bubble). The
   * rest of its motion — the sky's drift, the bob and wobble, the waystones'
   * breathing — takes seconds, so the viewport draws it at a calmer rate
   * (EditorApp CALM_FRAME_MS) while this is false.
   */
  get lively() {
    if (!this.root.visible) return false;
    if (lightningLevel() > 0 || this.previewing) return true;
    for (const entry of this._entities.values()) {
      if (entry.look && entry.look.glow > 0) return true; // still fading
    }
    return false;
  }

  /**
   * Bring the drawn level in line with the model (every edit, undo, load).
   * Only what changed is built again: the floor and walls when the grid,
   * tiles, walls or ramps change; an entity when its look-relevant data
   * does; a creature keeps its look (and any light) when it only moves.
   * @param {object} model - the UndoManager / EditorPuzzleModel
   */
  sync(model) {
    const metadata = model.getMetadata();
    const entities = model.getEntities();
    this._syncStatic(model.getTiles(), entities);

    const seen = new Set();
    for (const entity of entities) {
      if (entity.type !== 'wall') {
        seen.add(entity.id);
        this._syncEntity(entity, metadata);
      }
    }
    for (const [id, entry] of this._entities) {
      if (!seen.has(id)) this._removeEntity(id, entry);
    }
    this._creatureEntries = [...this._entities.values()]
      .filter((entry) => entry.look)
      .map((entry) => ({ type: 'creature', look: entry.look }));

    this._syncSpawn(model.getPlayerSpawn());
    if (this._selection) this.setSelected(this._selection.id, model);
  }

  /**
   * Advance what moves on its own: the sky's drift and lightning, the
   * creatures' wobble and bob (and any previewed notes), the waystones'
   * breathing, the creature light. Visual only.
   * @param {number} deltaTime - seconds
   */
  update(deltaTime) {
    const dt = Math.max(0, Math.min(deltaTime, 0.1));
    this._time += dt;
    tickEnvironment(dt, null);
    for (const entry of this._entities.values()) {
      if (entry.look) this._updateCreature(entry, dt);
      else if (entry.type === 'waystone') this._breathe(entry, dt);
    }
    this.light.update(this._creatureEntries);
  }

  // ---- Song preview -----------------------------------------------------

  /**
   * A previewed note of a creature began: it lights and flares, coloured by
   * what it sings, for `seconds`.
   * @param {number} entityId
   * @param {string} pitch - e.g. 'E4'
   * @param {number} seconds - how long it sounds
   */
  noteOn(entityId, pitch, seconds) {
    const entry = this._entities.get(entityId);
    if (!entry || !entry.look) return;
    const midi = midiOf(pitch);
    if (midi === null || midi === undefined || Number.isNaN(midi)) return;
    entry.notes.push({ midi, endsAt: this._time + Math.max(0.05, seconds) });
    entry.look.noteOn();
  }

  /** The preview stopped: the creature's notes end now (it fades to a bubble). */
  silence(entityId) {
    const entry = this._entities.get(entityId);
    if (entry && entry.notes) entry.notes.length = 0;
  }

  /** The creature's look (its glow and colour), or null: for the preview and tests. */
  lookOf(entityId) {
    const entry = this._entities.get(entityId);
    return entry && entry.look ? entry.look : null;
  }

  /** Whether any previewed note is sounding now (the viewport keeps drawing). */
  get previewing() {
    for (const entry of this._entities.values()) {
      if (entry.notes && entry.notes.length > 0) return true;
    }
    return false;
  }

  // ---- Selection ---------------------------------------------------------

  /**
   * Outline the selected entity (or the spawn: 'player'), drawn over the
   * world; null clears it.
   * @param {?number|'player'} id
   * @param {object} model
   */
  setSelected(id, model) {
    if (this._selection) {
      this.root.remove(this._selection.object);
      this._selection = null;
    }
    if (id === null || id === undefined) return;
    const target = id === 'player' ? model.getPlayerSpawn() : model.getEntity(id);
    if (!target) return;
    const type = id === 'player' ? 'player' : target.type;
    const [width, height, depth] = OUTLINE_SIZES[type] || [3, 3, 3];
    const object = createOutlineBox({ width, height, depth, material: this._selectionMaterial });
    object.position.set(
      target.x * WORLD_SCALE,
      target.y * ELEVATION_HEIGHT,
      target.z * WORLD_SCALE
    );
    this.root.add(object);
    this._selection = { id, object };
  }

  /**
   * Show or hide the editor's own marks in the look — the selection
   * outline, the linked gates' frames, the spawn's ghost — leaving the level
   * as the game draws it (Play glides into the game's view without them).
   * @param {boolean} visible
   */
  setCuesVisible(visible) {
    if (this._selection) this._selection.object.visible = visible;
    if (this._spawn) this._spawn.visible = visible;
    for (const entry of this._entities.values()) {
      if (entry.badge) entry.badge.visible = visible;
    }
  }

  /** What the selection outline is on (tests, the controller hints). */
  get selectedId() {
    return this._selection ? this._selection.id : null;
  }

  dispose() {
    for (const [id, entry] of this._entities) this._removeEntity(id, entry);
    this._clearStatic();
    if (this._spawn) freeTree(this._spawn);
    this._selectionMaterial.dispose();
    this._linkMaterial.dispose();
    this._scene.remove(this.root);
  }

  // ---- Floor & walls -----------------------------------------------------

  _syncStatic(tiles, entities) {
    const walls = [];
    const ramps = [];
    for (const e of entities) {
      if (e.type === 'wall') walls.push({ x: e.x, y: e.y, z: e.z });
      else if (e.type === 'ramp') {
        ramps.push({ x: e.x, y: e.y, z: e.z, direction: (e.data && e.data.direction) || 'north' });
      }
    }
    const key = JSON.stringify([tiles, walls, ramps]);
    if (key === this._staticKey) return;
    this._staticKey = key;
    this._clearStatic();

    // The whole floor as the game builds it (Floor: the built tiles as
    // slabs, their cliff lines)
    this._floor = new Floor(0, [], { light: this.light, tiles, ramps, walls });
    this.root.add(this._floor.mesh);

    // Every wall as ONE instanced batch (only the walls placed: the level
    // has no perimeter)
    if (walls.length === 0) return;
    const positions = walls.map((w) => ({
      x: w.x * WORLD_SCALE,
      y: w.y * ELEVATION_HEIGHT,
      z: w.z * WORLD_SCALE,
    }));
    this._wallMaterial = Wall.createBatchMaterial(this.light);
    this._walls = Wall.buildBatch(positions, this._wallMaterial);
    this.root.add(this._walls);
  }

  _clearStatic() {
    if (this._floor) {
      this.root.remove(this._floor.mesh);
      this._floor.dispose();
      this._floor = null;
    }
    if (this._walls) {
      this.root.remove(this._walls);
      if (this._walls.dispose) this._walls.dispose();
      this._wallMaterial.dispose(); // flagged shared for Entity.dispose: ours to free
      this._walls = null;
      this._wallMaterial = null;
    }
  }

  // ---- Entities ----------------------------------------------------------

  _syncEntity(entity, metadata) {
    const sig = this._signature(entity, metadata);
    let entry = this._entities.get(entity.id);
    if (entry && (entry.type !== entity.type || entry.sig !== sig)) {
      this._removeEntity(entity.id, entry);
      entry = null;
    }
    if (!entry) {
      entry = this._build(entity, metadata);
      if (!entry) return;
      entry.sig = sig;
      this._entities.set(entity.id, entry);
      this.root.add(entry.object);
    }
    if (entry.look) entry.look.place(this._floorPoint(entity));
  }

  /** What a rebuild depends on, per type (a creature's position isn't in it). */
  // eslint-disable-next-line class-methods-use-this
  _signature(entity, metadata) {
    const data = entity.data || {};
    const at = [entity.x, entity.y, entity.z];
    switch (entity.type) {
      case 'creature':
        return JSON.stringify([data.size || DEFAULT_CREATURE_SIZE]);
      case 'gate':
        return JSON.stringify([
          at,
          data.song,
          Boolean(data.link),
          Boolean(data.alwaysOpen),
          metadata.timeSignature,
          metadata.keySignature,
        ]);
      case 'fountain':
        return JSON.stringify([at, data.song, metadata.timeSignature, metadata.keySignature]);
      default:
        return JSON.stringify(at);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  _floorPoint(entity) {
    return { x: entity.x * WORLD_SCALE, y: entity.y * ELEVATION_HEIGHT, z: entity.z * WORLD_SCALE };
  }

  _build(entity, metadata) {
    const data = entity.data || {};
    const position = this._floorPoint(entity);
    switch (entity.type) {
      case 'creature': {
        const look = new CreatureLook(data.size || DEFAULT_CREATURE_SIZE);
        look.place(position);
        return { type: 'creature', object: look.object, look, notes: [] };
      }
      case 'gate': {
        const mesh = Gate.buildClosedMesh(position);
        bindAreaLight(mesh.material, this.light);
        if (data.alwaysOpen) {
          mesh.material.transparent = true;
          mesh.material.uniforms.uOpacity.value = ALWAYS_OPEN_OPACITY;
        }
        const notation = this._notation(data.song, 'gate', metadata);
        notation.meshes.forEach((plane) => mesh.add(plane));
        const entry = { type: 'gate', object: new THREE.Group(), notation };
        entry.object.add(mesh);
        if (data.link) {
          // A closed linked gate looks like any gate in game: the editor
          // marks it (violet, as the schematic look's badge), framing its
          // top so the mark sits on the box seen from any angle
          entry.badge = createOutlineBox({
            width: 3,
            height: 0,
            depth: 3,
            thickness: 0.14,
            material: this._linkMaterial,
            edges: 'base',
          });
          entry.badge.position.set(position.x, position.y + GATE_HEIGHT, position.z);
          entry.object.add(entry.badge);
        }
        return entry;
      }
      case 'fountain': {
        const mesh = Fountain.buildBasinMesh(position);
        const notation = this._notation(data.song, 'fountain', metadata);
        notation.meshes.forEach((plane) => mesh.add(plane));
        return { type: 'fountain', object: mesh, notation };
      }
      case 'ramp': {
        const ramp = new Ramp(position, { direction: data.direction || 'north' });
        ramp.area = this._lightArea; // lit by the editor's creature light
        return { type: 'ramp', object: ramp.mesh };
      }
      case 'waystone': {
        const mesh = Waystone.buildTileMesh(position);
        return { type: 'waystone', object: mesh, pulse: Math.random() };
      }
      default:
        return null;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  _notation(song, entityType, metadata) {
    return new NotationDisplay({
      song: song || [],
      entityType,
      timeSignature: metadata.timeSignature !== undefined ? metadata.timeSignature : [4, 4],
      keySignature: metadata.keySignature || null,
    });
  }

  _removeEntity(id, entry) {
    this.root.remove(entry.object);
    if (entry.notation) entry.notation.dispose();
    if (entry.look) entry.look.dispose();
    else freeTree(entry.object);
    this._entities.delete(id);
  }

  _syncSpawn(spawn) {
    const key = spawn ? `${spawn.x},${spawn.y},${spawn.z}` : null;
    if (key === this._spawnKey) return;
    this._spawnKey = key;
    if (this._spawn) {
      this.root.remove(this._spawn);
      freeTree(this._spawn);
      this._spawn = null;
    }
    if (!spawn) return;
    // Where the player stands at the start: a pale ghost of their height
    // and a ring at their feet (no hue: the world's colours are the
    // creatures')
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.8, 20),
      new THREE.MeshBasicMaterial({ color: SPAWN_COLOR, transparent: true, opacity: 0.45 })
    );
    body.position.set(0, 0.9, 0);
    group.add(body);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 40),
      new THREE.MeshBasicMaterial({
        color: SPAWN_COLOR,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.03, 0);
    group.add(ring);
    group.position.set(spawn.x * WORLD_SCALE, spawn.y * ELEVATION_HEIGHT, spawn.z * WORLD_SCALE);
    this.root.add(group);
    this._spawn = group;
  }

  // ---- Per frame ----------------------------------------------------------

  /**
   * Creature.updateLook's rule over the previewed notes: lit while any
   * sounds, coloured by the chord of them (a lone note pearl, as in game),
   * its register's lightness.
   */
  _updateCreature(entry, dt) {
    const { notes, look } = entry;
    let kept = 0;
    for (let i = 0; i < notes.length; i += 1) {
      if (this._time < notes[i].endsAt) {
        notes[kept] = notes[i];
        kept += 1;
      }
    }
    notes.length = kept;
    if (kept === 0) {
      look.update(dt, false, null, null);
      return;
    }
    const chord = notes.map((n) => n.midi);
    look.update(dt, true, messiaenColourCached(chord), registerLuminosity(chord));
  }

  /** A waystone's breathing ring (Waystone's resting pulse; never gold here). */
  // eslint-disable-next-line class-methods-use-this
  _breathe(entry, dt) {
    const { PULSE_MIN, PULSE_MAX, PULSE_PERIOD_S } = Waystone;
    // eslint-disable-next-line no-param-reassign
    entry.pulse = (entry.pulse + dt / PULSE_PERIOD_S) % 1;
    const breathe =
      PULSE_MIN + (PULSE_MAX - PULSE_MIN) * (0.5 - 0.5 * Math.cos(entry.pulse * Math.PI * 2));
    // eslint-disable-next-line no-param-reassign
    entry.object.material.emissiveIntensity = breathe;
  }
}
