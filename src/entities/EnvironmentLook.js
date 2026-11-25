/**
 * EnvironmentLook — the sky, walls and floor (DESIGN.md "Environment look",
 * the approved direction).
 *
 * The creatures are ball lightning; the world is the storm they were born
 * in, at night. Everything here is near-neutral, low-chroma and DARK, so a
 * creature's Messiaen colour is the most vivid thing in view and no surface
 * hue can be mistaken for a chord's: the scene reads by VALUE.
 *
 * - SKY: a slow-turning storm deck over a cold, luminous horizon band, with
 *   sheet lightning flickering inside the clouds now and then. It depends
 *   only on the view DIRECTION, never the eye's position (it sits at
 *   infinity), and only on that direction's height and its azimuth taken
 *   four times round: every door and the waystone gate turn the view by a
 *   multiple of 90 degrees, so a door shows the same sky, the same way
 *   round, as the sky beside it.
 * - THE STORM ANSWERS A GATE BEING SOLVED (tickEnvironment): the deck
 *   gathers and turns faster, the eye overhead closes and glows, and the
 *   deck, the eye and the horizon take the light of the harmony the gate
 *   hears — the one exception to "no environment hue", the chord's own
 *   colour, as the creatures show it; the gate's opening strikes lightning
 *   in that colour across the sky, walls and floor. One response for the
 *   whole world (uniforms every scene shares), so every door agrees.
 * - WALLS: dark layered stone, darker at the foot, a lighter cap and a thin
 *   pale rim along every top edge, so walls silhouette against the horizon
 *   glow and openings read at a glance.
 * - FLOOR: polished dark slate, faintly mottled, catching the horizon's
 *   glow at grazing angles; raised storeys a shade lighter, their CLIFF
 *   edges (where you can't walk on) traced by a pale line — ramps and
 *   abutting storeys get none.
 * - CREATURE LIGHT: a singing creature lights the floor and walls around it
 *   in its own colour (no three.js lights: a per-area list of up to
 *   MAX_LIGHTS lights the floor and wall shaders add up — AreaLight).
 *
 * Rendering constraints (the world re-renders through every door pass): all
 * custom unlit ShaderMaterials (no scene lights, so one material draws in
 * any scene without re-deriving its program), every one honours the clip
 * planes, no post-processing. One draw for the sky, one for an area's
 * walls (instanced), one for its whole floor. Programs are warmed behind
 * the StartGate (core/ShaderPrewarm: standInMaterials).
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import memoizeOnEntityList from 'core/entityListMemo';
import { messiaenColourCached } from 'core/messiaenColour';
import { WALL_HIDE_GLSL } from 'core/portalMath';
import { WALL_HEIGHT, WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { harmonyLightInto, HARMONY_COLOUR_TAU } from 'entities/CreatureLook';
import { CUT_UNIFORMS, CUT_VERTEX_GLSL, CUT_FRAGMENT_GLSL } from 'entities/CutawayLook';

// ---- Palette (sRGB hex; the shaders work in linear and encode on output) --
const PALETTE = {
  skyZenith: 0x04060b,
  skyHigh: 0x0a0d16,
  skyLow: 0x1c2130,
  horizon: 0x3a4255, // the luminous band where sky meets the world's edge
  abyss: 0x06070b, // below the horizon (seen from high storeys)
  cloudDark: 0x0e1119,
  cloudLit: 0x283040,
  flash: 0x7c86a6, // sheet lightning: cool, low chroma, never a creature's white
  wallFoot: 0x14171d,
  wallFace: 0x2c313c,
  wallCap: 0x3c4250,
  wallRim: 0x9ca5ba,
  floor: 0x31353f,
  floorRaised: 0x3a3f4a,
  slabSide: 0x1f232b,
  slabUnder: 0x121418,
  cliffEdge: 0xb4bccf,
  // The entities (entities/EntityLook): dark glass gates with pale edge
  // light, ramps of the storeys' slate, pale waystone rings — the gold of
  // the ACTIVE waystone (and the gate that leads there) the one accent,
  // red the wrong note's
  gateGlass: 0x10131a,
  gateFoot: 0x07080c,
  gateEdge: 0xc6d0e6,
  gateCharge: 0xeef3ff,
  lockout: 0xc8242a,
  portalGlow: 0xb9c6e2,
  rampSlope: 0x3c414c,
  rampChevron: 0x8d97ad,
  rampPost: 0xd2d9e8,
};

// Up to this many creatures light an area's surfaces at once (the
// brightest, when more sing)
export const MAX_LIGHTS = 8;
// How far a creature's light reaches (world units) and how strongly it
// tints what it reaches, at full glow
const LIGHT_REACH = 4.5;
const LIGHT_GAIN = 0.55;

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearOf = (hex) => [16, 8, 0].map((shift) => srgbToLinear(((hex >> shift) & 0xff) / 255)); // eslint-disable-line no-bitwise
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/**
 * A palette colour as a GLSL vec3 literal, as DISPLAYED (sRGB, 0..1). Every
 * pass writes in the canvas's colour space (core/passContext), so these
 * shaders work in display values and write them out themselves: three's
 * output encode (a pow per channel) cost a measurable share of a sky that
 * covers half the screen in every pass. Light that adds up (a creature's,
 * linear) is added in an approximately linear space: squared, added, and
 * square-rooted back (FINISH_GLSL).
 */
function vec3Of(hex) {
  const channels = [16, 8, 0].map((shift) => ((hex >> shift) & 0xff) / 255); // eslint-disable-line no-bitwise
  return `vec3(${channels.map((c) => c.toFixed(5)).join(', ')})`;
}
export const PALETTE_GLSL = Object.entries(PALETTE)
  .map(
    ([name, hex]) =>
      `const vec3 ${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()} = ${vec3Of(hex)};`
  )
  .join('\n');

// ---- The world's clock and its lightning (one for every material) --------

// Shared uniform OBJECTS: every environment material holds these same ones,
// so one write a frame reaches them all (the entities' looks too:
// entities/EntityLook)
export const WORLD_UNIFORMS = {
  uEnvTime: { value: 0 },
  uFlash: { value: 0 },
  uCloud: { value: null }, // CLOUD_TEXTURE, once made (below)
  // The storm's answer to a gate being solved (tickEnvironment): how far
  // the solve has come, the deck's own clock (it rushes as the storm
  // builds), the harmony's light (display values, already scaled by how
  // much of it shows) and the opening's lightning (likewise)
  uStorm: { value: 0 },
  uDeckTime: { value: 0 },
  uStormCol: { value: [0, 0, 0] },
  uStrike: { value: [0, 0, 0] },
};

// Sheet lightning: a strike every STRIKE_GAP seconds or so, of one to three
// quick pulses. Soft and rare on purpose: atmosphere, not an event (until a
// gate is being solved: it comes more often as the storm builds).
const STRIKE_GAP = [9, 22];
const PULSE_GAP = [0.08, 0.22];
const PULSE_DECAY = 0.11; // seconds
const lightning = { untilStrike: 6, pulses: [], level: 0 };
const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

// ---- The storm answers a gate being solved --------------------------------
//
// While a correct performance is under way at a gate (Gate.solveProgress),
// the storm builds with it: the deck gathers and turns faster, the eye
// overhead closes and glows, sheet lightning comes more often, and the
// deck, the eye and the horizon take the LIGHT of the harmony the gate
// hears at that moment (its own ear: Gate.soundingHeardInto) — the chord's
// colour exactly as a creature singing it glows (CreatureLook
// harmonyLightInto), following chord changes at the creatures' pace and
// gone with the music. The gate's opening strikes: a burst of lightning in
// that colour lights the sky, the walls and the floor. ONE response for the
// whole world — the gate in the player's area that is furthest along
// (nearer counts more) drives it, and every scene's sky shares it, so every
// door shows the same storm: the sky stays a function of view direction
// (everything it does is about the zenith, the horizon or the whole deck).

// Gates further than NEAR from the player answer more faintly, down to FAR
const STORM_NEAR = 12;
const STORM_FAR = 36;
const STORM_FAR_WEIGHT = 0.35;
const STORM_RISE_TAU = 0.25; // seconds: the storm follows the song's progress
const STORM_FALL_TAU = 1.2; // ...and settles slowly once nothing is solved
const STORM_LIT_ATTACK = 0.05; // the harmony's light comes on with a note
const STORM_LIT_RELEASE = 0.35; // ...and goes with the music
const DECK_RUSH = 6; // the deck turns and gathers this much faster at full storm
const STORM_LIGHTNING = 3; // sheet lightning this much more often at full storm
// The opening's strike: three pulses (seconds in, amplitude), then an afterglow
const STRIKE_PULSES = [
  [0, 1],
  [0.09, 0.55],
  [0.22, 0.85],
];
const STRIKE_DECAY = 0.14;
const STRIKE_AFTERGLOW = 0.3;
const STRIKE_AFTERGLOW_TAU = 0.9;
// How much of the strike's light is the neutral flash (so a pale lone note's
// opening still reads), the rest the harmony's
const STRIKE_NEUTRAL = 0.35;

const storm = {
  level: 0,
  lit: 0,
  colour: [0, 0, 0], // linear: the light showing
  target: [0, 0, 0], // linear: the light of what the driving gate hears now
  strikeColour: [0, 0, 0], // linear
  pulses: [],
  afterglow: 0,
  strike: 0,
  heard: [], // scratch: MIDI notes the driving gate hears
  openings: new WeakMap(), // gate -> its opening count when last seen
};

const gatesOf = memoizeOnEntityList((entities) => entities.filter((e) => e.type === 'gate'));
const FLASH_LINEAR = linearOf(PALETTE.flash);

/** How strongly a gate this far from the player stirs the storm. */
function stormWeightAt(distance) {
  const t = Math.min(1, Math.max(0, (distance - STORM_NEAR) / (STORM_FAR - STORM_NEAR)));
  return 1 - t * (1 - STORM_FAR_WEIGHT);
}

function distanceToPlayer(gate) {
  const { position } = gameState.player;
  const dx = gate.position.x - position.x;
  const dz = gate.position.z - position.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** A gate just opened: lightning strikes, in the light the storm shows now. */
function strike(weight) {
  const colourShare = storm.lit > 0.05 ? 1 - STRIKE_NEUTRAL : 0;
  for (let i = 0; i < 3; i += 1) {
    storm.strikeColour[i] =
      FLASH_LINEAR[i] * (1 - colourShare) + Math.min(1, storm.colour[i] * 1.6) * colourShare;
  }
  storm.pulses.length = 0;
  for (const [at, amplitude] of STRIKE_PULSES)
    storm.pulses.push({ in: at, amplitude: amplitude * weight });
  storm.afterglow = Math.max(storm.afterglow, STRIKE_AFTERGLOW * weight);
}

function tickStorm(dt, area) {
  let driver = null;
  let target = 0;
  const gates = area ? gatesOf(area.entities) : [];
  for (let i = 0; i < gates.length; i += 1) {
    const gate = gates[i];
    const seen = storm.openings.get(gate);
    if (seen !== gate.openings) {
      storm.openings.set(gate, gate.openings);
      if (seen !== undefined) strike(stormWeightAt(distanceToPlayer(gate)));
    }
    const progress = gate.solveProgress;
    if (progress > 0) {
      const weight = progress * stormWeightAt(distanceToPlayer(gate));
      if (weight > target) {
        target = weight;
        driver = gate;
      }
    }
  }
  const tau = target > storm.level ? STORM_RISE_TAU : STORM_FALL_TAU;
  storm.level += (target - storm.level) * (1 - Math.exp(-dt / tau));
  if (target === 0 && storm.level < 1e-3) storm.level = 0;

  // The light of what the driving gate hears, now
  let sounding = false;
  if (driver) {
    storm.heard.length = 0;
    driver.soundingHeardInto(storm.heard);
    const harmony = messiaenColourCached(storm.heard);
    if (harmony.main !== null) {
      harmonyLightInto(harmony, storm.target);
      sounding = true;
    }
  }
  if (sounding) {
    // A first light takes its colour outright (as a creature's does)
    if (storm.lit < 0.05) for (let i = 0; i < 3; i += 1) storm.colour[i] = storm.target[i];
    storm.lit = Math.min(1, storm.lit + dt / STORM_LIT_ATTACK);
  } else {
    // ...and goes with the music (an opening's strike holds it while it glows)
    storm.lit = Math.max(storm.lit * Math.exp(-dt / STORM_LIT_RELEASE), Math.min(1, storm.strike));
    if (storm.lit < 1e-3) storm.lit = 0;
  }
  const a = 1 - Math.exp(-dt / HARMONY_COLOUR_TAU);
  for (let i = 0; i < 3; i += 1) storm.colour[i] += (storm.target[i] - storm.colour[i]) * a;

  // The strike
  let level = 0;
  for (let i = storm.pulses.length - 1; i >= 0; i -= 1) {
    const pulse = storm.pulses[i];
    pulse.in -= dt;
    if (pulse.in <= 0) {
      const glow = pulse.amplitude * Math.exp(pulse.in / STRIKE_DECAY);
      if (glow < 0.005) storm.pulses.splice(i, 1);
      else level = Math.max(level, glow);
    }
  }
  storm.afterglow *= Math.exp(-dt / STRIKE_AFTERGLOW_TAU);
  if (storm.afterglow < 1e-3) storm.afterglow = 0;
  storm.strike = Math.max(level, storm.afterglow);

  // Into the shared uniforms, as display values
  const shown = storm.lit * storm.level;
  const col = WORLD_UNIFORMS.uStormCol.value;
  const flash = WORLD_UNIFORMS.uStrike.value;
  for (let i = 0; i < 3; i += 1) {
    col[i] = linearToSrgb(storm.colour[i]) * shown;
    flash[i] = linearToSrgb(storm.strikeColour[i]) * storm.strike;
  }
  WORLD_UNIFORMS.uStorm.value = storm.level;
}

/** Settle the storm at once (a fresh world): no build, no colour, no strike. */
export function calmStorm() {
  storm.level = 0;
  storm.lit = 0;
  storm.strike = 0;
  storm.afterglow = 0;
  storm.pulses.length = 0;
  WORLD_UNIFORMS.uStorm.value = 0;
  WORLD_UNIFORMS.uStormCol.value.fill(0);
  WORLD_UNIFORMS.uStrike.value.fill(0);
}

/**
 * Advance the sky's drift, its lightning and its answer to a gate being
 * solved. Called once a frame while the world runs (main.js update);
 * render passes only read the result.
 * @param {number} deltaTime - seconds
 * @param {?import('core/Area').default} [area] - the player's area, whose
 *   gates the storm answers
 */
export function tickEnvironment(deltaTime, area = null) {
  const dt = Math.max(0, Math.min(deltaTime, 0.1));
  WORLD_UNIFORMS.uEnvTime.value += dt;
  tickStorm(dt, area);
  WORLD_UNIFORMS.uDeckTime.value += dt * (1 + DECK_RUSH * storm.level);
  lightning.untilStrike -= dt * (1 + STORM_LIGHTNING * storm.level);
  if (lightning.untilStrike <= 0) {
    lightning.untilStrike = between(STRIKE_GAP);
    let at = 0;
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i += 1) {
      lightning.pulses.push({ in: at, amplitude: 0.45 + Math.random() * 0.55 });
      at += between(PULSE_GAP);
    }
  }
  let level = 0;
  for (let i = lightning.pulses.length - 1; i >= 0; i -= 1) {
    const pulse = lightning.pulses[i];
    pulse.in -= dt;
    if (pulse.in <= 0) {
      const age = -pulse.in;
      const glow = pulse.amplitude * Math.exp(-age / PULSE_DECAY);
      if (glow < 0.005) lightning.pulses.splice(i, 1);
      else level = Math.max(level, glow);
    }
  }
  WORLD_UNIFORMS.uFlash.value = level;
}

/**
 * The sky's clock: how far its clouds have drifted (`deck`) and the time
 * the gates' and ramps' shimmer runs on (`env`), in seconds.
 * @returns {{env: number, deck: number}}
 */
export function environmentClock() {
  return { env: WORLD_UNIFORMS.uEnvTime.value, deck: WORLD_UNIFORMS.uDeckTime.value };
}

/**
 * Set the sky's clock (the editor's Play hands the editor's sky to the game,
 * so its first frame shows the clouds where the editor's last one did).
 * @param {{env: number, deck: number}} clock
 */
export function setEnvironmentClock({ env, deck }) {
  if (Number.isFinite(env)) WORLD_UNIFORMS.uEnvTime.value = env;
  if (Number.isFinite(deck)) WORLD_UNIFORMS.uDeckTime.value = deck;
}

/** The lightning's brightness now, 0..1 (0 between strikes). */
export function lightningLevel() {
  return WORLD_UNIFORMS.uFlash.value;
}

/**
 * The storm's answer to gate solving, now: how far it has built (0..1),
 * the harmony's light it shows (display rgb, scaled by how much shows: all
 * zero for the neutral storm) and the opening strike's light (likewise).
 * @returns {{level: number, colour: number[], strike: number[]}}
 */
export function stormResponse() {
  return {
    level: WORLD_UNIFORMS.uStorm.value,
    colour: [...WORLD_UNIFORMS.uStormCol.value],
    strike: [...WORLD_UNIFORMS.uStrike.value],
  };
}

// ---- Cloud noise -----------------------------------------------------------

// Soft fractal noise, tiling seamlessly both ways, computed ONCE: the sky's
// storm deck only ever slides across it (it turns and drifts: offsets), so
// a pixel of sky costs two texture reads instead of a dozen noise hashes
// per door pass. The floor's mottling reads it too.
const NOISE_SIZE = 256;
const NOISE_OCTAVES = [
  { cells: 8, weight: 0.55 },
  { cells: 16, weight: 0.3 },
  { cells: 32, weight: 0.15 },
];

function latticeHash(x, y, octave) {
  let h = (x * 374761393 + y * 668265263 + octave * 2147483647) | 0; // eslint-disable-line no-bitwise
  h = Math.imul(h ^ (h >>> 13), 1274126177); // eslint-disable-line no-bitwise
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296; // eslint-disable-line no-bitwise
}

function createCloudTexture() {
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let py = 0; py < NOISE_SIZE; py += 1) {
    for (let px = 0; px < NOISE_SIZE; px += 1) {
      let value = 0;
      NOISE_OCTAVES.forEach(({ cells, weight }, octave) => {
        const fx = (px / NOISE_SIZE) * cells;
        const fy = (py / NOISE_SIZE) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        // Lattice wrapped at `cells`: the texture tiles
        const at = (x, y) => latticeHash(x % cells, y % cells, octave);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        value += (top + (bottom - top) * ty) * weight;
      });
      data[py * NOISE_SIZE + px] = Math.round(value * 255);
    }
  }
  const texture = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RedFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const CLOUD_TEXTURE = createCloudTexture();
WORLD_UNIFORMS.uCloud.value = CLOUD_TEXTURE;

// ---- GLSL shared by the looks ---------------------------------------------

// Creature light: each light falls off smoothly to nothing at its reach and
// lights only surfaces facing it (no shadows: walls are thicker than the
// reach is long, so little shows through)
export const LIGHT_GLSL = /* glsl */ `
  uniform vec4 uLightPos[${MAX_LIGHTS}];
  uniform vec3 uLightCol[${MAX_LIGHTS}];
  uniform int uLightCount;
  vec3 creatureLight(vec3 p, vec3 n) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 l = uLightPos[i].xyz - p;
      float d2 = dot(l, l);
      float reach2 = uLightPos[i].w * uLightPos[i].w;
      if (d2 < reach2) {
        float f = 1.0 - d2 / reach2;
        float facing = max(dot(n, l * inversesqrt(max(d2, 1e-4))), 0.0);
        sum += uLightCol[i] * (f * f * (0.25 + 0.75 * facing));
      }
    }
    return sum * ${LIGHT_GAIN.toFixed(3)};
  }
`;

// The scene's key light direction (main.js / Area: the directional light at
// (50, 100, 50)): faces shade by it, so corners read like the lit gates'
export const KEY_GLSL = 'const vec3 KEY_DIR = vec3(0.4082, 0.8165, 0.4082);';

// A surface's display colour plus the creature light it catches, written out
export const FINISH_GLSL = /* glsl */ `
  vec4 finish(vec3 display, vec3 light) {
    return vec4(sqrt(display * display + light), 1.0);
  }
`;

// ---- Sky ------------------------------------------------------------------

// The sky's sphere is drawn this far from the eye, then pushed onto the far
// plane: inside the camera's far (500) and behind everything
const SKY_RADIUS = 300;

// The sky's colour by height alone (zenith, low sky, the horizon's bright
// band, the abyss below), worked out once into a strip texture indexed by
// the view direction's height: a pixel of sky reads it instead of working
// it out (the sky covers half the screen, in every pass). Stored sRGB, so
// the dark tones keep their precision, and read as display values.
const SKY_RAMP_SIZE = 256;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The sky's colour (linear) looking at height `h` (-1 down .. 1 up). */
function skyColourAt(h) {
  const up = Math.max(h, 0);
  const [zenith, high, low, horizon, abyss] = [
    PALETTE.skyZenith,
    PALETTE.skyHigh,
    PALETTE.skyLow,
    PALETTE.horizon,
    PALETTE.abyss,
  ].map(linearOf);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  let col = mix(high, zenith, smoothstep(0.25, 0.9, up));
  col = mix(low, col, smoothstep(0, 0.32, up));
  const band = Math.exp(-Math.abs(h) * 18) * 0.9;
  col = col.map((v, i) => v + horizon[i] * band);
  return mix(col, abyss, smoothstep(0, -0.35, h));
}

function createSkyRamp() {
  const data = new Uint8Array(SKY_RAMP_SIZE * 4);
  for (let i = 0; i < SKY_RAMP_SIZE; i += 1) {
    const colour = skyColourAt((i / (SKY_RAMP_SIZE - 1)) * 2 - 1);
    for (let c = 0; c < 3; c += 1) {
      data[i * 4 + c] = Math.round(Math.min(1, linearToSrgb(colour[c])) * 255);
    }
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, SKY_RAMP_SIZE, 1);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const SKY_VERTEX = /* glsl */ `
  uniform float uDeckTime;
  uniform float uStorm;
  varying float vH;
  varying vec2 vCloudUv;
  varying vec4 vCloud; // the deck's colour here, and how much deck there is
  varying float vSheet; // how much of the sky's own glow lightning lifts
  varying vec3 vStormAt; // where the storm's light gathers: eye rim, horizon, zenith
  #include <common>
  #include <clipping_planes_pars_vertex>
  ${PALETTE_GLSL}
  void main() {
    // A unit sphere, never rotated: its points are world directions
    vH = position.y;
    float up = max(position.y, 0.0);

    // The storm deck: a cloud plane overhead, read in polar coordinates
    // about the zenith — the azimuth (the sphere's own u, seamless) one
    // noise tile per QUARTER turn, as doors turn the view by quarter
    // turns, so every door sees the same deck. It turns slowly and drifts
    // in toward a clear eye overhead; as a gate is solved (uStorm) it
    // rushes (uDeckTime) and the eye closes.
    float r = length(position.xz) / (up + 0.12);
    vCloudUv = vec2(uv.x * 4.0 + uDeckTime * 0.004, r * 0.16 + uDeckTime * 0.007);
    float eye = mix(0.7, 0.3, uStorm);
    vCloud = vec4(
      mix(CLOUD_LIT, CLOUD_DARK, smoothstep(0.1, 0.7, up)), // lit from the horizon
      smoothstep(0.0, 0.08, position.y) * smoothstep(eye * 0.35, eye * 1.6, r)
        * (1.0 - smoothstep(4.5, 9.0, r)));
    vSheet = 0.12 * smoothstep(-0.05, 0.3, position.y);
    float rim = (r - eye) / 0.45;
    vStormAt = vec3(
      exp(-rim * rim) * smoothstep(0.2, 0.5, up),
      exp(-abs(position.y) * 14.0),
      smoothstep(0.8, 1.0, up));

    vec4 mvPosition = viewMatrix * vec4(cameraPosition + position * ${SKY_RADIUS.toFixed(1)}, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w * 0.99999; // at infinity: behind everything
    #include <clipping_planes_vertex>
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform float uDeckTime;
  uniform float uFlash;
  uniform float uStorm;
  uniform vec3 uStormCol;
  uniform vec3 uStrike;
  uniform sampler2D uCloud;
  uniform sampler2D uSkyRamp;
  varying float vH;
  varying vec2 vCloudUv;
  varying vec4 vCloud;
  varying float vSheet;
  varying vec3 vStormAt;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}

  void main() {
    #include <clipping_planes_fragment>
    vec3 col = texture2D(uSkyRamp, vec2(vH * 0.5 + 0.5, 0.5)).rgb;
    float n = texture2D(uCloud, vCloudUv).r * 0.65
            + texture2D(uCloud, vCloudUv * vec2(2.0, 2.3) + vec2(0.37, uDeckTime * 0.004)).r * 0.35;
    // A gate being solved gathers the deck: more of it, and heavier
    float deck = smoothstep(0.42 - 0.12 * uStorm, 0.68 - 0.06 * uStorm, n) * vCloud.a;
    col = mix(col, vCloud.rgb * (1.0 - 0.3 * uStorm), deck * 0.85);
    // Sheet lightning lights the deck from inside: its thin parts most
    float thin = deck * (1.0 - smoothstep(0.5, 0.8, n));
    col += FLASH * uFlash * (vSheet + 0.4 * thin);
    // ...and the harmony the gate hears glows in it: around the closing
    // eye, along the horizon, through the deck's thin parts
    col += uStormCol * (0.6 * vStormAt.x + 0.4 * vStormAt.y + 0.3 * vStormAt.z
                        + deck * (0.08 + 0.5 * thin));
    // The opening's strike lights all of it
    col += uStrike * (0.3 + 0.8 * vStormAt.y + 0.6 * vStormAt.z + 1.1 * deck + 0.8 * thin);
    gl_FragColor = vec4(col, 1.0); // already display values: no encode
  }
`;

const SKY_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { ...WORLD_UNIFORMS, uSkyRamp: { value: createSkyRamp() } },
  vertexShader: SKY_VERTEX,
  fragmentShader: SKY_FRAGMENT,
  depthWrite: false,
  side: THREE.BackSide, // seen from inside
  clipping: true,
});
SKY_MATERIAL.userData.shared = true;
// Fine enough that the deck's coordinates interpolate true between vertices
const SKY_GEOMETRY = new THREE.SphereGeometry(1, 64, 48);
SKY_GEOMETRY.userData.shared = true;
// It draws around every eye, wherever the eye is: no pass may judge it
// outside its frustum or past a clip plane by its unit sphere
// (core/sceneMatrices pieces read the geometry's bounding sphere)
SKY_GEOMETRY.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

// Opaque, drawn after every other opaque thing (three sorts the opaque list
// by renderOrder first): only pixels nothing covers pay for the sky
const SKY_RENDER_ORDER = 1e6;

/**
 * One sky for a scene (each Area's group carries one, so the main view and
 * every door pass draw it). Geometry and material are shared.
 * @returns {THREE.Mesh}
 */
export function createSky() {
  const sky = new THREE.Mesh(SKY_GEOMETRY, SKY_MATERIAL);
  sky.frustumCulled = false;
  sky.renderOrder = SKY_RENDER_ORDER;
  sky.userData.isSky = true;
  return sky;
}

// ---- Creature light, per area --------------------------------------------

const creaturesOf = memoizeOnEntityList((entities) =>
  entities.filter((e) => e.type === 'creature' && e.look)
);

/**
 * The creature light one area's floor and walls add up: the uniforms they
 * share, refreshed once a frame from the area's creatures (Area.update).
 */
export class AreaLight {
  constructor() {
    this.uniforms = {
      uLightPos: { value: new Float32Array(MAX_LIGHTS * 4) },
      uLightCol: { value: new Float32Array(MAX_LIGHTS * 3) },
      uLightCount: { value: 0 },
    };
    // Scratch for more than MAX_LIGHTS lit creatures: the brightest win
    this._strengths = new Float32Array(MAX_LIGHTS);
    this._pos = new Float32Array(4);
    this._col = new Float32Array(3);
  }

  /** How many creatures light the area now. */
  get count() {
    return this.uniforms.uLightCount.value;
  }

  /**
   * Gather this frame's lit creatures. Allocation-free.
   * @param {object[]} entities - the area's entity list
   */
  update(entities) {
    const pos = this.uniforms.uLightPos.value;
    const col = this.uniforms.uLightCol.value;
    const strengths = this._strengths;
    let count = 0;
    const creatures = creaturesOf(entities);
    for (let c = 0; c < creatures.length; c += 1) {
      const { look } = creatures[c];
      if (count < MAX_LIGHTS) {
        const strength = look.lightInto(pos, col, count);
        if (strength > 0) {
          pos[count * 4 + 3] = LIGHT_REACH * Math.min(1.4, 0.75 + 0.5 * look.size);
          strengths[count] = strength;
          count += 1;
        }
      } else {
        // Full: this one replaces the dimmest, if brighter
        const strength = look.lightInto(this._pos, this._col, 0);
        let dimmest = 0;
        for (let i = 1; i < MAX_LIGHTS; i += 1) if (strengths[i] < strengths[dimmest]) dimmest = i;
        if (strength > strengths[dimmest]) {
          for (let i = 0; i < 3; i += 1) {
            pos[dimmest * 4 + i] = this._pos[i];
            col[dimmest * 3 + i] = this._col[i];
          }
          pos[dimmest * 4 + 3] = LIGHT_REACH * Math.min(1.4, 0.75 + 0.5 * look.size);
          strengths[dimmest] = strength;
        }
      }
    }
    this.uniforms.uLightCount.value = count;
  }
}

// A light-less stand-in for surfaces built outside any area (tools, tests)
export const NO_LIGHT = new AreaLight();

// ---- Walls ----------------------------------------------------------------

// Wall boxes are one storey (WALL_HEIGHT) tall, their mesh centred half of
// it above their floor. In a batch (Wall.buildBatch) each instance carries
// which of its faces show: a side against a neighbouring wall, the bottom,
// and (a tile-built level: the Floor draws it as walkable floor) the top are
// left out, so a run of walls is ONE solid with no seams; its rim (the pale
// top edge) is off where the Floor's edge lines take over.
const WALL_VERTEX = /* glsl */ `
  uniform vec4 uHideA;
  uniform float uHideLatA;
  uniform vec4 uHideB;
  uniform float uHideLatB;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vUp;
  varying float vRim;
  // The editor's cutaway (entities/CutawayLook; off in the game): this
  // wall a ghost, where on its box, which neighbours continue it
  varying float vGhost;
  varying vec3 vBox;
  varying vec4 vSides;
  varying vec2 vEnds;
  #include <common>
  #include <clipping_planes_pars_vertex>
  #ifdef USE_INSTANCING
    attribute vec4 aSideHide; // the +x, -x, +z, -z sides: 1 = left out
    attribute vec2 aTopHide; // the top left out; the rim off
    attribute vec2 aStack; // walls under this one in its column; the column's height
  #endif
  ${WALL_HIDE_GLSL}
  ${CUT_VERTEX_GLSL}

  void main() {
    vGhost = 0.0;
    vBox = position;
    vSides = vec4(0.0);
    vEnds = vec2(0.0);
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normal; // wall boxes are never rotated
    vUp = (position.y + ${(WALL_HEIGHT / 2).toFixed(3)}) / ${WALL_HEIGHT.toFixed(3)};
    vRim = 1.0;
    #ifdef USE_INSTANCING
      // Up the whole COLUMN of stacked walls, not each block: its foot
      // darkens and its rim sits only at the column's top (no bands)
      if (aStack.y > 0.5) vUp = (aStack.x + vUp) / aStack.y;
    #endif
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #ifdef USE_INSTANCING
      // A door pass's eye-side walls (PortalView.wallHide): collapsed, so
      // the instance draws nothing — as hiding its own mesh did
      vec2 centre = (model * vec4(0.0, 0.0, 0.0, 1.0)).xz;
      // ...and the faces inside a run of walls (or under the Floor's top)
      float faceHidden = 1.0; // the bottom: never seen
      if (normal.x > 0.5) faceHidden = aSideHide.x;
      else if (normal.x < -0.5) faceHidden = aSideHide.y;
      else if (normal.z > 0.5) faceHidden = aSideHide.z;
      else if (normal.z < -0.5) faceHidden = aSideHide.w;
      else if (normal.y > 0.5) faceHidden = aTopHide.x;
      vRim = 1.0 - aTopHide.y;
      // The editor's cutaway: this wall's cell and storey (its instance's
      // place, in the level's own coordinates)
      vec3 at = instanceMatrix[3].xyz;
      vec2 cell = floor(at.xz / ${WORLD_SCALE.toFixed(3)} + 0.5);
      float storey = floor((at.y - ${(WALL_HEIGHT / 2).toFixed(3)}) / ${ELEVATION_HEIGHT.toFixed(
        3
      )} + 0.5);
      float above = aStack.y - aStack.x - 1.0;
      vGhost = cutGhost(cell, storey, 1.0);
      vSides = aSideHide;
      vEnds = vec2(step(0.5, aStack.x), step(0.5, above));
      // A solid wall beside (or under) a ghost shows the face it hid
      // against it, so it stays closed seen through the ghost
      if (faceHidden > 0.5 && vGhost < 0.5 && uCutMode > 0.5) {
        if (abs(normal.y) < 0.5) {
          if (cutGhost(cell + normal.xz, storey, 1.0) > 0.5) faceHidden = 0.0;
        } else if (normal.y > 0.5 && above > 0.5 && cutGhost(cell, storey + 1.0, 1.0) > 0.5) {
          faceHidden = 0.0;
        }
      }
      if (
        faceHidden > 0.5 ||
        wallHiddenBy(uHideA, uHideLatA, centre) ||
        wallHiddenBy(uHideB, uHideLatB, centre)
      ) {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      }
    #endif
    #include <clipping_planes_vertex>
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  uniform float uFlash;
  uniform vec3 uStormCol;
  uniform vec3 uStrike;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vUp;
  varying float vRim;
  varying float vGhost;
  varying vec3 vBox;
  varying vec4 vSides;
  varying vec2 vEnds;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}
  ${KEY_GLSL}
  ${LIGHT_GLSL}
  ${FINISH_GLSL}
  ${CUT_FRAGMENT_GLSL}

  // A ghost's outline, \`dist\` from an edge: about a pixel at least
  float ghostLine(float dist) {
    float fw = fwidth(dist);
    float width = max(0.04, fw * 1.25);
    return 1.0 - smoothstep(width, width + fw, dist);
  }

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormalW);
    // The editor's cutaway: a ghost keeps its OUTER edges whole (where no
    // wall continues it) and a screen door of the rest
    float ghostEdge = 0.0;
    if (vGhost > 0.5) {
      vec3 boxHalf = vec3(${(WORLD_SCALE / 2).toFixed(3)}, ${(WALL_HEIGHT / 2).toFixed(3)}, ${(
        WORLD_SCALE / 2
      ).toFixed(3)});
      vec3 d = boxHalf - abs(vBox);
      vec3 outer = vec3(
        1.0 - (vBox.x > 0.0 ? vSides.x : vSides.y),
        1.0 - (vBox.y > 0.0 ? vEnds.y : vEnds.x),
        1.0 - (vBox.z > 0.0 ? vSides.z : vSides.w)
      );
      vec3 shown = (1.0 - abs(n)) * outer;
      ghostEdge = max(shown.x * ghostLine(d.x), max(shown.y * ghostLine(d.y), shown.z * ghostLine(d.z)));
      if (ghostEdge < 0.5 && cutDropped()) discard;
    }
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 col;
    if (n.y > 0.5) {
      // The cap: lit by the sky
      col = WALL_CAP * (1.0 + 0.35 * uFlash);
    } else {
      // Layered stone: faint strata, wandering a little along the wall
      float strata = vWorld.y * 4.2 + 0.18 * sin(vWorld.x * 0.7 + vWorld.z * 1.1);
      float layer = 0.94 + 0.06 * smoothstep(0.35, 0.5, abs(fract(strata) - 0.5));
      col = mix(WALL_FOOT, WALL_FACE, smoothstep(0.0, 0.75, vUp)) * layer;
      col *= 0.78 + 0.32 * max(dot(n, KEY_DIR), 0.0);
      // Polished faces catch the horizon's glow at a glancing angle
      float glance = pow(1.0 - max(dot(n, v), 0.0), 4.0);
      col += (HORIZON + uStormCol) * glance * 0.1;
      // The pale rim along the top edge: walls silhouette against the sky.
      // Never thinner than about a pixel (no shimmer far off), and no
      // brighter in total for being widened
      float fw = fwidth(vUp);
      float width = max(0.018, fw * 1.2);
      float rim = smoothstep(1.0 - width - fw, 1.0 - width, vUp) * (0.018 / width) * vRim;
      col = mix(col, WALL_RIM * (1.0 + 0.4 * uFlash), clamp(rim, 0.0, 1.0));
      col += FLASH * uFlash * 0.05 * vUp;
    }
    // A gate's opening strikes lightning across the world: the faces it
    // falls on from above most
    col += uStrike * (0.1 + 0.18 * vUp);
    gl_FragColor = finish(col, creatureLight(vWorld, n));
    if (vGhost > 0.5) {
      gl_FragColor.rgb = mix(mix(gl_FragColor.rgb, GHOST_EDGE, 0.3), GHOST_EDGE, ghostEdge);
    }
  }
`;

// Per-pass wall hiding (PortalView): a vec4 (window centre xz, outward xz)
// and the eye's lateral offset, for the panel and for its approach panel.
// An outward of zero hides nothing.
const hideUniforms = () => ({
  uHideA: { value: [0, 0, 0, 0] },
  uHideLatA: { value: 0 },
  uHideB: { value: [0, 0, 0, 0] },
  uHideLatB: { value: 0 },
});

/**
 * A wall material lit by `light` (one area's creatures). The game's walls
 * draw instanced (one batch per area, PuzzleLoader.buildArea); the same
 * material draws a lone wall mesh too.
 * @param {AreaLight} [light]
 * @returns {THREE.ShaderMaterial}
 */
export function createWallMaterial(light = NO_LIGHT) {
  return new THREE.ShaderMaterial({
    uniforms: { ...WORLD_UNIFORMS, ...CUT_UNIFORMS, ...light.uniforms, ...hideUniforms() },
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT,
    clipping: true,
    extensions: { derivatives: true },
  });
}

// ---- Floor ----------------------------------------------------------------

const FLOOR_VERTEX = /* glsl */ `
  attribute float aEdge;
  attribute vec4 aCut; // its owner for the editor's cutaway: cell x, z, storey, a wall's
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vEdge;
  varying float vGhost;
  #include <common>
  #include <clipping_planes_pars_vertex>
  ${CUT_VERTEX_GLSL}
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normal; // built in world space (Floor), never rotated
    vEdge = aEdge;
    vGhost = cutGhost(aCut.xy, aCut.z, aCut.w);
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uFlash;
  uniform vec3 uStormCol;
  uniform vec3 uStrike;
  uniform sampler2D uCloud;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vEdge;
  varying float vGhost;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}
  ${KEY_GLSL}
  ${LIGHT_GLSL}
  ${FINISH_GLSL}
  ${CUT_FRAGMENT_GLSL}

  void main() {
    #include <clipping_planes_fragment>
    // The editor's cutaway: a ghost keeps its edge lines whole and a
    // screen door of the rest
    if (vGhost > 0.5 && vEdge < 0.5 && cutDropped()) discard;
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 col;
    if (vEdge > 0.5) {
      // A cliff edge: you can't walk on past this line
      col = CLIFF_EDGE * (1.0 + 0.3 * uFlash);
    } else if (n.y > 0.5) {
      bool raised = vWorld.y > 0.05;
      col = raised ? FLOOR_RAISED : FLOOR;
      // Slate mottling, very faint
      col *= 0.93 + 0.14 * texture2D(uCloud, vWorld.xz * 0.04 + vWorld.y * 0.13).r;
      // Polished: the horizon's glow on the far floor (the storm's colour
      // in it while a gate is being solved, the opening's strike after)
      float glance = pow(1.0 - max(dot(n, v), 0.0), 5.0);
      col += (HORIZON * (1.0 + 1.5 * uFlash) + uStormCol + uStrike * 2.0) * glance * 0.18;
      col += uStrike * 0.09;
    } else if (n.y < -0.5) {
      col = SLAB_UNDER; // the underside of a storey you walk beneath
    } else {
      col = SLAB_SIDE * (0.8 + 0.3 * max(dot(n, KEY_DIR), 0.0));
    }
    gl_FragColor = finish(col, creatureLight(vWorld, n));
    if (vGhost > 0.5) {
      gl_FragColor.rgb = vEdge > 0.5 ? GHOST_EDGE : mix(gl_FragColor.rgb, GHOST_EDGE, 0.3);
    }
  }
`;

/**
 * The floor material (ground, raised storeys and their cliff edges: one
 * merged geometry per area, Floor) lit by `light`.
 * @param {AreaLight} [light]
 * @returns {THREE.ShaderMaterial}
 */
export function createFloorMaterial(light = NO_LIGHT) {
  return new THREE.ShaderMaterial({
    uniforms: { ...WORLD_UNIFORMS, ...CUT_UNIFORMS, ...light.uniforms },
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT,
    clipping: true,
  });
}

/**
 * One material per program this look can need, for ShaderPrewarm's
 * never-disposed stand-ins: the sky (its own shared material), a floor and
 * a wall (the game draws walls instanced).
 * @returns {{sky: THREE.Material, floor: THREE.Material, wall: THREE.Material}}
 */
export function standInMaterials() {
  return { sky: SKY_MATERIAL, floor: createFloorMaterial(), wall: createWallMaterial() };
}
