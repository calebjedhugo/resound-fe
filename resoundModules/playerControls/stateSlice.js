import { combineReducers } from '@reduxjs/toolkit';

import motionSlice from './motion/stateSlice';

const playerControlsSlice = combineReducers({ motion: motionSlice.reducer });

export default playerControlsSlice;
