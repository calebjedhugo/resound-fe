# Notation Library Specification: Testing

Testing approach for the SVG notation renderer. Follows the project-wide [`TESTING.md`](../../TESTING.md) philosophy: test behaviors through public APIs, mock only browser APIs, never mock internal modules.

> **Parent:** [SPEC.md](SPEC.md)

---

## What Gets Mocked

**Mocked (external browser APIs):**
- DOM (`document.createElement`, `document.getElementById`)
- Potentially `requestAnimationFrame` if animation is added

**Not mocked (tested as integrated units):**
- All `lib/` modules
- All `components/`
- NotationRenderer
- Data parsing and validation

## Test Context

Create a test helper similar to the game's `createTestContext()`:

```js
// src/notation/__tests__/helpers/testUtils.js

export function createNotationContext() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const renderer = new NotationRenderer({ container });

  return {
    renderer,
    container,

    // Render helpers
    render(song) {
      return renderer.render(song);
    },

    // Query helpers
    getSvg() {
      return container.querySelector('svg');
    },
    getNotes() {
      return container.querySelectorAll('.note');
    },
    getRests() {
      return container.querySelectorAll('.rest');
    },
    getActiveNote() {
      return container.querySelector('.note-active');
    },
    getClef() {
      return container.querySelector('.clef');
    },
    getKeySignature() {
      return container.querySelector('.key-signature');
    },
    getTimeSignature() {
      return container.querySelector('.time-signature');
    },
    getBarLines() {
      return container.querySelectorAll('.bar-line');
    },
    getBeamGroups() {
      return container.querySelectorAll('.beam-group');
    },
    getLedgerLines() {
      return container.querySelectorAll('.ledger-line');
    },

    // Cleanup
    destroy() {
      renderer.clear();
      container.remove();
    }
  };
}
```

## Example Tests

```js
// NotationRenderer.test.js

describe('NotationRenderer', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('rendering simple melodies', () => {
    it('renders one note per pitch in the song', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' }
      ]);

      expect(ctx.getNotes()).toHaveLength(3);
    });

    it('renders rests when pitch is omitted', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { length: '1/4' },  // rest
        { pitch: 'G4', length: '1/4' }
      ]);

      expect(ctx.getNotes()).toHaveLength(2);
      expect(ctx.getRests()).toHaveLength(1);
    });
  });

  describe('clef inference', () => {
    it('uses treble clef when median pitch is C4 or above', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' }
      ]);

      expect(ctx.getClef().classList.contains('clef-treble')).toBe(true);
    });

    it('uses bass clef when median pitch is below C4', () => {
      ctx.render([
        { pitch: 'C3', length: '1/4' },
        { pitch: 'E3', length: '1/4' },
        { pitch: 'G3', length: '1/4' }
      ]);

      expect(ctx.getClef().classList.contains('clef-bass')).toBe(true);
    });

    it('uses percussion clef when no pitches are present', () => {
      ctx.render([
        { position: 1, length: '1/4' },
        { position: 5, length: '1/4' }
      ]);

      expect(ctx.getClef().classList.contains('clef-percussion')).toBe(true);
    });
  });

  describe('time signatures and bar lines', () => {
    it('shows no bar lines when time signature is omitted', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'C5', length: '1/4' }
      ]);

      expect(ctx.getBarLines()).toHaveLength(0);
      expect(ctx.getTimeSignature()).toBeNull();
    });

    it('shows time signature and bar lines when specified', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
          // measure 2
          { pitch: 'B4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'C4', length: '1/4' }
        ]
      });

      expect(ctx.getTimeSignature()).not.toBeNull();
      expect(ctx.getBarLines().length).toBeGreaterThan(0);
    });
  });

  describe('beaming', () => {
    it('beams eighth notes within the same beat', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/4' }
        ]
      });

      expect(ctx.getBeamGroups()).toHaveLength(1);
    });

    it('breaks beams across beat boundaries', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },  // beat 1
          { pitch: 'E4', length: '1/8' },
          { pitch: 'F4', length: '1/8' }   // beat 2
        ]
      });

      // Should have 2 beam groups, not 1 continuous beam
      expect(ctx.getBeamGroups()).toHaveLength(2);
    });
  });

  describe('playback position', () => {
    it('highlights the note at the current beat', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' }
      ]);

      ctx.renderer.setPlaybackPosition(1); // second note

      const active = ctx.getActiveNote();
      expect(active).not.toBeNull();
      expect(active.dataset.beat).toBe('1');
    });

    it('removes highlight when playback position is cleared', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' }
      ]);

      ctx.renderer.setPlaybackPosition(0);
      expect(ctx.getActiveNote()).not.toBeNull();

      ctx.renderer.setPlaybackPosition(null);
      expect(ctx.getActiveNote()).toBeNull();
    });
  });

  describe('ledger lines', () => {
    it('renders ledger lines for notes above the staff', () => {
      ctx.render([{ pitch: 'A5', length: '1/4' }]);

      expect(ctx.getLedgerLines().length).toBeGreaterThan(0);
    });

    it('renders ledger lines for notes below the staff', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]); // middle C needs 1 ledger

      expect(ctx.getLedgerLines()).toHaveLength(1);
    });
  });

  describe('multi-voice rendering', () => {
    it('renders separate staves for each voice', () => {
      ctx.render({
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] }
        ]
      });

      const staves = ctx.container.querySelectorAll('.staff');
      expect(staves).toHaveLength(2);
    });

    it('allows different time signatures per voice', () => {
      ctx.render({
        timeSignature: [4, 4],
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', timeSignature: [3, 4], notes: [{ pitch: 'C3', length: '1/4' }] }
        ]
      });

      const timeSigs = ctx.container.querySelectorAll('.time-signature');
      expect(timeSigs).toHaveLength(2);
      expect(timeSigs[0].textContent).toContain('4');
      expect(timeSigs[1].textContent).toContain('3');
    });
  });
});
```

## Test Fixtures

Create JSON files in `__tests__/fixtures/songs/` for reusable test data:

```js
// simple-melody.json
[
  { "pitch": "C4", "length": "1/4" },
  { "pitch": "D4", "length": "1/4" },
  { "pitch": "E4", "length": "1/4" },
  { "pitch": "F4", "length": "1/4" }
]

// with-rests.json
[
  { "pitch": "C4", "length": "1/4" },
  { "length": "1/4" },
  { "pitch": "E4", "length": "1/4" },
  { "length": "1/4" }
]

// with-chords.json
[
  [
    { "pitch": "C4", "length": "1/2" },
    { "pitch": "E4", "length": "1/2" },
    { "pitch": "G4", "length": "1/2" }
  ],
  { "pitch": "B4", "length": "1/2" }
]

// percussion.json - positions 1-9 (odd=lines, even=spaces)
[
  { "position": 5, "length": "1/4" },
  { "position": 5, "length": "1/8" },
  { "position": 5, "length": "1/8" },
  { "position": 1, "length": "1/4" },
  { "position": 9, "length": "1/2" }
]
```

---

*Spec Version: 1.0*
*Created: 2026-01-25*
*Extracted from SPEC.md v1.7*
