describe('Musical timing', () => {
  describe('beat advancement', () => {
    it('starts at beat 0', () => {
      expect(ctx.getCurrentBeat()).toBe(0);
    });

    it('advances beats proportionally to time at 120 BPM', async () => {
      // At 120 BPM, 1 beat = 500ms
      await ctx.advanceMs(500);
      expect(ctx.getCurrentBeat()).toBeCloseTo(1, 2);
    });

    it('advances correctly using advanceBeats helper', async () => {
      await ctx.advanceBeats(4);
      expect(ctx.getCurrentBeat()).toBeCloseTo(4, 2);
    });
  });

  describe('tempo conversions', () => {
    it('converts beats to milliseconds correctly', () => {
      const clock = ctx.getMusicalClock();
      // At 120 BPM: 1 beat = 500ms
      expect(clock.beatsToMs(1)).toBe(500);
      expect(clock.beatsToMs(2)).toBe(1000);
    });

    it('converts milliseconds to beats correctly', () => {
      const clock = ctx.getMusicalClock();
      // At 120 BPM: 500ms = 1 beat
      expect(clock.msToBeats(500)).toBe(1);
      expect(clock.msToBeats(1000)).toBe(2);
    });

    it('beatsToMs and msToBeats are inverses', () => {
      const clock = ctx.getMusicalClock();
      const beats = 3.5;
      const ms = clock.beatsToMs(beats);
      expect(clock.msToBeats(ms)).toBeCloseTo(beats, 10);
    });
  });
});
