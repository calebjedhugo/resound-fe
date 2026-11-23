/**
 * AbsorbManager — the pole (ruled 2026-11-23, replacing recording and tape
 * playback; DESIGN.md "The inventory holds CREATURES").
 *
 *  - R ABSORBS: the nearest absorbable creature (active area, within its
 *    absorbRange — the old recording rule) goes into the cursor slot, or,
 *    with a creature already there, into a new slot at the end of the strip
 *    (core/Tape.slotForAbsorb). Nothing in reach, or a full strip: the grey
 *    slot flash, nothing happens.
 *  - Space RELEASES the cursor slot's creature RELEASE_DISTANCE ahead along
 *    the effective camera heading, on walkable floor of the player's own
 *    layer where its body fits (releaseSpot). An empty slot or no such spot:
 *    the grey flash. The slot is empty after.
 * One pole action at a time: R and Space during one are ignored.
 *
 * The look (entities/PoleLook, entities/CreatureLook's suck): an absorb
 * EXTENDS the pole until its tip touches the creature's near surface (the
 * side facing the player), DRAWS the creature into the tip — deformed toward
 * it, near side first, far side last, never just shrunk — FLARES the tip in
 * the creature's colour and RETRACTS. A release is the same in reverse:
 * extend to the spot, flare, the creature pours out of the tip and reforms,
 * retract, and only then does it come alive.
 *
 * Gameplay commits at fixed moments: the creature is HELD (silent, still:
 * Creature.hold) and lands in its slot the moment the tip connects, and its
 * body leaves its area once drawn in; a released creature is in its area
 * (dormant: Creature data.dormant) from the moment the pole sets out, and
 * wakes when the pole is back. Every creature moved is remembered per
 * puzzle (core/WorldMemory), so a pruned area rebuilds without
 * duplicating or losing one.
 */
import gameState from 'core/GameState';
import AudioPrewarm from 'core/AudioPrewarm';
import CameraController from 'core/CameraController';
import CollisionDetector from 'core/CollisionDetector';
import WorldMemory from 'core/WorldMemory';
import HintMemory from 'core/HintMemory';
import Tape from 'core/Tape';
import { lineOfSight } from 'core/poleReach';
import { messiaenColourCached, midiOf } from 'core/messiaenColour';
import {
  CREATURE_HOVER_HEIGHT,
  DEFAULT_CREATURE_SIZE,
  ELEVATION_HEIGHT,
  RELEASE_DISTANCE,
  RELEASE_LATE_GRACE_BEATS,
  WORLD_SCALE,
} from 'core/constants';
import Creature from 'entities/Creature';
import { harmonyLightInto } from 'entities/CreatureLook';
import PoleLook from 'entities/PoleLook';
import flashSlot from 'ui/slotFlash';

// The timeline, in seconds (scaled by the dev slow-motion factor)
export const POLE_TIMES = Object.freeze({
  extend: 0.25, // the pole reaches the creature (or the spot)
  draw: 0.5, // the creature is drawn in (or pours out)
  flare: 0.12, // the tip flares in the creature's colour
  retract: 0.25, // back into the hand
});

// A release's reach-out, flare and pour (extend + flare + draw) fit into
// the time left before the beat it sings on, finishing this long before it
// (a frame's margin) — but never quicker than RELEASE_MIN_EMERGE_S: past
// that the creature starts singing while it still pours out
const RELEASE_EMERGE_MARGIN_S = 0.03;
export const RELEASE_MIN_EMERGE_S = 0.25;
const RELEASE_EMERGE_S = POLE_TIMES.extend + POLE_TIMES.flare + POLE_TIMES.draw;

/**
 * The beat a Space pressed at `beat` releases on: the beat just past, within
 * RELEASE_LATE_GRACE_BEATS of it (it sounds at once, as the tape's playback
 * started), else the next one. (A press exactly on a beat is that beat.)
 * @param {number} beat
 * @returns {number}
 */
export function releaseBeatFor(beat) {
  const last = Math.floor(beat + 1e-9);
  return beat - last < RELEASE_LATE_GRACE_BEATS ? last : last + 1;
}

// The tip rests this far out from the body's surface (a fraction of its
// radius): touching it, never inside it
const CONTACT_GAP = 0.04;

// Where the tip comes at a creature from, past the eye (world units): this
// far to the view's right and down, toward the hand holding the pole
const CONTACT_FROM = Object.freeze({ right: 2.2, down: 1.5 });

const ease = (k) => {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
};

const srgbOf = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const cssOf = ([r, g, b]) =>
  `rgb(${[r, g, b].map((c) => Math.round(255 * Math.min(1, Math.max(0, srgbOf(c))))).join(', ')})`;

let nextSlotId = 1;

class AbsorbManager {
  constructor() {
    this.pole = null; // entities/PoleLook, once initialize() gives it the world's lights
    this._action = null; // the pole action under way, or null
    this._slowmo = 1;
    this._spot = { x: 0, y: 0, z: 0, valid: false, level: 0 };
    this._tip = { x: 0, y: 0, z: 0 };
    this._releaseCentre = { x: 0, y: 0, z: 0 };
    this._colour = [1, 1, 1];
  }

  /**
   * Build the pole, its scene lit like `mainScene` (main.js).
   * @param {THREE.Scene} [mainScene]
   */
  initialize(mainScene = null) {
    const lights = mainScene ? mainScene.children.filter((child) => child.isLight) : [];
    this.pole = new PoleLook(lights);
  }

  /** Is a pole action under way? (R and Space are ignored while one is.) */
  get busy() {
    return this._action !== null;
  }

  /** The action under way: 'absorb', 'release' or null. */
  get kind() {
    return this._action ? this._action.kind : null;
  }

  /**
   * Dev only: run the pole's animations `factor` times slower (1 = normal),
   * so frames mid-animation can be inspected.
   */
  setSlowmo(factor = 1) {
    this._slowmo = Math.max(1e-3, factor);
    return this._slowmo;
  }

  /**
   * The creature R would absorb now, or null: of those in the pole's reach
   * (in range, in front, in sight: core/poleReach — the very list the ×N
   * reach mark counts), the best centred and nearest (`reachScore`).
   */
  target() {
    let best = null;
    for (const creature of gameState.absorb.inRange) {
      if (!creature.held && (!best || creature.reachScore < best.reachScore)) best = creature;
    }
    return best;
  }

  /** R: absorb the nearest absorbable creature (see the header). */
  absorb() {
    if (this.busy) return false;
    const creature = this.target();
    if (!creature || !Tape.hasRoom()) {
      flashSlot('silent');
      return false;
    }
    this._action = { kind: 'absorb', phase: 'extend', t: 0, creature, connected: false };
    this._contactOn(creature, this._tip);
    this._showPole(0, 0);
    return true;
  }

  /** Space: release the cursor slot's creature ahead (see the header). */
  release() {
    if (this.busy) return false;
    const { inventory, activeSlot } = gameState.player;
    const held = inventory[activeSlot];
    const area = gameState.activeArea;
    const spot = held && area ? this.releaseSpot(held.spec.size) : null;
    if (!spot || !spot.valid) {
      flashSlot('silent');
      return false;
    }
    // Its first note sounds on the beat of the press (the late grace) or
    // the next, and its schedule starts again from that beat
    const clock = gameState.musicalClock;
    const now = clock ? clock.getCurrentBeat() : 0;
    const firstSingBeat = releaseBeatFor(now);
    // Out of the slot and into the world, dormant (all of it still in the
    // tip, out of reach and still) until the pole is back — singing from
    // that beat whatever the pole is doing
    const creature = new Creature(
      { x: spot.x, y: spot.y, z: spot.z },
      { ...held.spec, dormant: true, firstSingBeat }
    );
    area.entityManager.add(creature);
    // Its voice and first song built NOW, so the beat it sings on builds
    // nothing (a fresh instrument has no voice yet; core/AudioPrewarm)
    AudioPrewarm.prepareNow(creature.instrument, creature.song);
    WorldMemory.release(creature, area.id);
    inventory[activeSlot] = null;
    for (let i = 0; i < 3; i += 1) this._colour[i] = held.colour[i];
    this._contactOn(creature, this._tip);
    creature.look.setSuck(1, this._tip);
    // ...and the pole out, the flare and the pour fit before that beat
    const untilBeat = clock ? clock.beatsToMs(Math.max(0, firstSingBeat - now)) / 1000 : 0;
    const fit = Math.max(RELEASE_MIN_EMERGE_S, untilBeat - RELEASE_EMERGE_MARGIN_S);
    const scale = Math.min(1, fit / RELEASE_EMERGE_S);
    this._action = { kind: 'release', phase: 'extend', t: 0, creature, scale };
    this._showPole(0, 0);
    return true;
  }

  /**
   * Advance the pole action under way (main.js, after the areas update).
   * @param {number} deltaTime - seconds
   */
  update(deltaTime) {
    const action = this._action;
    if (!action) return;
    action.t += Math.max(0, deltaTime) / this._slowmo;
    if (action.kind === 'absorb') this._advanceAbsorb(action);
    else this._advanceRelease(action);
  }

  _advanceAbsorb(action) {
    const { creature } = action;
    const { extend, draw, flare, retract } = POLE_TIMES;
    if (action.phase === 'extend') {
      // It may still drift until the tip connects: follow it
      this._contactOn(creature, this._tip);
      this._showPole(ease(action.t / extend), 0);
      if (action.t < extend) return;
      if (!this._connect(action)) {
        this._next(action, 'retract');
        return;
      }
      this._next(action, 'draw');
    }
    if (action.phase === 'draw') {
      creature.look.setSuck(ease(action.t / draw), this._tip);
      this._showPole(1, 0);
      if (action.t < draw) return;
      // All of it is in the tip: its body leaves the world
      if (creature.area && creature.area.entityManager.get(creature.id)) {
        creature.area.entityManager.remove(creature.id);
      }
      this._next(action, 'flare');
    }
    if (action.phase === 'flare') {
      this._showPole(1, 1);
      if (action.t < flare) return;
      this._next(action, 'retract');
    }
    if (action.phase === 'retract') {
      const k = action.t / retract;
      this._showPole(1 - ease(k), action.connected ? 1 - k : 0);
      if (action.t < retract) return;
      this._finish();
    }
  }

  _advanceRelease(action) {
    const { creature, scale } = action;
    const { retract } = POLE_TIMES;
    const extend = POLE_TIMES.extend * scale;
    const flare = POLE_TIMES.flare * scale;
    const draw = POLE_TIMES.draw * scale;
    if (action.phase === 'extend') {
      this._showPole(ease(action.t / extend), 0);
      if (action.t < extend) return;
      this._next(action, 'flare');
    }
    if (action.phase === 'flare') {
      this._showPole(1, Math.min(1, action.t / flare));
      if (action.t < flare) return;
      this._next(action, 'pour');
    }
    if (action.phase === 'pour') {
      const k = action.t / draw;
      creature.look.setSuck(1 - ease(k), this._tip);
      // The flare dies as the creature starts to pour out
      this._showPole(1, Math.max(0, 1 - k * 4));
      if (action.t < draw) return;
      creature.look.setSuck(0);
      this._next(action, 'retract');
    }
    if (action.phase === 'retract') {
      this._showPole(1 - ease(action.t / retract), 0);
      if (action.t < retract) return;
      this._finish();
    }
  }

  /** The next phase starts with the time the last one overran. */
  _next(action, phase) {
    let spent = POLE_TIMES[action.phase === 'pour' ? 'draw' : action.phase];
    // A release's way out is fitted to its beat (release)
    if (action.kind === 'release' && action.phase !== 'retract') spent *= action.scale;
    action.t = Math.max(0, action.t - spent);
    action.phase = phase;
  }

  /**
   * The tip touches the creature: it is held (silent from this moment) and
   * lands in its slot. False if it can't be had any more (gone, or the
   * strip filled up meanwhile): the pole comes back empty.
   */
  _connect(action) {
    const { creature } = action;
    const inWorld = creature.area && creature.area.entityManager.get(creature.id) === creature;
    if (!inWorld || creature.held) return false;
    const slot = Tape.slotForAbsorb();
    if (slot < 0) return false;
    this._colourOf(creature, this._colour);
    const spec = creature.toSpec();
    creature.hold();
    gameState.player.inventory[slot] = {
      id: `creature_${nextSlotId}`,
      spec,
      colour: [...this._colour],
      css: cssOf(this._colour),
    };
    nextSlotId += 1;
    WorldMemory.absorb(creature);
    HintMemory.retire('record'); // the absorb lesson (puzzle id "record")
    action.connected = true;
    return true;
  }

  _finish() {
    const action = this._action;
    this._action = null;
    if (this.pole) this.pole.hide();
    if (action && action.kind === 'release') {
      action.creature.look.setSuck(0);
      action.creature.wake();
      HintMemory.retire('playback'); // the release lesson (puzzle id "playback")
    }
  }

  /**
   * Finish the action under way at once (a crossing): an absorb not yet
   * connected comes back empty; one connected is complete (the body
   * leaves); a release comes alive where it is.
   */
  finishNow() {
    const action = this._action;
    if (!action) return;
    if (action.kind === 'absorb' && action.connected) {
      const { creature } = action;
      if (creature.area && creature.area.entityManager.get(creature.id)) {
        creature.area.entityManager.remove(creature.id);
      }
    }
    this._finish();
  }

  /** A new world (or the menu): drop the action, the pole in hand. */
  reset() {
    this._action = null;
    if (this.pole) this.pole.hide();
  }

  /**
   * Draw the pole over the main view (main.js render, right after it).
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera
   */
  render(renderer, camera) {
    if (this.pole) this.pole.render(renderer, camera);
  }

  /**
   * Where Space would release a creature of `radius` now: RELEASE_DISTANCE
   * ahead along the EFFECTIVE camera heading (mouse offset included, as the
   * waystone gate aims), on the player's own layer. Valid only if every
   * cell the body covers is walkable at that layer (no cliff edge under
   * it, off-grid, ramp) and holds no wall, gate (open or not), fountain or
   * waystone, nothing on the way there is a wall or closed gate, the player
   * can SEE where it lands (core/poleReach lineOfSight: never past a wall's
   * corner, a closed gate or a door), and the body collides with nothing
   * (creatures, the player). The same object
   * every call (no garbage: the release hint asks every frame).
   * @param {number} [radius]
   * @returns {{x:number, y:number, z:number, valid:boolean}}
   */
  releaseSpot(radius = DEFAULT_CREATURE_SIZE) {
    const spot = this._spot;
    spot.valid = false;
    const area = gameState.activeArea;
    if (!area || !area.elevationGrid) return spot;
    const grid = area.elevationGrid;
    const { position, elevation } = gameState.player;
    const [yaw] = CameraController.getView(gameState);
    const dx = -Math.sin(yaw);
    const dz = -Math.cos(yaw);
    spot.x = position.x + dx * RELEASE_DISTANCE;
    spot.z = position.z + dz * RELEASE_DISTANCE;
    const level = Math.round(elevation || 0);
    spot.level = level;
    spot.y = level * ELEVATION_HEIGHT;
    // On a ramp's slope there is no layer to put it on
    if (Math.abs((elevation || 0) - level) > 1e-6) return spot;

    // Every cell the body's footprint touches
    const lo = grid.worldToGrid(spot.x - radius, spot.z - radius);
    const hi = grid.worldToGrid(spot.x + radius, spot.z + radius);
    for (let gz = lo.z; gz <= hi.z; gz += 1) {
      for (let gx = lo.x; gx <= hi.x; gx += 1) {
        if (!this._cellTakes(area, gx, gz, level, true)) return spot;
      }
    }
    // ...and the way there (no reaching through a wall's corner)
    for (let third = 1; third <= 2; third += 1) {
      const f = third / 3;
      const cell = grid.worldToGrid(
        position.x + dx * RELEASE_DISTANCE * f,
        position.z + dz * RELEASE_DISTANCE * f
      );
      if (!this._cellTakes(area, cell.x, cell.z, level, false)) return spot;
    }
    const centre = this._releaseCentre;
    centre.x = spot.x;
    centre.y = spot.y + radius + CREATURE_HOVER_HEIGHT;
    centre.z = spot.z;
    if (!lineOfSight(area, position, centre)) return spot;
    const blocked = CollisionDetector.checkCollision(
      { x: spot.x, y: spot.y, z: spot.z },
      radius,
      '__released__',
      area
    );
    spot.valid = !blocked;
    return spot;
  }

  /**
   * Can a cell take a released body at `level`? (`whole`: the body stands
   * on it — or only passes over it.)
   */
  _cellTakes(area, gx, gz, level, whole) {
    const grid = area.elevationGrid;
    if (gx < 0 || gz < 0 || gx >= grid.gridSize || gz >= grid.gridSize) return false;
    if (!grid.hasLevel(gx, gz, level)) return false;
    if (whole && grid.getRamp(gx, gz)) return false;
    const cellX = gx * WORLD_SCALE;
    const cellZ = gz * WORLD_SCALE;
    const y = level * ELEVATION_HEIGHT;
    for (const e of area.entities) {
      const there =
        Math.abs(e.position.x - cellX) < WORLD_SCALE / 2 &&
        Math.abs(e.position.z - cellZ) < WORLD_SCALE / 2 &&
        Math.abs(e.position.y - y) < ELEVATION_HEIGHT / 2;
      if (there) {
        if (e.type === 'wall') return false;
        if (e.type === 'gate' && (whole || !e.isOpen)) return false;
        if (whole && (e.type === 'fountain' || e.type === 'waystone')) return false;
      }
    }
    return true;
  }

  /**
   * The tip's touch on `creature`, written into `out`: the point of its
   * body's near surface facing where the pole comes from — the player's
   * eye, offset to the right and down toward the hand (CONTACT_FROM), so
   * the pole meets the body on its near flank and the body's pull into the
   * tip is seen from the side, not end-on.
   */
  _contactOn(creature, out) {
    const { look } = creature;
    let cx = creature.position.x;
    let cy = creature.position.y + creature.size + CREATURE_HOVER_HEIGHT;
    let cz = creature.position.z;
    if (look) {
      cx = look.object.position.x;
      cy = look.object.position.y + look.float.position.y;
      cz = look.object.position.z;
    }
    const eye = gameState.player.position;
    const [yaw] = CameraController.getView(gameState);
    // The view's right (forward is (-sin yaw, 0, -cos yaw))
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let ex = eye.x + rx * CONTACT_FROM.right - cx;
    let ey = eye.y - CONTACT_FROM.down - cy;
    let ez = eye.z + rz * CONTACT_FROM.right - cz;
    const length = Math.hypot(ex, ey, ez) || 1;
    ex /= length;
    ey /= length;
    ez /= length;
    const reach = creature.size * (1 + CONTACT_GAP);
    out.x = cx + ex * reach;
    out.y = cy + ey * reach;
    out.z = cz + ez * reach;
    return out;
  }

  /** The colour a creature glows with (or, never lit, its song's first note's light). */
  _colourOf(creature, out) {
    if (creature.look && creature.look.harmonyColour) return creature.look.glowColourInto(out);
    const first = creature.song[0];
    const note = Array.isArray(first) ? first[0] : first;
    const harmony = note && messiaenColourCached([midiOf(note.pitch)]);
    if (harmony && harmony.main !== null) return harmonyLightInto(harmony, out);
    out[0] = 1;
    out[1] = 1;
    out[2] = 1;
    return out;
  }

  _showPole(extend, flare) {
    if (this.pole) this.pole.reach(this._tip, extend, flare, this._colour);
  }
}

// Singleton (mirrors DeployManager)
const absorbManager = new AbsorbManager();
export default absorbManager;
