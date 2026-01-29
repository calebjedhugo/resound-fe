# Puzzle JSON Schema

This document defines the structure for Resound puzzle files.

## Puzzle Structure

```json
{
  "id": "string",                    // Unique puzzle identifier (e.g., "test-001")
  "name": "string",                  // Display name (e.g., "First Steps")
  "difficulty": number,              // 1 (Easy), 2 (Medium), 3 (Hard)
  "gridSize": number,                // Grid dimension (typically 15-64)
  "tempo": number,                   // BPM (typically 120)
  "clapDisplacement": "string",      // OPTIONAL: Default beat displacement for claps (e.g., "1/8", "1/4")
                                     // If omitted, uses system default (1/16)
  "playerStart": {                   // Player starting position (grid coordinates)
    "x": number,                     // Grid X
    "y": number,                     // Elevation level (integer, 0 = ground)
    "z": number                      // Grid Z
  },
  "floors": [                        // OPTIONAL: Elevated floor regions
    {
      "elevation": number,           // Elevation level (integer, 1+)
      "x1": number,                  // Grid X of min corner
      "z1": number,                  // Grid Z of min corner
      "x2": number,                  // Grid X of max corner
      "z2": number                   // Grid Z of max corner
    }
  ],
  "entities": [                      // Array of game entities
    {
      "type": "string",              // Entity type: "creature", "gate", "fountain", "wall", "ramp"
      "position": {
        "x": number,                 // Grid X
        "y": number,                 // Elevation level (integer)
        "z": number                  // Grid Z
      },
      "data": {                      // Entity-specific data (for creatures)
        "song": [                    // Array of notes/chords
          { "pitch": "string", "length": "string" }  // Single note
          // OR
          [{ "pitch": "string", "length": "string" }] // Chord
        ],
        "interval": number,          // Beats between song repetitions (creatures only)
        "audibleRange": number,      // Audio range in world units (creatures only)
        "clapDisplacement": "string" // OPTIONAL: Override puzzle default for this creature
      },
      "song": [                      // For gates and fountains (different format)
        { "pitch": "string", "length": "string" }
        // OR
        [{ "pitch": "string", "length": "string" }] // Chord
      ],
      "direction": "string"          // For ramps: "north", "south", "east", "west"
    }
  ]
}
```

## Elevation System

### Floors

The `floors` field defines rectangular regions at non-zero elevations. The base floor (elevation 0) covers the entire grid implicitly.

| Field       | Type    | Description                                |
|-------------|---------|--------------------------------------------|
| `elevation` | integer | Elevation level (1+). 0 is implicit.       |
| `x1`        | integer | Grid X of the region's min corner          |
| `z1`        | integer | Grid Z of the region's min corner          |
| `x2`        | integer | Grid X of the region's max corner          |
| `z2`        | integer | Grid Z of the region's max corner          |

Regions are inclusive on both ends: `x1=4, x2=6` covers grid cells 4, 5, and 6.

**Overlap rule:** When multiple floor regions cover the same cell, the highest elevation wins.

**Backward compatibility:** Omitting `floors` (or providing an empty array) means the entire grid is elevation 0. All existing puzzles work unchanged.

### Entity Position `y` Field

The `y` field in entity positions represents **elevation level** (integer), not world-space Y. PuzzleLoader converts it to world-space: `worldY = y * ELEVATION_HEIGHT` (where `ELEVATION_HEIGHT = 3.0`).

All existing puzzles use `y: 0`, which works unchanged.

### Player Start `y` Field

`playerStart.y` is the starting elevation level. The player's initial eye-height Y becomes `y * ELEVATION_HEIGHT + 1.8`.

### Ramps

Ramps connect adjacent elevation levels. A ramp's `position.y` is its **lower elevation** (e.g., `y: 0` connects elevation 0 to 1).

The `direction` field indicates which edge is the **high end**:

| Direction | Low Edge (enters from) | High Edge (exits to) |
|-----------|------------------------|----------------------|
| `north`   | South edge             | North edge           |
| `south`   | North edge             | South edge           |
| `east`    | West edge              | East edge            |
| `west`    | East edge              | West edge            |

**Connectivity rules:**
- Low end connects to floor at the ramp's elevation level
- High end connects to floor at elevation level + 1
- Puzzle designers must ensure matching floor regions exist adjacent to each ramp end

**Movement rules:**
- Players and creatures can traverse ramps to change elevation
- Movement between different elevation levels is blocked without a ramp
- Elevation boundaries act as implicit walls

## Note Format

Notes should be in scientific pitch notation:
- Format: `[Note][Accidental]?[Octave]`
- Examples: `C4`, `C#4`, `Db4`, `A4`
- Range: Typically C4-C5

## Rhythm Format

Rhythms are expressed as fractions:
- `1/1` = Whole note
- `1/2` = Half note
- `1/4` = Quarter note
- `1/8` = Eighth note

## Example

See `test-001.json` for a basic single-floor puzzle, or `elevation-demo.json` for a multi-elevation puzzle.
