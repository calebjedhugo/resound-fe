import store from 'reduxStore';
import { getXFixedRange, getYFixedRange } from 'resoundModules/playerControls/motion/selectors';
import { motionActions } from './resoundModules/playerControls/motion/stateSlice';

const dispatchKeyboardActions = ({ code, type }) => {
  let value;
  if (type === 'keydown') value = true;
  else if (type === 'keyup') value = false;
  else {
    console.error('A non-keyboard event was sent to dispatchKeyboardActions');
    return;
  }

  switch (code) {
    case 'KeyA':
      store.dispatch(motionActions.setLatLeft({ latLeft: value }));
      break;
    case 'KeyD':
      store.dispatch(motionActions.setLatRight({ latRight: value }));
      break;
    case 'KeyW':
      store.dispatch(motionActions.setForward({ forward: value }));
      break;
    case 'KeyS':
      store.dispatch(motionActions.setBackward({ backward: value }));
      break;
    default:
  }
};

const dispatchMouseActions = ({ screenX, screenY }) => {
  store.dispatch(motionActions.setMousePosition([screenX, screenY]));
  const { mouseCentered, screenCenter } = store.getState().playerControls.motion;

  const xFixedRange = getXFixedRange(store.getState());
  const yFixedRange = getYFixedRange(store.getState());

  if (
    // Math.abs(screenX - screenCenter[0]) ** 2 + Math.abs(screenY - screenCenter[1]) ** 2 >
    // hypotMax ** 2
    Math.abs(screenX - screenCenter[0]) > xFixedRange ||
    Math.abs(screenY - screenCenter[1] > yFixedRange)
  ) {
    if (mouseCentered) {
      store.dispatch(motionActions.setMouseCentered({ mouseCentered: false }));
    }
  } else if (!mouseCentered) {
    store.dispatch(motionActions.setMouseCentered({ mouseCentered: true }));
  }
};

const createEventListeners = () => {
  window.addEventListener('keydown', dispatchKeyboardActions);
  window.addEventListener('keyup', dispatchKeyboardActions);
  window.addEventListener('mousemove', dispatchMouseActions);
};

export default createEventListeners;
