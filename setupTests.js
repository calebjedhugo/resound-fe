/**
 * Jest setup file - test context
 * Runs via setupFilesAfterEnv (after test framework loads)
 */
import { createTestContext } from './src/__tests__/helpers/testUtils';

// Use fake timers to control setTimeout/setInterval
// This is needed because Instrument.play() uses real setTimeout for note timing
jest.useFakeTimers();

// Global test context - available as `ctx` in all tests
global.ctx = null;

beforeEach(() => {
  global.ctx = createTestContext({ tempo: 120 });
});

afterEach(() => {
  if (global.ctx) {
    global.ctx.cleanup();
    global.ctx = null;
  }
  // Run any pending timers to clean up
  jest.runAllTimers();
});
