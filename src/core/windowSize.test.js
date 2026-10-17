/**
 * Booting before the window has a size. A hidden browser pane starts the page
 * at 0x0: the first frame built the camera from 0/0, three threw uploading the
 * NaN clip planes, and the game never drew again (2026-10-17). At zero size the
 * player looks straight ahead; once the window gets a size, the view takes it.
 */
import * as THREE from 'three';

let gameState;
let CameraController;
let camera;
let renderer;
let realWindow;

function resizeWindow(width, height) {
  window.innerWidth = width;
  window.innerHeight = height;
  window.dispatchEvent(new Event('resize'));
}

/** Load the game's modules fresh into the current window, as a page load does. */
async function bootGame() {
  await jest.isolateModulesAsync(async () => {
    gameState = (await import('core/GameState')).default;
    CameraController = (await import('core/CameraController')).default;
    (await import('createEventListeners')).default();
    // The real view module: its absolute path maps to a mock (import-time side effects)
    ({ camera, renderer } = await import('../resoundModules/playerControls/motion/motion'));
  });
}

beforeEach(async () => {
  // A window with real resize events, booting at 0x0
  const events = new EventTarget();
  realWindow = { ...window };
  Object.assign(window, {
    innerWidth: 0,
    innerHeight: 0,
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

describe('A game booted in a zero-size window', () => {
  it('looks straight ahead', () => {
    expect(CameraController.getView(gameState)).toEqual([0, 0]);
  });

  it('gives the camera a real aspect', () => {
    expect(Number.isFinite(camera.aspect)).toBe(true);
  });
});

describe('When the window gets its size', () => {
  it('the camera takes its aspect', () => {
    resizeWindow(1280, 800);

    expect(camera.aspect).toBe(1.6);
  });

  it('the canvas takes its size', () => {
    resizeWindow(1280, 800);

    expect(renderer.getSize(new THREE.Vector2())).toMatchObject({ x: 1280, y: 800 });
  });

  it('the player still looks straight ahead', () => {
    resizeWindow(1280, 800);

    expect(CameraController.getView(gameState)).toEqual([0, 0]);
  });
});
