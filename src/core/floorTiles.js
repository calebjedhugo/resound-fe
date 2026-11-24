/**
 * Floor tiles: a level's floor as the cells the designer built, one storey
 * at a time (puzzles/schema.md "Floor tiles").
 *
 * A puzzle with a `tiles` array has EXACTLY that floor: no implicit ground,
 * no perimeter walls, cells anywhere (negative coordinates too). A puzzle
 * without one is the older shape: elevation 0 over the whole `gridSize`
 * square, raised `floors` regions on top, perimeter walls just outside.
 *
 * On disk the cells are packed into inclusive rectangles per storey
 * (`{elevation, x1, z1, x2, z2}`), so a built room is one short line; in
 * memory they are plain cells `{x, y, z}` (y = the storey).
 */

/** The key of a cell at a storey. */
export function tileKey(x, y, z) {
  return `${x},${y},${z}`;
}

/** Whether a puzzle's floor is built from tiles (else: the older full grid). */
export function hasTiles(puzzleData) {
  return Boolean(puzzleData) && Array.isArray(puzzleData.tiles);
}

/**
 * Every cell a list of tile rectangles covers ({x, y, z}; a cell listed by
 * two rectangles once).
 * @param {{elevation: number, x1: number, z1: number, x2: number, z2: number}[]} rects
 * @returns {{x: number, y: number, z: number}[]}
 */
export function cellsOfRects(rects) {
  const seen = new Set();
  const cells = [];
  for (const rect of rects || []) {
    const y = rect.elevation || 0;
    const x1 = Math.min(rect.x1, rect.x2);
    const x2 = Math.max(rect.x1, rect.x2);
    const z1 = Math.min(rect.z1, rect.z2);
    const z2 = Math.max(rect.z1, rect.z2);
    for (let z = z1; z <= z2; z += 1) {
      for (let x = x1; x <= x2; x += 1) {
        const key = tileKey(x, y, z);
        if (!seen.has(key)) {
          seen.add(key);
          cells.push({ x, y, z });
        }
      }
    }
  }
  return cells;
}

/**
 * The cells of a puzzle's built floor, or null for an older puzzle (no
 * `tiles`: its floor is the implicit full grid).
 * @param {object} puzzleData
 * @returns {?{x: number, y: number, z: number}[]}
 */
export function tileCellsOf(puzzleData) {
  return hasTiles(puzzleData) ? cellsOfRects(puzzleData.tiles) : null;
}

/**
 * Pack cells into as few rectangles as a simple sweep finds: runs along x
 * in each row, then a run stacked on the same run in the row before joins
 * its rectangle. Deterministic (sorted by storey, z, x), so the same floor
 * always writes the same file.
 * @param {{x: number, y: number, z: number}[]} cells
 * @returns {{elevation: number, x1: number, z1: number, x2: number, z2: number}[]}
 */
export function packTiles(cells) {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const rects = [];
  // Per storey, the rectangles whose last row is the row before: x1,x2 -> rect
  let open = new Map();
  let openY = null;
  let openZ = null;
  let i = 0;
  while (i < sorted.length) {
    const { y, z } = sorted[i];
    // The runs of this row
    const runs = [];
    while (i < sorted.length && sorted[i].y === y && sorted[i].z === z) {
      const x1 = sorted[i].x;
      let x2 = x1;
      i += 1;
      while (i < sorted.length && sorted[i].y === y && sorted[i].z === z) {
        if (sorted[i].x === x2) {
          i += 1; // a duplicate cell
        } else if (sorted[i].x === x2 + 1) {
          x2 += 1;
          i += 1;
        } else break;
      }
      runs.push({ x1, x2 });
    }
    const continues = openY === y && openZ === z - 1;
    const next = new Map();
    for (const { x1, x2 } of runs) {
      const above = continues ? open.get(`${x1},${x2}`) : null;
      if (above) {
        above.z2 = z;
        next.set(`${x1},${x2}`, above);
      } else {
        const rect = { elevation: y, x1, z1: z, x2, z2: z };
        rects.push(rect);
        next.set(`${x1},${x2}`, rect);
      }
    }
    open = next;
    openY = y;
    openZ = z;
  }
  return rects.sort(
    (a, b) => a.elevation - b.elevation || a.z1 - b.z1 || a.x1 - b.x1 || a.z2 - b.z2
  );
}

/**
 * The floor an older puzzle (no `tiles`) has, as cells: elevation 0 over
 * its whole grid, every raised region's cells, and elevation 0 under the
 * perimeter ring (rows/columns -1 and gridSize) where its perimeter walls
 * stand. The editor opens such a level as tiles plus explicit walls.
 * @param {number} gridSize
 * @param {object[]} [floors]
 * @returns {{x: number, y: number, z: number}[]}
 */
export function legacyCells(gridSize, floors = []) {
  return cellsOfRects([
    { elevation: 0, x1: -1, z1: -1, x2: gridSize, z2: gridSize },
    ...(floors || []).map((f) => ({ ...f })),
  ]);
}

/**
 * The grid cells of an older puzzle's perimeter walls (rows/columns -1 and
 * gridSize, corners included), y 0.
 * @param {number} gridSize
 * @returns {{x: number, y: number, z: number}[]}
 */
export function legacyPerimeterCells(gridSize) {
  const cells = [];
  for (let i = -1; i <= gridSize; i += 1) {
    cells.push({ x: i, y: 0, z: -1 });
    cells.push({ x: i, y: 0, z: gridSize });
  }
  for (let i = 0; i < gridSize; i += 1) {
    cells.push({ x: -1, y: 0, z: i });
    cells.push({ x: gridSize, y: 0, z: i });
  }
  return cells;
}
