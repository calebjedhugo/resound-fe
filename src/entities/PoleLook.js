/**
 * PoleLook — the player's telescoping pole, seen first-person (ruled
 * 2026-11-23; core/AbsorbManager drives it). Hidden at rest; while it works
 * it reaches from a hand anchor at the lower right of the view
 * (camera-relative, entering from just off the screen's edge) to its target,
 * a few nested segments telescoping out, a pale softly glowing tip on the
 * end that flares in a creature's colour.
 *
 * MAIN VIEW ONLY: it lives in a scene of its own (never an area group, never
 * the main scene), drawn by `render` right after the main view, over its
 * depth (walls in front of it still hide it), so no door pass, cleanser-gate
 * pass or warm-up ever draws it. Its scene is lit like the world (program
 * keys count lights) and draws in the one pass context every pass shares
 * (core/passContext: CLIP_PLANE_COUNT planes, the canvas), so its programs
 * are the ones ShaderPrewarm's stand-ins (`standInMaterials`) compile.
 * The pole's transform follows the camera, so it is placed as it draws — the
 * one thing render-time code may move, being in no scene any other pass
 * draws. Unlit ShaderMaterials; nothing allocated per frame.
 */
import * as THREE from 'three';
import { NO_CLIP_PLANES } from 'core/passContext';

// The hand: where the pole leaves the view, in camera space (x right, y up,
// -z ahead). Just below the bottom edge at this depth (75° vertical field),
// right of centre, so the rod enters from the lower right.
const ANCHOR = Object.freeze({ x: 0.34, y: -0.38, z: -0.32 });

// Nested segments, thickest at the hand (radii in world units)
const SEGMENT_RADII = [0.03, 0.024, 0.019, 0.015];
const SEGMENT_OVERLAP = 1.18; // each segment this much longer than its share
const MIN_SEGMENT = 0.08;
const TIP_RADIUS = 0.034;
const GLOW_RADIUS = 0.07;
const GLOW_FLARE_GROWTH = 0.14;
const SHOWN_FROM = 0.01; // extension below which nothing draws

// The tip's resting light (linear): pale, a little cold
const TIP_LIGHT = [0.78, 0.86, 1.0];

const ROD_VERTEX = /* glsl */ `
  uniform vec3 uTipPos;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying float vNearTip;
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNearTip = exp(-distance(world.xyz, uTipPos) * 4.0);
    vec4 mvPosition = viewMatrix * world;
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

// A dark rod: a thin cold rim so it reads against the storm sky, lit warmer
// by the tip's own glow along its last stretch
const ROD_FRAGMENT = /* glsl */ `
  uniform vec3 uTipCol;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  varying float vNearTip;
  #include <common>
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    float ndv = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
    float rim = pow(1.0 - ndv, 3.0);
    vec3 col = vec3(0.022, 0.025, 0.032) + vec3(0.08, 0.095, 0.13) * rim;
    col += uTipCol * vNearTip * (0.15 + 0.4 * rim);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

const TIP_VERTEX = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewV;
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

// The tip: a hot pale core, softer at its limb
const TIP_FRAGMENT = /* glsl */ `
  uniform vec3 uTipCol;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  #include <common>
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    float ndv = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
    vec3 col = uTipCol * (0.55 + 0.6 * ndv) + vec3(0.25) * pow(ndv, 6.0);
    gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

// Its glow: an additive shell, brightest facing the eye, gone at its limb
const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uTipCol;
  uniform float uGlow;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  #include <common>
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    float ndv = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
    gl_FragColor = vec4(uTipCol, pow(ndv, 2.5) * uGlow);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

// Shared by every pole (there is one) and by ShaderPrewarm's stand-ins;
// never disposed (a disposed material releases its programs)
const tipColour = { value: new THREE.Vector3(...TIP_LIGHT) };
const tipPosition = { value: new THREE.Vector3() };
const glowAmount = { value: 0.5 };
const ROD_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { uTipPos: tipPosition, uTipCol: tipColour },
  vertexShader: ROD_VERTEX,
  fragmentShader: ROD_FRAGMENT,
  clipping: true,
});
const TIP_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { uTipCol: tipColour },
  vertexShader: TIP_VERTEX,
  fragmentShader: TIP_FRAGMENT,
  clipping: true,
});
const GLOW_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { uTipCol: tipColour, uGlow: glowAmount },
  vertexShader: TIP_VERTEX,
  fragmentShader: GLOW_FRAGMENT,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  clipping: true,
});
const ROD_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
const BALL_GEOMETRY = new THREE.SphereGeometry(1, 20, 14);
[ROD_MATERIAL, TIP_MATERIAL, GLOW_MATERIAL, ROD_GEOMETRY, BALL_GEOMETRY].forEach((shared) => {
  shared.userData.shared = true;
});

/** The pole's materials, for ShaderPrewarm's stand-ins (the very ones it draws with). */
export function standInMaterials() {
  return { rod: ROD_MATERIAL, tip: TIP_MATERIAL, glow: GLOW_MATERIAL };
}

const UP = new THREE.Vector3(0, 1, 0);

class PoleLook {
  /**
   * @param {THREE.Light[]} [lights] - the world's lights, mirrored into the
   *   pole's own scene (program keys count them)
   */
  constructor(lights = []) {
    this.scene = new THREE.Scene();
    for (const light of lights) this.scene.add(light.clone());

    this.root = new THREE.Group();
    this.root.visible = false;
    this.scene.add(this.root);
    this.segments = SEGMENT_RADII.map(() => {
      const segment = new THREE.Mesh(ROD_GEOMETRY, ROD_MATERIAL);
      this.root.add(segment);
      return segment;
    });
    this.tip = new THREE.Mesh(BALL_GEOMETRY, TIP_MATERIAL);
    this.glow = new THREE.Mesh(BALL_GEOMETRY, GLOW_MATERIAL);
    this.root.add(this.tip);
    this.root.add(this.glow);

    // What core/AbsorbManager asked for this frame
    this._target = new THREE.Vector3();
    this._extend = 0;
    this._flare = 0;
    this._flareColour = [1, 1, 1];

    // Scratch (render runs every frame the pole shows)
    this._anchor = new THREE.Vector3();
    this._tipNow = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  /** Is the pole out (drawn this frame)? */
  get visible() {
    return this._extend >= SHOWN_FROM;
  }

  /**
   * Where the pole reaches this frame: toward `target` (world), `extend` of
   * the way from the hand (0 in the hand, 1 touching it), its tip flaring
   * `flare` (0..1) in `colour` (linear rgb).
   */
  reach(target, extend, flare = 0, colour = null) {
    this._target.set(target.x, target.y, target.z);
    this._extend = Math.min(1, Math.max(0, extend));
    this._flare = Math.min(1, Math.max(0, flare));
    if (colour) {
      for (let i = 0; i < 3; i += 1) this._flareColour[i] = colour[i];
    }
  }

  /** Back in the hand: nothing draws. */
  hide() {
    this._extend = 0;
    this._flare = 0;
  }

  /**
   * Where the tip is this frame, in the world, for an eye at `camera`
   * (written into `out`).
   */
  tipInto(camera, out) {
    this._anchor.set(ANCHOR.x, ANCHOR.y, ANCHOR.z).applyMatrix4(camera.matrixWorld);
    return out.copy(this._anchor).lerp(this._target, this._extend);
  }

  /**
   * Draw the pole over the main view just drawn (call after it, every
   * frame): placed from the camera's pose this frame, into the canvas, over
   * the main view's depth.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera - the player's
   */
  render(renderer, camera) {
    if (!this.visible) {
      this.root.visible = false;
      return;
    }
    this._place(camera);
    const { autoClear } = renderer;
    const planes = renderer.clippingPlanes;
    renderer.autoClear = false;
    renderer.clippingPlanes = NO_CLIP_PLANES;
    try {
      renderer.render(this.scene, camera);
    } finally {
      renderer.autoClear = autoClear;
      renderer.clippingPlanes = planes;
    }
  }

  _place(camera) {
    const tipNow = this.tipInto(camera, this._tipNow);
    const dir = this._dir.copy(tipNow).sub(this._anchor);
    const length = dir.length();
    this.root.visible = length > 1e-4;
    if (!this.root.visible) return;
    dir.multiplyScalar(1 / length);
    this.root.position.copy(this._anchor);
    this.root.quaternion.setFromUnitVectors(UP, dir);

    // Telescoping: each segment a share of the length (and a little more,
    // so they overlap), their starts spread along it; drawn in, they nest
    const n = this.segments.length;
    const segLength = Math.min(length, Math.max(MIN_SEGMENT, (length / n) * SEGMENT_OVERLAP));
    const spread = n > 1 ? (length - segLength) / (n - 1) : 0;
    for (let i = 0; i < n; i += 1) {
      const radius = SEGMENT_RADII[i];
      const segment = this.segments[i];
      segment.scale.set(radius, segLength, radius);
      segment.position.set(0, i * spread + segLength / 2, 0);
    }
    this.tip.position.set(0, length, 0);
    this.tip.scale.setScalar(TIP_RADIUS * (1 + 0.35 * this._flare));
    this.glow.position.set(0, length, 0);
    this.glow.scale.setScalar(GLOW_RADIUS + GLOW_FLARE_GROWTH * this._flare);

    // The tip's light: pale at rest, the creature's colour as it flares
    const f = this._flare;
    tipColour.value.set(
      TIP_LIGHT[0] + (this._flareColour[0] - TIP_LIGHT[0]) * f,
      TIP_LIGHT[1] + (this._flareColour[1] - TIP_LIGHT[1]) * f,
      TIP_LIGHT[2] + (this._flareColour[2] - TIP_LIGHT[2]) * f
    );
    glowAmount.value = 0.35 + 0.65 * f;
    tipPosition.value.copy(tipNow);
  }
}

export default PoleLook;
