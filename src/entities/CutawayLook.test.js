/**
 * The editor's cutaway rule (entities/CutawayLook) and what the game sees of
 * it: nothing, unless the editor turns it on. The rule is read through its
 * JS twin (the shaders' GLSL is its copy); the looks through their uniforms.
 */
import {
  CUT_UNIFORMS,
  CUT_VERTEX_GLSL,
  CUTAWAY_REACH,
  CUTAWAY_HALF_WIDTH,
  GHOST_DENSITY,
  cellGhosted,
  clearCut,
  currentCut,
  entityGhosted,
  ghostKeeps,
  setCut,
} from 'entities/CutawayLook';
import { createFloorMaterial, createWallMaterial } from 'entities/EnvironmentLook';
import { createGateMaterial, RAMP_MATERIAL } from 'entities/EntityLook';
import Floor, { buildTileGeometry } from 'entities/Floor';
import Ramp from 'entities/Ramp';
import CreatureLook from 'entities/CreatureLook';
import { cellsOfRects } from 'core/floorTiles';

// A 5x5 container on the ground: a ring of walls round cells 0..4, the
// cursor in its middle (2, 2)
const RING = [];
for (let i = 0; i <= 4; i += 1) {
  RING.push({ x: i, z: 0 }, { x: i, z: 4 });
  if (i > 0 && i < 4) RING.push({ x: 0, z: i }, { x: 4, z: i });
}
const cut = (mode, view, { storey = 0, centre = { x: 2, z: 2 } } = {}) => ({
  mode,
  storey,
  centre,
  view,
});
const SOUTH = { x: 0, z: 1 }; // the camera to the south (+z) of the cursor
const NORTH = { x: 0, z: -1 };
const SOUTH_EAST = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
const ghostWalls = (c) =>
  RING.filter((w) => cellGhosted(w.x, w.z, 0, true, c))
    .map((w) => `${w.x},${w.z}`)
    .sort();

afterEach(() => clearCut());

describe('the game: the cut is off unless the editor turns it on', () => {
  it('starts off, so nothing is a ghost', () => {
    expect(CUT_UNIFORMS.uCutMode.value).toBe(0);
    expect(currentCut().mode).toBe(0);
    for (let storey = -2; storey <= 3; storey += 1) {
      expect(cellGhosted(1, 4, storey, true)).toBe(false);
      expect(entityGhosted({ type: 'creature', x: 1, y: storey, z: 1 })).toBe(false);
    }
  });

  it('the floor and wall materials read the ONE shared cut (no per-material copy to drift)', () => {
    const floor = createFloorMaterial();
    const wall = createWallMaterial();
    for (const name of Object.keys(CUT_UNIFORMS)) {
      expect(floor.uniforms[name]).toBe(CUT_UNIFORMS[name]);
      expect(wall.uniforms[name]).toBe(CUT_UNIFORMS[name]);
    }
  });

  it("every entity look's own ghost starts off, and a ramp draws whole", () => {
    expect(createGateMaterial().uniforms.uGhost.value).toBe(0);
    const look = new CreatureLook(1);
    expect(look.ghosted).toBe(false);
    expect(look.body.material.uniforms.uGhost.value).toBe(0);
    const ramp = new Ramp({ x: 0, y: 0, z: 0 });
    RAMP_MATERIAL.uniforms.uGhost.value = 1; // whatever the last draw left
    ramp.mesh.onBeforeRender();
    expect(RAMP_MATERIAL.uniforms.uGhost.value).toBe(0);
  });

  it('clearCut puts every uniform back off', () => {
    setCut(cut(2, SOUTH, { storey: 3, centre: { x: 5, z: -2 } }));
    clearCut();
    expect(currentCut()).toEqual(cut(0, { x: 0, z: 0 }, { centre: { x: 0, z: 0 } }));
  });
});

describe('the storey cut', () => {
  it('ghosts every storey above the focused one; the focused one and below draw solid', () => {
    const c = cut(1, SOUTH, { storey: 1 });
    expect(cellGhosted(2, 2, 2, false, c)).toBe(true);
    expect(cellGhosted(2, 2, 5, true, c)).toBe(true);
    expect(cellGhosted(2, 2, 1, false, c)).toBe(false);
    expect(cellGhosted(2, 2, 0, true, c)).toBe(false);
    expect(cellGhosted(2, 2, -3, true, c)).toBe(false);
  });

  it('leaves the focused storey whole: no wall is cut away', () => {
    expect(ghostWalls(cut(1, SOUTH))).toEqual([]);
  });

  it('full draws everything whole', () => {
    expect(cellGhosted(2, 2, 4, false, cut(0, SOUTH))).toBe(false);
    expect(ghostWalls(cut(0, SOUTH))).toEqual([]);
  });

  it('reads the uniforms by default (what the shaders read)', () => {
    setCut(cut(1, SOUTH, { storey: 0 }));
    expect(entityGhosted({ type: 'creature', x: 9, y: 1, z: 9 })).toBe(true);
    expect(entityGhosted({ type: 'creature', x: 9, y: 0, z: 9 })).toBe(false);
  });
});

describe('the cutaway: the walls between the camera and the cursor', () => {
  it("camera to the south: the container's south wall and the near half of its sides open", () => {
    expect(ghostWalls(cut(2, SOUTH))).toEqual(
      ['0,3', '0,4', '1,4', '2,4', '3,4', '4,3', '4,4'].sort()
    );
  });

  it('follows the orbit: turned round to the north, the north wall opens instead', () => {
    expect(ghostWalls(cut(2, NORTH))).toEqual(
      ['0,0', '0,1', '1,0', '2,0', '3,0', '4,0', '4,1'].sort()
    );
  });

  it('from a corner: the two near walls open, the corners square to the view stay', () => {
    expect(ghostWalls(cut(2, SOUTH_EAST))).toEqual(
      ['1,4', '2,4', '3,4', '4,4', '4,1', '4,2', '4,3'].sort()
    );
  });

  it('never cuts what the cursor is on, nor the cells beside it square to the view', () => {
    const c = cut(2, SOUTH);
    expect(cellGhosted(2, 2, 0, true, c)).toBe(false);
    expect(cellGhosted(0, 2, 0, true, c)).toBe(false);
  });

  it('cuts only walls and gates on the focused storey: entities inside and other storeys keep to the storey cut', () => {
    const c = cut(2, SOUTH);
    expect(entityGhosted({ type: 'wall', x: 2, y: 0, z: 4 }, c)).toBe(true);
    expect(entityGhosted({ type: 'gate', x: 2, y: 0, z: 4 }, c)).toBe(true);
    expect(entityGhosted({ type: 'creature', x: 2, y: 0, z: 4 }, c)).toBe(false);
    expect(entityGhosted({ type: 'ramp', x: 2, y: 0, z: 4 }, c)).toBe(false);
    expect(cellGhosted(2, 4, -1, true, c)).toBe(false); // below: solid
    expect(cellGhosted(2, 0, 1, true, c)).toBe(true); // above: a ghost anyway
  });

  it('reaches so far toward the camera and so wide across, no further', () => {
    const c = cut(2, SOUTH);
    expect(cellGhosted(2, 2 + CUTAWAY_REACH, 0, true, c)).toBe(true);
    expect(cellGhosted(2, 3 + CUTAWAY_REACH, 0, true, c)).toBe(false);
    expect(cellGhosted(2 + Math.floor(CUTAWAY_HALF_WIDTH), 4, 0, true, c)).toBe(true);
    expect(cellGhosted(3 + Math.floor(CUTAWAY_HALF_WIDTH), 4, 0, true, c)).toBe(false);
  });

  it('with the camera overhead (no view direction) cuts nothing on the storey', () => {
    expect(ghostWalls(cut(2, { x: 0, z: 0 }))).toEqual([]);
  });

  it("the shaders' copy of the rule has its numbers", () => {
    expect(CUT_VERTEX_GLSL).toContain(`along <= ${CUTAWAY_REACH.toFixed(3)}`);
    expect(CUT_VERTEX_GLSL).toContain(`across <= ${CUTAWAY_HALF_WIDTH.toFixed(3)}`);
  });
});

describe('a ghost is a screen door, not a blend', () => {
  it('keeps about 3 pixels in 16, spread over every 4x4 block', () => {
    let kept = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) if (ghostKeeps(x + 0.5, y + 0.5)) kept += 1;
    }
    expect(kept / (64 * 64)).toBeCloseTo(3 / 16, 5);
    expect(kept / (64 * 64)).toBeGreaterThan(GHOST_DENSITY - 0.05);
    // Every 4x4 block alike (no bands across a big screen)
    const block = (bx, by) => {
      let n = 0;
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) if (ghostKeeps(bx + x + 0.5, by + y + 0.5)) n += 1;
      }
      return n;
    };
    expect(block(0, 0)).toBe(3);
    expect(block(2560, 2876)).toBe(3);
  });
});

describe("the floor knows each piece's owner (its cell and storey)", () => {
  const ownersOf = (geometry) => {
    const cuts = geometry.attributes.aCut.array;
    const owners = new Set();
    for (let i = 0; i < cuts.length; i += 4) owners.add(cuts.slice(i, i + 4).join(','));
    return owners;
  };

  it('a tile is its own; a wall top belongs to the wall under it, a storey below', () => {
    const geometry = buildTileGeometry([{ x: 0, y: 0, z: 0 }], { walls: [{ x: 1, y: 0, z: 0 }] });
    expect(ownersOf(geometry)).toEqual(new Set(['0,0,0,0', '1,0,0,1']));
    expect(geometry.attributes.aCut.array.length / 4).toBe(
      geometry.attributes.position.array.length / 3
    );
  });

  it("an older level's ground is no cell's: never a ghost", () => {
    const floor = new Floor(4, [{ elevation: 1, x1: 0, z1: 0, x2: 1, z2: 1 }]);
    for (const owner of ownersOf(floor.mesh.geometry)) {
      const [x, z, storey, wallLike] = owner.split(',').map(Number);
      expect(cellGhosted(x, z, storey, wallLike > 0.5, cut(2, SOUTH, { storey: -9 }))).toBe(false);
    }
  });

  it('so the storey cut ghosts the floor above and keeps a wall top with its wall', () => {
    const tiles = [
      ...cellsOfRects([{ elevation: 0, x1: 0, z1: 0, x2: 2, z2: 0 }]),
      { x: 0, y: 1, z: 0 },
    ];
    const geometry = buildTileGeometry(tiles, { walls: [{ x: 2, y: 0, z: 0 }] });
    const c = cut(1, SOUTH, { storey: 0 });
    const ghosts = [...ownersOf(geometry)].filter((owner) => {
      const [x, z, storey, wallLike] = owner.split(',').map(Number);
      return cellGhosted(x, z, storey, wallLike > 0.5, c);
    });
    expect(ghosts).toEqual(['0,0,1,0']); // the tile up at storey 1; not the wall's top
  });
});
