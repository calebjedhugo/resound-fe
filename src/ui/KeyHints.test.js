/** @jest-environment jsdom */
/**
 * The key hints show the device in hand (jsdom, fake pads polled as main.js
 * polls them): keycaps on the keyboard; on a controller its own buttons, by
 * family — the face button for R / Space / C / G (PlayStation's shapes, an
 * Xbox's or a Switch's letter, a generic pad's lit diamond position) and
 * the two sticks for the move cluster. A hint on screen swaps its glyph in
 * place. Each glyph is
 * drawn once per family: no frame draws or uploads one.
 */
import * as THREE from 'three';
import gameState from 'core/GameState';
import Gamepad from 'core/Gamepad';
import HintMemory from 'core/HintMemory';
import InputDevice from 'core/InputDevice';
import KeyHints from 'ui/KeyHints';

const CROSS = 0;

const PADS = {
  playstation: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  xbox: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  switch: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
  generic: 'USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0011)',
};

let pads = [];
Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });

/** A pad of `family` connects and its Cross (bottom) button is pressed. */
function pickUpPad(family) {
  const pad = {
    id: PADS[family],
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  pads = [pad];
  window.dispatchEvent(new Event('gamepadconnected'));
  pad.buttons[CROSS].pressed = true;
  Gamepad.poll(false);
  pad.buttons[CROSS].pressed = false;
  Gamepad.poll(false);
}

/** A real key press: back to the keyboard. */
const pressKey = () =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));

// jsdom has no 2D canvas context: hand the hints one that draws nothing
let getContext;
let hints;
let scene;

beforeAll(() => {
  Gamepad.initialize();
  InputDevice.initialize();
});

beforeEach(() => {
  const canvas2d = new Proxy({}, { get: (target, name) => target[name] ?? (() => {}) });
  getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvas2d);
  HintMemory.reset();
  scene = new THREE.Scene();
  hints = new KeyHints(scene);
  gameState.mode = 'PLAYING';
});

afterEach(() => {
  hints.dispose();
  getContext.mockRestore();
  pads = [];
  window.dispatchEvent(new Event('gamepaddisconnected'));
  gameState.mode = 'MENU';
});

/** What a hint sprite shows (its texture's canvas, named for its glyph). */
const shown = (sprite) => sprite.material.map.image.dataset.glyph;
const moveCluster = () =>
  [...document.querySelectorAll('#hint-move [data-glyph]')].map((el) => el.dataset.glyph);
const deployGlyph = () => document.querySelector('#hint-deploy').firstElementChild.dataset.glyph;

/** Stand beside a creature: the absorb and clap hints float over it. */
async function standBesideACreature() {
  ctx.loadPuzzle('clap-basic');
  await ctx.tick(32);
  hints.update(0.016);
}

describe('Each hint shows the glyph of the device in hand', () => {
  it.each([
    // family, absorb (R), release (Space), clap (C), deploy (G), move cluster
    ['keyboard', 'R', 'Space', 'C', 'G', ['W', 'A', 'S', 'D']],
    ['playstation', 'Square', 'Cross', 'Circle', 'Triangle', ['the left stick', 'the right stick']],
    ['xbox', 'X', 'A', 'B', 'Y', ['the left stick', 'the right stick']],
    ['switch', 'Y', 'B', 'A', 'X', ['the left stick', 'the right stick']],
    [
      'generic',
      'the left button',
      'the bottom button',
      'the right button',
      'the top button',
      ['the left stick', 'the right stick'],
    ],
  ])('on %s: %s, %s, %s, %s', (family, absorb, release, clap, deploy, move) => {
    if (family !== 'keyboard') pickUpPad(family);

    expect(shown(hints.absorbSprite)).toBe(absorb);
    expect(shown(hints.releaseSprite)).toBe(release);
    expect(shown(hints.clapSprite)).toBe(clap);
    expect(deployGlyph()).toBe(deploy);
    expect(moveCluster()).toEqual(move);
  });

  it('the spacebar is wide; a face button is round, as tall as it is wide', () => {
    const space = hints.releaseSprite.scale.x / hints.releaseSprite.scale.y;
    pickUpPad('playstation');
    const cross = hints.releaseSprite.scale.x / hints.releaseSprite.scale.y;

    expect(space).toBeGreaterThan(2);
    expect(cross).toBe(1);
  });
});

describe('A hint on screen swaps its glyph in place', () => {
  it('the floating hints keep their place and stay up', async () => {
    await standBesideACreature();
    expect(hints.absorbSprite.visible).toBe(true);
    expect(hints.clapSprite.visible).toBe(true);
    const where = hints.clapSprite.position.clone();

    pickUpPad('xbox');

    expect(hints.clapSprite.visible).toBe(true);
    expect(hints.clapSprite.position).toEqual(where);
    expect(shown(hints.clapSprite)).toBe('B');
    expect(scene.children.filter((child) => child.isSprite)).toHaveLength(3);
  });

  it('the move cluster stays up as the pad is taken up and put down', async () => {
    ctx.loadPuzzle('clap-basic');
    for (let i = 0; i < 120; i += 1) hints.update(0.016); // standing still: it shows
    const cluster = document.getElementById('hint-move');
    expect(cluster.style.opacity).toBe('1');

    pickUpPad('switch');
    expect(document.getElementById('hint-move')).toBe(cluster);
    expect(cluster.style.opacity).toBe('1');
    expect(moveCluster()).toEqual(['the left stick', 'the right stick']);

    pressKey();
    expect(moveCluster()).toEqual(['W', 'A', 'S', 'D']);
  });
});

describe('No frame draws or uploads a glyph', () => {
  const countCanvases = () => {
    const created = [];
    const createElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const el = createElement(tag, options);
      if (tag === 'canvas') created.push(el);
      return el;
    });
    return created;
  };

  afterEach(() => jest.restoreAllMocks());

  it('frames with hints up, on a pad, draw nothing new', async () => {
    pickUpPad('playstation');
    await standBesideACreature();
    const { map } = hints.clapSprite.material;
    const canvases = countCanvases();

    for (let i = 0; i < 300; i += 1) hints.update(0.016);

    expect(canvases).toHaveLength(0);
    expect(hints.clapSprite.material.map).toBe(map);
  });

  it('each family is drawn the first time it shows, and only then', () => {
    const canvases = countCanvases();

    pickUpPad('playstation');
    const drawn = canvases.length;
    const cross = hints.releaseSprite.material.map;
    pressKey();
    pickUpPad('playstation');
    pressKey();
    pickUpPad('playstation');

    // Three sprites, two sticks and the deploy button
    expect(drawn).toBe(6);
    expect(canvases).toHaveLength(drawn);
    expect(hints.releaseSprite.material.map).toBe(cross);
  });

  it('a stick held over frame after frame swaps nothing', () => {
    pickUpPad('xbox');
    const swaps = jest.fn();
    const stop = InputDevice.onChange(swaps);
    pads[0].axes = [0.9, 0, 0, 0];

    for (let i = 0; i < 120; i += 1) Gamepad.poll(true);
    stop();

    expect(swaps).not.toHaveBeenCalled();
  });
});
