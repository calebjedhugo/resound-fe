/**
 * @jest-environment jsdom
 */

/**
 * RhythmPalette Tests
 *
 * Tests the duration selector buttons that appear above the notation staff.
 * Verifies SVG note icon rendering, click/keyboard selection, and active state.
 */
import RhythmPalette, { DURATIONS } from 'editor/ui/RhythmPalette';

function createContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('RhythmPalette', () => {
  let container;
  let onSelect;
  let palette;

  beforeEach(() => {
    container = createContainer();
    onSelect = jest.fn();
    palette = new RhythmPalette(container, onSelect);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // -- rendering ------------------------------------------------------------

  describe('rendering', () => {
    it('renders one button per supported duration', () => {
      const buttons = container.querySelectorAll('.rhythm-btn');
      expect(buttons.length).toBe(6);
    });

    it('each button contains an SVG element with a note', () => {
      const buttons = container.querySelectorAll('.rhythm-btn');
      buttons.forEach((btn) => {
        const svg = btn.querySelector('svg');
        expect(svg).not.toBeNull();
        const noteGroup = svg.querySelector('.note-head');
        expect(noteGroup).not.toBeNull();
      });
    });

    it('note SVGs have visible note heads (not placeholder text)', () => {
      const buttons = container.querySelectorAll('.rhythm-btn');
      buttons.forEach((btn) => {
        // Should have an SVG with a note head, not text content
        const svg = btn.querySelector('svg');
        expect(svg).not.toBeNull();
        const textElements = svg.querySelectorAll('text');
        expect(textElements.length).toBe(0);
        const noteHead = svg.querySelector('.note-head');
        expect(noteHead).not.toBeNull();
      });
    });

    it('whole note button shows an open (unfilled) note head', () => {
      const wholeBtn = container.querySelector('[data-length="1/1"]');
      const note = wholeBtn.querySelector('.note');
      expect(note).not.toBeNull();
      expect(note.classList.contains('note-whole')).toBe(true);
      expect(note.querySelector('.note-head')).not.toBeNull();
      // Whole notes have no stem
      expect(wholeBtn.querySelector('.note-stem')).toBeNull();
    });

    it('quarter note button shows a filled note head with stem', () => {
      const quarterBtn = container.querySelector('[data-length="1/4"]');
      const note = quarterBtn.querySelector('.note');
      expect(note).not.toBeNull();
      expect(note.classList.contains('note-quarter')).toBe(true);
      expect(note.querySelector('.note-head')).not.toBeNull();
      const stem = quarterBtn.querySelector('.note-stem');
      expect(stem).not.toBeNull();
    });

    it('eighth note button shows a filled note head with stem and flag', () => {
      const eighthBtn = container.querySelector('[data-length="1/8"]');
      const note = eighthBtn.querySelector('.note');
      expect(note).not.toBeNull();
      expect(note.classList.contains('note-eighth')).toBe(true);
      expect(note.querySelector('.note-head')).not.toBeNull();
      const stem = eighthBtn.querySelector('.note-stem');
      expect(stem).not.toBeNull();
      const flag = eighthBtn.querySelector('.note-flag');
      expect(flag).not.toBeNull();
    });
  });

  // -- selection ------------------------------------------------------------

  describe('selection', () => {
    it('defaults to quarter note as active duration', () => {
      expect(palette.activeLength).toBe('1/4');
    });

    it('clicking a button sets it as the active duration', () => {
      const halfBtn = container.querySelector('[data-length="1/2"]');
      halfBtn.click();
      expect(palette.activeLength).toBe('1/2');
    });

    it('active button has the active CSS class', () => {
      const quarterBtn = container.querySelector('[data-length="1/4"]');
      expect(quarterBtn.classList.contains('active')).toBe(true);
    });

    it('previously active button loses the active class on new selection', () => {
      const quarterBtn = container.querySelector('[data-length="1/4"]');
      const halfBtn = container.querySelector('[data-length="1/2"]');

      halfBtn.click();

      expect(quarterBtn.classList.contains('active')).toBe(false);
      expect(halfBtn.classList.contains('active')).toBe(true);
    });

    it('calls onDurationSelect callback with the selected length', () => {
      const eighthBtn = container.querySelector('[data-length="1/8"]');
      eighthBtn.click();
      expect(onSelect).toHaveBeenCalledWith('1/8');
    });
  });

  // -- keyboard shortcuts ---------------------------------------------------

  describe('keyboard shortcuts', () => {
    it('pressing key "2" selects whole note', () => {
      const result = palette.handleKeyPress('2');
      expect(result).toBe('1/1');
      expect(palette.activeLength).toBe('1/1');
    });

    it('pressing key "5" selects eighth note', () => {
      const result = palette.handleKeyPress('5');
      expect(result).toBe('1/8');
      expect(palette.activeLength).toBe('1/8');
    });

    it('pressing an unrecognized key returns null', () => {
      const result = palette.handleKeyPress('z');
      expect(result).toBeNull();
    });

    it('returns the selected duration length string on valid key press', () => {
      const result = palette.handleKeyPress('4');
      expect(result).toBe('1/4');
    });
  });

  // -- activeLength property ------------------------------------------------

  describe('activeLength property', () => {
    it('setting activeLength updates the highlighted button', () => {
      palette.activeLength = '1/8';

      const eighthBtn = container.querySelector('[data-length="1/8"]');
      expect(eighthBtn.classList.contains('active')).toBe(true);

      const quarterBtn = container.querySelector('[data-length="1/4"]');
      expect(quarterBtn.classList.contains('active')).toBe(false);
    });

    it('getting activeLength returns the current selection', () => {
      palette.activeLength = '1/16';
      expect(palette.activeLength).toBe('1/16');
    });
  });
});
