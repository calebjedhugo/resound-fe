import { createSlice } from '@reduxjs/toolkit';

const motionSlice = createSlice({
  name: 'motion',
  initialState: {
    latLeft: false,
    latRight: false,
    forward: false,
    backward: false,
    mouseCentered: false,
    screenCenter: [window.innerWidth / 2, window.innerHeight / 2],
  },
  reducers: {
    setLatLeft: (state, { payload: { latLeft } }) => ({
      ...state,
      latLeft,
    }),
    setLatRight: (state, { payload: { latRight } }) => ({
      ...state,
      latRight,
    }),
    setForward: (state, { payload: { forward } }) => ({
      ...state,
      forward,
    }),
    setBackward: (state, { payload: { backward } }) => ({
      ...state,
      backward,
    }),
    setMouseCentered: (state, { payload: { mouseCentered } }) => ({
      ...state,
      mouseCentered,
    }),
    setScreenCenter: (state, { payload: { screenCenter } }) => ({ ...state, screenCenter }),
  },
});

export const { actions: motionActions } = motionSlice;
export default motionSlice;
