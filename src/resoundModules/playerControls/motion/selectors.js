import { createSelector } from '@reduxjs/toolkit';
import { clamp } from 'three/src/math/MathUtils';
import { CENTER_RANGE_PERC_X, CENTER_RANGE_PERC_Y, INCREMENT_DENOMINATOR } from './constants';

const getMotion = (state) => state.playerControls.motion;

const getScreenCenter = createSelector(getMotion, ({ screenCenter }) => screenCenter);

const getMousePosition = createSelector(getMotion, ({ mousePosition }) => mousePosition);

const getMouseCentered = createSelector(getMotion, ({ mouseCentered }) => mouseCentered);

const getViewCenter = createSelector(getMotion, ({ viewCenter }) => viewCenter);

/** The distance from the center the mouse can be before the camera keeps moving. */
const getXFixedRange = createSelector(
  getScreenCenter,
  (screenCenter) => screenCenter[0] * CENTER_RANGE_PERC_X
);

const getYFixedRange = createSelector(
  getScreenCenter,
  (screenCenter) => screenCenter[1] * CENTER_RANGE_PERC_Y
);

/** The amount which screenCenter should be incremented each animation frame. */
const getIncrement = createSelector(
  getScreenCenter,
  getMousePosition,
  getXFixedRange,
  (screenCenter, mousePosition, xFixedRange) => {
    const zeroBased = screenCenter[0] - mousePosition[0];
    const onTheLeft = zeroBased > 0;
    const xDistanceFromLine = Math.abs(screenCenter[0] - mousePosition[0]);
    const absXIncrement = (xDistanceFromLine - xFixedRange) ** 2 / INCREMENT_DENOMINATOR;
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
  getXFixedRange,
  getYFixedRange,
  (
    [screenCenterX, screenCenterY],
    [mousePositionX, mousePositionY],
    [nextViewCenterX, nextViewCenterY],
    xFixedRange,
    yFixedRange
  ) => {
    const percX = (screenCenterX - mousePositionX) / xFixedRange;
    const percY = (screenCenterY - mousePositionY) / yFixedRange;

    return [
      nextViewCenterX + (Math.PI / 2) * clamp(percX, -1, 1),
      nextViewCenterY + (Math.PI / 2) * percY,
    ];
  }
);

export {
  getXFixedRange,
  getYFixedRange,
  getScreenCenter,
  getView,
  getIncrement,
  getViewCenter,
  getNextViewCenter,
};
