# Elevation System & Ramps - Detailed Spec

## Problem Statement

The current world is entirely flat. Every entity sits at Y=0, the player is locked at Y=1.8, and the existing `Ramp` entity is a non-functional green box that neither slopes nor affects elevation. The `y` field in puzzle JSON positions is always 0 and serves no purpose.

To build puzzles in three dimensions, we need:

1. **Floors at varying elevations** - regions of the grid at different heights
2. **Functional ramps** - sloped surfaces that transition entities between elevation levels
3. **Elevation-aware movement** - player and creature Y-positions track the surface they stand on
4. **Elevation-aware collision** - entities at different elevations don't block each other; elevation changes without ramps are impassable

---

## Elevation Model

### Discrete Elevation Levels

Elevation uses integer levels (0, 1, 2, ...). Each level corresponds to a floor height in world space:

```
floorY = elevation * ELEVATION_HEIGHT
```

New constant:

```javascript
// Height of one elevation level in world units
// Equal to WORLD_SCALE so one elevation step = one grid cell vertically
export const ELEVATION_HEIGHT = 3.0;
```

At each elevation, the player's eye height remains `floorY + 1.8`.

### Reference Heights

| Elevation | Floor Y | Player Eyes Y | Wall Base Y | Wall Top Y |
|-----------|---------|---------------|-------------|------------|
| 0         | 0.0     | 1.8           | 0.0         | 2.5        |
| 1         | 3.0     | 4.8           | 3.0         | 5.5        |
| 2         | 6.0     | 7.8           | 6.0         | 8.5        |

Walls at a given elevation are 2.5 units tall (unchanged), meaning they sit below the floor of the next elevation. Puzzle designers should use walls at elevation boundaries to prevent walking off edges.

---

## Puzzle Schema Changes

### New Top-Level Field: `floors`

Defines rectangular floor regions at non-zero elevations. The base floor (elevation 0) covers the entire grid implicitly and does not need to be declared.

```json
{
  "id": "test-005",
  "name": "The High Ground",
  "gridSize": 15,
  "tempo": 120,
  "playerStart": { "x": 7, "y": 0, "z": 13 },
  "floors": [
    { "elevation": 1, "x1": 4, "z1": 4, "x2": 10, "z2": 8 },
    { "elevation": 2, "x1": 6, "z1": 5, "x2": 8, "z2": 7 }
  ],
  "entities": [...]
}
```

**Floor region fields:**

| Field       | Type    | Description                                |
|-------------|---------|--------------------------------------------|
| `elevation` | integer | Elevation level (1+). 0 is implicit.       |
| `x1`        | integer | Grid X of the region's min corner          |
| `z1`        | integer | Grid Z of the region's min corner          |
| `x2`        | integer | Grid X of the region's max corner          |
| `z2`        | integer | Grid Z of the region's max corner          |

Regions are inclusive on both ends: `x1=4, x2=6` covers grid cells 4, 5, and 6.

**Overlap rule:** When multiple floor regions cover the same cell, the highest elevation wins. This allows stacking floors naturally.

**`floors` is optional.** Omitting it (or providing an empty array) means the entire grid is elevation 0, preserving backward compatibility with existing puzzles.

### Entity Position `y` Field

The `y` field in entity positions now represents **elevation level** (integer), not world-space Y:

```json
{ "type": "wall", "position": { "x": 5, "y": 1, "z": 6 } }
```

This wall is at elevation 1. PuzzleLoader converts it to world-space: `y = 1 * ELEVATION_HEIGHT = 3.0`.

**Backward compatibility:** All existing puzzles use `y: 0`, which works unchanged.

### `playerStart.y` as Starting Elevation

```json
"playerStart": { "x": 7, "y": 1, "z": 13 }
```

The player starts on the floor at elevation 1. Their initial eye-height Y becomes `1 * ELEVATION_HEIGHT + 1.8 = 4.8`.

### Ramp Entity Schema

Ramps gain an explicit `elevation` (the lower end) and retain `direction` (which way faces uphill):

```json
{
  "type": "ramp",
  "position": { "x": 5, "y": 0, "z": 6 },
  "direction": "north"
}
```

The ramp sits at grid cell (5, 6). Its `position.y` is the **lower elevation** (0 in this case). The ramp connects elevation 0 to elevation 1. The `direction` indicates which edge is the high end:

| Direction | Low Edge  | High Edge | Slope Axis |
|-----------|-----------|-----------|------------|
| `north`   | South (-Z max) | North (-Z min) | Z axis     |
| `south`   | North (-Z min) | South (-Z max) | Z axis     |
| `east`    | West (-X min) | East (+X max) | X axis     |
| `west`    | East (+X max) | West (-X min) | X axis     |

The high end of the ramp connects to a floor at `elevation + 1`. Puzzle designers must ensure a floor region at that elevation exists adjacent to the ramp's high end.

---

## Elevation Grid

### Data Structure

A new lookup structure maps grid coordinates to elevation levels. Built once when a puzzle loads and queried during movement.

```javascript
class ElevationGrid {
  constructor(gridSize) {
    this.gridSize = gridSize;
    // 2D array: grid[z][x] = elevation level
    this.grid = Array.from({ length: gridSize }, () =>
      new Array(gridSize).fill(0) // Default elevation 0
    );
    // Ramp lookup: ramps[z][x] = Ramp entity or null
    this.ramps = Array.from({ length: gridSize }, () =>
      new Array(gridSize).fill(null)
    );
  }

  /**
   * Apply floor regions from puzzle data
   */
  applyFloors(floors) {
    for (const floor of floors) {
      for (let z = floor.z1; z <= floor.z2; z++) {
        for (let x = floor.x1; x <= floor.x2; x++) {
          // Highest elevation wins
          if (floor.elevation > this.grid[z][x]) {
            this.grid[z][x] = floor.elevation;
          }
        }
      }
    }
  }

  /**
   * Register a ramp at a grid position
   */
  registerRamp(gridX, gridZ, ramp) {
    this.ramps[gridZ][gridX] = ramp;
  }

  /**
   * Get the floor elevation at a grid position
   */
  getElevation(gridX, gridZ) {
    if (gridX < 0 || gridX >= this.gridSize || gridZ < 0 || gridZ >= this.gridSize) {
      return 0; // Out of bounds defaults to 0
    }
    return this.grid[gridZ][gridX];
  }

  /**
   * Get the ramp at a grid position (or null)
   */
  getRamp(gridX, gridZ) {
    if (gridX < 0 || gridX >= this.gridSize || gridZ < 0 || gridZ >= this.gridSize) {
      return null;
    }
    return this.ramps[gridZ][gridX];
  }

  /**
   * Convert world position to grid coordinates
   */
  worldToGrid(worldX, worldZ) {
    return {
      x: Math.round(worldX / WORLD_SCALE),
      z: Math.round(worldZ / WORLD_SCALE),
    };
  }
}
```

The `ElevationGrid` is built by `PuzzleLoader.parse()` and stored on `gameState`:

```javascript
gameState.elevationGrid = new ElevationGrid(puzzleData.gridSize);
gameState.elevationGrid.applyFloors(puzzleData.floors || []);
```

Ramps are registered as they're created during entity parsing.

---

## Floor Rendering Changes

### Current: Single Plane

`Floor.js` creates one `PlaneGeometry` covering the entire grid at Y=0.

### New: Multi-Elevation Floor Rendering

Replace the single plane with floor surfaces per elevation region.

**Approach:** For each distinct elevation level present in the grid, generate a floor mesh at the appropriate Y height. Two options:

**Option A - One plane per elevation level (simpler):**

Create a full-grid-sized plane for each elevation level, but only render the cells at that elevation. Use a custom geometry or a clipping approach.

**Option B - Per-region planes (recommended):**

For elevation 0, generate one plane covering the full grid (unchanged from current behavior, acts as the "ground"). For each entry in the `floors` array, generate an additional plane at the specified elevation and size.

```javascript
class Floor extends Entity {
  constructor(gridSize, floors = []) {
    super('floor', { x: 0, y: 0, z: 0 });
    this.gridSize = gridSize;
    this.floors = floors;
    this.meshGroup = new THREE.Group();
    this.mesh = this.meshGroup; // EntityManager adds this to scene
    this.createMeshes();
  }

  createMeshes() {
    // Base floor at elevation 0 (full grid)
    this.meshGroup.add(this.createFloorPlane(
      this.gridSize, this.gridSize,
      (this.gridSize / 2) * WORLD_SCALE,
      0,
      (this.gridSize / 2) * WORLD_SCALE
    ));

    // Elevated floor regions
    for (const floor of this.floors) {
      const width = (floor.x2 - floor.x1 + 1);
      const depth = (floor.z2 - floor.z1 + 1);
      const centerX = ((floor.x1 + floor.x2) / 2) * WORLD_SCALE;
      const centerZ = ((floor.z1 + floor.z2) / 2) * WORLD_SCALE;
      const floorY = floor.elevation * ELEVATION_HEIGHT;

      this.meshGroup.add(this.createFloorPlane(
        width, depth, centerX, floorY, centerZ
      ));
    }
  }

  createFloorPlane(widthCells, depthCells, centerX, y, centerZ) {
    const geometry = new THREE.PlaneGeometry(
      widthCells * WORLD_SCALE,
      depthCells * WORLD_SCALE,
      widthCells,
      depthCells
    );
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centerX, y, centerZ);
    return mesh;
  }
}
```

Elevated floors render on top of the base floor. This is visually acceptable since the elevated floor completely covers the base floor beneath it. A future optimization could cut holes in the base floor, but it's unnecessary for correctness.

---

## Ramp Entity Changes

### Mesh: Wedge Geometry

Replace the current flat box with a wedge (triangular prism) that visually slopes from one elevation to the next.

```javascript
class Ramp extends Entity {
  constructor(position, data = {}) {
    super('ramp', position, data);
    this.direction = data.direction || 'north';
    this.elevation = Math.round(position.y / ELEVATION_HEIGHT);
    this.createMesh();
  }

  createMesh() {
    const geometry = this.createWedgeGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0x88ff88,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geometry, material);

    // Position at grid cell center, base at current elevation
    const baseY = this.elevation * ELEVATION_HEIGHT;
    this.mesh.position.set(this.position.x, baseY, this.position.z);

    // Rotate to face the correct direction
    const rotations = {
      north: 0,
      east: Math.PI / 2,
      south: Math.PI,
      west: -Math.PI / 2,
    };
    this.mesh.rotation.y = rotations[this.direction] || 0;
  }

  createWedgeGeometry() {
    // Custom BufferGeometry for a wedge shape
    // Base: WORLD_SCALE x WORLD_SCALE (3x3)
    // Height: ELEVATION_HEIGHT (3.0)
    // Low edge at local -Z, high edge at local +Z (rotated by direction)
    const hw = WORLD_SCALE / 2; // half width
    const hd = WORLD_SCALE / 2; // half depth
    const h = ELEVATION_HEIGHT;  // full height

    // Define vertices for the wedge
    // Bottom face (Y=0): 4 corners
    // Top face: only the 2 corners at the high edge (Y=h)
    // ... (standard wedge geometry construction)
  }

  /**
   * Calculate the Y position for a world-space point on this ramp
   * Returns null if the point is not on this ramp
   */
  getYAtPosition(worldX, worldZ) {
    const hw = WORLD_SCALE / 2;
    const localX = worldX - this.position.x;
    const localZ = worldZ - this.position.z;

    // Check bounds
    if (Math.abs(localX) > hw || Math.abs(localZ) > hw) {
      return null; // Not on this ramp
    }

    // Calculate progress along slope axis (0 = low end, 1 = high end)
    let progress;
    switch (this.direction) {
      case 'north': progress = (hw - localZ) / WORLD_SCALE; break; // -Z is high
      case 'south': progress = (hw + localZ) / WORLD_SCALE; break; // +Z is high
      case 'east':  progress = (hw + localX) / WORLD_SCALE; break; // +X is high
      case 'west':  progress = (hw - localX) / WORLD_SCALE; break; // -X is high
    }

    progress = Math.max(0, Math.min(1, progress));
    const baseY = this.elevation * ELEVATION_HEIGHT;
    return baseY + progress * ELEVATION_HEIGHT;
  }
}
```

### Ramp Properties

| Property    | Description                                     |
|-------------|-------------------------------------------------|
| `elevation` | The lower elevation level (derived from `y`)    |
| `direction` | Which edge is the high end (north/south/east/west) |

A ramp at elevation N connects:
- **Low end** (entering from the flat side): floor at elevation N
- **High end** (exiting from the raised side): floor at elevation N+1

---

## Player Movement Changes

### Current Behavior

In `motion.js`, the player moves in X-Z, collision is checked, and Y is locked at 1.8.

### New Behavior

After resolving X-Z movement and collision, calculate the player's Y position based on what they're standing on:

```javascript
const updateMotion = () => {
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);

  const oldX = camera.position.x;
  const oldZ = camera.position.z;

  updateLateralPosition(cameraDirection);
  updateBackForthPosition(cameraDirection);

  const newPosition = {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
  };

  // --- NEW: Elevation check ---
  const elevationGrid = gameState.elevationGrid;
  if (elevationGrid) {
    const oldGrid = elevationGrid.worldToGrid(oldX, oldZ); // was camera.position.z but that's been modified
    const newGrid = elevationGrid.worldToGrid(newPosition.x, newPosition.z);

    const oldElevation = getEffectiveElevation(oldX, oldZ, oldGrid, elevationGrid);
    const newElevation = getEffectiveElevation(newPosition.x, newPosition.z, newGrid, elevationGrid);

    // Block movement if elevation change without ramp
    if (!canTraverse(oldGrid, newGrid, oldElevation, newElevation, elevationGrid)) {
      camera.position.x = oldX;
      camera.position.z = oldZ;
      return; // Skip further collision checks
    }

    // Calculate Y position
    gameState.player.elevation = newElevation;
    const floorY = getFloorY(newPosition.x, newPosition.z, elevationGrid);
    camera.position.y = floorY + fixedYPosition;
  }
  // --- END NEW ---

  // Existing entity collision check (now elevation-aware)
  if (CollisionDetector.checkCollision(newPosition, playerRadius)) {
    camera.position.x = oldX;
    camera.position.z = oldZ;
  }

  updateCameraDirection();
};
```

### `getEffectiveElevation(worldX, worldZ, gridCoord, elevationGrid)`

Returns the elevation the entity is at, considering ramps:

1. Check if there's a ramp at the grid position
2. If on a ramp, determine which end they're closest to
3. Otherwise, return the grid cell's floor elevation

### `getFloorY(worldX, worldZ, elevationGrid)`

Returns the exact world-space Y for the floor surface at a position:

1. Check if a ramp exists at the grid position
2. If yes, use `ramp.getYAtPosition(worldX, worldZ)` for smooth interpolation
3. Otherwise, return `elevation * ELEVATION_HEIGHT`

### `canTraverse(fromGrid, toGrid, fromElevation, toElevation, elevationGrid)`

Determines if movement between two grid cells is allowed:

1. If both cells are at the same elevation: **allow** (normal movement)
2. If elevations differ by 1 and either cell has a ramp connecting them: **allow**
3. If elevations differ by more than 1: **block**
4. If elevations differ by 1 with no ramp: **block** (acts as an implicit wall)

This prevents the player from walking off elevated edges or stepping up ledges without ramps.

### Player Elevation State

Add to `gameState.player`:

```javascript
this.player = {
  position: { x: 0, y: 1.8, z: 0 },
  rotation: { x: 0, y: 0 },
  elevation: 0,        // NEW: current elevation level (integer or fractional on ramps)
  inventory: [null, null, null, null, null],
  activeSlot: 0,
  maxInventorySize: 5,
};
```

---

## Collision Detection Changes

### Elevation-Aware Entity Collision

Currently `CollisionDetector.checkCollision()` checks all entities regardless of Y position. With elevation, entities only collide if they're at the same (or similar) elevation.

```javascript
static checkCollision(position, radius, ignoreId = null) {
  const positionElevation = this.getElevationForPosition(position);

  for (const entity of gameState.entities) {
    if (entity.id === ignoreId) continue;

    // NEW: Skip entities at different elevations
    const entityElevation = this.getElevationForPosition(entity.position);
    if (Math.abs(positionElevation - entityElevation) > 0.5) continue;

    // ... existing collision checks (unchanged)
  }
  return false;
}

static getElevationForPosition(position) {
  if (!gameState.elevationGrid) return 0;
  const grid = gameState.elevationGrid.worldToGrid(position.x, position.z);
  const ramp = gameState.elevationGrid.getRamp(grid.x, grid.z);
  if (ramp) {
    const rampY = ramp.getYAtPosition(position.x, position.z);
    if (rampY !== null) return rampY / ELEVATION_HEIGHT;
  }
  return gameState.elevationGrid.getElevation(grid.x, grid.z);
}
```

The 0.5 threshold accounts for entities transitioning on ramps (fractional elevations). Two entities on the same ramp at different points can still collide.

### Ramps Are Not Collision Obstacles

Ramps should **not** block movement. They are walkable surfaces. `CollisionDetector` should continue to skip ramp entities (as it does now by not having a `case` for them).

### Edge Blocking

Movement from a higher elevation to a lower one (stepping off a ledge) is blocked by the `canTraverse` check in the motion system, NOT by `CollisionDetector`. This is a terrain check, not an entity collision.

---

## Camera Changes

Currently:
```javascript
camera.position.y = fixedYPosition; // Always 1.8
```

New:
```javascript
camera.position.y = floorY + fixedYPosition; // 1.8 above the current floor
```

On ramps, `floorY` changes smoothly as the player walks along the slope, producing a smooth camera rise/descent.

No changes to camera rotation, FOV, or mouse look.

---

## Creature Behavior at Elevation

### Movement

Creatures currently move in X-Z only. Extend to support elevation:

1. Creatures track their current elevation (derived from their grid position)
2. Force-based movement remains X-Z only (creatures don't fly)
3. After applying X-Z movement, update Y position based on elevation grid:
   - If the creature moved onto a ramp, interpolate Y
   - If the creature's new cell has a different floor elevation with no ramp, **block the movement** (same as hitting a wall)
4. Creatures CAN use ramps (allows harmony forces to push them up/down between floors)

```javascript
// In Creature.updateMovement():
// After calculating newX, newZ:
const newGrid = gameState.elevationGrid.worldToGrid(newX, newZ);
const oldGrid = gameState.elevationGrid.worldToGrid(this.position.x, this.position.z);
const oldElev = /* current elevation */;
const newElev = gameState.elevationGrid.getElevation(newGrid.x, newGrid.z);

if (!canTraverse(oldGrid, newGrid, oldElev, newElev, gameState.elevationGrid)) {
  // Blocked by elevation change - same as wall collision
  this.velocity.x = 0;
  this.velocity.z = 0;
  return;
}

// Apply movement, update Y
this.position.x = newX;
this.position.z = newZ;
this.position.y = getFloorY(newX, newZ, gameState.elevationGrid);
```

### Audio

No changes needed. Distance calculations already use 3D positions. A creature on elevation 1 (Y=3.0) will naturally be farther from a player on elevation 0 (Y=1.8), reducing its volume. The `getDistance()` utility uses X-Z distance only currently -- **this should be updated to use 3D distance** so elevation affects audibility:

```javascript
// Current (2D):
const getDistance = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);

// New (3D):
const getDistance = (a, b) => Math.sqrt(
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
);
```

This means creatures on different floors are harder to hear, which creates natural puzzle design constraints.

### Harmony Forces

Forces remain X-Z only. The Y component of the direction to a sound source is ignored for force calculation. This keeps creature movement grounded -- they don't levitate toward sounds above them.

---

## Entity Placement Rules

### Walls at Elevation Boundaries

Since there's no fall physics, elevated floors must have walls at their edges to prevent entities from walking off. This is a **puzzle design responsibility**, not enforced by the engine. The puzzle editor (future) should warn about unguarded elevation edges.

### Ramp Adjacency

A ramp at elevation N must have:
- A floor at elevation N adjacent to its low end
- A floor at elevation N+1 adjacent to its high end

If these conditions aren't met, the ramp is non-functional (you can walk on it but can't exit to a valid floor). The puzzle editor should validate this.

### Entity-Floor Alignment

Entities placed at `y: N` should sit on a floor region at elevation N. Placing a creature at `y: 1` on a cell with no elevation-1 floor means it floats. Again, a puzzle editor validation concern, not enforced at runtime.

---

## PuzzleLoader Changes

### Parsing `floors`

```javascript
static parse(puzzleData, entityManager, gameState) {
  // ... existing clear/reset logic ...

  // NEW: Build elevation grid
  const elevationGrid = new ElevationGrid(puzzleData.gridSize);
  elevationGrid.applyFloors(puzzleData.floors || []);
  gameState.elevationGrid = elevationGrid;

  // Create floor with elevation data
  const floor = new Floor(puzzleData.gridSize, puzzleData.floors || []);
  entityManager.add(floor);

  // ... existing perimeter wall generation ...
  // NOTE: Perimeter walls remain at elevation 0. Multi-level perimeters
  // require the puzzle designer to add walls at higher elevations manually.

  // Set player start position (scaled)
  gameState.player.position = {
    x: puzzleData.playerStart.x * WORLD_SCALE,
    y: puzzleData.playerStart.y * ELEVATION_HEIGHT + 1.8, // eye height above floor
    z: puzzleData.playerStart.z * WORLD_SCALE,
  };
  gameState.player.elevation = puzzleData.playerStart.y;

  // ... existing entity creation loop ...
  // When creating ramps, also register them in the elevation grid:
  case 'ramp':
    entity = new Ramp(scaledPosition, { direction: entityData.direction });
    const rampGridX = entityData.position.x;
    const rampGridZ = entityData.position.z;
    elevationGrid.registerRamp(rampGridX, rampGridZ, entity);
    break;
}
```

### Y-Scaling Change

Currently: `y: entityData.position.y * WORLD_SCALE`

New: `y: entityData.position.y * ELEVATION_HEIGHT`

Since `ELEVATION_HEIGHT === WORLD_SCALE === 3.0`, this is numerically identical but semantically different. Use the new constant for clarity.

---

## GameState Changes

```javascript
class GameState {
  constructor() {
    // ... existing fields ...

    this.player = {
      position: { x: 0, y: 1.8, z: 0 },
      rotation: { x: 0, y: 0 },
      elevation: 0,                              // NEW
      inventory: [null, null, null, null, null],
      activeSlot: 0,
      maxInventorySize: 5,
    };

    this.elevationGrid = null;                    // NEW
  }

  reset() {
    // ... existing reset ...
    this.player.elevation = 0;                    // NEW
    this.elevationGrid = null;                    // NEW
  }
}
```

---

## Constants Changes

```javascript
// New in constants.js:
export const ELEVATION_HEIGHT = 3.0; // World units per elevation level
```

---

## TDD Methodology

Every phase follows strict test-driven development. Per the project's testing philosophy (`TESTING.md`): tests are integration-style, describe behaviors through public APIs, and mock only browser APIs (Web Audio, Three.js, localStorage). Internal modules run together unmocked.

**Workflow for each phase:**

1. **Write failing tests first** that describe the expected behavior
2. **Implement** the minimum code to make those tests pass
3. **Refactor** if needed while keeping tests green
4. **Run the full suite** (`npm test -- --ci`) to confirm no regressions before moving to the next phase

**Test puzzle fixtures** for elevation live in `src/__tests__/fixtures/puzzles/` alongside the existing fixtures. New fixtures should be registered in `testUtils.js`.

**Test context additions** needed before Phase 1 begins:

| Method | Purpose |
|--------|---------|
| `ctx.getPlayerElevation()` | Get player's current elevation level |
| `ctx.getElevationAt(gridX, gridZ)` | Query the elevation grid |
| `ctx.getRampAt(gridX, gridZ)` | Query the ramp grid |

These helpers are added to `testUtils.js` as wrappers around `gameState` -- they don't mock anything, they just expose elevation state for assertions.

---

## Implementation Phases

### Phase 1: Elevation Grid & Data Layer

**Goal:** `ElevationGrid` correctly stores and queries elevation data. Puzzles with `floors` parse without error. No rendering or movement changes yet.

**Tests first** (`src/core/ElevationGrid.test.js`):

```javascript
describe('ElevationGrid', () => {
  describe('default state', () => {
    it('returns elevation 0 for all cells in an empty grid', () => {});
    it('returns elevation 0 for out-of-bounds coordinates', () => {});
  });

  describe('applying floor regions', () => {
    it('sets elevation for cells within a floor region', () => {});
    it('leaves cells outside floor regions at elevation 0', () => {});
    it('uses highest elevation when regions overlap', () => {});
    it('handles multiple non-overlapping regions at different elevations', () => {});
  });

  describe('ramp registration', () => {
    it('returns null for cells with no ramp', () => {});
    it('returns the registered ramp entity at a cell', () => {});
  });

  describe('worldToGrid conversion', () => {
    it('converts world coordinates to grid coordinates using WORLD_SCALE', () => {});
    it('rounds to nearest grid cell', () => {});
  });
});
```

**Tests first** (`src/core/PuzzleLoader.test.js` -- additions to existing suite):

```javascript
describe('PuzzleLoader with elevation', () => {
  it('builds an elevation grid when puzzle has floors', () => {});
  it('builds an elevation grid with all-zero elevation when puzzle has no floors', () => {});
  it('sets player starting elevation from playerStart.y', () => {});
  it('existing puzzles with y:0 load identically to before', () => {});
});
```

**Then implement:**

- `ElevationGrid` class in `src/core/ElevationGrid.js`
- `ELEVATION_HEIGHT` constant in `src/core/constants.js`
- `floors` parsing in `PuzzleLoader.parse()`
- `gameState.elevationGrid` and `gameState.player.elevation` fields
- Test fixture: `elevation-basic.json` (a puzzle with one elevated floor region)

---

### Phase 2: Ramp Elevation Calculation

**Goal:** `Ramp.getYAtPosition()` returns correct Y values for all four directions. Ramps register in the elevation grid.

**Tests first** (`src/entities/Ramp.test.js`):

```javascript
describe('Ramp elevation calculation', () => {
  describe('getYAtPosition', () => {
    it('returns null for positions outside the ramp bounds', () => {});

    it('returns base elevation Y at the low end of a north-facing ramp', () => {});
    it('returns base + ELEVATION_HEIGHT at the high end of a north-facing ramp', () => {});
    it('returns interpolated Y at the midpoint of a north-facing ramp', () => {});

    it('returns base elevation Y at the low end of a south-facing ramp', () => {});
    it('returns base + ELEVATION_HEIGHT at the high end of a south-facing ramp', () => {});

    it('returns base elevation Y at the low end of an east-facing ramp', () => {});
    it('returns base + ELEVATION_HEIGHT at the high end of an east-facing ramp', () => {});

    it('returns base elevation Y at the low end of a west-facing ramp', () => {});
    it('returns base + ELEVATION_HEIGHT at the high end of a west-facing ramp', () => {});

    it('clamps progress to 0-1 range at ramp edges', () => {});
    it('works for ramps at elevation > 0', () => {});
  });
});
```

**Tests first** (addition to `ElevationGrid.test.js`):

```javascript
describe('ramp registration via PuzzleLoader', () => {
  it('registers ramp entities in the elevation grid during puzzle parse', () => {});
  it('getRamp returns the correct ramp after loading a puzzle with ramps', () => {});
});
```

**Then implement:**

- `Ramp.getYAtPosition()` method
- `Ramp.elevation` property derived from position
- Ramp registration in `PuzzleLoader.parse()` (calls `elevationGrid.registerRamp()`)
- Update `Ramp.createMesh()` with wedge geometry
- Test fixture: `elevation-ramp.json` (puzzle with ramp connecting elevation 0 to elevation 1)

---

### Phase 3: Player Elevation Movement

**Goal:** The player's Y position tracks elevation. Walking on elevated floors and ramps changes height. Elevation boundaries without ramps block movement.

**Tests first** (`src/core/ElevationMovement.test.js`):

```javascript
describe('Player elevation movement', () => {
  describe('walking on flat elevated floors', () => {
    it('player on elevation 0 has Y position equal to eye height (1.8)', () => {});
    it('player on elevation 1 has Y position equal to ELEVATION_HEIGHT + 1.8', () => {});
  });

  describe('walking on ramps', () => {
    it('player Y increases smoothly while walking north on a north-facing ramp', () => {});
    it('player Y decreases smoothly while walking south on a north-facing ramp', () => {});
    it('player elevation updates to 1 after fully traversing a ramp from elevation 0', () => {});
  });

  describe('elevation boundary blocking', () => {
    it('player cannot walk from elevation 0 onto elevation 1 without a ramp', () => {});
    it('player cannot walk off elevation 1 onto elevation 0 without a ramp', () => {});
    it('player CAN walk from elevation 0 onto a ramp cell', () => {});
    it('player CAN walk from a ramp cell onto elevation 1 floor', () => {});
  });

  describe('canTraverse', () => {
    it('allows movement between cells at the same elevation', () => {});
    it('allows movement when a ramp connects the two elevations', () => {});
    it('blocks movement between cells differing by 1 elevation with no ramp', () => {});
    it('blocks movement between cells differing by more than 1 elevation', () => {});
  });

  describe('getFloorY', () => {
    it('returns 0 for elevation 0 cells', () => {});
    it('returns ELEVATION_HEIGHT for elevation 1 cells', () => {});
    it('delegates to ramp.getYAtPosition when on a ramp cell', () => {});
  });
});
```

**Then implement:**

- `getFloorY()`, `getEffectiveElevation()`, `canTraverse()` helpers (in a new `src/core/ElevationMovement.js` or similar)
- Update `motion.js` to call elevation helpers after X-Z movement
- Replace hardcoded `camera.position.y = fixedYPosition` with `floorY + fixedYPosition`
- Update `syncCameraToPlayer()` to include elevation Y
- Add `elevation` to `gameState.player`, update `reset()`

---

### Phase 4: Elevation-Aware Collision

**Goal:** Entities at different elevations don't block each other. Distance calculations include Y.

**Tests first** (`src/core/CollisionDetector.test.js` -- additions to existing suite):

```javascript
describe('Elevation-aware collision', () => {
  it('player collides with a wall at the same elevation', () => {});
  it('player does NOT collide with a wall at a different elevation', () => {});
  it('player collides with a closed gate at the same elevation', () => {});
  it('player does NOT collide with a closed gate at a different elevation', () => {});
  it('creature collides with a wall at the same elevation', () => {});
  it('creature does NOT collide with a wall at a different elevation', () => {});
  it('two creatures on the same ramp at different progress points still collide', () => {});
});
```

**Tests first** (`src/core/utils.test.js` -- new or additions):

```javascript
describe('getDistance with elevation', () => {
  it('returns 2D distance when positions have the same Y', () => {});
  it('includes Y difference in distance calculation', () => {});
  it('creature on elevation 1 is farther from player on elevation 0 than same-floor creature', () => {});
});
```

**Then implement:**

- Add `getElevationForPosition()` to `CollisionDetector`
- Add elevation comparison early-exit to `checkCollision()` loop
- Update `getDistance()` in `src/core/utils.js` to 3D

---

### Phase 5: Creature Elevation Support

**Goal:** Creatures respect elevation, traverse ramps, and are blocked by elevation boundaries.

**Tests first** (`src/entities/Creature.test.js` -- additions to existing suite):

```javascript
describe('Creature elevation behavior', () => {
  describe('elevation tracking', () => {
    it('creature spawned at elevation 1 has correct Y position', () => {});
    it('creature mesh Y reflects elevation', () => {});
  });

  describe('movement with elevation', () => {
    it('creature pushed by consonant force traverses a ramp to a higher floor', () => {});
    it('creature Y position updates as it moves along a ramp', () => {});
    it('creature is blocked by elevation change without a ramp', () => {});
    it('creature velocity resets to zero when blocked by elevation boundary', () => {});
  });

  describe('cross-elevation audio', () => {
    it('creature on elevation 1 is quieter to player on elevation 0 than same-floor creature', () => {});
    it('creature beyond audibleRange (including Y distance) is silent', () => {});
  });
});
```

**Then implement:**

- Add `this.elevation` tracking to `Creature`
- Add `canTraverse` check in `Creature.updateMovement()` after calculating new X-Z
- Update `this.position.y` from `getFloorY()` after valid movement
- Update `this.mesh.position` to reflect new Y

---

### Phase 6: Backward Compatibility & Schema Docs

**Goal:** All existing puzzles work identically. Schema docs are updated.

**Tests first** (run against existing fixtures):

```javascript
describe('Backward compatibility', () => {
  it('test-001 loads and plays identically (no floors defined)', () => {});
  it('test-002 loads and plays identically (no floors defined)', () => {});
  it('test-003 loads and plays identically (no floors defined)', () => {});
  it('test-004 loads and plays identically (no floors defined)', () => {});
  it('all entities in existing puzzles have elevation 0', () => {});
  it('player starts at elevation 0 with Y=1.8 in existing puzzles', () => {});
});
```

These tests should pass with zero code changes after phases 1-5, confirming backward compatibility. If any fail, it indicates a regression.

**Then:**

- Update `puzzles/schema.md` with `floors` field and elevation semantics
- Update `ROADMAP.md` to accurately reflect ramp/elevation status
- Add `elevation-basic.json` to `public/puzzles/` and `manifest.json` as a playable multi-elevation puzzle

---

## Example Puzzle: Multi-Floor

```json
{
  "id": "test-elevation",
  "name": "Elevated Harmony",
  "difficulty": 2,
  "gridSize": 15,
  "tempo": 120,
  "playerStart": { "x": 7, "y": 0, "z": 13 },
  "floors": [
    { "elevation": 1, "x1": 3, "z1": 3, "x2": 11, "z2": 7 }
  ],
  "entities": [
    { "type": "creature", "position": { "x": 7, "y": 1, "z": 5 },
      "data": { "song": [{ "pitch": "C4", "length": "1/1" }], "interval": 8, "audibleRange": 15 }
    },
    { "type": "ramp", "position": { "x": 7, "y": 0, "z": 8 }, "direction": "north" },
    { "type": "wall", "position": { "x": 2, "y": 1, "z": 3 } },
    { "type": "wall", "position": { "x": 3, "y": 1, "z": 3 } },
    { "type": "wall", "position": { "x": 4, "y": 1, "z": 3 } },
    { "type": "wall", "position": { "x": 5, "y": 1, "z": 3 } },
    { "type": "gate", "position": { "x": 6, "y": 1, "z": 3 },
      "song": [{ "pitch": "C4", "length": "1/1" }]
    },
    { "type": "fountain", "position": { "x": 7, "y": 1, "z": 4 },
      "song": [{ "pitch": "C4", "length": "1/1" }]
    }
  ]
}
```

**Layout (top-down, simplified):**
```
Z=0  [walls - perimeter]
Z=3  [--- elevated walls --- GATE ---]
Z=4  [    elevated floor + FOUNTAIN  ]
Z=5  [    elevated floor + CREATURE  ]
Z=7  [--- elevated floor edge ---    ]
Z=8  [         RAMP (north)          ]
Z=13 [     PLAYER START              ]
```

The player starts at ground level, walks north to the ramp at Z=8, ascends to the elevated platform, records the creature's song, plays it at the gate, then reaches the fountain.

---

## Design Decisions

### Decided

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Elevation model | Discrete integer levels | Simpler than continuous; fits grid-based puzzles |
| Floor regions | Rectangular, highest-wins overlap | Easy to author in JSON, covers most level designs |
| Edge behavior | Implicit blocking (no fall physics) | Avoids fall damage, death, respawn -- complexity this game doesn't need |
| Ramp size | Single grid cell | Keeps the grid-aligned model simple |
| Creature ramp usage | Allowed | Enables new puzzle mechanics (push creatures between floors) |
| Elevation-aware audio | 3D distance | Upper-floor creatures naturally quieter from ground level |

### Open Questions

**Q1: Wall height at elevation boundaries.** Current walls are 2.5 units tall. An elevated floor at 3.0 has a 0.5 unit gap above ground-level walls. Should walls auto-extend to meet the next floor, or should puzzle designers handle this with taller wall variants? **Recommendation:** Keep walls at 2.5 for now. The gap is above eye level from the ground floor and below floor level from the upper floor. It won't be visible in normal gameplay.

**Q2: Multi-cell ramps.** A single-cell ramp spanning 3 world units with 3 units of height is a 45-degree slope. Should we support 2-cell or 3-cell ramps for gentler slopes? **Recommendation:** Defer. Single-cell ramps work. If slopes feel too steep during playtesting, add multi-cell ramp support later.

**Q3: Bridges / overpasses.** Should two floors at different elevations be able to overlap on the X-Z grid (e.g., a bridge at elevation 2 over a corridor at elevation 0)? **Recommendation:** Out of scope for v1. The current "highest elevation wins" rule prevents this. Supporting it would require per-cell elevation stacks, which is substantially more complex. Revisit if puzzle design demands it.

**Q4: Perimeter walls at higher elevations.** Currently perimeter walls are auto-generated at elevation 0. Should the system auto-generate perimeter walls for elevated floor regions? **Recommendation:** No. Elevated regions are inside the grid and should be walled by the puzzle designer. Auto-generating would require edge detection of floor regions and could produce unwanted walls.

---

*Created: 2026-01-28*
