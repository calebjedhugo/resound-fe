import { createSlice } from '@reduxjs/toolkit';

const motionSlice = createSlice({
  name: 'motion',
  initialState: {
    latLeft: false,
    latRight: false,
    forward: false,
    backward: false,
    mouseCentered: false,
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
  },
});

export const { actions: motionActions } = motionSlice;
export default motionSlice;
