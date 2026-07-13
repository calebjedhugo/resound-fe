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
  "teaches": ["string"],             // OPTIONAL: key-hint verbs this puzzle teaches — any of
                                     // "move", "record", "playback", "slots", "delete", "clap".
                                     // Hints for these verbs are ACTIVE in this puzzle regardless
                                     // of player history; each retires for the CURRENT VISIT when
                                     // performed and re-arms on re-entry (world entry or a doorway
                                     // crossing back in). [] = no hints here. Omitted = every hint
                                     // eligible (dev/legacy levels).
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
      "type": "string",              // Entity type: "creature", "gate", "fountain",
                                     // "wall", "ramp", "cleanser"
      "id": "string",                // Gates only: stable id, unique within the puzzle
                                     // (e.g., "east-door"). Auto-assigned by the editor.
      "facing": "string",            // Gates only: doorway plane — "north", "south",
                                     // "east", "west" (default "north"). Doors are
                                     // omnidirectional at runtime (any side walks
                                     // through); the editor no longer exposes this.
      "link": {                      // Gates only, OPTIONAL: portal to a gate in another puzzle
        "puzzleId": "string",        // Target puzzle id
        "gateId": "string"           // Target gate's stable id in that puzzle
      },
      "alwaysOpen": boolean,         // Gates only, OPTIONAL: this face is permanently
                                     // open (never closes, no performance needed).
                                     // On one side of a linked pair = a ONE-WAY door
                                     // (mirroring is skipped for such pairs).
      "ending": boolean,             // Gates only, OPTIONAL: arriving through this
                                     // gate (as a crossing destination) ends the demo
                                     // — the dismissible thanks-for-playing overlay
                                     // appears (ui/EndingOverlay.js).
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

### Cleanser (`type: "cleanser"`)

A walkable floor tile that empties the player's tape when they step onto it
(the replacement for the retired hold-to-delete verb — see `DESIGN.md` "the
slot TAPE"). Only needs a `position`; it takes no `song` or `data`. It gently
pulses as a wordless "this does something" affordance, and clearing is
edge-triggered on entry (standing on it doesn't repeatedly wipe; leaving and
re-entering does). Place one where you want a safe, deliberate reset — e.g. in
a 1-wide corridor so crossing it is unavoidable (`poc-two-keys` entry).

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

## Gate Links (Portals)

A gate may carry a `link` referencing a gate in **another puzzle** — the gate
becomes a door between the two areas. While such a gate is open (play-to-pass,
as always), the target area is visible through the doorway and walking through
transitions the player there, arriving at the linked partner gate.

A link may also target a gate in the **same puzzle** (an in-level teleport
door): the two gates form one door with the same rules. A gate can never
link to **itself** (validation error).

- **`id` (stable gate id):** unique within its puzzle, required for a gate to
  be linked to. The editor auto-assigns `gate-N` ids (renameable). Hand-authored
  files without gate ids get ids assigned on first editor save.
- **`facing`:** which face of the gate's cell is the doorway plane. Determines
  the portal render surface and the exit direction when crossing.
- **Links are bidirectional:** if puzzle A's `east-door` links to puzzle B's
  `west-door`, B's `west-door` links back to A's `east-door`. The editor keeps
  both files in sync automatically; do not hand-author one-way links.
- **The world graph is derived**, not stored: scanning all puzzle files' links
  yields the graph of gate-connected areas (used for on-demand area loading).
- **Tempo/key should match** across linked puzzles (both areas are live at
  once and share the musical clock). The editor warns on mismatch.
- **A linked pair shares one song**: both gates of a link carry the SAME
  `song` (the pair is one door — it mirrors its open state at runtime). The
  editor unifies songs at link time and errors when a same-puzzle pair's
  songs drift.
- **`alwaysOpen` faces are exempt from mirroring**: a pair with a
  permanently-open face is a ONE-WAY door — each face keeps its own
  openness. Crossing requires the face you enter to be open.
- **A pair shares its EARS (ruled 2026-07-11)**: a sound within
  source-range of EITHER face corrupts (and can complete) the door's
  matching, with no leak penalty between the two faces of the same door. A
  continuous singer beside one face therefore jams the door from BOTH
  sides.

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
