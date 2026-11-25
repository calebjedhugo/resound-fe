/**
 * EntityLook — the gates, open doorways, ramps and waystones in the storm
 * night (DESIGN.md "Entity look"; the world they stand in is
 * entities/EnvironmentLook's).
 *
 * The same rules as the walls and floor: near-neutral, low-chroma, DARK,
 * read by VALUE, so a creature's Messiaen colour stays the most vivid thing
 * in view. Colour is kept for meaning: the wrong note's red on a gate, and
 * the gold of the ACTIVE waystone (and of the deployed gate that leads to
 * it).
 *
 * - GATE: a slab of dark glass, every edge of its faces toward the eye
 *   drawn in pale electric light, a faint engraved border inset where the
 *   staff sits on its pale halo. A correct performance fades the slab
 *   (Gate) while its edges CHARGE from the floor up with the song's
 *   progress, a hot front riding the charge; a wrong note floods it red for
 *   the lockout. An open gate has no slab at all.
 * - DOOR: an open door's view panels (core/PortalView) melt into the world
 *   around them along the open portal's OUTLINE from the eye (an edge on it
 *   where one of the box's faces turns toward the eye and the other away:
 *   outlineAt): within a thin band just inside it the view blurs and fades
 *   into what stands behind the doorway here, and nowhere else — only in
 *   the main view (createSeamMaterial). The deployed waystone gate's
 *   panels do the same with a faint gold in the seam.
 * - RAMP: a wedge of the storeys' slate; chevrons crawl slowly UP its slope
 *   (the way up, at a glance) between pale side lines (its drops, like a
 *   storey's cliff edge); pale posts mark its top edge from up on the
 *   ledge. One geometry and one material for every ramp: one draw each.
 * - WAYSTONE: a dark glass disc with a pale breathing ring (an emissive
 *   map); the active one's ring burns gold.
 *
 * All custom looks are unlit ShaderMaterials written in display values
 * (core/passContext), honour the clip planes, and are lit only by the
 * area's creatures (EnvironmentLook's AreaLight); each has a ShaderPrewarm
 * stand-in (standInMaterials). A door panel's seam material is three's
 * MeshBasicMaterial showing its scene target's stored texels, the seam
 * added by its hook.
 */
import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { skipOutputEncode } from 'core/passContext';
import { DOORWAY_OFFSET, PANEL_EPSILON } from 'core/portalMath';
import { CUT_FRAGMENT_GLSL } from 'entities/CutawayLook';
import {
  WORLD_UNIFORMS,
  PALETTE_GLSL,
  LIGHT_GLSL,
  KEY_GLSL,
  FINISH_GLSL,
  NO_LIGHT,
} from 'entities/EnvironmentLook';

const LIGHT_KEYS = ['uLightPos', 'uLightCol', 'uLightCount'];

/**
 * Point `material`'s creature-light uniforms at `light`'s (an area's
 * AreaLight: refreshed once a frame, so the material follows it).
 */
export function bindAreaLight(material, light) {
  for (const key of LIGHT_KEYS) material.uniforms[key] = light.uniforms[key]; // eslint-disable-line no-param-reassign
}

// The active waystone's gold (sRGB hex), on the deployed waystone gate too
export const WAYSTONE_GOLD = 0xf0b85a;

/** A Color holding a hex's DISPLAY values (shaders here write them out as they are). */
function displayColour(hex) {
  const colour = new THREE.Color();
  colour.setHex(hex, THREE.LinearSRGBColorSpace);
  return colour;
}

// ---- Gate -----------------------------------------------------------------

// A gate box is WORLD_SCALE on every side, centred on its mesh
const GATE_HALF = WORLD_SCALE / 2;

// ---- An open portal's outline -----------------------------------------------
//
// An OPEN portal's edge is its OUTLINE from the eye, never an edge inside it
// (designer, 2026-11-22: "only the outline of the aggregate visible outline
// should be visible. So I should see a square only when facing a panel
// directly. When looking at a corner, that corner line should not be
// visible"): an edge of the door's box is on it where one of its two faces
// turns toward the eye and the other away. Any face the eye looks in
// through turns toward it, so its edge is on the outline while the face
// ACROSS that edge turns away.
//
// That edge's seam fades out as the face across turns toward edge-on, over
// OUTLINE_FADE of the cosine, and is GONE by the time that face is edge-on
// — before the emerging side of the box can show (designer, 2026-11-23:
// "Let's have the line fade a little sooner so that it's completely gone by
// the time you can see the emerging side of the cube"). Smooth, so walking
// round a corner never pops it. The eye that sees it decides, though the
// seam draws in the main view only.
//
// (A CLOSED gate lights every edge of each face it turns toward the eye —
// "normal corners" (designer, 2026-11-22: "There should be the silhouette
// when the portal is open and normal corners when it's closed"); its back
// edges never show: back faces are culled.)

const OUTLINE_FADE = 0.08;
// How far in from the outline an open portal's seam reaches, on a face seen
// squarely; on a face seen aslant it reaches further, so it looks about as
// wide (up to 1 / PORTAL_BAND_SLANT times: never near the middle)
const PORTAL_BAND = 0.22;
const PORTAL_BAND_SLANT = 0.35;

/**
 * How much a door's edge shows, at `point` on it, on a face turned toward
 * the eye: 1 while the face across the edge (outward normal `across`) turns
 * well away — the edge is on the outline — fading to 0 by the time that
 * face is edge-on to the eye, before it can show. (The twin of
 * OUTLINE_GLSL — change both.)
 * @param {{x: number, y: number, z: number}} eye
 * @param {{x: number, y: number, z: number}} centre - the gate's centre
 * @param {{x: number, y: number, z: number}} point - on the edge
 * @param {{x: number, y: number, z: number}} across - a unit box axis
 * @returns {number}
 */
export function outlineAt(eye, centre, point, across) {
  const out =
    across.x * (eye.x - centre.x) + across.y * (eye.y - centre.y) + across.z * (eye.z - centre.z);
  // The cosine of the eye's sight of the face across, at the edge (below 0:
  // it turns away; 0: edge-on)
  const turned = (out - GATE_HALF) / Math.hypot(eye.x - point.x, eye.y - point.y, eye.z - point.z);
  const t = Math.min(1, Math.max(0, (turned + OUTLINE_FADE) / OUTLINE_FADE));
  return 1 - t * t * (3 - 2 * t);
}

const AXES = ['x', 'y', 'z'];

/**
 * How much of an open portal's seam covers `point`, on its box face with
 * outward unit normal `normal` turned toward the eye: full at the portal's
 * outline, gone PORTAL_BAND in from it (further on a face seen aslant) — so
 * nothing over the way through, and nothing along an edge inside the
 * outline.
 * @param {{x: number, y: number, z: number}} eye
 * @param {{x: number, y: number, z: number}} centre - the gate's centre
 * @param {{x: number, y: number, z: number}} point - on the face
 * @param {{x: number, y: number, z: number}} normal - a unit box axis
 * @returns {number}
 */
export function portalBandAt(eye, centre, point, normal) {
  const sight = Math.hypot(eye.x - point.x, eye.y - point.y, eye.z - point.z);
  const square =
    Math.abs(
      normal.x * (eye.x - point.x) + normal.y * (eye.y - point.y) + normal.z * (eye.z - point.z)
    ) / sight;
  const reach = PORTAL_BAND / Math.max(square, PORTAL_BAND_SLANT);
  let band = 0;
  for (const axis of AXES) {
    if (Math.abs(normal[axis]) < 0.5) {
      const local = point[axis] - centre[axis];
      const across = { x: 0, y: 0, z: 0, [axis]: Math.sign(local) };
      const t = Math.min(1, Math.max(0, (GATE_HALF - Math.abs(local)) / reach));
      band = Math.max(band, outlineAt(eye, centre, point, across) * (1 - t * t * (3 - 2 * t)));
    }
  }
  return band;
}

/**
 * How much of an open door's seam covers the point `point` of one of its
 * view panels (inside the box), seen from `eye`: the seam (portalBandAt)
 * where the eye's sight of it enters the box, on the face it enters by.
 * 0 for an eye inside the box. (The twin of SEAM_GLSL's portalSeamAt —
 * change both.)
 * @param {{x: number, y: number, z: number}} eye
 * @param {{x: number, y: number, z: number}} centre - the gate's centre
 * @param {{x: number, y: number, z: number}} point - on a panel
 * @returns {number}
 */
export function portalSeamAt(eye, centre, point) {
  // Along the sight from the eye (0) to the point (1), where it crosses each
  // face toward the eye: the last of those crossings is where it enters
  let entryAt = 0;
  let entryAxis = null;
  for (const axis of AXES) {
    const rel = eye[axis] - centre[axis];
    if (Math.abs(rel) > GATE_HALF) {
      const toward = Math.abs(rel) - (point[axis] - centre[axis]) * Math.sign(rel);
      const at = (Math.abs(rel) - GATE_HALF) / Math.max(toward, 1e-4);
      if (at >= entryAt) {
        entryAt = at;
        entryAxis = axis;
      }
    }
  }
  if (entryAxis === null) return 0;
  const entry = {
    x: eye.x + (point.x - eye.x) * entryAt,
    y: eye.y + (point.y - eye.y) * entryAt,
    z: eye.z + (point.z - eye.z) * entryAt,
  };
  const normal = { x: 0, y: 0, z: 0, [entryAxis]: Math.sign(eye[entryAxis] - centre[entryAxis]) };
  return portalBandAt(eye, centre, entry, normal);
}

// For all three axes at once: of a point on a face, how much the edge
// toward each side shows (the face's own axis has no edge: masked by the
// caller)
const OUTLINE_GLSL = /* glsl */ `
  vec3 outlineAt(vec3 eye, vec3 centre, vec3 world, vec3 local) {
    vec3 turned = (sign(local) * (eye - centre) - ${GATE_HALF.toFixed(2)}) / length(eye - world);
    return 1.0 - smoothstep(${(-OUTLINE_FADE).toFixed(2)}, 0.0, turned);
  }
`;

const GATE_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normal; // gates are never rotated
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const GATE_FRAGMENT = /* glsl */ `
  uniform float uOpacity; // the slab (1 sealed, fading with the song)
  uniform float uProgress; // how far a correct performance has come, 0..1
  uniform float uLockout; // the wrong note's red, decaying over the lockout
  uniform float uGhost; // the editor's cutaway (CutawayLook): 1 = a ghost
  uniform float uEnvTime;
  uniform float uFlash;
  uniform vec3 uStormCol;
  uniform vec3 uStrike;
  uniform sampler2D uCloud;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}
  ${KEY_GLSL}
  ${LIGHT_GLSL}
  ${FINISH_GLSL}
  ${CUT_FRAGMENT_GLSL}

  // An edge line, \`dist\` from it: never thinner than about a pixel (no
  // shimmer far off), and no brighter in total for being widened
  float edgeLine(float dist) {
    float fw = fwidth(dist);
    float width = max(0.035, fw * 1.25);
    return (1.0 - smoothstep(width, width + fw, dist)) * min(1.0, 0.05 / width);
  }

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    // How far this point of a face is from each of the box's sides, and from
    // the face's nearest edge: the middle one (the least is the face's own,
    // ~0)
    vec3 d = ${GATE_HALF.toFixed(2)} - abs(vLocal);
    float edge = d.x + d.y + d.z - min(d.x, min(d.y, d.z)) - max(d.x, max(d.y, d.z));
    float h = vLocal.y / ${(2 * GATE_HALF).toFixed(2)} + 0.5;
    float fw = fwidth(edge);
    // Every edge of this face lights, each on its own so a corner stays
    // whole ("normal corners")
    vec3 shown = 1.0 - abs(n);
    vec3 lines = shown * vec3(edgeLine(d.x), edgeLine(d.y), edgeLine(d.z));
    vec3 near = shown * exp(-d * 14.0);
    float lit = max(lines.x, max(lines.y, lines.z));
    // The editor's cutaway: a ghost keeps its edges and a screen door of the rest
    if (uGhost > 0.5 && lit < 0.5 && cutDropped()) discard;
    float shimmer = 0.85 + 0.15 * sin(uEnvTime * 2.3 + (vLocal.x + vLocal.y + vLocal.z) * 2.1);

    // Dark glass, darker at the foot, with faint veils deep inside that
    // shift as the eye moves
    vec3 col = mix(GATE_FOOT, GATE_GLASS, smoothstep(0.0, 0.8, h));
    vec2 face = abs(n.x) > 0.5 ? vLocal.zy : (abs(n.z) > 0.5 ? vLocal.xy : vLocal.xz);
    float veil = texture2D(uCloud, face * 0.11 + v.xz * 0.05 + vec2(0.0, uEnvTime * 0.003)).r;
    col *= 0.8 + 0.45 * veil;
    col *= 0.8 + 0.3 * max(dot(n, KEY_DIR), 0.0);
    // Glossier than the walls: the horizon (and the storm's colour while a
    // gate is being solved) on its faces at a glance
    float glance = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col += (HORIZON + uStormCol) * glance * 0.24;
    col += uStrike * 0.1 + FLASH * uFlash * 0.05;
    // A faint engraved border, inset where the staff sits (gone far off)
    float inset = 1.0 - smoothstep(0.012, 0.012 + fw, abs(edge - 0.2));
    col += GATE_EDGE * inset * 0.1 * (1.0 - smoothstep(0.02, 0.06, fw));

    // The edges: pale electric light, CHARGING from the floor up as a
    // correct performance goes on, a hot front riding the charge
    float sung = step(0.001, uProgress);
    float charged = sung * (1.0 - smoothstep(uProgress - 0.02, uProgress + 0.02, h));
    float front = sung * exp(-pow((h - uProgress) / 0.05, 2.0));
    vec3 edgeCol = GATE_EDGE * (mix(0.85, 0.4, sung) * shimmer + 0.95 * charged)
                 + GATE_CHARGE * front * 2.0;
    edgeCol *= 1.0 + 0.4 * uFlash;
    // A wrong note floods it red, for as long as it stays deaf
    edgeCol = mix(edgeCol, LOCKOUT * 1.4, uLockout);
    col = mix(col, LOCKOUT * (0.3 + 0.3 * h), uLockout * 0.6);
    // ...glowing faintly onto the glass beside them
    col += edgeCol * max(near.x, max(near.y, near.z)) * 0.12 * (1.0 - uLockout * 0.5);
    col = mix(col, edgeCol, clamp(lit, 0.0, 1.0));
    // The slab fades with the song; its edges hold on until it ends
    float alpha = max(uOpacity, lit * (1.0 - uProgress * uProgress * uProgress));
    gl_FragColor = vec4(finish(col, creatureLight(vWorld, n) * 1.2).rgb, alpha);
    if (uGhost > 0.5) {
      gl_FragColor.rgb = mix(mix(gl_FragColor.rgb, GHOST_EDGE, 0.3), GHOST_EDGE, clamp(lit, 0.0, 1.0));
    }
  }
`;

/**
 * A gate's own shell material (its fade and red are its own), lit by
 * `light` (bindAreaLight once its area is known). The look's state is in
 * its uniforms: uOpacity, uProgress, uLockout. An open gate draws none of
 * it (Gate hides the material).
 * @param {import('entities/EnvironmentLook').AreaLight} [light]
 * @returns {THREE.ShaderMaterial}
 */
export function createGateMaterial(light = NO_LIGHT) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...WORLD_UNIFORMS,
      ...light.uniforms,
      uOpacity: { value: 1 },
      uProgress: { value: 0 },
      uLockout: { value: 0 },
      uGhost: { value: 0 }, // only the editor's cutaway sets it
    },
    vertexShader: GATE_VERTEX,
    fragmentShader: GATE_FRAGMENT,
    clipping: true,
    extensions: { derivatives: true },
  });
}

// ---- A door's view panels ---------------------------------------------------
//
// An open door's outline is a soft seam where the view through it and the
// world around it fade into each other (designer, 2026-11-23: "Instead of a
// vivid white line, I think I actually just want the line to be a blur
// effect. So the outline of the portal should be quite subtle, fading from
// one view to the other"). Each view panel (core/PortalView: on the inside
// of the box's far faces) works out, for its every fragment, where the
// eye's sight of it enters the box, and how far that is inside the outline
// (portalSeamAt). Over that thin band the panel's picture blurs — a few
// taps of its own target, wider toward the outline — and fades out, so
// what stands behind the doorway in THIS world shows through it: the jamb
// beside a door in a wall, the room behind a freestanding one. Past the
// band the panel is exactly its picture, fully opaque: the way through is
// untouched. No glow, no ripple.
//
// The seam is the player's own eye's: a panel wears its seam material only
// while the main view draws (passContext.wearInMainView). In every other
// pass — a door seen through a door, the waystone gate's — it is its plain
// opaque picture, drawn and sorted as it always was.
//
// The seam material is TRANSPARENT so the fade can show the world behind
// the panel; PortalView draws panels first among transparent things
// (PANEL_RENDER_ORDER), right after everything opaque: they still write
// depth, so every translucent thing (halos, staves, gate shells) sorts
// against them exactly as against an opaque panel.

// The panel sits this far from its box's centre, facing it
const PANEL_INSET = DOORWAY_OFFSET - PANEL_EPSILON;
// The seam's blur, at the outline: its reach as a share of the panel (a
// panel is the box's side), and its taps
const SEAM_BLUR = 0.02;
const SEAM_TAPS = 8;
// How much of the waystone gate's gold tints its seam, at the outline
const WAYSTONE_SEAM_GOLD = 0.7;

// A panel's renderOrder: first among transparent things (and, in the passes
// that draw it opaque, among opaque ones)
export const PANEL_RENDER_ORDER = -1;

// portalSeamAt's twin
const SEAM_GLSL = /* glsl */ `
  uniform vec3 uSeamTint;
  uniform float uSeamTintAmount;
  varying vec3 vSeamEye;
  varying vec3 vSeamWorld;
  varying vec3 vSeamCentre;
  ${OUTLINE_GLSL}

  float portalSeamAt(vec3 eye, vec3 centre, vec3 world) {
    vec3 rel = eye - centre;
    // Along the sight from the eye (0) to here (1), where it crosses each
    // face toward the eye (0 for an axis whose slab holds the eye): the
    // last of those crossings is where it enters
    vec3 outside = step(${GATE_HALF.toFixed(2)}, abs(rel));
    vec3 toward = abs(rel) - (world - centre) * sign(rel);
    vec3 at = outside * (abs(rel) - ${GATE_HALF.toFixed(2)}) / max(toward, 1e-4);
    float entryAt = max(at.x, max(at.y, at.z));
    if (entryAt <= 0.0) return 0.0;
    vec3 face = step(entryAt, at);
    vec3 entry = eye + (world - eye) * entryAt;
    vec3 local = entry - centre;
    float square = dot(face, abs(eye - entry)) / length(eye - entry);
    float reach = ${PORTAL_BAND.toFixed(2)} / max(square, ${PORTAL_BAND_SLANT.toFixed(2)});
    vec3 bands = (1.0 - face) * outlineAt(eye, centre, entry, local)
      * (1.0 - smoothstep(0.0, reach, ${GATE_HALF.toFixed(2)} - abs(local)));
    return max(bands.x, max(bands.y, bands.z));
  }
`;

// In place of three's map_fragment: the picture, blurred and faded over the
// seam
const SEAM_FRAGMENT = /* glsl */ `
  float seam = portalSeamAt(vSeamEye, vSeamCentre, vSeamWorld);
  vec3 texel = texture2D(map, vMapUv).rgb;
  if (seam > 0.001) {
    // A small disc of taps, turned per pixel so its few samples never band
    float spin = 6.2832 * fract(52.9829 * fract(dot(gl_FragCoord.xy, vec2(0.06711, 0.00584))));
    vec3 sum = texel;
    for (int i = 0; i < ${SEAM_TAPS}; i++) {
      float k = float(i) + 0.5;
      float a = spin + k * 2.39996;
      float r = ${SEAM_BLUR.toFixed(3)} * seam * sqrt(k / ${SEAM_TAPS.toFixed(1)});
      sum += texture2D(map, vMapUv + vec2(cos(a), sin(a)) * r).rgb;
    }
    texel = mix(sum / ${(SEAM_TAPS + 1).toFixed(1)}, uSeamTint, uSeamTintAmount * seam);
  }
  diffuseColor.rgb *= texel;
  diffuseColor.a *= 1.0 - seam;
`;

/** Insert `code` after `chunk` in `source` (warns if three lost the chunk). */
function afterChunk(source, chunk, code) {
  if (!source.includes(chunk)) {
    console.warn(`EntityLook: ${chunk} not found (three upgraded?)`);
  }
  return source.replace(chunk, `${chunk}\n${code}`);
}

// ONE shared hook for every panel (three keys a program by the hook's
// source): a stored-texels panel (core/passContext) with the seam. Three
// calls it on the material compiling (`this`), whose own tint it binds.
// The eye comes from the view matrix (rigid: its rotation's transpose
// undoes it): three hands a MeshBasicMaterial no cameraPosition.
function addPortalSeam(shader) {
  skipOutputEncode(shader);
  const { seam } = this.userData;
  Object.assign(shader.uniforms, {
    uSeamTint: seam.tint,
    uSeamTintAmount: seam.tintAmount,
  });
  let vertex = afterChunk(
    shader.vertexShader,
    '#include <common>',
    'varying vec3 vSeamEye;\nvarying vec3 vSeamWorld;\nvarying vec3 vSeamCentre;'
  );
  vertex = afterChunk(
    vertex,
    '#include <project_vertex>',
    `vSeamEye = -(viewMatrix[3].xyz * mat3(viewMatrix));
    vSeamWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vSeamCentre = (modelMatrix * vec4(0.0, 0.0, ${PANEL_INSET.toFixed(4)}, 1.0)).xyz;`
  );
  const fragment = afterChunk(shader.fragmentShader, '#include <common>', SEAM_GLSL);
  if (!fragment.includes('#include <map_fragment>')) {
    console.warn('EntityLook: #include <map_fragment> not found (three upgraded?)');
  }
  Object.assign(shader, {
    vertexShader: vertex,
    fragmentShader: fragment.replace('#include <map_fragment>', SEAM_FRAGMENT),
  });
}

/**
 * A door's view panel material for the main view (PortalView dresses its
 * panel in it there): shows `map` (a scene target, as stored) with the
 * open portal's seam along the outline. Every panel's shares one program;
 * a panel's tint is its own.
 * @param {THREE.Texture} map
 * @param {?number} [tint] - sRGB hex the seam leans toward (the waystone
 *   gate's gold); none by default
 * @returns {THREE.MeshBasicMaterial}
 */
export function createSeamMaterial(map, tint = null) {
  const material = new THREE.MeshBasicMaterial({ map, transparent: true });
  material.userData.seam = {
    tint: { value: displayColour(tint === null ? 0xffffff : tint) },
    tintAmount: { value: tint === null ? 0 : WAYSTONE_SEAM_GOLD },
  };
  material.onBeforeCompile = addPortalSeam;
  return material;
}

// ---- Ramp -----------------------------------------------------------------

const POST_SIZE = 0.2;
const POST_HEIGHT = 1.1;

/**
 * Every ramp's geometry: the wedge (low edge at local +Z, high at -Z, the
 * Ramp mesh turns it to face its direction) and its two marker posts at
 * the top corners, in ONE flat-shaded buffer (aPart: 0 wedge, 1 post).
 */
function createRampGeometry() {
  const hw = WORLD_SCALE / 2;
  const h = ELEVATION_HEIGHT;
  const positions = [];
  const parts = [];
  // Each triangle wound to face away from its solid's centre
  const tri = (a, b, c, part, centre) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const mid = [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3 - centre[i]);
    const flip = nx * mid[0] + ny * mid[1] + nz * mid[2] < 0;
    for (const p of flip ? [a, c, b] : [a, b, c]) {
      positions.push(...p);
      parts.push(part);
    }
  };
  const quad = (a, b, c, d, part, centre) => {
    tri(a, b, c, part, centre);
    tri(a, c, d, part, centre);
  };

  const wedge = [0, h / 3, -hw / 3];
  const bl = [-hw, 0, -hw];
  const br = [hw, 0, -hw];
  const fr = [hw, 0, hw];
  const fl = [-hw, 0, hw];
  const tl = [-hw, h, -hw];
  const tr = [hw, h, -hw];
  quad(bl, br, fr, fl, 0, wedge); // underside
  quad(fl, fr, tr, tl, 0, wedge); // the slope
  quad(bl, br, tr, tl, 0, wedge); // the high end
  tri(bl, tl, fl, 0, wedge); // the sides
  tri(br, fr, tr, 0, wedge);

  // The posts at the top corners
  const s = POST_SIZE / 2;
  [-hw + 0.15, hw - 0.15].forEach((x) => {
    const z = -hw + 0.15;
    const y0 = h;
    const y1 = h + POST_HEIGHT;
    const centre = [x, (y0 + y1) / 2, z];
    const c = (dx, y, dz) => [x + dx, y, z + dz];
    quad(c(-s, y0, -s), c(s, y0, -s), c(s, y1, -s), c(-s, y1, -s), 1, centre);
    quad(c(-s, y0, s), c(s, y0, s), c(s, y1, s), c(-s, y1, s), 1, centre);
    quad(c(-s, y0, -s), c(-s, y0, s), c(-s, y1, s), c(-s, y1, -s), 1, centre);
    quad(c(s, y0, -s), c(s, y0, s), c(s, y1, s), c(s, y1, -s), 1, centre);
    quad(c(-s, y1, -s), c(s, y1, -s), c(s, y1, s), c(-s, y1, s), 1, centre);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.computeVertexNormals(); // non-indexed: flat, per face
  geometry.userData.shared = true;
  return geometry;
}

export const RAMP_GEOMETRY = createRampGeometry();

const RAMP_VERTEX = /* glsl */ `
  attribute float aPart;
  varying vec3 vLocal;
  varying vec3 vLocalNormal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vPart;
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vLocal = position;
    vLocalNormal = normal;
    vPart = aPart;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = mat3(modelMatrix) * normal; // turned about y only
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const RAMP_FRAGMENT = /* glsl */ `
  uniform float uEnvTime;
  uniform float uFlash;
  uniform vec3 uStrike;
  uniform float uGhost; // the editor's cutaway (CutawayLook): 1 = a ghost
  varying vec3 vLocal;
  varying vec3 vLocalNormal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vPart;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}
  ${KEY_GLSL}
  ${LIGHT_GLSL}
  ${FINISH_GLSL}
  ${CUT_FRAGMENT_GLSL}

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 col;
    float ghostEdge = vPart; // a ghost keeps its posts and side lines whole
    if (vPart > 0.5) {
      // A marker post: pale light, brightest at its tip
      col = RAMP_POST * (0.75 + 0.35 * smoothstep(${ELEVATION_HEIGHT.toFixed(1)}, ${(
        ELEVATION_HEIGHT + POST_HEIGHT
      ).toFixed(2)}, vLocal.y)) * (1.0 + 0.3 * uFlash);
    } else if (vLocalNormal.y > 0.3) {
      // The slope: slate like the storeys it climbs to
      col = RAMP_SLOPE * (0.85 + 0.25 * max(dot(n, KEY_DIR), 0.0));
      float glance = pow(1.0 - max(dot(n, v), 0.0), 5.0);
      col += HORIZON * glance * 0.18;
      // Chevrons pointing UP the slope, crawling slowly the way up
      float up = (${(WORLD_SCALE / 2).toFixed(2)} - vLocal.z) / ${WORLD_SCALE.toFixed(1)};
      float across = abs(vLocal.x) / ${(WORLD_SCALE / 2).toFixed(2)};
      float stripes = up * 3.0 + across * 0.45 - uEnvTime * 0.18; // apex up the slope
      float c = fract(stripes);
      float fw = fwidth(stripes); // not of c: that jumps where it wraps
      float chevron = smoothstep(0.0, fw, c) * (1.0 - smoothstep(0.32, 0.32 + fw, c));
      chevron *= 1.0 - smoothstep(0.78, 0.86, across); // clear of the side lines
      col = mix(col, RAMP_CHEVRON, chevron * 0.55);
      // Pale lines along its sides: you can fall off those
      float fx = fwidth(across);
      float side = smoothstep(0.955 - fx, 0.955, across);
      col = mix(col, CLIFF_EDGE * (1.0 + 0.3 * uFlash), side);
      ghostEdge = side;
    } else if (vLocalNormal.y < -0.5) {
      col = SLAB_UNDER;
    } else {
      col = SLAB_SIDE * (0.8 + 0.3 * max(dot(n, KEY_DIR), 0.0));
    }
    col += uStrike * 0.06;
    if (uGhost > 0.5 && ghostEdge < 0.5 && cutDropped()) discard;
    gl_FragColor = finish(col, creatureLight(vWorld, n));
    if (uGhost > 0.5) {
      gl_FragColor.rgb = mix(mix(gl_FragColor.rgb, GHOST_EDGE, 0.3), GHOST_EDGE, clamp(ghostEdge, 0.0, 1.0));
    }
  }
`;

// ONE material for every ramp. Its creature light is the area's being drawn:
// each ramp mesh binds its own area's before it draws (bindRampLight).
export const RAMP_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { ...WORLD_UNIFORMS, ...NO_LIGHT.uniforms, uGhost: { value: 0 } },
  vertexShader: RAMP_VERTEX,
  fragmentShader: RAMP_FRAGMENT,
  clipping: true,
  extensions: { derivatives: true },
});
RAMP_MATERIAL.userData.shared = true;

/**
 * Before a ramp draws (its mesh's onBeforeRender, which three runs ahead of
 * program setup): light the shared material by that ramp's area, and ghost
 * it or not (the editor's cutaway; never in the game).
 * uniformsNeedUpdate makes three upload them even when the previous draw
 * used the same material (CreatureLook does the same).
 * @param {?import('core/Area').default} area
 * @param {boolean} [ghost]
 */
export function bindRampLight(area, ghost = false) {
  bindAreaLight(RAMP_MATERIAL, area ? area.light : NO_LIGHT);
  RAMP_MATERIAL.uniforms.uGhost.value = ghost ? 1 : 0;
  RAMP_MATERIAL.uniformsNeedUpdate = true;
}

// ---- Waystone -------------------------------------------------------------

// The disc's light, as a radial emissive map (lit where it is white): a
// bright ring at the rim, a faint one inside, the middle dark glass
const RING_SIZE = 64;

/** The ring's brightness at `r` (0 centre, 1 rim). */
export function waystoneRingAt(r) {
  const ring = (centre, width) => Math.exp(-(((r - centre) / width) ** 2));
  return Math.min(1, 0.1 + ring(0.9, 0.06) + 0.55 * ring(0.62, 0.035) + 0.2 * ring(0.3, 0.035));
}

function createRingTexture() {
  const data = new Uint8Array(RING_SIZE * RING_SIZE * 4);
  for (let y = 0; y < RING_SIZE; y += 1) {
    for (let x = 0; x < RING_SIZE; x += 1) {
      const r = Math.hypot(x + 0.5 - RING_SIZE / 2, y + 0.5 - RING_SIZE / 2) / (RING_SIZE / 2);
      const value = Math.round(waystoneRingAt(r) * 255);
      const i = (y * RING_SIZE + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, RING_SIZE, RING_SIZE);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export const WAYSTONE_RING_MAP = createRingTexture();

// The disc's rim (its thin side) reads as part of the ring: where on the
// map it samples
const RIM_UV = [0.5 + 0.9 / 2, 0.5];

/**
 * A waystone disc's geometry: a thin cylinder whose caps map the ring
 * radially and whose rim samples the ring itself.
 */
export function createWaystoneGeometry() {
  const geometry = new THREE.CylinderGeometry(1.25, 1.25, 0.12, 48);
  const { normal, uv } = geometry.attributes || {};
  if (!normal || !uv) return geometry; // the test harness's stand-in three
  for (let i = 0; i < normal.count; i += 1) {
    if (Math.abs(normal.getY(i)) < 0.5) uv.setXY(i, RIM_UV[0], RIM_UV[1]);
  }
  return geometry;
}

/**
 * One material per program these looks can need, for ShaderPrewarm's
 * never-disposed stand-ins: a gate sealed (opaque) and fading
 * (transparent), the ramps' and a waystone disc's (a door panel's needs a
 * scene target: ShaderPrewarm builds it with createSeamMaterial).
 */
export function standInMaterials() {
  const fading = createGateMaterial();
  fading.transparent = true;
  return {
    gateSealed: createGateMaterial(),
    gateFading: fading,
    ramp: RAMP_MATERIAL,
    waystone: new THREE.MeshStandardMaterial({
      emissiveMap: WAYSTONE_RING_MAP,
      transparent: true,
    }),
  };
}
