import { createSlice, configureStore } from '@reduxjs/toolkit';

const motionSlice = createSlice({
	name: 'motion',
	initialState: {
		latLeft: false,
		latRight: false,
		forward: false,
		backward: false,
	},
	reducers: {
		setLatLeft: (state, { payload: { value } }) => {
			state.latLeft = value;
		},
		setLatRight: (state, { payload: { value } }) => {
			state.latRight = value;
		},
		setForward: (state, { payload: { value } }) => {
			state.forward = value;
		},
		setBackward: (state, { payload: { value } }) => {
			state.backward = value;
		},
	},
});

export const { actions: motionActions } = motionSlice;
export default motionSlice;
