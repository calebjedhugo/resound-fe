/**
 * The frame loop. A frame that throws costs that frame, never the game: the
 * first frame runs inside start() (game init), and a throw there used to stop
 * the loop before any later frame was scheduled — the game froze for good.
 */
import GameLoop from 'core/GameLoop';

const FRAME_MS = 16;
// The shared teardown drains every pending timer before this file's hooks run,
// so a loop must end itself or the drain never finishes
const MAX_FRAMES = 20;

let loop;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

/** A loop whose first frame throws; counts every frame it is asked to draw. */
function loopWithBadFirstFrame() {
  const frames = { count: 0 };
  loop = new GameLoop(
    () => {
      frames.count += 1;
      if (frames.count === 1) throw new TypeError('first frame');
      if (frames.count === MAX_FRAMES) loop.stop();
    },
    () => {}
  );
  return frames;
}

describe('The game loop', () => {
  it('starts even when the first frame throws', () => {
    loopWithBadFirstFrame();

    expect(() => loop.start()).not.toThrow();
  });

  it('keeps drawing frames after one throws', () => {
    const frames = loopWithBadFirstFrame();

    loop.start();
    jest.advanceTimersByTime(FRAME_MS * 3);

    expect(frames.count).toBe(4);
  });

  it('reports the frame that threw', () => {
    loopWithBadFirstFrame();

    loop.start();

    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.any(TypeError));
  });

  it('draws nothing more once stopped from inside a frame', () => {
    let frames = 0;
    loop = new GameLoop(
      () => {
        frames += 1;
        if (frames === 2) loop.stop();
      },
      () => {}
    );

    loop.start();
    jest.advanceTimersByTime(FRAME_MS * 5);

    expect(frames).toBe(2);
  });
});
