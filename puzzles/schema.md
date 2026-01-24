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
  "playerStart": {                   // Player starting position
    "x": number,
    "y": number,
    "z": number
  },
  "entities": [                      // Array of game entities
    {
      "type": "string",              // Entity type: "creature", "gate", "fountain", "wall", "ramp"
      "position": {
        "x": number,
        "y": number,
        "z": number
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

See `test-001.json` for a complete example puzzle.
