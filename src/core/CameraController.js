import { clamp } from 'three/src/math/MathUtils';

const INCREMENT_DENOMINATOR = 1400000;
const CENTER_RANGE_PERC_X = 0.4;
const CENTER_RANGE_PERC_Y = 1;
const CENTER_MOTION_START_OFFSET = 150;
const KEYBOARD_LOOK_SPEED = 0.025; // Radians per frame (~86°/sec at 60fps)
const KEYBOARD_LOOK_STEP = Math.PI / 24; // Guaranteed rotation per discrete tap (7.5°)
const MAX_PITCH = Math.PI / 2;

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

    const percX = (screenCenterX - mousePositionX) / xFixedRange;
    const percY = (screenCenterY - mousePositionY) / yFixedRange;

    return [
      nextViewCenterX + (Math.PI / 2) * clamp(percX, -1, 1),
      nextViewCenterY + (Math.PI / 2) * clamp(percY, -1, 1),
    ];
  }

  static updateViewCenter(gameState) {
    gameState.camera.viewCenter = this.getNextViewCenter(gameState);
  }

  static applyKeyboardLook(gameState) {
    const { keys, impulses } = gameState.input;
    const { lookLeft, lookRight, lookUp, lookDown } = keys;

    // A discrete tap guarantees a minimum rotation; held keys turn
    // continuously. All queued taps drain in one frame so bursts and
    // throttled tabs stay responsive; while the key is held the queue is
    // left intact (clearing it destroyed taps whose successor's key-down
    // straddled a frame — rapid taps landed at half rate).
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
