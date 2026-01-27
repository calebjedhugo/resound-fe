/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('tuplet rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  it('renders a tuplet group with bracket and number for quarter notes', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'D4', length: '1/4' },
            { pitch: 'E4', length: '1/4' },
          ],
        },
        { pitch: 'F4', length: '1/2' },
      ],
    });

    const groups = ctx.getTupletGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute('data-tuplet')).toBe('3:2');

    const number = ctx.container.querySelector('.tuplet-number');
    expect(number.textContent).toBe('3');

    // Quarter notes are not beamed, so bracket is shown
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).not.toBeNull();
  });

  it('omits bracket when tuplet is fully beamed with eighth notes', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
          ],
        },
        { pitch: 'F4', length: '1/4' },
      ],
    });

    // Eighth notes are fully beamed, bracket omitted
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).toBeNull();

    // Number still shown
    const number = ctx.container.querySelector('.tuplet-number');
    expect(number.textContent).toBe('3');
  });

  it('renders tuplet containing rests with bracket', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { length: '1/8' },
            { pitch: 'E4', length: '1/8' },
          ],
        },
      ],
    });

    // Rest breaks beaming, so bracket is shown
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).not.toBeNull();
  });

  it('renders 3 notes within a triplet group', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
          ],
        },
      ],
    });

    const tupletGroup = ctx.getTupletGroups()[0];
    const notes = tupletGroup.querySelectorAll('.note');
    expect(notes).toHaveLength(3);
  });

  it('handles quintuplet ratio [5, 4]', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [5, 4],
          notes: [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'D4', length: '1/4' },
            { pitch: 'E4', length: '1/4' },
            { pitch: 'F4', length: '1/4' },
            { pitch: 'G4', length: '1/4' },
          ],
        },
      ],
    });

    const number = ctx.container.querySelector('.tuplet-number');
    expect(number.textContent).toBe('5');
  });

  it('highlights tuplet notes at fractional beat positions during playback', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
          ],
        },
      ],
    });

    // Second note of triplet at approximately beat 0.333
    ctx.renderer.setPlaybackPosition(0.34);
    const active = ctx.container.querySelector('.note-active');
    expect(active).not.toBeNull();
  });

  it('renders tuplet with mixed note values with bracket', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/4' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
          ],
        },
      ],
    });

    // Mixed values means not fully beamed, so bracket is shown
    const bracket = ctx.container.querySelector('.tuplet-bracket');
    expect(bracket).not.toBeNull();
  });

  it('renders tuplet containing a chord', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            [
              { pitch: 'C4', length: '1/8' },
              { pitch: 'E4', length: '1/8' },
            ],
            { pitch: 'D4', length: '1/8' },
            { pitch: 'F4', length: '1/8' },
          ],
        },
      ],
    });

    const groups = ctx.getTupletGroups();
    expect(groups).toHaveLength(1);
    const chords = ctx.container.querySelectorAll('.chord');
    expect(chords).toHaveLength(1);
  });

  it('does not render tuplet markers as standalone notes', () => {
    ctx.render({
      timeSignature: [4, 4],
      notes: [
        {
          tuplet: [3, 2],
          notes: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
          ],
        },
        { pitch: 'F4', length: '1/4' },
      ],
    });

    // 3 tuplet notes + 1 regular note = 4 total .note elements
    const allNotes = ctx.getNotes();
    expect(allNotes).toHaveLength(4);
  });
});
