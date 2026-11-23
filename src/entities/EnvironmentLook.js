/**
 * EnvironmentLook — the sky, walls and floor (DESIGN.md "Environment look",
 * DRAFT pending the designer's review).
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
 *   four times round: every door and the cleanser gate turn the view by a
 *   multiple of 90 degrees, so a door shows the same sky, the same way
 *   round, as the sky beside it.
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
import memoizeOnEntityList from 'core/entityListMemo';
import { WALL_HIDE_GLSL } from 'core/portalMath';

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
};

// Up to this many creatures light an area's surfaces at once (the
// brightest, when more sing)
export const MAX_LIGHTS = 8;
// How far a creature's light reaches (world units) and how strongly it
// tints what it reaches, at full glow
const LIGHT_REACH = 4.5;
const LIGHT_GAIN = 0.55;

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
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
const PALETTE_GLSL = Object.entries(PALETTE)
  .map(
    ([name, hex]) =>
      `const vec3 ${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()} = ${vec3Of(hex)};`
  )
  .join('\n');

// ---- The world's clock and its lightning (one for every material) --------

// Shared uniform OBJECTS: every environment material holds these same ones,
// so one write a frame reaches them all
const WORLD_UNIFORMS = {
  uEnvTime: { value: 0 },
  uFlash: { value: 0 },
  uCloud: { value: null }, // CLOUD_TEXTURE, once made (below)
};

// Sheet lightning: a strike every STRIKE_GAP seconds or so, of one to three
// quick pulses. Soft and rare on purpose: atmosphere, not an event.
const STRIKE_GAP = [9, 22];
const PULSE_GAP = [0.08, 0.22];
const PULSE_DECAY = 0.11; // seconds
const lightning = { untilStrike: 6, pulses: [], level: 0 };
const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

/**
 * Advance the sky's drift and its lightning. Called once a frame while the
 * world runs (main.js update); render passes only read the result.
 * @param {number} deltaTime - seconds
 */
export function tickEnvironment(deltaTime) {
  const dt = Math.max(0, Math.min(deltaTime, 0.1));
  WORLD_UNIFORMS.uEnvTime.value += dt;
  lightning.untilStrike -= dt;
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

/** The lightning's brightness now, 0..1 (0 between strikes). */
export function lightningLevel() {
  return WORLD_UNIFORMS.uFlash.value;
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
const LIGHT_GLSL = /* glsl */ `
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
const KEY_GLSL = 'const vec3 KEY_DIR = vec3(0.4082, 0.8165, 0.4082);';

// A surface's display colour plus the creature light it catches, written out
const FINISH_GLSL = /* glsl */ `
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
const linearOf = (hex) => [16, 8, 0].map((shift) => srgbToLinear(((hex >> shift) & 0xff) / 255)); // eslint-disable-line no-bitwise
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

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
  uniform float uEnvTime;
  varying float vH;
  varying vec2 vCloudUv;
  varying vec4 vCloud; // the deck's colour here, and how much deck there is
  varying float vSheet; // how much of the sky's own glow lightning lifts
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
    // in toward a clear eye overhead.
    float r = length(position.xz) / (up + 0.12);
    vCloudUv = vec2(uv.x * 4.0 + uEnvTime * 0.004, r * 0.16 + uEnvTime * 0.007);
    vCloud = vec4(
      mix(CLOUD_LIT, CLOUD_DARK, smoothstep(0.1, 0.7, up)), // lit from the horizon
      smoothstep(0.0, 0.08, position.y) * smoothstep(0.25, 1.1, r) * (1.0 - smoothstep(4.5, 9.0, r)));
    vSheet = 0.12 * smoothstep(-0.05, 0.3, position.y);

    vec4 mvPosition = viewMatrix * vec4(cameraPosition + position * ${SKY_RADIUS.toFixed(1)}, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w * 0.99999; // at infinity: behind everything
    #include <clipping_planes_vertex>
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform float uEnvTime;
  uniform float uFlash;
  uniform sampler2D uCloud;
  uniform sampler2D uSkyRamp;
  varying float vH;
  varying vec2 vCloudUv;
  varying vec4 vCloud;
  varying float vSheet;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}

  void main() {
    #include <clipping_planes_fragment>
    vec3 col = texture2D(uSkyRamp, vec2(vH * 0.5 + 0.5, 0.5)).rgb;
    float n = texture2D(uCloud, vCloudUv).r * 0.65
            + texture2D(uCloud, vCloudUv * vec2(2.0, 2.3) + vec2(0.37, uEnvTime * 0.004)).r * 0.35;
    float deck = smoothstep(0.42, 0.68, n) * vCloud.a;
    col = mix(col, vCloud.rgb, deck * 0.85);
    // Sheet lightning lights the deck from inside: its thin parts most
    float thin = deck * (1.0 - smoothstep(0.5, 0.8, n));
    col += FLASH * uFlash * (vSheet + 0.4 * thin);
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
const NO_LIGHT = new AreaLight();

// ---- Walls ----------------------------------------------------------------

// Wall boxes are 2.5 tall, their mesh centred 1.25 above their floor
const WALL_HEIGHT = 2.5;

const WALL_VERTEX = /* glsl */ `
  uniform vec4 uHideA;
  uniform float uHideLatA;
  uniform vec4 uHideB;
  uniform float uHideLatB;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vUp;
  #include <common>
  #include <clipping_planes_pars_vertex>
  ${WALL_HIDE_GLSL}

  void main() {
    mat4 model = modelMatrix;
    #ifdef USE_INSTANCING
      model = modelMatrix * instanceMatrix;
    #endif
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normal; // wall boxes are never rotated
    vUp = (position.y + ${(WALL_HEIGHT / 2).toFixed(3)}) / ${WALL_HEIGHT.toFixed(3)};
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #ifdef USE_INSTANCING
      // A door pass's eye-side walls (PortalView.wallHide): collapsed, so
      // the instance draws nothing — as hiding its own mesh did
      vec2 centre = (model * vec4(0.0, 0.0, 0.0, 1.0)).xz;
      if (wallHiddenBy(uHideA, uHideLatA, centre) || wallHiddenBy(uHideB, uHideLatB, centre)) {
        gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
      }
    #endif
    #include <clipping_planes_vertex>
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  uniform float uFlash;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vUp;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}
  ${KEY_GLSL}
  ${LIGHT_GLSL}
  ${FINISH_GLSL}

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormalW);
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
      col += HORIZON * glance * 0.1;
      // The pale rim along the top edge: walls silhouette against the sky.
      // Never thinner than about a pixel (no shimmer far off), and no
      // brighter in total for being widened
      float fw = fwidth(vUp);
      float width = max(0.018, fw * 1.2);
      float rim = smoothstep(1.0 - width - fw, 1.0 - width, vUp) * (0.018 / width);
      col = mix(col, WALL_RIM * (1.0 + 0.4 * uFlash), clamp(rim, 0.0, 1.0));
      col += FLASH * uFlash * 0.05 * vUp;
    }
    gl_FragColor = finish(col, creatureLight(vWorld, n));
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
    uniforms: { ...WORLD_UNIFORMS, ...light.uniforms, ...hideUniforms() },
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT,
    clipping: true,
    extensions: { derivatives: true },
  });
}

// ---- Floor ----------------------------------------------------------------

const FLOOR_VERTEX = /* glsl */ `
  attribute float aEdge;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vEdge;
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normal; // built in world space (Floor), never rotated
    vEdge = aEdge;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  uniform float uFlash;
  uniform sampler2D uCloud;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vEdge;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}
  ${KEY_GLSL}
  ${LIGHT_GLSL}
  ${FINISH_GLSL}

  void main() {
    #include <clipping_planes_fragment>
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
      // Polished: the horizon's glow on the far floor
      float glance = pow(1.0 - max(dot(n, v), 0.0), 5.0);
      col += HORIZON * glance * 0.18 * (1.0 + 1.5 * uFlash);
    } else if (n.y < -0.5) {
      col = SLAB_UNDER; // the underside of a storey you walk beneath
    } else {
      col = SLAB_SIDE * (0.8 + 0.3 * max(dot(n, KEY_DIR), 0.0));
    }
    gl_FragColor = finish(col, creatureLight(vWorld, n));
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
    uniforms: { ...WORLD_UNIFORMS, ...light.uniforms },
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
