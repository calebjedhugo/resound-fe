/**
 * @jest-environment jsdom
 */

/**
 * Song Editor Integration Tests
 *
 * End-to-end flows through SongEditorModal + NotationEditor + UndoManager.
 * Tests musical context (key/time signature, clef, accidentals) and rest support.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import SongEditorModal from 'editor/ui/SongEditorModal';

function createTestEnvironment(metadataOverrides = {}) {
  const root = document.createElement('div');
  root.id = 'editor-root';
  document.body.appendChild(root);

  const viewport = document.createElement('div');
  viewport.id = 'editor-viewport';
  viewport.tabIndex = 0;
  document.body.appendChild(viewport);

  const model = new EditorPuzzleModel();
  const undoManager = new UndoManager(model);

  // Apply metadata overrides (for key/time signature tests)
  if (Object.keys(metadataOverrides).length > 0) {
    undoManager.setMetadata(metadataOverrides);
  }

  return { root, viewport, model, undoManager };
}

/**
 * Mock SVG viewBox and getBoundingClientRect on the current SVG inside the staff.
 * Must be called after the NotationEditor renders (i.e., after modal.open or after
 * a click that triggers _renderStaff).
 */
function mockStaffSvg(root) {
  const svg = root.querySelector('.notation-staff svg');
  if (!svg) return null;
  svg.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 500,
    height: 120,
    right: 500,
    bottom: 120,
  });
  Object.defineProperty(svg, 'viewBox', {
    value: { baseVal: { x: 0, y: 0, width: 500, height: 120 } },
    configurable: true,
  });
  return svg;
}

/**
 * Dispatch a click event on the staff element, mocking the SVG first.
 * After the click triggers _renderStaff, the SVG is re-created, so we
 * re-mock it for subsequent calls.
 */
function clickStaff(root, options = {}) {
  mockStaffSvg(root);
  const staff = root.querySelector('.notation-staff');
  staff.dispatchEvent(
    new MouseEvent('click', {
      clientX: options.clientX || 50,
      clientY: options.clientY || 40,
      shiftKey: options.shiftKey || false,
      bubbles: true,
    })
  );
  // Re-mock after render (click causes _renderStaff which replaces the SVG)
  mockStaffSvg(root);
}

describe('Song Editor Integration', () => {
  let env;
  let modal;

  beforeEach(() => {
    // Default environment; tests that need overrides will create their own
  });

  afterEach(() => {
    if (modal) {
      modal.dispose();
      modal = null;
    }
    if (env) {
      if (env.root.parentNode) env.root.parentNode.removeChild(env.root);
      if (env.viewport.parentNode) env.viewport.parentNode.removeChild(env.viewport);
      env = null;
    }
  });

  // -- musical context --------------------------------------------------------

  describe('musical context', () => {
    it('modal displays the key signature from puzzle metadata', () => {
      env = createTestEnvironment({ keySignature: 'G' });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // G major has 1 sharp (F#). The key-signature group should be present.
      const svg = env.root.querySelector('.notation-staff svg');
      const keySigGroup = svg.querySelector('.key-signature');
      expect(keySigGroup).not.toBeNull();
      // Key of G has 1 accidental child
      expect(keySigGroup.childNodes.length).toBe(1);
    });

    it('modal displays the time signature from puzzle metadata', () => {
      env = createTestEnvironment({ timeSignature: [3, 4] });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      const timeSigGroup = svg.querySelector('.time-signature');
      expect(timeSigGroup).not.toBeNull();
      // SMuFL time signature exposes the numeric pair via data attributes.
      expect(timeSigGroup.getAttribute('data-beats')).toBe('3');
      expect(timeSigGroup.getAttribute('data-beat-value')).toBe('4');
      // Each digit position renders a SMuFL glyph group containing a path.
      expect(timeSigGroup.querySelector('.time-numerator')).not.toBeNull();
      expect(timeSigGroup.querySelector('.time-denominator')).not.toBeNull();
      expect(timeSigGroup.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
    });

    it('changing key signature in metadata then opening modal shows updated key', () => {
      env = createTestEnvironment({ keySignature: 'C' });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      // Open with C (no key sig)
      modal.open(id);
      let svg = env.root.querySelector('.notation-staff svg');
      let keySigGroup = svg.querySelector('.key-signature');
      expect(keySigGroup).toBeNull(); // C has no accidentals

      modal.close();

      // Change key to G, reopen
      env.undoManager.setMetadata({ keySignature: 'G' });
      modal.open(id);

      svg = env.root.querySelector('.notation-staff svg');
      keySigGroup = svg.querySelector('.key-signature');
      expect(keySigGroup).not.toBeNull();
      expect(keySigGroup.childNodes.length).toBe(1); // G has 1 sharp
    });

    it('auto clef updates when added notes shift the median pitch below C4', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      // Create creature with bass-range notes: C2, E2, G2
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [
          { pitch: 'C2', length: '1/4' },
          { pitch: 'E2', length: '1/4' },
          { pitch: 'G2', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // With median below C4, the auto-clef should select bass clef
      const svg = env.root.querySelector('.notation-staff svg');
      const clefGroup = svg.querySelector('.clef');
      expect(clefGroup).not.toBeNull();
      // Bass clef has class 'clef-bass'
      expect(clefGroup.classList.contains('clef-bass')).toBe(true);
    });

    it('explicit clef override persists across modal close and reopen', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // Set clef to bass via the selector
      const select = env.root.querySelector('.clef-selector');
      select.value = 'bass';
      select.dispatchEvent(new Event('change'));

      // Verify entity data saved
      let entity = env.undoManager.getEntity(id);
      expect(entity.data.clef).toBe('bass');

      // Close and reopen
      modal.close();
      modal.open(id);

      // Clef selector should still show bass
      const reopenedSelect = env.root.querySelector('.clef-selector');
      expect(reopenedSelect.value).toBe('bass');

      // SVG should render bass clef
      const svg = env.root.querySelector('.notation-staff svg');
      const clefGroup = svg.querySelector('.clef');
      expect(clefGroup.classList.contains('clef-bass')).toBe(true);
    });

    it('setting clef to bass then entering high notes keeps bass clef', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
        clef: 'bass',
      });

      modal.open(id);

      // Add notes via clicks (these will be high-range notes in treble territory)
      clickStaff(env.root, { clientX: 50, clientY: 20 });
      clickStaff(env.root, { clientX: 90, clientY: 15 });

      // Clef should still be bass because it was explicitly set
      const svg = env.root.querySelector('.notation-staff svg');
      const clefGroup = svg.querySelector('.clef');
      expect(clefGroup.classList.contains('clef-bass')).toBe(true);
    });

    it('accidental keyboard shortcuts work inside the modal', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // Select the first note by clicking on it
      const svg = env.root.querySelector('.notation-staff svg');
      const noteEl = svg.querySelector('[data-index="0"]');
      noteEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      mockStaffSvg(env.root);

      // Press '#' to apply sharp
      const staff = env.root.querySelector('.notation-staff');
      staff.dispatchEvent(new KeyboardEvent('keydown', { key: '#', bubbles: true }));

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.song[0].pitch).toBe('C#4');
    });

    it('key-signature-aware rendering hides accidentals implied by the key', () => {
      // Key of G implies F# — an F#4 note should NOT display a sharp accidental
      env = createTestEnvironment({ keySignature: 'G' });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [
          { pitch: 'F#4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      const accidentals = svg.querySelectorAll('.note-accidental');

      // F#4 is implied by key of G — no accidental displayed for it
      // F4 (natural) needs a natural sign since key says F should be sharp
      // So exactly 1 accidental should be displayed (the natural on F4)
      expect(accidentals.length).toBe(1);
    });

    it('accidental memory carries within a measure', () => {
      // In key of C, C#4 followed by another C#4
      env = createTestEnvironment({ keySignature: 'C' });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [
          { pitch: 'C#4', length: '1/4' },
          { pitch: 'C#4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      const accidentals = svg.querySelectorAll('.note-accidental');

      // First C#4 needs a sharp displayed; second C#4 should not (memory carries)
      expect(accidentals.length).toBe(1);
    });

    it('accidentals reset at barlines', () => {
      // In 4/4, four quarter notes fill a measure.
      // After the barline, C#4 should display its accidental again.
      env = createTestEnvironment({ keySignature: 'C', timeSignature: [4, 4] });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [
          { pitch: 'C#4', length: '1/4' }, // measure 1, beat 1 — sharp displayed
          { pitch: 'C#4', length: '1/4' }, // measure 1, beat 2 — memory, no accidental
          { pitch: 'D4', length: '1/4' }, // measure 1, beat 3
          { pitch: 'E4', length: '1/4' }, // measure 1, beat 4 — fills measure
          { pitch: 'C#4', length: '1/4' }, // measure 2 — sharp must display again
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      const accidentals = svg.querySelectorAll('.note-accidental');

      // Two accidentals: first C#4, and C#4 after the barline
      expect(accidentals.length).toBe(2);
    });

    it('unmetered mode (null time signature) renders no barlines', () => {
      env = createTestEnvironment({ timeSignature: null });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      // No time signature group should be rendered
      const timeSigGroup = svg.querySelector('.time-signature');
      expect(timeSigGroup).toBeNull();

      // No barline elements should be rendered
      const barlines = svg.querySelectorAll('.barline');
      expect(barlines.length).toBe(0);
    });

    it('unmetered mode resets accidentals after every note', () => {
      env = createTestEnvironment({ timeSignature: null, keySignature: 'C' });
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [
          { pitch: 'C#4', length: '1/4' },
          { pitch: 'C#4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      const accidentals = svg.querySelectorAll('.note-accidental');

      // In unmetered mode, accidentals reset after each note.
      // Both C#4 notes should display their sharp.
      expect(accidentals.length).toBe(2);
    });
  });

  // -- rest support -----------------------------------------------------------

  describe('rest support', () => {
    it('pressing r in the modal inserts a rest into the entity song', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // Focus the staff and press 'r' to insert a rest
      const staff = env.root.querySelector('.notation-staff');
      staff.focus();
      staff.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(1);
      // Rest has length but no pitch
      expect(entity.data.song[0].length).toBe('1/4'); // default quarter note
      expect(entity.data.song[0].pitch).toBeUndefined();
    });

    it('rest renders as a rest symbol, not a note', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [{ length: '1/4' }], // rest (no pitch)
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      // Should have a rest group, not a note ellipse
      const restGroups = svg.querySelectorAll('.rest');
      expect(restGroups.length).toBeGreaterThan(0);

      // Should have no note-head ellipses
      const noteEllipses = svg.querySelectorAll('ellipse');
      expect(noteEllipses.length).toBe(0);
    });

    it('rest is preserved across modal close and reopen', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // Insert a rest
      const staff = env.root.querySelector('.notation-staff');
      staff.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));

      // Verify rest is in entity data
      let entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(1);
      expect(entity.data.song[0].pitch).toBeUndefined();

      // Close and reopen
      modal.close();
      modal.open(id);

      // SVG should still show a rest
      const svg = env.root.querySelector('.notation-staff svg');
      const restGroups = svg.querySelectorAll('.rest');
      expect(restGroups.length).toBeGreaterThan(0);

      // Entity data should still have the rest
      entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(1);
      expect(entity.data.song[0].pitch).toBeUndefined();
    });

    it('undo reverses rest insertion', () => {
      env = createTestEnvironment();
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // Insert a rest
      const staff = env.root.querySelector('.notation-staff');
      staff.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));

      let entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(1);

      // Undo should remove the rest
      env.undoManager.undo();

      entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(0);
    });
  });
});
