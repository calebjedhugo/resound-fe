/**
 * Looking around has hard limits: the keyboard pitches the view no further
 * than straight up or down, and a mouse beyond the look band offsets the view
 * by at most a quarter turn. Both limits are three's MathUtils.clamp (the test
 * mock carries a verbatim copy; the build fails if three stops exporting it).
 */
let gameState;
let CameraController;
let realWindow;

const KEYBOARD_LOOK_SPEED = 0.025; // Radians per frame while a look key is held
const QUARTER_TURN = Math.PI / 2;

/** Load the game's modules fresh into the current window, as a page load does. */
async function bootGame() {
  await jest.isolateModulesAsync(async () => {
    gameState = (await import('core/GameState')).default;
    CameraController = (await import('core/CameraController')).default;
    (await import('createEventListeners')).default();
  });
}

/** Frames of keyboard look, as the real frame loop (motion.js) applies it. */
function runLookFrames(frames) {
  for (let i = 0; i < frames; i += 1) CameraController.applyKeyboardLook(gameState);
}

const pitch = () => CameraController.getView(gameState)[1];

beforeEach(async () => {
  // A 1280x800 window with real input events
  const events = new EventTarget();
  realWindow = { ...window };
  Object.assign(window, {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  await bootGame();
});

afterEach(() => {
  Object.assign(window, realWindow);
  delete window.dispatchEvent;
});

function holdKey(code) {
  window.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false }));
}

function moveMouse(screenX, screenY) {
  window.dispatchEvent(Object.assign(new Event('mousemove'), { screenX, screenY }));
}

describe('Looking up and down with the keyboard', () => {
  it('stops at straight up however long the key is held', () => {
    holdKey('KeyI');
    // Twice the frames a quarter turn takes
    runLookFrames(Math.ceil((2 * QUARTER_TURN) / KEYBOARD_LOOK_SPEED));

    expect(pitch()).toBe(QUARTER_TURN);
  });

  it('stops at straight down however long the key is held', () => {
    holdKey('KeyK');
    runLookFrames(Math.ceil((2 * QUARTER_TURN) / KEYBOARD_LOOK_SPEED));

    expect(pitch()).toBe(-QUARTER_TURN);
  });
});

describe('Looking with the mouse', () => {
  it('a mouse far below the window looks a quarter turn down, no further', () => {
    moveMouse(640, 800 + 5000);

    expect(pitch()).toBe(-QUARTER_TURN);
  });

  it('a mouse halfway to the bottom edge looks an eighth of a turn down', () => {
    moveMouse(640, 600);

    expect(pitch()).toBe(-QUARTER_TURN / 2);
  });
});
