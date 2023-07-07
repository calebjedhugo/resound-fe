import { createSelector } from '@reduxjs/toolkit';

const getMotion = (state) => state.playerControls.motion;

const getScreenCenter = createSelector(getMotion, ({ screenCenter }) => screenCenter);

/** The distance from the center the mouse can be before the camera keeps moving. */
const getHypotMax = createSelector(
  getScreenCenter,
  (screenCenter) => Math.min(...screenCenter) * 0.75
);

// eslint-disable-next-line import/prefer-default-export
export { getHypotMax };
