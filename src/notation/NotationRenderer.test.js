/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('NotationRenderer', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  describe('SVG root element', () => {
    it('creates an SVG element with class "notation"', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      const svg = ctx.getSvg();
      expect(svg).not.toBeNull();
      expect(svg.tagName).toBe('svg');
      expect(svg.getAttribute('class')).toBe('notation');
    });

    it('appends the SVG to the container', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      expect(ctx.container.querySelector('svg')).not.toBeNull();
    });

    it('returns the SVG element from render()', () => {
      const svg = ctx.render([{ pitch: 'C4', length: '1/4' }]);
      expect(svg).toBe(ctx.getSvg());
    });
  });

  describe('getSvgElement', () => {
    it('returns null before rendering', () => {
      expect(ctx.renderer.getSvgElement()).toBeNull();
    });

    it('returns the SVG element after rendering', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      expect(ctx.renderer.getSvgElement()).toBe(ctx.getSvg());
    });
  });

  describe('clear', () => {
    it('removes the SVG from the container', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      expect(ctx.getSvg()).not.toBeNull();

      ctx.renderer.clear();
      expect(ctx.getSvg()).toBeNull();
    });

    it('sets getSvgElement to null after clearing', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      ctx.renderer.clear();
      expect(ctx.renderer.getSvgElement()).toBeNull();
    });
  });

  describe('render replaces previous output', () => {
    it('removes old SVG when render is called again', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      ctx.render([
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);

      expect(ctx.container.querySelectorAll('svg')).toHaveLength(1);
      expect(ctx.getNotes()).toHaveLength(2);
    });
  });

  describe('rendering notes', () => {
    it('renders one note per pitched element', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);

      expect(ctx.getNotes()).toHaveLength(3);
    });

    it('renders rests alongside notes', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);

      expect(ctx.getNotes()).toHaveLength(2);
      expect(ctx.getRests()).toHaveLength(1);
    });

    it('spaces notes horizontally', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);

      const notes = ctx.getNotes();
      const x0 = notes[0].getAttribute('transform');
      const x1 = notes[1].getAttribute('transform');
      expect(x0).not.toBe(x1);
    });

    it('renders notes with correct duration classes', () => {
      ctx.render([
        { pitch: 'C4', length: '1/2' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/8' },
      ]);

      const notes = ctx.getNotes();
      expect(notes[0].classList.contains('note-half')).toBe(true);
      expect(notes[1].classList.contains('note-quarter')).toBe(true);
      expect(notes[2].classList.contains('note-eighth')).toBe(true);
    });
  });

  describe('staff lines', () => {
    it('renders staff lines for each voice', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      const staffLines = ctx.container.querySelector('.staff-lines');
      expect(staffLines).not.toBeNull();
      expect(staffLines.querySelectorAll('.staff-line')).toHaveLength(5);
    });
  });

  describe('staff groups', () => {
    it('creates a staff group with voice data attribute', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      const staff = ctx.container.querySelector('.staff');
      expect(staff).not.toBeNull();
      expect(staff.getAttribute('data-voice-id')).toBe('0');
    });

    it('creates a staff group per voice in multi-voice input', () => {
      ctx.render({
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      });

      const staves = ctx.container.querySelectorAll('.staff');
      expect(staves).toHaveLength(2);
      expect(staves[0].getAttribute('data-voice-id')).toBe('0');
      expect(staves[1].getAttribute('data-voice-id')).toBe('1');
    });

    it('uses custom voice ids in multi-voice input', () => {
      ctx.render({
        voices: [
          { id: 'melody', clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { id: 'bass', clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      });

      const staves = ctx.container.querySelectorAll('.staff');
      expect(staves[0].getAttribute('data-voice-id')).toBe('melody');
      expect(staves[1].getAttribute('data-voice-id')).toBe('bass');
    });
  });

  describe('clef inference', () => {
    it('infers treble clef for notes at or above C4', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);

      const staff = ctx.container.querySelector('.staff');
      expect(staff.getAttribute('data-clef')).toBe('treble');
    });

    it('infers bass clef for notes below C4', () => {
      ctx.render([
        { pitch: 'C3', length: '1/4' },
        { pitch: 'E3', length: '1/4' },
        { pitch: 'G3', length: '1/4' },
      ]);

      const staff = ctx.container.querySelector('.staff');
      expect(staff.getAttribute('data-clef')).toBe('bass');
    });

    it('uses explicit clef when provided', () => {
      ctx.render({
        clef: 'bass',
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      });

      const staff = ctx.container.querySelector('.staff');
      expect(staff.getAttribute('data-clef')).toBe('bass');
    });
  });

  describe('rest rendering', () => {
    it('renders rest elements when pitch is omitted', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { length: '1/4' },
        { pitch: 'G4', length: '1/4' },
      ]);

      expect(ctx.getRests()).toHaveLength(1);
    });

    it('renders rest with correct duration class', () => {
      ctx.render([{ length: '1/2' }]);
      const rest = ctx.getRests()[0];
      expect(rest.classList.contains('rest-half')).toBe(true);
    });

    it('renders multiple rests', () => {
      ctx.render([
        { length: '1/4' },
        { pitch: 'C4', length: '1/4' },
        { length: '1/8' },
        { length: '1/8' },
      ]);

      expect(ctx.getRests()).toHaveLength(3);
      expect(ctx.getNotes()).toHaveLength(1);
    });

    it('advances cursor past rests correctly', () => {
      ctx.render([{ length: '1/4' }, { pitch: 'C4', length: '1/4' }]);

      // The note should be positioned after the rest
      const note = ctx.getNotes()[0];
      const rest = ctx.getRests()[0];
      const noteX = parseFloat(note.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      const restX = parseFloat(rest.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      expect(noteX).toBeGreaterThan(restX);
    });
  });

  describe('clef rendering', () => {
    it('renders a clef element for each staff', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      const clef = ctx.getClef();
      expect(clef).not.toBeNull();
    });

    it('renders treble clef with correct class', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      const clef = ctx.getClef();
      expect(clef.classList.contains('clef-treble')).toBe(true);
    });

    it('renders bass clef with correct class', () => {
      ctx.render([
        { pitch: 'C3', length: '1/4' },
        { pitch: 'E3', length: '1/4' },
      ]);
      const clef = ctx.getClef();
      expect(clef.classList.contains('clef-bass')).toBe(true);
    });

    it('renders a clef for each voice in multi-voice input', () => {
      ctx.render({
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      });

      const clefs = ctx.container.querySelectorAll('.clef');
      expect(clefs).toHaveLength(2);
      expect(clefs[0].classList.contains('clef-treble')).toBe(true);
      expect(clefs[1].classList.contains('clef-bass')).toBe(true);
    });

    it('places the clef before notes (notes start after clef width)', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);

      const clef = ctx.getClef();
      const note = ctx.getNotes()[0];
      const clefTransform = clef.getAttribute('transform');
      const noteTransform = note.getAttribute('transform');

      // Extract x values from translate(x, y)
      const clefX = parseFloat(clefTransform.match(/translate\(([^,]+)/)[1]);
      const noteX = parseFloat(noteTransform.match(/translate\(([^,]+)/)[1]);
      expect(noteX).toBeGreaterThan(clefX);
    });
  });

  describe('ledger lines', () => {
    it('renders ledger lines for middle C in treble clef', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      // C4 in treble is at y=110 — needs one ledger line
      expect(ctx.getLedgerLines().length).toBeGreaterThan(0);
    });

    it('does not render ledger lines for notes within the staff', () => {
      ctx.render([
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'B4', length: '1/4' },
      ]);
      // E4=y90, G4=y70, B4=y50 — all on staff lines
      expect(ctx.getLedgerLines()).toHaveLength(0);
    });

    it('renders ledger lines for notes above the staff', () => {
      ctx.render([{ pitch: 'A5', length: '1/4' }]);
      // A5 in treble is at y=-10 — needs one ledger line
      expect(ctx.getLedgerLines().length).toBeGreaterThan(0);
    });

    it('renders multiple ledger lines for extreme notes', () => {
      ctx.render([{ pitch: 'C6', length: '1/4' }]);
      // C6 in treble is at y=-30 — needs two ledger lines
      const ledgerLines = ctx.getLedgerLines();
      expect(ledgerLines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('accidental rendering', () => {
    it('renders a sharp accidental for F#4', () => {
      ctx.render([{ pitch: 'F#4', length: '1/4' }]);
      const accidentals = ctx.container.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(1);
      expect(accidentals[0].classList.contains('sharp')).toBe(true);
    });

    it('renders a flat accidental for Bb3', () => {
      ctx.render([{ pitch: 'Bb3', length: '1/4' }]);
      const accidentals = ctx.container.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(1);
      expect(accidentals[0].classList.contains('flat')).toBe(true);
    });

    it('does not render accidentals for natural notes', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'D4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      const accidentals = ctx.container.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(0);
    });

    it('renders accidentals for each note that has one', () => {
      ctx.render([
        { pitch: 'F#4', length: '1/4' },
        { pitch: 'C4', length: '1/4' },
        { pitch: 'Bb4', length: '1/4' },
      ]);
      const accidentals = ctx.container.querySelectorAll('.accidental');
      expect(accidentals).toHaveLength(2);
    });

    it('positions accidental to the left of the note', () => {
      ctx.render([{ pitch: 'F#4', length: '1/4' }]);
      const accidental = ctx.container.querySelector('.accidental');
      const note = ctx.getNotes()[0];

      const accX = parseFloat(accidental.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      const noteX = parseFloat(note.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      expect(accX).toBeLessThan(noteX);
    });
  });

  describe('Level 2 input', () => {
    it('renders notes from Level 2 input format', () => {
      ctx.render({
        clef: 'treble',
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
      });

      expect(ctx.getNotes()).toHaveLength(3);
    });
  });

  describe('Level 3 input', () => {
    it('renders notes from each voice', () => {
      ctx.render({
        voices: [
          {
            clef: 'treble',
            notes: [
              { pitch: 'C5', length: '1/4' },
              { pitch: 'E5', length: '1/4' },
            ],
          },
          { clef: 'bass', notes: [{ pitch: 'C3', length: '1/2' }] },
        ],
      });

      expect(ctx.getNotes()).toHaveLength(3);
    });
  });

  describe('containerless rendering', () => {
    it('works without a container', () => {
      const { NotationRenderer } = require('notation/NotationRenderer');
      const renderer = new NotationRenderer({});
      const svg = renderer.render([{ pitch: 'C4', length: '1/4' }]);

      expect(svg).not.toBeNull();
      expect(svg.tagName).toBe('svg');
      expect(renderer.getSvgElement()).toBe(svg);

      renderer.clear();
    });
  });

  describe('beam rendering', () => {
    it('does not create beam groups in unmetered mode', () => {
      ctx.render([
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' },
      ]);
      expect(ctx.getBeamGroups()).toHaveLength(0);
    });

    it('creates a beam group for two eighth notes in the same beat', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/4' },
        ],
      });
      expect(ctx.getBeamGroups()).toHaveLength(1);
    });

    it('creates two beam groups for eighth notes across two beats', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/8' },
          { pitch: 'F4', length: '1/8' },
        ],
      });
      expect(ctx.getBeamGroups()).toHaveLength(2);
    });

    it('beam groups contain the beamed notes', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
        ],
      });
      const beamGroup = ctx.getBeamGroups()[0];
      const notes = beamGroup.querySelectorAll('.note');
      expect(notes).toHaveLength(2);
    });

    it('beam groups contain beam path elements', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
        ],
      });
      const beamGroup = ctx.getBeamGroups()[0];
      const beams = beamGroup.querySelectorAll('.beam');
      expect(beams.length).toBeGreaterThanOrEqual(1);
    });

    it('beamed notes do not have flags', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
        ],
      });
      const beamGroup = ctx.getBeamGroups()[0];
      const flags = beamGroup.querySelectorAll('.note-flag');
      expect(flags).toHaveLength(0);
    });

    it('non-beamed eighth notes still have flags', () => {
      // In unmetered mode, all notes get individual flags
      ctx.render([
        { pitch: 'C4', length: '1/8' },
        { pitch: 'D4', length: '1/8' },
      ]);
      const flags = ctx.container.querySelectorAll('.note-flag');
      expect(flags).toHaveLength(2);
    });

    it('renders beam groups alongside non-beamed notes', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
        ],
      });
      expect(ctx.getBeamGroups()).toHaveLength(1);
      expect(ctx.getNotes()).toHaveLength(4);
    });

    it('beams 16th notes with two beam levels', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/16' },
          { pitch: 'D4', length: '1/16' },
          { pitch: 'E4', length: '1/16' },
          { pitch: 'F4', length: '1/16' },
        ],
      });
      const beamGroup = ctx.getBeamGroups()[0];
      const beams = beamGroup.querySelectorAll('.beam');
      expect(beams).toHaveLength(2); // primary + secondary
    });

    it('groups three eighth notes in 6/8 compound time', () => {
      ctx.render({
        timeSignature: [6, 8],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/8' },
          { pitch: 'F4', length: '1/8' },
          { pitch: 'G4', length: '1/8' },
          { pitch: 'A4', length: '1/8' },
        ],
      });
      expect(ctx.getBeamGroups()).toHaveLength(2);
      const firstGroup = ctx.getBeamGroups()[0];
      expect(firstGroup.querySelectorAll('.note')).toHaveLength(3);
    });
  });

  describe('bar line rendering', () => {
    it('does not render bar lines when no time signature is set', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
        { pitch: 'G4', length: '1/4' },
        { pitch: 'C5', length: '1/4' },
      ]);
      expect(ctx.getBarLines()).toHaveLength(0);
    });

    it('renders a bar line after one complete measure in 4/4', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
          // bar line here
          { pitch: 'G4', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(1);
    });

    it('renders two bar lines for two complete measures', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'F4', length: '1/4' },
          // bar line
          { pitch: 'G4', length: '1/4' },
          { pitch: 'A4', length: '1/4' },
          { pitch: 'B4', length: '1/4' },
          { pitch: 'C5', length: '1/4' },
          // bar line
          { pitch: 'D5', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(2);
    });

    it('renders bar lines in 3/4 time', () => {
      ctx.render({
        timeSignature: [3, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          // bar line after 3 beats
          { pitch: 'F4', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(1);
    });

    it('handles half notes in bar line tracking', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/2' },
          { pitch: 'E4', length: '1/2' },
          // bar line after 4 beats (2 half notes)
          { pitch: 'G4', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(1);
    });

    it('handles whole notes in bar line tracking', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/1' },
          // bar line after 4 beats (1 whole note)
          { pitch: 'G4', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(1);
    });

    it('handles eighth notes in bar line tracking', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/8' },
          { pitch: 'F4', length: '1/8' },
          { pitch: 'G4', length: '1/8' },
          { pitch: 'A4', length: '1/8' },
          { pitch: 'B4', length: '1/8' },
          { pitch: 'C5', length: '1/8' },
          // bar line after 8 eighth notes = 4 beats
          { pitch: 'D5', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(1);
    });

    it('tracks rests for bar line calculation', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { length: '1/4' },
          // bar line
          { pitch: 'G4', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(1);
    });

    it('renders no bar lines if music does not fill a complete measure', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'D4', length: '1/4' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(0);
    });

    it('handles 6/8 time signature', () => {
      ctx.render({
        timeSignature: [6, 8],
        notes: [
          // 6 eighth notes = 1 measure of 6/8
          { pitch: 'C4', length: '1/8' },
          { pitch: 'D4', length: '1/8' },
          { pitch: 'E4', length: '1/8' },
          { pitch: 'F4', length: '1/8' },
          { pitch: 'G4', length: '1/8' },
          { pitch: 'A4', length: '1/8' },
          // bar line
          { pitch: 'B4', length: '1/8' },
        ],
      });
      expect(ctx.getBarLines()).toHaveLength(1);
    });
  });

  describe('time signature rendering', () => {
    it('does not render a time signature when not specified', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      expect(ctx.getTimeSignature()).toBeNull();
    });

    it('renders a time signature when specified', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ pitch: 'C4', length: '1/4' }],
      });
      expect(ctx.getTimeSignature()).not.toBeNull();
    });

    it('renders correct numerator and denominator', () => {
      ctx.render({
        timeSignature: [3, 4],
        notes: [{ pitch: 'C4', length: '1/4' }],
      });
      const timeSig = ctx.getTimeSignature();
      expect(timeSig.querySelector('.time-numerator').textContent).toBe('3');
      expect(timeSig.querySelector('.time-denominator').textContent).toBe('4');
    });

    it('positions time signature after key signature', () => {
      ctx.render({
        keySignature: 'G',
        timeSignature: [4, 4],
        notes: [{ pitch: 'C4', length: '1/4' }],
      });

      const keySig = ctx.getKeySignature();
      const timeSig = ctx.getTimeSignature();
      const keySigX = parseFloat(keySig.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      const timeSigX = parseFloat(timeSig.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      expect(timeSigX).toBeGreaterThan(keySigX);
    });

    it('positions time signature after clef when no key signature', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ pitch: 'C4', length: '1/4' }],
      });

      const clef = ctx.getClef();
      const timeSig = ctx.getTimeSignature();
      const clefX = parseFloat(clef.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      const timeSigX = parseFloat(timeSig.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      expect(timeSigX).toBeGreaterThan(clefX);
    });

    it('positions notes after time signature', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [{ pitch: 'C4', length: '1/4' }],
      });

      const timeSig = ctx.getTimeSignature();
      const note = ctx.getNotes()[0];
      const timeSigX = parseFloat(timeSig.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      const noteX = parseFloat(note.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      expect(noteX).toBeGreaterThan(timeSigX);
    });

    it('renders time signature per voice in multi-voice input', () => {
      ctx.render({
        timeSignature: [4, 4],
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      });

      const timeSigs = ctx.container.querySelectorAll('.time-signature');
      expect(timeSigs).toHaveLength(2);
    });

    it('allows per-voice time signature override', () => {
      ctx.render({
        timeSignature: [4, 4],
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', timeSignature: [3, 4], notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      });

      const timeSigs = ctx.container.querySelectorAll('.time-signature');
      expect(timeSigs).toHaveLength(2);
      expect(timeSigs[0].querySelector('.time-numerator').textContent).toBe('4');
      expect(timeSigs[1].querySelector('.time-numerator').textContent).toBe('3');
    });
  });

  describe('key signature rendering', () => {
    it('does not render a key signature for key of C', () => {
      ctx.render([{ pitch: 'C4', length: '1/4' }]);
      expect(ctx.getKeySignature()).toBeNull();
    });

    it('does not render a key signature when no key is specified (defaults to C)', () => {
      ctx.render({
        notes: [{ pitch: 'C4', length: '1/4' }],
      });
      expect(ctx.getKeySignature()).toBeNull();
    });

    it('renders a key signature when key is specified', () => {
      ctx.render({
        keySignature: 'G',
        notes: [{ pitch: 'C4', length: '1/4' }],
      });
      expect(ctx.getKeySignature()).not.toBeNull();
    });

    it('positions key signature after clef', () => {
      ctx.render({
        keySignature: 'G',
        notes: [{ pitch: 'C4', length: '1/4' }],
      });

      const clef = ctx.getClef();
      const keySig = ctx.getKeySignature();
      const clefX = parseFloat(clef.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      const keySigX = parseFloat(keySig.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      expect(keySigX).toBeGreaterThan(clefX);
    });

    it('positions notes after key signature', () => {
      ctx.render({
        keySignature: 'D',
        notes: [{ pitch: 'C4', length: '1/4' }],
      });

      const keySig = ctx.getKeySignature();
      const note = ctx.getNotes()[0];
      const keySigX = parseFloat(keySig.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      const noteX = parseFloat(note.getAttribute('transform').match(/translate\(([^,]+)/)[1]);
      // D major has 2 sharps, key sig at x=50, width=20, so note should start at x=70
      expect(noteX).toBeGreaterThan(keySigX);
    });

    it('renders key signature per voice in multi-voice input', () => {
      ctx.render({
        keySignature: 'G',
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      });

      const keySigs = ctx.container.querySelectorAll('.key-signature');
      expect(keySigs).toHaveLength(2);
    });

    it('allows per-voice key signature override', () => {
      ctx.render({
        keySignature: 'G',
        voices: [
          { clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
          { clef: 'bass', keySignature: 'F', notes: [{ pitch: 'C3', length: '1/4' }] },
        ],
      });

      const keySigs = ctx.container.querySelectorAll('.key-signature');
      expect(keySigs).toHaveLength(2);
      // First voice: G major (1 sharp), second voice: F major (1 flat)
      const firstAccidentals = keySigs[0].querySelectorAll('.accidental');
      const secondAccidentals = keySigs[1].querySelectorAll('.accidental');
      expect(firstAccidentals).toHaveLength(1);
      expect(firstAccidentals[0].classList.contains('sharp')).toBe(true);
      expect(secondAccidentals).toHaveLength(1);
      expect(secondAccidentals[0].classList.contains('flat')).toBe(true);
    });
  });

  describe('tie rendering', () => {
    it('does not render ties when no tie properties are present', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'C4', length: '1/4' },
      ]);
      expect(ctx.getTies()).toHaveLength(0);
    });

    it('renders a tie arc between two tied notes', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(ctx.getTies()).toHaveLength(1);
    });

    it('renders both noteheads even when tied', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(ctx.getNotes()).toHaveLength(2);
      expect(ctx.getTies()).toHaveLength(1);
    });

    it('renders two arcs for a three-note tie chain', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(ctx.getTies()).toHaveLength(2);
    });

    it('renders three arcs for a four-note tie chain', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'continue' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      expect(ctx.getTies()).toHaveLength(3);
    });

    it('places tie arcs inside a .ties container', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      const tiesGroup = ctx.container.querySelector('.ties');
      expect(tiesGroup).not.toBeNull();
      expect(tiesGroup.querySelectorAll('.tie')).toHaveLength(1);
    });

    it('tie arc has a valid path with cubic bezier', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      const tie = ctx.getTies()[0];
      const d = tie.getAttribute('d');
      expect(d).toMatch(/^M\s/);
      expect(d).toMatch(/C\s/);
    });

    it('tie arc uses stroke styling (no fill)', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'C4', length: '1/4', tie: 'stop' },
      ]);
      const tie = ctx.getTies()[0];
      expect(tie.getAttribute('fill')).toBe('none');
      expect(tie.getAttribute('stroke')).toBe('currentColor');
    });

    it('renders tie across a bar line', () => {
      ctx.render({
        timeSignature: [4, 4],
        notes: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'G4', length: '1/4' },
          { pitch: 'G4', length: '1/4', tie: 'start' },
          { pitch: 'G4', length: '1/4', tie: 'stop' },
          { pitch: 'E4', length: '1/4' },
          { pitch: 'C4', length: '1/2' },
        ],
      });
      expect(ctx.getTies()).toHaveLength(1);
      expect(ctx.getBarLines().length).toBeGreaterThan(0);
    });

    it('renders tie with dotted notes', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', dotted: true, tie: 'start' },
        { pitch: 'C4', length: '1/8', tie: 'stop' },
      ]);
      expect(ctx.getTies()).toHaveLength(1);
      expect(ctx.getNotes()).toHaveLength(2);
    });

    it('does not render tie when pitches do not match', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4', tie: 'start' },
        { pitch: 'D4', length: '1/4', tie: 'stop' },
      ]);
      expect(ctx.getTies()).toHaveLength(0);
    });

    it('does not render .ties container when there are no ties', () => {
      ctx.render([
        { pitch: 'C4', length: '1/4' },
        { pitch: 'E4', length: '1/4' },
      ]);
      const tiesGroup = ctx.container.querySelector('.ties');
      expect(tiesGroup).toBeNull();
    });
  });
});
