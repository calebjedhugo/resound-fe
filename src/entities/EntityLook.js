/**
 * EntityLook — the gates, open doorways, ramps and cleansers in the storm
 * night (DESIGN.md "Entity look"; the world they stand in is
 * entities/EnvironmentLook's).
 *
 * The same rules as the walls and floor: near-neutral, low-chroma, DARK,
 * read by VALUE, so a creature's Messiaen colour stays the most vivid thing
 * in view. Colour is kept for meaning: the wrong note's red on a gate, and
 * the gold of the ACTIVE cleanser (and of the deployed gate that leads to
 * it).
 *
 * - GATE: a slab of dark glass, every edge of its faces toward the eye
 *   drawn in pale electric light, a faint engraved border inset where the
 *   staff sits on its pale halo. A correct performance fades the slab
 *   (Gate) while its edges CHARGE from the floor up with the song's
 *   progress, a hot front riding the charge; a wrong note floods it red for
 *   the lockout. An open door has no slab: only the open portal's OUTLINE
 *   from the eye (an edge on it where one of its faces turns toward the eye
 *   and the other away: outlineAt) keeps a rippling frame, a thin band just
 *   inside it with nothing over the way through, and only in the main view
 *   (showOpenFrame). A door's view panels stay plain. The deployed cleanser
 *   gate has a gold frame of its own, by the same rule (createOpenFrame).
 * - RAMP: a wedge of the storeys' slate; chevrons crawl slowly UP its slope
 *   (the way up, at a glance) between pale side lines (its drops, like a
 *   storey's cliff edge); pale posts mark its top edge from up on the
 *   ledge. One geometry and one material for every ramp: one draw each.
 * - CLEANSER: a dark glass disc with a pale breathing ring (an emissive
 *   map); the active one's ring burns gold.
 *
 * All custom looks are unlit ShaderMaterials written in display values
 * (core/passContext), honour the clip planes, and are lit only by the
 * area's creatures (EnvironmentLook's AreaLight); each has a ShaderPrewarm
 * stand-in (standInMaterials).
 */
import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { showInMainViewOnly } from 'core/passContext';
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

// The frame's light (sRGB hex): pale for a gate or door (EnvironmentLook's
// portalGlow), the active cleanser's gold for the deployed cleanser gate
const DOOR_GLOW = 0xb9c6e2;
export const CLEANSER_GOLD = 0xf0b85a;

/** A Color holding a hex's DISPLAY values (shaders here write them out as they are). */
function displayColour(hex) {
  const colour = new THREE.Color();
  colour.setHex(hex, THREE.LinearSRGBColorSpace);
  return colour;
}

// ---- Gate -----------------------------------------------------------------

// A gate box is WORLD_SCALE on every side, centred on its mesh
const GATE_HALF = WORLD_SCALE / 2;

// ---- Which edges light ------------------------------------------------------
//
// A CLOSED gate lights every edge of each face it turns toward the eye —
// "normal corners" (designer, 2026-11-22: "There should be the silhouette
// when the portal is open and normal corners when it's closed"); its back
// edges never show (back faces are culled).
//
// An OPEN portal lights only its OUTLINE from the eye, never an edge inside
// it (designer, 2026-11-22: "only the outline of the aggregate visible
// outline should be visible. So I should see a square only when facing a
// panel directly. When looking at a corner, that corner line should not be
// visible"): an edge glows only where one of its two faces turns toward the
// eye and the other away. Any face drawn turns toward the eye, so its edge
// is on the outline when the face ACROSS that edge turns away. The line
// fades out as that face turns past edge-on toward the eye, over
// OUTLINE_FADE of the cosine, so walking round a corner never pops it.
// Each pass's own eye decides (three's cameraPosition), though an open
// frame draws in the main view only.

const OUTLINE_FADE = 0.08;
// How far in from the outline an open portal's rippling band reaches
const PORTAL_BAND = 0.22;

/**
 * How much a gate edge shows, at `point` on it, on a face turned toward the
 * eye: 1 while the face across the edge (outward normal `across`) turns
 * away — the edge is on the outline — fading to 0 as that face turns toward
 * the eye. (The twin of OUTLINE_GLSL — change both.)
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
  // it turns away)
  const turned = (out - GATE_HALF) / Math.hypot(eye.x - point.x, eye.y - point.y, eye.z - point.z);
  const t = Math.min(1, Math.max(0, turned / OUTLINE_FADE));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * How much a gate edge shows, at `point` on it, on a face turned toward the
 * eye: closed, every such edge; open, only the portal's outline
 * (outlineAt). (The twin of the shader's `shown` — change both.)
 * @param {boolean} open
 * @param {{x: number, y: number, z: number}} eye
 * @param {{x: number, y: number, z: number}} centre - the gate's centre
 * @param {{x: number, y: number, z: number}} point - on the edge
 * @param {{x: number, y: number, z: number}} across - a unit box axis
 * @returns {number}
 */
export function edgeShown(open, eye, centre, point, across) {
  return open ? outlineAt(eye, centre, point, across) : 1;
}

const AXES = ['x', 'y', 'z'];

/**
 * How much of an open portal's rippling band covers `point`, on its face
 * with outward unit normal `normal` turned toward the eye: full at the
 * portal's outline, gone PORTAL_BAND in from it — so nothing over the way
 * through, and nothing along an edge inside the outline. Before the
 * ripple. (The twin of the shader's `bands` — change both.)
 * @param {{x: number, y: number, z: number}} eye
 * @param {{x: number, y: number, z: number}} centre - the gate's centre
 * @param {{x: number, y: number, z: number}} point - on the face
 * @param {{x: number, y: number, z: number}} normal - a unit box axis
 * @returns {number}
 */
export function portalBandAt(eye, centre, point, normal) {
  let band = 0;
  for (const axis of AXES) {
    if (Math.abs(normal[axis]) < 0.5) {
      const local = point[axis] - centre[axis];
      const across = { x: 0, y: 0, z: 0, [axis]: Math.sign(local) };
      const t = Math.min(1, Math.max(0, (GATE_HALF - Math.abs(local)) / PORTAL_BAND));
      band = Math.max(band, outlineAt(eye, centre, point, across) * (1 - t * t * (3 - 2 * t)));
    }
  }
  return band;
}

// For all three axes at once: of a point on a face, how much the edge
// toward each side shows (the face's own axis has no edge: masked by the
// caller)
const OUTLINE_GLSL = /* glsl */ `
  vec3 outlineAt(vec3 eye, vec3 centre, vec3 world, vec3 local) {
    vec3 turned = (sign(local) * (eye - centre) - ${GATE_HALF.toFixed(2)}) / length(eye - world);
    return 1.0 - smoothstep(0.0, ${OUTLINE_FADE.toFixed(2)}, turned);
  }
`;

const GATE_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vCentre;
  #include <common>
  #include <clipping_planes_pars_vertex>
  void main() {
    vLocal = position;
    vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normal; // gates are never rotated
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const GATE_FRAGMENT = /* glsl */ `
  uniform float uOpacity; // the slab (1 sealed, fading with the song, 0 open)
  uniform float uProgress; // how far a correct performance has come, 0..1
  uniform float uLockout; // the wrong note's red, decaying over the lockout
  uniform float uOpen; // 1: open — only the rippling frame draws (main view only)
  uniform vec3 uGlow; // the open frame's light
  uniform float uEnvTime;
  uniform float uFlash;
  uniform vec3 uStormCol;
  uniform vec3 uStrike;
  uniform sampler2D uCloud;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vCentre;
  #include <common>
  #include <clipping_planes_pars_fragment>
  ${PALETTE_GLSL}
  ${KEY_GLSL}
  ${LIGHT_GLSL}
  ${FINISH_GLSL}
  ${OUTLINE_GLSL}

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
    // Which of this face's edges light, each on its own so a corner stays
    // whole: every one while closed, only the portal's outline from this
    // eye once open (outlineAt; edgeShown is the twin)
    vec3 shown = (1.0 - abs(n)) *
      (uOpen > 0.5 ? outlineAt(cameraPosition, vCentre, vWorld, vLocal) : vec3(1.0));
    vec3 lines = shown * vec3(edgeLine(d.x), edgeLine(d.y), edgeLine(d.z));
    vec3 near = shown * exp(-d * 14.0);
    float lit = max(lines.x, max(lines.y, lines.z));
    float shimmer = 0.85 + 0.15 * sin(uEnvTime * 2.3 + (vLocal.x + vLocal.y + vLocal.z) * 2.1);

    vec3 col;
    float alpha;
    if (uOpen > 0.5) {
      // Open: no slab — only the portal's outline keeps a frame, and light
      // rippling in from it over a thin band (nothing past it: the way
      // through is clear; portalBandAt is the twin). Drawn in the main view
      // only (showOpenFrame)
      vec3 bands = shown * (1.0 - smoothstep(0.0, ${PORTAL_BAND.toFixed(2)}, d));
      vec3 ripples = 0.5 + 0.5 * sin(d * 30.0 - uEnvTime * 3.0 + sin(h * 9.0 + uEnvTime * 1.3) * 1.2);
      vec3 glow = bands * bands * (0.15 + 0.45 * ripples);
      float ripple = dot(ripples, bands) / max(bands.x + bands.y + bands.z, 0.001);
      col = uGlow * (0.7 + 0.5 * ripple) * shimmer;
      alpha = max(lit * 0.9, max(glow.x, max(glow.y, glow.z)));
    } else {
      // Dark glass, darker at the foot, with faint veils deep inside that
      // shift as the eye moves
      col = mix(GATE_FOOT, GATE_GLASS, smoothstep(0.0, 0.8, h));
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
      alpha = max(uOpacity, lit * (1.0 - uProgress * uProgress * uProgress));
    }
    gl_FragColor = vec4(finish(col, creatureLight(vWorld, n) * 1.2).rgb, alpha);
  }
`;

/**
 * A gate's own shell material (its fade, red and open frame are its own),
 * lit by `light` (bindAreaLight once its area is known). The look's state
 * is in its uniforms: uOpacity, uProgress, uLockout, uOpen.
 * @param {import('entities/EnvironmentLook').AreaLight} [light]
 * @returns {THREE.ShaderMaterial}
 */
export function createGateMaterial(light = NO_LIGHT, glow = DOOR_GLOW) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...WORLD_UNIFORMS,
      ...light.uniforms,
      uOpacity: { value: 1 },
      uProgress: { value: 0 },
      uLockout: { value: 0 },
      uOpen: { value: 0 },
      uGlow: { value: displayColour(glow) },
    },
    vertexShader: GATE_VERTEX,
    fragmentShader: GATE_FRAGMENT,
    clipping: true,
    extensions: { derivatives: true },
  });
}

// ---- An open gate's frame --------------------------------------------------

// Every open frame on its own (the cleanser gate's) is a gate box
const FRAME_GEOMETRY = new THREE.BoxGeometry(WORLD_SCALE, WORLD_SCALE, WORLD_SCALE);
FRAME_GEOMETRY.userData.shared = true;

/**
 * Show `material` (a gate shell's) as an open gate's rippling frame — or, a
 * closed gate's slab, everywhere again. The frame is drawn in the main view
 * only (core/passContext showInMainViewOnly), never writing depth.
 * @param {THREE.ShaderMaterial} material
 * @param {boolean} open
 */
export function showOpenFrame(material, open) {
  material.uniforms.uOpen.value = open ? 1 : 0; // eslint-disable-line no-param-reassign
  material.depthWrite = !open; // eslint-disable-line no-param-reassign
  showInMainViewOnly(material, open);
}

/**
 * A rippling open frame standing alone — the deployed cleanser gate's (it
 * has no slab): a gate box whose material shows only the portal's outline
 * from the eye, in the main view. Its material is its own: free it with
 * releaseOpenFrame.
 * @param {number} [glow] - sRGB hex
 * @returns {THREE.Mesh}
 */
export function createOpenFrame(glow = CLEANSER_GOLD) {
  const material = createGateMaterial(NO_LIGHT, glow);
  material.transparent = true;
  material.uniforms.uOpacity.value = 0;
  showOpenFrame(material, true);
  return new THREE.Mesh(FRAME_GEOMETRY, material);
}

/** A frame (createOpenFrame) is going: stop drawing it, free its material. */
export function releaseOpenFrame(frame) {
  showInMainViewOnly(frame.material, false);
  frame.material.dispose();
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

  void main() {
    #include <clipping_planes_fragment>
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 col;
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
    } else if (vLocalNormal.y < -0.5) {
      col = SLAB_UNDER;
    } else {
      col = SLAB_SIDE * (0.8 + 0.3 * max(dot(n, KEY_DIR), 0.0));
    }
    col += uStrike * 0.06;
    gl_FragColor = finish(col, creatureLight(vWorld, n));
  }
`;

// ONE material for every ramp. Its creature light is the area's being drawn:
// each ramp mesh binds its own area's before it draws (bindRampLight).
export const RAMP_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { ...WORLD_UNIFORMS, ...NO_LIGHT.uniforms },
  vertexShader: RAMP_VERTEX,
  fragmentShader: RAMP_FRAGMENT,
  clipping: true,
  extensions: { derivatives: true },
});
RAMP_MATERIAL.userData.shared = true;

/**
 * Before a ramp draws (its mesh's onBeforeRender, which three runs ahead of
 * program setup): light the shared material by that ramp's area.
 * uniformsNeedUpdate makes three upload them even when the previous draw
 * used the same material (CreatureLook does the same).
 * @param {?import('core/Area').default} area
 */
export function bindRampLight(area) {
  bindAreaLight(RAMP_MATERIAL, area ? area.light : NO_LIGHT);
  RAMP_MATERIAL.uniformsNeedUpdate = true;
}

// ---- Cleanser -------------------------------------------------------------

// The disc's light, as a radial emissive map (lit where it is white): a
// bright ring at the rim, a faint one inside, the middle dark glass
const RING_SIZE = 64;

/** The ring's brightness at `r` (0 centre, 1 rim). */
export function cleanserRingAt(r) {
  const ring = (centre, width) => Math.exp(-(((r - centre) / width) ** 2));
  return Math.min(1, 0.1 + ring(0.9, 0.06) + 0.55 * ring(0.62, 0.035) + 0.2 * ring(0.3, 0.035));
}

function createRingTexture() {
  const data = new Uint8Array(RING_SIZE * RING_SIZE * 4);
  for (let y = 0; y < RING_SIZE; y += 1) {
    for (let x = 0; x < RING_SIZE; x += 1) {
      const r = Math.hypot(x + 0.5 - RING_SIZE / 2, y + 0.5 - RING_SIZE / 2) / (RING_SIZE / 2);
      const value = Math.round(cleanserRingAt(r) * 255);
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

export const CLEANSER_RING_MAP = createRingTexture();

// The disc's rim (its thin side) reads as part of the ring: where on the
// map it samples
const RIM_UV = [0.5 + 0.9 / 2, 0.5];

/**
 * A cleanser disc's geometry: a thin cylinder whose caps map the ring
 * radially and whose rim samples the ring itself.
 */
export function createCleanserGeometry() {
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
 * never-disposed stand-ins: a gate sealed (opaque) and fading or open
 * (transparent), a doorway panel, the ramps' and a cleanser disc's.
 */
export function standInMaterials() {
  const fading = createGateMaterial();
  fading.transparent = true;
  return {
    gateSealed: createGateMaterial(),
    gateFading: fading,
    ramp: RAMP_MATERIAL,
    cleanser: new THREE.MeshStandardMaterial({
      emissiveMap: CLEANSER_RING_MAP,
      transparent: true,
    }),
  };
}
