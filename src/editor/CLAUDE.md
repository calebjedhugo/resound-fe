# Editor — CLAUDE.md

## Key UI Files (`ui/`)

- **NotationEditor.js** — Main interactive SVG staff renderer. Handles single staff and grand staff modes.
- **SongEditorModal.js** — Modal wrapper. Reads entity data/metadata, passes options to NotationEditor.
- **StaffInteraction.js** — Pure-logic pitch/Y mapping and barline calculation. Delegates to `notation/lib/notePositions.js`.
- **AccidentalDisplay.js** — Pure function for key-signature-aware accidental rendering.
- **RhythmPalette.js** — Duration selector toolbar with SVG note icons.

## SVG Sizing (IMPORTANT)

Visual sizing of the staff is controlled by **SVG attributes in `ui/NotationEditor.js`**, not CSS.

When notation doesn't fit: fix SVG `height`, `viewBox`, and vertical offsets — never the modal CSS.

### Single Staff

```
SVG_HEIGHT = 200
STAFF_VERTICAL_OFFSET = SVG_HEIGHT / 2 - STAFF_CENTER_Y = 50
```

Content is wrapped in a staff-group with `translate(0, STAFF_VERTICAL_OFFSET)` to center vertically.

### Grand Staff

```
voiceYOffsets = [0, 90 + GRAND_STAFF_GAP]    // GRAND_STAFF_GAP = 60
contentBottom = voiceYOffsets[1] + STAFF_TOP_OFFSET + 80
svgHeight = contentBottom + GRAND_STAFF_PADDING * 2
```

Each voice group gets `translate(0, yOffset + GRAND_STAFF_PADDING)`. SVG sets explicit `height` attribute.

### Pattern

Both modes follow the same approach: calculate content bounds, add padding, set `height` + `viewBox` on the SVG, offset content with a translate. Reference `NotationDisplay.js` for how the game-side renderer adjusts height per mode.

## Notation Dependency Boundary

UI files import from `src/notation/` (components + lib) but **never** from game code (`entities/`, `core/`). Communication with the puzzle editor is through `undoManager.getEntity`/`updateEntity` only.

Layout constants here mirror `NotationRenderer.js` — keep both in sync.
