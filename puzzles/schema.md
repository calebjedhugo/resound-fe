# Puzzle JSON Schema

This document defines the structure for Resound puzzle files.

## Puzzle Structure

```json
{
  "id": "string",           // Unique puzzle identifier (e.g., "puzzle-001")
  "name": "string",         // Display name (e.g., "First Steps")
  "difficulty": number,     // 1 (Easy), 2 (Medium), 3 (Hard)
  "gridSize": number,       // Grid dimension (usually 64)
  "playerStart": {          // Player starting position
    "x": number,
    "y": number,
    "z": number
  },
  "entities": [             // Array of game entities
    {
      "type": "string",     // Entity type: "creature", "gate", "fountain", "wall", "ramp"
      "position": {
        "x": number,
        "y": number,
        "z": number
      },
      "song": {             // For creatures, gates, and fountains
        "notes": ["string"], // Array of notes (e.g., ["C4", "E4", "G4"])
        "rhythm": ["string"] // Array of rhythms (e.g., ["1/4", "1/4", "1/2"])
      },
      "direction": "string"  // For ramps: "north", "south", "east", "west"
    }
  ]
}
```

## Entity Types

### Creature
- `type`: "creature"
- `position`: {x, y, z}
- `song`: Monophonic melody with notes and rhythm

### Gate
- `type`: "gate"
- `position`: {x, y, z}
- `song`: Polyphonic chord with notes and rhythm

### Fountain
- `type`: "fountain"
- `position`: {x, y, z}
- `song`: Polyphonic chord with notes and rhythm (puzzle completion)

### Wall
- `type`: "wall"
- `position`: {x, y, z}

### Ramp
- `type`: "ramp"
- `position`: {x, y, z}
- `direction`: "north" | "south" | "east" | "west"

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
