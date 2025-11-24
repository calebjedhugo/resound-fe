import { clamp } from 'three/src/math/MathUtils';

const INCREMENT_DENOMINATOR = 1400000;
const CENTER_RANGE_PERC_X = 0.4;
const CENTER_RANGE_PERC_Y = 1;
const CENTER_MOTION_START_OFFSET = 150;

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
    const { mouse, screenCenter } = gameState.input.mouse;
    const { viewCenter } = gameState.camera;
    const { centered: mouseCentered } = gameState.input.mouse;
    const { position: mousePosition } = gameState.input.mouse;

    if (!mouseCentered) {
      const xFixedRange = this.getXFixedRange(screenCenter);
      const [incrementX, incrementY] = this.getIncrement(screenCenter, mousePosition, xFixedRange);
      return [viewCenter[0] + incrementX, viewCenter[1] + incrementY];
    }
    return viewCenter;
  }

  static getView(gameState) {
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
      nextViewCenterY + (Math.PI / 2) * percY,
    ];
  }

  static updateViewCenter(gameState) {
    gameState.camera.viewCenter = this.getNextViewCenter(gameState);
  }
}

export default CameraController;
