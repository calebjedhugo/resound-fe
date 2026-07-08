/**
 * Portal geometry tests
 *
 * The doorway quad and the source→neighbor space mapping are what make the
 * see-through view line up with the crossing: what you see through the door
 * is where you land when you walk through it.
 */
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import { doorwayCorners, portalMapping, DOORWAY_OFFSET } from 'core/portalMath';

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
