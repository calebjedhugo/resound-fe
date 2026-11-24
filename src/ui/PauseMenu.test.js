/** @jest-environment jsdom */
/**
 * Invert Look, in the pause menu: pushing the right stick or the mouse up
 * looks down. The I/K keys keep their named directions. The choice is
 * remembered across visits, and flipping it mid-game leaves the view where it
 * was.
 */
let gameState;
let CameraController;
let PauseMenu;
let menu;

const STICK_LOOK_SPEED = 0.0375; // Radians per frame at the right stick's full tilt

/** Load the game's modules fresh, as a page load does (storage survives). */
async function loadPage() {
  await jest.isolateModulesAsync(async () => {
    gameState = (await import('core/GameState')).default;
    CameraController = (await import('core/CameraController')).default;
    PauseMenu = (await import('ui/PauseMenu')).default;
  });
  menu = new PauseMenu();
  menu.show();
}

const invertButton = () =>
  [...menu.element.querySelectorAll('button')].find((b) => b.textContent.startsWith('Invert'));
const pitch = () => CameraController.getView(gameState)[1];

function pushRightStickUp() {
  gameState.input.stick.look.y = 1;
  CameraController.applyStickLook(gameState);
  gameState.input.stick.look.y = 0;
}

beforeEach(async () => {
  localStorage.clear();
  await loadPage();
  // The mouse at the window's center: no mouse offset
  gameState.input.mouse.screenCenter = [640, 400];
  gameState.input.mouse.position = [640, 400];
});

afterEach(() => menu.hide());

it('is off at first: up looks up', () => {
  expect(invertButton().textContent).toBe('Invert Look: Off');
  pushRightStickUp();
  expect(pitch()).toBeCloseTo(STICK_LOOK_SPEED);
});

it('turned on, the right stick and the mouse look down when pushed up', () => {
  invertButton().click();
  expect(invertButton().textContent).toBe('Invert Look: On');

  pushRightStickUp();
  expect(pitch()).toBeCloseTo(-STICK_LOOK_SPEED);

  gameState.camera.viewCenter = [0, 0];
  gameState.input.mouse.position = [640, 200]; // halfway up
  expect(pitch()).toBeCloseTo(-Math.PI / 4);
});

it('leaves the I/K keys as named', () => {
  invertButton().click();
  gameState.input.keys.lookUp = true;
  CameraController.applyKeyboardLook(gameState);
  expect(pitch()).toBeGreaterThan(0);
});

it('flipped with the mouse off center, the view stays where it was', () => {
  gameState.input.mouse.position = [640, 200];
  const before = pitch();

  invertButton().click();

  expect(pitch()).toBeCloseTo(before);
});

it('is remembered on the next visit', async () => {
  invertButton().click();
  menu.hide();

  await loadPage();

  expect(invertButton().textContent).toBe('Invert Look: On');
});

describe('the editor entry', () => {
  const button = (label) =>
    [...document.querySelectorAll('#pause-menu button, .menu button')].find(
      (b) => b.textContent === label
    );

  it('is absent unless the game can go to the editor', () => {
    expect(button('Back to Editor')).toBeUndefined();
    expect(button('Editor')).toBeUndefined();
  });

  it('reads "Editor" in a dev build (the mode switch) and leads there', () => {
    menu.hide();
    const onEditor = jest.fn();
    menu = new PauseMenu(null, null, null, onEditor, 'Editor');
    menu.show();
    [...menu.element.querySelectorAll('button')].find((b) => b.textContent === 'Editor').click();
    expect(onEditor).toHaveBeenCalled();
  });
});
