/**
 * @jest-environment jsdom
 */

/**
 * NotationEditor Tests
 *
 * Comprehensive tests for the rewritten NotationEditor that uses
 * the shared notation component system with musical context
 * (clef, key/time signature, accidentals, ledger lines, rests).
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import NotationEditor from 'editor/ui/NotationEditor';
import SongModel from 'editor/model/SongModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEditor(songData = [], options = {}) {
  const model = new EditorPuzzleModel();
  const undoManager = new UndoManager(model);
  const container = document.createElement('div');
  document.body.appendChild(container);

  // For polyphonic tests, use gate type
  if (options.entityType === 'gate') {
    const gateId = undoManager.addEntity('gate', 5, 0, 3, {
      song: songData,
      ...options.entityData,
    });
    const editor = new NotationEditor(container, undoManager, gateId, {
      polyphonic: true,
      keySignature: options.keySignature || 'C',
      timeSignature: options.timeSignature !== undefined ? options.timeSignature : [4, 4],
      clef: options.clef || null,
    });
    return { model, undoManager, container, editor, entityId: gateId };
  }

  const entityId = undoManager.addEntity('creature', 5, 0, 3, {
    song: songData,
    interval: 8,
    audibleRange: 15,
    ...options.entityData,
  });

  const editor = new NotationEditor(container, undoManager, entityId, {
    polyphonic: options.polyphonic !== undefined ? options.polyphonic : false,
    keySignature: options.keySignature || 'C',
    timeSignature: options.timeSignature !== undefined ? options.timeSignature : [4, 4],
    clef: options.clef || null,
  });
  return { model, undoManager, container, editor, entityId };
}

function getStaff(container) {
  return container.querySelector('.notation-staff');
}

function getSvg(container) {
  return container.querySelector('.notation-staff svg');
}

function dispatchKey(container, key, opts = {}) {
  const staff = getStaff(container);
  staff.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
}

function mockSvgBounds(container) {
  const svg = getSvg(container);
  if (!svg) return null;
  svg.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 800,
    height: 200,
    right: 800,
    bottom: 200,
  });
  Object.defineProperty(svg, 'viewBox', {
    value: { baseVal: { x: 0, y: 0, width: 800, height: 200 } },
    configurable: true,
  });
  return svg;
}

function clickStaff(container, options = {}) {
  mockSvgBounds(container);
  const staff = getStaff(container);
  staff.dispatchEvent(
    new MouseEvent('click', {
      clientX: options.clientX || 100,
      clientY: options.clientY || 60,
      shiftKey: options.shiftKey || false,
      bubbles: true,
    })
  );
  // Re-mock after render
  mockSvgBounds(container);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotationEditor', () => {
  let env;

  afterEach(() => {
    if (env && env.container && env.container.parentNode) {
      env.container.parentNode.removeChild(env.container);
    }
  });

  // -- Staff rendering --------------------------------------------------

  describe('staff rendering', () => {
    it('renders a staff-lines group', () => {
      env = createEditor([]);
      const svg = getSvg(env.container);
      const staffLines = svg.querySelector('.staff-lines');
      expect(staffLines).not.toBeNull();
    });

    it('renders five staff lines within the staff-lines group', () => {
      env = createEditor([]);
      const svg = getSvg(env.container);
      const staffLines = svg.querySelector('.staff-lines');
      const lines = staffLines.querySelectorAll('.staff-line');
      expect(lines.length).toBe(5);
    });

    it('renders SVG with viewBox height of 200', () => {
      env = createEditor([]);
      const svg = getSvg(env.container);
      const viewBox = svg.getAttribute('viewBox');
      expect(viewBox).toMatch(/\d+ \d+ \d+ 200/);
    });
  });

  // -- Note rendering ---------------------------------------------------

  describe('note rendering', () => {
    it('renders .note elements matching song length', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      const svg = getSvg(env.container);
      const notes = svg.querySelectorAll('.note');
      expect(notes.length).toBe(3);
    });

    it('renders filled head for quarter notes', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }]);
      const svg = getSvg(env.container);
      const noteHead = svg.querySelector('.note .note-head');
      expect(noteHead).not.toBeNull();
      expect(noteHead.getAttribute('fill')).toBe('currentColor');
    });

    it('renders open (unfilled) head for half notes', () => {
      env = createEditor([{ pitch: 'C4', length: '1/2' }]);
      const svg = getSvg(env.container);
      const noteHead = svg.querySelector('.note .note-head');
      expect(noteHead).not.toBeNull();
      expect(noteHead.getAttribute('fill')).toBe('none');
    });

    it('renders stems on stemmed notes', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }]);
      const svg = getSvg(env.container);
      const stem = svg.querySelector('.note .note-stem');
      expect(stem).not.toBeNull();
    });

    it('does not render stem on whole notes', () => {
      env = createEditor([{ pitch: 'C4', length: '1/1' }]);
      const svg = getSvg(env.container);
      const stem = svg.querySelector('.note .note-stem');
      expect(stem).toBeNull();
    });

    it('renders flags on eighth notes', () => {
      env = createEditor([{ pitch: 'C4', length: '1/8' }]);
      const svg = getSvg(env.container);
      const flag = svg.querySelector('.note .note-flag');
      expect(flag).not.toBeNull();
    });

    it('uses duration-based spacing for notes', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/2' },
      ]);
      const svg = getSvg(env.container);
      const notes = svg.querySelectorAll('.note');
      // Both should have transform attributes with different x positions
      const t1 = notes[0].getAttribute('transform');
      const t2 = notes[1].getAttribute('transform');
      expect(t1).not.toBe(t2);
    });

    it('renders notes with data-index attributes', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
      ]);
      const svg = getSvg(env.container);
      const notes = svg.querySelectorAll('.note');
      expect(notes[0].getAttribute('data-index')).toBe('0');
      expect(notes[1].getAttribute('data-index')).toBe('1');
    });
  });

  // -- Chord rendering (polyphonic) -------------------------------------

  describe('chord rendering', () => {
    it('renders multiple note heads at the same x position for chords', () => {
      env = createEditor(
        [
          [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'E4', length: '1/4' },
          ],
        ],
        { entityType: 'gate' }
      );
      const svg = getSvg(env.container);
      const chordGroup = svg.querySelector('.chord');
      expect(chordGroup).not.toBeNull();
      const heads = chordGroup.querySelectorAll('.note-head');
      expect(heads.length).toBe(2);
    });

    it('renders a single shared stem for chord', () => {
      env = createEditor(
        [
          [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'E4', length: '1/4' },
          ],
        ],
        { entityType: 'gate' }
      );
      const svg = getSvg(env.container);
      const chordGroup = svg.querySelector('.chord');
      const stems = chordGroup.querySelectorAll('.note-stem');
      expect(stems.length).toBe(1);
    });
  });

  // -- Selection --------------------------------------------------------

  describe('selection', () => {
    it('selected note gets .note-selected class', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
      ]);
      // Select first note via arrow keys
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, 'ArrowLeft');

      const svg = getSvg(env.container);
      const selected = svg.querySelector('.note-selected');
      expect(selected).not.toBeNull();
      expect(selected.getAttribute('data-index')).toBe('0');
    });

    it('clicking a note element selects it', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
      ]);
      const svg = getSvg(env.container);
      const noteEls = svg.querySelectorAll('.note');
      // Click the second note
      noteEls[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // After click, re-render happened; check the new SVG
      const newSvg = getSvg(env.container);
      const selected = newSvg.querySelector('.note-selected');
      expect(selected).not.toBeNull();
      expect(selected.getAttribute('data-index')).toBe('1');
    });
  });

  // -- Cursor -----------------------------------------------------------

  describe('cursor', () => {
    it('renders a cursor line element', () => {
      env = createEditor([]);
      const svg = getSvg(env.container);
      const cursor = svg.querySelector('.cursor-line');
      expect(cursor).not.toBeNull();
    });

    it('cursor moves right with ArrowRight', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
      ]);
      // Move cursor left to start, then right
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, 'ArrowLeft');
      const svg1 = getSvg(env.container);
      const cursor1 = svg1.querySelector('.cursor-line');
      const x1 = cursor1.getAttribute('x1');

      dispatchKey(env.container, 'ArrowRight');
      const svg2 = getSvg(env.container);
      const cursor2 = svg2.querySelector('.cursor-line');
      const x2 = cursor2.getAttribute('x1');

      expect(parseFloat(x2)).toBeGreaterThan(parseFloat(x1));
    });
  });

  // -- Barlines ---------------------------------------------------------

  describe('barlines', () => {
    it('renders barlines at measure boundaries', () => {
      // Four quarter notes = one full measure in 4/4
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'F4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);
      const svg = getSvg(env.container);
      const barlines = svg.querySelectorAll('.bar-line');
      expect(barlines.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -- Note interaction (monophonic) ------------------------------------

  describe('note interaction - monophonic', () => {
    it('click places a note', () => {
      env = createEditor([]);
      clickStaff(env.container, { clientX: 100, clientY: 60 });
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song.length).toBe(1);
    });

    it('shift-click does not create chord in monophonic mode', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }], { polyphonic: false });
      // Select the note first
      dispatchKey(env.container, 'ArrowLeft');
      clickStaff(env.container, { clientX: 100, clientY: 60, shiftKey: true });
      const entity = env.undoManager.getEntity(env.entityId);
      entity.data.song.forEach((entry) => {
        expect(Array.isArray(entry)).toBe(false);
      });
    });

    it('number keys insert notes at cursor', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }]);
      // Move cursor to start
      dispatchKey(env.container, 'ArrowLeft');
      // Press 5 for eighth note
      dispatchKey(env.container, '5');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song.length).toBe(2);
    });

    it('delete removes the selected note', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
      ]);
      // Select the first note
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, 'Delete');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song.length).toBe(1);
    });

    it('+ transposes selected note up', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '+');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].pitch).toBe('C#4');
    });

    it('- transposes selected note down', () => {
      env = createEditor([{ pitch: 'D4', length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '-');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].pitch).toBe('C#4');
    });

    it('. toggles dot on selected note', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '.');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].length).toBe('3/8');
    });
  });

  // -- Note interaction (polyphonic) ------------------------------------

  describe('note interaction - polyphonic', () => {
    it('shift-click creates chord in polyphonic mode', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }], { entityType: 'gate' });
      // Select the first note
      dispatchKey(env.container, 'ArrowLeft');
      clickStaff(env.container, { clientX: 100, clientY: 30, shiftKey: true });
      const entity = env.undoManager.getEntity(env.entityId);
      const hasChord = entity.data.song.some((entry) => Array.isArray(entry));
      expect(hasChord).toBe(true);
    });
  });

  // -- Data persistence -------------------------------------------------

  describe('data persistence', () => {
    it('save updates entity through UndoManager', () => {
      env = createEditor([]);
      clickStaff(env.container);
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song.length).toBeGreaterThan(0);
    });

    it('load populates from entity', () => {
      env = createEditor([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);
      const svg = getSvg(env.container);
      const notes = svg.querySelectorAll('.note');
      expect(notes.length).toBe(3);
    });
  });

  // -- Clef resolution --------------------------------------------------

  describe('clef resolution', () => {
    it('explicit override wins over auto-detect', () => {
      env = createEditor([{ pitch: 'C5', length: '1/4' }], { clef: 'bass' });
      // The clef should be bass despite high notes
      const svg = getSvg(env.container);
      const clef = svg.querySelector('.clef-bass');
      expect(clef).not.toBeNull();
    });

    it('auto-infers treble for high notes', () => {
      env = createEditor([
        { pitch: 'C5', length: '1/4' },
        { pitch: 'E5', length: '1/4' },
      ]);
      const svg = getSvg(env.container);
      const clef = svg.querySelector('.clef-treble');
      expect(clef).not.toBeNull();
    });

    it('auto-infers bass for low notes', () => {
      env = createEditor([
        { pitch: 'C2', length: '1/4' },
        { pitch: 'E2', length: '1/4' },
      ]);
      const svg = getSvg(env.container);
      const clef = svg.querySelector('.clef-bass');
      expect(clef).not.toBeNull();
    });

    it('defaults to treble for empty song', () => {
      env = createEditor([]);
      const svg = getSvg(env.container);
      const clef = svg.querySelector('.clef-treble');
      expect(clef).not.toBeNull();
    });

    it('explicit bass with high notes stays bass', () => {
      env = createEditor(
        [
          { pitch: 'C6', length: '1/4' },
          { pitch: 'E6', length: '1/4' },
        ],
        { clef: 'bass' }
      );
      const svg = getSvg(env.container);
      const clef = svg.querySelector('.clef-bass');
      expect(clef).not.toBeNull();
    });
  });

  // -- Staff header -----------------------------------------------------

  describe('staff header', () => {
    it('renders clef symbol at start of staff', () => {
      env = createEditor([]);
      const svg = getSvg(env.container);
      const clef = svg.querySelector('.clef');
      expect(clef).not.toBeNull();
    });

    it('renders key signature for non-C keys', () => {
      env = createEditor([], { keySignature: 'G' });
      const svg = getSvg(env.container);
      const keySig = svg.querySelector('.key-signature');
      expect(keySig).not.toBeNull();
    });

    it('renders correct count of accidentals in key signature', () => {
      env = createEditor([], { keySignature: 'D' });
      const svg = getSvg(env.container);
      const keySig = svg.querySelector('.key-signature');
      // D major has 2 sharps
      const accidentals = keySig.querySelectorAll('.accidental');
      expect(accidentals.length).toBe(2);
    });

    it('does not render key signature for C major', () => {
      env = createEditor([], { keySignature: 'C' });
      const svg = getSvg(env.container);
      const keySig = svg.querySelector('.key-signature');
      expect(keySig).toBeNull();
    });

    it('renders time signature', () => {
      env = createEditor([], { timeSignature: [4, 4] });
      const svg = getSvg(env.container);
      const timeSig = svg.querySelector('.time-signature');
      expect(timeSig).not.toBeNull();
    });

    it('does not render time signature when null', () => {
      env = createEditor([], { timeSignature: null });
      const svg = getSvg(env.container);
      const timeSig = svg.querySelector('.time-signature');
      expect(timeSig).toBeNull();
    });

    it('notes start after header width', () => {
      env = createEditor([{ pitch: 'C4', length: '1/4' }]);
      const svg = getSvg(env.container);
      const note = svg.querySelector('.note');
      const transform = note.getAttribute('transform');
      // Extract x from translate(x, y)
      const match = transform.match(/translate\(([\d.]+)/);
      // Header includes clef (30px) + time sig (25px) + padding, so x should be > 50
      expect(parseFloat(match[1])).toBeGreaterThan(50);
    });
  });

  // -- Accidental rendering ---------------------------------------------

  describe('accidental rendering', () => {
    it('renders accidental element for notes outside key signature', () => {
      env = createEditor([{ pitch: 'F#4', length: '1/4' }], { keySignature: 'C' });
      const svg = getSvg(env.container);
      const accidental = svg.querySelector('.accidental');
      expect(accidental).not.toBeNull();
    });

    it('does not render accidental for notes matching key signature', () => {
      env = createEditor([{ pitch: 'F#4', length: '1/4' }], { keySignature: 'G' });
      const svg = getSvg(env.container);
      // The key signature itself has accidentals; check note-level accidentals
      // Note-level accidentals are children of the note group or its wrapper
      const noteGroup = svg.querySelector('.note[data-index="0"]');
      // Look for accidental within the note's parent group (not key sig)
      const staffGroup = noteGroup.closest('g[transform]');
      // No note-level accidental should exist
      const noteAccidentals = svg.querySelectorAll('.note-accidental');
      expect(noteAccidentals.length).toBe(0);
    });

    it('resets accidental display at barlines', () => {
      // 4 quarter notes fill a measure, then F#4 in next measure needs accidental again in C major
      env = createEditor(
        [
          { pitch: 'F#4', length: '1/4' },
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          // New measure starts here
          { pitch: 'F#4', length: '1/4' },
        ],
        { keySignature: 'C' }
      );
      const svg = getSvg(env.container);
      const accidentals = svg.querySelectorAll('.note-accidental');
      // Both F#4 should have accidentals (reset at barline)
      expect(accidentals.length).toBe(2);
    });
  });

  // -- Accidental keyboard input ----------------------------------------

  describe('accidental keyboard input', () => {
    it('# adds sharp to selected note', () => {
      env = createEditor([{ pitch: 'F4', length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '#');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].pitch).toBe('F#4');
    });

    it('b adds flat to selected note', () => {
      env = createEditor([{ pitch: 'B4', length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, 'b');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].pitch).toBe('Bb4');
    });

    it('n removes accidental from selected note', () => {
      env = createEditor([{ pitch: 'F#4', length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, 'n');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].pitch).toBe('F4');
    });

    it('accidental keys are no-op when nothing is selected', () => {
      env = createEditor([{ pitch: 'F4', length: '1/4' }]);
      // Don't select anything (cursor at end, no selection)
      dispatchKey(env.container, '#');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].pitch).toBe('F4');
    });

    it('accidental change persists via UndoManager', () => {
      env = createEditor([{ pitch: 'F4', length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '#');

      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].pitch).toBe('F#4');

      // Undo should restore
      env.undoManager.undo();
      const restored = env.undoManager.getEntity(env.entityId);
      expect(restored.data.song[0].pitch).toBe('F4');
    });
  });

  // -- Ledger lines -----------------------------------------------------

  describe('ledger lines', () => {
    it('renders ledger lines for notes above the staff', () => {
      // A6 is well above treble clef staff
      env = createEditor([{ pitch: 'A6', length: '1/4' }]);
      const svg = getSvg(env.container);
      const ledgerLines = svg.querySelector('.ledger-lines');
      expect(ledgerLines).not.toBeNull();
    });

    it('renders ledger lines for notes below the staff', () => {
      // C3 in forced treble clef is well below the staff (y=180)
      env = createEditor([{ pitch: 'C3', length: '1/4' }], { clef: 'treble' });
      const svg = getSvg(env.container);
      const ledgerLines = svg.querySelector('.ledger-lines');
      expect(ledgerLines).not.toBeNull();
    });

    it('does not render ledger lines for notes on the staff', () => {
      // B4 is on the middle line of treble clef
      env = createEditor([{ pitch: 'B4', length: '1/4' }]);
      const svg = getSvg(env.container);
      const ledgerLines = svg.querySelector('.ledger-lines');
      expect(ledgerLines).toBeNull();
    });
  });

  // -- Rest input -------------------------------------------------------

  describe('rest input', () => {
    it('r key inserts a rest', () => {
      env = createEditor([]);
      dispatchKey(env.container, 'r');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song.length).toBe(1);
      expect(entity.data.song[0].pitch).toBeUndefined();
    });

    it('rest uses active palette duration', () => {
      env = createEditor([]);
      // Default palette is 1/4
      dispatchKey(env.container, 'r');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].length).toBe('1/4');
    });

    it('cursor advances after rest insertion', () => {
      env = createEditor([]);
      dispatchKey(env.container, 'r');
      // After rest append, cursor should be at 1
      expect(env.editor._songModel._cursorPosition).toBe(1);
    });

    it('rest saved through UndoManager', () => {
      env = createEditor([]);
      dispatchKey(env.container, 'r');

      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song.length).toBe(1);

      env.undoManager.undo();
      const restored = env.undoManager.getEntity(env.entityId);
      expect(restored.data.song.length).toBe(0);
    });
  });

  // -- Rest rendering ---------------------------------------------------

  describe('rest rendering', () => {
    it('renders rest with rest CSS class', () => {
      env = createEditor([{ length: '1/4' }]);
      const svg = getSvg(env.container);
      const rest = svg.querySelector('.rest');
      expect(rest).not.toBeNull();
    });

    it('rest has correct class for duration', () => {
      env = createEditor([{ length: '1/2' }]);
      const svg = getSvg(env.container);
      const rest = svg.querySelector('.rest-half');
      expect(rest).not.toBeNull();
    });

    it('rest has data-index attribute', () => {
      env = createEditor([{ length: '1/4' }]);
      const svg = getSvg(env.container);
      const rest = svg.querySelector('.rest');
      expect(rest.getAttribute('data-index')).toBe('0');
    });

    it('uses correct spacing for rest duration', () => {
      env = createEditor([{ length: '1/4' }, { pitch: 'C4', length: '1/4' }]);
      const svg = getSvg(env.container);
      const rest = svg.querySelector('.rest');
      const note = svg.querySelector('.note');
      // Rest and note should have different x positions (rest comes first)
      const restTransform = rest.getAttribute('transform');
      const noteTransform = note.getAttribute('transform');
      expect(restTransform).not.toBe(noteTransform);
    });
  });

  // -- Rest selection ---------------------------------------------------

  describe('rest selection', () => {
    it('rest can be selected with arrow keys', () => {
      env = createEditor([{ length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      const svg = getSvg(env.container);
      const selected = svg.querySelector('.note-selected');
      expect(selected).not.toBeNull();
    });

    it('duration change works on selected rest', () => {
      env = createEditor([{ length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '.');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0].length).toBe('3/8');
    });

    it('transpose is no-op on selected rest', () => {
      env = createEditor([{ length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '+');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0]).toEqual({ length: '1/4' });
    });

    it('accidental key is no-op on selected rest', () => {
      env = createEditor([{ length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, '#');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song[0]).toEqual({ length: '1/4' });
    });

    it('delete removes selected rest', () => {
      env = createEditor([{ length: '1/4' }]);
      dispatchKey(env.container, 'ArrowLeft');
      dispatchKey(env.container, 'Delete');
      const entity = env.undoManager.getEntity(env.entityId);
      expect(entity.data.song.length).toBe(0);
    });
  });

  // -- Rest and accidental memory ---------------------------------------

  describe('rest and accidental memory', () => {
    it('rests do not reset accidental memory within a measure', () => {
      // F#4 in C major, then rest, then F#4 again - second F# should not need accidental
      // because rest doesn't reset the memory
      env = createEditor(
        [{ pitch: 'F#4', length: '1/4' }, { length: '1/4' }, { pitch: 'F#4', length: '1/4' }],
        { keySignature: 'C' }
      );
      const svg = getSvg(env.container);
      const accidentals = svg.querySelectorAll('.note-accidental');
      // Only the first F#4 should show an accidental, the one after rest should not
      expect(accidentals.length).toBe(1);
    });
  });

  // -- Dotted duration handling ------------------------------------------

  describe('dotted duration handling', () => {
    it('renders dotted notes without crashing', () => {
      env = createEditor([{ pitch: 'C4', length: '3/8' }]);
      const svg = getSvg(env.container);
      // Should render something even for dotted durations
      expect(svg).not.toBeNull();
      // Should have at least one rendered element for the note
      const noteOrGroup = svg.querySelector('[data-index="0"]');
      expect(noteOrGroup).not.toBeNull();
    });
  });

  // -- Grand staff mode ---------------------------------------------------

  describe('grand staff mode', () => {
    function createGrandStaffEditor(trebleNotes = [], bassNotes = [], options = {}) {
      const songData =
        trebleNotes.length || bassNotes.length
          ? {
              voices: [
                { id: 'treble', clef: 'treble', notes: trebleNotes },
                { id: 'bass', clef: 'bass', notes: bassNotes },
              ],
              staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
            }
          : [];

      const model = new EditorPuzzleModel();
      const undoManager = new UndoManager(model);
      const container = document.createElement('div');
      document.body.appendChild(container);

      const entityId = undoManager.addEntity('gate', 5, 0, 3, {
        song: songData,
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
        ...options.entityData,
      });

      const editor = new NotationEditor(container, undoManager, entityId, {
        polyphonic: true,
        keySignature: options.keySignature || 'C',
        timeSignature: options.timeSignature !== undefined ? options.timeSignature : [4, 4],
        clef: null,
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      });
      return { model, undoManager, container, editor, entityId };
    }

    it('renders two staff-lines groups in grand staff mode', () => {
      env = createGrandStaffEditor();
      const svg = getSvg(env.container);
      const staffLines = svg.querySelectorAll('.staff-lines');
      expect(staffLines.length).toBe(2);
    });

    it('renders treble and bass clefs', () => {
      env = createGrandStaffEditor();
      const svg = getSvg(env.container);
      const trebleClef = svg.querySelector('.clef-treble');
      const bassClef = svg.querySelector('.clef-bass');
      expect(trebleClef).not.toBeNull();
      expect(bassClef).not.toBeNull();
    });

    it('starts with treble voice (index 0) active', () => {
      env = createGrandStaffEditor();
      expect(env.editor._activeVoiceIndex).toBe(0);
    });

    it('Enter key switches to bass voice (index 1)', () => {
      env = createGrandStaffEditor();
      dispatchKey(env.container, 'Enter');
      expect(env.editor._activeVoiceIndex).toBe(1);
    });

    it('Shift+Enter switches back to treble voice (index 0)', () => {
      env = createGrandStaffEditor();
      dispatchKey(env.container, 'Enter');
      expect(env.editor._activeVoiceIndex).toBe(1);
      dispatchKey(env.container, 'Enter', { shiftKey: true });
      expect(env.editor._activeVoiceIndex).toBe(0);
    });

    it('Enter does not go beyond last voice', () => {
      env = createGrandStaffEditor();
      dispatchKey(env.container, 'Enter');
      dispatchKey(env.container, 'Enter');
      expect(env.editor._activeVoiceIndex).toBe(1);
    });

    it('Shift+Enter does not go below first voice', () => {
      env = createGrandStaffEditor();
      dispatchKey(env.container, 'Enter', { shiftKey: true });
      expect(env.editor._activeVoiceIndex).toBe(0);
    });

    it('places notes on the active voice', () => {
      env = createGrandStaffEditor();
      // Place a note on treble (default active)
      clickStaff(env.container, { clientX: 100, clientY: 30 });
      const entity = env.undoManager.getEntity(env.entityId);
      const song = entity.data.song;
      expect(song.voices[0].notes.length).toBe(1);
      expect(song.voices[1].notes.length).toBe(0);
    });

    it('places notes on bass voice after switching', () => {
      env = createGrandStaffEditor();
      dispatchKey(env.container, 'Enter');
      clickStaff(env.container, { clientX: 100, clientY: 150 });
      const entity = env.undoManager.getEntity(env.entityId);
      const song = entity.data.song;
      expect(song.voices[0].notes.length).toBe(0);
      expect(song.voices[1].notes.length).toBe(1);
    });

    it('saves song in voices+staffGroups format', () => {
      env = createGrandStaffEditor();
      clickStaff(env.container, { clientX: 100, clientY: 30 });
      const entity = env.undoManager.getEntity(env.entityId);
      const song = entity.data.song;
      expect(song.voices).toBeDefined();
      expect(song.staffGroups).toBeDefined();
      expect(Array.isArray(song.voices)).toBe(true);
      expect(song.voices.length).toBe(2);
    });

    it('loads existing voices+staffGroups song data', () => {
      env = createGrandStaffEditor(
        [{ pitch: 'C5', length: '1/4' }],
        [{ pitch: 'C3', length: '1/4' }]
      );
      const svg = getSvg(env.container);
      const notes = svg.querySelectorAll('.note');
      expect(notes.length).toBe(2);
    });

    it('maintains separate cursor position per voice', () => {
      env = createGrandStaffEditor();
      // Place a note on treble
      clickStaff(env.container, { clientX: 100, clientY: 30 });
      expect(env.editor._voiceModels[0]._cursorPosition).toBe(1);
      expect(env.editor._voiceModels[1]._cursorPosition).toBe(0);
    });
  });
});
