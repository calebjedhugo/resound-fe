import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import ElevationGrid from 'core/ElevationGrid';
import Entity from 'entities/Entity';
import { createFloorMaterial } from 'entities/EnvironmentLook';

// Raised storeys are thin SLABS, not planes: visible from below (players
// walk underneath them) and showing edge faces
const SLAB_THICKNESS = 0.4;
// A cliff edge's pale line (entities/EnvironmentLook): this wide on the
// storey's top, this deep down its side, lifted this far off the surface
const EDGE_WIDTH = 0.07;
const EDGE_DROP = 0.06;
const EDGE_LIFT = 0.004;

// Grid step toward each neighbour, and the direction a ramp's HIGH edge
// faces (Ramp: its high edge is at -Z before rotation, "north")
const SIDES = [
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
];
const RAMP_UP = {
  north: { dx: 0, dz: -1 },
  east: { dx: 1, dz: 0 },
  south: { dx: 0, dz: 1 },
  west: { dx: -1, dz: 0 },
};

/**
 * Triangles in world space, built up quad by quad: positions, normals and
 * `aEdge` (1 on a cliff edge's line, 0 elsewhere).
 */
class FloorGeometryBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.edges = [];
  }

  /**
   * A flat quad facing `normal` through corners a, b, c, d (in order around
   * it, either way: wound here to face `normal`).
   */
  quad(a, b, c, d, normal, edge = 0) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const facing =
      (ab[1] * ac[2] - ab[2] * ac[1]) * normal[0] +
      (ab[2] * ac[0] - ab[0] * ac[2]) * normal[1] +
      (ab[0] * ac[1] - ab[1] * ac[0]) * normal[2];
    const corners = facing >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const corner of corners) {
      this.positions.push(corner[0], corner[1], corner[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.edges.push(edge);
    }
  }

  /** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1). */
  box(x0, y0, z0, x1, y1, z1) {
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(this.edges, 1));
    if (geometry.computeBoundingSphere) geometry.computeBoundingSphere();
    return geometry;
  }
}

/**
 * One floor tile: a slab cell whose top sits at its storey's walk height,
 * with a side face only where no tile of the same storey continues (the
 * faces between neighbours are inside the floor).
 */
function addTile(builder, grid, tile) {
  const half = WORLD_SCALE / 2;
  const top = tile.y * ELEVATION_HEIGHT;
  const bottom = top - SLAB_THICKNESS;
  const cx = tile.x * WORLD_SCALE;
  const cz = tile.z * WORLD_SCALE;
  const x0 = cx - half;
  const x1 = cx + half;
  const z0 = cz - half;
  const z1 = cz + half;
  builder.quad([x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], [0, 1, 0]);
  builder.quad([x0, bottom, z0], [x1, bottom, z0], [x1, bottom, z1], [x0, bottom, z1], [0, -1, 0]);
  for (const side of SIDES) {
    if (!grid.hasLevel(tile.x + side.dx, tile.z + side.dz, tile.y)) {
      const ox = cx + side.dx * half;
      const oz = cz + side.dz * half;
      const rx = side.dz * half;
      const rz = -side.dx * half;
      builder.quad(
        [ox - rx, top, oz - rz],
        [ox + rx, top, oz + rz],
        [ox + rx, bottom, oz + rz],
        [ox - rx, bottom, oz - rz],
        [side.dx, 0, side.dz]
      );
    }
  }
}

/**
 * Trace every cliff edge: each side of a raised cell whose neighbour
 * lacks that level, unless the neighbour is a ramp arriving there (its
 * high end at this level, or its low end), holds a wall standing on that
 * level, or is off the grid (the perimeter wall stands there). With
 * tiles, every tile's storey counts (the ground's edge too), and nothing
 * is off the grid: the built floor's edge is a cliff.
 */
function addCliffEdges(builder, grid, ramps, walls, tiles, gridSize = 0) {
  const rampAt = new Map(ramps.map((r) => [`${r.x},${r.z}`, r]));
  const wallAt = new Set(walls.map((w) => `${w.x},${w.z},${w.y}`));
  const rampJoins = (x, z, toward, level) => {
    const ramp = rampAt.get(`${x},${z}`);
    if (!ramp) return false;
    const up = RAMP_UP[ramp.direction] || RAMP_UP.north;
    const highEnd = up.dx === toward.dx && up.dz === toward.dz;
    const lowEnd = up.dx === -toward.dx && up.dz === -toward.dz;
    return (highEnd && ramp.y + 1 === level) || (lowEnd && ramp.y === level);
  };
  const edgesOf = (x, z, level) => {
    for (const side of SIDES) {
      const nx = x + side.dx;
      const nz = z + side.dz;
      const onGrid = Boolean(tiles) || (nx >= 0 && nz >= 0 && nx < gridSize && nz < gridSize);
      // From the neighbour, this cell lies the opposite way
      const back = { dx: -side.dx, dz: -side.dz };
      if (
        onGrid &&
        !grid.hasLevel(nx, nz, level) &&
        !wallAt.has(`${nx},${nz},${level}`) &&
        !rampJoins(nx, nz, back, level)
      ) {
        addEdgeLine(builder, x, z, side, level * ELEVATION_HEIGHT);
      }
    }
  };
  if (tiles) {
    for (const tile of tiles) edgesOf(tile.x, tile.z, tile.y);
    return;
  }
  for (let z = 0; z < gridSize; z += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      for (const level of grid.getLevelsAt(x, z)) {
        if (level > 0) edgesOf(x, z, level);
      }
    }
  }
}

/** The line along one side of a raised cell: across its top, down its face. */
function addEdgeLine(builder, x, z, side, top) {
  const half = WORLD_SCALE / 2;
  const cx = x * WORLD_SCALE;
  const cz = z * WORLD_SCALE;
  // The side's outer line, and the run along it
  const ox = cx + side.dx * half;
  const oz = cz + side.dz * half;
  const rx = side.dz * half; // along the edge: right = (dz, -dx) scaled
  const rz = -side.dx * half;
  const ix = ox - side.dx * EDGE_WIDTH; // inner line of the top strip
  const iz = oz - side.dz * EDGE_WIDTH;
  const y = top + EDGE_LIFT;
  builder.quad(
    [ox - rx, y, oz - rz],
    [ox + rx, y, oz + rz],
    [ix + rx, y, iz + rz],
    [ix - rx, y, iz - rz],
    [0, 1, 0],
    1
  );
  const fx = ox + side.dx * EDGE_LIFT;
  const fz = oz + side.dz * EDGE_LIFT;
  builder.quad(
    [fx - rx, top, fz - rz],
    [fx + rx, top, fz + rz],
    [fx + rx, top - EDGE_DROP, fz + rz],
    [fx - rx, top - EDGE_DROP, fz - rz],
    [side.dx, 0, side.dz],
    1
  );
}
/**
 * The geometry of a tile-built floor (core/floorTiles): every tile a slab of
 * SLAB_THICKNESS with its top at its storey's walk height, a side face
 * wherever no tile of the same storey continues (empty space, or a lower or
 * higher floor beside it), and the pale cliff line along each such side —
 * the same at every storey, ground and subfloors included. The game's Floor
 * and the editor's schematic slabs (editor/viewport/TileSlabs) both build
 * from here.
 * @param {{x: number, y: number, z: number}[]} tiles
 * @param {object} [options] - elevationGrid, ramps, walls (as Floor's)
 * @returns {THREE.BufferGeometry}
 */
export function buildTileGeometry(tiles, { elevationGrid, ramps = [], walls = [] } = {}) {
  const grid = elevationGrid || ElevationGrid.fromTiles(tiles);
  const builder = new FloorGeometryBuilder();
  for (const tile of tiles) addTile(builder, grid, tile);
  addCliffEdges(builder, grid, ramps, walls, tiles);
  return builder.build();
}

class Floor extends Entity {
  /**
   * The whole floor of an area as ONE mesh: the ground (elevation 0,
   * implicit everywhere), each raised storey as a slab, and a pale line
   * along every cliff edge (a storey edge nothing walkable continues past).
   * A level built from floor tiles (`options.tiles`, core/floorTiles) has
   * no implicit ground: every tile, ground storey included, is a slab, and
   * its cliff lines run along every edge of the built floor.
   * @param {number} gridSize - an older level's grid (ignored with tiles)
   * @param {object[]} [floors] - raised storeys ({elevation, x1, z1, x2, z2})
   * @param {object} [options]
   * @param {AreaLight} [options.light] - the area's creature light
   * @param {?{x: number, y: number, z: number}[]} [options.tiles] - the
   *   level's floor tiles (grid cells, y the storey), or null/absent for an
   *   older level's full grid
   * @param {ElevationGrid} [options.elevationGrid] - its walkable levels
   *   (built from `floors` / `tiles` when not given)
   * @param {object[]} [options.ramps] - its ramps ({x, y, z, direction},
   *   grid units): a ramp's ends are no cliff
   * @param {object[]} [options.walls] - its walls ({x, y, z}, grid units):
   *   a wall standing on a storey's level beside it is no cliff either
   */
  constructor(
    gridSize,
    floors = [],
    { light, tiles = null, elevationGrid, ramps = [], walls = [] } = {}
  ) {
    // Center of the grid's true footprint: cell CENTERS run
    // 0..(gridSize-1)*WORLD_SCALE, so the footprint spans -1.5 to
    // gridSize*3 - 1.5. (Centering on gridSize/2 left a half-cell bare
    // strip along the north/west edges — a black wedge at every edge-row
    // doorway, and a sliver of void along north/west walls.) Tiles: the
    // centre of their footprint.
    const center = tiles ? Floor._tilesCenter(tiles) : ((gridSize - 1) / 2) * WORLD_SCALE;
    super('floor', tiles ? center : { x: center, y: 0, z: center });
    this.gridSize = gridSize;
    this.floors = floors;
    this.tiles = tiles;
    let grid = elevationGrid;
    if (!grid) {
      grid = tiles ? ElevationGrid.fromTiles(tiles) : new ElevationGrid(gridSize);
      if (!tiles) grid.applyFloors(floors);
    }
    let geometry;
    if (tiles) {
      geometry = buildTileGeometry(tiles, { elevationGrid: grid, ramps, walls });
    } else {
      const builder = new FloorGeometryBuilder();
      this._addGround(builder);
      for (const floor of floors) this._addSlab(builder, floor);
      addCliffEdges(builder, grid, ramps, walls, null, gridSize);
      geometry = builder.build();
    }
    this.mesh = new THREE.Mesh(geometry, createFloorMaterial(light));
    // Nothing built yet (a new tile-built level): nothing to draw
    this.mesh.visible = geometry.attributes.position.array.length > 0;
  }

  static _tilesCenter(tiles) {
    if (tiles.length === 0) return { x: 0, y: 0, z: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const t of tiles) {
      minX = Math.min(minX, t.x);
      maxX = Math.max(maxX, t.x);
      minZ = Math.min(minZ, t.z);
      maxZ = Math.max(maxZ, t.z);
    }
    return { x: ((minX + maxX) / 2) * WORLD_SCALE, y: 0, z: ((minZ + maxZ) / 2) * WORLD_SCALE };
  }

  _addGround(builder) {
    const lo = -WORLD_SCALE / 2;
    const hi = this.gridSize * WORLD_SCALE - WORLD_SCALE / 2;
    builder.quad([lo, 0, lo], [hi, 0, lo], [hi, 0, hi], [lo, 0, hi], [0, 1, 0]);
  }

  /** A raised storey: a slab whose TOP surface sits at the walk height. */
  _addSlab(builder, floor) {
    const half = WORLD_SCALE / 2;
    const top = floor.elevation * ELEVATION_HEIGHT;
    builder.box(
      floor.x1 * WORLD_SCALE - half,
      top - SLAB_THICKNESS,
      floor.z1 * WORLD_SCALE - half,
      floor.x2 * WORLD_SCALE + half,
      top,
      floor.z2 * WORLD_SCALE + half
    );
  }
}

Floor.SLAB_THICKNESS = SLAB_THICKNESS;

export default Floor;
