import { createSlice, configureStore } from '@reduxjs/toolkit';

const motionSlice = createSlice({
	name: 'motion',
	initialState: {
		latLeft: false,
		latRight: false,
	},
	reducers: {
		setLatLeft: (state, { payload: { value } }) => {
			state.latLeft = value;
		},
		setLatRight: (state, { payload: { value } }) => {
			state.latRight = value;
		},
	},
});

export const { actions: motionActions } = motionSlice;
export default motionSlice;
