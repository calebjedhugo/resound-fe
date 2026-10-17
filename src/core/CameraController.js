import { clamp } from 'three/src/math/MathUtils';

const INCREMENT_DENOMINATOR = 1400000;
const CENTER_RANGE_PERC_X = 0.4;
const CENTER_RANGE_PERC_Y = 1;
const CENTER_MOTION_START_OFFSET = 150;
const KEYBOARD_LOOK_SPEED = 0.025; // Radians per frame (~86°/sec at 60fps)
const KEYBOARD_LOOK_STEP = Math.PI / 24; // Guaranteed tap rotation (7.5°), tap-impulse only
const MAX_PITCH = Math.PI / 2;

// A page can boot before its window has a size (a hidden pane is 0x0): a zero
// range is no mouse offset, not 0/0 — a NaN view poisons the camera matrices
// and three throws uploading the clip planes on the very first frame
const offsetPerc = (offset, range) => (range > 0 ? clamp(offset / range, -1, 1) : 0);

class CameraController {
  static getXFixedRange(screenCenter) {
    return screenCenter[0] * CENTER_RANGE_PERC_X;
  }

  static getYFixedRange(screenCenter) {
    return screenCenter[1] * CENTER_RANGE_PERC_Y;
  }

  static getIncrement(screenCenter, mousePosition, xFixedRange) {
    const zeroBased = screenCenter[0] - mousePosition[0];
    const onTheLeft = zeroBased > 0;
    const xDistanceFromLine = Math.abs(screenCenter[0] - mousePosition[0]);
    const absXIncrement =
      (xDistanceFromLine - xFixedRange + CENTER_MOTION_START_OFFSET) ** 2 / INCREMENT_DENOMINATOR;
    const xIncrement = onTheLeft ? absXIncrement : absXIncrement * -1;
    return [
      xIncrement,
      0, // Replace this with the obvious formula if we ever need to increment the Y axis.
    ];
  }

  static getNextViewCenter(gameState) {
    const { screenCenter } = gameState.input.mouse;
    const { viewCenter } = gameState.camera;
    const { centered: mouseCentered } = gameState.input.mouse;
    const { position: mousePosition } = gameState.input.mouse;

    if (!gameState.input.mouseLookEnabled) return viewCenter;

    if (!mouseCentered) {
      const xFixedRange = this.getXFixedRange(screenCenter);
      const [incrementX, incrementY] = this.getIncrement(screenCenter, mousePosition, xFixedRange);
      return [viewCenter[0] + incrementX, viewCenter[1] + incrementY];
    }
    return viewCenter;
  }

  static getView(gameState) {
    if (!gameState.input.mouseLookEnabled) return gameState.camera.viewCenter;

    const { screenCenter, position: mousePosition } = gameState.input.mouse;
    const nextViewCenter = this.getNextViewCenter(gameState);
    const xFixedRange = this.getXFixedRange(screenCenter);
    const yFixedRange = this.getYFixedRange(screenCenter);

    const [screenCenterX, screenCenterY] = screenCenter;
    const [mousePositionX, mousePositionY] = mousePosition;
    const [nextViewCenterX, nextViewCenterY] = nextViewCenter;

    return [
      nextViewCenterX + (Math.PI / 2) * offsetPerc(screenCenterX - mousePositionX, xFixedRange),
      nextViewCenterY + (Math.PI / 2) * offsetPerc(screenCenterY - mousePositionY, yFixedRange),
    ];
  }

  static updateViewCenter(gameState) {
    gameState.camera.viewCenter = this.getNextViewCenter(gameState);
  }

  static applyKeyboardLook(gameState) {
    const { keys, impulses } = gameState.input;
    const { lookLeft, lookRight, lookUp, lookDown } = keys;

    // Look is driven purely by held keys — the view turns continuously while a
    // key is down and stops exactly where it is on release. Queued taps
    // (dev-only tap-impulse affordance) add a guaranteed step; all drain in
    // one frame so bursts and throttled tabs stay responsive, and while a key
    // is held its queue is left intact (clearing it destroyed taps whose
    // successor's key-down straddled a frame — rapid taps landed at half rate).
    const consume = (name) => {
      if (!impulses || keys[name]) return 0;
      const count = impulses[name];
      impulses[name] = 0;
      return count;
    };

    let dx = 0;
    let dy = 0;
    if (lookLeft) dx += KEYBOARD_LOOK_SPEED;
    if (lookRight) dx -= KEYBOARD_LOOK_SPEED;
    if (lookUp) dy += KEYBOARD_LOOK_SPEED;
    if (lookDown) dy -= KEYBOARD_LOOK_SPEED;
    dx += KEYBOARD_LOOK_STEP * (consume('lookLeft') - consume('lookRight'));
    dy += KEYBOARD_LOOK_STEP * (consume('lookUp') - consume('lookDown'));
    if (dx === 0 && dy === 0) return;

    const [x, y] = gameState.camera.viewCenter;
    gameState.camera.viewCenter = [x + dx, clamp(y + dy, -MAX_PITCH, MAX_PITCH)];
  }

  static toggleMouseLook(gameState) {
    if (gameState.input.mouseLookEnabled) {
      // Bake the full current view (including mouse offset) into viewCenter
      // so the camera doesn't jump when the mouse stops contributing.
      gameState.camera.viewCenter = this.getView(gameState);
      gameState.input.mouseLookEnabled = false;
    } else {
      // Re-enable without a jump: cancel out the offset the current mouse
      // position would immediately contribute.
      const frozenView = gameState.camera.viewCenter;
      gameState.input.mouseLookEnabled = true;
      const next = this.getNextViewCenter(gameState);
      const view = this.getView(gameState);
      const offset = [view[0] - next[0], view[1] - next[1]];
      gameState.camera.viewCenter = [frozenView[0] - offset[0], frozenView[1] - offset[1]];
    }
    return gameState.input.mouseLookEnabled;
  }
}

export default CameraController;
