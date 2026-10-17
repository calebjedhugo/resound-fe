/**
 * CreatureLook — a creature drawn as ball lightning (after Cixin Liu's
 * *Ball Lightning*). See DESIGN.md "Creature look".
 *
 * - SILENT: an unexcited macro-electron — a subtle soap-film BUBBLE: mostly
 *   transparent, Fresnel rim, faint thin-film shimmer, a slow surface wobble.
 *   Always findable (plinth pens depend on seeing creatures), never loud.
 * - SOUNDING: excited ball lightning — a glowing core with swirling internal
 *   filaments plus a soft additive halo. Each note ONSET flares; the glow
 *   decays to a sustain while the note holds and fades back to the bubble
 *   when the creature goes silent.
 * - Colour: Messiaen's colour of the harmony around the creature (main) with
 *   the dissonant added notes as reflection colours (core/messiaenColour).
 * - It FLOATS: the visual hovers above the floor with a gentle bob. Only
 *   the rendered object is offset — physics/collision never see it.
 *
 * Rendering constraints: no per-creature lights and no post-processing
 * (areas are re-rendered by portal passes into half-res targets), so the
 * glow is all ShaderMaterial + one additive billboard. Geometry AND both
 * materials are shared module-wide — one body and one halo ShaderMaterial
 * for every creature, flagged `userData.shared` so no dispose ever frees
 * them. Each creature owns only its uniform VALUES (this._uniforms), copied
 * into the shared material by each mesh's onBeforeRender just before it
 * draws (per-creature materials made three re-derive 2 programs per creature
 * at every main <-> portal pass switch). Both materials honour the renderer's
 * clipping planes so portal passes clip them like everything else; their
 * programs are compiled up front by core/ShaderPrewarm.
 *
 * Animation is driven by update(deltaTime) — visual envelopes only; musical
 * timing (when a note starts/ends) is decided by the Creature from the
 * musical clock.
 */
import * as THREE from 'three';
import { CREATURE_HOVER_HEIGHT } from 'core/constants';

// Gentle bob of the floating visual (world units, seconds)
const BOB_AMPLITUDE = 0.08;
const BOB_PERIOD = 3.4;

// Excitation envelope (seconds): onsets are instant; the flare decays to the
// sustain glow while a note holds; silence fades back to the bubble.
const SUSTAIN_GLOW = 0.6; // glow while a note holds, after the onset flare
const FLARE_TAU = 0.22; // onset flare decay
const RELEASE_TAU = 0.2; // fade back to the bubble after the last note ends
const ATTACK_TIME = 0.05; // ramp-up if a note is sounding without a seen onset
const COLOUR_TAU = 0.12; // harmony colour transition
const FLASH_HOLD = 0.1; // clap flash: full white this long...
const FLASH_TAU = 0.05; // ...then a quick fade
const LIGHT_FROM_DARK = 0.05; // below this a fresh onset snaps (no colour lerp)

// Halo radius as a multiple of the body radius (sustain → peak of the flare)
const HALO_RADIUS = 2.3;
const HALO_FLARE_GROWTH = 0.9;

const MAX_REFLECTIONS = 3;

// Shared by every creature in every area — flagged so Entity.dispose (which
// frees a mesh tree's resources) never frees them
const BODY_GEOMETRY = new THREE.SphereGeometry(1, 48, 32);
const HALO_GEOMETRY = new THREE.PlaneGeometry(2, 2); // unit-radius quad
BODY_GEOMETRY.userData.shared = true;
HALO_GEOMETRY.userData.shared = true;

const NOISE_GLSL = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
`;

const BODY_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uExcite;
  uniform float uSeed;
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  #include <common>
  #include <clipping_planes_pars_vertex>

  void main() {
    vec3 p = position;
    // Slow surface wobble: three travelling waves, a few % of the radius
    float w = sin(p.x * 3.0 + uTime * 1.10 + uSeed)
            + sin(p.y * 3.4 - uTime * 0.85 + uSeed * 1.7)
            + sin(p.z * 2.8 + uTime * 0.95 + uSeed * 2.3);
    p += normal * w * (0.012 + 0.016 * uExcite);
    vObj = position;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uExcite;
  uniform float uFlare;
  uniform float uFlash;
  uniform float uSeed;
  uniform vec3 uMain;
  uniform vec3 uRefl0;
  uniform vec3 uRefl1;
  uniform vec3 uRefl2;
  uniform vec3 uReflW;
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${NOISE_GLSL}

  vec3 rotY(vec3 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }
  float ridge(float n) { return 1.0 - abs(n * 2.0 - 1.0); }

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(vViewV);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float rim = 1.0 - ndv;
    float fres = rim * rim * rim;
    float edge = pow(rim, 2.5); // the bubble's rim is a little wider: findable
    float t = uTime;

    // ---- unexcited: a soap-film bubble ----
    float film = rim * 1.4 + vnoise(vObj * 2.2 + vec3(0.0, t * 0.12, uSeed)) * 0.8 + t * 0.03;
    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (film + vec3(0.0, 0.33, 0.67)));
    vec3 h = normalize(normalize(vec3(-0.35, 0.6, 0.7)) + v);
    float glint = pow(max(dot(n, h), 0.0), 80.0);
    vec3 bubbleCol = mix(vec3(0.92), irid, 0.7) * (0.3 + 1.1 * edge) + vec3(glint);
    float bubbleA = 0.07 + 0.7 * edge + 0.7 * glint;

    vec3 col = bubbleCol;
    float a = bubbleA;

    // ---- excited: ball lightning ----
    // Skipped outright while silent: uExcite is EXACTLY 0 then (the envelope
    // snaps to 0), and mix(bubble, lit, 0.0) is the bubble — so the silent
    // bubble no longer pays for ~10 noise lookups per pixel. (A branch on a
    // uniform: every pixel of the draw takes the same side.)
    if (uExcite > 0.0) {
      // Pseudo-volume: the swirl is sampled at two depths, counter-rotating
      vec3 p0 = rotY(vObj, t * 0.8 + uSeed);
      vec3 p1 = rotY(vObj * 0.6, -t * 1.1);
      vec3 warp = vec3(
        vnoise(p0 * 2.0 + t * 0.5),
        vnoise(p0 * 2.0 + 7.3 - t * 0.4),
        vnoise(p0 * 2.0 + 13.1 + t * 0.3));
      float filA = pow(ridge(vnoise(p0 * 2.6 + warp * 1.8)), 7.0);
      float rB = ridge(vnoise(p1 * 3.4 + warp * 1.4 + 3.0));
      float filB = pow(rB, 9.0);
      float depth = ndv * ndv; // path length through the ball
      float plasma = depth * (0.55 + 0.45 * vnoise(p1 * 4.0 + warp + t));

      // Dissonant added notes: each reflection colour owns drifting regions
      // of the ball — it tints the plasma there and rides wider strands.
      // With no reflection weight (the common case; weights snap to 0 as
      // they fade) reflCol and reflAmt are exactly 0, so skip the noise.
      vec3 reflCol = vec3(0.0);
      float reflAmt = 0.0;
      if (uReflW.x + uReflW.y + uReflW.z > 0.0) {
        float m0 = smoothstep(0.35, 0.7, vnoise(p0 * 1.5 + 21.0)) * uReflW.x;
        float m1 = smoothstep(0.35, 0.7, vnoise(p0 * 1.5 + 37.0)) * uReflW.y;
        float m2 = smoothstep(0.35, 0.7, vnoise(p0 * 1.5 + 53.0)) * uReflW.z;
        float mSum = m0 + m1 + m2;
        reflCol = (uRefl0 * m0 + uRefl1 * m1 + uRefl2 * m2) / max(mSum, 1e-4);
        reflAmt = clamp(mSum, 0.0, 1.0);
      }
      vec3 plasmaCol = mix(uMain, reflCol, reflAmt * 0.45);
      float reflFil = pow(rB, 4.0) * reflAmt;

      // Kept under 1.0 at sustain so the swirl stays readable; the onset
      // flare pushes it into a white-hot blaze
      vec3 litCol = plasmaCol * (0.16 + 0.5 * plasma) + uMain * filA * 0.9
                  + uMain * filB * 1.3 * (1.0 - reflAmt) + reflCol * reflFil * 1.6;
      litCol += vec3(pow(ndv, 6.0) * (0.04 + 0.55 * uFlare)); // white-hot heart, hottest at onset
      litCol += uMain * fres * 0.6; // corona at the limb
      litCol *= 0.85 + 0.75 * uFlare;
      float litA = clamp(0.45 + 0.55 * depth + filA + filB, 0.0, 1.0);

      col = mix(bubbleCol, litCol, uExcite);
      a = mix(bubbleA, litA, uExcite);
    }
    col = mix(col, vec3(1.0), uFlash); // clap flash
    a = mix(a, 1.0, uFlash);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

// Camera-facing halo quad, built in the vertex shader so every render camera
// (player, portal, mirror sweep) gets its own billboard. The quad is pulled
// toward the eye by about the body radius (scaled so its screen footprint is
// unchanged) to clear the sphere and nearby walls, and fades out as it nears
// the creature's floor so the floor never slices it with a hard edge.
const HALO_VERTEX = /* glsl */ `
  uniform float uPull;
  varying vec2 vUv;
  varying float vWorldY;
  #include <common>
  #include <clipping_planes_pars_vertex>

  void main() {
    vUv = uv;
    float radius = length(modelMatrix[0].xyz);
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float dist = length(centre.xyz);
    float pull = min(uPull, max(dist - 0.2, 0.0));
    float k = (dist - pull) / max(dist, 1e-4);
    vec4 mvPosition = vec4((centre.xyz + vec3(position.xy * radius, 0.0)) * k, 1.0);

    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 worldCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 worldPt = worldCentre + (right * position.x + up * position.y) * radius;
    vWorldY = (cameraPosition + (worldPt - cameraPosition) * k).y;

    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uFloorY;
  uniform vec3 uMain;
  uniform vec3 uRefl0;
  uniform vec3 uRefl1;
  uniform vec3 uRefl2;
  uniform vec3 uReflW;
  varying vec2 vUv;
  varying float vWorldY;
  #include <common>
  #include <clipping_planes_pars_fragment>

  void main() {
    #include <clipping_planes_fragment>
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r >= 1.0) discard;
    float glow = exp(-r * r * 4.0) * (1.0 - r);
    // Reflections orbit the halo as coloured arcs
    float ang = atan(q.y, q.x) + uTime * 0.9;
    float a0 = uReflW.x * smoothstep(0.1, 0.9, sin(ang));
    float a1 = uReflW.y * smoothstep(0.1, 0.9, sin(ang + 2.094));
    float a2 = uReflW.z * smoothstep(0.1, 0.9, sin(ang + 4.189));
    float aSum = a0 + a1 + a2;
    vec3 tint = (uRefl0 * a0 + uRefl1 * a1 + uRefl2 * a2) / max(aSum, 1e-4);
    float ring = smoothstep(0.15, 0.5, r);
    vec3 col = mix(uMain, tint, clamp(aSum * ring, 0.0, 0.9));
    float floorFade = smoothstep(uFloorY, uFloorY + 0.6, vWorldY);
    gl_FragColor = vec4(col, glow * uIntensity * floorFade * 1.3);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

// ONE material per pass type for every creature, in every area. The values
// here are placeholders: each mesh's onBeforeRender writes its creature's
// values in just before the draw (bindBody / bindHalo).
const colourUniforms = () => ({
  uMain: { value: new THREE.Vector3(1, 1, 1) },
  uRefl0: { value: new THREE.Vector3(1, 1, 1) },
  uRefl1: { value: new THREE.Vector3(1, 1, 1) },
  uRefl2: { value: new THREE.Vector3(1, 1, 1) },
  uReflW: { value: new THREE.Vector3(0, 0, 0) },
});
const BODY_MATERIAL = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uExcite: { value: 0 },
    uFlare: { value: 0 },
    uFlash: { value: 0 },
    uSeed: { value: 0 },
    ...colourUniforms(),
  },
  vertexShader: BODY_VERTEX,
  fragmentShader: BODY_FRAGMENT,
  transparent: true,
  depthWrite: false,
  clipping: true,
});
const HALO_MATERIAL = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uFloorY: { value: 0 },
    uPull: { value: 1 },
    ...colourUniforms(),
  },
  vertexShader: HALO_VERTEX,
  fragmentShader: HALO_FRAGMENT,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  clipping: true,
});
BODY_MATERIAL.userData.shared = true;
HALO_MATERIAL.userData.shared = true;

const copyColours = (to, from) => {
  to.uMain.value.copy(from.uMain.value);
  to.uRefl0.value.copy(from.uRefl0.value);
  to.uRefl1.value.copy(from.uRefl1.value);
  to.uRefl2.value.copy(from.uRefl2.value);
  to.uReflW.value.copy(from.uReflW.value);
};

// Write one creature's values into the shared material right before three
// draws its mesh (Object3D.onBeforeRender runs ahead of program setup).
// uniformsNeedUpdate makes three upload them even when the previous draw used
// the same material (two silent bodies in a row); its uniform cache skips the
// GL call for any value that didn't change.
function bindBody(look) {
  const to = BODY_MATERIAL.uniforms;
  const from = look._uniforms;
  to.uTime.value = from.uTime.value;
  to.uExcite.value = from.uExcite.value;
  to.uFlare.value = from.uFlare.value;
  to.uFlash.value = from.uFlash.value;
  to.uSeed.value = from.uSeed.value;
  copyColours(to, from);
  BODY_MATERIAL.uniformsNeedUpdate = true;
}

function bindHalo(look) {
  const to = HALO_MATERIAL.uniforms;
  const from = look._uniforms;
  to.uTime.value = from.uTime.value;
  to.uIntensity.value = from.uIntensity.value;
  to.uFloorY.value = from.uFloorY.value;
  to.uPull.value = from.uPull.value;
  copyColours(to, from);
  HALO_MATERIAL.uniformsNeedUpdate = true;
}

const NOOP = () => {};

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB hex → linear [r, g, b] written into `out` (the renderer encodes back to sRGB on output). */
function hexToLinearInto(hex, out) {
  out[0] = srgbToLinear(((hex >> 16) & 0xff) / 255); // eslint-disable-line no-bitwise
  out[1] = srgbToLinear(((hex >> 8) & 0xff) / 255); // eslint-disable-line no-bitwise
  out[2] = srgbToLinear((hex & 0xff) / 255); // eslint-disable-line no-bitwise
  return out;
}

const copy3 = (to, from) => {
  for (let i = 0; i < 3; i += 1) to[i] = from[i];
};

const lerp3 = (from, to, a) => {
  for (let i = 0; i < 3; i += 1) from[i] += (to[i] - from[i]) * a;
};

/** Same colour target? (Cached harmonies are shared objects: usually `a === b`.) */
function sameHarmony(a, b) {
  if (a === b) return true;
  if (a.main !== b.main || a.reflections.length !== b.reflections.length) return false;
  for (let i = 0; i < a.reflections.length; i += 1) {
    if (a.reflections[i] !== b.reflections[i]) return false;
  }
  return true;
}

class CreatureLook {
  /**
   * @param {number} size - body radius in world units
   */
  constructor(size) {
    this.size = size;

    // Envelope state (visual only)
    this._lit = 0; // 0 bubble .. 1 ball lightning
    this._flare = 0; // onset flare, decays while the note holds
    this._flash = 0; // clap flash
    this._flashHold = 0;
    this._snapColour = true; // first light takes its colour without a lerp
    this._time = Math.random() * 100;
    this._bobPhase = Math.random() * Math.PI * 2;

    // Colour state (linear RGB) — current values lerp toward targets
    this._main = [1, 1, 1];
    this._mainTarget = [1, 1, 1];
    this._reflections = Array.from({ length: MAX_REFLECTIONS }, () => ({
      colour: [1, 1, 1],
      target: [1, 1, 1],
      weight: 0,
      weightTarget: 0,
    }));
    this._harmony = null; // last {main, reflections} hex target

    // THIS creature's uniform values (body + halo). Not attached to any
    // material: bindBody/bindHalo copy them into the shared materials as
    // each mesh draws.
    this._uniforms = {
      uTime: { value: this._time },
      uExcite: { value: 0 },
      uFlare: { value: 0 },
      uFlash: { value: 0 },
      uSeed: { value: Math.random() * 10 },
      uIntensity: { value: 0 },
      uFloorY: { value: 0 },
      uPull: { value: size },
      ...colourUniforms(),
    };

    this.body = new THREE.Mesh(BODY_GEOMETRY, BODY_MATERIAL);
    this.body.scale.set(size, size, size);
    this.body.onBeforeRender = () => bindBody(this);
    this.halo = new THREE.Mesh(HALO_GEOMETRY, HALO_MATERIAL);
    this.halo.onBeforeRender = () => bindHalo(this);
    // (No renderOrder: body and halo share a depth, so three's stable sort
    // draws the body — created first — before its halo, while creatures still
    // sort back-to-front against every other transparent in the scene. The
    // transparent sort never looks at the material, so sharing it changes
    // nothing here.)
    this.halo.visible = false;

    // root (physics position + hover) → float (bob) → body + halo
    this.float = new THREE.Group();
    this.float.add(this.body);
    this.float.add(this.halo);
    this.object = new THREE.Group();
    this.object.add(this.float);
    this._applyBob();
  }

  /**
   * Place the visual over a physics position (the creature's floor point):
   * the body hovers CREATURE_HOVER_HEIGHT above resting on the floor. The
   * ONLY way the creature's rendered position is set.
   * @param {{x:number, y:number, z:number}} position
   */
  place(position) {
    this.object.position.set(
      position.x,
      position.y + this.size + CREATURE_HOVER_HEIGHT,
      position.z
    );
    this._uniforms.uFloorY.value = position.y;
  }

  /** A note of this creature just began: light up and flare. */
  noteOn() {
    if (this._lit < LIGHT_FROM_DARK) this._snapColour = true;
    this._lit = 1;
    this._flare = 1;
  }

  /** Clap: a brief white flash. */
  flash() {
    this._flash = 1;
    this._flashHold = FLASH_HOLD;
  }

  /**
   * Overall glow: 0 = the silent bubble; > 0 while lit, highest at a note's
   * onset, settling to the sustain glow while the note holds.
   */
  get glow() {
    return this._lit * (SUSTAIN_GLOW + (1 - SUSTAIN_GLOW) * this._flare);
  }

  /** The harmony colour the look is showing/moving toward ({main, reflections} hex). */
  get harmonyColour() {
    return this._harmony;
  }

  /**
   * Advance the look one frame. Allocation-free in the steady state (it runs
   * for every creature every frame).
   * @param {number} deltaTime - seconds
   * @param {boolean} sounding - is any note of the creature sounding now?
   * @param {?{main:number, reflections:number[]}} harmony - target colour
   *   (core/messiaenColour); ignored when null (keeps the last colour). Only
   *   read, never kept beyond the next change or mutated
   */
  update(deltaTime, sounding, harmony = null) {
    const dt = Math.max(0, Math.min(deltaTime, 0.1));
    this._time += dt;
    this._bobPhase += (dt * Math.PI * 2) / BOB_PERIOD;

    if (sounding) {
      this._lit = Math.min(1, this._lit + dt / ATTACK_TIME);
    } else {
      this._lit *= Math.exp(-dt / RELEASE_TAU);
      if (this._lit < 1e-3) this._lit = 0;
    }
    this._flare *= Math.exp(-dt / FLARE_TAU);
    if (this._flashHold > 0) {
      this._flashHold -= dt;
    } else {
      this._flash *= Math.exp(-dt / FLASH_TAU);
      if (this._flash < 1e-3) this._flash = 0;
    }

    if (harmony && harmony.main !== null) this._setHarmony(harmony);
    this._advanceColour(dt);
    this._applyBob();
    this._writeUniforms();
  }

  _setHarmony(harmony) {
    const prev = this._harmony;
    if (prev && sameHarmony(prev, harmony) && !this._snapColour) return;
    this._harmony = harmony;
    const snap = this._snapColour;
    this._snapColour = false;
    hexToLinearInto(harmony.main, this._mainTarget);
    if (snap) copy3(this._main, this._mainTarget);
    for (let i = 0; i < MAX_REFLECTIONS; i += 1) {
      const slot = this._reflections[i];
      const hex = harmony.reflections[i];
      if (hex === undefined) {
        slot.weightTarget = 0;
        if (snap) slot.weight = 0;
      } else {
        hexToLinearInto(hex, slot.target);
        slot.weightTarget = 1;
        // A slot lighting up from nothing takes its colour outright
        if (snap || slot.weight < 0.05) copy3(slot.colour, slot.target);
        if (snap) slot.weight = 1;
      }
    }
  }

  _advanceColour(dt) {
    const a = 1 - Math.exp(-dt / COLOUR_TAU);
    lerp3(this._main, this._mainTarget, a);
    for (let i = 0; i < MAX_REFLECTIONS; i += 1) {
      const slot = this._reflections[i];
      lerp3(slot.colour, slot.target, a);
      slot.weight += (slot.weightTarget - slot.weight) * a;
      // A fading reflection lands on exactly 0 (an exponential never would):
      // the body shader skips all reflection work at zero total weight, and
      // a thousandth of a reflection was never visible
      if (slot.weightTarget === 0 && slot.weight < 1e-3) slot.weight = 0;
    }
  }

  _applyBob() {
    this.float.position.y = Math.sin(this._bobPhase) * BOB_AMPLITUDE;
  }

  _writeUniforms() {
    const u = this._uniforms;
    const { glow } = this;
    u.uTime.value = this._time;
    u.uExcite.value = this._lit;
    u.uFlare.value = this._flare;
    u.uFlash.value = this._flash;
    u.uIntensity.value = glow;
    u.uMain.value.set(this._main[0], this._main[1], this._main[2]);
    // Indexed, not destructured: no iterator per creature per frame
    const refl = this._reflections;
    const c0 = refl[0].colour;
    const c1 = refl[1].colour;
    const c2 = refl[2].colour;
    u.uRefl0.value.set(c0[0], c0[1], c0[2]);
    u.uRefl1.value.set(c1[0], c1[1], c1[2]);
    u.uRefl2.value.set(c2[0], c2[1], c2[2]);
    u.uReflW.value.set(refl[0].weight, refl[1].weight, refl[2].weight);

    const haloRadius = this.size * (HALO_RADIUS + HALO_FLARE_GROWTH * this._flare);
    this.halo.scale.set(haloRadius, haloRadius, haloRadius);
    this.halo.visible = glow > 0.002;
  }

  /**
   * Nothing per-creature lives on the GPU: geometry and both materials are
   * shared module-wide (flagged userData.shared, so Entity.dispose skips them
   * too). Unhook the uniform binding so the meshes stop referencing us.
   */
  dispose() {
    this.body.onBeforeRender = NOOP;
    this.halo.onBeforeRender = NOOP;
  }
}

export default CreatureLook;
