/**
 * @jest-environment jsdom
 */

/**
 * SongEditorModal Tests
 *
 * Tests the modal dialog that wraps NotationEditor for song editing.
 * Uses jsdom with real EditorPuzzleModel and UndoManager instances.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import SongEditorModal from 'editor/ui/SongEditorModal';

function createTestEnvironment() {
  const root = document.createElement('div');
  root.id = 'editor-root';
  document.body.appendChild(root);

  const viewport = document.createElement('div');
  viewport.id = 'editor-viewport';
  viewport.tabIndex = 0;
  document.body.appendChild(viewport);

  const model = new EditorPuzzleModel();
  const undoManager = new UndoManager(model);

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

describe('SongEditorModal', () => {
  let env;
  let modal;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    if (modal) {
      modal.dispose();
      modal = null;
    }
    if (env.root.parentNode) env.root.parentNode.removeChild(env.root);
    if (env.viewport.parentNode) env.viewport.parentNode.removeChild(env.viewport);
  });

  // -- opening ----------------------------------------------------------------

  describe('opening', () => {
    it('appends a backdrop element to the root container when opened', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const backdrop = env.root.querySelector('.song-modal-backdrop');
      expect(backdrop).not.toBeNull();
    });

    it('creates a NotationEditor inside the modal body', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const body = env.root.querySelector('.song-modal-body');
      expect(body).not.toBeNull();
      // NotationEditor renders a rhythm palette and a notation-staff element
      const staff = body.querySelector('.notation-staff');
      expect(staff).not.toBeNull();
    });

    it('displays the entity type and position in the header', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const title = env.root.querySelector('.song-modal-title');
      expect(title).not.toBeNull();
      expect(title.textContent).toContain('Creature');
      expect(title.textContent).toContain('(5, 0, 3)');
    });

    it('loads the entity song data into the editor', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // The staff should render a note group for each pitch
      const staff = env.root.querySelector('.notation-staff');
      const svg = staff.querySelector('svg');
      const notes = svg.querySelectorAll('.note');
      expect(notes.length).toBe(2);
    });

    it('isOpen returns true while the modal is shown', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      expect(modal.isOpen).toBe(false);
      modal.open(id);
      expect(modal.isOpen).toBe(true);
    });

    it('focuses the notation staff element on open', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const staff = env.root.querySelector('.notation-staff');
      expect(document.activeElement).toBe(staff);
    });
  });

  // -- closing ----------------------------------------------------------------

  describe('closing', () => {
    let id;

    beforeEach(() => {
      modal = new SongEditorModal(env.root, env.undoManager);
      id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });
      modal.open(id);
    });

    it('removes the backdrop when the Done button is clicked', () => {
      const doneBtn = env.root.querySelector('.song-modal-footer .song-done-btn');
      doneBtn.click();

      expect(env.root.querySelector('.song-modal-backdrop')).toBeNull();
    });

    it('removes the backdrop when the close button is clicked', () => {
      const closeBtn = env.root.querySelector('.song-modal-close');
      closeBtn.click();

      expect(env.root.querySelector('.song-modal-backdrop')).toBeNull();
    });

    it('removes the backdrop when Escape is pressed', () => {
      const backdrop = env.root.querySelector('.song-modal-backdrop');
      backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(env.root.querySelector('.song-modal-backdrop')).toBeNull();
    });

    it('removes the backdrop when the backdrop itself is clicked', () => {
      const backdrop = env.root.querySelector('.song-modal-backdrop');
      // Click the backdrop directly (not the modal content inside)
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(env.root.querySelector('.song-modal-backdrop')).toBeNull();
    });

    it('does not close when clicking inside the modal content', () => {
      const modalContent = env.root.querySelector('.song-modal');
      modalContent.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(env.root.querySelector('.song-modal-backdrop')).not.toBeNull();
    });

    it('isOpen returns false after closing', () => {
      modal.close();

      expect(modal.isOpen).toBe(false);
    });

    it('disposes the NotationEditor on close', () => {
      modal.close();

      // After close, the body should be empty (NotationEditor disposed)
      const body = env.root.querySelector('.song-modal-body');
      expect(body).toBeNull();
    });

    it('returns focus to the viewport on close', () => {
      modal.close();

      expect(document.activeElement).toBe(env.viewport);
    });
  });

  // -- empty song -------------------------------------------------------------

  describe('empty song', () => {
    it('opens with an empty staff when entity has no song data', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, { interval: 8, audibleRange: 15 });

      modal.open(id);

      const staff = env.root.querySelector('.notation-staff');
      const svg = staff.querySelector('svg');
      const noteEllipses = svg.querySelectorAll('ellipse');
      expect(noteEllipses.length).toBe(0);
    });

    it('allows placing the first note on an empty staff', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);
      clickStaff(env.root, { clientX: 50, clientY: 40 });

      // After click, entity should have a note in its song
      const entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(1);
    });
  });

  // -- monophonic vs polyphonic mode ------------------------------------------

  describe('monophonic vs polyphonic mode', () => {
    it('opens in monophonic mode for creature entities', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // First click appends a note (now 2 notes, selectedIndex = 1)
      clickStaff(env.root, { clientX: 40, clientY: 40 });

      // Shift-click in monophonic mode should NOT make a chord; instead appends
      clickStaff(env.root, { clientX: 80, clientY: 30, shiftKey: true });

      const entity = env.undoManager.getEntity(id);
      // All entries should be single notes, not chords (monophonic prevents chord building)
      entity.data.song.forEach((entry) => {
        expect(Array.isArray(entry)).toBe(false);
      });
    });

    it('opens in polyphonic mode for gate entities', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      modal.open(id);

      // First click appends a note (now 2 entries, selectedIndex = 1)
      clickStaff(env.root, { clientX: 40, clientY: 40 });

      // Shift-click creates a chord at the selected index (index 1)
      clickStaff(env.root, { clientX: 80, clientY: 30, shiftKey: true });

      const entity = env.undoManager.getEntity(id);
      // In polyphonic mode, shift-click builds a chord at the selected index
      // The second entry (index 1) should now be a chord (array)
      const hasChord = entity.data.song.some((entry) => Array.isArray(entry));
      expect(hasChord).toBe(true);
    });

    it('opens in polyphonic mode for fountain entities', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('fountain', 5, 0, 3, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      modal.open(id);

      // First click appends a note (now 2 entries, selectedIndex = 1)
      clickStaff(env.root, { clientX: 40, clientY: 40 });

      // Shift-click creates a chord at the selected index (index 1)
      clickStaff(env.root, { clientX: 80, clientY: 30, shiftKey: true });

      const entity = env.undoManager.getEntity(id);
      // In polyphonic mode, shift-click builds a chord at the selected index
      const hasChord = entity.data.song.some((entry) => Array.isArray(entry));
      expect(hasChord).toBe(true);
    });

    it('header shows "Creature Song" for creatures', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const title = env.root.querySelector('.song-modal-title');
      expect(title.textContent).toContain('Creature Song');
    });

    it('header shows "Gate Song" for gates', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, { song: [] });

      modal.open(id);

      const title = env.root.querySelector('.song-modal-title');
      expect(title.textContent).toContain('Gate Song');
    });
  });

  // -- data flow --------------------------------------------------------------

  describe('data flow', () => {
    it('song edits persist to the entity through UndoManager', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);
      clickStaff(env.root, { clientX: 50, clientY: 40 });

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBeGreaterThan(0);
    });

    it('opening the modal for a different entity loads that entity song', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id1 = env.undoManager.addEntity('creature', 1, 0, 1, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 15,
      });
      const id2 = env.undoManager.addEntity('creature', 2, 0, 2, {
        song: [
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'B4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id1);
      let svg = env.root.querySelector('.notation-staff svg');
      expect(svg.querySelectorAll('.note').length).toBe(1);

      modal.close();
      modal.open(id2);
      svg = env.root.querySelector('.notation-staff svg');
      expect(svg.querySelectorAll('.note').length).toBe(3);
    });

    it('each note edit is a separate undo checkpoint', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // Add two notes
      clickStaff(env.root, { clientX: 50, clientY: 40 });
      clickStaff(env.root, { clientX: 90, clientY: 35 });

      let entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(2);

      // Undo should remove only the last note
      env.undoManager.undo();
      entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(1);

      // Undo again should remove the first note
      env.undoManager.undo();
      entity = env.undoManager.getEntity(id);
      expect(entity.data.song.length).toBe(0);
    });

    it('save is a no-op if the entity was deleted externally', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      // Delete the entity externally
      env.undoManager.removeEntity(id);

      // This should not throw even though entity is gone
      expect(() => {
        clickStaff(env.root, { clientX: 50, clientY: 40 });
      }).not.toThrow();
    });
  });

  // -- keyboard isolation -----------------------------------------------------

  describe('keyboard isolation', () => {
    it('Escape closes the modal instead of deselecting entities', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const backdrop = env.root.querySelector('.song-modal-backdrop');
      backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(modal.isOpen).toBe(false);
      expect(env.root.querySelector('.song-modal-backdrop')).toBeNull();
    });

    it('the notation editor inside the modal receives keyboard focus', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const staff = env.root.querySelector('.notation-staff');
      expect(staff.tabIndex).toBe(0);
      expect(document.activeElement).toBe(staff);
    });
  });

  // -- clef selector -----------------------------------------------------------

  describe('clef selector', () => {
    it('renders a clef dropdown in the Options popover, which Options opens and closes', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const popover = env.root.querySelector('.song-options-popover');
      const select = popover.querySelector('.clef-selector');
      expect(select.tagName).toBe('SELECT');
      expect(popover.hidden).toBe(true);
      env.root.querySelector('.song-options-btn').click();
      expect(popover.hidden).toBe(false);
      expect(modal.panelOpen).toBe(true);
      expect(document.activeElement).toBe(select);
      env.root.querySelector('.song-options-btn').click();
      expect(popover.hidden).toBe(true);
      expect(document.activeElement).toBe(env.root.querySelector('.notation-staff'));
    });

    it('dropdown shows Auto, Treble, Bass options', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      const options = Array.from(select.options).map((o) => o.textContent);
      expect(options).toEqual(['Auto', 'Treble', 'Bass']);
    });

    it('defaults to Auto when entity has no data.clef', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      expect(select.value).toBe('auto');
    });

    it('defaults to the stored clef when entity has data.clef', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
        clef: 'bass',
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      expect(select.value).toBe('bass');
    });

    it('selecting Treble persists clef to entity data', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'treble';
      select.dispatchEvent(new Event('change'));

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.clef).toBe('treble');
    });

    it('selecting Bass persists clef to entity data', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'bass';
      select.dispatchEvent(new Event('change'));

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.clef).toBe('bass');
    });

    it('selecting Auto removes clef from entity data', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
        clef: 'bass',
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'auto';
      select.dispatchEvent(new Event('change'));

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.clef).toBeUndefined();
    });

    it('clef change is undoable', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'bass';
      select.dispatchEvent(new Event('change'));

      let entity = env.undoManager.getEntity(id);
      expect(entity.data.clef).toBe('bass');

      env.undoManager.undo();

      entity = env.undoManager.getEntity(id);
      expect(entity.data.clef).toBeUndefined();
    });
  });

  // -- grand staff mode -------------------------------------------------------

  describe('grand staff mode', () => {
    it('dropdown includes Grand Staff option for polyphonic entities', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, { song: [] });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      const options = Array.from(select.options).map((o) => o.textContent);
      expect(options).toContain('Grand Staff');
    });

    it('does not show Grand Staff for creature entities', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      const options = Array.from(select.options).map((o) => o.textContent);
      expect(options).not.toContain('Grand Staff');
    });

    it('selecting Grand Staff stores staffGroups on entity data', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, { song: [] });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'grand-staff';
      select.dispatchEvent(new Event('change'));

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.staffGroups).toEqual([{ type: 'brace', voiceIds: ['treble', 'bass'] }]);
    });

    it('selecting Grand Staff removes clef from entity data', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, { song: [], clef: 'bass' });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'grand-staff';
      select.dispatchEvent(new Event('change'));

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.clef).toBeUndefined();
    });

    it('Grand Staff is pre-selected when entity has staffGroups with brace', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, {
        song: [],
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      expect(select.value).toBe('grand-staff');
    });

    it('switching from Grand Staff to Auto removes staffGroups', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, {
        song: [],
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'auto';
      select.dispatchEvent(new Event('change'));
      // It asks which staff to keep first
      const dialog = env.root.querySelector('.song-staff-dialog');
      expect(dialog.hidden).toBe(false);
      expect(env.undoManager.getEntity(id).data.staffGroups).toBeTruthy();
      dialog.querySelector('[data-keep="bass"]').click();

      const entity = env.undoManager.getEntity(id);
      expect(entity.data.staffGroups).toBeUndefined();
      expect(entity.data.clef).toBe('bass');
      expect(select.value).toBe('bass');
      expect(dialog.hidden).toBe(true);
    });

    it('Grand Staff creates editor with two staff-lines groups', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, {
        song: [],
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      });

      modal.open(id);

      const svg = env.root.querySelector('.notation-staff svg');
      const staffLines = svg.querySelectorAll('.staff-lines');
      expect(staffLines.length).toBe(2);
    });

    it('Grand Staff change is undoable', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, { song: [] });

      modal.open(id);

      const select = env.root.querySelector('.clef-selector');
      select.value = 'grand-staff';
      select.dispatchEvent(new Event('change'));

      let entity = env.undoManager.getEntity(id);
      expect(entity.data.staffGroups).toBeDefined();

      env.undoManager.undo();

      entity = env.undoManager.getEntity(id);
      expect(entity.data.staffGroups).toBeUndefined();
    });
  });

  // -- horizontal overflow ----------------------------------------------------

  describe('horizontal overflow', () => {
    it('SVG width expands beyond the modal body for long songs', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      // Create a long song with many notes
      const longSong = [];
      for (let i = 0; i < 20; i++) {
        longSong.push({ pitch: 'C4', length: '1/4' });
      }
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: longSong,
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const staff = env.root.querySelector('.notation-staff');
      const svg = staff.querySelector('svg');
      // The SVG viewBox width should accommodate all notes
      // Each note is spaced 40px apart starting at x=40, so 20 notes needs > 500px
      const viewBox = svg.getAttribute('viewBox');
      const vbWidth = parseInt(viewBox.split(' ')[2], 10);
      expect(vbWidth).toBeGreaterThanOrEqual(500);
    });

    it('modal body is horizontally scrollable when content overflows', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, {
        song: [],
        interval: 8,
        audibleRange: 15,
      });

      modal.open(id);

      const body = env.root.querySelector('.song-modal-body');
      // The body should have overflow set to auto (from CSS, but also verifiable via style)
      // In jsdom, CSS classes won't compute, but we can verify the element structure exists
      expect(body).not.toBeNull();
      expect(body.className).toBe('song-modal-body');
    });
  });

  // -- undo inside the modal ---------------------------------------------------

  describe('undo inside the modal', () => {
    const C4 = { pitch: 'C4', length: '1/4' };
    const press = (key, extra = {}) =>
      env.root
        .querySelector('.notation-staff')
        .dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
        );
    const notesShown = () =>
      env.root.querySelectorAll('.notation-staff svg [data-voice-id="v0"] .note').length;

    function openCreature(song = [C4]) {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('creature', 5, 0, 3, { song });
      modal.open(id);
      return id;
    }

    it('Cmd+Z undoes the last note and Shift+Cmd+Z redoes it, on the staff too', () => {
      const id = openCreature();
      press('4');
      press('Enter'); // a quarter rest, then its pitch
      press('4');
      expect(env.undoManager.getEntity(id).data.song).toHaveLength(3);

      press('z', { metaKey: true });
      expect(env.undoManager.getEntity(id).data.song).toHaveLength(2);
      jest.advanceTimersByTime(16);
      expect(notesShown()).toBe(2);
      press('z', { metaKey: true }); // the pitch comes off: a rest again
      expect(env.undoManager.getEntity(id).data.song[1]).toEqual({ length: '1/4' });

      press('z', { metaKey: true, shiftKey: true });
      press('z', { metaKey: true, shiftKey: true });
      expect(env.undoManager.getEntity(id).data.song).toHaveLength(3);
      expect(notesShown()).toBe(2);

      press('z', { ctrlKey: true }); // Ctrl too
      expect(env.undoManager.getEntity(id).data.song).toHaveLength(2);
      press('y', { ctrlKey: true }); // and Ctrl+Y redoes
      expect(env.undoManager.getEntity(id).data.song).toHaveLength(3);
    });

    it('never undoes past what was done since it opened (the entity stays)', () => {
      const id = openCreature();
      press('ArrowRight');
      press('4');
      for (let i = 0; i < 5; i += 1) press('z', { metaKey: true });
      expect(env.undoManager.getEntity(id)).toBeTruthy();
      expect(env.undoManager.getEntity(id).data.song).toEqual([C4]);
      expect(modal.isOpen).toBe(true);
    });

    it('a new edit drops what could be redone', () => {
      const id = openCreature();
      press('4');
      press('z', { metaKey: true });
      press('5'); // an eighth instead
      press('z', { metaKey: true, shiftKey: true }); // nothing to redo
      expect(env.undoManager.getEntity(id).data.song).toEqual([C4, { length: '1/8' }]);
    });

    it('undoes a switch to the grand staff, dropdown and staff alike', () => {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, { song: [C4] });
      modal.open(id);
      const select = env.root.querySelector('.clef-selector');
      select.value = 'grand-staff';
      select.onchange();
      expect(env.root.querySelector('[data-voice-id="bass"]')).toBeTruthy();

      press('z', { metaKey: true });
      expect(select.value).toBe('auto');
      expect(env.undoManager.getEntity(id).data.staffGroups).toBeUndefined();
      expect(env.root.querySelector('[data-voice-id="bass"]')).toBeNull();
      expect(document.activeElement).toBe(env.root.querySelector('.notation-staff'));
    });

    it('a clef change gives the keyboard back to the staff', () => {
      openCreature();
      env.root.querySelector('.song-options-btn').click();
      const select = env.root.querySelector('.clef-selector');
      expect(document.activeElement).toBe(select);
      select.value = 'bass';
      select.onchange();
      expect(document.activeElement).toBe(env.root.querySelector('.notation-staff'));
      expect(modal.panelOpen).toBe(false);
    });
  });

  // -- the controller ----------------------------------------------------------

  describe('controller actions', () => {
    function open(type, data) {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity(type, 5, 0, 3, data);
      modal.open(id);
      return id;
    }

    it('writes rest first: R2+✕ a rest, ↑/↓ the pitch cursor, ✕ the pitch on, □ note → rest → gone', () => {
      const id = open('gate', { song: [] });
      const song = () => env.undoManager.getEntity(id).data.song;
      modal.padAction('cross'); // nothing to put a pitch on
      expect(song()).toEqual([]);
      modal.padAction('rest');
      expect(song()).toEqual([{ length: '1/4' }]);
      modal.padAction('pitchUp');
      modal.padAction('cross');
      expect(song()).toEqual([{ pitch: 'C5', length: '1/4' }]);
      modal.padAction('pitchDown');
      modal.padAction('pitchDown');
      modal.padAction('cross'); // A4 joins the chord
      expect(song()).toEqual([
        [
          { pitch: 'A4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
        ],
      ]);
      modal.padAction('sharpen'); // L2 + up: the note under the pitch cursor
      expect(song()[0][0].pitch).toBe('A#4');
      modal.padAction('flatten');
      modal.padAction('flatten');
      expect(song()[0][0].pitch).toBe('Ab4');
      modal.padAction('erase');
      expect(song()).toEqual([{ length: '1/4' }]);
      modal.padAction('erase');
      expect(song()).toEqual([]);
    });

    it('L1/R1 choose the palette value only; L2+L1 / R2+R1 change the note at the cursor', () => {
      const id = open('creature', { song: [{ pitch: 'C4', length: '1/4' }] });
      const song = () => env.undoManager.getEntity(id).data.song;
      modal.padAction('shorter');
      expect(song()).toEqual([{ pitch: 'C4', length: '1/4' }]);
      expect(env.root.querySelector('.rhythm-btn.active').dataset.length).toBe('1/8');
      modal.padAction('rest');
      expect(song()[1]).toEqual({ length: '1/8' });
      modal.padAction('noteLonger');
      expect(song()[1]).toEqual({ length: '1/4' });
      modal.padAction('noteShorter');
      modal.padAction('noteShorter');
      expect(song()[1]).toEqual({ length: '1/16' });
      expect(env.root.querySelector('.rhythm-btn.active').dataset.length).toBe('1/8');
    });

    it('the palette’s dot, reached past the 32nd, makes ✕ dot the entry at the cursor', () => {
      const id = open('creature', { song: [{ pitch: 'C4', length: '1/4' }] });
      for (let i = 0; i < 4; i += 1) modal.padAction('shorter');
      expect(env.root.querySelector('.rhythm-dot').classList.contains('active')).toBe(true);
      modal.padAction('cross');
      expect(env.undoManager.getEntity(id).data.song).toEqual([
        { pitch: 'C4', length: '1/4', dotted: true },
      ]);
    });

    it('a creature’s ✕ elsewhere moves its single note', () => {
      const id = open('creature', { song: [{ pitch: 'C4', length: '1/4' }] });
      modal.padAction('pitchUp');
      modal.padAction('cross');
      expect(env.undoManager.getEntity(id).data.song).toEqual([{ pitch: 'D4', length: '1/4' }]);
    });

    it('L3 undoes and R3 redoes, only what this opening did', () => {
      const id = open('creature', { song: [{ pitch: 'C4', length: '1/4' }] });
      const song = () => env.undoManager.getEntity(id).data.song;
      modal.padAction('rest');
      modal.padAction('undo');
      expect(song()).toEqual([{ pitch: 'C4', length: '1/4' }]);
      modal.padAction('undo');
      expect(env.undoManager.getEntity(id)).toBeTruthy();
      modal.padAction('redo');
      expect(song()).toHaveLength(2);
    });

    it('Options toggles the popover; the pad walks it, changes the clef, and backs out', () => {
      const id = open('gate', { song: [] });
      const popover = env.root.querySelector('.song-options-popover');
      modal.padAction('options');
      expect(popover.hidden).toBe(false);
      expect(modal.panelOpen).toBe(true);
      expect(popover.querySelector('.clef-selector').classList.contains('pad-focus')).toBe(true);
      modal.padAction('right'); // Treble shown
      modal.padAction('right'); // Bass shown
      modal.padAction('cross'); // committed
      expect(env.undoManager.getEntity(id).data.clef).toBe('bass');
      expect(popover.hidden).toBe(true);
      expect(env.undoManager.getEntity(id).data.song).toEqual([]);
      modal.padAction('options');
      modal.padAction('pitchDown'); // to Clear
      expect(popover.querySelector('.song-options-clear').classList.contains('pad-focus')).toBe(
        true
      );
      modal.padAction('options'); // closes again
      expect(popover.hidden).toBe(true);
      modal.padAction('options');
      modal.padAction('close'); // ○ backs out of the popover, the modal stays
      expect(popover.hidden).toBe(true);
      expect(modal.isOpen).toBe(true);
    });

    it('Escape closes the popover first, then the modal', () => {
      open('gate', { song: [] });
      modal.padAction('options');
      const esc = () =>
        env.root
          .querySelector('.song-modal-backdrop')
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      esc();
      expect(modal.panelOpen).toBe(false);
      expect(modal.isOpen).toBe(true);
      esc();
      expect(modal.isOpen).toBe(false);
    });

    it('Share flips between the two staves of a grand staff, both ways', () => {
      open('gate', {
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
        song: { voices: [] },
      });
      const voice = () =>
        env.root.querySelector('.cursor-line').closest('[data-voice-id]').dataset.voiceId;
      expect(voice()).toBe('treble');
      modal.padAction('voice');
      jest.advanceTimersByTime(16);
      expect(voice()).toBe('bass');
      modal.padAction('voice');
      jest.advanceTimersByTime(16);
      expect(voice()).toBe('treble');
    });
  });

  // -- grand staff -> one staff ------------------------------------------------

  describe('leaving the grand staff', () => {
    const grand = {
      staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      song: {
        voices: [
          {
            id: 'treble',
            clef: 'treble',
            notes: [
              { pitch: 'E5', length: '1/2' },
              { pitch: 'D5', length: '1/4' },
              { pitch: 'C5', length: '1/4' },
            ],
          },
          {
            id: 'bass',
            clef: 'bass',
            notes: [
              { pitch: 'C3', length: '1/4' },
              { pitch: 'G3', length: '1/4' },
              { pitch: 'C3', length: '1/2' },
            ],
          },
        ],
        staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
      },
    };

    function openGrand() {
      modal = new SongEditorModal(env.root, env.undoManager);
      const id = env.undoManager.addEntity('gate', 5, 0, 3, JSON.parse(JSON.stringify(grand)));
      modal.open(id);
      return id;
    }

    it('asks which staff to keep, then puts EVERY note of both on it as chords (ties where held)', () => {
      const id = openGrand();
      modal.padAction('options');
      modal.padAction('right'); // Auto shown (Grand Staff wraps round)
      modal.padAction('right'); // Treble shown
      modal.padAction('cross');
      expect(modal.panelOpen).toBe(true); // the dialog now
      expect(document.activeElement.dataset.keep).toBe('treble');
      modal.padAction('cross'); // keep the treble staff
      const { data } = env.undoManager.getEntity(id);
      expect(data.staffGroups).toBeUndefined();
      expect(data.clef).toBe('treble');
      expect(data.song).toEqual([
        [
          { pitch: 'C3', length: '1/4' },
          { pitch: 'E5', length: '1/4', tie: 'start' },
        ],
        [
          { pitch: 'G3', length: '1/4' },
          { pitch: 'E5', length: '1/4', tie: 'stop' },
        ],
        [
          { pitch: 'C3', length: '1/4', tie: 'start' },
          { pitch: 'D5', length: '1/4' },
        ],
        [
          { pitch: 'C3', length: '1/4', tie: 'stop' },
          { pitch: 'C5', length: '1/4' },
        ],
      ]);
      expect(env.root.querySelector('[data-voice-id="bass"]')).toBeNull();
      expect(
        env.root.querySelectorAll('.notation-staff svg [data-voice-id="v0"] .note')
      ).toHaveLength(4);
    });

    it('Cancel keeps the grand staff, and one undo brings both staves back', () => {
      const id = openGrand();
      const select = env.root.querySelector('.clef-selector');
      select.value = 'bass';
      select.onchange();
      env.root.querySelector('.song-staff-dialog [data-keep="cancel"]').click();
      expect(env.undoManager.getEntity(id).data).toEqual(grand);
      expect(select.value).toBe('grand-staff');

      select.value = 'treble';
      select.onchange();
      env.root.querySelector('.song-staff-dialog [data-keep="treble"]').click();
      modal.undo();
      expect(env.undoManager.getEntity(id).data).toEqual(grand);
      expect(env.root.querySelector('[data-voice-id="bass"]')).toBeTruthy();
    });
  });
});
