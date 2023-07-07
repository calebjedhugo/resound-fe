import { createSlice } from '@reduxjs/toolkit';

const motionSlice = createSlice({
  name: 'motion',
  initialState: {
    latLeft: false,
    latRight: false,
    forward: false,
    backward: false,
    mouseCentered: true,
    screenCenter: [window.innerWidth / 2, window.innerHeight / 2],
    mousePosition: [0, 0],
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
    setScreenCenter: (state, { payload: { screenCenter } }) => ({
      ...state,
      screenCenter,
    }),
    setMousePosition: (state, { payload: mousePosition }) => ({
      ...state,
      mousePosition,
    }),
  },
});

export const { actions: motionActions } = motionSlice;
export default motionSlice;
