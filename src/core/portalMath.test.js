/**
 * Portal geometry tests
 *
 * The doorway quad and the source→neighbor space mapping are what make the
 * see-through view line up with the crossing: what you see through the door
 * is where you land when you walk through it.
 */
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import {
  doorwayCorners,
  portalMapping,
  sphereInView,
  panelFootprint,
  wallHiddenBy,
  viewPlanes,
  pyramidPlanes,
  clipQuad,
  DOORWAY_OFFSET,
  OPPOSITE_FACING,
} from 'core/portalMath';

const expectPoint = (actual, expected) => {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
};

describe('doorwayCorners', () => {
  it('a north-facing gate has its doorway quad just outside the -Z face', () => {
    // Gate base at world (15, 0, 6); viewer stands to the north looking south
    const corners = doorwayCorners({ x: 15, y: 0, z: 6 }, 'north');

    const z = 6 - DOORWAY_OFFSET;
    expectPoint(corners.center, { x: 15, y: WORLD_SCALE / 2, z });
    // Viewer-right is -X when looking south at the gate
    expectPoint(corners.bottomLeft, { x: 16.5, y: 0, z });
    expectPoint(corners.bottomRight, { x: 13.5, y: 0, z });
    expectPoint(corners.topLeft, { x: 16.5, y: WORLD_SCALE, z });
  });

  it('an east-facing gate has its doorway quad just outside the +X face', () => {
    const corners = doorwayCorners({ x: 9, y: 0, z: 9 }, 'east');

    const x = 9 + DOORWAY_OFFSET;
    // Viewer stands to the east looking west: viewer-right is -Z (north)
    expectPoint(corners.bottomLeft, { x, y: 0, z: 10.5 });
    expectPoint(corners.bottomRight, { x, y: 0, z: 7.5 });
    expectPoint(corners.topLeft, { x, y: WORLD_SCALE, z: 10.5 });
  });
});

describe('portalMapping', () => {
  it('a straight-through pair (north door ↔ south door) is a pure translation', () => {
    // The portal-a/portal-b fixture pair in world units: source north-door at
    // grid (5, 0, 2), partner south-door at grid (5, 0, 7)
    const { map, outward } = portalMapping(
      { x: 15, y: 0, z: 6 },
      'north',
      { x: 15, y: 0, z: 21 },
      'south'
    );

    // A player one cell north of the source gate stands one cell behind the
    // partner gate (its non-doorway side) in neighbor space
    expectPoint(map({ x: 15, y: 1.8, z: 3 }), { x: 15, y: 1.8, z: 18 });
    // Sideways offsets carry straight across
    expectPoint(map({ x: 12, y: 1.8, z: 3 }), { x: 12, y: 1.8, z: 18 });
    // The kept side of the view is the partner's outward (south, +Z)
    expectPoint(outward, { x: 0, y: 0, z: 1 });
  });

  it('a 90° pair (east door ↔ south door) rotates the space about the gate', () => {
    const { map, outward } = portalMapping(
      { x: 0, y: 0, z: 0 },
      'east',
      { x: 30, y: 0, z: 30 },
      'south'
    );

    // Gate centers correspond
    expectPoint(map({ x: 0, y: 0, z: 0 }), { x: 30, y: 0, z: 30 });
    // A point on the source doorway side (east) maps behind the partner
    // (north of it, since the partner's doorway side is south)
    expectPoint(map({ x: 3, y: 0, z: 0 }), { x: 30, y: 0, z: 27 });
    // Walking WEST into the source gate comes out walking SOUTH
    expectPoint(map({ x: -3, y: 0, z: 0 }), { x: 30, y: 0, z: 33 });
    expectPoint(outward, { x: 0, y: 0, z: 1 });
  });

  it('height above the gate base carries across an elevation difference', () => {
    const partnerY = 2 * ELEVATION_HEIGHT;
    const { map } = portalMapping(
      { x: 6, y: 0, z: 6 },
      'north',
      { x: 6, y: partnerY, z: 6 },
      'south'
    );

    expect(map({ x: 6, y: 1.8, z: 3 }).y).toBeCloseTo(partnerY + 1.8);
  });
});

describe('opposite-face pairing (entry face -> exit face)', () => {
  it('north-in/south-out is a pure translation: offsets and heading survive', () => {
    const src = { x: 15, y: 0, z: 6 };
    const partner = { x: 42, y: 0, z: 27 };
    const { map } = portalMapping(src, 'north', partner, 'south');

    // Any offset from the source gate lands at the same offset from the
    // partner — no rotation, no mirror
    expectPoint(map({ x: 15 + 1, y: 1.8, z: 6 - 2 }), {
      x: 42 + 1,
      y: 1.8,
      z: 27 - 2,
    });
  });

  it('OPPOSITE_FACING pairs every face with its reverse', () => {
    expect(OPPOSITE_FACING.north).toBe('south');
    expect(OPPOSITE_FACING.south).toBe('north');
    expect(OPPOSITE_FACING.east).toBe('west');
    expect(OPPOSITE_FACING.west).toBe('east');
  });
});

describe('sphereInView (portal pass frustum cull)', () => {
  // Plain-object camera pose: position + quaternion + vertical fov + aspect.
  // Quaternions about Y: identity looks north (-Z), (0,1,0,0) looks south.
  const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
  const YAW_180 = { x: 0, y: 1, z: 0, w: 0 };
  const YAW_90_EAST = { x: 0, y: -Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
  const camera = (quaternion) => ({
    position: { x: 0, y: 1.8, z: 0 },
    quaternion,
    fov: 75,
    aspect: 16 / 9,
  });

  it('sees a sphere straight ahead', () => {
    expect(sphereInView(camera(IDENTITY), { x: 0, y: 1.8, z: -10 }, 2.5)).toBe(true);
  });

  it('culls a sphere behind the eye', () => {
    expect(sphereInView(camera(IDENTITY), { x: 0, y: 1.8, z: 10 }, 2.5)).toBe(false);
  });

  it('culls a sphere far off to the side, keeps one inside the horizontal fov', () => {
    // 75° vertical at 16:9 ≈ ±53.7° horizontal: x=10 at z=-10 is 45° — in;
    // x=30 at z=-10 is ~71.6° — out even with the radius
    expect(sphereInView(camera(IDENTITY), { x: 10, y: 1.8, z: -10 }, 2.5)).toBe(true);
    expect(sphereInView(camera(IDENTITY), { x: 30, y: 1.8, z: -10 }, 2.5)).toBe(false);
  });

  it('the radius keeps a sphere whose center just left the frustum', () => {
    // Straight up at 60° elevation is outside the ±37.5° vertical fov, but a
    // large radius still clips the top plane
    const high = { x: 0, y: 1.8 + Math.tan(Math.PI / 3) * 10, z: -10 };
    expect(sphereInView(camera(IDENTITY), high, 0.1)).toBe(false);
    expect(sphereInView(camera(IDENTITY), high, 8)).toBe(true);
  });

  it('respects the camera pose: the same sphere flips with a turn', () => {
    const north = { x: 0, y: 1.8, z: -10 };
    expect(sphereInView(camera(YAW_180), north, 2.5)).toBe(false);
    const east = { x: 10, y: 1.8, z: 0 };
    expect(sphereInView(camera(YAW_90_EAST), east, 2.5)).toBe(true);
    expect(sphereInView(camera(IDENTITY), east, 2.5)).toBe(false);
  });
});

describe('panelFootprint (what a door pass needs to draw)', () => {
  // A 3x3 quad facing an eye at the origin that looks north (-Z), on an
  // 800x600 screen at 75° vertical fov: one world unit at depth 1 spans
  // FOCAL pixels both ways (aspect 4:3)
  const SCREEN = [800, 600];
  const FOCAL = 300 / Math.tan((37.5 * Math.PI) / 180);
  const LOOK_NORTH = { quaternion: { x: 0, y: 0, z: 0, w: 1 }, fov: 75, aspect: 4 / 3 };
  const LOOK_SOUTH = { ...LOOK_NORTH, quaternion: { x: 0, y: 1, z: 0, w: 0 } };
  const eye = { x: 0, y: 0, z: 0 };
  /** A quad across x0..x0+3, up -1.5..1.5, from depth `nearZ` to `farZ`. */
  const quad = (x0, nearZ, farZ = nearZ) => ({
    bottomLeft: { x: x0, y: -1.5, z: -nearZ },
    bottomRight: { x: x0 + 3, y: -1.5, z: -farZ },
    topLeft: { x: x0, y: 1.5, z: -nearZ },
  });

  it('a quad facing the eye needs as many texels as it spans pixels', () => {
    const { texelsAcross, texelsUp, screenShare } = panelFootprint(
      eye,
      LOOK_NORTH,
      quad(-1.5, 10),
      ...SCREEN
    );
    const pixels = (3 * FOCAL) / 10;
    expect(texelsAcross).toBeCloseTo(pixels);
    expect(texelsUp).toBeCloseTo(pixels);
    expect(screenShare).toBeCloseTo((pixels * pixels) / (800 * 600));
  });

  it('an oblique quad is sized for its NEAR edge, where texels spread widest', () => {
    // Left edge at depth 4, right edge at depth 7
    const { texelsAcross, texelsUp } = panelFootprint(eye, LOOK_NORTH, quad(-1.5, 4, 7), ...SCREEN);
    const leftX = (-1.5 * FOCAL) / 4;
    const rightX = (1.5 * FOCAL) / 7;
    expect(texelsAcross).toBeGreaterThan(rightX - leftX); // more than its width on screen
    expect(texelsUp).toBeCloseTo((3 * FOCAL) / 4); // the near edge's height
  });

  it('a quad behind the eye needs nothing and covers nothing', () => {
    expect(panelFootprint(eye, LOOK_SOUTH, quad(-1.5, 10), ...SCREEN)).toEqual({
      texelsAcross: 0,
      texelsUp: 0,
      screenShare: 0,
    });
  });

  it('a quad reaching past the eye plane needs the most a target can be; only its front counts', () => {
    // From 2 units ahead to 1 unit behind, far off to the left: unbounded
    // density, but nothing of it lands on the screen
    const offScreen = panelFootprint(eye, LOOK_NORTH, quad(-40, 2, -1), ...SCREEN);
    expect(offScreen.texelsAcross).toBe(Infinity);
    expect(offScreen.screenShare).toBe(0);
    // The same reach straight ahead covers the screen
    const ahead = panelFootprint(eye, LOOK_NORTH, quad(-1.5, 2, -1), ...SCREEN);
    expect(ahead.screenShare).toBeGreaterThan(0.2);
  });
});

describe('wallHiddenBy (the eye-side walls a door pass leaves out)', () => {
  // A north-facing door at grid (5, 7): its window is half a cell north of
  // the gate, looking out north (-z); the area behind it (+z) is the eye's
  // side in a pass seen through its partner. Every wall draws in one batch,
  // so this is how a pass leaves a wall out.
  const gate = { x: 5 * WORLD_SCALE, z: 7 * WORLD_SCALE };
  const spec = (latEye = 0) => ({
    x: gate.x,
    z: gate.z - WORLD_SCALE / 2,
    outX: 0,
    outZ: -1,
    latEye,
  });
  const hidden = (s, gx, gz) => wallHiddenBy(s, gx * WORLD_SCALE, gz * WORLD_SCALE);

  it('hides every wall a full cell or more behind the window, at any distance', () => {
    expect(hidden(spec(), 5, 8)).toBe(true); // the strip right behind
    expect(hidden(spec(), 0, 8)).toBe(true); // off to the side
    expect(hidden(spec(), 9, 12)).toBe(true); // far behind (wholly clipped anyway)
  });

  it('never hides walls beyond the window: the room the door shows', () => {
    expect(hidden(spec(), 5, 6)).toBe(false);
    expect(hidden(spec(), 2, 0)).toBe(false);
  });

  it('keeps the flush jambs while the eye stands inside them, hides one the eye is beyond', () => {
    expect(hidden(spec(0), 4, 7)).toBe(false); // dead on: both jambs frame the doorway
    expect(hidden(spec(0), 6, 7)).toBe(false);
    // Three cells to the east (lateral runs along right = (out.z, -out.x):
    // west, for a north window): the eye faces the east jamb's outside
    expect(hidden(spec(-3 * WORLD_SCALE), 6, 7)).toBe(true);
    expect(hidden(spec(-3 * WORLD_SCALE), 4, 7)).toBe(false); // the west one stays
  });

  it('hides nothing for a spec with no outward (no door pass)', () => {
    const none = { x: 0, z: 0, outX: 0, outZ: 0, latEye: 0 };
    expect(hidden(none, 5, 8)).toBe(false);
    expect(hidden(none, 0, 0)).toBe(false);
  });

  it('ignores elevation: walls are judged by where they stand on the grid', () => {
    expect(wallHiddenBy(spec(), gate.x, gate.z + WORLD_SCALE)).toBe(true);
  });
});

describe('sightlines (the mirror sweep cull)', () => {
  // A 3x3 quad standing in the z = 0 plane: across runs +x, up runs +y
  const QUAD = {
    bottomLeft: { x: -1.5, y: 0, z: 0 },
    bottomRight: { x: 1.5, y: 0, z: 0 },
    topLeft: { x: -1.5, y: 3, z: 0 },
  };
  const WHOLE = { u0: 0, u1: 1, v0: 0, v1: 1 };
  const plane = (...runs) => Float64Array.from(runs.flat());
  const inside = (planes, count, p) => {
    for (let k = 0; k < count; k += 1) {
      const o = k * 4;
      if (planes[o] * p.x + planes[o + 1] * p.y + planes[o + 2] * p.z + planes[o + 3] < 0) {
        return false;
      }
    }
    return true;
  };

  it('clipQuad keeps a quad inside every plane whole', () => {
    const rect = {};
    expect(clipQuad(QUAD, plane([0, 0, 1, 1]), 1, rect)).toBe(true); // z >= -1
    expect(rect).toEqual(WHOLE);
  });

  it('clipQuad finds nothing of a quad outside any one plane', () => {
    // z >= -1 holds, x >= 2 does not
    expect(clipQuad(QUAD, plane([0, 0, 1, 1], [1, 0, 0, -2]), 2, {})).toBe(false);
  });

  it('clipQuad bounds the part inside: planes through the middle keep a corner', () => {
    const rect = {};
    // x >= 0 (the right half) and y <= 1 (the bottom third)
    expect(clipQuad(QUAD, plane([1, 0, 0, 0], [0, -1, 0, 1]), 2, rect)).toBe(true);
    expect(rect.u0).toBeCloseTo(0.5);
    expect(rect.u1).toBeCloseTo(1);
    expect(rect.v0).toBeCloseTo(0);
    expect(rect.v1).toBeCloseTo(1 / 3);
  });

  it('pyramidPlanes hold what shows through part of a quad, and nothing else', () => {
    // From 5 units in front of the quad, through its right half
    const apex = { x: 0, y: 1.5, z: -5 };
    const planes = new Float64Array(16);
    expect(pyramidPlanes(apex, QUAD, { u0: 0.5, u1: 1, v0: 0, v1: 1 }, planes)).toBe(4);
    // 5 units beyond the quad it is twice the part's size: x in [0, 3],
    // y in [-1.5, 4.5]
    expect(inside(planes, 4, { x: 2.9, y: 1.5, z: 5 })).toBe(true);
    expect(inside(planes, 4, { x: 3.1, y: 1.5, z: 5 })).toBe(false);
    expect(inside(planes, 4, { x: -0.1, y: 1.5, z: 5 })).toBe(false);
    expect(inside(planes, 4, { x: 1, y: 4.4, z: 5 })).toBe(true);
    expect(inside(planes, 4, { x: 1, y: 4.6, z: 5 })).toBe(false);
  });

  it('viewPlanes bound what a camera sees; slack widens every side', () => {
    // Looking north (-z), 90° vertical fov, square screen: the edges run at 45°
    const camera = { quaternion: { x: 0, y: 0, z: 0, w: 1 }, fov: 90, aspect: 1 };
    const eye = { x: 0, y: 0, z: 0 };
    const planes = new Float64Array(16);
    expect(viewPlanes(eye, camera, planes)).toBe(4);
    expect(inside(planes, 4, { x: 0, y: 0, z: -10 })).toBe(true);
    expect(inside(planes, 4, { x: 10.5, y: 0, z: -10 })).toBe(false);
    expect(inside(planes, 4, { x: 0, y: -10.5, z: -10 })).toBe(false);
    expect(inside(planes, 4, { x: 0, y: 0, z: 10 })).toBe(false); // behind
    viewPlanes(eye, camera, planes, 0, 0.1);
    expect(inside(planes, 4, { x: 10.5, y: 0, z: -10 })).toBe(true);
    expect(inside(planes, 4, { x: 0, y: -10.5, z: -10 })).toBe(true);
  });
});
