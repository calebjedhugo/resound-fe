import { createSelector } from '@reduxjs/toolkit';

const getMotion = (state) => state.playerControls.motion;

// use half the lesser of the half lengths as the point of "not centered"
const getHypotMax = createSelector(getMotion, ({ screenCenter }) => Math.min(...screenCenter) / 2);

export { getHypotMax };
