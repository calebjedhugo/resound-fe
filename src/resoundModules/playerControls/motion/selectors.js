import { createSelector } from '@reduxjs/toolkit';
import { clamp } from 'three/src/math/MathUtils';
import { CENTER_RANGE_PERC_X, INCREMENT_DENOMINATOR } from './constants';

const getMotion = (state) => state.playerControls.motion;

const getScreenCenter = createSelector(getMotion, ({ screenCenter }) => screenCenter);

const getMousePosition = createSelector(getMotion, ({ mousePosition }) => mousePosition);

const getMouseCentered = createSelector(getMotion, ({ mouseCentered }) => mouseCentered);

const getViewCenter = createSelector(getMotion, ({ viewCenter }) => viewCenter);

/** The distance from the center the mouse can be before the camera keeps moving. */
const getHypotMax = createSelector(
  getScreenCenter,
  (screenCenter) => Math.min(...screenCenter) * CENTER_RANGE_PERC_X
);

/** The amount which screenCenter should be incremented each animation frame. */
const getIncrement = createSelector(
  getScreenCenter,
  getMousePosition,
  getHypotMax,
  (screenCenter, mousePosition, hypotMax) => {
    const zeroBased = screenCenter[0] - mousePosition[0];
    const onTheLeft = zeroBased > 0;
    const xDistanceFromLine = Math.abs(screenCenter[0] - mousePosition[0]);
    const absXIncrement = (xDistanceFromLine - hypotMax) ** 2 / INCREMENT_DENOMINATOR;
    const xIncrement = onTheLeft ? absXIncrement : absXIncrement * -1;
    return [
      xIncrement,
      0, // Replace this with the obvious formula if we ever need to increment the Y axis.
    ];
  }
);

/** Gets the values for the camera's reference (central) angle to be rendered in the next frame. */
const getNextViewCenter = createSelector(
  getIncrement,
  getViewCenter,
  getMouseCentered,
  ([incrementX, incrementY], viewCenter, mouseCentered) => {
    if (!mouseCentered) {
      return [viewCenter[0] + incrementX, viewCenter[1] + incrementY];
    }
    return viewCenter;
  }
);

/** Gets the view to be rendered in the next frame */
const getView = createSelector(
  getScreenCenter,
  getMousePosition,
  getNextViewCenter,
  getHypotMax,
  (
    [screenCenterX, screenCenterY],
    [mousePositionX, mousePositionY],
    [nextViewCenterX, nextViewCenterY],
    hypotMax
  ) => {
    const percX = (screenCenterX - mousePositionX) / hypotMax;
    const percY = (screenCenterY - mousePositionY) / hypotMax;

    return [
      nextViewCenterX + (Math.PI / 2) * clamp(percX, -1, 1),
      nextViewCenterY + (Math.PI / 2) * percY,
    ];
  }
);

export { getHypotMax, getScreenCenter, getView, getIncrement, getViewCenter, getNextViewCenter };
