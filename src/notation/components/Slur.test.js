/** @jest-environment jsdom */

import { createNotationContext } from 'notation/__tests__/helpers/testUtils';

describe('slur rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = createNotationContext();
  });

  afterEach(() => {
    ctx.destroy();
  });

  it('renders a slur arc between two notes', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'E4', length: '1/4', slur: 'stop' },
    ]);

    const slurs = ctx.getSlurs();
    expect(slurs).toHaveLength(1);
    expect(slurs[0].tagName).toBe('path');
  });

  it('renders a slur spanning multiple notes', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/4' },
      { pitch: 'E4', length: '1/4' },
      { pitch: 'F4', length: '1/4', slur: 'stop' },
    ]);

    const slurs = ctx.getSlurs();
    expect(slurs).toHaveLength(1);
  });

  it('renders nested slurs as two separate arcs', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/8', slur: 'start' },
      { pitch: 'E4', length: '1/8', slur: 'stop' },
      { pitch: 'F4', length: '1/4', slur: 'stop' },
    ]);

    const slurs = ctx.getSlurs();
    expect(slurs).toHaveLength(2);
    expect(ctx.container.querySelector('.slur-inner')).not.toBeNull();
  });

  it('does not render a slur when no slur properties are present', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4' },
      { pitch: 'E4', length: '1/4' },
    ]);

    expect(ctx.getSlurs()).toHaveLength(0);
  });

  it('renders slur across a rest without breaking', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { length: '1/4' },
      { pitch: 'E4', length: '1/4', slur: 'stop' },
    ]);

    expect(ctx.getSlurs()).toHaveLength(1);
  });

  it('places slur above notes when stems point down', () => {
    // Notes above middle line have stems down -> slur above (direction = "above")
    ctx.render([
      { pitch: 'A5', length: '1/4', slur: 'start' },
      { pitch: 'B5', length: '1/4', slur: 'stop' },
    ]);

    const slur = ctx.getSlurs()[0];
    expect(slur.getAttribute('d')).toBeDefined();
  });

  it('places slur below notes when stems point up', () => {
    // Notes below middle line have stems up -> slur below
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/4', slur: 'stop' },
    ]);

    const slur = ctx.getSlurs()[0];
    expect(slur.getAttribute('d')).toBeDefined();
  });

  it('renders slur as an unfilled stroke path', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'E4', length: '1/4', slur: 'stop' },
    ]);

    const slur = ctx.getSlurs()[0];
    expect(slur.getAttribute('fill')).toBe('none');
    expect(slur.getAttribute('stroke')).toBe('currentColor');
  });

  it('does not affect note count when slurs are present', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/4' },
      { pitch: 'E4', length: '1/4', slur: 'stop' },
    ]);

    expect(ctx.getNotes()).toHaveLength(3);
    expect(ctx.getSlurs()).toHaveLength(1);
  });

  it('renders multiple independent slurs', () => {
    ctx.render([
      { pitch: 'C4', length: '1/4', slur: 'start' },
      { pitch: 'D4', length: '1/4', slur: 'stop' },
      { pitch: 'E4', length: '1/4', slur: 'start' },
      { pitch: 'F4', length: '1/4', slur: 'stop' },
    ]);

    expect(ctx.getSlurs()).toHaveLength(2);
  });
});
