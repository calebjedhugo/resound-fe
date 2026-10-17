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
  inPortalHideBand,
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

describe('inPortalHideBand (static-wall batching split)', () => {
  // Walls outside every linked gate's band merge into one InstancedMesh and
  // can never be hidden per portal pass, so the band must cover exactly the
  // walls whose hiding is visible: the gate's own row/column (flush jambs,
  // any lateral distance) and one cell off it (the strip wall the doorway
  // clip plane cannot fully remove). Two cells off is entirely clipped.
  const gate = { x: 5 * WORLD_SCALE, z: 7 * WORLD_SCALE };
  const wallAtCell = (gx, gz) => ({ x: gx * WORLD_SCALE, y: 0, z: gz * WORLD_SCALE });

  it('keeps the row and column through the gate at any distance (flush jambs)', () => {
    expect(inPortalHideBand(wallAtCell(5, -1), gate)).toBe(true); // far up the column
    expect(inPortalHideBand(wallAtCell(-1, 7), gate)).toBe(true); // far down the row
  });

  it('keeps walls one cell off the row/column (the doorway strip)', () => {
    expect(inPortalHideBand(wallAtCell(4, 0), gate)).toBe(true);
    expect(inPortalHideBand(wallAtCell(0, 8), gate)).toBe(true);
  });

  it('releases walls two or more cells off both axes to the batch', () => {
    expect(inPortalHideBand(wallAtCell(3, 5), gate)).toBe(false);
    expect(inPortalHideBand(wallAtCell(7, 9), gate)).toBe(false);
    expect(inPortalHideBand(wallAtCell(0, 0), gate)).toBe(false);
  });

  it('ignores elevation, matching the hide-sets', () => {
    expect(inPortalHideBand({ x: gate.x, y: 99, z: gate.z - 5 * WORLD_SCALE }, gate)).toBe(true);
  });
});
