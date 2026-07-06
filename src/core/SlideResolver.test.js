/**
 * Unit tests for the axis-separated ("wall sliding") collision resolver.
 *
 * Only CollisionDetector (the WALL gate) is mocked so we can script exactly
 * which candidate cells are blocked. The CLIFF gate runs the REAL elevation
 * logic against small fake grids, so these tests also prove resolveSlide wires
 * canTraverse/getEffectiveElevation correctly.
 */
import resolveSlide, { canMoveTo } from 'core/SlideResolver';
import CollisionDetector from 'core/CollisionDetector';

// Spy on the real static method the resolver calls (the WALL gate). spyOn is
// used instead of jest.mock so the resolver and the test share the exact same
// function reference. The CLIFF gate runs the REAL elevation logic (fake grids).

// Flat base: no elevation grid, so only the wall gate matters.
const FLAT = { radius: 0.5, ignoreId: null, priorLevel: 0, grid: null, y: 0 };

// A grid where cell (0,0) is walkable only at level 0 and every OTHER cell only
// at level 1 — i.e. stepping out of (0,0) is a cliff up (canTraverse blocks it).
const cliffGrid = {
  worldToGrid: (x, z) => ({ x: Math.floor(x / 3), z: Math.floor(z / 3) }),
  getRamp: () => null,
  hasLevel: (gx, gz, level) => (gx === 0 && gz === 0 ? level === 0 : level === 1),
  nearestLevel: (gx, gz) => (gx === 0 && gz === 0 ? 0 : 1),
};

// A fully open grid (every cell walkable at level 0): the cliff gate never blocks.
const openGrid = {
  worldToGrid: (x, z) => ({ x: Math.floor(x / 3), z: Math.floor(z / 3) }),
  getRamp: () => null,
  hasLevel: () => true,
  nearestLevel: () => 0,
};

// NOTE: use ONLY mockImplementation below. In Jest, a mockReturnValue set in
// beforeEach takes precedence over a later mockImplementation, which would mask
// the per-test position-based blocks.
beforeEach(() => {
  jest.spyOn(CollisionDetector, 'checkCollision').mockImplementation(() => false);
});

afterEach(() => {
  CollisionDetector.checkCollision.mockRestore();
});

describe('resolveSlide — wall gate (flat)', () => {
  it('commits the full diagonal move when nothing blocks it', () => {
    const r = resolveSlide({ x: 0, z: 0 }, { x: 1, z: 1 }, FLAT);
    expect(r).toEqual({ x: 1, z: 1, blockedX: false, blockedZ: false });
  });

  it('slides along X (keeps X, drops Z) when the diagonal and the Z-slide are blocked', () => {
    CollisionDetector.checkCollision.mockImplementation(({ x, z }) => {
      if (x === 1 && z === 1) return true; // full diagonal blocked
      if (x === 0 && z === 1) return true; // z-slide blocked
      return false; // x-slide (1,0) clear
    });
    const r = resolveSlide({ x: 0, z: 0 }, { x: 1, z: 1 }, FLAT);
    expect(r).toEqual({ x: 1, z: 0, blockedX: false, blockedZ: true });
  });

  it('slides along Z (keeps Z, drops X) when the diagonal and the X-slide are blocked', () => {
    CollisionDetector.checkCollision.mockImplementation(({ x, z }) => {
      if (x === 1 && z === 1) return true; // full diagonal blocked
      if (x === 1 && z === 0) return true; // x-slide blocked
      return false; // z-slide (0,1) clear
    });
    const r = resolveSlide({ x: 0, z: 0 }, { x: 1, z: 1 }, FLAT);
    expect(r).toEqual({ x: 0, z: 1, blockedX: true, blockedZ: false });
  });

  it('commits AT MOST ONE axis — never reconstructs the forbidden diagonal', () => {
    // Only the full diagonal is blocked; BOTH single-axis slides are clear.
    CollisionDetector.checkCollision.mockImplementation(({ x, z }) => x === 1 && z === 1);
    const r = resolveSlide({ x: 0, z: 0 }, { x: 1, z: 1 }, FLAT);
    // X wins (tried first); Z must stay at the OLD value, not the desired 1.
    expect(r).toEqual({ x: 1, z: 0, blockedX: false, blockedZ: true });
  });

  it('stops dead (both axes blocked) when the diagonal and both slides are blocked', () => {
    CollisionDetector.checkCollision.mockImplementation(({ x, z }) => !(x === 0 && z === 0));
    const r = resolveSlide({ x: 0, z: 0 }, { x: 1, z: 1 }, FLAT);
    expect(r).toEqual({ x: 0, z: 0, blockedX: true, blockedZ: true });
  });

  it('stops dead on a pure head-on push (no wall-parallel axis to slide on)', () => {
    // next.x === old.x, so the X-slide is skipped; the Z-slide equals the full
    // move and is blocked -> fully stuck.
    CollisionDetector.checkCollision.mockImplementation(({ x, z }) => !(x === 0 && z === 0));
    const r = resolveSlide({ x: 0, z: 0 }, { x: 0, z: 1 }, FLAT);
    expect(r).toEqual({ x: 0, z: 0, blockedX: true, blockedZ: true });
  });

  it('a zero-length move is a no-op with neither axis blocked', () => {
    const r = resolveSlide({ x: 2, z: 2 }, { x: 2, z: 2 }, FLAT);
    expect(r).toEqual({ x: 2, z: 2, blockedX: false, blockedZ: false });
  });
});

describe('resolveSlide — cliff gate (real elevation logic)', () => {
  const onCliff = { radius: 0.5, ignoreId: null, priorLevel: 0, grid: cliffGrid, y: 0 };

  it('rejects a slide across a cliff even when no wall is present', () => {
    CollisionDetector.checkCollision.mockImplementation(() => false); // no walls anywhere
    // From cell (0,0) at level 0, every neighbouring cell is a level-1 cliff, so
    // the full move AND both single-axis slides are all rejected by canTraverse.
    const r = resolveSlide({ x: 0, z: 0 }, { x: 3, z: 3 }, onCliff);
    expect(r).toEqual({ x: 0, z: 0, blockedX: true, blockedZ: true });
  });

  it('allows a move that stays within the same cell (cliff gate not consulted)', () => {
    CollisionDetector.checkCollision.mockImplementation(() => false);
    // (0,0)->(1,1) are both inside cell (0,0): no cell change, so no cliff check.
    const r = resolveSlide({ x: 0, z: 0 }, { x: 1, z: 1 }, onCliff);
    expect(r).toEqual({ x: 1, z: 1, blockedX: false, blockedZ: false });
  });

  it('needs BOTH gates: a traversable cell still blocks if a wall is there', () => {
    CollisionDetector.checkCollision.mockImplementation(() => true); // wall everywhere
    const r = resolveSlide(
      { x: 0, z: 0 },
      { x: 3, z: 3 },
      { radius: 0.5, ignoreId: null, priorLevel: 0, grid: openGrid, y: 0 }
    );
    expect(r).toEqual({ x: 0, z: 0, blockedX: true, blockedZ: true });
  });
});

describe('canMoveTo', () => {
  it('passes the candidate position, mover radius and ignore id to the wall gate', () => {
    CollisionDetector.checkCollision.mockImplementation(() => false);
    const ok = canMoveTo(0, 0, 9, 9, 0.9, 'self-id', 0, null, 1.8);
    expect(ok).toBe(true);
    expect(CollisionDetector.checkCollision).toHaveBeenCalledWith(
      { x: 9, y: 1.8, z: 9 },
      0.9,
      'self-id'
    );
  });

  it('skips the cliff gate entirely when no grid is supplied', () => {
    CollisionDetector.checkCollision.mockImplementation(() => false);
    expect(canMoveTo(0, 0, 99, 99, 0.5, null, 0, null, 0)).toBe(true);
  });
});
