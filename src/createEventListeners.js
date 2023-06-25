import { motionActions } from './resoundModules/playerControls/motion/stateSlice';
import store from 'reduxStore';

const dispatchKeyboardActions = ({ code, type }) => {
	let value;
	if (type === 'keydown') value = true;
	else if (type === 'keyup') value = false;
	else return console.error('A non-keyboard event was sent to dispatchKeyboardActions');

	switch (code) {
		case 'KeyA':
			store.dispatch(motionActions.setLatLeft({ value }));
			break;
		case 'KeyD':
			store.dispatch(motionActions.setLatRight({ value }));
			break;
		case 'KeyW':
			store.dispatch(motionActions.setForward({ value }));
			break;
		case 'KeyS':
			store.dispatch(motionActions.setBackward({ value }));
			break;
		default:
	}
};

const createEventListeners = () => {
	window.addEventListener('keydown', dispatchKeyboardActions);
	window.addEventListener('keyup', dispatchKeyboardActions);
};

export default createEventListeners;
