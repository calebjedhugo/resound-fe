/** @jest-environment jsdom */

import { createLedgerLines } from 'notation/components/LedgerLine';

describe('LedgerLine', () => {
  describe('createLedgerLines', () => {
    // Staff lines are at y=10, 30, 50, 70, 90 in absolute coords.
    // Above the staff: first ledger line at y=-10, then -30, -50...
    // Below the staff: first ledger line at y=110, then 130, 150...

    it('returns null for notes within the staff (y=10 to y=90)', () => {
      expect(createLedgerLines({ x: 100, y: 10 })).toBeNull(); // top line
      expect(createLedgerLines({ x: 100, y: 50 })).toBeNull(); // middle line
      expect(createLedgerLines({ x: 100, y: 90 })).toBeNull(); // bottom line
      expect(createLedgerLines({ x: 100, y: 40 })).toBeNull(); // space in staff
    });

    it('returns null for notes in the first space above/below the staff', () => {
      expect(createLedgerLines({ x: 100, y: 0 })).toBeNull(); // space above top line
      expect(createLedgerLines({ x: 100, y: 100 })).toBeNull(); // space below bottom line
    });

    it('renders one ledger line for middle C in treble (y=110)', () => {
      const el = createLedgerLines({ x: 100, y: 110 });
      expect(el).not.toBeNull();
      expect(el.tagName).toBe('g');
      expect(el.getAttribute('class')).toBe('ledger-lines');

      const lines = el.querySelectorAll('.ledger-line');
      expect(lines).toHaveLength(1);
    });

    it('renders one ledger line for A5 in treble (y=-10)', () => {
      const el = createLedgerLines({ x: 100, y: -10 });
      expect(el).not.toBeNull();

      const lines = el.querySelectorAll('.ledger-line');
      expect(lines).toHaveLength(1);
    });

    it('renders one ledger line for B5 in treble (y=-20, space above first ledger)', () => {
      const el = createLedgerLines({ x: 100, y: -20 });
      expect(el).not.toBeNull();

      const lines = el.querySelectorAll('.ledger-line');
      expect(lines).toHaveLength(1);
    });

    it('renders two ledger lines for C6 in treble (y=-30)', () => {
      const el = createLedgerLines({ x: 100, y: -30 });
      expect(el).not.toBeNull();

      const lines = el.querySelectorAll('.ledger-line');
      expect(lines).toHaveLength(2);
    });

    it('renders two ledger lines for A3 in treble (y=130)', () => {
      const el = createLedgerLines({ x: 100, y: 130 });
      expect(el).not.toBeNull();

      const lines = el.querySelectorAll('.ledger-line');
      expect(lines).toHaveLength(2);
    });

    it('centers ledger lines on the note x position', () => {
      const el = createLedgerLines({ x: 200, y: 110 });
      const line = el.querySelector('.ledger-line');

      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      const center = (x1 + x2) / 2;
      expect(center).toBe(200);
    });

    it('makes ledger lines 18px wide (HEAD_RX*2 + 6)', () => {
      const el = createLedgerLines({ x: 100, y: 110 });
      const line = el.querySelector('.ledger-line');

      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      expect(x2 - x1).toBe(18);
    });

    it('places ledger lines at correct Y positions below staff', () => {
      // y=130 needs ledger lines at y=110 and y=130
      const el = createLedgerLines({ x: 100, y: 130 });
      const lines = el.querySelectorAll('.ledger-line');

      const ys = Array.from(lines).map((l) => Number(l.getAttribute('y1')));
      expect(ys).toContain(110);
      expect(ys).toContain(130);
    });

    it('places ledger lines at correct Y positions above staff', () => {
      // y=-30 needs ledger lines at y=-10 and y=-30
      const el = createLedgerLines({ x: 100, y: -30 });
      const lines = el.querySelectorAll('.ledger-line');

      const ys = Array.from(lines).map((l) => Number(l.getAttribute('y1')));
      expect(ys).toContain(-10);
      expect(ys).toContain(-30);
    });
  });
});
