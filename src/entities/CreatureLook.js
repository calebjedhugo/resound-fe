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
import { CUT_FRAGMENT_GLSL } from 'entities/CutawayLook';

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
const LIGHT_FROM_DARK = 0.05; // below this a fresh onset snaps (no colour lerp)
const SWIRL_ONSET_RUSH = 2.5; // swirl speed-up at an onset (x1 + this), decaying with the flare

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

// The pole drawing a creature in (core/AbsorbManager), in the body's object
// space (the unit sphere): every point travels into the pole's tip `tip`,
// the side nearest it first and the far side last — `lead` orders them —
// along a narrowing, twisting funnel, so the body is pulled out into a
// teardrop whose point is the tip, never shrunk where it stands. s = 0 is
// the creature, s = 1 every point at the tip; a release runs it backwards
// (the far side pours out first, the near side leaves the tip last).
// suckPoint below is its JS twin — change both.
const SUCK_GLSL = /* glsl */ `
  float suckLocal(vec3 p, vec3 axis, float s) {
    float lead = 0.5 + 0.5 * dot(normalize(p), axis);
    float k = clamp(s * 2.0 - (1.0 - lead), 0.0, 1.0);
    return k * k * (3.0 - 2.0 * k);
  }
  vec3 suckInto(vec3 p, vec3 tip, float s) {
    vec3 axis = normalize(tip);
    float e = suckLocal(p, axis, s);
    float tipAlong = length(tip);
    float along = dot(p, axis);
    vec3 lateral = p - axis * along;
    // The bulk leans toward the tip before its own turn comes
    float travel = min(1.0, e + s * (1.0 - e) * 0.2);
    float newAlong = mix(along, tipAlong, travel);
    // A funnel: the girth closes faster than the point travels, twisting
    float squeeze = (1.0 - e) * (1.0 - e);
    float ang = e * 1.1;
    vec3 swirl = lateral * cos(ang) + cross(axis, lateral) * sin(ang);
    return axis * newAlong + swirl * squeeze;
  }
`;

const BODY_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uExcite;
  uniform float uSeed;
  uniform float uSuck;
  uniform vec3 uTip;
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying float vDraw;
  #include <common>
  #include <clipping_planes_pars_vertex>
  ${SUCK_GLSL}

  void main() {
    vec3 p = position;
    // Slow surface wobble: three travelling waves, a few % of the radius
    float w = sin(p.x * 3.0 + uTime * 1.10 + uSeed)
            + sin(p.y * 3.4 - uTime * 0.85 + uSeed * 1.7)
            + sin(p.z * 2.8 + uTime * 0.95 + uSeed * 2.3);
    p += normal * w * (0.012 + 0.016 * uExcite);
    // The look (noise, film) rides the undeformed surface
    vObj = position;
    vec3 n = normal;
    vDraw = 0.0;
    if (uSuck > 0.0) {
      // Drawn into the pole's tip; the normal of the deformed surface by
      // finite differences along two tangents
      vec3 q = suckInto(p, uTip, uSuck);
      vec3 t1 = normalize(cross(normal, abs(normal.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 t2 = cross(normal, t1);
      vec3 da = suckInto(p + t1 * 0.02, uTip, uSuck) - q;
      vec3 db = suckInto(p + t2 * 0.02, uTip, uSuck) - q;
      vec3 dn = cross(da, db);
      float len = length(dn);
      if (len > 1e-10) n = dot(dn, normal) < 0.0 ? -dn / len : dn / len;
      vDraw = suckLocal(p, normalize(uTip), uSuck);
      p = q;
    }
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * n);
    vViewV = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const BODY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uExcite;
  uniform float uFlare;
  uniform float uSeed;
  uniform float uLum;
  uniform float uFlicker;
  uniform float uFleckW;
  uniform float uRainbow;
  uniform float uOpal;
  uniform float uDensity;
  uniform vec3 uFleck;
  uniform vec3 uMain;
  uniform vec3 uAccent;
  uniform vec3 uGlow;
  uniform vec3 uComp;
  uniform vec3 uRefl0;
  uniform vec3 uRefl1;
  uniform vec3 uRefl2;
  uniform vec3 uReflW;
  uniform float uSuck;
  uniform float uGhost; // the editor's cutaway (CutawayLook): 1 = a ghost
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying float vDraw;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${NOISE_GLSL}
  ${CUT_FRAGMENT_GLSL}

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
    // The editor's cutaway: a ghost keeps its rim (its outline) and a
    // screen door of the rest
    if (uGhost > 0.5 && ndv > 0.35 && cutDropped()) discard;
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
      float pn = vnoise(p1 * 4.0 + warp + t);
      float plasma = depth * (0.55 + 0.45 * pn);

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
        // Capped: however many notes are added, the triad's own colour
        // stays dominant (Messiaen's "a little gold")
        reflAmt = clamp(mSum, 0.0, 0.6);
      }
      vec3 plasmaCol = mix(uMain, reflCol, reflAmt * 0.45);
      float reflFil = pow(rB, 4.0) * reflAmt;

      // The plasma is the colour's ground (uMain), the filaments its light
      // (uAccent), the corona and halo its glow (uGlow) — one hue, lifted,
      // unless Messiaen named two colours: "black-gold" is a black body
      // with gold filaments and only a dim gold glow. Kept under 1.0 at
      // sustain so the swirl stays readable.
      vec3 litCol = plasmaCol * (0.16 + 0.5 * plasma) + uAccent * filA * 0.9
                  + uAccent * filB * 1.3 * (1.0 - 0.5 * reflAmt) + reflCol * reflFil * 1.6;
      litCol += uGlow * fres * 0.6; // corona at the limb
      // Flecks: the sparse second colour of Messiaen's chord descriptions
      // ("brown with gold stars"), as glints riding the swirl — rainbow for
      // F# major, "a sparkling of all possible colours"
      if (uFleckW > 0.0) {
        float glint = pow(ridge(vnoise(p0 * 7.0 + warp * 2.0 + t * 0.7)), 10.0);
        // A second colour is a scatter of stars, never a web: the triad
        // keeps one dominant hue. F#'s sparkle of all colours stays dense.
        float stars = uRainbow < 1.0 ? smoothstep(0.62, 0.82, vnoise(p1 * 3.0 + 41.0 + t * 0.25)) : 1.0;
        glint *= mix(stars, 1.0, uRainbow);
        vec3 fleckCol = uFleck;
        if (uRainbow > 0.0) {
          // Hue phase from the plasma noise already at hand
          vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (pn * 2.0 + warp.y + vec3(0.0, 0.33, 0.67)));
          fleckCol = mix(uFleck, rainbow, uRainbow);
        }
        litCol += fleckCol * glint * 1.4 * uFleckW;
        // ...and F#'s whole surface shimmers with every colour, not only
        // its glints: unmistakable at any distance
        litCol = mix(litCol, litCol * (0.55 + 0.9 * irid), 0.45 * uRainbow * uFleckW);
      }
      // A lone note is all but uncoloured: a milky, opaline light (only a
      // faint play of the bubble's film) over the faint tint of its
      // resonance — never a rainbow, which is F# major's alone
      if (uOpal > 0.0) {
        vec3 opalCol = mix(vec3(0.82), irid, 0.15);
        float level = max(max(max(litCol.r, litCol.g), litCol.b), 0.5);
        litCol = mix(litCol, opalCol * level, uOpal * 0.5);
      }
      // Dissonance: the painter's complement of the light flares in a
      // fringe at the limb, pale and intermittent — it bursts out, goes
      // out, bursts out again (Messiaen's red-on-white afterimage). The
      // bursts are timed on the CPU (uFlicker); 0 between them and when
      // consonant, which skips this.
      if (uFlicker > 0.0) {
        litCol = mix(litCol, uComp, clamp(pow(rim, 3.0) * uFlicker * 1.6, 0.0, 0.85));
      }
      // The onset flare brightens the COLOUR. A channel pushed over 1.0
      // pulls the whole colour back by its peak, so orange blazes as orange
      // instead of clipping toward yellow-white
      litCol *= 0.85 + 0.75 * uFlare;
      litCol /= max(max(max(litCol.r, litCol.g), litCol.b), 1.0);
      // Register (uLum): higher is graded toward white, lower is pulled
      // down by black — lightness only, the hue stays
      litCol = uLum >= 1.0 ? mix(litCol, vec3(1.0), uLum - 1.0) : litCol * uLum;
      // A small hot heart, hottest at the onset — heated toward the
      // creature's own light, not white: black-gold flares gold, dark red
      // red (and a dense body bleaches least)
      vec3 heat = mix(uAccent / max(max(max(uAccent.r, uAccent.g), uAccent.b), 1e-3), vec3(1.0), 0.35);
      litCol = mix(litCol, heat, pow(ndv, 8.0) * (0.04 + 0.4 * uFlare) * (1.0 - 0.6 * uDensity));
      // Dark and grey bodies are dense (uDensity, from the table colour):
      // smoke and pewter, not the floor showing through glass
      float litA = clamp(0.45 + 0.55 * depth + filA + filB + uDensity, 0.0, 1.0);

      col = mix(bubbleCol, litCol, uExcite);
      a = mix(bubbleA, litA, uExcite);
    }
    // On the pole: the body glows in its own light as it is drawn in, the
    // stretch nearest the tip brightest (energy pouring into the pole)
    if (uSuck > 0.0) {
      float energy = min(1.0, uSuck * 5.0) * (0.35 + 0.65 * vDraw);
      col = mix(col, uGlow * (0.6 + 0.6 * vDraw) + vec3(0.15 * vDraw), energy * 0.8);
      a = mix(a, 0.45 + 0.5 * vDraw, energy);
    }
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
  uniform float uLum;
  uniform vec3 uGlow;
  uniform vec3 uRefl0;
  uniform vec3 uRefl1;
  uniform vec3 uRefl2;
  uniform vec3 uReflW;
  uniform float uGhost;
  varying vec2 vUv;
  varying float vWorldY;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${CUT_FRAGMENT_GLSL}

  void main() {
    #include <clipping_planes_fragment>
    if (uGhost > 0.5 && cutDropped()) discard;
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r >= 1.0) discard;
    // Strongest around the body, weaker across its face: the aura must not
    // wash out the body's own colour (a dark red stays dark)
    float glow = exp(-r * r * 4.0) * (1.0 - r) * mix(0.3, 1.0, smoothstep(0.25, 0.5, r));
    // Reflections orbit the halo as coloured arcs
    float ang = atan(q.y, q.x) + uTime * 0.9;
    float a0 = uReflW.x * smoothstep(0.1, 0.9, sin(ang));
    float a1 = uReflW.y * smoothstep(0.1, 0.9, sin(ang + 2.094));
    float a2 = uReflW.z * smoothstep(0.1, 0.9, sin(ang + 4.189));
    float aSum = a0 + a1 + a2;
    vec3 tint = (uRefl0 * a0 + uRefl1 * a1 + uRefl2 * a2) / max(aSum, 1e-4);
    float ring = smoothstep(0.15, 0.5, r);
    vec3 col = mix(uGlow, tint, clamp(aSum * ring, 0.0, 0.9));
    float floorFade = smoothstep(uFloorY, uFloorY + 0.6, vWorldY);
    gl_FragColor = vec4(col, glow * uIntensity * uLum * floorFade * 1.3);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

// ONE material per pass type for every creature, in every area. The values
// here are placeholders: each mesh's onBeforeRender writes its creature's
// values in just before the draw (bindBody / bindHalo).
const colourUniforms = () => ({
  uLum: { value: 1 },
  uFlicker: { value: 0 },
  uFleckW: { value: 0 },
  uRainbow: { value: 0 },
  uOpal: { value: 0 },
  uDensity: { value: 0 },
  uFleck: { value: new THREE.Vector3(1, 1, 1) },
  uMain: { value: new THREE.Vector3(1, 1, 1) },
  uAccent: { value: new THREE.Vector3(1, 1, 1) },
  uGlow: { value: new THREE.Vector3(1, 1, 1) },
  uComp: { value: new THREE.Vector3(1, 1, 1) },
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
    uSeed: { value: 0 },
    uSuck: { value: 0 },
    uTip: { value: new THREE.Vector3(0, 0, 1) },
    uGhost: { value: 0 },
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
    uGhost: { value: 0 },
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

// The halo reads only these
const copyHaloColours = (to, from) => {
  to.uLum.value = from.uLum.value;
  to.uGlow.value.copy(from.uGlow.value);
  to.uRefl0.value.copy(from.uRefl0.value);
  to.uRefl1.value.copy(from.uRefl1.value);
  to.uRefl2.value.copy(from.uRefl2.value);
  to.uReflW.value.copy(from.uReflW.value);
};

const copyColours = (to, from) => {
  to.uLum.value = from.uLum.value;
  to.uFlicker.value = from.uFlicker.value;
  to.uFleckW.value = from.uFleckW.value;
  to.uRainbow.value = from.uRainbow.value;
  to.uOpal.value = from.uOpal.value;
  to.uDensity.value = from.uDensity.value;
  to.uFleck.value.copy(from.uFleck.value);
  to.uMain.value.copy(from.uMain.value);
  to.uAccent.value.copy(from.uAccent.value);
  to.uGlow.value.copy(from.uGlow.value);
  to.uComp.value.copy(from.uComp.value);
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
  to.uSeed.value = from.uSeed.value;
  to.uSuck.value = from.uSuck.value;
  to.uGhost.value = from.uGhost.value;
  if (from.uSuck.value > 0) to.uTip.value.copy(from.uTip.value);
  // The rest is read only by the lit branch (uExcite > 0) and the pole's
  // glow (uSuck > 0): a silent bubble leaves the last lit creature's values
  // in place, so three uploads none
  if (from.uExcite.value > 0 || from.uSuck.value > 0) {
    to.uFlare.value = from.uFlare.value;
    copyColours(to, from);
  }
  BODY_MATERIAL.uniformsNeedUpdate = true;
}

function bindHalo(look) {
  const to = HALO_MATERIAL.uniforms;
  const from = look._uniforms;
  to.uTime.value = from.uTime.value;
  to.uIntensity.value = from.uIntensity.value;
  to.uFloorY.value = from.uFloorY.value;
  to.uPull.value = from.uPull.value;
  to.uGhost.value = from.uGhost.value;
  copyHaloColours(to, from);
  HALO_MATERIAL.uniformsNeedUpdate = true;
}

const NOOP = () => {};

const smooth01 = (k) => k * k * (3 - 2 * k);

/**
 * The body vertex shader's suckInto, in JS (its twin — change both): where
 * the unit-sphere point `p` is drawn to with the pole's tip at `tip` (both
 * object space), `s` of the way in. Written into `out` ({x, y, z}).
 * @returns {{x:number, y:number, z:number}} out
 */
export function suckPoint(p, tip, s, out = { x: 0, y: 0, z: 0 }) {
  if (s <= 0) {
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    return out;
  }
  const tipLen = Math.hypot(tip.x, tip.y, tip.z);
  const ax = tip.x / tipLen;
  const ay = tip.y / tipLen;
  const az = tip.z / tipLen;
  const pLen = Math.hypot(p.x, p.y, p.z) || 1;
  const lead = 0.5 + 0.5 * ((p.x * ax + p.y * ay + p.z * az) / pLen);
  const e = smooth01(Math.min(1, Math.max(0, s * 2 - (1 - lead))));
  const along = p.x * ax + p.y * ay + p.z * az;
  const lx = p.x - ax * along;
  const ly = p.y - ay * along;
  const lz = p.z - az * along;
  const travel = Math.min(1, e + s * (1 - e) * 0.2);
  const newAlong = along + (tipLen - along) * travel;
  const squeeze = (1 - e) * (1 - e);
  const c = Math.cos(e * 1.1);
  const sn = Math.sin(e * 1.1);
  // cross(axis, lateral)
  const cx = ay * lz - az * ly;
  const cy = az * lx - ax * lz;
  const cz = ax * ly - ay * lx;
  out.x = ax * newAlong + (lx * c + cx * sn) * squeeze;
  out.y = ay * newAlong + (ly * c + cy * sn) * squeeze;
  out.z = az * newAlong + (lz * c + cz * sn) * squeeze;
  return out;
}

// The dissonance fringe's bursts: smooth 1D value noise over time, the same
// for every pixel of a draw — so worked out here, once per creature per
// frame, not per fragment
const hash1 = (n) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  return hash1(i) + (hash1(i + 1) - hash1(i)) * f * f * (3 - 2 * f);
}
function flickerBurst(time, seed) {
  const k = Math.min(1, Math.max(0, (noise1(time * 2.7 + seed * 13.1) - 0.45) / 0.25));
  return k * k * (3 - 2 * k);
}

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

/**
 * Ease a weight toward its target; one fading to 0 lands on EXACTLY 0 (an
 * exponential never would), so the shader skips that layer's work outright.
 */
const easeToZero = (value, target, a) => {
  const next = value + (target - value) * a;
  return target === 0 && next < 1e-3 ? 0 : next;
};

/**
 * Scale a linear colour's chroma in place, in OKLab: lightness and hue are
 * held, only colourfulness changes — < 1 for a lone note or an interval
 * (never a muddy grey drift in RGB), > 1 for the added sixth's deeper
 * colour (clamped to the displayable range).
 */
function saturate3(c, chroma) {
  if (chroma === 1) return c;
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * chroma;
  const B = (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s) * chroma;
  const l3 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m3 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s3 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  c[0] = clamp01(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  c[1] = clamp01(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  c[2] = clamp01(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);
  return c;
}

// A lone note's LIGHT (filaments, glow) lifts toward a pale pearly light by
// this much at full opal; its body keeps its own lightness — Messiaen's
// uncoloured is luminous, never a muddy grey
const PEARL = 0.8;
const PEARL_LIFT = 0.35;
const liftToPearl = (c, amount) => {
  for (let i = 0; i < 3; i += 1) c[i] += (PEARL - c[i]) * amount;
  return c;
};

/**
 * How dense a body colour is, from the TABLE colour (before any fade): a
 * dark body is smoke, not glass (black-gold must read black over a bright
 * floor), and a named grey reads as pewter, not a clear bubble.
 */
const scratchLinear = [0, 0, 0];
function densityOf(hex) {
  const c = hexToLinearInto(hex, scratchLinear);
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const darkness = 1 - Math.min(1, lum * 4);
  const max = Math.max(c[0], c[1], c[2]);
  const saturation = max > 0 ? (max - Math.min(c[0], c[1], c[2])) / max : 0;
  const greyness = Math.min(1, Math.max(0, (0.3 - saturation) / 0.2));
  return 0.4 * darkness + 0.25 * greyness;
}

const accentOf = (harmony) => (harmony.accent === undefined ? harmony.main : harmony.accent);
const glowOf = (harmony) => (harmony.glow === undefined ? accentOf(harmony) : harmony.glow);
const chromaOf = (harmony) => (harmony.chroma === undefined ? 1 : harmony.chroma);
const fleckOf = (harmony) => (harmony.fleck === undefined ? null : harmony.fleck);
const rainbowOf = (harmony) => (harmony.rainbow === undefined ? 0 : harmony.rainbow);
// How opaline (uncoloured) a faded light is: a lone note's chroma is fully
// so; an interval (0.85) and a chord are not at all
const OPAL_FROM = 0.85;
const OPAL_SPAN = 0.4;
const opalOf = (chroma) => Math.min(1, Math.max(0, (OPAL_FROM - chroma) / OPAL_SPAN));
/**
 * The LIGHT a harmony glows with, as a lit creature shows it (its glow
 * colour, chroma faded in OKLab, a lone note lifted toward pearl): linear
 * rgb written into `out`. The sky's answer to a gate being solved
 * (EnvironmentLook) takes its colour from here, so it is the same light.
 * @param {object} harmony - core/messiaenColour's answer (main not null)
 * @param {number[]|Float32Array} out
 */
export function harmonyLightInto(harmony, out) {
  const chroma = chromaOf(harmony);
  return liftToPearl(
    saturate3(hexToLinearInto(glowOf(harmony), out), chroma),
    PEARL_LIFT * opalOf(chroma)
  );
}

/** How fast a creature's colour follows a change of harmony (seconds). */
export const HARMONY_COLOUR_TAU = COLOUR_TAU;

const dissonanceOf = (harmony) =>
  harmony.dissonance === undefined || harmony.complement == null ? 0 : harmony.dissonance;

/** Same colour target? (Cached harmonies are shared objects: usually `a === b`.) */
function sameHarmony(a, b) {
  if (a === b) return true;
  if (a.main !== b.main || accentOf(a) !== accentOf(b) || glowOf(a) !== glowOf(b)) return false;
  if (chromaOf(a) !== chromaOf(b)) return false;
  if (a.complement !== b.complement || dissonanceOf(a) !== dissonanceOf(b)) return false;
  if (fleckOf(a) !== fleckOf(b) || rainbowOf(a) !== rainbowOf(b)) return false;
  if (a.reflections.length !== b.reflections.length) return false;
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
    this._snapColour = true; // first light takes its colour without a lerp
    this._time = Math.random() * 100;
    this._bobPhase = Math.random() * Math.PI * 2;

    // Colour state (linear RGB) — current values lerp toward targets
    this._main = [1, 1, 1];
    this._mainTarget = [1, 1, 1];
    this._accent = [1, 1, 1];
    this._accentTarget = [1, 1, 1];
    this._glow = [1, 1, 1];
    this._glowTarget = [1, 1, 1];
    this._comp = [1, 1, 1]; // complementary flicker colour...
    this._compTarget = [1, 1, 1];
    this._flicker = 0; // ...and its strength (the chord's dissonance)
    this._flickerTarget = 0;
    this._fleck = [1, 1, 1]; // fleck colour...
    this._fleckTarget = [1, 1, 1];
    this._fleckW = 0; // ...its weight (0 = none)...
    this._fleckWTarget = 0;
    this._rainbow = 0; // ...and how rainbow it is (F# major)
    this._rainbowTarget = 0;
    this._opal = 0; // opaline, uncoloured light (a lone note)
    this._opalTarget = 0;
    this._density = 0; // body opacity boost (densityOf)...
    this._densityTarget = 0;
    this._lum = 1; // register luminosity (see update)...
    this._lumTarget = 1; // ...and where it is heading
    this._reflections = Array.from({ length: MAX_REFLECTIONS }, () => ({
      colour: [1, 1, 1],
      target: [1, 1, 1],
      weight: 0,
      weightTarget: 0,
    }));
    this._harmony = null; // last core/messiaenColour target

    // THIS creature's uniform values (body + halo). Not attached to any
    // material: bindBody/bindHalo copy them into the shared materials as
    // each mesh draws.
    this._uniforms = {
      uTime: { value: this._time },
      uExcite: { value: 0 },
      uFlare: { value: 0 },
      uSeed: { value: Math.random() * 10 },
      uIntensity: { value: 0 },
      uFloorY: { value: 0 },
      uPull: { value: size },
      uSuck: { value: 0 },
      uTip: { value: new THREE.Vector3(0, 0, 1) },
      uGhost: { value: 0 }, // the editor's cutaway only (setGhost)
      ...colourUniforms(),
    };

    // The pole (core/AbsorbManager): how far into its tip the body is drawn
    // (0..1) and where the tip is, in the world
    this._suck = 0;
    this._tipWorld = new THREE.Vector3();

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

  /**
   * Overall glow: 0 = the silent bubble; > 0 while lit, highest at a note's
   * onset, settling to the sustain glow while the note holds.
   */
  get glow() {
    return this._lit * (SUSTAIN_GLOW + (1 - SUSTAIN_GLOW) * this._flare);
  }

  /**
   * The light this creature throws on the floor and walls around it
   * (EnvironmentLook's pools): where it shines from and its colour, linear,
   * already scaled by how brightly it shines — its glow (onset flares
   * included) at its register's lightness.
   * @param {Float32Array} position - xyz written at `index * 4`
   * @param {Float32Array} colour - rgb written at `index * 3`
   * @param {number} index
   * @returns {number} the strength written in (0: silent, casts nothing)
   */
  lightInto(position, colour, index) {
    // Drawn into the pole, its light goes with it
    const strength = this.glow * Math.min(1.4, this._lum) * (1 - this._suck);
    if (strength <= 0) return 0;
    const { x, y, z } = this.object.position;
    position[index * 4] = x;
    position[index * 4 + 1] = y + this.float.position.y;
    position[index * 4 + 2] = z;
    for (let i = 0; i < 3; i += 1) colour[index * 3 + i] = this._glow[i] * strength;
    return strength;
  }

  /**
   * The pole is drawing the body into its tip (or pouring it back out):
   * `amount` 0 (the creature) .. 1 (all of it in the tip), the tip at
   * `tipWorld`. The body deforms toward the tip in its vertex shader
   * (SUCK_GLSL); the halo and the light it throws fade as it goes. Call
   * after the frame's update (the tip is placed against where the body
   * floats now). Allocation-free.
   * @param {number} amount
   * @param {{x:number, y:number, z:number}} [tipWorld]
   */
  setSuck(amount, tipWorld = null) {
    this._suck = Math.min(1, Math.max(0, amount));
    if (tipWorld) this._tipWorld.set(tipWorld.x, tipWorld.y, tipWorld.z);
    this._writeSuck();
  }

  /** How far into the pole's tip the body is drawn (0..1). */
  get suck() {
    return this._suck;
  }

  /**
   * Where the body's centre floats in the world (its rendered centre: the
   * hover and the bob included), written into `out`.
   */
  centreInto(out) {
    const { x, y, z } = this.object.position;
    return out.set(x, y + this.float.position.y, z);
  }

  _writeSuck() {
    const u = this._uniforms;
    const s = this._suck;
    u.uSuck.value = s;
    if (s > 0) {
      // The tip in the body's object space (the unit sphere, scaled by size)
      const { x, y, z } = this.object.position;
      const cy = y + this.float.position.y;
      u.uTip.value.set(
        (this._tipWorld.x - x) / this.size,
        (this._tipWorld.y - cy) / this.size,
        (this._tipWorld.z - z) / this.size
      );
    }
    // The deformed body reaches out of the sphere three culls it by
    this.body.frustumCulled = s <= 0;
    const glow = this.glow * (1 - s);
    u.uIntensity.value = glow;
    this.halo.visible = glow > 0.002;
  }

  /** The harmony colour the look is showing/moving toward (core/messiaenColour's answer). */
  get harmonyColour() {
    return this._harmony;
  }

  /**
   * Advance the look one frame. Allocation-free in the steady state (it runs
   * for every creature every frame).
   * @param {number} deltaTime - seconds
   * @param {boolean} sounding - is any note of the creature sounding now?
   * @param {?object} harmony - target colour: core/messiaenColour's answer
   *   ({main, accent, glow, reflections, chroma, complement, dissonance,
   *   fleck, rainbow}; only `main` and `reflections` are required); ignored
   *   when null (keeps the last colour). Only read, never kept beyond the
   *   next change or mutated
   * @param {?number} [luminosity=null] - lightness of the light, by register
   *   (null keeps the last: a fading voice holds its register)
   *   (core/messiaenColour registerLuminosity); eased like the colour
   */
  update(deltaTime, sounding, harmony = null, luminosity = null) {
    const dt = Math.max(0, Math.min(deltaTime, 0.1));
    // The swirl rushes at each onset and calms as the note holds: the
    // colours move with the sound, at its speed (Messiaen)
    this._time += dt * (1 + SWIRL_ONSET_RUSH * this._flare);
    this._bobPhase += (dt * Math.PI * 2) / BOB_PERIOD;

    if (sounding) {
      this._lit = Math.min(1, this._lit + dt / ATTACK_TIME);
    } else {
      this._lit *= Math.exp(-dt / RELEASE_TAU);
      if (this._lit < 1e-3) this._lit = 0;
    }
    this._flare *= Math.exp(-dt / FLARE_TAU);

    const coloured = harmony !== null && harmony.main !== null;
    // A first light takes its luminosity outright, like its colour
    const snapLum = coloured && this._snapColour;
    if (coloured) this._setHarmony(harmony);
    if (luminosity !== null) this._lumTarget = luminosity;
    this._advanceColour(dt, snapLum);
    this._applyBob();
    this._writeUniforms();
  }

  _setHarmony(harmony) {
    const prev = this._harmony;
    if (prev && sameHarmony(prev, harmony) && !this._snapColour) return;
    this._harmony = harmony;
    const snap = this._snapColour;
    this._snapColour = false;
    const chroma = chromaOf(harmony);
    const opal = opalOf(chroma);
    saturate3(hexToLinearInto(harmony.main, this._mainTarget), chroma);
    liftToPearl(
      saturate3(hexToLinearInto(accentOf(harmony), this._accentTarget), chroma),
      PEARL_LIFT * opal
    );
    liftToPearl(
      saturate3(hexToLinearInto(glowOf(harmony), this._glowTarget), chroma),
      PEARL_LIFT * opal
    );
    this._densityTarget = densityOf(harmony.main);
    this._flickerTarget = dissonanceOf(harmony);
    const fleck = fleckOf(harmony);
    // Flecks and F#'s rainbow bloom with the harmony: a lone note's are faint
    this._fleckWTarget = fleck === null ? 0 : 1 - opal;
    if (fleck !== null) {
      saturate3(hexToLinearInto(fleck, this._fleckTarget), chroma);
      if (this._fleckW < 0.05) copy3(this._fleck, this._fleckTarget);
    }
    this._rainbowTarget = rainbowOf(harmony) * (1 - opal);
    this._opalTarget = opal;
    if (this._flickerTarget > 0) {
      saturate3(hexToLinearInto(harmony.complement, this._compTarget), chroma);
      if (this._flicker < 0.05) copy3(this._comp, this._compTarget);
    }
    if (snap) {
      copy3(this._main, this._mainTarget);
      copy3(this._accent, this._accentTarget);
      copy3(this._glow, this._glowTarget);
      copy3(this._comp, this._compTarget);
      this._flicker = this._flickerTarget;
      copy3(this._fleck, this._fleckTarget);
      this._fleckW = this._fleckWTarget;
      this._rainbow = this._rainbowTarget;
      this._opal = this._opalTarget;
      this._density = this._densityTarget;
    }
    for (let i = 0; i < MAX_REFLECTIONS; i += 1) {
      const slot = this._reflections[i];
      const hex = harmony.reflections[i];
      if (hex === undefined) {
        slot.weightTarget = 0;
        if (snap) slot.weight = 0;
      } else {
        saturate3(hexToLinearInto(hex, slot.target), chroma);
        slot.weightTarget = 1;
        // A slot lighting up from nothing takes its colour outright
        if (snap || slot.weight < 0.05) copy3(slot.colour, slot.target);
        if (snap) slot.weight = 1;
      }
    }
  }

  _advanceColour(dt, snapLum) {
    const a = 1 - Math.exp(-dt / COLOUR_TAU);
    lerp3(this._main, this._mainTarget, a);
    lerp3(this._accent, this._accentTarget, a);
    lerp3(this._glow, this._glowTarget, a);
    lerp3(this._comp, this._compTarget, a);
    lerp3(this._fleck, this._fleckTarget, a);
    this._fleckW = easeToZero(this._fleckW, this._fleckWTarget, a);
    this._rainbow = easeToZero(this._rainbow, this._rainbowTarget, a);
    this._opal = easeToZero(this._opal, this._opalTarget, a);
    this._density += (this._densityTarget - this._density) * a;
    this._flicker = easeToZero(this._flicker, this._flickerTarget, a);
    this._lum = snapLum ? this._lumTarget : this._lum + (this._lumTarget - this._lum) * a;
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
    u.uIntensity.value = glow;
    u.uLum.value = this._lum;
    u.uFlicker.value =
      this._flicker > 0 ? this._flicker * flickerBurst(this._time, u.uSeed.value) : 0;
    u.uFleckW.value = this._fleckW;
    u.uRainbow.value = this._rainbow;
    u.uOpal.value = this._opal;
    u.uDensity.value = this._density;
    u.uFleck.value.set(this._fleck[0], this._fleck[1], this._fleck[2]);
    u.uComp.value.set(this._comp[0], this._comp[1], this._comp[2]);
    u.uMain.value.set(this._main[0], this._main[1], this._main[2]);
    u.uAccent.value.set(this._accent[0], this._accent[1], this._accent[2]);
    u.uGlow.value.set(this._glow[0], this._glow[1], this._glow[2]);
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
    if (this._suck > 0) this._writeSuck();
  }

  /**
   * Draw it as a ghost (the editor's cutaway, entities/CutawayLook: a screen
   * door keeping its rim) or whole. The game never calls it.
   * @param {boolean} ghosted
   */
  setGhost(ghosted) {
    this._uniforms.uGhost.value = ghosted ? 1 : 0;
  }

  /** Whether it is drawn as a ghost (setGhost). */
  get ghosted() {
    return this._uniforms.uGhost.value > 0.5;
  }

  /** The colour of the light it glows with now (linear rgb), written into `out[0..2]`. */
  glowColourInto(out) {
    copy3(out, this._glow);
    return out;
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
